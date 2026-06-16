import { CROP_TYPES } from "./crops.js";
import { GameStorage } from "./storage.js";

const VILLAGERS = ["Farmer Bob", "Mayor Alice", "Chef Giovanni", "Baker Tom"];

export class Orders {
  /**
   * @param {GameStorage} storage — merkezi depolama instance'ı
   */
  constructor(storage) {
    /** @type {GameStorage} */
    this._storage = storage;
    this.list = this.load();
    if (this.list.length === 0) {
      this.list = this.generateAll();
      this.save();
    }
  }

  load() {
    try {
      const saved = this._storage.loadField("orders");
      if (Array.isArray(saved) && saved.length === 3) return saved;
    } catch {}
    return [];
  }

  save() {
    this._storage.saveField("orders", this.list);
  }

  generateAll() {
    return [
      this.generateOrder("order-1"),
      this.generateOrder("order-2"),
      this.generateOrder("order-3")
    ];
  }

  generateOrder(id) {
    const villager = VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
    const cropKeys = Object.keys(CROP_TYPES);
    
    // Choose 1 or 2 different crop requirements
    const count = Math.random() > 0.65 ? 2 : 1;
    const reqs = [];
    const chosenCrops = new Set();

    for (let i = 0; i < count; i += 1) {
      let cropId;
      do {
        cropId = cropKeys[Math.floor(Math.random() * cropKeys.length)];
      } while (chosenCrops.has(cropId));

      chosenCrops.add(cropId);
      // Determine amount: Wheat 2-4, Corn 1-3, Strawberry 1-2, Sunflower 1-2
      let amount = 1;
      if (cropId === "wheat") amount = 2 + Math.floor(Math.random() * 3);
      else if (cropId === "corn") amount = 1 + Math.floor(Math.random() * 3);
      else amount = 1 + Math.floor(Math.random() * 2);

      reqs.push({ cropId, amount });
    }

    // Calculate reward with 20% to 35% bonus
    let baseValue = 0;
    for (const req of reqs) {
      baseValue += CROP_TYPES[req.cropId].reward * req.amount;
    }
    const reward = Math.round(baseValue * (1.2 + Math.random() * 0.15));

    return { id, villager, reqs, reward };
  }

  canFulfill(orderId, inventory) {
    const order = this.list.find((o) => o.id === orderId);
    if (!order) return false;
    return order.reqs.every((req) => inventory.has(req.cropId, req.amount));
  }

  fulfill(orderId, inventory) {
    const index = this.list.findIndex((o) => o.id === orderId);
    if (index === -1) return null;

    const order = this.list[index];
    if (!this.canFulfill(orderId, inventory)) return null;

    // Deduct crops
    for (const req of order.reqs) {
      inventory.deduct(req.cropId, req.amount);
    }

    // Replace order
    const newOrder = this.generateOrder(orderId);
    this.list[index] = newOrder;
    this.save();

    return order; // Return old order for rewarding
  }

  reset() {
    this.list = this.generateAll();
    this.save();
  }
}
