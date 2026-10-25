import { readPostgrestRowsInPages } from "./postgrestPagination";

type Row = Record<string, any>;

export class SupabaseHealthcareError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseHealthcareError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseHealthcareError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization"); else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseHealthcareError(409, body?.message || "Data kesehatan bertentangan dengan roster atau record tenant.");
    if (code === "P0002" || response.status === 404) throw new SupabaseHealthcareError(404, body?.message || "Record kesehatan tidak ditemukan.");
    if (code === "42501" || response.status === 403) throw new SupabaseHealthcareError(403, "Akses kesehatan ditolak oleh kebijakan role atau tenant.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseHealthcareError(400, body?.message || "Data kesehatan tidak valid.");
    throw new SupabaseHealthcareError(503, "Layanan kesehatan Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function tenantIdFrom(value: string) {
  if (!uuid(value)) throw new SupabaseHealthcareError(403, "Tenant kesehatan tidak valid.");
  const rows = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" }).toString());
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].status !== "active") throw new SupabaseHealthcareError(403, "Tenant kesehatan tidak aktif.");
  return value;
}
async function boundedRows(path: string, limit: number, label: string) {
  return readPostgrestRowsInPages<Row>({
    request,
    path,
    maxRows: limit,
    onIncomplete: () => new SupabaseHealthcareError(503, `Data ${label} melewati batas aman tampilan atau hasil pemindaian tidak lengkap.`),
  });
}

export async function getSupabaseHealthcareSnapshot(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const [students, records, visits, medicines, movements] = await Promise.all([
    boundedRows("/rest/v1/students?" + new URLSearchParams({ select: "id,name,nis,grade,status", tenant_id: "eq." + tenantId, order: "name.asc,id.asc", limit: "5001" }).toString(), 5000, "roster UKS"),
    boundedRows("/rest/v1/healthcare_records?" + new URLSearchParams({ select: "id,student_id,blood_type,height_cm,weight_kg,allergies,chronic_conditions,last_check,updated_at", tenant_id: "eq." + tenantId, order: "updated_at.desc", limit: "5001" }).toString(), 5000, "rekam medis"),
    boundedRows("/rest/v1/healthcare_visits?" + new URLSearchParams({ select: "id,student_id,visit_date,visit_time,complaint,temperature_c,diagnosis,action_taken,status,created_at", tenant_id: "eq." + tenantId, order: "visit_date.desc,visit_time.desc", limit: "5001" }).toString(), 5000, "kunjungan UKS"),
    boundedRows("/rest/v1/healthcare_medicines?" + new URLSearchParams({ select: "id,name,category,stock_quantity,min_stock,unit,expires_on,updated_at", tenant_id: "eq." + tenantId, order: "name.asc", limit: "2001" }).toString(), 2000, "inventaris obat"),
    boundedRows("/rest/v1/healthcare_stock_movements?" + new URLSearchParams({ select: "id,medicine_id,quantity_delta,reason,created_at", tenant_id: "eq." + tenantId, order: "created_at.desc", limit: "1001" }).toString(), 1000, "mutasi stok"),
  ]);
  const studentsById = new Map<string, Row>(students.map((row): [string, Row] => [String(row.id), row]));
  const medicinesById = new Map<string, Row>(medicines.map((row): [string, Row] => [String(row.id), row]));
  return {
    students: students.filter((row) => !["archived", "alumni", "graduated", "inactive", "nonaktif", "dikeluarkan"].includes(String(row.status || "").toLowerCase())),
    records: records.map((row) => ({ ...row, student: studentsById.get(String(row.student_id)) || null })),
    visits: visits.map((row) => ({ ...row, student: studentsById.get(String(row.student_id)) || null })),
    medicines: medicines.map((row) => ({ ...row, stockStatus: Number(row.stock_quantity) <= 0 ? "Out of Stock" : Number(row.stock_quantity) <= Number(row.min_stock) ? "Low Stock" : "Sufficient" })),
    movements: movements.map((row) => ({ ...row, medicineName: medicinesById.get(String(row.medicine_id))?.name || "Obat diarsipkan" })),
  };
}

export async function saveSupabaseHealthcareRecord(tenantId: string, actorId: string, item: any) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.studentId)) throw new SupabaseHealthcareError(400, "Identitas rekam medis tidak valid.");
  return request("/rest/v1/rpc/manage_healthcare_record", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function createSupabaseHealthcareVisit(tenantId: string, actorId: string, item: any) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.studentId) || !uuid(item?.clientRequestId)) throw new SupabaseHealthcareError(400, "Data kunjungan UKS tidak valid.");
  return request("/rest/v1/rpc/create_healthcare_visit", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function createSupabaseHealthcareMedicine(tenantId: string, actorId: string, item: any) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseHealthcareError(400, "Data obat UKS tidak valid.");
  return request("/rest/v1/rpc/create_healthcare_medicine", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function adjustSupabaseHealthcareStock(tenantId: string, actorId: string, item: any) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.medicineId) || !uuid(item?.requestId) || !Number.isInteger(item?.delta) || typeof item?.reason !== "string") throw new SupabaseHealthcareError(400, "Mutasi stok UKS tidak valid.");
  return request("/rest/v1/rpc/adjust_healthcare_stock", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_medicine_id: item.medicineId, p_delta: item.delta, p_reason: item.reason, p_request_id: item.requestId }) });
}

export async function getSupabaseHealthcareLegacyImportContext(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const tenants = await boundedRows("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" }).toString(), 1, "pemetaan tenant legacy");
  const legacyTenantKey = String(tenants[0]?.legacy_tenant_key || "").trim();
  if (!legacyTenantKey) throw new SupabaseHealthcareError(409, "Tenant belum memiliki pemetaan arsip Firebase lama.");
  const [records, visits, medicines, students] = await Promise.all([
    boundedRows("/rest/v1/healthcare_records?" + new URLSearchParams({ select: "student_id,source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, limit: "5001" }).toString(), 5000, "profil medis terimpor"),
    boundedRows("/rest/v1/healthcare_visits?" + new URLSearchParams({ select: "source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, source_system: "eq.legacy_firestore", limit: "5001" }).toString(), 5000, "kunjungan terimpor"),
    boundedRows("/rest/v1/healthcare_medicines?" + new URLSearchParams({ select: "name,source_record_id,source_fingerprint", tenant_id: "eq." + tenantId, limit: "2001" }).toString(), 2000, "inventaris terimpor"),
    boundedRows("/rest/v1/students?" + new URLSearchParams({ select: "id,nis,name,status", tenant_id: "eq." + tenantId, order: "nis.asc", limit: "5001" }).toString(), 5000, "roster migrasi UKS"),
  ]);
  return { tenantId, legacyTenantKey, existingRows: [
    ...records.map((row) => ({ ...row, kind: "record" })),
    ...visits.map((row) => ({ ...row, kind: "visit" })),
    ...medicines.map((row) => ({ ...row, kind: "medicine" })),
  ], students };
}

export async function applySupabaseLegacyHealthcareImport(tenantId: string, actorId: string, fingerprint: string, items: Row[]) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(fingerprint) || !Array.isArray(items) || items.length > 5000) throw new SupabaseHealthcareError(400, "Snapshot migrasi UKS tidak valid.");
  return request("/rest/v1/rpc/import_legacy_healthcare", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: fingerprint, p_items: items }) });
}
