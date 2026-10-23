import assert from "node:assert/strict";
import { previewSupabaseLegacyCooperativeCatalog, previewSupabaseLegacyCooperativeFinancialHistory } from "../src/server/supabaseCooperativeImport";

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



const financialSources = {
  wallets: [{ id: "wallet-source-01", data: { id: "wallet-key-01", student: "Label Santri", balance: 3000, status: "Active" } }],
  transactions: [{ id: "sale-source-01", data: {
    id: "sale-source-01",
    walletId: "wallet-key-01",
    date: "2026-10-22T10:00:00Z",
    items: [{ name: "Buku Tulis", price: 1000, qty: 2 }],
    total: 2000,
    status: "Success",
  } }],
};
const targetWallets = [{ id: "target-wallet-01", student_id: "target-student-01", balance: 0, status: "active" }];
const targetStudents = [{ id: "target-student-01", name: "Santri Tujuan", nis: "S-001", grade: "VII", status: "active" }];
const targetProducts = [{ id: "target-product-01", sku: "SKU-001", name: "Buku Tulis", status: "active" }];
const unmappedFinancialPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, [],
);
assert.equal(unmappedFinancialPreview.canApply, false, "financial imports require explicit wallet and product mappings");
assert.equal(unmappedFinancialPreview.counts.sourceWallets, 1);
assert.equal(unmappedFinancialPreview.counts.sourceTransactions, 1);
assert.equal(unmappedFinancialPreview.counts.sourceItems, 1);
assert.ok(unmappedFinancialPreview.issues.some((item) => item.code === "wallet_student_mapping_required"));
assert.ok(unmappedFinancialPreview.issues.some((item) => item.code === "transaction_item_product_mapping_required"));
assert.equal(JSON.stringify(unmappedFinancialPreview).includes("wallet-source-01"), false, "raw source wallet IDs are not returned to the browser");
assert.equal(JSON.stringify(unmappedFinancialPreview).includes("sale-source-01"), false, "raw source transaction IDs are not returned to the browser");

const walletRef = unmappedFinancialPreview.wallets[0].sourceRef;
const itemRef = unmappedFinancialPreview.transactions[0].items[0].itemRef;
const completeMappings = {
  wallets: { [walletRef]: { targetWalletId: "target-wallet-01", openingBalance: 5000 } },
  products: { [itemRef]: "target-product-01" },
  confirmCompleteHistory: true,
};
const reconciledFinancialPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, [], completeMappings,
);
assert.equal(reconciledFinancialPreview.canApply, true, "explicit mappings and an exact opening-balance reconciliation allow the plan");
assert.equal(reconciledFinancialPreview.wallets[0].expectedClosingBalance, 3000);
assert.equal(reconciledFinancialPreview.transactions[0].createdAt, "2026-10-22T10:00:00.000Z");
assert.equal(reconciledFinancialPreview.transactions[0].items[0].costSnapshotKnown, false, "unknown historical cost is never copied from today's catalog");
assert.equal(reconciledFinancialPreview.transactions[0].items[0].costPrice, null);

const mismatchFinancialPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, [],
  { ...completeMappings, wallets: { [walletRef]: { targetWalletId: "target-wallet-01", openingBalance: 5200 } } },
);
assert.equal(mismatchFinancialPreview.canApply, false);
assert.ok(mismatchFinancialPreview.issues.some((item) => item.code === "opening_balance_does_not_reconcile"));

const usedWalletPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, ["target-wallet-01"], completeMappings,
);
assert.equal(usedWalletPreview.canApply, false);
assert.ok(usedWalletPreview.issues.some((item) => item.code === "target_wallet_has_existing_history"));

const incompleteArchivePreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, [],
  { ...completeMappings, confirmCompleteHistory: false },
);
assert.equal(incompleteArchivePreview.canApply, false);
assert.ok(incompleteArchivePreview.warnings.some((item) => item.code === "operator_must_confirm_sales_archive_is_complete_and_opening_balance_is_reconciled"));

const invalidStatusPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId,
  { ...financialSources, transactions: [{ ...financialSources.transactions[0], data: { ...financialSources.transactions[0].data, status: "Pending" } }] },
  targetWallets, targetStudents, targetProducts, [], completeMappings,
);
assert.equal(invalidStatusPreview.canApply, false);
assert.ok(invalidStatusPreview.issues.some((item) => item.code === "unsupported_transaction_status"));

const invalidDatePreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId,
  { ...financialSources, transactions: [{ ...financialSources.transactions[0], data: { ...financialSources.transactions[0].data, date: "2026-10-22T10:00:00" } }] },
  targetWallets, targetStudents, targetProducts, [], completeMappings,
);
assert.equal(invalidDatePreview.canApply, false);
assert.ok(invalidDatePreview.issues.some((item) => item.code === "invalid_transaction_date"));

const noAttestationPreview = previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId, financialSources, targetWallets, targetStudents, targetProducts, [],
  { ...completeMappings, confirmCompleteHistory: undefined },
);
assert.equal(noAttestationPreview.canApply, false, "opening balance alone is insufficient without explicit archive completeness confirmation");

console.log("cooperative legacy financial preview: 8 validation groups passed");


