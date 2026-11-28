import assert from "node:assert/strict";
import { buildIdentityStoreDiagnostic } from "../src/server/identityDiagnostics";

const privateMessage = "user@example.invalid: private row details and secret-value";
const diagnostic = buildIdentityStoreDiagnostic("profile.read", {
  code: "PGRST116",
  name: "PostgrestError",
  status: 503,
  message: privateMessage,
  details: privateMessage,
});

assert.deepEqual(diagnostic, {
  operation: "profile.read",
  errorCode: "PGRST116",
  errorType: "PostgrestError",
  httpStatus: 503,
});
assert.equal(JSON.stringify(diagnostic).includes(privateMessage), false);
assert.equal(JSON.stringify(diagnostic).includes("user@example.invalid"), false);

const configurationDiagnostic = buildIdentityStoreDiagnostic(
  "client.configure",
  undefined,
  ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "PASSWORD", "SUPABASE_URL"],
);
assert.deepEqual(configurationDiagnostic, {
  operation: "client.configure",
  missingEnvironmentVariables: ["SUPABASE_URL", "SUPABASE_SECRET_KEY"],
});

const invalidDiagnostic = buildIdentityStoreDiagnostic("profile.read user@example.invalid", {
  code: "private code with spaces",
  name: "PostgrestError\nsecret",
  status: 700,
});
assert.deepEqual(invalidDiagnostic, { operation: "unknown" });

console.log("Identity store diagnostics: safe metadata and sensitive detail omission passed.");
