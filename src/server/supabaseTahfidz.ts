import { listGuardianStudentIds } from "./identityStore";
import { createHash } from "node:crypto";
import { isValidTenantTimeZone, tenantDate } from "../lib/tenantTimeZone";
import { buildTahfidzRecordPageParams, encodeTahfidzRecordCursor, TAHFIDZ_RECORD_PAGE_SIZE } from "../lib/tahfidzRecordPagination";
import { normalizeTahfidzRosterCursor, normalizeTahfidzRosterSearch, TAHFIDZ_ROSTER_PAGE_SIZE } from "../lib/tahfidzRosterPagination";
import { buildTahfidzSessionPageParams, encodeTahfidzSessionCursor, TAHFIDZ_SESSION_PAGE_SIZE } from "../lib/tahfidzSessionPagination";

type JsonObject = Record<string, any>;

export class SupabaseTahfidzError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseTahfidzError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabaseTahfidzError(503, "Konfigurasi backend Supabase belum lengkap.");
  }
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  if (config.serviceKey.startsWith("sb_secret_")) {
    headers.delete("Authorization");
  } else {
    headers.set("Authorization", "Bearer " + config.serviceKey);
  }
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabaseTahfidzError(409, body?.message || "Data Tahfidz bertentangan dengan data tenant.");
    }
    if (code === "22023" || response.status === 400) {
      throw new SupabaseTahfidzError(400, body?.message || "Data Tahfidz tidak valid.");
    }
    if (code === "P0002" || response.status === 404) {
      throw new SupabaseTahfidzError(404, body?.message || "Data Tahfidz tidak ditemukan pada tenant ini.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabaseTahfidzError(403, "Operasi Tahfidz ditolak oleh kebijakan tenant.");
    }
    throw new SupabaseTahfidzError(503, "Layanan Supabase Tahfidz belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function legacySupabaseRole(value: string): string {
  const roles: Record<string, string> = {
    Admin: "admin",
    SuperAdmin: "super_admin",
    Ustadz: "ustadz",
  };
  return roles[String(value || "").trim()] || "";
}

async function resolveTenantId(identifier: string) {
  const normalized = String(identifier || "").trim();
  if (!normalized) throw new SupabaseTahfidzError(403, "Tenant aktif tidak ditemukan.");
  const lookup = async (column: "id" | "legacy_tenant_key" | "slug", value: string) => {
    const params = new URLSearchParams({ select: "id,status", [column]: "eq." + value, limit: "2" });
    return supabaseRequest("/rest/v1/tenants?" + params.toString());
  };
  let rows: JsonObject[] = [];
  if (isUuid(normalized)) {
    const result = await lookup("id", normalized);
    if (Array.isArray(result)) rows = result;
  } else {
    const legacyRows = await lookup("legacy_tenant_key", normalized);
    if (Array.isArray(legacyRows)) rows = legacyRows;
    if (rows.length === 0) {
      const slugRows = await lookup("slug", normalized.toLowerCase());
      if (Array.isArray(slugRows)) rows = slugRows;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseTahfidzError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

export async function getSupabaseTahfidzLegacyTenantKey(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const params = new URLSearchParams({ select: "legacy_tenant_key", id: "eq." + tenantId, limit: "2" });
  const rows = await supabaseRequest("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new SupabaseTahfidzError(503, "Pemetaan tenant legacy belum tersedia.");
  }
  const key = String(rows[0]?.legacy_tenant_key || "").trim();
  if (!key) throw new SupabaseTahfidzError(409, "Tenant belum memiliki kunci sumber legacy untuk impor Tahfidz.");
  return key;
}

async function listRows(table: string, tenantId: string, select: string, order: string, extra: Record<string, string> = {}) {
  const rows: JsonObject[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const params = new URLSearchParams({
      select,
      tenant_id: "eq." + tenantId,
      order,
      limit: String(pageSize),
      offset: String(offset),
      ...extra,
    });
    const page = await supabaseRequest("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(page)) throw new SupabaseTahfidzError(503, "Snapshot Tahfidz belum dapat dimuat.");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new SupabaseTahfidzError(503, "Snapshot Tahfidz melebihi batas yang didukung. Gunakan paginasi sebelum melanjutkan.");
}

type TahfidzSnapshotScope = { roster: JsonObject[]; halaqahs: JsonObject[] };

function mapTahfidzRecordRows(rows: JsonObject[], roster: JsonObject[]) {
  const studentById = new Map(roster.map((student) => [String(student.id), student]));
  return rows.map((record) => {
    const student = studentById.get(String(record.student_id || ""));
    return {
      id: String(record.id),
      studentId: String(record.student_id),
      studentName: String(student?.name || "Santri tidak tersedia"),
      nis: String(student?.nis || ""),
      halaqahId: String(record.halaqah_id),
      activityType: String(record.activity_type),
      surah: String(record.surah_name),
      ayahStart: Number(record.ayah_start),
      ayahEnd: Number(record.ayah_end),
      fluency: record.fluency_grade || null,
      tajweed: record.tajweed_grade || null,
      notes: record.notes || "",
      performedAt: String(record.performed_at),
      recordedByName: record.recorded_by_name || "",
    };
  });
}

async function fetchTahfidzRecordPage(
  tenantId: string,
  role: string,
  scope: TahfidzSnapshotScope,
  cursorValue?: unknown
) {
  let params: URLSearchParams | null;
  try {
    params = buildTahfidzRecordPageParams({
      tenantId,
      role,
      halaqahIds: scope.halaqahs.map((halaqah) => String(halaqah.id)),
      studentIds: scope.roster.map((student) => String(student.id)),
      cursor: cursorValue,
    });
  } catch {
    throw new SupabaseTahfidzError(400, "Kursor atau cakupan riwayat Tahfidz tidak valid.");
  }
  if (!params) return { records: [], hasMore: false, nextCursor: null, oldestPerformedAt: null };

  const rows = await supabaseRequest("/rest/v1/tahfidz_records?" + params.toString());
  if (!Array.isArray(rows)) throw new SupabaseTahfidzError(503, "Riwayat Tahfidz belum dapat dimuat.");
  const hasMore = rows.length > TAHFIDZ_RECORD_PAGE_SIZE;
  const pageRows = rows.slice(0, TAHFIDZ_RECORD_PAGE_SIZE);
  const lastRow = pageRows[pageRows.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && lastRow) {
    try {
      nextCursor = encodeTahfidzRecordCursor({
        performedAt: String(lastRow.performed_at || ""),
        id: String(lastRow.id || ""),
      });
    } catch {
      throw new SupabaseTahfidzError(503, "Urutan riwayat Tahfidz tidak konsisten.");
    }
  }
  const knownStudentIds = new Set(scope.roster.map((student) => String(student.id)));
  const missingStudentIds = [...new Set(pageRows.map((row) => String(row.student_id || "")))]
    .filter((studentId) => studentId && !knownStudentIds.has(studentId));
  let recordRoster = scope.roster;
  if (missingStudentIds.length) {
    if (missingStudentIds.some((studentId) => !isUuid(studentId))) {
      throw new SupabaseTahfidzError(503, "Referensi santri pada riwayat Tahfidz tidak valid.");
    }
    const studentParams = new URLSearchParams({
      select: "id,nis,name,status",
      tenant_id: "eq." + tenantId,
      id: "in.(" + missingStudentIds.join(",") + ")",
      status: "neq.Archived",
      limit: String(missingStudentIds.length + 1),
    });
    const students = await supabaseRequest("/rest/v1/students?" + studentParams.toString());
    if (!Array.isArray(students)) throw new SupabaseTahfidzError(503, "Nama santri pada riwayat Tahfidz belum dapat dimuat.");
    const activeStudents = students.filter((student) => String(student.status || "").toLowerCase() !== "archived");
    recordRoster = [...scope.roster, ...activeStudents];
  }

  return {
    records: mapTahfidzRecordRows(pageRows, recordRoster),
    hasMore,
    nextCursor,
    oldestPerformedAt: lastRow ? String(lastRow.performed_at || "") : null,
  };
}

async function getTahfidzBusinessDate(tenantId: string) {
  const tenantRows = await supabaseRequest("/rest/v1/tenants?" + new URLSearchParams({
    select: "time_zone", id: "eq." + tenantId, status: "eq.active", limit: "2",
  }).toString());
  if (!Array.isArray(tenantRows) || tenantRows.length !== 1) {
    throw new SupabaseTahfidzError(503, "Zona waktu tenant belum dapat diverifikasi.");
  }
  const tenantTimeZone = String(tenantRows[0]?.time_zone || "").trim();
  if (!isValidTenantTimeZone(tenantTimeZone)) {
    throw new SupabaseTahfidzError(503, "Zona waktu tenant belum valid. Hubungi SuperAdmin untuk memperbaiki pengaturan.");
  }
  return tenantDate(new Date(), tenantTimeZone);
}

async function requestTahfidzRosterPage(
  tenantId: string,
  actorId: string,
  role: string,
  businessDate: string,
  cursor: string | null,
  search: string | null,
  includeSupport: boolean
) {
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const result = await supabaseRequest("/rest/v1/rpc/list_tahfidz_roster_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: expectedRole,
      p_business_date: businessDate,
      p_after_student_id: cursor,
      p_search: search,
      p_page_size: TAHFIDZ_ROSTER_PAGE_SIZE,
      p_include_support: includeSupport,
    }),
  });
  if (!result || typeof result !== "object" || !Array.isArray(result.roster)) {
    throw new SupabaseTahfidzError(503, "Halaman roster Tahfidz belum dapat dimuat.");
  }
  const roster = result.roster.map((student: JsonObject) => ({
    id: String(student.id || ""),
    nis: String(student.nis || ""),
    name: String(student.name || ""),
    gender: student.gender || null,
    grade: String(student.grade || ""),
    classId: student.classId || null,
    studentStatus: String(student.studentStatus || ""),
    halaqahId: student.halaqahId ? String(student.halaqahId) : null,
    halaqah: String(student.halaqah || ""),
    target: student.target ? {
      periodStart: String(student.target.periodStart || ""),
      periodEnd: student.target.periodEnd ? String(student.target.periodEnd) : null,
      ziyadahPagesPerDay: Number(student.target.ziyadahPagesPerDay || 0),
      murojaahPagesPerDay: Number(student.target.murojaahPagesPerDay || 0),
      policy: String(student.target.policy || "standard"),
    } : null,
  }));
  if (roster.some((student: JsonObject) => !isUuid(student.id))) {
    throw new SupabaseTahfidzError(503, "ID santri pada roster Tahfidz tidak valid.");
  }
  const nextCursor = result.nextCursor == null ? null : String(result.nextCursor);
  if (nextCursor && !isUuid(nextCursor)) throw new SupabaseTahfidzError(503, "Kursor roster Tahfidz tidak valid.");
  const stats = result.stats && typeof result.stats === "object" ? {
    studentCount: Number(result.stats.studentCount || 0),
    studentsWithTarget: Number(result.stats.studentsWithTarget || 0),
    studentsWithoutTarget: Number(result.stats.studentsWithoutTarget || 0),
    studentsWithoutHalaqah: Number(result.stats.studentsWithoutHalaqah || 0),
  } : null;
  let followUps: { count: number; rows: JsonObject[] } | null = null;
  if (includeSupport) {
    const followUpCount = Number(result.followUpCount);
    if (!Array.isArray(result.followUps) || !Number.isSafeInteger(followUpCount) || followUpCount < 0 || result.followUps.length !== Math.min(followUpCount, 6)) {
      throw new SupabaseTahfidzError(503, "Ringkasan tindak lanjut Tahfidz belum tersedia. Terapkan migrasi database terbaru terlebih dahulu.");
    }
    const rows = result.followUps.map((item: JsonObject) => ({
      id: String(item.id || ""),
      nis: String(item.nis || ""),
      name: String(item.name || ""),
      halaqahId: item.halaqahId ? String(item.halaqahId) : null,
      halaqah: String(item.halaqah || ""),
      reasons: Array.isArray(item.reasons) ? item.reasons.filter((reason: unknown) => typeof reason === "string").slice(0, 4) : [],
    }));
    if (rows.some((student: JsonObject) => !isUuid(student.id) || !Array.isArray(student.reasons) || student.reasons.length === 0)) {
      throw new SupabaseTahfidzError(503, "Ringkasan tindak lanjut Tahfidz memiliki data yang tidak valid.");
    }
    followUps = { count: followUpCount, rows };
  }
  const halaqahCounts = result.halaqahCounts && typeof result.halaqahCounts === "object" ? result.halaqahCounts : {};
  return { roster, hasMore: result.hasMore === true, nextCursor, stats, halaqahCounts, followUps };
}

export async function listSupabaseTahfidzRosterPage(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  role: string,
  cursorValue?: unknown,
  searchValue?: unknown
) {
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca roster Tahfidz.");
  }
  let cursor: string | null;
  let search: string | null;
  try {
    cursor = normalizeTahfidzRosterCursor(cursorValue);
    search = normalizeTahfidzRosterSearch(searchValue);
  } catch {
    throw new SupabaseTahfidzError(400, "Kursor atau pencarian roster Tahfidz tidak valid.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const businessDate = await getTahfidzBusinessDate(tenantId);
  return requestTahfidzRosterPage(tenantId, actorId, role, businessDate, cursor, search, false);
}

export async function listSupabaseTahfidzAchievementPage(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  role: string,
  cursorValue?: unknown
) {
  if (!( ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"] as string[]).includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca pencapaian Tahfidz.");
  }
  let cursor: string | null;
  try {
    cursor = normalizeTahfidzRosterCursor(cursorValue);
  } catch {
    throw new SupabaseTahfidzError(400, "Kursor halaman pencapaian Tahfidz tidak valid.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const businessDate = await getTahfidzBusinessDate(tenantId);
  const result = await supabaseRequest("/rest/v1/rpc/list_tahfidz_achievement_page", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: expectedRole,
      p_business_date: businessDate,
      p_after_student_id: cursor,
      p_page_size: 50,
    }),
  });
  if (!result || typeof result !== "object" || !Array.isArray(result.students) || result.students.length > 50) {
    throw new SupabaseTahfidzError(503, "Halaman pencapaian Tahfidz belum dapat dimuat.");
  }
  const students = result.students.map((student: JsonObject) => ({
    id: String(student.id || ""),
    name: String(student.name || ""),
    grade: String(student.grade || ""),
    halaqah: String(student.halaqah || ""),
    metrics: {
      totalRecords: Number(student.totalRecords),
      ziyadahRecords: Number(student.ziyadahRecords),
      murojaahRecords: Number(student.murojaahRecords),
      studyDays: Number(student.studyDays),
    },
  }));
  if (students.some((student) => !isUuid(student.id)
    || Object.values(student.metrics).some((value) => typeof value !== "number"
      || !Number.isSafeInteger(value) || value < 0))) {
    throw new SupabaseTahfidzError(503, "Data pencapaian Tahfidz tidak valid.");
  }
  const hasMore = result.hasMore === true;
  const nextCursor = result.nextCursor == null ? null : String(result.nextCursor);
  if ((hasMore && (!nextCursor || !isUuid(nextCursor))) || (!hasMore && nextCursor)) {
    throw new SupabaseTahfidzError(503, "Kursor pencapaian Tahfidz tidak konsisten.");
  }
  return { students, hasMore, nextCursor };
}

export async function listSupabaseTahfidzSnapshot(tenantIdentifier: string, actorSupabaseUid: string, role: string, includeRecords = true) {
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca data operasional Tahfidz.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const today = await getTahfidzBusinessDate(tenantId);
  const rosterPage = await requestTahfidzRosterPage(tenantId, actorId, role, today, null, null, true);
  const countIds = Object.keys(rosterPage.halaqahCounts).filter(isUuid);
  const halaqahFilters: Record<string, string> = { status: "eq.active" };
  if (role === "Ustadz") halaqahFilters.ustadz_user_id = "eq." + actorId;
  else if (role === "Santri" || role === "Walisantri") {
    if (!countIds.length) {
      // An empty set must not turn into an unscoped query.
      halaqahFilters.id = "eq.00000000-0000-4000-8000-000000000000";
    } else {
      halaqahFilters.id = "in.(" + countIds.join(",") + ")";
    }
  }
  const [halaqahs, ustadzProfiles] = await Promise.all([
    listRows("tahfidz_halaqahs", tenantId, "id,name,ustadz_user_id,ustadz_name,schedule_text,room_text,daily_target_pages,status", "name.asc,id.asc", halaqahFilters),
    ["Admin", "SuperAdmin"].includes(role)
      ? listRows("profiles", tenantId, "user_id,display_name", "display_name.asc,user_id.asc", { role: "eq.ustadz", status: "eq.active" })
      : Promise.resolve([]),
  ]);
  const snapshot: any = {
    halaqahs: halaqahs.map((halaqah) => ({
      id: String(halaqah.id),
      name: String(halaqah.name),
      ustadzUserId: halaqah.ustadz_user_id || null,
      ustadz: String(halaqah.ustadz_name || ""),
      schedule: halaqah.schedule_text || "",
      room: halaqah.room_text || "",
      dailyTargetPages: Number(halaqah.daily_target_pages || 0),
      studentCount: Number(rosterPage.halaqahCounts[String(halaqah.id)] || 0),
    })),
    roster: rosterPage.roster,
    rosterPage: { hasMore: rosterPage.hasMore, nextCursor: rosterPage.nextCursor },
    rosterStats: rosterPage.stats,
    followUps: rosterPage.followUps,
    records: [],
    recordsPage: { hasMore: false, nextCursor: null, oldestPerformedAt: null },
    ustadzOptions: ["Admin", "SuperAdmin"].includes(role)
      ? ustadzProfiles.map((profile) => ({ userId: String(profile.user_id), name: String(profile.display_name || "") }))
      : [],
  };

  if (includeRecords) {
    const recordScope = role === "Santri" || role === "Walisantri"
      ? await resolveTahfidzRecordPageScope(tenantId, actorId, role)
      : { roster: snapshot.roster, halaqahs: snapshot.halaqahs };
    const recordPage = await fetchTahfidzRecordPage(tenantId, role, recordScope);
    snapshot.records = recordPage.records;
    snapshot.recordsPage = {
      hasMore: recordPage.hasMore,
      nextCursor: recordPage.nextCursor,
      oldestPerformedAt: recordPage.oldestPerformedAt,
    };
  }

  return snapshot;
}

async function resolveTahfidzRecordPageScope(tenantId: string, actorId: string, role: string): Promise<TahfidzSnapshotScope> {
  if (role === "Ustadz") {
    const params = new URLSearchParams({
      select: "id",
      tenant_id: "eq." + tenantId,
      ustadz_user_id: "eq." + actorId,
      status: "eq.active",
      order: "id.asc",
      limit: "5001",
    });
    const rows = await supabaseRequest("/rest/v1/tahfidz_halaqahs?" + params.toString());
    if (!Array.isArray(rows) || rows.length > 5000) {
      throw new SupabaseTahfidzError(503, "Cakupan halaqah Ustadz melebihi batas yang didukung.");
    }
    return { roster: [], halaqahs: rows };
  }

  if (role === "Santri") {
    const profileParams = new URLSearchParams({
      select: "linked_santri_id",
      tenant_id: "eq." + tenantId,
      user_id: "eq." + actorId,
      status: "eq.active",
      limit: "2",
    });
    const profiles = await supabaseRequest("/rest/v1/profiles?" + profileParams.toString());
    const linkedId = Array.isArray(profiles) && profiles.length === 1
      ? String(profiles[0]?.linked_santri_id || "").trim()
      : "";
    if (!linkedId || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(linkedId)) {
      throw new SupabaseTahfidzError(403, "Profil belum tertaut ke data santri yang valid.");
    }

    const queryStudent = async (filter: Record<string, string>) => {
      const params = new URLSearchParams({
        select: "id,source_record_id,nis,name,status",
        tenant_id: "eq." + tenantId,
        status: "neq.Archived",
        limit: "2",
        ...filter,
      });
      const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
      if (!Array.isArray(rows)) throw new SupabaseTahfidzError(503, "Tautan santri pada profil belum dapat diverifikasi.");
      return rows;
    };
    const [byId, bySourceId] = await Promise.all([
      isUuid(linkedId) ? queryStudent({ id: "eq." + linkedId }) : Promise.resolve([]),
      queryStudent({ source_record_id: "eq." + linkedId }),
    ]);
    const matches = new Map<string, JsonObject>();
    for (const student of [...byId, ...bySourceId]) {
      if (String(student.status || "").toLowerCase() !== "archived") matches.set(String(student.id), student);
    }
    if (matches.size !== 1) throw new SupabaseTahfidzError(403, "Tautan santri pada profil tidak valid atau belum unik.");
    return { roster: [...matches.values()], halaqahs: [] };
  }

  if (role === "Walisantri") {
    let linkedIds: string[];
    try {
      linkedIds = await listGuardianStudentIds(tenantId, actorId);
    } catch {
      throw new SupabaseTahfidzError(403, "Akun Wali belum memiliki tautan santri aktif yang valid.");
    }
    if (!linkedIds.length || linkedIds.length > 5000 || linkedIds.some((id) => !isUuid(String(id)))) {
      throw new SupabaseTahfidzError(403, "Akun Wali belum memiliki tautan santri aktif yang valid.");
    }
    const params = new URLSearchParams({
      select: "id,source_record_id,nis,name,status",
      tenant_id: "eq." + tenantId,
      id: "in.(" + [...new Set(linkedIds)].join(",") + ")",
      status: "neq.Archived",
      limit: String(linkedIds.length + 1),
    });
    const students = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(students)) throw new SupabaseTahfidzError(503, "Tautan santri Wali belum dapat diverifikasi.");
    const activeStudents = students.filter((student) => String(student.status || "").toLowerCase() !== "archived");
    if (!activeStudents.length) throw new SupabaseTahfidzError(403, "Akun Wali belum tertaut ke santri aktif.");
    return { roster: activeStudents, halaqahs: [] };
  }

  return { roster: [], halaqahs: [] };
}

export async function listSupabaseTahfidzRecordPage(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  role: string,
  cursorValue?: unknown
) {
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca riwayat Tahfidz.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const scope = await resolveTahfidzRecordPageScope(tenantId, actorId, role);
  return fetchTahfidzRecordPage(tenantId, role, scope, cursorValue);
}

export async function listSupabaseTahfidzSessions(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  role: string,
  kind: "talaqqi" | "exam",
  cursorValue?: unknown
) {
  if (!(["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"] as string[]).includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca sesi Tahfidz.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role) || ({ Santri: "santri", Walisantri: "wali_santri" } as Record<string, string>)[role] || "";
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const scope = await resolveTahfidzRecordPageScope(tenantId, actorId, role);
  let sessionParams: URLSearchParams | null;
  try {
    sessionParams = buildTahfidzSessionPageParams({
      tenantId,
      kind,
      role,
      halaqahIds: scope.halaqahs.map((item) => String(item.id)),
      studentIds: scope.roster.map((item) => String(item.id)),
      cursor: cursorValue,
    });
  } catch {
    throw new SupabaseTahfidzError(400, "Kursor atau cakupan halaman sesi Tahfidz tidak valid.");
  }
  if (!sessionParams) return {
    sessions: [], hasMore: false, nextCursor: null,
    canManage: ["Admin", "SuperAdmin", "Ustadz"].includes(role), actorUserId: actorId,
  };
  const [snapshot, rows] = await Promise.all([
    listSupabaseTahfidzSnapshot(tenantIdentifier, actorSupabaseUid, role, false),
    supabaseRequest("/rest/v1/tahfidz_sessions?" + sessionParams.toString()),
  ]);
  if (!Array.isArray(rows)) throw new SupabaseTahfidzError(503, "Halaman sesi Tahfidz belum dapat dimuat.");
  const hasMore = rows.length > TAHFIDZ_SESSION_PAGE_SIZE;
  const pageRows = rows.slice(0, TAHFIDZ_SESSION_PAGE_SIZE);
  const lastRow = pageRows[pageRows.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && lastRow) {
    try {
      nextCursor = encodeTahfidzSessionCursor({ scheduledAt: String(lastRow.scheduled_at || ""), id: String(lastRow.id || "") });
    } catch {
      throw new SupabaseTahfidzError(503, "Urutan sesi Tahfidz tidak konsisten.");
    }
  }
  const sessionRoster = role === "Santri" || role === "Walisantri" ? scope.roster : snapshot.roster;
  const visibleStudentIds = new Set(sessionRoster.map((item: JsonObject) => String(item.id)));
  const visibleHalaqahs = new Map<string, JsonObject>(snapshot.halaqahs.map((item: JsonObject) => [String(item.id), item]));
  const visibleRoster = new Map<string, JsonObject>([...snapshot.roster, ...sessionRoster].map((item: JsonObject) => [String(item.id), item]));
  const missingStudentIds = [...new Set(pageRows.map((row) => String(row.student_id || "")))]
    .filter((studentId) => studentId && !visibleRoster.has(studentId));
  if (missingStudentIds.some((studentId) => !isUuid(studentId))) {
    throw new SupabaseTahfidzError(503, "Referensi santri pada jadwal Tahfidz tidak valid.");
  }
  if (missingStudentIds.length) {
    const studentParams = new URLSearchParams({
      select: "id,nis,name,status",
      tenant_id: "eq." + tenantId,
      id: "in.(" + missingStudentIds.join(",") + ")",
      limit: String(missingStudentIds.length + 1),
    });
    const students = await supabaseRequest("/rest/v1/students?" + studentParams.toString());
    if (!Array.isArray(students) || students.length > missingStudentIds.length) {
      throw new SupabaseTahfidzError(503, "Identitas santri pada sesi Tahfidz belum dapat diverifikasi.");
    }
    for (const student of students) visibleRoster.set(String(student.id), student);
  }
  const sessions = pageRows.filter((row) => {
    if (role === "Ustadz") return visibleHalaqahs.has(String(row.halaqah_id));
    if (role === "Santri" || role === "Walisantri") return visibleStudentIds.has(String(row.student_id));
    return true;
  }).map((row) => {
    const student = visibleRoster.get(String(row.student_id));
    const halaqah = visibleHalaqahs.get(String(row.halaqah_id));
    return {
      id: String(row.id),
      kind: String(row.kind),
      studentId: String(row.student_id),
      studentName: student ? String(student.name || "") : role === "Ustadz" ? "Santri di halaqah" : "Santri",
      nis: student ? String(student.nis || "") : "",
      halaqahId: String(row.halaqah_id),
      halaqahName: halaqah ? String(halaqah.name || "") : "Halaqah",
      teacherUserId: String(row.teacher_user_id),
      teacherName: halaqah ? String(halaqah.ustadz || "") : "Pengampu",
      examType: row.exam_type || null,
      juzStart: row.juz_start == null ? null : Number(row.juz_start),
      juzEnd: row.juz_end == null ? null : Number(row.juz_end),
      scheduledAt: String(row.scheduled_at),
      durationMinutes: Number(row.duration_minutes),
      focus: String(row.focus || ""),
      status: String(row.status),
      score: row.score == null ? null : Number(row.score),
      outcome: row.outcome || null,
      notes: String(row.notes || ""),
      completedAt: row.completed_at || null,
    };
  });
  return { sessions, hasMore, nextCursor, canManage: ["Admin", "SuperAdmin", "Ustadz"].includes(role), actorUserId: actorId };
}

export async function mutateSupabaseTahfidzSession(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  role: string,
  value: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(role);
  if (!expectedRole) throw new SupabaseTahfidzError(403, "Role ini tidak dapat mengubah jadwal Tahfidz.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseTahfidzError(400, "Data sesi Tahfidz tidak valid.");
  const item = value as JsonObject;
  const requestId = String(item.clientRequestId || "").trim();
  const sessionId = item.sessionId == null || item.sessionId === "" ? null : String(item.sessionId).trim();
  const kind = String(item.kind || "").trim();
  const status = String(item.status || "scheduled").trim();
  if (!isUuid(requestId) || (sessionId && !isUuid(sessionId)) || !["talaqqi", "exam"].includes(kind)) {
    throw new SupabaseTahfidzError(400, "Kunci permintaan, sesi, atau jenis kegiatan tidak valid.");
  }
  const score = item.score == null || item.score === "" ? null : Number(item.score);
  const outcome = item.outcome == null || item.outcome === "" ? null : String(item.outcome);
  const notes = boundedText(item.notes, 2000, "Catatan");
  let payload: JsonObject;
  if (sessionId) {
    if (!["completed", "cancelled"].includes(status)) throw new SupabaseTahfidzError(400, "Status akhir sesi tidak valid.");
    if (kind === "exam" && status === "completed" && (!Number.isFinite(score) || score! < 0 || score! > 100 || !["pass", "retest"].includes(String(outcome)))) {
      throw new SupabaseTahfidzError(400, "Nilai 0–100 dan keputusan lulus/ulang wajib diisi.");
    }
    if ((kind !== "exam" || status === "cancelled") && (score !== null || outcome !== null)) {
      throw new SupabaseTahfidzError(400, "Nilai hanya dapat disimpan saat ujian diselesaikan.");
    }
    payload = {
      p_session_id: sessionId, p_kind: kind, p_status: status,
      p_score: score, p_outcome: outcome, p_notes: notes || null,
    };
  } else {
    if (status !== "scheduled") throw new SupabaseTahfidzError(400, "Sesi baru harus berstatus terjadwal.");
    const studentId = String(item.studentId || "").trim();
    const halaqahId = String(item.halaqahId || "").trim();
    const teacherUserId = String(item.teacherUserId || "").trim();
    const scheduledRaw = typeof item.scheduledAt === "string" ? item.scheduledAt.trim() : "";
    const durationMinutes = Number(item.durationMinutes);
    const focus = boundedText(item.focus, 500, "Fokus kegiatan", true);
    if (!isUuid(studentId) || !isUuid(halaqahId) || !isUuid(teacherUserId)
      || !scheduledRaw || !Number.isFinite(Date.parse(scheduledRaw))
      || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
      throw new SupabaseTahfidzError(400, "Santri, halaqah, pengampu, waktu, atau durasi jadwal tidak valid.");
    }
    const scheduledAt = new Date(scheduledRaw).toISOString();
    let examType: string | null = null;
    let juzStart: number | null = null;
    let juzEnd: number | null = null;
    if (kind === "exam") {
      examType = String(item.examType || "").trim();
      juzStart = Number(item.juzStart);
      juzEnd = Number(item.juzEnd);
      if (!["munaqasyah", "tasmi"].includes(examType) || !Number.isInteger(juzStart) || !Number.isInteger(juzEnd)
        || juzStart < 1 || juzEnd < juzStart || juzEnd > 30) {
        throw new SupabaseTahfidzError(400, "Jenis ujian dan rentang juz 1–30 tidak valid.");
      }
    }
    payload = {
      p_session_id: null, p_kind: kind, p_status: "scheduled", p_student_id: studentId,
      p_halaqah_id: halaqahId, p_teacher_user_id: teacherUserId, p_exam_type: examType,
      p_juz_start: juzStart, p_juz_end: juzEnd, p_scheduled_at: scheduledAt,
      p_duration_minutes: durationMinutes, p_focus: focus, p_score: null, p_outcome: null, p_notes: null,
    };
  }
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const result = await supabaseRequest("/rest/v1/rpc/mutate_tenant_tahfidz_session", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: expectedRole,
      p_session_id: payload.p_session_id,
      p_kind: payload.p_kind,
      p_student_id: payload.p_student_id || null,
      p_halaqah_id: payload.p_halaqah_id || null,
      p_teacher_user_id: payload.p_teacher_user_id || null,
      p_exam_type: payload.p_exam_type || null,
      p_juz_start: payload.p_juz_start ?? null,
      p_juz_end: payload.p_juz_end ?? null,
      p_scheduled_at: payload.p_scheduled_at || null,
      p_duration_minutes: payload.p_duration_minutes ?? null,
      p_focus: payload.p_focus || null,
      p_status: payload.p_status,
      p_score: payload.p_score ?? null,
      p_outcome: payload.p_outcome || null,
      p_notes: payload.p_notes || null,
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi perubahan sesi Tahfidz.");
  }
  return result as JsonObject;
}

function boundedText(value: unknown, max: number, label: string, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > max) throw new SupabaseTahfidzError(400, label + " tidak valid.");
  return text;
}

function validGrade(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const grade = String(value).trim();
  if (!["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "N/A"].includes(grade)) {
    throw new SupabaseTahfidzError(400, label + " tidak valid.");
  }
  return grade;
}

function parseAyahRange(value: unknown): { start: number; end: number } {
  const text = typeof value === "string" ? value.trim() : "";
  const match = text.match(/^([1-9]\d{0,2})(?:\s*-\s*([1-9]\d{0,2}))?$/);
  if (!match) throw new SupabaseTahfidzError(400, "Rentang ayat tidak valid.");
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (end < start || end > 286) throw new SupabaseTahfidzError(400, "Rentang ayat tidak valid.");
  return { start, end };
}

export async function recordSupabaseTahfidzSetoran(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  legacyRole: string,
  recordedByName: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(legacyRole);
  if (!expectedRole) throw new SupabaseTahfidzError(403, "Role ini tidak dapat mencatat setoran Tahfidz.");
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new SupabaseTahfidzError(400, "Data setoran tidak valid.");
  }
  const payload = payloadValue as JsonObject;
  const studentId = String(payload.studentId || "").trim();
  const halaqahId = String(payload.halaqahId || "").trim();
  if (!isUuid(studentId) || !isUuid(halaqahId)) throw new SupabaseTahfidzError(400, "Santri dan halaqah wajib dipilih.");
  const activityType = String(payload.activityType || "").trim();
  if (!["Ziyadah", "Muroja'ah", "Tasmi'", "Tasmik"].includes(activityType)) {
    throw new SupabaseTahfidzError(400, "Jenis setoran tidak valid.");
  }
  const surahName = boundedText(payload.surahName, 100, "Nama surah", true);
  const { start, end } = parseAyahRange(payload.ayahRange);
  const fluencyGrade = validGrade(payload.fluencyGrade, "Nilai kelancaran");
  const tajweedGrade = validGrade(payload.tajweedGrade, "Nilai tajwid");
  const notes = boundedText(payload.notes, 2000, "Catatan");
  const requestId = String(payload.clientRequestId || "").trim();
  if (!isUuid(requestId)) throw new SupabaseTahfidzError(400, "Kunci permintaan setoran tidak valid.");
  const performedAtRaw = typeof payload.performedAt === "string" ? payload.performedAt : "";
  const performedAt = performedAtRaw && Number.isFinite(Date.parse(performedAtRaw))
    ? new Date(performedAtRaw).toISOString()
    : "";
  if (!performedAt) throw new SupabaseTahfidzError(400, "Waktu setoran tidak valid.");

  const supabaseUserId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);

  const result = await supabaseRequest("/rest/v1/rpc/record_tahfidz_setoran", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_halaqah_id: halaqahId,
      p_activity_type: activityType,
      p_surah_name: surahName,
      p_ayah_start: start,
      p_ayah_end: end,
      p_fluency_grade: fluencyGrade,
      p_tajweed_grade: tajweedGrade,
      p_notes: notes || null,
      p_performed_at: performedAt,
      p_recorded_by_user_id: supabaseUserId,
      p_recorded_by_name: boundedText(recordedByName, 180, "Nama pencatat"),
      p_expected_role: expectedRole,
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi pencatatan setoran.");
  }
  return result as JsonObject;
}


type LegacyTahfidzSourceRow = { id: string; record: JsonObject };
type LegacyTahfidzIssue = { id: string; category: string; message: string };

function legacyTahfidzText(value: unknown, maxLength: number) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, maxLength + 1);
}

