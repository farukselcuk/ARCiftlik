import * as THREE from "three";
import { GameStorage } from "./storage.js";
import { SceneManager } from "./scene-manager.js";
import { DailyLogin } from "./daily-login.js";
import { WeatherSystem } from "./weather.js";
import { SeasonSystem } from "./seasons.js";
import { GameUI } from "./ui.js";
import { Inventory } from "./inventory.js";
import { Orders } from "./orders.js";
import { CROP_TYPES } from "./crops.js";
import { setupViewportFix } from "./permissions.js";
import { FARM_EXPANSIONS } from "./farm.js";
import { Performance } from "./performance.js";
import * as firebaseService from "./firebase-service.js";

// Viewport düzeltmesi (Android klavye sorunu)
setupViewportFix();

const sceneRoot = document.querySelector("#scene-root");
const startButton = document.querySelector("#start-ar");

// Renderer oluştur
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(1.0); // Benchmark ile güncellenecek
renderer.shadowMap.enabled = false; // Benchmark ile güncellenecek
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
sceneRoot.appendChild(renderer.domElement);

// Storages (Her prefix için ayrı GameStorage instance'ı)
const globalStorage = new GameStorage("global");
const farmStorage = new GameStorage("farm");
const barnStorage = new GameStorage("barn");
const marketStorage = new GameStorage("market");
const bakeryStorage = new GameStorage("bakery");

// Paylaşımlı Global Modüller & Sistemler (Giriş yapıldığında ilklendirilecek)
let inventory = null;
let orders = null;
let dailyLogin = null;
let weatherSystem = null;
let seasonSystem = null;
let ui = null;
let sceneManager = null;
let character = null;

// Göç / Bildirim kontrolü
let _migrationNotice = null;
globalStorage.onMigrationNotice = (oldVer, newVer) => {
  _migrationNotice = `Güncelleme geldi (v${oldVer} → v${newVer}), verileriniz güncellendi!`;
};

// Oyun ilklendirme fonksiyonu (Firebase Auth başarılı olunca çağrılır)
async function initGame(user, nickname) {
  console.log(`[GameInit] Oyuncu verileri yükleniyor: ${nickname} (${user.email})`);
  
  // Yükleme ekranı durumunu göster
  document.querySelector("#auth-loading").style.display = "flex";
  document.querySelector("#auth-forms").style.display = "none";
  document.querySelector("#welcome-panel").style.display = "none";
  
  // Firestore'dan kayıtlı verileri çek ve in-memory cache'e yaz
  let saveData = null;
  try {
    saveData = await firebaseService.loadGameData(user.uid);
  } catch (err) {
    console.error("[GameInit] Firestore veri yükleme hatası (Varsayılan değerlerle başlanıyor):", err);
    // UI henüz ilklendirilmediği için toast'u gecikmeli gönderiyoruz
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Bağlantı hatası! Çevrimdışı mod aktif." } }));
    }, 1500);
  }
  
  if (saveData) {
    console.log("[GameInit] Firestore kayıt verisi bulundu, belleğe yükleniyor.");
    for (const key in saveData) {
      if (key !== "updatedAt") {
        window.gameInMemoryCache[key] = saveData[key];
      }
    }
  } else {
    console.log("[GameInit] Yeni oyuncu, varsayılan değerler oluşturuluyor.");
  }
  
  // Sürümleri kontrol et ve varsayılanları merge et
  globalStorage.checkVersion();
  farmStorage.checkVersion();
  barnStorage.checkVersion();
  marketStorage.checkVersion();
  bakeryStorage.checkVersion();
  
  // Modülleri instantiate et
  inventory = new Inventory(globalStorage);
  orders = new Orders(globalStorage);
  dailyLogin = new DailyLogin(globalStorage);
  weatherSystem = new WeatherSystem(globalStorage);
  seasonSystem = new SeasonSystem(globalStorage);
  
  window.seasonSystem = seasonSystem;
  window.weatherSystem = weatherSystem;
  window.cycleStartTime = Date.now();
  
  // UI Yönetimi
  ui = new GameUI(globalStorage);
  
  // Scene Manager (Sahne yönetim sistemi)
  sceneManager = new SceneManager(renderer, globalStorage, farmStorage, barnStorage, marketStorage, bakeryStorage);
  sceneManager.initAll();
  
  // Karakter Seviye / XP UI Senkronizasyonu
  character = sceneManager.scenes.farm.character; // Karakter referansı
  character.loadXP();
  updateXPUI(character.level, character.xp, false);
  
  // Sistem Listener'larını bağla
  weatherSystem.onWeatherChange = (newWeather, info) => {
    if (ui) ui.showToast(`Hava değişti: ${info.icon} ${info.name}`);
    updateWeatherUI();
  };
  
  seasonSystem.onSeasonChange = (oldSeason, newSeason) => {
    const info = SeasonSystem.SEASONS[newSeason];
    if (ui) ui.showToast(`Mevsim değişti: ${info.icon} ${info.name}`);
    updateSeasonUI();
  };
  
  sceneManager.scenes.farm.chestSystem.onChestOpened = (loot) => {
    if (loot.type === "gold") {
      ui.updateCoins(loot.amount);
      ui.showToast(`🎁 Sandıktan ${loot.amount} altın çıktı!`);
    } else if (loot.type === "seed" && loot.cropId) {
      inventory.add(loot.cropId, loot.amount || 1);
      ui.showToast(`🎁 Sandıktan ${loot.cropId} tohumu çıktı!`);
    } else if (loot.type === "fertilizer") {
      ui.showToast(`🎁 Sandıktan gübre çıktı!`);
    }
    updateWarehouseUI();
  };
  
  // Tohum seçim kutusu ve badges güncelle
  populateSeedPicker();
  updateWeatherUI();
  updateSeasonUI();
  
  // Giriş ekranı verilerini güncelle
  document.querySelector("#user-display-name").textContent = nickname;
  document.querySelector("#settings-username").textContent = nickname;
  document.querySelector("#settings-email").textContent = user.email;
  
  // Liderlik tablosu butonu durumunu kontrol et
  setupLeaderboardUI();
  
  // Firestore Arkaplan Senkronizasyonunu Başlat
  firebaseService.initSyncListener();
  
  // Yükleme bitti, karşılama ekranını göster
  document.querySelector("#auth-loading").style.display = "none";
  document.querySelector("#welcome-panel").style.display = "flex";
}

