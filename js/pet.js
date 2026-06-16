import * as THREE from "three";
import { GameStorage } from "./storage.js";

const State = Object.freeze({ IDLE: 0, WALKING: 1 });

const ORANGE = 0xd27d2d;
const WHITE  = 0xffffff;
const BLACK  = 0x111111;
const COIN   = 0xffdd55;

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });

export class Pet {
  /**
   * @param {GameStorage} storage — merkezi depolama instance'ı
   */
  constructor(storage) {
    this.group = new THREE.Group();
    this.group.name = "shiba-companion";
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

    // Dostluk seviyesi (Faz 7)
    this.friendshipLevel = 1;
    this.friendshipXP = 0;
    this._todayInteractions = 0;
    this._lastInteractionDate = null;

    this._build();
    this.group.add(this.bodyPivot);

    this.group.scale.setScalar(0.065);
    this.group.position.set(0.48, 0, -0.48);
  }

  load() {
    const petData = this._storage.loadField("pet");
    if (petData && typeof petData === "object") {
      // Dostluk verilerini de yükle
      this.friendshipLevel = Number(petData.friendshipLevel) || 1;
      this.friendshipXP = Number(petData.friendshipXP) || 0;
      return Boolean(petData.purchased);
    }
    return false;
  }

  save() {
    this._storage.saveField("pet", {
      purchased: this.purchased,
      friendshipLevel: this.friendshipLevel,
      friendshipXP: this.friendshipXP
    });
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
    this.group.position.set(0.48, 0, -0.48);
  }

  _build() {
    // Body (cylinder)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), mat(ORANGE));
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

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat(ORANGE));
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
    const leEar = new THREE.Mesh(earGeo, mat(ORANGE));
    leEar.position.set(-0.065, 0.09, 0);
    leEar.rotation.z = -0.15;
    leEar.rotation.x = -0.1;
    headGroup.add(leEar);

    const reEar = new THREE.Mesh(earGeo, mat(ORANGE));
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
    
    this.leftFrontLeg = new THREE.Mesh(legGeo, mat(ORANGE));
    this.leftFrontLeg.position.set(-0.055, 0.07, 0.09);
    this.leftFrontLeg.castShadow = true;
    this.bodyPivot.add(this.leftFrontLeg);

    this.rightFrontLeg = new THREE.Mesh(legGeo, mat(ORANGE));
    this.rightFrontLeg.position.set(0.055, 0.07, 0.09);
    this.rightFrontLeg.castShadow = true;
    this.bodyPivot.add(this.rightFrontLeg);

    this.leftBackLeg = new THREE.Mesh(legGeo, mat(ORANGE));
    this.leftBackLeg.position.set(-0.055, 0.07, -0.09);
    this.leftBackLeg.castShadow = true;
    this.bodyPivot.add(this.leftBackLeg);

    this.rightBackLeg = new THREE.Mesh(legGeo, mat(ORANGE));
    this.rightBackLeg.position.set(0.055, 0.07, -0.09);
    this.rightBackLeg.castShadow = true;
    this.bodyPivot.add(this.rightBackLeg);

    // Tail (curled up cylinder)
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.24, -0.14);
    
    const tailSegment = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.12, 6), mat(ORANGE));
    tailSegment.position.y = 0.05;
    tailSegment.rotation.x = -0.55;
    this.tail.add(tailSegment);
    this.bodyPivot.add(this.tail);

    // Enable shadows on all child meshes
    this.group.traverse(c => { if (c.isMesh) c.castShadow = true; });
  }

  spawnCoinBubble() {
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
    // Pick a random grid position on the tilled farm space.
    // The farm grid goes from -0.52 to +0.52 in X and Z.
    // Let's generate a random target within bounds
    const rx = (Math.random() - 0.5) * 1.05;
    const rz = (Math.random() - 0.5) * 1.05;
    this.walkTarget = new THREE.Vector3(rx, 0, rz);
    this.state = State.WALKING;
  }

  _walk(dt) {
    const speed = 0.38; // units per second
    const dir = this.walkTarget.clone().sub(this.group.position);
    dir.y = 0;
    const dist = dir.length();

    // Arrived?
    if (dist < 0.03) {
      this.group.position.set(this.walkTarget.x, 0, this.walkTarget.z);
      this.state = State.IDLE;
      this._idle();
      this._nextWanderTime = Date.now() + 10000 + Math.random() * 8000; // Wander again in 10-18 seconds
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
