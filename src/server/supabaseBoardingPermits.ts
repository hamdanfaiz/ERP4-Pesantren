import { readPostgrestRowsInPages } from "./postgrestPagination";
import { createHash } from "node:crypto";
import { SupabaseOnboardingError } from "./supabaseOnboarding";

type JsonObject = Record<string, any>;
type BoardingActor = {
  uid: string;
  tenantId: string;
  role: string;
  linkedSantriId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMIT_TYPES = ["Pulang", "Keluar Area", "Kegiatan Eksternal", "Izin Walisantri (Parental Leave)"] as const;
const ROLE_TO_DATABASE: Record<string, string> = {
  Admin: "admin",
  SuperAdmin: "super_admin",
  Ustadz: "ustadz",
  Santri: "santri",
  Walisantri: "wali_santri",
};

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) throw new SupabaseOnboardingError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  if (config.serviceKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + config.serviceKey);
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
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) {
      throw new SupabaseOnboardingError(409, body?.message || "Permintaan izin bertentangan dengan status atau data yang tersimpan.");
    }
    if (code === "22023" || response.status === 400) throw new SupabaseOnboardingError(400, body?.message || "Data izin tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseOnboardingError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseOnboardingError(403, body?.message || "Operasi izin ditolak oleh kebijakan tenant.");
    throw new SupabaseOnboardingError(503, "Layanan izin Supabase belum dapat diproses.");
  }
  return body;
}

function requiredUuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}

function databaseRole(role: string) {
  const mapped = ROLE_TO_DATABASE[String(role || "").trim()];
  if (!mapped) throw new SupabaseOnboardingError(403, "Role tidak didukung untuk modul asrama.");
  return mapped;
}

