import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId); // CRITICAL: The app will break without this line
export const auth = getAuth(app);
let storageInstance: ReturnType<typeof getStorage> | null = null;
try {
  storageInstance = getStorage(app);
} catch (error) {
  console.warn("Firebase Storage is not available in this environment.", error);
}
export const storage = storageInstance;
