import { isAlumniGraduationCandidate } from "../lib/alumniWorkflow";
import { readPostgrestRowsInPages } from "./postgrestPagination";

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
  if (!baseUrl || !key) throw new SupabaseAlumniError(503, "Layanan ini belum tersedia saat ini. Silakan hubungi administrator pesantren.");
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
      throw new SupabaseAlumniError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
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
    ...filters,
  });
  return readPostgrestRowsInPages<Row>({
    request,
    path: `/rest/v1/${table}?${params.toString()}`,
    maxRows: 5000,
    onIncomplete: () => new SupabaseAlumniError(503, "Data Alumni melebihi batas aman tampilan atau hasil pemindaian tidak lengkap."),
  });
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

const ALUMNI_EVENT_TYPES = new Set(["reunion", "webinar", "religious", "community", "career", "other"]);
const ALUMNI_EVENT_STATUSES = new Set(["scheduled", "cancelled", "completed"]);

export function normalizeAlumniCommunityEventPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseAlumniError(400, "Data kegiatan Alumni tidak valid.");
  }
  const payload = value as Row;
  const clientRequestId = String(payload.clientRequestId || "").trim();
  const title = String(payload.title || "").trim();
  const eventType = String(payload.eventType || "").trim();
  const startsAt = String(payload.startsAt || "").trim();
  const location = String(payload.location || "").trim();
  const description = String(payload.description || "").trim();
  const parsedDate = new Date(startsAt);
  if (!isUuid(clientRequestId) || title.length < 1 || title.length > 180
    || !ALUMNI_EVENT_TYPES.has(eventType) || !Number.isFinite(parsedDate.getTime())
    || !startsAt.includes("T") || location.length < 1 || location.length > 180 || description.length > 2000) {
    throw new SupabaseAlumniError(400, "Judul, jenis, waktu, lokasi, atau keterangan kegiatan tidak valid.");
  }
  return { clientRequestId, title, eventType, startsAt: parsedDate.toISOString(), location, description };
}

export async function listSupabaseAlumniEvents(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  return listTenantRows(
    "alumni_community_events",
    tenantId,
    "id,title,event_type,starts_at,location,description,status,created_at,updated_at",
    "starts_at.asc,id.asc",
  );
}

export async function createSupabaseAlumniEvent(tenantIdentifier: string, actorId: string, role: string, payloadValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin"].includes(role)) throw new SupabaseAlumniError(403, "Hanya Admin pesantren yang dapat mengelola kegiatan Alumni.");
  const payload = normalizeAlumniCommunityEventPayload(payloadValue);
  const result = await request("/rest/v1/rpc/create_alumni_community_event", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: role === "SuperAdmin" ? "super_admin" : "admin",
      p_client_request_id: payload.clientRequestId,
      p_title: payload.title,
      p_event_type: payload.eventType,
      p_starts_at: payload.startsAt,
      p_location: payload.location,
      p_description: payload.description,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true || !isUuid(String(result.eventId || ""))) {
    throw new SupabaseAlumniError(503, "Backend belum mengonfirmasi penyimpanan kegiatan.");
  }
  return result as Row;
}

export async function updateSupabaseAlumniEventStatus(
  tenantIdentifier: string,
  actorId: string,
  role: string,
  eventIdValue: unknown,
  statusValue: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const eventId = String(eventIdValue || "").trim();
  const status = String(statusValue || "").trim();
  if (!["Admin", "SuperAdmin"].includes(role)) throw new SupabaseAlumniError(403, "Hanya Admin pesantren yang dapat mengelola kegiatan Alumni.");
  if (!isUuid(eventId) || !ALUMNI_EVENT_STATUSES.has(status) || status === "scheduled") {
    throw new SupabaseAlumniError(400, "Status kegiatan tidak valid.");
  }
  const result = await request("/rest/v1/rpc/set_alumni_community_event_status", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_event_id: eventId,
      p_actor_user_id: actorId,
      p_expected_role: role === "SuperAdmin" ? "super_admin" : "admin",
      p_status: status,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseAlumniError(503, "Backend belum mengonfirmasi perubahan status kegiatan.");
  }
  return result as Row;
}

