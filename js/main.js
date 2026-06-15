import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Farm } from "./farm.js";
import { GameUI } from "./ui.js";
import { Character } from "./character.js";
import { Inventory } from "./inventory.js";
import { Orders } from "./orders.js";
import { CROP_TYPES } from "./crops.js";
import { Pet } from "./pet.js";

/* ── Platform detection ─────────────────────────────────────────── */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const sceneRoot = document.querySelector("#scene-root");
const startButton = document.querySelector("#start-ar");
const cameraFeed = document.querySelector("#camera-feed");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = false; /* WebXR disabled — universal camera+orbit mode used instead */
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneRoot.appendChild(renderer.domElement);

const farm = new Farm();
const ui = new GameUI();
const character = new Character();
const inventory = new Inventory();
const orders = new Orders();
const pet = new Pet();
farm.group.add(character.group);
farm.group.add(pet.group);
scene.add(farm.group);

const reticle = createReticle();
scene.add(reticle);

let started = false;
let cameraStream = null;
let orbitControls = null;
let pointerDownPos = null;
const TAP_THRESHOLD = 12; /* px — movement below this is a tap, above is an orbit drag */

const harvestQueue = [];
const queuedPlots = new Set();

let ambientLight = null;
let sunLight = null;
let firefliesGroup = null;

setupLights();
setupFireflies();
bindEvents();
renderer.setAnimationLoop(render);

function setupLights() {
  ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.position.set(1.2, 2.8, 1.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  scene.add(sunLight);

  /* Ground plane visible only in fallback mode for depth reference */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1a2e24,
      roughness: 0.95,
      transparent: true,
      opacity: 0.55
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.005;
  ground.receiveShadow = true;
  ground.name = "fallback-ground";
  ground.visible = false;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(2.4, 18, 0x3a5c4a, 0x2a4638);
  gridHelper.position.y = -0.003;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.32;
  gridHelper.name = "fallback-grid";
  gridHelper.visible = false;
  scene.add(gridHelper);
}

let zoomInterval = null;

function startZooming(factor) {
  if (zoomInterval) clearInterval(zoomInterval);
  zoomCamera(factor);
  zoomInterval = setInterval(() => {
    zoomCamera(factor);
  }, 80);
}

function stopZooming() {
  if (zoomInterval) {
    clearInterval(zoomInterval);
    zoomInterval = null;
  }
}

function bindEvents() {
  startButton.addEventListener("click", handleStartTap);
  ui.onReset = () => {
    farm.resetPlacement();
    reticle.visible = false;
    document.body.classList.remove("has-farm");
    ui.refillIfStuck();

    // Clear harvest queue & reset character
    harvestQueue.length = 0;
    queuedPlots.clear();
    character.reset();

    // Reset unlocked plots, inventory, orders, and pet
    farm.resetUnlockedPlots();
    inventory.reset();
    orders.reset();
    pet.reset();
    
    updateMarketUI();
    updateMarketSellList();
    updateOrdersUI();

    farm.setPreviewPlacement();
    document.body.classList.add("has-farm");
    if (orbitControls) {
      orbitControls.target.set(0, 0.08, 0);
      camera.position.set(0, 1.3, 1.8);
      orbitControls.update();
    }
  };

  ui.onCoinsChange = () => {
    updateMarketUI();
    updateMarketSellList();
    updateOrdersUI();
  };

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  // Press-and-hold zoom functionality
  const zoomInBtn = document.querySelector("#zoom-in");
  const zoomOutBtn = document.querySelector("#zoom-out");

  zoomInBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(0.95); });
  zoomInBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
  zoomInBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
  zoomInBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });
  zoomInBtn.addEventListener("click", (e) => e.preventDefault());

  zoomOutBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); startZooming(1.05); });
  zoomOutBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); stopZooming(); });
  zoomOutBtn.addEventListener("pointerleave", (e) => { e.stopPropagation(); stopZooming(); });
  zoomOutBtn.addEventListener("pointercancel", (e) => { e.stopPropagation(); stopZooming(); });
  zoomOutBtn.addEventListener("click", (e) => e.preventDefault());

  // Market Modal bindings
  const marketPanel = document.querySelector("#market-panel");
  const openMarketBtn = document.querySelector("#open-market");
  const closeMarketBtn = document.querySelector("#close-market");
  const buyPlotBtn = document.querySelector("#buy-plot");

  openMarketBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    updateMarketUI();
    updateMarketSellList();
    marketPanel.classList.add("is-visible");
  });

  closeMarketBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    marketPanel.classList.remove("is-visible");
  });

  marketPanel.addEventListener("click", (e) => {
    if (e.target === marketPanel) {
      marketPanel.classList.remove("is-visible");
    }
  });

  buyPlotBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const count = farm.unlockedPlotsCount;
    if (count >= 16) return;

    const price = 50 * (count - 1);
    if (ui.coins >= price) {
      ui.updateCoins(-price);
      const success = farm.unlockPlot();
      if (success) {
        ui.showToast("New plot expanded!");
        updateMarketUI();
      }
    } else {
      ui.showToast("Need more coins!");
    }
  });

  const buyPetBtn = document.querySelector("#buy-pet");
  buyPetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pet.purchased) return;
    const petCost = 150;
    if (ui.coins >= petCost) {
      ui.updateCoins(-petCost);
      pet.purchase();
      ui.showToast("Shiba companion unlocked! 🐕");
      updateMarketUI();
    } else {
      ui.showToast("Need more coins!");
    }
  });

  // Orders Modal bindings
  const ordersPanel = document.querySelector("#orders-panel");
  const openOrdersBtn = document.querySelector("#open-orders");
  const closeOrdersBtn = document.querySelector("#close-orders");

  openOrdersBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    updateOrdersUI();
    ordersPanel.classList.add("is-visible");
  });

  closeOrdersBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ordersPanel.classList.remove("is-visible");
  });

  ordersPanel.addEventListener("click", (e) => {
    if (e.target === ordersPanel) {
      ordersPanel.classList.remove("is-visible");
    }
  });

  updateMarketUI();
  updateMarketSellList();
  updateOrdersUI();
}