// Performans Modu Ayarlama
let performanceConfig = null;
async function initPerformance() {
  const quality = await Performance.detect();
  performanceConfig = Performance.apply(quality, renderer);
  
  // Settings modal buton durumlarını ayarla
  const qualityBtns = document.querySelectorAll(".quality-btn");
  qualityBtns.forEach(btn => {
    if (btn.dataset.quality === quality) {
      btn.style.boxShadow = "0 0 0 3px white";
    }
  });

  if (started && ui) {
    ui.showToast(`${performanceConfig.label} aktif!`);
  }
}
initPerformance();

function getLevelUpReward(newLevel) {
  let gold = newLevel * 100;
  let rewardText = `${gold} Altın`;
  let rewardIcon = "🪙";
  let rewardItem = null;

  if (newLevel === 2) {
    rewardText += " & 2 Mısır Tohumu";
    rewardIcon = "🌽";
    rewardItem = { id: "corn", amount: 2 };
  } else if (newLevel === 3) {
    rewardText += " & 2 Çilek Tohumu";
    rewardIcon = "🍓";
    rewardItem = { id: "strawberry", amount: 2 };
  } else if (newLevel === 4) {
    rewardText += " & 2 Patates Tohumu";
    rewardIcon = "🥔";
    rewardItem = { id: "potato", amount: 2 };
  } else if (newLevel === 5) {
    rewardText += " & 2 Ayçiçeği Tohumu";
    rewardIcon = "🌻";
    rewardItem = { id: "sunflower", amount: 2 };
  } else if (newLevel === 6) {
    rewardText += " & 2 Domates Tohumu";
    rewardIcon = "🍅";
    rewardItem = { id: "tomato", amount: 2 };
  } else if (newLevel === 7) {
    rewardText += " & 2 Kabak Tohumu";
    rewardIcon = "🎃";
    rewardItem = { id: "pumpkin", amount: 2 };
  } else if (newLevel === 8) {
    rewardText += " & 2 Yaban Mersini Tohumu";
    rewardIcon = "🫐";
    rewardItem = { id: "blueberry", amount: 2 };
  } else {
    gold = newLevel * 150;
    rewardText = `${gold} Altın`;
    rewardIcon = "🪙";
  }
  
  return { text: rewardText, icon: rewardIcon, amount: gold, extra: rewardItem };
}

function updateXPUI(level, xp, leveledUp) {
  const nextLevelXP = level * 100;
  const fillPercent = Math.min(100, (xp / nextLevelXP) * 100);
  document.querySelector("#level-value").textContent = level;
  document.querySelector("#xp-bar-fill").style.width = `${fillPercent}%`;
  
  // Fırın kilidi görsel senkronizasyonu (Seviye 5)
  const bakeryTab = document.querySelector("#tab-bakery");
  if (bakeryTab) {
    if (level >= 5) {
      bakeryTab.style.opacity = "1";
      bakeryTab.querySelector(".tab-icon").textContent = "🍞";
    } else {
      bakeryTab.style.opacity = "0.5";
      bakeryTab.querySelector(".tab-icon").textContent = "🍞🔒";
    }
  }

  if (leveledUp) {
    const reward = getLevelUpReward(level);
    
    // Modalı doldur
    document.querySelector("#levelup-level-val").textContent = level;
    document.querySelector("#levelup-reward-icon").textContent = reward.icon;
    document.querySelector("#levelup-reward-text").textContent = reward.text;
    
    const modal = document.querySelector("#levelup-modal");
    modal.classList.add("is-visible");
    
    document.querySelector("#claim-levelup-btn").onclick = (e) => {
      e.stopPropagation();
      
      // Ödülleri ver
      ui.updateCoins(reward.amount);
      if (reward.extra) {
        inventory.add(reward.extra.id, reward.extra.amount);
      }
      
      modal.classList.remove("is-visible");
      ui.showToast(`🎁 Seviye ${level} ödülleri alındı!`);
    };
  }
}

