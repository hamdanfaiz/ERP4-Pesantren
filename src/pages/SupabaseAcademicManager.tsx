import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CalendarDays, Check, ClipboardList, FileText, Loader2, Plus, RefreshCw, ShieldCheck, Users, Wrench } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { SupabaseAcademicPortal } from "./SupabaseAcademicPortal";
import { ERPFeatureStatus, ERPTabs } from "../components/ERPDesignSystem";

type RecordRow = Record<string, any> & { id: string };
type Student = { id: string; name: string; nis: string; className: string; organizationUnitId?: string | null; organizationUnitName?: string | null };
type Teacher = { id: string; name: string; organizationUnitId?: string | null; organizationUnitName?: string | null };
type Unit = { id: string; name: string; code: string; status: string; unitType: string };
type AcademicClass = { id: string; name: string; organizationUnitId?: string | null };
type UnmappedAcademicClass = { id: string; name: string; status: string };
type UnmappedAcademicClassSnapshot = { classes: UnmappedAcademicClass[]; classCount: number; limit: number; offset: number };
type Snapshot = { schedules: RecordRow[]; journals: RecordRow[]; assessments: RecordRow[]; students: Student[]; teachers: Teacher[]; classes: AcademicClass[]; units: Unit[]; unitsEnabled: boolean };
type Tab = "schedule" | "journal" | "assessment" | "report-card" | "conflict-resolver";

const EMPTY: Snapshot = { schedules: [], journals: [], assessments: [], students: [], teachers: [], classes: [], units: [], unitsEnabled: false };
const EMPTY_UNMAPPED_CLASSES: UnmappedAcademicClassSnapshot = { classes: [], classCount: 0, limit: 100, offset: 0 };
const ACADEMIC_IMPORT_ENABLED = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_ACADEMIC_IMPORT_ENABLED") === "true";
type AcademicImportPreview = {
  snapshotFingerprint: string;
  counts: { schedules: number; journals: number; assessments: number; source: number; ready: number; alreadyImported: number };
  issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }>;
  issueCount: number;
  blockingCount: number;
  canApply: boolean;
};
const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "schedule", label: "Jadwal KBM", icon: CalendarDays },
  { id: "journal", label: "Jurnal KBM", icon: ClipboardList },
  { id: "assessment", label: "Penilaian", icon: BookOpen },
  { id: "report-card", label: "E-Rapor", icon: FileText },
  { id: "conflict-resolver", label: "Konflik Jadwal", icon: Wrench },
];

async function requestAcademic(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Data akademik belum dapat diproses.");
  return payload;
}

const fieldClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

function today() { return new Date().toISOString().slice(0, 10); }

