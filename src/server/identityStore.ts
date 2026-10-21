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

type ProfileRow = {
  id: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  status?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_type?: string | null;
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

function mapProfile(row: ProfileRow): StoredUserProfile {
  const permissions = row.module_permissions && typeof row.module_permissions === "object"
    ? row.module_permissions
    : {};
  return {
    uid: row.id,
    email: row.email || "",
    name: row.name || "",
    username: row.username || "",
    role: row.role || "",
    status: row.status || "active",
    tenantId: row.tenant_id || "",
    tenantName: row.tenant_name || row.tenant_id || "",
    tenantType: row.tenant_type || undefined,
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
  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw new IdentityUnavailableError("Profil pengguna tidak dapat dibaca dari Supabase.");
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function listTenantProfiles(tenantId: string): Promise<StoredUserProfile[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("user_profiles").select("*").eq("tenant_id", tenantId);
  if (error) throw new IdentityUnavailableError("Daftar pengguna tidak dapat dibaca dari Supabase.");
  return (data || []).map((row) => mapProfile(row as ProfileRow));
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
  const row: ProfileRow = {
    id: data.user.id,
    email: input.email,
    name: input.name,
    username: input.username,
    role: input.role,
    tenant_id: input.tenantId,
    tenant_name: input.tenantName,
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
  };
  const inserted = await supabase.from("user_profiles").insert(row);
  if (inserted.error) {
    try { await supabase.auth.admin.deleteUser(data.user.id); } catch { /* Keep auth and profile in step. */ }
    throw new IdentityUnavailableError("Gagal menyimpan profil pengguna.");
  }
  return mapProfile(row);
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
  if (patch.name) row.name = patch.name;
  if (patch.role) row.role = patch.role;
  if (patch.status) row.status = patch.status;
  if (patch.modulePermissions) row.module_permissions = patch.modulePermissions;
  const { error } = await supabase.from("user_profiles").update(row).eq("id", uid);
  if (error) throw new IdentityUnavailableError("Gagal memperbarui profil pengguna.");
}

export async function setAuthDisabled(uid: string, disabled: boolean): Promise<void> {
  const supabase = supabaseAdmin();
  const { error } = await supabase.auth.admin.updateUserById(uid, {
    ban_duration: disabled ? "876600h" : "none",
  });
  if (error) throw error;
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
    .from("user_profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", uid);
  if (error) throw new IdentityUnavailableError("Gagal memperbarui status kata sandi pengguna.");
}
