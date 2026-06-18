import * as THREE from "three";
import { CROP_TYPES, createCropMesh, getStage } from "./crops.js";
import { GameStorage } from "./storage.js";
import { createDecorationMesh, DECORATION_ZONES } from "./decorations.js";

const PLOT_SIZE = 0.28;
const PLOT_GAP = 0.035;
const DEFAULT_UNLOCKED_PLOTS = 4;

export const FARM_EXPANSIONS = [
  { id: 1, gridRows: 3, gridCols: 3, requiredLevel: 1,  cost: 0,     label: 'Başlangıç Tarlası' },
  { id: 2, gridRows: 4, gridCols: 4, requiredLevel: 3,  cost: 500,   label: 'Küçük Tarla' },
  { id: 3, gridRows: 4, gridCols: 5, requiredLevel: 5,  cost: 1500,  label: 'Orta Tarla' },  // 4x5
  { id: 4, gridRows: 5, gridCols: 5, requiredLevel: 7,  cost: 3000,  label: 'Büyük Tarla' },
  { id: 5, gridRows: 6, gridCols: 6, requiredLevel: 10, cost: 8000,  label: 'Dev Çiftlik' },
];

const dirtMaterial = new THREE.MeshBasicMaterial({
  color: 0x7b4d2a,
  opacity: 0.72,
  transparent: true,
  side: THREE.DoubleSide
});
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xf2df99, transparent: true, opacity: 0.72 });
const progressBackMaterial = new THREE.MeshBasicMaterial({ color: 0x17241f, transparent: true, opacity: 0.86 });
const progressFillMaterial = new THREE.MeshBasicMaterial({ color: 0x69d47a });
const particleMaterial = new THREE.MeshStandardMaterial({ color: 0xffdd55, roughness: 0.48 });

export class Farm {
  constructor(storage) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.plots = [];
    this.particles = [];
    this.plotMeshes = [];
    this.decorations = [];
    this.decorationMeshes = [];
    /** @type {GameStorage} */
    this._storage = storage;
    this.friendSaveData = null; // Ziyaret edilen arkadaşın Firestore save verisi

    // Hava durumu ve mevsim büyüme çarpanları (dışarıdan ayarlanır)
    this.weatherGrowMultiplier = 1.0;
    this.seasonGrowMultiplier = 1.0;

    // Izgara genişleme seviyesi
    this.expansionId = this.loadExpansionId('own');
    const exp = FARM_EXPANSIONS.find(e => e.id === this.expansionId) || FARM_EXPANSIONS[0];
    this.gridRows = exp.gridRows;
    this.gridCols = exp.gridCols;

    this.unlockedPlotsCount = this.loadUnlockedPlotsCount('own');

