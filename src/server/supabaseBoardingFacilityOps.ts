import { listGuardianStudentIds } from "./identityStore";
import { readPostgrestRowsInPages } from "./postgrestPagination";
import { createHash } from "node:crypto";
import { SupabaseOnboardingError } from "./supabaseOnboarding";

type Row = Record<string, any>;
type Actor = { uid: string; tenantId: string; role: string; name?: string; linkedSantriId?: string | null };
type Scope = { roomIds: Set<string>; buildingIds: Set<string> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin", Ustadz: "ustadz", Santri: "santri", Walisantri: "wali_santri" };

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
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) throw new SupabaseOnboardingError(409, body?.message || "Data operasional asrama bertentangan dengan data tersimpan.");
    if (code === "22023" || response.status === 400) throw new SupabaseOnboardingError(400, body?.message || "Data operasional asrama tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseOnboardingError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseOnboardingError(403, body?.message || "Operasi asrama ditolak oleh kebijakan tenant.");
    throw new SupabaseOnboardingError(503, "Layanan operasional asrama Supabase belum dapat diproses.");
  }
  return body;
}
function uuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}
function actorRole(actor: Actor) {
  const role = ROLE[String(actor.role || "").trim()];
  if (!role) throw new SupabaseOnboardingError(403, "Role tidak didukung untuk operasional asrama.");
  return role;
}
async function rows(table: string, tenantId: string, select: string, order: string, extra: Record<string, string> = {}) {
  const result: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: "500", offset: String(offset), ...extra });
    const page = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(page)) throw new SupabaseOnboardingError(503, "Data operasional asrama belum dapat dimuat.");
    result.push(...page);
    if (page.length < 500) return result;
  }
  throw new SupabaseOnboardingError(503, "Data asrama melebihi batas halaman yang didukung.");
}
async function locationScope(tenantId: string, userId: string, structures: Row[]): Promise<Scope> {
  const path = "/rest/v1/boarding_staff_assignments?" + new URLSearchParams({
    select: "room_id,building_id", tenant_id: "eq." + tenantId, user_id: "eq." + userId,
    status: "eq.active", order: "id.asc",
  }).toString();
  const assignments = await readPostgrestRowsInPages<Row>({
    request: request, path, maxRows: 5000,
    onIncomplete: () => new SupabaseOnboardingError(503, "Penugasan petugas asrama melebihi batas aman atau hasilnya tidak lengkap."),
  });
  const activeRooms = new Set(structures.filter((item) => item.category === "Kamar"
    && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase())).map((item) => String(item.id)));
  const activeBuildings = new Set(structures.filter((item) => item.category === "Gedung"
    && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase())).map((item) => String(item.id)));
  const roomIds = new Set<string>(), buildingIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.room_id && activeRooms.has(String(assignment.room_id))) roomIds.add(String(assignment.room_id));
    if (assignment.building_id && activeBuildings.has(String(assignment.building_id))) buildingIds.add(String(assignment.building_id));
  }
  if (!roomIds.size && !buildingIds.size) throw new SupabaseOnboardingError(403, "Akun Ustadz belum memiliki penugasan lokasi aktif.");
  return { roomIds, buildingIds };
}
async function linkedStudent(actor: Actor, tenantId: string) {
  const linkedId = String(actor.linkedSantriId || "").trim();
  if (!linkedId) throw new SupabaseOnboardingError(403, "Profil belum tertaut ke data santri.");
  const matches = new Map<string, Row>();
  if (UUID.test(linkedId)) {
    const params = new URLSearchParams({ select: "id,name,room_id,building_id,source_record_id,status", tenant_id: "eq." + tenantId, id: "eq." + linkedId, limit: "2" });
    const direct = await request("/rest/v1/students?" + params.toString());
    if (Array.isArray(direct)) direct.forEach((row: Row) => matches.set(String(row.id), row));
  }
  const params = new URLSearchParams({ select: "id,name,room_id,building_id,source_record_id,status", tenant_id: "eq." + tenantId, source_record_id: "eq." + linkedId, limit: "2" });
  const bySource = await request("/rest/v1/students?" + params.toString());
  if (Array.isArray(bySource)) bySource.forEach((row: Row) => matches.set(String(row.id), row));
  const active = [...matches.values()].filter((row) => String(row.status || "").toLowerCase() !== "archived");
  if (active.length !== 1) throw new SupabaseOnboardingError(403, "Tautan santri pada profil tidak valid atau belum unik.");
  return active[0];
}
async function linkedStudents(actor: Actor, tenantId: string): Promise<Row[]> {
  if (actor.role !== "Walisantri") return [await linkedStudent(actor, tenantId)];
  let studentIds: string[];
  try { studentIds = await listGuardianStudentIds(tenantId, uuid(actor.uid, "Akun")); }
  catch { throw new SupabaseOnboardingError(403, "Akun Wali belum terhubung ke santri aktif."); }
  if (!studentIds.length) throw new SupabaseOnboardingError(403, "Akun Wali belum terhubung ke santri aktif.");
  const linked = new Set(studentIds);
  const candidates = await rows("students", tenantId,
    "id,name,room_id,building_id,source_record_id,status", "name.asc,id.asc");
  const visible = candidates.filter((student) => linked.has(String(student.id))
    && !["archived", "inactive", "nonaktif", "tidak aktif"].includes(String(student.status || "").trim().toLowerCase()));
  if (visible.length !== studentIds.length) throw new SupabaseOnboardingError(403, "Relasi santri Wali tidak valid atau belum lengkap.");
  return visible;
}function isAssignedRoom(room: Row, scope: Scope) {
  return scope.roomIds.has(String(room.id)) || (room.parent_id && scope.buildingIds.has(String(room.parent_id)));
}
function date(value: unknown) {
  const day = typeof value === "string" ? value.trim() : "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + "T00:00:00.000Z") : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new SupabaseOnboardingError(400, "Tanggal audit tidak valid.");
  }
  return day;
}

