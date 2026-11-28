import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findUnauthorizedModuleGrants, findUnauthorizedRolePermissionGrants, isModuleAccessible, isRolePermissionAllowed, isValidModulePermissions, isValidRolePermissionOverrides, libraryStudentScope, ROLE_MODULES } from "../src/rbac";
import { ALL_MODULE_LIST } from "../src/services/systemSettingsService";
import type { ModuleId } from "../src/types";

const retiredModule = "ecosystem" as ModuleId;

assert.equal(isModuleAccessible("SuperAdmin", "settings", { settings: false }), true);
assert.equal(isModuleAccessible("Admin", "settings"), false);
assert.equal(isModuleAccessible("Admin", "finance"), true);
assert.equal(isModuleAccessible("Admin", "finance", { finance: false }), false);
assert.equal(isModuleAccessible("Ustadz", "finance"), true, "Ustadz receive only the expense workflow within the Finance module.");
assert.equal(isModuleAccessible("Ustadz", "finance", { finance: false }), false, "An explicit per-account deny still removes Finance access.");
assert.equal(isModuleAccessible("Ustadz", "cbt"), false, "Ustadz cannot access CBT management until teacher-scoped endpoints are available.");
assert.equal(isModuleAccessible("Ustadz", "cbt", { cbt: true }), false, "A per-account grant cannot expose CBT management to Ustadz.");
assert.equal(isModuleAccessible("Santri", "finance"), false, "Finance is unavailable to Santri until a learner-facing finance workflow exists.");
assert.equal(isModuleAccessible("Santri", "finance", { finance: true }), false, "A per-account grant cannot expose the staff Finance module to Santri.");
assert.equal(isModuleAccessible("Walisantri", "donation"), false, "Wali Santri do not receive the internal donor and donation management screens.");
assert.equal(isModuleAccessible("Walisantri", "donation", { donation: true }), false, "A per-account grant cannot expose internal donor records to Wali Santri.");
assert.equal(isModuleAccessible("Santri", "healthcare", { healthcare: true }), false, "A per-account grant cannot elevate Santri above the role's module ceiling.");
assert.equal(isModuleAccessible("Ustadz", "tahfidz", { tahfidz: true }), true);
assert.equal(isModuleAccessible("Ustadz", "tahfidz", { tahfidz: false }), false);
assert.equal(isModuleAccessible("Admin", "finance", { finance: "false" } as unknown as Record<string, boolean>), false);
assert.equal(isModuleAccessible("SuperAdmin", retiredModule), false);
assert.equal(isModuleAccessible("Admin", retiredModule, { ecosystem: true }), false);
assert.equal(isValidModulePermissions({ finance: true, library: false }), true);
assert.equal(isValidModulePermissions({ finance: "false" }), false);
assert.equal(isValidModulePermissions({ notARealModule: true }), false);
assert.equal(isValidModulePermissions({ ecosystem: true }), false);
assert.equal(isValidModulePermissions([]), false);

