import * as THREE from "three";

export const CROP_TYPES = {
  wheat: {
    id: "wheat",
    name: "Buğday",
    growTime: 60_000,
    cost: 10,
    reward: 25,
    readyColor: 0xf3ce3d,
    unlockedAt: 1,
    seasons: ["all"]
  },
  corn: {
    id: "corn",
    name: "Mısır",
    growTime: 120_000,
    cost: 15,
    reward: 35,
    readyColor: 0xffd84d,
    unlockedAt: 1,
    seasons: ["all"]
  },
  carrot: {
    id: "carrot",
    name: "Havuç",
    growTime: 75_000,
    cost: 12,
    reward: 28,
    readyColor: 0xff6b35,
    unlockedAt: 1,
    seasons: ["spring", "autumn"]
  },
  strawberry: {
    id: "strawberry",
    name: "Çilek",
    growTime: 90_000,
    cost: 20,
    reward: 50,
    readyColor: 0xe94042,
    unlockedAt: 3,
    seasons: ["all"]
  },
  potato: {
    id: "potato",
    name: "Patates",
    growTime: 100_000,
    cost: 18,
    reward: 42,
    readyColor: 0xc4a35a,
    unlockedAt: 4,
    seasons: ["all"]
  },
  sunflower: {
    id: "sunflower",
    name: "Ayçiçeği",
    growTime: 180_000,
    cost: 25,
    reward: 70,
    readyColor: 0xffd33f,
    unlockedAt: 5,
    seasons: ["all"]
  },
  tomato: {
    id: "tomato",
    name: "Domates",
    growTime: 80_000,
    cost: 14,
    reward: 32,
    readyColor: 0xff4444,
    unlockedAt: 6,
    seasons: ["summer"]
  },
  pumpkin: {
    id: "pumpkin",
    name: "Kabak",
    growTime: 150_000,
    cost: 22,
    reward: 58,
    readyColor: 0xff8c00,
    unlockedAt: 7,
    seasons: ["autumn"]
  },
  blueberry: {
    id: "blueberry",
    name: "Yaban Mersini",
    growTime: 200_000,
    cost: 30,
    reward: 80,
    readyColor: 0x4a90d9,
    unlockedAt: 9,
    seasons: ["summer"]
  },
  oak_tree: {
    id: "oak_tree",
    name: "Meşe Ağacı",
    growTime: 240_000,
    cost: 40,
    reward: 0,
    readyColor: 0x2e5c1e,
    unlockedAt: 3,
    seasons: ["all"],
    isTree: true
  },
  pine_tree: {
    id: "pine_tree",
    name: "Çam Ağacı",
    growTime: 360_000,
    cost: 60,
    reward: 0,
    readyColor: 0x1d3c1f,
    unlockedAt: 4,
    seasons: ["all"],
    isTree: true
  }
};

export const GOLDEN_CHANCE = 0.01;

// Altın bitki materyali
const goldenMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  emissive: 0x886600,
  roughness: 0.15,
  metalness: 0.95
});

// Three.js materyaller (paylaşımlı)
const materials = {
  seed: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.9 }),
  sprout: new THREE.MeshStandardMaterial({ color: 0x47a85f, roughness: 0.85 }),
  wheat: new THREE.MeshStandardMaterial({ color: CROP_TYPES.wheat.readyColor, roughness: 0.72 }),
  cornLeaf: new THREE.MeshStandardMaterial({ color: 0x31985b, roughness: 0.78 }),
  cornCob: new THREE.MeshStandardMaterial({ color: CROP_TYPES.corn.readyColor, roughness: 0.7 }),
  strawberry: new THREE.MeshStandardMaterial({ color: CROP_TYPES.strawberry.readyColor, roughness: 0.65 }),
  sunflowerStem: new THREE.MeshStandardMaterial({ color: 0x2f8f51, roughness: 0.78 }),
  sunflowerPetal: new THREE.MeshStandardMaterial({ color: CROP_TYPES.sunflower.readyColor, roughness: 0.66 }),
  sunflowerCenter: new THREE.MeshStandardMaterial({ color: 0x6b4220, roughness: 0.9 }),
  withered: new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.95 }),
  
  // Yeni ürün materyalleri
  carrot: new THREE.MeshStandardMaterial({ color: CROP_TYPES.carrot.readyColor, roughness: 0.7 }),
  potato: new THREE.MeshStandardMaterial({ color: CROP_TYPES.potato.readyColor, roughness: 0.85 }),
  tomato: new THREE.MeshStandardMaterial({ color: CROP_TYPES.tomato.readyColor, roughness: 0.6 }),
  pumpkin: new THREE.MeshStandardMaterial({ color: CROP_TYPES.pumpkin.readyColor, roughness: 0.72 }),
  blueberry: new THREE.MeshStandardMaterial({ color: CROP_TYPES.blueberry.readyColor, roughness: 0.68 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }),
  oakLeaf: new THREE.MeshStandardMaterial({ color: 0x2e5c1e, roughness: 0.85 }),
  pineLeaf: new THREE.MeshStandardMaterial({ color: 0x1d3c1f, roughness: 0.85 })
};

