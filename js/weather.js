/**
 * weather.js — Hava durumu sistemi
 *
 * Rastgele hava durumu: ☀️ Güneşli, 🌧️ Yağmurlu, ⛈️ Fırtına, 🌥️ Bulutlu
 * - Güneşli: büyüme hızı %10 artar
 * - Yağmurlu: bitkiler otomatik sulanır
 * - Fırtına: %20 ihtimalle hasar
 * - Hava 6 saatte bir değişir (gerçek saat)
 */

import { GameStorage } from "./storage.js";

// ── Hava durumu tipleri ────────────────────────────────────────
const WEATHER_TYPES = {
  sunny: {
    id: "sunny",
    name: "Güneşli",
    icon: "☀️",
    growMultiplier: 1.10,
    autoWater: false,
    damageChance: 0,
    weight: 40
  },
  cloudy: {
    id: "cloudy",
    name: "Bulutlu",
    icon: "🌥️",
    growMultiplier: 1.00,
    autoWater: false,
    damageChance: 0,
    weight: 30
  },
  rainy: {
    id: "rainy",
    name: "Yağmurlu",
    icon: "🌧️",
    growMultiplier: 1.00,
    autoWater: true,
    damageChance: 0,
    weight: 20
  },
  storm: {
    id: "storm",
    name: "Fırtına",
    icon: "⛈️",
    growMultiplier: 0.80,
    autoWater: true,
    damageChance: 0.20,
    weight: 10
  }
};

// ── 6 saat (milisaniye) ────────────────────────────────────────
const CHANGE_INTERVAL = 6 * 60 * 60 * 1000;

export class WeatherSystem {
  /**
   * @param {GameStorage} storage
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    this.current = "sunny";
    this.nextChangeAt = 0;
    this._lastDamageCheck = 0;
    /** @type {Function|null} hava değişti callback */
    this.onWeatherChange = null;
    /** @type {Function|null} fırtına hasarı callback */
    this.onStormDamage = null;

    this._load();
  }

  _load() {
    const data = this._storage.loadField("weather");
    if (data && typeof data === "object") {
      this.current = WEATHER_TYPES[data.current] ? data.current : "sunny";
      this.nextChangeAt = Number(data.nextChangeAt) || 0;
    }

    // İlk yükleme veya süre dolmuşsa hemen yeni hava belirle
    if (!this.nextChangeAt || Date.now() >= this.nextChangeAt) {
      this._pickNewWeather();
    }
  }

  _save() {
    this._storage.saveField("weather", {
      current: this.current,
      nextChangeAt: this.nextChangeAt
    });
  }

  /**
   * Ağırlıklı rastgele hava seçimi.
   */
  _pickNewWeather() {
    const types = Object.values(WEATHER_TYPES);
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const type of types) {
      roll -= type.weight;
      if (roll <= 0) {
        const oldWeather = this.current;
        this.current = type.id;
        this.nextChangeAt = Date.now() + CHANGE_INTERVAL;
        this._save();

        if (oldWeather !== this.current && this.onWeatherChange) {
          this.onWeatherChange(this.current, WEATHER_TYPES[this.current]);
        }
        return;
      }
    }

    // Fallback
    this.current = "sunny";
    this.nextChangeAt = Date.now() + CHANGE_INTERVAL;
    this._save();
  }

  /**
   * Her frame'de çağrılır.
   * @param {number} now — Date.now()
   */
  update(now) {
    // Süre dolduysa yeni hava seç
    if (now >= this.nextChangeAt) {
      this._pickNewWeather();
    }
  }

  /**
   * Mevcut hava durumunun büyüme çarpanı.
   * @returns {number}
   */
  getGrowMultiplier() {
    return WEATHER_TYPES[this.current]?.growMultiplier ?? 1.0;
  }

  /**
   * Yağmurda bitkiler otomatik sulanır mı?
   * @returns {boolean}
   */
  shouldAutoWater() {
    return WEATHER_TYPES[this.current]?.autoWater ?? false;
  }

  /**
   * Mevcut hava bilgisi.
   * @returns {{ id: string, name: string, icon: string, growMultiplier: number }}
   */
  getCurrentWeather() {
    return { ...WEATHER_TYPES[this.current] };
  }

  /**
   * Fırtına hasarını uygula — her hava değişiminde bir kez çağrılır.
   * @param {Array} plots — Farm.plots dizisi
   * @returns {number} hasar gören plot sayısı
   */
  applyStormDamage(plots) {
    if (this.current !== "storm") return 0;

    const damageChance = WEATHER_TYPES.storm.damageChance;
    let damaged = 0;

    for (const plot of plots) {
      if (!plot.cropId) continue;
      if (Math.random() < damageChance) {
        // Büyüme süresini geri sar (hasar efekti)
        plot.boostMs = Math.max(0, plot.boostMs - 5000);
        damaged++;
      }
    }

    if (damaged > 0 && this.onStormDamage) {
      this.onStormDamage(damaged);
    }

    return damaged;
  }

  /**
   * Sonraki hava değişimine kalan süre (ms).
   */
  getTimeUntilChange() {
    return Math.max(0, this.nextChangeAt - Date.now());
  }

  /**
   * Kalan süreyi okunabilir formatta döndür.
   */
  getTimeUntilChangeFormatted() {
    const ms = this.getTimeUntilChange();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}s ${mins}dk`;
  }

  /**
   * Tüm hava tipleri (UI için).
   */
  static get TYPES() {
    return WEATHER_TYPES;
  }
}
