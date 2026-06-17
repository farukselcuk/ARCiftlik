import { db, auth } from "./firebase-service.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  arrayUnion, 
  addDoc,
  deleteDoc,
  serverTimestamp 
} from "firebase/firestore";

export function generateFriendCode(uid) {
  if (!uid) return "AAAAAA";
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  const code = Math.abs(hash).toString(36).toUpperCase().substring(0, 6);
  return (code + "AAAAAA").substring(0, 6);
}

export class SocialSystem {
  /**
   * @param {GameStorage} globalStorage 
   * @param {Inventory} inventory
   */
  constructor(globalStorage, inventory) {
    this.globalStorage = globalStorage;
    this.inventory = inventory;
  }

  get myUid() {
    return auth.currentUser?.uid;
  }

  /**
   * Adds a friend by their 6-character friend code
   * @param {string} friendCode 
   * @returns {Promise<object>} Friend user info
   */
  async addFriend(friendCode) {
    const trimmedCode = friendCode.trim().toUpperCase();
    if (!this.myUid) throw new Error("Oturum açık değil!");

    const myProfileSnap = await getDoc(doc(db, "users", this.myUid));
    if (myProfileSnap.exists()) {
      const myData = myProfileSnap.data();
      if (myData.friendCode === trimmedCode) {
        throw new Error("Kendi kodunuzu ekleyemezsiniz!");
      }
    }

    // Search users for the friendCode
    const q = query(collection(db, "users"), where("friendCode", "==", trimmedCode));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      throw new Error("Bu koda sahip bir çiftçi bulunamadı!");
    }

    const friendDoc = querySnapshot.docs[0];
    const friendData = friendDoc.data();
    const friendUid = friendDoc.id;

    // Add friend to current user's friends list
    const myUserRef = doc(db, "users", this.myUid);
    await updateDoc(myUserRef, {
      friends: arrayUnion(friendUid)
    });

