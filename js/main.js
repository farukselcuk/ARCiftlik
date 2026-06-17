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
import { AudioSystem } from "./audio.js";
import { SocialSystem, generateFriendCode } from "./social.js";

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
let audioSystem = null;
let socialSystem = null;

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
  
  audioSystem = new AudioSystem();
  audioSystem.init();
  window.audioSystem = audioSystem;

  socialSystem = new SocialSystem(globalStorage, inventory);
  window.socialSystem = socialSystem;

  window.seasonSystem = seasonSystem;
  window.weatherSystem = weatherSystem;
  window.cycleStartTime = Date.now();

  // Sound settings initialization
  const toggleSoundBtn = document.querySelector("#toggle-sound-btn");
  const soundStatusLabel = document.querySelector("#sound-status-label");
  const soundVolumeSlider = document.querySelector("#sound-volume-slider");
  if (toggleSoundBtn && soundStatusLabel && soundVolumeSlider) {
    const updateSoundUI = () => {
      soundStatusLabel.textContent = audioSystem.enabled ? "Sesler Açık 🔊" : "Sesler Kapalı 🔇";
      toggleSoundBtn.textContent = audioSystem.enabled ? "Kapat" : "Aç";
      soundVolumeSlider.value = audioSystem.volume;
    };
    updateSoundUI();
    toggleSoundBtn.onclick = (e) => {
      e.stopPropagation();
      audioSystem.toggle();
      updateSoundUI();
      audioSystem.updateAmbience(weatherSystem.current);
    };
    soundVolumeSlider.oninput = (e) => {
      audioSystem.setVolume(parseFloat(e.target.value));
    };
  }

  // Display friend code
  const myFriendCodeVal = generateFriendCode(user.uid);
  const myFriendCodeEl = document.querySelector("#my-friend-code");
  if (myFriendCodeEl) {
    myFriendCodeEl.textContent = myFriendCodeVal;
  }
  
  // UI Yönetimi
  ui = new GameUI(globalStorage);
  window.ui = ui;
  
  // Scene Manager (Sahne yönetim sistemi)
  sceneManager = new SceneManager(renderer, globalStorage, farmStorage, barnStorage, marketStorage, bakeryStorage);
  sceneManager.initAll();

  // Fırın Atölyesi ilklendirmesi
  initBakeryUI();
  
  // Karakter Seviye / XP UI Senkronizasyonu
  character = sceneManager.scenes.farm.character; // Karakter referansı
  character.loadXP();
  updateXPUI(character.level, character.xp, false);
  
  // Sistem Listener'larını bağla
  weatherSystem.onWeatherChange = (newWeather, info) => {
    if (ui) ui.showToast(`Hava değişti: ${info.icon} ${info.name}`);
    updateWeatherUI();
    if (audioSystem) audioSystem.updateAmbience(newWeather);
  };
  
  if (audioSystem) {
    audioSystem.updateAmbience(weatherSystem.current);
  }
  
  seasonSystem.onSeasonChange = (oldSeason, newSeason) => {
    const info = SeasonSystem.SEASONS[newSeason];
    if (ui) ui.showToast(`Mevsim değişti: ${info.icon} ${info.name}`);
    updateSeasonUI();
  };
  
  sceneManager.scenes.farm.chestSystem.onChestOpened = (loot) => {
    if (loot.type === "gold") {
      ui.updateCoins(loot.amount);
      ui.showToast(`🎁 Sandıktan ${loot.amount} altın çıktı!`);
      if (audioSystem) audioSystem.playCoin();
    } else if (loot.type === "seed" && loot.cropId) {
      inventory.add(loot.cropId, loot.amount || 1);
      ui.showToast(`🎁 Sandıktan ${loot.cropId} tohumu çıktı!`);
      if (audioSystem) audioSystem.playPlant();
    } else if (loot.type === "fertilizer") {
      inventory.add("fertilizer_basic", 1);
      ui.showToast(`🎁 Sandıktan gübre çıktı! (1 adet Basit Gübre eklendi)`);
      if (audioSystem) audioSystem.playFertilize();
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
  
  // P2P Ticaret için gerçek zamanlı dinleyiciyi başlat
  firebaseService.initRealtimeSaveListener((remoteData) => {
    if (remoteData && remoteData["arciftlik:global:state"]) {
      try {
        const remoteGlobalState = JSON.parse(remoteData["arciftlik:global:state"]);
        const localGlobalStateRaw = window.gameInMemoryCache["arciftlik:global:state"];
        
        let shouldUpdateLocal = false;
        if (localGlobalStateRaw) {
          const localGlobalState = JSON.parse(localGlobalStateRaw);
          
          // Satış durumu kontrolü
          const remotePending = remoteGlobalState.pendingGold || 0;
          const localPending = localGlobalState.pendingGold || 0;
          
          if (remotePending > localPending) {
            localGlobalState.pendingGold = remotePending;
            shouldUpdateLocal = true;
            
            // Eğer ticaret UI açıksa güncelle (opsiyonel)
            if (ui && typeof ui.showToast === "function") {
               ui.showToast(`🎉 Pazarından bir ürün satıldı! +${remotePending - localPending} Altın kasada bekliyor.`);
               if (audioSystem && typeof audioSystem.playCoin === "function") audioSystem.playCoin();
            }
          }
          
          // Satılan ürünlerin senkronize edilmesi
          const remoteShopItems = remoteGlobalState.shopItems || [];
          const localShopItems = localGlobalState.shopItems || [];
          
          // Eğer uzaktaki tezgahta daha az ürün varsa, birisi satın almıştır
          if (remoteShopItems.length < localShopItems.length) {
            localGlobalState.shopItems = remoteShopItems;
            shouldUpdateLocal = true;
          }
          
          if (shouldUpdateLocal) {
            window.gameInMemoryCache["arciftlik:global:state"] = JSON.stringify(localGlobalState);
          }
        }
      } catch (e) {
        console.error("Gerçek zamanlı senkronizasyon hatası:", e);
      }
    }
  });
  
  // Satışlardan gelen ve toplanmayı bekleyen altınları kontrol et
  const pending = globalStorage.loadField("pendingGold") || 0;
  if (pending > 0) {
    const coins = globalStorage.loadField("coins") || 0;
    globalStorage.saveField("coins", coins + pending);
    globalStorage.saveField("pendingGold", 0);
    setTimeout(() => {
      ui.showToast(`🎉 Çevrimdışı satışlardan ${pending} Altın toplandı! 💰`);
      if (audioSystem) audioSystem.playCoin();
    }, 2500);
  }

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
  
  if (ui) {
    ui.renderSeedList(level);
  }
  
  // Fırın kilidi görsel senkronizasyonu (Seviye 3)
  const bakeryTab = document.querySelector("#tab-bakery");
  if (bakeryTab) {
    if (level >= 3) {
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
  if (audioSystem) audioSystem.playCoin();
});

window.addEventListener("spend-coins", (e) => {
  const { amount, callback } = e.detail;
  if (ui.coins >= amount) {
    ui.updateCoins(-amount);
    if (audioSystem) audioSystem.playCoin();
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
  
  if (audioSystem) {
    if (cropId === "oak_tree" || cropId === "pine_tree") {
      audioSystem.playChop();
    } else {
      audioSystem.playHarvest();
    }
  }

  if (cropId === "oak_tree" || cropId === "pine_tree") {
    const isOak = cropId === "oak_tree";
    const itemType = isOak ? "wood_oak" : "wood_pine";
    const woodCount = Math.floor(Math.random() * 3) + 3; // 3 to 5
    inventory.add(itemType, woodCount);
    ui.showToast(`${woodCount} adet ${isOak ? "Meşe Odunu" : "Çam Odunu"} elde ettin! 🪓`);
    character.addXP(12, "chop_tree");
  } else if (isGolden) {
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
  blueberry: "🫐",
  oak_tree: "🌳",
  pine_tree: "🌲"
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
    if (crop.isTree) return; // Tarlaya ağaç ekilmesini engelle
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
        
        // UI'daki seçimi de güncelle (böylece alttaki barda da seçili kalsın)
        if (ui) {
          ui.selectedCrop = cropId;
          ui.tool = "crop";
          ui.syncSelection();
        }
        
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

if (zoomInBtn) {
  zoomInBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(0.95); });
  zoomInBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
  zoomInBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
  zoomInBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });
}

if (zoomOutBtn) {
  zoomOutBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(1.05); });
  zoomOutBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
  zoomOutBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
  zoomOutBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });
}

