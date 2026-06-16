import { CROP_TYPES } from "./crops.js";
import { GameStorage } from "./storage.js";

const STARTING_COINS = 100;
const MIN_PLANTING_COST = Math.min(...Object.values(CROP_TYPES).map((crop) => crop.cost));

export class GameUI {
  /**
   * @param {GameStorage} storage — merkezi depolama instance'ı
   */
  constructor(storage) {
    this.coinEl = document.querySelector("#coin-count");
    this.toastEl = document.querySelector("#toast");
    this.cropButtons = [...document.querySelectorAll(".crop-button")];
    this.waterButton = document.querySelector("#water-tool");
    this.selectedCrop = "wheat";
    this.tool = "crop";
    /** @type {GameStorage} */
    this._storage = storage;
    this.coins = this.loadCoins();
    this.onReset = null;
    this._toastTimer = 0;

    this.toastEl.addEventListener("animationend", () => {
      this.toastEl.classList.remove("is-visible");
    });

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
      window.activeTool = this.tool;
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
    this._storage.saveField("coins", this.coins);
    this.onCoinsChange?.(this.coins);
  }

  refillIfStuck() {
    if (this.coins >= MIN_PLANTING_COST) return false;
    this.coins = STARTING_COINS;
    this.updateCoins(0);
    this.showToast("Coins reset to 100");
    return true;
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
    this.toastEl.classList.remove("is-visible");
    this.toastEl.textContent = message;
    /* Force reflow so the browser registers the class removal before re-adding */
    void this.toastEl.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.toastEl.classList.add("is-visible");
      });
    });
  }

  showPlotStatus(message) {
    this.showToast(message);
  }

  loadCoins() {
    const saved = this._storage.loadField("coins");
    if (!Number.isFinite(saved)) return STARTING_COINS;
    return saved >= MIN_PLANTING_COST ? saved : STARTING_COINS;
  }
}
