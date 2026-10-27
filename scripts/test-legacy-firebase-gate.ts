import assert from "node:assert/strict";
import { isLegacyFirebaseAdminEnabled } from "../src/server/legacyFirebaseGate";

for (const environment of [
  { NODE_ENV: "development", LEGACY_FIREBASE_ADMIN_ENABLED: "true" },
  { NODE_ENV: "development", LEGACY_FIREBASE_ADMIN_ENABLED: "false" },
  { NODE_ENV: "production", LEGACY_FIREBASE_ADMIN_ENABLED: "true" },
  { NODE_ENV: "test", LEGACY_FIREBASE_ADMIN_ENABLED: "true" },
  { LEGACY_FIREBASE_ADMIN_ENABLED: "true" },
  {},
]) {
  assert.equal(isLegacyFirebaseAdminEnabled(environment), false);
}

console.log("Legacy Firebase gate passed: Firestore access stays disabled in every environment.");