    return {
      uid: friendUid,
      nickname: friendData.nickname || "Çiftçi"
    };
  }

  /**
   * Fetches the current user's friends details (nickname, level)
   * @returns {Promise<Array>}
   */
  async getFriendsList() {
    if (!this.myUid) return [];
    
    const myProfileSnap = await getDoc(doc(db, "users", this.myUid));
    if (!myProfileSnap.exists() || !myProfileSnap.data().friends) return [];

    const friendUids = myProfileSnap.data().friends;
    const friendsDetails = [];

    for (const friendUid of friendUids) {
      try {
        const friendUserSnap = await getDoc(doc(db, "users", friendUid));
        const friendSaveSnap = await getDoc(doc(db, "saves", friendUid));
        
        if (friendUserSnap.exists()) {
          const uData = friendUserSnap.data();
          const sData = friendSaveSnap.exists() ? friendSaveSnap.data() : {};
          
          let level = 1;
          if (sData["arciftlik:global:state"]) {
            try {
              const state = JSON.parse(sData["arciftlik:global:state"]);
              level = state.level || 1;
            } catch {}
          }

          friendsDetails.push({
            uid: friendUid,
            nickname: uData.nickname || "Çiftçi",
            level: level
          });
        }
      } catch (e) {
        console.error("Arkadaş bilgisi alınamadı:", friendUid, e);
      }
    }

    return friendsDetails;
  }

  /**
   * Loads friend save data for 3D viewing
   * @param {string} friendUid 
   * @param {string} myNickname 
   * @returns {Promise<object>} Friend save data
   */
  async visitFriendFarm(friendUid, myNickname) {
    if (!this.myUid) throw new Error("Oturum açık değil!");

    const saveSnap = await getDoc(doc(db, "saves", friendUid));
    if (!saveSnap.exists()) throw new Error("Çiftlik verisi bulunamadı!");

    // Log the visit in friend's save
    try {
      const friendSaveRef = doc(db, "saves", friendUid);
      await updateDoc(friendSaveRef, {
        visitLog: arrayUnion({
          visitorUid: this.myUid,
          visitorName: myNickname || "Misafir",
          timestamp: new Date() // Will be synced as client-timestamp but let's use client Date in Firestore
        })
      });
    } catch (err) {
      console.error("Ziyaret günlüğü yazılamadı:", err);
    }

    return saveSnap.data();
  }

  /**
   * Helps a friend's farm (once per day per friend)
   * Gives +10 XP to helper, leaves notification for friend
   * @param {string} friendUid 
   * @param {string} myNickname 
   * @returns {Promise<boolean>}
   */
  async helpFriend(friendUid, myNickname) {
    if (!this.myUid) throw new Error("Oturum açık değil!");

    // Check last help timestamp from local storage / state
    const helpedTodayKey = `helped_today_${friendUid}`;
    const lastHelpTime = localStorage.getItem(helpedTodayKey);
    const now = Date.now();
    
    // Help once per 24 hours
    if (lastHelpTime && (now - parseInt(lastHelpTime) < 24 * 60 * 60 * 1000)) {
      throw new Error("Bu arkadaşa bugün zaten yardım ettiniz!");
    }

    // Record help in friend's Firestore save
    const friendSaveRef = doc(db, "saves", friendUid);
    await updateDoc(friendSaveRef, {
      helpReceived: arrayUnion({
        helperUid: this.myUid,
        helperName: myNickname || "Arkadaş",
        timestamp: new Date()
      })
    });

    // Save help time locally
    localStorage.setItem(helpedTodayKey, now.toString());
    return true;
  }

  /**
   * Sends a gift to a friend
   * @param {string} friendUid 
   * @param {string} myNickname 
   * @param {string} type - 'fertilizer_basic' | 'fertilizer_super' | 'fertilizer_golden' | 'coins_50'
   */
  async sendGift(friendUid, myNickname, type) {
    if (!this.myUid) throw new Error("Oturum açık değil!");

    // Check inventory
    if (type.startsWith("fertilizer_")) {
      if (!this.inventory.has(type, 1)) {
        throw new Error("Envanterinizde bu gübreden bulunmuyor!");
      }
      // Deduct from local inventory
      this.inventory.deduct(type, 1);
    } else if (type === "coins_50") {
      // Handled in main.js coins deduction
    }

    // Add to friend's gifts subcollection
    const giftsColRef = collection(db, "saves", friendUid, "gifts");
    await addDoc(giftsColRef, {
      senderUid: this.myUid,
      senderName: myNickname || "Arkadaş",
      type: type,
      timestamp: new Date()
    });
  }

  /**
   * Claims received gifts
   * @returns {Promise<Array>} List of claimed gifts
   */
  async claimGifts() {
    if (!this.myUid) return [];

    const giftsColRef = collection(db, "saves", this.myUid, "gifts");
    const snap = await getDocs(giftsColRef);
    const claimed = [];

    for (const giftDoc of snap.docs) {
      const gift = giftDoc.data();
      claimed.push({
        id: giftDoc.id,
        type: gift.type,
        senderName: gift.senderName
      });
      // Delete the gift so it's not claimed again
      await deleteDoc(doc(db, "saves", this.myUid, "gifts", giftDoc.id));
    }

    return claimed;
  }

  /**
   * Fetches incoming gifts without claiming them
   * @returns {Promise<Array>}
   */
  async getIncomingGifts() {
    if (!this.myUid) return [];
    const giftsColRef = collection(db, "saves", this.myUid, "gifts");
    const snap = await getDocs(giftsColRef);
    return snap.docs.map(doc => ({
      id: doc.id,
      type: doc.data().type,
      senderName: doc.data().senderName
    }));
  }

  // ── P2P TİCARET POSTASI METOTLARI ─────────────────────────────────

  /**
   * Oyuncunun ticaret postasında eşya listeler.
   */
  listShopItem(itemType, amount, price) {
    if (!this.myUid) throw new Error("Oturum açık değil!");
    if (amount <= 0 || price <= 0) throw new Error("Miktar ve fiyat sıfırdan büyük olmalıdır!");

    const currentStock = this.inventory.getCount(itemType);
    if (currentStock < amount) {
      throw new Error("Envanterinizde yeterli miktarda ürün yok!");
    }

    // Envanterden düş
    if (this.inventory.deduct(itemType, amount)) {
      const shopItems = this.globalStorage.loadField("shopItems") || [];
      const itemId = Math.random().toString(36).substring(2, 9);
      shopItems.push({
        id: itemId,
        itemType: itemType,
        amount: amount,
        price: price
      });
      this.globalStorage.saveField("shopItems", shopItems);
      return true;
    }
    return false;
  }

  /**
   * Listelenen eşyayı iptal eder, envantere geri ekler.
   */
  removeShopItem(itemId) {
    if (!this.myUid) throw new Error("Oturum açık değil!");
    
    const shopItems = this.globalStorage.loadField("shopItems") || [];
    const idx = shopItems.findIndex(item => item.id === itemId);
    if (idx === -1) throw new Error("Eşya bulunamadı!");

    const item = shopItems[idx];
    this.inventory.add(item.itemType, item.amount);
    shopItems.splice(idx, 1);
    this.globalStorage.saveField("shopItems", shopItems);
    return true;
  }

  /**
   * Arkadaşın ticaret postasındaki eşyayı satın alır.
   * Arkadaşın pendingGold değerini artırır.
   */
  async buyShopItem(friendUid, itemId) {
    if (!this.myUid) throw new Error("Oturum açık değil!");
    if (friendUid === this.myUid) throw new Error("Kendi tezgahınızdan satın alamazsınız!");

    const friendSaveRef = doc(db, "saves", friendUid);
    const snap = await getDoc(friendSaveRef);
    if (!snap.exists()) throw new Error("Arkadaş çiftliği verisi bulunamadı!");

    const data = snap.data();
    const globalStateKey = "arciftlik:global:state";
    if (!data[globalStateKey]) throw new Error("Arkadaş mağaza verisi bulunamadı!");

    let friendGlobalState = JSON.parse(data[globalStateKey]);
    const friendShopItems = friendGlobalState.shopItems || [];
    const idx = friendShopItems.findIndex(item => item.id === itemId);
    if (idx === -1) throw new Error("Bu ürün satılmış veya kaldırılmış!");

    const item = friendShopItems[idx];

    // Para kontrolü
    const myCoins = this.globalStorage.loadField("coins") || 0;
    if (myCoins < item.price) {
      throw new Error("Yetersiz Altın!");
    }

    // Alıcının parasını düş, envanterini artır
    this.globalStorage.saveField("coins", myCoins - item.price);
    this.inventory.add(item.itemType, item.amount);

    // Arkadaşın tezgahından ürünü çıkar, pendingGold ekle
    friendShopItems.splice(idx, 1);
    friendGlobalState.shopItems = friendShopItems;
    friendGlobalState.pendingGold = (friendGlobalState.pendingGold || 0) + item.price;

    // Arkadaşın belgesini güncelle
    await updateDoc(friendSaveRef, {
      [globalStateKey]: JSON.stringify(friendGlobalState),
      updatedAt: new Date()
    });

    return item;
  }

  /**
   * Satışlardan biriken altınları toplayıp oyuncu hesabına aktarır.
   */
  claimPendingGold() {
    if (!this.myUid) return 0;

    const pending = this.globalStorage.loadField("pendingGold") || 0;
    if (pending > 0) {
      const myCoins = this.globalStorage.loadField("coins") || 0;
      this.globalStorage.saveField("coins", myCoins + pending);
      this.globalStorage.saveField("pendingGold", 0);
      return pending;
    }
    return 0;
  }
}
