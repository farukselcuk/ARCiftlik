/**
 * seasons.js — Mevsim sistemi
 *
 * İlkbahar, Yaz, Sonbahar, Kış — 7 günde bir döner veya gerçek takvimle.
 * - İlkbahar: tüm bitkiler ekilebilir, normal hız
 * - Yaz: büyüme +%15, bazı bitkiler kuruyabilir
 * - Sonbahar: hasat bonusu +%10
 * - Kış: büyüme %50 yavaş, sadece wheat ve corn ekilebilir
 */

import { GameStorage } from "./storage.js";

// ── Mevsim tanımları ───────────────────────────────────────────
const SEASONS = {
  spring: {
    id: "spring",
    name: "İlkbahar",
    icon: "🌸",
    growMultiplier: 1.0,
    harvestBonus: 1.0,
    allowedCrops: null, // null = hepsi ekilebilir
    bgClass: "season-spring"
  },
  summer: {
    id: "summer",
    name: "Yaz",
    icon: "☀️",
    growMultiplier: 1.15,
    harvestBonus: 1.0,
    allowedCrops: null,
    bgClass: "season-summer"
  },
  autumn: {
    id: "autumn",
    name: "Sonbahar",
    icon: "🍂",
    growMultiplier: 1.0,
    harvestBonus: 1.10,
    allowedCrops: null,
    bgClass: "season-autumn"
  },
  winter: {
    id: "winter",
    name: "Kış",
    icon: "❄️",
    growMultiplier: 0.50,
    harvestBonus: 1.0,
    allowedCrops: ["wheat", "corn"], // sadece bunlar ekilebilir
    bgClass: "season-winter"
  }
};

const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
const WEEKLY_DURATION = 175 * 60 * 1000; // 175 dakika ms

export class SeasonSystem {
  /**
   * @param {GameStorage} storage
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    this.current = "spring";
    this.mode = "weekly"; // "weekly" veya "realtime"
    this.lastChangeAt = 0;
    /** @type {Function|null} */
    this.onSeasonChange = null;

    this._load();
  }

  _load() {
    const data = this._storage.loadField("season");
    if (data && typeof data === "object") {
      this.current = SEASONS[data.current] ? data.current : "spring";
      this.mode = data.mode === "realtime" ? "realtime" : "weekly";
      this.lastChangeAt = Number(data.lastChangeAt) || 0;
    }

    this._updateSeason();
  }

  _save() {
    this._storage.saveField("season", {
      current: this.current,
      mode: this.mode,
      lastChangeAt: this.lastChangeAt
    });
  }

  /**
   * Mevsimi güncelle (modda göre).
   */
  _updateSeason() {
    const now = Date.now();

    if (this.mode === "realtime") {
      this._updateRealtime();
    } else {
      this._updateWeekly(now);
    }
  }

  /**
   * Gerçek takvime göre mevsim hesapla.
   */
  _updateRealtime() {
    const month = new Date().getMonth(); // 0-11
    let newSeason;

    if (month >= 2 && month <= 4) newSeason = "spring";      // Mart-Mayıs
    else if (month >= 5 && month <= 7) newSeason = "summer";  // Haziran-Ağustos
    else if (month >= 8 && month <= 10) newSeason = "autumn"; // Eylül-Kasım
    else newSeason = "winter";                                  // Aralık-Şubat

    if (newSeason !== this.current) {
      const old = this.current;
      this.current = newSeason;
      this._save();
      if (this.onSeasonChange) this.onSeasonChange(old, newSeason);
    }
  }

  /**
   * 7 günlük döngü ile mevsim hesapla.
   */
  _updateWeekly(now) {
    if (!this.lastChangeAt) {
      this.lastChangeAt = now;
      this._save();
      return;
    }
 
     const elapsed = now - this.lastChangeAt;
     if (elapsed >= WEEKLY_DURATION) {
       // Kaç mevsim atlanacağını hesapla
       const cyclesSkipped = Math.floor(elapsed / WEEKLY_DURATION);
       const currentIndex = SEASON_ORDER.indexOf(this.current);
       const newIndex = (currentIndex + cyclesSkipped) % SEASON_ORDER.length;
       const old = this.current;
       this.current = SEASON_ORDER[newIndex];
       this.lastChangeAt = now - (elapsed % WEEKLY_DURATION);
       this._save();
       if (old !== this.current && this.onSeasonChange) {
         this.onSeasonChange(old, this.current);
       }
     }
   }

  /**
   * Her frame'de çağrılır.
   */
  update(now) {
    this._updateSeason();
  }

  /**
   * Bu mevsimde belirli bir ürün ekilebilir mi?
   * @param {string} cropId
   * @returns {boolean}
   */
  canPlant(cropId) {
    const season = SEASONS[this.current];
    if (!season || !season.allowedCrops) return true;
    return season.allowedCrops.includes(cropId);
  }

  /**
   * Mevcut mevsimin büyüme çarpanı.
   */
  getGrowMultiplier() {
    return SEASONS[this.current]?.growMultiplier ?? 1.0;
  }

  /**
   * Mevcut mevsimin hasat bonusu.
   */
  getHarvestBonus() {
    return SEASONS[this.current]?.harvestBonus ?? 1.0;
  }

  /**
   * Mevcut mevsim bilgisi.
   */
  getCurrentSeason() {
    return { ...SEASONS[this.current] };
  }

  /**
   * Sonraki mevsim değişimine kalan süre (haftalık mod).
   */
  getTimeUntilChange() {
    if (this.mode === "realtime") return null;
    return Math.max(0, (this.lastChangeAt + WEEKLY_DURATION) - Date.now());
  }

  /**
   * Mod değiştir (weekly ↔ realtime).
   */
  setMode(mode) {
    this.mode = mode === "realtime" ? "realtime" : "weekly";
    this.lastChangeAt = Date.now();
    this._updateSeason();
    this._save();
  }

  /**
   * Tüm mevsim tanımları (UI için).
   */
  static get SEASONS() {
    return SEASONS;
  }

  /**
   * Sadece mevsim bilgisini döndürür (Geriye dönük uyumluluk için ismi aynı bırakıldı)
   * @returns {{ season: object }}
   */
  getSeasonWithMonth() {
    const season = this.getCurrentSeason();
    return {
      season
    };
  }
}
