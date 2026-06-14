import * as THREE from "three";

export const CROP_TYPES = {
  wheat: {
    id: "wheat",
    name: "Wheat",
    growTime: 60_000,
    cost: 10,
    reward: 25,
    readyColor: 0xf3ce3d
  },
  corn: {
    id: "corn",
    name: "Corn",
    growTime: 120_000,
    cost: 15,
    reward: 35,
    readyColor: 0xffd84d
  },
  strawberry: {
    id: "strawberry",
    name: "Strawberry",
    growTime: 90_000,
    cost: 20,
    reward: 50,
    readyColor: 0xe94042
  },
  sunflower: {
    id: "sunflower",
    name: "Sunflower",
    growTime: 180_000,
    cost: 25,
    reward: 70,
    readyColor: 0xffd33f
  }
};

const materials = {
  seed: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.9 }),
  sprout: new THREE.MeshStandardMaterial({ color: 0x47a85f, roughness: 0.85 }),
  wheat: new THREE.MeshStandardMaterial({ color: CROP_TYPES.wheat.readyColor, roughness: 0.72 }),
  cornLeaf: new THREE.MeshStandardMaterial({ color: 0x31985b, roughness: 0.78 }),
  cornCob: new THREE.MeshStandardMaterial({ color: CROP_TYPES.corn.readyColor, roughness: 0.7 }),
  strawberry: new THREE.MeshStandardMaterial({ color: CROP_TYPES.strawberry.readyColor, roughness: 0.65 }),
  sunflowerStem: new THREE.MeshStandardMaterial({ color: 0x2f8f51, roughness: 0.78 }),
  sunflowerPetal: new THREE.MeshStandardMaterial({ color: CROP_TYPES.sunflower.readyColor, roughness: 0.66 }),
  sunflowerCenter: new THREE.MeshStandardMaterial({ color: 0x6b4220, roughness: 0.9 })
};

export function getStage(progress) {
  if (progress >= 1) return 3;
  if (progress >= 0.5) return 2;
  return 1;
}

export function createCropMesh(cropId, stage) {
  if (stage === 1) return createSeed();
  if (stage === 2) return createSprout();

  if (cropId === "corn") return createCorn();
  if (cropId === "strawberry") return createStrawberry();
  if (cropId === "sunflower") return createSunflower();
  return createWheat();
}

function createSeed() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), materials.seed);
  mesh.position.y = 0.035;
  return mesh;
}

function createSprout() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 12), materials.sprout);
  stem.position.y = 0.06;
  group.add(stem);
  return group;
}

function createWheat() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.24, 8), materials.wheat);
    const angle = (i / 5) * Math.PI * 2;
    stalk.position.set(Math.cos(angle) * 0.035, 0.12, Math.sin(angle) * 0.035);
    stalk.rotation.z = Math.sin(angle) * 0.16;
    group.add(stalk);
  }
  return group;
}

function createCorn() {
  const group = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.26, 12), materials.cornLeaf);
  stalk.position.y = 0.13;
  group.add(stalk);

  const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.13, 14), materials.cornCob);
  cob.position.set(0.034, 0.16, 0);
  cob.rotation.z = Math.PI * 0.12;
  group.add(cob);
  return group;
}

function createStrawberry() {
  const group = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12), materials.strawberry);
  berry.scale.set(1, 0.78, 0.92);
  berry.position.y = 0.065;
  group.add(berry);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.045, 6), materials.sprout);
  cap.position.y = 0.13;
  cap.rotation.x = Math.PI;
  group.add(cap);
  return group;
}

function createSunflower() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.32, 12), materials.sunflowerStem);
  stem.position.y = 0.16;
  group.add(stem);

  const bloom = new THREE.Group();
  bloom.position.y = 0.34;
  for (let i = 0; i < 8; i += 1) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), materials.sunflowerPetal);
    const angle = (i / 8) * Math.PI * 2;
    petal.scale.set(1.4, 0.55, 0.28);
    petal.position.set(Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, 0);
    bloom.add(petal);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), materials.sunflowerCenter);
  center.scale.z = 0.45;
  bloom.add(center);
  group.add(bloom);
  return group;
}