assert.equal(isRolePermissionAllowed("Santri", "tahfidz.tab.peer-review"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.tab.peer-review"), true);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.submit-peer-review"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.submit-peer-review"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.moderate-peer-review"), true);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.moderate-peer-review"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.tab.parent"), false);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.tab.parent"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "tahfidz.tab.peer-review"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "tahfidz.tab.parent"), true);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.manage-halaqah"), false, "student role cannot manage teacher-owned halaqahs");
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.record-setoran"), false, "students cannot record staff setoran for other students");
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.record-setoran"), true, "Ustadz can record setoran within backend halaqah scope");
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.manage-sessions"), false, "students cannot schedule or grade teacher sessions");
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.manage-sessions"), true, "Ustadz can manage their assigned Tahfidz sessions");
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.comment-student"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.comment-student"), true);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.action.send-reminders"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.action.send-reminders"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "tahfidz.field.record-notes"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.field.record-notes"), true);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.field.follow-ups"), false);
assert.equal(isRolePermissionAllowed("Santri", "tahfidz.tab.peer-review", { tahfidz: false }), false);
assert.equal(isRolePermissionAllowed("Admin", "tahfidz.tab.not-registered"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "academic.action.write-journal", { "academic.action.write-journal": false }), false, "a per-account action denial is enforced by the matching API");
assert.equal(isRolePermissionAllowed("Ustadz", "tahfidz.field.record-notes", { "tahfidz.field.record-notes": false }), false, "a per-account field denial removes Tahfidz staff notes from API projections");
assert.equal(isRolePermissionAllowed("Ustadz", "boarding.field.facility-reporter", { "boarding.field.facility-reporter": false }), false, "a per-account field denial removes facility reporter identity from API projections");
assert.equal(isRolePermissionAllowed("Santri", "academic.tab.journal", { "academic.tab.journal": true }), false, "a stale screen permission cannot elevate Santri into a Ustadz screen");
assert.equal(isRolePermissionAllowed("Ustadz", "academic.action.write-journal", { "academic.action.write-journal": "false" as unknown as boolean }), false, "malformed sub-module permission fails closed");
assert.equal(isValidRolePermissionOverrides({ "academic.action.write-journal": false }, "Ustadz"), true);
assert.equal(isValidRolePermissionOverrides({ "academic.tab.journal": false }, "Ustadz"), false, "per-account tab overrides stay unavailable until the corresponding API projection enforces them");
assert.equal(isValidRolePermissionOverrides({ "academic.tab.journal": false }, "Santri"), false, "an override cannot be assigned to a role outside the baseline");
assert.equal(isValidRolePermissionOverrides({ "academic.action.write-journal": true }, "Ustadz"), false, "screen overrides are deny-only");
assert.equal(isValidRolePermissionOverrides({ "academic.tab.journal": false }, "SuperAdmin"), false, "SuperAdmin rights cannot be reduced");
assert.equal(isRolePermissionAllowed("SuperAdmin", "academic.tab.journal", { "academic.tab.journal": false }), true, "stale detailed denials cannot reduce SuperAdmin access");
assert.equal(isValidRolePermissionOverrides({ "academic.tab.unknown": false }, "Ustadz"), false, "unknown screen permissions are rejected");
assert.equal(isValidModulePermissions({ tahfidz: true, "tahfidz.field.record-notes": false }), true, "stored profile permissions accept only known feature denials alongside module settings");
assert.equal(isValidModulePermissions({ tahfidz: true, "tahfidz.field.record-notes": true }), false, "stored profile permissions cannot persist feature grants");
assert.deepEqual(
  findUnauthorizedRolePermissionGrants(
    "Santri", {}, "Walisantri", {}, "Walisantri", { "communication.action.acknowledge-announcement": false },
  ),
  ["communication.action.acknowledge-announcement"],
  "a Santri-level actor cannot restore a restricted communication action while editing a Wali account",
);
assert.deepEqual(
  findUnauthorizedRolePermissionGrants(
    "Admin", {}, "Walisantri", {}, "Walisantri", { "communication.action.acknowledge-announcement": false },
  ),
  [],
  "an Admin with tenant Communication scope can restore a role-default Wali action",
);

