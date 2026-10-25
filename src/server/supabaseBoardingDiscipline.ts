import { readPostgrestRowsInPages } from "./postgrestPagination";
import { createHash } from "node:crypto";
import { SupabaseOnboardingError } from "./supabaseOnboarding";

type JsonObject = Record<string, any>;
type BoardingActor = { uid: string; tenantId: string; role: string; linkedSantriId?: string | null };
type PreparedIncident = {
  sourceRecordId: string;
  studentId: string;
  roomId: string | null;
  roomName: string | null;
  offense: string;
  category: string;
  points: number;
  incidentDate: string;
  resolved: boolean;
  photoUrl: string | null;
  resolution: string | null;
  createdAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_TO_DATABASE: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin", Ustadz: "ustadz" };

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) throw new SupabaseOnboardingError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { baseUrl, serviceKey } = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  if (serviceKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + serviceKey);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) throw new SupabaseOnboardingError(409, body?.message || "Catatan kedisiplinan bertentangan dengan data yang tersimpan.");
    if (code === "22023" || response.status === 400) throw new SupabaseOnboardingError(400, body?.message || "Data kedisiplinan tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseOnboardingError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseOnboardingError(403, body?.message || "Operasi kedisiplinan ditolak oleh kebijakan tenant.");
    throw new SupabaseOnboardingError(503, "Layanan kedisiplinan Supabase belum dapat diproses.");
  }
  return body;
}

function requiredUuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}

function actorRole(actor: BoardingActor) {
  const role = ROLE_TO_DATABASE[String(actor.role || "").trim()];
  if (!role) throw new SupabaseOnboardingError(403, "Role tidak didukung untuk pengelolaan kedisiplinan.");
  return role;
}

async function listTenantRows(table: string, tenantId: string, select: string, order: string) {
  const result: JsonObject[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: String(pageSize), offset: String(offset) });
    const rows = await supabaseRequest("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Data kedisiplinan tenant belum dapat dimuat.");
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
  throw new SupabaseOnboardingError(503, "Data kedisiplinan melebihi batas halaman yang didukung.");
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

function folded(value: unknown) { return String(value || "").trim().toLocaleLowerCase("id-ID"); }

function legacyIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") value = (value as any).toDate();
  else if (value && typeof value === "object" && typeof (value as any).seconds === "number") value = new Date((value as any).seconds * 1000);
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function legacyDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  const iso = legacyIso(value);
  return iso ? iso.slice(0, 10) : null;
}

export async function listSupabaseBoardingDiscipline(actor: BoardingActor) {
  const role = actorRole(actor);
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  if (!(["admin", "super_admin", "ustadz"] as string[]).includes(role)) throw new SupabaseOnboardingError(403, "Catatan kedisiplinan hanya dapat diakses petugas asrama.");
  const scope = role === "ustadz" ? await getBoardingLocationScope(tenantId, requiredUuid(actor.uid, "Akun")) : null;
  const [incidents, students, rooms] = await Promise.all([
    listTenantRows("boarding_discipline_incidents", tenantId,
      "id,student_id,room_id,room_name_snapshot,offense,category,points,incident_date,resolved,photo_url,resolution,created_at,source_system", "incident_date.desc,created_at.desc,id.desc"),
    listTenantRows("students", tenantId, "id,name,nis,room_id,building_id,status", "name.asc,id.asc"),
    listTenantRows("master_data_records", tenantId, "id,name,category", "name.asc,id.asc"),
  ]);
  const visibleStudents = students.filter((row) => String(row.status || "").toLowerCase() !== "archived"
    && (!scope || isStudentInScope(row, scope)));
  const studentById = new Map((scope ? visibleStudents : students).map((row) => [String(row.id), row] as const));
  const roomById = new Map(rooms.filter((row) => row.category === "Kamar").map((row) => [String(row.id), String(row.name || row.id)] as const));
  return {
    incidents: incidents.filter((row) => !scope || studentById.has(String(row.student_id))).map((row) => {
      const student = studentById.get(String(row.student_id));
      const roomId = String(row.room_id || student?.room_id || "");
      return {
        id: String(row.id), studentId: String(row.student_id), santriName: String(student?.name || "Santri diarsipkan"),
        nis: String(student?.nis || ""), roomId, room: String(row.room_name_snapshot || roomById.get(roomId) || "Belum ditempatkan"),
        offense: String(row.offense), category: String(row.category), points: Number(row.points), date: String(row.incident_date),
        resolved: Boolean(row.resolved), photoUrl: row.photo_url ? String(row.photo_url) : null,
        resolution: row.resolution ? String(row.resolution) : "", createdAt: String(row.created_at || ""),
      };
    }),
    students: visibleStudents
      .map((row) => ({ id: String(row.id), name: String(row.name || ""), nis: String(row.nis || ""), roomId: row.room_id ? String(row.room_id) : null })),
    canManage: true,
  };
}