function normalizeTahfidzLabel(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function legacyTahfidzStatus(value: unknown): "active" | "inactive" | "archived" {
  const status = normalizeTahfidzLabel(value);
  if (["archived", "archive", "arsip", "diarsipkan"].includes(status)) return "archived";
  if (["inactive", "nonaktif", "tidak aktif"].includes(status)) return "inactive";
  return "active";
}

function legacyTahfidzDate(value: unknown): string | null {
  let candidate: any = value;
  if (candidate && typeof candidate.toDate === "function") candidate = candidate.toDate();
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function legacyTahfidzValue(record: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Preview or atomically import a bounded tenant's legacy Tahfidz halaqah and
 * current student assignment snapshot. Source IDs remain attached for retries.
 */
export async function migrateSupabaseTahfidzConfiguration(
  tenantIdentifier: string,
  halaqahSource: LegacyTahfidzSourceRow[],
  studentSource: LegacyTahfidzSourceRow[],
  apply: boolean,
  expectedPreviewFingerprint?: string
) {
  if (!Array.isArray(halaqahSource) || halaqahSource.length > 2000
    || !Array.isArray(studentSource) || studentSource.length > 5000) {
    throw new SupabaseTahfidzError(400, "Snapshot Tahfidz harus maksimal 2.000 halaqah dan 5.000 santri.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const [existingHalaqahs, students, existingMemberships] = await Promise.all([
    listRows("tahfidz_halaqahs", tenantId, "id,source_system,source_record_id,name,ustadz_name,schedule_text,room_text,daily_target_pages,status", "name.asc,id.asc"),
    listRows("students", tenantId, "id,source_system,source_record_id,nis,name,status", "name.asc,id.asc"),
    listRows("tahfidz_memberships", tenantId, "id,source_system,source_record_id,halaqah_id,student_id,starts_on,ends_on,status", "starts_on.asc,id.asc"),
  ]);

  const errors: LegacyTahfidzIssue[] = [];
  const warnings: LegacyTahfidzIssue[] = [];
  const pushIssue = (list: LegacyTahfidzIssue[], id: string, category: string, message: string) => {
    if (list.length < 200) list.push({ id, category, message });
  };
  const plannedHalaqahs: JsonObject[] = [];
  const halaqahBySourceId = new Map<string, JsonObject>();
  const halaqahsByName = new Map<string, JsonObject[]>();
  const existingHalaqahBySource = new Map<string, JsonObject>();
  const existingActiveHalaqahByName = new Map<string, JsonObject>();
  for (const row of existingHalaqahs) {
    if (row.source_system === "legacy_import" && typeof row.source_record_id === "string") {
      existingHalaqahBySource.set(row.source_record_id, row);
    }
    if (row.status === "active") existingActiveHalaqahByName.set(normalizeTahfidzLabel(row.name), row);
  }

  for (const item of halaqahSource) {
    const sourceId = typeof item?.id === "string" ? item.id.trim() : "";
    const record = item?.record && typeof item.record === "object" && !Array.isArray(item.record) ? item.record : null;
    if (!sourceId || sourceId.length > 1500 || !record) {
      pushIssue(errors, sourceId, "Halaqah", "ID sumber atau isi record halaqah tidak valid.");
      continue;
    }
    const name = legacyTahfidzText(legacyTahfidzValue(record, ["name", "nama"]), 120);
    if (!name || name.length > 120) {
      pushIssue(errors, sourceId, "Halaqah", "Nama halaqah wajib diisi dan maksimal 120 karakter.");
      continue;
    }
    const rawTeacher = legacyTahfidzValue(record, ["ustadzName", "ustadz", "teacherName", "pengampu"]);
    let ustadzName = legacyTahfidzText(rawTeacher, 180);
    if (!ustadzName) {
      ustadzName = "Belum ditentukan";
      pushIssue(warnings, sourceId, "Halaqah", "Nama ustadz kosong; diimpor sebagai 'Belum ditentukan' untuk rekonsiliasi.");
    }
    if (ustadzName.length > 180) {
      pushIssue(errors, sourceId, "Halaqah", "Nama ustadz melebihi 180 karakter.");
      continue;
    }
    const scheduleText = legacyTahfidzText(legacyTahfidzValue(record, ["scheduleText", "schedule", "jadwal"]), 500);
    const roomText = legacyTahfidzText(legacyTahfidzValue(record, ["roomText", "room", "ruangan"]), 180);
    if (scheduleText.length > 500 || roomText.length > 180) {
      pushIssue(errors, sourceId, "Halaqah", "Jadwal atau lokasi melebihi batas panjang yang didukung.");
      continue;
    }
    let dailyTargetPages = Number(legacyTahfidzValue(record, ["dailyTargetPages", "targetPages"]));
    if (!Number.isFinite(dailyTargetPages)) {
      const targetText = legacyTahfidzText(legacyTahfidzValue(record, ["target", "targetHarian"]), 500);
      const match = targetText.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:halaman|page)/i);
      dailyTargetPages = match ? Number(match[1].replace(",", ".")) : 1;
      if (!match) pushIssue(warnings, sourceId, "Halaqah", "Target harian tidak terstruktur; nilai 1 halaman dipakai sementara.");
    }
    if (dailyTargetPages < 0 || dailyTargetPages > 100 || Math.round(dailyTargetPages * 100) !== dailyTargetPages * 100) {
      pushIssue(errors, sourceId, "Halaqah", "Target harian harus berada pada rentang 0 sampai 100 halaman.");
      continue;
    }
    const status = legacyTahfidzStatus(record.status);
    const normalizedName = normalizeTahfidzLabel(name);
    const normalized = {
      sourceRecordId: sourceId,
      name,
      ustadzName,
      scheduleText: scheduleText || null,
      roomText: roomText || null,
      dailyTargetPages,
      status,
    };
    plannedHalaqahs.push(normalized);
    halaqahBySourceId.set(sourceId, normalized);
    halaqahsByName.set(normalizedName, [...(halaqahsByName.get(normalizedName) || []), normalized]);

    const existingBySource = existingHalaqahBySource.get(sourceId);
    if (existingBySource) {
      const same = String(existingBySource.name || "") === name
        && String(existingBySource.ustadz_name || "") === ustadzName
        && (existingBySource.schedule_text || null) === normalized.scheduleText
        && (existingBySource.room_text || null) === normalized.roomText
        && Number(existingBySource.daily_target_pages) === dailyTargetPages
        && String(existingBySource.status || "") === status;
      if (!same) pushIssue(errors, sourceId, "Halaqah", "Data sumber berbeda dari hasil impor sebelumnya; perlu rekonsiliasi manual.");
    } else if (status === "active") {
      const conflicting = existingActiveHalaqahByName.get(normalizedName);
      if (conflicting) pushIssue(errors, sourceId, "Halaqah", "Nama halaqah aktif sudah dipakai record Supabase lain.");
    }
  }
  for (const [name, matches] of halaqahsByName) {
    if (matches.length > 1 && matches.some((row) => row.status === "active")) {
      for (const match of matches) pushIssue(errors, String(match.sourceRecordId), "Halaqah", "Nama halaqah aktif duplikat pada data sumber.");
    }
  }

  const studentsBySource = new Map<string, JsonObject[]>();
  const studentsByNis = new Map<string, JsonObject[]>();
  for (const student of students) {
    const sourceId = typeof student.source_record_id === "string" ? student.source_record_id.trim() : "";
    if (sourceId) studentsBySource.set(sourceId, [...(studentsBySource.get(sourceId) || []), student]);
    const nis = normalizeTahfidzLabel(student.nis);
    if (nis) studentsByNis.set(nis, [...(studentsByNis.get(nis) || []), student]);
  }
  const membershipBySource = new Map<string, JsonObject>();
  const activeMembershipByStudent = new Map<string, JsonObject>();
  for (const membership of existingMemberships) {
    if (membership.source_system === "legacy_import" && typeof membership.source_record_id === "string") {
      membershipBySource.set(membership.source_record_id, membership);
    }
    if (membership.status === "active") activeMembershipByStudent.set(String(membership.student_id), membership);
  }

  const plannedMemberships: JsonObject[] = [];
  const assignedCanonicalStudents = new Set<string>();
  let unassignedStudents = 0;
  for (const item of studentSource) {
    const sourceId = typeof item?.id === "string" ? item.id.trim() : "";
    const record = item?.record && typeof item.record === "object" && !Array.isArray(item.record) ? item.record : null;
    if (!sourceId || sourceId.length > 1500 || !record) {
      pushIssue(errors, sourceId, "Keanggotaan", "ID sumber atau isi record santri tidak valid.");
      continue;
    }
    const assigned = legacyTahfidzValue(record, ["halaqahId", "halaqah", "halaqahName"]);
    const assignedName = typeof assigned === "object" && assigned
      ? legacyTahfidzText((assigned as JsonObject).name, 120)
      : legacyTahfidzText(assigned, 120);
    if (!assignedName || ["-", "n/a", "tidak ada", "belum ada"].includes(normalizeTahfidzLabel(assignedName))) {
      unassignedStudents += 1;
      continue;
    }
    const halaqahKey = normalizeTahfidzLabel(assignedName);
    const halaqahCandidates = halaqahBySourceId.has(assignedName)
      ? [halaqahBySourceId.get(assignedName)!]
      : (halaqahsByName.get(halaqahKey) || []);
    if (halaqahCandidates.length !== 1) {
      pushIssue(errors, sourceId, "Keanggotaan", halaqahCandidates.length
        ? "Nama halaqah pada santri ambigu pada snapshot sumber."
        : "Halaqah yang disebut santri tidak ditemukan pada snapshot tenant.");
      continue;
    }
    const halaqah = halaqahCandidates[0];
    if (halaqah.status !== "active") {
      pushIssue(warnings, sourceId, "Keanggotaan", "Santri terkait halaqah nonaktif/arsip; keanggotaan tidak diimpor.");
      continue;
    }
    const rawNis = legacyTahfidzValue(record, ["nis", "id"]);
    const nis = normalizeTahfidzLabel(rawNis);
    const exactSourceMatches = studentsBySource.get(sourceId) || [];
    const nisMatches = nis ? (studentsByNis.get(nis) || []) : [];
    const matches = exactSourceMatches.length ? exactSourceMatches : nisMatches;
    if (matches.length !== 1) {
      pushIssue(errors, sourceId, "Keanggotaan", matches.length
        ? "NIS memiliki lebih dari satu record Supabase; perlu dipetakan manual."
        : "Santri legacy belum ditemukan di Master Data Supabase. Impor dan rekonsiliasi santri lebih dahulu.");
      continue;
    }
    const student = matches[0];
    if (["archived", "inactive", "nonaktif", "tidak aktif"].includes(normalizeTahfidzLabel(student.status))) {
      pushIssue(warnings, sourceId, "Keanggotaan", "Santri Supabase tidak aktif/arsip; keanggotaan tidak diimpor.");
      continue;
    }
    const studentId = String(student.id || "");
    if (!isUuid(studentId)) {
      pushIssue(errors, sourceId, "Keanggotaan", "ID santri Supabase tidak valid.");
      continue;
    }
    if (assignedCanonicalStudents.has(studentId)) {
      pushIssue(errors, sourceId, "Keanggotaan", "Lebih dari satu record legacy dipetakan ke santri Supabase yang sama.");
      continue;
    }
    assignedCanonicalStudents.add(studentId);
    const startsOn = legacyTahfidzDate(legacyTahfidzValue(record, ["halaqahStartDate", "halaqahStartedAt", "joinedHalaqahAt", "tahfidzStartDate"]))
      || new Date().toISOString().slice(0, 10);
    if (!legacyTahfidzDate(legacyTahfidzValue(record, ["halaqahStartDate", "halaqahStartedAt", "joinedHalaqahAt", "tahfidzStartDate"]))) {
      pushIssue(warnings, sourceId, "Keanggotaan", "Tanggal mulai tidak tersedia; tanggal impor dipakai sebagai tanggal mulai.");
    }
    const planned = {
      sourceRecordId: sourceId,
      halaqahSourceRecordId: String(halaqah.sourceRecordId),
      studentId,
      startsOn,
    };
    plannedMemberships.push(planned);
    const existingBySource = membershipBySource.get(sourceId);
    if (existingBySource) {
      const existingHalaqahId = String(existingHalaqahBySource.get(String(halaqah.sourceRecordId))?.id || "");
      if (String(existingBySource.student_id) !== studentId
        || !existingHalaqahId || String(existingBySource.halaqah_id) !== existingHalaqahId
        || String(existingBySource.starts_on) !== startsOn
        || existingBySource.status !== "active"
        || existingBySource.ends_on) {
        pushIssue(errors, sourceId, "Keanggotaan", "Relasi sumber berbeda dari hasil impor sebelumnya; perlu rekonsiliasi manual.");
      }
    } else {
      const existingForStudent = activeMembershipByStudent.get(studentId);
      if (existingForStudent) {
        pushIssue(errors, sourceId, "Keanggotaan", "Santri sudah memiliki keanggotaan aktif di Supabase; perlu rekonsiliasi manual.");
      }
    }
  }

  const previewFingerprint = createHash("sha256")
    .update(JSON.stringify({
      tenantId,
      sourceCount: { halaqahs: halaqahSource.length, students: studentSource.length },
      plannedHalaqahs,
      plannedMemberships,
      unassignedStudents,
      errors,
      warnings,
    }))
    .digest("hex");
  if (apply && (!expectedPreviewFingerprint || !/^[a-f0-9]{64}$/i.test(expectedPreviewFingerprint))) {
    throw new SupabaseTahfidzError(400, "Token pratinjau wajib dikirim saat apply impor.");
  }
  if (apply && expectedPreviewFingerprint !== previewFingerprint) {
    throw new SupabaseTahfidzError(409, "Sumber atau konflik berubah sejak pratinjau. Jalankan pratinjau ulang sebelum apply.");
  }

  const report = {
    dryRun: !apply,
    previewFingerprint,
    canApply: errors.length === 0,
    sourceCount: { halaqahs: halaqahSource.length, students: studentSource.length },
    planned: { halaqahs: plannedHalaqahs.length, memberships: plannedMemberships.length },
    unassignedStudents,
    imported: { halaqahs: 0, memberships: 0 },
    unchanged: { halaqahs: 0, memberships: 0 },
    errors,
    warnings,
  };
  if (!apply || errors.length) return report;

  const result = await supabaseRequest("/rest/v1/rpc/import_legacy_tahfidz_configuration", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_halaqahs: plannedHalaqahs,
      p_memberships: plannedMemberships,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi impor snapshot Tahfidz.");
  }
  return {
    ...report,
    dryRun: false,
    imported: { halaqahs: Number(result.halaqahsImported || 0), memberships: Number(result.membershipsImported || 0) },
    unchanged: { halaqahs: Number(result.halaqahsUnchanged || 0), memberships: Number(result.membershipsUnchanged || 0) },
  };
}


function targetDate(value: unknown, label: string, optional = false): string | null {
  if (optional && (value == null || value === "")) return null;
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new SupabaseTahfidzError(400, label + " tidak valid.");
  }
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new SupabaseTahfidzError(400, label + " tidak valid.");
  }
  return date;
}

