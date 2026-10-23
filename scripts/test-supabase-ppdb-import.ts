import assert from "node:assert/strict";
import { LEGACY_PPDB_DATE_FORMAT, previewSupabaseLegacyPpdb } from "../src/server/supabasePpdbLegacyImport";

process.env.PII_ENCRYPTION_KEY = "11".repeat(32);
process.env.PII_FINGERPRINT_KEY = "22".repeat(32);

function sourceRow(id: string, overrides: Record<string, unknown> = {}) {
  const numericId = id.replace(/\D/g, "").padStart(16, "0").slice(-16);
  const numericNisn = id.replace(/\D/g, "").padStart(10, "0").slice(-10);
  return {
    id,
    data: {
      name: "Santri Uji",
      registrationId: "PPDB-" + id,
      gender: "L",
      stage: "Registered",
      dob: "2012-05-20",
      dateApplied: "2026-10-23T14:35:20.000Z",
      nik: numericId,
      nisn: numericNisn,
      phone: "081234567890",
      whatsappPhone: "081234567890",
      email: "uji@example.test",
      ...overrides,
    },
  };
}

function ownership(overrides: Partial<{
  targetLegacyTenantKey: string;
  sourceTenantKeys: string[];
  sourceTenantConfirmation: string;
  dateFormatConfirmation: string;
}> = {}) {
  return {
    targetLegacyTenantKey: "pesantren-digital",
    sourceTenantKeys: ["pesantren-digital"],
    sourceTenantConfirmation: "pesantren-digital",
    dateFormatConfirmation: LEGACY_PPDB_DATE_FORMAT,
    ...overrides,
  };
}

const ready = previewSupabaseLegacyPpdb([sourceRow("candidate-1")], [], ownership());
assert.equal(ready.canApply, true, "valid tenant-scoped preview can be applied");
assert.equal(ready.validCount, 1);
assert.equal(ready.items[0].candidate.dob, "2012-05-20");
assert.equal(ready.items[0].candidate.dateApplied, "2026-10-23");
assert.equal("nik" in ready.items[0].candidate, false, "plaintext NIK is not sent to Supabase");
assert.equal("nisn" in ready.items[0].candidate, false, "plaintext NISN is not sent to Supabase");

const nonUtcDate = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-2", { dateApplied: "2026-10-23T14:35:20.000+07:00" })],
  [],
  ownership(),
);
assert.equal(nonUtcDate.canApply, false, "source timestamps must use the verified UTC representation");
assert.equal(nonUtcDate.issueCounts.invalid_date_applied, 1);

const missingDateConfirmation = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-3")],
  [],
  ownership({ dateFormatConfirmation: "" }),
);
assert.equal(missingDateConfirmation.canApply, false, "date format must be explicitly confirmed");

const wrongTenant = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-4")],
  [],
  ownership({ sourceTenantConfirmation: "other-tenant" }),
);
assert.equal(wrongTenant.canApply, false, "source tenant must be explicitly confirmed");

const mismatchedRecordTenant = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-5", { tenantId: "other-tenant" })],
  [],
  ownership(),
);
assert.equal(mismatchedRecordTenant.canApply, false, "record-level tenant mismatch blocks import");

const duplicatedRegistration = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-6", { registrationId: "SAME" }), sourceRow("candidate-7", { registrationId: "same" })],
  [],
  ownership(),
);
assert.equal(duplicatedRegistration.canApply, false, "duplicate registration IDs block import");
assert.equal(duplicatedRegistration.sourceDuplicates.registrationId.groups, 1);

const duplicatedNik = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-8", { nik: "1111111111111111" }), sourceRow("candidate-9", { nik: "1111111111111111" })],
  [],
  ownership(),
);
assert.equal(duplicatedNik.canApply, false, "duplicate NIK fingerprints block import");
assert.equal(duplicatedNik.sourceDuplicates.nik.groups, 1);

const malformedDate = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-10", { dateApplied: "2026-02-30T14:35:20.000Z" })],
  [],
  ownership(),
);
assert.equal(malformedDate.canApply, false, "invalid source dates block import");
assert.equal(malformedDate.issueCounts.invalid_date_applied, 1);

const targetConflict = previewSupabaseLegacyPpdb(
  [sourceRow("candidate-11")],
  [{ registration_id: "ppdb-candidate-11", nik_fingerprint: null, nisn_fingerprint: null }],
  ownership(),
);
assert.equal(targetConflict.canApply, false, "registration conflicts in Supabase block import");
assert.equal(targetConflict.targetConflicts.registrationId, 1);

console.log("PPDB legacy importer preview checks passed (9 cases).");
