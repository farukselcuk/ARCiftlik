import * as THREE from "three";

export class FloatingTextManager {
  constructor(camera) {
    this.camera = camera;

    // Yüzen yazılar için ana konteyner (UI üstünde duracak)
    this.container = document.createElement("div");
    this.container.id = "floating-text-container";
    this.container.style.position = "absolute";
    this.container.style.top = "0";
    this.container.style.left = "0";
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.style.pointerEvents = "none"; // Tıklamaları engellememesi için
    this.container.style.overflow = "hidden";
    this.container.style.zIndex = "50"; // Modal'ların altında, UI'ın üstünde
    document.body.appendChild(this.container);

    this.texts = [];
  }

  show(text, position3D, color = "#ffd700") {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.position = "absolute";
    el.style.color = color;
    el.style.fontWeight = "900";
    el.style.fontSize = "1.8rem";
    el.style.textShadow = "0px 2px 4px rgba(0,0,0,0.8), 0px 0px 2px rgba(0,0,0,1)";
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, -50%) scale(0.5)"; // Başlangıçta küçük
    el.style.transition = "opacity 1.5s ease-in, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    el.style.fontFamily = "'Inter', sans-serif";

    this.container.appendChild(el);

    // Pop animasyonu için küçük bir gecikme
    setTimeout(() => {
      el.style.transform = "translate(-50%, -50%) scale(1)";
    }, 10);

    this.texts.push({
      el,
      pos: position3D.clone(), // 3D dünyadaki başlangıç konumu
      createdAt: Date.now(),
      offsetY: 0
    });
  }

  update() {
    if (!this.camera) return;

    const now = Date.now();
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const item = this.texts[i];
      const age = now - item.createdAt;

      // 1.5 saniye sonra yok et
      if (age > 1500) {
        item.el.remove();
        this.texts.splice(i, 1);
        continue;
      }

      // Yukarı doğru yavaşça süzülme efekti
      item.offsetY += 0.002;

      const vector = item.pos.clone();
      vector.y += item.offsetY;

      // 3D pozisyonu 2D ekrana (CSS koordinatlarına) çevirme
      vector.project(this.camera);

      // Kameranın arkasında kalanları gizle
      if (vector.z > 1) {
        item.el.style.display = "none";
        continue;
      } else {
        item.el.style.display = "block";
      }

      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

      // Solma efekti (son 500ms kala)
      if (age > 1000) {
        const opacity = 1 - ((age - 1000) / 500);
        item.el.style.opacity = opacity.toFixed(2);
      }

      item.el.style.left = `${x}px`;
      item.el.style.top = `${y}px`;
    }
  }
}