async function listTenantRows(table: string, tenantId: string, select: string, order: string) {
  const result: JsonObject[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const params = new URLSearchParams({
      select,
      tenant_id: "eq." + tenantId,
      order,
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Data izin asrama belum dapat dimuat.");
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
  throw new SupabaseOnboardingError(503, "Data izin melebihi batas halaman yang didukung.");
}

type BoardingLocationScope = { roomIds: Set<string>; buildingIds: Set<string> };
async function getBoardingLocationScope(tenantId: string, userId: string): Promise<BoardingLocationScope> {
  const path = "/rest/v1/boarding_staff_assignments?" + new URLSearchParams({
    select: "room_id,building_id", tenant_id: "eq." + tenantId, user_id: "eq." + userId,
    status: "eq.active", order: "id.asc",
  }).toString();
  const rows = await readPostgrestRowsInPages<JsonObject>({
    request: supabaseRequest, path, maxRows: 5000,
    onIncomplete: () => new SupabaseOnboardingError(503, "Penugasan lokasi petugas melebihi batas aman atau hasilnya tidak lengkap."),
  });
  const structures = await listTenantRows("master_data_records", tenantId, "id,category,status", "category.asc,id.asc");
  const activeRooms = new Set(structures.filter((row) => row.category === "Kamar"
    && !["inactive", "nonaktif", "disabled"].includes(String(row.status || "").toLowerCase())).map((row) => String(row.id)));
  const activeBuildings = new Set(structures.filter((row) => row.category === "Gedung"
    && !["inactive", "nonaktif", "disabled"].includes(String(row.status || "").toLowerCase())).map((row) => String(row.id)));
  const roomIds = new Set<string>(), buildingIds = new Set<string>();
  for (const row of rows) {
    if (row.room_id && activeRooms.has(String(row.room_id))) roomIds.add(String(row.room_id));
    if (row.building_id && activeBuildings.has(String(row.building_id))) buildingIds.add(String(row.building_id));
  }
  if (!roomIds.size && !buildingIds.size) throw new SupabaseOnboardingError(403, "Akun Ustadz belum memiliki penugasan kamar atau gedung aktif.");
  return { roomIds, buildingIds };
}
function isStudentInScope(student: JsonObject, scope: BoardingLocationScope) {
  return (student.room_id != null && scope.roomIds.has(String(student.room_id)))
    || (student.building_id != null && scope.buildingIds.has(String(student.building_id)));
}

async function resolveLinkedStudent(actor: BoardingActor) {
  const linkedId = String(actor.linkedSantriId || "").trim();
  if (!linkedId) throw new SupabaseOnboardingError(403, "Akun belum ditautkan ke data santri.");
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  const matches = new Map<string, JsonObject>();
  if (UUID_PATTERN.test(linkedId)) {
    const params = new URLSearchParams({
      select: "id,source_record_id,name,nis,room_id,status",
      tenant_id: "eq." + tenantId,
      id: "eq." + linkedId,
      limit: "2",
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (Array.isArray(rows)) rows.forEach((row: JsonObject) => matches.set(String(row.id), row));
  }
  const sourceParams = new URLSearchParams({
    select: "id,source_record_id,name,nis,room_id,status",
    tenant_id: "eq." + tenantId,
    source_record_id: "eq." + linkedId,
    limit: "2",
  });
  const sourceRows = await supabaseRequest("/rest/v1/students?" + sourceParams.toString());
  if (Array.isArray(sourceRows)) sourceRows.forEach((row: JsonObject) => matches.set(String(row.id), row));
  const rows = [...matches.values()].filter((row) => String(row.status || "").toLowerCase() !== "archived");
  if (rows.length !== 1) throw new SupabaseOnboardingError(403, "Tautan santri pada profil tidak valid atau belum unik.");
  return rows[0];
}

function mapPermit(row: JsonObject, studentById: Map<string, JsonObject>, roomById: Map<string, string>) {
  const studentId = String(row.student_id || "");
  const student = studentById.get(studentId);
  const roomId = row.room_id ? String(row.room_id) : "";
  return {
    id: String(row.id),
    studentId,
    santriName: String(student?.name || "Santri tidak tersedia"),
    nis: String(student?.nis || ""),
    roomId,
    room: String(row.room_name_snapshot || (roomId ? (roomById.get(roomId) || roomId) : "Belum ditempatkan")),
    type: String(row.permit_type),
    reason: String(row.reason),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: String(row.status),
    createdAt: String(row.created_at || ""),
  };
}

export async function listSupabaseBoardingPermits(actor: BoardingActor) {
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  const role = databaseRole(actor.role);
  if (!["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(role)) {
    throw new SupabaseOnboardingError(403, "Role ini tidak dapat membaca izin asrama.");
  }
  let students: JsonObject[];
  const scope = role === "ustadz" ? await getBoardingLocationScope(tenantId, requiredUuid(actor.uid, "Akun")) : null;
  if (role === "santri" || role === "wali_santri") {
    students = [await resolveLinkedStudent(actor)];
  } else {
    students = await listTenantRows("students", tenantId, "id,source_record_id,name,nis,room_id,building_id,status", "name.asc,id.asc");
    students = students.filter((student) => String(student.status || "").toLowerCase() !== "archived"
      && (!scope || isStudentInScope(student, scope)));
  }
  const studentById = new Map<string, JsonObject>(students.map((student) => [String(student.id), student] as const));
  const permitRows = await listTenantRows("boarding_permits", tenantId,
    "id,student_id,room_id,room_name_snapshot,permit_type,reason,start_date,end_date,status,requested_by_user_id,created_at",
    "created_at.desc,id.desc");
  const visiblePermits = role === "santri" || role === "wali_santri" || role === "ustadz"
    ? permitRows.filter((row) => studentById.has(String(row.student_id)))
    : permitRows;
  const allStudentsById = new Map(studentById);
  if (role !== "santri" && role !== "wali_santri" && role !== "ustadz") {
    const known = new Set(allStudentsById.keys());
    const missingIds = [...new Set(visiblePermits.map((row) => String(row.student_id)).filter((id) => !known.has(id)))];
    // Historical permits remain visible with a placeholder when the student's record is archived.
    for (const id of missingIds) allStudentsById.set(id, { id, name: "Santri diarsipkan", nis: "", room_id: null });
  }
  const roomIds = [...new Set(visiblePermits.map((row) => String(row.room_id || "")).filter(Boolean))];
  const roomById = new Map<string, string>();
  if (roomIds.length) {
    const rooms = await listTenantRows("master_data_records", tenantId,
      "id,name,category", "name.asc,id.asc");
    for (const room of rooms) if (room.category === "Kamar" && roomIds.includes(String(room.id))) {
      roomById.set(String(room.id), String(room.name || room.id));
    }
  }
  return {
    permits: visiblePermits.map((row) => mapPermit(row, allStudentsById, roomById)),
    students: students.map((student) => ({
      id: String(student.id), name: String(student.name || ""), nis: String(student.nis || ""),
      roomId: student.room_id ? String(student.room_id) : null,
    })),
    canManage: ["admin", "super_admin", "ustadz"].includes(role),
    canRequest: ["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(role),
    canFinalize: ["admin", "super_admin"].includes(role),
  };
}

export async function requestSupabaseBoardingPermit(actor: BoardingActor, value: unknown) {
  const role = databaseRole(actor.role);
  if (!["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(role)) {
    throw new SupabaseOnboardingError(403, "Role ini tidak dapat mengajukan izin asrama.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Data izin tidak valid.");
  const input = value as JsonObject;
  const studentId = requiredUuid(input.studentId, "Santri");
  const clientRequestId = requiredUuid(input.clientRequestId, "ID permintaan");
  const permitType = String(input.type || "").trim();
  if (!(PERMIT_TYPES as readonly string[]).includes(permitType)) throw new SupabaseOnboardingError(400, "Jenis izin tidak valid.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 1000) throw new SupabaseOnboardingError(400, "Alasan wajib diisi dan maksimal 1.000 karakter.");
  const startDate = String(input.startDate || "").trim();
  const endDate = String(input.endDate || "").trim();
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new SupabaseOnboardingError(400, "Tanggal izin tidak valid.");
  }
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  const actorId = requiredUuid(actor.uid, "Akun");
  const result = await supabaseRequest("/rest/v1/rpc/request_boarding_permit", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_permit_type: permitType,
      p_reason: reason,
      p_start_date: startDate,
      p_end_date: endDate,
      p_actor_user_id: actorId,
      p_expected_role: role,
      p_client_request_id: clientRequestId,
    }),
  });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Permintaan izin belum tersimpan.");
  return { permitId: String(result.permitId), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function transitionSupabaseBoardingPermit(actor: BoardingActor, permitIdValue: unknown, value: unknown) {
  const role = databaseRole(actor.role);
  if (!["admin", "super_admin", "ustadz"].includes(role)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat memproses izin asrama.");
  const permitId = requiredUuid(permitIdValue, "Izin");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Perubahan status tidak valid.");
  const input = value as JsonObject;
  const clientRequestId = requiredUuid(input.clientRequestId, "ID permintaan");
  const toStatus = String(input.status || "").trim();
  if (!["Pending Keamanan", "Approved", "Rejected", "Active", "Returned"].includes(toStatus)) {
    throw new SupabaseOnboardingError(400, "Status izin tidak didukung.");
  }
  const result = await supabaseRequest("/rest/v1/rpc/transition_boarding_permit", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: requiredUuid(actor.tenantId, "Tenant"),
      p_permit_id: permitId,
      p_to_status: toStatus,
      p_actor_user_id: requiredUuid(actor.uid, "Akun"),
      p_expected_role: role,
      p_client_request_id: clientRequestId,
    }),
  });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Perubahan izin belum tersimpan.");
  return { permitId: String(result.permitId), status: String(result.status), alreadyApplied: Boolean(result.alreadyApplied) };
}

type PreparedLegacyPermit = {
  sourceRecordId: string;
  studentId: string;
  roomId: string | null;
  roomName: string | null;
  type: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
};

function legacyIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
    value = (value as any).toDate();
  } else if (value && typeof value === "object" && typeof (value as any).seconds === "number") {
    value = new Date((value as any).seconds * 1000);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) return null;
    return day.toISOString();
  }
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function legacyDate(value: unknown): string | null {
  const iso = legacyIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function folded(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("id-ID");
}

function normalizePermitStatus(value: unknown): string | null {
  const status = folded(value);
  const statuses: Record<string, string> = {
    "pending": "Pending Musyrif",
    "pending musyrif": "Pending Musyrif",
    "pending keamanan": "Pending Keamanan",
    "approved": "Approved",
    "disetujui": "Approved",
    "rejected": "Rejected",
    "ditolak": "Rejected",
    "active": "Active",
    "sedang di luar": "Active",
    "returned": "Returned",
    "kembali": "Returned",
  };
  return statuses[status] || null;
}

/** Preview and apply a legacy Firebase permit snapshot without overwriting conflicts. */
export async function migrateSupabaseLegacyBoardingPermits(
  actor: BoardingActor,
  sourceRows: Array<{ sourceId: string; value: Record<string, any> }>,
  apply: boolean,
  expectedPreviewFingerprint = "",
) {
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  if (!["Admin", "SuperAdmin"].includes(actor.role)) throw new SupabaseOnboardingError(403, "Hanya Admin tenant yang dapat mengimpor izin lama.");
  if (!Array.isArray(sourceRows) || sourceRows.length > 1000) throw new SupabaseOnboardingError(413, "Impor izin dibatasi maksimal 1.000 record per tenant.");

  const [students, structures] = await Promise.all([
    listTenantRows("students", tenantId, "id,source_record_id,name,nis,room_id,status", "name.asc,id.asc"),
    listTenantRows("master_data_records", tenantId, "id,name,category,status", "name.asc,id.asc"),
  ]);
  const activeStudents = students.filter((student) => String(student.status || "").toLowerCase() !== "archived");
  const studentsById = new Map<string, JsonObject>();
  const studentsBySource = new Map<string, JsonObject[]>();
  const studentsByNis = new Map<string, JsonObject[]>();
  const studentsByName = new Map<string, JsonObject[]>();
  for (const student of activeStudents) {
    studentsById.set(String(student.id), student);
    const sourceId = String(student.source_record_id || "").trim();
    if (sourceId) studentsBySource.set(sourceId, [...(studentsBySource.get(sourceId) || []), student]);
    const nis = String(student.nis || "").trim();
    if (nis) studentsByNis.set(nis, [...(studentsByNis.get(nis) || []), student]);
    const name = folded(student.name);
    if (name) studentsByName.set(name, [...(studentsByName.get(name) || []), student]);
  }
  const rooms = structures.filter((item) => item.category === "Kamar" && !["inactive", "nonaktif", "disabled"].includes(folded(item.status)));
  const roomByIdentifier = new Map<string, JsonObject>();
  const roomByName = new Map<string, JsonObject[]>();
  for (const room of rooms) {
    roomByIdentifier.set(String(room.id), room);
    const name = folded(room.name);
    if (name) roomByName.set(name, [...(roomByName.get(name) || []), room]);
  }

  const issues: Array<{ sourceId: string; reason: string }> = [];
  const warnings: Array<{ sourceId: string; reason: string }> = [];
  const rows: PreparedLegacyPermit[] = [];
  const seenSourceIds = new Set<string>();
  const orderedRows = [...sourceRows].sort((left, right) => String(left?.sourceId || "").localeCompare(String(right?.sourceId || "")));

  for (const item of orderedRows) {
    const sourceId = String(item?.sourceId || "").trim();
    const value = item?.value || {};
    const issue = (reason: string) => issues.push({ sourceId: sourceId || "(tanpa id)", reason });
    if (!sourceId || sourceId.length > 1500 || seenSourceIds.has(sourceId)) {
      issue("ID dokumen kosong, terlalu panjang, atau duplikat.");
      continue;
    }
    seenSourceIds.add(sourceId);

    const rawStudentId = String(value.studentId || value.santriId || "").trim();
    const rawNis = String(value.nis || value.santriNis || "").trim();
    const rawName = String(value.santriName || value.studentName || value.name || "").trim();
    const rawRoom = String(value.room || value.roomId || "").trim();
    let room: JsonObject | undefined;
    if (rawRoom) {
      room = roomByIdentifier.get(rawRoom);
      if (!room) {
        const nameMatches = roomByName.get(folded(rawRoom)) || [];
        if (nameMatches.length === 1) room = nameMatches[0];
      }
    }

    let studentMatches: JsonObject[] = [];
    if (rawStudentId && UUID_PATTERN.test(rawStudentId) && studentsById.has(rawStudentId)) {
      studentMatches = [studentsById.get(rawStudentId)!];
    } else if (rawStudentId && studentsBySource.has(rawStudentId)) {
      studentMatches = studentsBySource.get(rawStudentId)!;
    } else if (rawNis && studentsByNis.has(rawNis)) {
      studentMatches = studentsByNis.get(rawNis)!;
    } else if (rawName) {
      studentMatches = studentsByName.get(folded(rawName)) || [];
    }
    if (studentMatches.length > 1 && room) {
      studentMatches = studentMatches.filter((student) => String(student.room_id || "") === String(room!.id));
    }
    if (studentMatches.length !== 1) {
      issue(studentMatches.length === 0
        ? "Santri tidak cocok dengan tepat satu data aktif pada tenant; tautkan dengan ID atau NIS yang benar."
        : "Nama santri cocok dengan lebih dari satu data; tambahkan NIS atau rekonsiliasi record sebelum impor.");
      continue;
    }
    const student = studentMatches[0];
    const type = String(value.type || value.permitType || "").trim();
    if (!(PERMIT_TYPES as readonly string[]).includes(type)) {
      issue("Jenis izin tidak valid atau belum memiliki pemetaan yang aman.");
      continue;
    }
    const reason = String(value.reason || "").trim();
    const startDate = legacyDate(value.startDate);
    const endDate = legacyDate(value.endDate);
    const status = normalizePermitStatus(value.status || "Pending Musyrif");
    const createdAt = legacyIso(value.createdAt || value.created_at) || (startDate ? `${startDate}T00:00:00.000Z` : null);
    if (!reason || reason.length > 1000 || !startDate || !endDate || endDate < startDate || !status || !createdAt) {
      issue("Alasan, tanggal, atau status izin tidak valid; perbaiki sumber lalu jalankan preview ulang.");
      continue;
    }
    if (rawRoom && !room) warnings.push({ sourceId, reason: "Ruang lama tidak cocok dengan Master Data saat ini; nama ruang disimpan sebagai snapshot, tanpa mengubah penempatan santri." });
    rows.push({
      sourceRecordId: sourceId,
      studentId: String(student.id),
      roomId: room ? String(room.id) : null,
      roomName: room ? String(room.name || rawRoom) : (rawRoom || null),
      type,
      reason,
      startDate,
      endDate,
      status,
      createdAt,
    });
  }

  const existing = await listTenantRows("boarding_permits", tenantId,
    "id,student_id,room_id,room_name_snapshot,permit_type,reason,start_date,end_date,status,source_system,source_record_id",
    "created_at.asc,id.asc");
  const existingLegacy = new Map<string, JsonObject>(existing
    .filter((row) => row.source_system === "legacy_import" && row.source_record_id)
    .map((row) => [String(row.source_record_id), row] as const));
  let alreadyPresent = 0;
  for (const row of rows) {
    const found = existingLegacy.get(row.sourceRecordId);
    if (!found) continue;
    const same = String(found.student_id) === row.studentId
      && String(found.room_id || "") === String(row.roomId || "")
      && String(found.room_name_snapshot || "") === String(row.roomName || "")
      && String(found.permit_type) === row.type
      && String(found.reason) === row.reason
      && String(found.start_date) === row.startDate
      && String(found.end_date) === row.endDate
      && String(found.status) === row.status;
    if (same) alreadyPresent += 1;
    else issues.push({ sourceId: row.sourceRecordId, reason: "Record legacy sudah diimpor dengan data inti berbeda; tidak akan ditimpa." });
  }

  const previewFingerprint = createHash("sha256")
    .update(JSON.stringify({ tenantId, rows, issues, warnings }))
    .digest("hex");
  const report = {
    dryRun: !apply,
    previewFingerprint,
    sourceCount: sourceRows.length,
    planned: rows.length,
    alreadyImported: alreadyPresent,
    imported: 0,
    unchanged: 0,
    canApply: issues.length === 0,
    issues,
    warnings,
  };
  if (!apply) return report;
  if (!expectedPreviewFingerprint || expectedPreviewFingerprint !== previewFingerprint) {
    throw new SupabaseOnboardingError(409, "Snapshot atau pemetaan izin berubah sejak preview. Jalankan preview ulang sebelum apply.");
  }
  if (issues.length) throw new SupabaseOnboardingError(409, "Preview izin memiliki record yang perlu direkonsiliasi sebelum impor.");

  const result = await supabaseRequest("/rest/v1/rpc/import_legacy_boarding_permits", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: requiredUuid(actor.uid, "Akun"),
      p_source_fingerprint: previewFingerprint,
      p_rows: rows,
    }),
  });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi impor izin lama.");
  return {
    ...report,
    dryRun: false,
    alreadyImported: Boolean(result.alreadyImported),
    imported: Number(result.imported || 0),
    unchanged: Number(result.unchanged || 0),
  };
}