// Reset/Taşıma butonu
const resetFarmBtn = document.querySelector("#reset-farm");
if (resetFarmBtn) {
  resetFarmBtn.addEventListener("click", (e) => {
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
}



// Market Modal
const marketPanel = document.querySelector("#market-panel");
const openMarketBtn = document.querySelector("#open-market");
const closeMarketBtn = document.querySelector("#close-market");
const buyPlotBtn = document.querySelector("#buy-plot");

openMarketBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  updateMarketUI();
  marketPanel.classList.add("is-visible");
});

closeMarketBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  marketPanel.classList.remove("is-visible");
});

// Warehouse Modal
const warehousePanel = document.querySelector("#warehouse-panel");
const openWarehouseBtn = document.querySelector("#open-warehouse");
const closeWarehouseBtn = document.querySelector("#close-warehouse");

openWarehouseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  updateWarehouseUI();
  warehousePanel.classList.add("is-visible");
});

closeWarehouseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  warehousePanel.classList.remove("is-visible");
});

window.addEventListener("open-warehouse-panel", () => {
  if (audioSystem) audioSystem.playPlace();
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
      if (audioSystem) audioSystem.playPlace();
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

    if (audioSystem) audioSystem.playPlace();
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
  if (audioSystem) audioSystem.playPlace();
  updateOrdersUI();
  ordersPanel.classList.add("is-visible");
});

closeOrdersBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  ordersPanel.classList.remove("is-visible");
});

// Ayarlar Modalı Yönetimi
const settingsPanel = document.querySelector("#settings-modal");
const openSettingsBtn = document.querySelector("#open-settings-btn");
const closeSettingsBtn = document.querySelector("#close-settings");

openSettingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  settingsPanel.classList.add("is-visible");
});

closeSettingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
  settingsPanel.classList.remove("is-visible");
});

const qualityBtns = document.querySelectorAll(".quality-btn");
qualityBtns.forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (audioSystem) audioSystem.playPlace();
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
  if (audioSystem) audioSystem.playPlace();
  updateExpandUI();
  expandPanel.classList.add("is-visible");
});

closeExpandBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (audioSystem) audioSystem.playPlace();
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

  // Gübre envanter ve buton durumları
  if (inventory) {
    const basicCount = inventory.getCount("fertilizer_basic");
    const superCount = inventory.getCount("fertilizer_super");
    const goldenCount = inventory.getCount("fertilizer_golden");
    
    const fBasicOwned = document.querySelector("#fertilizer-basic-owned");
    const fSuperOwned = document.querySelector("#fertilizer-super-owned");
    const fGoldenOwned = document.querySelector("#fertilizer-golden-owned");
    const fBasicBuy = document.querySelector("#buy-fertilizer-basic");
    const fSuperBuy = document.querySelector("#buy-fertilizer-super");
    const fGoldenBuy = document.querySelector("#buy-fertilizer-golden");

    if (fBasicOwned) fBasicOwned.textContent = `Sahip Olunan: ${basicCount}`;
    if (fSuperOwned) fSuperOwned.textContent = `Sahip Olunan: ${superCount}`;
    if (fGoldenOwned) fGoldenOwned.textContent = `Sahip Olunan: ${goldenCount}`;

    if (fBasicBuy) fBasicBuy.disabled = ui.coins < 20;
    if (fSuperBuy) fSuperBuy.disabled = ui.coins < 50;
    if (fGoldenBuy) fGoldenBuy.disabled = ui.coins < 120;
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

  // Ormancılık ve Mobilya Satışları
  const FORESTRY_ITEMS = {
    wood_oak: { name: "🪵 Meşe Odunu", price: 10 },
    wood_pine: { name: "🪵 Çam Odunu", price: 15 },
    apple: { name: "🍎 Elma", price: 25 },
    orange: { name: "🍊 Portakal", price: 30 },
    furniture_stool: { name: "🪑 Ahşap Tabure", price: 120 },
    furniture_table: { name: "☕ Ahşap Sehpa", price: 260 },
    furniture_cabinet: { name: "🚪 Ahşap Dolap", price: 580 }
  };

  Object.keys(FORESTRY_ITEMS).forEach((itemId) => {
    const count = inventory.getCount(itemId);
    if (count <= 0) return;
    const price = FORESTRY_ITEMS[itemId].price;
    const name = FORESTRY_ITEMS[itemId].name;
    
    const itemEl = document.createElement("div");
    itemEl.className = "sell-item";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">${name}</span>
        <span class="sell-count">Stok: ${count}</span>
      </div>
      <button class="sell-button" type="button">
        Sat: ${price} 🪙
      </button>
    `;
    sellListEl.appendChild(itemEl);
    
    itemEl.querySelector(".sell-button").addEventListener("click", (e) => {
      e.stopPropagation();
      if (inventory.deduct(itemId, 1)) {
        ui.updateCoins(price);
        ui.showToast(`1 adet ${name} satıldı!`);
        character.addXP(itemId.startsWith("furniture_") ? 15 : 2, "sell_wood_furniture");
        updateWarehouseUI();
      }
    });
  });

  // Fırın Ürünleri Satışları
  const BAKERY_SELL_ITEMS = {
    flour: { name: "📦 Paketli Un", price: 15 },
    bread: { name: "🍞 Taze Ekmek", price: 35 },
    strawberry_cake: { name: "🍰 Çilekli Kek", price: 80 },
    blueberry_pie: { name: "🥧 Mavi Yemiş Turtası", price: 120 },
    carrot_cake: { name: "🧁 Havuçlu Kek", price: 55 }
  };

  Object.keys(BAKERY_SELL_ITEMS).forEach((itemId) => {
    const count = inventory.getCount(itemId);
    if (count <= 0) return;
    const price = BAKERY_SELL_ITEMS[itemId].price;
    const name = BAKERY_SELL_ITEMS[itemId].name;
    
    const itemEl = document.createElement("div");
    itemEl.className = "sell-item sell-item-bakery";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">${name}</span>
        <span class="sell-count">Stok: ${count}</span>
      </div>
      <button class="sell-button" type="button" style="background: #e67e22;">
        Sat: ${price} 🪙
      </button>
    `;
    sellListEl.appendChild(itemEl);
    
    itemEl.querySelector(".sell-button").addEventListener("click", (e) => {
      e.stopPropagation();
      if (inventory.deduct(itemId, 1)) {
        ui.updateCoins(price);
        ui.showToast(`1 adet ${name} satıldı!`);
        character.addXP(8, "sell_bakery");
        updateWarehouseUI();
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


// ── GÜBRE SATIN ALMA VE UYGULAMA ENTEGRASYONU ────────────────────
document.querySelectorAll(".buy-fertilizer-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const type = btn.dataset.type;
    let cost = 20;
    if (type === "fertilizer_super") cost = 50;
    if (type === "fertilizer_golden") cost = 120;
    
    if (ui.coins >= cost) {
      ui.updateCoins(-cost);
      inventory.add(type, 1);
      const names = { fertilizer_basic: "Basit Gübre", fertilizer_super: "Süper Gübre", fertilizer_golden: "Altın Gübre" };
      ui.showToast(`1 adet ${names[type]} satın alındı!`);
      updateMarketUI();
    } else {
      ui.showToast("🪙 Yetersiz Altın!");
    }
  });
});

let activePlotIndexForFertilizer = null;
const fertilizerPicker = document.querySelector("#fertilizer-picker");

window.addEventListener("open-fertilizer-picker", (e) => {
  activePlotIndexForFertilizer = e.detail.plotIndex;
  
  // Envanter adetlerini güncelle
  const basicCountEl = document.querySelector("#picker-fert-basic-count");
  const superCountEl = document.querySelector("#picker-fert-super-count");
  const goldenCountEl = document.querySelector("#picker-fert-golden-count");
  
  if (basicCountEl) basicCountEl.textContent = `Adet: ${inventory.getCount("fertilizer_basic")}`;
  if (superCountEl) superCountEl.textContent = `Adet: ${inventory.getCount("fertilizer_super")}`;
  if (goldenCountEl) goldenCountEl.textContent = `Adet: ${inventory.getCount("fertilizer_golden")}`;
  
  fertilizerPicker.classList.add("is-visible");
});

document.querySelector("#fertilizer-picker .seed-picker-backdrop").addEventListener("click", () => {
  fertilizerPicker.classList.remove("is-visible");
});

document.querySelectorAll(".fert-option-card").forEach(card => {
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    const fertType = card.dataset.fertilizer;
    
    if (!inventory.has(fertType, 1)) {
      ui.showToast("Envanterinizde bu gübreden kalmadı!");
      return;
    }
    
    if (activePlotIndexForFertilizer !== null) {
      const scene = sceneManager.scenes.farm;
      const plot = scene.farm.plots[activePlotIndexForFertilizer];
      if (plot.fertilizer) {
        ui.showToast("Bu tarlaya zaten gübre uygulanmış!");
        fertilizerPicker.classList.remove("is-visible");
        return;
      }
      
      const success = scene.farm.applyFertilizer(activePlotIndexForFertilizer, fertType);
      if (success) {
        inventory.deduct(fertType, 1);
        const names = { fertilizer_basic: "Basit Gübre", fertilizer_super: "Süper Gübre", fertilizer_golden: "Altın Gübre" };
        ui.showToast(`${names[fertType]} uygulandı! 🧪`);
        if (audioSystem) audioSystem.playFertilize();
        scene.farm.updateFertilizerVisual(plot);
      }
      fertilizerPicker.classList.remove("is-visible");
      activePlotIndexForFertilizer = null;
    }
  });
});

// ── DEKORASYON (SÜSLEME) ENTEGRASYONU ───────────────────────────
const decorationsModal = document.querySelector("#decorations-modal");
const openDecorationsBtn = document.querySelector("#open-decorations");
const closeDecorationsBtn = document.querySelector("#close-decorations");
const toggleEditModeBtn = document.querySelector("#toggle-edit-mode-btn");

if (openDecorationsBtn && decorationsModal) {
  openDecorationsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    decorationsModal.classList.add("is-visible");
    updateDecorationsUI();
  });

  closeDecorationsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    decorationsModal.classList.remove("is-visible");
  });
}

function updateDecorationsUI() {
  const DECORATION_COSTS = {
    fence: 50, lantern: 100, bench: 150, well: 500, flower_bed: 80, scarecrow: 200, stone_path: 30,
    oak_sapling: 120, pine_sapling: 150, apple_sapling: 200, orange_sapling: 220
  };
  
  document.querySelectorAll(".buy-deco-btn").forEach(btn => {
    const type = btn.dataset.deco;
    if (type === "remove_tool") {
      btn.disabled = false;
    } else {
      const cost = DECORATION_COSTS[type] || 0;
      btn.disabled = ui.coins < cost;
    }
  });

  const isEdit = sceneManager.scenes.farm.editMode;
  if (toggleEditModeBtn) {
    toggleEditModeBtn.textContent = isEdit ? "Düzenleme Modundan Çık ✖" : "Düzenleme Moduna Gir 🛠️";
    toggleEditModeBtn.style.background = isEdit ? "#e94042" : "#3498db";
  }
}

if (toggleEditModeBtn) {
  toggleEditModeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const scene = sceneManager.scenes.farm;
    const nextEditMode = !scene.editMode;
    scene.setEditMode(nextEditMode, nextEditMode ? "fence" : null);
    
    updateDecorationsUI();
    if (nextEditMode) {
      decorationsModal.classList.remove("is-visible");
      ui.showToast("Düzenleme modu aktif! Kenarlardaki yeşil alanlara dokunarak yerleştirin/döndürün, Kaldır aleti ile kaldırın.");
    } else {
      ui.showToast("Düzenleme modundan çıkıldı.");
    }
  });
}