function updateMarketUI() {
  const modal = document.querySelector("#market-panel");
  const buyBtn = document.querySelector("#buy-plot");
  const statsEl = document.querySelector("#plot-expansion-stats");
  const petStatusEl = document.querySelector("#pet-status");
  const buyPetBtn = document.querySelector("#buy-pet");

  if (!modal || !buyBtn || !statsEl) return;

  const count = farm.unlockedPlotsCount;
  statsEl.textContent = `Unlocked: ${count}/16`;

  if (count >= 16) {
    buyBtn.textContent = "Max Limit Reached";
    buyBtn.disabled = true;
  } else {
    const price = 50 * (count - 1);
    buyBtn.textContent = `Buy for ${price} 🪙`;
    buyBtn.disabled = ui.coins < price;
  }

  // Update pet card state
  if (petStatusEl && buyPetBtn) {
    if (pet.purchased) {
      petStatusEl.textContent = "Purchased";
      buyPetBtn.textContent = "Owned 🐕";
      buyPetBtn.disabled = true;
    } else {
      petStatusEl.textContent = "Not Purchased";
      buyPetBtn.textContent = "Buy for 150 🪙";
      buyPetBtn.disabled = ui.coins < 150;
    }
  }
}

function updateMarketSellList() {
  const sellListEl = document.querySelector("#market-sell-list");
  if (!sellListEl) return;
  
  sellListEl.innerHTML = "";
  
  const cropKeys = ["wheat", "corn", "strawberry", "sunflower"];
  const cropNames = { wheat: "🌾 Wheat", corn: "🌽 Corn", strawberry: "🍓 Strawberry", sunflower: "🌻 Sunflower" };
  
  cropKeys.forEach((cropId) => {
    const count = inventory.getCount(cropId);
    const basePrice = CROP_TYPES[cropId].reward;
    
    const itemEl = document.createElement("div");
    itemEl.className = "sell-item";
    itemEl.innerHTML = `
      <div class="sell-info">
        <span class="sell-name">${cropNames[cropId]}</span>
        <span class="sell-count">In stock: ${count}</span>
      </div>
      <button class="sell-button" type="button" data-crop="${cropId}" ${count <= 0 ? "disabled" : ""}>
        Sell for ${basePrice} 🪙
      </button>
    `;
    sellListEl.appendChild(itemEl);
    
    const btn = itemEl.querySelector(".sell-button");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (inventory.deduct(cropId, 1)) {
        ui.updateCoins(basePrice);
        ui.showToast(`Sold 1 ${cropId}!`);
        updateMarketSellList();
        updateOrdersUI();
      }
    });
  });
}

