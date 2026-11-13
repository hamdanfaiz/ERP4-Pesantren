import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, BookOpen, Boxes, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus, Radio, RefreshCw, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { ERPTabs } from "../components/ERPDesignSystem";
import { SupabaseModuleReferenceSettings } from "../components/SupabaseReferenceCatalogManager";
import { buildCbtCalendarGrid, cbtTenantMonthKey, groupCbtExamsByTenantDate, shiftCbtCalendarMonth } from "../lib/cbtCalendar";
import { deriveCbtDashboardSummary } from "../lib/cbtDashboard";
import { deriveCbtMonitorSummary } from "../lib/cbtMonitor";
import { deriveCbtPackageSummaries } from "../lib/cbtPackages";
import { DEFAULT_TENANT_TIME_ZONE, formatTenantDateTime, tenantDate } from "../lib/tenantTimeZone";

type Question = {
  id: string; subject: string; grade: string; template: string; subjectReferenceId: string;
  gradeLevelReferenceId: string; templateReferenceId: string; text: string; options: string[];
  correctAnswer: number; explanation: string; difficulty: string; tags: string[]; status: string;
};
type Student = { id: string; name: string; grade: string; className: string };
type Exam = {
  id: string; title: string; subject: string; grade: string; subjectReferenceId: string;
  gradeLevelReferenceId: string; startsAt: string; endsAt: string;
  durationMinutes: number; passingScore: number; status: string; assignedCount: number; completedCount: number;
};
type Result = {
  assignmentId: string; examTitle: string; studentName: string; className: string; status: string;
  score: number | null; passed: boolean | null; submittedAt: string | null; correct: number | null; wrong: number | null; blank: number | null;
};
type CbtSettings = {
  autoGrading: boolean; shuffleQuestions: boolean;
  correctPoints: number; wrongPoints: number; blankPoints: number; sourceSystem: string;
};
type ReferenceOption = { id: string; name: string; description: string };
type Snapshot = {
  questions: Question[]; students: Student[]; exams: Exam[]; results: Result[]; classes: string[];
  settings: CbtSettings;
  references: { subjects: ReferenceOption[]; gradeLevels: ReferenceOption[]; templates: ReferenceOption[] };
};
type Tab = "dashboard" | "calendar" | "packages" | "questions" | "exams" | "monitor" | "results" | "settings" | "import";
type ImportPreview = { snapshotFingerprint: string; counts: { source: number; ready: number; alreadyImported: number; invalid: number }; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };

const EMPTY_SETTINGS: CbtSettings = { autoGrading: true, shuffleQuestions: false, correctPoints: 1, wrongPoints: 0, blankPoints: 0, sourceSystem: "defaults" };
const EMPTY: Snapshot = { questions: [], students: [], exams: [], results: [], classes: [], settings: EMPTY_SETTINGS, references: { subjects: [], gradeLevels: [], templates: [] } };
const CBT_REFERENCE_TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <Activity className="h-4 w-4" /> },
  { id: "calendar", label: "Kalender Ujian", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "packages", label: "Paket Ujian", icon: <Boxes className="h-4 w-4" /> },
  { id: "questions", label: "Bank Soal & Builder", icon: <BookOpen className="h-4 w-4" /> },
  { id: "exams", label: "Sesi Ujian", icon: <CalendarClock className="h-4 w-4" /> },
  { id: "monitor", label: "Pemantauan Sesi", icon: <Radio className="h-4 w-4" /> },
  { id: "results", label: "Hasil & Analitik", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "settings", label: "Pengaturan", icon: <SlidersHorizontal className="h-4 w-4" /> },
];
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";

async function requestCbt(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Layanan CBT belum dapat diproses.");
  return body;
}

function localDateTimeOffset(minutes: number) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function cbtStatusLabel(status: string) {
  const labels: Record<string, string> = { draft: "Draf", published: "Terbit", active: "Aktif", archived: "Diarsipkan", assigned: "Belum dimulai", in_progress: "Sedang dikerjakan", completed: "Selesai", submitted: "Dikumpulkan", graded: "Dinilai", missed: "Tidak hadir", cancelled: "Dibatalkan", expired: "Kedaluwarsa" };
  return labels[status.toLowerCase()] || status;
}