document.querySelectorAll(".buy-deco-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const type = btn.dataset.deco;
    const scene = sceneManager.scenes.farm;
    
    scene.setEditMode(true, type);
    updateDecorationsUI();
    decorationsModal.classList.remove("is-visible");
    if (type === "remove_tool") {
      ui.showToast("Kaldırma aleti aktif: Kaldırmak istediğiniz süslemeye dokunun.");
    } else {
      const names = {
        fence: "Ahşap Çit", lantern: "Bahçe Feneri", bench: "Ahşap Bank", well: "Taş Kuyu", flower_bed: "Çiçek Tarhı", scarecrow: "Korkuluk", stone_path: "Taş Yol",
        oak_sapling: "Meşe Fidanı", pine_sapling: "Çam Fidanı", apple_sapling: "Elma Fidanı", orange_sapling: "Portakal Fidanı"
      };
      ui.showToast(`Düzenleme modu aktif: ${names[type]} yerleştirmek için yeşil alanlara dokunun. Mevcut süslemeleri döndürmek için üstlerine dokunun.`);
    }
  });
});

// ── SOSYAL (ARKADAŞLIK) ENTEGRASYONU ────────────────────────────
const socialModal = document.querySelector("#social-modal");
const openSocialBtn = document.querySelector("#open-social");
const closeSocialBtn = document.querySelector("#close-social");
const addFriendBtn = document.querySelector("#add-friend-btn");
const addFriendCodeInput = document.querySelector("#add-friend-code-input");
const claimAllGiftsBtn = document.querySelector("#claim-all-gifts-btn");

if (openSocialBtn && socialModal) {
  openSocialBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    socialModal.classList.add("is-visible");
    await updateSocialModalUI();
  });

  closeSocialBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    socialModal.classList.remove("is-visible");
  });
}

async function updateSocialModalUI() {
  if (!socialSystem) return;

  const friendsListEl = document.querySelector("#friends-list");
  const incomingGiftsSection = document.querySelector("#incoming-gifts-section");
  const incomingGiftsList = document.querySelector("#incoming-gifts-list");

  // Gelen hediyeleri getir
  try {
    const gifts = await socialSystem.getIncomingGifts();
    if (gifts && gifts.length > 0) {
      if (incomingGiftsSection) incomingGiftsSection.style.display = "flex";
      if (incomingGiftsList) {
        incomingGiftsList.innerHTML = gifts.map(g => {
          let giftName = g.type;
          if (g.type === "fertilizer_basic") giftName = "🧪 Basit Gübre";
          else if (g.type === "fertilizer_super") giftName = "🧪⚡ Süper Gübre";
          else if (g.type === "fertilizer_golden") giftName = "✨🧪 Altın Gübre";
          else if (g.type === "coins_50") giftName = "🪙 50 Altın";
          return `<div style="padding: 4px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 2px;">
            <strong>${g.senderName}</strong> size <strong>${giftName}</strong> gönderdi!
          </div>`;
        }).join("");
      }
    } else {
      if (incomingGiftsSection) incomingGiftsSection.style.display = "none";
      if (incomingGiftsList) incomingGiftsList.innerHTML = "";
    }
  } catch (err) {
    console.error("Gelen hediyeler yüklenemedi:", err);
  }

  // Arkadaşlar listesini yükle
  try {
    if (friendsListEl) friendsListEl.innerHTML = `<div style="text-align: center; padding: 15px; color: rgba(255,255,255,0.5);">Yükleniyor...</div>`;
    const friends = await socialSystem.getFriendsList();
    if (friendsListEl) friendsListEl.innerHTML = "";

    if (friends.length === 0) {
      if (friendsListEl) {
        friendsListEl.innerHTML = `<div style="text-align: center; padding: 15px; color: rgba(255,255,255,0.5);">Henüz arkadaşınız yok. Üstteki kod ile arkadaş ekleyebilirsiniz!</div>`;
      }
      return;
    }

    friends.forEach(friend => {
      const itemEl = document.createElement("div");
      itemEl.className = "sell-item";
      itemEl.style.alignItems = "center";
      itemEl.innerHTML = `
        <div class="sell-info" style="text-align: left;">
          <span class="sell-name" style="font-size: 14px;">🏡 ${friend.nickname}</span>
          <span class="sell-count" style="font-size: 11px; opacity: 0.7;">Seviye ${friend.level}</span>
        </div>
        <button class="primary-button visit-friend-btn" data-uid="${friend.uid}" data-name="${friend.nickname}" style="width: auto; min-height: 32px; font-size: 12px; margin: 0; padding: 0 12px; background: #3498db;" type="button">
          Ziyaret Et 🚀
        </button>
      `;
      if (friendsListEl) friendsListEl.appendChild(itemEl);
    });

    document.querySelectorAll(".visit-friend-btn").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const friendUid = btn.dataset.uid;
        const friendName = btn.dataset.name;
        
        socialModal.classList.remove("is-visible");
        ui.showToast(`${friendName} çiftliğine gidiliyor...`);

        try {
          const userSnap = await firebaseService.loadOrCreateProfile(firebaseService.auth.currentUser);
          const myName = userSnap.nickname || "Misafir";
          const friendData = await socialSystem.visitFriendFarm(friendUid, myName);
          
          const scene = sceneManager.scenes.farm;
          scene.loadFriendData(friendData);
          
          const visitOverlay = document.querySelector("#visit-overlay");
          const visitOwnerName = document.querySelector("#visit-owner-name");
          if (visitOwnerName) visitOwnerName.textContent = friendName;
          
          if (visitOverlay) {
            visitOverlay.dataset.friendUid = friendUid;
            visitOverlay.dataset.friendName = friendName;
            visitOverlay.style.display = "block";
          }
          
        } catch (err) {
          console.error("Ziyaret hatası:", err);
          ui.showToast(`Çiftlik ziyaret edilemedi: ${err.message}`);
        }
      };
    });

  } catch (err) {
    console.error("Arkadaş listesi yüklenemedi:", err);
    if (friendsListEl) friendsListEl.innerHTML = `<div style="text-align: center; padding: 15px; color: #ff6b6b;">Yüklenirken hata oluştu!</div>`;
  }
}

if (addFriendBtn && addFriendCodeInput) {
  addFriendBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const code = addFriendCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      ui.showToast("Lütfen 6 haneli arkadaş kodunu girin.");
      return;
    }

    addFriendBtn.disabled = true;
    try {
      const friendInfo = await socialSystem.addFriend(code);
      ui.showToast(`👥 ${friendInfo.nickname} arkadaş olarak eklendi!`);
      addFriendCodeInput.value = "";
      await updateSocialModalUI();
    } catch (err) {
      ui.showToast(err.message);
    } finally {
      addFriendBtn.disabled = false;
    }
  });
}