function updateOrdersUI() {
  const ordersListEl = document.querySelector("#orders-list");
  if (!ordersListEl) return;
  
  ordersListEl.innerHTML = "";
  
  orders.list.forEach((order) => {
    const itemEl = document.createElement("div");
    itemEl.className = "order-item";
    
    let reqsHtml = "";
    const canComplete = orders.canFulfill(order.id, inventory);
    
    const cropNames = { wheat: "🌾 Wheat", corn: "🌽 Corn", strawberry: "🍓 Strawberry", sunflower: "🌻 Sunflower" };
    
    order.reqs.forEach((req) => {
      const hasCount = inventory.getCount(req.cropId);
      const isMet = hasCount >= req.amount;
      reqsHtml += `
        <span class="order-req ${isMet ? "is-met" : "is-missing"}">
          ${cropNames[req.cropId]}: ${hasCount}/${req.amount}
        </span>
      `;
    });
    
    itemEl.innerHTML = `
      <div class="order-header">
        <span class="order-villager">👤 ${order.villager}</span>
        <span class="order-reward">🪙 ${order.reward}</span>
      </div>
      <div class="order-reqs">
        ${reqsHtml}
      </div>
      <button class="primary-button order-complete-btn" type="button" ${!canComplete ? "disabled" : ""}>
        Complete Order
      </button>
    `;
    ordersListEl.appendChild(itemEl);
    
    const completeBtn = itemEl.querySelector(".order-complete-btn");
    completeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fulfilled = orders.fulfill(order.id, inventory);
      if (fulfilled) {
        ui.updateCoins(fulfilled.reward);
        ui.showToast(`Order fulfilled! Earned ${fulfilled.reward} 🪙`);
        updateOrdersUI();
        updateMarketSellList();
      }
    });
  });
}

function zoomCamera(factor) {
  if (!orbitControls) return;
  const target = orbitControls.target;
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const newDistance = offset.length() * factor;
  const clampedDistance = THREE.MathUtils.clamp(newDistance, orbitControls.minDistance, orbitControls.maxDistance);
  offset.normalize().multiplyScalar(clampedDistance);
  camera.position.copy(target).add(offset);
  orbitControls.update();
}

async function handleStartTap(event) {
  event.preventDefault();
  if (started) return;

  started = true;
  startButton.disabled = true;
  document.body.classList.add("is-running");
  ui.showToast("Starting…");

  /* Always use camera + 3D orbit mode — works on ALL devices */
  let cameraOK = false;
  try {
    await startCameraFromUserGesture();
    cameraOK = true;
  } catch (cameraError) {
    console.warn("Camera unavailable — continuing without camera:", cameraError);
    /* Scene will display over a gradient background instead */
  }
  startFallback(cameraOK);
}

async function startCameraFromUserGesture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  /* iOS Safari needs exact constraints — don't over-specify */
  const constraints = {
    video: isIOS
      ? { facingMode: "environment" }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };

  cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  cameraFeed.srcObject = cameraStream;
  try {
    await cameraFeed.play();
  } catch {
    /* Some browsers reject play() before user gesture — autoplay attribute handles it */
  }
  document.body.classList.add("is-camera-active");
}

function startFallback(cameraOK) {
  document.body.classList.add("is-running");
  if (cameraOK) {
    document.body.classList.add("is-camera-active");
  } else {
    /* No camera — show nice gradient background instead */
    document.body.classList.add("no-camera");
  }
  reticle.visible = false;

  /* Show ground reference */
  const ground = scene.getObjectByName("fallback-ground");
  const grid = scene.getObjectByName("fallback-grid");
  if (ground) ground.visible = true;
  if (grid) grid.visible = true;

  /* Position camera looking down at the farm from an angle — zoomed out for 4x4 grid */
  camera.position.set(0, 1.3, 1.8);
  camera.lookAt(0, 0.08, 0);

  /* Set up orbit controls so user can rotate around the farm */
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0.08, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;
  orbitControls.enablePan = true;
  orbitControls.minDistance = 0.35;
  orbitControls.maxDistance = 4.0;
  orbitControls.minPolarAngle = 0.15;         /* don't let camera go under the ground */
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
  orbitControls.rotateSpeed = isMobile ? 0.55 : 0.7;
  orbitControls.zoomSpeed = 0.8;
  orbitControls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  orbitControls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  window.setTimeout(() => {
    if (farm.placed) return;
    farm.setPreviewPlacement();
    document.body.classList.add("has-farm");
    document.body.classList.remove("is-scanning");
    ui.showToast(cameraOK ? "Farm ready — drag to orbit" : "Farm ready");
  }, 800);
}

