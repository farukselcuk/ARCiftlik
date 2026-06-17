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
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from "firebase/firestore";

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
export const db = getFirestore(app);
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
    nickname = userSnap.data().nickname;
  } else {
    nickname = sanitizeNickname(user.displayName || user.email.split("@")[0]);
    await setDoc(userDocRef, {
      userId: user.uid,
      nickname: nickname,
      email: user.email,
      createdAt: new Date()
    });

    // Create empty save doc
    await setDoc(doc(db, "saves", user.uid), {
      updatedAt: new Date()
    });
  }
  return nickname;
}

/**
 * Initializes Firebase Auth state changes, handling redirect result first
 * @param {function} onAuthChanged - Callback invoked on auth state change
 */
export function initFirebase(onAuthChanged) {
  // Check redirect result first (page load after redirect sign in)
  getRedirectResult(auth)
    .then(async (result) => {
      if (result?.user) {
        console.log("[FirebaseService] Redirect login success:", result.user.email);
        try {
          await loadOrCreateProfile(result.user);
        } catch (e) {
          console.error("[FirebaseService] Error loading/creating profile after redirect:", e);
        }
      }
    })
    .catch((err) => {
      console.error("[FirebaseService] Redirect result error:", err);
    })
    .finally(() => {
      // Set up standard auth state listener
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
    createdAt: new Date()
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
  window.addEventListener("game-state-changed", () => {
    const user = auth.currentUser;
    if (!user) return; // Sync only if user is logged in
    
    if (syncTimeout) clearTimeout(syncTimeout);
    
    syncTimeout = setTimeout(async () => {
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
    }, 2000); // 2-second debounce
  });
}
