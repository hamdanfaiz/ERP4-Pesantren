import assert from "node:assert/strict";
import { isLegacyFirebaseAdminEnabled } from "../src/server/legacyFirebaseGate";

assert.equal(isLegacyFirebaseAdminEnabled({ NODE_ENV: "development", LEGACY_FIREBASE_ADMIN_ENABLED: "true" }), true);
assert.equal(isLegacyFirebaseAdminEnabled({ NODE_ENV: "development", LEGACY_FIREBASE_ADMIN_ENABLED: "false" }), false);
assert.equal(isLegacyFirebaseAdminEnabled({ NODE_ENV: "production", LEGACY_FIREBASE_ADMIN_ENABLED: "true" }), false);
assert.equal(isLegacyFirebaseAdminEnabled({ NODE_ENV: "test", LEGACY_FIREBASE_ADMIN_ENABLED: "true" }), false);
assert.equal(isLegacyFirebaseAdminEnabled({ LEGACY_FIREBASE_ADMIN_ENABLED: "true" }), false);

console.log("Legacy Firebase gate passed: only explicitly enabled local development can initialize Firestore Admin.");
