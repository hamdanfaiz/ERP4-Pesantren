import { createHash } from "node:crypto";

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
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabaseTahfidzError(503, "Konfigurasi backend Supabase belum lengkap.");
  }
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", "Bearer " + config.serviceKey);
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

async function resolveTenantId(identifier: string) {
  const normalized = String(identifier || "").trim();
  if (!normalized) throw new SupabaseTahfidzError(403, "Tenant aktif tidak ditemukan.");
  const params = new URLSearchParams({ select: "id,slug,status", limit: "2" });
  if (isUuid(normalized)) params.set("id", "eq." + normalized);
  else params.set("slug", "eq." + normalized.toLowerCase());
  const rows = await supabaseRequest("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseTahfidzError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
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

export async function listSupabaseTahfidzSnapshot(tenantIdentifier: string, legacyFirebaseUid: string, role: string) {
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(role)) {
    throw new SupabaseTahfidzError(403, "Role ini tidak dapat membaca data operasional Tahfidz.");
  }
  const tenantId = await resolveTenantId(tenantIdentifier);
  const [halaqahs, memberships, students, records, targets] = await Promise.all([
    listRows("tahfidz_halaqahs", tenantId, "id,name,ustadz_user_id,ustadz_name,schedule_text,room_text,daily_target_pages,status", "name.asc,id.asc", { status: "eq.active" }),
    listRows("tahfidz_memberships", tenantId, "id,halaqah_id,student_id,starts_on,status", "starts_on.asc,id.asc", { status: "eq.active" }),
    listRows("students", tenantId, "id,nis,name,gender,grade,class_id,status", "name.asc,id.asc", { status: "neq.Archived" }),
    listRows("tahfidz_records", tenantId, "id,student_id,halaqah_id,activity_type,surah_name,ayah_start,ayah_end,fluency_grade,tajweed_grade,notes,performed_at,recorded_by_name", "performed_at.desc,id.desc"),
    listRows("tahfidz_targets", tenantId, "id,student_id,period_start,period_end,ziyadah_pages_per_day,murojaah_pages_per_day,target_policy,status", "period_start.desc,id.desc", { status: "eq.active" }),
  ]);

  const studentById = new Map<string, JsonObject>();
  for (const student of students) studentById.set(String(student.id), student);
  const membershipsByStudent = new Map<string, JsonObject>();
  const studentsByHalaqah = new Map<string, JsonObject[]>();
  for (const membership of memberships) {
    const studentId = String(membership.student_id || "");
    const halaqahId = String(membership.halaqah_id || "");
    const student = studentById.get(studentId);
    if (!student) continue;
    membershipsByStudent.set(studentId, membership);
    const members = studentsByHalaqah.get(halaqahId) || [];
    members.push(student);
    studentsByHalaqah.set(halaqahId, members);
  }

  const targetByStudent = new Map<string, JsonObject>();
  for (const target of targets) targetByStudent.set(String(target.student_id), target);
  const roster = students.map((student) => {
    const membership = membershipsByStudent.get(String(student.id));
    const halaqah = halaqahs.find((item) => String(item.id) === String(membership?.halaqah_id || ""));
    const target = targetByStudent.get(String(student.id));
    return {
      id: String(student.id),
      nis: String(student.nis || ""),
      name: String(student.name || ""),
      gender: student.gender || null,
      grade: student.grade || "",
      classId: student.class_id || null,
      halaqahId: halaqah ? String(halaqah.id) : null,
      halaqah: halaqah ? String(halaqah.name) : "",
      target: target ? {
        periodStart: target.period_start,
        periodEnd: target.period_end || null,
        ziyadahPagesPerDay: Number(target.ziyadah_pages_per_day || 0),
        murojaahPagesPerDay: Number(target.murojaah_pages_per_day || 0),
        policy: String(target.target_policy || "standard"),
      } : null,
    };
  });

  const recentRecords = records.map((record) => {
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

  const snapshot = {
    halaqahs: halaqahs.map((halaqah) => ({
      id: String(halaqah.id),
      name: String(halaqah.name),
      ustadzUserId: halaqah.ustadz_user_id || null,
      ustadz: String(halaqah.ustadz_name || ""),
      schedule: halaqah.schedule_text || "",
      room: halaqah.room_text || "",
      dailyTargetPages: Number(halaqah.daily_target_pages || 0),
      students: (studentsByHalaqah.get(String(halaqah.id)) || []).map((student) => ({
        id: String(student.id), name: String(student.name || ""), nis: String(student.nis || ""),
      })),
    })),
    roster,
    records: recentRecords,
  };

  if (role === "Ustadz") {
    if (!legacyFirebaseUid || legacyFirebaseUid.length > 160) {
      throw new SupabaseTahfidzError(401, "Sesi Ustadz tidak valid.");
    }
    const mappedProfile = await supabaseRequest("/rest/v1/rpc/resolve_legacy_auth_profile", {
      method: "POST",
      body: JSON.stringify({
        p_legacy_provider: "firebase",
        p_legacy_subject: legacyFirebaseUid,
        p_tenant_id: tenantId,
      }),
    });
    const profileId = String(mappedProfile || "");
    if (!isUuid(profileId)) {
      throw new SupabaseTahfidzError(403, "Profil Supabase Ustadz belum dipetakan atau tidak aktif.");
    }
    const assignedHalaqahs = snapshot.halaqahs.filter((halaqah) => halaqah.ustadzUserId === profileId);
    const allowedHalaqahIds = new Set(assignedHalaqahs.map((halaqah) => halaqah.id));
    snapshot.halaqahs = assignedHalaqahs;
    snapshot.roster = snapshot.roster.filter((student) => allowedHalaqahIds.has(String(student.halaqahId || "")));
    snapshot.records = snapshot.records.filter((record) => allowedHalaqahIds.has(record.halaqahId));
  }

  return snapshot;
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
  legacyFirebaseUid: string,
  recordedByName: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!legacyFirebaseUid || legacyFirebaseUid.length > 160) {
    throw new SupabaseTahfidzError(401, "Sesi pengguna tidak valid.");
  }
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

  const actor = await supabaseRequest("/rest/v1/rpc/resolve_legacy_auth_profile", {
    method: "POST",
    body: JSON.stringify({
      p_legacy_provider: "firebase",
      p_legacy_subject: legacyFirebaseUid,
      p_tenant_id: tenantId,
    }),
  });
  const supabaseUserId = String(actor || "");
  if (!isUuid(supabaseUserId)) {
    throw new SupabaseTahfidzError(403, "Akun belum dipetakan ke profil Supabase Auth aktif.");
  }

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
  return String(value || "").trim().replace(/\\s+/g, " ").toLocaleLowerCase("id-ID");
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
      const match = targetText.match(/([0-9]+(?:[.,][0-9]{1,2})?)\\s*(?:halaman|page)/i);
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
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
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
  legacyFirebaseUid: string,
  legacyRole: string,
  payloadValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!legacyFirebaseUid || legacyFirebaseUid.length > 160) {
    throw new SupabaseTahfidzError(401, "Sesi pengguna tidak valid.");
  }
  const expectedRole = String(legacyRole || "").trim();
  if (!["Admin", "SuperAdmin", "Ustadz"].includes(expectedRole)) {
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

  const actor = await supabaseRequest("/rest/v1/rpc/resolve_legacy_auth_profile", {
    method: "POST",
    body: JSON.stringify({
      p_legacy_provider: "firebase",
      p_legacy_subject: legacyFirebaseUid,
      p_tenant_id: tenantId,
    }),
  });
  const supabaseUserId = String(actor || "");
  if (!isUuid(supabaseUserId)) {
    throw new SupabaseTahfidzError(403, "Akun belum dipetakan ke profil Supabase Auth aktif.");
  }

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