// Global Event Listeners (Sahnelerden gelen olayları dinler)
window.addEventListener("xp-updated", (e) => {
  const { level, xp, leveledUp } = e.detail;
  updateXPUI(level, xp, leveledUp);
});

window.addEventListener("coins-reward", (e) => {
  ui.updateCoins(e.detail.amount);
});

window.addEventListener("spend-coins", (e) => {
  const { amount, callback } = e.detail;
  if (ui.coins >= amount) {
    ui.updateCoins(-amount);
    callback(true);
  } else {
    ui.showToast("🪙 Yetersiz Altın!");
    callback(false);
  }
});

window.addEventListener("xp-gain", (e) => {
  character.addXP(e.detail.amount, e.detail.source);
});

window.addEventListener("toast", (e) => {
  ui.showToast(e.detail.text);
});

window.addEventListener("open-market-panel", () => {
  updateMarketUI();
  document.querySelector("#market-panel").classList.add("is-visible");
});

window.addEventListener("crop-harvested", (e) => {
  const { cropId, name, isGolden } = e.detail;
  const harvestBonus = seasonSystem.getHarvestBonus();
  
  if (isGolden) {
    inventory.add(`golden_${cropId}`, 1);
    ui.showToast(`✨ ALTIN ${name.toUpperCase()} HASAT EDİLDİ! (10x Fiyat) ✨`);
    character.addXP(15, "harvest_golden");
  } else {
    const extra = Math.random() < (harvestBonus - 1) ? 2 : 1;
    inventory.add(cropId, extra);
    ui.showToast(`${extra} adet ${name} hasat edildi!`);
    character.addXP(5, "harvest");
  }

  updateWarehouseUI();
  updateOrdersUI();
});

// Alet yönetimi (Sulama aleti toggling)
window.activeTool = "crop";
const waterToolBtn = document.querySelector("#water-tool");
if (waterToolBtn) {
  waterToolBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.activeTool = window.activeTool === "water" ? "crop" : "water";
    waterToolBtn.classList.toggle("is-selected", window.activeTool === "water");
    ui.showToast(window.activeTool === "water" ? "Sulama modu aktif 💧" : "Ekim modu aktif 🌱");
  });
}

// Tohum Emojileri
const CROP_EMOJIS = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  strawberry: "🍓",
  potato: "🥔",
  sunflower: "🌻",
  tomato: "🍅",
  pumpkin: "🎃",
  blueberry: "🫐"
};

// Tohum Seçim Bottom Sheet Entegrasyonu
let activePlotIndexForPlanting = null;
const seedPicker = document.querySelector("#seed-picker");

// Tohum seçeneklerini crops.js'deki verilere göre dinamik oluştur
function populateSeedPicker() {
  const container = document.querySelector(".seed-options");
  if (!container) return;
  container.innerHTML = "";

  Object.values(CROP_TYPES).forEach(crop => {
    const card = document.createElement("button");
    card.className = "seed-option-card";
    card.dataset.crop = crop.id;
    card.type = "button";

    const emoji = CROP_EMOJIS[crop.id] || "🌱";
    const growSeconds = crop.growTime / 1000;
    
    // Sezon bilgisi formatı
    const seasonLabel = crop.seasons.includes("all") ? "Her Mevsim" : crop.seasons.map(s => {
      if (s === "spring") return "İlkbahar";
      if (s === "summer") return "Yaz";
      if (s === "autumn") return "Sonbahar";
      return "Kış";
    }).join("/");

    card.innerHTML = `
      <span class="seed-emoji">${emoji}</span>
      <span class="seed-name">${crop.name}</span>
      <span class="seed-cost">${crop.cost} 🪙</span>
      <span class="seed-time">${growSeconds}s | ${seasonLabel}</span>
    `;
    container.appendChild(card);
  });

  bindSeedCards();
}

function bindSeedCards() {
  const seedCards = document.querySelectorAll(".seed-option-card");
  seedCards.forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const cropId = card.dataset.crop;
      const crop = CROP_TYPES[cropId];

      // Seviye kısıtlaması kontrolü
      if (character.level < crop.unlockedAt) {
        ui.showToast(`🔒 ${crop.name} ekmek için Seviye ${crop.unlockedAt} olmalısınız!`);
        return;
      }

      // Mevsim kısıtlaması kontrolü
      if (!seasonSystem.canPlant(cropId)) {
        const season = seasonSystem.getCurrentSeason();
        ui.showToast(`❌ ${season.icon} ${season.name} mevsiminde bu ürün ekilemez!`);
        return;
      }
      
      // Para kontrolü
      if (ui.coins < crop.cost) {
        ui.showToast("🪙 Yetersiz Altın!");
        return;
      }
      
      if (activePlotIndexForPlanting !== null) {
        // Ekim yap
        sceneManager.scenes.farm.plantPlot(activePlotIndexForPlanting, cropId);
        
        // Sürüklemeyi tetiklemek için tohum ID'sini ayarla
        sceneManager.scenes.farm.dragSeedId = cropId;
        
        seedPicker.classList.remove("is-visible");
        activePlotIndexForPlanting = null;
      }
    });
  });
}

