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
    // Ortam Işığı
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Directional Işık
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(2, 4, 3);
    this.scene.add(sunLight);

    // Voxel Fırın Ocağı Yapısı (Brick Oven)
    const ovenGroup = new THREE.Group();
    ovenGroup.position.set(-0.25, 0, -0.25);

    const brickMat = new THREE.MeshStandardMaterial({ color: 0xa04030, roughness: 0.9 }); // Kırmızı tuğla
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }); // Fırın ağzı
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 }); // Ateş glow

    // Fırın Tabanı
    const ovenBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.32), brickMat);
    ovenBase.position.y = 0.09;
    ovenBase.castShadow = true;
    ovenBase.receiveShadow = true;
    ovenGroup.add(ovenBase);

    // Fırın Gövdesi
    const ovenBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.32), brickMat);
    ovenBody.position.y = 0.29;
    ovenBody.castShadow = true;
    ovenBody.receiveShadow = true;
    ovenGroup.add(ovenBody);

    // Fırın Ağzı/Kapısı
    const ovenDoor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.04), darkMat);
    ovenDoor.position.set(0, 0.26, 0.15);
    ovenGroup.add(ovenDoor);

    // Yanan Ateş Küresi
    const fireGlow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), fireMat);
    fireGlow.position.set(0, 0.24, 0.12);
    ovenGroup.add(fireGlow);

    // PointLight - Turuncu sızan fırın ateşi ışığı
    const fireLight = new THREE.PointLight(0xff5500, 2.5, 1.4);
    fireLight.position.set(0, 0.26, 0.13);
    ovenGroup.add(fireLight);

    // Baca
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), brickMat);
    chimney.position.set(-0.08, 0.5, -0.08);
    chimney.castShadow = true;
    ovenGroup.add(chimney);

    this.scene.add(ovenGroup);

    // Pişirme Tezgahı (Baking Table)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(0.28, 0, 0.05);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a4d2b, roughness: 0.82 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 }); // Un torbası
    const breadMat = new THREE.MeshStandardMaterial({ color: 0xd2691e, roughness: 0.72 }); // Ekmek

    // Masa üstü
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.36), woodMat);
    tableTop.position.y = 0.13;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(tableTop);

    // Masa bacakları
    const legGeo = new THREE.BoxGeometry(0.02, 0.13, 0.02);
    
    const leg1 = new THREE.Mesh(legGeo, woodMat);
    leg1.position.set(-0.09, 0.065, -0.15);
    leg1.castShadow = true;
    tableGroup.add(leg1);

    const leg2 = leg1.clone();
    leg2.position.set(0.09, 0.065, -0.15);
    tableGroup.add(leg2);

    const leg3 = leg1.clone();
    leg3.position.set(-0.09, 0.065, 0.15);
    tableGroup.add(leg3);

    const leg4 = leg1.clone();
    leg4.position.set(0.09, 0.065, 0.15);
    tableGroup.add(leg4);

    // Masanın üzerindeki Un Çuvalı
    const flourBag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.11), whiteMat);
    flourBag.position.set(-0.03, 0.18, -0.05);
    flourBag.rotation.y = 0.25;
    flourBag.castShadow = true;
    tableGroup.add(flourBag);

    // Masanın üzerindeki Ekmek Somunu
    const breadMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8), breadMat);
    breadMesh.position.set(0.04, 0.155, 0.06);
    breadMesh.rotation.z = Math.PI / 2;
    breadMesh.rotation.y = 0.4;
    breadMesh.castShadow = true;
    tableGroup.add(breadMesh);

    this.scene.add(tableGroup);

    // Taş Karo Zemin
    const stoneGeo = new THREE.BoxGeometry(0.15, 0.005, 0.15);
    const stoneMat1 = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.85 });

    const stoneFloorGroup = new THREE.Group();
    for (let x = -7; x <= 7; x++) {
      for (let z = -7; z <= 7; z++) {
        const mat = (x + z) % 2 === 0 ? stoneMat1 : stoneMat2;
        const tile = new THREE.Mesh(stoneGeo, mat);
        tile.position.set(x * 0.16, -0.002, z * 0.16);
        tile.receiveShadow = true;
        stoneFloorGroup.add(tile);
      }
    }
    this.scene.add(stoneFloorGroup);

    // Kamera ve Kontroller
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 3.0;

    this.camera.position.set(0, 0.8, 1.2);
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
