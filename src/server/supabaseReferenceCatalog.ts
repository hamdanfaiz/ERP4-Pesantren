type Row = Record<string, any>;

export const REFERENCE_DOMAINS = [
  "academic_subject",
  "academic_curriculum",
  "academic_assessment_type",
  "academic_grade_level",
  "cbt_question_template",
  "hris_job_title",
  "facility_resource",
  "finance_fee_type",
  "finance_expense_category",
  "marketplace_product_category",
  "cooperative_product_category",
  "cooperative_supplier_category",
  "library_book_category",
  "healthcare_medicine_category",
  "healthcare_medicine_unit",
  "ga_asset_category",
  "ga_inventory_category",
  "ga_inventory_unit",
] as const;
export type ReferenceDomain = typeof REFERENCE_DOMAINS[number];

export class SupabaseReferenceCatalogError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseReferenceCatalogError"; this.status = status; }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseReferenceCatalogError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
  return { baseUrl, key };
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateDomain(value: unknown): ReferenceDomain {
  const domain = String(value || "");
  if (!(REFERENCE_DOMAINS as readonly string[]).includes(domain)) throw new SupabaseReferenceCatalogError(400, "Jenis referensi tidak dikenal.");
  return domain as ReferenceDomain;
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization"); else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    if (["23505", "23503", "23514"].includes(String(body?.code || "")) || response.status === 409) throw new SupabaseReferenceCatalogError(409, "Kode atau nama kategori sudah digunakan, atau relasinya masih dipakai.");
    if (String(body?.code || "") === "42501" || response.status === 403) throw new SupabaseReferenceCatalogError(403, "Perubahan referensi ditolak oleh kebijakan tenant.");
    if (response.status === 404) throw new SupabaseReferenceCatalogError(404, "Referensi tidak ditemukan pada tenant ini.");
    if (response.status === 400 || String(body?.code || "") === "22023") throw new SupabaseReferenceCatalogError(400, body?.message || "Data referensi tidak valid.");
    throw new SupabaseReferenceCatalogError(503, "Katalog referensi Supabase belum dapat diproses.");
  }
  return body;
}

function validateTenant(tenantId: string) {
  if (!uuid(tenantId)) throw new SupabaseReferenceCatalogError(403, "Tenant aktif tidak valid.");
  return tenantId;
}

export async function listSupabaseReferenceItems(tenantIdentifier: string, domainValue: unknown, includeInactive = false) {
  const tenantId = validateTenant(tenantIdentifier);
  const domain = validateDomain(domainValue);
  const params = new URLSearchParams({
    select: "id,tenant_id,domain,code,name,description,status,nis_grade_code,organization_unit_id,created_at,updated_at",
    tenant_id: "eq." + tenantId,
    domain: "eq." + domain,
    order: "status.asc,name.asc,id.asc",
    limit: "1001",
  });
  if (!includeInactive) params.set("status", "eq.active");
  const rows = await request("/rest/v1/tenant_reference_items?" + params.toString());
  if (!Array.isArray(rows) || rows.length > 1000) throw new SupabaseReferenceCatalogError(503, "Katalog referensi melebihi batas aman tampilan.");
  return rows.map((row: Row) => ({
    id: String(row.id), domain: String(row.domain), code: String(row.code), name: String(row.name),
    description: String(row.description || ""), status: String(row.status),
    nisGradeCode: row.nis_grade_code == null ? null : String(row.nis_grade_code),
    organizationUnitId: row.organization_unit_id == null ? null : String(row.organization_unit_id),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }));
}

export async function saveSupabaseReferenceItem(
  tenantIdentifier: string,
  actorId: string,
  domainValue: unknown,
  idValue: unknown,
  inputValue: unknown,
) {
  const tenantId = validateTenant(tenantIdentifier);
  const actor = uuid(actorId) ? actorId : "";
  if (!actor) throw new SupabaseReferenceCatalogError(403, "Akun Admin tidak valid.");
  const domain = validateDomain(domainValue);
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : {};
  const code = String(input.code || "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const status = String(input.status || "active");
  const nisGradeCode = String(input.nisGradeCode || "").trim() || null;
  const unitId = String(input.organizationUnitId || "").trim() || null;
  const id = String(idValue || "").trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(code) || !name || name.length > 180
    || description.length < 8 || description.length > 2000
    || description.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID")
    || !["active", "inactive"].includes(status) || (id && !uuid(id))) {
    throw new SupabaseReferenceCatalogError(400, "Deskripsi wajib menjelaskan nama pilihan dengan arti atau cakupan berbeda (8–2.000 karakter).");
  }
  if (domain === "academic_grade_level") {
    if (status === "active" && !nisGradeCode) throw new SupabaseReferenceCatalogError(400, "Jenjang aktif memerlukan kode NIS dua digit.");
    if (nisGradeCode && !/^\d{2}$/.test(nisGradeCode)) throw new SupabaseReferenceCatalogError(400, "Kode NIS harus tepat dua digit.");
  } else if (nisGradeCode) {
    throw new SupabaseReferenceCatalogError(400, "Kode NIS hanya berlaku untuk referensi jenjang pendidikan.");
  }
  if (unitId) {
    if (!uuid(unitId)) throw new SupabaseReferenceCatalogError(400, "Unit organisasi tidak valid.");
    const unitParams = new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, id: "eq." + unitId, status: "eq.active", limit: "2" });
    const units = await request("/rest/v1/organization_units?" + unitParams.toString());
    if (!Array.isArray(units) || units.length !== 1) throw new SupabaseReferenceCatalogError(400, "Unit aktif tidak ditemukan pada tenant ini.");
  }
  const payload = {
    tenant_id: tenantId, domain, code, name, description, status,
    nis_grade_code: nisGradeCode,
    organization_unit_id: unitId, updated_by_user_id: actor,
    ...(id ? {} : { created_by_user_id: actor }),
  };
  if (id) {
    const existingParams = new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, domain: "eq." + domain, id: "eq." + id, limit: "2" });
    const existing = await request("/rest/v1/tenant_reference_items?" + existingParams.toString());
    if (!Array.isArray(existing) || existing.length !== 1) throw new SupabaseReferenceCatalogError(404, "Referensi tidak ditemukan pada tenant ini.");
    const query = new URLSearchParams({ tenant_id: "eq." + tenantId, domain: "eq." + domain, id: "eq." + id });
    await request("/rest/v1/tenant_reference_items?" + query.toString(), { method: "PATCH", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } });
  } else {
    await request("/rest/v1/tenant_reference_items", { method: "POST", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } });
  }
  const params = new URLSearchParams({ select: "id,tenant_id,domain,code,name,description,status,nis_grade_code,organization_unit_id,created_at,updated_at", tenant_id: "eq." + tenantId, domain: "eq." + domain, [id ? "id" : "code"]: "eq." + (id || code), limit: "2" });
  const rows = await request("/rest/v1/tenant_reference_items?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabaseReferenceCatalogError(503, "Referensi tersimpan tetapi belum dapat dibaca kembali.");
  const row = rows[0];
  return { id: String(row.id), domain: String(row.domain), code: String(row.code), name: String(row.name), description: String(row.description || ""), status: String(row.status), nisGradeCode: row.nis_grade_code == null ? null : String(row.nis_grade_code), organizationUnitId: row.organization_unit_id == null ? null : String(row.organization_unit_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