window.addEventListener("open-seed-picker", (e) => {
  activePlotIndexForPlanting = e.detail.plotIndex;
  
  // Tohum kartlarının kilit/para durumlarını güncelle
  const cards = document.querySelectorAll(".seed-option-card");
  cards.forEach(card => {
    const cropId = card.dataset.crop;
    const crop = CROP_TYPES[cropId];
    
    // Coin yetersizliği
    if (ui.coins < crop.cost) {
      card.classList.add("insufficient-funds");
    } else {
      card.classList.remove("insufficient-funds");
    }
    
    // Seviye kilitleri
    const nameSpan = card.querySelector(".seed-name");
    if (character.level < crop.unlockedAt) {
      card.classList.add("locked");
      card.style.opacity = "0.5";
      if (nameSpan) nameSpan.textContent = `Kilitli (Lv ${crop.unlockedAt})`;
    } else {
      card.classList.remove("locked");
      card.style.opacity = "1";
      if (nameSpan) nameSpan.textContent = crop.name;
    }
  });
  
  seedPicker.classList.add("is-visible");
});

// Seed Picker kapatma
document.querySelector(".seed-picker-backdrop").addEventListener("click", () => {
  seedPicker.classList.remove("is-visible");
});

populateSeedPicker();

// Günlük Giriş Entegrasyonu
function checkDailyLogin() {
  const loginInfo = dailyLogin.checkLogin();
  if (loginInfo) {
    const modal = document.querySelector("#daily-login-modal");
    modal.classList.add("is-visible");
    
    // Kartların durumlarını vurgula
    const dayCards = document.querySelectorAll(".daily-day-card");
    dayCards.forEach(card => {
      const day = parseInt(card.dataset.day);
      card.classList.remove("current", "claimed");
      if (day < loginInfo.streak) {
        card.classList.add("claimed");
      } else if (day === loginInfo.streak) {
        card.classList.add("current");
      }
    });

    const claimBtn = document.querySelector("#claim-daily-btn");
    claimBtn.onclick = (e) => {
      e.stopPropagation();
      const reward = dailyLogin.claimReward();
      if (reward) {
        if (reward.type === "gold") {
          ui.updateCoins(reward.amount);
          ui.showToast(`🎁 Günlük Giriş: +${reward.amount} 🪙!`);
        } else if (reward.type === "fertilizer") {
          ui.showToast(`🎁 Günlük Giriş: ${reward.amount} adet Gübre kazanıldı!`);
        } else if (reward.type === "seed") {
          inventory.add(reward.id, reward.amount);
          ui.showToast(`🎁 Günlük Giriş: ${reward.amount} adet Mısır tohumu kazanıldı!`);
        } else if (reward.type === "boost") {
          ui.showToast(`🎁 Günlük Giriş: Büyüme Hızlandırıcı kazanıldı!`);
        } else if (reward.type === "golden_chest") {
          ui.showToast(`🎁 Günlük Giriş: Altın Sandık kazanıldı!`);
        }
        
        character.addXP(10, "daily");
        modal.classList.remove("is-visible");
        updateMarketSellList();
        updateOrdersUI();
      }
    };
  }
}

// Hava Durumu ve Mevsim UI Güncellemeleri (initGame içinde bağlanıyor)

function updateWeatherUI() {
  if (!weatherSystem) return;
  const weather = weatherSystem.getCurrentWeather();
  document.querySelector("#weather-badge").textContent = `${weather.icon}`;
  document.querySelector("#weather-badge").title = `Hava Durumu: ${weather.name}`;
}

function updateSeasonUI() {
  if (!seasonSystem) return;
  const season = seasonSystem.getCurrentSeason();
  document.querySelector("#season-badge").textContent = `${season.icon}`;
  document.querySelector("#season-badge").title = `Mevsim: ${season.name}`;
}

// Sandık açılma ödülleri (initGame içinde bağlanıyor)

// Başlat Buton Etkileşimi
let started = false;
let zoomInterval = null;

function startZooming(factor) {
  if (zoomInterval) clearInterval(zoomInterval);
  zoomCamera(factor);
  zoomInterval = setInterval(() => {
    zoomCamera(factor);
  }, 80);
}

function stopZooming() {
  if (zoomInterval) {
    clearInterval(zoomInterval);
    zoomInterval = null;
  }
}

function zoomCamera(factor) {
  if (!sceneManager) return;
  const activeScene = sceneManager.activeScene;
  if (!activeScene || !activeScene.controls) return;
  const controls = activeScene.controls;
  const camera = activeScene.camera;
  const target = controls.target;
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const newDistance = offset.length() * factor;
  const clampedDistance = THREE.MathUtils.clamp(newDistance, controls.minDistance, controls.maxDistance);
  offset.normalize().multiplyScalar(clampedDistance);
  camera.position.copy(target).add(offset);
  controls.update();
}

