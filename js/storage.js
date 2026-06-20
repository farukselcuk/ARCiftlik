/**
 * storage.js — Güvenli localStorage wrapper + versiyon yönetimi (Namespaced)
 * 
 * Oyun verileri 4 farklı namespace ile yönetilir: global, farm, barn, market.
 * Her birinin kendi versiyonu ve key prefix'i vardır.
 * Fallback zinciri: localStorage → sessionStorage → in-memory
 */

const GAME_VERSION = "1.0.0";

const DEFAULTS_BY_NAMESPACE = {
  global: {
    coins: 100,
    gems: 10,
    level: 1,
    xp: 0,
    inventory: {
      wheat: 0, corn: 0, carrot: 0, strawberry: 0, potato: 0, sunflower: 0, tomato: 0, pumpkin: 0, blueberry: 0,
      apple: 0, orange: 0,
      golden_wheat: 0, golden_corn: 0, golden_carrot: 0, golden_strawberry: 0, golden_potato: 0, golden_sunflower: 0, golden_tomato: 0, golden_pumpkin: 0, golden_blueberry: 0,
      fertilizer_basic: 0, fertilizer_super: 0, fertilizer_golden: 0, basic_fertilizer: 0, super_fertilizer: 0, organic_fertilizer: 0,
      wood_oak: 0, wood_pine: 0, wood: 0, nails: 0, varnish: 0, hinges: 0,
      furniture_stool: 0, furniture_table: 0, furniture_cabinet: 0, wooden_chair: 0, wooden_table: 0, bookshelf: 0, cabinet: 0, wooden_bed: 0, rocking_chair: 0,
      flour: 0, bread: 0, strawberry_cake: 0, blueberry_pie: 0, carrot_cake: 0
    },
    shopItems: [],
    pendingGold: 0,
    pet: { purchased: false, catPurchased: false, activeSkin: "default", goldSkinPurchased: false },
    dailyLogin: { streak: 0, lastLoginDate: null, claimed: false },
    weather: { current: "sunny", nextChangeAt: 0 },
    season: { current: "spring", mode: "weekly", lastChangeAt: 0 }
  },
  farm: {
    plots: [],
    unlockedPlots: 4,
    decorations: []
  },
  barn: {
    petFriendship: { level: 1, xp: 0, todayInteractions: 0, lastInteractionDate: null }
  },
  market: {
    orders: []
  },
  bakery: {
    activeRecipe: null,
    startTime: 0,
    duration: 0,
    isReady: false
  }
};

// Eski tekil localStorage key'leri (migrasyon için)
const LEGACY_KEYS = [
  "ar-pocket-farm:plots",
  "ar-pocket-farm:unlocked-plots",
  "ar-pocket-farm:coins",
  "ar-pocket-farm:inventory",
  "ar-pocket-farm:orders",
  "ar-pocket-farm:has-pet",
  "arciftlik:state",
  "arciftlik:version"
];

// Initialize the global in-memory cache
window.gameInMemoryCache = window.gameInMemoryCache || {};

export class GameStorage {
  /**
   * @param {string} namespace - 'global' | 'farm' | 'barn' | 'market'
   */
  constructor(namespace = "global") {
    this.namespace = namespace;
    this.backendType = "memory";
    this.onMigrationNotice = null;

    this.storageKey = `arciftlik:${namespace}:state`;
    this.versionKey = `arciftlik:${namespace}:version`;
    this.defaultState = DEFAULTS_BY_NAMESPACE[namespace] || DEFAULTS_BY_NAMESPACE.global;

    console.log(`[GameStorage] Namespace: ${namespace}, Backend: Firestore Memory Cache`);
  }

  _read(key) {
    return window.gameInMemoryCache[key] ?? null;
  }

  _write(key, value) {
    const oldValue = window.gameInMemoryCache[key];
    if (oldValue !== value) {
      window.gameInMemoryCache[key] = value;
      window.dispatchEvent(new CustomEvent("game-state-changed", {
        detail: { namespace: this.namespace, key, value }
      }));
    }
  }

  _remove(key) {
    if (window.gameInMemoryCache[key] !== undefined) {
      delete window.gameInMemoryCache[key];
      window.dispatchEvent(new CustomEvent("game-state-changed", {
        detail: { namespace: this.namespace, key, value: null }
      }));
    }
  }

  /**
   * Versiyon ve veri yapısı kontrolü.
   * Eğer eski tekil "arciftlik:state" varsa, namespaces'e böler.
   */
  checkVersion() {
    const savedVersion = this._read(this.versionKey);
    const rawState = this._read(this.storageKey);
    let state = null;

    try {
      state = rawState ? JSON.parse(rawState) : null;
    } catch {
      state = null;
    }

    // İlk kez yükleniyorsa eski veriyi tara
    if (!savedVersion && !state) {
      // 1. Eski tekil `arciftlik:state` kontrolü
      const legacyStateRaw = this._read("arciftlik:state");
      if (legacyStateRaw) {
        try {
          const legacyState = JSON.parse(legacyStateRaw);
          if (legacyState && typeof legacyState === "object") {
            console.log(`[GameStorage] Eski arciftlik:state bulundu (${this.namespace} için ayrıştırılıyor)`);
            const migrated = this._extractFromLegacy(legacyState);
            this._write(this.versionKey, GAME_VERSION);
            this._write(this.storageKey, JSON.stringify(migrated));
            return { state: migrated, migrated: true, isNew: false };
          }
        } catch (e) {
          console.warn("[GameStorage] Legacy parse hatası", e);
        }
      }

      // 2. Çok eski key'lerden migrasyon (ar-pocket-farm:...)
      const oldLegacy = this._tryMigrateVeryLegacy();
      if (oldLegacy) {
        this._write(this.versionKey, GAME_VERSION);
        this._write(this.storageKey, JSON.stringify(oldLegacy));
        return { state: oldLegacy, migrated: true, isNew: false };
      }

      // Tamamen yeni state oluştur
      const newState = this._deepClone(this.defaultState);
      this._write(this.versionKey, GAME_VERSION);
      this._write(this.storageKey, JSON.stringify(newState));
      return { state: newState, migrated: false, isNew: true };
    }

    // Versiyon uyuşuyor
    if (savedVersion === GAME_VERSION && state) {
      const mergedState = this._mergeWithDefaults(state);
      return { state: mergedState, migrated: false, isNew: false };
    }

    // Versiyon uyuşmuyor -> Sıfırla veya migre et
    const migratedState = this._migrate(savedVersion, GAME_VERSION, state);
    this._write(this.versionKey, GAME_VERSION);
    this._write(this.storageKey, JSON.stringify(migratedState));
    return { state: migratedState, migrated: true, isNew: false };
  }