if (claimAllGiftsBtn) {
  claimAllGiftsBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const claimed = await socialSystem.claimGifts();
      if (claimed && claimed.length > 0) {
        let coinsAdded = 0;
        const fertAdded = { fertilizer_basic: 0, fertilizer_super: 0, fertilizer_golden: 0 };
        
        claimed.forEach(gift => {
          if (gift.type === "coins_50") {
            coinsAdded += 50;
          } else if (fertAdded[gift.type] !== undefined) {
            fertAdded[gift.type] += 1;
          }
        });
        
        const parts = [];
        if (coinsAdded > 0) {
          ui.updateCoins(coinsAdded);
          parts.push(`🪙 ${coinsAdded} Altın`);
        }
        Object.keys(fertAdded).forEach(k => {
          if (fertAdded[k] > 0) {
            inventory.add(k, fertAdded[k]);
            const names = { fertilizer_basic: "Basit Gübre", fertilizer_super: "Süper Gübre", fertilizer_golden: "Altın Gübre" };
            parts.push(`${fertAdded[k]} adet ${names[k]}`);
          }
        });
        
        ui.showToast(`🎁 Hediyeler alındı! ${parts.join(", ")}`);
        await updateSocialModalUI();
        updateWarehouseUI();
      } else {
        ui.showToast("Alınacak hediye bulunamadı.");
      }
    } catch (err) {
      console.error("Hediyeler alınırken hata:", err);
      ui.showToast("Hediyeler alınamadı.");
    }
  });
}

// Ziyaret Overlay Buton Olayları
const visitOverlay = document.querySelector("#visit-overlay");
const visitHelpBtn = document.querySelector("#visit-help-btn");
const visitGiftBtn = document.querySelector("#visit-gift-btn");
const visitBackBtn = document.querySelector("#visit-back-btn");

if (visitBackBtn) {
  visitBackBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const scene = sceneManager.scenes.farm;
    scene.restoreMyFarm();
    if (visitOverlay) visitOverlay.style.display = "none";
    ui.showToast("Kendi çiftliğinize döndünüz. 🏡");
  });
}

if (visitHelpBtn) {
  visitHelpBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const friendUid = visitOverlay ? visitOverlay.dataset.friendUid : null;
    const friendName = visitOverlay ? visitOverlay.dataset.friendName : "";
    if (!friendUid) return;

    try {
      const userSnap = await firebaseService.loadOrCreateProfile(firebaseService.auth.currentUser);
      const myName = userSnap.nickname || "Arkadaş";
      const success = await socialSystem.helpFriend(friendUid, myName);
      if (success) {
        character.addXP(10, "help_friend");
        ui.showToast(`${friendName} çiftliğine yardım edildi! +10 XP 🤝`);
      }
    } catch (err) {
      ui.showToast(err.message);
    }
  });
}

const giftModal = document.querySelector("#gift-modal");
const closeGiftBtn = document.querySelector("#close-gift");

if (visitGiftBtn && giftModal) {
  visitGiftBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    giftModal.classList.add("is-visible");
  });
}

if (closeGiftBtn && giftModal) {
  closeGiftBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    giftModal.classList.remove("is-visible");
  });
}

document.querySelectorAll(".gift-option-btn").forEach(btn => {
  btn.onclick = async (e) => {
    e.stopPropagation();
    const giftType = btn.dataset.gift;
    const friendUid = visitOverlay ? visitOverlay.dataset.friendUid : null;
    const friendName = visitOverlay ? visitOverlay.dataset.friendName : "";
    if (!friendUid) return;

    try {
      if (giftType === "coins_50") {
        if (ui.coins < 50) {
          ui.showToast("🪙 Yetersiz Altın!");
          return;
        }
        ui.updateCoins(-50);
      }
      
      const userSnap = await firebaseService.loadOrCreateProfile(firebaseService.auth.currentUser);
      const myName = userSnap.nickname || "Arkadaş";
      await socialSystem.sendGift(friendUid, myName, giftType);
      ui.showToast(`🎁 ${friendName} arkadaşınıza hediye gönderildi!`);
      if (giftModal) giftModal.classList.remove("is-visible");
    } catch (err) {
      ui.showToast(err.message);
    }
  };
});

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
  if (typeof updateBakeryUI === "function") {
    updateBakeryUI();
  }

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

// ── MARANGOZ ATÖLYESİ & TİCARET POSTASI UI ENTEGRASYONU ─────────────

const openCarpenterBtn = document.querySelector("#open-carpenter-btn");
const closeCarpenterBtn = document.querySelector("#close-carpenter");
const carpenterModal = document.querySelector("#carpenter-modal");

if (openCarpenterBtn && carpenterModal) {
  openCarpenterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    carpenterModal.classList.add("is-visible");
    updateCarpenterUI();
  });
}

if (closeCarpenterBtn && carpenterModal) {
  closeCarpenterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    carpenterModal.classList.remove("is-visible");
  });
}

function updateCarpenterUI() {
  const oakCount = inventory.getCount("wood_oak");
  const pineCount = inventory.getCount("wood_pine");

  const oakCountEl = document.querySelector("#carpenter-oak-count");
  const pineCountEl = document.querySelector("#carpenter-pine-count");
  if (oakCountEl) oakCountEl.textContent = oakCount;
  if (pineCountEl) pineCountEl.textContent = pineCount;

  const craftStoolBtn = document.querySelector("#craft-stool-btn");
  if (craftStoolBtn) {
    craftStoolBtn.disabled = oakCount < 4;
  }

  const craftTableBtn = document.querySelector("#craft-table-btn");
  if (craftTableBtn) {
    craftTableBtn.disabled = pineCount < 6;
  }

  const craftCabinetBtn = document.querySelector("#craft-cabinet-btn");
  if (craftCabinetBtn) {
    craftCabinetBtn.disabled = oakCount < 10 || pineCount < 5;
  }
}

// Bind craft buttons
const craftStoolBtn = document.querySelector("#craft-stool-btn");
if (craftStoolBtn) {
  craftStoolBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (inventory.deduct("wood_oak", 4)) {
      inventory.add("furniture_stool", 1);
      ui.showToast("Ahşap Tabure üretildi! 🪑");
      if (audioSystem) audioSystem.playPlace();
      updateCarpenterUI();
      updateWarehouseUI();
    }
  });
}

const craftTableBtn = document.querySelector("#craft-table-btn");
if (craftTableBtn) {
  craftTableBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (inventory.deduct("wood_pine", 6)) {
      inventory.add("furniture_table", 1);
      ui.showToast("Ahşap Sehpa üretildi! ☕");
      if (audioSystem) audioSystem.playPlace();
      updateCarpenterUI();
      updateWarehouseUI();
    }
  });
}

