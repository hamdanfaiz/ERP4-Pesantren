import { ModuleId } from './types';

export type ModuleGroup = 'Dashboard' | 'Academics' | 'Finance' | 'Operations' | 'People' | 'System';

export type UserRole = "SuperAdmin" | "Admin" | "Ustadz" | "Santri" | "Walisantri" | "Public";

// Explicitly platform-wide and cross-tenant authority modules (SuperAdmin only)
export const PLATFORM_ONLY_MODULES: readonly ModuleId[] = ['settings'] as const;

export const ALL_SYSTEM_MODULE_IDS: readonly ModuleId[] = [
  'dashboard', 'master-data', 'users', 'ppdb', 'tahfidz', 'boarding', 'finance', 'communication',
  'academic', 'healthcare', 'cooperative', 'hris', 'document', 'library', 'donation',
  'laundry', 'settings', 'enterprise', 'erp', 'ga', 'alumni', 'crm',
  'lms', 'intelligence', 'marketplace', 'cbt'
] as const;

// All tenant-scoped ERP modules available to Pesantren Admin by default
export const TENANT_SCOPED_MODULES: readonly ModuleId[] = ALL_SYSTEM_MODULE_IDS.filter(
  (id) => !PLATFORM_ONLY_MODULES.includes(id)
);

export const ROLE_MODULES: Record<UserRole, ModuleId[]> = {
  SuperAdmin: [...ALL_SYSTEM_MODULE_IDS],
  Admin: [...TENANT_SCOPED_MODULES],
  Ustadz: [
    'dashboard', 'academic', 'tahfidz', 'boarding', 'lms', 'cbt', 'communication', 'library'
  ],
  Santri: [
    'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'lms', 'cbt', 'library'
  ],
  Walisantri: [
    'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'communication', 'donation'
  ],
  Public: []
};

/**
 * Reject malformed or unknown permission keys at API boundaries.
 */
export function isValidModulePermissions(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([moduleId, enabled]) =>
    ALL_SYSTEM_MODULE_IDS.includes(moduleId as ModuleId) && typeof enabled === "boolean"
  );
}

/**
 * Evaluates whether a user with a given role and per-user modulePermissions map can access a module.
 *
 * Rules:
 * 1. SuperAdmin has access to all modules, cross-tenant, and permissions cannot be reduced.
 * 2. Platform-only modules ('settings') are strictly restricted to SuperAdmin and cannot be granted to tenant Admin or other roles.
 * 3. Pesantren Admin has access to all tenant-scoped ERP modules by default.
 * 4. Per-user modulePermissions acts as a real override:
 *    - Explicit true grants within tenant scope.
 *    - Explicit false denies.
 *    - Missing key or missing map falls back to role baseline (so existing Admins regain baseline modules without DB migration).
 */
export function isModuleAccessible(
  role: UserRole,
  moduleId: ModuleId,
  userPermissions?: Record<string, boolean> | null
): boolean {
  // Modules outside the initial release cannot be re-enabled by stale or custom grants.
  if (!ALL_SYSTEM_MODULE_IDS.includes(moduleId)) return false;
  if (role === 'Public') return false;
  if (role === 'SuperAdmin') return true;

  // Platform-only modules can NEVER be accessed by tenant roles
  if (PLATFORM_ONLY_MODULES.includes(moduleId)) {
    return false;
  }

  // Explicit per-user override: true grants within tenant scope, false denies
  if (userPermissions && typeof userPermissions === 'object' && moduleId in userPermissions) {
    return userPermissions[moduleId] === true;
  }

  // Fallback to role baseline:
  // - Admin gets every tenant-scoped module by default (TENANT_SCOPED_MODULES)
  // - Ustadz, Santri, Walisantri get their respective baseline modules
  const roleBaseline = ROLE_MODULES[role] || [];
  return roleBaseline.includes(moduleId);
}

/**
 * Returns the exhaustive list of modules allowed for a specific user under the tenant policy.
 */
export function getAllowedModulesForUser(
  role: UserRole,
  userPermissions?: Record<string, boolean> | null
): ModuleId[] {
  if (role === 'Public') return [];
  if (role === 'SuperAdmin') return [...ALL_SYSTEM_MODULE_IDS];

  return ALL_SYSTEM_MODULE_IDS.filter((modId) =>
    isModuleAccessible(role, modId, userPermissions)
  );
}
