/**
 * audio.js — Prosedürel Ses Sistemi (Web Audio API)
 *
 * Ortam sesleri: Kuş cıvıltısı, yağmur, rüzgar
 * Oyun efektleri: Ekim, hasat, coin
 * Harici dosya gerekmez — tamamı Web Audio API ile üretilir.
 */

export class AudioSystem {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    /** @type {Object} Aktif ses kaynakları */
    this.sources = {};
    this._initialized = false;
  }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // localStorage'dan ayarları yükle
    const savedEnabled = localStorage.getItem('sound_enabled');
    if (savedEnabled !== null) this.enabled = savedEnabled === 'true';
    const savedVolume = localStorage.getItem('sound_volume');
    if (savedVolume !== null) this.volume = parseFloat(savedVolume) || 0.7;

    // Kullanıcı etkileşimi olmadan başlatma — ilk tıkta aç
    document.addEventListener('click', () => {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }, { once: true });

    this._initialized = true;
  }

  // ── ORTAM SESLERİ (procedural) ──────────────────────────────────

  /** Kuş sesi — rastgele bip tonları */
  startBirds() {
    if (!this.enabled || !this.ctx || this.sources.birdsTimer) return;

    const playTweet = () => {
      if (!this.enabled || !this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.frequency.setValueAtTime(1200 + Math.random() * 400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1600 + Math.random() * 400, this.ctx.currentTime + 0.1
      );
      gain.gain.setValueAtTime(0.04 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);

      // Bir sonraki cıvıltı — 3-8 saniye arası
      this.sources.birdsTimer = setTimeout(playTweet, 3000 + Math.random() * 5000);
    };
    playTweet();
  }

  stopBirds() {
    clearTimeout(this.sources.birdsTimer);
    delete this.sources.birdsTimer;
  }

  /** Yağmur sesi — white noise + lowpass filter */
  startRain(intensity = 0.3) {
    if (!this.enabled || !this.ctx || this.sources.rain) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = this.ctx.createGain();
    gain.gain.value = intensity * this.volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();

    this.sources.rain = { source, gain };
  }

  stopRain() {
    if (!this.sources.rain || !this.ctx) return;
    try {
      this.sources.rain.gain.gain.exponentialRampToValueAtTime(
        0.001, this.ctx.currentTime + 1
      );
      const rainRef = this.sources.rain;
      setTimeout(() => {
        try { rainRef.source.stop(); } catch {}
      }, 1000);
    } catch {}
    delete this.sources.rain;
  }

  /** Rüzgar sesi — sawtooth + bandpass */
  startWind(intensity = 0.15) {
    if (!this.enabled || !this.ctx || this.sources.wind) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 80;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 200;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = intensity * this.volume;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();

    this.sources.wind = { osc, gain };
  }

  stopWind() {
    if (!this.sources.wind || !this.ctx) return;
    try {
      this.sources.wind.gain.gain.exponentialRampToValueAtTime(
        0.001, this.ctx.currentTime + 1.5
      );
      const windRef = this.sources.wind;
      setTimeout(() => {
        try { windRef.osc.stop(); } catch {}
      }, 1500);
    } catch {}
    delete this.sources.wind;
  }

  // ── OYUN SES EFEKTLERİ ─────────────────────────────────────────

  /** Ekim sesi — yumuşak "plop" */
  playPlant() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /** Hasat sesi — neşeli üç tonlu "ding" */
  playHarvest() {
    if (!this.enabled || !this.ctx) return;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, this.ctx.currentTime + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.12 * this.volume, this.ctx.currentTime + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.08 + 0.3);
      osc.start(this.ctx.currentTime + i * 0.08);
      osc.stop(this.ctx.currentTime + i * 0.08 + 0.3);
    });
  }

  /** Coin sesi — yükselen bip */
  playCoin() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  /** Gübre uygulama sesi — pozitif "fıs" */
  playFertilize() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  /** Dekorasyon yerleştirme sesi — hafif "tok" */
  playPlace() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(250, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  // ── ORTAM GÜNCELLEMESİ ─────────────────────────────────────────

  /**
   * Hava değişimine göre ortam seslerini güncelle.
   * @param {string} weather — 'sunny' | 'cloudy' | 'rainy' | 'storm'
   */
  updateAmbience(weather) {
    this.stopBirds();
    this.stopRain();
    this.stopWind();

    if (!this.enabled) return;

    if (weather === 'sunny')  { this.startBirds(); }
    if (weather === 'cloudy') { this.startBirds(); this.startWind(0.08); }
    if (weather === 'rainy')  { this.startRain(0.25); this.startWind(0.1); }
    if (weather === 'storm')  { this.startRain(0.5);  this.startWind(0.3); }
  }

  // ── KONTROL ─────────────────────────────────────────────────────

  /** Ses aç/kapat */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBirds();
      this.stopRain();
      this.stopWind();
    }
    localStorage.setItem('sound_enabled', this.enabled);
    return this.enabled;
  }

  /** Volume ayarla (0-1) */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    localStorage.setItem('sound_volume', this.volume);
  }
}
