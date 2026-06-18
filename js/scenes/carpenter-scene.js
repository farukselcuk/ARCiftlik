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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Directional Işık (Güneş)
    const sunLight = new THREE.DirectionalLight(0xffdcb4, 0.8);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    this.scene.add(sunLight);

    // Point Light (Tezgah üstü sıcak ışık)
    const pointLight = new THREE.PointLight(0xffdd88, 1, 2);
    pointLight.position.set(0, 0.3, 0);
    this.scene.add(pointLight);

    // Stant Grubu
    const stallGroup = new THREE.Group();
    stallGroup.position.set(0, 0, 0);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.9 });
    const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const roofRedMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 });
    const roofWhiteMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.8 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6e4a29, roughness: 0.9 });

    // Tezgah Alt Kısmı (Base)
    const baseGeo = new THREE.BoxGeometry(0.8, 0.3, 0.4);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.set(0, 0.15, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    stallGroup.add(base);

    // Tezgah Üst Yüzeyi (Counter)
    const counterGeo = new THREE.BoxGeometry(0.84, 0.04, 0.44);
    const counter = new THREE.Mesh(counterGeo, woodDarkMat);
    counter.position.set(0, 0.32, 0);
    counter.castShadow = true;
    counter.receiveShadow = true;
    stallGroup.add(counter);

    // Çatı Direkleri (Poles)
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6);
    const polePositions = [
      [-0.38, 0.6, -0.18],
      [0.38, 0.6, -0.18],
      [-0.38, 0.6, 0.18],
      [0.38, 0.6, 0.18]
    ];
    polePositions.forEach(pos => {
      const pole = new THREE.Mesh(poleGeo, woodDarkMat);
      pole.position.set(...pos);
      pole.castShadow = true;
      stallGroup.add(pole);
    });

    // Çizgili Çatı (Striped Awning)
    const roofGroup = new THREE.Group();
    roofGroup.position.set(0, 0.9, 0);
    roofGroup.rotation.x = 0.15; // Hafif eğim
    
    // 7 dilimden oluşan çatı
    const sliceWidth = 0.9 / 7;
    for (let i = 0; i < 7; i++) {
      const mat = (i % 2 === 0) ? roofRedMat : roofWhiteMat;
      const sliceGeo = new THREE.BoxGeometry(sliceWidth, 0.02, 0.5);
      const slice = new THREE.Mesh(sliceGeo, mat);
      slice.position.set(-0.45 + sliceWidth/2 + (i * sliceWidth), 0, 0);
      slice.castShadow = true;
      roofGroup.add(slice);
    }
    stallGroup.add(roofGroup);

    // Fıçılar (Barrels on sides)
    const barrelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 12);
    const barrel1 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel1.position.set(-0.5, 0.11, 0.05);
    barrel1.castShadow = true;
    stallGroup.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel2.position.set(0.5, 0.11, 0.05);
    barrel2.castShadow = true;
    stallGroup.add(barrel2);

    // Tezgah Üstündeki Nesneler (Temsili alet/kutu)
    const boxYellowMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    const boxRedMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
    const toolMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71 }); // Yeşil makine/alet

    const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.15), boxYellowMat);
    box1.position.set(-0.2, 0.365, 0.05);
    box1.castShadow = true;
    stallGroup.add(box1);

    const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.15), boxRedMat);
    box2.position.set(0.2, 0.365, 0.05);
    box2.castShadow = true;
    stallGroup.add(box2);

    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), toolMat);
    machine.position.set(0, 0.4, -0.05);
    machine.castShadow = true;
    stallGroup.add(machine);

    this.scene.add(stallGroup);

    // Zemin Grid (Görseldeki gibi koyu yeşil arka plan ve kareler)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 1.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Arka plan rengini görseldeki gibi turuncumsu/kahverengimsi yap
    this.scene.background = new THREE.Color(0xa04b21);

    // Kamera ve Kontroller
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 3.0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Yerin altına geçmesini engelle

    this.camera.position.set(0, 0.8, 1.5);
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