assert.equal(isRolePermissionAllowed("Santri", "lms.tab.instructor"), false);
assert.equal(isRolePermissionAllowed("Santri", "lms.tab.categories"), false);
assert.equal(isRolePermissionAllowed("Santri", "lms.tab.peer-review"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.tab.instructor"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.tab.peer-review"), false);
assert.equal(isRolePermissionAllowed("Admin", "lms.tab.categories"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.action.manage-categories"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.action.manage-content"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.action.manage-enrollments"), false);
assert.equal(isRolePermissionAllowed("Santri", "lms.action.submit-assignment"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.action.submit-assignment"), false);
assert.equal(isRolePermissionAllowed("Santri", "lms.field.submission-roster"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.field.submission-roster"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "lms.tab.dashboard", { lms: false }), false);

assert.equal(isRolePermissionAllowed("Ustadz", "academic.tab.journal"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "academic.tab.schedule"), false);
for (const adminOnlyAcademicTab of ["conflict-resolver", "teachers", "subjects", "curricula"] as const) {
  assert.equal(isRolePermissionAllowed("Admin", `academic.tab.${adminOnlyAcademicTab}`), true);
  assert.equal(isRolePermissionAllowed("SuperAdmin", `academic.tab.${adminOnlyAcademicTab}`), true);
  assert.equal(isRolePermissionAllowed("Ustadz", `academic.tab.${adminOnlyAcademicTab}`), false);
  assert.equal(isRolePermissionAllowed("Santri", `academic.tab.${adminOnlyAcademicTab}`), false);
  assert.equal(isRolePermissionAllowed("Walisantri", `academic.tab.${adminOnlyAcademicTab}`), false);
}
assert.equal(isRolePermissionAllowed("Santri", "academic.tab.assessment"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "academic.action.write-assessment"), true);
assert.equal(isRolePermissionAllowed("Santri", "academic.field.student-identifiers"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "finance.tab.bills"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "finance.tab.ledger"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "finance.action.submit-payment"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "finance.tab.expenses"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "finance.tab.bills"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "finance.action.approve-expense"), false);
assert.equal(isRolePermissionAllowed("Admin", "finance.field.admin-summary"), true);
assert.equal(isRolePermissionAllowed("Santri", "finance.field.admin-summary"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "cbt.tab.dashboard"), false);
assert.equal(isRolePermissionAllowed("Santri", "cbt.tab.dashboard"), false);
assert.equal(isRolePermissionAllowed("Santri", "cbt.tab.student-exam"), true);
assert.equal(isRolePermissionAllowed("Admin", "cbt.tab.student-exam"), false);
assert.equal(isRolePermissionAllowed("Santri", "library.tab.circulation"), true);
assert.equal(isRolePermissionAllowed("Santri", "library.field.student-circulation"), true);
assert.equal(isRolePermissionAllowed("Santri", "library.field.circulation-roster"), false);
assert.equal(isRolePermissionAllowed("Santri", "library.action.manage-circulation"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "library.action.manage-catalog"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "library.tab.catalog"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "library.tab.digital", { library: false }), false);
assert.deepEqual(libraryStudentScope("Santri", "a1000000-0000-4000-8000-000000000101"), { kind: "linked-student", studentId: "a1000000-0000-4000-8000-000000000101" });
assert.deepEqual(libraryStudentScope("Santri", null), { kind: "denied" });
assert.deepEqual(libraryStudentScope("Santri", "not-a-uuid"), { kind: "denied" });
assert.deepEqual(libraryStudentScope("Walisantri", null), { kind: "denied" });
assert.deepEqual(libraryStudentScope("Ustadz", null), { kind: "tenant" });
assert.equal(isRolePermissionAllowed("Walisantri", "communication.tab.announcements"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "communication.tab.templates"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "communication.action.publish-announcement"), false);
assert.equal(isRolePermissionAllowed("Admin", "communication.action.publish-announcement"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "communication.action.acknowledge-announcement"), true);
assert.equal(isRolePermissionAllowed("Ustadz", "communication.action.acknowledge-announcement"), false);
assert.equal(isRolePermissionAllowed("Walisantri", "communication.action.create-ticket"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "communication.action.transition-ticket"), false);
assert.equal(isRolePermissionAllowed("Ustadz", "communication.action.send-message"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "communication.field.audience-metrics"), false);
assert.equal(isRolePermissionAllowed("Admin", "communication.field.audience-metrics"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "boarding.tab.permits"), true);
assert.equal(isRolePermissionAllowed("Walisantri", "boarding.tab.permits", { boarding: false }), false);
assert.equal(isRolePermissionAllowed("Santri", "communication.tab.messages"), false);

const limitedAdminPermissions = { finance: false };
assert.deepEqual(
  findUnauthorizedModuleGrants("Admin", limitedAdminPermissions, "Santri", {}),
  [],
  "A Santri role does not inherit modules outside its role baseline.",
);
assert.deepEqual(
  findUnauthorizedModuleGrants("Admin", limitedAdminPermissions, "Santri", { finance: true }),
  ["finance"],
  "An explicit module grant cannot exceed the actor's own scope.",
);
assert.deepEqual(
  findUnauthorizedModuleGrants("Admin", limitedAdminPermissions, "Admin", { finance: true }, "Admin", limitedAdminPermissions),
  ["finance"],
  "A restricted Admin cannot grant a denied module to their own account.",
);
assert.deepEqual(
  findUnauthorizedModuleGrants("Admin", limitedAdminPermissions, "Admin", { finance: true }, "Admin", { finance: true }),
  [],
  "Existing grants are preserved and can be edited without being misreported as new escalation.",
);
assert.deepEqual(
  findUnauthorizedModuleGrants("SuperAdmin", {}, "SuperAdmin", { settings: true }),
  [],
  "SuperAdmin grants are not limited by a tenant permission scope.",
);
assert.deepEqual(
  findUnauthorizedModuleGrants("SuperAdmin", {}, "Ustadz", { tahfidz: true, donation: true }),
  ["donation"],
  "Even SuperAdmin cannot configure an account module above the target role ceiling.",
);

// Keep the SQL RLS role ceiling aligned with the application baseline. A drift
// here can make direct database access disagree with the visible module map.
const roleCeilingMigration = readFileSync("supabase/migrations/20270409000000_rbac_role_module_ceiling.sql", "utf8");
for (const [appRole, databaseRole] of [
  ["SuperAdmin", "super_admin"],
  ["Admin", "admin"],
  ["Ustadz", "ustadz"],
  ["Santri", "santri"],
  ["Walisantri", "wali_santri"],
] as const) {
  const roleBlock = roleCeilingMigration.match(
    new RegExp(`WHEN '${databaseRole}' THEN\\s+v_role_modules := ARRAY\\[([\\s\\S]*?)\\]::TEXT\\[\\];`),
  );
  assert.ok(roleBlock, `Migration contains a role ceiling for ${databaseRole}.`);
  const databaseModules = [...roleBlock[1].matchAll(/'([^']+)'/g)].map(([, moduleId]) => moduleId).sort();
  assert.deepEqual(databaseModules, [...ROLE_MODULES[appRole]].sort(), `SQL role ceiling matches the ${appRole} application baseline.`);
}

assert.deepEqual(
  ALL_MODULE_LIST.map(({ id, name, category }) => [id, name, category]),
  [
    ["dashboard", "Ringkasan", "Inti"],
    ["master-data", "Data Induk", "Inti"],
    ["users", "Manajemen Pengguna (RBAC)", "Inti"],
    ["settings", "Pengaturan Sistem", "Inti"],
    ["ppdb", "Penerimaan Santri Baru (PPDB)", "Akademik"],
    ["cbt", "Ujian Berbasis Komputer (CBT)", "Akademik"],
    ["tahfidz", "Tahfidz dan Al-Qur'an", "Akademik"],
    ["boarding", "Asrama", "Akademik"],
    ["academic", "Pendidikan Formal", "Akademik"],
    ["lms", "Pembelajaran Digital (LMS)", "Akademik"],
    ["library", "Perpustakaan Digital", "Akademik"],
    ["finance", "Keuangan dan Tagihan SPP", "Keuangan"],
    ["communication", "Komunikasi dan Perizinan", "Operasional"],
    ["healthcare", "Kesehatan dan UKS", "Operasional"],
    ["cooperative", "Koperasi dan Kantin", "Operasional"],
    ["laundry", "Laundry Santri", "Operasional"],
    ["enterprise", "Manajemen Unit Usaha", "Kelembagaan"],
    ["erp", "Keuangan dan Anggaran", "Kelembagaan"],
    ["hris", "Kepegawaian (HRIS)", "Kelembagaan"],
    ["ga", "Sarana dan Prasarana", "Kelembagaan"],
    ["document", "Dokumen dan Arsip", "Kelembagaan"],
    ["alumni", "Alumni", "Ekosistem"],
    ["crm", "Wali Santri dan Donatur (CRM)", "Ekosistem"],
    ["donation", "Wakaf dan Infak", "Ekosistem"],
    ["marketplace", "Pasar Santri", "Ekosistem"],
    ["intelligence", "Analisis Operasional", "Inti"],
  ],
);

console.log("RBAC role ceiling, izin tab/tindakan/kolom, batas pemberian modul, dan katalog Indonesia lulus.");