// Geometri detay seviyesi helper'ı
function getSegments(type) {
  const quality = window.performanceQuality || "high";
  const QUALITY_SEGMENTS = {
    high:   { sphere: 14, cylinder: 12, cone: 10 },
    medium: { sphere: 8,  cylinder: 8,  cone: 6  },
    low:    { sphere: 6,  cylinder: 6,  cone: 4  }
  };
  const seg = QUALITY_SEGMENTS[quality] || QUALITY_SEGMENTS.high;
  return seg[type] || 8;
}

export function getStage(progress) {
  if (progress >= 2) return 4;
  if (progress >= 1) return 3;
  if (progress >= 0.5) return 2;
  return 1;
}

export function createCropMesh(cropId, stage) {
  if (stage === 1) return createSeed();
  if (stage === 2) return createSprout();
  if (stage === 4) return createWithered();

  if (cropId === "corn") return createCorn();
  if (cropId === "strawberry") return createStrawberry();
  if (cropId === "sunflower") return createSunflower();
  if (cropId === "carrot") return createCarrot();
  if (cropId === "potato") return createPotato();
  if (cropId === "tomato") return createTomato();
  if (cropId === "pumpkin") return createPumpkin();
  if (cropId === "blueberry") return createBlueberry();
  if (cropId === "oak_tree") return createOakTree();
  if (cropId === "pine_tree") return createPineTree();
  return createWheat();
}

/** Altın parıldayan ürün mesh'i oluşturur */
export function createGoldenCropMesh(cropId) {
  const mesh = createCropMesh(cropId, 3);
  mesh.traverse((child) => {
    if (child.isMesh) {
      child.material = goldenMaterial;
    }
  });
  return mesh;
}

function createWithered() {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, getSegments("cone")), materials.withered);
  mesh.position.y = 0.05;
  mesh.rotation.x = Math.PI / 8; // Hafif eğik durur
  return mesh;
}

function createSeed() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, getSegments("sphere"), getSegments("sphere") - 4), materials.seed);
  mesh.position.y = 0.035;
  return mesh;
}

function createSprout() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, getSegments("cone")), materials.sprout);
  stem.position.y = 0.06;
  group.add(stem);
  return group;
}

function createWheat() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.24, getSegments("cylinder")), materials.wheat);
    const angle = (i / 5) * Math.PI * 2;
    stalk.position.set(Math.cos(angle) * 0.035, 0.12, Math.sin(angle) * 0.035);
    stalk.rotation.z = Math.sin(angle) * 0.16;
    group.add(stalk);
  }
  return group;
}

function createCorn() {
  const group = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.26, getSegments("cylinder")), materials.cornLeaf);
  stalk.position.y = 0.13;
  group.add(stalk);

  const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.13, getSegments("cylinder")), materials.cornCob);
  cob.position.set(0.034, 0.16, 0);
  cob.rotation.z = Math.PI * 0.12;
  group.add(cob);
  return group;
}

function createStrawberry() {
  const group = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.07, getSegments("sphere"), getSegments("sphere") - 4), materials.strawberry);
  berry.scale.set(1, 0.78, 0.92);
  berry.position.y = 0.065;
  group.add(berry);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.045, getSegments("cone")), materials.sprout);
  cap.position.y = 0.13;
  cap.rotation.x = Math.PI;
  group.add(cap);
  return group;
}

function createSunflower() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.32, getSegments("cylinder")), materials.sunflowerStem);
  stem.position.y = 0.16;
  group.add(stem);

  const bloom = new THREE.Group();
  bloom.position.y = 0.34;
  for (let i = 0; i < 8; i += 1) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.038, getSegments("sphere") - 4, getSegments("sphere") - 6), materials.sunflowerPetal);
    const angle = (i / 8) * Math.PI * 2;
    petal.scale.set(1.4, 0.55, 0.28);
    petal.position.set(Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, 0);
    bloom.add(petal);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.042, getSegments("sphere"), getSegments("sphere") - 4), materials.sunflowerCenter);
  center.scale.z = 0.45;
  bloom.add(center);
  group.add(bloom);
  return group;
}