export async function listSupabaseBoardingFacilityOps(actor: Actor) {
  const tenantId = uuid(actor.tenantId, "Tenant"), userId = uuid(actor.uid, "Akun"), role = actorRole(actor);
  const [structures, auditRows, ticketRows] = await Promise.all([
    rows("master_data_records", tenantId, "id,name,category,status,parent_id", "category.asc,name.asc,id.asc"),
    role === "santri" || role === "wali_santri" ? Promise.resolve([]) : rows("boarding_cleanliness_audits", tenantId, "id,room_id,audit_date,score,notes,inspector_name_snapshot,created_at", "audit_date.desc,created_at.desc,id.desc"),
    rows("boarding_facility_tickets", tenantId, "id,room_id,issue,description,priority,status,reporter_name_snapshot,created_at,resolved_at", "created_at.desc,id.desc"),
  ]);
  const activeRooms = structures.filter((item) => item.category === "Kamar"
    && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase()));
  let visibleRooms = activeRooms;
  if (role === "ustadz") {
    const scope = await locationScope(tenantId, userId, structures);
    visibleRooms = activeRooms.filter((room) => isAssignedRoom(room, scope));
  } else if (role === "santri" || role === "wali_santri") {
    const students = await linkedStudents(actor, tenantId);
    const linkedRoomIds = new Set(students.map((student) => String(student.room_id || "")).filter(Boolean));
    visibleRooms = activeRooms.filter((room) => linkedRoomIds.has(String(room.id)));
  } else if (!(role === "admin" || role === "super_admin")) {
    throw new SupabaseOnboardingError(403, "Role tidak dapat mengakses audit dan tiket asrama.");
  }
  const allowedRoomIds = new Set(visibleRooms.map((item) => String(item.id)));
  const roomById = new Map(structures.map((item) => [String(item.id), String(item.name || item.id)] as const));
  const visibleAudits = role === "santri" || role === "wali_santri" ? [] : auditRows.filter((item) => allowedRoomIds.has(String(item.room_id)));
  const visibleTickets = (role === "santri" || role === "wali_santri" || role === "ustadz")
    ? ticketRows.filter((item) => allowedRoomIds.has(String(item.room_id))) : ticketRows;
  return {
    rooms: visibleRooms.map((item) => ({ id: String(item.id), name: String(item.name || item.id), buildingId: item.parent_id ? String(item.parent_id) : null })),
    audits: visibleAudits.map((item) => ({ id: String(item.id), roomId: String(item.room_id), room: roomById.get(String(item.room_id)) || String(item.room_id), date: String(item.audit_date), score: Number(item.score), notes: String(item.notes || ""), inspector: String(item.inspector_name_snapshot || "Pengguna"), createdAt: String(item.created_at || "") })),
    tickets: visibleTickets.map((item) => ({ id: String(item.id), roomId: String(item.room_id), room: roomById.get(String(item.room_id)) || String(item.room_id), issue: String(item.issue), description: String(item.description || ""), priority: String(item.priority), status: String(item.status), reportedBy: String(item.reporter_name_snapshot), date: String(item.created_at || "").slice(0, 10), resolvedAt: item.resolved_at ? String(item.resolved_at) : null })),
    canCreateAudit: ["admin", "super_admin", "ustadz"].includes(role),
    canCreateTicket: ["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(role),
    canResolveTicket: ["admin", "super_admin", "ustadz"].includes(role),
  };
}

