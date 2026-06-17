import { CROP_TYPES } from "./crops.js";
import { GameStorage } from "./storage.js";

export class Inventory {
  /**
   * @param {GameStorage} storage — merkezi depolama instance'ı
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    this.items = this.load();
    this.onChange = null;
  }

  load() {
    try {
      const saved = this._storage.loadField("inventory");
      if (saved && typeof saved === "object") {
        return {
          wheat: Number(saved.wheat) || 0,
          corn: Number(saved.corn) || 0,
          carrot: Number(saved.carrot) || 0,
          strawberry: Number(saved.strawberry) || 0,
          potato: Number(saved.potato) || 0,
          sunflower: Number(saved.sunflower) || 0,
          tomato: Number(saved.tomato) || 0,
          pumpkin: Number(saved.pumpkin) || 0,
          blueberry: Number(saved.blueberry) || 0,
          
          golden_wheat: Number(saved.golden_wheat) || 0,
          golden_corn: Number(saved.golden_corn) || 0,
          golden_carrot: Number(saved.golden_carrot) || 0,
          golden_strawberry: Number(saved.golden_strawberry) || 0,
          golden_potato: Number(saved.golden_potato) || 0,
          golden_sunflower: Number(saved.golden_sunflower) || 0,
          golden_tomato: Number(saved.golden_tomato) || 0,
          golden_pumpkin: Number(saved.golden_pumpkin) || 0,
          golden_blueberry: Number(saved.golden_blueberry) || 0
        };
      }
    } catch {}
    return {
      wheat: 0, corn: 0, carrot: 0, strawberry: 0, potato: 0, sunflower: 0, tomato: 0, pumpkin: 0, blueberry: 0,
      golden_wheat: 0, golden_corn: 0, golden_carrot: 0, golden_strawberry: 0, golden_potato: 0, golden_sunflower: 0, golden_tomato: 0, golden_pumpkin: 0, golden_blueberry: 0
    };
  }

  save() {
    this._storage.saveField("inventory", this.items);
    this.onChange?.(this.items);
  }

  add(cropId, amount = 1) {
    if (this.items[cropId] !== undefined) {
      this.items[cropId] += amount;
      this.save();
    }
  }

  has(cropId, amount = 1) {
    return (this.items[cropId] || 0) >= amount;
  }

  deduct(cropId, amount = 1) {
    if (this.items[cropId] !== undefined && this.items[cropId] >= amount) {
      this.items[cropId] -= amount;
      this.save();
      return true;
    }
    return false;
  }

  getCount(cropId) {
    return this.items[cropId] || 0;
  }

  reset() {
    this.items = {
      wheat: 0, corn: 0, carrot: 0, strawberry: 0, potato: 0, sunflower: 0, tomato: 0, pumpkin: 0, blueberry: 0,
      golden_wheat: 0, golden_corn: 0, golden_carrot: 0, golden_strawberry: 0, golden_potato: 0, golden_sunflower: 0, golden_tomato: 0, golden_pumpkin: 0, golden_blueberry: 0
    };
    this.save();
  }
}
