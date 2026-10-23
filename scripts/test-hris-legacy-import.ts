import assert from "node:assert/strict";
import { previewSupabaseLegacyHrisEmployees } from "../src/server/supabaseHrisImport";

process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "hris-import-test-key-0123456789abcdef";

function source(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "firestore-document-" + id,
    data: {
      id,
      name: "Pegawai Uji",
      role: "Pengelola Perpustakaan",
      department: "Perpustakaan",
      email: "pegawai@example.test",
      phone: "+6281234567890",
      status: "active",
      address: "Alamat Sintetis 1",
      gender: "P",
      shift: "Pagi",
      category: "Operasional",
      type: "Pegawai",
      createdAt: "2026-10-23T00:00:00.000Z",
      ...overrides,
    },
  };
}

const ready = previewSupabaseLegacyHrisEmployees([source("EMP-001")], []);
assert.equal(ready.canApply, true);
assert.equal(ready.items[0].employeeNumber, "EMP-001");
assert.equal(ready.items[0].employmentStatus, "active");
assert.equal(ready.items[0].email, "pegawai@example.test");
assert.equal(ready.items[0].legacyDetails.address, "Alamat Sintetis 1", "legacy attributes are preserved in restricted details");
assert.equal("userId" in ready.items[0], false, "employee import never creates or assigns an Auth account");
assert.equal(ready.items[0].sourceRecordId.length, 64);
assert.equal(ready.items[0].sourceRecordId.includes("firestore-document"), false);

const alumni = previewSupabaseLegacyHrisEmployees([source("EMP-002", { status: "Alumni" })], []);
assert.equal(alumni.canApply, true);
assert.equal(alumni.items[0].employmentStatus, "terminated");
assert.equal(alumni.warnings[0].code, "alumni_mapped_to_terminated");
assert.equal(alumni.items[0].legacyDetails.sourceStatus, "Alumni");

const unsupportedStatus = previewSupabaseLegacyHrisEmployees([source("EMP-003", { status: "Pensiun khusus" })], []);
assert.equal(unsupportedStatus.canApply, false);
assert.ok(unsupportedStatus.issues.some((item) => item.code === "unmapped_employment_status"));

const duplicateEmployeeNumber = previewSupabaseLegacyHrisEmployees([
  source("source-doc-a", { id: "EMP-004" }),
  source("source-doc-b", { id: "EMP-004" }),
], []);
assert.equal(duplicateEmployeeNumber.canApply, false);
assert.ok(duplicateEmployeeNumber.issues.some((item) => item.code === "duplicate_source_employee_number"));

const duplicateEmail = previewSupabaseLegacyHrisEmployees([
  source("EMP-005", { email: "STAFF@example.test" }),
  source("EMP-006", { email: "staff@example.test" }),
], []);
assert.equal(duplicateEmail.canApply, false);
assert.ok(duplicateEmail.issues.some((item) => item.code === "duplicate_source_email"));

const targetNumberConflict = previewSupabaseLegacyHrisEmployees([source("EMP-007")], [{ employee_number: "EMP-007" }]);
assert.equal(targetNumberConflict.canApply, false);
assert.ok(targetNumberConflict.issues.some((item) => item.code === "target_employee_number_conflict"));

const targetEmailConflict = previewSupabaseLegacyHrisEmployees([source("EMP-008")], [{ email: "pegawai@example.test" }]);
assert.equal(targetEmailConflict.canApply, false);
assert.ok(targetEmailConflict.issues.some((item) => item.code === "target_email_conflict"));

const invalidContact = previewSupabaseLegacyHrisEmployees([source("EMP-009", { email: "bukan-email", phone: "12" })], []);
assert.equal(invalidContact.canApply, false);
assert.ok(invalidContact.issues.some((item) => item.code === "invalid_email"));
assert.ok(invalidContact.issues.some((item) => item.code === "invalid_phone"));

const original = previewSupabaseLegacyHrisEmployees([source("EMP-010")], []);
const replay = previewSupabaseLegacyHrisEmployees([source("EMP-010")], [{
  source_record_id: original.items[0].sourceRecordId,
  source_fingerprint: original.items[0].sourceFingerprint,
}]);
assert.equal(replay.canApply, true);
assert.equal(replay.counts.alreadyImported, 1);

const changed = previewSupabaseLegacyHrisEmployees([source("EMP-010", { department: "Unit Berubah" })], [{
  source_record_id: original.items[0].sourceRecordId,
  source_fingerprint: original.items[0].sourceFingerprint,
}]);
assert.equal(changed.canApply, false);
assert.ok(changed.issues.some((item) => item.code === "source_changed_after_import"));

const excessive = previewSupabaseLegacyHrisEmployees(Array.from({ length: 1001 }, (_, index) => source(`EMP-${index}`)), []);
assert.equal(excessive.canApply, false);
assert.equal(excessive.issues[0].code, "record_limit_exceeded");

console.log("HRIS legacy employee import preview: 11 cases passed");
