import { readPostgrestRowsInPages } from "./postgrestPagination";
import {
  ACADEMIC_PORTAL_PAGE_SIZE,
  buildAcademicPortalAssessmentParams,
  decodeAcademicPortalCursor,
  encodeAcademicPortalCursor,
} from "../lib/academicPortalPagination";

type Row = Record<string, any>;

export class SupabaseAcademicError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseAcademicError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseAcademicError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, key } = config();
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
    if (["23505", "23503", "23514", "23P01"].includes(code) || response.status === 409) throw new SupabaseAcademicError(409, body?.message || "Data akademik bertentangan dengan record tenant.");
    if (code === "P0002" || response.status === 404) throw new SupabaseAcademicError(404, body?.message || "Data akademik tidak ditemukan pada tenant.");
    if (code === "42501" || response.status === 403) throw new SupabaseAcademicError(403, "Operasi akademik ditolak oleh kebijakan tenant.");
    if (code === "22023" || response.status === 400) throw new SupabaseAcademicError(400, body?.message || "Data akademik tidak valid.");
    throw new SupabaseAcademicError(503, "Layanan Akademik Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantId(identifier: string) {
  const value = String(identifier || "").trim();
  if (!value) throw new SupabaseAcademicError(403, "Tenant aktif tidak ditemukan.");
  const find = async (column: "id" | "slug" | "legacy_tenant_key", key: string) => {
    const params = new URLSearchParams({ select: "id,status", [column]: "eq." + key, limit: "2" });
    return request("/rest/v1/tenants?" + params.toString());
  };
  let rows: Row[] = [];
  if (isUuid(value)) {
    const result = await find("id", value);
    if (Array.isArray(result)) rows = result;
  } else {
    const legacy = await find("legacy_tenant_key", value);
    if (Array.isArray(legacy)) rows = legacy;
    if (!rows.length) {
      const slug = await find("slug", value.toLowerCase());
      if (Array.isArray(slug)) rows = slug;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") throw new SupabaseAcademicError(403, "Tenant aktif tidak ditemukan di Supabase.");
  return String(rows[0].id);
}

function mapRecord(row: Row, unitsById: Map<string, Row>) {
  const unitId = String(row.organization_unit_id || "");
  return { ...(row.record_data && typeof row.record_data === "object" && !Array.isArray(row.record_data) ? row.record_data : {}),
    id: String(row.id), kind: String(row.kind), createdAt: row.created_at, updatedAt: row.updated_at,
    organizationUnitId: unitId || null, organizationUnitName: unitId ? String(unitsById.get(unitId)?.name || "Unit tidak tersedia") : null };
}

type AcademicUnitFilter = { mode: "all" | "unit" | "unassigned"; unitId?: string };

async function resolveAcademicUnitFilter(tenantId: string, role: string, actorUnitId: string | undefined, unitsEnabled: boolean, requestedFilter: unknown): Promise<AcademicUnitFilter> {
  if (!unitsEnabled) {
    if (requestedFilter != null && String(requestedFilter).trim()) throw new SupabaseAcademicError(400, "Filter unit belum diaktifkan.");
    return { mode: "all" };
  }
  if (role === "Ustadz") {
    if (!isUuid(String(actorUnitId || ""))) throw new SupabaseAcademicError(403, "Akun Ustadz belum ditetapkan ke unit organisasi aktif.");
    return { mode: "unit", unitId: String(actorUnitId) };
  }
  if (!requestedFilter || String(requestedFilter).trim() === "all") return { mode: "all" };
  const value = String(requestedFilter).trim();
  if (value === "unassigned") return { mode: "unassigned" };
  if (!isUuid(value)) throw new SupabaseAcademicError(400, "Filter unit akademik tidak valid.");
  const params = new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, id: "eq." + value, status: "eq.active", limit: "2" });
  const rows = await request("/rest/v1/organization_units?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabaseAcademicError(403, "Unit aktif tidak ditemukan pada tenant ini.");
  return { mode: "unit", unitId: value };
}

async function tenantRows(tenantId: string, role: string, actorId: string, unitsEnabled: boolean, filter: AcademicUnitFilter) {
  const params = new URLSearchParams({
    select: "id,kind,teacher_user_id,student_id,record_data,created_at,updated_at" + (unitsEnabled ? ",organization_unit_id" : ""),
    tenant_id: "eq." + tenantId,
    deleted_at: "is.null",
    order: "updated_at.desc,id.asc",
    limit: "5001",
  });
  if (role === "Ustadz") params.set("teacher_user_id", "eq." + actorId);
  if (unitsEnabled && filter.mode === "unit") params.set("organization_unit_id", "eq." + filter.unitId);
  if (unitsEnabled && filter.mode === "unassigned") params.set("organization_unit_id", "is.null");
  return readPostgrestRowsInPages<Row>({
    request,
    path: "/rest/v1/academic_records?" + params.toString(),
    maxRows: 5000,
    onIncomplete: () => new SupabaseAcademicError(503, "Data akademik melebihi batas aman tampilan atau hasil pemindaian tidak lengkap."),
  });
}

export async function getSupabaseAcademicSnapshot(
  tenantIdentifier: string,
  actorId: string,
  role: string,
  unitsEnabled = false,
  actorUnitId?: string,
  requestedUnitFilter?: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const filter = await resolveAcademicUnitFilter(tenantId, role, actorUnitId, unitsEnabled, requestedUnitFilter);
  const records = await tenantRows(tenantId, role, actorId, unitsEnabled, filter);
  const studentParams = new URLSearchParams({
    select: "id,name,nis,grade,status,class_id,details" + (unitsEnabled ? ",organization_unit_id" : ""),
    tenant_id: "eq." + tenantId,
    status: "neq.Archived",
    order: "name.asc,id.asc",
    limit: "5001",
  });
  const staffParams = new URLSearchParams({
    select: "user_id,display_name" + (unitsEnabled ? ",organization_unit_id" : ""),
    tenant_id: "eq." + tenantId,
    role: "eq.ustadz",
    status: "eq.active",
    order: "display_name.asc,user_id.asc",
    limit: "501",
  });
  if (unitsEnabled && filter.mode === "unit") {
    studentParams.set("organization_unit_id", "eq." + filter.unitId);
    staffParams.set("organization_unit_id", "eq." + filter.unitId);
  } else if (unitsEnabled && filter.mode === "unassigned") {
    studentParams.set("id", "eq.00000000-0000-4000-8000-000000000000");
    staffParams.set("id", "eq.00000000-0000-4000-8000-000000000000");
  }
  const classParams = new URLSearchParams({
    select: "id,name,status" + (unitsEnabled ? ",organization_unit_id" : ""),
    tenant_id: "eq." + tenantId,
    category: "eq.Kelas",
    order: "name.asc,id.asc",
    limit: "501",
  });
  if (unitsEnabled && filter.mode === "unit") {
    classParams.set("or", "(organization_unit_id.eq." + filter.unitId + ",organization_unit_id.is.null)");
  } else if (unitsEnabled && filter.mode === "unassigned") {
    classParams.set("organization_unit_id", "is.null");
  }
  const [studentRows, staffRows, classRows, unitRows] = await Promise.all([
    readPostgrestRowsInPages<Row>({
      request,
      path: "/rest/v1/students?" + studentParams.toString(),
      maxRows: 5000,
      onIncomplete: () => new SupabaseAcademicError(503, "Roster santri melebihi batas aman tampilan atau hasil pemindaian tidak lengkap."),
    }),
    request("/rest/v1/profiles?" + staffParams.toString()),
    request("/rest/v1/master_data_records?" + classParams.toString()),
    unitsEnabled
      ? (() => {
        const unitParams = new URLSearchParams({ select: "id,name,code,status,unit_type", tenant_id: "eq." + tenantId, order: "name.asc,id.asc", limit: "501" });
        if (role === "Ustadz") unitParams.set("id", "eq." + actorUnitId);
        return request("/rest/v1/organization_units?" + unitParams.toString());
      })()
      : Promise.resolve([]),
  ]);
  if (!Array.isArray(studentRows) || studentRows.length > 5000 || !Array.isArray(staffRows) || staffRows.length > 500 || !Array.isArray(classRows) || classRows.length > 500 || !Array.isArray(unitRows) || unitRows.length > 500) {
    throw new SupabaseAcademicError(503, "Roster akademik, daftar pengajar, atau unit melewati batas aman tampilan.");
  }
  const unitsById = new Map<string, Row>((unitRows as Row[]).map((row) => [String(row.id), row]));
  const classNamesById = new Map<string, string>((classRows as Row[])
    .filter((row) => !["inactive", "nonaktif", "disabled", "arsip"].includes(String(row.status || "").trim().toLowerCase()))
    .map((row): [string, string] => [String(row.id), String(row.name || "")]));
  const visibleClassNames = role === "Ustadz"
    ? new Set(records.filter((row) => row.kind === "schedule").map((row) => String(row.record_data?.className || "")).filter(Boolean))
    : null;
  const students = (studentRows as Row[]).filter((row) => !["archived", "alumni", "graduated", "inactive", "nonaktif", "dikeluarkan"].includes(String(row.status || "").trim().toLowerCase())).filter((row) => {
    if (!visibleClassNames) return true;
    const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
    const className = classNamesById.get(String(row.class_id || "")) || String(details.className || row.grade || "");
    return visibleClassNames.has(className);
  }).map((row) => {
    const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
    const unitId = String(row.organization_unit_id || "");
    return { id: String(row.id), name: String(row.name || ""), nis: String(row.nis || ""), className: classNamesById.get(String(row.class_id || "")) || String(details.className || row.grade || ""),
      organizationUnitId: unitId || null, organizationUnitName: unitId ? String(unitsById.get(unitId)?.name || "Unit tidak tersedia") : null };
  });
  const schedules = records.filter((row) => row.kind === "schedule").map((row) => mapRecord(row, unitsById));
  const journals = records.filter((row) => row.kind === "journal").map((row) => mapRecord(row, unitsById));
  const assessments = records.filter((row) => row.kind === "assessment").map((row) => ({ ...mapRecord(row, unitsById), studentId: String(row.student_id || "") }));
  const teachers = (staffRows as Row[])
    .filter((row) => role !== "Ustadz" || String(row.user_id) === actorId)
    .map((row) => {
      const unitId = String(row.organization_unit_id || "");
      return { id: String(row.user_id), name: String(row.display_name || ""), organizationUnitId: unitId || null,
        organizationUnitName: unitId ? String(unitsById.get(unitId)?.name || "Unit tidak tersedia") : null };
    });
  const classes = (classRows as Row[])
    .filter((row) => !["inactive", "nonaktif", "disabled", "arsip"].includes(String(row.status || "").trim().toLowerCase()))
    .map((row) => ({ id: String(row.id), name: String(row.name || "").trim(), organizationUnitId: String(row.organization_unit_id || "") || null }))
    .filter((row) => row.name && (!visibleClassNames || visibleClassNames.has(row.name)));
  return { schedules, journals, assessments, students, teachers, classes,
    units: (unitRows as Row[]).map((row) => ({ id: String(row.id), name: String(row.name || ""), code: String(row.code || ""), status: String(row.status || ""), unitType: String(row.unit_type || "") })),
    unitsEnabled, unitFilter: filter.mode === "unit" ? filter.unitId : filter.mode };
}

export async function getSupabaseAcademicPortalStudent(tenantIdentifier: string, studentId: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!isUuid(studentId)) throw new SupabaseAcademicError(400, "Tautan data santri tidak valid.");
  const params = new URLSearchParams({
    select: "id,name,nis,grade,status",
    tenant_id: "eq." + tenantId,
    id: "eq." + studentId,
    limit: "2",
  });
  const rows = await request("/rest/v1/students?" + params.toString());
  const student = Array.isArray(rows) && rows.length === 1 ? rows[0] as Row : null;
  if (!student || !["active", "aktif"].includes(String(student.status || "").trim().toLowerCase())) {
    throw new SupabaseAcademicError(403, "Data santri aktif tidak ditemukan pada tenant ini.");
  }
  return {
    id: String(student.id),
    name: String(student.name || "Santri"),
    nis: String(student.nis || ""),
    className: String(student.grade || ""),
  };
}

