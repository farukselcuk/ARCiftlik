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
    this._carpenterFigure = null;
    this._isProducing = false;
  }

  init() {
    // ── Sıcak Atölye Işıklandırması ──
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.5);
    this.scene.add(ambientLight);

    // Pencere ışığı (sağdan gelen gündüz ışığı)
    const windowLight = new THREE.DirectionalLight(0xffdcb4, 0.6);
    windowLight.position.set(3, 4, 2);
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.width = 1024;
    windowLight.shadow.mapSize.height = 1024;
    this.scene.add(windowLight);

    // Sahne arka plan rengi — koyu ahşap atölye atmosferi
    this.scene.background = new THREE.Color(0x1a1208);

    const workshopGroup = new THREE.Group();

    // ── ZEMİN: Ahşap döşeme tahtaları ──
    this._buildWoodFloor(workshopGroup);

    // ── DUVARLAR ──
    this._buildWalls(workshopGroup);

    // ── ÇATI ──
    this._buildRoof(workshopGroup);

    // ── ANA ÇALIŞMA TEZGAHI ──
    const workbench = this._createWorkbench();
    workbench.position.set(0, 0, -0.5);
    workshopGroup.add(workbench);

    // ── TESTERE İSTASYONU ──
    const sawStation = this._createSawStation();
    sawStation.position.set(-1.3, 0, 0.3);
    workshopGroup.add(sawStation);

    // ── ALET PANOSU ──
    const toolWall = this._createToolWall();
    toolWall.position.set(0, 1.2, -1.92);
    workshopGroup.add(toolWall);

    // ── KÜTÜK YIĞINI ──
    const logPile = this._createLogPile();
    logPile.position.set(1.5, 0, -1.3);
    workshopGroup.add(logPile);

    // ── SERGİ RAFI ──
    const displayShelf = this._createDisplayShelf();
    displayShelf.position.set(1.6, 0, 0.8);
    workshopGroup.add(displayShelf);

    // ── ASILI LAMBA ──
    const hangingLamp = this._createHangingLamp();
    hangingLamp.position.set(0, 2.0, -0.3);
    workshopGroup.add(hangingLamp);

    // ── TALAŞ VE KIYMIK ──
    this._scatterWoodChips(workshopGroup, 25);

    // ── MARANGOZ KARAKTERİ ──
    this._carpenterFigure = this._createCarpenterFigure();
    this._carpenterFigure.position.set(0.3, 0, -0.7);
    workshopGroup.add(this._carpenterFigure);

    this.scene.add(workshopGroup);

    // ── Kamera ve Kontroller ──
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.5, -0.3);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 4.0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.camera.position.set(0, 1.6, 3.8);
    this.controls.update();
  }

  // ── ZEMİN ──
  _buildWoodFloor(parent) {
    const floorGroup = new THREE.Group();
    for (let i = -4; i <= 4; i++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.02, 4),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x6B4423 : 0x7A5230,
          roughness: 0.95
        })
      );
      plank.position.set(i * 0.5, 0, 0);
      plank.receiveShadow = true;
      floorGroup.add(plank);
    }
    parent.add(floorGroup);
  }

  // ── DUVARLAR ──
  _buildWalls(parent) {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 });

    // Arka duvar
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.1), wallMat);
    backWall.position.set(0, 1.1, -2);
    backWall.receiveShadow = true;
    parent.add(backWall);

    // Sol duvar
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 4), wallMat);
    leftWall.position.set(-2, 1.1, 0);
    leftWall.receiveShadow = true;
    parent.add(leftWall);

    // Sağ duvar (yarım — pencere boşluğu bırakır)
    const rightWallTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 4), wallMat);
    rightWallTop.position.set(2, 1.8, 0);
    parent.add(rightWallTop);
    const rightWallBot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 4), wallMat);
    rightWallBot.position.set(2, 0.35, 0);
    parent.add(rightWallBot);
  }

  // ── ÇATI ──
  _buildRoof(parent) {
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3, 1.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x8B2500, roughness: 0.85 })
    );
    roof.position.y = 2.8;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    parent.add(roof);
  }

  // ── ANA ÇALIŞMA TEZGAHI ──
  _createWorkbench() {
    const bench = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5C3D1E, roughness: 0.85 });

    // Kalın tezgah üstü
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), woodMat);
    top.position.y = 0.55;
    top.castShadow = true;
    top.receiveShadow = true;
    bench.add(top);

    // Bacaklar
    const legPositions = [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]];
    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), darkWoodMat);
      leg.position.set(x, 0.275, z);
      leg.castShadow = true;
      bench.add(leg);
    });

    // Mengene (vise)
    const viseMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.08), viseMat);
    vise.position.set(-0.5, 0.64, 0.25);
    vise.castShadow = true;
    bench.add(vise);

    // Yarım işlenmiş tahta
    const wip = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.04, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xC4A35A })
    );
    wip.position.set(0.1, 0.61, 0);
    wip.rotation.y = 0.15;
    bench.add(wip);

    return bench;
  }

  // ── TESTERE İSTASYONU ──
  _createSawStation() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.28, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x4A4A4A, metalness: 0.5, roughness: 0.6 })
    );
    base.position.y = 0.25;
    base.castShadow = true;

    const bladeFrame = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.015, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 })
    );
    bladeFrame.position.y = 0.85;
    bladeFrame.castShadow = true;

    // Testere masası
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x6B4423, roughness: 0.9 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), tableMat);
    table.position.y = 0.52;
    table.castShadow = true;

    group.add(base, bladeFrame, table);
    return group;
  }

  // ── ALET PANOSU ──
  _createToolWall() {
    const group = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x6B4423, roughness: 0.85 })
    );
    board.receiveShadow = true;
    group.add(board);

    // Çekiç, testere, keski, anahtar siluetleri
    const tools = [
      { geo: new THREE.BoxGeometry(0.04, 0.25, 0.02), pos: [-0.55, 0, 0.04], color: 0x8B5E3C },
      { geo: new THREE.BoxGeometry(0.3, 0.04, 0.02), pos: [-0.2, 0.05, 0.04], color: 0x999999 },
      { geo: new THREE.ConeGeometry(0.03, 0.18, 6), pos: [0.1, 0, 0.04], color: 0xAA8855 },
      { geo: new THREE.BoxGeometry(0.05, 0.3, 0.02), pos: [0.4, 0, 0.04], color: 0x777777 },
      { geo: new THREE.BoxGeometry(0.04, 0.2, 0.02), pos: [0.6, -0.05, 0.04], color: 0x8B6914 },
    ];
    tools.forEach(t => {
      const mesh = new THREE.Mesh(t.geo, new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 }));
      mesh.position.set(...t.pos);
      group.add(mesh);
    });

    return group;
  }

  // ── KÜTÜK YIĞINI ──
  _createLogPile() {
    const group = new THREE.Group();
    const logMat = new THREE.MeshStandardMaterial({ color: 0x6B4423, roughness: 0.95 });
    for (let i = 0; i < 8; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.45, 10),
        logMat
      );
      log.rotation.z = Math.PI / 2;
      log.position.set(
        (i % 3) * 0.19 - 0.19,
        0.09 + Math.floor(i / 3) * 0.17,
        (Math.random() - 0.5) * 0.1
      );
      log.castShadow = true;
      group.add(log);
    }

    // Taze kesilmiş kütük üstü (açık renk)
    const freshLog = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: 0xC4A35A, roughness: 0.8 })
    );
    freshLog.rotation.z = Math.PI / 2;
    freshLog.position.set(0.1, 0.09, 0.25);
    freshLog.castShadow = true;
    group.add(freshLog);

    return group;
  }

  // ── SERGİ RAFI ──
  _createDisplayShelf() {
    const group = new THREE.Group();
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x7A5230, roughness: 0.85 });

    // Arka panel
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.03), shelfMat);
    backPanel.position.y = 0.5;
    group.add(backPanel);

    // Raf tahtaları
    [0.3, 0.6, 0.9].forEach(y => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.25), shelfMat);
      shelf.position.set(0, y, 0.1);
      shelf.castShadow = true;
      group.add(shelf);
    });

    // Raflarda ürünler — küçük kutu/mobilya parçaları
    const itemColors = [0xCD853F, 0xDEB887, 0x8B6914, 0xA0522D];
    const positions = [
      [-0.15, 0.35, 0.1], [0.12, 0.35, 0.1],
      [-0.1, 0.65, 0.1], [0.15, 0.65, 0.1],
      [0, 0.95, 0.1]
    ];
    positions.forEach((pos, i) => {
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 + Math.random() * 0.06, 0.06 + Math.random() * 0.04, 0.08),
        new THREE.MeshStandardMaterial({ color: itemColors[i % itemColors.length], roughness: 0.75 })
      );
      item.position.set(...pos);
      item.rotation.y = Math.random() * 0.3;
      item.castShadow = true;
      group.add(item);
    });

    return group;
  }

  // ── ASILI LAMBA ──
  _createHangingLamp() {
    const group = new THREE.Group();

    // Kordon
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    );
    cord.position.y = 0.3;
    group.add(cord);

    // Abajur
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.14, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, side: THREE.DoubleSide, roughness: 0.8 })
    );
    shade.rotation.x = Math.PI;
    shade.castShadow = true;
    group.add(shade);

    // Sıcak ışık
    const bulb = new THREE.PointLight(0xFFCC88, 1.2, 4);
    bulb.castShadow = true;
    group.add(bulb);

    // Küçük ampul görsel
    const bulbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFDD88 })
    );
    bulbMesh.position.y = -0.02;
    group.add(bulbMesh);

    return group;
  }

  // ── TALAŞ VE KIYMIKLAR ──
  _scatterWoodChips(parent, count) {
    for (let i = 0; i < count; i++) {
      const chip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03 + Math.random() * 0.05, 0.02 + Math.random() * 0.02),
        new THREE.MeshBasicMaterial({ color: 0xC9A876, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      chip.rotation.x = -Math.PI / 2;
      chip.rotation.z = Math.random() * Math.PI;
      chip.position.set(
        (Math.random() - 0.5) * 3,
        0.015,
        (Math.random() - 0.3) * 3
      );
      parent.add(chip);
    }
  }

  // ── MARANGOZ KARAKTERİ ──
  _createCarpenterFigure() {
    const figure = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xE8B888, roughness: 0.7 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }); // Deri önlük

    // Gövde
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8), clothMat);
    body.position.y = 0.4;
    body.castShadow = true;
    figure.add(body);

    // Kafa
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skinMat);
    head.position.y = 0.72;
    head.castShadow = true;
    figure.add(head);

    // Gözler
    const eyeGeo = new THREE.SphereGeometry(0.015, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.035, 0.74, 0.08);
    figure.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.035, 0.74, 0.08);
    figure.add(rightEye);

    // Bıyık
    const mustache = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.01, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x4a3520 })
    );
    mustache.position.set(0, 0.69, 0.08);
    figure.add(mustache);

    // Bacaklar
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.85 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 4, 6), legMat);
    leftLeg.position.set(-0.06, 0.12, 0);
    leftLeg.castShadow = true;
    figure.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 4, 6), legMat);
    rightLeg.position.set(0.06, 0.12, 0);
    rightLeg.castShadow = true;
    figure.add(rightLeg);

    // Sol kol (sabit)
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.25, 4, 6), skinMat);
    leftArm.position.set(-0.18, 0.42, 0);
    leftArm.rotation.z = 0.3;
    leftArm.castShadow = true;
    figure.add(leftArm);

    // Sağ kol — çekiç tutan (animasyonlu)
    const hammerArm = new THREE.Group();
    hammerArm.position.set(0.18, 0.5, 0);

    const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.25, 4, 6), skinMat);
    armMesh.position.y = -0.12;
    armMesh.castShadow = true;
    hammerArm.add(armMesh);

    // Çekiç
    const hammerHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.15, 6),
      new THREE.MeshStandardMaterial({ color: 0x6B4423 })
    );
    hammerHandle.position.set(0, -0.25, 0);
    hammerArm.add(hammerHandle);

    const hammerHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.035, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 })
    );
    hammerHead.position.set(0, -0.32, 0);
    hammerArm.add(hammerHead);

    hammerArm.rotation.z = -0.3;
    figure.add(hammerArm);
    figure.userData.hammerArm = hammerArm;

    return figure;
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

  /**
   * Üretim durumunu ayarla — marangoz çekiç sallasın mı?
   * main.js'den çağrılabilir: carpenterScene.setProducing(true/false)
   */
  setProducing(isProducing) {
    this._isProducing = isProducing;
  }

  update(dt, realNow) {
    if (!this.active) return;
    this._time += dt;
    if (this.controls) this.controls.update();

    // Marangoz çekiç animasyonu (üretim sırasında)
    if (this._carpenterFigure && this._carpenterFigure.userData.hammerArm) {
      const arm = this._carpenterFigure.userData.hammerArm;
      if (this._isProducing) {
        // Çekiç sallama animasyonu
        arm.rotation.z = -0.3 + Math.sin(Date.now() * 0.008) * 0.4;
      } else {
        // Boşta hafif sallanma
        arm.rotation.z = -0.3 + Math.sin(this._time * 1.5) * 0.05;
      }
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