  _extractFromLegacy(legacyState) {
    const fresh = this._deepClone(this.defaultState);
    if (this.namespace === "global") {
      if (Number.isFinite(legacyState.coins)) fresh.coins = legacyState.coins;
      if (Number.isFinite(legacyState.level)) fresh.level = legacyState.level;
      if (Number.isFinite(legacyState.xp)) fresh.xp = legacyState.xp;
      if (legacyState.inventory) fresh.inventory = { ...fresh.inventory, ...legacyState.inventory };
      if (legacyState.pet) fresh.pet = { ...fresh.pet, ...legacyState.pet };
      if (legacyState.dailyLogin) fresh.dailyLogin = { ...fresh.dailyLogin, ...legacyState.dailyLogin };
      if (legacyState.weather) fresh.weather = { ...fresh.weather, ...legacyState.weather };
      if (legacyState.season) fresh.season = { ...fresh.season, ...legacyState.season };
    } else if (this.namespace === "farm") {
      if (Array.isArray(legacyState.plots)) fresh.plots = legacyState.plots;
      if (Number.isFinite(legacyState.unlockedPlots)) fresh.unlockedPlots = legacyState.unlockedPlots;
    } else if (this.namespace === "barn") {
      if (legacyState.petFriendship) fresh.petFriendship = { ...fresh.petFriendship, ...legacyState.petFriendship };
    } else if (this.namespace === "market") {
      if (Array.isArray(legacyState.orders)) fresh.orders = legacyState.orders;
    }
    return fresh;
  }

  _tryMigrateVeryLegacy() {
    // Sadece global namespace için çok eski key'leri okuyalım
    if (this.namespace !== "global") return null;

    let hasLegacy = false;
    const state = this._deepClone(this.defaultState);

    try {
      const coins = Number(this._read("ar-pocket-farm:coins"));
      if (Number.isFinite(coins) && coins > 0) {
        state.coins = coins;
        hasLegacy = true;
      }
      const inv = JSON.parse(this._read("ar-pocket-farm:inventory") || "null");
      if (inv && typeof inv === "object") {
        state.inventory = { ...state.inventory, ...inv };
        hasLegacy = true;
      }
      if (this._read("ar-pocket-farm:has-pet") === "true") {
        state.pet.purchased = true;
        hasLegacy = true;
      }
    } catch {}

    return hasLegacy ? state : null;
  }

  _migrate(oldVersion, newVersion, oldState) {
    console.log(`[GameStorage] Migrasyon (${this.namespace}): ${oldVersion} → ${newVersion}`);
    const state = this._deepClone(this.defaultState);

    // Global verileri korumaya çalış, scene-specific verileri sıfırla (çakışmaları önlemek için)
    if (this.namespace === "global" && oldState) {
      if (Number.isFinite(oldState.coins)) state.coins = oldState.coins;
      if (Number.isFinite(oldState.level)) state.level = oldState.level;
      if (Number.isFinite(oldState.xp)) state.xp = oldState.xp;
      if (oldState.inventory) state.inventory = { ...state.inventory, ...oldState.inventory };
      if (oldState.pet) state.pet = { ...state.pet, ...oldState.pet };
    }

    if (this.onMigrationNotice) {
      this.onMigrationNotice(oldVersion, newVersion);
    }

    return state;
  }

  saveAll(state) {
    this._write(this.storageKey, JSON.stringify(state));
  }

  loadAll() {
    try {
      const raw = this._read(this.storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  saveField(fieldName, value) {
    const state = this.loadAll();
    if (!state) return;
    state[fieldName] = value;
    this.saveAll(state);
  }

  loadField(fieldName) {
    const state = this.loadAll();
    if (!state) return undefined;
    return state[fieldName];
  }

  resetAll() {
    const freshState = this._deepClone(this.defaultState);
    this._write(this.versionKey, GAME_VERSION);
    this._write(this.storageKey, JSON.stringify(freshState));
    
    // Sadece global sıfırlandığında eski legacy'leri temizleyelim
    if (this.namespace === "global") {
      for (const key of LEGACY_KEYS) {
        this._remove(key);
      }
    }
    return freshState;
  }

  _mergeWithDefaults(state) {
    const defaults = this._deepClone(this.defaultState);
    return this._deepMergeObjects(defaults, state);
  }

  _deepMergeObjects(target, source) {
    if (!source) return target;
    const output = { ...target };
    
    Object.keys(source).forEach(key => {
      if (this._isObject(source[key]) && this._isObject(target[key])) {
        output[key] = this._deepMergeObjects(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    });
    
    return output;
  }

  _isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
}
