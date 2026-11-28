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
    'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'lms', 'communication', 'library'
  ],
  Santri: [
    'dashboard', 'academic', 'tahfidz', 'boarding', 'lms', 'cbt', 'library'
  ],
  Walisantri: [
    'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'communication'
  ],
  Public: []
};

/**
 * Role-scoped permissions below module level. These policies are the source of
 * truth for screen visibility and sensitive actions/fields. A role cannot gain
 * a permission merely because another role has it, and an account-level module
 * grant cannot expand beyond its role's module ceiling.
 *
 * Add a policy entry before exposing a new protected tab, action, or field.
 * Unknown permission IDs fail closed.
 */
export const ROLE_PERMISSION_POLICIES = {
  "tahfidz.tab.dashboard": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.records": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.targets": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.talaqqi": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.exams": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.parent": ["Walisantri"],
  "tahfidz.tab.peer-review": ["Santri", "Ustadz"],
  "tahfidz.tab.quran": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.badges": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "tahfidz.tab.halaqah": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],

  "tahfidz.action.manage-halaqah": ["Admin", "SuperAdmin"],
  "tahfidz.action.record-setoran": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.manage-targets": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.export-report": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.manage-sessions": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.assess-audio": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.comment-student": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.send-reminders": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.action.submit-peer-review": ["Santri"],
  "tahfidz.action.moderate-peer-review": ["Ustadz"],

  // Teacher notes and staff follow-up lists are not learner/guardian fields.
  "tahfidz.field.record-notes": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.field.recorded-by": ["Admin", "SuperAdmin", "Ustadz"],
  "tahfidz.field.follow-ups": ["Admin", "SuperAdmin", "Ustadz"],

  // LMS tabs are scoped to the same actors the snapshot/API supports. Learners
  // never receive staff directories or catalog administration screens.
  "lms.tab.dashboard": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "lms.tab.courses": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "lms.tab.categories": ["Admin", "SuperAdmin"],
  "lms.tab.video-library": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "lms.tab.assessments": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "lms.tab.submissions": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "lms.tab.peer-review": ["Santri"],
  "lms.tab.instructor": ["Admin", "SuperAdmin"],
  "lms.action.manage-categories": ["Admin", "SuperAdmin"],
  "lms.action.manage-courses": ["Admin", "SuperAdmin", "Ustadz"],
  "lms.action.manage-content": ["Admin", "SuperAdmin", "Ustadz"],
  "lms.action.manage-assignments": ["Admin", "SuperAdmin", "Ustadz"],
  "lms.action.manage-enrollments": ["Admin", "SuperAdmin"],
  "lms.action.submit-assignment": ["Santri"],
  "lms.action.track-progress": ["Santri"],
  "lms.action.save-private-note": ["Santri"],
  "lms.action.comment-material": ["Santri"],
  "lms.action.grade-submission": ["Admin", "SuperAdmin", "Ustadz"],
  "lms.field.instructor-directory": ["Admin", "SuperAdmin"],
  "lms.field.submission-roster": ["Admin", "SuperAdmin", "Ustadz"],
  "lms.field.private-learning-notes": ["Santri"],
  "lms.field.student-submission-feedback": ["Admin", "SuperAdmin", "Ustadz", "Santri"],

  // Academic staff workspace; learner/guardian roles use their own portal.
  "academic.tab.schedule": ["Admin", "SuperAdmin"],
  "academic.tab.journal": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.tab.assessment": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.tab.report-card": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.tab.conflict-resolver": ["Admin", "SuperAdmin"],
  "academic.tab.teachers": ["Admin", "SuperAdmin"],
  "academic.tab.subjects": ["Admin", "SuperAdmin"],
  "academic.tab.curricula": ["Admin", "SuperAdmin"],
  "academic.action.write-schedule": ["Admin", "SuperAdmin"],
  "academic.action.write-journal": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.action.write-assessment": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.action.manage-report-card": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.action.resolve-conflicts": ["Admin", "SuperAdmin"],
  "academic.field.student-roster": ["Admin", "SuperAdmin", "Ustadz"],
  "academic.field.student-identifiers": ["Admin", "SuperAdmin", "Ustadz"],

  // Financial tabs and high-risk actions are intentionally separated.
  "finance.tab.bills": ["Admin", "SuperAdmin", "Walisantri"],
  "finance.tab.expenses": ["Admin", "SuperAdmin", "Ustadz"],
  "finance.tab.ledger": ["Admin", "SuperAdmin"],
  "finance.action.issue-bill": ["Admin", "SuperAdmin"],
  "finance.action.submit-payment": ["Walisantri"],
  "finance.action.submit-expense": ["Admin", "SuperAdmin", "Ustadz"],
  "finance.action.review-payment": ["Admin", "SuperAdmin"],
  "finance.action.approve-expense": ["Admin", "SuperAdmin"],
  "finance.action.manage-lock": ["Admin", "SuperAdmin"],
  "finance.action.export-ledger": ["Admin", "SuperAdmin"],
  "finance.field.student-billing": ["Admin", "SuperAdmin", "Walisantri"],
  "finance.field.expense-approval": ["Admin", "SuperAdmin"],
  "finance.field.ledger": ["Admin", "SuperAdmin"],
  "finance.field.admin-summary": ["Admin", "SuperAdmin"],

  // Library users can read public catalog material; only linked Santri can
  // read their own circulation, while staff can see the tenant roster.
  "library.tab.dashboard": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "library.tab.catalog": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "library.tab.circulation": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "library.tab.digital": ["Admin", "SuperAdmin", "Ustadz", "Santri"],
  "library.action.manage-catalog": ["Admin", "SuperAdmin", "Ustadz"],
  "library.action.manage-circulation": ["Admin", "SuperAdmin", "Ustadz"],
  "library.action.manage-digital-assets": ["Admin", "SuperAdmin", "Ustadz"],
  "library.field.circulation-roster": ["Admin", "SuperAdmin", "Ustadz"],
  "library.field.student-circulation": ["Admin", "SuperAdmin", "Ustadz", "Santri"],

  // Communication screens and audience analytics have different audiences.
  "communication.tab.announcements": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.tab.helpdesk": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.tab.messages": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.tab.templates": ["Admin", "SuperAdmin"],
  "communication.action.publish-announcement": ["Admin", "SuperAdmin"],
  "communication.action.manage-templates": ["Admin", "SuperAdmin"],
  "communication.action.acknowledge-announcement": ["Walisantri"],
  "communication.action.create-ticket": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.action.transition-ticket": ["Admin", "SuperAdmin"],
  "communication.action.send-message": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.action.update-message-status": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.field.audience-metrics": ["Admin", "SuperAdmin"],
  "communication.field.ticket-roster": ["Admin", "SuperAdmin"],
  "communication.field.own-ticket": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.field.direct-messages": ["Admin", "SuperAdmin", "Ustadz", "Walisantri"],
  "communication.field.tenant-recipient-directory": ["Admin", "SuperAdmin"],
  "communication.field.admin-recipient-directory": ["Ustadz", "Walisantri"],
  // Asrama tabs mirror each endpoint's role and row scope. Rooms are an
  // operational staff roster, while residents and guardians only see
  // location-scoped facility tickets and their own permit workflow.
  "boarding.tab.rooms": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.tab.permits": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "boarding.tab.discipline": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.tab.attendance": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.tab.assignments": ["Admin", "SuperAdmin"],
  "boarding.tab.facility-ops": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "boarding.action.assign-room": ["Admin", "SuperAdmin"],
  "boarding.action.request-permit": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "boarding.action.process-permit": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.action.record-discipline": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.action.resolve-discipline": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.action.mark-attendance": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.action.assign-staff": ["Admin", "SuperAdmin"],
  "boarding.action.record-audit": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.action.create-facility-ticket": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "boarding.action.resolve-facility-ticket": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.field.student-identifiers": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.field.permit-identifiers": ["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"],
  "boarding.field.facility-audits": ["Admin", "SuperAdmin", "Ustadz"],
  "boarding.field.facility-reporter": ["Admin", "SuperAdmin", "Ustadz"],

  // CBT's current management API is Admin-only; learners use a separate
  // attempt page, and Ustadz is not exposed until scoped staff endpoints exist.
  "cbt.tab.student-exam": ["Santri"],
  "cbt.tab.dashboard": ["Admin", "SuperAdmin"],
  "cbt.tab.calendar": ["Admin", "SuperAdmin"],
  "cbt.tab.packages": ["Admin", "SuperAdmin"],
  "cbt.tab.questions": ["Admin", "SuperAdmin"],
  "cbt.tab.exams": ["Admin", "SuperAdmin"],
  "cbt.tab.monitor": ["Admin", "SuperAdmin"],
  "cbt.tab.results": ["Admin", "SuperAdmin"],
  "cbt.tab.settings": ["Admin", "SuperAdmin"],
  "cbt.tab.import": ["Admin", "SuperAdmin"],
  "cbt.field.participant-results": ["Admin", "SuperAdmin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type RolePermissionId = keyof typeof ROLE_PERMISSION_POLICIES;

/**
 * Permissions that can safely be reduced for one account through User Management.
 * Keep this list limited to permissions enforced by the matching server routes
 * or response projections. Other role policies remain source-controlled until
 * their API/data projection enforces per-account overrides as well.
 */
export const USER_OVERRIDABLE_ROLE_PERMISSION_IDS = [
  "tahfidz.tab.dashboard",
  "tahfidz.tab.records",
  "tahfidz.tab.targets",
  "tahfidz.tab.talaqqi",
  "tahfidz.tab.exams",
  "tahfidz.tab.peer-review",
  "tahfidz.tab.quran",
  "tahfidz.tab.badges",
  "tahfidz.action.manage-halaqah",
  "tahfidz.action.record-setoran",
  "tahfidz.action.manage-targets",
  "tahfidz.action.manage-sessions",
  "tahfidz.action.submit-peer-review",
  "tahfidz.action.moderate-peer-review",
  "tahfidz.field.record-notes",
  "tahfidz.field.recorded-by",
  "tahfidz.field.follow-ups",
  "lms.action.manage-categories",
  "lms.action.manage-courses",
  "lms.action.manage-content",
  "lms.action.manage-assignments",
  "lms.action.manage-enrollments",
  "lms.action.submit-assignment",
  "lms.action.track-progress",
  "lms.action.save-private-note",
  "lms.action.comment-material",
  "lms.action.grade-submission",
  "academic.tab.report-card",
  "academic.action.write-schedule",
  "academic.action.write-journal",
  "academic.action.write-assessment",
  "academic.action.manage-report-card",
  "academic.action.resolve-conflicts",
  "communication.action.publish-announcement",
  "communication.action.manage-templates",
  "communication.action.acknowledge-announcement",
  "communication.action.create-ticket",
  "communication.action.transition-ticket",
  "communication.action.send-message",
  "communication.action.update-message-status",
  "communication.field.audience-metrics",
  "communication.field.ticket-roster",
  "communication.field.own-ticket",
  "communication.field.direct-messages",
  "communication.field.tenant-recipient-directory",
  "communication.field.admin-recipient-directory",
  "boarding.tab.rooms",
  "boarding.tab.permits",
  "boarding.tab.discipline",
  "boarding.tab.attendance",
  "boarding.tab.assignments",
  "boarding.tab.facility-ops",
  "boarding.action.assign-room",
  "boarding.action.request-permit",
  "boarding.action.process-permit",
  "boarding.action.record-discipline",
  "boarding.action.resolve-discipline",
  "boarding.action.mark-attendance",
  "boarding.action.assign-staff",
  "boarding.action.record-audit",
  "boarding.action.create-facility-ticket",
  "boarding.action.resolve-facility-ticket",
  "boarding.field.facility-audits",
  "boarding.field.facility-reporter",
] as const satisfies readonly RolePermissionId[];

const USER_OVERRIDABLE_ROLE_PERMISSION_SET = new Set<string>(USER_OVERRIDABLE_ROLE_PERMISSION_IDS);

/** Return detail permissions whose deny overrides are enforced server-side. */
export function getUserOverridableRolePermissionIds(role: UserRole): RolePermissionId[] {
  return USER_OVERRIDABLE_ROLE_PERMISSION_IDS.filter((permissionId) =>
    (ROLE_PERMISSION_POLICIES[permissionId] as readonly UserRole[]).includes(role)
      && isModuleAccessible(role, permissionId.split(".")[0] as ModuleId),
  );
}

/** Return only the tab/action/field permissions granted by the immutable role baseline. */
export function getRolePermissionIds(role: UserRole): RolePermissionId[] {
  return (Object.keys(ROLE_PERMISSION_POLICIES) as RolePermissionId[]).filter((permissionId) =>
    (ROLE_PERMISSION_POLICIES[permissionId] as readonly UserRole[]).includes(role)
      && isModuleAccessible(role, permissionId.split(".")[0] as ModuleId),
  );
}

/** Validate per-account permission reductions. A sub-module override may only deny a known permission. */
export function isValidRolePermissionOverrides(value: unknown, role: UserRole): value is Partial<Record<RolePermissionId, false>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (role === "SuperAdmin" && entries.length > 0) return false;
  if (entries.length > USER_OVERRIDABLE_ROLE_PERMISSION_IDS.length) return false;
  return entries.every(([permissionId, allowed]) =>
    allowed === false
      && USER_OVERRIDABLE_ROLE_PERMISSION_SET.has(permissionId)
      && (ROLE_PERMISSION_POLICIES as Record<string, readonly UserRole[]>)[permissionId]?.includes(role) === true
      && isModuleAccessible(role, permissionId.split(".")[0] as ModuleId),
  );
}

/**
 * Detect newly enabled sub-module access that an actor cannot administer.
 * Per-account overrides are deny-only; changing a role can still add defaults,
 * so a non-SuperAdmin needs module authority to grant those newly inherited rights.
 */
export function findUnauthorizedRolePermissionGrants(
  actorRole: UserRole,
  actorPermissions: Record<string, boolean> | null | undefined,
  targetRole: UserRole,
  targetPermissions: Record<string, boolean> | null | undefined,
  previousTargetRole?: UserRole | null,
  previousTargetPermissions?: Record<string, boolean> | null,
): RolePermissionId[] {
  if (actorRole === "SuperAdmin") return [];
  const actorAllowedModules = new Set(getAllowedModulesForUser(actorRole, actorPermissions));
  return getRolePermissionIds(targetRole).filter((permissionId) => {
    const wasAllowed = previousTargetRole
      ? isRolePermissionAllowed(previousTargetRole, permissionId, previousTargetPermissions)
      : true;
    const isAllowed = isRolePermissionAllowed(targetRole, permissionId, targetPermissions);
    const moduleId = permissionId.split(".")[0] as ModuleId;
    return isAllowed && !wasAllowed && !actorAllowedModules.has(moduleId);
  });
}

export type LibraryStudentScope =
  | { kind: "tenant" }
  | { kind: "linked-student"; studentId: string }
  | { kind: "denied" };

/** Resolve the row scope used by the library snapshot. Learners must be linked to one record. */
export function libraryStudentScope(role: string, linkedSantriId: unknown): LibraryStudentScope {
  if (role === "Santri") {
    const studentId = typeof linkedSantriId === "string" ? linkedSantriId.trim() : "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)
      ? { kind: "linked-student", studentId }
      : { kind: "denied" };
  }
  return ["Admin", "SuperAdmin", "Ustadz"].includes(role) ? { kind: "tenant" } : { kind: "denied" };
}

/**
 * Evaluate a role-level tab/action/field policy, also honoring the parent
 * module's per-account deny. Missing/unknown policies are denied.
 */
export function isRolePermissionAllowed(
  role: UserRole,
  permissionId: string,
  userPermissions?: Record<string, boolean> | null,
): permissionId is RolePermissionId {
  const allowedRoles: readonly UserRole[] = ROLE_PERMISSION_POLICIES[permissionId as RolePermissionId];
  if (!allowedRoles) return false;
  const moduleId = permissionId.split(".")[0] as ModuleId;
  if (!ALL_SYSTEM_MODULE_IDS.includes(moduleId) || !isModuleAccessible(role, moduleId, userPermissions)) return false;
  if (!allowedRoles.includes(role)) return false;
  if (role === "SuperAdmin") return true;
  // Role policies are the maximum. A per-account explicit false may further
  // restrict that access; a stale true never grants beyond the role baseline.
  if (USER_OVERRIDABLE_ROLE_PERMISSION_SET.has(permissionId)
    && userPermissions && Object.prototype.hasOwnProperty.call(userPermissions, permissionId)) {
    return userPermissions[permissionId] === true;
  }
  return true;
}

/**
 * Reject malformed or unknown permission keys at API boundaries.
 */
export function isValidModulePermissions(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > ALL_SYSTEM_MODULE_IDS.length + Object.keys(ROLE_PERMISSION_POLICIES).length) return false;
  return entries.every(([permissionId, enabled]) => {
    if (ALL_SYSTEM_MODULE_IDS.includes(permissionId as ModuleId)) return typeof enabled === "boolean";
    // Profile storage keeps module and screen denials in one JSON object. A
    // feature permission is deny-only; role grants live in the source policy.
    return USER_OVERRIDABLE_ROLE_PERMISSION_SET.has(permissionId) && enabled === false;
  });
}