const craftCabinetBtn = document.querySelector("#craft-cabinet-btn");
if (craftCabinetBtn) {
  craftCabinetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (inventory.has("wood_oak", 10) && inventory.has("wood_pine", 5)) {
      inventory.deduct("wood_oak", 10);
      inventory.deduct("wood_pine", 5);
      inventory.add("furniture_cabinet", 1);
      ui.showToast("Ahşap Dolap üretildi! 🚪");
      if (audioSystem) audioSystem.playPlace();
      updateCarpenterUI();
      updateWarehouseUI();
    }
  });
}

// Posta Kutusu Tıklama
window.addEventListener("mailbox-clicked", async () => {
  try {
    const claimed = await socialSystem.claimGifts();
    if (claimed && claimed.length > 0) {
      let coinsAdded = 0;
      const fertAdded = { fertilizer_basic: 0, fertilizer_super: 0, fertilizer_golden: 0 };
      
      claimed.forEach(gift => {
        if (gift.type === "coins_50") {
          coinsAdded += 50;
        } else if (fertAdded[gift.type] !== undefined) {
          fertAdded[gift.type] += 1;
        }
      });
      
      const parts = [];
      if (coinsAdded > 0) {
        ui.updateCoins(coinsAdded);
        parts.push(`🪙 ${coinsAdded} Altın`);
      }
      Object.keys(fertAdded).forEach(k => {
        if (fertAdded[k] > 0) {
          inventory.add(k, fertAdded[k]);
          const names = { fertilizer_basic: "Basit Gübre", fertilizer_super: "Süper Gübre", fertilizer_golden: "Altın Gübre" };
          parts.push(`${fertAdded[k]} adet ${names[k]}`);
        }
      });
      
      ui.showToast(`🎁 Posta kutusundan gelen hediyeler alındı! ${parts.join(", ")}`);
      if (audioSystem) audioSystem.playCoin();
      updateWarehouseUI();
      
      // Update mailbox visibility in scene
      if (sceneManager && sceneManager.scenes.farm) {
        sceneManager.scenes.farm.checkMailbox();
      }
    }
  } catch (err) {
    console.error("Mailbox claim error:", err);
    ui.showToast("Hediyeler alınırken hata oluştu.");
  }
});

// Ticaret Postası Tıklama
window.addEventListener("trading-post-clicked", () => {
  openTradingPostUI();
});

const tradingPostModal = document.querySelector("#trading-post-modal");
const closeTradingPostBtn = document.querySelector("#close-trading-post");
const tradingPostTitle = document.querySelector("#trading-post-title");
const tradingPostDesc = document.querySelector("#trading-post-desc");
const tradingPostOwnerView = document.querySelector("#trading-post-owner-view");
const pendingGoldValue = document.querySelector("#pending-gold-value");
const claimGoldBtn = document.querySelector("#claim-gold-btn");
const tradeListItemType = document.querySelector("#trade-list-item-type");
const tradeListAmount = document.querySelector("#trade-list-amount");
const tradeListPrice = document.querySelector("#trade-list-price");
const tradeListBtn = document.querySelector("#trade-list-btn");
const tradingPostItemsList = document.querySelector("#trading-post-items-list");
const tradingPostItemsHeader = document.querySelector("#trading-post-items-header");

if (closeTradingPostBtn && tradingPostModal) {
  closeTradingPostBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    tradingPostModal.classList.remove("is-visible");
  });
}

async function openTradingPostUI() {
  if (!tradingPostModal || !socialSystem) return;
  tradingPostModal.classList.add("is-visible");

  const farmScene = sceneManager.scenes.farm;
  const isVisiting = farmScene.isReadOnly;

  if (isVisiting) {
    tradingPostOwnerView.style.display = "none";
    const friendName = visitOverlay ? visitOverlay.dataset.friendName : "Arkadaş";
    tradingPostTitle.textContent = `🏪 ${friendName}'in Tezgahı`;
    tradingPostDesc.textContent = "Arkadaşınızın satışa çıkardığı ürünleri satın alabilirsiniz.";
    tradingPostItemsHeader.textContent = "Satıştaki Ürünler";
    
    await updateTradingPostItems(visitOverlay.dataset.friendUid);
  } else {
    tradingPostOwnerView.style.display = "flex";
    tradingPostTitle.textContent = "🏪 Ticaret Postası";
    tradingPostDesc.textContent = "Kendi ekinlerinizi veya gübrelerinizi satabilir, biriken altınlarınızı toplayabilirsiniz.";
    tradingPostItemsHeader.textContent = "Kendi Tezgahınız";

    const pending = globalStorage.loadField("pendingGold") || 0;
    pendingGoldValue.textContent = pending;
    claimGoldBtn.disabled = pending <= 0;

    populateTradeItemSelect();
    await updateTradingPostItems(socialSystem.myUid);
  }
}

function populateTradeItemSelect() {
  if (!tradeListItemType) return;
  tradeListItemType.innerHTML = "";

  const options = [];

  // Standard crops
  Object.keys(CROP_TYPES).forEach(k => {
    if (CROP_TYPES[k].isTree) return; // Ağaçları depo (tohum) listesinde gösterme
    const count = inventory.getCount(k);
    if (count > 0) {
      options.push({ id: k, name: `${CROP_EMOJIS[k] || "🌱"} ${CROP_TYPES[k].name} (Stok: ${count})` });
    }
    const gKey = `golden_${k}`;
    const gCount = inventory.getCount(gKey);
    if (gCount > 0) {
      options.push({ id: gKey, name: `✨ Altın ${CROP_TYPES[k].name} (Stok: ${gCount})` });
    }
  });

  // Fertilizers
  const ferts = {
    fertilizer_basic: "🧪 Basit Gübre",
    fertilizer_super: "🧪⚡ Süper Gübre",
    fertilizer_golden: "✨🧪 Altın Gübre"
  };
  Object.keys(ferts).forEach(k => {
    const count = inventory.getCount(k);
    if (count > 0) {
      options.push({ id: k, name: `${ferts[k]} (Stok: ${count})` });
    }
  });

  // Woods and Furniture
  const forestry = {
    wood_oak: "🪵 Meşe Odunu",
    wood_pine: "🪵 Çam Odunu",
    furniture_stool: "🪑 Ahşap Tabure",
    furniture_table: "☕ Ahşap Sehpa",
    furniture_cabinet: "🚪 Ahşap Dolap"
  };
  Object.keys(forestry).forEach(k => {
    const count = inventory.getCount(k);
    if (count > 0) {
      options.push({ id: k, name: `${forestry[k]} (Stok: ${count})` });
    }
  });

  // Bakery products
  const bakeryProducts = {
    flour: "📦 Paketli Un",
    bread: "🍞 Taze Ekmek",
    strawberry_cake: "🍰 Çilekli Kek",
    blueberry_pie: "🥧 Mavi Yemiş Turtası",
    carrot_cake: "🧁 Havuçlu Kek"
  };
  Object.keys(bakeryProducts).forEach(k => {
    const count = inventory.getCount(k);
    if (count > 0) {
      options.push({ id: k, name: `${bakeryProducts[k]} (Stok: ${count})` });
    }
  });

  if (options.length === 0) {
    tradeListItemType.innerHTML = `<option value="">Satacak ürün yok!</option>`;
    tradeListBtn.disabled = true;
  } else {
    options.forEach(opt => {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.name;
      tradeListItemType.appendChild(el);
    });
    tradeListBtn.disabled = false;
  }
}

