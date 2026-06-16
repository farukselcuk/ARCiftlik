/**
 * permissions.js — Merkezi izin yönetimi (kamera, sensörler)
 * 
 * Android ve iOS'ta tutarlı izin isteme akışı sağlar.
 * Başarısız olursa graceful degradation ile devam eder.
 */

/* ── Platform tespiti ────────────────────────────────────────────── */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * İzin durumlarını tutan nesne
 * @type {{camera: "granted"|"denied"|"unknown", motion: "granted"|"denied"|"unknown"}}
 */
const permissionState = {
  camera: "unknown",
  motion: "unknown"
};

/**
 * Kamera izni iste ve stream döndür.
 * Android Chrome'daki tutarsız davranışları ele alır.
 * 
 * @returns {Promise<MediaStream|null>} — başarılıysa stream, değilse null
 */
export async function requestCamera() {
  // API mevcut mu?
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn("[Permissions] Camera API kullanılamıyor");
    permissionState.camera = "denied";
    return null;
  }

  // İlk deneme: standart constraint
  try {
    const constraints = {
      video: isIOS
        ? { facingMode: "environment" }
        : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    permissionState.camera = "granted";
    return stream;
  } catch (err) {
    console.warn("[Permissions] İlk kamera denemesi başarısız:", err.name);
  }

  // İkinci deneme: basit constraint (Android uyumluluk)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    permissionState.camera = "granted";
    return stream;
  } catch (err) {
    console.warn("[Permissions] İkinci kamera denemesi başarısız:", err.name);
  }

  // Üçüncü deneme: ön kamera (son çare)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    permissionState.camera = "granted";
    return stream;
  } catch (err) {
    console.warn("[Permissions] Kamera tamamen kullanılamıyor:", err.name);
    permissionState.camera = "denied";
    return null;
  }
}

/**
 * Hareket sensörü izinleri iste (gyroscope, accelerometer).
 * iOS 13+ için DeviceMotionEvent.requestPermission() kullanır.
 * Android 13+ için standart permission query dener.
 * 
 * @returns {Promise<boolean>} — izin verildiyse true
 */
export async function requestMotionSensors() {
  // iOS 13+: özel izin API'si
  if (typeof DeviceMotionEvent !== "undefined" && 
      typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      permissionState.motion = result === "granted" ? "granted" : "denied";
      return result === "granted";
    } catch (err) {
      console.warn("[Permissions] iOS motion izni hatası:", err);
      permissionState.motion = "denied";
      return false;
    }
  }

  // Android/Diğer: permission query dene
  if (navigator.permissions?.query) {
    try {
      const result = await navigator.permissions.query({ name: "accelerometer" });
      permissionState.motion = result.state === "granted" ? "granted" : "denied";
      return result.state === "granted";
    } catch {
      // Bazı tarayıcılar accelerometer query'yi desteklemiyor
      // Bu durumda izin varsayılan olarak verilmiş kabul edilir
    }
  }

  // Sensör API desteği kontrolü
  if (typeof DeviceMotionEvent !== "undefined" || typeof DeviceOrientationEvent !== "undefined") {
    permissionState.motion = "granted";
    return true;
  }

  permissionState.motion = "denied";
  return false;
}

/**
 * Kamera stream'ini güvenli bir şekilde durdur.
 * @param {MediaStream|null} stream
 */
export function stopCameraStream(stream) {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch (err) {
    console.warn("[Permissions] Stream durdurma hatası:", err);
  }
}

/**
 * Mevcut izin durumlarını al.
 * @returns {{camera: string, motion: string}}
 */
export function getPermissionState() {
  return { ...permissionState };
}

/**
 * Platform bilgilerini al (debug/logging için).
 * @returns {{isIOS: boolean, isAndroid: boolean, isMobile: boolean}}
 */
export function getPlatformInfo() {
  return { isIOS, isAndroid, isMobile };
}

/**
 * Viewport yüksekliğini güvenli bir şekilde hesapla.
 * Android klavyesi açıkken vh birimi bozulur — bu fonksiyon
 * visualViewport API'si üzerinden doğru yüksekliği sağlar.
 */
export function setupViewportFix() {
  if (!isMobile) return;

  const setVH = () => {
    const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  };

  setVH();

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setVH);
    window.visualViewport.addEventListener("scroll", setVH);
  } else {
    window.addEventListener("resize", setVH);
  }
}