function onPointerDown(event) {
  if (event.target.closest("button")) return;
  pointerDownPos = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event) {
  if (event.target.closest("button")) return;
  if (!pointerDownPos) return;

  const dx = event.clientX - pointerDownPos.x;
  const dy = event.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  pointerDownPos = null;

  /* If the pointer moved too far, it was an orbit gesture — not a tap */
  if (dist > TAP_THRESHOLD) return;

  handleTap(event);
}

function handleTap(event) {
  event.preventDefault();

  if (!farm.placed) return;

  setPointerFromTap(event);

  raycaster.setFromCamera(pointer, camera);

  // Check if we tapped the Shiba companion dog first
  if (pet.purchased) {
    const petHits = raycaster.intersectObjects(pet.group.children, true);
    if (petHits.length > 0) {
      if (pet.hasCoinBubble) {
        if (pet.collectCoin()) {
          ui.updateCoins(15);
          ui.showToast("Shiba found a coin! +15 🪙");
        }
      } else {
        ui.showToast("Woof! 🐕");
      }
      return;
    }
  }

  // Otherwise check plots
  const hits = raycaster.intersectObjects(farm.getPlotMeshes(), false);
  if (!hits.length) return;

  const plotIndex = hits[0].object.userData.plotIndex;
  interactWithPlot(plotIndex);
}

function interactWithPlot(plotIndex) {
  if (farm.isLocked(plotIndex)) {
    updateMarketUI();
    document.querySelector("#market-panel").classList.add("is-visible");
    ui.showToast("Plot is locked! Open market to expand.");
    return;
  }

  if (farm.isReadyToHarvest(plotIndex)) {
    if (queuedPlots.has(plotIndex)) {
      ui.showToast("Already in harvest queue!");
      return;
    }
    queuedPlots.add(plotIndex);
    harvestQueue.push(plotIndex);
    ui.showToast("Added to harvest queue!");
    processHarvestQueue();
    return;
  }

  if (ui.tool === "water") {
    ui.showToast(farm.water(plotIndex) ? "Watered" : farm.describe(plotIndex));
    return;
  }

  if (farm.isEmpty(plotIndex) && ui.spendFor(ui.selectedCrop)) {
    const planted = farm.plant(plotIndex, ui.selectedCrop);
    ui.showToast(`${planted.name} planted`);
    return;
  }

  ui.showPlotStatus(farm.describe(plotIndex));
}

async function processHarvestQueue() {
  if (character.busy || harvestQueue.length === 0) return;

  const plotIndex = harvestQueue.shift();

  if (!farm.isReadyToHarvest(plotIndex)) {
    queuedPlots.delete(plotIndex);
    processHarvestQueue();
    return;
  }

  const plot = farm.plots[plotIndex];
  const targetPos = plot.group.position.clone();
  targetPos.z += 0.08;

  try {
    await character.walkTo(targetPos);
    character.group.lookAt(plot.group.position.x, 0, plot.group.position.z);
    await character.playHarvest();

    const harvested = farm.harvest(plotIndex);
    if (harvested) {
      inventory.add(harvested.id, 1);
      ui.showToast(`Harvested: ${harvested.name}!`);
      updateMarketSellList();
      updateOrdersUI();
    }
  } catch (err) {
    console.error("Harvesting failed:", err);
  } finally {
    queuedPlots.delete(plotIndex);
    processHarvestQueue();
  }
}

function setPointerFromTap(event) {
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  if (touch) {
    pointerFromClient(touch.clientX, touch.clientY);
    return;
  }

  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    pointerFromClient(event.clientX, event.clientY);
    return;
  }

  pointer.set(0, 0);
}

function pointerFromClient(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

let lastTime = performance.now();
function render() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (orbitControls) orbitControls.update();
  farm.update(Date.now(), camera);
  character.update(dt);
  pet.update(dt);
  updateDayNightCycle(Date.now());
  renderer.render(scene, camera);
}

/* WebXR hit-test / anchor code removed — universal camera+orbit mode is used */

