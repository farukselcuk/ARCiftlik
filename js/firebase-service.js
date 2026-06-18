/**
 * firebase-service.js — Firebase Authentication and Firestore Orchestrator
 * Exposes core auth, synchronization, and leaderboard APIs using Firebase v10 CDN modules.
 */

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  onSnapshot
} from "firebase/firestore";

export { doc, getDoc };


// ── Firebase Configuration ─────────────────────────────────────────
// REPLACE this configuration with your Firebase Project credentials.
const firebaseConfig = {
  apiKey: "AIzaSyDQdIhlk44jnFmnmPPeXgLh6StB7MrsLpw",
  authDomain: "ciftlik-57eba.firebaseapp.com",
  projectId: "ciftlik-57eba",
  storageBucket: "ciftlik-57eba.firebasestorage.app",
  messagingSenderId: "819088730365",
  appId: "1:819088730365:web:665f7b21b9658f899ab694",
  measurementId: "G-6TFKQVH361"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
const googleProvider = new GoogleAuthProvider();

/**
 * Clean and sanitize display names for nicknames
 * @param {string} name 
 * @returns {string}
 */
export function sanitizeNickname(name) {
  if (!name) return "Çiftçi";
  // Remove non-alphanumeric and non-Turkish characters
  let clean = name.replace(/[^a-zA-Z0-9a-zA-ZçÇğĞıİöÖşŞüÜ]/g, "");
  if (clean.length > 12) clean = clean.slice(0, 12);
  if (clean.length < 3) clean = "Çiftçi";
  const rand = Math.floor(100 + Math.random() * 900);
  return `${clean}${rand}`;
}

function generateFriendCode(uid) {
  if (!uid) return "AAAAAA";
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  const code = Math.abs(hash).toString(36).toUpperCase().substring(0, 6);
  return (code + "AAAAAA").substring(0, 6);
}

/**
 * Loads or creates user profile and empty save doc in Firestore
 * @param {object} user - Firebase user object
 * @returns {Promise<string>} User nickname
 */
export async function loadOrCreateProfile(user) {
  const userDocRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userDocRef);
  
  let nickname;
  if (userSnap.exists()) {
    const data = userSnap.data();
    nickname = data.nickname;
    if (!data.friendCode) {
      await setDoc(userDocRef, {
        friendCode: generateFriendCode(user.uid),
        friends: data.friends || []
      }, { merge: true });
    }
  } else {
    nickname = sanitizeNickname(user.displayName || user.email.split("@")[0]);
    await setDoc(userDocRef, {
      userId: user.uid,
      nickname: nickname,
      email: user.email,
      createdAt: new Date(),
      friendCode: generateFriendCode(user.uid),
      friends: []
    });

    // Create empty save doc
    await setDoc(doc(db, "saves", user.uid), {
      updatedAt: new Date()
    });
  }
  return nickname;
}

/**
 * Initializes Firebase Auth state changes
 * @param {function} onAuthChanged - Callback invoked on auth state change
 */
export function initFirebase(onAuthChanged) {
  // Sadece redirect hatalarını loglamak için
  getRedirectResult(auth).catch((err) => {
    console.error("[FirebaseService] Redirect result error:", err);
  });

  // Standart auth dinleyicisini doğrudan başlat (race condition önler)
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const nickname = await loadOrCreateProfile(user);
        onAuthChanged(user, nickname);
      } catch (err) {
        console.error("[FirebaseService] Error loading user profile on auth change:", err);
        onAuthChanged(user, "Çiftçi");
      }
    } else {
      onAuthChanged(null, null);
    }
  });
}

/**
 * Register with Email and Password
 * @param {string} email 
 * @param {string} password 
 * @param {string} nickname 
 */
export async function registerWithEmail(email, password, nickname) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Create User Profile in Firestore
  await setDoc(doc(db, "users", user.uid), {
    userId: user.uid,
    nickname: nickname,
    email: email,
    createdAt: new Date(),
    friendCode: generateFriendCode(user.uid),
    friends: []
  });

  // Create empty save doc
  await setDoc(doc(db, "saves", user.uid), {
    updatedAt: new Date()
  });

  return { user, nickname };
}

