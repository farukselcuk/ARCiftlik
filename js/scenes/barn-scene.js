import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Input } from "../input.js";

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });

export class BarnScene {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {GameStorage} globalStorage
   * @param {GameStorage} barnStorage
   */
  constructor(renderer, globalStorage, barnStorage) {
    this.renderer = renderer;
    this.globalStorage = globalStorage;
    this.barnStorage = barnStorage;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
    this.controls = null;
    this.active = false;

    this.raycaster = new THREE.Raycaster();
    this.ambientLight = null;
    this.sunLight = null;
    this.spotLight = null;

    this.barnGroup = new THREE.Group();
    this.chickenGroup = null;
    this.catGroup = null;
    this.shibaGroup = null; // Shiba visual copy for barn scene if purchased
    
    this._inputCleanups = [];
    this._time = 0;
  }

  init() {
    // Işıklar
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffedd5, 1.8);
    this.sunLight.position.set(2, 4, 3);
    this.sunLight.castShadow = true;
    this.scene.add(this.sunLight);

    // Barn kapısına sıcak sarı spot ışığı
    this.spotLight = new THREE.SpotLight(0xffaa44, 4, 3, Math.PI / 4, 0.5, 1);
    this.spotLight.position.set(0, 0.6, 0.35);
    this.spotLight.target.position.set(0, 0, 0.4);
    this.scene.add(this.spotLight);
    this.scene.add(this.spotLight.target);

    // Zemin
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      mat(0x3e7a50, { roughness: 0.95 }) // Koyu çimen yeşili
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const fenceHelper = new THREE.GridHelper(3.2, 16, 0x1d3a24, 0x1d3a24);
    fenceHelper.position.y = -0.003;
    fenceHelper.material.transparent = true;
    fenceHelper.material.opacity = 0.2;
    this.scene.add(fenceHelper);

    // Barn binasını oluştur
    this.createBarn();

    // Tavuk oluştur (voxel)
    this.createChicken();

    // Kedi oluştur (voxel)
    this.createCat();

    // Shiba Köpeği (Voxel - Sadece görsel kopya)
    this.createShiba();

    this.scene.add(this.barnGroup);