/**
 * Evaluates whether a user with a given role and per-user modulePermissions map can access a module.
 *
 * Rules:
 * 1. SuperAdmin has access to all modules, cross-tenant, and permissions cannot be reduced.
 * 2. Platform-only modules ('settings') are strictly restricted to SuperAdmin and cannot be granted to tenant Admin or other roles.
 * 3. Pesantren Admin has access to all tenant-scoped ERP modules by default.
 * 4. The role baseline is a hard ceiling. Per-user modulePermissions may
 *    remove access, but cannot elevate a learner/staff role into another role's
 *    module set. Missing keys fall back to the role baseline.
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

  // Role baseline is the maximum authority, even when a stale per-user record
  // explicitly says true. This prevents cross-role privilege leakage.
  const roleBaseline = ROLE_MODULES[role] || [];
  if (!roleBaseline.includes(moduleId)) return false;

  // A per-user override may only remove an allowed baseline module.
  if (userPermissions && typeof userPermissions === 'object' && moduleId in userPermissions) {
    return userPermissions[moduleId] === true;
  }

  return true;
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


/**
 * Modules that would become newly accessible to a target but are outside the
 * acting administrator's own scope. Existing grants are preserved so a
 * restricted Admin can edit or disable an existing account; new grants must
 * remain within the actor's current authority.
 */
