import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

type ErpFirebaseRuntimeConfig = Partial<FirebaseOptions> & {
  firestoreDatabaseId?: string;
};

declare global {
  interface Window {
    __ERP_RUNTIME_CONFIG__?: ErpFirebaseRuntimeConfig;
    __ERP_RUNTIME_CONFIG_REQUIRED__?: boolean;
  }
}

const firebaseConfig = window.__ERP_RUNTIME_CONFIG__;
const requiredFields: (keyof ErpFirebaseRuntimeConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
  "storageBucket",
  "messagingSenderId",
  "firestoreDatabaseId",
];

const missingFields = requiredFields.filter((field) => !firebaseConfig?.[field]);
if (missingFields.length > 0) {
  throw new Error(
    "Konfigurasi Firebase runtime belum lengkap. Hubungi administrator instalasi."
  );
}

const { firestoreDatabaseId, ...firebaseOptions } = firebaseConfig!;
const app = initializeApp(firebaseOptions as FirebaseOptions);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firestoreDatabaseId);
export const auth = getAuth(app);
let storageInstance: ReturnType<typeof getStorage> | null = null;
try {
  storageInstance = getStorage(app);
} catch (error) {
  console.warn("Firebase Storage is not available in this environment.", error);
}
export const storage = storageInstance;
