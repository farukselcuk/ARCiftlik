/**
 * particles.js — Yağmur & Kar parçacık sistemleri (Three.js)
 *
 * RainSystem: 500 mavi-beyaz damla, hızlı düşüş
 * SnowSystem: 300 beyaz tanecik, yavaş düşüş + yatay sallanma
 * Her ikisi de dispose() ile GPU kaynaklarını temizler.
 */

import * as THREE from 'three';

// ── Yağmur Sistemi ────────────────────────────────────────────────
export class RainSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;

    const count = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 4;   // x
      positions[i * 3 + 1] = Math.random() * 3;             // y (yüksekten başla)
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;   // z
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.015,
      transparent: true,
      opacity: 0.6
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  stop() {
    if (!this.active || !this.particles) return;
    this.scene.remove(this.particles);
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.particles = null;
    this.active = false;
  }

  /**
   * Her frame'de çağrılır.
   * @param {number} delta — saniye cinsinden frame süresi
   */
  update(delta) {
    if (!this.active || !this.particles) return;
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= delta * 2.5; // Düşme hızı
      if (pos[i + 1] < -0.5) pos[i + 1] = 2.5; // Yukarıdan tekrar başla
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.stop();
  }
}

// ── Kar Sistemi ───────────────────────────────────────────────────
export class SnowSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;

    const count = 300;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = Math.random() * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.025,
      transparent: true,
      opacity: 0.8
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  stop() {
    if (!this.active || !this.particles) return;
    this.scene.remove(this.particles);
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.particles = null;
    this.active = false;
  }

  /**
   * Her frame'de çağrılır.
   * @param {number} delta — saniye cinsinden frame süresi
   */
  update(delta) {
    if (!this.active || !this.particles) return;
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= delta * 0.4; // Yavaş düşer
      pos[i]     += Math.sin(Date.now() * 0.001 + i) * 0.001; // Yatay sallanma
      if (pos[i + 1] < -0.5) pos[i + 1] = 2.5;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.stop();
  }
}
