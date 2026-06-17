import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Input } from "../input.js";

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });

export class MarketScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   * @param {GameStorage} marketStorage
   */
  constructor(renderer, globalStorage, marketStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;
    this.marketStorage = marketStorage;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
    this.controls = null;
    this.active = false;

    this.raycaster = new THREE.Raycaster();
    this.ambientLight = null;
    this.sunLight = null;
    this.pointLight = null; // Tezgah üstü lamba

    this.marketGroup = new THREE.Group();
    this.merchantGroup = null;

    this._inputCleanups = [];
    this._time = 0;
  }

  init() {
    // Işıklar
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3e0, 2.0); // Sıcak gün batımı ışığı
    this.sunLight.position.set(1.5, 3, 2);
    this.sunLight.castShadow = true;
    this.scene.add(this.sunLight);

    // Lamba ışığı (Asılı sarı ampul)
    this.pointLight = new THREE.PointLight(0xffd54f, 3, 2);
    this.pointLight.position.set(0, 0.58, 0.15);
    this.scene.add(this.pointLight);

    // Zemin (Arnavut kaldırımı/taş kaplama görünümü)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      mat(0x555555, { roughness: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Taş pazar yolu çizgileri
    const grid = new THREE.GridHelper(3.2, 16, 0x333333, 0x333333);
    grid.position.y = -0.003;
    this.scene.add(grid);

    // Market tezgahı
    this.createStall();

    // Tüccar/Satıcı karakter
    this.createMerchant();

    // Dekoratif fıçılar
    this.createBarrels();

    this.scene.add(this.marketGroup);

    // Kamera ve Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.18, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 3.6;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.camera.position.set(0, 1.1, 1.8);
    this.camera.lookAt(0, 0.18, 0);
    this.controls.update();
  }

  createStall() {
    const stall = new THREE.Group();

    // Masa/Tezgah ahşap taban
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.4), mat(0x8b5e3c));
    counter.position.set(0, 0.12, 0.1);
    counter.castShadow = true;
    counter.receiveShadow = true;
    stall.add(counter);

    // 4 İnce direk (Gölgelik çatısı için)
    const poleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6);
    const poleMat = mat(0x5d4037);

    const p1 = new THREE.Mesh(poleGeo, poleMat);
    p1.position.set(-0.32, 0.35, -0.08);
    stall.add(p1);

    const p2 = new THREE.Mesh(poleGeo, poleMat);
    p2.position.set(0.32, 0.35, -0.08);
    stall.add(p2);

    const p3 = new THREE.Mesh(poleGeo, poleMat);
    p3.position.set(-0.32, 0.35, 0.28);
    stall.add(p3);

    const p4 = new THREE.Mesh(poleGeo, poleMat);
    p4.position.set(0.32, 0.35, 0.28);
    stall.add(p4);

    // Çadır Gölgelik (Kırmızı Beyaz Çizgili Gölgelik)
    const canopy = new THREE.Group();
    canopy.position.set(0, 0.6, 0.1);

    const stripW = 0.08;
    const colors = [0xd32f2f, 0xffffff]; // Kırmızı, Beyaz çizgiler

    for (let i = 0; i < 9; i++) {
      const isRed = i % 2 === 0;
      const x = -0.32 + i * stripW;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(stripW, 0.03, 0.44),
        mat(isRed ? 0xd32f2f : 0xffffff, { roughness: 0.8 })
      );
      stripe.position.set(x, 0, 0);
      stripe.rotation.x = 0.15; // Öne eğik canopy
      stripe.castShadow = true;
      canopy.add(stripe);
    }
    stall.add(canopy);

    // Tezgah üstü kasa kutuları
    const crateGeo = new THREE.BoxGeometry(0.14, 0.05, 0.12);
    const crateMat = mat(0xcd853f);

    const c1 = new THREE.Mesh(crateGeo, crateMat);
    c1.position.set(-0.2, 0.26, 0.14);
    c1.rotation.y = 0.1;
    stall.add(c1);

    // Kasa içi ürünler (Renkli kutucuklar)
    const wheatInCrate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.1), mat(0xf3ce3d));
    wheatInCrate.position.set(-0.2, 0.28, 0.14);
    wheatInCrate.rotation.y = 0.1;
    stall.add(wheatInCrate);

    const c2 = new THREE.Mesh(crateGeo, crateMat);
    c2.position.set(0.2, 0.26, 0.14);
    c2.rotation.y = -0.1;
    stall.add(c2);

    const strawberryInCrate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.1), mat(0xe94042));
    strawberryInCrate.position.set(0.2, 0.28, 0.14);
    strawberryInCrate.rotation.y = -0.1;
    stall.add(strawberryInCrate);

    this.marketGroup.add(stall);
  }

  createMerchant() {
    this.merchantGroup = new THREE.Group();
    this.merchantGroup.name = "merchant";
    this.merchantGroup.position.set(0, 0.08, -0.16); // Tezgah arkasında durur

    // Gövde (Yeşil gömlekli voxel tüccar)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.1), mat(0x2f6f4e));
    body.position.y = 0.11;
    body.castShadow = true;
    this.merchantGroup.add(body);

    // Kafa
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), mat(0xffdbac)); // Ten rengi
    head.position.set(0, 0.26, 0);
    head.castShadow = true;
    this.merchantGroup.add(head);

    // Şapka (Kahverengi köylü şapkası)
    const hatBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.18), mat(0x8d6e63));
    hatBase.position.set(0, 0.32, 0);
    this.merchantGroup.add(hatBase);

    const hatTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), mat(0x8d6e63));
    hatTop.position.set(0, 0.35, 0);
    this.merchantGroup.add(hatTop);

    // Kollar
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), mat(0x2f6f4e));
    armL.position.set(-0.09, 0.13, 0.02);
    armL.rotation.x = 0.45; // Elleri tezgaha yaslama pozu
    this.merchantGroup.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), mat(0x2f6f4e));
    armR.position.set(0.09, 0.13, 0.02);
    armR.rotation.x = 0.45;
    this.merchantGroup.add(armR);

    this.marketGroup.add(this.merchantGroup);
  }

  createBarrels() {
    // Dekoratif fıçılar (Ahşap silindirler)
    const barrelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10);
    const barrelMat = mat(0x5d4037);

    const barrel1 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel1.position.set(-0.52, 0.11, -0.12);
    barrel1.castShadow = true;
    this.marketGroup.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel2.position.set(0.52, 0.11, -0.12);
    barrel2.castShadow = true;
    this.marketGroup.add(barrel2);
  }

  resume() {
    this.active = true;
    this.controls.enabled = true;
    this.bindInput();

    // Sıcak güneşli gökyüzü / pazar yeri hissi
    document.body.className = "is-running no-camera sunset-time";
  }

  pause() {
    this.active = false;
    this.controls.enabled = false;
    this.unbindInput();
  }

  bindInput() {
    this.unbindInput();

    const cleanupTap = Input.onTap(this.renderer.domElement, (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.handleTapAt(point);
    });
    this._inputCleanups.push(cleanupTap);
  }

  unbindInput() {
    this._inputCleanups.forEach(c => c());
    this._inputCleanups = [];
  }

  handleTapAt(point) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      (point.x / rect.width) * 2 - 1,
      -(point.y / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);

    const hits = this.raycaster.intersectObjects(this.marketGroup.children, true);
    if (hits.length === 0) return;

    // Herhangi bir market elemanına veya tüccara tıklandıysa satıcıyı tetikle
    window.dispatchEvent(new CustomEvent("open-market-panel"));
    window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Hoş geldiniz! Çiftliğinizi büyütmek için ürünlerimize göz atın! 🛒" } }));

    // Tüccara selam verme/hoplama animasyonu
    if (this.merchantGroup) {
      const startY = this.merchantGroup.position.y;
      let t = 0;
      const anim = () => {
        t += 0.2;
        this.merchantGroup.position.y = startY + Math.sin(t) * 0.08;
        if (t < Math.PI) {
          requestAnimationFrame(anim);
        } else {
          this.merchantGroup.position.y = startY;
        }
      };
      anim();
    }
  }

  update(dt, realNow) {
    if (this.controls) this.controls.update();

    this._time += dt;

    // Tüccarın hafifçe nefes alıp başını oynatması animasyonu
    if (this.merchantGroup) {
      const head = this.merchantGroup.children.find(c => c.position.y > 0.2);
      if (head) {
        head.rotation.y = Math.sin(this._time * 0.6) * 0.08;
        head.position.y = 0.26 + Math.sin(this._time * 1.2) * 0.003;
      }
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