startButton.addEventListener("click", (e) => {
  e.preventDefault();
  if (started) return;
  started = true;
  document.body.classList.add("is-running");
  
  if (sceneManager) {
    sceneManager.activeScene.resume();
  }
  
  if (performanceConfig && ui) {
    ui.showToast(`${performanceConfig.label} aktif!`);
  } else if (ui) {
    ui.showToast("Oyun Başlıyor…");
  }

  // Günlük girişi denetle
  setTimeout(checkDailyLogin, 1000);

  if (_migrationNotice && ui) {
    setTimeout(() => ui.showToast(_migrationNotice), 1500);
    _migrationNotice = null;
  }
});

// Event Bindings
window.addEventListener("resize", () => {
  if (sceneManager) {
    sceneManager.resize(window.innerWidth, window.innerHeight);
  }
  if (renderer) {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

// Zoom buton olayları
const zoomInBtn = document.querySelector("#zoom-in");
const zoomOutBtn = document.querySelector("#zoom-out");

zoomInBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(0.95); });
zoomInBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
zoomInBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
zoomInBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });

zoomOutBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(1.05); });
zoomOutBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
zoomOutBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
zoomOutBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });

// Reset/Taşıma butonu
document.querySelector("#reset-farm").addEventListener("click", (e) => {
  e.stopPropagation();
  if (sceneManager && sceneManager.activeSceneKey === "farm") {
    sceneManager.scenes.farm.farm.resetUnlockedPlots();
    sceneManager.scenes.farm.character.reset();
    sceneManager.scenes.farm.pet.reset();
    if (inventory) inventory.reset();
    if (orders) orders.reset();
    if (ui) ui.refillIfStuck();
    updateWarehouseUI();
    updateOrdersUI();
    if (ui) ui.showToast("Çiftlik sıfırlandı!");
  }
});



// Market Modal
const marketPanel = document.querySelector("#market-panel");
const openMarketBtn = document.querySelector("#open-market");
const closeMarketBtn = document.querySelector("#close-market");
const buyPlotBtn = document.querySelector("#buy-plot");

openMarketBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  updateMarketUI();
  marketPanel.classList.add("is-visible");
});

closeMarketBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  marketPanel.classList.remove("is-visible");
});

// Warehouse Modal
const warehousePanel = document.querySelector("#warehouse-panel");
const openWarehouseBtn = document.querySelector("#open-warehouse");
const closeWarehouseBtn = document.querySelector("#close-warehouse");

openWarehouseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  updateWarehouseUI();
  warehousePanel.classList.add("is-visible");
});

closeWarehouseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  warehousePanel.classList.remove("is-visible");
});

window.addEventListener("open-warehouse-panel", () => {
  updateWarehouseUI();
  warehousePanel.classList.add("is-visible");
});

buyPlotBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!sceneManager || !ui) return;
  const count = sceneManager.scenes.farm.farm.unlockedPlotsCount;
  const maxPlots = sceneManager.scenes.farm.farm.maxPlotsOfCurrentExpansion();
  if (count >= maxPlots) return;

  const price = 50 * (count - 1);
  if (ui.coins >= price) {
    ui.updateCoins(-price);
    const success = sceneManager.scenes.farm.farm.unlockPlot();
    if (success) {
      ui.showToast("Yeni arsa genişletildi!");
      updateMarketUI();
    }
  } else {
    ui.showToast("🪙 Yetersiz Altın!");
  }
});

const buyPetBtn = document.querySelector("#buy-pet");
buyPetBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!sceneManager || !ui) return;
  const petData = globalStorage.loadField("pet") || {};
  if (petData.purchased) return;
  
  const petCost = 150;
  if (ui.coins >= petCost) {
    ui.updateCoins(-petCost);
    
    globalStorage.saveField("pet", {
      purchased: true,
      friendshipLevel: 1,
      friendshipXP: 0
    });
    
    sceneManager.scenes.farm.pet.purchase();
    sceneManager.scenes.barn.shibaGroup.visible = true;

    ui.showToast("Shiba yoldaşınız açıldı! 🐕");
    updateMarketUI();
  } else {
    ui.showToast("🪙 Yetersiz Altın!");
  }
});

// Sipariş Paneli
const ordersPanel = document.querySelector("#orders-panel");
const openOrdersBtn = document.querySelector("#open-orders");
const closeOrdersBtn = document.querySelector("#close-orders");

openOrdersBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  updateOrdersUI();
  ordersPanel.classList.add("is-visible");
});

closeOrdersBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  ordersPanel.classList.remove("is-visible");
});

// Ayarlar Modalı Yönetimi
const settingsPanel = document.querySelector("#settings-modal");
const openSettingsBtn = document.querySelector("#open-settings-btn");
const closeSettingsBtn = document.querySelector("#close-settings");

openSettingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.add("is-visible");
});

closeSettingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.remove("is-visible");
});

