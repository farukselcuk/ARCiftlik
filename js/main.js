import * as THREE from "three";
import { Farm } from "./farm.js";
import { GameUI } from "./ui.js";

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
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneRoot.appendChild(renderer.domElement);

const farm = new Farm();
const ui = new GameUI();
scene.add(farm.group);

const reticle = createReticle();
scene.add(reticle);

let xrSession = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let fallbackMode = false;
let lastTouchAt = 0;
let started = false;
let cameraStream = null;
let surfaceStableSince = 0;

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
}

function bindEvents() {
  startButton.addEventListener("click", handleStartTap);
  ui.onReset = () => {
    farm.resetPlacement();
    reticle.visible = !fallbackMode;
    surfaceStableSince = 0;
    document.body.classList.remove("has-farm");
    document.body.classList.toggle("is-scanning", Boolean(xrSession));
    ui.refillIfStuck();
    if (fallbackMode) {
      farm.setPreviewPlacement();
      document.body.classList.add("has-farm");
    }
  };

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("touchstart", onTap, { passive: false });
  renderer.domElement.addEventListener("click", onTap);
}

async function handleStartTap(event) {
  event.preventDefault();
  if (started) return;

  started = true;
  startButton.disabled = true;
  document.body.classList.add("is-running");
  ui.showToast("Starting camera");

  try {
    await startCameraFromUserGesture();
    await startARSessionOrFallback();
  } catch (error) {
    console.warn(error);
    started = false;
    startButton.disabled = false;
    document.body.classList.remove("is-running", "is-camera-active", "is-scanning");
    ui.showToast("Camera permission needed");
  }
}

async function startCameraFromUserGesture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });
  cameraFeed.srcObject = cameraStream;
  await cameraFeed.play();
  document.body.classList.add("is-camera-active");
}

async function startARSessionOrFallback() {
  if (!navigator.xr) {
    startFallback();
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (!supported) {
      startFallback();
      return;
    }

    stopCameraPreview();
    xrSession = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["local-floor", "dom-overlay"],
      domOverlay: { root: document.body }
    });

    xrSession.addEventListener("end", () => {
      xrSession = null;
      hitTestSource = null;
      hitTestSourceRequested = false;
      surfaceStableSince = 0;
      document.body.classList.remove("is-running", "is-scanning", "is-camera-active");
      reticle.visible = false;
    });

    await renderer.xr.setSession(xrSession);
    document.body.classList.add("is-running", "is-scanning");
    ui.showToast("Finding surface");
  } catch (error) {
    console.warn(error);
    await restartCameraPreviewIfNeeded();
    startFallback();
  }
}

function startFallback() {
  fallbackMode = true;
  document.body.classList.add("is-running", "is-scanning", "is-camera-active");
  reticle.visible = false;

  camera.position.set(0, 0.46, 1.1);
  camera.lookAt(0, 0, -0.12);

  window.setTimeout(() => {
    if (farm.placed || !fallbackMode) return;
    farm.setPreviewPlacement();
    document.body.classList.add("has-farm");
    document.body.classList.remove("is-scanning");
    ui.showToast("Farm ready");
  }, 2000);
}

function onTap(event) {
  if (event.target.closest("button")) return;
  if (event.type === "touchstart") lastTouchAt = Date.now();
  if (event.type === "click" && Date.now() - lastTouchAt < 650) return;
  event.preventDefault();

  if (!farm.placed) {
    if (reticle.visible) {
      farm.setPlacedFromMatrix(reticle.matrix);
      reticle.visible = false;
      document.body.classList.add("has-farm");
      document.body.classList.remove("is-scanning");
      ui.showToast("Farm placed");
    }
    return;
  }

  setPointerFromTap(event);

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(farm.getPlotMeshes(), false);
  if (!hits.length) return;

  const plotIndex = hits[0].object.userData.plotIndex;
  interactWithPlot(plotIndex);
}

function interactWithPlot(plotIndex) {
  const harvested = farm.harvest(plotIndex);
  if (harvested) {
    ui.earnFor(harvested);
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

function render(time, frame) {
  if (frame && xrSession) {
    updateHitTestSource(frame);
    updateReticle(frame);
  }

  farm.update(Date.now(), camera);
  renderer.render(scene, camera);
}

function updateHitTestSource(frame) {
  if (hitTestSourceRequested) return;

  const session = renderer.xr.getSession();
  session.requestReferenceSpace("viewer").then((referenceSpace) => {
    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
      hitTestSource = source;
    });
  });

  session.addEventListener("end", () => {
    hitTestSourceRequested = false;
    hitTestSource = null;
  });

  hitTestSourceRequested = true;
}

function updateReticle(frame) {
  if (!hitTestSource || farm.placed) return;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const hitTestResults = frame.getHitTestResults(hitTestSource);
  if (hitTestResults.length) {
    const pose = hitTestResults[0].getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
    if (!surfaceStableSince) surfaceStableSince = Date.now();
    if (Date.now() - surfaceStableSince > 1600) {
      farm.setPlacedFromMatrix(reticle.matrix);
      reticle.visible = false;
      document.body.classList.add("has-farm");
      document.body.classList.remove("is-scanning");
      ui.showToast("Farm ready");
    }
  } else {
    reticle.visible = false;
    surfaceStableSince = 0;
  }
}

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

async function restartCameraPreviewIfNeeded() {
  if (cameraStream) return;
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  cameraFeed.srcObject = cameraStream;
  await cameraFeed.play();
  document.body.classList.add("is-camera-active");
}
