export class MerchantSystem {
  constructor(storage, inventory) {
    this.storage = storage;
    this.inventory = inventory;
    
    // Satıcı verisi (Aktif mi, ne zamana kadar kalacak, hangi ürünleri satıyor)
    this.state = this.storage.loadField("merchant_state") || {
      active: false,
      expiresAt: 0,
      items: []
    };
  }

  save() {
    this.storage.saveField("merchant_state", this.state);
  }

  // Ana oyun döngüsünde (dakikada bir) çağrılır
  checkSpawn() {
    const now = Date.now();
    if (this.state.active) {
      if (now > this.state.expiresAt) {
        this.despawn();
      }
    } else {
      // Satıcı yoksa %15 ihtimalle ortaya çıksın
      if (Math.random() < 0.15) {
        this.spawn();
      }
    }
  }

  spawn() {
    this.state.active = true;
    this.state.expiresAt = Date.now() + 15 * 60 * 1000; // 15 dakika boyunca çiftlikte durur
    this.state.items = this.generateItems();
    this.save();
    
    // Arayüzün haberdar olması için event fırlat
    window.dispatchEvent(new CustomEvent("merchant-arrived"));
  }

  despawn() {
    this.state.active = false;
    this.state.items = [];
    this.save();
    
    window.dispatchEvent(new CustomEvent("merchant-left"));
  }

  generateItems() {
    // Özel veya indirimli ürünler
    const possibleItems = [
      { id: "fertilizer_golden", name: "Altın Gübre", price: 150, type: "fertilizer", desc: "%100 Altın Mahsul Çıkarır!", icon: "✨" },
      { id: "fertilizer_super", name: "Süper Gübre Paketi (x3)", price: 100, type: "bundle", desc: "Büyümeyi 3 kat hızlandırır", icon: "🧪" },
      { id: "pumpkin", name: "Nadir Bal Kabağı Tohumu", price: 80, type: "seed", desc: "Mevsim dışı ekilebilir özel tohum", icon: "🎃" }
    ];

    // Satıcı geldiğinde rastgele 2 ürün satar
    const shuffled = possibleItems.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 2).map(item => ({ ...item, sold: false }));
  }

  buyItem(index, coins) {
    if (!this.state.active) return { success: false, reason: "Satıcı ayrılmış!" };
    
    const item = this.state.items[index];
    if (!item || item.sold) return { success: false, reason: "Bu ürün zaten satıldı." };
    if (coins < item.price) return { success: false, reason: "Yeterli altının yok." };
    
    item.sold = true;
    this.save();
    
    return { success: true, item: item };
  }
}
