// Point d'entrée du bundle Firebase : on n'embarque que ce dont le jeu se sert.
// L'app est ainsi autonome — pas de CDN, donc rien à charger depuis un tiers.
export { initializeApp } from 'firebase/app';
export {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
export {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore';
