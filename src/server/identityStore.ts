import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

export class IdentityUnavailableError extends Error {}
export class IdentityConflictError extends Error {}

export type StoredUserProfile = {
  uid: string;
  email: string;
  name: string;
  username: string;
  role: string;
  status: string;
  tenantId: string;
  tenantName: string;
  tenantTimeZone: string;
  tenantType?: string;
  unitId?: string;
  mustChangePassword: boolean;
  modulePermissions: Record<string, boolean>;
  createdAt: string | null;
  updatedAt: string | null;
  createdByUid: string | null;
  updatedByUid: string | null;
  linkedSantriId: string | null;
  linkedSantriName: string | null;
  linkedSantriNis: string | null;
  linkedSantriClass: string | null;
  linkedSantriRoom: string | null;
};

type CanonicalProfileRow = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
  role?: string | null;
  status?: string | null;
  tenant_id?: string | null;
  unit_id?: string | null;
  must_change_password?: boolean | null;
  module_permissions?: Record<string, boolean> | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_uid?: string | null;
  updated_by_uid?: string | null;
  linked_santri_id?: string | null;
  linked_santri_name?: string | null;
  linked_santri_nis?: string | null;
  linked_santri_class?: string | null;
  linked_santri_room?: string | null;
  tenants?: { name?: string | null; tenant_type?: string | null; status?: string | null; time_zone?: string | null } | null;
};

let adminClient: SupabaseClient | null = null;

function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new IdentityUnavailableError("Layanan identitas Supabase belum dikonfigurasi di server.");
  }
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

const CANONICAL_PROFILE_SELECT = [
  "user_id", "tenant_id", "email", "display_name", "username", "role", "status", "must_change_password",
  "unit_id", "module_permissions", "linked_santri_id", "linked_santri_name", "linked_santri_nis",
  "linked_santri_class", "linked_santri_room", "created_at", "updated_at", "created_by_uid", "updated_by_uid",
  "tenants(name,tenant_type,status,time_zone)",
].join(",");

function mapCanonicalProfile(row: CanonicalProfileRow): StoredUserProfile {
  const roleByDatabaseValue: Record<string, string> = {
    super_admin: "SuperAdmin",
    admin: "Admin",
    ustadz: "Ustadz",
    santri: "Santri",
    wali_santri: "Walisantri",
  };
  const profileStatus = String(row.status || "active").toLowerCase();
  const status = String(row.tenants?.status || "").toLowerCase() === "active"
    ? profileStatus
    : "suspended";
  const permissions = row.module_permissions && typeof row.module_permissions === "object"
    ? row.module_permissions
    : {};
  return {
    uid: row.user_id,
    email: row.email || "",
    name: row.display_name || "",
    username: row.username || "",
    role: roleByDatabaseValue[String(row.role || "").toLowerCase()] || String(row.role || ""),
    status: status === "suspended" ? "disabled" : status === "invited" ? "inactive" : status,
    tenantId: row.tenant_id || "",
    tenantName: row.tenants?.name || row.tenant_id || "",
    tenantTimeZone: row.tenants?.time_zone || "Asia/Jakarta",
    tenantType: row.tenants?.tenant_type || undefined,
    unitId: row.unit_id || undefined,
    mustChangePassword: Boolean(row.must_change_password),
    modulePermissions: permissions,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    createdByUid: row.created_by_uid || null,
    updatedByUid: row.updated_by_uid || null,
    linkedSantriId: row.linked_santri_id || null,
    linkedSantriName: row.linked_santri_name || null,
    linkedSantriNis: row.linked_santri_nis || null,
    linkedSantriClass: row.linked_santri_class || null,
    linkedSantriRoom: row.linked_santri_room || null,
  };
}

export async function verifyAccessToken(token: string): Promise<{ uid: string; email?: string }> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid session");
  }
  return { uid: data.user.id, email: data.user.email ?? undefined };
}

export async function getUserProfile(uid: string): Promise<StoredUserProfile | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("profiles").select(CANONICAL_PROFILE_SELECT).eq("user_id", uid).maybeSingle();
  if (error) throw new IdentityUnavailableError("Profil pengguna tidak dapat dibaca dari Supabase.");
  return data ? mapCanonicalProfile(data as unknown as CanonicalProfileRow) : null;
}