const ALUMNI_TRACER_ACTIVITY_STATUSES = new Set([
  "studying", "employed", "self_employed", "working_and_studying", "seeking_work", "not_working", "other",
]);
const ALUMNI_TRACER_EDUCATION_LEVELS = new Set([
  "not_applicable", "secondary", "diploma", "bachelor", "master", "doctorate", "nonformal", "other",
]);
const ALUMNI_TRACER_EMPLOYMENT_SECTORS = new Set([
  "not_applicable", "education", "government", "healthcare", "business", "industry",
  "agriculture", "technology", "religious", "nonprofit", "other",
]);

export function normalizeAlumniTracerResponsePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseAlumniError(400, "Jawaban Tracer Study tidak valid.");
  }
  const payload = value as Row;
  const clientRequestId = String(payload.clientRequestId || "").trim();
  const alumniProfileId = String(payload.alumniProfileId || "").trim();
  const surveyYear = Number(payload.surveyYear);
  const activityStatus = String(payload.activityStatus || "").trim();
  const educationLevel = String(payload.educationLevel || "").trim();
  const employmentSector = String(payload.employmentSector || "").trim();
  const requiresStudy = ["studying", "working_and_studying"].includes(activityStatus);
  const requiresWork = ["employed", "self_employed", "working_and_studying"].includes(activityStatus);
  if (!isUuid(clientRequestId) || !isUuid(alumniProfileId) || !Number.isInteger(surveyYear) || surveyYear < 2000 || surveyYear > 2200
    || !ALUMNI_TRACER_ACTIVITY_STATUSES.has(activityStatus)
    || !ALUMNI_TRACER_EDUCATION_LEVELS.has(educationLevel)
    || !ALUMNI_TRACER_EMPLOYMENT_SECTORS.has(employmentSector)
    || (requiresStudy ? educationLevel === "not_applicable" : educationLevel !== "not_applicable")
    || (requiresWork ? employmentSector === "not_applicable" : employmentSector !== "not_applicable")
    || payload.consentConfirmed !== true) {
    throw new SupabaseAlumniError(400, "Pilih alumni, tahun survei, status, kategori yang sesuai, dan konfirmasi persetujuan alumni.");
  }
  return { clientRequestId, alumniProfileId, surveyYear, activityStatus, educationLevel, employmentSector };
}

export async function listSupabaseAlumniTracerSnapshot(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const responses = await listTenantRows(
    "alumni_tracer_responses",
    tenantId,
    "id,alumni_profile_id,survey_year,activity_status,education_level,employment_sector,updated_at",
    "survey_year.desc,updated_at.desc,id.asc",
  );
  return {
    responses: responses.map((row) => ({
      id: String(row.id),
      alumniProfileId: String(row.alumni_profile_id),
      surveyYear: Number(row.survey_year),
      activityStatus: String(row.activity_status),
      educationLevel: String(row.education_level),
      employmentSector: String(row.employment_sector),
      updatedAt: String(row.updated_at),
    })),
  };
}

export async function upsertSupabaseAlumniTracerResponse(
  tenantIdentifier: string,
  actorId: string,
  role: string,
  payloadValue: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!["Admin", "SuperAdmin"].includes(role)) {
    throw new SupabaseAlumniError(403, "Hanya Admin pesantren yang dapat mencatat Tracer Study Alumni.");
  }
  const payload = normalizeAlumniTracerResponsePayload(payloadValue);
  const result = await request("/rest/v1/rpc/upsert_alumni_tracer_response", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: role === "SuperAdmin" ? "super_admin" : "admin",
      p_client_request_id: payload.clientRequestId,
      p_alumni_profile_id: payload.alumniProfileId,
      p_survey_year: payload.surveyYear,
      p_activity_status: payload.activityStatus,
      p_education_level: payload.educationLevel,
      p_employment_sector: payload.employmentSector,
      p_consent_confirmed: true,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true || !isUuid(String(result.responseId || ""))) {
    throw new SupabaseAlumniError(503, "Backend belum mengonfirmasi penyimpanan jawaban Tracer Study.");
  }
  return result as Row;
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