function ImportPreviewDetails({ preview }: { preview: ImportPreview | null }) {
  if (!preview) return null;
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-4">{[
      { label: "Data sumber", value: preview.counts.source }, { label: "Siap diimpor", value: preview.counts.ready },
      { label: "Sudah diimpor", value: preview.counts.alreadyImported }, { label: "Tidak valid", value: preview.counts.invalid },
    ].map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs text-slate-500">{item.label}</div><div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.value}</div></div>)}</div>
    <p className="break-all text-xs text-slate-400">Sidik digital data: {preview.snapshotFingerprint}</p>
    <div className="rounded-xl border border-slate-200 dark:border-white/10">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium dark:border-white/10">Temuan ({preview.issueCount})</div>
      {preview.issues.length ? <ul className="divide-y divide-slate-100 dark:divide-white/5">{preview.issues.map((issue, index) => <li key={issue.recordRef + issue.code + index} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs"><span className="font-medium text-slate-700 dark:text-slate-200">{issue.code}</span><span className="text-slate-500">Ref {issue.recordRef || "—"} · {issue.severity}</span></li>)}</ul> : <p className="p-4 text-sm text-slate-500">Tidak ada konflik pada data ini.</p>}
    </div>
    <p className={preview.canApply ? "text-sm font-medium text-emerald-700 dark:text-emerald-300" : "text-sm font-medium text-amber-700 dark:text-amber-300"}>{preview.canApply ? "Data dapat diterapkan. Sistem akan memeriksa ulang sidik digital sebelum penerapan." : "Data belum dapat diterapkan; perbaiki konflik atau selesaikan rekonsiliasi terlebih dahulu."}</p>
  </div>;
}

export function SupabaseCBTManager() {
  const { role, user } = useAuth();
  const tenantTimeZone = user?.tenantTimeZone || DEFAULT_TENANT_TIME_ZONE;
  const todayInTenant = tenantDate(new Date(), tenantTimeZone);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>("questions");
  const [dashboardNow, setDashboardNow] = useState(() => Date.now());
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [monitorSearch, setMonitorSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => cbtTenantMonthKey(new Date(), tenantTimeZone));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => tenantDate(new Date(), tenantTimeZone));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    subjectReferenceId: "", gradeLevelReferenceId: "", templateReferenceId: "", text: "", options: ["", "", "", ""],
    correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "",
  });
  const [exam, setExam] = useState({
    title: "", subjectReferenceId: "", gradeLevelReferenceId: "", startsAt: localDateTimeOffset(60), endsAt: localDateTimeOffset(180),
    durationMinutes: 90, passingScore: 75, correctPoints: 1, wrongPoints: 0, blankPoints: 0, shuffleQuestions: true, status: "draft",
  });
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [settingsImportPreview, setSettingsImportPreview] = useState<ImportPreview | null>(null);
  const settingsAppliedTenant = useRef("");

  useEffect(() => {
    const today = tenantDate(new Date(), tenantTimeZone);
    setCalendarMonth(today.slice(0, 7));
    setSelectedCalendarDate(today);
  }, [user?.tenantId, tenantTimeZone]);

  useEffect(() => {
    const interval = window.setInterval(() => setDashboardNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestCbt("/api/cbt/admin");
      const references = result.references && typeof result.references === "object" ? {
        subjects: Array.isArray(result.references.subjects) ? result.references.subjects : [],
        gradeLevels: Array.isArray(result.references.gradeLevels) ? result.references.gradeLevels : [],
        templates: Array.isArray(result.references.templates) ? result.references.templates : [],
      } : EMPTY.references;
      setSnapshot({
        questions: Array.isArray(result.questions) ? result.questions : [],
        exams: Array.isArray(result.exams) ? result.exams : [],
        results: Array.isArray(result.results) ? result.results : [],
        students: Array.isArray(result.students) ? result.students : [],
        classes: Array.isArray(result.classes) ? result.classes : [],
        settings: result.settings && typeof result.settings === "object" ? { ...EMPTY_SETTINGS, ...result.settings } : EMPTY_SETTINGS,
        references,
      });
      setSnapshotUpdatedAt(new Date().toISOString());
      const settings = result.settings && typeof result.settings === "object" ? { ...EMPTY_SETTINGS, ...result.settings } as CbtSettings : EMPTY_SETTINGS;
      const tenantId = String(user?.tenantId || "");
      if (tenantId && settingsAppliedTenant.current !== tenantId) {
        settingsAppliedTenant.current = tenantId;
        setEditingQuestionId(null);
        setSelectedQuestions([]);
        setSelectedStudents([]);
        setImportPreview(null);
        setSettingsImportPreview(null);
        setForm({
          subjectReferenceId: references.subjects[0]?.id || "",
          gradeLevelReferenceId: references.gradeLevels[0]?.id || "",
          templateReferenceId: references.templates[0]?.id || "",
          text: "", options: ["", "", "", ""],
          correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "",
        });
        setExam((current) => ({
          ...current, title: "", subjectReferenceId: references.subjects[0]?.id || "",
          gradeLevelReferenceId: references.gradeLevels[0]?.id || "",
          correctPoints: settings.correctPoints, wrongPoints: settings.wrongPoints,
          blankPoints: settings.blankPoints, shuffleQuestions: settings.shuffleQuestions,
        }));
      } else {
        setForm((current) => ({
          ...current,
          subjectReferenceId: references.subjects.some((item: ReferenceOption) => item.id === current.subjectReferenceId) ? current.subjectReferenceId : references.subjects[0]?.id || "",
          gradeLevelReferenceId: references.gradeLevels.some((item: ReferenceOption) => item.id === current.gradeLevelReferenceId) ? current.gradeLevelReferenceId : references.gradeLevels[0]?.id || "",
          templateReferenceId: references.templates.some((item: ReferenceOption) => item.id === current.templateReferenceId) ? current.templateReferenceId : references.templates[0]?.id || "",
        }));
        setExam((current) => ({
          ...current,
          subjectReferenceId: references.subjects.some((item: ReferenceOption) => item.id === current.subjectReferenceId) ? current.subjectReferenceId : references.subjects[0]?.id || "",
          gradeLevelReferenceId: references.gradeLevels.some((item: ReferenceOption) => item.id === current.gradeLevelReferenceId) ? current.gradeLevelReferenceId : references.gradeLevels[0]?.id || "",
        }));
      }
    } catch (cause: any) { setSnapshot(EMPTY); setSnapshotUpdatedAt(null); setError(cause?.message || "Data ujian belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleQuestions = useMemo(() => snapshot.questions.filter((question) =>
    [question.subject, question.grade, question.template, question.text, question.tags.join(" ")]
      .join(" ").toLowerCase().includes(search.toLowerCase())), [snapshot.questions, search]);
  const eligibleQuestions = useMemo(() => snapshot.questions.filter((question) => question.status === "active"
    && question.subjectReferenceId === exam.subjectReferenceId
    && question.gradeLevelReferenceId === exam.gradeLevelReferenceId
    && Boolean(question.subjectReferenceId && question.gradeLevelReferenceId)), [snapshot.questions, exam.subjectReferenceId, exam.gradeLevelReferenceId]);
  const selectedQuestionCount = selectedQuestions.filter((id) => eligibleQuestions.some((question) => question.id === id)).length;

  const dashboardSummary = useMemo(() => deriveCbtDashboardSummary(snapshot.exams, snapshot.results, dashboardNow), [snapshot.exams, snapshot.results, dashboardNow]);
  const monitorSummary = useMemo(() => deriveCbtMonitorSummary(snapshot.results, monitorSearch), [snapshot.results, monitorSearch]);
  const formatDashboardPercent = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
  const formatDashboardScore = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);

  const calendarDays = useMemo(() => buildCbtCalendarGrid(calendarMonth, tenantTimeZone, todayInTenant), [calendarMonth, tenantTimeZone, todayInTenant]);
  const calendarWeeks = useMemo(() => Array.from({ length: 6 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7)), [calendarDays]);
  const examsByCalendarDate = useMemo(() => groupCbtExamsByTenantDate(snapshot.exams, tenantTimeZone), [snapshot.exams, tenantTimeZone]);
  const selectedCalendarExams = examsByCalendarDate.get(selectedCalendarDate) || [];
  const calendarMonthLabel = useMemo(() => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${calendarMonth}-01T12:00:00.000Z`)), [calendarMonth]);
  const selectedCalendarDateLabel = useMemo(() => selectedCalendarDate
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${selectedCalendarDate}T12:00:00.000Z`))
    : "Tanggal ujian", [selectedCalendarDate]);

  const moveCalendarMonth = (offset: number) => {
    const nextMonth = shiftCbtCalendarMonth(calendarMonth, offset);
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(`${nextMonth}-01`);
  };

  const showTodayInCalendar = () => {
    setCalendarMonth(todayInTenant.slice(0, 7));
    setSelectedCalendarDate(todayInTenant);
  };

  const cbtPackages = useMemo(() => deriveCbtPackageSummaries(snapshot.references.templates, snapshot.questions), [snapshot.references.templates, snapshot.questions]);

  const resetQuestion = () => {
    setEditingQuestionId(null);
    setForm({ subjectReferenceId: snapshot.references.subjects[0]?.id || "", gradeLevelReferenceId: snapshot.references.gradeLevels[0]?.id || "", templateReferenceId: snapshot.references.templates[0]?.id || "", text: "", options: ["", "", "", ""], correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "" });
  };

  const saveQuestion = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const lastOption = form.options.reduce((last, value, index) => value.trim() ? index : last, -1);
      const options = form.options.slice(0, lastOption + 1).map((value) => value.trim());
      if (options.length < 2 || options.some((value) => !value) || Number(form.correctAnswer) >= options.length) {
        throw new Error("Isi opsi jawaban secara berurutan dan pastikan kunci berada pada opsi yang terisi.");
      }
      await requestCbt("/api/cbt/questions", {
        method: "POST", body: JSON.stringify({
          questionId: editingQuestionId, clientRequestId: crypto.randomUUID(),
          question: { ...form, options, correctAnswer: Number(form.correctAnswer), tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) },
        }),
      });
      setNotice(editingQuestionId ? "Soal diperbarui." : "Soal ditambahkan ke bank soal.");
      resetQuestion(); await refresh();
    } catch (cause: any) { setError(cause?.message || "Soal belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const runLegacyImport = async (action: "preview" | "apply") => {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await requestCbt("/api/cbt/legacy/import", {
        method: "POST", body: JSON.stringify({ action, expectedFingerprint: action === "apply" ? importPreview?.snapshotFingerprint : undefined }),
      });
      if (action === "preview") {
        setImportPreview(result as ImportPreview);
        setNotice("Pratinjau arsip CBT selesai. Tidak ada data yang diubah.");
      } else {
        setImportPreview(null);
        setNotice(`Impor selesai: ${Number(result.imported || 0)} soal baru, ${Number(result.skipped || 0)} sudah pernah diimpor.`);
        await refresh();
      }
    } catch (cause: any) { setError(cause?.message || "Impor bank soal CBT belum dapat diproses."); }
    finally { setSaving(false); }
  };

  const runLegacySettingsImport = async (action: "preview" | "apply") => {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await requestCbt("/api/cbt/legacy/settings-import", {
        method: "POST", body: JSON.stringify({
          action, expectedFingerprint: action === "apply" ? settingsImportPreview?.snapshotFingerprint : undefined,
        }),
      });
      if (action === "preview") {
        setSettingsImportPreview(result as ImportPreview);
        setNotice("Pratinjau konfigurasi CBT selesai. Tidak ada data yang diubah.");
      } else {
        setSettingsImportPreview(null);
        setNotice(result.alreadyImported ? "Konfigurasi CBT ini sudah pernah diimpor." : "Konfigurasi CBT berhasil diimpor.");
        settingsAppliedTenant.current = "";
        await refresh();
      }
    } catch (cause: any) { setError(cause?.message || "Impor konfigurasi CBT belum dapat diproses."); }
    finally { setSaving(false); }
  };

  const editQuestion = (question: Question) => {
    setEditingQuestionId(question.id); setTab("questions"); setError(""); setNotice("");
    setForm({
      subjectReferenceId: question.subjectReferenceId, gradeLevelReferenceId: question.gradeLevelReferenceId,
      templateReferenceId: question.templateReferenceId,
      text: question.text, options: [...question.options, "", "", "", ""].slice(0, 8),
      correctAnswer: String(question.correctAnswer), explanation: question.explanation || "",
      difficulty: question.difficulty || "Medium", tags: question.tags.join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitExam = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await requestCbt("/api/cbt/exams", {
        method: "POST",
        body: JSON.stringify({
          exam: {
            ...exam, startsAt: new Date(exam.startsAt).toISOString(), endsAt: new Date(exam.endsAt).toISOString(),
            clientRequestId: crypto.randomUUID(), questionIds: selectedQuestions.filter((id) => eligibleQuestions.some((q) => q.id === id)),
            studentIds: selectedStudents,
          },
        }),
      });
      setNotice("Ujian dan penugasan tersimpan pada pesantren.");
      setSelectedQuestions([]); setSelectedStudents([]);
      setExam((current) => ({ ...current, title: "", startsAt: localDateTimeOffset(60), endsAt: localDateTimeOffset(180) }));
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Ujian belum dapat dibuat."); }
    finally { setSaving(false); }
  };

  if (role !== "Admin" && role !== "SuperAdmin") {
    return <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pengelolaan bank soal dan jadwal ujian hanya tersedia untuk Admin pesantren.</section>;
  }

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" />Data pesantren</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ujian Berbasis Komputer (CBT)</h1>
        <p className="mt-1 text-sm text-slate-500">Bank soal, sesi ujian, penugasan santri, dan hasil pemeriksaan tersimpan di sistem.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>Impor bank soal.</strong> Admin dapat meninjau dan mengimpor bank soal lama. Data contoh tidak ikut diimpor.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Bank soal", value: snapshot.questions.filter((item) => item.status === "active").length, icon: BookOpen }, { label: "Ujian", value: snapshot.exams.length, icon: CalendarClock }, { label: "Peserta ditugaskan", value: snapshot.results.length, icon: Users }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    <ERPTabs tabs={[...CBT_REFERENCE_TABS, ...(legacyArchiveImportEnabled ? [{ id: "import" as const, label: "Impor Arsip", icon: <RefreshCw className="h-4 w-4" /> }] : [])]} value={tab} onChange={(id) => { setTab(id as Tab); setError(""); setNotice(""); }} ariaLabel="Bagian Ujian Berbasis Komputer" />
    <SupabaseModuleReferenceSettings domains={["cbt_question_template"]} />

    {tab === "dashboard" && <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sesi berlangsung", value: dashboardSummary.ongoingSessions, detail: "Sedang dibuka", icon: Radio },
          { label: "Jadwal mendatang", value: dashboardSummary.upcomingSessions, detail: "Sesi terbit berikutnya", icon: CalendarClock },
          { label: "Penyelesaian penugasan", value: formatDashboardPercent(dashboardSummary.completionRate), detail: `${dashboardSummary.completedAssignments} dari ${dashboardSummary.totalAssignments} penugasan`, icon: ClipboardList },
          { label: "Kelulusan peserta", value: formatDashboardPercent(dashboardSummary.passRate), detail: `${dashboardSummary.scoredAssignments} peserta dinilai`, icon: ShieldCheck },
        ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{loading ? "—" : item.value}</p><p className="mt-1 text-xs text-slate-500">{loading ? "Memuat data…" : item.detail}</p></div><item.icon className="h-5 w-5 shrink-0 text-indigo-700" /></div></article>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Jadwal ujian berikutnya</h2><p className="mt-1 text-xs text-slate-500">Waktu mengikuti zona pesantren: {tenantTimeZone}.</p></div><button type="button" onClick={() => setTab("calendar")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Buka kalender</button></header>
          {loading ? <div role="status" className="p-8 text-sm text-slate-500">Memuat jadwal…</div> : dashboardSummary.upcomingExams.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{dashboardSummary.upcomingExams.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.startsAt, tenantTimeZone)}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span></article>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Belum ada jadwal ujian terbit yang akan datang.</div>}
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Hasil terbaru</h2><p className="mt-1 text-xs text-slate-500">Rata-rata nilai: {formatDashboardScore(dashboardSummary.averageScore)}</p></div><button type="button" onClick={() => setTab("results")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Lihat semua hasil</button></header>
          {loading ? <div role="status" className="p-8 text-sm text-slate-500">Memuat hasil…</div> : dashboardSummary.latestResults.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{dashboardSummary.latestResults.map((item) => <article key={item.assignmentId} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.studentName}</h3><p className="mt-1 text-sm text-slate-500">{item.examTitle}{item.className ? ` · ${item.className}` : ""}</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.submittedAt || "", tenantTimeZone)}</p></div><div className="text-right"><p className="font-semibold text-slate-900 dark:text-white">{item.score == null ? "Belum dinilai" : formatDashboardScore(item.score)}</p>{item.passed !== null && <span className={item.passed ? "text-xs text-emerald-700 dark:text-emerald-300" : "text-xs text-rose-700 dark:text-rose-300"}>{item.passed ? "Lulus" : "Belum lulus"}</span>}</div></article>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Hasil ujian akan tampil setelah peserta mengumpulkan ujian.</div>}
        </article>
      </div>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-900 dark:text-white">Aksi cepat</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("questions")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Bank soal</button>
          <button type="button" onClick={() => setTab("exams")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Buat sesi</button>
          <button type="button" onClick={() => setTab("monitor")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Pemantauan</button>
          <button type="button" onClick={() => setTab("results")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Hasil</button>
        </div>
      </article>
    </section>}

    {tab === "calendar" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Kalender ujian</h2><p className="mt-1 text-sm text-slate-500">Jadwal mengikuti zona waktu pesantren: {tenantTimeZone}.</p></div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => moveCalendarMonth(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <span aria-live="polite" className="min-w-36 text-center text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">{calendarMonthLabel}</span>
          <button type="button" aria-label="Bulan berikutnya" onClick={() => moveCalendarMonth(1)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={showTodayInCalendar} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Hari ini</button>
        </div>
      </header>
      <div className="overflow-x-auto p-3 sm:p-4">
        <div className="min-w-[640px]">
          <div role="group" aria-label={`Kalender ujian ${calendarMonthLabel}`} className="border-l border-slate-200 dark:border-white/10">
            <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold text-slate-500 dark:border-white/10">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
            {calendarWeeks.map((week) => <div key={week[0]?.date} className="grid grid-cols-7">
              {week.map((day) => {
                const dayExams = examsByCalendarDate.get(day.date) || [];
                const selected = day.date === selectedCalendarDate;
                return <button key={day.date} type="button" aria-pressed={selected} aria-label={`${day.date}, ${dayExams.length} sesi ujian`} onClick={() => {
                  setSelectedCalendarDate(day.date);
                  if (!day.date.startsWith(calendarMonth)) setCalendarMonth(day.date.slice(0, 7));
                }} className={`min-h-24 border-b border-r border-slate-200 p-2 text-left align-top transition dark:border-white/10 ${selected ? "bg-indigo-50 ring-2 ring-inset ring-indigo-600 dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"} ${day.inCurrentMonth ? "" : "bg-slate-50/70 dark:bg-slate-950/40"}`}>
                  <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${day.isToday ? "bg-indigo-700 text-white" : day.inCurrentMonth ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{day.day}</span>
                  <span className="mt-1 block space-y-1">{dayExams.slice(0, 2).map((item) => <span key={item.id} className="block truncate rounded-md bg-indigo-100 px-1.5 py-1 text-[10px] font-medium text-indigo-900 dark:bg-indigo-400/15 dark:text-indigo-200">{item.title}</span>)}{dayExams.length > 2 && <span className="block px-1 text-[10px] text-slate-500">+{dayExams.length - 2} sesi</span>}</span>
                </button>;
              })}
            </div>)}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 p-4 dark:border-white/10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold capitalize text-slate-900 dark:text-white">{selectedCalendarDateLabel}</h3><button type="button" onClick={() => setTab("exams")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Buka sesi ujian</button></div>
        {loading ? <div role="status" className="flex items-center gap-2 py-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat jadwal ujian…</div> : selectedCalendarExams.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">{selectedCalendarExams.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div><h4 className="font-semibold text-slate-900 dark:text-white">{item.title}</h4><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.startsAt, tenantTimeZone)} – {formatTenantDateTime(item.endsAt, tenantTimeZone)}</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span><span className="text-slate-500">{item.assignedCount} peserta · {item.completedCount} selesai</span></div></article>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">{snapshot.exams.length ? "Tidak ada sesi ujian pada tanggal ini." : "Belum ada jadwal ujian tersimpan."}</div>}
      </div>
    </section>}

    {tab === "packages" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Paket soal ujian</h2><p className="mt-1 text-sm text-slate-500">Ringkasan diambil dari kategori pesantren dan soal yang terhubung.</p></div><button type="button" onClick={() => setTab("questions")} className={BUTTON}><BookOpen className="h-4 w-4" />Buka bank soal</button></header>
      {loading ? <div role="status" className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat paket soal…</div> : error ? <div className="p-8 text-sm text-slate-600 dark:text-slate-300">Paket soal belum dapat ditampilkan. Muat ulang untuk mencoba kembali.</div> : cbtPackages.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{cbtPackages.map((item) => <article key={item.id} className="flex min-h-64 flex-col rounded-2xl border border-slate-200 p-5 dark:border-white/10"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.description || "Belum ada keterangan paket."}</p></div><Boxes className="h-5 w-5 shrink-0 text-indigo-700" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-xs text-slate-500">Soal aktif</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.activeQuestions}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-xs text-slate-500">Jumlah soal</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.totalQuestions}</p></div></div><div className="mt-4 space-y-2 text-xs"><div><span className="font-semibold text-slate-600 dark:text-slate-300">Mata pelajaran: </span><span className="text-slate-500">{item.subjects.length ? item.subjects.join(", ") : "Belum ada soal"}</span></div><div><span className="font-semibold text-slate-600 dark:text-slate-300">Jenjang: </span><span className="text-slate-500">{item.gradeLevels.length ? item.gradeLevels.join(", ") : "Belum ada soal"}</span></div></div><button type="button" onClick={() => { setSearch(item.name); setTab("questions"); }} disabled={!item.totalQuestions} className="mt-auto pt-5 text-left text-sm font-semibold text-indigo-700 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-300 dark:hover:text-indigo-200">{item.totalQuestions ? "Lihat soal dalam paket →" : "Belum ada soal dalam paket ini"}</button></article>)}</div> : <div className="p-10 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900 dark:text-white">Belum ada paket soal</h3><p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Tambahkan kategori paket CBT dan referensi mata pelajaran melalui pengaturan modul, lalu susun soal untuk kategori tersebut.</p></div>}
    </section>}

    {tab === "monitor" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Pemantauan peserta ujian</h2><p className="mt-1 text-sm text-slate-500">Status penugasan dari data pesantren. Muat ulang untuk mengambil pembaruan.</p><p className="mt-1 text-xs text-slate-500">{snapshotUpdatedAt ? `Data diperbarui ${formatTenantDateTime(snapshotUpdatedAt, tenantTimeZone)}` : "Waktu pembaruan belum tersedia"}</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang status</button>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total penugasan", value: monitorSummary.totalAssignments },
          { label: "Sedang dikerjakan", value: monitorSummary.inProgressCount },
          { label: "Belum dimulai", value: monitorSummary.waitingCount },
          { label: "Selesai", value: monitorSummary.completedCount },
          { label: "Sudah dinilai", value: monitorSummary.gradedCount },
          { label: "Tidak hadir", value: monitorSummary.missedCount },
        ].map((item) => <article key={item.label} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{loading ? "—" : item.value}</p></article>)}
      </div>
      <div className="space-y-4 border-t border-slate-200 p-4 dark:border-white/10">
        <label className="block max-w-md text-sm font-medium text-slate-700 dark:text-slate-200">Cari peserta, ujian, atau kelas<input aria-label="Cari peserta, ujian, atau kelas" className={FIELD + " mt-2"} value={monitorSearch} onChange={(event) => setMonitorSearch(event.target.value)} placeholder="Ketik nama atau kelas" /></label>
        {loading ? <div role="status" className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-white/5">Memuat status peserta…</div> : error ? <div role="status" className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Status peserta belum dapat ditampilkan. Muat ulang untuk mencoba kembali.</div> : monitorSummary.activeParticipants.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5"><tr><th className="p-3">Santri</th><th className="p-3">Ujian</th><th className="p-3">Kelas</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{monitorSummary.activeParticipants.map((item) => <tr key={item.assignmentId}><td className="p-3 font-medium text-slate-800 dark:text-slate-100">{item.studentName}</td><td className="p-3">{item.examTitle}</td><td className="p-3">{item.className || "—"}</td><td className="p-3"><span className={item.status.trim().toLowerCase() === "in_progress" ? "rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"}>{cbtStatusLabel(item.status)}</span></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-white/10"><p className="font-medium text-slate-800 dark:text-slate-100">{monitorSummary.totalAssignments ? "Tidak ada penugasan aktif yang cocok." : "Belum ada peserta yang ditugaskan."}</p><p className="mt-1 text-sm text-slate-500">Peserta yang belum memulai atau sedang mengerjakan akan muncul di sini.</p></div>}
        {monitorSummary.otherCount > 0 && <p className="text-xs text-slate-500">{monitorSummary.otherCount} penugasan memiliki status lain dan tetap dihitung dalam total.</p>}
        {!loading && monitorSummary.totalAssignments > 0 && <button type="button" onClick={() => setTab("results")} className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Lihat rincian hasil</button>}
      </div>
    </section>}

    {tab === "settings" && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <div><h2 className="font-semibold text-slate-900 dark:text-white">Pengaturan penilaian sesi</h2><p className="mt-1 text-sm text-slate-500">Nilai bawaan pesantren dipakai saat membuat sesi baru. Perubahan per sesi tetap diatur di formulir Sesi Ujian.</p></div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Penilaian otomatis", value: snapshot.settings.autoGrading ? "Aktif" : "Nonaktif" },
          { label: "Acak soal bawaan", value: snapshot.settings.shuffleQuestions ? "Aktif" : "Nonaktif" },
          { label: "Poin benar", value: snapshot.settings.correctPoints },
          { label: "Poin salah", value: snapshot.settings.wrongPoints },
          { label: "Poin kosong", value: snapshot.settings.blankPoints },
          { label: "Sumber pengaturan", value: snapshot.settings.sourceSystem === "legacy_firestore" ? "Data lama" : "Pengaturan sistem" },
        ].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><dt className="text-xs text-slate-500">{item.label}</dt><dd className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</dd></div>)}
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setExam((current) => ({ ...current, correctPoints: snapshot.settings.correctPoints, wrongPoints: snapshot.settings.wrongPoints, blankPoints: snapshot.settings.blankPoints, shuffleQuestions: snapshot.settings.shuffleQuestions })); setTab("exams"); }} className={BUTTON}>Terapkan ke formulir sesi baru</button>
        <button type="button" onClick={() => setTab("exams")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Buka Sesi Ujian</button>
      </div>
    </section>}

    {tab === "questions" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-semibold text-slate-900 dark:text-white">Bank soal pesantren</h2><input aria-label="Cari soal" className={FIELD + " mt-0 sm:max-w-xs"} placeholder="Cari soal, subjek, atau tag" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {loading ? <div role="status" className="flex justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat bank soal…</div> : visibleQuestions.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{visibleQuestions.map((question) => <article key={question.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{question.subject}</span><span>·</span><span>{question.grade}</span><span>·</span><span>{question.template}</span>{question.status !== "active" && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">Arsip</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{question.text}</p><ol className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">{question.options.map((option, index) => <li key={index} className={index === question.correctAnswer ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}>{String.fromCharCode(65 + index)}. {option}</li>)}</ol></div><button type="button" disabled={question.status !== "active"} onClick={() => editQuestion(question)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200">Ubah</button></div></article>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada soal. Gunakan formulir Tambah soal untuk mulai menyusun bank soal pada pesantren ini.</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-700" /><h2 className="font-semibold text-slate-900 dark:text-white">{editingQuestionId ? "Ubah soal" : "Tambah soal"}</h2></div>
        <form onSubmit={saveQuestion} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mata pelajaran<select required className={FIELD} value={form.subjectReferenceId} onChange={(e) => setForm({ ...form, subjectReferenceId: e.target.value })}><option value="">Pilih mata pelajaran</option>{snapshot.references.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={LABEL}>Jenjang pendidikan<select required className={FIELD} value={form.gradeLevelReferenceId} onChange={(e) => setForm({ ...form, gradeLevelReferenceId: e.target.value })}><option value="">Pilih jenjang</option>{snapshot.references.gradeLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Paket soal<select required className={FIELD} value={form.templateReferenceId} onChange={(e) => setForm({ ...form, templateReferenceId: e.target.value })}><option value="">Pilih paket soal</option>{snapshot.references.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={LABEL}>Kesulitan<select className={FIELD} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option value="Easy">Mudah</option><option value="Medium">Sedang</option><option value="Hard">Sulit</option></select></label></div>
          {(!snapshot.references.subjects.length || !snapshot.references.gradeLevels.length || !snapshot.references.templates.length) && <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pilih mata pelajaran dan jenjang yang sudah dikelola di Akademik, serta paket soal dari Pengaturan kategori modul CBT.</p>}
          <label className={LABEL}>Teks soal<textarea required rows={4} maxLength={12000} className={FIELD} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
          <div className="space-y-2"><span className={LABEL}>Opsi jawaban</span>{form.options.map((option, index) => <div key={index} className="flex items-center gap-2"><span className="w-6 text-xs font-bold text-slate-500">{String.fromCharCode(65 + index)}</span><input aria-label={"Opsi " + String.fromCharCode(65 + index)} maxLength={1000} className={FIELD + " mt-0"} value={option} onChange={(e) => setForm({ ...form, options: form.options.map((value, optionIndex) => optionIndex === index ? e.target.value : value) })} /></div>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Indeks jawaban benar<select className={FIELD} value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}>{form.options.map((_, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>)}</select></label><label className={LABEL}>Tag, pisahkan dengan koma<input className={FIELD} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
          <label className={LABEL}>Pembahasan<textarea rows={2} maxLength={4000} className={FIELD} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></label>
          <div className="flex gap-2">{editingQuestionId && <button type="button" onClick={resetQuestion} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Batal</button>}<button type="submit" disabled={saving || !snapshot.references.subjects.length || !snapshot.references.gradeLevels.length || !snapshot.references.templates.length || !form.subjectReferenceId || !form.gradeLevelReferenceId || !form.templateReferenceId} className={BUTTON + " flex-1"}>{saving ? "Menyimpan…" : "Simpan soal"}</button></div>
        </form>
      </section>
    </div>}

    {tab === "exams" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">Ujian tersimpan</h2></div>
        {snapshot.exams.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.exams.map((item) => <article key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span></div><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{new Date(item.startsAt).toLocaleString("id-ID")} · {item.assignedCount} peserta · {item.completedCount} selesai</p></article>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada sesi ujian.</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Buat jadwal ujian</h2>
        {loading ? <p className="text-sm text-slate-500">Memuat daftar santri pesantren…</p> : <form onSubmit={submitExam} className="space-y-3">
          <label className={LABEL}>Nama ujian<input required maxLength={180} className={FIELD} value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mata pelajaran<select required className={FIELD} value={exam.subjectReferenceId} onChange={(e) => { setExam({ ...exam, subjectReferenceId: e.target.value, gradeLevelReferenceId: "" }); setSelectedQuestions([]); }}><option value="">Pilih mata pelajaran</option>{snapshot.references.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={LABEL}>Jenjang<select required className={FIELD} value={exam.gradeLevelReferenceId} onChange={(e) => { setExam({ ...exam, gradeLevelReferenceId: e.target.value }); setSelectedQuestions([]); }}><option value="">Pilih jenjang</option>{snapshot.references.gradeLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mulai<input type="datetime-local" required className={FIELD} value={exam.startsAt} onChange={(e) => setExam({ ...exam, startsAt: e.target.value })} /></label><label className={LABEL}>Akhir jendela<input type="datetime-local" required className={FIELD} value={exam.endsAt} onChange={(e) => setExam({ ...exam, endsAt: e.target.value })} /></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className={LABEL}>Durasi (menit)<input type="number" min="1" max="600" required className={FIELD} value={exam.durationMinutes} onChange={(e) => setExam({ ...exam, durationMinutes: Number(e.target.value) })} /></label><label className={LABEL}>Nilai lulus<input type="number" min="0" max="100" step="any" className={FIELD} value={exam.passingScore} onChange={(e) => setExam({ ...exam, passingScore: Number(e.target.value) })} /></label><label className={LABEL}>Status<select className={FIELD} value={exam.status} onChange={(e) => setExam({ ...exam, status: e.target.value })}><option value="draft">Draf</option><option value="published">Terbit</option></select></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className={LABEL}>Poin jawaban benar<input type="number" min="0" max="100" step="any" className={FIELD} value={exam.correctPoints} onChange={(e) => setExam({ ...exam, correctPoints: Number(e.target.value) })} /></label><label className={LABEL}>Poin jawaban salah<input type="number" min="-100" max="100" step="any" className={FIELD} value={exam.wrongPoints} onChange={(e) => setExam({ ...exam, wrongPoints: Number(e.target.value) })} /></label><label className={LABEL}>Poin tidak dijawab<input type="number" min="-100" max="100" step="any" className={FIELD} value={exam.blankPoints} onChange={(e) => setExam({ ...exam, blankPoints: Number(e.target.value) })} /></label></div>
          <fieldset className="space-y-2"><legend className={LABEL}>Soal ({selectedQuestionCount} dipilih)</legend><div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-white/10">{eligibleQuestions.map((question) => <label key={question.id} className="flex items-start gap-2 p-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selectedQuestions.includes(question.id)} onChange={(e) => setSelectedQuestions((current) => e.target.checked ? [...current, question.id] : current.filter((id) => id !== question.id))} />{question.text}</label>)}{!eligibleQuestions.length && <p className="p-2 text-xs text-slate-500">Buat soal dengan subjek dan jenjang yang sama terlebih dahulu.</p>}</div></fieldset>
          <fieldset className="space-y-2"><legend className={LABEL}>Peserta santri ({selectedStudents.length} dipilih)</legend><div className="max-h-44 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-white/10">{snapshot.students.map((student) => <label key={student.id} className="flex items-start gap-2 p-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={(e) => setSelectedStudents((current) => e.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}<span className="ml-1 text-slate-400">{student.className || student.grade}</span></span></label>)}</div></fieldset>
          <button type="submit" disabled={saving || !eligibleQuestions.length || !selectedQuestionCount || !selectedStudents.length || !snapshot.students.length} className={BUTTON + " w-full"}>{saving ? "Menyimpan…" : "Simpan sesi & tugaskan santri"}</button>
        </form>}
      </section>
    </div>}

    {tab === "results" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">Hasil ujian dan penugasan</h2></div>
      {snapshot.results.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5"><tr><th className="p-3">Santri</th><th className="p-3">Ujian</th><th className="p-3">Kelas</th><th className="p-3">Status</th><th className="p-3">Nilai</th><th className="p-3">Keputusan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.results.map((result) => <tr key={result.assignmentId}><td className="p-3 font-medium text-slate-800 dark:text-slate-100">{result.studentName}</td><td className="p-3">{result.examTitle}</td><td className="p-3">{result.className || "—"}</td><td className="p-3">{cbtStatusLabel(result.status)}</td><td className="p-3">{result.score == null ? "—" : result.score}</td><td className="p-3">{result.passed == null ? "—" : result.passed ? "Lulus" : "Belum lulus"}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada peserta ujian.</div>}
    </section>}

    {legacyArchiveImportEnabled && tab === "import" && <div className="grid gap-5 xl:grid-cols-2">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor bank soal arsip lama</h2><p className="mt-1 text-sm text-slate-500">Pemeriksaan mencakup paling banyak 3.000 soal yang sesuai dengan pemetaan pesantren. Pratinjau hanya menampilkan ringkasan dan referensi tersamar.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacyImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Buat pratinjau</button><button type="button" disabled={saving || !importPreview?.canApply} onClick={() => void runLegacyImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan pratinjau</button></div>
        <ImportPreviewDetails preview={importPreview} />
      </section>
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor konfigurasi CBT arsip lama</h2><p className="mt-1 text-sm text-slate-500">Hanya satu dokumen konfigurasi yang ID-nya harus sama dengan pemetaan pesantren arsip. Nilai penilaian manual ditahan karena pengaturan saat ini memakai penilaian otomatis.</p></div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Pengaturan saat ini berasal dari <strong>{snapshot.settings.sourceSystem === "legacy_firestore" ? "data lama" : "pengaturan sistem"}</strong>. Nilai ini digunakan sebagai awal saat membuat sesi ujian.</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacySettingsImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Pratinjau konfigurasi</button><button type="button" disabled={saving || !settingsImportPreview?.canApply} onClick={() => void runLegacySettingsImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan konfigurasi</button></div>
        <ImportPreviewDetails preview={settingsImportPreview} />
      </section>
    </div>}
  </main>;
}
