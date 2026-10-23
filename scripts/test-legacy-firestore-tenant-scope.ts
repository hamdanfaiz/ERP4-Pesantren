import assert from "node:assert/strict";
import { scopeLegacyTenantRecords } from "../src/server/legacyFirestoreTenantScope";

const source = [
  { id: "owned", record: { tenantId: "pesantren-digital", name: "masked" } },
  { id: "legacy", record: { name: "masked" } },
  { id: "foreign", record: { tenantId: "another-tenant" } },
  { id: "invalid", record: { tenantId: 42 } },
];

const singleTenant = scopeLegacyTenantRecords(source, ["pesantren-digital"], "pesantren-digital");
assert.deepEqual(singleTenant.records.map((row) => row.id), ["owned", "legacy"]);
assert.equal(singleTenant.records[1].record.tenantId, "pesantren-digital");
assert.equal(Object.prototype.hasOwnProperty.call(source[1].record, "tenantId"), false, "source records must remain unmodified");
assert.deepEqual(singleTenant.audit, {
  sourceRecordCount: 4,
  includedRecordCount: 2,
  matchedTenantIdCount: 1,
  assignedBySingleTenantMappingCount: 1,
  unresolvedTenantlessCount: 0,
  excludedOtherTenantCount: 1,
  invalidTenantIdCount: 1,
  singleSourceTenantVerified: true,
});

const ambiguous = scopeLegacyTenantRecords(source, ["pesantren-digital", "another-tenant"], "pesantren-digital");
assert.deepEqual(ambiguous.records.map((row) => row.id), ["owned"]);
assert.equal(ambiguous.audit.unresolvedTenantlessCount, 1);
assert.equal(ambiguous.audit.singleSourceTenantVerified, false);

const mismatchedRegistry = scopeLegacyTenantRecords(
  [{ id: "legacy", record: { name: "masked" } }],
  ["another-tenant"],
  "pesantren-digital",
);
assert.equal(mismatchedRegistry.records.length, 0);
assert.equal(mismatchedRegistry.audit.unresolvedTenantlessCount, 1);

assert.throws(
  () => scopeLegacyTenantRecords([], ["pesantren-digital"], " "),
  /Legacy tenant key is required/,
);

console.log("legacy Firestore tenant scoping tests passed");
