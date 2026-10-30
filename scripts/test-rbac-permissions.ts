import assert from "node:assert/strict";
import { isModuleAccessible, isValidModulePermissions } from "../src/rbac";
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

console.log("RBAC permissions dan katalog modul Indonesia: 15 pemeriksaan lulus");