function targetPages(value: unknown, label: string): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") {
    throw new SupabaseTahfidzError(400, label + " tidak valid.");
  }
  const pages = Number(value);
  if (!Number.isFinite(pages) || pages < 0 || pages > 100) {
    throw new SupabaseTahfidzError(400, label + " harus berada di antara 0 dan 100 halaman.");
  }
  return pages;
}

export async function recordSupabaseTahfidzTarget(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  legacyRole: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(legacyRole);
  if (!expectedRole) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat mengatur target Tahfidz.");
  }
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new SupabaseTahfidzError(400, "Data target Tahfidz tidak valid.");
  }
  const payload = payloadValue as JsonObject;
  const studentId = String(payload.studentId || "").trim();
  if (!isUuid(studentId)) throw new SupabaseTahfidzError(400, "Santri wajib dipilih.");
  const periodStart = targetDate(payload.periodStart, "Tanggal mulai target")!;
  const periodEnd = targetDate(payload.periodEnd, "Tanggal akhir target", true);
  if (periodEnd && periodEnd < periodStart) throw new SupabaseTahfidzError(400, "Tanggal akhir tidak boleh sebelum tanggal mulai.");
  const ziyadahPagesPerDay = targetPages(payload.ziyadahPagesPerDay, "Target ziyadah");
  const murojaahPagesPerDay = targetPages(payload.murojaahPagesPerDay, "Target muroja'ah");
  if (ziyadahPagesPerDay === 0 && murojaahPagesPerDay === 0) {
    throw new SupabaseTahfidzError(400, "Minimal satu target harian harus lebih dari nol.");
  }
  const policy = String(payload.policy || "").trim();
  if (!["standard", "strict"].includes(policy)) throw new SupabaseTahfidzError(400, "Kebijakan target tidak valid.");
  const notes = boundedText(payload.notes, 1000, "Catatan target");
  const requestId = String(payload.clientRequestId || "").trim();
  if (!isUuid(requestId)) throw new SupabaseTahfidzError(400, "Kunci permintaan target tidak valid.");

  const supabaseUserId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);

  const result = await supabaseRequest("/rest/v1/rpc/record_tahfidz_daily_target", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_ziyadah_pages_per_day: ziyadahPagesPerDay,
      p_murojaah_pages_per_day: murojaahPagesPerDay,
      p_target_policy: policy,
      p_notes: notes || null,
      p_created_by_user_id: supabaseUserId,
      p_expected_role: expectedRole,
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true || !isUuid(String(result.targetId || ""))) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi penyimpanan target.");
  }
  return result as JsonObject;
}


