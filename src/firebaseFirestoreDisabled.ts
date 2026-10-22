const firebaseClientDatabaseDisabled = (..._args: unknown[]): never => {
  throw new Error("Firebase client database access is disabled. Use the tenant-scoped Supabase API.");
};

export const addDoc = firebaseClientDatabaseDisabled;
export const collection = firebaseClientDatabaseDisabled;
export const deleteDoc = firebaseClientDatabaseDisabled;
export const doc = firebaseClientDatabaseDisabled;
export const documentId = firebaseClientDatabaseDisabled;
export const getDoc = firebaseClientDatabaseDisabled;
export const getDocs = firebaseClientDatabaseDisabled;
export const onSnapshot = firebaseClientDatabaseDisabled;
export const orderBy = firebaseClientDatabaseDisabled;
export const query = firebaseClientDatabaseDisabled;
export const runTransaction = firebaseClientDatabaseDisabled;
export const serverTimestamp = firebaseClientDatabaseDisabled;
export const setDoc = firebaseClientDatabaseDisabled;
export const updateDoc = firebaseClientDatabaseDisabled;
export const where = firebaseClientDatabaseDisabled;
export const writeBatch = firebaseClientDatabaseDisabled;

export class Timestamp {
  static now(): never {
    return firebaseClientDatabaseDisabled();
  }

  static fromDate(...args: unknown[]): never {
    return firebaseClientDatabaseDisabled(...args);
  }

  static fromMillis(...args: unknown[]): never {
    return firebaseClientDatabaseDisabled(...args);
  }
}
