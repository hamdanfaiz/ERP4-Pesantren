import { createHmac } from "node:crypto";
import { isCalendarDate } from "../utils/businessDate";
import {
  manageSupabaseCooperativeProduct,
  manageSupabaseCooperativeSupplier,
  SupabaseCooperativeError,
} from "./supabaseCooperative";

type Row = Record<string, any>;
type LegacyRow = { id: string; data: Row };
export type LegacyCooperativeCatalogSources = {
  products: LegacyRow[];
  suppliers: LegacyRow[];
  wallets?: LegacyRow[];
  transactions?: LegacyRow[];
};

const MAX_ROWS_PER_COLLECTION = 1000;

function hmac(value: unknown): string {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseCooperativeError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stable(value))).digest("hex");
}

function stable(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}

function stableSource(data: Row): Row {
  return Object.fromEntries(Object.entries(data || {})
    .filter(([key]) => key !== "tenantId" && key !== "tenant_id")
    .sort(([left], [right]) => left.localeCompare(right)));
}

function cleanRows(value: LegacyRow[] | undefined): LegacyRow[] {
  return [...(value || [])]
    .map((row) => ({
      id: typeof row?.id === "string" ? row.id.trim() : "",
      data: row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") : "";
}

function deterministicRequestId(tenantId: string, collection: string, sourceId: string, sourceFingerprint: string): string {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseCooperativeError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  const bytes = createHmac("sha256", key)
    .update([tenantId, collection, sourceId, sourceFingerprint].join("\u0000"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseExpiryDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !isCalendarDate(value)) return undefined;
  return value;
}

function productMatchesExisting(existing: Row, item: Row): boolean {
  return normalized(existing.sku) === normalized(item.sku)
    && existing.name === item.name
    && existing.category === item.category
    && Number(existing.cost_price) === item.costPrice
    && Number(existing.unit_price) === item.unitPrice
    && Number(existing.reorder_point) === item.reorderPoint
    && (existing.expiry_date || null) === item.expiryDate
    && existing.status === "active";
}

function supplierMatchesExisting(existing: Row, item: Row): boolean {
  return existing.name === item.name
    && existing.category === item.category
    && existing.contact === item.contact
    && existing.pic === item.pic
    && existing.status === item.status;
}

export function previewSupabaseLegacyCooperativeCatalog(
  tenantId: string,
  sources: LegacyCooperativeCatalogSources,
  existingProducts: Row[],
  existingSuppliers: Row[],
) {
  const normalizedSources = {
    products: cleanRows(sources.products),
    suppliers: cleanRows(sources.suppliers),
    wallets: cleanRows(sources.wallets),
    transactions: cleanRows(sources.transactions),
  };
  const snapshotFingerprint = hmac({
    products: normalizedSources.products.map((row) => ({ id: hmac(["cooperative_inventory", row.id]), data: stableSource(row.data) })),
    suppliers: normalizedSources.suppliers.map((row) => ({ id: hmac(["cooperative_suppliers", row.id]), data: stableSource(row.data) })),
    wallets: normalizedSources.wallets.map((row) => ({ id: hmac(["cooperative_wallets", row.id]), data: stableSource(row.data) })),
    transactions: normalizedSources.transactions.map((row) => ({ id: hmac(["cooperative_transactions", row.id]), data: stableSource(row.data) })),
  });
  const sourceCount = normalizedSources.products.length + normalizedSources.suppliers.length;
  const counts = {
    source: sourceCount,
    products: normalizedSources.products.length,
    suppliers: normalizedSources.suppliers.length,
    ready: 0,
    alreadyImported: 0,
    invalid: 0,
    deferredWallets: normalizedSources.wallets.length,
    deferredTransactions: normalizedSources.transactions.length,
  };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" }> = [];
  const warnings: Array<{ code: string; count: number }> = [];
  const items: Row[] = [];
  const issue = (code: string, collection: string, sourceId: string) => {
    issues.push({ code, recordRef: sourceId ? hmac([collection, sourceId]).slice(0, 12) : "", severity: "blocking" });
    counts.invalid += 1;
  };
  if (normalizedSources.products.length > MAX_ROWS_PER_COLLECTION || normalizedSources.suppliers.length > MAX_ROWS_PER_COLLECTION) {
    issue("record_limit_exceeded", "cooperative_catalog", "");
    return {
      phase: "catalog_only",
      snapshotFingerprint,
      counts,
      issues,
      warnings,
      issueCount: issues.length,
      blockingCount: issues.length,
      deferred: { wallets: counts.deferredWallets, transactions: counts.deferredTransactions },
      canApply: false,
      items,
    };
  }

  const existingProductByRequest = new Map(existingProducts.map((row) => [String(row.client_request_id || ""), row]));
  const existingProductSkus = new Set(existingProducts.map((row) => normalized(row.sku)));
  const existingSupplierByRequest = new Map(existingSuppliers.map((row) => [String(row.client_request_id || ""), row]));
  const existingSupplierNames = new Set(existingSuppliers.map((row) => normalized(row.name)));
  const seenProductIds = new Set<string>();
  const seenProductSkus = new Set<string>();
  const seenSupplierIds = new Set<string>();
  const seenSupplierNames = new Set<string>();

  for (const row of normalizedSources.products) {
    const collection = "cooperative_inventory";
    const sourceId = row.id;
    const sourceData = stableSource(row.data);
    const legacyId = text(row.data.id) || sourceId;
    const sku = legacyId.toUpperCase();
    const name = text(row.data.name);
    const category = text(row.data.category);
    const costPrice = row.data.costPrice;
    const unitPrice = row.data.price;
    const stockQuantity = row.data.stock;
    const reorderPoint = row.data.reorderPoint;
    const expiryDate = parseExpiryDate(row.data.expiryDate);
    const sourceKey = sourceId ? hmac([collection, sourceId]) : "";
    const sourceFingerprint = hmac({ id: sourceKey, data: sourceData });
    const clientRequestId = sourceId ? deterministicRequestId(tenantId, collection, sourceId, sourceFingerprint) : "";
    const invalid = !sourceId || sourceId.length > 1500 || seenProductIds.has(sourceKey)
      || !sku || sku.length > 48 || !/^[A-Z0-9._-]+$/.test(sku)
      || !name || name.length > 180 || !category || category.length > 100
      || typeof costPrice !== "number" || !Number.isSafeInteger(costPrice) || costPrice < 0 || costPrice > 1000000000
      || typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice < 0 || unitPrice > 1000000000
      || typeof stockQuantity !== "number" || !Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000000
      || typeof reorderPoint !== "number" || !Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || reorderPoint > 100000000
      || expiryDate === undefined;
    if (invalid) { issue("invalid_or_duplicate_inventory_record", collection, sourceId); continue; }
    seenProductIds.add(sourceKey);
    const skuKey = normalized(sku);
    if (seenProductSkus.has(skuKey)) { issue("duplicate_source_sku", collection, sourceId); continue; }
    seenProductSkus.add(skuKey);
    const mapped = { sku, name, category, costPrice, unitPrice, stockQuantity, reorderPoint, expiryDate };
    const prior = existingProductByRequest.get(clientRequestId);
    if (prior) {
      if (!productMatchesExisting(prior, mapped)) { issue("imported_product_changed_after_import", collection, sourceId); continue; }
      counts.alreadyImported += 1;
      continue;
    }
    if (existingProductSkus.has(skuKey)) { issue("target_sku_conflict", collection, sourceId); continue; }
    existingProductSkus.add(skuKey);
    items.push({ kind: "product", sourceRecordId: sourceKey, sourceFingerprint, clientRequestId, ...mapped });
  }

  for (const row of normalizedSources.suppliers) {
    const collection = "cooperative_suppliers";
    const sourceId = row.id;
    const sourceData = stableSource(row.data);
    const name = text(row.data.name);
    const category = row.data.category == null ? "" : text(row.data.category);
    const contact = row.data.contact == null ? "" : text(row.data.contact);
    const pic = row.data.pic == null ? "" : text(row.data.pic);
    const rawStatus = normalized(row.data.status);
    const status = rawStatus === "active" ? "active" : rawStatus === "inactive" ? "inactive" : null;
    const sourceKey = sourceId ? hmac([collection, sourceId]) : "";
    const sourceFingerprint = hmac({ id: sourceKey, data: sourceData });
    const clientRequestId = sourceId ? deterministicRequestId(tenantId, collection, sourceId, sourceFingerprint) : "";
    const invalid = !sourceId || sourceId.length > 1500 || seenSupplierIds.has(sourceKey)
      || !name || name.length > 180 || category == null || category.length > 100
      || contact == null || contact.length > 80 || pic == null || pic.length > 120
      || !status;
    if (invalid) { issue("invalid_or_duplicate_supplier_record", collection, sourceId); continue; }
    seenSupplierIds.add(sourceKey);
    const nameKey = normalized(name);
    if (seenSupplierNames.has(nameKey)) { issue("duplicate_source_supplier_name", collection, sourceId); continue; }
    seenSupplierNames.add(nameKey);
    const mapped = { name, category, contact, pic, status };
    const prior = existingSupplierByRequest.get(clientRequestId);
    if (prior) {
      if (!supplierMatchesExisting(prior, mapped)) { issue("imported_supplier_changed_after_import", collection, sourceId); continue; }
      counts.alreadyImported += 1;
      continue;
    }
    if (existingSupplierNames.has(nameKey)) { issue("target_supplier_name_conflict", collection, sourceId); continue; }
    existingSupplierNames.add(nameKey);
    items.push({ kind: "supplier", sourceRecordId: sourceKey, sourceFingerprint, clientRequestId, ...mapped });
  }

  counts.ready = items.length;
  if (counts.deferredWallets || counts.deferredTransactions) {
    warnings.push({ code: "wallet_balances_and_sales_require_student_mapping_and_ledger_reconciliation", count: counts.deferredWallets + counts.deferredTransactions });
  }
  const blockingCount = issues.length;
  const alreadyComplete = sourceCount > 0 && counts.alreadyImported === sourceCount;
  return {
    phase: "catalog_only",
    snapshotFingerprint,
    counts,
    issues: issues.slice(0, 100),
    warnings,
    issueCount: issues.length,
    blockingCount,
    deferred: { wallets: counts.deferredWallets, transactions: counts.deferredTransactions },
    canApply: blockingCount === 0 && (items.length > 0 || alreadyComplete),
    items,
  };
}

export async function applySupabaseLegacyCooperativeCatalog(
  tenantId: string,
  actorId: string,
  sources: LegacyCooperativeCatalogSources,
  existingProducts: Row[],
  existingSuppliers: Row[],
  expectedFingerprint: string,
) {
  const preview = previewSupabaseLegacyCooperativeCatalog(tenantId, sources, existingProducts, existingSuppliers);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseCooperativeError(409, "Snapshot Koperasi berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!preview.canApply) throw new SupabaseCooperativeError(409, "Pratinjau katalog Koperasi memiliki konflik atau data yang perlu ditinjau.");
  let importedProducts = 0;
  let importedSuppliers = 0;
  for (const item of preview.items) {
    if (item.kind === "product") {
      await manageSupabaseCooperativeProduct(tenantId, actorId, {
        action: "create",
        clientRequestId: item.clientRequestId,
        sku: item.sku,
        name: item.name,
        category: item.category,
        initialStock: item.stockQuantity,
        costPrice: item.costPrice,
        unitPrice: item.unitPrice,
        reorderPoint: item.reorderPoint,
        expiryDate: item.expiryDate || "",
      });
      importedProducts += 1;
    } else {
      await manageSupabaseCooperativeSupplier(tenantId, actorId, {
        action: "create",
        clientRequestId: item.clientRequestId,
        name: item.name,
        category: item.category,
        contact: item.contact,
        pic: item.pic,
        status: item.status,
      });
      importedSuppliers += 1;
    }
  }
  return {
    phase: "catalog_only",
    snapshotFingerprint: preview.snapshotFingerprint,
    counts: preview.counts,
    importedProducts,
    importedSuppliers,
    alreadyApplied: preview.items.length === 0,
    deferred: preview.deferred,
  };
}