async function resolveSupabaseTahfidzActor(tenantId: string, actorSupabaseUid: string, expectedRole: string) {
  if (!isUuid(actorSupabaseUid)) throw new SupabaseTahfidzError(401, "Sesi pengguna Supabase tidak valid.");
  if (!["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(expectedRole)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat mengakses data operasional Tahfidz.");
  }
  const params = new URLSearchParams({
    select: "user_id,role,status",
    tenant_id: "eq." + tenantId,
    user_id: "eq." + actorSupabaseUid,
    status: "eq.active",
    limit: "2",
  });
  const profiles = await supabaseRequest("/rest/v1/profiles?" + params.toString());
  if (!Array.isArray(profiles) || profiles.length !== 1
    || String(profiles[0]?.status || "").toLowerCase() !== "active"
    || String(profiles[0]?.role || "").trim().toLowerCase() !== expectedRole) {
    throw new SupabaseTahfidzError(403, "Akun Supabase tidak cocok dengan profil Tahfidz aktif pada tenant ini.");
  }
  return actorSupabaseUid;
}

export async function saveSupabaseTahfidzHalaqah(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  legacyRole: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(legacyRole);
  if (!["admin", "super_admin"].includes(expectedRole)) {
    throw new SupabaseTahfidzError(403, "Hanya Admin tenant yang dapat mengelola halaqah.");
  }
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new SupabaseTahfidzError(400, "Data halaqah tidak valid.");
  }
  const payload = payloadValue as JsonObject;
  const halaqahId = String(payload.id || "").trim();
  if (halaqahId && !isUuid(halaqahId)) throw new SupabaseTahfidzError(400, "ID halaqah tidak valid.");
  const name = boundedText(payload.name, 120, "Nama halaqah", true);
  const ustadzUserId = String(payload.ustadzUserId || "").trim();
  if (ustadzUserId && !isUuid(ustadzUserId)) throw new SupabaseTahfidzError(400, "Ustadz pengampu tidak valid.");
  const scheduleText = boundedText(payload.schedule, 500, "Jadwal halaqah");
  const roomText = boundedText(payload.room, 180, "Lokasi halaqah");
  const dailyTargetPages = targetPages(payload.dailyTargetPages, "Target halaqah");
  if (Math.round(dailyTargetPages * 100) !== dailyTargetPages * 100) {
    throw new SupabaseTahfidzError(400, "Target halaqah maksimal memiliki dua angka desimal.");
  }
  const status = String(payload.status || "active").trim().toLowerCase();
  if (!["active", "inactive", "archived"].includes(status)) {
    throw new SupabaseTahfidzError(400, "Status halaqah tidak valid.");
  }
  if (status === "active" && !ustadzUserId) {
    throw new SupabaseTahfidzError(400, "Halaqah aktif harus memiliki Ustadz pengampu.");
  }
  const requestId = String(payload.clientRequestId || "").trim();
  if (!isUuid(requestId)) throw new SupabaseTahfidzError(400, "Kunci permintaan halaqah tidak valid.");
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const result = await supabaseRequest("/rest/v1/rpc/save_tahfidz_halaqah", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_halaqah_id: halaqahId || null,
      p_name: name,
      p_ustadz_user_id: ustadzUserId || null,
      p_schedule_text: scheduleText || null,
      p_room_text: roomText || null,
      p_daily_target_pages: dailyTargetPages,
      p_status: status,
      p_created_by_user_id: actorId,
      p_expected_role: expectedRole,
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true || !isUuid(String(result.halaqahId || ""))) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi penyimpanan halaqah.");
  }
  return result as JsonObject;
}

