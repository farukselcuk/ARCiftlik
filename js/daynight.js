/**
 * daynight.js — Gündüz/Gece Döngüsü Sistemi
 *
 * Gerçek saat (new Date()) kullanarak gündüz-gece döngüsü sağlar.
 * Sahne ışıklandırmasını, gökyüzü rengini ve atmosferi günceller.
 *
 * Zaman Dilimleri:
 *   06:00-07:00  → Gün doğumu (sunrise)
 *   07:00-18:00  → Gündüz (day)
 *   18:00-20:00  → Gün batımı (sunset)
 *   20:00-06:00  → Gece (night)
 */

import * as THREE from "three";

// ── Zaman fazı sabitleri ────────────────────────────────────────────
const PHASES = {
  sunrise: { id: "sunrise", name: "Gün Doğumu", icon: "🌅" },
  day:     { id: "day",     name: "Gündüz",     icon: "☀️" },
  sunset:  { id: "sunset",  name: "Gün Batımı", icon: "🌇" },
  night:   { id: "night",   name: "Gece",       icon: "🌙" }
};

// ── Renk & ışık presetleri ──────────────────────────────────────────
const PRESETS = {
  sunrise: {
    ambientIntensity: 0.9,
    sunIntensity: 1.4,
    sunColor: new THREE.Color(0xffaa66),
    ambientColor: new THREE.Color(0xffe0b0),
    fogColor: new THREE.Color(0xffccaa)
  },
  day: {
    ambientIntensity: 1.5,
    sunIntensity: 2.2,
    sunColor: new THREE.Color(0xffffff),
    ambientColor: new THREE.Color(0xffffff),
    fogColor: new THREE.Color(0xaaddff)
  },
  sunset: {
    ambientIntensity: 0.7,
    sunIntensity: 0.8,
    sunColor: new THREE.Color(0xff7744),
    ambientColor: new THREE.Color(0xffcc88),
    fogColor: new THREE.Color(0xff9966)
  },
  night: {
    ambientIntensity: 0.35,
    sunIntensity: 0.15,
    sunColor: new THREE.Color(0x5577aa),
    ambientColor: new THREE.Color(0x334466),
    fogColor: new THREE.Color(0x1a2244)
  }
};

export class DayNightCycle {
  constructor() {
    /** @type {string} Mevcut faz (sunrise|day|sunset|night) */
    this.currentPhase = "day";
    /** @type {number} 0-1 arası faz ilerleme oranı */
    this.phaseProgress = 0;
    /** @type {Function|null} Faz değiştiğinde çağrılır */
    this.onPhaseChange = null;
    /** @type {string|null} Önceki faz (değişim tespiti için) */
    this._lastPhase = null;
    /** @type {number} Son güncelleme zamanı */
    this._lastUpdateTime = 0;

    this._update(Date.now());
  }

  /**
   * Mevcut saati (0-24 arası float) döndürür.
   * @param {number} nowMs
   */
  _getTimeOfDay(nowMs) {
    const cycleMs = 25 * 60 * 1000;
    const elapsedMs = nowMs % cycleMs;
    return (elapsedMs / cycleMs) * 24;
  }

  /**
   * Saati faz ve ilerlemeye çevirir.
   * @param {number} nowMs
   */
  _update(nowMs) {
    if (nowMs - this._lastUpdateTime < 1000) return; // Saniyede en fazla 1 kez
    this._lastUpdateTime = nowMs;

    const cycleMs = 25 * 60 * 1000;
    const elapsedMs = nowMs % cycleMs;
    const elapsedMinutes = elapsedMs / (60 * 1000); // 0-25 arası float

    if (elapsedMinutes >= 0 && elapsedMinutes < 1) {
      // Gün doğumu: 0 - 1. dakika (1 dakika)
      this.currentPhase = "sunrise";
      this.phaseProgress = elapsedMinutes / 1;
    } else if (elapsedMinutes >= 1 && elapsedMinutes < 14) {
      // Gündüz: 1 - 14. dakika (13 dakika)
      this.currentPhase = "day";
      this.phaseProgress = (elapsedMinutes - 1) / 13;
    } else if (elapsedMinutes >= 14 && elapsedMinutes < 15) {
      // Gün batımı: 14 - 15. dakika (1 dakika)
      this.currentPhase = "sunset";
      this.phaseProgress = (elapsedMinutes - 14) / 1;
    } else {
      // Gece: 15 - 25. dakika (10 dakika)
      this.currentPhase = "night";
      this.phaseProgress = (elapsedMinutes - 15) / 10;
    }

    // Faz değişimi kontrolü
    if (this._lastPhase && this._lastPhase !== this.currentPhase) {
      if (this.onPhaseChange) {
        this.onPhaseChange(this._lastPhase, this.currentPhase, PHASES[this.currentPhase]);
      }
    }
    this._lastPhase = this.currentPhase;
  }