export function mapSupabaseAcademicPortalAssessment(row: Row) {
  const record = row.record_data && typeof row.record_data === "object" && !Array.isArray(row.record_data) ? row.record_data : {};
  const score = Number(record.score);
  if (!isUuid(String(row.id || "")) || !Number.isFinite(score) || score < 0 || score > 100 || !Number.isFinite(Date.parse(String(row.updated_at || "")))) {
    throw new SupabaseAcademicError(503, "Ada nilai dengan format tidak valid; minta Admin memeriksa data akademik.");
  }
  const text = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
  return {
    id: String(row.id),
    subject: text(record.subject, "Mata pelajaran", 150),
    assessmentType: text(record.assessmentType, "Penilaian", 100),
    category: record.category === "Summative" ? "Sumatif" : record.category === "Formative" ? "Formatif" : "Kategori belum ditetapkan",
    score,
    remedialStatus: record.remedialStatus === "Needed" ? "Perlu tindak lanjut" : record.remedialStatus === "None" ? "Tuntas" : "Status tindak lanjut belum tersedia",
    className: text(record.className, "", 100),
    updatedAt: String(row.updated_at),
  };
}

export async function getSupabaseAcademicPortalPage(
  tenantIdentifier: string,
  studentId: string,
  cursorValue?: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const cursor = decodeAcademicPortalCursor(cursorValue);
  const params = buildAcademicPortalAssessmentParams({ tenantId, studentId, cursor });
  const response = await request("/rest/v1/academic_records?" + params.toString());
  if (!Array.isArray(response)) throw new SupabaseAcademicError(503, "Riwayat nilai belum dapat dibaca.");
  if (response.length > ACADEMIC_PORTAL_PAGE_SIZE + 1) throw new SupabaseAcademicError(503, "Riwayat nilai melebihi batas halaman yang aman.");

  const hasMore = response.length > ACADEMIC_PORTAL_PAGE_SIZE;
  const page = (response as Row[]).slice(0, ACADEMIC_PORTAL_PAGE_SIZE);
  const assessments = page.map(mapSupabaseAcademicPortalAssessment);
  const last = page[page.length - 1];
  return {
    assessments,
    hasMore,
    nextCursor: hasMore && last ? encodeAcademicPortalCursor({ updatedAt: String(last.updated_at), id: String(last.id) }) : null,
  };
}

