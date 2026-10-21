const MODULE_KEYS = new Set([
  "dashboard", "master-data", "users", "ppdb", "tahfidz", "boarding", "finance",
  "communication", "academic", "healthcare", "cooperative", "hris", "document",
  "library", "donation", "laundry", "enterprise", "erp", "ga", "alumni", "crm",
  "lms", "intelligence", "marketplace", "ecosystem", "cbt",
]);
const INPUT_KEYS = new Set(["email", "displayName", "role", "modulePermissions"]);

export type AssignableRole = "admin" | "ustadz" | "santri" | "wali_santri";

export interface ProvisionUserInput {
  email: string;
  displayName: string;
  role: AssignableRole;
  modulePermissions: Record<string, boolean>;
}

export type ValidationResult =
  | { ok: true; value: ProvisionUserInput }
  | { ok: false; error: string };

export function validateProvisionUserInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Body permintaan tidak valid." };
  }

  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !INPUT_KEYS.has(key))) {
    return { ok: false, error: "Body berisi field yang tidak didukung." };
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = body.role;
  const modulePermissions = body.modulePermissions === undefined ? {} : body.modulePermissions;

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Alamat email tidak valid." };
  }
  if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return { ok: false, error: "Nama harus diisi, tidak boleh berisi karakter kontrol, dan maksimal 120 karakter." };
  }
  if (role !== "admin" && role !== "ustadz" && role !== "santri" && role !== "wali_santri") {
    return { ok: false, error: "Role yang diminta tidak dapat diberikan." };
  }
  if (!modulePermissions || typeof modulePermissions !== "object" || Array.isArray(modulePermissions)) {
    return { ok: false, error: "Permission modul tidak valid." };
  }

  const permissions: Record<string, boolean> = {};
  for (const [module, allowed] of Object.entries(modulePermissions as Record<string, unknown>)) {
    if (!MODULE_KEYS.has(module) || typeof allowed !== "boolean") {
      return { ok: false, error: "Permission modul berisi nilai yang tidak valid." };
    }
    permissions[module] = allowed;
  }
  if (Object.keys(permissions).length > MODULE_KEYS.size) {
    return { ok: false, error: "Jumlah permission modul melebihi batas." };
  }

  return {
    ok: true,
    value: { email, displayName, role, modulePermissions: permissions },
  };
}