  /**
   * Her frame'de çağrılır. Sahne ışıklarını gerçek saate göre günceller.
   * @param {THREE.AmbientLight} ambientLight
   * @param {THREE.DirectionalLight} sunLight
   * @param {THREE.Group|null} firefliesGroup — Ateşböcekleri grubu
   * @param {number} now — performance.now() veya Date.now()
   */
  update(ambientLight, sunLight, firefliesGroup, now) {
    const nowTimeMs = Date.now();
    this._update(nowTimeMs);

    const phase = this.currentPhase;
    const progress = this.phaseProgress;

    // Geçiş hedef ve kaynak presetlerini belirle
    let fromPreset, toPreset, t;

    switch (phase) {
      case "sunrise":
        fromPreset = PRESETS.night;
        toPreset = PRESETS.day;
        t = progress;
        break;
      case "day":
        fromPreset = PRESETS.day;
        toPreset = PRESETS.day;
        t = 0;
        break;
      case "sunset":
        fromPreset = PRESETS.day;
        toPreset = PRESETS.night;
        t = progress;
        break;
      case "night":
        fromPreset = PRESETS.night;
        toPreset = PRESETS.night;
        t = 0;
        break;
      default:
        fromPreset = PRESETS.day;
        toPreset = PRESETS.day;
        t = 0;
    }

    // Ambient light güncelle
    if (ambientLight) {
      ambientLight.intensity = THREE.MathUtils.lerp(fromPreset.ambientIntensity, toPreset.ambientIntensity, t);
      ambientLight.color.lerpColors(fromPreset.ambientColor, toPreset.ambientColor, t);
    }

    // Sun light güncelle
    if (sunLight) {
      sunLight.intensity = THREE.MathUtils.lerp(fromPreset.sunIntensity, toPreset.sunIntensity, t);
      sunLight.color.lerpColors(fromPreset.sunColor, toPreset.sunColor, t);

      // Güneş pozisyonunu gün içinde hareket ettir
      const dayProgress = (nowTimeMs % (25 * 60 * 1000)) / (25 * 60 * 1000);
      const sunAngle = dayProgress * Math.PI * 2 - Math.PI / 2;
      sunLight.position.set(
        Math.cos(sunAngle) * 2,
        Math.max(0.3, Math.sin(sunAngle) * 3),
        1.6
      );
    }

    // Ateşböcekleri gece fazında aktif
    if (firefliesGroup) {
      const isNight = phase === "night" || (phase === "sunset" && progress > 0.7);
      firefliesGroup.visible = isNight;
      if (isNight) {
        const timeSec = (now || Date.now()) * 0.001;
        firefliesGroup.children.forEach((ff) => {
          ff.position.x = ff.userData.baseX + Math.sin(timeSec + ff.userData.seedX) * 0.08;
          ff.position.y = ff.userData.baseY + Math.sin(timeSec * 1.5 + ff.userData.seedY) * 0.05;
          ff.position.z = ff.userData.baseZ + Math.cos(timeSec + ff.userData.seedZ) * 0.08;
        });
      }
    }
  }

  /**
   * Mevcut faz bilgisi.
   * @returns {{ id: string, name: string, icon: string }}
   */
  getPhase() {
    return { ...PHASES[this.currentPhase] };
  }

  /**
   * Gece mi?
   * @returns {boolean}
   */
  isNight() {
    return this.currentPhase === "night";
  }

  /**
   * Gündüz mi?
   * @returns {boolean}
   */
  isDay() {
    return this.currentPhase === "day";
  }

  /**
   * Saat bilgisini HH:MM formatında döndürür.
   * @param {number} [nowMs]
   * @returns {string}
   */
  getFormattedTime(nowMs) {
    const timeMs = nowMs || Date.now();
    const cycleMs = 25 * 60 * 1000;
    const elapsedMs = timeMs % cycleMs;
    const t = (elapsedMs / cycleMs) * 24;
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    const hStr = String(hours).padStart(2, "0");
    const mStr = String(minutes).padStart(2, "0");
    return `${hStr}:${mStr}`;
  }

  /**
   * Tüm fazlar (UI için).
   */
  static get PHASES() {
    return PHASES;
  }
}
