import { isAlumniGraduationCandidate } from "../lib/alumniWorkflow";

type Row = Record<string, any>;

export class SupabaseAlumniError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseAlumniError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseAlumniError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, key } = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabaseAlumniError(409, body?.message || "Data Alumni bertentangan dengan data tenant.");
    }
    if (code === "22023" || response.status === 400) {
      throw new SupabaseAlumniError(400, body?.message || "Data Alumni tidak valid.");
    }
    if (code === "P0002" || response.status === 404) {
      throw new SupabaseAlumniError(404, body?.message || "Santri tidak ditemukan pada tenant ini.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabaseAlumniError(403, "Operasi Alumni ditolak oleh kebijakan tenant.");
    }
    throw new SupabaseAlumniError(503, "Layanan Alumni Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantId(identifier: string) {
  const normalized = String(identifier || "").trim();
  if (!normalized) throw new SupabaseAlumniError(403, "Tenant aktif tidak ditemukan.");
  const query = async (column: "id" | "legacy_tenant_key" | "slug", value: string) => {
    const params = new URLSearchParams({ select: "id,status", [column]: "eq." + value, limit: "2" });
    return request("/rest/v1/tenants?" + params.toString());
  };
  let rows: Row[] = [];
  if (isUuid(normalized)) {
    const result = await query("id", normalized);
    if (Array.isArray(result)) rows = result;
  } else {
    const result = await query("legacy_tenant_key", normalized);
    if (Array.isArray(result)) rows = result;
    if (!rows.length) {
      const bySlug = await query("slug", normalized.toLowerCase());
      if (Array.isArray(bySlug)) rows = bySlug;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseAlumniError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

async function listTenantRows(table: string, tenantId: string, select: string, order: string, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({
    select,
    tenant_id: "eq." + tenantId,
    order,
    limit: "5001",
    ...filters,
  });
  const rows = await request(`/rest/v1/${table}?${params.toString()}`);
  if (!Array.isArray(rows) || rows.length > 5000) {
    throw new SupabaseAlumniError(503, "Data Alumni melebihi batas aman tampilan.");
  }
  return rows as Row[];
}

export async function listSupabaseAlumniSnapshot(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const [alumni, currentStudents] = await Promise.all([
    listTenantRows("alumni_profiles", tenantId, "id,student_id,graduation_year,graduated_at,created_at", "graduation_year.desc,graduated_at.desc,id.asc"),
    listTenantRows("students", tenantId, "id,nis,name,grade,status", "name.asc,id.asc", { status: "neq.Archived" }),
  ]);
  const ids = alumni.map((row) => String(row.student_id)).filter(isUuid);
  if (ids.length !== alumni.length) throw new SupabaseAlumniError(503, "Relasi data Alumni tidak valid.");
  const alumniStudents: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 250) {
    const batch = ids.slice(offset, offset + 250);
    const params = new URLSearchParams({
      select: "id,nis,name,grade,status",
      tenant_id: "eq." + tenantId,
      id: "in.(" + batch.join(",") + ")",
      limit: "251",
    });
    const rows = await request("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows) || rows.length !== batch.length) throw new SupabaseAlumniError(503, "Data Alumni tidak lengkap pada tenant.");
    alumniStudents.push(...rows);
  }
  const studentById = new Map(alumniStudents.map((student) => [String(student.id), student]));
  const alumniStudentIds = new Set(ids);
  return {
    alumni: alumni.flatMap((profile) => {
      const student = studentById.get(String(profile.student_id));
      return student ? [{
        id: String(profile.id),
        studentId: String(profile.student_id),
        name: String(student.name || ""),
        nis: String(student.nis || ""),
        grade: String(student.grade || ""),
        graduationYear: Number(profile.graduation_year),
        graduatedAt: String(profile.graduated_at),
      }] : [];
    }),
    eligibleStudents: currentStudents
      .filter((student) => isAlumniGraduationCandidate(
        student.status,
        alumniStudentIds.has(String(student.id)),
      ))
      .map((student) => ({
      id: String(student.id),
      name: String(student.name || ""),
      nis: String(student.nis || ""),
      grade: String(student.grade || ""),
      status: String(student.status || ""),
      })),
  };
}

export async function graduateSupabaseStudent(tenantIdentifier: string, actorId: string, role: string, payloadValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin"].includes(role)) throw new SupabaseAlumniError(403, "Hanya Admin pesantren yang dapat memproses kelulusan.");
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new SupabaseAlumniError(400, "Data kelulusan Alumni tidak valid.");
  }
  const payload = payloadValue as Row;
  const studentId = String(payload.studentId || "").trim();
  const requestId = String(payload.clientRequestId || "").trim();
  const year = Number(payload.graduationYear);
  const graduatedAt = String(payload.graduatedAt || "").trim();
  if (!isUuid(studentId) || !isUuid(requestId) || !Number.isInteger(year) || year < 1900 || year > 2200
    || !/^\d{4}-\d{2}-\d{2}$/.test(graduatedAt)) {
    throw new SupabaseAlumniError(400, "Santri, tahun, tanggal kelulusan, atau ID permintaan tidak valid.");
  }
  const parsed = new Date(graduatedAt + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== graduatedAt || Number(graduatedAt.slice(0, 4)) !== year) {
    throw new SupabaseAlumniError(400, "Tahun dan tanggal kelulusan harus sesuai.");
  }
  const result = await request("/rest/v1/rpc/graduate_tenant_student", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_graduation_year: year,
      p_graduated_at: graduatedAt,
      p_created_by_user_id: actorId,
      p_expected_role: role === "SuperAdmin" ? "super_admin" : "admin",
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseAlumniError(503, "Backend belum mengonfirmasi proses kelulusan.");
  }
  return result as Row;
}
