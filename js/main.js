import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Farm } from "./farm.js";
import { GameUI } from "./ui.js";
import { Character } from "./character.js";

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
farm.group.add(character.group);
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

setupLights();
bindEvents();
renderer.setAnimationLoop(render);

function setupLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(1.2, 2.8, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

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

    farm.setPreviewPlacement();
    document.body.classList.add("has-farm");
    if (orbitControls) {
      orbitControls.target.set(0, 0.08, 0);
      camera.position.set(0, 1.13, 1.55);
      orbitControls.update();
    }
  };

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  document.querySelector("#zoom-in").addEventListener("click", (e) => {
    e.stopPropagation();
    zoomCamera(0.85);
  });
  document.querySelector("#zoom-out").addEventListener("click", (e) => {
    e.stopPropagation();
    zoomCamera(1.15);
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

  /* Position camera looking down at the farm from an angle — zoomed out by 35% */
  camera.position.set(0, 1.13, 1.55);
  camera.lookAt(0, 0.08, 0);

  /* Set up orbit controls so user can rotate around the farm */
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0.08, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;
  orbitControls.enablePan = false;            /* disable pan — only orbit + zoom */
  orbitControls.minDistance = 0.35;
  orbitControls.maxDistance = 3.0;
  orbitControls.minPolarAngle = 0.15;         /* don't let camera go under the ground */
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
  orbitControls.rotateSpeed = isMobile ? 0.55 : 0.7;
  orbitControls.zoomSpeed = 0.8;
  orbitControls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY };
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
  const hits = raycaster.intersectObjects(farm.getPlotMeshes(), false);
  if (!hits.length) return;

  const plotIndex = hits[0].object.userData.plotIndex;
  interactWithPlot(plotIndex);
}

function interactWithPlot(plotIndex) {
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
      ui.earnFor(harvested);
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