export async function assignSupabaseTahfidzMembership(
  tenantIdentifier: string,
  actorSupabaseUid: string,
  legacyRole: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expectedRole = legacySupabaseRole(legacyRole);
  if (!["admin", "super_admin"].includes(expectedRole)) {
    throw new SupabaseTahfidzError(403, "Hanya Admin tenant yang dapat mengatur penempatan halaqah.");
  }
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) {
    throw new SupabaseTahfidzError(400, "Data penempatan santri tidak valid.");
  }
  const payload = payloadValue as JsonObject;
  const studentId = String(payload.studentId || "").trim();
  const halaqahId = String(payload.halaqahId || "").trim();
  if (!isUuid(studentId) || !isUuid(halaqahId)) {
    throw new SupabaseTahfidzError(400, "Santri dan halaqah wajib dipilih.");
  }
  const startsOn = targetDate(payload.startsOn, "Tanggal mulai penempatan")!;
  const requestId = String(payload.clientRequestId || "").trim();
  if (!isUuid(requestId)) throw new SupabaseTahfidzError(400, "Kunci permintaan penempatan tidak valid.");
  const actorId = await resolveSupabaseTahfidzActor(tenantId, actorSupabaseUid, expectedRole);
  const result = await supabaseRequest("/rest/v1/rpc/assign_tahfidz_membership", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_halaqah_id: halaqahId,
      p_starts_on: startsOn,
      p_created_by_user_id: actorId,
      p_expected_role: expectedRole,
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true || !isUuid(String(result.membershipId || ""))) {
    throw new SupabaseTahfidzError(503, "Backend belum mengonfirmasi penempatan halaqah.");
  }
  return result as JsonObject;
}