    // Kamera ve Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 3.8;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.camera.position.set(0, 1.2, 1.9);
    this.camera.lookAt(0, 0.15, 0);
    this.controls.update();
  }

  createBarn() {
    const barn = new THREE.Group();

    // Ana kırmızı gövde
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), mat(0xc23b22));
    body.position.y = 0.225;
    body.castShadow = true;
    body.receiveShadow = true;
    barn.add(body);

    // Çatı (Koyu gri açılı kutu)
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.65), mat(0x404040));
    roofL.position.set(-0.19, 0.52, 0);
    roofL.rotation.z = 0.45;
    roofL.castShadow = true;
    barn.add(roofL);

    const roofR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.65), mat(0x404040));
    roofR.position.set(0.19, 0.52, 0);
    roofR.rotation.z = -0.45;
    roofR.castShadow = true;
    barn.add(roofR);

    // Çatı üçgen ön/arka kapaklar (kırmızı)
    const capGeo = new THREE.ConeGeometry(0.3, 0.12, 4);
    const capFront = new THREE.Mesh(capGeo, mat(0xc23b22));
    capFront.position.set(0, 0.5, 0.28);
    capFront.rotation.y = Math.PI / 4;
    barn.add(capFront);

    // Silo (Metalik silindir)
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.65, 12), mat(0xaaaaaa, { metalness: 0.8, roughness: 0.2 }));
    silo.position.set(0.44, 0.325, -0.1);
    silo.castShadow = true;
    barn.add(silo);

    const siloRoof = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 12), mat(0x555555, { metalness: 0.7 }));
    siloRoof.position.set(0.44, 0.7, -0.1);
    siloRoof.castShadow = true;
    barn.add(siloRoof);

    // Büyük kapı (Ahşap kahverengi)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.02), mat(0x6b4226));
    door.position.set(0, 0.14, 0.301);
    door.name = "barn-door";
    barn.add(door);

    // Kapı üstü beyaz X süsü
    const crossL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.005), mat(0xffffff));
    crossL.rotation.z = 0.8;
    crossL.position.set(0, 0.14, 0.306);
    barn.add(crossL);

    this.barnGroup.add(barn);
  }

  createChicken() {
    this.chickenGroup = new THREE.Group();
    this.chickenGroup.name = "chicken";
    this.chickenGroup.position.set(-0.45, 0.05, 0.3);

    // Gövde (Beyaz box)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), mat(0xffffff));
    body.castShadow = true;
    this.chickenGroup.add(body);

    // Kafa
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat(0xffffff));
    head.position.set(0, 0.065, 0.04);
    head.castShadow = true;
    this.chickenGroup.add(head);

    // Gaga (Sarı/Turuncu)
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.02), mat(0xffaa00));
    beak.position.set(0, 0.06, 0.07);
    this.chickenGroup.add(beak);

    // İbik (Kırmızı)
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.03), mat(0xd62222));
    comb.position.set(0, 0.095, 0.035);
    this.chickenGroup.add(comb);

    // Ayaklar
    const footGeo = new THREE.BoxGeometry(0.008, 0.04, 0.008);
    const leftFoot = new THREE.Mesh(footGeo, mat(0xffaa00));
    leftFoot.position.set(-0.02, -0.05, 0);
    this.chickenGroup.add(leftFoot);

    const rightFoot = new THREE.Mesh(footGeo, mat(0xffaa00));
    rightFoot.position.set(0.02, -0.05, 0);
    this.chickenGroup.add(rightFoot);

    this.barnGroup.add(this.chickenGroup);
  }

  createCat() {
    this.catGroup = new THREE.Group();
    this.catGroup.name = "cat";
    this.catGroup.position.set(0.45, 0.08, 0.25);

    // Saman balyası (Kedi bunun üzerinde oturuyor)
    const straw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.15), mat(0xffdd55, { roughness: 0.9 }));
    straw.position.y = -0.03;
    straw.castShadow = true;
    straw.receiveShadow = true;
    this.catGroup.add(straw);

    // Gövde (Turuncu kedi)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.1), mat(0xe67e22));
    body.position.y = 0.05;
    body.castShadow = true;
    this.catGroup.add(body);

    // Kafa
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), mat(0xe67e22));
    head.position.set(0, 0.1, 0.035);
    head.castShadow = true;
    this.catGroup.add(head);

    // Kulaklar (Külah/Kutu)
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.01), mat(0xe67e22));
    earL.position.set(-0.022, 0.13, 0.035);
    this.catGroup.add(earL);

    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.01), mat(0xe67e22));
    earR.position.set(0.022, 0.13, 0.035);
    this.catGroup.add(earR);

    // Kuyruk
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), mat(0xd35400));
    tail.position.set(0, 0.07, -0.06);
    tail.rotation.x = -0.4;
    this.catGroup.add(tail);

    this.barnGroup.add(this.catGroup);
  }

  createShiba() {
    this.shibaGroup = new THREE.Group();
    this.shibaGroup.name = "shiba-companion";
    this.shibaGroup.position.set(-0.15, 0.05, 0.45);
    this.shibaGroup.scale.setScalar(0.75);

    // Gövde (Turuncu kedi)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), mat(0xd27d2d));
    body.position.y = 0.04;
    body.castShadow = true;
    this.shibaGroup.add(body);

    // Kafa
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), mat(0xd27d2d));
    head.position.set(0, 0.11, 0.04);
    head.castShadow = true;
    this.shibaGroup.add(head);

    // Ağız/Burun (Beyaz)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), mat(0xffffff));
    snout.position.set(0, 0.095, 0.075);
    this.shibaGroup.add(snout);

    // Kulaklar
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.01), mat(0xd27d2d));
    earL.position.set(-0.03, 0.15, 0.03);
    this.shibaGroup.add(earL);

    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.01), mat(0xd27d2d));
    earR.position.set(0.03, 0.15, 0.03);
    this.shibaGroup.add(earR);

    this.shibaGroup.visible = false; // Başlangıçta görünmez (satın alınmadıysa)
    this.barnGroup.add(this.shibaGroup);
  }

  resume() {
    this.active = true;
    this.controls.enabled = true;
    this.bindInput();

    // Shiba satın alındıysa göster
    const petData = this.globalStorage.loadField("pet");
    if (petData && petData.purchased) {
      this.shibaGroup.visible = true;
    } else {
      this.shibaGroup.visible = false;
    }

    // Arka planı koyulaştır (Barn modu hissi)
    document.body.className = "is-running no-camera night-time";

    // Kamerayı geriden başlatıp pürüzsüzce odak noktasına getiren zoom-in
    this.camera.position.set(0, 3.5, 4.5);
    this.controls.target.set(0, 0.15, 0);
    this.controls.update();

    this.zoomAnimationProgress = 0;
    this.zoomAnimationStartPos = new THREE.Vector3(0, 3.5, 4.5);
    this.zoomAnimationTargetPos = new THREE.Vector3(0, 1.2, 1.9);
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

    const hits = this.raycaster.intersectObjects(this.barnGroup.children, true);
    if (hits.length === 0) return;

    // Tıklanan nesneyi bul
    let current = hits[0].object;
    let name = "";
    while (current && current !== this.scene) {
      if (current.name) {
        name = current.name;
        break;
      }
      current = current.parent;
    }

    if (name === "barn-door" || hits[0].object.name === "barn-door") {
      // Depoyu aç
      window.dispatchEvent(new CustomEvent("open-warehouse-panel"));
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: "Depo kapıları açıldı! 📦" } }));
      return;
    }

    if (name === "chicken") {
      // Tavuk etkileşimi
      this.interactWithChicken();
      return;
    }

    if (name === "cat") {
      this.interactWithCat();
      return;
    }

    if (name === "shiba-companion") {
      this.interactWithShiba();
      return;
    }
  }

  interactWithChicken() {
    // Tavuk sesi/toast
    window.dispatchEvent(new CustomEvent("toast", { detail: { text: "🐔 Gıd-gıd-gıdak! Tavuk yumurtlama çarpanı arttı!" } }));
    if (window.audioSystem) window.audioSystem.playChicken();
    // Tavuk hoplama animasyonu tetikle
    this.jumpAnimation(this.chickenGroup);
    
    // Küçük bir şansla coin veya XP ver
    window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 3, source: "chicken" } }));
  }

  interactWithCat() {
    window.dispatchEvent(new CustomEvent("toast", { detail: { text: "🐱 Miyav! Kedi şans eseri gizemli sandık bulma şansını arttırdı." } }));
    if (window.audioSystem) window.audioSystem.playCat();
    this.jumpAnimation(this.catGroup);
    window.dispatchEvent(new CustomEvent("xp-gain", { detail: { amount: 3, source: "cat" } }));
  }

  interactWithShiba() {
    // Shiba etkileşimi (Dostluk seviyesini arttır)
    const petData = this.globalStorage.loadField("pet") || {};
    let level = petData.friendshipLevel || 1;
    let xp = petData.friendshipXP || 0;
    
    xp += 15;
    const nextLevelXP = level * 100;
    let leveledUp = false;
    if (xp >= nextLevelXP) {
      xp -= nextLevelXP;
      level += 1;
      leveledUp = true;
    }

    this.globalStorage.saveField("pet", {
      purchased: true,
      friendshipLevel: level,
      friendshipXP: xp
    });

    if (window.audioSystem) window.audioSystem.playDog();
    this.jumpAnimation(this.shibaGroup);

    if (leveledUp) {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🎉 Shiba Dostluk Seviyesi Atladı! (Seviye ${level})` } }));
      window.dispatchEvent(new CustomEvent("pet-level-up", { detail: { level } }));
    } else {
      window.dispatchEvent(new CustomEvent("toast", { detail: { text: `🐕 Shiba: Hav! Dostluk +15 XP (${xp}/${nextLevelXP})` } }));
    }
  }

  jumpAnimation(group) {
    if (!group) return;
    const startY = group.position.y;
    let t = 0;
    const anim = () => {
      t += 0.15;
      group.position.y = startY + Math.sin(t) * 0.1;
      if (t < Math.PI) {
        requestAnimationFrame(anim);
      } else {
        group.position.y = startY;
      }
    };
    anim();
  }

  update(dt, realNow) {
    if (this.zoomAnimationProgress < 1) {
      this.zoomAnimationProgress += dt * 1.5;
      if (this.zoomAnimationProgress > 1) this.zoomAnimationProgress = 1;
      
      const t = this.zoomAnimationProgress;
      const easedT = t * t * (3 - 2 * t);
      
      this.camera.position.lerpVectors(this.zoomAnimationStartPos, this.zoomAnimationTargetPos, easedT);
    }

    if (this.controls) this.controls.update();

    this._time += dt;

    // Tavuk gagalamak/yürümek gibi hafif hareketler yapsın
    if (this.chickenGroup) {
      this.chickenGroup.rotation.y = Math.sin(this._time * 0.8) * 0.2;
      this.chickenGroup.position.y = 0.05 + Math.abs(Math.sin(this._time * 1.5)) * 0.005;
    }

    // Kedi kuyruk sallama
    if (this.catGroup) {
      const tail = this.catGroup.children.find(c => c.rotation.x !== 0); // Kuyruk objesi
      if (tail) {
        tail.rotation.z = Math.sin(this._time * 3) * 0.25;
      }
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
