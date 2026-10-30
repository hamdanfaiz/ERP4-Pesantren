import { readPostgrestRowsInPages } from "./postgrestPagination";
import { createHash } from "node:crypto";
import { SupabaseOnboardingError } from "./supabaseOnboarding";
import { filterBoardingStructuresByUnit, isBoardingStudentInUnit, requireBoardingUnitId } from "./boardingUnitScope";
import { isOperationalBoardingStudent } from "./boardingStatus";

type Row = Record<string, any>;
type Actor = { uid: string; tenantId: string; role: string; organizationUnitId?: string | null };
type PreparedAttendance = { sourceRecordId: string; studentId: string; roomId: string | null; roomName: string | null; status: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin", Ustadz: "ustadz" };

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseOnboardingError(503, "Konfigurasi backend Supabase belum lengkap.");
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
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) throw new SupabaseOnboardingError(409, body?.message || "Data kehadiran bertentangan dengan data yang tersimpan.");
    if (code === "22023" || response.status === 400) throw new SupabaseOnboardingError(400, body?.message || "Data kehadiran tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseOnboardingError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseOnboardingError(403, body?.message || "Operasi kehadiran ditolak oleh kebijakan tenant.");
    throw new SupabaseOnboardingError(503, "Layanan kehadiran Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}
function role(actor: Actor) {
  const value = ROLES[String(actor.role || "").trim()];
  if (!value) throw new SupabaseOnboardingError(403, "Role tidak didukung untuk kehadiran asrama.");
  return value;
}
function isoDate(value: unknown) {
  const day = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new SupabaseOnboardingError(400, "Tanggal kehadiran harus berformat YYYY-MM-DD.");
  const parsed = new Date(day + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new SupabaseOnboardingError(400, "Tanggal kehadiran tidak valid.");
  return day;
}
async function tenantRows(table: string, tenantId: string, select: string, order: string) {
  const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order });
  return readPostgrestRowsInPages<Row>({
    request,
    path: "/rest/v1/" + table + "?" + params.toString(),
    maxRows: 5000,
    onIncomplete: () => new SupabaseOnboardingError(503, "Data kehadiran melebihi batas halaman yang didukung atau hasil pemindaian tidak lengkap."),
  });
}
const folded = (value: unknown) => String(value || "").trim().toLocaleLowerCase("id-ID");
type BoardingLocationScope = {
  roomIds: Set<string>;
  buildingIds: Set<string>;
  unitBuildingIds: Set<string>;
  roomParentById: Map<string, string>;
};
async function getBoardingLocationScope(tenantId: string, userId: string, unitId: string): Promise<BoardingLocationScope> {
  const path = "/rest/v1/boarding_staff_assignments?" + new URLSearchParams({ select: "room_id,building_id", tenant_id: "eq." + tenantId,
    user_id: "eq." + userId, status: "eq.active", order: "room_id.asc,building_id.asc,user_id.asc" }).toString();
  const rows = await readPostgrestRowsInPages<Row>({
    request, path, maxRows: 5000,
    onIncomplete: () => new SupabaseOnboardingError(503, "Penugasan lokasi petugas melebihi batas aman atau hasilnya tidak lengkap."),
  });
  const structures = filterBoardingStructuresByUnit(
    await tenantRows("master_data_records", tenantId, "id,category,status,parent_id,organization_unit_id", "category.asc,id.asc"), unitId,
  );
  const activeRoomRows = structures.filter((row) => row.category === "Kamar"
    && !["inactive", "nonaktif", "tidak aktif", "disabled"].includes(String(row.status || "").trim().toLowerCase()));
  const activeBuildingRows = structures.filter((row) => row.category === "Gedung"
    && !["inactive", "nonaktif", "tidak aktif", "disabled"].includes(String(row.status || "").trim().toLowerCase()));
  const activeRooms = new Set(activeRoomRows.map((row) => String(row.id)));
  const activeBuildings = new Set(activeBuildingRows.map((row) => String(row.id)));
  const roomIds = new Set<string>(), buildingIds = new Set<string>();
  for (const row of rows) {
    if (row.room_id && activeRooms.has(String(row.room_id))) roomIds.add(String(row.room_id));
    if (row.building_id && activeBuildings.has(String(row.building_id))) buildingIds.add(String(row.building_id));
  }
  if (!roomIds.size && !buildingIds.size) throw new SupabaseOnboardingError(403, "Akun Ustadz belum memiliki penugasan kamar atau gedung aktif.");
  return { roomIds, buildingIds, unitBuildingIds: activeBuildings,
    roomParentById: new Map(activeRoomRows.map((row) => [String(row.id), String(row.parent_id || "")] as const)) };
}
function isStudentInScope(student: Row, scope: BoardingLocationScope) {
  const roomId = String(student.room_id || ""), buildingId = String(student.building_id || "");
  if (roomId) {
    if (!scope.roomIds.has(roomId)) return false;
    if (buildingId && (!scope.unitBuildingIds.has(buildingId)
      || (scope.roomParentById.get(roomId) && scope.roomParentById.get(roomId) !== buildingId))) return false;
    return true;
  }
  return Boolean(buildingId && scope.buildingIds.has(buildingId));
}

export async function getSupabaseBoardingAttendance(actor: Actor, dateValue: unknown) {
  const actorRole = role(actor), tenantId = uuid(actor.tenantId, "Tenant"), date = isoDate(dateValue);
  if (!["admin", "super_admin", "ustadz"].includes(actorRole)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat mengakses absensi asrama.");
  const unitId = actorRole === "ustadz" ? requireBoardingUnitId(actor.organizationUnitId) : null;
  const scope = actorRole === "ustadz" ? await getBoardingLocationScope(tenantId, uuid(actor.uid, "Akun"), unitId!) : null;
  const [students, structures] = await Promise.all([
    tenantRows("students", tenantId, "id,source_record_id,name,nis,room_id,building_id,organization_unit_id,status", "name.asc,id.asc"),
    tenantRows("master_data_records", tenantId, "id,name,category,parent_id,organization_unit_id", "name.asc,id.asc"),
  ]);
  const activeStudents = students.filter((student) => isOperationalBoardingStudent(student.status)
    && (!scope || (isBoardingStudentInUnit(student, unitId!) && isStudentInScope(student, scope))));
  const visibleStructures = unitId ? filterBoardingStructuresByUnit(structures, unitId) : structures;
  const roomById = new Map(visibleStructures.filter((item) => item.category === "Kamar").map((item) => [String(item.id), String(item.name || item.id)] as const));
  const sessionParams = new URLSearchParams({ select: "id,attendance_date", tenant_id: "eq." + tenantId, attendance_date: "eq." + date, session_type: "eq.nightly_curfew", limit: "2" });
  const sessions = await request("/rest/v1/boarding_attendance_sessions?" + sessionParams.toString());
  if (!Array.isArray(sessions) || sessions.length > 1) throw new SupabaseOnboardingError(503, "Sesi kehadiran tenant tidak konsisten.");
  let attendanceRows: Row[] = [];
  if (sessions.length) {
    const path = "/rest/v1/boarding_attendance_records?" + new URLSearchParams({ select: "id,student_id,room_id,room_name_snapshot,status,marked_at", tenant_id: "eq." + tenantId, session_id: "eq." + sessions[0].id, order: "student_id.asc,id.asc" }).toString();
    attendanceRows = await readPostgrestRowsInPages<Row>({
      request, path, maxRows: 5000,
      onIncomplete: () => new SupabaseOnboardingError(503, "Record kehadiran melewati batas aman atau tidak lengkap."),
    });
  }
  const byStudent = new Map(attendanceRows.map((row) => [String(row.student_id), row] as const));
  return {
    attendanceDate: date,
    records: activeStudents.map((student) => {
      const row = byStudent.get(String(student.id));
      const roomId = String(row?.room_id || student.room_id || "");
      return { studentId: String(student.id), studentName: String(student.name || ""), nis: String(student.nis || ""),
        roomId, room: String(row?.room_name_snapshot || roomById.get(roomId) || "Belum ditempatkan"),
        status: row ? String(row.status) : null, markedAt: row?.marked_at ? String(row.marked_at) : null };
    }),
  };
}

export async function setSupabaseBoardingAttendance(actor: Actor, value: unknown) {
  const actorRole = role(actor);
  if (!["admin", "super_admin", "ustadz"].includes(actorRole)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat mengubah kehadiran.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Perubahan kehadiran tidak valid.");
  const input = value as Row;
  const status = String(input.status || "").trim();
  if (!["Hadir", "Ghaib"].includes(status)) throw new SupabaseOnboardingError(400, "Status hanya dapat berupa Hadir atau Ghaib.");
  const result = await request("/rest/v1/rpc/set_boarding_attendance_status", { method: "POST", body: JSON.stringify({
    p_tenant_id: uuid(actor.tenantId, "Tenant"), p_student_id: uuid(input.studentId, "Santri"),
    p_attendance_date: isoDate(input.attendanceDate), p_status: status,
    p_actor_user_id: uuid(actor.uid, "Akun"), p_expected_role: actorRole, p_client_request_id: uuid(input.clientRequestId, "ID permintaan"),
  }) });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Status kehadiran belum tersimpan.");
  return { recordId: String(result.recordId), status: String(result.status), alreadyApplied: Boolean(result.alreadyApplied) };
}

function legacyIsoDate(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") value = (value as any).toDate();
  else if (value && typeof value === "object" && typeof (value as any).seconds === "number") value = new Date((value as any).seconds * 1000);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

export async function migrateSupabaseLegacyBoardingAttendance(
  actor: Actor, dateValue: unknown, sourceRows: Array<{ sourceId: string; value: Record<string, any> }>, apply: boolean, expectedFingerprint = "",
) {
  if (!(actor.role === "Admin" || actor.role === "SuperAdmin")) throw new SupabaseOnboardingError(403, "Hanya Admin tenant yang dapat mengimpor snapshot kehadiran.");
  const tenantId = uuid(actor.tenantId, "Tenant"), attendanceDate = isoDate(dateValue);
  if (!Array.isArray(sourceRows) || sourceRows.length > 1000) throw new SupabaseOnboardingError(413, "Impor kehadiran dibatasi maksimal 1.000 record per tenant.");
  const [students, structures] = await Promise.all([
    tenantRows("students", tenantId, "id,source_record_id,name,nis,room_id,status", "name.asc,id.asc"),
    tenantRows("master_data_records", tenantId, "id,name,category", "name.asc,id.asc"),
  ]);
  const active = students.filter((student) => String(student.status || "").toLowerCase() !== "archived");
  const byId = new Map(active.map((student) => [String(student.id), student] as const));
  const bySource = new Map<string, Row[]>(), byNis = new Map<string, Row[]>(), byName = new Map<string, Row[]>();
  const add = (map: Map<string, Row[]>, key: string, row: Row) => map.set(key, [...(map.get(key) || []), row]);
  for (const student of active) {
    if (student.source_record_id) add(bySource, String(student.source_record_id), student);
    if (student.nis) add(byNis, String(student.nis).trim(), student);
    if (student.name) add(byName, folded(student.name), student);
  }
  const rooms = structures.filter((row) => row.category === "Kamar");
  const roomById = new Map(rooms.map((row) => [String(row.id), row] as const));
  const roomByName = new Map<string, Row[]>();
  for (const room of rooms) if (room.name) add(roomByName, folded(room.name), room);
  const issues: Array<{ sourceId: string; reason: string }> = [], warnings: Array<{ sourceId: string; reason: string }> = [];
  const rows: PreparedAttendance[] = [], sourceIds = new Set<string>(), studentsSeen = new Set<string>();
  for (const source of [...sourceRows].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId)))) {
    const sourceRecordId = String(source?.sourceId || "").trim(), value = source?.value || {};
    const issue = (reason: string) => issues.push({ sourceId: sourceRecordId || "(tanpa id)", reason });
    if (!sourceRecordId || sourceRecordId.length > 1500 || sourceIds.has(sourceRecordId)) { issue("ID dokumen kosong, terlalu panjang, atau duplikat."); continue; }
    sourceIds.add(sourceRecordId);
    const providedDate = legacyIsoDate(value.attendanceDate || value.date);
    if (providedDate && providedDate !== attendanceDate) { issue(`Tanggal sumber ${providedDate} berbeda dari tanggal snapshot yang dipilih (${attendanceDate}).`); continue; }
    const key = String(value.studentId || value.santriId || "").trim(), nis = String(value.nis || "").trim();
    const name = String(value.santriName || value.studentName || value.name || "").trim(), roomText = String(value.room || value.roomId || "").trim();
    let room = roomById.get(roomText);
    if (!room && roomText) { const matches = roomByName.get(folded(roomText)) || []; if (matches.length === 1) room = matches[0]; }
    let candidates: Row[] = [];
    if (key && UUID_PATTERN.test(key) && byId.has(key)) candidates = [byId.get(key)!];
    else if (key && bySource.has(key)) candidates = bySource.get(key)!;
    else if (nis && byNis.has(nis)) candidates = byNis.get(nis)!;
    else if (name) candidates = byName.get(folded(name)) || [];
    if (candidates.length > 1 && room) candidates = candidates.filter((student) => String(student.room_id || "") === String(room!.id));
    if (candidates.length !== 1) { issue(candidates.length ? "Identitas santri ambigu; gunakan NIS atau ID yang tepat." : "Santri tidak cocok dengan satu data aktif pada tenant."); continue; }
    const student = candidates[0], status = String(value.status || "").trim();
    if (!["Hadir", "Ghaib"].includes(status)) { issue("Status sumber bukan Hadir atau Ghaib."); continue; }
    const studentId = String(student.id);
    if (studentsSeen.has(studentId)) { issue("Ada lebih dari satu record sumber untuk santri yang sama pada satu sesi tanggal."); continue; }
    studentsSeen.add(studentId);
    const roomId = room ? String(room.id) : (student.room_id ? String(student.room_id) : null);
    const roomName = room ? String(room.name || "") : (roomText || null);
    if ((roomId && !roomById.has(roomId)) || (roomName && roomName.length > 180)) { issue("Relasi kamar tidak valid atau nama kamar melebihi batas."); continue; }
    if (roomText && !room) warnings.push({ sourceId: sourceRecordId, reason: "Nama kamar lama tidak cocok; snapshot nama dipertahankan dan relasi memakai kamar aktif santri bila ada." });
    rows.push({ sourceRecordId, studentId, roomId, roomName, status });
  }
  const existing = await tenantRows("boarding_attendance_records", tenantId,
    "student_id,room_id,room_name_snapshot,status,source_system,source_record_id,session_id", "created_at.asc,id.asc");
  const sessions = await request("/rest/v1/boarding_attendance_sessions?" + new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, attendance_date: "eq." + attendanceDate, session_type: "eq.nightly_curfew", limit: "2" }).toString());
  const sessionId = Array.isArray(sessions) && sessions.length === 1 ? String(sessions[0].id) : "";
  const oldBySource = new Map(existing.filter((row) => row.source_system === "legacy_import" && row.source_record_id).map((row) => [String(row.source_record_id), row] as const));
  const oldBySessionStudent = new Map(existing.filter((row) => sessionId && String(row.session_id) === sessionId)
    .map((row) => [String(row.student_id), row] as const));
  let alreadyPresent = 0;
  for (const row of rows) {
    const old = oldBySource.get(row.sourceRecordId);
    if (!old) {
      const sameSessionRecord = oldBySessionStudent.get(row.studentId);
      if (sameSessionRecord) issues.push({ sourceId: row.sourceRecordId, reason: "Santri sudah memiliki catatan kehadiran pada tanggal ini; tidak akan ditimpa." });
      continue;
    }
    const same = String(old.session_id) === sessionId && String(old.student_id) === row.studentId
      && String(old.room_id || "") === String(row.roomId || "") && String(old.room_name_snapshot || "") === String(row.roomName || "")
      && String(old.status) === row.status;
    if (same) alreadyPresent++; else issues.push({ sourceId: row.sourceRecordId, reason: "Record sumber sudah diimpor dengan nilai berbeda." });
  }
  const previewFingerprint = createHash("sha256").update(JSON.stringify({ tenantId, attendanceDate, rows, issues, warnings })).digest("hex");
  const report = { attendanceDate, dryRun: !apply, previewFingerprint, sourceCount: sourceRows.length, planned: rows.length, alreadyImported: alreadyPresent, imported: 0, unchanged: 0, canApply: issues.length === 0, issues, warnings };
  if (!apply) return report;
  if (expectedFingerprint !== previewFingerprint) throw new SupabaseOnboardingError(409, "Snapshot atau tanggal berubah sejak preview. Jalankan preview ulang sebelum apply.");
  if (issues.length) throw new SupabaseOnboardingError(409, "Preview kehadiran memiliki record yang perlu direkonsiliasi.");
  const result = await request("/rest/v1/rpc/import_legacy_boarding_attendance", { method: "POST", body: JSON.stringify({
    p_tenant_id: tenantId, p_actor_user_id: uuid(actor.uid, "Akun"), p_attendance_date: attendanceDate,
    p_source_fingerprint: previewFingerprint, p_rows: rows,
  }) });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi impor kehadiran.");
  return { ...report, dryRun: false, alreadyImported: Boolean(result.alreadyImported), imported: Number(result.imported || 0), unchanged: Number(result.unchanged || 0) };
}