/**
 * Login with Email and Password
 * @param {string} email 
 * @param {string} password 
 */
export async function signInWithEmail(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Login/Register with Google (Popup with Redirect fallback)
 */
export async function signInWithGoogle() {
  try {
    // 1. Önce popup dene
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const nickname = await loadOrCreateProfile(user);
    return { user, nickname };
  } catch (err) {
    console.error('[FirebaseService] Google popup hatası:', err.code, err.message);

    // 2. Popup bloklandıysa redirect'e geç
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/cancelled-popup-request' ||
      err.code === 'auth/popup-closed-by-user'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return; // Sayfa yenilenir
    }

    throw err;
  }
}

/**
 * Sign Out Current User
 */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Download Game Save Data from Firestore
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
export async function loadGameData(userId) {
  const saveSnap = await getDoc(doc(db, "saves", userId));
  if (saveSnap.exists()) {
    return saveSnap.data();
  }
  return null;
}

/**
 * Query Global Leaderboard
 * @returns {Promise<Array>} List of user scores ordered desc
 */
export async function getLeaderboardData() {
  const q = query(
    collection(db, "leaderboard"),
    orderBy("score", "desc"),
    limit(50)
  );
  
  const querySnapshot = await getDocs(q);
  const list = [];
  querySnapshot.forEach((doc) => {
    list.push(doc.data());
  });
  return list;
}

// ── Background Firestore Synchronization ───────────────────────────
let syncTimeout = null;

/**
 * Starts synchronization listener for window.gameInMemoryCache state changes
 */
export function initSyncListener() {
  const syncNow = async () => {
    const user = auth.currentUser;
    if (!user) return; // Sync only if user is logged in
    
    try {
      const docRef = doc(db, "saves", user.uid);
      
      // Pick all arciftlik state keys from memory cache
      const dataToSave = {};
      let hasData = false;
      
      for (const key in window.gameInMemoryCache) {
        if (key.startsWith("arciftlik:")) {
          dataToSave[key] = window.gameInMemoryCache[key];
          hasData = true;
        }
      }
      
      if (!hasData) return;
      
      dataToSave.updatedAt = new Date();
      
      // Save to Firestore
      await setDoc(docRef, dataToSave, { merge: true });
      console.log("[FirebaseSync] Saved game state to Firestore successfully.");
      
      // Update Leaderboard score (based on coins and level)
      const globalStateRaw = window.gameInMemoryCache["arciftlik:global:state"];
      if (globalStateRaw) {
        const globalState = JSON.parse(globalStateRaw);
        const coins = globalState.coins ?? 100;
        const level = globalState.level ?? 1;
        
        // Primary score is current coins
        const score = coins;
        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const nickname = userDoc.exists() ? userDoc.data().nickname : "Çiftçi";
        
        await setDoc(doc(db, "leaderboard", user.uid), {
          userId: user.uid,
          nickname: nickname,
          score: score,
          level: level,
          coins: coins,
          updatedAt: new Date()
        });
      }
    } catch (err) {
      console.error("[FirebaseSync] Error syncing game state to Firestore:", err);
    }
  };

  window.addEventListener("game-state-changed", () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncNow, 2000); // 2-second debounce
  });

  // Sayfa kapanmadan önce bekleyen verileri senkronize et
  window.addEventListener("beforeunload", () => {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncNow();
    }
  });
}

/**
 * Initializes a real-time listener on the user's save document to capture
 * remote changes (like purchases from the trading post by other players).
 * @param {function} onRemoteUpdate - Callback invoked when remote changes are detected
 */
export function initRealtimeSaveListener(onRemoteUpdate) {
  const user = auth.currentUser;
  if (!user) return null;

  const docRef = doc(db, "saves", user.uid);
  return onSnapshot(docRef, (docSnap) => {
    // Ignore updates that are driven by local writes
    if (docSnap.metadata.hasPendingWrites) return;

    if (docSnap.exists()) {
      onRemoteUpdate(docSnap.data());
    }
  });
}
