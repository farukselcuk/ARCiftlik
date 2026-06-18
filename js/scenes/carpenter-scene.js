import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class CarpenterScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   */
  constructor(renderer, globalStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
    this.controls = null;
    this.active = false;
    this._time = 0;
  }

  init() {
    // Ortam Işığı
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    // Directional Işık
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(2, 4, 3);
    this.scene.add(sunLight);

    // Marangoz Atölyesi
    const shopGroup = new THREE.Group();
    shopGroup.position.set(0, 0, -0.2);

    const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const woodLightMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.4 });

    // Taban Platformu
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.6), woodDarkMat);
    platform.position.y = 0.025;
    platform.receiveShadow = true;
    shopGroup.add(platform);

    // Tezgah (Workbench)
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.2), woodLightMat);
    tableTop.position.set(0, 0.2, 0.1);
    tableTop.castShadow = true;
    shopGroup.add(tableTop);

    const legGeo = new THREE.BoxGeometry(0.03, 0.2, 0.03);
    const leg1 = new THREE.Mesh(legGeo, woodDarkMat);
    leg1.position.set(-0.18, 0.1, 0.05);
    shopGroup.add(leg1);
    
    const leg2 = leg1.clone();
    leg2.position.set(0.18, 0.1, 0.05);
    shopGroup.add(leg2);

    const leg3 = leg1.clone();
    leg3.position.set(-0.18, 0.1, 0.15);
    shopGroup.add(leg3);

    const leg4 = leg1.clone();
    leg4.position.set(0.18, 0.1, 0.15);
    shopGroup.add(leg4);

    // Testere (Tezgah üstünde)
    const sawBlade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.04), metalMat);
    sawBlade.position.set(-0.1, 0.22, 0.1);
    sawBlade.rotation.y = Math.PI / 4;
    shopGroup.add(sawBlade);

    const sawHandle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x800000 }));
    sawHandle.position.set(-0.14, 0.22, 0.14);
    sawHandle.rotation.y = Math.PI / 4;
    shopGroup.add(sawHandle);

    // Odun Yığını (Log pile)
    const logGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
    logGeo.rotateZ(Math.PI / 2);
    
    const log1 = new THREE.Mesh(logGeo, woodDarkMat);
    log1.position.set(0.2, 0.07, -0.1);
    shopGroup.add(log1);
    
    const log2 = new THREE.Mesh(logGeo, woodDarkMat);
    log2.position.set(0.2, 0.07, -0.02);
    shopGroup.add(log2);

    const log3 = new THREE.Mesh(logGeo, woodDarkMat);
    log3.position.set(0.2, 0.14, -0.06);
    shopGroup.add(log3);

    this.scene.add(shopGroup);

    // Zemin
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 1.0 }); // Çim
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Kamera ve Kontroller
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 3.0;

    this.camera.position.set(0, 0.6, 1.0);
    this.controls.update();
  }

  resume() {
    this.active = true;
    this.controls.enabled = true;
    document.body.className = "is-running no-camera";
  }

  pause() {
    this.active = false;
    this.controls.enabled = false;
  }

  update(dt, realNow) {
    if (!this.active) return;
    this._time += dt;
    if (this.controls) this.controls.update();
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
