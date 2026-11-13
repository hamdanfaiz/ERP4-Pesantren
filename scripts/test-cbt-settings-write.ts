import assert from "node:assert/strict";
import { normalizeCbtTenantSettingsWrite, SupabaseCbtError } from "../src/server/supabaseCbt";

const valid = { autoGrading: true, shuffleQuestions: true, correctPoints: 1.5, wrongPoints: -0.25, blankPoints: 0 };
assert.deepEqual(normalizeCbtTenantSettingsWrite(valid), valid, "supported tenant defaults pass validation unchanged");

for (const [label, payload] of [
  ["manual grading", { ...valid, autoGrading: false }],
  ["string points", { ...valid, correctPoints: "2" }],
  ["too precise", { ...valid, wrongPoints: -0.251 }],
  ["above maximum", { ...valid, correctPoints: 100.01 }],
  ["below minimum", { ...valid, blankPoints: -100.01 }],
  ["unexpected field", { ...valid, tenantId: "attacker-controlled" }],
  ["missing field", { autoGrading: true, shuffleQuestions: false }],
] as const) {
  assert.throws(() => normalizeCbtTenantSettingsWrite(payload), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} is rejected as a client validation error`);
}

assert.equal(normalizeCbtTenantSettingsWrite({ ...valid, shuffleQuestions: false }).shuffleQuestions, false, "shuffle can be disabled per tenant");
console.log("CBT settings write validation: 9 assertions passed");