const qualityBtns = document.querySelectorAll(".quality-btn");
qualityBtns.forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const quality = btn.dataset.quality;
    Performance.setOverride(quality);
  });
});

// Genişletme Modalı Yönetimi
const expandPanel = document.querySelector("#expand-modal");
const openExpandBtn = document.querySelector("#open-expand-btn");
const closeExpandBtn = document.querySelector("#close-expand");
const expandConfirmBtn = document.querySelector("#expand-confirm-btn");

openExpandBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  updateExpandUI();
  expandPanel.classList.add("is-visible");
});

closeExpandBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  expandPanel.classList.remove("is-visible");
});

function updateExpandUI() {
  const currentExpId = sceneManager.scenes.farm.farm.expansionId;
  const nextExpId = currentExpId + 1;
  const nextExp = FARM_EXPANSIONS.find(e => e.id === nextExpId);
  const infoLabel = document.querySelector("#expand-info-label");

  if (!nextExp) {
    infoLabel.textContent = "Çiftliğiniz Maksimum Genişliğe Ulaştı! 🎉";
    document.querySelector("#req-level-val").textContent = "-";
    document.querySelector("#req-gold-val").textContent = "-";
    document.querySelector("#req-level .req-status").textContent = "✓";
    document.querySelector("#req-level .req-status").style.color = "#4eb36a";
    document.querySelector("#req-gold .req-status").textContent = "✓";
    document.querySelector("#req-gold .req-status").style.color = "#4eb36a";
    expandConfirmBtn.disabled = true;
    return;
  }

  infoLabel.textContent = `Çiftliğinizi "${nextExp.label}" seviyesine büyütün:`;
  document.querySelector("#req-level-val").textContent = nextExp.requiredLevel;
  document.querySelector("#req-gold-val").textContent = nextExp.cost;

  const levelMet = character.level >= nextExp.requiredLevel;
  const goldMet = ui.coins >= nextExp.cost;

  // Seviye şartı görseli
  const reqLevelStatus = document.querySelector("#req-level .req-status");
  reqLevelStatus.textContent = levelMet ? "✓" : "✗";
  reqLevelStatus.style.color = levelMet ? "#4eb36a" : "#ff6b6b";

  // Altın şartı görseli
  const reqGoldStatus = document.querySelector("#req-gold .req-status");
  reqGoldStatus.textContent = goldMet ? "✓" : "✗";
  reqGoldStatus.style.color = goldMet ? "#4eb36a" : "#ff6b6b";

  expandConfirmBtn.disabled = !(levelMet && goldMet);
}

expandConfirmBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const currentExpId = sceneManager.scenes.farm.farm.expansionId;
  const nextExpId = currentExpId + 1;
  const nextExp = FARM_EXPANSIONS.find(e => e.id === nextExpId);

  if (nextExp && ui.coins >= nextExp.cost && character.level >= nextExp.requiredLevel) {
    ui.updateCoins(-nextExp.cost);
    
    // Sahneyi genişlet
    const success = sceneManager.scenes.farm.farm.expandFarm(nextExpId);
    if (success) {
      ui.showToast(`🏗️ Çiftlik genişletildi: ${nextExp.label}!`);
      sceneManager.scenes.farm.controls.update(); // Kamera kontrolünü yenile
    }
    
    expandPanel.classList.remove("is-visible");
  }
});

// UI Helper fonksiyonları
function updateMarketUI() {
  const count = sceneManager.scenes.farm.farm.unlockedPlotsCount;
  const maxPlots = sceneManager.scenes.farm.farm.maxPlotsOfCurrentExpansion();
  document.querySelector("#plot-expansion-stats").textContent = `Açılan: ${count}/${maxPlots}`;

  const price = 50 * (count - 1);
  buyPlotBtn.textContent = count >= maxPlots ? "Maksimum Parsel" : `Satın Al: ${price} 🪙`;
  buyPlotBtn.disabled = count >= maxPlots || ui.coins < price;

  const petData = globalStorage.loadField("pet") || {};
  const petStatusEl = document.querySelector("#pet-status");
  if (petData.purchased) {
    petStatusEl.textContent = `Sahip Olundu (Lv ${petData.friendshipLevel || 1})`;
    buyPetBtn.textContent = "Satın Alındı 🐕";
    buyPetBtn.disabled = true;
  } else {
    petStatusEl.textContent = "Satın Alınmadı";
    buyPetBtn.textContent = "Satın Al: 150 🪙";
    buyPetBtn.disabled = ui.coins < 150;
  }
}

