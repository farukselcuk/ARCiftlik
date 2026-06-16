/**
 * performance.js — Cihaz Benchmark ve Grafik Kalitesi Yönetimi
 * 
 * Cihazın CPU çekirdek sayısı, RAM kapasitesi ve FPS ölçümüne göre
 * grafik profilini (high | medium | low) belirler ve uygular.
 */

export const Performance = {
  /**
   * Cihazın performans kalitesini algılar.
   * Eğer önceden kaydedilmiş bir tercih varsa onu döner.
   * @returns {Promise<"high"|"medium"|"low">}
   */
  async detect() {
    // 1. Manuel override kontrolü
    const saved = localStorage.getItem("arciftlik:performance-quality");
    if (saved === "high" || saved === "medium" || saved === "low") {
      return saved;
    }

    // 2. Donanım benchmark'ı
    const score = await this.benchmark();
    let quality = "medium";
    if (score >= 80) quality = "high";
    else if (score < 40) quality = "low";

    // Tespit edilen kaliteyi kaydet
    localStorage.setItem("arciftlik:performance-quality", quality);
    return quality;
  },

  /**
   * Hızlı donanım/FPS benchmark testi.
   * @returns {Promise<number>} composite score (0-100)
   */
  async benchmark() {
    const cores = navigator.hardwareConcurrency || 4;
    // deviceMemory Chrome'da mevcuttur (GB biriminde), yoksa varsayılan 4GB kabul edilir
    const memory = navigator.deviceMemory || 4; 

    // Donanım puanı (maksimum 60 puan)
    let hwScore = 0;
    hwScore += Math.min(cores * 5, 30); // 8 çekirdek = 30 puan
    hwScore += Math.min(memory * 5, 30); // 8 GB RAM = 30 puan

    // FPS ölçümü (maksimum 40 puan)
    // 100ms boyunca frame süresini ölçerek FPS hesapla
    const fpsScore = await new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      
      const measure = () => {
        frames++;
        const elapsed = performance.now() - start;
        if (elapsed >= 100) {
          const fps = (frames * 1000) / elapsed;
          // 60 FPS = 40 puan, 30 FPS = 20 puan
          const score = Math.min(Math.round((fps / 60) * 40), 40);
          resolve(score);
        } else {
          requestAnimationFrame(measure);
        }
      };
      
      requestAnimationFrame(measure);
    });

    const totalScore = hwScore + fpsScore;
    console.log(`[Performance] Benchmark tamamlandı. Skor: ${totalScore} (CPU: ${cores}, RAM: ${memory}GB)`);
    return totalScore;
  },

  /**
   * Belirlenen kaliteyi Three.js renderer ve sahnesine uygular.
   * @param {"high"|"medium"|"low"} level
   * @param {THREE.WebGLRenderer} renderer
   * @returns {Object} uygulanan konfigürasyon
   */
  apply(level, renderer) {
    const configs = {
      high: {
        pixelRatio: window.devicePixelRatio,
        shadows: true,
        antialias: true,
        maxPlots: 36,
        arQuality: "high",
        label: "Yüksek Grafik Modu 🚀"
      },
      medium: {
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        shadows: false,
        antialias: true,
        maxPlots: 25,
        arQuality: "medium",
        label: "Dengeli Grafik Modu ⚖️"
      },
      low: {
        pixelRatio: 1.0,
        shadows: false,
        antialias: false,
        maxPlots: 16,
        arQuality: "low",
        label: "Düşük Güç Grafik Modu 🔋"
      }
    };

    const cfg = configs[level] || configs.medium;

    // Renderer ayarlarını güncelle
    renderer.setPixelRatio(cfg.pixelRatio);
    renderer.shadowMap.enabled = cfg.shadows;
    
    window.performanceQuality = level; // Global kaliteyi crops.js vb. için kaydet
    console.log(`[Performance] Grafik kalitesi uygulandı: ${level.toUpperCase()}`);

    return cfg;
  },

  /**
   * Kaliteyi manuel olarak değiştir.
   * @param {"high"|"medium"|"low"} level
   */
  setOverride(level) {
    if (level === "high" || level === "medium" || level === "low") {
      localStorage.setItem("arciftlik:performance-quality", level);
      window.location.reload(); // Değişiklikleri uygulamak için sayfayı yenile
    }
  }
};
