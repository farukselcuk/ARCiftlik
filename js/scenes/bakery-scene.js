import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class BakeryScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   * @param {GameStorage} bakeryStorage
   */
  constructor(renderer, globalStorage, bakeryStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;
    this.bakeryStorage = bakeryStorage;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
    this.controls = null;
    this.active = false;
  }

  init() {
    // Basit ortam ışığı
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(2, 4, 3);
    this.scene.add(sunLight);

    // Zemin
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    this.scene.add(ground);

    // Kilit ikonu / Fırın taslak kutusu
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.5 })
    );
    box.position.y = 0.15;
    this.scene.add(box);

    // Kamera konumlandırması
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = true;
    this.camera.position.set(0, 0.9, 1.4);
    this.controls.update();
  }

  resume() {
    this.active = true;
    this.controls.enabled = true;
    document.body.className = "is-running no-camera bakery-glow";
  }

  pause() {
    this.active = false;
    this.controls.enabled = false;
  }

  update(dt, realNow) {
    if (this.controls) this.controls.update();
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