function updateWarehouseUI() {
  const sellListEl = document.querySelector("#warehouse-sell-list");
  if (!sellListEl) return;
  sellListEl.innerHTML = "";
  
  const cropKeys = Object.keys(CROP_TYPES);
  const cropNames = {};
  cropKeys.forEach(k => {
    cropNames[k] = `${CROP_EMOJIS[k]} ${CROP_TYPES[k].name}`;
  });
  
  // Normal ekin satışları
  cropKeys.forEach((cropId) => {
    const count = inventory.getCount(cropId);
    const basePrice = CROP_TYPES[cropId].reward;
    
    const itemEl = document.createElement("div");
    itemEl.className = "sell-item";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">${cropNames[cropId]}</span>
        <span class="sell-count">Stok: ${count}</span>
      </div>
      <button class="sell-button" type="button" ${count <= 0 ? "disabled" : ""}>
        Sat: ${basePrice} 🪙
      </button>
    `;
    sellListEl.appendChild(itemEl);
    
    itemEl.querySelector(".sell-button").addEventListener("click", (e) => {
      e.stopPropagation();
      if (inventory.deduct(cropId, 1)) {
        ui.updateCoins(basePrice);
        ui.showToast(`1 adet ${CROP_TYPES[cropId].name} satıldı!`);
        character.addXP(3, "sell");
        updateWarehouseUI();
        updateOrdersUI();
      }
    });
  });

  // Altın ekin satışları (10x Fiyat)
  cropKeys.forEach((cropId) => {
    const goldenId = `golden_${cropId}`;
    const count = inventory.getCount(goldenId);
    if (count <= 0) return;

    const goldenPrice = CROP_TYPES[cropId].reward * 10;
    const itemEl = document.createElement("div");
    itemEl.className = "sell-item sell-item-golden";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">✨ Altın ${cropNames[cropId]}</span>
        <span class="sell-count">Stok: ${count}</span>
      </div>
      <button class="sell-button sell-button-golden" type="button">
        Sat: ${goldenPrice} 🪙
      </button>
    `;
    sellListEl.appendChild(itemEl);

    itemEl.querySelector(".sell-button-golden").addEventListener("click", (e) => {
      e.stopPropagation();
      if (inventory.deduct(goldenId, 1)) {
        ui.updateCoins(goldenPrice);
        ui.showToast(`✨ Altın ${CROP_TYPES[cropId].name} satıldı! +${goldenPrice} 🪙`);
        character.addXP(10, "sell_golden");
        updateWarehouseUI();
        updateOrdersUI();
      }
    });
  });
}

function updateOrdersUI() {
  const ordersListEl = document.querySelector("#orders-list");
  if (!ordersListEl) return;
  ordersListEl.innerHTML = "";
  
  orders.list.forEach((order) => {
    const itemEl = document.createElement("div");
    itemEl.className = "order-item";
    
    let reqsHtml = "";
    const canComplete = orders.canFulfill(order.id, inventory);
    const cropNames = {};
    Object.keys(CROP_TYPES).forEach(k => {
      cropNames[k] = `${CROP_EMOJIS[k]} ${CROP_TYPES[k].name}`;
    });
    
    order.reqs.forEach((req) => {
      const hasCount = inventory.getCount(req.cropId);
      const isMet = hasCount >= req.amount;
      reqsHtml += `
        <span class="order-req ${isMet ? "is-met" : "is-missing"}">
          ${cropNames[req.cropId] || req.cropId}: ${hasCount}/${req.amount}
        </span>
      `;
    });
    
    itemEl.innerHTML = `
      <div class="order-header">
        <span class="order-villager">👤 ${order.villager}</span>
        <span class="order-reward">🪙 ${order.reward}</span>
      </div>
      <div class="order-reqs">
        ${reqsHtml}
      </div>
      <button class="primary-button order-complete-btn" type="button" ${!canComplete ? "disabled" : ""}>
        Siparişi Tamamla
      </button>
    `;
    ordersListEl.appendChild(itemEl);
    
    itemEl.querySelector(".order-complete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const fulfilled = orders.fulfill(order.id, inventory);
      if (fulfilled) {
        ui.updateCoins(fulfilled.reward);
        ui.showToast(`Sipariş tamamlandı! +${fulfilled.reward} 🪙`);
        character.addXP(15, "order");
        updateOrdersUI();
        updateWarehouseUI();
      }
    });
  });
}

