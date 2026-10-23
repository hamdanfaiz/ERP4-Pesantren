import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { previewSupabaseLegacyLibraryCirculations } from "../src/server/supabaseLibraryCirculationImport";

process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "library-circulation-test-key-32-bytes-minimum";
const key = process.env.SUPABASE_LEGACY_FINGERPRINT_KEY;
const uuidBook = "e3000000-0000-4000-8000-000000000301";
const uuidStudent = "e3000000-0000-4000-8000-000000000201";
const studentRef = createHmac("sha256", key).update(JSON.stringify("library-circulation\u0000legacy-loan-1")).digest("hex").slice(0, 16);
const bookSourceRecordId = createHmac("sha256", key).update(JSON.stringify("library-book\u0000legacy-book-1")).digest("hex");

const context = {
  books: [{ id: uuidBook, title: "Kitab Satu", source_system: "legacy_import", source_record_id: bookSourceRecordId, status: "active" }],
  students: [{ id: uuidStudent, name: "Santri Satu", nis: "9300000001", status: "active" }],
  existingCirculations: [],
};
const source = {
  id: "legacy-loan-1",
  data: {
    student: "Santri Satu", bookId: "legacy-book-1", bookTitle: "Kitab Satu",
    borrowDate: "2026-01-01", dueDate: "2026-01-15", status: "Dipinjam", fine: 0,
  },
};

function preview(data: Record<string, unknown> = source.data, mappings: Record<string, string> = { [studentRef]: uuidStudent }, existing = []) {
  return previewSupabaseLegacyLibraryCirculations(
    [{ id: source.id, data }],
    { ...context, existingCirculations: existing },
    mappings,
  );
}

const valid = preview();
assert.equal(valid.canApply, true, "explicit in-tenant student mapping plus exact source book ID is importable");
assert.equal(valid.counts.active, 1);
assert.equal(valid.items[0].bookId, uuidBook);
assert.equal(valid.items[0].studentId, uuidStudent);
assert.equal(valid.items[0].sourceRecordId.length, 64);
assert.equal(valid.items[0].sourceRecordId.includes(source.id), false, "Firestore IDs never reach Supabase in plaintext");
assert.equal(valid.records[0].recordRef, studentRef);

const missingMapping = preview(source.data, {});
assert.equal(missingMapping.canApply, false);
assert.ok(missingMapping.issues.some((item) => item.code === "student_mapping_required"));

const missingBook = preview({ ...source.data, bookId: "book-not-imported" });
assert.equal(missingBook.canApply, false, "book titles are not used as a fallback relationship");
assert.ok(missingBook.issues.some((item) => item.code === "book_not_imported_by_source_id"));

const wrongTenant = preview(source.data, { [studentRef]: "e3000000-0000-4000-8000-000000000202" });
assert.ok(wrongTenant.issues.some((item) => item.code === "student_not_found_in_tenant"));

const invalidDate = preview({ ...source.data, borrowDate: "31/01/2026" });
assert.ok(invalidDate.issues.some((item) => item.code === "invalid_borrow_date"));

const tooLongLoan = preview({ ...source.data, dueDate: "2026-05-01" });
assert.ok(tooLongLoan.issues.some((item) => item.code === "due_date_out_of_range"));

const unsupportedStatus = preview({ ...source.data, status: "lost" });
assert.ok(unsupportedStatus.issues.some((item) => item.code === "unsupported_status"));

const returnedWithoutDate = preview({ ...source.data, status: "Dikembalikan" });
assert.ok(returnedWithoutDate.issues.some((item) => item.code === "returned_date_missing_or_invalid"));

const fineRequiresLedger = preview({ ...source.data, fine: 5000 });
assert.ok(fineRequiresLedger.issues.some((item) => item.code === "fine_requires_finance_reconciliation"));

const sourceTenantOnly = preview({ ...source.data, tenantId: "source-tenant" });
assert.equal(sourceTenantOnly.snapshotFingerprint, valid.snapshotFingerprint, "tenantless ownership metadata is excluded from source data fingerprint");

const staleMapping = preview(source.data, { [studentRef]: "e3000000-0000-4000-8000-000000000202" });
assert.notEqual(staleMapping.snapshotFingerprint, valid.snapshotFingerprint, "student mapping participates in apply confirmation");

const existing = [{
  source_system: "legacy_import",
  source_record_id: valid.items[0].sourceRecordId,
  source_fingerprint: valid.items[0].sourceFingerprint,
  book_id: uuidBook,
  student_id: uuidStudent,
  borrowed_on: "2026-01-01",
  due_on: "2026-01-15",
  returned_on: null,
  status: "active",
}];
const retry = preview(source.data, {}, existing);
assert.equal(retry.canApply, true, "unchanged imported row reuses its stored explicit student mapping");
assert.equal(retry.counts.alreadyImported, 1);
assert.equal(retry.counts.ready, 1);

const changedExisting = preview({ ...source.data, dueDate: "2026-01-16" }, {}, existing);
assert.ok(changedExisting.issues.some((item) => item.code === "imported_record_changed_or_mapping_conflict"));

const duplicate = previewSupabaseLegacyLibraryCirculations(
  [{ id: source.id, data: source.data }, { id: source.id, data: source.data }], context, { [studentRef]: uuidStudent },
);
assert.ok(duplicate.issues.some((item) => item.code === "duplicate_source_record"));

const missingFine = preview({ student: "Santri Satu", bookId: "legacy-book-1", bookTitle: "Kitab Satu", borrowDate: "2026-01-01", dueDate: "2026-01-15", status: "Dipinjam" });
assert.ok(missingFine.issues.some((item) => item.code === "fine_requires_finance_reconciliation"));

console.log("Library circulation import preview tests passed (14 cases).");

