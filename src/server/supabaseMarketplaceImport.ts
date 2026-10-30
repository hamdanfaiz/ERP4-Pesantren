import { createHmac } from "node:crypto";
import { applySupabaseLegacyMarketplaceImport, SupabaseMarketplaceError } from "./supabaseMarketplace";

type Row = Record<string, any>;
export type LegacyMarketplaceSources = { products: Array<{ id: string; data: Row }>; orders: Array<{ id: string; data: Row }> };
const PRODUCT_SEEDS = new Map([
  ["P-001", "Seragam Lengkap Putra (SMP)"], ["P-002", "Kitab Fathul Qorib Berharakat"], ["P-003", "Robusta Coffee Bean (250g)"],
  ["P-004", "Jilbab Bergo Instan"], ["P-005", "Kaligrafi Kayu Jati 3D"], ["P-006", "Totebag As-Salam"],
  ["P-007", "Madu Hutan Liar (500ml)"], ["P-008", "Buku Tulis Custom (Pack 10)"],
]);
const ORDER_SEEDS = new Map([
  ["ORD-1001", "Ibu Rahma"], ["ORD-1002", "Budi Santoso"], ["ORD-1003", "Ahmad Fadil"], ["ORD-1004", "Hj. Siti Hawa"], ["ORD-1005", "Faisal Akbar"],
]);
function stable(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") { const result: Row = {}; for (const key of Object.keys(value).sort()) result[key] = stable(value[key]); return result; }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}
function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseMarketplaceError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stable(value))).digest("hex");
}
function sourceId(kind: string, id: string) { return fingerprint(`${kind}\u0000${id}`); }
function ref(kind: string, id: string) { return fingerprint(`${kind}\u0000${id}`).slice(0, 12); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function normalized(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
function legacyCode(value: unknown) { return text(value).split("__").filter(Boolean).pop() || ""; }
function parseDate(value: unknown): string | null {
  let input: any = value;
  try { if (input && typeof input.toDate === "function") input = input.toDate(); else if (input && typeof input._seconds === "number") input = new Date(input._seconds * 1000); } catch { return null; }
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input.toISOString() : null;
  const raw = text(input);
  if (!raw) return null;
  const isoLike = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  const candidate = isoLike ? `${isoLike[1]}T${isoLike[2]}:${isoLike[3] || "00"}Z` : raw;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function cleanRows(value: Array<{ id: string; data: Row }> | undefined) {
  return [...(value || [])].map((row) => ({ id: String(row.id || ""), data: stable(row.data || {}) as Row })).sort((a, b) => a.id.localeCompare(b.id));
}
function mapOrderStatus(value: unknown): string | null {
  const status = normalized(value);
  if (["pending", "menunggu"].includes(status)) return "pending";
  if (["processing", "diproses", "proses"].includes(status)) return "processing";
  if (["ready to ship", "ready_to_ship", "siap dikirim"].includes(status)) return "ready_to_ship";
  if (["delivered", "selesai", "terkirim"].includes(status)) return "delivered";
  if (["cancelled", "canceled", "dibatalkan"].includes(status)) return "cancelled";
  return null;
}

export function previewSupabaseLegacyMarketplace(sources: LegacyMarketplaceSources, existingRows: Row[], existingSkus: Row[]) {
  const normalizedSources = { products: cleanRows(sources.products), orders: cleanRows(sources.orders) };
  const snapshotFingerprint = fingerprint(normalizedSources);
  const sourceCount = normalizedSources.products.length + normalizedSources.orders.length;
  const counts = { source: sourceCount, products: 0, orders: 0, ready: 0, alreadyImported: 0, invalid: 0 };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" }> = [];
  const items: Row[] = [];
  if (sourceCount > 6000) return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "", severity: "blocking" as const }], issueCount: 1, blockingCount: 1, canApply: false, items };
  const existing = new Map<string, string>();
  for (const row of existingRows) if (row.source_record_id) existing.set(`${row.kind}:${row.source_record_id}`, String(row.source_fingerprint || ""));
  const skus = new Set(existingSkus.map((row) => normalized(row.sku)));
  const seenSources = new Set<string>();
  const issue = (code: string, kind: string, originalId: string) => { issues.push({ code, recordRef: ref(kind, originalId), severity: "blocking" }); counts.invalid += 1; };
  const append = (kind: "product" | "order", originalId: string, data: Row, mapped: Row, sku?: string) => {
    const keyId = sourceId(kind, originalId), key = `${kind}:${keyId}`, sourceFingerprint = fingerprint(data);
    if (!originalId || seenSources.has(key)) { issue("duplicate_or_missing_source_id", kind, originalId); return; }
    seenSources.add(key);
    const prior = existing.get(key);
    if (prior) { if (prior !== sourceFingerprint) issue("source_changed_after_import", kind, originalId); else counts.alreadyImported += 1; return; }
    if (sku && skus.has(normalized(sku))) { issue("sku_conflict", kind, originalId); return; }
    if (sku) skus.add(normalized(sku));
    items.push({ kind, sourceRecordId: keyId, sourceFingerprint, ...mapped });
    if (kind === "product") counts.products += 1; else counts.orders += 1;
  };

  for (const row of normalizedSources.products) {
    const data = row.data, sku = legacyCode(data.id) || legacyCode(row.id), name = text(data.name);
    const category = text(data.category), seller = text(data.seller), imageLabel = text(data.image);
    const unitPrice = Number(data.price ?? data.unitPrice), stockQuantity = Number(data.stock ?? data.stockQuantity ?? 0);
    if (PRODUCT_SEEDS.has(sku) && normalized(PRODUCT_SEEDS.get(sku)) === normalized(name)) { issue("known_browser_seed_requires_admin_review", "product", row.id); continue; }
    const statusRaw = normalized(data.status);
    if (!sku || sku.length > 40 || !name || name.length > 180 || category.length > 100 || seller.length > 120 || imageLabel.length > 80 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000000) { issue("invalid_product_record", "product", row.id); continue; }
    append("product", row.id, data, { sku, name, category, unitPrice, stockQuantity, seller, imageLabel, status: ["archived", "inactive", "nonaktif"].includes(statusRaw) ? "archived" : "active" }, sku);
  }
  for (const row of normalizedSources.orders) {
    const data = row.data, orderKey = legacyCode(data.id) || legacyCode(row.id), customerName = text(data.customer);
    if (ORDER_SEEDS.has(orderKey) && normalized(ORDER_SEEDS.get(orderKey)) === normalized(customerName)) { issue("known_browser_seed_requires_admin_review", "order", row.id); continue; }
    const customerType = text(data.type), status = mapOrderStatus(data.status), itemCount = Number(data.items), totalAmount = Number(data.total);
    const createdAt = parseDate(data.date ?? data.createdAt);
    if (!customerName || customerName.length > 160 || !["Parent", "Alumni", "Public", "Internal"].includes(customerType) || !status || !Number.isInteger(itemCount) || itemCount < 1 || itemCount > 100000000 || !Number.isFinite(totalAmount) || totalAmount < 0 || ((data.date || data.createdAt) && !createdAt)) { issue("invalid_order_record", "order", row.id); continue; }
    append("order", row.id, data, { customerName, customerType, status, itemCount, totalAmount, createdAt });
  }
  counts.ready = items.length;
  const blockingCount = issues.length;
  const alreadyComplete = sourceCount === counts.alreadyImported;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), issueCount: issues.length, blockingCount, canApply: blockingCount === 0 && (items.length > 0 || sourceCount === 0 || alreadyComplete), items };
}

export async function applySupabaseLegacyMarketplace(tenantId: string, actorId: string, sources: LegacyMarketplaceSources, existingRows: Row[], existingSkus: Row[], expectedFingerprint: string) {
  const preview = previewSupabaseLegacyMarketplace(sources, existingRows, existingSkus);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) throw new SupabaseMarketplaceError(409, "Snapshot Marketplace berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  if (!preview.canApply) throw new SupabaseMarketplaceError(409, "Pratinjau Marketplace memiliki konflik atau data perlu ditinjau Admin.");
  const result = await applySupabaseLegacyMarketplaceImport(tenantId, actorId, preview.snapshotFingerprint, preview.counts.source, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, importedProducts: Number(result?.products || 0), importedOrders: Number(result?.orders || 0), skipped: Number(result?.skipped || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
