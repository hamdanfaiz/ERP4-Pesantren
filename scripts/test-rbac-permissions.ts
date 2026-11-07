import assert from "node:assert/strict";
import { findUnauthorizedModuleGrants, isModuleAccessible, isValidModulePermissions } from "../src/rbac";
import { ALL_MODULE_LIST } from "../src/services/systemSettingsService";
import type { ModuleId } from "../src/types";

const retiredModule = "ecosystem" as ModuleId;

assert.equal(isModuleAccessible("SuperAdmin", "settings", { settings: false }), true);
assert.equal(isModuleAccessible("Admin", "settings"), false);
assert.equal(isModuleAccessible("Admin", "finance"), true);
assert.equal(isModuleAccessible("Admin", "finance", { finance: false }), false);
assert.equal(isModuleAccessible("Ustadz", "finance"), false);
assert.equal(isModuleAccessible("Ustadz", "finance", { finance: true }), true);
assert.equal(isModuleAccessible("Admin", "finance", { finance: "false" } as unknown as Record<string, boolean>), false);
assert.equal(isModuleAccessible("SuperAdmin", retiredModule), false);
assert.equal(isModuleAccessible("Admin", retiredModule, { ecosystem: true }), false);
assert.equal(isValidModulePermissions({ finance: true, library: false }), true);
assert.equal(isValidModulePermissions({ finance: "false" }), false);
assert.equal(isValidModulePermissions({ notARealModule: true }), false);
assert.equal(isValidModulePermissions({ ecosystem: true }), false);
assert.equal(isValidModulePermissions([]), false);

const limitedAdminPermissions = { finance: false };
assert.deepEqual(
  findUnauthorizedModuleGrants("Admin", limitedAdminPermissions, "Santri", {}),
  ["finance"],
  "A role default cannot grant Finance beyond the actor's own scope.",
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

console.log("RBAC permissions, batas pemberian modul, dan katalog Indonesia: 20 pemeriksaan lulus");