// Render Loop
let lastTime = performance.now();
function render() {
  if (!started || !sceneManager || !weatherSystem || !seasonSystem) {
    requestAnimationFrame(render);
    return;
  }

  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const realNow = Date.now();

  weatherSystem.update(realNow);
  seasonSystem.update(realNow);
  sceneManager.update(dt, realNow);

  sceneManager.render();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ── Authentication UI Controller ─────────────────────────────────
function setupAuthUI() {
  const tabLogin = document.querySelector("#tab-login");
  const tabRegister = document.querySelector("#tab-register");
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const authErrorMsg = document.querySelector("#auth-error-msg");
  
  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
    authErrorMsg.style.display = "none";
  });
  
  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.style.display = "flex";
    loginForm.style.display = "none";
    authErrorMsg.style.display = "none";
  });
  
  // Login Form Submission
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.querySelector("#login-email").value;
    const pass = document.querySelector("#login-password").value;
    
    showSpinner("Giriş yapılıyor...");
    try {
      await firebaseService.signInWithEmail(email, pass);
    } catch (err) {
      showError(translateAuthError(err.code));
    }
  });
  
  // Register Form Submission
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickname = document.querySelector("#register-nickname").value;
    const email = document.querySelector("#register-email").value;
    const pass = document.querySelector("#register-password").value;
    
    if (nickname.length < 3 || nickname.length > 15) {
      showError("Kullanıcı adı 3-15 karakter olmalıdır.");
      return;
    }
    
    showSpinner("Hesap oluşturuluyor...");
    try {
      await firebaseService.registerWithEmail(email, pass, nickname);
    } catch (err) {
      showError(translateAuthError(err.code));
    }
  });
  
  // Google Sign-In
  document.querySelector("#google-signin-btn").addEventListener("click", async () => {
    showSpinner("Google ile giriş yapılıyor...");
    try {
      await firebaseService.signInWithGoogle();
    } catch (err) {
      showError(translateAuthError(err.code));
    }
  });
  
  // Logout Triggering
  const handleLogout = async () => {
    try {
      await firebaseService.signOutUser();
    } catch (err) {
      console.error("[Auth] Çıkış yapılırken hata:", err);
    }
  };
  document.querySelector("#auth-signout-btn").addEventListener("click", handleLogout);
  document.querySelector("#settings-signout-btn").addEventListener("click", handleLogout);
  
  function showSpinner(text) {
    document.querySelector("#auth-forms").style.display = "none";
    const loading = document.querySelector("#auth-loading");
    loading.style.display = "flex";
    document.querySelector("#auth-loading-text").textContent = text;
    authErrorMsg.style.display = "none";
  }
  
  function showError(msg) {
    document.querySelector("#auth-loading").style.display = "none";
    document.querySelector("#auth-forms").style.display = "block";
    authErrorMsg.textContent = msg;
    authErrorMsg.style.display = "block";
  }
  
  function translateAuthError(code) {
    switch (code) {
      case "auth/invalid-email":
        return "Geçersiz e-posta adresi formatı.";
      case "auth/user-disabled":
        return "Bu kullanıcı hesabı askıya alınmış.";
      case "auth/user-not-found":
        return "Bu e-posta adresine kayıtlı kullanıcı bulunamadı.";
      case "auth/wrong-password":
        return "Hatalı şifre girdiniz.";
      case "auth/email-already-in-use":
        return "Bu e-posta adresi zaten kullanımda.";
      case "auth/weak-password":
        return "Şifreniz en az 6 karakter olmalıdır.";
      case "auth/popup-closed-by-user":
        return "Google penceresi kapatıldı.";
      case "auth/network-request-failed":
        return "Ağ hatası. Lütfen bağlantınızı kontrol edin.";
      default:
        return `Kimlik doğrulama hatası: ${code}`;
    }
  }
}

// ── Leaderboard UI Controller ────────────────────────────────────
function setupLeaderboardUI() {
  const panel = document.querySelector("#leaderboard-panel");
  const openBtn = document.querySelector("#open-leaderboard");
  const closeBtn = document.querySelector("#close-leaderboard");
  const listEl = document.querySelector("#leaderboard-list");
  
  openBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    panel.classList.add("is-visible");
    listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">Yükleniyor...</div>`;
    
    try {
      const records = await firebaseService.getLeaderboardData();
      listEl.innerHTML = "";
      
      if (records.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">Henüz skor kaydı yok.</div>`;
        return;
      }
      
      const currentUid = firebaseService.auth.currentUser ? firebaseService.auth.currentUser.uid : null;
      
      records.forEach((row, index) => {
        const rank = index + 1;
        let medal = rank.toString();
        if (rank === 1) medal = "🥇";
        else if (rank === 2) medal = "🥈";
        else if (rank === 3) medal = "🥉";
        
        const isCurrent = row.userId === currentUid;
        const rowEl = document.createElement("div");
        rowEl.className = `leaderboard-row ${isCurrent ? "current-user" : ""}`;
        rowEl.innerHTML = `
          <span class="leaderboard-rank">${medal}</span>
          <span class="leaderboard-name">${row.nickname || "Çiftçi"} ${isCurrent ? "(Sen)" : ""}</span>
          <span class="leaderboard-level">${row.level || 1}</span>
          <span class="leaderboard-score">${row.coins || 0}</span>
        `;
        listEl.appendChild(rowEl);
      });
    } catch (err) {
      console.error("[Leaderboard] Yükleme hatası:", err);
      listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: #ff6b6b;">Skorlar yüklenirken hata oluştu.</div>`;
    }
  });
  
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.remove("is-visible");
  });
}

// ── Firebase Initialization & Session Management ────────────────
setupAuthUI();

firebaseService.initFirebase((user, nickname) => {
  if (user) {
    // Oturum açık, oyunu ilklendir
    initGame(user, nickname);
  } else {
    // Oturum kapalı, login formunu göster ve bellek temizliği yap
    document.querySelector("#welcome-panel").style.display = "none";
    document.querySelector("#auth-loading").style.display = "none";
    document.querySelector("#auth-forms").style.display = "block";
    
    window.gameInMemoryCache = {};
    
    // Eğer oyun başladıktan sonra çıkış yapıldıysa sayfayı yenile
    if (started) {
      window.location.reload();
    }
  }
});
