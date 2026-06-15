import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
let farmAnchor = null;
let latestHitTestResult = null;
let latestReferenceSpace = null;
let started = false;
let cameraStream = null;
let surfaceStableSince = 0;
let orbitControls = null;
let pointerDownPos = null;
const TAP_THRESHOLD = 12; /* px — movement below this is a tap, above is an orbit drag */

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
    reticle.visible = !fallbackMode;
    surfaceStableSince = 0;
    document.body.classList.remove("has-farm");
    document.body.classList.toggle("is-scanning", Boolean(xrSession));
    ui.refillIfStuck();
    if (fallbackMode) {
      farm.setPreviewPlacement();
      document.body.classList.add("has-farm");
      if (orbitControls) orbitControls.target.set(0, 0.08, 0);
    }
  };

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
}

async function handleStartTap(event) {
  event.preventDefault();
  if (started) return;

  started = true;
  startButton.disabled = true;
  document.body.classList.add("is-running");
  ui.showToast("Starting AR");

  try {
    let arSupported = false;
    if (navigator.xr) {
      try {
        arSupported = await navigator.xr.isSessionSupported("immersive-ar");
      } catch {
        arSupported = false;
      }
    }

    if (arSupported) {
      await startXRSession();
      return;
    }

    await startCameraFromUserGesture();
    startFallback();
  } catch (error) {
    console.warn(error);
    try {
      await startCameraFromUserGesture();
      startFallback();
    } catch (cameraError) {
      console.warn(cameraError);
      started = false;
      startButton.disabled = false;
      document.body.classList.remove("is-running", "is-camera-active", "is-scanning");
      ui.showToast("Camera permission needed");
    }
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
  try {
    await cameraFeed.play();
  } catch {
    /* Android may reject play() before user gesture — autoplay attribute handles it */
  }
  document.body.classList.add("is-camera-active");
}

async function startXRSession() {
  fallbackMode = false;
  stopCameraPreview();
  xrSession = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["local-floor", "dom-overlay", "anchors"],
    domOverlay: { root: document.body }
  });

  xrSession.addEventListener("end", () => {
    xrSession = null;
    hitTestSource = null;
    hitTestSourceRequested = false;
    farmAnchor = null;
    latestHitTestResult = null;
    latestReferenceSpace = null;
    surfaceStableSince = 0;
    document.body.classList.remove("is-running", "is-scanning", "is-camera-active", "has-farm");
    reticle.visible = false;
    farm.resetPlacement();
    started = false;
    startButton.disabled = false;
  });

  await renderer.xr.setSession(xrSession);
  document.body.classList.add("is-running", "is-scanning");
  document.body.classList.remove("is-camera-active");
  ui.showToast("Scan the floor");
}

function startFallback() {
  fallbackMode = true;
  document.body.classList.add("is-running", "is-scanning", "is-camera-active");
  reticle.visible = false;

  /* Show ground reference in fallback mode */
  const ground = scene.getObjectByName("fallback-ground");
  const grid = scene.getObjectByName("fallback-grid");
  if (ground) ground.visible = true;
  if (grid) grid.visible = true;

  /* Position camera looking down at the farm from an angle */
  camera.position.set(0, 0.62, 0.85);
  camera.lookAt(0, 0.08, 0);

  /* Set up orbit controls so user can rotate around the farm */
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0.08, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;
  orbitControls.enablePan = false;            /* disable pan — only orbit + zoom */
  orbitControls.minDistance = 0.35;
  orbitControls.maxDistance = 2.2;
  orbitControls.minPolarAngle = 0.15;         /* don't let camera go under the ground */
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
  orbitControls.rotateSpeed = 0.7;
  orbitControls.zoomSpeed = 0.8;
  orbitControls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY };
  orbitControls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  window.setTimeout(() => {
    if (farm.placed || !fallbackMode) return;
    farm.setPreviewPlacement();
    document.body.classList.add("has-farm");
    document.body.classList.remove("is-scanning");
    ui.showToast("Farm ready — drag to orbit");
  }, 1200);
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

  if (!farm.placed) {
    if (reticle.visible && latestHitTestResult && latestReferenceSpace) {
      placeFarmFromHit(latestHitTestResult, latestReferenceSpace);
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
    updateAnchoredFarm(frame);
    updateReticle(frame);
  }

  if (orbitControls) orbitControls.update();
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
    latestHitTestResult = hitTestResults[0];
    latestReferenceSpace = referenceSpace;
    const pose = latestHitTestResult.getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
    if (!surfaceStableSince) surfaceStableSince = Date.now();
    if (Date.now() - surfaceStableSince > 1600) {
      placeFarmFromHit(latestHitTestResult, referenceSpace);
    }
  } else {
    reticle.visible = false;
    latestHitTestResult = null;
    latestReferenceSpace = null;
    surfaceStableSince = 0;
  }
}

function placeFarmFromHit(hitTestResult, referenceSpace) {
  const pose = hitTestResult.getPose(referenceSpace);
  if (!pose) return;

  const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
  farm.setPlacedFromMatrix(matrix);
  reticle.visible = false;
  document.body.classList.add("has-farm");
  document.body.classList.remove("is-scanning");
  ui.showToast("Farm anchored");

  if (typeof hitTestResult.createAnchor === "function") {
    hitTestResult.createAnchor().then((anchor) => {
      farmAnchor = anchor;
    }).catch(() => {
      farmAnchor = null;
    });
  }
}

function updateAnchoredFarm(frame) {
  if (!farmAnchor || !frame.trackedAnchors?.has(farmAnchor)) return;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const pose = frame.getPose(farmAnchor.anchorSpace, referenceSpace);
  if (!pose) return;

  const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
  farm.setPlacedFromMatrix(matrix);
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