export async function createSupabaseBoardingDiscipline(actor: BoardingActor, value: unknown) {
  const role = actorRole(actor);
  if (!(["admin", "super_admin", "ustadz"] as string[]).includes(role)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat mencatat kedisiplinan.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Data catatan tidak valid.");
  const input = value as JsonObject;
  const studentId = requiredUuid(input.studentId, "Santri");
  const clientRequestId = requiredUuid(input.clientRequestId, "ID permintaan");
  const offense = String(input.offense || "").trim();
  const category = String(input.category || "").trim();
  const points = Number(input.points);
  const incidentDate = String(input.incidentDate || "").trim();
  const photoUrl = input.photoUrl == null ? null : String(input.photoUrl).trim() || null;
  const resolution = input.resolution == null ? null : String(input.resolution).trim() || null;
  if (!offense || offense.length > 1000 || !["Ringan", "Sedang", "Berat"].includes(category)
    || !Number.isInteger(points) || points < 1 || points > 1000 || !legacyDate(incidentDate)
    || (photoUrl && (!photoUrl.startsWith("https://") || photoUrl.length > 2000)) || (resolution && resolution.length > 2000)) {
    throw new SupabaseOnboardingError(400, "Pelanggaran, kategori, poin, tanggal, atau bukti tidak valid.");
  }
  const result = await supabaseRequest("/rest/v1/rpc/create_boarding_discipline_incident", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: requiredUuid(actor.tenantId, "Tenant"), p_student_id: studentId, p_offense: offense,
      p_category: category, p_points: points, p_incident_date: incidentDate, p_photo_url: photoUrl,
      p_resolution: resolution, p_actor_user_id: requiredUuid(actor.uid, "Akun"), p_expected_role: role,
      p_client_request_id: clientRequestId,
    }),
  });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Catatan kedisiplinan belum tersimpan.");
  return { incidentId: String(result.incidentId), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function resolveSupabaseBoardingDiscipline(actor: BoardingActor, incidentIdValue: unknown, value: unknown) {
  const role = actorRole(actor);
  if (!(["admin", "super_admin", "ustadz"] as string[]).includes(role)) throw new SupabaseOnboardingError(403, "Role ini tidak dapat menyelesaikan catatan kedisiplinan.");
  const incidentId = requiredUuid(incidentIdValue, "Catatan");
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const clientRequestId = requiredUuid(input.clientRequestId, "ID permintaan");
  const result = await supabaseRequest("/rest/v1/rpc/resolve_boarding_discipline_incident", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: requiredUuid(actor.tenantId, "Tenant"), p_incident_id: incidentId,
      p_actor_user_id: requiredUuid(actor.uid, "Akun"), p_expected_role: role, p_client_request_id: clientRequestId,
    }),
  });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Perubahan status kedisiplinan belum tersimpan.");
  return { incidentId: String(result.incidentId), resolved: Boolean(result.resolved), alreadyApplied: Boolean(result.alreadyApplied) };
}

