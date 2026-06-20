import * as THREE from "three";
import { GameStorage } from "./storage.js";

const State = Object.freeze({ IDLE: 0, WALKING: 1 });

const ORANGE = 0xd27d2d;
const WHITE  = 0xffffff;
const BLACK  = 0x111111;
const GRAY   = 0x888888;
const PINK   = 0xffb6c1;
const COIN   = 0xffdd55;

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });

export class Pet {
  /**
   * @param {GameStorage} storage — merkezi depolama instance'ı
   * @param {string} petType — 'shiba' | 'cat'
   */
  constructor(storage, petType = "shiba") {
    this.group = new THREE.Group();
    this.group.name = `${petType}-companion`;
    this.petType = petType;
    this.state = State.IDLE;
    /** @type {GameStorage} */
    this._storage = storage;
    
    this.purchased = this.load();
    this.group.visible = this.purchased;

    this.walkTarget = null;
    this._time = 0;
    this._nextWanderTime = Date.now() + 5000;
    this._coinTimer = Date.now() + 15000;

    this.hasCoinBubble = false;
    this.coinMesh = null;
    this.bodyPivot = new THREE.Group();
    
    this.leftFrontLeg = null;
    this.rightFrontLeg = null;
    this.leftBackLeg = null;
    this.rightBackLeg = null;
    this.tail = null;

    // Dostluk verileri (Shiba ve Kedi için ayrı, load'da çekilir)
    this.friendshipLevel = 1;
    this.friendshipXP = 0;
    this._todayFeeds = 0; // Günlük besleme sayısı
    this._lastFeedDate = null;
    this.activeSkin = "default";
    this.goldSkinPurchased = false;

    this._build();
    this.group.add(this.bodyPivot);

    this.group.scale.setScalar(0.065);
    // Kedi ve Shiba'nın spawn noktaları çakışmasın
    if (petType === "shiba") {
      this.group.position.set(0.48, 0, -0.48);
    } else {
      this.group.position.set(-0.48, 0, 0.48);
    }
  }

  load() {
    const petData = this._storage.loadField("pet");
    if (petData && typeof petData === "object") {
      if (this.petType === "shiba") {
        this.friendshipLevel = Number(petData.friendshipLevel) || 1;
        this.friendshipXP = Number(petData.friendshipXP) || 0;
        this._todayFeeds = Number(petData.todayFeeds) || 0;
        this._lastFeedDate = petData.lastFeedDate || null;
        this.activeSkin = petData.activeSkin || "default";
        this.goldSkinPurchased = Boolean(petData.goldSkinPurchased);
        return Boolean(petData.purchased);
      } else {
        this.friendshipLevel = Number(petData.catFriendshipLevel) || 1;
        this.friendshipXP = Number(petData.catFriendshipXP) || 0;
        this._todayFeeds = Number(petData.catTodayFeeds) || 0;
        this._lastFeedDate = petData.catLastFeedDate || null;
        return Boolean(petData.catPurchased);
      }
    }
    return false;
  }

  save() {
    const petData = this._storage.loadField("pet") || {};
    if (this.petType === "shiba") {
      petData.purchased = this.purchased;
      petData.friendshipLevel = this.friendshipLevel;
      petData.friendshipXP = this.friendshipXP;
      petData.todayFeeds = this._todayFeeds;
      petData.lastFeedDate = this._lastFeedDate;
      petData.activeSkin = this.activeSkin;
      petData.goldSkinPurchased = this.goldSkinPurchased;
    } else {
      petData.catPurchased = this.purchased;
      petData.catFriendshipLevel = this.friendshipLevel;
      petData.catFriendshipXP = this.friendshipXP;
      petData.catTodayFeeds = this._todayFeeds;
      petData.catLastFeedDate = this._lastFeedDate;
    }
    this._storage.saveField("pet", petData);
  }

  purchase() {
    this.purchased = true;
    this.save();
    this.group.visible = true;
    this._coinTimer = Date.now() + 15000;
  }

  reset() {
    this.purchased = false;
    this.save();
    this.group.visible = false;
    this.state = State.IDLE;
    this.walkTarget = null;
    this.hasCoinBubble = false;
    if (this.coinMesh) {
      this.group.remove(this.coinMesh);
      this.coinMesh = null;
    }
    if (this.petType === "shiba") {
      this.group.position.set(0.48, 0, -0.48);
    } else {
      this.group.position.set(-0.48, 0, 0.48);
    }
  }

