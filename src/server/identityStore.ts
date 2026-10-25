import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
      .replace(/[%_*]/g, (character) => \`\\\\\${character}\`);
    const pattern = \`"%\${escaped}%"\`;
    query = query.or([
      \`display_name.ilike.\${pattern}\`,
      \`email.ilike.\${pattern}\`,
      \`username.ilike.\${pattern}\`,
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
    linked_santri_id: input.linkedSantriId || null,
    linked_santri_name: input.linkedSantriName || null,
    linked_santri_nis: input.linkedSantriNis || null,
    linked_santri_class: input.linkedSantriClass || null,
    linked_santri_room: input.linkedSantriRoom || null,
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

export async function clearPasswordChangeRequired(uid: string): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) throw new IdentityUnavailableError("Gagal memperbarui status kata sandi pengguna.");
}