/** Admin-only, preview-first import. Ambiguous identity and non-https evidence block the full atomic apply. */
export async function migrateSupabaseLegacyBoardingDiscipline(
  actor: BoardingActor,
  sourceRows: Array<{ sourceId: string; value: Record<string, any> }>,
  apply: boolean,
  expectedPreviewFingerprint = "",
) {
  if (!(actor.role === "Admin" || actor.role === "SuperAdmin")) throw new SupabaseOnboardingError(403, "Hanya Admin tenant yang dapat mengimpor histori kedisiplinan.");
  const tenantId = requiredUuid(actor.tenantId, "Tenant");
  if (!Array.isArray(sourceRows) || sourceRows.length > 1000) throw new SupabaseOnboardingError(413, "Impor kedisiplinan dibatasi maksimal 1.000 record per tenant.");
  const [students, structures] = await Promise.all([
    listTenantRows("students", tenantId, "id,source_record_id,name,nis,room_id,status", "name.asc,id.asc"),
    listTenantRows("master_data_records", tenantId, "id,name,category", "name.asc,id.asc"),
  ]);
  const activeStudents = students.filter((row) => String(row.status || "").toLowerCase() !== "archived");
  const bySource = new Map<string, JsonObject[]>(), byNis = new Map<string, JsonObject[]>(), byName = new Map<string, JsonObject[]>();
  const byId = new Map(activeStudents.map((row) => [String(row.id), row] as const));
  const add = (map: Map<string, JsonObject[]>, key: string, student: JsonObject) => map.set(key, [...(map.get(key) || []), student]);
  for (const student of activeStudents) {
    if (student.source_record_id) add(bySource, String(student.source_record_id), student);
    if (student.nis) add(byNis, String(student.nis).trim(), student);
    if (student.name) add(byName, folded(student.name), student);
  }
  const rooms = structures.filter((row) => row.category === "Kamar");
  const roomById = new Map(rooms.map((row) => [String(row.id), row] as const));
  const roomByName = new Map<string, JsonObject[]>();
  for (const room of rooms) if (room.name) add(roomByName, folded(room.name), room);
  const issues: Array<{ sourceId: string; reason: string }> = [];
  const warnings: Array<{ sourceId: string; reason: string }> = [];
  const prepared: PreparedIncident[] = [];
  const seen = new Set<string>();
  for (const source of [...sourceRows].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId)))) {
    const sourceId = String(source?.sourceId || "").trim(), value = source?.value || {};
    const issue = (reason: string) => issues.push({ sourceId: sourceId || "(tanpa id)", reason });
    if (!sourceId || sourceId.length > 1500 || seen.has(sourceId)) { issue("ID dokumen kosong, terlalu panjang, atau duplikat."); continue; }
    seen.add(sourceId);
    const studentKey = String(value.studentId || value.santriId || "").trim();
    const nis = String(value.nis || value.santriNis || "").trim();
    const name = String(value.santriName || value.studentName || value.name || "").trim();
    const roomText = String(value.room || value.roomId || "").trim();
    let room = roomById.get(roomText);
    if (!room && roomText) { const matches = roomByName.get(folded(roomText)) || []; if (matches.length === 1) room = matches[0]; }
    let matches: JsonObject[] = [];
    if (studentKey && UUID_PATTERN.test(studentKey) && byId.has(studentKey)) matches = [byId.get(studentKey)!];
    else if (studentKey && bySource.has(studentKey)) matches = bySource.get(studentKey)!;
    else if (nis && byNis.has(nis)) matches = byNis.get(nis)!;
    else if (name) matches = byName.get(folded(name)) || [];
    if (matches.length > 1 && room) matches = matches.filter((student) => String(student.room_id || "") === String(room.id));
    if (matches.length !== 1) { issue(matches.length ? "Identitas santri cocok dengan lebih dari satu record; tambahkan NIS/ID atau rekonsiliasi." : "Identitas santri tidak cocok dengan satu data aktif dalam tenant."); continue; }
    const student = matches[0];
    const offense = String(value.offense || "").trim();
    const category = String(value.category || "").trim();
    const points = Number(value.points);
    const incidentDate = legacyDate(value.date || value.incidentDate);
    const photoUrl = value.photoUrl == null ? null : String(value.photoUrl).trim() || null;
    const resolution = String(value.resolution || "").trim() || null;
    const createdAt = legacyIso(value.createdAt || value.created_at) || (incidentDate ? `${incidentDate}T00:00:00.000Z` : null);
    if (!offense || offense.length > 1000 || !["Ringan", "Sedang", "Berat"].includes(category)
      || !Number.isInteger(points) || points < 1 || points > 1000 || !incidentDate
      || (photoUrl && (!photoUrl.startsWith("https://") || photoUrl.length > 2000))
      || (resolution && resolution.length > 2000) || !createdAt) {
      issue("Pelanggaran, kategori, poin, tanggal, URL bukti, atau resolusi tidak valid; koreksi sumber sebelum impor."); continue;
    }
    const resolved = value.resolved === true || String(value.resolved || "").trim().toLowerCase() === "true";
    const roomId = room ? String(room.id) : (student.room_id ? String(student.room_id) : null);
    const roomName = room ? String(room.name || "") : (roomText || null);
    if ((roomId && !roomById.has(roomId)) || (roomName && roomName.length > 180)) {
      issue("Relasi kamar tidak valid atau nama kamar melebihi batas; rekonsiliasi Master Data sebelum impor."); continue;
    }
    if (roomText && !room) warnings.push({ sourceId, reason: "Nama kamar lama tidak ditemukan; snapshot dipertahankan dan relasi memakai kamar aktif santri bila tersedia." });
    prepared.push({ sourceRecordId: sourceId, studentId: String(student.id), roomId, roomName, offense, category, points, incidentDate, resolved, photoUrl, resolution, createdAt });
  }
  const existingRows = await listTenantRows("boarding_discipline_incidents", tenantId,
    "student_id,room_id,room_name_snapshot,offense,category,points,incident_date,resolved,photo_url,resolution,source_system,source_record_id", "created_at.asc,id.asc");
  const existing = new Map(existingRows.filter((row) => row.source_system === "legacy_import" && row.source_record_id).map((row) => [String(row.source_record_id), row] as const));
  let alreadyPresent = 0;
  for (const row of prepared) {
    const old = existing.get(row.sourceRecordId); if (!old) continue;
    const same = String(old.student_id) === row.studentId && String(old.room_id || "") === String(row.roomId || "")
      && String(old.room_name_snapshot || "") === String(row.roomName || "") && String(old.offense) === row.offense
      && String(old.category) === row.category && Number(old.points) === row.points && String(old.incident_date) === row.incidentDate
      && Boolean(old.resolved) === row.resolved && String(old.photo_url || "") === String(row.photoUrl || "")
      && String(old.resolution || "") === String(row.resolution || "");
    if (same) alreadyPresent += 1; else issues.push({ sourceId: row.sourceRecordId, reason: "Record legacy sudah ada dengan data berbeda; record tidak akan ditimpa." });
  }
  const previewFingerprint = createHash("sha256").update(JSON.stringify({ tenantId, prepared, issues, warnings })).digest("hex");
  const report = { dryRun: !apply, previewFingerprint, sourceCount: sourceRows.length, planned: prepared.length, alreadyImported: alreadyPresent, imported: 0, unchanged: 0, canApply: issues.length === 0, issues, warnings };
  if (!apply) return report;
  if (expectedPreviewFingerprint !== previewFingerprint) throw new SupabaseOnboardingError(409, "Snapshot kedisiplinan berubah sejak preview. Jalankan preview ulang sebelum apply.");
  if (issues.length) throw new SupabaseOnboardingError(409, "Preview kedisiplinan memiliki record yang perlu direkonsiliasi sebelum impor.");
  const result = await supabaseRequest("/rest/v1/rpc/import_legacy_boarding_discipline", { method: "POST", body: JSON.stringify({
    p_tenant_id: tenantId, p_actor_user_id: requiredUuid(actor.uid, "Akun"), p_source_fingerprint: previewFingerprint,
    p_rows: prepared.map((row) => ({ ...row, createdAt: row.createdAt })),
  }) });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi impor histori kedisiplinan.");
  return { ...report, dryRun: false, alreadyImported: Boolean(result.alreadyImported), imported: Number(result.imported || 0), unchanged: Number(result.unchanged || 0) };
}
