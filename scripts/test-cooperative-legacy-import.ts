import assert from "node:assert/strict";
import { previewSupabaseLegacyCooperativeCatalog } from "../src/server/supabaseCooperativeImport";

process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "cooperative-import-test-key-0123456789abcdef";

function product(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      id: "ATK-001",
      name: "Buku Tulis",
      category: "Alat Tulis",
      costPrice: 2000,
      price: 3000,
      stock: 12,
      reorderPoint: 15,
      expiryDate: null,
      ...overrides,
    },
  };
}

function supplier(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      name: "Pemasok ATK",
      category: "Alat Tulis",
      contact: "081234567890",
      pic: "Pak Ahmad",
      status: "Inactive",
      ...overrides,
    },
  };
}

const source = {
  products: [product("firestore-product-01")],
  suppliers: [supplier("firestore-supplier-01")],
  wallets: [{ id: "wallet-01", data: { student: "Nama Santri", balance: 25000 } }],
  transactions: [{ id: "sale-01", data: { total: 4500, items: [] } }],
};
const tenantId = "d9000000-0000-4000-8000-000000000009";
const first = previewSupabaseLegacyCooperativeCatalog(tenantId, source, [], []);
assert.equal(first.canApply, true, "catalog can proceed while dependent ledgers are explicitly deferred");
assert.equal(first.phase, "catalog_only");
assert.equal(first.counts.ready, 2);
assert.equal(first.counts.deferredWallets, 1);
assert.equal(first.counts.deferredTransactions, 1);
assert.deepEqual(first.items.map((item) => item.kind), ["product", "supplier"]);
assert.equal(first.items.find((item) => item.kind === "supplier")?.status, "inactive", "inactive status survives preview mapping");
assert.equal(JSON.stringify(first).includes("firestore-product-01"), false, "raw Firestore IDs are not exposed in migration refs");
assert.equal(JSON.stringify(first).includes("Nama Santri"), false, "deferred wallet student data is not exposed or imported");

const mappedProduct = first.items.find((item) => item.kind === "product")!;
const mappedSupplier = first.items.find((item) => item.kind === "supplier")!;
const replay = previewSupabaseLegacyCooperativeCatalog(tenantId, source, [{
  sku: mappedProduct.sku,
  name: mappedProduct.name,
  category: mappedProduct.category,
  cost_price: mappedProduct.costPrice,
  unit_price: mappedProduct.unitPrice,
  stock_quantity: 5,
  reorder_point: mappedProduct.reorderPoint,
  expiry_date: mappedProduct.expiryDate,
  status: "active",
  client_request_id: mappedProduct.clientRequestId,
}], [{
  name: mappedSupplier.name,
  category: mappedSupplier.category,
  contact: mappedSupplier.contact,
  pic: mappedSupplier.pic,
  status: mappedSupplier.status,
  client_request_id: mappedSupplier.clientRequestId,
}]);
assert.equal(replay.canApply, true);
assert.equal(replay.counts.alreadyImported, 2, "unchanged source records are safe to replay");
assert.equal(replay.counts.ready, 0);
assert.equal(replay.items.length, 0);

const changed = previewSupabaseLegacyCooperativeCatalog(tenantId, {
  ...source,
  products: [product("firestore-product-01", { price: 3500 })],
}, [{
  sku: mappedProduct.sku,
  name: mappedProduct.name,
  category: mappedProduct.category,
  cost_price: mappedProduct.costPrice,
  unit_price: mappedProduct.unitPrice,
  stock_quantity: mappedProduct.stockQuantity,
  reorder_point: mappedProduct.reorderPoint,
  expiry_date: mappedProduct.expiryDate,
  status: "active",
  client_request_id: mappedProduct.clientRequestId,
}], []);
assert.equal(changed.canApply, false, "source edits do not silently overwrite a previously imported catalog record");
assert.ok(changed.issues.some((item) => item.code === "target_sku_conflict"));

const duplicateSku = previewSupabaseLegacyCooperativeCatalog(tenantId, {
  ...source,
  products: [product("product-a"), product("product-b")],
  suppliers: [],
  wallets: [],
  transactions: [],
}, [], []);
assert.equal(duplicateSku.canApply, false);
assert.ok(duplicateSku.issues.some((item) => item.code === "duplicate_source_sku"));

const invalidDate = previewSupabaseLegacyCooperativeCatalog(tenantId, {
  ...source,
  products: [product("product-bad-date", { expiryDate: "2026-02-30" })],
  suppliers: [],
  wallets: [],
  transactions: [],
}, [], []);
assert.equal(invalidDate.canApply, false);
assert.ok(invalidDate.issues.some((item) => item.code === "invalid_or_duplicate_inventory_record"));

const withoutResolvedTenant = previewSupabaseLegacyCooperativeCatalog(tenantId, source, [], []);
const withResolvedTenant = previewSupabaseLegacyCooperativeCatalog(tenantId, {
  ...source,
  products: source.products.map((row) => ({ ...row, data: { ...row.data, tenantId: "pesantren-digital" } })),
}, [], []);
assert.equal(withResolvedTenant.snapshotFingerprint, withoutResolvedTenant.snapshotFingerprint, "in-memory tenant ownership assignment does not stale the legacy snapshot fingerprint");

const previousKey = process.env.SUPABASE_LEGACY_FINGERPRINT_KEY;
process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = "short";
assert.throws(() => previewSupabaseLegacyCooperativeCatalog(tenantId, source, [], []), /Kunci fingerprint migrasi server belum dikonfigurasi/);
process.env.SUPABASE_LEGACY_FINGERPRINT_KEY = previousKey;

console.log("cooperative legacy catalog import: 8 cases passed");

