import * as THREE from "three";

/* ── Colour palette ──────────────────────────────────────────── */
const SKIN   = 0xf5c6a0;
const HAIR   = 0x5c3317;
const DRESS  = 0x4eb36a;
const APRON  = 0xf5ecd7;
const SHOE   = 0x5a3322;
const HAT    = 0xe8d17c;
const EYE    = 0x221108;
const CHEEK  = 0xf0a090;
const RIBBON = 0xc44040;
const MOUTH  = 0xd47070;
const WHITE  = 0xffffff;

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });

const State = Object.freeze({ IDLE: 0, WALKING: 1, HARVESTING: 2 });

export class Character {
  /**
   * @param {GameStorage} storage — merkezi depolama
   */
  constructor(storage = null) {
    this.group = new THREE.Group();
    this.state = State.IDLE;
    this.busy = false;
    this._storage = storage;

    // Seviye ve XP sistemi
    this.level = 1;
    this.xp = 0;
    this.loadXP();

    this._time = 0;
    this._harvestTime = 0;
    this._walkResolve = null;
    this._harvestResolve = null;
    this.walkTarget = null;

    /* animated sub-groups */
    this.pivot    = new THREE.Group();  /* whole body — used for bending */
    this.leftLeg  = null;
    this.rightLeg = null;
    this.leftArm  = null;
    this.rightArm = null;

    this._build();
    this.group.add(this.pivot);

    /* Enable shadows once */
    this.group.traverse(c => { if (c.isMesh) c.castShadow = true; });

    /* Scale down to farm size + starting position */
    this.group.scale.setScalar(0.075);
    this.group.position.set(-0.52, 0, 0.48);
  }

  loadXP() {
    if (!this._storage) return;
    this.level = Number(this._storage.loadField("level")) || 1;
    this.xp = Number(this._storage.loadField("xp")) || 0;
  }

  addXP(amount, source) {
    this.xp += amount;
    const nextLevelXP = this.level * 100;
    let leveledUp = false;

    if (this.xp >= nextLevelXP) {
      this.xp -= nextLevelXP;
      this.level += 1;
      leveledUp = true;
    }

    if (this._storage) {
      this._storage.saveField("level", this.level);
      this._storage.saveField("xp", this.xp);
    }

    window.dispatchEvent(new CustomEvent("xp-updated", {
      detail: {
        level: this.level,
        xp: this.xp,
        xpGained: amount,
        source,
        leveledUp
      }
    }));
  }

  /* ── Build the full chibi model ────────────────────────────── */
  _build() {
    this._buildLegs();
    this._buildBody();
    this._buildArms();
    this._buildHead();
  }

  /* ---- Legs ---- */
  _buildLegs() {
    this.leftLeg = this._leg();
    this.leftLeg.position.set(-0.065, 0.32, 0);
    this.pivot.add(this.leftLeg);

    this.rightLeg = this._leg();
    this.rightLeg.position.set(0.065, 0.32, 0);
    this.pivot.add(this.rightLeg);
  }