async function updateTradingPostItems(uid) {
  if (!tradingPostItemsList) return;
  tradingPostItemsList.innerHTML = `<div style="text-align: center; padding: 15px; color: rgba(255,255,255,0.5);">Yükleniyor...</div>`;

  let items = [];
  const isOwner = uid === socialSystem.myUid;

  try {
    if (isOwner) {
      items = globalStorage.loadField("shopItems") || [];
    } else {
      const friendSaveRef = firebaseService.doc(firebaseService.db, "saves", uid);
      const snap = await firebaseService.getDoc(friendSaveRef);
      if (snap.exists()) {
        const data = snap.data();
        const globalStateKey = "arciftlik:global:state";
        if (data[globalStateKey]) {
          const state = JSON.parse(data[globalStateKey]);
          items = state.shopItems || [];
        }
      }
    }
  } catch (err) {
    console.error("Trading post items load error:", err);
    tradingPostItemsList.innerHTML = `<div style="text-align: center; padding: 15px; color: #ff6b6b;">Hata oluştu!</div>`;
    return;
  }

  tradingPostItemsList.innerHTML = "";

  if (items.length === 0) {
    tradingPostItemsList.innerHTML = `<div style="text-align: center; padding: 15px; color: rgba(255,255,255,0.5);">Tezgahta ürün bulunmuyor.</div>`;
    return;
  }

  const itemNames = {
    fertilizer_basic: "🧪 Basit Gübre",
    fertilizer_super: "🧪⚡ Süper Gübre",
    fertilizer_golden: "✨🧪 Altın Gübre",
    wood_oak: "🪵 Meşe Odunu",
    wood_pine: "🪵 Çam Odunu",
    furniture_stool: "🪑 Ahşap Tabure",
    furniture_table: "☕ Ahşap Sehpa",
    furniture_cabinet: "🚪 Ahşap Dolap",
    flour: "📦 Paketli Un",
    bread: "🍞 Taze Ekmek",
    strawberry_cake: "🍰 Çilekli Kek",
    blueberry_pie: "🥧 Mavi Yemiş Turtası",
    carrot_cake: "🧁 Havuçlu Kek"
  };

  items.forEach((item) => {
    let displayName = itemNames[item.itemType];
    if (!displayName) {
      if (item.itemType.startsWith("golden_")) {
        const base = item.itemType.replace("golden_", "");
        displayName = `✨ Altın ${CROP_TYPES[base]?.name || base}`;
      } else {
        displayName = `${CROP_EMOJIS[item.itemType] || "🌱"} ${CROP_TYPES[item.itemType]?.name || item.itemType}`;
      }
    }

    const itemEl = document.createElement("div");
    itemEl.className = "sell-item";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">${displayName}</span>
        <span class="sell-count">Adet: ${item.amount}</span>
      </div>
      <button class="sell-button trade-action-btn" type="button">
        ${isOwner ? "İptal Et" : `Satın Al: ${item.price} 🪙`}
      </button>
    `;
    tradingPostItemsList.appendChild(itemEl);

    const actionBtn = itemEl.querySelector(".trade-action-btn");
    actionBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      actionBtn.disabled = true;

      if (isOwner) {
        try {
          socialSystem.removeShopItem(item.id);
          ui.showToast("Ürün tezgahtan kaldırıldı ve depoya eklendi.");
          populateTradeItemSelect();
          updateWarehouseUI();
          await updateTradingPostItems(uid);
        } catch (err) {
          ui.showToast(err.message);
          actionBtn.disabled = false;
        }
      } else {
        try {
          const purchased = await socialSystem.buyShopItem(uid, item.id);
          ui.showToast(`1 adet ${displayName} satın alındı!`);
          if (audioSystem) audioSystem.playCoin();
          
          ui.updateCoins(0); // sync local UI
          updateWarehouseUI();
          await updateTradingPostItems(uid);
        } catch (err) {
          ui.showToast(err.message);
          actionBtn.disabled = false;
        }
      }
    });
  });
}

if (tradeListBtn) {
  tradeListBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const type = tradeListItemType.value;
    const amount = parseInt(tradeListAmount.value) || 0;
    const price = parseInt(tradeListPrice.value) || 0;

    if (!type) {
      ui.showToast("Lütfen bir ürün seçin.");
      return;
    }
    if (amount <= 0 || price <= 0) {
      ui.showToast("Miktar ve fiyat sıfırdan büyük olmalıdır.");
      return;
    }

    try {
      const success = socialSystem.listShopItem(type, amount, price);
      if (success) {
        ui.showToast(`${amount} adet ürün satışa çıkarıldı.`);
        tradeListAmount.value = "";
        tradeListPrice.value = "";
        populateTradeItemSelect();
        updateWarehouseUI();
        updateTradingPostItems(socialSystem.myUid);
      }
    } catch (err) {
      ui.showToast(err.message);
    }
  });
}

if (claimGoldBtn) {
  claimGoldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      const claimed = socialSystem.claimPendingGold();
      if (claimed > 0) {
        ui.showToast(`🎉 Satışlardan biriken ${claimed} Altın toplandı!`);
        if (audioSystem) audioSystem.playCoin();
        ui.updateCoins(0); // sync UI
        pendingGoldValue.textContent = "0";
        claimGoldBtn.disabled = true;
      }
    } catch (err) {
      ui.showToast(err.message);
    }
  });
}

// ── FIRIN ATÖLYESİ VE ÜRETİM LİMİTLERİ ──────────────────────────
const BAKERY_RECIPES = {
  flour: {
    id: "flour",
    name: "Paketli Un",
    duration: 15000,
    reqs: { wheat: 2 },
    rewardXP: 10,
    emoji: "📦"
  },
  bread: {
    id: "bread",
    name: "Taze Ekmek",
    duration: 30000,
    reqs: { flour: 2 },
    rewardXP: 20,
    emoji: "🍞"
  },
  strawberry_cake: {
    id: "strawberry_cake",
    name: "Çilekli Kek",
    duration: 60000,
    reqs: { flour: 2, strawberry: 4 },
    rewardXP: 45,
    emoji: "🍰"
  },
  blueberry_pie: {
    id: "blueberry_pie",
    name: "Mavi Yemiş Turtası",
    duration: 90000,
    reqs: { flour: 2, blueberry: 4 },
    rewardXP: 65,
    emoji: "🥧"
  },
  carrot_cake: {
    id: "carrot_cake",
    name: "Havuçlu Kek",
    duration: 45000,
    reqs: { flour: 2, carrot: 4 },
    rewardXP: 30,
    emoji: "🧁"
  }
};

let bakeryState = {
  activeRecipe: null,
  startTime: 0,
  duration: 0,
  isReady: false
};

function loadBakeryState() {
  const saved = bakeryStorage.loadField("state");
  if (saved && typeof saved === "object") {
    bakeryState = {
      activeRecipe: saved.activeRecipe || null,
      startTime: Number(saved.startTime) || 0,
      duration: Number(saved.duration) || 0,
      isReady: Boolean(saved.isReady)
    };
  }
}

function saveBakeryState() {
  bakeryStorage.saveField("state", bakeryState);
}

function initBakeryUI() {
  loadBakeryState();

  const bakeBtns = document.querySelectorAll(".bakery-bake-btn");
  bakeBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const recipeId = btn.dataset.recipe;
      bakeRecipe(recipeId);
    });
  });

  const collectBtn = document.querySelector("#bakery-collect-btn");
  if (collectBtn) {
    collectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      collectBakedItem();
    });
  }

  updateBakeryUI();
}

function bakeRecipe(recipeId) {
  if (bakeryState.activeRecipe) {
    ui.showToast("❌ Fırında şu an başka bir ürün pişiyor!");
    return;
  }

  const recipe = BAKERY_RECIPES[recipeId];
  if (!recipe) return;

  const canBake = Object.keys(recipe.reqs).every(itemId => {
    const reqAmount = recipe.reqs[itemId];
    return inventory.has(itemId, reqAmount);
  });

  if (!canBake) {
    ui.showToast("❌ Yetersiz malzeme!");
    return;
  }

  Object.keys(recipe.reqs).forEach(itemId => {
    const reqAmount = recipe.reqs[itemId];
    inventory.deduct(itemId, reqAmount);
  });

  bakeryState.activeRecipe = recipeId;
  bakeryState.startTime = Date.now();
  bakeryState.duration = recipe.duration;
  bakeryState.isReady = false;

  saveBakeryState();
  updateBakeryUI();
  updateWarehouseUI();

  if (audioSystem) audioSystem.playPlace();
  ui.showToast(`🔥 ${recipe.name} pişirilmeye başlandı!`);
}

function collectBakedItem() {
  if (!bakeryState.activeRecipe || !bakeryState.isReady) return;

  const recipe = BAKERY_RECIPES[bakeryState.activeRecipe];
  if (!recipe) return;

  inventory.add(bakeryState.activeRecipe, 1);
  character.addXP(recipe.rewardXP, "bake");

  ui.showToast(`🧺 1 adet taze ${recipe.name} aldın!`);
  if (audioSystem) audioSystem.playHarvest();

  bakeryState.activeRecipe = null;
  bakeryState.startTime = 0;
  bakeryState.duration = 0;
  bakeryState.isReady = false;

  saveBakeryState();
  updateBakeryUI();
  updateWarehouseUI();
}

function updateBakeryUI() {
  const statusEl = document.querySelector("#bakery-slot-status");
  const progressContainer = document.querySelector("#bakery-progress-container");
  const progressBar = document.querySelector("#bakery-progress-bar");
  const collectBtn = document.querySelector("#bakery-collect-btn");

  if (!statusEl || !progressContainer || !progressBar || !collectBtn) return;

  // Dinamik tarif gereksinimleri güncellemesi
  const INGREDIENT_NAMES = {
    wheat: "Buğday 🌾",
    carrot: "Havuç 🥕",
    strawberry: "Çilek 🍓",
    blueberry: "Yaban Mersini 🫐",
    flour: "Un 📦"
  };

  const bakeBtns = document.querySelectorAll(".bakery-bake-btn");
  bakeBtns.forEach(btn => {
    const recipeId = btn.dataset.recipe;
    const recipe = BAKERY_RECIPES[recipeId];
    if (recipe) {
      const reqsEl = document.querySelector(`.recipe-reqs[data-recipe="${recipeId}"]`);
      let canBake = true;
      let reqsTextParts = [];
      
      for (const [item, count] of Object.entries(recipe.reqs)) {
        const hasCount = inventory.getCount(item);
        const name = INGREDIENT_NAMES[item] || item;
        const color = hasCount >= count ? "#2ecc71" : "#e74c3c";
        if (hasCount < count) canBake = false;
        
        reqsTextParts.push(`<span style="color: ${color}">${name} (${hasCount}/${count})</span>`);
      }
      
      if (reqsEl) {
        reqsEl.innerHTML = `Gereken: ${reqsTextParts.join(", ")}`;
      }

      // Buton durumu
      if (!canBake || bakeryState.activeRecipe) {
        btn.style.filter = "grayscale(100%)";
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.disabled = true;
      } else {
        btn.style.filter = "none";
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.disabled = false;
      }
    }
  });


  if (!bakeryState.activeRecipe) {
    statusEl.textContent = "Fırın Boş 🧊";
    progressContainer.style.display = "none";
    collectBtn.style.display = "none";
  } else {
    const recipe = BAKERY_RECIPES[bakeryState.activeRecipe];
    if (bakeryState.isReady) {
      statusEl.textContent = `🎉 ${recipe.emoji} ${recipe.name} Hazır!`;
      progressContainer.style.display = "none";
      collectBtn.style.display = "block";
    } else {
      const elapsed = Date.now() - bakeryState.startTime;
      const progress = Math.min(1, elapsed / bakeryState.duration);
      const remainingSec = Math.max(0, Math.round((bakeryState.duration - elapsed) / 1000));
      
      statusEl.textContent = `🔥 ${recipe.emoji} ${recipe.name} Pişiyor (${remainingSec}s)`;
      progressContainer.style.display = "block";
      progressBar.style.width = `${progress * 100}%`;
      collectBtn.style.display = "none";

      if (progress >= 1) {
        bakeryState.isReady = true;
        saveBakeryState();
        updateBakeryUI();
      }
    }
  }
}

// Sahne değiştiğinde panel görünürlük kontrolü
document.addEventListener("scene-changed", (e) => {
  const scene = e.detail.scene;
  const bakeryPanel = document.querySelector("#bakery-panel");
  if (bakeryPanel) {
    bakeryPanel.style.display = scene === "bakery" ? "block" : "none";
  }
});
