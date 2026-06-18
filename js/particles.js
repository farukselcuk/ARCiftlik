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
      positions[i * 3]     = (Math.random() - 0.5) * 16;  // x (Geniş alan)
      positions[i * 3 + 1] = Math.random() * 5;           // y (yüksekten başla)
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16;  // z
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
      if (pos[i + 1] < -0.5) {
        pos[i + 1] = 4.5 + Math.random(); // Yukarıdan tekrar başla
        pos[i] = (Math.random() - 0.5) * 16;
        pos[i + 2] = (Math.random() - 0.5) * 16;
      }
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
      positions[i * 3]     = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
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
      if (pos[i + 1] < -0.5) {
        pos[i + 1] = 4.5 + Math.random();
        pos[i] = (Math.random() - 0.5) * 16;
        pos[i + 2] = (Math.random() - 0.5) * 16;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.stop();
  }
}

// ── Yaprak Dökümü Sistemi (Sonbahar) ──────────────────────────────
export class LeafSystem {
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

    const count = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const leafColors = [
      new THREE.Color(0xcc6622), // Turuncu
      new THREE.Color(0xaa4400), // Koyu turuncu
      new THREE.Color(0xdd8833), // Açık turuncu
      new THREE.Color(0x994411), // Kahverengi
      new THREE.Color(0xcc3300)  // Kırmızı
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16;

      const color = leafColors[Math.floor(Math.random() * leafColors.length)];
      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.035,
      transparent: true,
      opacity: 0.85,
      vertexColors: true
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
    const time = Date.now() * 0.001;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= delta * 0.25; // Çok yavaş düşer
      pos[i]     += Math.sin(time + i * 0.7) * delta * 0.15; // Yatay sallanma
      pos[i + 2] += Math.cos(time + i * 0.5) * delta * 0.1;  // Derinlik sallanma
      if (pos[i + 1] < -0.5) {
        pos[i + 1] = 4.5 + Math.random() * 0.5;
        pos[i] = (Math.random() - 0.5) * 16;
        pos[i + 2] = (Math.random() - 0.5) * 16;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.stop();
  }
}

