import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { LegacyFirestoreTenantScopeError, legacyTenantPathRecordMatches, readLegacyFirestoreTenantRows, scopeLegacyTenantRecords } from "../src/server/legacyFirestoreTenantScope";

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

const aliasSourceRecords = [
  { id: "snake-owned", record: { tenant_id: " pesantren-digital ", name: "masked" } },
  { id: "snake-foreign", record: { tenant_id: "another-tenant", name: "masked" } },
  { id: "matching-aliases", record: { tenantId: "pesantren-digital", tenant_id: "pesantren-digital" } },
  { id: "conflicting-aliases", record: { tenantId: "pesantren-digital", tenant_id: "another-tenant" } },
  { id: "malformed-alias", record: { tenant_id: 42 } },
  { id: "blank-alias", record: { tenantId: "   " } },
];
const aliasOwnership = scopeLegacyTenantRecords(aliasSourceRecords, ["pesantren-digital"], "pesantren-digital");
assert.deepEqual(aliasOwnership.records.map((row) => row.id), ["snake-owned", "matching-aliases"]);
assert.equal(aliasOwnership.records[0].record.tenantId, "pesantren-digital", "snake_case ownership is normalized to the canonical field");
assert.equal(aliasSourceRecords[0].record.tenant_id, " pesantren-digital ", "normalization must not mutate Firestore snapshots");
for (const row of aliasOwnership.records) {
  assert.equal(Object.prototype.hasOwnProperty.call(row.record, "tenant_id"), false, "normalized records expose one canonical tenant field");
}
assert.deepEqual(aliasOwnership.audit, {
  sourceRecordCount: 6,
  includedRecordCount: 2,
  matchedTenantIdCount: 2,
  assignedBySingleTenantMappingCount: 0,
  unresolvedTenantlessCount: 0,
  excludedOtherTenantCount: 1,
  invalidTenantIdCount: 3,
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

assert.equal(legacyTenantPathRecordMatches({}, "pesantren-digital", "target-tenant-uuid"), true, "nested path establishes ownership when no duplicate owner field exists");
assert.equal(legacyTenantPathRecordMatches({ tenantId: "pesantren-digital" }, "pesantren-digital", "target-tenant-uuid"), true);
assert.equal(legacyTenantPathRecordMatches({ tenant_id: "target-tenant-uuid" }, "pesantren-digital", "target-tenant-uuid"), true);
assert.equal(legacyTenantPathRecordMatches({ tenant_id: "another-tenant" }, "pesantren-digital", "target-tenant-uuid"), false, "explicit owner must match the source path or mapped target");
assert.equal(legacyTenantPathRecordMatches({ tenantId: "pesantren-digital", tenant_id: "another-tenant" }, "pesantren-digital", "target-tenant-uuid"), false, "contradictory aliases must block nested settings operations");
assert.equal(legacyTenantPathRecordMatches({ tenantId: 42 }, "pesantren-digital", "target-tenant-uuid"), false, "malformed owner field must block nested settings operations");
assert.equal(legacyTenantPathRecordMatches({ tenant_id: "   " }, "pesantren-digital", "target-tenant-uuid"), false, "blank owner field must not be treated as absent");

type FakeRow = { id: string; data: Record<string, unknown> };

function fakeFirestore(collections: Record<string, FakeRow[]>): Firestore {
  return {
    collection(name: string) {
      const filters: Array<{ field: string; value: unknown }> = [];
      let rowLimit = Number.POSITIVE_INFINITY;
      const query = {
        where(field: string, _operator: string, value: unknown) {
          filters.push({ field, value });
          return query;
        },
        limit(limit: number) {
          rowLimit = limit;
          return query;
        },
        async get() {
          const rows = (collections[name] || []).filter((row) =>
            filters.every(({ field, value }) => row.data[field] === value),
          ).slice(0, rowLimit);
          const docs = rows.map((row) => ({
            id: row.id,
            data: () => row.data,
          }));
          return { size: docs.length, docs };
        },
      };
      return query;
    },
  } as unknown as Firestore;
}

async function verifyFirestoreReader() {
  const scopedRows = await readLegacyFirestoreTenantRows(fakeFirestore({
    tenants: [{ id: "pesantren-digital", data: {} }],
    master_data: [
      { id: "owned", data: { tenantId: "pesantren-digital", category: "Alumni" } },
      { id: "snake-owned", data: { tenant_id: "pesantren-digital", category: "Alumni" } },
      { id: "legacy", data: { category: "Alumni" } },
      { id: "foreign", data: { tenantId: "another-tenant", category: "Alumni" } },
      { id: "unrelated", data: { tenantId: "pesantren-digital", category: "Pegawai" } },
    ],
  }), {
    collectionName: "master_data",
    tenantKey: "pesantren-digital",
    limit: 10,
    filters: [{ field: "category", value: "Alumni" }],
  });
  assert.deepEqual(scopedRows.map(({ id }) => id), ["owned", "snake-owned", "legacy"]);
  assert.equal(scopedRows[1].data.tenantId, "pesantren-digital");
  assert.equal(scopedRows[2].data.tenantId, "pesantren-digital");

  await assert.rejects(
    readLegacyFirestoreTenantRows(fakeFirestore({
      tenants: [
        { id: "pesantren-digital", data: {} },
        { id: "another-tenant", data: {} },
      ],
      master_data: [{ id: "legacy", data: { category: "Alumni" } }],
    }), { collectionName: "master_data", tenantKey: "pesantren-digital", limit: 10 }),
    (error: unknown) => error instanceof LegacyFirestoreTenantScopeError && error.status === 409,
  );

  await assert.rejects(
    readLegacyFirestoreTenantRows(fakeFirestore({
      tenants: [{ id: "pesantren-digital", data: {} }],
      master_data: [{ id: "conflict", data: { tenantId: "pesantren-digital", tenant_id: "another-tenant" } }],
    }), { collectionName: "master_data", tenantKey: "pesantren-digital", limit: 10 }),
    (error: unknown) => error instanceof LegacyFirestoreTenantScopeError && error.status === 409,
  );

  await assert.rejects(
    readLegacyFirestoreTenantRows(fakeFirestore({
      tenants: [{ id: "pesantren-digital", data: {} }],
      master_data: [
        { id: "one", data: { tenantId: "pesantren-digital" } },
        { id: "two", data: { tenantId: "pesantren-digital" } },
      ],
    }), { collectionName: "master_data", tenantKey: "pesantren-digital", limit: 1 }),
    (error: unknown) => error instanceof LegacyFirestoreTenantScopeError && error.status === 413,
  );
}

void verifyFirestoreReader().then(() => {
  console.log("legacy Firestore tenant scoping tests passed");
});
