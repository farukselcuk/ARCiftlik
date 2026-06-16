import { FarmScene } from "./scenes/farm-scene.js";
import { BarnScene } from "./scenes/barn-scene.js";
import { BakeryScene } from "./scenes/bakery-scene.js";
import { MarketScene } from "./scenes/market-scene.js";

export class SceneManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   * @param {GameStorage} farmStorage
   * @param {GameStorage} barnStorage
   * @param {GameStorage} marketStorage
   * @param {GameStorage} bakeryStorage
   */
  constructor(renderer, globalStorage, farmStorage, barnStorage, marketStorage, bakeryStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;
    this.farmStorage = farmStorage;
    this.barnStorage = barnStorage;
    this.marketStorage = marketStorage;
    this.bakeryStorage = bakeryStorage;

    this.scenes = {
      farm: new FarmScene(renderer, globalStorage, farmStorage),
      barn: new BarnScene(renderer, globalStorage, barnStorage),
      bakery: new BakeryScene(renderer, globalStorage, bakeryStorage),
      market: new MarketScene(renderer, globalStorage, marketStorage)
    };

    this.activeSceneKey = "farm";
    this.activeScene = this.scenes.farm;

    this.initTabBar();
  }

  /** Sahneleri ilklendir */
  initAll() {
    for (const key in this.scenes) {
      this.scenes[key].init();
    }
    this.activeScene.resume();
  }

  /** Tab bar etkileşimlerini ayarla */
  initTabBar() {
    const tabs = document.querySelectorAll(".tab-button");
    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const sceneKey = tab.dataset.scene;

        // Fırın kilidi kontrolü (Seviye 5)
        if (sceneKey === "bakery") {
          const charLevel = Number(this.globalStorage.loadField("level")) || 1;
          if (charLevel < 5) {
            window.dispatchEvent(new CustomEvent("toast", { detail: { text: "🍞 Fırın Üretim Zinciri Seviye 5'te açılır!" } }));
            return;
          }
        }

        if (sceneKey && sceneKey !== this.activeSceneKey) {
          this.switchScene(sceneKey);
          
          // Tab aktif stilini güncelle
          tabs.forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
        }
      });
    });
  }

  /**
   * Sahne değiştirme
   * @param {string} sceneKey
   */
  switchScene(sceneKey) {
    console.log(`[SceneManager] Sahne değiştiriliyor: ${this.activeSceneKey} → ${sceneKey}`);
    
    // Mevcut sahneyi duraklat
    this.activeScene.pause();

    // Yeni sahneyi belirle ve başlat
    this.activeSceneKey = sceneKey;
    this.activeScene = this.scenes[sceneKey];
    this.activeScene.resume();

    // UI görünürlük güncellemeleri
    const bottomBar = document.querySelector(".bottom-bar"); // Ekim tepsisi
    const toolsBar = document.querySelector(".tools-bar"); // Sulama aracı
    
    if (sceneKey === "farm") {
      if (bottomBar) bottomBar.style.display = "grid";
      if (toolsBar) toolsBar.style.display = "flex";
      document.body.classList.add("has-farm");
    } else {
      if (bottomBar) bottomBar.style.display = "none";
      if (toolsBar) toolsBar.style.display = "none";
      document.body.classList.remove("has-farm");
    }

    // Tetiklenen özel olay (scene-changed)
    document.dispatchEvent(new CustomEvent("scene-changed", { detail: { scene: sceneKey } }));
  }

  /**
   * Kare güncelleme
   * @param {number} dt
   * @param {number} realNow
   */
  update(dt, realNow) {
    if (this.activeScene && this.activeScene.active) {
      this.activeScene.update(dt, realNow);
    }
  }

  /** Render fonksiyonu */
  render() {
    if (this.activeScene && this.activeScene.active) {
      this.renderer.render(this.activeScene.scene, this.activeScene.camera);
    }
  }

  /** Ekran boyutu değiştiğinde */
  resize(width, height) {
    for (const key in this.scenes) {
      this.scenes[key].resize(width, height);
    }
  }
}
