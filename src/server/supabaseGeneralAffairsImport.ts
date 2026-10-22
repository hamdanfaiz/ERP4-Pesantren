import { createHmac } from "node:crypto";
import { applySupabaseLegacyGeneralAffairsImport as persistSupabaseLegacyGeneralAffairsImport, SupabaseGeneralAffairsError } from "./supabaseGeneralAffairs";

type Row = Record<string, any>;
export type LegacyGeneralAffairsSources = {
  facilities: Array<{ id: string; data: Row }>;
  inventory: Array<{ id: string; data: Row }>;
};

const KNOWN_FACILITY_SEEDS = new Map([
  ["AST-26-001", "Lenovo ThinkPad T14 (Admin GA)"],
  ["AST-26-002", "Proyektor Epson EB-X51"],
  ["AST-26-003", "AC Split Daikin 1.5 PK"],
  ["AST-26-004", "Genset Silent Perkins 50 kVA"],
  ["AST-26-005", "Meja Santri Kayu Jati (Set 20)"],
  ["AST-26-006", "Pompa Air Booster Grundfos"],
]);
const KNOWN_INVENTORY_SEEDS = new Map([
  ["STK-001", "Sapu Lidi & Ijuk Gagang"],
  ["STK-002", "Kertas HVS PaperOne A4 75gr"],
  ["STK-003", "Lampu LED Philips 14W Putih"],
  ["STK-004", "Cairan Karbol Pembersih Lantai 5L"],
  ["STK-005", "Kran Air PVC 1/2 Inch"],
  ["STK-006", "Spidol Whiteboard Snowman Hitam"],
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
  if (key.length < 32) throw new SupabaseGeneralAffairsError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stable(value))).digest("hex");
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function normalized(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
function sourceId(kind: string, id: string) { return fingerprint(`${kind}\u0000${id}`); }
function ref(kind: string, id: string) { return fingerprint(`${kind}\u0000${id}`).slice(0, 12); }
function day(value: unknown): string | null {
  let input: any = value;
  try { if (input && typeof input.toDate === "function") input = input.toDate(); else if (input && typeof input._seconds === "number") input = new Date(input._seconds * 1000); } catch { return null; }
  let raw = input instanceof Date ? (Number.isFinite(input.getTime()) ? input.toISOString().slice(0, 10) : "") : text(input);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  raw = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(raw + "T00:00:00Z");
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}
function condition(value: unknown): string | null {
  const normalizedValue = normalized(value);
  if (["baik", "good", "active"].includes(normalizedValue)) return "Baik";
  if (["perlu servis", "perlu perbaikan", "maintenance", "needs service"].includes(normalizedValue)) return "Perlu Servis";
  if (["rusak berat", "rusak", "broken", "damaged"].includes(normalizedValue)) return "Rusak Berat";
  return null;
}
function rows(value: Array<{ id: string; data: Row }> | undefined) {
  return [...(value || [])].map((row) => ({ id: String(row.id || ""), data: stable(row.data || {}) as Row })).sort((a, b) => a.id.localeCompare(b.id));
}

export function previewSupabaseLegacyGeneralAffairs(sources: LegacyGeneralAffairsSources, existingRows: Row[], assetCodes: Row[], inventoryCodes: Row[]) {
  const normalizedSources = { facilities: rows(sources.facilities), inventory: rows(sources.inventory) };
  const snapshotFingerprint = fingerprint(normalizedSources);
  const sourceCount = normalizedSources.facilities.length + normalizedSources.inventory.length;
  const counts = { source: sourceCount, facilities: 0, inventory: 0, ready: 0, alreadyImported: 0, invalid: 0 };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" }> = [];
  const items: Row[] = [];
  if (sourceCount > 6000) return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "", severity: "blocking" as const }], issueCount: 1, blockingCount: 1, canApply: false, items };
  const existing = new Map<string, string>();
  for (const row of existingRows) if (row.source_record_id) existing.set(`${row.kind}:${row.source_record_id}`, String(row.source_fingerprint || ""));
  const usedAssetCodes = new Set(assetCodes.map((row) => normalized(row.asset_code)));
  const usedInventoryCodes = new Set(inventoryCodes.map((row) => normalized(row.item_code)));
  const seenSource = new Set<string>();
  const issue = (code: string, kind: string, id: string) => { issues.push({ code, recordRef: ref(kind, id), severity: "blocking" }); counts.invalid += 1; };
  const append = (kind: "facility" | "inventory", originalId: string, data: Row, mapped: Row, codes: Set<string>, code: string) => {
    const id = sourceId(kind, originalId), key = `${kind}:${id}`, dataFingerprint = fingerprint(data), normalizedCode = normalized(code);
    if (!originalId || seenSource.has(key)) { issue("duplicate_or_missing_source_id", kind, originalId); return; }
    seenSource.add(key);
    const previous = existing.get(key);
    if (previous) { if (previous !== dataFingerprint) issue("source_changed_after_import", kind, originalId); else counts.alreadyImported += 1; return; }
    if (codes.has(normalizedCode)) { issue(kind === "facility" ? "asset_code_conflict" : "item_code_conflict", kind, originalId); return; }
    codes.add(normalizedCode);
    items.push({ kind, sourceRecordId: id, sourceFingerprint: dataFingerprint, ...mapped });
    if (kind === "facility") counts.facilities += 1; else counts.inventory += 1;
  };

  for (const row of normalizedSources.facilities) {
    const data = row.data;
    const assetCode = text(data.id) || row.id;
    const name = text(data.name), state = condition(data.condition);
    const category = text(data.category), location = text(data.location), custodian = text(data.pic || data.custodian);
    const value = Number(data.value ?? data.acquisitionValue ?? 0);
    const acquiredRaw = data.acquisitionDate ?? data.acquiredOn;
    const acquiredOn = acquiredRaw == null || acquiredRaw === "" ? null : day(acquiredRaw);
    if (KNOWN_FACILITY_SEEDS.has(assetCode) && normalized(KNOWN_FACILITY_SEEDS.get(assetCode)) === normalized(name)) { issue("known_browser_seed_requires_admin_review", "facility", row.id); continue; }
    if (!name || name.length > 180 || !assetCode || assetCode.length > 40 || category.length > 100 || location.length > 180 || custodian.length > 160
      || !state || !Number.isFinite(value) || value < 0 || (acquiredRaw && !acquiredOn)) { issue("invalid_asset_record", "facility", row.id); continue; }
    const statusValue = normalized(data.status);
    append("facility", row.id, data, { assetCode, name, category, location, custodian, condition: state, acquisitionValue: value, acquiredOn, status: ["disposed", "retired", "dilepas"].includes(statusValue) ? "disposed" : "active" }, usedAssetCodes, assetCode);
  }

  for (const row of normalizedSources.inventory) {
    const data = row.data;
    const itemCode = text(data.id) || row.id;
    const name = text(data.name), category = text(data.category), unit = text(data.unit) || "Pcs", location = text(data.location);
    const quantity = Number(data.currentStock ?? data.quantity ?? 0), minimumQuantity = Number(data.minStock ?? data.minimumQuantity ?? 0);
    const unitCost = Number(data.costPerUnit ?? data.unitCost ?? 0);
    if (KNOWN_INVENTORY_SEEDS.has(itemCode) && normalized(KNOWN_INVENTORY_SEEDS.get(itemCode)) === normalized(name)) { issue("known_browser_seed_requires_admin_review", "inventory", row.id); continue; }
    if (!name || name.length > 180 || !itemCode || itemCode.length > 40 || category.length > 100 || unit.length > 40 || location.length > 180
      || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000000 || !Number.isInteger(minimumQuantity) || minimumQuantity < 0 || minimumQuantity > 100000000 || !Number.isFinite(unitCost) || unitCost < 0) { issue("invalid_inventory_record", "inventory", row.id); continue; }
    append("inventory", row.id, data, { itemCode, name, category, quantity, minimumQuantity, unit, unitCost, location }, usedInventoryCodes, itemCode);
  }
  const blockingCount = issues.length;
  counts.ready = items.length;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), issueCount: issues.length, blockingCount, canApply: blockingCount === 0 && items.length > 0, items };
}

export async function applySupabaseLegacyGeneralAffairsImport(tenantId: string, actorId: string, sources: LegacyGeneralAffairsSources, existingRows: Row[], assetCodes: Row[], inventoryCodes: Row[], expectedFingerprint: string) {
  const preview = previewSupabaseLegacyGeneralAffairs(sources, existingRows, assetCodes, inventoryCodes);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) throw new SupabaseGeneralAffairsError(409, "Snapshot GA berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  if (!preview.canApply) throw new SupabaseGeneralAffairsError(409, "Pratinjau impor GA memiliki konflik atau tidak ada data baru.");
  const result = await persistSupabaseLegacyGeneralAffairsImport(tenantId, actorId, preview.snapshotFingerprint, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), skipped: Number(result?.skipped || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
