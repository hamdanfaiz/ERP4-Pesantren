import React from "react";
import { ShieldCheck } from "lucide-react";
import {
  getUserOverridableRolePermissionIds,
  isModuleAccessible,
  isRolePermissionAllowed,
  type RolePermissionId,
  type UserRole,
} from "../rbac";
import { ALL_MODULE_LIST } from "../services/systemSettingsService";
import type { ModuleId } from "../types";

const PERMISSION_KIND_LABEL: Record<string, string> = {
  tab: "Bagian",
  action: "Tindakan",
  field: "Data sensitif",
};

const PERMISSION_NAME_LABEL: Record<string, string> = {
  "acknowledge-announcement": "Konfirmasi pengumuman",
  "admin-recipient-directory": "Daftar penerima untuk petugas",
  "admin-summary": "Ringkasan administrasi",
  "approve-expense": "Menyetujui pengeluaran",
  "assess-audio": "Penilaian audio",
  assessment: "Penilaian",
  assessments: "Penilaian dan tugas",
  "assign-room": "Penempatan kamar",
  "assign-staff": "Penugasan petugas",
  assignments: "Penugasan",
  attendance: "Kehadiran",
  "audience-metrics": "Statistik jangkauan",
  badges: "Pencapaian Tahfidz",
  bills: "Tagihan",
  calendar: "Kalender",
  catalog: "Katalog",
  categories: "Kategori",
  circulation: "Peminjaman dan pengembalian",
  "circulation-roster": "Daftar sirkulasi",
  "comment-material": "Komentar materi",
  "comment-student": "Catatan santri",
  "conflict-resolver": "Penyelesaian bentrok jadwal",
  courses: "Kursus",
  "create-facility-ticket": "Pelaporan fasilitas",
  "create-ticket": "Tiket bantuan",
  curricula: "Kurikulum",
  dashboard: "Ringkasan",
  discipline: "Kedisiplinan",
  digital: "Koleksi digital",
  "direct-messages": "Pesan langsung",
  exams: "Munaqasyah dan ujian",
  "expense-approval": "Rincian persetujuan pengeluaran",
  expenses: "Pengeluaran",
  "export-ledger": "Ekspor buku besar",
  "export-report": "Ekspor laporan",
  "facility-audits": "Catatan audit fasilitas",
  "facility-ops": "Operasional fasilitas",
  "facility-reporter": "Identitas pelapor fasilitas",
  "follow-ups": "Tindak lanjut staf",
  "grade-submission": "Penilaian tugas",
  halaqah: "Halaqah",
  helpdesk: "Pusat bantuan",
  "instructor-directory": "Daftar pengajar",
  instructor: "Pengelolaan pengajar",
  "issue-bill": "Penerbitan tagihan",
  journal: "Jurnal mengajar",
  ledger: "Buku besar",
  "manage-assignments": "Pengelolaan tugas",
  "manage-catalog": "Pengelolaan katalog",
  "manage-categories": "Pengelolaan kategori",
  "manage-circulation": "Pengelolaan sirkulasi",
  "manage-content": "Pengelolaan materi",
  "manage-courses": "Pengelolaan kursus",
  "manage-digital-assets": "Pengelolaan koleksi digital",
  "manage-enrollments": "Pengelolaan peserta kursus",
  "manage-halaqah": "Pengelolaan halaqah",
  "manage-lock": "Pengaturan penguncian periode",
  "manage-report-card": "Pengelolaan rapor",
  "manage-sessions": "Pengelolaan jadwal",
  "manage-targets": "Pengelolaan target",
  "manage-templates": "Pengelolaan templat",
  "mark-attendance": "Pencatatan kehadiran",
  messages: "Pesan",
  "moderate-peer-review": "Moderasi penilaian antar-santri",
  monitor: "Pemantauan ujian",
  "own-ticket": "Tiket milik sendiri",
  packages: "Paket soal",
  parent: "Portal wali santri",
  "participant-results": "Hasil peserta ujian",
  "peer-review": "Penilaian antar-santri",
  "permit-identifiers": "Identitas pada perizinan",
  permits: "Perizinan",
  "private-learning-notes": "Catatan belajar pribadi",
  "process-permit": "Pemrosesan perizinan",
  "publish-announcement": "Penerbitan pengumuman",
  questions: "Bank soal",
  quran: "Al-Qur’an",
  "record-audit": "Pencatatan audit fasilitas",
  "record-discipline": "Pencatatan kedisiplinan",
  "record-notes": "Catatan penilaian internal",
  "record-setoran": "Pencatatan setoran",
  "recorded-by": "Identitas pencatat",
  records: "Riwayat setoran",
  "report-card": "Rapor",
  "request-permit": "Pengajuan izin",
  "resolve-conflicts": "Penyelesaian bentrok jadwal",
  "resolve-discipline": "Penyelesaian catatan kedisiplinan",
  "resolve-facility-ticket": "Penyelesaian tiket fasilitas",
  results: "Hasil ujian",
  "review-payment": "Verifikasi pembayaran",
  rooms: "Penempatan kamar",
  "save-private-note": "Penyimpanan catatan pribadi",
  schedule: "Jadwal",
  "send-message": "Pengiriman pesan",
  "send-reminders": "Pengiriman pengingat",
  settings: "Pengaturan ujian",
  "student-billing": "Tagihan santri terkait",
  "student-circulation": "Riwayat pinjam santri terkait",
  "student-exam": "Ujian santri",
  "student-identifiers": "Identitas santri",
  "student-roster": "Daftar santri",
  "student-submission-feedback": "Umpan balik tugas santri",
  subjects: "Mata pelajaran",
  "submission-roster": "Daftar pengumpulan tugas",
  submissions: "Pengumpulan tugas",
  "submit-assignment": "Pengumpulan tugas",
  "submit-expense": "Pengajuan pengeluaran",
  "submit-payment": "Pengiriman bukti pembayaran",
  "submit-peer-review": "Pengajuan penilaian antar-santri",
  talaqqi: "Jadwal talaqqi",
  targets: "Target dan rapor",
  teachers: "Guru dan asatidz",
  templates: "Templat pesan",
  "tenant-recipient-directory": "Daftar penerima tenant",
  "ticket-roster": "Daftar tiket tenant",
  "track-progress": "Pemantauan kemajuan belajar",
  "transition-ticket": "Perubahan status tiket",
  "update-message-status": "Perubahan status pesan",
  "video-library": "Pustaka video",
  "write-assessment": "Pencatatan penilaian",
  "write-journal": "Pencatatan jurnal mengajar",
  "write-schedule": "Pengelolaan jadwal",
};