export async function checkIdentityStoreReady(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("profiles")
    .select("user_id")
    .limit(1)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new IdentityUnavailableError("Pemeriksaan kesiapan database gagal.");
}

export type TenantProfileListOptions = {
  query?: string;
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type TenantProfileListPage = {
  profiles: StoredUserProfile[];
  total: number;
};

const TENANT_PROFILE_BATCH_SIZE = 500;

export async function listTenantProfiles(tenantId: string): Promise<StoredUserProfile[]> {
  const supabase = supabaseAdmin();
  const profiles: StoredUserProfile[] = [];
  let lastUserId = "";

  while (true) {
    let query = supabase.from("profiles")
      .select(CANONICAL_PROFILE_SELECT)
      .eq("tenant_id", tenantId)
      .order("user_id", { ascending: true })
      .limit(TENANT_PROFILE_BATCH_SIZE);
    if (lastUserId) query = query.gt("user_id", lastUserId);
    const { data, error } = await query;
    if (error) throw new IdentityUnavailableError("Daftar pengguna tidak dapat dibaca dari Supabase.");
    const rows = (data || []) as unknown as CanonicalProfileRow[];
    profiles.push(...rows.map(mapCanonicalProfile));
    if (rows.length < TENANT_PROFILE_BATCH_SIZE) break;
    lastUserId = String(rows[rows.length - 1].user_id);
  }

  return profiles;
}

export async function listTenantProfilesPage(
  tenantId: string,
  options: TenantProfileListOptions = {},
): Promise<TenantProfileListPage> {
  const supabase = supabaseAdmin();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  let query = supabase.from("profiles")
    .select(CANONICAL_PROFILE_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId);

  const roleByUiValue: Record<string, string> = {
    SuperAdmin: "super_admin",
    Admin: "admin",
    Ustadz: "ustadz",
    Santri: "santri",
    Walisantri: "wali_santri",
  };
  if (options.role) {
    const role = roleByUiValue[options.role];
    if (!role) throw new IdentityConflictError("Filter peran pengguna tidak valid.");
    query = query.eq("role", role);
  }

  const statusByUiValue: Record<string, string> = {
    active: "active",
    disabled: "suspended",
    inactive: "invited",
  };
  if (options.status) {
    const status = statusByUiValue[options.status];
    if (!status) throw new IdentityConflictError("Filter status pengguna tidak valid.");
    query = query.eq("status", status);
  }

  const search = String(options.query || "").trim();
  if (search) {
    const escaped = search
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/[%_*]/g, (character) => `\\\\${character}`);
    const pattern = `"%${escaped}%"`;
    query = query.or([
      `display_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `username.ilike.${pattern}`,
    ].join(","));
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("user_id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new IdentityUnavailableError("Daftar pengguna tidak dapat dibaca dari Supabase.");
  return {
    profiles: (data || []).map((row) => mapCanonicalProfile(row as unknown as CanonicalProfileRow)),
    total: Number(count || 0),
  };
}

type TenantStudentRow = {
  id: string;
  nis?: string | null;
  name?: string | null;
  grade?: string | null;
  room_id?: string | null;
  status?: string | null;
  source_record_id?: string | null;
};

async function resolveStudentProfileLink(input: {
  tenantId: string;
  role: string;
  linkedSantriId?: string;
  linkedSantriNis?: string;
}): Promise<Pick<StoredUserProfile, "linkedSantriId" | "linkedSantriName" | "linkedSantriNis" | "linkedSantriClass" | "linkedSantriRoom">> {
  if (input.role !== "Santri" && input.role !== "Walisantri") {
    return {
      linkedSantriId: null,
      linkedSantriName: null,
      linkedSantriNis: null,
      linkedSantriClass: null,
      linkedSantriRoom: null,
    };
  }

  const supabase = supabaseAdmin();
  const linkedId = String(input.linkedSantriId || "").trim();
  const nis = String(input.linkedSantriNis || "").trim();
  if (!linkedId && !nis) {
    throw new IdentityConflictError("Akun Santri dan Wali harus ditautkan ke santri tenant melalui NIS.");
  }
  if (nis && !/^\d{1,10}$/.test(nis)) {
    throw new IdentityConflictError("NIS santri yang ditautkan tidak valid.");
  }

  let query = supabase.from("students")
    .select("id,nis,name,grade,room_id,status,source_record_id")
    .eq("tenant_id", input.tenantId)
    .limit(2);
  if (nis) {
    query = query.eq("nis", nis);
  } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(linkedId)) {
    query = query.eq("id", linkedId);
  } else {
    query = query.eq("source_record_id", linkedId);
  }

  const { data, error } = await query;
  if (error) throw new IdentityUnavailableError("Data santri tenant tidak dapat diverifikasi di Supabase.");
  const students = (data || []) as TenantStudentRow[];
  if (students.length !== 1) {
    throw new IdentityConflictError("Santri tidak ditemukan atau tidak unik pada tenant akun ini.");
  }

  const student = students[0];
  if (linkedId && linkedId !== student.id && linkedId !== student.source_record_id) {
    throw new IdentityConflictError("ID dan NIS santri yang ditautkan tidak merujuk pada santri yang sama.");
  }
  const studentStatus = String(student.status || "").trim().toLowerCase();
  if (!["active", "aktif"].includes(studentStatus)) {
    throw new IdentityConflictError("Santri yang ditautkan tidak berstatus aktif.");
  }

  if (input.role === "Walisantri") {
    const { data: relations, error: relationError } = await supabase.from("guardian_students")
      .select("guardian_id")
      .eq("tenant_id", input.tenantId)
      .eq("student_id", student.id)
      .limit(21);
    if (relationError) throw new IdentityUnavailableError("Relasi Wali dan santri tidak dapat diverifikasi di Supabase.");
    const guardianIds = [...new Set((relations || [])
      .map((row: { guardian_id?: string }) => String(row.guardian_id || "").trim())
      .filter(Boolean))];
    if (guardianIds.length === 0) {
      throw new IdentityConflictError("Santri belum memiliki data Wali yang terverifikasi pada Master Data.");
    }

    const { data: guardians, error: guardianError } = await supabase.from("guardians")
      .select("id,status")
      .eq("tenant_id", input.tenantId)
      .in("id", guardianIds)
      .limit(21);
    if (guardianError) throw new IdentityUnavailableError("Status data Wali tidak dapat diverifikasi di Supabase.");
    const activeGuardianIds = new Set((guardians || [])
      .filter((guardian: { status?: string }) => ["active", "aktif"].includes(String(guardian.status || "").trim().toLowerCase()))
      .map((guardian: { id: string }) => String(guardian.id)));
    if (!guardianIds.some((guardianId) => activeGuardianIds.has(guardianId))) {
      throw new IdentityConflictError("Santri belum memiliki data Wali aktif pada tenant ini.");
    }
  }

  return {
    linkedSantriId: student.id,
    linkedSantriName: String(student.name || "").trim() || null,
    linkedSantriNis: String(student.nis || "").trim() || null,
    linkedSantriClass: String(student.grade || "").trim() || null,
    linkedSantriRoom: String(student.room_id || "").trim() || null,
  };
}

export async function createAuthUserWithProfile(input: {
  email: string;
  password: string;
  name: string;
  username: string;
  role: string;
  tenantId: string;
  tenantName: string;
  modulePermissions: Record<string, boolean>;
  createdByUid: string;
  linkedSantriId?: string;
  linkedSantriName?: string;
  linkedSantriNis?: string;
  linkedSantriClass?: string;
  linkedSantriRoom?: string;
}): Promise<StoredUserProfile> {
  const supabase = supabaseAdmin();
  const tenantResult = await supabase.from("tenants")
    .select("id,name,tenant_type,status,time_zone")
    .eq("id", input.tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (tenantResult.error) throw new IdentityUnavailableError("Tenant pengguna tidak dapat diverifikasi di Supabase.");
  if (!tenantResult.data) throw new IdentityConflictError("Tenant tidak ditemukan atau sedang tidak aktif.");

  // Never persist a student/Wali relationship taken directly from a browser
  // payload. Resolve it against the tenant roster before creating Auth users.
  const studentLink = await resolveStudentProfileLink({
    tenantId: input.tenantId,
    role: input.role,
    linkedSantriId: input.linkedSantriId,
    linkedSantriNis: input.linkedSantriNis,
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error || !data.user) {
    const message = String(error?.message || "");
    if (/already|registered|exists/i.test(message)) {
      throw new IdentityConflictError("Alamat email ini sudah terdaftar dalam sistem.");
    }
    throw new IdentityUnavailableError("Gagal membuat akun pengguna.");
  }

  const now = new Date().toISOString();
  const roleByUiValue: Record<string, string> = {
    SuperAdmin: "super_admin", Admin: "admin", Ustadz: "ustadz", Santri: "santri", Walisantri: "wali_santri",
  };
  const row: CanonicalProfileRow = {
    user_id: data.user.id,
    email: input.email,
    display_name: input.name,
    username: input.username,
    role: roleByUiValue[input.role],
    tenant_id: input.tenantId,
    status: "active",
    must_change_password: true,
    module_permissions: input.modulePermissions,
    created_at: now,
    updated_at: now,
    created_by_uid: input.createdByUid,
    linked_santri_id: studentLink.linkedSantriId,
    linked_santri_name: studentLink.linkedSantriName,
    linked_santri_nis: studentLink.linkedSantriNis,
    linked_santri_class: studentLink.linkedSantriClass,
    linked_santri_room: studentLink.linkedSantriRoom,
    tenants: {
      name: tenantResult.data.name,
      tenant_type: tenantResult.data.tenant_type,
      status: tenantResult.data.status,
      time_zone: tenantResult.data.time_zone,
    },
  };
  const inserted = await supabase.from("profiles").insert({
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    email: row.email,
    display_name: row.display_name,
    username: row.username,
    role: row.role,
    status: row.status,
    must_change_password: row.must_change_password,
    module_permissions: row.module_permissions,
    unit_id: row.unit_id || null,
    linked_santri_id: row.linked_santri_id,
    linked_santri_name: row.linked_santri_name,
    linked_santri_nis: row.linked_santri_nis,
    linked_santri_class: row.linked_santri_class,
    linked_santri_room: row.linked_santri_room,
    created_by_uid: row.created_by_uid,
    updated_by_uid: row.updated_by_uid || null,
    created_at: now,
    updated_at: now,
  });
  if (inserted.error) {
    try { await supabase.auth.admin.deleteUser(data.user.id); } catch { /* Keep auth and profile in step. */ }
    throw new IdentityUnavailableError("Gagal menyimpan profil pengguna.");
  }
  return mapCanonicalProfile(row);
}

export async function updateUserProfile(uid: string, patch: {
  name?: string;
  role?: string;
  status?: string;
  modulePermissions?: Record<string, boolean>;
  updatedByUid: string;
}): Promise<void> {
  const supabase = supabaseAdmin();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_uid: patch.updatedByUid,
  };
  if (patch.name) row.display_name = patch.name;
  if (patch.role) {
    const roleByUiValue: Record<string, string> = {
      SuperAdmin: "super_admin", Admin: "admin", Ustadz: "ustadz", Santri: "santri", Walisantri: "wali_santri",
    };
    row.role = roleByUiValue[patch.role];
  }
  if (patch.status) row.status = patch.status === "inactive" ? "invited" : patch.status === "disabled" ? "suspended" : "active";
  if (patch.modulePermissions) row.module_permissions = patch.modulePermissions;
  const { error } = await supabase.from("profiles").update(row).eq("user_id", uid);
  if (error) throw new IdentityUnavailableError("Gagal memperbarui profil pengguna.");
}

export async function setAuthDisabled(uid: string, disabled: boolean): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase.auth.admin.updateUserById(uid, {
    ban_duration: disabled ? "876600h" : "none",
  });
  if (error) throw new IdentityUnavailableError("Status autentikasi Supabase tidak dapat diperbarui.");
}

export async function createRecoveryLink(email: string): Promise<string> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  const link = data?.properties?.action_link;
  if (error || !link) throw new IdentityUnavailableError("Gagal membuat tautan reset password.");
  return link;
}


export type GuardianAccountCandidate = {
  id: string;
  name: string;
  students: Array<{ id: string; nis: string; name: string; grade: string }>;
};

async function readIdentityPages<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  message: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const result = await queryFactory(offset, offset + pageSize - 1);
    if (result.error) throw new IdentityUnavailableError(message);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new IdentityUnavailableError("Data Wali melebihi batas aman pemrosesan.");
}

export async function listGuardianAccountCandidates(tenantId: string): Promise<GuardianAccountCandidate[]> {
  const supabase = supabaseAdmin();
  const [guardians, relations, students, accounts] = await Promise.all([
    readIdentityPages((from, to) => supabase.from("guardians").select("id,name,status")
      .eq("tenant_id", tenantId).order("id", { ascending: true }).range(from, to),
      "Daftar Wali tidak dapat dibaca dari Supabase."),
    readIdentityPages((from, to) => supabase.from("guardian_students").select("guardian_id,student_id")
      .eq("tenant_id", tenantId).order("guardian_id", { ascending: true }).order("student_id", { ascending: true }).range(from, to),
      "Relasi Wali dan santri tidak dapat dibaca dari Supabase."),
    readIdentityPages((from, to) => supabase.from("students").select("id,nis,name,grade,status")
      .eq("tenant_id", tenantId).order("id", { ascending: true }).range(from, to),
      "Daftar santri tidak dapat dibaca dari Supabase."),
    readIdentityPages((from, to) => supabase.from("guardian_user_accounts").select("guardian_id")
      .eq("tenant_id", tenantId).order("guardian_id", { ascending: true }).range(from, to),
      "Status akun Wali tidak dapat dibaca dari Supabase."),
  ]);

  const activeGuardians = new Map(guardians
    .filter((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))
    .map((row: any) => [String(row.id), { id: String(row.id), name: String(row.name || "").trim() }]));
  const activeStudents = new Map(students
    .filter((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))
    .map((row: any) => [String(row.id), {
      id: String(row.id), nis: String(row.nis || ""), name: String(row.name || ""), grade: String(row.grade || ""),
    }]));
  const alreadyLinked = new Set(accounts.map((row: any) => String(row.guardian_id)));
  const linkedStudents = new Map<string, Map<string, { id: string; nis: string; name: string; grade: string }>>();
  for (const relation of relations as Array<{ guardian_id?: string; student_id?: string }>) {
    const guardianId = String(relation.guardian_id || "");
    const student = activeStudents.get(String(relation.student_id || ""));
    if (!guardianId || !student || !activeGuardians.has(guardianId)) continue;
    const collection = linkedStudents.get(guardianId) || new Map();
    collection.set(student.id, student);
    linkedStudents.set(guardianId, collection);
  }

  return [...activeGuardians.values()]
    .filter((guardian) => !alreadyLinked.has(guardian.id) && (linkedStudents.get(guardian.id)?.size || 0) > 0)
    .map((guardian) => ({
      ...guardian,
      students: [...(linkedStudents.get(guardian.id)?.values() || [])]
        .sort((left, right) => left.name.localeCompare(right.name, "id")),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "id"));
}
function configuredPublicAppUrl(): URL {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "").trim();
  let url: URL;
  try { url = new URL(configured); } catch {
    throw new IdentityUnavailableError("PUBLIC_APP_URL belum dikonfigurasi untuk tautan undangan Wali.");
  }
  if (!["https:", "http:"].includes(url.protocol)
      || (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
      || url.username || url.password || url.search || url.hash) {
    throw new IdentityUnavailableError("PUBLIC_APP_URL tidak memenuhi konfigurasi keamanan.");
  }
  return url;
}

export async function createGuardianAccountInvitation(input: {
  tenantId: string;
  guardianId: string;
  email: string;
  modulePermissions: Record<string, boolean>;
  createdByUid: string;
}): Promise<{ inviteUrl?: string; expiresAt?: string; linkedExistingAccount?: boolean; linkedStudentCount?: number }> {
  const supabase = supabaseAdmin();
  const email = input.email.trim().toLowerCase();
  const guardianId = input.guardianId.trim();
  const tenantId = input.tenantId.trim();
  const guardian = await supabase.from("guardians")
    .select("id,name,status")
    .eq("tenant_id", tenantId)
    .eq("id", guardianId)
    .maybeSingle();
  if (guardian.error) throw new IdentityUnavailableError("Data Wali tidak dapat diverifikasi pada tenant aktif.");
  if (!guardian.data || !["active", "aktif"].includes(String(guardian.data.status || "").trim().toLowerCase())) {
    throw new IdentityConflictError("Pilih data Wali aktif dari daftar tenant.");
  }
  const relation = await readIdentityPages((from, to) => supabase.from("guardian_students")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("guardian_id", guardianId)
    .order("student_id", { ascending: true })
    .range(from, to), "Relasi Wali dan santri tidak dapat diverifikasi.");
  const linkedStudentIds = [...new Set(relation.map((row: any) => String(row.student_id || "")).filter(Boolean))];
  if (!linkedStudentIds.length) throw new IdentityConflictError("Wali belum terhubung ke data santri.");
  if (linkedStudentIds.length > 5000) throw new IdentityUnavailableError("Relasi Wali melebihi batas aman pemrosesan.");
  const students = await readIdentityPages((from, to) => supabase.from("students")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .in("id", linkedStudentIds)
    .order("id", { ascending: true })
    .range(from, to), "Status santri Wali tidak dapat diverifikasi.");
  if (!students.some((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))) {
    throw new IdentityConflictError("Wali belum memiliki santri aktif pada tenant ini.");
  }
  const existingAccount = await supabase.from("guardian_user_accounts")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("guardian_id", guardianId)
    .maybeSingle();
  if (existingAccount.error) throw new IdentityUnavailableError("Status akun Wali tidak dapat diverifikasi.");
  if (existingAccount.data) throw new IdentityConflictError("Data Wali ini sudah memiliki akun. Gunakan alur pemulihan akun.");

  const existingProfile = await supabase.from("profiles")
    .select("user_id,role,status")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (existingProfile.error) throw new IdentityUnavailableError("Profil email Wali tidak dapat diverifikasi.");
  if (existingProfile.data) {
    if (existingProfile.data.role !== "wali_santri" || existingProfile.data.status !== "active") {
      throw new IdentityConflictError("Email ini sudah terdaftar pada profil ERP dengan role atau status lain.");
    }
    const linked = await supabase.rpc("link_existing_guardian_account", {
      p_tenant_id: tenantId,
      p_guardian_id: guardianId,
      p_user_id: String(existingProfile.data.user_id),
      p_actor_user_id: input.createdByUid,
    });
    if (linked.error || !linked.data || linked.data.success !== true) {
      if (["42501", "23505", "22023"].includes(String(linked.error?.code || ""))) {
        throw new IdentityConflictError("Profil Wali tidak dapat ditautkan. Pastikan email terverifikasi dan akun belum terhubung ke data Wali lain.");
      }
      throw new IdentityUnavailableError("Akun Wali lama tidak dapat ditautkan ke data Master Data.");
    }
    return { linkedExistingAccount: true, linkedStudentCount: Number(linked.data.linkedStudentCount || 0) };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const revoked = await supabase.from("guardian_account_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("guardian_id", guardianId)
    .eq("status", "pending");
  if (revoked.error) throw new IdentityUnavailableError("Undangan Wali sebelumnya tidak dapat diperbarui.");

  const invitation = await supabase.from("guardian_account_invitations").insert({
    tenant_id: tenantId,
    guardian_id: guardianId,
    email,
    token_hash: String.fromCharCode(92) + "x" + tokenHash.toString("hex"),
    module_permissions: input.modulePermissions,
    expires_at: expiresAt,
    created_by_uid: input.createdByUid,
  }).select("id").single();
  if (invitation.error) {
    if (invitation.error.code === "23505") throw new IdentityConflictError("Email atau data Wali telah digunakan untuk akun lain.");
    throw new IdentityUnavailableError("Undangan Wali tidak dapat disimpan.");
  }

  const activationUrl = configuredPublicAppUrl();
  activationUrl.searchParams.set("guardianInvite", token);
  let generated = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: activationUrl.toString(), data: { name: String(guardian.data.name || "") } },
  });
  if (generated.error && /already|registered|exists/i.test(String(generated.error.message || ""))) {
    generated = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: activationUrl.toString() },
    });
  }
  const inviteUrl = generated.data?.properties?.action_link;
  if (generated.error || !inviteUrl) {
    await supabase.from("guardian_account_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", invitation.data.id)
      .eq("status", "pending");
    const message = String(generated.error?.message || "");
    if (/already|registered|exists/i.test(message)) {
      throw new IdentityConflictError("Email sudah memiliki akun autentikasi yang belum tertaut. Pastikan pemilik email dapat membuka tautan aktivasi; jika gagal, lakukan pemulihan akun terlebih dahulu.");
    }
    throw new IdentityUnavailableError("Tautan aktivasi Wali tidak dapat dibuat.");
  }
  return { inviteUrl, expiresAt };
}

export async function verifyGuardianAccountInvitation(token: string, userId: string, email: string): Promise<string> {
  const supabase = supabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  const authUser = await supabase.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) throw new IdentityConflictError("Akun autentikasi tidak dapat diverifikasi.");
  const verifiedEmail = String(authUser.data.user.email || "").trim().toLowerCase();
  if (!authUser.data.user.email_confirmed_at || verifiedEmail !== normalizedEmail) {
    throw new IdentityConflictError("Konfirmasikan email undangan sebelum aktivasi.");
  }

  const tokenHash = createHash("sha256").update(token, "utf8").digest();
  const invitation = await supabase.from("guardian_account_invitations")
    .select("tenant_id,guardian_id,email,status,expires_at")
    .eq("token_hash", String.fromCharCode(92) + "x" + tokenHash.toString("hex"))
    .maybeSingle();
  if (invitation.error) throw new IdentityUnavailableError("Status undangan Wali tidak dapat diverifikasi.");
  const record = invitation.data;
  if (!record || record.status !== "pending" || new Date(record.expires_at).getTime() <= Date.now()
      || String(record.email || "").trim().toLowerCase() !== verifiedEmail) {
    throw new IdentityConflictError("Undangan Wali tidak valid, kedaluwarsa, sudah digunakan, atau tidak cocok dengan akun ini.");
  }

  const guardian = await supabase.from("guardians")
    .select("id,status")
    .eq("tenant_id", record.tenant_id)
    .eq("id", record.guardian_id)
    .maybeSingle();
  if (guardian.error) throw new IdentityUnavailableError("Data Wali pada undangan tidak dapat diverifikasi.");
  if (!guardian.data || !["active", "aktif"].includes(String(guardian.data.status || "").trim().toLowerCase())) {
    throw new IdentityConflictError("Undangan Wali tidak lagi berlaku untuk data aktif.");
  }

  const relations = await readIdentityPages((from, to) => supabase.from("guardian_students")
    .select("student_id")
    .eq("tenant_id", record.tenant_id)
    .eq("guardian_id", record.guardian_id)
    .order("student_id", { ascending: true })
    .range(from, to), "Relasi Wali dan santri tidak dapat diverifikasi.");
  const studentIds = [...new Set(relations.map((row: any) => String(row.student_id || "")).filter(Boolean))];
  if (!studentIds.length) throw new IdentityConflictError("Wali belum terhubung ke santri aktif.");
  const students = await readIdentityPages((from, to) => supabase.from("students")
    .select("id,status")
    .eq("tenant_id", record.tenant_id)
    .in("id", studentIds)
    .order("id", { ascending: true })
    .range(from, to), "Status santri pada undangan tidak dapat diverifikasi.");
  if (!students.some((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))) {
    throw new IdentityConflictError("Wali belum memiliki santri aktif pada tenant ini.");
  }

  return verifiedEmail;
}
export async function claimGuardianAccountInvitation(token: string, userId: string, email: string): Promise<number> {
  const supabase = supabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  const authUser = await supabase.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) throw new IdentityConflictError("Akun autentikasi tidak dapat diverifikasi.");
  if (!authUser.data.user.email_confirmed_at || String(authUser.data.user.email || "").trim().toLowerCase() !== normalizedEmail) {
    throw new IdentityConflictError("Konfirmasikan email undangan sebelum aktivasi.");
  }
  const tokenHash = createHash("sha256").update(token, "utf8").digest();
  const result = await supabase.rpc("claim_guardian_account_invitation", {
    p_token_hash: String.fromCharCode(92) + "x" + tokenHash.toString("hex"),
    p_user_id: userId,
    p_email: normalizedEmail,
  });
  if (result.data?.code === "INVITATION_EXPIRED") {
    throw new IdentityConflictError("Undangan Wali telah kedaluwarsa. Minta Admin membuat tautan aktivasi baru.");
  }
  if (result.error || !result.data || result.data.success !== true) {
    if (["42501", "23505", "22023"].includes(String(result.error?.code || ""))) {
      throw new IdentityConflictError("Undangan Wali tidak valid, kedaluwarsa, sudah digunakan, atau tidak cocok dengan akun ini.");
    }
    throw new IdentityUnavailableError("Aktivasi Wali tidak dapat diselesaikan di Supabase.");
  }
  return Number(result.data.linkedStudentCount || 0);
}

export type GuardianStudentOption = { id: string; name: string; nis: string; className: string };

export async function listGuardianStudentIds(tenantId: string, userId: string): Promise<string[]> {
  const supabase = supabaseAdmin();
  const profile = await supabase.from("profiles")
    .select("role,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (profile.error) throw new IdentityUnavailableError("Profil Wali tidak dapat diverifikasi.");
  if (!profile.data || profile.data.role !== "wali_santri" || profile.data.status !== "active") {
    throw new IdentityConflictError("Akun Wali tidak aktif pada tenant ini.");
  }
  const account = await supabase.from("guardian_user_accounts")
    .select("guardian_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (account.error) throw new IdentityUnavailableError("Relasi akun Wali tidak dapat diverifikasi.");
  if (!account.data) throw new IdentityConflictError("Akun Wali belum terhubung ke data Wali.");
  const guardian = await supabase.from("guardians")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", account.data.guardian_id)
    .maybeSingle();
  if (guardian.error) throw new IdentityUnavailableError("Status data Wali tidak dapat diverifikasi.");
  if (!guardian.data || !["active", "aktif"].includes(String(guardian.data.status || "").trim().toLowerCase())) {
    throw new IdentityConflictError("Data Wali tidak aktif.");
  }
  const relation = await readIdentityPages((from, to) => supabase.from("guardian_students")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("guardian_id", account.data!.guardian_id)
    .order("student_id", { ascending: true })
    .range(from, to), "Relasi Wali dan santri tidak dapat dibaca.");
  const studentIds = [...new Set(relation.map((row: any) => String(row.student_id || "")).filter(Boolean))];
  if (!studentIds.length) return [];
  const activeIds: string[] = [];
  for (let index = 0; index < studentIds.length; index += 100) {
    const batch = studentIds.slice(index, index + 100);
    const students = await readIdentityPages((from, to) => supabase.from("students")
      .select("id,status")
      .eq("tenant_id", tenantId)
      .in("id", batch)
      .order("id", { ascending: true })
      .range(from, to), "Status santri Wali tidak dapat diverifikasi.");
    activeIds.push(...students
      .filter((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))
      .map((row: any) => String(row.id)));
  }
  return activeIds;
}

export async function listGuardianStudents(tenantId: string, userId: string): Promise<GuardianStudentOption[]> {
  const supabase = supabaseAdmin();
  const studentIds = await listGuardianStudentIds(tenantId, userId);
  if (!studentIds.length) return [];
  const result: GuardianStudentOption[] = [];
  for (let index = 0; index < studentIds.length; index += 100) {
    const batch = studentIds.slice(index, index + 100);
    const students = await readIdentityPages((from, to) => supabase.from("students")
      .select("id,name,nis,grade,status")
      .eq("tenant_id", tenantId)
      .in("id", batch)
      .order("id", { ascending: true })
      .range(from, to), "Data santri Wali tidak dapat dibaca.");
    result.push(...students
      .filter((row: any) => ["active", "aktif"].includes(String(row.status || "").trim().toLowerCase()))
      .map((row: any) => ({ id: String(row.id), name: String(row.name || "Santri"), nis: String(row.nis || ""), className: String(row.grade || "") })));
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id));
}

export async function guardianCanAccessStudent(tenantId: string, userId: string, studentId: string): Promise<boolean> {
  const result = await supabaseAdmin().rpc("guardian_can_access_student", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_student_id: studentId,
  });
  if (result.error) throw new IdentityUnavailableError("Akses santri Wali tidak dapat diverifikasi.");
  return result.data === true;
}
export async function clearPasswordChangeRequired(uid: string): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) throw new IdentityUnavailableError("Gagal memperbarui status kata sandi pengguna.");
}
