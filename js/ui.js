import { CROP_TYPES } from "./crops.js";

const COIN_SAVE_KEY = "ar-pocket-farm:coins";

export class GameUI {
  constructor() {
    this.coinEl = document.querySelector("#coin-count");
    this.toastEl = document.querySelector("#toast");
    this.cropButtons = [...document.querySelectorAll(".crop-button")];
    this.waterButton = document.querySelector("#water-tool");
    this.selectedCrop = "wheat";
    this.tool = "crop";
    this.coins = this.loadCoins();
    this.onReset = null;

    this.updateCoins(0);
    this.bindControls();
  }

  bindControls() {
    for (const button of this.cropButtons) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectedCrop = button.dataset.crop;
        this.tool = "crop";
        this.syncSelection();
      });
    }

    this.waterButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.tool = this.tool === "water" ? "crop" : "water";
      this.syncSelection();
    });

    document.querySelector("#reset-farm").addEventListener("click", (event) => {
      event.stopPropagation();
      this.onReset?.();
    });
  }

  syncSelection() {
    for (const button of this.cropButtons) {
      button.classList.toggle("is-selected", this.tool === "crop" && button.dataset.crop === this.selectedCrop);
    }
    this.waterButton?.classList.toggle("is-selected", this.tool === "water");
  }

  updateCoins(delta) {
    this.coins = Math.max(0, this.coins + delta);
    this.coinEl.textContent = this.coins.toString();
    localStorage.setItem(COIN_SAVE_KEY, this.coins.toString());
  }

  spendFor(cropId) {
    const crop = CROP_TYPES[cropId];
    if (!crop || this.coins < crop.cost) {
      this.showToast("Need more coins");
      return false;
    }

    this.updateCoins(-crop.cost);
    return true;
  }

  earnFor(crop) {
    this.updateCoins(crop.reward);
    this.showCoinFloat(crop.reward);
  }

  showCoinFloat(amount) {
    this.showToast(`+${amount} coins`);
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove("is-visible");
    window.requestAnimationFrame(() => this.toastEl.classList.add("is-visible"));
  }

  showPlotStatus(message) {
    this.showToast(message);
  }

  loadCoins() {
    const saved = Number(localStorage.getItem(COIN_SAVE_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 100;
  }
}
