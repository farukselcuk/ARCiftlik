import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Farm, FARM_EXPANSIONS } from "../farm.js";
import { Character } from "../character.js";
import { Pet } from "../pet.js";
import { ChestSystem } from "../chests.js";
import { SeasonSystem } from "../seasons.js";
import { WeatherSystem } from "../weather.js";
import { DayNightCycle } from "../daynight.js";
import { Input } from "../input.js";
import { CROP_TYPES, getStage, GOLDEN_CHANCE } from "../crops.js";
import { RainSystem, SnowSystem, LeafSystem } from "../particles.js";
import { createDecorationMesh, DECORATION_ZONES } from "../decorations.js";
import { FloatingTextManager } from "../floating-text.js";

export class FarmScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   * @param {GameStorage} farmStorage
   */
  constructor(renderer, globalStorage, farmStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;
    this.farmStorage = farmStorage;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
    this.controls = null;
    this.active = false;

    // Alt sistemler
    this.farm = new Farm(farmStorage);
    this.character = new Character(globalStorage);
    this.shibaPet = new Pet(globalStorage, "shiba");
    this.catPet = new Pet(globalStorage, "cat");
    this.pet = this.shibaPet;
    this.chestSystem = new ChestSystem(globalStorage);
    this.floatingTextManager = new FloatingTextManager(this.camera);

    this.raycaster = new THREE.Raycaster();
    this.ambientLight = null;
    this.sunLight = null;
    this.firefliesGroup = null;
    this.dayNightCycle = new DayNightCycle();
    this.leafSystem = null;
    this.groundMesh = null;
    this._lastSeasonForGround = null;

    this.harvestQueue = [];
    this.queuedPlots = new Set();
    this.dragSeedId = null;
    this.plantedThisDrag = new Set();

    this._inputCleanups = [];

    // Yeni Sosyal & Dekorasyon Durumları
    this.isReadOnly = false;
    this.editMode = false;
    this.selectedDecoId = null;
    this.indicatorsGroup = null;
  }

  init() {
    // Işıkları kur
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sunLight.position.set(1.2, 2.8, 1.6);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sunLight);

    // Fallback zemin
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a2e24,
        roughness: 0.95,
        transparent: true,
        opacity: 0.55
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    ground.name = "fallback-ground";
    this.groundMesh = ground;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(2.4, 18, 0x3a5c4a, 0x2a4638);
    gridHelper.position.y = -0.003;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.32;
    gridHelper.name = "fallback-grid";
    this.scene.add(gridHelper);

    // Grupları sahneye ekle
    this.farm.group.add(this.character.group);
    this.farm.group.add(this.shibaPet.group);
    this.farm.group.add(this.catPet.group);
    this.scene.add(this.farm.group);

    // Sandık sistemi ayarı
    this.chestSystem.setParentGroup(this.farm.group);

    // Ateş böceklerini kur
    this.setupFireflies();

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.08, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = true;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 4.0;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    // Parçacık sistemleri
    this.rainSystem = new RainSystem(this.scene);
    this.snowSystem = new SnowSystem(this.scene);
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    this.camera.position.set(0, 1.3, 1.8);
    this.camera.lookAt(0, 0.08, 0);
    this.controls.update();
    this.updateMaxZoomDistance();

    this.farm.setPreviewPlacement();

    // Create Mailbox & Trading Post
    this.createMailbox();
    this.createTradingPost();
    this.updateStaticMeshesPositions();
  }

  setupFireflies() {
    this.firefliesGroup = new THREE.Group();
    this.firefliesGroup.visible = false;
    
    const fireflyGeo = new THREE.SphereGeometry(0.008, 6, 4);
    const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xaaff55 });
    
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(fireflyGeo, fireflyMat);
      mesh.position.set(
        (Math.random() - 0.5) * 1.2,
        0.05 + Math.random() * 0.25,
        (Math.random() - 0.5) * 1.2
      );
      mesh.userData = {
        baseX: mesh.position.x,
        baseY: mesh.position.y,
        baseZ: mesh.position.z,
        seedX: Math.random() * 100,
        seedY: Math.random() * 100,
        seedZ: Math.random() * 100
      };
      this.firefliesGroup.add(mesh);
    }
    this.farm.group.add(this.firefliesGroup);
  }

  resume() {
    this.active = true;
    this.controls.enabled = true;
    this.bindInput();

    // Alt sistemleri yenile
    this.farm.load();
    this.shibaPet.purchased = this.shibaPet.load();
    this.shibaPet.group.visible = this.shibaPet.purchased;
    this.shibaPet.setSkin(this.shibaPet.activeSkin);

    this.catPet.purchased = this.catPet.load();
    this.catPet.group.visible = this.catPet.purchased;

    // Arka plan rengini güncelle
    document.body.className = "is-running no-camera has-farm day-time";

    this.checkMailbox();
  }

  pause() {
    this.active = false;
    this.controls.enabled = false;
    this.unbindInput();
  }

  bindInput() {
    this.unbindInput();

    // ⚠️ Ziyaret modunda ekim/hasat input'ları bağlanmaz
    if (this.isReadOnly) {
      this.bindReadOnlyInput();
      return;
    }

    // Unified Tapping (Tıklama)
    const cleanupTap = Input.onTap(this.renderer.domElement, (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.handleTapAt(point);
    });
    this._inputCleanups.push(cleanupTap);

    // Unified Dragging (Sürükleme ile ekim)
    const cleanupDrag = Input.onDrag(this.renderer.domElement, {
      onStart: (point) => {
        // ⚠️ Ziyaret modunda ekim engelle
        if (this.isReadOnly) return;

        const plot = this.getPlotAtPoint(point);
        const ui = window.ui;
        const activeSeedId = this.dragSeedId || (ui && ui.tool === "crop" ? ui.selectedCrop : null);
        
        if (plot && this.farm.isEmpty(plot.index)) {
          if (activeSeedId) {
            const crop = CROP_TYPES[activeSeedId];
            if (crop && ui && ui.coins < crop.cost) {
              this.dragSeedId = null;
              window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Yeterli altın yok! 🪙" } }));
              return;
            }
            
            this.dragSeedId = activeSeedId;
            this.plantedThisDrag.clear();
            this.plantPlot(plot.index, this.dragSeedId);
            this.plantedThisDrag.add(plot.index);
            this.controls.enabled = false; // Sürüklerken kamerayı döndürmeyi durdur
          } else {
            // Boş tarlaya tıklandıysa tohum seçiciyi aç
            window.dispatchEvent(new CustomEvent("open-seed-picker", { detail: { plotIndex: plot.index } }));
            this.controls.enabled = false;
          }
        }
      },
      onMove: (point) => {
        // ⚠️ Ziyaret modunda sürükleme ile ekim engelle
        if (this.isReadOnly) return;

        if (this.dragSeedId) {
          const plot = this.getPlotAtPoint(point);
          if (plot && this.farm.isEmpty(plot.index) && !this.plantedThisDrag.has(plot.index)) {
            const ui = window.ui;
            const crop = CROP_TYPES[this.dragSeedId];
            if (crop && ui && ui.coins < crop.cost) {
              this.dragSeedId = null; // Stop dragging if out of coins
              window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Yeterli altın yok! 🪙" } }));
              return;
            }
            this.plantPlot(plot.index, this.dragSeedId);
            this.plantedThisDrag.add(plot.index);
          }
        }
      },
      onEnd: () => {
        this.dragSeedId = null;
        this.plantedThisDrag.clear();
        this.controls.enabled = true; // Kamera dönüşünü serbest bırak
      }
    });
    this._inputCleanups.push(cleanupDrag);
  }

  /**
   * Ziyaret modunda sadece kamera hareketi ve ticaret postası tıklaması.
   * Ekim/hasat/gübre/dekorasyon etkileşimi ENGELLENIR.
   */
  bindReadOnlyInput() {
    this.unbindInput();

    const cleanupTap = Input.onTap(this.renderer.domElement, (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      const mouse = new THREE.Vector2(
        (point.x / rect.width) * 2 - 1,
        -(point.y / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(mouse, this.camera);

      // Ticaret postasına tıklanabilir (ziyaretçi de görebilir)
      if (this.tradingPostGroup) {
        const tradingPostHits = this.raycaster.intersectObjects(this.tradingPostGroup.children, true);
        if (tradingPostHits.length > 0) {
          window.dispatchEvent(new CustomEvent("trading-post-clicked"));
          return;
        }
      }

      // Diğer tüm tıklamalar bilgilendirme mesajı gösterir
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Arkadaş çiftliğindesiniz. Sadece izleyebilirsiniz! 👀" } }));
    });
    this._inputCleanups.push(cleanupTap);
  }

  unbindInput() {
    this._inputCleanups.forEach(c => c());
    this._inputCleanups = [];
  }

  getPlotAtPoint(point) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      (point.x / rect.width) * 2 - 1,
      -(point.y / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.farm.getPlotMeshes(), false);
    if (hits.length > 0) {
      const plotIndex = hits[0].object.userData.plotIndex;
      return this.farm.plots[plotIndex];
    }
    return null;
  }

  handleTapAt(point) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      (point.x / rect.width) * 2 - 1,
      -(point.y / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);

    // 1b. Ticaret postasına tıklandı mı? (Ziyaretçiler ve sahipler tıklayabilir)
    if (this.tradingPostGroup) {
      const tradingPostHits = this.raycaster.intersectObjects(this.tradingPostGroup.children, true);
      if (tradingPostHits.length > 0) {
        window.dispatchEvent(new CustomEvent("trading-post-clicked"));
        return;
      }
    }

    if (this.isReadOnly) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Arkadaş çiftliğindesiniz. Sadece izleyebilirsiniz!" } }));
      return;
    }

    // 1a. Posta kutusuna tıklandı mı?
    if (this.mailboxGroup && this.mailboxGroup.visible) {
      const mailboxHits = this.raycaster.intersectObjects(this.mailboxGroup.children, true);
      if (mailboxHits.length > 0) {
        window.dispatchEvent(new CustomEvent("mailbox-clicked"));
        return;
      }
    }

    // 0. Düzenleme modu tıklamaları
    if (this.editMode && this.indicatorsGroup) {
      const hits = this.raycaster.intersectObjects(this.indicatorsGroup.children, true);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const col = hitObj.userData.col;
        const row = hitObj.userData.row;
        const isOccupied = hitObj.userData.isOccupied;
        
        if (isOccupied) {
          if (this.selectedDecoId === "remove_tool") {
            const success = this.farm.removeDecorationAt(col, row);
            if (success) {
              window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Süsleme kaldırıldı! 🗑️" } }));
              if (window.audioSystem) window.audioSystem.playPlace();
              this.setEditMode(true, this.selectedDecoId); // Yenile
            }
          } else {
            const success = this.farm.rotateDecorationAt(col, row);
            if (success) {
              window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Süsleme döndürüldü! ↻" } }));
              if (window.audioSystem) window.audioSystem.playPlace();
              this.setEditMode(true, this.selectedDecoId); // Yenile
            }
          }
        } else if (this.selectedDecoId && this.selectedDecoId !== "remove_tool") {
          const DECORATION_COSTS = {
            fence: 50, lantern: 100, bench: 150, well: 500, flower_bed: 80, scarecrow: 200, stone_path: 30,
            oak_sapling: 120, pine_sapling: 150, apple_sapling: 200, orange_sapling: 220
          };
          const cost = DECORATION_COSTS[this.selectedDecoId] || 0;
          
          window.dispatchEvent(new CustomEvent("spend-coins", {
            detail: {
              amount: cost,
              callback: (success) => {
                if (success) {
                  const placed = this.farm.addDecoration(this.selectedDecoId, col, row, 0);
                  if (placed) {
                    window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Süsleme yerleştirildi! ✨" } }));
                    if (window.audioSystem) window.audioSystem.playPlace();
                    this.setEditMode(true, this.selectedDecoId); // Yenile
                  }
                }
              }
            }
          }));
        }
        return;
      }
    }

    // 1. Shiba köpeğine tıklandı mı?
    if (this.shibaPet.purchased) {
      const petHits = this.raycaster.intersectObjects(this.shibaPet.group.children, true);
      if (petHits.length > 0) {
        if (this.shibaPet.hasCoinBubble) {
          if (this.shibaPet.collectCoin()) {
            window.dispatchEvent(new CustomEvent("coins-reward", { detail: { amount: 15 } }));
            window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Shiba bir altın buldu! +15 🪙" } }));
          }
        } else {
          this.interactWithPet(this.shibaPet);
        }
        return;
      }
    }

    // 1.5 Kedi yoldaşa tıklandı mı?
    if (this.catPet.purchased) {
      const catHits = this.raycaster.intersectObjects(this.catPet.group.children, true);
      if (catHits.length > 0) {
        if (this.catPet.hasCoinBubble) {
          if (this.catPet.collectCoin()) {
            window.dispatchEvent(new CustomEvent("coins-reward", { detail: { amount: 15 } }));
            window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Kedi bir altın buldu! +15 🪙" } }));
          }
        } else {
          this.interactWithPet(this.catPet);
        }
        return;
      }
    }

    // 2. Sandık tıklandı mı?
    const chestId = this.chestSystem.checkHit(this.raycaster);
    if (chestId) {
      this.chestSystem.open(chestId);
      return;
    }

    // 2.5 Dekorasyonlara tıklandı mı?
    const decoHits = this.raycaster.intersectObjects(this.farm.decorationMeshes, true);
    if (decoHits.length > 0) {
      let clickedMesh = decoHits[0].object;
      while (clickedMesh && !clickedMesh.userData.hasOwnProperty("decorationIndex")) {
        clickedMesh = clickedMesh.parent;
      }
      if (clickedMesh) {
        const decoIndex = clickedMesh.userData.decorationIndex;
        const deco = this.farm.decorations[decoIndex];
        if (deco && (deco.id === "oak_sapling" || deco.id === "pine_sapling" || deco.id === "apple_sapling" || deco.id === "orange_sapling")) {
          this.interactWithTree(decoIndex);
          return;
        }
      }
    }

    // 3. Tarla tıklandı mı?
    const hits = this.raycaster.intersectObjects(this.farm.getPlotMeshes(), false);
    if (hits.length > 0) {
      const plotIndex = hits[0].object.userData.plotIndex;
      this.interactWithPlot(plotIndex);
    }
  }

  interactWithPet(pet) {
    // ⚠️ Ziyaret modunda pet etkileşimi engelle
    if (this.isReadOnly) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Arkadaş çiftliğinde evcil hayvanlar beslenemez! 🚫" } }));
      return;
    }

    const today = new Date().toDateString();
    
    // Günlük reset
    if (pet._lastFeedDate !== today) {
      pet._todayFeeds = 0;
      pet._lastFeedDate = today;
    }

    const petName = pet.petType === "shiba" ? "Shiba" : "Kedi";

    // Günlük besleme limiti kontrolü (Maks 3)
    if (pet._todayFeeds >= 3) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🍖 ${petName} bugün yeterince beslendi! Yarın tekrar gelin 🐾` } }));
      return;
    }

    // Envanterde mama var mı kontrolü
    if (!window.inventory || !window.inventory.has("pet_food", 1)) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "🍖 Yeterli evcil hayvan maması yok! Seyyar Satıcı'dan mama alabilirsiniz." } }));
      return;
    }

    // Mama düş, dostluk artır
    window.inventory.deduct("pet_food", 1);
    pet._todayFeeds += 1;
    pet.friendshipXP += 20;
    
    // Seviye atlama kontrolü (her 100 XP'de 1 seviye)
    const nextLevelXP = pet.friendshipLevel * 100;
    let leveledUp = false;
    if (pet.friendshipXP >= nextLevelXP) {
      pet.friendshipXP -= nextLevelXP;
      pet.friendshipLevel += 1;
      leveledUp = true;
    }

    pet.save();

    if (leveledUp) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🎉 ${petName} Dostluk Seviyesi Atladı! (Seviye ${pet.friendshipLevel}) 🐾` } }));
      if (window.audioSystem) window.audioSystem.playPlace();
    } else {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🍖 ${petName}'yi beslediniz! Dostluk +20 XP (${pet.friendshipXP}/${nextLevelXP}) [Bugün: ${pet._todayFeeds}/3]` } }));
      if (window.audioSystem) window.audioSystem.playPlant();
    }
  }

  async interactWithTree(decoIndex) {
    // ⚠️ Ziyaret modunda ağaç etkileşimi engelle
    if (this.isReadOnly) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Arkadaş çiftliğinde ağaçlarla etkileşim yapılamaz!" } }));
      return;
    }
    if (this.character.busy) return;

    const deco = this.farm.decorations[decoIndex];
    if (!deco) return;

    const isFruitTree = (deco.id === "apple_sapling" || deco.id === "orange_sapling");
    const growTime = (deco.id === "oak_sapling") ? 240000 : ((deco.id === "pine_sapling") ? 360000 : 300000);
    const elapsed = Date.now() - (deco.plantedAt || Date.now());
    const progress = Math.min(1, elapsed / growTime);
    const isReady = progress >= 1;

    const name = deco.id === "oak_sapling" ? "Meşe Fidanı" :
                 deco.id === "pine_sapling" ? "Çam Fidanı" :
                 deco.id === "apple_sapling" ? "Elma Fidanı" : "Portakal Fidanı";

    if (!isReady) {
      const percent = Math.round(progress * 100);
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🌳 ${name} %${percent} büyüdü. Büyümesi bekleniyor...` } }));
      return;
    }

    this.character.busy = true;
    const targetPos = this.farm.getDecorationPosition(deco.col, deco.row);
    targetPos.z += 0.08;

    try {
      await this.character.walkTo(targetPos);
      this.character.group.lookAt(targetPos.x, 0, targetPos.z - 0.08);

      if (isFruitTree) {
        if (deco.hasFruit) {
          if (window.audioSystem) window.audioSystem.playHarvest();
          await this.character.playHarvest();

          const count = Math.floor(Math.random() * 3) + 3; // 3 to 5 fruits
          const fruitType = deco.id === "apple_sapling" ? "apple" : "orange";
          
          if (window.inventory) {
            window.inventory.add(fruitType, count);
          }

          deco.hasFruit = false;
          deco.lastHarvestedAt = Date.now();
          this.farm.refreshDecorationMesh(decoIndex, 3, false);
          this.farm.saveDecorations();

          window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 8, source: "harvest_fruit" } }));
          window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🍎 ${count} adet ${fruitType === "apple" ? "Elma" : "Portakal"} topladın!` } }));

          if (window.updateWarehouseUI) window.updateWarehouseUI();
        } else {
          const fruitCooldown = 60000;
          const timeElapsed = Date.now() - (deco.lastHarvestedAt || Date.now());
          const remainingSec = Math.max(0, Math.round((fruitCooldown - timeElapsed) / 1000));
          window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🌳 Ağacın tekrar meyve vermesine ${remainingSec} saniye var.` } }));
        }
      } else {
        if (window.audioSystem) window.audioSystem.playChop();
        await this.character.playHarvest();

        const isOak = deco.id === "oak_sapling";
        const itemType = isOak ? "wood_oak" : "wood_pine";
        const woodCount = Math.floor(Math.random() * 3) + 3;

        this.farm.removeDecorationAt(deco.col, deco.row);

        if (window.inventory) {
          window.inventory.add(itemType, woodCount);
        }

        window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 15, source: "chop_tree" } }));
        window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🪓 ${woodCount} adet ${isOak ? "Meşe Odunu" : "Çam Odunu"} elde ettin!` } }));

        if (window.updateWarehouseUI) window.updateWarehouseUI();
        if (window.updateOrdersUI) window.updateOrdersUI();
      }
    } catch (err) {
      console.error("Tree interaction failed:", err);
    } finally {
      this.character.busy = false;
    }
  }

  interactWithPlot(plotIndex) {
    if (this.farm.isLocked(plotIndex)) {
      window.dispatchEvent(new CustomEvent("open-market-panel"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Plot is locked! Open market to expand." } }));
      return;
    }

    if (this.farm.isReadyToHarvest(plotIndex)) {
      if (this.queuedPlots.has(plotIndex)) {
        window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Already in harvest queue!" } }));
        return;
      }
      this.queuedPlots.add(plotIndex);
      this.harvestQueue.push(plotIndex);
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Added to harvest queue!" } }));
      this.processHarvestQueue();
      return;
    }

    // Alet kontrolü (Sulama)
    const activeTool = window.activeTool || "crop";
    if (activeTool === "water") {
      const watered = this.farm.water(plotIndex);
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: watered ? "Watered! 💧" : this.farm.describe(plotIndex) } }));
      return;
    }

    // Ekim kontrolü
    if (this.farm.isEmpty(plotIndex)) {
      window.dispatchEvent(new CustomEvent("open-seed-picker", { detail: { plotIndex } }));
    } else {
      // Ekili ama olgunlaşmamış -> gübre uygulama modalı
      window.dispatchEvent(new CustomEvent("open-fertilizer-picker", { detail: { plotIndex } }));
    }
  }

  plantPlot(plotIndex, cropId) {
    // ⚠️ KRİTİK GÜVENLİK KONTROLÜ — ziyaret modunda ekim engelle
    if (this.isReadOnly) {
      console.warn('Ziyaret modunda ekim engellendi');
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Arkadaş çiftliğinde ekim yapılamaz!" } }));
      return false;
    }

    const hasSeedInInventory = window.inventory && window.inventory.getCount(cropId) > 0;

    // Mevsim ekim kısıtlaması (Envanterde tohum varsa bunu pas geçebiliriz, seyyar satıcı açıklamasına uygun)
    if (!hasSeedInInventory) {
      const seasonSystem = window.seasonSystem;
      if (seasonSystem && !seasonSystem.canPlant(cropId)) {
        const season = seasonSystem.getCurrentSeason();
        window.dispatchEvent(new CustomEvent("toast", { detail: { text: `❌ ${season.icon} ${season.name} mevsiminde bu ürün ekilemez!` } }));
        return false;
      }
    }

    // Envanterde tohum varsa doğrudan envanterden ek
    if (hasSeedInInventory) {
      if (window.inventory.deduct(cropId, 1)) {
        const planted = this.farm.plant(plotIndex, cropId);
        if (planted) {
          window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🌱 ${planted.name} envanterden ekildi! (Kalan: ${window.inventory.getCount(cropId)})` } }));
          window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 5, source: "plant" } }));
          if (window.updateWarehouseUI) window.updateWarehouseUI();
        }
        return true;
      }
    }

    // Coin kontrolü
    const crop = CROP_TYPES[cropId];
    if (!crop) return false;

    const ui = window.ui;
    if (ui && ui.coins < crop.cost) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Yeterli altın yok! 🪙" } }));
      return false;
    }

    // Event üzerinden main'e coin harcaması yaptır
    const event = new CustomEvent("spend-coins", {
      detail: {
        amount: crop.cost,
        callback: (success) => {
          if (success) {
            const planted = this.farm.plant(plotIndex, cropId);
            if (planted) {
              window.dispatchEvent(new CustomEvent("toast", { detail: { text: `${planted.name} ekildi 🌱` } }));
              window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 5, source: "plant" } }));
            }
          }
        }
      }
    });
    window.dispatchEvent(event);
  }

  async processHarvestQueue() {
    if (this.character.busy || this.harvestQueue.length === 0) return;

    const plotIndex = this.harvestQueue.shift();

    if (!this.farm.isReadyToHarvest(plotIndex)) {
      this.queuedPlots.delete(plotIndex);
      this.processHarvestQueue();
      return;
    }

    const plot = this.farm.plots[plotIndex];
    const targetPos = plot.group.position.clone();
    targetPos.z += 0.08;

    try {
      await this.character.walkTo(targetPos);
      this.character.group.lookAt(plot.group.position.x, 0, plot.group.position.z);
      await this.character.playHarvest();

      const result = this.farm.harvest(plotIndex);
      if (result) {
        const { crop, fertilizer, isWithered } = result;
        
        if (isWithered) {
          window.dispatchEvent(new CustomEvent("crop-withered", {
            detail: { cropId: crop.id, name: crop.name }
          }));
        } else {
          // Altın ürün şansı GOLDEN_CHANCE, Altın Gübre varsa %100!
          const isGolden = (fertilizer === "fertilizer_golden") || (Math.random() < GOLDEN_CHANCE);
          
          const plotPos = this.farm.plots[plotIndex].group.position.clone();
          this.floatingTextManager.show(`+${crop.reward}`, plotPos, isGolden ? "#ffd700" : "#4CAF50");

          window.dispatchEvent(new CustomEvent("crop-harvested", {
            detail: { cropId: crop.id, name: crop.name, isGolden, plotPos }
          }));
        }
      }
    } catch (err) {
      console.error("Harvesting failed:", err);
    } finally {
      this.queuedPlots.delete(plotIndex);
      this.processHarvestQueue();
    }
  }

  update(dt, realNow) {
    if (this.controls) this.controls.update();

    // Büyüme çarpanlarını aktar
    if (window.weatherSystem) {
      this.farm.weatherGrowMultiplier = window.weatherSystem.getGrowMultiplier();
    }
    if (window.seasonSystem) {
      this.farm.seasonGrowMultiplier = window.seasonSystem.getGrowMultiplier();
    }

    const currentS = window.seasonSystem ? window.seasonSystem.current : "spring";

    // Yağmur / Kar / Yaprak parçacıkları
    if (window.weatherSystem && this.rainSystem && this.snowSystem) {
      const currentW = window.weatherSystem.current;
      
      if (currentW === "rainy" || currentW === "storm") {
        this.rainSystem.start();
        this.snowSystem.stop();
        if (this.leafSystem) this.leafSystem.stop();
      } else if (currentS === "winter") {
        this.snowSystem.start();
        this.rainSystem.stop();
        if (this.leafSystem) this.leafSystem.stop();
      } else if (currentS === "autumn") {
        if (this.leafSystem) this.leafSystem.start();
        this.rainSystem.stop();
        this.snowSystem.stop();
      } else {
        this.rainSystem.stop();
        this.snowSystem.stop();
        if (this.leafSystem) this.leafSystem.stop();
      }

      this.rainSystem.update(dt);
      this.snowSystem.update(dt);
      if (this.leafSystem) this.leafSystem.update(dt);
    }

    // Mevsime göre zemin rengini güncelle
    this.updateSeasonalGround(currentS);

    this.farm.update(realNow, this.camera);
    if (!this.isReadOnly) {
      this.character.update(dt);
      this.shibaPet.update(dt);
      this.catPet.update(dt);
      this.chestSystem.update(realNow);
      if (this.floatingTextManager) this.floatingTextManager.update();
    }

    // DayNightCycle güncelle (gerçek saat bazlı)
    this.dayNightCycle.update(this.ambientLight, this.sunLight, this.firefliesGroup, realNow);
  }

  // ── DEKORASYON & SOSYAL METODLARI ──────────────────────────────

  setEditMode(active, decoId = null) {
    this.editMode = active;
    this.selectedDecoId = decoId;
    
    if (this.indicatorsGroup) {
      this.scene.remove(this.indicatorsGroup);
      this.indicatorsGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.indicatorsGroup = null;
    }

    if (active) {
      this.indicatorsGroup = new THREE.Group();
      const valids = DECORATION_ZONES.getValidPositions(this.farm.gridRows, this.farm.gridCols);
      const indicatorGeometry = new THREE.BoxGeometry(0.2, 0.01, 0.2);
      
      valids.forEach(pos => {
        const isOccupied = this.farm.decorations.some(d => d.col === pos.col && d.row === pos.row);
        let color = isOccupied ? 0xff3b30 : 0x34c759;
        
        const material = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.45
        });
        
        const mesh = new THREE.Mesh(indicatorGeometry, material);
        const worldPos = this.farm.getDecorationPosition(pos.col, pos.row);
        mesh.position.copy(worldPos);
        mesh.userData.col = pos.col;
        mesh.userData.row = pos.row;
        mesh.userData.isOccupied = isOccupied;
        
        this.indicatorsGroup.add(mesh);
      });
      
      this.scene.add(this.indicatorsGroup);
    }
  }

  loadFriendData(friendSaveData) {
    this.isReadOnly = true;
    this.farm.friendSaveData = friendSaveData;
    this.character.group.visible = false;
    this.shibaPet.group.visible = false;
    this.catPet.group.visible = false;
    
    // ⚠️ KRİTİK: Önce mevcut input listener'ları TEMİZLE — çökme önleme
    this.unbindInput();
    
    // Hide active chests
    if (this.chestSystem && this.chestSystem.chests) {
      this.chestSystem.chests.forEach(c => { if (c.mesh) c.mesh.visible = false; });
    }

    // Düzenleme modundan çık
    this.setEditMode(false);

    // Sürükleme state'ini sıfırla
    this.dragSeedId = null;
    this.plantedThisDrag.clear();
    this.harvestQueue = [];
    this.queuedPlots.clear();

    try {
      // Çiftlik gridini arkadaşa göre inşa et
      this.farm.rebuildGrid('friend');
      this.updateStaticMeshesPositions();
      if (this.mailboxGroup) this.mailboxGroup.visible = false;
      this.updateMaxZoomDistance();

      // ⚠️ Read-only input bağla — sadece kamera ve ticaret postası
      this.bindReadOnlyInput();
    } catch (e) {
      console.error("Arkadaş çiftliği yüklenemedi:", e);
      // Hata durumunda kendi çiftliğe geri dön
      this.restoreMyFarm();
    }
  }

  restoreMyFarm() {
    this.isReadOnly = false;
    
    // ⚠️ KRİTİK: Önce ziyaret input'unu TEMİZLE
    this.unbindInput();
    
    // Show active chests
    if (this.chestSystem && this.chestSystem.chests) {
      this.chestSystem.chests.forEach(c => { if (c.mesh) c.mesh.visible = true; });
    }

    // ⚠️ KRİTİK: Önce grid'i kendi verilerimizle yeniden inşa et, sonra friendSaveData'yı temizle!
    this.farm.rebuildGrid('own');
    this.farm.friendSaveData = null;

    this.character.group.visible = true;
    this.shibaPet.group.visible = this.shibaPet.purchased;
    this.catPet.group.visible = this.catPet.purchased;
    
    this.updateStaticMeshesPositions();
    this.checkMailbox();
    this.updateMaxZoomDistance();

    // ⚠️ Normal input'u yeniden bağla
    this.bindInput();
  }

  updateMaxZoomDistance() {
    if (!this.controls || !this.farm) return;
    const maxGridDim = Math.max(this.farm.gridRows || 3, this.farm.gridCols || 3);
    this.controls.maxDistance = 2.0 + maxGridDim * 0.95;
  }

  dispose() {
    if (this.rainSystem) this.rainSystem.dispose();
    if (this.snowSystem) this.snowSystem.dispose();
    if (this.leafSystem) this.leafSystem.dispose();
  }

  /**
   * Mevsime göre zemin rengini ve parçacık sistemlerini günceller.
   * @param {string} seasonId
   */
  updateSeasonalGround(seasonId) {
    if (this._lastSeasonForGround === seasonId) return;
    this._lastSeasonForGround = seasonId;

    // Mevsime göre zemin rengi
    const GROUND_COLORS = {
      spring: 0x2a5e2e,  // Canlı yeşil
      summer: 0x3a7a3a,  // Koyu yeşil
      autumn: 0x5a4a28,  // Kahverengi-sarı
      winter: 0xc8d8e8   // Kar beyazı-mavi
    };

    const color = GROUND_COLORS[seasonId] || GROUND_COLORS.spring;

    if (this.groundMesh && this.groundMesh.material) {
      this.groundMesh.material.color.setHex(color);
    }

    // Yaprak sistemi henüz oluşturulmadıysa oluştur
    if (!this.leafSystem) {
      this.leafSystem = new LeafSystem(this.scene);
    }
  }

  createMailbox() {
    this.mailboxGroup = new THREE.Group();
    this.mailboxGroup.name = "mailbox";

    // Wood post
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), postMat);
    post.position.y = 0.07;
    post.castShadow = true;
    post.receiveShadow = true;
    this.mailboxGroup.add(post);

    // Box body
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.07), boxMat);
    box.position.y = 0.15;
    box.castShadow = true;
    this.mailboxGroup.add(box);

    // Flag
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4 });
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.025, 0.008), flagMat);
    flag.position.set(0.027, 0.165, 0.01);
    this.mailboxGroup.add(flag);

    // Glow effect when gifts are waiting
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.5 });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat);
    glow.position.y = 0.15;
    glow.name = "mailbox-glow";
    glow.visible = false;
    this.mailboxGroup.add(glow);

    this.farm.group.add(this.mailboxGroup);
  }

  createTradingPost() {
    this.tradingPostGroup = new THREE.Group();
    this.tradingPostGroup.name = "trading_post";

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
    const clothMat1 = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.7 }); // red
    const clothMat2 = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.7 }); // white

    // Stall Counter / Table
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), woodMat);
    counter.position.y = 0.05;
    counter.castShadow = true;
    counter.receiveShadow = true;
    this.tradingPostGroup.add(counter);

    // Support Pillars
    const pillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), woodMat);
    pillar1.position.set(-0.05, 0.11, -0.03);
    pillar1.castShadow = true;
    this.tradingPostGroup.add(pillar1);

    const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), woodMat);
    pillar2.position.set(0.05, 0.11, -0.03);
    pillar2.castShadow = true;
    this.tradingPostGroup.add(pillar2);

    // Canopy (Stripe roof)
    const canopyGroup = new THREE.Group();
    canopyGroup.position.y = 0.18;
    
    // Create red and white canopy stripes
    for (let i = 0; i < 5; i++) {
      const mat = (i % 2 === 0) ? clothMat1 : clothMat2;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.1), mat);
      stripe.position.x = -0.052 + i * 0.026;
      stripe.rotation.x = 0.15; // slightly sloped
      stripe.castShadow = true;
      canopyGroup.add(stripe);
    }
    this.tradingPostGroup.add(canopyGroup);

    // Sign Board
    const signBoardMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.9 });
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.01), signBoardMat);
    signBoard.position.set(0, 0.05, 0.042);
    signBoard.castShadow = true;
    this.tradingPostGroup.add(signBoard);

    // Little fruit basket on counter
    const basketMat = new THREE.MeshStandardMaterial({ color: 0xcd853f });
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.012, 8), basketMat);
    basket.position.set(-0.025, 0.08, 0);
    this.tradingPostGroup.add(basket);

    const appleMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), appleMat);
    apple.position.set(-0.025, 0.088, 0);
    this.tradingPostGroup.add(apple);

    this.farm.group.add(this.tradingPostGroup);
  }

  updateStaticMeshesPositions() {
    const totalW = this.farm.gridCols * 0.28 + (this.farm.gridCols - 1) * 0.035;
    const totalH = this.farm.gridRows * 0.28 + (this.farm.gridRows - 1) * 0.035;
    
    if (this.mailboxGroup) {
      this.mailboxGroup.position.set(-totalW / 2 - 0.08, 0, totalH / 2 + 0.08);
    }
    if (this.tradingPostGroup) {
      this.tradingPostGroup.position.set(totalW / 2 + 0.08, 0, totalH / 2 + 0.08);
    }
  }

  async checkMailbox() {
    if (this.isReadOnly || !window.socialSystem) {
      if (this.mailboxGroup) this.mailboxGroup.visible = false;
      return;
    }
    try {
      const gifts = await window.socialSystem.getIncomingGifts();
      const hasGifts = gifts && gifts.length > 0;
      if (this.mailboxGroup) {
        this.mailboxGroup.visible = hasGifts;
        const glow = this.mailboxGroup.getObjectByName("mailbox-glow");
        if (glow) glow.visible = hasGifts;
      }
    } catch (err) {
      console.error("Error checking mailbox:", err);
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
