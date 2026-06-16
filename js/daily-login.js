/**
 * daily-login.js — Günlük giriş ödülü sistemi
 * 
 * 7 günlük streak sistemi:
 *  Gün 1: 100 altın
 *  Gün 2: Gübre x2
 *  Gün 3: Nadir tohum
 *  Gün 4: Özel evcil hayvan
 *  Gün 5: 500 altın
 *  Gün 6: Kozmetik eşya
 *  Gün 7: Altın sandık
 * 
 * Streak 24 saat içinde giriş olmazsa sıfırlanır.
 */

import { GameStorage } from "./storage.js";

// ── Ödül tanımları ─────────────────────────────────────────────
const REWARDS = [
  { day: 1, type: "gold",       amount: 100,  label: "100 Altın 🪙",          icon: "🪙" },
  { day: 2, type: "fertilizer", amount: 2,    label: "Gübre x2 🧪",           icon: "🧪" },
  { day: 3, type: "seed",       id: "sunflower", amount: 1, label: "Nadir Tohum 🌻", icon: "🌻" },
  { day: 4, type: "boost",      amount: 1,    label: "Büyüme Hızlandırıcı ⚡",  icon: "⚡" },
  { day: 5, type: "gold",       amount: 500,  label: "500 Altın 🪙",          icon: "🪙" },
  { day: 6, type: "gold",       amount: 250,  label: "250 Altın 🪙",          icon: "🪙" },
  { day: 7, type: "golden_chest", amount: 1,  label: "Altın Sandık 🎁",       icon: "🎁" }
];

/**
 * Bugünün tarihini YYYY-MM-DD formatında döndürür.
 */
function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * İki tarih string'i arasındaki gün farkını hesapla.
 */
function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + "T00:00:00");
  const d2 = new Date(dateStr2 + "T00:00:00");
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export class DailyLogin {
  /**
   * @param {GameStorage} storage — merkezi depolama
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    
    this.streak = 0;
    this.lastLoginDate = null;
    this.claimed = false;

    this._load();
  }

  _load() {
    const data = this._storage.loadField("dailyLogin");
    if (data && typeof data === "object") {
      this.streak = Number(data.streak) || 0;
      this.lastLoginDate = data.lastLoginDate || null;
      this.claimed = Boolean(data.claimed);
    }
  }

  _save() {
    this._storage.saveField("dailyLogin", {
      streak: this.streak,
      lastLoginDate: this.lastLoginDate,
      claimed: this.claimed
    });
  }

  /**
   * Giriş kontrolü yap.
   * @returns {{ reward: Object, streak: number, isNewDay: boolean }|null}
   *   null → bugün zaten claim edilmiş veya değişiklik yok
   */
  checkLogin() {
    const today = getTodayString();

    // Bugün zaten giriş yapılmış
    if (this.lastLoginDate === today && this.claimed) {
      return null;
    }

    // Bugün zaten giriş yapılmış ama claim edilmemiş
    if (this.lastLoginDate === today && !this.claimed) {
      const reward = REWARDS[(this.streak - 1) % REWARDS.length];
      return { reward, streak: this.streak, isNewDay: false };
    }

    // İlk giriş veya streak devamı hesapla
    if (!this.lastLoginDate) {
      // İlk kez oynuyor
      this.streak = 1;
    } else {
      const diff = daysBetween(this.lastLoginDate, today);
      if (diff === 1) {
        // Ardışık gün — streak devam
        this.streak = this.streak + 1;
        if (this.streak > 7) this.streak = 1; // 7'den sonra döngü
      } else if (diff > 1) {
        // 1 günden fazla ara — streak sıfırla
        this.streak = 1;
      } else {
        // diff <= 0 — aynı gün veya geçmiş tarih (saat dilimi sorunu)
        return null;
      }
    }

    this.lastLoginDate = today;
    this.claimed = false;
    this._save();

    const reward = REWARDS[(this.streak - 1) % REWARDS.length];
    return { reward, streak: this.streak, isNewDay: true };
  }

  /**
   * Ödülü talep et (claim).
   * @returns {Object|null} — ödül objesi veya null
   */
  claimReward() {
    if (this.claimed) return null;

    const reward = REWARDS[(this.streak - 1) % REWARDS.length];
    this.claimed = true;
    this._save();
    return reward;
  }

  /**
   * Mevcut streak bilgisi.
   */
  getStreakInfo() {
    return {
      streak: this.streak,
      claimed: this.claimed,
      rewards: REWARDS,
      currentReward: REWARDS[(this.streak - 1) % REWARDS.length]
    };
  }

  /**
   * Günlük giriş modal HTML'ini oluştur.
   */
  static createModalHTML() {
    return `
    <section id="daily-login-panel" class="daily-login-modal">
      <div class="daily-login-content">
        <h2>🌅 Günlük Giriş Ödülü</h2>
        <div id="daily-streak-display" class="daily-streak-display">
          <span class="streak-label">Giriş Serisi:</span>
          <span id="streak-count" class="streak-count">1</span>
          <span class="streak-label">/ 7 gün</span>
        </div>
        <div id="daily-rewards-grid" class="daily-rewards-grid">
          ${REWARDS.map((r, i) => `
            <div class="daily-reward-item" data-day="${i + 1}">
              <div class="daily-reward-day">Gün ${i + 1}</div>
              <div class="daily-reward-icon">${r.icon}</div>
              <div class="daily-reward-label">${r.label}</div>
            </div>
          `).join("")}
        </div>
        <button id="claim-daily-reward" class="primary-button" type="button">Ödülü Al!</button>
      </div>
    </section>`;
  }
}
