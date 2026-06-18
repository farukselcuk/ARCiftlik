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

  /**
   * Mevsime ve hava durumuna göre sıcaklık tahmini hesapla.
   * @param {string} seasonId — Mevcut mevsim ID'si
   * @returns {number} Sıcaklık (°C)
   */
  getTemperature(seasonId) {
    // Mevsim bazlı baz sıcaklıklar
    const BASE_TEMPS = {
      spring: { min: 12, max: 22 },
      summer: { min: 24, max: 38 },
      autumn: { min: 8,  max: 18 },
      winter: { min: -5, max: 8 }
    };

    // Hava durumu sıcaklık modifiye
    const WEATHER_MODS = {
      sunny: 3,
      cloudy: -1,
      rainy: -3,
      storm: -5
    };

    const seasonRange = BASE_TEMPS[seasonId] || BASE_TEMPS.spring;
    const weatherMod = WEATHER_MODS[this.current] || 0;

    // Saat bazlı sıcaklık dalgalanması (gece soğur, öğlen sıcak)
    const hour = new Date().getHours();
    let hourFactor;
    if (hour >= 6 && hour < 14) {
      hourFactor = (hour - 6) / 8; // 0 → 1 (artan)
    } else if (hour >= 14 && hour < 22) {
      hourFactor = 1 - (hour - 14) / 8; // 1 → 0 (azalan)
    } else {
      hourFactor = 0; // Gece en düşük
    }

    // Deterministik rastgelelik (saate bağlı, her çağrıda aynı)
    const pseudoRandom = Math.sin(hour * 7 + new Date().getDate() * 13) * 0.5 + 0.5;
    const noise = (pseudoRandom - 0.5) * 3;

    const baseTemp = seasonRange.min + (seasonRange.max - seasonRange.min) * hourFactor;
    return Math.round(baseTemp + weatherMod + noise);
  }

  /**
   * Detaylı hava durumu bilgisi (widget için).
   * @param {string} seasonId
   * @returns {{ id: string, name: string, icon: string, temperature: number, tempFormatted: string }}
   */
  getDetailedWeather(seasonId) {
    const weather = this.getCurrentWeather();
    const temp = this.getTemperature(seasonId || "spring");
    return {
      ...weather,
      temperature: temp,
      tempFormatted: `${temp}°C`
    };
  }
}

