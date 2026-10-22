type Row = Record<string, any>;

export class SupabaseFacilityBookingError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseFacilityBookingError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseFacilityBookingError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}
async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config(); const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization"); else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text(); let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23P01", "23505", "23514", "23503"].includes(code) || response.status === 409) throw new SupabaseFacilityBookingError(409, code === "23P01" ? "Jadwal berbenturan dengan pemesanan fasilitas lain. Muat ulang jadwal dan pilih waktu lain." : body?.message || "Pemesanan fasilitas berubah atau tidak dapat diproses.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseFacilityBookingError(400, body?.message || "Data pemesanan fasilitas tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseFacilityBookingError(404, "Pemesanan fasilitas tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseFacilityBookingError(403, "Akses pemesanan fasilitas ditolak oleh role atau tenant.");
    throw new SupabaseFacilityBookingError(503, "Layanan pemesanan fasilitas Supabase belum dapat diproses.");
  }
  return body;
}
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function activeTenant(value: string) {
  if (!uuid(value)) throw new SupabaseFacilityBookingError(403, "Tenant fasilitas tidak valid.");
  const rows = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" }).toString());
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "active") throw new SupabaseFacilityBookingError(403, "Tenant fasilitas tidak aktif.");
  return value;
}
async function boundedRows(table: string, tenantId: string, select: string, order: string, max: number) {
  const result: Row[] = [];
  for (let offset = 0; offset <= max; offset += 500) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: String(Math.min(500, max + 1 - offset)), offset: String(offset) });
    const rows = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseFacilityBookingError(503, "Jadwal fasilitas belum dapat dimuat.");
    result.push(...rows);
    if (result.length > max) throw new SupabaseFacilityBookingError(503, "Jadwal fasilitas melewati batas tampilan aman.");
    if (rows.length < Math.min(500, max + 1 - offset)) return result;
  }
  return result;
}
async function assertImportReviewed(tenantId: string) {
  const batches = await request("/rest/v1/facility_booking_import_batches?" + new URLSearchParams({ select: "snapshot_fingerprint", tenant_id: "eq." + tenantId, limit: "1" }).toString());
  if (!Array.isArray(batches) || batches.length === 0) throw new SupabaseFacilityBookingError(409, "Jadwal fasilitas belum siap. Admin perlu meninjau dan menyelesaikan pratinjau arsip sebelum runtime dibuka.");
}
export async function assertSupabaseFacilityBookingsReady(tenantIdentifier: string) {
  const tenantId = await activeTenant(tenantIdentifier); await assertImportReviewed(tenantId);
}
export async function getSupabaseFacilityBookings(tenantIdentifier: string) {
  const tenantId = await activeTenant(tenantIdentifier); await assertImportReviewed(tenantId);
  const bookings = await boundedRows("facility_bookings", tenantId, "id,room_name,booking_date,start_time,end_time,purpose,booker_name,status,source_system,source_record_id,created_at,updated_at", "booking_date.desc,start_time.desc,id.desc", 6000);
  return { bookings: bookings.map((row) => ({ ...row, room: row.room_name, date: row.booking_date, startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5), purpose: row.purpose, booker: row.booker_name, status: row.status === "confirmed" ? "Confirmed" : "Cancelled" })) };
}
export async function manageSupabaseFacilityBooking(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseFacilityBookingError(400, "Data pemesanan fasilitas tidak valid.");
  return request("/rest/v1/rpc/manage_facility_booking", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function getSupabaseFacilityBookingImportContext(tenantIdentifier: string) {
  const tenantId = await activeTenant(tenantIdentifier);
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" }).toString());
  const legacyTenantKey = Array.isArray(tenants) ? String(tenants[0]?.legacy_tenant_key || "").trim() : "";
  if (!legacyTenantKey) throw new SupabaseFacilityBookingError(409, "Tenant belum memiliki pemetaan arsip Firestore lama.");
  const existingRows = await boundedRows("facility_bookings", tenantId, "id,room_name,booking_date,start_time,end_time,status,source_record_id,source_fingerprint,source_system", "booking_date.asc,start_time.asc,id.asc", 6000);
  return { tenantId, legacyTenantKey, existingRows };
}
export async function applySupabaseLegacyFacilityBookings(tenantId: string, actorId: string, snapshotFingerprint: string, sourceCount: number, items: Row[]) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint) || !Number.isInteger(sourceCount) || sourceCount < 0 || sourceCount > 6000 || !Array.isArray(items) || items.length > 6000) throw new SupabaseFacilityBookingError(400, "Snapshot impor pemesanan fasilitas tidak valid.");
  return request("/rest/v1/rpc/import_legacy_facility_bookings", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: snapshotFingerprint, p_source_count: sourceCount, p_rows: items }) });
}