function createReticle() {
  const geometry = new THREE.RingGeometry(0.12, 0.135, 36).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  return mesh;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function stopCameraPreview() {
  if (!cameraStream) return;
  for (const track of cameraStream.getTracks()) track.stop();
  cameraStream = null;
  cameraFeed.srcObject = null;
  document.body.classList.remove("is-camera-active");
}

function setupFireflies() {
  firefliesGroup = new THREE.Group();
  firefliesGroup.visible = false;
  
  const fireflyGeo = new THREE.SphereGeometry(0.008, 6, 4);
  const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xaaff55 });
  
  for (let i = 0; i < 12; i += 1) {
    const mesh = new THREE.Mesh(fireflyGeo, fireflyMat);
    mesh.position.set(
      (Math.random() - 0.5) * 1.2,
      0.05 + Math.random() * 0.25,
      (Math.random() - 0.5) * 1.2
    );
    mesh.userData = {
      baseX: mesh.position.x,
      baseY: mesh.position.y,
      baseZ: mesh.position.z,
      seedX: Math.random() * 100,
      seedY: Math.random() * 100,
      seedZ: Math.random() * 100
    };
    firefliesGroup.add(mesh);
  }
  farm.group.add(firefliesGroup);
}

let cycleStartTime = Date.now();
const PHASE_DAY = 30000;
const PHASE_SUNSET = 15000;
const PHASE_NIGHT = 30000;
const PHASE_SUNRISE = 15000;
const TOTAL_CYCLE = PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT + PHASE_SUNRISE;

function updateDayNightCycle(now) {
  if (!ambientLight || !sunLight) return;
  
  const elapsed = (now - cycleStartTime) % TOTAL_CYCLE;
  
  let phase = "day";
  let t = 0;
  
  let targetAmbientIntensity = 1.5;
  let targetSunIntensity = 2.2;
  let targetSunColor = new THREE.Color(0xffffff);
  
  if (elapsed < PHASE_DAY) {
    phase = "day";
    targetAmbientIntensity = 1.5;
    targetSunIntensity = 2.2;
    targetSunColor.setHex(0xffffff);
  } else if (elapsed < PHASE_DAY + PHASE_SUNSET) {
    phase = "sunset";
    t = (elapsed - PHASE_DAY) / PHASE_SUNSET;
    targetAmbientIntensity = THREE.MathUtils.lerp(1.5, 0.7, t);
    targetSunIntensity = THREE.MathUtils.lerp(2.2, 0.8, t);
    targetSunColor.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0xff7744), t);
  } else if (elapsed < PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT) {
    phase = "night";
    t = (elapsed - (PHASE_DAY + PHASE_SUNSET)) / PHASE_NIGHT;
    if (t < 0.2) {
      const transitionT = t / 0.2;
      targetAmbientIntensity = THREE.MathUtils.lerp(0.7, 0.35, transitionT);
      targetSunIntensity = THREE.MathUtils.lerp(0.8, 0.15, transitionT);
      targetSunColor.lerpColors(new THREE.Color(0xff7744), new THREE.Color(0x5577aa), transitionT);
    } else {
      targetAmbientIntensity = 0.35;
      targetSunIntensity = 0.15;
      targetSunColor.setHex(0x5577aa);
    }
  } else {
    phase = "sunrise";
    t = (elapsed - (PHASE_DAY + PHASE_SUNSET + PHASE_NIGHT)) / PHASE_SUNRISE;
    targetAmbientIntensity = THREE.MathUtils.lerp(0.35, 1.5, t);
    targetSunIntensity = THREE.MathUtils.lerp(0.15, 2.2, t);
    targetSunColor.lerpColors(new THREE.Color(0x5577aa), new THREE.Color(0xffaa66), t);
  }
  
  ambientLight.intensity = targetAmbientIntensity;
  sunLight.intensity = targetSunIntensity;
  sunLight.color.copy(targetSunColor);
  
  if (firefliesGroup) {
    const isNightPhase = phase === "night";
    firefliesGroup.visible = isNightPhase;
    if (isNightPhase) {
      const timeSec = now * 0.001;
      firefliesGroup.children.forEach((ff) => {
        ff.position.x = ff.userData.baseX + Math.sin(timeSec + ff.userData.seedX) * 0.08;
        ff.position.y = ff.userData.baseY + Math.sin(timeSec * 1.5 + ff.userData.seedY) * 0.05;
        ff.position.z = ff.userData.baseZ + Math.cos(timeSec + ff.userData.seedZ) * 0.08;
      });
    }
  }
  
  const body = document.body;
  if (body.classList.contains("no-camera")) {
    const timeClass = `${phase}-time`;
    if (!body.classList.contains(timeClass)) {
      body.classList.remove("day-time", "sunset-time", "night-time", "sunrise-time");
      body.classList.add(timeClass);
    }
  }
}
