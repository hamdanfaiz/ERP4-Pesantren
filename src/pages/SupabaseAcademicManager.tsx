import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CalendarDays, Check, ClipboardList, Loader2, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { SupabaseAcademicPortal } from "./SupabaseAcademicPortal";

type RecordRow = Record<string, any> & { id: string };
type Student = { id: string; name: string; nis: string; className: string };
type Teacher = { id: string; name: string };
type Snapshot = { schedules: RecordRow[]; journals: RecordRow[]; assessments: RecordRow[]; students: Student[]; teachers: Teacher[]; classes: string[] };
type Tab = "schedule" | "journal" | "assessment";

const EMPTY: Snapshot = { schedules: [], journals: [], assessments: [], students: [], teachers: [], classes: [] };
const ACADEMIC_IMPORT_ENABLED = import.meta.env.VITE_SUPABASE_ACADEMIC_IMPORT_ENABLED === "true";
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
  const [activeTab, setActiveTab] = useState<Tab>("schedule");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [migrationNotice, setMigrationNotice] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<AcademicImportPreview | null>(null);
  const [schedule, setSchedule] = useState({ day: "Senin", time: "07:30 - 09:00", subject: "", teacherUserId: "", teacherName: "", className: "", room: "", curriculum: "Formal" });
  const [journal, setJournal] = useState({ date: today(), className: "", subject: "", topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "", teacherUserId: "", teacherName: "" });
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
  const classes = useMemo(() => [...snapshot.classes].sort((a, b) => a.localeCompare(b, "id")), [snapshot.classes]);

  const refresh = useCallback(async () => {
    if (!canManage || !user?.tenantId) { setSnapshot(EMPTY); return; }
    setLoading(true); setError("");
    try {
      const payload = await requestAcademic("/api/academic/snapshot");
      setSnapshot({
        schedules: Array.isArray(payload.schedules) ? payload.schedules : [],
        journals: Array.isArray(payload.journals) ? payload.journals : [],
        assessments: Array.isArray(payload.assessments) ? payload.assessments : [],
        students: Array.isArray(payload.students) ? payload.students : [],
        teachers: Array.isArray(payload.teachers) ? payload.teachers : [],
        classes: Array.isArray(payload.classes) ? payload.classes : [],
      });
    } catch (loadError: any) { setSnapshot(EMPTY); setError(loadError?.message || "Data Akademik Supabase belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [canManage, user?.tenantId, user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (role === "Santri" || role === "Walisantri") return <SupabaseAcademicPortal />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const form = activeTab === "schedule" ? schedule : activeTab === "journal" ? journal : assessment;
      const payload = { ...form, clientRequestId: crypto.randomUUID() };
      await requestAcademic(`/api/academic/${activeTab}`, { method: "POST", body: JSON.stringify({ record: payload }) });
      setNotice("Data tersimpan di tenant Supabase.");
      if (activeTab === "schedule") setSchedule((current) => ({ ...current, subject: "", room: "" }));
      if (activeTab === "journal") setJournal((current) => ({ ...current, topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "" }));
      if (activeTab === "assessment") setAssessment((current) => ({ ...current, score: "" }));
      await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Data akademik belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const selectedStudent = snapshot.students.find((student) => student.id === assessment.studentId);
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

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Jadwal aktif", value: snapshot.schedules.length, icon: CalendarDays }, { label: "Jurnal KBM", value: snapshot.journals.length, icon: ClipboardList }, { label: "Penilaian", value: snapshot.assessments.length, icon: BookOpen }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-emerald-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>Cutover bertahap.</strong> Nilai, jurnal, dan jadwal pada fixture Firestore lama tidak disalin otomatis. Rapor, KKTP/remedial, pengaturan akademik, komentar wali kelas, serta portal Santri/Wali belum tersedia pada layar Supabase ini.</div>
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

    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900" aria-label="Bagian akademik">
      {TABS.filter((tab) => tab.id !== "schedule" || isAdmin).map((tab) => <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setError(""); setNotice(""); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab.id ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}><tab.icon className="h-4 w-4" />{tab.label}</button>)}
    </nav>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? "Jadwal tersimpan" : activeTab === "journal" ? "Jurnal terbaru" : "Penilaian terbaru"}</h2></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data tenant…</div> : activeTab === "schedule" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.schedules.length ? snapshot.schedules.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{row.day} · {row.time}</span></div><p className="mt-1 text-sm text-slate-500">{row.className} · {row.teacherName}{row.room ? ` · ${row.room}` : ""}</p></article>) : <Empty label="Belum ada jadwal KBM di tenant ini." />}</div> : activeTab === "journal" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.journals.length ? snapshot.journals.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject} · {row.className}</h3><span className="text-xs text-slate-500">{row.date}</span></div><p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.topic}</p><p className="mt-1 text-xs text-slate-500">Pengajar: {row.teacherName} · {journalAttendanceLabel(row.attendance)}</p></article>) : <Empty label="Belum ada jurnal KBM di tenant ini." />}</div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.assessments.length ? snapshot.assessments.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{row.studentName}</h3><p className="mt-1 text-sm text-slate-500">{row.className} · {row.subject} · {row.assessmentType}</p></div><span className={`rounded-lg px-3 py-1 text-sm font-bold ${Number(row.score) < 75 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"}`}>{row.score}</span></article>) : <Empty label="Belum ada penilaian di tenant ini." />}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? "Tambah jadwal" : activeTab === "journal" ? "Catat jurnal KBM" : "Input penilaian"}</h2></div>
        {loading ? <p className="text-sm text-slate-500">Menunggu data tenant…</p> : <form onSubmit={submit} className="space-y-4">
          {activeTab === "schedule" && <>
            <Field label="Hari"><select className={fieldClass} value={schedule.day} onChange={(e) => setSchedule({ ...schedule, day: e.target.value })}>{["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((day) => <option key={day}>{day}</option>)}</select></Field>
            <Field label="Waktu (HH:MM - HH:MM)"><input required className={fieldClass} value={schedule.time} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} placeholder="07:30 - 09:00" /></Field>
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={schedule.subject} onChange={(e) => setSchedule({ ...schedule, subject: e.target.value })} /></Field>
            <Field label="Kelas"><select required className={fieldClass} value={schedule.className} onChange={(e) => setSchedule({ ...schedule, className: e.target.value })}><option value="">Pilih kelas dari roster</option>{classes.map((name) => <option key={name}>{name}</option>)}</select></Field>
            <Field label="Pengajar"><select required className={fieldClass} value={schedule.teacherUserId} onChange={(e) => setScheduleTeacher(e.target.value)}><option value="">Pilih pengajar</option>{snapshot.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>
            <Field label="Ruang"><input maxLength={100} className={fieldClass} value={schedule.room} onChange={(e) => setSchedule({ ...schedule, room: e.target.value })} /></Field>
            <Field label="Kurikulum"><input maxLength={100} className={fieldClass} value={schedule.curriculum} onChange={(e) => setSchedule({ ...schedule, curriculum: e.target.value })} /></Field>
          </>}
          {activeTab === "journal" && <>
            <Field label="Tanggal"><input type="date" required className={fieldClass} value={journal.date} onChange={(e) => setJournal({ ...journal, date: e.target.value })} /></Field>
            <Field label="Kelas"><select required className={fieldClass} value={journal.className} onChange={(e) => setJournal({ ...journal, className: e.target.value })}><option value="">Pilih kelas dari roster</option>{classes.map((name) => <option key={name}>{name}</option>)}</select></Field>
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={journal.subject} onChange={(e) => setJournal({ ...journal, subject: e.target.value })} /></Field>
            <Field label="Materi"><textarea required maxLength={2000} rows={3} className={fieldClass} value={journal.topic} onChange={(e) => setJournal({ ...journal, topic: e.target.value })} /></Field>
            <Field label="Kompetensi / catatan"><textarea maxLength={4000} rows={2} className={fieldClass} value={journal.competency} onChange={(e) => setJournal({ ...journal, competency: e.target.value })} /></Field>
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={journal.teacherUserId} onChange={(e) => setJournalTeacher(e.target.value)}><option value="">Pilih pengajar</option>{snapshot.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <div className="grid grid-cols-3 gap-2">{([["attendancePresent", "Hadir"], ["attendanceExcused", "Izin/sakit"], ["attendanceAbsent", "Absen"]] as const).map(([key, label]) => <label key={key} className={labelClass}>{label}<input type="number" min="0" max="500" className={fieldClass} value={journal[key]} onChange={(e) => setJournal({ ...journal, [key]: e.target.value })} /></label>)}</div>
          </>}
          {activeTab === "assessment" && <>
            <Field label="Santri"><select required className={fieldClass} value={assessment.studentId} onChange={(e) => changeStudent(e.target.value)}><option value="">Pilih santri aktif</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></Field>
            {selectedStudent && <p className="-mt-2 text-xs text-slate-500">Kelas {selectedStudent.className || "belum ditetapkan"}</p>}
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={assessment.teacherUserId} onChange={(e) => setAssessmentTeacher(e.target.value)}><option value="">Pilih pengajar</option>{snapshot.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <Field label="Mata pelajaran"><input required maxLength={150} className={fieldClass} value={assessment.subject} onChange={(e) => setAssessment({ ...assessment, subject: e.target.value })} /></Field>
            <Field label="Jenis penilaian"><input required maxLength={100} className={fieldClass} value={assessment.assessmentType} onChange={(e) => setAssessment({ ...assessment, assessmentType: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Kategori"><select className={fieldClass} value={assessment.category} onChange={(e) => setAssessment({ ...assessment, category: e.target.value })}><option value="Formative">Formatif</option><option value="Summative">Sumatif</option></select></Field><Field label="Nilai (0–100)"><input type="number" required min="0" max="100" step="any" className={fieldClass} value={assessment.score} onChange={(e) => setAssessment({ ...assessment, score: e.target.value })} /></Field></div>
          </>}
          <button type="submit" disabled={saving || loading || (activeTab === "assessment" && snapshot.students.length === 0)} className={`${buttonClass} w-full`}><Plus className="h-4 w-4" />{saving ? "Menyimpan…" : "Simpan ke Supabase"}</button>
          {activeTab === "assessment" && snapshot.students.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-200">Roster tenant belum tersedia, sehingga input nilai dinonaktifkan.</p>}
          {role === "Ustadz" && <p className="flex items-start gap-2 text-xs text-slate-500"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />Akses roster dibatasi pada kelas yang memiliki jadwal dengan pengajar ini.</p>}
        </form>}
      </section>
    </div>
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