function text(value: unknown, label: string, max: number, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new SupabaseAcademicError(400, `${label} wajib diisi.`);
  if (result.length > max) throw new SupabaseAcademicError(400, `${label} melebihi batas karakter.`);
  return result;
}

function validDate(value: unknown) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SupabaseAcademicError(400, "Tanggal jurnal tidak valid.");
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new SupabaseAcademicError(400, "Tanggal jurnal tidak valid.");
  return date;
}

export async function saveSupabaseAcademicRecord(
  tenantIdentifier: string,
  actorId: string,
  role: string,
  kindValue: unknown,
  value: unknown,
  unitsEnabled = false,
  actorUnitId?: string,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!isUuid(actorId)) throw new SupabaseAcademicError(403, "Akun Supabase tidak valid.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseAcademicError(400, "Data akademik tidak valid.");
  const item = value as Row;
  const kind = String(kindValue || "");
  if (!(["schedule", "journal", "assessment"] as string[]).includes(kind)) throw new SupabaseAcademicError(400, "Jenis record akademik tidak didukung.");
  const id = item.id == null || item.id === "" ? null : String(item.id).trim();
  const requestId = String(item.clientRequestId || "").trim();
  if ((id && !isUuid(id)) || !isUuid(requestId)) throw new SupabaseAcademicError(400, "ID record atau kunci idempotensi tidak valid.");
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(role)) throw new SupabaseAcademicError(403, "Role ini tidak dapat mengelola data akademik.");

  let record: Row;
  if (kind === "schedule") {
    if (role === "Ustadz") throw new SupabaseAcademicError(403, "Hanya Admin yang dapat mengatur jadwal.");
    const day = text(item.day, "Hari", 20, true);
    if (!["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].includes(day)) throw new SupabaseAcademicError(400, "Hari jadwal tidak valid.");
    const time = text(item.time, "Waktu", 40, true);
    if (!/^([01]\d|2[0-3]):[0-5]\d\s-\s([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new SupabaseAcademicError(400, "Waktu harus memakai format HH:MM - HH:MM.");
    const teacherUserId = text(item.teacherUserId, "Pengajar", 36);
    if (teacherUserId && !isUuid(teacherUserId)) throw new SupabaseAcademicError(400, "ID pengajar tidak valid.");
    record = {
      day, time, subject: text(item.subject, "Mata pelajaran", 150, true),
      teacherName: text(item.teacherName, "Nama pengajar", 180, true),
      teacherUserId: teacherUserId || null,
      className: text(item.className, "Kelas", 100, true),
      room: text(item.room, "Ruang", 100), curriculum: text(item.curriculum, "Kurikulum", 100),
    };
  } else if (kind === "journal") {
    const teacherUserId = role === "Ustadz" ? actorId : text(item.teacherUserId, "Pengajar", 36, true);
    if (!isUuid(teacherUserId)) throw new SupabaseAcademicError(400, "ID pengajar tidak valid.");
    const present = Number(item.attendancePresent ?? 0), absent = Number(item.attendanceAbsent ?? 0), excused = Number(item.attendanceExcused ?? 0);
    if (![present, absent, excused].every((count) => Number.isInteger(count) && count >= 0 && count <= 500)) throw new SupabaseAcademicError(400, "Jumlah kehadiran tidak valid.");
    record = {
      date: validDate(item.date), className: text(item.className, "Kelas", 100, true),
      subject: text(item.subject, "Mata pelajaran", 150, true), topic: text(item.topic, "Materi", 2000, true),
      competency: text(item.competency, "Kompetensi", 4000), teacherUserId,
      teacherName: text(item.teacherName, "Nama pengajar", 180, true),
      attendance: { present, absent, excused }, status: "Completed",
    };
  } else {
    const studentId = text(item.studentId, "Santri", 36, true);
    const teacherUserId = role === "Ustadz" ? actorId : text(item.teacherUserId, "Pengajar", 36, true);
    if (!isUuid(studentId) || !isUuid(teacherUserId)) throw new SupabaseAcademicError(400, "Santri atau pengajar tidak valid.");
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new SupabaseAcademicError(400, "Nilai harus berupa angka 0–100.");
    const category = text(item.category, "Kategori", 20, true);
    if (!["Formative", "Summative"].includes(category)) throw new SupabaseAcademicError(400, "Kategori penilaian tidak valid.");
    record = {
      studentId, studentName: text(item.studentName, "Nama santri", 180, true),
      className: text(item.className, "Kelas", 100), teacherUserId,
      subject: text(item.subject, "Mata pelajaran", 150, true),
      assessmentType: text(item.assessmentType, "Jenis penilaian", 100, true),
      category, score, remedialStatus: score < 75 ? "Needed" : "None",
    };
  }
  if (unitsEnabled) {
    if (role === "Ustadz") {
      if (!isUuid(String(actorUnitId || ""))) throw new SupabaseAcademicError(403, "Akun Ustadz belum ditetapkan ke unit organisasi aktif.");
      if (kind !== "assessment") record.organizationUnitId = actorUnitId;
    } else if (kind === "schedule" || kind === "journal") {
      const unitId = text(item.organizationUnitId, "Unit organisasi", 36, true);
      if (!isUuid(unitId)) throw new SupabaseAcademicError(400, "Unit organisasi akademik tidak valid.");
      record.organizationUnitId = unitId;
    }
    if (kind !== "assessment" || role === "Ustadz") {
      const unitId = role === "Ustadz" ? String(actorUnitId) : String(record.organizationUnitId || "");
      const params = new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, id: "eq." + unitId, status: "eq.active", limit: "2" });
      const units = await request("/rest/v1/organization_units?" + params.toString());
      if (!Array.isArray(units) || units.length !== 1) throw new SupabaseAcademicError(403, "Unit aktif tidak ditemukan pada tenant ini.");
    }
  }
  const result = await request("/rest/v1/rpc/save_academic_record", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_kind: kind,
      p_record_id: id, p_client_request_id: requestId,
      p_record: { ...record, _unitScopeEnabled: unitsEnabled },
    }),
  });
  if (!result?.id) throw new SupabaseAcademicError(503, "Penyimpanan data akademik belum dapat dikonfirmasi.");
  return { id: String(result.id), alreadyApplied: Boolean(result.alreadyApplied) };
}

export { request as academicSupabaseRequest, resolveTenantId as resolveAcademicTenantId };