export function findUnauthorizedModuleGrants(
  actorRole: UserRole,
  actorPermissions: Record<string, boolean> | null | undefined,
  targetRole: UserRole,
  targetPermissions: Record<string, boolean> | null | undefined,
  previousTargetRole?: UserRole | null,
  previousTargetPermissions?: Record<string, boolean> | null,
): ModuleId[] {
  const targetRoleBaseline = new Set(ROLE_MODULES[targetRole] || []);
  const previousTargetExplicitGrants = new Set(
    Object.entries(previousTargetPermissions || {})
      .filter(([, allowed]) => allowed === true)
      .map(([moduleId]) => moduleId as ModuleId),
  );
  const outOfRoleGrants = Object.entries(targetPermissions || {})
    .filter(([moduleId, allowed]) => allowed === true
      && ALL_SYSTEM_MODULE_IDS.includes(moduleId as ModuleId)
      && !targetRoleBaseline.has(moduleId as ModuleId)
      && !previousTargetExplicitGrants.has(moduleId as ModuleId))
    .map(([moduleId]) => moduleId as ModuleId);

  if (actorRole === "SuperAdmin") return outOfRoleGrants;

  const actorAllowed = new Set(getAllowedModulesForUser(actorRole, actorPermissions));
  const previousTargetAllowed = previousTargetRole
    ? new Set(getAllowedModulesForUser(previousTargetRole, previousTargetPermissions))
    : new Set<ModuleId>();

  return [...new Set([...outOfRoleGrants, ...getAllowedModulesForUser(targetRole, targetPermissions).filter(
    (moduleId) => !actorAllowed.has(moduleId) && !previousTargetAllowed.has(moduleId),
  )])];
}
