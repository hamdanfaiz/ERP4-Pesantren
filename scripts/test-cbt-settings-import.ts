import assert from "node:assert/strict";
import {
  previewSupabaseLegacyCbtSettings,
  type LegacyCbtSettingsSourceRow,
} from "../src/server/supabaseCbtSettingsImport";

process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "cbt-settings-preview-test-key-1234567890";

const tenantKey = "pesantren-digital";
const valid: LegacyCbtSettingsSourceRow = {
  id: tenantKey,
  data: {
    tenantId: tenantKey,
    subjects: ["Matematika", "Bahasa Indonesia"],
    grades: ["VII", "VIII"],
    templates: ["Paket A", "Paket B"],
    autoGrading: true,
    shuffleQuestions: false,
    correctScore: 1,
    wrongScore: -0.25,
    blankScore: 0,
  },
};

const ready = previewSupabaseLegacyCbtSettings([valid], [], tenantKey);
assert.equal(ready.canApply, true, "one verified tenant config is importable");
assert.deepEqual(ready.counts, { source: 1, ready: 1, alreadyImported: 0, invalid: 0 });
assert.deepEqual(ready.items[0].settings.subjects, ["Matematika", "Bahasa Indonesia"]);
assert.equal(ready.items[0].settings.wrongScore, -0.25);

const mapped = previewSupabaseLegacyCbtSettings([valid], [], "different-tenant");
assert.equal(mapped.canApply, false, "a document with a different tenant key is blocked");
assert.equal(mapped.issues[0]?.code, "cbt_config_tenant_mapping_mismatch");

const wrongType = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, grades: "VII,VIII" } },
], [], tenantKey);
assert.equal(wrongType.canApply, false, "string-encoded lists are not coerced into arrays");

const coercedScore = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, correctScore: "1" } },
], [], tenantKey);
assert.equal(coercedScore.canApply, false, "string-encoded scores are not coerced into numbers");

const duplicate = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, subjects: ["Matematika", " matematika "] } },
], [], tenantKey);
assert.equal(duplicate.canApply, false, "duplicate values are not silently collapsed");

const manual = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, autoGrading: false } },
], [], tenantKey);
assert.equal(manual.canApply, false, "manual grading is blocked until its runtime is implemented");
assert.equal(manual.issues[0]?.code, "manual_grading_policy_not_supported");

const outOfRange = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, wrongScore: -101 } },
], [], tenantKey);
assert.equal(outOfRange.canApply, false, "scores outside CBT bounds are blocked");

const extraField = previewSupabaseLegacyCbtSettings([
  { ...valid, data: { ...valid.data, apiKey: "must-not-be-imported" } },
], [], tenantKey);
assert.equal(extraField.canApply, false, "unknown configuration fields are not imported");

const alreadyImported = previewSupabaseLegacyCbtSettings([valid], [{
  source_system: "legacy_firestore",
  source_record_id: ready.items[0].sourceRecordId,
  source_fingerprint: ready.items[0].sourceFingerprint,
}], tenantKey);
assert.equal(alreadyImported.counts.alreadyImported, 1, "an identical source snapshot is recognized as a retry");
assert.equal(alreadyImported.canApply, false, "an identical retry does not create a second import");

const changed = previewSupabaseLegacyCbtSettings([valid], [{
  source_system: "legacy_firestore",
  source_record_id: ready.items[0].sourceRecordId,
  source_fingerprint: "f".repeat(64),
}], tenantKey);
assert.equal(changed.canApply, false, "changed configuration cannot overwrite an earlier import");
assert.equal(changed.issues[0]?.code, "cbt_settings_already_configured");

const missing = previewSupabaseLegacyCbtSettings([], [], tenantKey);
assert.equal(missing.canApply, false, "missing configuration cannot be fabricated");
assert.equal(missing.issues[0]?.code, "cbt_config_not_found");

const multiple = previewSupabaseLegacyCbtSettings([valid, { ...valid, id: "another-doc" }], [], tenantKey);
assert.equal(multiple.canApply, false, "multiple config docs cannot be assigned to one tenant automatically");

console.log("CBT settings import preview checks passed (12 cases).");
