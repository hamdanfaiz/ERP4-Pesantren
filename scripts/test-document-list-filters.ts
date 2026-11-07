import assert from "node:assert/strict";
import {
  buildDocumentListLogicFilter,
  buildDocumentSearchFilter,
  documentListFilterFingerprint,
  parseDocumentListFilters,
} from "../src/server/supabaseDocumentFilters";

const normalized = parseDocumentListFilters({
  search: "  Surat   Masuk  ", direction: "incoming", statusGroup: "approval",
});
assert.deepEqual(normalized, { search: "Surat Masuk", direction: "incoming", statusGroup: "approval" });
assert.equal(parseDocumentListFilters({ direction: "all" }).direction, null);
assert.throws(() => parseDocumentListFilters({ direction: "incoming,tenant_id.eq.other" }), /Filter jenis/);
assert.throws(() => parseDocumentListFilters({ statusGroup: "all),or\(tenant_id.eq.other" }), /Filter status/);
assert.throws(() => parseDocumentListFilters({ search: "x".repeat(121) }), /maksimal 120/);
assert.throws(() => parseDocumentListFilters({ search: "aman\nbaru" }), /pencarian tidak valid/);
assert.throws(() => parseDocumentListFilters({ search: ["wali", "admin"] }), /Parameter search/);

const injectionLikeInput = `wali",or(tenant_id.eq.other),\\%_`;
const searchFilter = buildDocumentSearchFilter(injectionLikeInput);
assert.ok(searchFilter);
assert.equal((searchFilter?.match(/\.ilike\./g) || []).length, 5);
assert.ok(searchFilter?.startsWith('document_number.ilike."%wali'));
assert.ok(searchFilter?.includes('wali\\",or('));
assert.ok(buildDocumentListLogicFilter(injectionLikeInput, "created_at.lt.2026-11-01T00:00:00Z")?.startsWith("and(or("));
assert.equal(buildDocumentListLogicFilter("", "created_at.lt.2026-11-01T00:00:00Z"), "created_at.lt.2026-11-01T00:00:00Z");

const firstFingerprint = documentListFilterFingerprint(normalized, "tenant-a");
assert.equal(firstFingerprint, documentListFilterFingerprint(parseDocumentListFilters({
  search: "Surat Masuk", direction: "incoming", statusGroup: "approval",
}), "tenant-a"));
assert.notEqual(firstFingerprint, documentListFilterFingerprint(parseDocumentListFilters({
  search: "Surat Masuk", direction: "incoming", statusGroup: "approval",
}), "tenant-b"));
assert.notEqual(firstFingerprint, documentListFilterFingerprint(parseDocumentListFilters({
  search: "Surat Masuk", direction: "outgoing", statusGroup: "approval",
}), "tenant-a"));

console.log("Filter daftar Dokumen Digital aman dan cursor terikat pada filter.");