function humanizePermissionName(value: string): string {
  return PERMISSION_NAME_LABEL[value] || value.split("-").map((part) =>
    part ? part[0].toLocaleUpperCase("id-ID") + part.slice(1) : part,
  ).join(" ");
}

function actorCanManageModule(actorRole: UserRole, actorPermissions: Record<string, boolean> | null | undefined, moduleId: string): boolean {
  return actorRole === "SuperAdmin"
    || (actorRole === "Admin" && isModuleAccessible(actorRole, moduleId as ModuleId, actorPermissions));
}

export function RoleFeaturePermissionEditor({
  role,
  modulePermissions,
  overrides,
  actorRole,
  actorPermissions,
  disabled = false,
  onChange,
}: {
  role: UserRole;
  modulePermissions: Record<string, boolean>;
  overrides: Partial<Record<RolePermissionId, false>>;
  actorRole: UserRole;
  actorPermissions?: Record<string, boolean> | null;
  disabled?: boolean;
  onChange: (next: Partial<Record<RolePermissionId, false>>) => void;
}) {
  const byModule = new Map<string, RolePermissionId[]>();
  for (const permissionId of getUserOverridableRolePermissionIds(role)) {
    const moduleId = permissionId.split(".")[0];
    const group = byModule.get(moduleId) || [];
    group.push(permissionId);
    byModule.set(moduleId, group);
  }

  const moduleNames = new Map(ALL_MODULE_LIST.map((item) => [item.id, item.name]));
  const groups = [...byModule.entries()].sort(([left], [right]) => left.localeCompare(right));

  if (groups.length === 0) return null;

  return <details className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:hidden dark:text-slate-100">
      <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Hak akses rinci: bagian, tindakan, dan data</span>
      <span className="mt-1 block pl-6 text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">
        Peran menentukan batas akses. Centang izin untuk membatasi fitur yang dapat digunakan akun ini.
      </span>
    </summary>
    <div className="max-h-80 space-y-3 overflow-y-auto border-t border-slate-200 p-3 dark:border-white/10">
      {groups.map(([moduleId, permissionIds]) => {
        const moduleEnabled = isModuleAccessible(role, moduleId as ModuleId, modulePermissions);
        const actorCanManage = actorCanManageModule(actorRole, actorPermissions, moduleId);
        return <fieldset key={moduleId} disabled={disabled || !moduleEnabled || !actorCanManage}
          className="rounded-lg border border-slate-200 bg-white p-3 disabled:opacity-55 dark:border-white/10 dark:bg-slate-950/60">
          <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{moduleNames.get(moduleId as ModuleId) || moduleId}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {permissionIds.map((permissionId) => {
              const [, kind, name] = permissionId.split(".");
              const restricted = overrides[permissionId] === false;
              const allowedByRole = isRolePermissionAllowed(role, permissionId);
              return <label key={permissionId}
                className={`flex min-h-9 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors ${restricted ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100" : "border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:text-slate-300"} ${allowedByRole && moduleEnabled && actorCanManage ? "cursor-pointer" : "cursor-not-allowed"}`}>
                <input type="checkbox" checked={restricted} disabled={!allowedByRole || !moduleEnabled || !actorCanManage || disabled}
                  onChange={(event) => {
                    const next = { ...overrides };
                    if (event.target.checked) next[permissionId] = false;
                    else delete next[permissionId];
                    onChange(next);
                  }}
                  aria-label={`Batasi akses ${PERMISSION_KIND_LABEL[kind] || kind}: ${humanizePermissionName(name)}`} />
                <span className="min-w-0 flex-1"><span className="font-semibold">{PERMISSION_KIND_LABEL[kind] || kind}</span> · {humanizePermissionName(name)}</span>
                {restricted && <span className="shrink-0 text-[10px] font-semibold text-amber-800 dark:text-amber-200">Dibatasi</span>}
              </label>;
            })}
          </div>
        </fieldset>;
      })}
    </div>
  </details>;
}
