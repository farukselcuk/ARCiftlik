/**
 * input.js — Unified touch/mouse + kamera/sensör izinleri wrapper
 * 
 * Android/iOS cihazlarda touch ve mouse event çakışmalarını önler,
 * sürükleme (drag) ve dokunma (tap) olaylarını birleştirir.
 */

import { requestCamera as reqCam, requestMotionSensors as reqGyro } from "./permissions.js";

export const Input = {
  /**
   * Bir elemente dokunulduğunda/tıklandığında tetiklenir (çakışmaları önler).
   * @param {HTMLElement} element
   * @param {Function} callback
   * @returns {Function} cleanup function
   */
  onTap(element, callback) {
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const handleDown = (e) => {
      if (!e.isPrimary) return;
      // UI elemanlarına tıklandıysa iptal et
      if (e.target.closest("button") || e.target.closest(".top-bar") || e.target.closest(".bottom-bar") || e.target.closest(".tab-bar") || e.target.closest("section")) return;
      
      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
    };

    const handleUp = (e) => {
      if (!e.isPrimary) return;
      if (e.target.closest("button") || e.target.closest(".top-bar") || e.target.closest(".bottom-bar") || e.target.closest(".tab-bar") || e.target.closest("section")) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = performance.now() - startTime;

      // 12 pikselden az hareket ve 300ms'den kısa süreyse tap/click kabul edilir
      if (dist < 12 && dt < 300) {
        callback(e);
      }
    };

    element.addEventListener("pointerdown", handleDown);
    element.addEventListener("pointerup", handleUp);

    return () => {
      element.removeEventListener("pointerdown", handleDown);
      element.removeEventListener("pointerup", handleUp);
    };
  },

  /**
   * Sürükleme (drag) hareketi algılayıcı.
   * @param {HTMLElement} element
   * @param {{onStart: Function, onMove: Function, onEnd: Function}} callbacks
   * @returns {Function} cleanup function
   */
  onDrag(element, callbacks) {
    let isDragging = false;

    const getPoint = (e) => {
      const rect = element.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        clientX: e.clientX,
        clientY: e.clientY
      };
    };

    const handleDown = (e) => {
      if (!e.isPrimary) return;
      if (e.target.closest("button") || e.target.closest(".top-bar") || e.target.closest(".bottom-bar") || e.target.closest(".tab-bar") || e.target.closest("section")) return;

      isDragging = true;
      if (callbacks.onStart) {
        callbacks.onStart(getPoint(e), e);
      }
    };

    const handleMove = (e) => {
      if (!isDragging || !e.isPrimary) return;
      if (callbacks.onMove) {
        callbacks.onMove(getPoint(e), e);
      }
    };

    const handleUp = (e) => {
      if (!isDragging || !e.isPrimary) return;
      isDragging = false;
      if (callbacks.onEnd) {
        callbacks.onEnd(e);
      }
    };

    element.addEventListener("pointerdown", handleDown);
    element.addEventListener("pointermove", handleMove);
    element.addEventListener("pointerup", handleUp);
    element.addEventListener("pointercancel", handleUp);

    return () => {
      element.removeEventListener("pointerdown", handleDown);
      element.removeEventListener("pointermove", handleMove);
      element.removeEventListener("pointerup", handleUp);
      element.removeEventListener("pointercancel", handleUp);
    };
  },

  /** Kamera izni ister */
  async requestCamera() {
    return reqCam();
  },

  /** Jiroskop/Hareket sensörü izni ister */
  async requestGyroscope() {
    return reqGyro();
  }
};
