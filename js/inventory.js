import { CROP_TYPES } from "./crops.js";

const SAVE_KEY = "ar-pocket-farm:inventory";

export class Inventory {
  constructor() {
    this.items = this.load();
    this.onChange = null;
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved && typeof saved === "object") {
        return {
          wheat: Number(saved.wheat) || 0,
          corn: Number(saved.corn) || 0,
          strawberry: Number(saved.strawberry) || 0,
          sunflower: Number(saved.sunflower) || 0
        };
      }
    } catch {}
    return { wheat: 0, corn: 0, strawberry: 0, sunflower: 0 };
  }

  save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.items));
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
    this.items = { wheat: 0, corn: 0, strawberry: 0, sunflower: 0 };
    this.save();
  }
}
