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
          apple: Number(saved.apple) || 0,
          orange: Number(saved.orange) || 0,
          
          golden_wheat: Number(saved.golden_wheat) || 0,
          golden_corn: Number(saved.golden_corn) || 0,
          golden_carrot: Number(saved.golden_carrot) || 0,
          golden_strawberry: Number(saved.golden_strawberry) || 0,
          golden_potato: Number(saved.golden_potato) || 0,
          golden_sunflower: Number(saved.golden_sunflower) || 0,
          golden_tomato: Number(saved.golden_tomato) || 0,
          golden_pumpkin: Number(saved.golden_pumpkin) || 0,
          golden_blueberry: Number(saved.golden_blueberry) || 0,

          fertilizer_basic: Number(saved.fertilizer_basic) || 0,
          fertilizer_super: Number(saved.fertilizer_super) || 0,
          fertilizer_golden: Number(saved.fertilizer_golden) || 0,

          wood_oak: Number(saved.wood_oak) || 0,
          wood_pine: Number(saved.wood_pine) || 0,
          furniture_stool: Number(saved.furniture_stool) || 0,
          furniture_table: Number(saved.furniture_table) || 0,
          furniture_cabinet: Number(saved.furniture_cabinet) || 0,
          flour: Number(saved.flour) || 0,
          bread: Number(saved.bread) || 0,
          strawberry_cake: Number(saved.strawberry_cake) || 0,
          blueberry_pie: Number(saved.blueberry_pie) || 0,
          carrot_cake: Number(saved.carrot_cake) || 0
        };
      }
    } catch {}
    return {
      wheat: 0, corn: 0, carrot: 0, strawberry: 0, potato: 0, sunflower: 0, tomato: 0, pumpkin: 0, blueberry: 0,
      apple: 0, orange: 0,
      golden_wheat: 0, golden_corn: 0, golden_carrot: 0, golden_strawberry: 0, golden_potato: 0, golden_sunflower: 0, golden_tomato: 0, golden_pumpkin: 0, golden_blueberry: 0,
      fertilizer_basic: 0, fertilizer_super: 0, fertilizer_golden: 0,
      wood_oak: 0, wood_pine: 0,
      furniture_stool: 0, furniture_table: 0, furniture_cabinet: 0,
      flour: 0, bread: 0, strawberry_cake: 0, blueberry_pie: 0, carrot_cake: 0
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
      apple: 0, orange: 0,
      golden_wheat: 0, golden_corn: 0, golden_carrot: 0, golden_strawberry: 0, golden_potato: 0, golden_sunflower: 0, golden_tomato: 0, golden_pumpkin: 0, golden_blueberry: 0,
      fertilizer_basic: 0, fertilizer_super: 0, fertilizer_golden: 0,
      wood_oak: 0, wood_pine: 0,
      furniture_stool: 0, furniture_table: 0, furniture_cabinet: 0,
      flour: 0, bread: 0, strawberry_cake: 0, blueberry_pie: 0, carrot_cake: 0
    };
    this.save();
  }
}
