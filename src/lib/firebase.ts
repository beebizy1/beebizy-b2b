import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Firebase requires real project credentials (see .env.example). Until a
// developer supplies them, every other page in the app should keep working
// normally — only the auth pages need a configured project.
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  firebaseApp = initializeApp(firebaseConfig);
  authInstance = getAuth(firebaseApp);
  storageInstance = getStorage(firebaseApp);
  // Firestore databases created with a custom database ID (instead of the
  // "(default)" database) must be looked up by that ID explicitly, or the
  // SDK throws "Database '(default)' not found".
  const firestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID || undefined;
  dbInstance = firestoreDatabaseId ? getFirestore(firebaseApp, firestoreDatabaseId) : getFirestore(firebaseApp);
}

export { firebaseApp };
export const auth = authInstance;
export const storage = storageInstance;
export const db = dbInstance;
export const googleProvider = new GoogleAuthProvider();
