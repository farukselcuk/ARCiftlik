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

// Göç / Bildirim kontrolü
let _migrationNotice = null;
globalStorage.onMigrationNotice = (oldVer, newVer) => {
  _migrationNotice = `Güncelleme geldi (v${oldVer} → v${newVer}), verileriniz güncellendi!`;
};
globalStorage.checkVersion();
farmStorage.checkVersion();
barnStorage.checkVersion();
marketStorage.checkVersion();
bakeryStorage.checkVersion();

// Paylaşımlı Global Modüller
const inventory = new Inventory(globalStorage);
const orders = new Orders(globalStorage);
const dailyLogin = new DailyLogin(globalStorage);
const weatherSystem = new WeatherSystem(globalStorage);
const seasonSystem = new SeasonSystem(globalStorage);

window.seasonSystem = seasonSystem;
window.weatherSystem = weatherSystem;
window.cycleStartTime = Date.now();

// UI Yönetimi
const ui = new GameUI(globalStorage);

// Scene Manager (Sahne yönetim sistemi)
const sceneManager = new SceneManager(renderer, globalStorage, farmStorage, barnStorage, marketStorage, bakeryStorage);
sceneManager.initAll();

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

  if (started) {
    ui.showToast(`${performanceConfig.label} aktif!`);
  }
}
initPerformance();

// Karakter Seviye / XP UI Senkronizasyonu
const character = sceneManager.scenes.farm.character; // Karakter referansı
character.loadXP();
updateXPUI(character.level, character.xp, false);

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
    ui.showToast(`🎉 Tebrikler! Seviye atladınız: Seviye ${level}`);
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
  updateMarketSellList();
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

  updateMarketSellList();
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

// Hava Durumu ve Mevsim UI Güncellemeleri
weatherSystem.onWeatherChange = (newWeather, info) => {
  ui.showToast(`Hava değişti: ${info.icon} ${info.name}`);
  updateWeatherUI();
};

seasonSystem.onSeasonChange = (oldSeason, newSeason) => {
  const info = SeasonSystem.SEASONS[newSeason];
  ui.showToast(`Mevsim değişti: ${info.icon} ${info.name}`);
  updateSeasonUI();
};

function updateWeatherUI() {
  const weather = weatherSystem.getCurrentWeather();
  document.querySelector("#weather-badge").textContent = `${weather.icon}`;
  document.querySelector("#weather-badge").title = `Hava Durumu: ${weather.name}`;
}

function updateSeasonUI() {
  const season = seasonSystem.getCurrentSeason();
  document.querySelector("#season-badge").textContent = `${season.icon}`;
  document.querySelector("#season-badge").title = `Mevsim: ${season.name}`;
}

// Sandık açılma ödülleri
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
  updateMarketSellList();
};

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
  
  if (performanceConfig) {
    ui.showToast(`${performanceConfig.label} aktif!`);
  } else {
    ui.showToast("Oyun Başlıyor…");
  }

  // Günlük girişi denetle
  setTimeout(checkDailyLogin, 1000);

  if (_migrationNotice) {
    setTimeout(() => ui.showToast(_migrationNotice), 1500);
    _migrationNotice = null;
  }
});

// Event Bindings
window.addEventListener("resize", () => {
  sceneManager.resize(window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  if (sceneManager.activeSceneKey === "farm") {
    sceneManager.scenes.farm.farm.resetUnlockedPlots();
    sceneManager.scenes.farm.character.reset();
    sceneManager.scenes.farm.pet.reset();
    inventory.reset();
    orders.reset();
    ui.refillIfStuck();
    updateMarketSellList();
    updateOrdersUI();
    ui.showToast("Çiftlik sıfırlandı!");
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
  updateMarketSellList();
  marketPanel.classList.add("is-visible");
});

closeMarketBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  marketPanel.classList.remove("is-visible");
});

buyPlotBtn.addEventListener("click", (e) => {
  e.stopPropagation();
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

function updateMarketSellList() {
  const sellListEl = document.querySelector("#market-sell-list");
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
        updateMarketSellList();
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
        updateMarketSellList();
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
        updateMarketSellList();
      }
    });
  });
}

// İlklendirme çağrıları
updateWeatherUI();
updateSeasonUI();

// Render Loop
let lastTime = performance.now();
function render() {
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
