type Row = Record<string, any>;

export class SupabaseGeneralAffairsError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseGeneralAffairsError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseGeneralAffairsError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseGeneralAffairsError(409, body?.message || "Data General Affairs bertentangan dengan data tenant yang tersimpan.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseGeneralAffairsError(400, body?.message || "Data General Affairs tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseGeneralAffairsError(404, body?.message || "Record tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseGeneralAffairsError(403, "Akses General Affairs ditolak oleh role atau tenant.");
    throw new SupabaseGeneralAffairsError(503, "Layanan General Affairs Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function tenantIdFrom(value: string) {
  if (!uuid(value)) throw new SupabaseGeneralAffairsError(403, "Tenant General Affairs tidak valid.");
  const params = new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" });
  const tenants = await request("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") throw new SupabaseGeneralAffairsError(403, "Tenant General Affairs tidak aktif.");
  return value;
}

async function boundedRows(table: string, tenantId: string, select: string, order: string, limit: number) {
  const pageSize = 500;
  const result: Row[] = [];
  for (let offset = 0; offset <= limit; offset += pageSize) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: String(Math.min(pageSize, limit + 1 - offset)), offset: String(offset) });
    const page = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(page)) throw new SupabaseGeneralAffairsError(503, "Data General Affairs belum dapat dimuat.");
    result.push(...page);
    if (result.length > limit) throw new SupabaseGeneralAffairsError(503, "Data General Affairs melewati batas tampilan aman.");
    if (page.length < Math.min(pageSize, limit + 1 - offset)) return result;
  }
  return result;
}

export async function getSupabaseGeneralAffairsSnapshot(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const [facilities, inventory, movements] = await Promise.all([
    boundedRows("ga_facilities", tenantId, "id,asset_code,name,category,location,custodian,condition,acquisition_value,acquired_on,status,last_opname_on,created_at,updated_at", "status.asc,name.asc,id.asc", 5000),
    boundedRows("ga_inventory_items", tenantId, "id,item_code,name,category,quantity,minimum_quantity,unit,unit_cost,location,status,created_at,updated_at", "status.asc,name.asc,id.asc", 5000),
    boundedRows("ga_inventory_movements", tenantId, "id,item_id,quantity_delta,balance_after,reason,created_by,created_at", "created_at.desc,id.desc", 1000),
  ]);
  const itemById = new Map<string, Row>(inventory.map((item): [string, Row] => [String(item.id), item]));
  return {
    facilities: facilities.map((item) => ({ ...item, estimatedValue: Number(item.acquisition_value) || 0 })),
    inventory: inventory.map((item) => ({ ...item, quantity: Number(item.quantity) || 0, minimum_quantity: Number(item.minimum_quantity) || 0, unit_cost: Number(item.unit_cost) || 0, stockStatus: Number(item.quantity) <= 0 ? "Out of Stock" : Number(item.quantity) <= Number(item.minimum_quantity) ? "Low Stock" : "In Stock" })),
    movements: movements.map((movement) => ({ ...movement, itemName: itemById.get(String(movement.item_id))?.name || "Barang diarsipkan" })),
  };
}

export async function manageSupabaseGeneralAffairsFacility(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseGeneralAffairsError(400, "Data aset General Affairs tidak valid.");
  return request("/rest/v1/rpc/manage_ga_facility", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}

export async function manageSupabaseGeneralAffairsInventory(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseGeneralAffairsError(400, "Data inventaris General Affairs tidak valid.");
  return request("/rest/v1/rpc/manage_ga_inventory_item", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}

export async function adjustSupabaseGeneralAffairsStock(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.itemId) || !uuid(item?.clientRequestId) || !Number.isInteger(item?.delta) || typeof item?.reason !== "string") throw new SupabaseGeneralAffairsError(400, "Mutasi stok General Affairs tidak valid.");
  return request("/rest/v1/rpc/adjust_ga_inventory_stock", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item_id: item.itemId, p_delta: item.delta, p_reason: item.reason, p_client_request_id: item.clientRequestId }) });
}

export async function getSupabaseGeneralAffairsImportContext(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" }).toString());
  const legacyTenantKey = Array.isArray(tenants) ? String(tenants[0]?.legacy_tenant_key || "").trim() : "";
  if (!legacyTenantKey) throw new SupabaseGeneralAffairsError(409, "Tenant belum memiliki pemetaan arsip Firestore lama.");
  const [facilities, inventory, assetCodes, inventoryCodes] = await Promise.all([
    boundedRows("ga_facilities", tenantId, "source_record_id,source_fingerprint", "name.asc,id.asc", 5000),
    boundedRows("ga_inventory_items", tenantId, "source_record_id,source_fingerprint", "name.asc,id.asc", 5000),
    boundedRows("ga_facilities", tenantId, "asset_code,source_record_id", "asset_code.asc,id.asc", 5000),
    boundedRows("ga_inventory_items", tenantId, "item_code,source_record_id", "item_code.asc,id.asc", 5000),
  ]);
  return { tenantId, legacyTenantKey, existingRows: [
    ...facilities.map((row) => ({ ...row, kind: "facility" })),
    ...inventory.map((row) => ({ ...row, kind: "inventory" })),
  ], assetCodes, inventoryCodes };
}

export async function applySupabaseLegacyGeneralAffairsImport(tenantId: string, actorId: string, snapshotFingerprint: string, items: Row[]) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint) || !Array.isArray(items) || items.length > 6000) throw new SupabaseGeneralAffairsError(400, "Snapshot impor GA tidak valid.");
  return request("/rest/v1/rpc/import_legacy_ga_assets", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: snapshotFingerprint, p_items: items }) });
}
