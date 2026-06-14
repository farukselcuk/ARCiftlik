import * as THREE from "three";
import { CROP_TYPES, createCropMesh, getStage } from "./crops.js";

const GRID_SIZE = 3;
const PLOT_SIZE = 0.28;
const PLOT_GAP = 0.035;
const FARM_SAVE_KEY = "ar-pocket-farm:plots";

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
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.plots = [];
    this.particles = [];
    this.plotMeshes = [];

    this.createBase();
    this.load();
  }

  get placed() {
    return this.group.visible;
  }

  setPlacedFromMatrix(matrix) {
    matrix.decompose(this.group.position, this.group.quaternion, this.group.scale);
    this.group.visible = true;
  }

  setPreviewPlacement() {
    this.group.position.set(0, -0.22, -1.08);
    this.group.rotation.set(-0.7, 0, 0);
    this.group.scale.setScalar(1.05);
    this.group.visible = true;
  }

  resetPlacement() {
    this.group.visible = false;
  }

  createBase() {
    const totalSize = GRID_SIZE * PLOT_SIZE + (GRID_SIZE - 1) * PLOT_GAP;
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(totalSize + 0.16, totalSize + 0.16),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.004;
    base.receiveShadow = true;
    this.group.add(base);

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const index = row * GRID_SIZE + col;
        const x = col * (PLOT_SIZE + PLOT_GAP) - totalSize / 2 + PLOT_SIZE / 2;
        const z = row * (PLOT_SIZE + PLOT_GAP) - totalSize / 2 + PLOT_SIZE / 2;

        const plotGroup = new THREE.Group();
        plotGroup.position.set(x, 0, z);

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

        const plot = {
          index,
          cropId: null,
          plantedAt: 0,
          boostMs: 0,
          cropMesh: null,
          mesh,
          group: plotGroup,
          progress,
          stage: 0
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

  getPlotMeshes() {
    return this.plotMeshes;
  }

  canPlant(index, cropId, coins) {
    const plot = this.plots[index];
    const crop = CROP_TYPES[cropId];
    return Boolean(plot && crop && !plot.cropId && coins >= crop.cost);
  }

  isEmpty(index) {
    return Boolean(this.plots[index] && !this.plots[index].cropId);
  }

  plant(index, cropId) {
    const plot = this.plots[index];
    const crop = CROP_TYPES[cropId];
    if (!plot || !crop || plot.cropId) return null;

    plot.cropId = cropId;
    plot.plantedAt = Date.now();
    plot.boostMs = 0;
    plot.stage = 0;
    this.refreshCropMesh(plot, 1);
    this.save();
    return crop;
  }

  water(index) {
    const plot = this.plots[index];
    if (!plot || !plot.cropId || this.getProgress(plot, Date.now()) >= 1) return false;

    const crop = CROP_TYPES[plot.cropId];
    plot.boostMs = Math.min(plot.boostMs + crop.growTime * 0.1, crop.growTime * 0.35);
    this.createWaterRipple(plot);
    this.save();
    return true;
  }

  harvest(index) {
    const plot = this.plots[index];
    if (!plot || !plot.cropId || this.getProgress(plot, Date.now()) < 1) return null;

    const crop = CROP_TYPES[plot.cropId];
    this.createHarvestParticles(plot.group.position);
    this.clearPlot(plot);
    this.save();
    return crop;
  }

  describe(index) {
    const plot = this.plots[index];
    if (!plot || !plot.cropId) return "Empty plot";

    const crop = CROP_TYPES[plot.cropId];
    const progress = this.getProgress(plot, Date.now());
    if (progress >= 1) return `${crop.name} is ready`;
    return `${crop.name} ${Math.round(progress * 100)}% grown`;
  }

  update(now, camera) {
    for (const plot of this.plots) {
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
  }

  getProgress(plot, now) {
    const crop = CROP_TYPES[plot.cropId];
    if (!crop) return 0;
    return Math.min(1, (now - plot.plantedAt + plot.boostMs) / crop.growTime);
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

  save() {
    const data = this.plots.map((plot) => ({
      cropId: plot.cropId,
      plantedAt: plot.plantedAt,
      boostMs: plot.boostMs
    }));
    localStorage.setItem(FARM_SAVE_KEY, JSON.stringify(data));
  }

  load() {
    try {
      const data = JSON.parse(localStorage.getItem(FARM_SAVE_KEY) || "[]");
      data.forEach((saved, index) => {
        if (!saved || !CROP_TYPES[saved.cropId] || !this.plots[index]) return;
        const plot = this.plots[index];
        plot.cropId = saved.cropId;
        plot.plantedAt = Number(saved.plantedAt) || Date.now();
        plot.boostMs = Number(saved.boostMs) || 0;
        this.refreshCropMesh(plot, getStage(this.getProgress(plot, Date.now())));
      });
    } catch {
      localStorage.removeItem(FARM_SAVE_KEY);
    }
  }
}