export async function createSupabaseBoardingCleanlinessAudit(actor: Actor, value: unknown) {
  const role = actorRole(actor);
  if (!["admin", "super_admin", "ustadz"].includes(role)) throw new SupabaseOnboardingError(403, "Role tidak dapat membuat audit kebersihan.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Data audit tidak valid.");
  const input = value as Row, score = Number(input.score), notes = String(input.notes || "").trim();
  if (!Number.isInteger(score) || score < 0 || score > 100 || notes.length > 2000) throw new SupabaseOnboardingError(400, "Nilai dan catatan audit tidak valid.");
  const result = await request("/rest/v1/rpc/create_boarding_cleanliness_audit", { method: "POST", body: JSON.stringify({
    p_tenant_id: uuid(actor.tenantId, "Tenant"), p_room_id: String(input.roomId || "").trim(), p_audit_date: date(input.date),
    p_score: score, p_notes: notes, p_actor_user_id: uuid(actor.uid, "Akun"), p_expected_role: role,
    p_client_request_id: uuid(input.clientRequestId, "ID permintaan"),
  }) });
  if (!result?.success) throw new SupabaseOnboardingError(503, "Audit kebersihan belum tersimpan.");
  return { auditId: String(result.auditId), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function createSupabaseBoardingFacilityTicket(actor: Actor, value: unknown) {
  const role = actorRole(actor);
  if (!["admin", "super_admin", "ustadz", "santri", "wali_santri"].includes(role)) throw new SupabaseOnboardingError(403, "Role tidak dapat membuat tiket fasilitas.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Data tiket tidak valid.");
  const input = value as Row, issue = String(input.issue || "").trim(), description = String(input.description || "").trim();
  const priority = String(input.priority || "Medium").trim();
  const reporterName = String(actor.name || "Pengguna").trim().slice(0, 200) || "Pengguna";
  if (!issue || issue.length > 200 || description.length > 4000 || !["Low", "Medium", "High", "Urgent"].includes(priority)) throw new SupabaseOnboardingError(400, "Judul, uraian, atau prioritas tiket tidak valid.");
  const result = await request("/rest/v1/rpc/create_boarding_facility_ticket", { method: "POST", body: JSON.stringify({
    p_tenant_id: uuid(actor.tenantId, "Tenant"), p_room_id: String(input.roomId || "").trim(), p_issue: issue,
    p_description: description, p_priority: priority, p_actor_user_id: uuid(actor.uid, "Akun"), p_expected_role: role,
    p_reporter_name: reporterName, p_client_request_id: uuid(input.clientRequestId, "ID permintaan"),
  }) });
  if (!result?.success) throw new SupabaseOnboardingError(503, "Tiket fasilitas belum tersimpan.");
  return { ticketId: String(result.ticketId), status: String(result.status), alreadyApplied: Boolean(result.alreadyApplied) };
}

export async function resolveSupabaseBoardingFacilityTicket(actor: Actor, ticketIdValue: unknown, clientRequestIdValue: unknown) {
  const role = actorRole(actor);
  if (!["admin", "super_admin", "ustadz"].includes(role)) throw new SupabaseOnboardingError(403, "Role tidak dapat menyelesaikan tiket fasilitas.");
  const result = await request("/rest/v1/rpc/resolve_boarding_facility_ticket", { method: "POST", body: JSON.stringify({
    p_tenant_id: uuid(actor.tenantId, "Tenant"), p_ticket_id: uuid(ticketIdValue, "Tiket"),
    p_actor_user_id: uuid(actor.uid, "Akun"), p_expected_role: role,
    p_client_request_id: uuid(clientRequestIdValue, "ID permintaan"),
  }) });
  if (!result?.success) throw new SupabaseOnboardingError(503, "Tiket fasilitas belum dapat diselesaikan.");
  return { ticketId: String(result.ticketId), status: String(result.status), alreadyApplied: Boolean(result.alreadyApplied) };
}

function normalizedRoomLabel(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}
function legacyDate(value: unknown, label: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (!match) throw new SupabaseOnboardingError(400, `${label} tidak valid pada snapshot legacy.`);
  date(match[1]);
  return match[1];
}
function legacyTimestamp(value: unknown, fallbackDate: string) {
  const raw = String(value || "").trim();
  if (!raw) return `${fallbackDate}T12:00:00.000Z`;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new SupabaseOnboardingError(400, "Waktu tiket tidak valid pada snapshot legacy.");
  return parsed.toISOString();
}
function mapLegacyRoom(value: unknown, rooms: Row[]) {
  const raw = String(value || "").trim();
  if (!raw) return { roomId: "", issue: "Kamar sumber kosong." };
  const byId = rooms.filter((room) => String(room.id) === raw);
  if (byId.length === 1) return { roomId: raw, issue: "" };
  const key = normalizedRoomLabel(raw);
  const byName = rooms.filter((room) => normalizedRoomLabel(room.name) === key);
  if (byName.length === 1) return { roomId: String(byName[0].id), issue: "" };
  return { roomId: "", issue: byName.length > 1 ? `Nama kamar “${raw}” cocok ke lebih dari satu kamar.` : `Kamar “${raw}” tidak ditemukan di Master Data Supabase.` };
}

/** Build a non-destructive preview; applying rechecks the exact source fingerprint before the atomic RPC. */
export async function migrateSupabaseLegacyBoardingFacilityOps(
  actor: Actor,
  auditSource: Row[],
  ticketSource: Row[],
  apply: boolean,
  expectedFingerprint = "",
) {
  const tenantId = uuid(actor.tenantId, "Tenant"), actorId = uuid(actor.uid, "Akun"), role = actorRole(actor);
  if (!['admin', 'super_admin'].includes(role)) throw new SupabaseOnboardingError(403, "Hanya Admin tenant yang dapat mengimpor riwayat fasilitas.");
  if (!Array.isArray(auditSource) || auditSource.length > 1000 || !Array.isArray(ticketSource) || ticketSource.length > 1000) {
    throw new SupabaseOnboardingError(413, "Preview dibatasi maksimal 1.000 audit dan 1.000 tiket.");
  }
  const [structures, existingAudits, existingTickets] = await Promise.all([
    rows("master_data_records", tenantId, "id,name,category,status", "category.asc,name.asc,id.asc"),
    rows("boarding_cleanliness_audits", tenantId, "source_system,source_record_id", "created_at.asc,id.asc", { source_system: "eq.legacy_firestore" }),
    rows("boarding_facility_tickets", tenantId, "source_system,source_record_id", "created_at.asc,id.asc", { source_system: "eq.legacy_firestore" }),
  ]);
  const rooms = structures.filter((item) => item.category === "Kamar");
  const errors: Array<{ id: string; type: string; message: string }> = [];
  const auditIds = new Set<string>(), ticketIds = new Set<string>();
  const auditRows = auditSource.map((source, index) => {
    const id = String(source.sourceRecordId || source.id || `row-${index + 1}`).trim();
    const match = mapLegacyRoom(source.roomId || source.room, rooms);
    const auditDate = (() => { try { return legacyDate(source.auditDate || source.date, "Tanggal audit"); } catch (error: any) { errors.push({ id, type: "Audit", message: error.message }); return ""; } })();
    const score = Number(source.score);
    const notes = String(source.notes || "").trim();
    const inspectorName = String(source.inspectorName || source.inspector || "Pengguna").trim() || "Pengguna";
    if (!id || id.length > 300 || auditIds.has(id)) errors.push({ id, type: "Audit", message: "ID sumber audit kosong atau duplikat." });
    auditIds.add(id);
    if (match.issue) errors.push({ id, type: "Audit", message: match.issue });
    if (!Number.isInteger(score) || score < 0 || score > 100) errors.push({ id, type: "Audit", message: "Skor audit harus bilangan bulat 0–100." });
    if (notes.length > 2000) errors.push({ id, type: "Audit", message: "Catatan audit melebihi 2.000 karakter." });
    return { sourceRecordId: id, roomId: match.roomId, auditDate, score, notes, inspectorName };
  });
  const ticketRows = ticketSource.map((source, index) => {
    const id = String(source.sourceRecordId || source.id || `row-${index + 1}`).trim();
    const match = mapLegacyRoom(source.roomId || source.room, rooms);
    let ticketDate = "";
    try { ticketDate = legacyDate(source.date || source.createdAt, "Tanggal tiket"); } catch (error: any) { errors.push({ id, type: "Tiket", message: error.message }); }
    let createdAt = "";
    try { createdAt = legacyTimestamp(source.createdAt || source.date, ticketDate || new Date(0).toISOString()); } catch (error: any) { errors.push({ id, type: "Tiket", message: error.message }); }
    const issue = String(source.issue || "").trim();
    const description = String(source.description || "").trim();
    const reporter = String(source.reportedBy || source.reporter || "Pengguna").trim() || "Pengguna";
    const priorityInput = String(source.priority || "Medium").trim().toLocaleLowerCase("id-ID");
    const statusInput = String(source.status || "Open").trim().toLocaleLowerCase("id-ID");
    const priority = ({ low: "Low", rendah: "Low", medium: "Medium", normal: "Medium", sedang: "Medium", high: "High", tinggi: "High", urgent: "Urgent", darurat: "Urgent" } as Record<string, string>)[priorityInput] || "";
    const status = (["resolved", "complete", "completed", "closed", "selesai"].includes(statusInput) ? "Resolved"
      : ["open", "pending", "new", "terbuka"].includes(statusInput) ? "Open" : "");
    let resolvedAt: string | null = null;
    if (status === "Resolved") {
      try { resolvedAt = legacyTimestamp(source.resolvedAt, ticketDate || new Date(0).toISOString()); }
      catch (error: any) { errors.push({ id, type: "Tiket", message: error.message }); }
    }
    if (!id || id.length > 300 || ticketIds.has(id)) errors.push({ id, type: "Tiket", message: "ID sumber tiket kosong atau duplikat." });
    ticketIds.add(id);
    if (match.issue) errors.push({ id, type: "Tiket", message: match.issue });
    if (!issue || issue.length > 200) errors.push({ id, type: "Tiket", message: "Judul tiket wajib diisi dan maksimal 200 karakter." });
    if (description.length > 4000) errors.push({ id, type: "Tiket", message: "Uraian tiket melebihi 4.000 karakter." });
    if (!priority) errors.push({ id, type: "Tiket", message: "Prioritas tiket legacy tidak dikenali." });
    if (!status) errors.push({ id, type: "Tiket", message: "Status tiket legacy tidak dikenali." });
    if (reporter.length > 200) errors.push({ id, type: "Tiket", message: "Nama pelapor melebihi 200 karakter." });
    return { sourceRecordId: id, roomId: match.roomId, issue, description, priority, status, reportedBy: reporter, createdAt, resolvedAt };
  });
  const existingAuditIds = new Set(existingAudits.filter((row) => row.source_system === "legacy_firestore").map((row) => String(row.source_record_id)));
  const existingTicketIds = new Set(existingTickets.filter((row) => row.source_system === "legacy_firestore").map((row) => String(row.source_record_id)));
  const previewFingerprint = createHash("sha256").update(JSON.stringify({ tenantId, actorId, auditRows, ticketRows, existingAuditIds: [...existingAuditIds].sort(), existingTicketIds: [...existingTicketIds].sort() })).digest("hex");
  const report = {
    dryRun: !apply,
    previewFingerprint,
    sourceCount: { audits: auditSource.length, tickets: ticketSource.length },
    planned: { audits: auditRows.filter((row) => !existingAuditIds.has(row.sourceRecordId)).length, tickets: ticketRows.filter((row) => !existingTicketIds.has(row.sourceRecordId)).length },
    alreadyImported: { audits: auditRows.filter((row) => existingAuditIds.has(row.sourceRecordId)).length, tickets: ticketRows.filter((row) => existingTicketIds.has(row.sourceRecordId)).length },
    blockingIssues: errors.slice(0, 200),
    canApply: errors.length === 0,
  };
  if (!apply) return report;
  if (!expectedFingerprint || expectedFingerprint !== previewFingerprint) throw new SupabaseOnboardingError(409, "Snapshot Firestore atau pemetaan kamar berubah sejak preview. Jalankan preview kembali.");
  if (errors.length) return report;
  const result = await request("/rest/v1/rpc/import_legacy_boarding_facility_ops", { method: "POST", body: JSON.stringify({
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_audits: auditRows, p_tickets: ticketRows,
  }) });
  if (!result?.success) throw new SupabaseOnboardingError(503, "Impor riwayat fasilitas belum dapat dikonfirmasi.");
  return { ...report, dryRun: false, imported: {
    audits: Number(result.auditsImported || 0), tickets: Number(result.ticketsImported || 0),
  }, unchanged: {
    audits: Number(result.auditsUnchanged || 0), tickets: Number(result.ticketsUnchanged || 0),
  } };
}
