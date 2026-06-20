/**
 * chests.js — Gizemli sandık sistemi
 *
 * Her 30 dakikada bir tarlada rastgele bir sandık belirir.
 * Sandık içeriği: Para (50-500 altın), Gübre, Tohum, Kozmetik eşya.
 * Aynı anda maksimum 3 sandık aktif olabilir.
 */

import * as THREE from "three";
import { GameStorage } from "./storage.js";

// ── Sandık sabitleri ───────────────────────────────────────────
const MAX_ACTIVE = 3;
const SPAWN_INTERVAL = 30 * 60 * 1000; // 30 dakika

// ── Ödül tablosu ───────────────────────────────────────────────
const LOOT_TABLE = [
  { type: "gold",       weight: 35, min: 50,  max: 500, label: "Altın" },
  { type: "fertilizer", weight: 25, amount: 1, label: "Gübre" },
  { type: "seed",       weight: 25, options: ["wheat", "corn", "strawberry", "sunflower"], label: "Tohum" },
  { type: "gold",       weight: 10, min: 200, max: 800, label: "Büyük Altın Ödülü" },
  { type: "gem",        weight: 5,  min: 1,   max: 3,   label: "Nadir Elmas" }
];

// ── 3D malzemeler ──────────────────────────────────────────────
const chestBodyMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.55, metalness: 0.2 });
const chestLidMat = new THREE.MeshStandardMaterial({ color: 0xa0693d, roughness: 0.5, metalness: 0.3 });
const chestBandMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.6 });

export class ChestSystem {
  /**
   * @param {GameStorage} storage
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    /** @type {THREE.Group} sandıkların ekleneceği parent grup */
    this.parentGroup = null;
    /** @type {Array<{id: string, mesh: THREE.Group, position: THREE.Vector3, spawnedAt: number}>} */
    this.chests = [];
    this._nextSpawnAt = Date.now() + 60000; // İlk sandık 1 dakika sonra
    this._chestIdCounter = 0;
    /** @type {Function|null} sandık açıldı callback */
    this.onChestOpened = null;
  }

  /**
   * Parent grubu ayarla (farm.group).
   * @param {THREE.Group} group
   */
  setParentGroup(group) {
    this.parentGroup = group;
  }

  /**
   * Her frame'de çağrılır.
   * @param {number} now — Date.now()
   */
  update(now) {
    // Yeni sandık spawn kontrolü
    if (this.chests.length < MAX_ACTIVE && now >= this._nextSpawnAt) {
      this.spawn();
      this._nextSpawnAt = now + SPAWN_INTERVAL;
    }

    // Sandık animasyonları (yukarı-aşağı sallanma + parıltı)
    for (const chest of this.chests) {
      if (chest.mesh) {
        const t = now * 0.001;
        chest.mesh.position.y = chest.baseY + Math.sin(t * 2 + chest.id.charCodeAt(chest.id.length - 1)) * 0.015;
        chest.mesh.rotation.y = Math.sin(t * 0.5 + chest.id.charCodeAt(0)) * 0.15;

        // Parıltı efekti
        const glow = chest.mesh.getObjectByName("chest-glow");
        if (glow) {
          glow.material.opacity = 0.3 + Math.sin(t * 4) * 0.3;
          glow.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
        }
      }
    }
  }

  /**
   * Yeni sandık oluştur.
   */
  spawn() {
    if (!this.parentGroup || this.chests.length >= MAX_ACTIVE) return;

    this._chestIdCounter++;
    const id = `chest-${this._chestIdCounter}-${Date.now()}`;

    // Rastgele konum (tarla alanı içinde)
    const x = (Math.random() - 0.5) * 0.9;
    const z = (Math.random() - 0.5) * 0.9;
    const baseY = 0.06;

    const mesh = this._createChestMesh();
    mesh.position.set(x, baseY, z);
    mesh.name = id;

    this.parentGroup.add(mesh);
    this.chests.push({ id, mesh, baseY, position: new THREE.Vector3(x, baseY, z), spawnedAt: Date.now() });
  }

  /**
   * Sandığı aç — loot tablosundan ödül seç.
   * @param {string} chestId
   * @returns {Object|null} — ödül objesi
   */
  open(chestId) {
    const index = this.chests.findIndex(c => c.id === chestId);
    if (index === -1) return null;

    const chest = this.chests[index];

    // Sandığı kaldır
    if (this.parentGroup && chest.mesh) {
      this.parentGroup.remove(chest.mesh);
    }
    this.chests.splice(index, 1);

    // Ödül seç
    const loot = this._rollLoot();

    if (this.onChestOpened) {
      this.onChestOpened(loot);
    }

    return loot;
  }

  /**
   * Raycaster ile sandık tıklaması kontrolü.
   * @param {THREE.Raycaster} raycaster
   * @returns {string|null} — tıklanan sandığın id'si veya null
   */
  checkHit(raycaster) {
    for (const chest of this.chests) {
      if (!chest.mesh) continue;
      const hits = raycaster.intersectObjects(chest.mesh.children, true);
      if (hits.length > 0) return chest.id;
    }
    return null;
  }

  /**
   * Ağırlıklı rastgele ödül seçimi.
   * @returns {{ type: string, amount?: number, cropId?: string, label: string }}
   */
  _rollLoot() {
    const totalWeight = LOOT_TABLE.reduce((s, l) => s + l.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const loot of LOOT_TABLE) {
      roll -= loot.weight;
      if (roll <= 0) {
        const result = { type: loot.type, label: loot.label };

        if (loot.type === "gold" || loot.type === "gem") {
          result.amount = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
        } else if (loot.type === "seed") {
          result.cropId = loot.options[Math.floor(Math.random() * loot.options.length)];
          result.amount = 1;
        } else {
          result.amount = loot.amount || 1;
        }

        return result;
      }
    }

    // Fallback
    return { type: "gold", amount: 50, label: "Altın" };
  }

  /**
   * 3D sandık modeli oluştur.
   * @returns {THREE.Group}
   */
  _createChestMesh() {
    const group = new THREE.Group();

    // Sandık gövdesi
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 0.06),
      chestBodyMat
    );
    body.position.y = 0.025;
    body.castShadow = true;
    group.add(body);

    // Sandık kapağı (yarım silindir)
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8, 1, false, 0, Math.PI),
      chestLidMat
    );
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.05;
    lid.castShadow = true;
    group.add(lid);

    // Altın bant
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.008, 0.065),
      chestBandMat
    );
    band.position.y = 0.03;
    group.add(band);

    // Kilit
    const lock = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.02, 0.01),
      chestBandMat
    );
    lock.position.set(0, 0.04, 0.035);
    group.add(lock);

    // Parıltı efekti
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      glowMat.clone()
    );
    glow.position.y = 0.04;
    glow.name = "chest-glow";
    group.add(glow);

    group.traverse(c => { if (c.isMesh) c.castShadow = true; });

    return group;
  }

  /**
   * Tüm sandıkları temizle (reset).
   */
  reset() {
    for (const chest of this.chests) {
      if (this.parentGroup && chest.mesh) {
        this.parentGroup.remove(chest.mesh);
      }
    }
    this.chests = [];
    this._nextSpawnAt = Date.now() + 60000;
  }
}