  _leg() {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.04, 0.38, 8), mat(SKIN)
    );
    g.add(leg);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.055, 0.11), mat(SHOE)
    );
    shoe.position.set(0, -0.19, 0.015);
    g.add(shoe);
    return g;
  }

  /* ---- Body / Dress ---- */
  _buildBody() {
    const dress = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.19, 0.48, 12), mat(DRESS)
    );
    dress.position.y = 0.84;
    this.pivot.add(dress);

    /* Apron */
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.28),
      mat(APRON, { side: THREE.DoubleSide })
    );
    apron.position.set(0, 0.82, 0.13);
    this.pivot.add(apron);
  }

  /* ---- Arms ---- */
  _buildArms() {
    this.leftArm = this._arm();
    this.leftArm.position.set(-0.18, 0.96, 0);
    this.pivot.add(this.leftArm);

    this.rightArm = this._arm();
    this.rightArm.position.set(0.18, 0.96, 0);
    this.pivot.add(this.rightArm);
  }

  _arm() {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.32, 8), mat(SKIN)
    );
    arm.position.y = -0.14;
    g.add(arm);

    /* round hand */
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 8, 6), mat(SKIN)
    );
    hand.position.y = -0.30;
    g.add(hand);
    return g;
  }

  /* ---- Head ---- */
  _buildHead() {
    const hg = new THREE.Group();
    hg.position.y = 1.26;

    /* head sphere */
    hg.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mat(SKIN)));

    /* hair (back hemisphere) */
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(HAIR)
    );
    hair.position.y = 0.04;
    hg.add(hair);

    /* ponytail */
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.018, 0.2, 8), mat(HAIR)
    );
    tail.position.set(0, -0.05, -0.15);
    tail.rotation.x = 0.35;
    hg.add(tail);

    /* ponytail ribbon */
    const tieRibbon = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.008, 6, 12), mat(RIBBON)
    );
    tieRibbon.position.set(0, -0.02, -0.16);
    tieRibbon.rotation.x = Math.PI / 2 + 0.35;
    hg.add(tieRibbon);

    /* eyes */
    const eGeo = new THREE.SphereGeometry(0.026, 8, 6);
    const eMat = mat(EYE);
    const le = new THREE.Mesh(eGeo, eMat);
    le.position.set(-0.06, 0.02, 0.155);
    hg.add(le);
    const re = new THREE.Mesh(eGeo, eMat);
    re.position.set(0.06, 0.02, 0.155);
    hg.add(re);

    /* eye highlights */
    const hlGeo = new THREE.SphereGeometry(0.01, 6, 4);
    const hlMat = new THREE.MeshBasicMaterial({ color: WHITE });
    const lhl = new THREE.Mesh(hlGeo, hlMat);
    lhl.position.set(-0.05, 0.035, 0.17);
    hg.add(lhl);
    const rhl = new THREE.Mesh(hlGeo, hlMat);
    rhl.position.set(0.07, 0.035, 0.17);
    hg.add(rhl);

    /* rosy cheeks */
    const cGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const cMat = mat(CHEEK, { transparent: true, opacity: 0.45 });
    const lc = new THREE.Mesh(cGeo, cMat);
    lc.position.set(-0.1, -0.025, 0.14);
    hg.add(lc);
    const rc = new THREE.Mesh(cGeo, cMat);
    rc.position.set(0.1, -0.025, 0.14);
    hg.add(rc);

    /* smile */
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 4, 0, Math.PI), mat(MOUTH)
    );
    mouth.position.set(0, -0.05, 0.16);
    mouth.rotation.x = -0.3;
    hg.add(mouth);

    /* straw hat — brim + top */
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.02, 16), mat(HAT)
    );
    brim.position.y = 0.15;
    hg.add(brim);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.11, 12), mat(HAT)
    );
    top.position.y = 0.21;
    hg.add(top);

    /* hat ribbon */
    const ribbon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.148, 0.148, 0.022, 14), mat(RIBBON)
    );
    ribbon.position.y = 0.165;
    hg.add(ribbon);

    this.pivot.add(hg);
  }

  /* ── Public API ─────────────────────────────────────────────── */

  reset() {
    this.state = State.IDLE;
    this.busy = false;
    this.walkTarget = null;
    this._walkResolve = null;
    this._harvestResolve = null;
    this.group.position.set(-0.52, 0, 0.48);
    this.group.rotation.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
  }

  /** Walk towards a world-space position. Returns a Promise that resolves on arrival. */
  walkTo(targetPos) {
    if (this.busy) return Promise.resolve();
    this.busy = true;

    return new Promise(resolve => {
      this.walkTarget = targetPos.clone();
      this.walkTarget.y = 0;
      this._walkResolve = resolve;
      this.state = State.WALKING;
    });
  }

  /** Play the harvest (bend-down) animation. Returns a Promise that resolves when done. */
  playHarvest() {
    return new Promise(resolve => {
      this._harvestResolve = resolve;
      this._harvestTime = 0;
      this.state = State.HARVESTING;
    });
  }

  /* ── Per-frame update (dt in seconds) ───────────────────────── */
  update(dt) {
    this._time += dt;

    switch (this.state) {
      case State.IDLE:       this._idle(); break;
      case State.WALKING:    this._walk(dt); break;
      case State.HARVESTING: this._harvest(dt); break;
    }
  }

  /* ── Animation states ───────────────────────────────────────── */

  _idle() {
    const t = this._time;
    /* gentle breathing bob */
    this.pivot.position.y = Math.sin(t * 2) * 0.008;
    this.pivot.rotation.x = 0;
    /* subtle arm sway */
    if (this.leftArm)  this.leftArm.rotation.x  = Math.sin(t * 1.5) * 0.04;
    if (this.rightArm) this.rightArm.rotation.x = Math.sin(t * 1.5 + Math.PI) * 0.04;
    /* legs straight */
    if (this.leftLeg)  this.leftLeg.rotation.x  = 0;
    if (this.rightLeg) this.rightLeg.rotation.x = 0;
  }

  _walk(dt) {
    const speed = 0.45; /* world-units / second */
    const dir = this.walkTarget.clone().sub(this.group.position);
    dir.y = 0;
    const dist = dir.length();

    /* Arrived? */
    if (dist < 0.025) {
      this.group.position.set(this.walkTarget.x, 0, this.walkTarget.z);
      this.state = State.IDLE;
      this._idle();
      if (this._walkResolve) { this._walkResolve(); this._walkResolve = null; }
      return;
    }

    /* Move towards target */
    dir.normalize();
    this.group.position.addScaledVector(dir, Math.min(speed * dt, dist));

    /* Face walk direction */
    this.group.lookAt(
      this.group.position.x + dir.x,
      0,
      this.group.position.z + dir.z
    );

    /* Walk cycle */
    const t = this._time;
    const swing = Math.sin(t * 10) * 0.45;
    if (this.leftLeg)  this.leftLeg.rotation.x  =  swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;
    if (this.leftArm)  this.leftArm.rotation.x  = -swing * 0.55;
    if (this.rightArm) this.rightArm.rotation.x =  swing * 0.55;
    this.pivot.position.y = Math.abs(Math.sin(t * 10)) * 0.025;
    this.pivot.rotation.x = 0;
  }

  _harvest(dt) {
    this._harvestTime += dt;
    const duration = 0.85;
    const p = Math.min(this._harvestTime / duration, 1);

    if (p >= 1) {
      /* Reset & resolve */
      this.pivot.rotation.x = 0;
      if (this.leftArm)  this.leftArm.rotation.x = 0;
      if (this.rightArm) this.rightArm.rotation.x = 0;
      this.state = State.IDLE;
      this.busy = false;
      if (this._harvestResolve) { this._harvestResolve(); this._harvestResolve = null; }
      return;
    }

    /* Three phases: bend down → hold → come back up */
    if (p < 0.35) {
      /* Bending down */
      this.pivot.rotation.x = (p / 0.35) * 0.55;
    } else if (p < 0.65) {
      /* Holding — arms reach */
      this.pivot.rotation.x = 0.55;
      if (this.leftArm)  this.leftArm.rotation.x = 0.75;
      if (this.rightArm) this.rightArm.rotation.x = 0.75;
    } else {
      /* Standing back up */
      const up = (p - 0.65) / 0.35;
      this.pivot.rotation.x = 0.55 * (1 - up);
      if (this.leftArm)  this.leftArm.rotation.x = 0.75 * (1 - up);
      if (this.rightArm) this.rightArm.rotation.x = 0.75 * (1 - up);
    }
  }
}
