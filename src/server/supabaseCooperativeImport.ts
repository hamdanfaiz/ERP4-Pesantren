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


export type LegacyCooperativeFinancialMappings = {
  wallets?: Record<string, { targetWalletId?: string; openingBalance?: number }>;
  products?: Record<string, string>;
  confirmCompleteHistory?: boolean;
};

function parseLegacyCooperativeInstant(value: unknown, timeZone: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (isCalendarDate(raw)) {
    try {
      const reference = new Date(raw + "T12:00:00.000Z");
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(reference);
      const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
      const localAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
      const instant = new Date(reference.getTime() - (localAsUtc - reference.getTime()));
      return Number.isFinite(instant.getTime()) ? instant.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return undefined;
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function safeLegacyAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1000000000000;
}

export function previewSupabaseLegacyCooperativeFinancialHistory(
  tenantId: string,
  sources: Pick<LegacyCooperativeCatalogSources, "wallets" | "transactions">,
  targetWallets: Row[],
  targetStudents: Row[],
  targetProducts: Row[],
  usedWalletIds: string[],
  mappings: LegacyCooperativeFinancialMappings = {},
  timeZone = "Asia/Jakarta",
) {
  const walletsSource = cleanRows(sources.wallets);
  const transactionsSource = cleanRows(sources.transactions);
  const snapshotFingerprint = hmac({
    wallets: walletsSource.map((row) => ({ id: hmac(["cooperative_wallets", row.id]), data: stableSource(row.data) })),
    transactions: transactionsSource.map((row) => ({ id: hmac(["cooperative_transactions", row.id]), data: stableSource(row.data) })),
  });
  const counts = {
    sourceWallets: walletsSource.length,
    sourceTransactions: transactionsSource.length,
    sourceItems: 0,
    mappedWallets: 0,
    mappedProducts: 0,
    readyWallets: 0,
    readyTransactions: 0,
    invalid: 0,
  };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" }> = [];
  const warnings: Array<{ code: string; count: number }> = [];
  const issue = (code: string, collection: string, sourceId: string) => {
    issues.push({ code, recordRef: sourceId ? hmac([collection, sourceId]).slice(0, 12) : "", severity: "blocking" });
    counts.invalid += 1;
  };
  const targetWalletById = new Map(targetWallets.map((row) => [String(row.id || ""), row]));
  const targetStudentById = new Map(targetStudents.map((row) => [String(row.id || ""), row]));
  const targetProductById = new Map(targetProducts.map((row) => [String(row.id || ""), row]));
  const usedTargets = new Set(usedWalletIds);
  const sourceWalletByAlias = new Map<string, Row>();
  const walletCandidates: Row[] = [];
  const seenWalletRefs = new Set<string>();

  if (walletsSource.length > MAX_ROWS_PER_COLLECTION || transactionsSource.length > MAX_ROWS_PER_COLLECTION) {
    issue("record_limit_exceeded", "cooperative_financial_history", "");
    return {
      phase: "financial_history",
      snapshotFingerprint,
      counts,
      issues,
      warnings,
      issueCount: issues.length,
      blockingCount: issues.length,
      canApply: false,
      wallets: [],
      transactions: [],
      targetWalletOptions: [],
      targetProductOptions: [],
    };
  }

  for (const row of walletsSource) {
    const sourceId = row.id;
    const data = stableSource(row.data);
    const sourceRef = sourceId ? hmac(["cooperative_wallets", sourceId]) : "";
    const sourceAlias = text(data.id);
    const studentLabel = text(data.student);
    const closingBalance = data.balance;
    const invalid = !sourceId || sourceId.length > 1500 || seenWalletRefs.has(sourceRef)
      || !studentLabel || !safeLegacyAmount(closingBalance);
    if (invalid) {
      issue("invalid_or_duplicate_source_wallet", "cooperative_wallets", sourceId);
      continue;
    }
    seenWalletRefs.add(sourceRef);
    const candidate = { sourceId, sourceRef, studentLabel, closingBalance, salesTotal: 0 };
    for (const alias of [sourceId, sourceAlias].filter((item): item is string => Boolean(item))) {
      const prior = sourceWalletByAlias.get(alias);
      if (prior && prior.sourceRef !== sourceRef) {
        issue("ambiguous_source_wallet_reference", "cooperative_wallets", sourceId);
        continue;
      }
      sourceWalletByAlias.set(alias, candidate);
    }
    walletCandidates.push(candidate);
  }

  const walletByRef = new Map(walletCandidates.map((row) => [String(row.sourceRef), row]));
  const transactions: Row[] = [];
  const seenTransactionRefs = new Set<string>();
  let dateOnlyCount = 0;
  let unknownCostCount = 0;

  for (const row of transactionsSource) {
    const sourceId = row.id;
    const data = stableSource(row.data);
    const sourceRef = sourceId ? hmac(["cooperative_transactions", sourceId]) : "";
    const walletAlias = text(data.walletId);
    const sourceWallet = walletAlias ? sourceWalletByAlias.get(walletAlias) : undefined;
    const status = normalized(data.status);
    const total = data.total;
    const createdAt = parseLegacyCooperativeInstant(data.date, timeZone);
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const itemRows: Row[] = [];
    let lineTotal = 0;
    let invalidItem = false;
    if (!sourceId || sourceId.length > 1500 || seenTransactionRefs.has(sourceRef)) {
      issue("invalid_or_duplicate_source_transaction", "cooperative_transactions", sourceId);
      continue;
    }
    seenTransactionRefs.add(sourceRef);
    if (!sourceWallet || !walletByRef.has(String(sourceWallet.sourceRef))) {
      issue("transaction_wallet_reference_unresolved", "cooperative_transactions", sourceId);
    }
    if (status !== "success") issue("unsupported_transaction_status", "cooperative_transactions", sourceId);
    if (!safeLegacyAmount(total) || total <= 0) issue("invalid_transaction_total", "cooperative_transactions", sourceId);
    if (!createdAt) issue("invalid_transaction_date", "cooperative_transactions", sourceId);
    else if (typeof data.date === "string" && isCalendarDate(data.date.trim())) dateOnlyCount += 1;
    if (rawItems.length < 1 || rawItems.length > 50) issue("invalid_transaction_items", "cooperative_transactions", sourceId);

    rawItems.forEach((item, index) => {
      const name = text(item?.name);
      const rawPrice: unknown = item?.price;
      const rawQuantity: unknown = item?.qty;
      const itemRef = hmac(["cooperative_transactions", sourceId, index, stable(item)]).slice(0, 32);
      const validItem = Boolean(name && name.length <= 180)
        && safeLegacyAmount(rawPrice)
        && typeof rawQuantity === "number" && Number.isSafeInteger(rawQuantity) && rawQuantity > 0 && rawQuantity <= 500
        && Number.isSafeInteger(rawPrice * rawQuantity);
      if (!validItem) {
        invalidItem = true;
        issue("invalid_transaction_item", "cooperative_transactions", sourceId);
        return;
      }
      const price = rawPrice as number;
      const quantity = rawQuantity as number;
      counts.sourceItems += 1;
      const mappedProductId = mappings.products?.[itemRef];
      const product = mappedProductId ? targetProductById.get(mappedProductId) : undefined;
      if (!product) issue("transaction_item_product_mapping_required", "cooperative_transactions", sourceId);
      else counts.mappedProducts += 1;
      const mappedLineTotal = price * quantity;
      lineTotal += mappedLineTotal;
      itemRows.push({
        itemRef,
        name,
        unitPrice: price,
        quantity,
        lineTotal: mappedLineTotal,
        productId: product?.id || null,
        skuSnapshot: text(product?.sku) || "",
        costPrice: null,
        costSnapshotKnown: false,
      });
    });
    if (safeLegacyAmount(total) && !invalidItem && lineTotal !== total) {
      issue("transaction_total_does_not_match_items", "cooperative_transactions", sourceId);
    }
    const sourceFingerprint = hmac({ id: hmac(["cooperative_transactions", sourceId]), data });
    const clientRequestId = sourceId
      ? deterministicRequestId(tenantId, "cooperative_transactions", sourceId, "financial-history")
      : "";
    const transaction = {
      sourceRef,
      sourceFingerprint,
      clientRequestId,
      sourceWalletRef: sourceWallet?.sourceRef || null,
      status: text(data.status) || "",
      createdAt: createdAt || null,
      dateOnly: Boolean(typeof data.date === "string" && isCalendarDate(data.date.trim())),
      total: safeLegacyAmount(total) ? total : null,
      items: itemRows,
    };
    transactions.push(transaction);
    if (sourceWallet && safeLegacyAmount(total)) sourceWallet.salesTotal = Number(sourceWallet.salesTotal || 0) + total;
  }
  counts.readyTransactions = transactions.filter((row) => row.createdAt && row.items.length > 0).length;

  const mappedTargetWallets = new Set<string>();
  const mappedWallets: Row[] = [];
  for (const candidate of walletCandidates) {
    const mapping = mappings.wallets?.[String(candidate.sourceRef)];
    const publicCandidate = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "sourceId"));
    const targetWalletId = text(mapping?.targetWalletId);
    const targetWallet = targetWalletId ? targetWalletById.get(targetWalletId) : undefined;
    const targetStudent = targetWallet ? targetStudentById.get(String(targetWallet.student_id || "")) : undefined;
    const openingBalance = mapping?.openingBalance;
    if (!targetWallet) {
      issue("wallet_student_mapping_required", "cooperative_wallets", String(candidate.sourceId));
      mappedWallets.push({ ...publicCandidate, targetWalletId: null, targetStudentLabel: null, openingBalance: null, expectedClosingBalance: null });
      continue;
    }
    counts.mappedWallets += 1;
    if (mappedTargetWallets.has(targetWalletId)) issue("target_wallet_mapped_more_than_once", "cooperative_wallets", String(candidate.sourceId));
    mappedTargetWallets.add(targetWalletId);
    if (!targetStudent) issue("target_wallet_student_missing", "cooperative_wallets", String(candidate.sourceId));
    if (usedTargets.has(targetWalletId)) issue("target_wallet_has_existing_history", "cooperative_wallets", String(candidate.sourceId));
    if (Number(targetWallet.balance || 0) !== 0) issue("target_wallet_balance_must_be_zero", "cooperative_wallets", String(candidate.sourceId));
    if (!safeLegacyAmount(openingBalance)) issue("opening_balance_required", "cooperative_wallets", String(candidate.sourceId));
    const expectedClosingBalance = safeLegacyAmount(openingBalance)
      ? openingBalance - Number(candidate.salesTotal || 0)
      : null;
    if (expectedClosingBalance != null && expectedClosingBalance < 0) {
      issue("opening_balance_less_than_archived_sales", "cooperative_wallets", String(candidate.sourceId));
    } else if (expectedClosingBalance != null && expectedClosingBalance !== candidate.closingBalance) {
      issue("opening_balance_does_not_reconcile", "cooperative_wallets", String(candidate.sourceId));
    }
    const sourceFingerprint = hmac({
      id: hmac(["cooperative_wallets", candidate.sourceId]),
      data: stableSource(walletsSource.find((row) => row.id === candidate.sourceId)?.data || {}),
    });
    const clientRequestId = deterministicRequestId(tenantId, "cooperative_wallets", String(candidate.sourceId), "financial-opening-balance");
    if (targetStudent && !usedTargets.has(targetWalletId) && Number(targetWallet.balance || 0) === 0
      && safeLegacyAmount(openingBalance) && expectedClosingBalance === candidate.closingBalance) {
      counts.readyWallets += 1;
    }
    mappedWallets.push({
      ...publicCandidate,
      targetWalletId,
      targetStudentId: targetWallet.student_id,
      targetStudentLabel: targetStudent?.name || "",
      targetStudentNis: targetStudent?.nis || "",
      openingBalance: safeLegacyAmount(openingBalance) ? openingBalance : null,
      expectedClosingBalance,
      sourceFingerprint,
      clientRequestId,
    });
  }

  if (mappings.confirmCompleteHistory !== true) {
    warnings.push({ code: "operator_must_confirm_sales_archive_is_complete_and_opening_balance_is_reconciled", count: 1 });
  }
  if (dateOnlyCount) warnings.push({ code: "date_only_transactions_use_tenant_local_noon", count: dateOnlyCount });
  unknownCostCount = counts.sourceItems;
  if (unknownCostCount) warnings.push({ code: "historical_cost_is_unknown_and_will_not_be_used_for_margin", count: unknownCostCount });

  const unresolvedWalletReferences = transactions.filter((row) => !row.sourceWalletRef).length;
  const unresolvedProductMappings = transactions.reduce((sum, row) => sum + row.items.filter((item: Row) => !item.productId).length, 0);
  const canApply = issues.length === 0
    && mappings.confirmCompleteHistory === true
    && counts.readyWallets === counts.sourceWallets
    && counts.mappedProducts === counts.sourceItems
    && unresolvedWalletReferences === 0
    && unresolvedProductMappings === 0;
  const targetWalletOptions = targetWallets.map((wallet) => {
    const student = targetStudentById.get(String(wallet.student_id || ""));
    return {
      walletId: String(wallet.id || ""),
      studentId: String(wallet.student_id || ""),
      student: String(student?.name || "Data santri tidak ditemukan"),
      nis: String(student?.nis || ""),
      grade: String(student?.grade || student?.class_id || ""),
      balance: Number(wallet.balance || 0),
      status: String(wallet.status || ""),
    };
  });
  const targetProductOptions = targetProducts.map((product) => ({
    id: String(product.id || ""),
    sku: String(product.sku || ""),
    name: String(product.name || ""),
    status: String(product.status || ""),
  }));
  return {
    phase: "financial_history",
    snapshotFingerprint,
    counts,
    issues: issues.slice(0, 100),
    warnings,
    issueCount: issues.length,
    blockingCount: issues.length,
    canApply,
    attestCompleteHistory: mappings.confirmCompleteHistory === true,
    wallets: mappedWallets,
    transactions,
    targetWalletOptions,
    targetProductOptions,
  };
}