export function SupabaseAcademicManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [unitFilter, setUnitFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>("schedule");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [migrationNotice, setMigrationNotice] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<AcademicImportPreview | null>(null);
  const [unmappedClasses, setUnmappedClasses] = useState<UnmappedAcademicClassSnapshot>(EMPTY_UNMAPPED_CLASSES);
  const [classMappingLoading, setClassMappingLoading] = useState(false);
  const [classMappingError, setClassMappingError] = useState("");
  const [classMappingNotice, setClassMappingNotice] = useState("");
  const [classMappingRequest, setClassMappingRequest] = useState("");
  const [classMappingSelections, setClassMappingSelections] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState({ day: "Senin", time: "07:30 - 09:00", subject: "", teacherUserId: "", teacherName: "", className: "", room: "", curriculum: "Formal", organizationUnitId: "" });
  const [journal, setJournal] = useState({ date: today(), className: "", subject: "", topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "", teacherUserId: "", teacherName: "", organizationUnitId: "" });
  const [assessment, setAssessment] = useState({ studentId: "", studentName: "", className: "", teacherUserId: "", subject: "", assessmentType: "Tugas Harian", category: "Formative", score: "" });

  useEffect(() => {
    if (role === "Ustadz" && user?.uid) {
      const currentTeacher = snapshot.teachers.find((teacher) => teacher.id === user.uid);
      const teacherName = currentTeacher?.name || user.name || "";
      if (teacherName) setJournal((current) => ({ ...current, teacherUserId: user.uid, teacherName }));
      setActiveTab("journal");
    }
  }, [role, user?.uid, user?.name, snapshot.teachers]);

  const isAdmin = role === "Admin" || role === "SuperAdmin";
  const canManage = isAdmin || role === "Ustadz";
  const activeUnits = useMemo(() => snapshot.units.filter((unit) => unit.status === "active"), [snapshot.units]);
  const refreshUnmappedClasses = useCallback(async (offset = 0) => {
    setClassMappingLoading(true);
    setClassMappingError("");
    try {
      const result = await requestAcademic(`/api/academic/classes/unit-assignment/unmapped?offset=${offset}`);
      setUnmappedClasses({
        classes: Array.isArray(result.classes) ? result.classes : [],
        classCount: Number(result.classCount || 0),
        limit: Number(result.limit || 100),
        offset: Number(result.offset || 0),
      });
    } catch (loadError: any) {
      setUnmappedClasses(EMPTY_UNMAPPED_CLASSES);
      setClassMappingError(loadError?.message || "Daftar kelas tanpa unit belum dapat dimuat.");
    } finally { setClassMappingLoading(false); }
  }, []);
  const scheduleUnitId = schedule.organizationUnitId || activeUnits[0]?.id || "";
  const journalUnitId = journal.organizationUnitId || activeUnits[0]?.id || "";
  const classesForUnit = useCallback((unitId: string) => {
    const byName = new Map<string, AcademicClass>();
    for (const row of snapshot.classes) {
      if (snapshot.unitsEnabled && row.organizationUnitId && row.organizationUnitId !== unitId) continue;
      const existing = byName.get(row.name);
      if (!existing || row.organizationUnitId === unitId) byName.set(row.name, row);
    }
    return [...byName.keys()].sort((a, b) => a.localeCompare(b, "id"));
  }, [snapshot.classes, snapshot.unitsEnabled]);
  const scheduleClasses = useMemo(() => classesForUnit(scheduleUnitId), [classesForUnit, scheduleUnitId]);
  const journalClasses = useMemo(() => classesForUnit(journalUnitId), [classesForUnit, journalUnitId]);
  const scheduleTeachers = useMemo(() => snapshot.unitsEnabled && isAdmin
    ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === scheduleUnitId)
    : snapshot.teachers, [snapshot.teachers, snapshot.unitsEnabled, isAdmin, scheduleUnitId]);
  const journalTeachers = useMemo(() => snapshot.unitsEnabled && isAdmin
    ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === journalUnitId)
    : snapshot.teachers, [snapshot.teachers, snapshot.unitsEnabled, isAdmin, journalUnitId]);

  const refresh = useCallback(async () => {
    if (!canManage || !user?.tenantId) { setSnapshot(EMPTY); return; }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams();
      if (unitFilter !== "all") query.set("unitId", unitFilter);
      const queryString = query.toString();
      const payload = await requestAcademic("/api/academic/snapshot" + (queryString ? "?" + queryString : ""));
      setSnapshot({
        schedules: Array.isArray(payload.schedules) ? payload.schedules : [],
        journals: Array.isArray(payload.journals) ? payload.journals : [],
        assessments: Array.isArray(payload.assessments) ? payload.assessments : [],
        students: Array.isArray(payload.students) ? payload.students : [],
        teachers: Array.isArray(payload.teachers) ? payload.teachers : [],
        classes: Array.isArray(payload.classes) ? payload.classes : [],
        units: Array.isArray(payload.units) ? payload.units : [],
        unitsEnabled: payload.unitsEnabled === true,
      });
      if (payload.unitsEnabled === true && isAdmin) await refreshUnmappedClasses();
      else setUnmappedClasses(EMPTY_UNMAPPED_CLASSES);
    } catch (loadError: any) { setSnapshot(EMPTY); setError(loadError?.message || "Data Akademik Supabase belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [canManage, isAdmin, refreshUnmappedClasses, user?.tenantId, user?.uid, unitFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (role === "Santri" || role === "Walisantri") return <SupabaseAcademicPortal />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const form = activeTab === "schedule" ? schedule : activeTab === "journal" ? journal : assessment;
      const payload = {
        ...form,
        ...(snapshot.unitsEnabled && activeTab === "schedule" && isAdmin ? { organizationUnitId: scheduleUnitId } : {}),
        ...(snapshot.unitsEnabled && activeTab === "journal" && isAdmin ? { organizationUnitId: journalUnitId } : {}),
        clientRequestId: crypto.randomUUID(),
      };
      await requestAcademic(`/api/academic/${activeTab}`, { method: "POST", body: JSON.stringify({ record: payload }) });
      setNotice("Data tersimpan di tenant Supabase.");
      if (activeTab === "schedule") setSchedule((current) => ({ ...current, organizationUnitId: scheduleUnitId, subject: "", room: "" }));
      if (activeTab === "journal") setJournal((current) => ({ ...current, organizationUnitId: journalUnitId, topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "" }));
      if (activeTab === "assessment") setAssessment((current) => ({ ...current, score: "" }));
      await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Data akademik belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const selectedStudent = snapshot.students.find((student) => student.id === assessment.studentId);
  const assessmentTeachers = snapshot.unitsEnabled && isAdmin
    ? selectedStudent?.organizationUnitId
      ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === selectedStudent.organizationUnitId)
      : []
    : snapshot.teachers;
  const creatingAcademicRecord = unitFilter !== "unassigned";
  const hasUnitForWrite = !snapshot.unitsEnabled || !isAdmin || activeUnits.length > 0;
  const changeStudent = (studentId: string) => {
    const student = snapshot.students.find((item) => item.id === studentId);
    setAssessment((current) => ({ ...current, studentId, studentName: student?.name || "", className: student?.className || "" }));
  };
  const setJournalTeacher = (teacherId: string) => {
    const teacher = snapshot.teachers.find((item) => item.id === teacherId);
    setJournal((current) => ({ ...current, teacherUserId: teacherId, teacherName: teacher?.name || "" }));
  };
  const setScheduleTeacher = (teacherId: string) => {
    const teacher = snapshot.teachers.find((item) => item.id === teacherId);
    setSchedule((current) => ({ ...current, teacherUserId: teacherId, teacherName: teacher?.name || "" }));
  };
  const setAssessmentTeacher = (teacherId: string) => setAssessment((current) => ({ ...current, teacherUserId: teacherId }));

  const assignClassUnit = async (classId: string, unitId: string) => {
    setClassMappingRequest(classId);
    setClassMappingError("");
    setClassMappingNotice("");
    try {
      const result = await requestAcademic("/api/academic/classes/unit-assignment", {
        method: "POST",
        body: JSON.stringify({ classId, unitId, clientRequestId: crypto.randomUUID() }),
      });
      setClassMappingNotice(result.alreadyApplied ? "Pemetaan kelas ini sudah tercatat." : "Kelas berhasil dipetakan ke unit.");
      setClassMappingSelections((current) => { const next = { ...current }; delete next[classId]; return next; });
      await refresh();
    } catch (cause: any) {
      setClassMappingError(cause?.message || "Kelas belum dapat dipetakan ke unit.");
    } finally { setClassMappingRequest(""); }
  };

  const previewLegacyImport = async () => {
    setMigrationLoading(true); setMigrationError(""); setMigrationNotice(""); setMigrationPreview(null);
    try {
      const result = await requestAcademic("/api/academic/legacy/import", {
        method: "POST", body: JSON.stringify({ action: "preview" }),
      });
      setMigrationPreview(result as AcademicImportPreview);
    } catch (cause: any) { setMigrationError(cause?.message || "Pratinjau data lama gagal."); }
    finally { setMigrationLoading(false); }
  };

  const applyLegacyImport = async () => {
    if (!migrationPreview?.canApply) return;
    setMigrationLoading(true); setMigrationError(""); setMigrationNotice("");
    try {
      const result = await requestAcademic("/api/academic/legacy/import", {
        method: "POST",
        body: JSON.stringify({ action: "apply", expectedFingerprint: migrationPreview.snapshotFingerprint }),
      });
      setMigrationNotice("Migrasi selesai: " + Number(result.imported || 0) + " record baru, " + Number(result.skipped || 0) + " record sudah pernah diimpor.");
      setMigrationPreview(null);
      await refresh();
    } catch (cause: any) { setMigrationError(cause?.message || "Migrasi data lama gagal."); }
    finally { setMigrationLoading(false); }
  };

  if (!canManage) return <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Akses Akademik tidak tersedia untuk akun ini.</section>;

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" />Sumber data: Supabase tenant</div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Akademik</h1><p className="mt-1 text-sm text-slate-500">Jadwal KBM, jurnal pengajaran, dan penilaian tersimpan pada backend tenant.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
    </header>

    {snapshot.unitsEnabled && isAdmin && <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Cakupan unit organisasi</p><p className="mt-1 text-xs text-slate-500">Data lama tanpa pemetaan tetap tersedia melalui filter khusus.</p></div>
      <label className={`${labelClass} sm:min-w-64`}>Tampilkan data
        <select className={fieldClass} value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
          <option value="all">Semua unit</option>
          {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          <option value="unassigned">Belum dipetakan</option>
        </select>
      </label>
    </div>}
    {snapshot.unitsEnabled && role === "Ustadz" && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Cakupan data dibatasi ke unit {activeUnits[0]?.name || "akun Anda"}.</p>}
    {snapshot.unitsEnabled && unitFilter === "unassigned" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Mode ini hanya untuk meninjau arsip yang belum dipetakan. Pencatatan baru dinonaktifkan sampai unit dipilih.</p>}

    {snapshot.unitsEnabled && isAdmin && <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white dark:border-amber-400/20 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-amber-100 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Pemetaan kelas lama ke unit</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pilih unit berdasarkan data pesantren. Setiap pemetaan dicatat dan tidak dapat dipindahkan lewat tindakan biasa.</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{unmappedClasses.classCount} belum dipetakan</span><button type="button" onClick={() => void refreshUnmappedClasses(unmappedClasses.offset)} disabled={classMappingLoading || Boolean(classMappingRequest)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5" aria-label="Muat ulang kelas tanpa unit"><RefreshCw className={`h-4 w-4 ${classMappingLoading ? "animate-spin" : ""}`} /></button></div>
      </div>
      {classMappingError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{classMappingError}</p>}
      {classMappingNotice && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">{classMappingNotice}</p>}
      {classMappingLoading && unmappedClasses.classes.length === 0 ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat kelas lama…</div>
        : classMappingError ? <div className="p-8 text-center text-sm text-slate-500">Daftar kelas tanpa unit belum dapat diverifikasi.</div>
          : unmappedClasses.classCount === 0 ? <div className="p-8 text-center text-sm text-slate-500">Semua kelas tenant sudah memiliki unit.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Kelas tenant yang belum dipetakan ke unit organisasi</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Unit yang benar</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{unmappedClasses.classes.map((item) => { const selectedUnit = classMappingSelections[item.id] || ""; const pending = classMappingRequest === item.id; return <tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-white">{item.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{item.id}</p></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.status || "—"}</td><td className="px-4 py-3"><select aria-label={`Unit untuk kelas ${item.name}`} className={fieldClass} disabled={Boolean(classMappingRequest) || classMappingLoading || activeUnits.length === 0} value={selectedUnit} onChange={(event) => setClassMappingSelections((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Pilih unit</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></td><td className="px-4 py-3 text-right"><button type="button" className={buttonClass} disabled={!selectedUnit || Boolean(classMappingRequest) || activeUnits.length === 0} onClick={() => void assignClassUnit(item.id, selectedUnit)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pending ? "Menyimpan…" : "Tetapkan"}</button></td></tr>; })}</tbody></table></div>}
      {unmappedClasses.classCount > unmappedClasses.limit && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800"><span>Menampilkan kelas {unmappedClasses.offset + 1}–{Math.min(unmappedClasses.offset + unmappedClasses.limit, unmappedClasses.classCount)} dari {unmappedClasses.classCount}.</span><div className="flex gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-slate-700" disabled={unmappedClasses.offset === 0 || classMappingLoading || Boolean(classMappingRequest)} onClick={() => void refreshUnmappedClasses(Math.max(0, unmappedClasses.offset - unmappedClasses.limit))}>Sebelumnya</button><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-slate-700" disabled={unmappedClasses.offset + unmappedClasses.limit >= unmappedClasses.classCount || classMappingLoading || Boolean(classMappingRequest)} onClick={() => void refreshUnmappedClasses(unmappedClasses.offset + unmappedClasses.limit)}>Berikutnya</button></div></div>}
      {activeUnits.length === 0 && <p className="border-t border-amber-100 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:text-amber-200">Buat unit aktif terlebih dahulu sebelum memetakan kelas.</p>}
    </section>}

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Jadwal aktif", value: snapshot.schedules.length, icon: CalendarDays }, { label: "Jurnal KBM", value: snapshot.journals.length, icon: ClipboardList }, { label: "Penilaian", value: snapshot.assessments.length, icon: BookOpen }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-emerald-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>Data akademik tenant.</strong> Jadwal, jurnal, dan penilaian baru dicatat di Supabase. Layar ini saat ini mencakup tiga alur tersebut; rapor, KKTP/remedial, pengaturan akademik, komentar wali kelas, serta portal Santri/Wali belum tersedia.</div>
    {isAdmin && ACADEMIC_IMPORT_ENABLED && <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-400/20 dark:bg-violet-400/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-violet-950 dark:text-violet-100">Migrasi arsip Akademik dari Firebase</h2><p className="mt-1 text-sm text-violet-900/80 dark:text-violet-100/70">Backend membaca jadwal, jurnal, dan penilaian untuk tenant ini. Data baru hanya ditulis setelah pratinjau lolos dan Anda memilih Terapkan.</p></div>
        <button type="button" onClick={() => void previewLegacyImport()} disabled={migrationLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-300/20 dark:bg-slate-900 dark:text-violet-100"><RefreshCw className={migrationLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{migrationLoading ? "Memeriksa…" : "Pratinjau data lama"}</button>
      </div>
      {migrationError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{migrationError}</div>}
      {migrationNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">{migrationNotice}</div>}
      {migrationPreview && <div className="space-y-3 rounded-xl border border-violet-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Jadwal", value: migrationPreview.counts.schedules },
            { label: "Jurnal", value: migrationPreview.counts.journals },
            { label: "Penilaian", value: migrationPreview.counts.assessments },
            { label: "Siap diimpor", value: migrationPreview.counts.ready },
            { label: "Sudah diimpor", value: migrationPreview.counts.alreadyImported },
          ].map((stat) => <div key={stat.label} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs text-slate-500">{stat.label}</div><div className="mt-1 font-semibold text-slate-900 dark:text-white">{stat.value}</div></div>)}
        </div>
        {migrationPreview.issueCount > 0 && <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{migrationPreview.blockingCount} masalah harus ditangani; {migrationPreview.issueCount - migrationPreview.blockingCount} peringatan informatif.</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">{migrationPreview.issues.map((issue, index) => <li key={issue.recordRef + issue.code + index} className="flex flex-wrap gap-2"><span className={issue.severity === "blocking" ? "font-semibold text-rose-700 dark:text-rose-300" : "font-semibold text-amber-700 dark:text-amber-300"}>{academicImportIssueLabel(issue.code)}</span>{issue.recordRef && <span className="font-mono text-slate-400">Ref {issue.recordRef}</span>}</li>)}</ul>
          {migrationPreview.issueCount > migrationPreview.issues.length && <p className="text-xs text-slate-500">Menampilkan {migrationPreview.issues.length} dari {migrationPreview.issueCount} masalah.</p>}
        </div>}
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Data sumber berubah setelah pratinjau akan membatalkan penerapan. Pemetaan nama ganda dan bentrok jadwal tidak ditebak.</p>
          <button type="button" onClick={() => void applyLegacyImport()} disabled={migrationLoading || !migrationPreview.canApply} className={buttonClass}>{migrationLoading ? "Menerapkan…" : "Terapkan migrasi"}</button>
        </div>
      </div>}
    </section>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <ERPTabs tabs={TABS.filter((tab) => tab.id !== "schedule" || isAdmin).map((tab) => ({ ...tab, icon: <tab.icon className="h-4 w-4" /> }))} value={activeTab} onChange={(id) => { setActiveTab(id as Tab); setError(""); setNotice(""); }} ariaLabel="Bagian akademik" />

    {activeTab === "report-card" ? <ERPFeatureStatus
      title="E-Rapor"
      description="Menu E-Rapor dari referensi kini terlihat. Penyimpanan nilai harian sudah tersedia pada Penilaian, tetapi penyusunan rapor semester, validasi wali kelas, pengesahan, dan penerbitan rapor belum memiliki alur Supabase tersendiri."
    /> : activeTab === "conflict-resolver" ? <ERPFeatureStatus
      title="Penyelesaian konflik jadwal"
      description="Jadwal KBM tenant dapat dicatat dan dibaca. Deteksi konflik lintas pengajar/ruang/kelas, rekomendasi pengganti, dan persetujuan perubahan otomatis belum disambungkan ke API Supabase."
    /> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? "Jadwal tersimpan" : activeTab === "journal" ? "Jurnal terbaru" : "Penilaian terbaru"}</h2></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data tenant…</div> : activeTab === "schedule" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.schedules.length ? snapshot.schedules.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{row.day} · {row.time}</span></div><p className="mt-1 text-sm text-slate-500">{row.className} · {row.teacherName}{row.room ? ` · ${row.room}` : ""}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</article>) : <Empty label="Belum ada jadwal KBM di tenant ini." />}</div> : activeTab === "journal" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.journals.length ? snapshot.journals.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject} · {row.className}</h3><span className="text-xs text-slate-500">{row.date}</span></div><p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.topic}</p><p className="mt-1 text-xs text-slate-500">Pengajar: {row.teacherName} · {journalAttendanceLabel(row.attendance)}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</article>) : <Empty label="Belum ada jurnal KBM di tenant ini." />}</div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.assessments.length ? snapshot.assessments.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{row.studentName}</h3><p className="mt-1 text-sm text-slate-500">{row.className} · {row.subject} · {row.assessmentType}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</div><span className={`rounded-lg px-3 py-1 text-sm font-bold ${Number(row.score) < 75 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"}`}>{row.score}</span></article>) : <Empty label="Belum ada penilaian di tenant ini." />}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? "Tambah jadwal" : activeTab === "journal" ? "Catat jurnal KBM" : "Input penilaian"}</h2></div>
        {loading ? <p className="text-sm text-slate-500">Menunggu data tenant…</p> : <form onSubmit={submit} className="space-y-4">
          {activeTab === "schedule" && <>
            {snapshot.unitsEnabled && isAdmin && <Field label="Unit organisasi"><select required className={fieldClass} value={scheduleUnitId} onChange={(e) => setSchedule((current) => ({ ...current, organizationUnitId: e.target.value, teacherUserId: "", teacherName: "" }))}><option value="">Pilih unit aktif</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
            <Field label="Hari"><select className={fieldClass} value={schedule.day} onChange={(e) => setSchedule({ ...schedule, day: e.target.value })}>{["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((day) => <option key={day}>{day}</option>)}</select></Field>
            <Field label="Waktu (HH:MM - HH:MM)"><input required className={fieldClass} value={schedule.time} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} placeholder="07:30 - 09:00" /></Field>
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={schedule.subject} onChange={(e) => setSchedule({ ...schedule, subject: e.target.value })} /></Field>
            <Field label="Kelas"><select required className={fieldClass} value={schedule.className} onChange={(e) => setSchedule({ ...schedule, className: e.target.value })}><option value="">Pilih kelas dari roster</option>{scheduleClasses.map((name) => <option key={name}>{name}</option>)}</select></Field>
            <Field label="Pengajar"><select required className={fieldClass} value={schedule.teacherUserId} onChange={(e) => setScheduleTeacher(e.target.value)}><option value="">Pilih pengajar</option>{scheduleTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>
            <Field label="Ruang"><input maxLength={100} className={fieldClass} value={schedule.room} onChange={(e) => setSchedule({ ...schedule, room: e.target.value })} /></Field>
            <Field label="Kurikulum"><input maxLength={100} className={fieldClass} value={schedule.curriculum} onChange={(e) => setSchedule({ ...schedule, curriculum: e.target.value })} /></Field>
          </>}
          {activeTab === "journal" && <>
            {snapshot.unitsEnabled && isAdmin && <Field label="Unit organisasi"><select required className={fieldClass} value={journalUnitId} onChange={(e) => setJournal((current) => ({ ...current, organizationUnitId: e.target.value, teacherUserId: "", teacherName: "" }))}><option value="">Pilih unit aktif</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
            <Field label="Tanggal"><input type="date" required className={fieldClass} value={journal.date} onChange={(e) => setJournal({ ...journal, date: e.target.value })} /></Field>
            <Field label="Kelas"><select required className={fieldClass} value={journal.className} onChange={(e) => setJournal({ ...journal, className: e.target.value })}><option value="">Pilih kelas dari roster</option>{journalClasses.map((name) => <option key={name}>{name}</option>)}</select></Field>
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={journal.subject} onChange={(e) => setJournal({ ...journal, subject: e.target.value })} /></Field>
            <Field label="Materi"><textarea required maxLength={2000} rows={3} className={fieldClass} value={journal.topic} onChange={(e) => setJournal({ ...journal, topic: e.target.value })} /></Field>
            <Field label="Kompetensi / catatan"><textarea maxLength={4000} rows={2} className={fieldClass} value={journal.competency} onChange={(e) => setJournal({ ...journal, competency: e.target.value })} /></Field>
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={journal.teacherUserId} onChange={(e) => setJournalTeacher(e.target.value)}><option value="">Pilih pengajar</option>{journalTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <div className="grid grid-cols-3 gap-2">{([["attendancePresent", "Hadir"], ["attendanceExcused", "Izin/sakit"], ["attendanceAbsent", "Absen"]] as const).map(([key, label]) => <label key={key} className={labelClass}>{label}<input type="number" min="0" max="500" className={fieldClass} value={journal[key]} onChange={(e) => setJournal({ ...journal, [key]: e.target.value })} /></label>)}</div>
          </>}
          {activeTab === "assessment" && <>
            <Field label="Santri"><select required className={fieldClass} value={assessment.studentId} onChange={(e) => changeStudent(e.target.value)}><option value="">Pilih santri aktif</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></Field>
            {selectedStudent && <p className="-mt-2 text-xs text-slate-500">Kelas {selectedStudent.className || "belum ditetapkan"}{selectedStudent.organizationUnitName ? ` · ${selectedStudent.organizationUnitName}` : snapshot.unitsEnabled ? " · belum dipetakan ke unit" : ""}</p>}
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={assessment.teacherUserId} onChange={(e) => setAssessmentTeacher(e.target.value)}><option value="">Pilih pengajar</option>{assessmentTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={assessment.subject} onChange={(e) => setAssessment({ ...assessment, subject: e.target.value })} /></Field>
            <Field label="Jenis penilaian"><input required maxLength={100} className={fieldClass} value={assessment.assessmentType} onChange={(e) => setAssessment({ ...assessment, assessmentType: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Kategori"><select className={fieldClass} value={assessment.category} onChange={(e) => setAssessment({ ...assessment, category: e.target.value })}><option value="Formative">Formatif</option><option value="Summative">Sumatif</option></select></Field><Field label="Nilai (0–100)"><input type="number" required min="0" max="100" step="any" className={fieldClass} value={assessment.score} onChange={(e) => setAssessment({ ...assessment, score: e.target.value })} /></Field></div>
          </>}
          <button type="submit" disabled={saving || loading || !creatingAcademicRecord || !hasUnitForWrite || (activeTab === "assessment" && (snapshot.students.length === 0 || (snapshot.unitsEnabled && !selectedStudent?.organizationUnitId)))} className={`${buttonClass} w-full`}><Plus className="h-4 w-4" />{saving ? "Menyimpan…" : "Simpan ke Supabase"}</button>
          {activeTab === "assessment" && snapshot.students.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-200">Roster tenant belum tersedia, sehingga input nilai dinonaktifkan.</p>}
          {snapshot.unitsEnabled && isAdmin && activeUnits.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-200">Belum ada unit aktif. Admin perlu menyiapkan unit sebelum pencatatan akademik.</p>}
          {snapshot.unitsEnabled && activeTab === "assessment" && selectedStudent && !selectedStudent.organizationUnitId && <p className="text-xs text-amber-700 dark:text-amber-200">Santri ini belum dipetakan ke unit; nilai belum dapat disimpan agar cakupan unit tetap konsisten.</p>}
          {role === "Ustadz" && <p className="flex items-start gap-2 text-xs text-slate-500"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />Akses roster dibatasi pada kelas yang memiliki jadwal dengan pengajar ini.</p>}
        </form>}
      </section>
    </div>}
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={labelClass}>{label}{children}</label>; }
function Empty({ label }: { label: string }) { return <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500"><BookOpen className="h-5 w-5 opacity-50" />{label}</div>; }
function academicImportIssueLabel(code: string) {
  const labels: Record<string, string> = {
    record_limit_exceeded: "Jumlah arsip melebihi batas 3.000 record.",
    invalid_source_record: "Record sumber tidak valid.",
    invalid_source_record_id: "ID sumber tidak valid.",
    duplicate_source_id: "ID sumber duplikat.",
    source_changed_after_import: "Record lama berubah setelah pernah diimpor.",
    ambiguous_class: "Nama kelas cocok ke lebih dari satu kelas.",
    class_not_found: "Kelas belum ada atau tidak cocok di Master Data.",
    ambiguous_teacher: "Nama pengajar cocok ke lebih dari satu profil.",
    teacher_not_found: "Profil pengajar aktif tidak ditemukan.",
    invalid_schedule: "Format jadwal atau mata pelajaran tidak valid.",
    invalid_journal: "Tanggal, materi, atau isi jurnal tidak valid.",
    attendance_student_mapping_failed: "Nama/status kehadiran santri tidak dapat dipetakan dengan aman.",
    attendance_summary_invalid: "Ringkasan kehadiran tidak valid.",
    attendance_summary_only: "Sumber hanya menyimpan jumlah hadir/total; rincian status tidak tersedia.",
    attendance_count_out_of_range: "Jumlah kehadiran melewati batas.",
    ambiguous_student: "Santri cocok ke lebih dari satu record.",
    student_not_found: "Santri aktif tidak ditemukan pada kelas tersebut.",
    invalid_assessment: "Nilai atau informasi penilaian tidak valid.",
    invalid_original_score: "Nilai awal remedial tidak valid.",
    schedule_overlap: "Jadwal berbenturan untuk pengajar, ruang, atau kelas.",
  };
  return labels[code] || "Perlu pemeriksaan manual.";
}
function journalAttendanceLabel(attendance: Record<string, any> | undefined) {
  if (attendance?.legacyBreakdownUnavailable) {
    return "Hadir " + Number(attendance.present || 0) + "/" + Number(attendance.legacyTotal || 0) + " · rincian status tidak tersedia";
  }
  return "Hadir " + Number(attendance?.present || 0) + ", izin/sakit " + Number(attendance?.excused || 0) + ", absen " + Number(attendance?.absent || 0);
}