function createCarrot() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, getSegments("cone")), materials.carrot);
  body.rotation.x = Math.PI;
  body.position.y = 0.05;
  group.add(body);

  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, getSegments("cone")), materials.sprout);
  leaf.position.y = 0.105;
  group.add(leaf);
  return group;
}

function createPotato() {
  const group = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, getSegments("sphere") - 4, getSegments("sphere") - 6), materials.potato);
  p1.scale.set(1.3, 0.9, 1);
  p1.position.set(-0.02, 0.015, -0.01);
  group.add(p1);

  const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.024, getSegments("sphere") - 4, getSegments("sphere") - 6), materials.potato);
  p2.scale.set(1.2, 0.8, 1);
  p2.position.set(0.02, 0.012, 0.015);
  group.add(p2);
  return group;
}

function createTomato() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, getSegments("cylinder")), materials.sprout);
  stem.position.y = 0.09;
  group.add(stem);

  const tomatoGeo = new THREE.SphereGeometry(0.022, getSegments("sphere") - 4, getSegments("sphere") - 6);
  const t1 = new THREE.Mesh(tomatoGeo, materials.tomato);
  t1.position.set(-0.025, 0.12, 0.01);
  group.add(t1);

  const t2 = new THREE.Mesh(tomatoGeo, materials.tomato);
  t2.position.set(0.025, 0.08, -0.01);
  group.add(t2);
  return group;
}

function createPumpkin() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.068, getSegments("sphere"), getSegments("sphere") - 4), materials.pumpkin);
  body.scale.set(1.2, 0.95, 1.2);
  body.position.y = 0.05;
  group.add(body);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.03, getSegments("cylinder")), materials.sprout);
  stem.position.set(0, 0.11, 0);
  stem.rotation.z = 0.2;
  group.add(stem);
  return group;
}

function createBlueberry() {
  const group = new THREE.Group();
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.08, getSegments("sphere"), getSegments("sphere") - 4), materials.sprout);
  bush.scale.set(1.1, 0.8, 1.1);
  bush.position.y = 0.06;
  group.add(bush);

  const bGeo = new THREE.SphereGeometry(0.012, getSegments("sphere") - 6, getSegments("sphere") - 8);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(bGeo, materials.blueberry);
    const angle = (i / 6) * Math.PI * 2;
    b.position.set(
      Math.cos(angle) * 0.055,
      0.05 + Math.random() * 0.04,
      Math.sin(angle) * 0.055
    );
    group.add(b);
  }
  return group;
}

function createOakTree() {
  const group = new THREE.Group();
  
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.28, getSegments("cylinder")),
    materials.trunk
  );
  trunk.position.y = 0.14;
  group.add(trunk);
  
  // Oak leaves (layered spheres)
  const foliage = new THREE.Group();
  foliage.position.y = 0.26;
  
  const sphere1 = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, getSegments("sphere"), getSegments("sphere") - 4),
    materials.oakLeaf
  );
  sphere1.position.set(0, 0.04, 0);
  foliage.add(sphere1);

  const sphere2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, getSegments("sphere"), getSegments("sphere") - 4),
    materials.oakLeaf
  );
  sphere2.position.set(-0.04, 0.08, 0.02);
  foliage.add(sphere2);

  const sphere3 = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, getSegments("sphere"), getSegments("sphere") - 4),
    materials.oakLeaf
  );
  sphere3.position.set(0.03, 0.08, -0.03);
  foliage.add(sphere3);

  group.add(foliage);
  return group;
}

function createPineTree() {
  const group = new THREE.Group();
  
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.028, 0.32, getSegments("cylinder")),
    materials.trunk
  );
  trunk.position.y = 0.16;
  group.add(trunk);
  
  // Pine leaves (conic layers)
  const foliage = new THREE.Group();
  foliage.position.y = 0.16;
  
  const cone1 = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.14, getSegments("cone")),
    materials.pineLeaf
  );
  cone1.position.y = 0.08;
  foliage.add(cone1);

  const cone2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.12, getSegments("cone")),
    materials.pineLeaf
  );
  cone2.position.y = 0.16;
  foliage.add(cone2);

  const cone3 = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.09, getSegments("cone")),
    materials.pineLeaf
  );
  cone3.position.y = 0.23;
  foliage.add(cone3);

  group.add(foliage);
  return group;
}
