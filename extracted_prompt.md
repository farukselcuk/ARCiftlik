<USER_REQUEST>
# ARÇiftlik — Yeni Özellikler Promptu (Opus 4.6)

Mevcut projeye aşağıdaki 6 yeni özelliği ekle.
Mevcut dosya yapısını ve kod stilini koru. Vanilla JS + Three.js.

---

## 🌧️ ÖZELLİK 1: YAĞMUR & MEVSİM ANİMASYONLARI

### `js/weather.js` — yeni dosya

```javascript
// Hava durumu sistemi
// Mevcut CROP_TYPES growTime'ını doğrudan değiştirme — çarpan kullan

export const Weather = {
  current: 'sunny', // 'sunny' | 'rainy' | 'stormy' | 'cloudy'
  season: 'spring', // 'spring' | 'summer' | 'autumn' | 'winter'

  // Gerçek takvim ayına göre mevsim belirle
  getSeason() {
    const month = new Date().getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  },

  // 6 saatte bir değişir
  update() {
    const hour = new Date().getHours();
    const slot = Math.floor(hour / 6); // 0,1,2,3
    // Deterministik ama günlük farklı — tarih + slot ile seed
    const seed = new Date().toDateString() + slot;
    const rand = this.seededRandom(seed);
    const options = ['sunny','sunny','sunny','cloudy','rainy','stormy'];
    this.current = options[Math.floor(rand * options.length)];
    this.season = this.getSeason();
    return { weather: this.current, season: this.season };
  },

  // Büyüme çarpanı — crops.js'deki growTime ile çarp
  getGrowthMultiplier() {
    const weatherMult = { sunny: 0.9, cloudy: 1.0, rainy: 0.85, stormy: 1.2 };
    const seasonMult  = { spring: 0.9, summer: 0.85, autumn: 1.0, winter: 1.5 };
    return weatherMult[this.current] * seasonMult[this.season];
  },

  // Yağmurda sulama otomatik
  isRaining() {
    return this.current === 'rainy' || this.current === 'stormy';
  },

  seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    return Math.abs(h) / 2147483647;
  }
};
<truncated 22691 bytes>
s.x, 0.01, pos.z);
    scene.add(mesh);
    return mesh;
  });
  return indicators; // exitEditMode'da dispose et
}
```

---

## 📋 ETKİLENEN DOSYALAR

| Dosya | İşlem |
|-------|-------|
| `js/weather.js` | Yeni oluştur |
| `js/particles.js` | Yeni oluştur (yağmur/kar) |
| `js/audio.js` | Yeni oluştur |
| `js/social.js` | Yeni oluştur |
| `js/decorations.js` | Yeni oluştur |
| `js/farm.js` | Aksesuar çakışma sistemi ekle |
| `js/scenes/market-scene.js` | Gübre ürünleri ekle |
| `js/main.js` | Audio.init(), Weather.update(), particles animate loop |
| `js/ui.js` | Hava ikonu, ziyaret ekranı, aksesuar modu |
| `style.css` | Ziyaret ekranı, gübre kartları |

---

## ⚠️ GENEL KURALLAR

1. **Aksesuarlar ASLA plot grid'i üzerine çakışmasın** — genişleme olunca `recalculateAfterExpansion` çağır
2. **Ses Web Audio API ile prosedürel** — harici dosya gerekmez
3. **Yağmur/kar Three.js particles** — `dispose()` ile temizle, bellek sızıntısı olmasın
4. **Arkadaş verisi salt okunur** — ziyarette kendi GameState'ini değiştirme, sadece orada göster
5. **Gübre envantere girer** — tarla tıklandığında seçenek olarak çıkar
6. **Firebase `helpReceived` ve `visitLog`** — sunucu tarafı timestamp kullan
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-06-17T14:38:25+03:00.

The user's current state is as follows:
Other open documents:
- d:\ARÇiftlik\index.html (LANGUAGE_HTML)
- d:\ARÇiftlik\js\firebase-service.js (LANGUAGE_JAVASCRIPT)
- d:\ARÇiftlik\js\scenes\barn-scene.js (LANGUAGE_JAVASCRIPT)
- d:\ARÇiftlik\js\character.js (LANGUAGE_JAVASCRIPT)
- d:\ARÇiftlik\js\daily-login.js (LANGUAGE_JAVASCRIPT)
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from None to Claude Opus 4.6 (Thinking). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>