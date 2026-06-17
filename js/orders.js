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
    const playerLevel = Number(this._storage.loadField("level")) || 1;
    
    let loaded = this.load();
    loaded = this.validateExistingOrders(loaded, playerLevel);
    
    const orderIds = ["order-1", "order-2", "order-3"];
    const newList = [];
    
    for (const id of orderIds) {
      const existing = loaded.find((o) => o.id === id);
      if (existing) {
        newList.push(existing);
      } else {
        newList.push(this.generateOrder(id, playerLevel));
      }
    }
    
    this.list = newList;
    this.save();
  }

  load() {
    try {
      const saved = this._storage.loadField("orders");
      if (Array.isArray(saved)) return saved;
    } catch {}
    return [];
  }

  save() {
    this._storage.saveField("orders", this.list);
  }

  generateOrder(id, playerLevel = 1) {
    const lvl = Math.max(1, Number(playerLevel) || 1);
    const villager = VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
    
    // Sadece açık olan ürünleri listele
    const availableCrops = Object.values(CROP_TYPES).filter(
      (crop) => lvl >= crop.unlockedAt
    );
    
    const cropKeys = availableCrops.length > 0 
      ? availableCrops.map((c) => c.id) 
      : ["wheat", "corn"];
    
    // Choose 1 or 2 different crop requirements
    const count = Math.random() > 0.65 && cropKeys.length > 1 ? 2 : 1;
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

  validateExistingOrders(orders, playerLevel) {
    const lvl = Math.max(1, Number(playerLevel) || 1);
    if (!Array.isArray(orders)) return [];
    return orders.filter((order) => {
      if (!order || !Array.isArray(order.reqs)) return false;
      return order.reqs.every((req) => {
        const crop = CROP_TYPES[req.cropId];
        if (!crop) return false;
        if (lvl < crop.unlockedAt) return false;
        return true;
      });
    });
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
    const playerLevel = Number(this._storage.loadField("level")) || 1;
    const newOrder = this.generateOrder(orderId, playerLevel);
    this.list[index] = newOrder;
    this.save();

    return order; // Return old order for rewarding
  }

  reset() {
    const playerLevel = Number(this._storage.loadField("level")) || 1;
    this.list = [
      this.generateOrder("order-1", playerLevel),
      this.generateOrder("order-2", playerLevel),
      this.generateOrder("order-3", playerLevel)
    ];
    this.save();
  }
}