    this.createBase();
    this.load('own');
    this.loadDecorations('own');
  }

  get placed() {
    return this.group.visible;
  }

  setPlacedFromMatrix(matrix) {
    matrix.decompose(this.group.position, this.group.quaternion, this.group.scale);
    this.group.visible = true;
  }

  setPreviewPlacement() {
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.visible = true;
  }

  resetPlacement() {
    this.group.visible = false;
  }

  createBase() {
    const totalW = this.gridCols * PLOT_SIZE + (this.gridCols - 1) * PLOT_GAP;
    const totalH = this.gridRows * PLOT_SIZE + (this.gridRows - 1) * PLOT_GAP;

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(totalW + 0.16, totalH + 0.16),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.004;
    base.receiveShadow = true;
    base.name = "farm-base";
    this.group.add(base);

    for (let row = 0; row < this.gridRows; row += 1) {
      for (let col = 0; col < this.gridCols; col += 1) {
        const index = row * this.gridCols + col;
        const x = col * (PLOT_SIZE + PLOT_GAP) - totalW / 2 + PLOT_SIZE / 2;
        const z = row * (PLOT_SIZE + PLOT_GAP) - totalH / 2 + PLOT_SIZE / 2;

        const plotGroup = new THREE.Group();
        plotGroup.position.set(x, 0, z);
        plotGroup.name = "plot-group";
        plotGroup.userData.plotIndex = index;

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLOT_SIZE, PLOT_SIZE), dirtMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.001;
        mesh.receiveShadow = true;
        mesh.userData.plotIndex = index;
        plotGroup.add(mesh);

        const border = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLOT_SIZE, PLOT_SIZE)),
          outlineMaterial
        );
        border.rotation.x = -Math.PI / 2;
        border.position.y = 0.004;
        plotGroup.add(border);

        const progress = this.createProgressBar();
        progress.visible = false;
        plotGroup.add(progress);

        let lockMesh = null;
        if (index >= this.unlockedPlotsCount) {
          lockMesh = this.createLockMesh();
          plotGroup.add(lockMesh);
        }

        const plot = {
          index,
          cropId: null,
          plantedAt: 0,
          boostMs: 0,
          cropMesh: null,
          mesh,
          group: plotGroup,
          progress,
          stage: 0,
          lockMesh: lockMesh,
          fertilizer: null,
          borderMesh: border
        };

        this.plots.push(plot);
        this.plotMeshes.push(mesh);
        this.group.add(plotGroup);
      }
    }
  }

  createProgressBar() {
    const group = new THREE.Group();
    group.position.set(0, 0.34, -0.02);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.025), progressBackMaterial);
    group.add(back);

    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.172, 0.017), progressFillMaterial);
    fill.position.z = 0.002;
    fill.position.x = -0.086;
    fill.scale.x = 0.001;
    fill.userData.fullWidth = 0.172;
    group.add(fill);

    group.userData.fill = fill;
    return group;
  }

  createLockMesh() {
    const group = new THREE.Group();
    group.name = "lock-mesh";
    group.position.y = 0.08;

    // Padlock body (golden/brass yellow)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.024), bodyMat);
    body.castShadow = true;
    group.add(body);

    // Padlock shackle (silver/metallic)
    const shackleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.9 });
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 8, 16, Math.PI), shackleMat);
    shackle.position.y = 0.025;
    shackle.castShadow = true;
    group.add(shackle);

    return group;
  }

  getPlotMeshes() {
    return this.plotMeshes;
  }

  canPlant(index, cropId, coins) {
    if (this.isLocked(index)) return false;
    const plot = this.plots[index];
    const crop = CROP_TYPES[cropId];
    return Boolean(plot && crop && !plot.cropId && coins >= crop.cost);
  }

  isEmpty(index) {
    if (this.isLocked(index)) return false;
    return Boolean(this.plots[index] && !this.plots[index].cropId);
  }

  plant(index, cropId, context = 'own') {
    if (this.isLocked(index)) return null;
    const plot = this.plots[index];
    const crop = CROP_TYPES[cropId];
    if (!plot || !crop || plot.cropId) return null;

    plot.cropId = cropId;
    plot.plantedAt = Date.now();
    plot.boostMs = 0;
    plot.stage = 0;
    plot.fertilizer = null;
    this.updateFertilizerVisual(plot);
    this.refreshCropMesh(plot, 1);
    this.save(context);
    return crop;
  }

  water(index, context = 'own') {
    if (this.isLocked(index)) return false;
    const plot = this.plots[index];
    if (!plot || !plot.cropId || this.getProgress(plot, Date.now()) >= 1) return false;

    const crop = CROP_TYPES[plot.cropId];
    plot.boostMs = Math.min(plot.boostMs + crop.growTime * 0.1, crop.growTime * 0.35);
    this.createWaterRipple(plot);
    this.save(context);
    return true;
  }

  applyFertilizer(index, type, context = 'own') {
    if (this.isLocked(index)) return false;
    const plot = this.plots[index];
    if (!plot || !plot.cropId || plot.fertilizer || this.getProgress(plot, Date.now()) >= 1) return false;
    plot.fertilizer = type;
    this.updateFertilizerVisual(plot);
    this.save(context);
    return true;
  }

  updateFertilizerVisual(plot) {
    if (!plot.borderMesh) return;
    if (plot.fertilizer) {
      let color = 0xf2df99;
      if (plot.fertilizer === "fertilizer_basic") color = 0x2ecc71;
      else if (plot.fertilizer === "fertilizer_super") color = 0x3498db;
      else if (plot.fertilizer === "fertilizer_golden") color = 0xf1c40f;
      
      plot.borderMesh.material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9
      });
    } else {
      plot.borderMesh.material = outlineMaterial;
    }
  }

  harvest(index, context = 'own') {
    if (this.isLocked(index)) return null;
    const plot = this.plots[index];
    const progress = this.getProgress(plot, Date.now());
    if (!plot || !plot.cropId || progress < 1) return null;

    const crop = CROP_TYPES[plot.cropId];
    const fertilizer = plot.fertilizer;
    const isWithered = (progress === 2);

    this.createHarvestParticles(plot.group.position);
    this.clearPlot(plot);
    this.save(context);
    return { crop, fertilizer, isWithered };
  }

  isReadyToHarvest(index) {
    if (this.isLocked(index)) return false;
    const plot = this.plots[index];
    if (!plot || !plot.cropId) return false;
    return this.getProgress(plot, Date.now()) >= 1;
  }

  describe(index) {
    if (this.isLocked(index)) return "Kilitli parsel";
    const plot = this.plots[index];
    if (!plot || !plot.cropId) return "Boş tarla";

    const crop = CROP_TYPES[plot.cropId];
    const progress = this.getProgress(plot, Date.now());
    if (progress >= 1) return `${crop.name} hasada hazır!`;
    let desc = `${crop.name} %${Math.round(progress * 100)} büyüdü`;
    if (plot.fertilizer) {
      const names = { fertilizer_basic: "Basit Gübre", fertilizer_super: "Süper Gübre", fertilizer_golden: "Altın Gübre" };
      desc += ` (${names[plot.fertilizer]})`;
    }
    return desc;
  }

  update(now, camera) {
    for (const plot of this.plots) {
      if (plot.lockMesh) {
        plot.lockMesh.position.y = 0.08 + Math.sin(now * 0.003 + plot.index) * 0.012;
        plot.lockMesh.rotation.y = now * 0.001 + plot.index;
        continue;
      }
      if (!plot.cropId) continue;
      const progress = this.getProgress(plot, now);
      const stage = getStage(progress);
      if (stage !== plot.stage) this.refreshCropMesh(plot, stage);

      plot.progress.visible = progress < 1;
      if (plot.progress.visible) {
        const fill = plot.progress.userData.fill;
        fill.scale.x = Math.max(0.001, progress);
        fill.position.x = -fill.userData.fullWidth * (1 - progress) * 0.5;
        if (camera) plot.progress.lookAt(camera.position);
      }

      if (progress >= 1 && plot.cropMesh) {
        plot.cropMesh.position.y = Math.sin(now * 0.006 + plot.index) * 0.018;
      }
    }

    this.updateParticles(now);

    // Ağaç fidanlarının büyümesini güncelle
    this.decorations.forEach((deco, index) => {
      const isSapling = (deco.id === 'oak_sapling' || deco.id === 'pine_sapling' || deco.id === 'apple_sapling' || deco.id === 'orange_sapling');
      if (isSapling) {
        const growTime = (deco.id === 'oak_sapling') ? 240000 : ((deco.id === 'pine_sapling') ? 360000 : 300000);
        const elapsed = now - (deco.plantedAt || now);
        const progress = Math.min(1, elapsed / growTime);
        const stage = progress >= 1 ? 3 : (progress >= 0.5 ? 2 : 1);
        
        let needsRefresh = false;
        if (stage !== deco.stage) {
          deco.stage = stage;
          needsRefresh = true;
        }

        // Meyve ağacı cooldown kontrolü
        if (stage === 3 && (deco.id === 'apple_sapling' || deco.id === 'orange_sapling')) {
          if (deco.hasFruit === undefined) {
            deco.hasFruit = true;
            needsRefresh = true;
          }
          if (!deco.hasFruit) {
            const fruitCooldown = 60000; // 1 dakika
            const lastHarvest = deco.lastHarvestedAt || deco.plantedAt || now;
            if (now - lastHarvest >= fruitCooldown) {
              deco.hasFruit = true;
              needsRefresh = true;
            }
          }
        }

        if (needsRefresh) {
          this.refreshDecorationMesh(index, stage, deco.hasFruit || false);
          this.saveDecorations();
        }
      }
    });
  }

  getProgress(plot, now) {
    const crop = CROP_TYPES[plot.cropId];
    if (!crop) return 0;
    
    let fertMultiplier = 1.0;
    if (plot.fertilizer === "fertilizer_basic") {
      fertMultiplier = 2.0;
    } else if (plot.fertilizer === "fertilizer_super") {
      fertMultiplier = 3.0;
    } else if (plot.fertilizer === "fertilizer_golden") {
      fertMultiplier = 4.0;
    }

    const growMultiplier = this.weatherGrowMultiplier * this.seasonGrowMultiplier * fertMultiplier;
    const actualGrowTime = crop.growTime / growMultiplier;
    const realElapsed = now - plot.plantedAt + plot.boostMs;
    const progress = realElapsed / actualGrowTime;

    // Hasat edildikten sonra 1 saat (3600000 ms) daha toplanmazsa çürür (Withered)
    if (realElapsed > actualGrowTime + 3600000) {
      return 2; 
    }

    return Math.min(1, progress);
  }

  refreshCropMesh(plot, stage) {
    if (plot.cropMesh) plot.group.remove(plot.cropMesh);
    plot.cropMesh = createCropMesh(plot.cropId, stage);
    plot.cropMesh.userData.plotIndex = plot.index;
    plot.cropMesh.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });
    plot.stage = stage;
    plot.group.add(plot.cropMesh);
  }

  clearPlot(plot) {
    if (plot.cropMesh) plot.group.remove(plot.cropMesh);
    plot.cropId = null;
    plot.plantedAt = 0;
    plot.boostMs = 0;
    plot.stage = 0;
    plot.cropMesh = null;
    plot.progress.visible = false;
    plot.fertilizer = null;
    this.updateFertilizerVisual(plot);
  }

  createWaterRipple(plot) {
    const waterMaterial = new THREE.MeshBasicMaterial({ color: 0x7ecbff, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.075, 24), waterMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.userData.createdAt = Date.now();
    ring.userData.kind = "water";
    plot.group.add(ring);
    this.particles.push({ mesh: ring, root: plot.group, start: Date.now(), duration: 520, velocity: new THREE.Vector3() });
  }

  createHarvestParticles(position) {
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), particleMaterial);
      mesh.position.copy(position);
      mesh.position.y += 0.08;
      const angle = (i / 12) * Math.PI * 2;
      const speed = 0.0035 + Math.random() * 0.0025;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        root: this.group,
        start: Date.now(),
        duration: 720,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 0.006 + Math.random() * 0.004, Math.sin(angle) * speed)
      });
    }
  }

  updateParticles(now) {
    this.particles = this.particles.filter((particle) => {
      const age = now - particle.start;
      const life = age / particle.duration;
      if (life >= 1) {
        particle.root.remove(particle.mesh);
        return false;
      }

      if (particle.mesh.userData.kind === "water") {
        particle.mesh.scale.setScalar(1 + life * 1.8);
        particle.mesh.material.opacity = 0.7 * (1 - life);
      } else {
        particle.mesh.position.add(particle.velocity);
        particle.velocity.y -= 0.00022;
        particle.mesh.scale.setScalar(1 - life * 0.45);
      }
      return true;
    });
  }

  save(context = 'own') {
    if (context === 'friend') return;
    const data = this.plots.map((plot) => ({
      cropId: plot.cropId,
      plantedAt: plot.plantedAt,
      boostMs: plot.boostMs,
      fertilizer: plot.fertilizer || null
    }));
    this._storage.saveField("plots", data);
  }

  load(context = 'own') {
    try {
      let data = [];
      if (context === 'friend') {
        if (this.friendSaveData && this.friendSaveData["arciftlik:farm:state"]) {
          const farmState = JSON.parse(this.friendSaveData["arciftlik:farm:state"]);
          data = farmState.plots || [];
        }
      } else {
        data = this._storage.loadField("plots") || [];
      }
      data.forEach((saved, index) => {
        if (!saved || !this.plots[index]) return;
        const plot = this.plots[index];
        plot.cropId = saved.cropId;
        plot.plantedAt = Number(saved.plantedAt) || Date.now();
        plot.boostMs = Number(saved.boostMs) || 0;
        plot.fertilizer = saved.fertilizer || null;
        if (plot.cropId && CROP_TYPES[plot.cropId]) {
          this.refreshCropMesh(plot, getStage(this.getProgress(plot, Date.now())));
          this.updateFertilizerVisual(plot);
        }
      });
    } catch {}
  }

  loadUnlockedPlotsCount(context = 'own') {
    if (context === 'friend') {
      if (this.friendSaveData && this.friendSaveData["arciftlik:farm:state"]) {
        const farmState = JSON.parse(this.friendSaveData["arciftlik:farm:state"]);
        return Number.isInteger(farmState.unlockedPlots) ? farmState.unlockedPlots : 4;
      }
      return 4;
    }
    const saved = this._storage.loadField("unlockedPlots");
    const maxPlots = this.maxPlotsOfCurrentExpansion();
    return Number.isInteger(saved) && saved >= 1 && saved <= 36 ? Math.min(saved, maxPlots) : Math.min(DEFAULT_UNLOCKED_PLOTS, maxPlots);
  }

  saveUnlockedPlotsCount(context = 'own') {
    if (context === 'friend') return;
    this._storage.saveField("unlockedPlots", this.unlockedPlotsCount);
  }

  isLocked(index) {
    return index >= this.unlockedPlotsCount;
  }

  unlockPlot() {
    const maxPlots = this.maxPlotsOfCurrentExpansion();
    if (this.unlockedPlotsCount >= maxPlots) return false;
    const plot = this.plots[this.unlockedPlotsCount];
    if (plot && plot.lockMesh) {
      plot.group.remove(plot.lockMesh);
      plot.lockMesh = null;
    }
    this.unlockedPlotsCount += 1;
    this.saveUnlockedPlotsCount();
    return true;
  }

  resetUnlockedPlots() {
    for (const plot of this.plots) {
      if (plot.lockMesh) {
        plot.group.remove(plot.lockMesh);
        plot.lockMesh = null;
      }
      this.clearPlot(plot);
    }
    
    this.unlockedPlotsCount = Math.min(DEFAULT_UNLOCKED_PLOTS, this.maxPlotsOfCurrentExpansion());
    this.saveUnlockedPlotsCount();

    const maxPlots = this.maxPlotsOfCurrentExpansion();
    for (let i = this.unlockedPlotsCount; i < maxPlots; i += 1) {
      const plot = this.plots[i];
      if (plot) {
        plot.lockMesh = this.createLockMesh();
        plot.group.add(plot.lockMesh);
      }
    }
  }

  // ── DECORATIONS API ──────────────────────────────────────────

  getDecorationPosition(col, row) {
    const totalW = this.gridCols * PLOT_SIZE + (this.gridCols - 1) * PLOT_GAP;
    const totalH = this.gridRows * PLOT_SIZE + (this.gridRows - 1) * PLOT_GAP;
    const x = col * (PLOT_SIZE + PLOT_GAP) - totalW / 2 + PLOT_SIZE / 2;
    const z = row * (PLOT_SIZE + PLOT_GAP) - totalH / 2 + PLOT_SIZE / 2;
    return new THREE.Vector3(x, 0, z);
  }

  canPlaceDecoration(col, row) {
    const valids = DECORATION_ZONES.getValidPositions(this.gridRows, this.gridCols);
    const isValidZone = valids.some(p => p.col === col && p.row === row);
    if (!isValidZone) return false;

    const isOccupied = this.decorations.some(d => d.col === col && d.row === row);
    return !isOccupied;
  }

  addDecoration(decoId, col, row, rotation = 0) {
    if (!this.canPlaceDecoration(col, row)) return false;

    const isSapling = (decoId === 'oak_sapling' || decoId === 'pine_sapling' || decoId === 'apple_sapling' || decoId === 'orange_sapling');
    const deco = { id: decoId, col, row, rotation };
    if (isSapling) {
      deco.plantedAt = Date.now();
      deco.stage = 1;
      if (decoId === 'apple_sapling' || decoId === 'orange_sapling') {
        deco.hasFruit = false;
        deco.lastHarvestedAt = Date.now();
      }
    }
    
    this.decorations.push(deco);
    
    const mesh = createDecorationMesh(decoId, deco.stage || 1, deco.hasFruit || false);
    mesh.rotation.y = rotation;
    const pos = this.getDecorationPosition(col, row);
    mesh.position.copy(pos);
    mesh.userData.decorationIndex = this.decorations.length - 1;
    
    this.group.add(mesh);
    this.decorationMeshes.push(mesh);
    
    this.saveDecorations();
    return true;
  }

  rotateDecorationAt(col, row) {
    const idx = this.decorations.findIndex(d => d.col === col && d.row === row);
    if (idx === -1) return false;

    const deco = this.decorations[idx];
    deco.rotation = ((deco.rotation || 0) + Math.PI / 2) % (Math.PI * 2);

    // Find mesh and update rotation
    const mesh = this.decorationMeshes.find(m => m.userData.decorationIndex === idx);
    if (mesh) {
      mesh.rotation.y = deco.rotation;
    }

    this.saveDecorations();
    return true;
  }

  removeDecorationAt(col, row) {
    const idx = this.decorations.findIndex(d => d.col === col && d.row === row);
    if (idx === -1) return false;

    this.decorations.splice(idx, 1);
    
    // Find mesh and remove
    const meshIdx = this.decorationMeshes.findIndex(m => m.userData.decorationIndex === idx);
    if (meshIdx !== -1) {
      const mesh = this.decorationMeshes[meshIdx];
      this.group.remove(mesh);
      this.decorationMeshes.splice(meshIdx, 1);
    }

    // Re-index decorationMeshes
    this.decorationMeshes.forEach((m) => {
      const origIdx = m.userData.decorationIndex;
      if (origIdx > idx) {
        m.userData.decorationIndex = origIdx - 1;
      }
    });

    this.saveDecorations(context);
    return true;
  }

  loadDecorations(context = 'own') {
    this.decorationMeshes.forEach(mesh => this.group.remove(mesh));
    this.decorationMeshes = [];

    let data = [];
    if (context === 'friend') {
      if (this.friendSaveData && this.friendSaveData["arciftlik:farm:state"]) {
        const farmState = JSON.parse(this.friendSaveData["arciftlik:farm:state"]);
        data = farmState.decorations || [];
      }
    } else {
      data = this._storage.loadField("decorations") || [];
    }
    this.decorations = data;

    data.forEach((deco, index) => {
      let stage = deco.stage || 1;
      let hasFruit = deco.hasFruit || false;
      const isSapling = (deco.id === 'oak_sapling' || deco.id === 'pine_sapling' || deco.id === 'apple_sapling' || deco.id === 'orange_sapling');
      
      if (isSapling) {
        const growTime = (deco.id === 'oak_sapling') ? 240000 : ((deco.id === 'pine_sapling') ? 360000 : 300000);
        const elapsed = Date.now() - (deco.plantedAt || Date.now());
        const progress = Math.min(1, elapsed / growTime);
        stage = progress >= 1 ? 3 : (progress >= 0.5 ? 2 : 1);
        deco.stage = stage;
        
        if (stage === 3 && (deco.id === 'apple_sapling' || deco.id === 'orange_sapling')) {
          if (deco.hasFruit === undefined) {
            deco.hasFruit = true;
          }
          hasFruit = deco.hasFruit;
        }
      }

      const mesh = createDecorationMesh(deco.id, stage, hasFruit);
      mesh.rotation.y = deco.rotation || 0;
      const pos = this.getDecorationPosition(deco.col, deco.row);
      mesh.position.copy(pos);
      mesh.userData.decorationIndex = index;
      this.group.add(mesh);
      this.decorationMeshes.push(mesh);
    });
  }

  refreshDecorationMesh(index, stage, hasFruit = false) {
    const deco = this.decorations[index];
    if (!deco) return;

    // Find mesh and replace
    const meshIdx = this.decorationMeshes.findIndex(m => m.userData.decorationIndex === index);
    if (meshIdx !== -1) {
      const oldMesh = this.decorationMeshes[meshIdx];
      this.group.remove(oldMesh);
      
      const newMesh = createDecorationMesh(deco.id, stage, hasFruit);
      newMesh.rotation.y = deco.rotation || 0;
      const pos = this.getDecorationPosition(deco.col, deco.row);
      newMesh.position.copy(pos);
      newMesh.userData.decorationIndex = index;
      
      this.group.add(newMesh);
      this.decorationMeshes[meshIdx] = newMesh;
    }
  }

  saveDecorations(context = 'own') {
    if (context === 'friend') return;
    this._storage.saveField("decorations", this.decorations);
  }

  // ── Çiftlik Genişletme API ─────────────────────────────────────
  
  loadExpansionId(context = 'own') {
    if (context === 'friend') {
      if (this.friendSaveData && this.friendSaveData["arciftlik:farm:state"]) {
        const farmState = JSON.parse(this.friendSaveData["arciftlik:farm:state"]);
        return Number.isInteger(farmState.expansionId) ? farmState.expansionId : 1;
      }
      return 1;
    }
    const saved = this._storage.loadField("expansionId");
    return Number.isInteger(saved) && saved >= 1 && saved <= 5 ? saved : 1;
  }

  saveExpansionId(context = 'own') {
    if (context === 'friend') return;
    this._storage.saveField("expansionId", this.expansionId);
  }

  maxPlotsOfCurrentExpansion() {
    return this.gridRows * this.gridCols;
  }

  expandFarm(expansionId) {
    if (expansionId < 1 || expansionId > 5) return false;

    const oldRows = this.gridRows;
    const oldCols = this.gridCols;

    this.expansionId = expansionId;
    this.saveExpansionId();

    const exp = FARM_EXPANSIONS.find(e => e.id === this.expansionId) || FARM_EXPANSIONS[0];
    this.gridRows = exp.gridRows;
    this.gridCols = exp.gridCols;

    this.unlockedPlotsCount = this.loadUnlockedPlotsCount();

    // Recalculate decorations after expansion!
    this.decorations = DECORATION_ZONES.recalculateAfterExpansion(
      this.decorations,
      oldRows, oldCols,
      this.gridRows, this.gridCols
    );
    this.saveDecorations();

    // Three.js sahnelerini temizle ve baştan oluştur
    this.rebuildGrid();
    return true;
  }

  rebuildGrid(context = 'own') {
    this.expansionId = this.loadExpansionId(context);
    const exp = FARM_EXPANSIONS.find(e => e.id === this.expansionId) || FARM_EXPANSIONS[0];
    this.gridRows = exp.gridRows;
    this.gridCols = exp.gridCols;
    this.unlockedPlotsCount = this.loadUnlockedPlotsCount(context);

    const specialChildren = [];
    this.group.children.forEach(c => {
      // Keep character, pet, chests, fireflies, and static meshes (mailbox, trading post)
      const isPlotGroup = c.userData.hasOwnProperty("plotIndex") || c.name === "plot-group";
      const isDecoration = c.userData.hasOwnProperty("decorationIndex") || c.name === "decoration-mesh";
      const isLock = c.name === "lock-mesh";
      const isBase = c.name === "farm-base";

      if (c !== this.group && !isPlotGroup && !isDecoration && !isLock && !isBase) {
        specialChildren.push(c);
      }
    });

    const toRemove = [];
    this.group.children.forEach(c => toRemove.push(c));
    toRemove.forEach(c => this.group.remove(c));

    this.plots = [];
    this.plotMeshes = [];

    this.createBase();
    this.load(context);
    this.loadDecorations(context);

    // Restore special children
    specialChildren.forEach(c => this.group.add(c));
  }
}
