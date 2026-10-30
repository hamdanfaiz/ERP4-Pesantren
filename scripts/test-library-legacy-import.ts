import assert from "node:assert/strict";
import { previewSupabaseLegacyLibraryBooks } from "../src/server/supabaseLibraryImport";

process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "library-import-test-key-0123456789abcdef";

function source(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      title: "Ushul Fiqh",
      author: "Tim Penyusun",
      category: "Fikih",
      isbn: "978-0-306-40615-7",
      totalCopies: 3,
      shelf: "A-01",
      ...overrides,
    },
  };
}

const ready = previewSupabaseLegacyLibraryBooks([source("book-1")], []);
assert.equal(ready.canApply, true);
assert.equal(ready.items[0].isbn, "9780306406157", "ISBN formatting is canonicalized before persistence");
assert.equal(ready.items[0].sourceRecordId.length, 64);
assert.equal(ready.items[0].sourceRecordId.includes("book-1"), false, "raw Firestore IDs are not persisted");

const badCheckDigit = previewSupabaseLegacyLibraryBooks([source("book-2", { isbn: "9780306406158" })], []);
assert.equal(badCheckDigit.canApply, true, "legacy data remains migratable with a non-blocking quality warning");
assert.equal(badCheckDigit.warnings[0].code, "isbn_check_digit_needs_review");
assert.equal(badCheckDigit.items[0].isbn, "9780306406158", "source value is not silently discarded");

const invalidFormat = previewSupabaseLegacyLibraryBooks([source("book-3", { isbn: "ISBN-TIDAK-VALID" })], []);
assert.equal(invalidFormat.canApply, false);
assert.equal(invalidFormat.issues[0].code, "invalid_isbn");

const duplicateIsbn = previewSupabaseLegacyLibraryBooks([source("book-4"), source("book-5")], []);
assert.equal(duplicateIsbn.canApply, false);
assert.ok(duplicateIsbn.issues.some((item) => item.code === "duplicate_source_isbn"));

const targetConflict = previewSupabaseLegacyLibraryBooks([source("book-6")], [{ isbn: "9780306406157", source_record_id: "another-record" }]);
assert.equal(targetConflict.canApply, false);
assert.ok(targetConflict.issues.some((item) => item.code === "target_isbn_conflict"));

const targetTitleAuthorConflict = previewSupabaseLegacyLibraryBooks([source("book-6b")], [{ title: "Ushul Fiqh", author: "Tim Penyusun", source_system: "manual" }]);
assert.equal(targetTitleAuthorConflict.canApply, false);
assert.ok(targetTitleAuthorConflict.issues.some((item) => item.code === "target_title_author_review"));

const duplicateTitleAuthor = previewSupabaseLegacyLibraryBooks([
  source("book-7", { isbn: "9780306406157" }),
  source("book-8", { isbn: "9781861972712" }),
], []);
assert.equal(duplicateTitleAuthor.canApply, false);
assert.ok(duplicateTitleAuthor.issues.some((item) => item.code === "duplicate_source_title_author_review"));

const invalidCopies = previewSupabaseLegacyLibraryBooks([source("book-9", { totalCopies: -1 })], []);
assert.equal(invalidCopies.canApply, false);
assert.equal(invalidCopies.issues[0].code, "invalid_total_copies");

const first = previewSupabaseLegacyLibraryBooks([source("book-10")], []);
const sameSource = previewSupabaseLegacyLibraryBooks([source("book-10")], [{
  source_record_id: first.items[0].sourceRecordId,
  source_fingerprint: first.items[0].sourceFingerprint,
}]);
assert.equal(sameSource.canApply, true);
assert.equal(sameSource.counts.alreadyImported, 1, "identical imports are recognized as replay-safe");

const changedSource = previewSupabaseLegacyLibraryBooks([source("book-10", { totalCopies: 4 })], [{
  source_record_id: first.items[0].sourceRecordId,
  source_fingerprint: first.items[0].sourceFingerprint,
}]);
assert.equal(changedSource.canApply, false);
assert.ok(changedSource.issues.some((item) => item.code === "source_changed_after_import"));

console.log("library legacy import preview: 10 cases passed");
