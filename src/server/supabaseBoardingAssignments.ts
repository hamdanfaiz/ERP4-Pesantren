import { SupabaseOnboardingError } from "./supabaseOnboarding";

type Row = Record<string, any>;
type Actor = { uid: string; tenantId: string; role: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATABASE_ROLES: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin" };

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
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) throw new SupabaseOnboardingError(409, body?.message || "Penugasan bertentangan dengan data tenant.");
    if (code === "22023" || response.status === 400) throw new SupabaseOnboardingError(400, body?.message || "Data penugasan tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseOnboardingError(404, body?.message || "Akun atau lokasi tidak ditemukan pada tenant.");
    if (code === "42501" || response.status === 403) throw new SupabaseOnboardingError(403, body?.message || "Operasi penugasan ditolak oleh kebijakan tenant.");
    throw new SupabaseOnboardingError(503, "Layanan penugasan asrama belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}

async function listTenantRows(table: string, tenantId: string, select: string, order: string) {
  const result: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: "500", offset: String(offset) });
    const rows = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Daftar penugasan belum dapat dimuat.");
    result.push(...rows);
    if (rows.length < 500) return result;
  }
  throw new SupabaseOnboardingError(503, "Data penugasan melebihi batas halaman yang didukung.");
}

function requireAdmin(actor: Actor) {
  const role = DATABASE_ROLES[String(actor.role || "").trim()];
  if (!role) throw new SupabaseOnboardingError(403, "Hanya Admin tenant yang dapat mengelola penugasan petugas.");
  return role;
}

export async function listSupabaseBoardingStaffAssignments(actor: Actor) {
  requireAdmin(actor);
  const tenantId = uuid(actor.tenantId, "Tenant");
  const [profiles, structures, assignments] = await Promise.all([
    listTenantRows("profiles", tenantId, "user_id,display_name,email,role,status", "display_name.asc,user_id.asc"),
    listTenantRows("master_data_records", tenantId, "id,name,category,status,parent_id", "category.asc,name.asc,id.asc"),
    listTenantRows("boarding_staff_assignments", tenantId, "id,user_id,building_id,room_id,status,created_at,updated_at", "created_at.desc,id.desc"),
  ]);
  const staff = profiles.filter((profile) => String(profile.role || "").toLowerCase() === "ustadz" && String(profile.status || "").toLowerCase() === "active")
    .map((profile) => ({ id: String(profile.user_id), name: String(profile.display_name || profile.email || profile.user_id), email: String(profile.email || "") }));
  const structuresById = new Map(structures.map((item) => [String(item.id), item] as const));
  return {
    staff,
    locations: structures.filter((item) => ["Gedung", "Kamar"].includes(String(item.category))
      && !["inactive", "nonaktif", "disabled"].includes(String(item.status || "").toLowerCase()))
      .map((item) => ({ id: String(item.id), name: String(item.name || item.id), category: String(item.category), parentId: item.parent_id ? String(item.parent_id) : null })),
    assignments: assignments.map((assignment) => {
      const locationId = String(assignment.building_id || assignment.room_id || "");
      const location = structuresById.get(locationId);
      const person = staff.find((candidate) => candidate.id === String(assignment.user_id));
      return { id: String(assignment.id), userId: String(assignment.user_id), staffName: person?.name || "Akun Ustadz tidak aktif",
        locationId, locationName: String(location?.name || locationId), locationType: assignment.building_id ? "Gedung" : "Kamar",
        status: String(assignment.status), createdAt: String(assignment.created_at || "") };
    }),
  };
}

export async function setSupabaseBoardingStaffAssignment(actor: Actor, value: unknown) {
  const role = requireAdmin(actor);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseOnboardingError(400, "Data penugasan tidak valid.");
  const input = value as Row;
  const assignmentId = input.assignmentId ? uuid(input.assignmentId, "Penugasan") : null;
  const targetUserId = uuid(input.userId, "Akun Ustadz");
  const buildingId = input.buildingId == null || String(input.buildingId).trim() === "" ? null : String(input.buildingId).trim();
  const roomId = input.roomId == null || String(input.roomId).trim() === "" ? null : String(input.roomId).trim();
  const status = String(input.status || (assignmentId ? "inactive" : "active")).trim().toLowerCase();
  const requestId = uuid(input.clientRequestId, "ID permintaan");
  if (!assignmentId && status !== "active") throw new SupabaseOnboardingError(400, "Penugasan baru harus aktif.");
  if (!assignmentId && Number(Boolean(buildingId)) + Number(Boolean(roomId)) !== 1) throw new SupabaseOnboardingError(400, "Pilih satu gedung atau satu kamar.");
  if ((buildingId && (buildingId.length > 160 || buildingId.includes("/"))) || (roomId && (roomId.length > 160 || roomId.includes("/")))) {
    throw new SupabaseOnboardingError(400, "ID lokasi tidak valid.");
  }
  if (!["active", "inactive"].includes(status)) throw new SupabaseOnboardingError(400, "Status penugasan tidak valid.");
  const result = await request("/rest/v1/rpc/manage_boarding_staff_assignment", { method: "POST", body: JSON.stringify({
    p_tenant_id: uuid(actor.tenantId, "Tenant"), p_actor_user_id: uuid(actor.uid, "Akun Admin"), p_expected_role: role,
    p_assignment_id: assignmentId, p_target_user_id: targetUserId, p_building_id: buildingId, p_room_id: roomId,
    p_to_status: status, p_client_request_id: requestId,
  }) });
  if (!result || result.success !== true) throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi penugasan.");
  return { assignmentId: String(result.assignmentId), status: String(result.status), alreadyApplied: Boolean(result.alreadyApplied) };
}