  setSkin(skinId) {
    this.activeSkin = skinId;
    this.save();
    
    // Model parçalarının materyallerini güncelle
    const isGold = skinId === "gold";
    const primaryColor = isGold ? 0xffd700 : ORANGE;
    const roughness = isGold ? 0.25 : 0.65;
    const metalness = isGold ? 0.75 : 0.0;
    
    this.group.traverse(c => {
      if (c.isMesh && c.name === "shiba-primary") {
        c.material.color.setHex(primaryColor);
        c.material.roughness = roughness;
        c.material.metalness = metalness;
      }
    });
  }

  _build() {
    if (this.petType === "shiba") {
      this._buildShiba();
    } else {
      this._buildCat();
    }
  }

  _buildShiba() {
    // Altın skin aktif mi kontrol et
    const isGold = this.activeSkin === "gold";
    const primaryColor = isGold ? 0xffd700 : ORANGE;
    const roughnessVal = isGold ? 0.25 : 0.65;
    const metalnessVal = isGold ? 0.75 : 0.0;

    const shibaMat = mat(primaryColor, { roughness: roughnessVal, metalness: metalnessVal });

    // Body (cylinder)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), shibaMat);
    body.name = "shiba-primary";
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.16;
    body.castShadow = true;
    this.bodyPivot.add(body);

    // White belly overlay
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.18, 8, 1, false, -Math.PI/2, Math.PI), mat(WHITE));
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, 0.158, 0);
    this.bodyPivot.add(belly);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.28, 0.14);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), shibaMat);
    head.name = "shiba-primary";
    head.castShadow = true;
    headGroup.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.05), mat(WHITE));
    snout.position.set(0, -0.02, 0.08);
    headGroup.add(snout);

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), mat(BLACK));
    nose.position.set(0, -0.01, 0.106);
    headGroup.add(nose);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.014, 6, 4);
    const le = new THREE.Mesh(eyeGeo, mat(BLACK));
    le.position.set(-0.045, 0.02, 0.08);
    headGroup.add(le);

    const re = new THREE.Mesh(eyeGeo, mat(BLACK));
    re.position.set(0.045, 0.02, 0.08);
    headGroup.add(re);

    // Ears (cones)
    const earGeo = new THREE.ConeGeometry(0.035, 0.07, 4);
    const leEar = new THREE.Mesh(earGeo, shibaMat);
    leEar.name = "shiba-primary";
    leEar.position.set(-0.065, 0.09, 0);
    leEar.rotation.z = -0.15;
    leEar.rotation.x = -0.1;
    headGroup.add(leEar);

    const reEar = new THREE.Mesh(earGeo, shibaMat);
    reEar.name = "shiba-primary";
    reEar.position.set(0.065, 0.09, 0);
    reEar.rotation.z = 0.15;
    reEar.rotation.x = -0.1;
    headGroup.add(reEar);

    // Inner ears (pinkish/white)
    const innerEarGeo = new THREE.ConeGeometry(0.022, 0.05, 4);
    const innerLe = new THREE.Mesh(innerEarGeo, mat(WHITE));
    innerLe.position.set(-0.058, 0.08, 0.008);
    innerLe.rotation.z = -0.15;
    innerLe.rotation.x = 0.05;
    headGroup.add(innerLe);

    const innerRe = new THREE.Mesh(innerEarGeo, mat(WHITE));
    innerRe.position.set(0.058, 0.08, 0.008);
    innerRe.rotation.z = 0.15;
    innerRe.rotation.x = 0.05;
    headGroup.add(innerRe);

    this.bodyPivot.add(headGroup);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.024, 0.02, 0.14, 8);
    
    this.leftFrontLeg = new THREE.Mesh(legGeo, shibaMat);
    this.leftFrontLeg.name = "shiba-primary";
    this.leftFrontLeg.position.set(-0.055, 0.07, 0.09);
    this.leftFrontLeg.castShadow = true;
    this.bodyPivot.add(this.leftFrontLeg);

    this.rightFrontLeg = new THREE.Mesh(legGeo, shibaMat);
    this.rightFrontLeg.name = "shiba-primary";
    this.rightFrontLeg.position.set(0.055, 0.07, 0.09);
    this.rightFrontLeg.castShadow = true;
    this.bodyPivot.add(this.rightFrontLeg);

    this.leftBackLeg = new THREE.Mesh(legGeo, shibaMat);
    this.leftBackLeg.name = "shiba-primary";
    this.leftBackLeg.position.set(-0.055, 0.07, -0.09);
    this.leftBackLeg.castShadow = true;
    this.bodyPivot.add(this.leftBackLeg);

    this.rightBackLeg = new THREE.Mesh(legGeo, shibaMat);
    this.rightBackLeg.name = "shiba-primary";
    this.rightBackLeg.position.set(0.055, 0.07, -0.09);
    this.rightBackLeg.castShadow = true;
    this.bodyPivot.add(this.rightBackLeg);

    // Tail (curled up cylinder)
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.24, -0.14);
    
    const tailSegment = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.12, 6), shibaMat);
    tailSegment.name = "shiba-primary";
    tailSegment.position.y = 0.05;
    tailSegment.rotation.x = -0.55;
    this.tail.add(tailSegment);
    this.bodyPivot.add(this.tail);

    // Enable shadows on all child meshes
    this.group.traverse(c => { if (c.isMesh) c.castShadow = true; });
  }

  _buildCat() {
    const catMat = mat(GRAY);

    // Body (cylinder)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 8), catMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.15;
    body.castShadow = true;
    this.bodyPivot.add(body);

    // White belly
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.16, 8, 1, false, -Math.PI/2, Math.PI), mat(WHITE));
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, 0.148, 0);
    this.bodyPivot.add(belly);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.27, 0.13);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), catMat);
    head.castShadow = true;
    headGroup.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.03), mat(WHITE));
    snout.position.set(0, -0.02, 0.075);
    headGroup.add(snout);

    // Nose (pink)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), mat(PINK));
    nose.position.set(0, -0.012, 0.09);
    headGroup.add(nose);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.012, 6, 4);
    const le = new THREE.Mesh(eyeGeo, mat(BLACK));
    le.position.set(-0.035, 0.015, 0.075);
    headGroup.add(le);

    const re = new THREE.Mesh(eyeGeo, mat(BLACK));
    re.position.set(0.035, 0.015, 0.075);
    headGroup.add(re);

    // Ears (sivri kedi kulakları)
    const earGeo = new THREE.ConeGeometry(0.026, 0.065, 4);
    const leEar = new THREE.Mesh(earGeo, catMat);
    leEar.position.set(-0.05, 0.08, 0);
    leEar.rotation.z = -0.1;
    headGroup.add(leEar);

    const reEar = new THREE.Mesh(earGeo, catMat);
    reEar.position.set(0.05, 0.08, 0);
    reEar.rotation.z = 0.1;
    headGroup.add(reEar);

    // Inner ears (pink)
    const innerEarGeo = new THREE.ConeGeometry(0.016, 0.045, 4);
    const innerLe = new THREE.Mesh(innerEarGeo, mat(PINK));
    innerLe.position.set(-0.046, 0.072, 0.005);
    innerLe.rotation.z = -0.1;
    headGroup.add(innerLe);

    const innerRe = new THREE.Mesh(innerEarGeo, mat(PINK));
    innerRe.position.set(0.046, 0.072, 0.005);
    innerRe.rotation.z = 0.1;
    headGroup.add(innerRe);

    this.bodyPivot.add(headGroup);

    // Legs (slightly thinner legs for the cat)
    const legGeo = new THREE.CylinderGeometry(0.018, 0.015, 0.13, 8);
    
    this.leftFrontLeg = new THREE.Mesh(legGeo, catMat);
    this.leftFrontLeg.position.set(-0.045, 0.065, 0.08);
    this.leftFrontLeg.castShadow = true;
    this.bodyPivot.add(this.leftFrontLeg);

    this.rightFrontLeg = new THREE.Mesh(legGeo, catMat);
    this.rightFrontLeg.position.set(0.045, 0.065, 0.08);
    this.rightFrontLeg.castShadow = true;
    this.bodyPivot.add(this.rightFrontLeg);

    this.leftBackLeg = new THREE.Mesh(legGeo, catMat);
    this.leftBackLeg.position.set(-0.045, 0.065, -0.08);
    this.leftBackLeg.castShadow = true;
    this.bodyPivot.add(this.leftBackLeg);

    this.rightBackLeg = new THREE.Mesh(legGeo, catMat);
    this.rightBackLeg.position.set(0.045, 0.065, -0.08);
    this.rightBackLeg.castShadow = true;
    this.bodyPivot.add(this.rightBackLeg);

    // Tail (dik kedi kuyruğu - tail)
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.22, -0.13);
    
    const tailSegment = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.16, 6), catMat);
    tailSegment.position.y = 0.08;
    tailSegment.rotation.x = 0.45; // dik kavisli duruş
    this.tail.add(tailSegment);
    this.bodyPivot.add(this.tail);

    // Enable shadows on all child meshes
    this.group.traverse(c => { if (c.isMesh) c.castShadow = true; });
  }

  spawnCoinBubble() {
    // Kedi de coin bubble spawn edebilir!
    if (this.hasCoinBubble) return;
    this.hasCoinBubble = true;

    // Create a golden spinning coin above head
    this.coinMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.015, 8, 24),
      new THREE.MeshStandardMaterial({ color: COIN, roughness: 0.12, metalness: 0.9 })
    );
    this.coinMesh.position.set(0, 0.55, 0);
    this.coinMesh.castShadow = true;
    this.group.add(this.coinMesh);
  }

  collectCoin() {
    if (!this.hasCoinBubble) return false;
    this.hasCoinBubble = false;
    
    if (this.coinMesh) {
      this.group.remove(this.coinMesh);
      this.coinMesh = null;
    }
    
    this._coinTimer = Date.now() + 30000; // Spawn again in 30 seconds
    return true;
  }

  update(dt) {
    if (!this.purchased) return;
    this._time += dt;

    // Check for coin bubble spawning
    if (!this.hasCoinBubble && Date.now() > this._coinTimer) {
      this.spawnCoinBubble();
    }

    // Spin coin bubble if active
    if (this.hasCoinBubble && this.coinMesh) {
      this.coinMesh.rotation.y += dt * 3.5;
      this.coinMesh.position.y = 0.55 + Math.sin(this._time * 3) * 0.025;
    }

    // Wander AI state machine
    switch (this.state) {
      case State.IDLE:
        this._idle();
        if (Date.now() > this._nextWanderTime) {
          this._startWandering();
        }
        break;
      case State.WALKING:
        this._walk(dt);
        break;
    }
  }

  _idle() {
    const t = this._time;
    // Gentle breathing
    this.bodyPivot.position.y = Math.sin(t * 2.5) * 0.004;
    // Cozy tail wagging
    if (this.tail) this.tail.rotation.z = Math.sin(t * 3.5) * 0.15;
    
    // Reset leg rotations
    if (this.leftFrontLeg) this.leftFrontLeg.rotation.x = 0;
    if (this.rightFrontLeg) this.rightFrontLeg.rotation.x = 0;
    if (this.leftBackLeg) this.leftBackLeg.rotation.x = 0;
    if (this.rightBackLeg) this.rightBackLeg.rotation.x = 0;
  }

  _startWandering() {
    const rx = (Math.random() - 0.5) * 1.05;
    const rz = (Math.random() - 0.5) * 1.05;
    this.walkTarget = new THREE.Vector3(rx, 0, rz);
    this.state = State.WALKING;
  }

  _walk(dt) {
    const speed = this.petType === "shiba" ? 0.38 : 0.44; // cats walk slightly faster
    const dir = this.walkTarget.clone().sub(this.group.position);
    dir.y = 0;
    const dist = dir.length();

    // Arrived?
    if (dist < 0.03) {
      this.group.position.set(this.walkTarget.x, 0, this.walkTarget.z);
      this.state = State.IDLE;
      this._idle();
      this._nextWanderTime = Date.now() + 10000 + Math.random() * 8000;
      return;
    }

    // Move to target
    dir.normalize();
    this.group.position.addScaledVector(dir, Math.min(speed * dt, dist));

    // Look at target
    this.group.lookAt(
      this.group.position.x + dir.x,
      0,
      this.group.position.z + dir.z
    );

    // Leg swing walk cycles
    const t = this._time;
    const swing = Math.sin(t * 14) * 0.32;
    if (this.leftFrontLeg)  this.leftFrontLeg.rotation.x  =  swing;
    if (this.rightFrontLeg) this.rightFrontLeg.rotation.x = -swing;
    if (this.leftBackLeg)   this.leftBackLeg.rotation.x   = -swing;
    if (this.rightBackLeg)  this.rightBackLeg.rotation.x  =  swing;

    if (this.tail) this.tail.rotation.z = Math.sin(t * 16) * 0.45;
    this.bodyPivot.position.y = Math.abs(Math.sin(t * 14)) * 0.015;
  }
}
