import { toERPUserMessage } from "../utils/userMessages";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, BookOpen, Boxes, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus, Radio, RefreshCw, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { ERPFeatureStatus, ERPTabs } from "../components/ERPDesignSystem";
import { SupabaseModuleReferenceSettings } from "../components/SupabaseReferenceCatalogManager";
import { buildCbtCalendarGrid, cbtTenantMonthKey, groupCbtExamsByTenantDate, shiftCbtCalendarMonth } from "../lib/cbtCalendar";
import { deriveCbtDashboardSummary } from "../lib/cbtDashboard";
import { deriveCbtMonitorSummary } from "../lib/cbtMonitor";
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
  correctPoints: number; wrongPoints: number; blankPoints: number; sourceSystem: string; updatedAt: string | null;
};
type ReferenceOption = { id: string; name: string; description: string };
type CbtPackageSummary = ReferenceOption & {
  totalQuestions: number; activeQuestions: number; subjects: string[]; gradeLevels: string[];
};
type QuestionPage = { items: Question[]; hasMore: boolean; nextCursor: string | null };
type StudentPage = { items: Student[]; hasMore: boolean; nextCursor: string | null };
type DashboardSummary = {
  activeQuestions: number; totalExams: number; ongoingSessions: number; upcomingSessions: number;
  totalAssignments: number; completedAssignments: number; completionRate: number | null;
  scoredAssignments: number; averageScore: number | null; passRate: number | null;
  upcomingExams: Array<Pick<Exam, "id" | "title" | "subject" | "grade" | "startsAt" | "endsAt" | "durationMinutes" | "status" | "assignedCount" | "completedCount">>;
  latestResults: Array<Pick<Result, "assignmentId" | "examTitle" | "studentName" | "className" | "status" | "score" | "passed" | "submittedAt">>;
};
type Snapshot = {
  questions: Question[]; students: Student[]; exams: Exam[]; results: Result[]; classes: string[];
  settings: CbtSettings;
  references: { subjects: ReferenceOption[]; gradeLevels: ReferenceOption[]; templates: ReferenceOption[] };
  packageSummaries: CbtPackageSummary[];
};
type Tab = "dashboard" | "calendar" | "packages" | "questions" | "exams" | "monitor" | "results" | "settings" | "import";
type ImportPreview = { snapshotFingerprint: string; counts: { source: number; ready: number; alreadyImported: number; invalid: number }; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };

const EMPTY_SETTINGS: CbtSettings = { autoGrading: true, shuffleQuestions: false, correctPoints: 1, wrongPoints: 0, blankPoints: 0, sourceSystem: "defaults", updatedAt: null };
const EMPTY: Snapshot = { questions: [], students: [], exams: [], results: [], classes: [], settings: EMPTY_SETTINGS, references: { subjects: [], gradeLevels: [], templates: [] }, packageSummaries: [] };
const EMPTY_QUESTION_PAGE: QuestionPage = { items: [], hasMore: false, nextCursor: null };
const EMPTY_STUDENT_PAGE: StudentPage = { items: [], hasMore: false, nextCursor: null };
const CBT_REFERENCE_TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dasbor", icon: <Activity className="h-4 w-4" /> },
  { id: "calendar", label: "Kalender Ujian", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "packages", label: "Paket Ujian", icon: <Boxes className="h-4 w-4" /> },
  { id: "questions", label: "Bank Soal & Builder", icon: <BookOpen className="h-4 w-4" /> },
  { id: "exams", label: "Sesi Ujian", icon: <CalendarClock className="h-4 w-4" /> },
  { id: "monitor", label: "Pemantauan Sesi", icon: <Radio className="h-4 w-4" /> },
  { id: "results", label: "Hasil & Analitik", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "settings", label: "Pengaturan", icon: <SlidersHorizontal className="h-4 w-4" /> },
];
const CBT_PENDING: Partial<Record<Tab, string>> = {};
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";

async function requestCbt(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Layanan CBT belum dapat diproses."), { status: response.status });
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

function cbtImportIssueLabel(code: string) {
  const labels: Record<string, string> = {
    record_limit_exceeded: "Jumlah data melebihi batas impor.",
    duplicate_source_id: "Ada soal dengan nomor yang tercatat lebih dari sekali.",
    invalid_source_id: "Sebagian soal belum memiliki nomor yang valid.",
    invalid_question_record: "Sebagian soal belum lengkap atau formatnya belum sesuai.",
    source_changed_after_import: "Sebagian data berubah sejak terakhir diperiksa.",
  };
  return labels[code] || "Sebagian data perlu diperiksa sebelum diimpor.";
}

function ImportPreviewDetails({ preview }: { preview: ImportPreview | null }) {
  if (!preview) return null;
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-4">{[
      { label: "Data sumber", value: preview.counts.source }, { label: "Siap diimpor", value: preview.counts.ready },
      { label: "Sudah diimpor", value: preview.counts.alreadyImported }, { label: "Tidak valid", value: preview.counts.invalid },
    ].map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs text-slate-500">{item.label}</div><div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.value}</div></div>)}</div>
    <div className="rounded-xl border border-slate-200 dark:border-white/10">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium dark:border-white/10">Perlu ditinjau ({preview.issueCount})</div>
      {preview.issues.length ? <ul className="divide-y divide-slate-100 dark:divide-white/5">{preview.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{cbtImportIssueLabel(issue.code)}</span><span className={issue.severity === "blocking" ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}>{issue.severity === "blocking" ? "Perlu diperbaiki" : "Perhatian"}</span></li>)}</ul> : <p className="p-4 text-sm text-slate-500">Semua data memenuhi pemeriksaan.</p>}
    </div>
    <p className={preview.canApply ? "text-sm font-medium text-emerald-700 dark:text-emerald-300" : "text-sm font-medium text-amber-700 dark:text-amber-300"}>{preview.canApply ? "Data siap diimpor setelah Anda meninjau ringkasan ini." : "Selesaikan hal yang perlu diperbaiki sebelum melanjutkan."}</p>
  </div>;
}

export function SupabaseCBTManager() {
  const { role, user } = useAuth();
  const tenantTimeZone = user?.tenantTimeZone || DEFAULT_TENANT_TIME_ZONE;
  const todayInTenant = tenantDate(new Date(), tenantTimeZone);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [serverDashboardSummary, setServerDashboardSummary] = useState<DashboardSummary | null>(null);
  const [tab, setTab] = useState<Tab>("questions");
  const [dashboardNow, setDashboardNow] = useState(() => Date.now());
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [monitorSearch, setMonitorSearch] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<CbtSettings>(EMPTY_SETTINGS);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => cbtTenantMonthKey(new Date(), tenantTimeZone));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => tenantDate(new Date(), tenantTimeZone));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [questionStatus, setQuestionStatus] = useState<"all" | "active" | "archived">("all");
  const [questionTemplateFilter, setQuestionTemplateFilter] = useState("all");
  const [questionListRevision, setQuestionListRevision] = useState(0);
  const [questionPage, setQuestionPage] = useState<QuestionPage>(EMPTY_QUESTION_PAGE);
  const [questionPageLoading, setQuestionPageLoading] = useState(false);
  const [questionPageError, setQuestionPageError] = useState("");
  const [builderQuestionPage, setBuilderQuestionPage] = useState<QuestionPage>(EMPTY_QUESTION_PAGE);
  const [builderQuestionPageLoading, setBuilderQuestionPageLoading] = useState(false);
  const [builderQuestionPageError, setBuilderQuestionPageError] = useState("");
  const questionPageRequestId = useRef(0);
  const builderQuestionPageRequestId = useRef(0);
  const studentPageRequestId = useRef(0);
  const builderQuestionPageFilter = useRef("");
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
  const [studentPage, setStudentPage] = useState<StudentPage>(EMPTY_STUDENT_PAGE);
  const [studentPageLoading, setStudentPageLoading] = useState(false);
  const [studentPageError, setStudentPageError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [settingsImportPreview, setSettingsImportPreview] = useState<ImportPreview | null>(null);
  const settingsAppliedTenant = useRef("");
  const settingsDirtyRef = useRef(false);

  useEffect(() => {
    const today = tenantDate(new Date(), tenantTimeZone);
    setCalendarMonth(today.slice(0, 7));
    setSelectedCalendarDate(today);
  }, [user?.tenantId, tenantTimeZone]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDashboardNow(Date.now());
      void requestCbt("/api/cbt/admin/summary").then((result) => {
        const candidate = result?.summary;
        if (candidate && typeof candidate === "object") setServerDashboardSummary(candidate as DashboardSummary);
      }).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    setServerDashboardSummary(null);
    let summaryLoaded = false;
    try {
      const [snapshotRequest, summaryRequest] = await Promise.allSettled([
        requestCbt("/api/cbt/admin"),
        requestCbt("/api/cbt/admin/summary"),
      ]);
      if (summaryRequest.status === "fulfilled") {
        const candidate = summaryRequest.value?.summary;
        const validSummary = candidate && typeof candidate === "object";
        setServerDashboardSummary(validSummary ? candidate as DashboardSummary : null);
        summaryLoaded = Boolean(validSummary);
      }
      if (snapshotRequest.status === "rejected") throw snapshotRequest.reason;
      const result = snapshotRequest.value;
      const references = result.references && typeof result.references === "object" ? {
        subjects: Array.isArray(result.references.subjects) ? result.references.subjects : [],
        gradeLevels: Array.isArray(result.references.gradeLevels) ? result.references.gradeLevels : [],
        templates: Array.isArray(result.references.templates) ? result.references.templates : [],
      } : EMPTY.references;
      const settings = result.settings && typeof result.settings === "object" ? { ...EMPTY_SETTINGS, ...result.settings } as CbtSettings : EMPTY_SETTINGS;
      setSnapshot({
        questions: Array.isArray(result.questions) ? result.questions : [],
        packageSummaries: Array.isArray(result.packageSummaries) ? result.packageSummaries : [],
        exams: Array.isArray(result.exams) ? result.exams : [],
        results: Array.isArray(result.results) ? result.results : [],
        students: Array.isArray(result.students) ? result.students : [],
        classes: Array.isArray(result.classes) ? result.classes : [],
        settings,
        references,
      });
      setSnapshotUpdatedAt(new Date().toISOString());
      const tenantId = String(user?.tenantId || "");
      if (tenantId && settingsAppliedTenant.current !== tenantId) {
        settingsAppliedTenant.current = tenantId;
        settingsDirtyRef.current = false;
        setSettingsDirty(false);
        setSettingsDraft(settings);
        setEditingQuestionId(null);
        setSelectedQuestions([]);
        setSelectedStudents([]);
        studentPageRequestId.current += 1;
        setStudentPage(EMPTY_STUDENT_PAGE);
        setStudentSearch("");
        setStudentPageError("");
        questionPageRequestId.current += 1;
        builderQuestionPageRequestId.current += 1;
        builderQuestionPageFilter.current = "";
        setQuestionPage(EMPTY_QUESTION_PAGE);
        setBuilderQuestionPage(EMPTY_QUESTION_PAGE);
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
        if (!settingsDirtyRef.current) setSettingsDraft(settings);
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
          correctPoints: current.title.trim() ? current.correctPoints : settings.correctPoints,
          wrongPoints: current.title.trim() ? current.wrongPoints : settings.wrongPoints,
          blankPoints: current.title.trim() ? current.blankPoints : settings.blankPoints,
          shuffleQuestions: current.title.trim() ? current.shuffleQuestions : settings.shuffleQuestions,
        }));
      }
      return true;
    } catch (cause: any) {
      setSnapshot(EMPTY); setSnapshotUpdatedAt(null);
      setError(summaryLoaded
        ? "Ringkasan CBT tersedia, tetapi daftar soal, sesi, dan hasil belum dapat dimuat. Silakan muat ulang."
        : toERPUserMessage(cause, "Data ujian belum dapat dimuat. Silakan coba lagi."));
      return false;
    }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadQuestionPage = useCallback(async (cursor: string | null, append: boolean) => {
    const requestId = ++questionPageRequestId.current;
    setQuestionPageError("");
    setQuestionPageLoading(true);
    if (!append) setQuestionPage(EMPTY_QUESTION_PAGE);
    const params = new URLSearchParams({ limit: "50", status: questionStatus });
    const normalizedSearch = search.trim();
    if (normalizedSearch) params.set("search", normalizedSearch);
    if (questionTemplateFilter !== "all") params.set("templateReferenceId", questionTemplateFilter);
    if (cursor) params.set("cursor", cursor);
    try {
      const result = await requestCbt("/api/cbt/admin/questions?" + params.toString());
      if (requestId !== questionPageRequestId.current) return;
      if (!Array.isArray(result.items) || typeof result.hasMore !== "boolean"
        || (result.hasMore && (typeof result.nextCursor !== "string" || !result.nextCursor))) {
        throw new Error("Halaman bank soal belum dapat diverifikasi.");
      }
      setQuestionPage((current) => {
        const merged = new Map<string, Question>(append ? current.items.map((item): [string, Question] => [item.id, item]) : []);
        for (const item of result.items as Question[]) merged.set(item.id, item);
        return { items: [...merged.values()], hasMore: result.hasMore, nextCursor: result.nextCursor || null };
      });
    } catch (cause: any) {
      if (requestId === questionPageRequestId.current) {
        setQuestionPageError(toERPUserMessage(cause, "Bank soal belum dapat dimuat. Silakan coba lagi."));
      }
    } finally {
      if (requestId === questionPageRequestId.current) setQuestionPageLoading(false);
    }
  }, [questionStatus, questionTemplateFilter, search, user?.tenantId, user?.uid]);

  useEffect(() => {
    if (tab !== "questions") return;
    const normalizedSearch = search.trim();
    if (normalizedSearch && normalizedSearch.length < 3) {
      questionPageRequestId.current += 1;
      setQuestionPage(EMPTY_QUESTION_PAGE);
      setQuestionPageError("");
      setQuestionPageLoading(false);
      return;
    }
    const timer = window.setTimeout(() => { void loadQuestionPage(null, false); }, 250);
    return () => {
      window.clearTimeout(timer);
      questionPageRequestId.current += 1;
    };
  }, [tab, search, questionStatus, questionTemplateFilter, questionListRevision, user?.tenantId, user?.uid, loadQuestionPage]);


  const loadStudentPage = useCallback(async (cursor: string | null, append: boolean) => {
    const requestId = ++studentPageRequestId.current;
    setStudentPageError("");
    setStudentPageLoading(true);
    if (!append) setStudentPage(EMPTY_STUDENT_PAGE);
    const normalizedSearch = studentSearch.trim();
    const resultQuery: Record<string, unknown> = { limit: 50 };
    if (normalizedSearch) resultQuery.search = normalizedSearch;
    if (cursor) resultQuery.cursor = cursor;
    try {
      const result = await requestCbt("/api/cbt/admin/students/page", {
        method: "POST",
        body: JSON.stringify(resultQuery),
      });
      if (requestId !== studentPageRequestId.current) return;
      if (!Array.isArray(result.items) || result.items.length > 50 || typeof result.hasMore !== "boolean"
        || (result.hasMore && (typeof result.nextCursor !== "string" || !result.nextCursor))
        || result.items.some((item: any) => !item || typeof item.id !== "string"
          || typeof item.name !== "string" || typeof item.grade !== "string" || typeof item.className !== "string")) {
        throw new Error("Halaman daftar santri CBT belum dapat diverifikasi.");
      }
      setStudentPage((current) => {
        const merged = new Map<string, Student>(append ? current.items.map((item): [string, Student] => [item.id, item]) : []);
        for (const item of result.items as Student[]) merged.set(item.id, item);
        return { items: [...merged.values()], hasMore: result.hasMore, nextCursor: result.nextCursor || null };
      });
    } catch (cause: any) {
      if (requestId === studentPageRequestId.current) {
        setStudentPageError(toERPUserMessage(cause, "Daftar santri belum dapat dimuat. Silakan coba lagi."));
      }
    } finally {
      if (requestId === studentPageRequestId.current) setStudentPageLoading(false);
    }
  }, [studentSearch, user?.tenantId, user?.uid]);

  useEffect(() => {
    if (tab !== "exams" || loading) return;
    const normalizedSearch = studentSearch.trim();
    if (normalizedSearch && Array.from(normalizedSearch).length < 3) {
      studentPageRequestId.current += 1;
      setStudentPage(EMPTY_STUDENT_PAGE);
      setStudentPageError("");
      setStudentPageLoading(false);
      return;
    }
    const timer = window.setTimeout(() => { void loadStudentPage(null, false); }, 250);
    return () => {
      window.clearTimeout(timer);
      studentPageRequestId.current += 1;
    };
  }, [tab, loading, studentSearch, user?.tenantId, user?.uid, loadStudentPage]);

  const builderQuestionFilterKey = JSON.stringify([
    user?.tenantId || "", exam.subjectReferenceId, exam.gradeLevelReferenceId, questionListRevision,
  ]);
  const loadBuilderQuestionPage = useCallback(async (cursor: string | null, append: boolean) => {
    const requestId = ++builderQuestionPageRequestId.current;
    setBuilderQuestionPageError("");
    setBuilderQuestionPageLoading(true);
    if (!append) setBuilderQuestionPage(EMPTY_QUESTION_PAGE);
    const params = new URLSearchParams({
      limit: "50", status: "active",
      subjectReferenceId: exam.subjectReferenceId,
      gradeLevelReferenceId: exam.gradeLevelReferenceId,
    });
    if (cursor) params.set("cursor", cursor);
    try {
      const result = await requestCbt("/api/cbt/admin/questions?" + params.toString());
      if (requestId !== builderQuestionPageRequestId.current) return;
      if (!Array.isArray(result.items) || typeof result.hasMore !== "boolean"
        || (result.hasMore && (typeof result.nextCursor !== "string" || !result.nextCursor))) {
        throw new Error("Daftar soal builder belum dapat diverifikasi.");
      }
      setBuilderQuestionPage((current) => {
        const merged = new Map<string, Question>(append ? current.items.map((item): [string, Question] => [item.id, item]) : []);
        for (const item of result.items as Question[]) merged.set(item.id, item);
        return { items: [...merged.values()], hasMore: result.hasMore, nextCursor: result.nextCursor || null };
      });
    } catch (cause: any) {
      if (requestId === builderQuestionPageRequestId.current) {
        setBuilderQuestionPageError(toERPUserMessage(cause, "Soal untuk builder belum dapat dimuat."));
      }
    } finally {
      if (requestId === builderQuestionPageRequestId.current) setBuilderQuestionPageLoading(false);
    }
  }, [exam.subjectReferenceId, exam.gradeLevelReferenceId, user?.tenantId, user?.uid]);

  useEffect(() => {
    if (tab !== "exams") return;
    if (!exam.subjectReferenceId || !exam.gradeLevelReferenceId) {
      builderQuestionPageRequestId.current += 1;
      builderQuestionPageFilter.current = "";
      setBuilderQuestionPage(EMPTY_QUESTION_PAGE);
      setBuilderQuestionPageError("");
      setSelectedQuestions([]);
      return;
    }
    if (builderQuestionPageFilter.current === builderQuestionFilterKey) return;
    builderQuestionPageFilter.current = builderQuestionFilterKey;
    setBuilderQuestionPage(EMPTY_QUESTION_PAGE);
    setSelectedQuestions([]);
    void loadBuilderQuestionPage(null, false);
    return () => {
      builderQuestionPageRequestId.current += 1;
      builderQuestionPageFilter.current = "";
    };
  }, [tab, exam.subjectReferenceId, exam.gradeLevelReferenceId, builderQuestionFilterKey, loadBuilderQuestionPage]);

  const updateSettingsDraft = (patch: Partial<CbtSettings>) => {
    settingsDirtyRef.current = true;
    setSettingsDirty(true);
    setSettingsDraft((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await requestCbt("/api/cbt/settings", {
        method: "PUT",
        body: JSON.stringify({
          expectedUpdatedAt: snapshot.settings.updatedAt,
          settings: {
            autoGrading: true,
            shuffleQuestions: settingsDraft.shuffleQuestions,
            correctPoints: settingsDraft.correctPoints,
            wrongPoints: settingsDraft.wrongPoints,
            blankPoints: settingsDraft.blankPoints,
          },
        }),
      });
      if (typeof result.updatedAt !== "string" || !Number.isFinite(Date.parse(result.updatedAt))) {
        throw new Error("Pengaturan CBT belum dapat diverifikasi setelah disimpan.");
      }
      const savedSettings = { ...settingsDraft, autoGrading: true, sourceSystem: "supabase_runtime", updatedAt: result.updatedAt };
      settingsDirtyRef.current = false;
      setSettingsDirty(false);
      setSettingsDraft(savedSettings);
      setSnapshot((current) => ({ ...current, settings: savedSettings }));
      setExam((current) => current.title.trim() ? current : {
        ...current,
        correctPoints: savedSettings.correctPoints,
        wrongPoints: savedSettings.wrongPoints,
        blankPoints: savedSettings.blankPoints,
        shuffleQuestions: savedSettings.shuffleQuestions,
      });
      setNotice("Pengaturan ujian berhasil disimpan untuk tenant ini.");
    } catch (cause: any) {
      if (Number(cause?.status) === 409) {
        settingsDirtyRef.current = false;
        setSettingsDirty(false);
        if (await refresh()) {
          setNotice("Pengaturan CBT berubah sejak halaman dimuat. Versi terbaru sudah dimuat; tinjau kembali sebelum menyimpan.");
          return;
        }
      }
      setError(toERPUserMessage(cause, "Pengaturan ujian belum dapat disimpan. Silakan muat ulang lalu coba lagi."));
    } finally { setSaving(false); }
  };

  const visibleQuestions = questionPage.items;
  const eligibleQuestions = builderQuestionPage.items;
  const selectedQuestionCount = selectedQuestions.filter((id) => eligibleQuestions.some((question) => question.id === id)).length;
  const calendarDays = useMemo(() => buildCbtCalendarGrid(calendarMonth, tenantTimeZone, todayInTenant), [calendarMonth, tenantTimeZone, todayInTenant]);
  const calendarWeeks = useMemo(() => Array.from({ length: 6 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7)), [calendarDays]);
  const examsByCalendarDate = useMemo(() => groupCbtExamsByTenantDate(snapshot.exams, tenantTimeZone), [snapshot.exams, tenantTimeZone]);
  const cbtPackages = snapshot.packageSummaries;
  const selectedCalendarExams = examsByCalendarDate.get(selectedCalendarDate) || [];
  const calendarMonthLabel = useMemo(() => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${calendarMonth}-01T12:00:00.000Z`)), [calendarMonth]);
  const selectedCalendarDateLabel = useMemo(() => selectedCalendarDate
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${selectedCalendarDate}T12:00:00.000Z`))
    : "Tanggal ujian", [selectedCalendarDate]);
  const localDashboardSummary = useMemo(() => deriveCbtDashboardSummary(snapshot.exams, snapshot.results, dashboardNow), [snapshot.exams, snapshot.results, dashboardNow]);
  const dashboardSummary = serverDashboardSummary || localDashboardSummary;
  const monitorSummary = useMemo(() => deriveCbtMonitorSummary(snapshot.results, monitorSearch), [snapshot.results, monitorSearch]);
  const formatDashboardPercent = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
  const formatDashboardScore = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);

  const moveCalendarMonth = (offset: number) => {
    const nextMonth = shiftCbtCalendarMonth(calendarMonth, offset);
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(`${nextMonth}-01`);
  };

  const showTodayInCalendar = () => {
    setCalendarMonth(todayInTenant.slice(0, 7));
    setSelectedCalendarDate(todayInTenant);
  };

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
      setNotice(editingQuestionId ? "Soal berhasil diperbarui." : "Soal berhasil ditambahkan ke bank soal.");
      resetQuestion();
      setQuestionListRevision((revision) => revision + 1);
      await refresh();
    } catch (cause: any) { setError(toERPUserMessage(cause, "Soal belum dapat disimpan.")); }
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
    } catch (cause: any) { setError(toERPUserMessage(cause, "Impor bank soal CBT belum dapat diproses.")); }
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
        setNotice("Pratinjau pengaturan ujian selesai. Belum ada perubahan yang disimpan.");
      } else {
        setSettingsImportPreview(null);
        setNotice(result.alreadyImported ? "Konfigurasi CBT ini sudah pernah diimpor." : "Konfigurasi CBT berhasil diimpor.");
        settingsAppliedTenant.current = "";
        await refresh();
      }
    } catch (cause: any) { setError(toERPUserMessage(cause, "Pengaturan ujian belum dapat diimpor. Coba kembali.")); }
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
      setNotice("Ujian berhasil disimpan dan santri telah ditugaskan.");
      setSelectedQuestions([]); setSelectedStudents([]);
      setExam((current) => ({ ...current, title: "", startsAt: localDateTimeOffset(60), endsAt: localDateTimeOffset(180) }));
      await refresh();
    } catch (cause: any) { setError(toERPUserMessage(cause, "Ujian belum dapat dibuat.")); }
    finally { setSaving(false); }
  };

  if (role !== "Admin" && role !== "SuperAdmin") {
    return <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pengelolaan bank soal dan jadwal ujian hanya tersedia untuk Admin.</section>;
  }

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ujian Berbasis Komputer (CBT)</h1>
        <p className="mt-1 text-sm text-slate-500">Kelola bank soal, jadwal ujian, penugasan santri, dan hasil ujian.</p>
      </div>
      <button type="button" onClick={() => { setQuestionListRevision((revision) => revision + 1); void refresh(); }} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Bank soal", value: serverDashboardSummary?.activeQuestions ?? "—", icon: BookOpen }, { label: "Ujian", value: serverDashboardSummary?.totalExams ?? snapshot.exams.length, icon: CalendarClock }, { label: "Peserta ditugaskan", value: serverDashboardSummary?.totalAssignments ?? snapshot.results.length, icon: Users }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    <ERPTabs tabs={[...CBT_REFERENCE_TABS, ...(legacyArchiveImportEnabled ? [{ id: "import" as const, label: "Impor Arsip", icon: <RefreshCw className="h-4 w-4" /> }] : [])]} value={tab} onChange={(id) => { setTab(id as Tab); setError(""); setNotice(""); }} ariaLabel="Bagian Ujian Berbasis Komputer" />
    <SupabaseModuleReferenceSettings domains={["cbt_question_template"]} />

    {CBT_PENDING[tab] && <ERPFeatureStatus title={CBT_REFERENCE_TABS.find((item) => item.id === tab)?.label || "Fitur CBT"} description={CBT_PENDING[tab]!} />}

    {tab === "dashboard" && <div className="space-y-5">
      {loading ? <div role="status" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat ringkasan ujian…</div> : error && !serverDashboardSummary ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">Ringkasan ujian belum dapat ditampilkan. Silakan muat ulang untuk mencoba kembali.</div> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Ujian berlangsung", value: dashboardSummary.ongoingSessions, detail: "Sesi yang sedang dibuka", icon: Radio },
            { label: "Jadwal mendatang", value: dashboardSummary.upcomingSessions, detail: "Sesi terbit berikutnya", icon: CalendarClock },
            { label: "Penyelesaian peserta", value: formatDashboardPercent(dashboardSummary.completionRate), detail: `${dashboardSummary.completedAssignments} dari ${dashboardSummary.totalAssignments} penugasan`, icon: ClipboardList },
            { label: "Kelulusan", value: formatDashboardPercent(dashboardSummary.passRate), detail: `${dashboardSummary.scoredAssignments} peserta memiliki nilai`, icon: ShieldCheck },
          ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>{item.label}</span><item.icon className="h-4 w-4 shrink-0 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></article>)}
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Jadwal ujian berikutnya</h2><p className="mt-1 text-xs text-slate-500">Zona waktu pesantren: {tenantTimeZone}</p></div><button type="button" onClick={() => setTab("exams")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Kelola sesi</button></div>
            {dashboardSummary.upcomingExams.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{dashboardSummary.upcomingExams.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.startsAt, tenantTimeZone)}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span></article>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Belum ada jadwal ujian terbit yang akan datang.</div>}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Hasil terbaru</h2><p className="mt-1 text-xs text-slate-500">Rata-rata nilai: {formatDashboardScore(dashboardSummary.averageScore)}</p></div><button type="button" onClick={() => setTab("results")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Lihat hasil</button></div>
            {dashboardSummary.latestResults.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{dashboardSummary.latestResults.map((item) => <article key={item.assignmentId} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.studentName}</h3><p className="mt-1 text-sm text-slate-500">{item.examTitle}{item.className ? ` · ${item.className}` : ""}</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.submittedAt || "", tenantTimeZone)}</p></div><div className="text-right"><p className="font-semibold text-slate-900 dark:text-white">{item.score == null ? "Belum dinilai" : formatDashboardScore(item.score)}</p>{item.passed !== null && <span className={item.passed ? "text-xs text-emerald-700 dark:text-emerald-300" : "text-xs text-rose-700 dark:text-rose-300"}>{item.passed ? "Lulus" : "Belum lulus"}</span>}</div></article>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Hasil ujian akan tampil setelah peserta mengumpulkan ujian.</div>}
          </section>
        </div>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-400/20 dark:bg-indigo-400/5"><div><h2 className="font-semibold text-slate-900 dark:text-white">Kelola evaluasi belajar</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Susun soal, terbitkan jadwal, dan tinjau capaian peserta dari bagian CBT.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setTab("questions")} className={BUTTON}><BookOpen className="h-4 w-4" />Bank soal</button><button type="button" onClick={() => setTab("packages")} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><Boxes className="mr-2 inline h-4 w-4" />Paket soal</button><button type="button" onClick={() => setTab("calendar")} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><CalendarDays className="mr-2 inline h-4 w-4" />Kalender</button></div></section>
      </>}
    </div>}

    {tab === "packages" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Paket soal ujian</h2><p className="mt-1 text-sm text-slate-500">Paket dikelompokkan dari kategori CBT pesantren dan jumlah soal yang tersimpan.</p></div><button type="button" onClick={() => setTab("questions")} className={BUTTON}><BookOpen className="h-4 w-4" />Buka bank soal</button></header>
      {loading ? <div role="status" className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat paket soal…</div> : error ? <div role="status" className="p-8 text-sm text-slate-600 dark:text-slate-300">Paket soal belum dapat ditampilkan. Silakan muat ulang untuk mencoba kembali.</div> : cbtPackages.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{cbtPackages.map((item) => <article key={item.id} className="flex min-h-64 flex-col rounded-2xl border border-slate-200 p-5 dark:border-white/10"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.name}</h3><p className="mt-1 text-sm text-slate-500">{item.description || "Belum ada keterangan paket."}</p></div><Boxes className="h-5 w-5 shrink-0 text-indigo-700" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-xs text-slate-500">Soal tersedia</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.activeQuestions}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-xs text-slate-500">Jumlah tersimpan</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.totalQuestions}</p></div></div><div className="mt-4 space-y-2 text-xs"><div><span className="font-semibold text-slate-600 dark:text-slate-300">Mata pelajaran: </span><span className="text-slate-500">{item.subjects.length ? item.subjects.join(", ") : "Belum ada soal"}</span></div><div><span className="font-semibold text-slate-600 dark:text-slate-300">Jenjang: </span><span className="text-slate-500">{item.gradeLevels.length ? item.gradeLevels.join(", ") : "Belum ada soal"}</span></div></div><button type="button" onClick={() => { setSearch(""); setQuestionStatus("all"); setQuestionTemplateFilter(item.id); setTab("questions"); }} disabled={!item.totalQuestions} className="mt-auto pt-5 text-left text-sm font-semibold text-indigo-700 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-indigo-300 dark:hover:text-indigo-200">{item.totalQuestions ? "Lihat soal dalam paket →" : "Belum ada soal dalam paket ini"}</button></article>)}</div> : <div className="p-10 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900 dark:text-white">Belum ada paket soal</h3><p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Tambahkan kategori paket CBT dan referensi mata pelajaran melalui pengaturan modul, lalu susun soal untuk paket tersebut.</p></div>}
    </section>}

    {tab === "settings" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="border-b border-slate-200 p-5 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">Pengaturan ujian tenant</h2><p className="mt-1 text-sm text-slate-500">Nilai ini menjadi pengaturan awal saat membuat sesi baru. Sesi yang sudah dibuat tidak berubah.</p>{snapshot.settings.updatedAt && <p className="mt-1 text-xs text-slate-500">Terakhir disimpan {formatTenantDateTime(snapshot.settings.updatedAt, tenantTimeZone)}</p>}</header>
      {loading ? <div role="status" className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat pengaturan…</div> : <form onSubmit={saveSettings} className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><p className="font-medium text-slate-800 dark:text-slate-100">Penilaian otomatis</p><p className="mt-1 text-sm text-slate-500">Soal pilihan ganda dinilai otomatis setelah peserta mengumpulkan ujian.</p><label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={true} disabled aria-label="Penilaian otomatis aktif" />Aktif</label></div>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200"><input type="checkbox" className="mt-1" checked={settingsDraft.shuffleQuestions} onChange={(event) => updateSettingsDraft({ shuffleQuestions: event.target.checked })} /><span><span className="block font-medium">Acak urutan soal</span><span className="mt-1 block text-slate-500">Menjadi nilai awal untuk sesi ujian baru; dapat disesuaikan saat membuat sesi.</span></span></label>
        </div>
        <div><h3 className="mb-3 font-medium text-slate-800 dark:text-slate-100">Bobot penilaian awal</h3><div className="grid gap-3 sm:grid-cols-3">
          <label className={LABEL}>Poin jawaban benar<input type="number" min="0" max="100" step="0.01" required className={FIELD} value={settingsDraft.correctPoints} onChange={(event) => updateSettingsDraft({ correctPoints: Number(event.target.value) })} /></label>
          <label className={LABEL}>Poin jawaban salah<input type="number" min="-100" max="100" step="0.01" required className={FIELD} value={settingsDraft.wrongPoints} onChange={(event) => updateSettingsDraft({ wrongPoints: Number(event.target.value) })} /></label>
          <label className={LABEL}>Poin tidak dijawab<input type="number" min="-100" max="100" step="0.01" required className={FIELD} value={settingsDraft.blankPoints} onChange={(event) => updateSettingsDraft({ blankPoints: Number(event.target.value) })} /></label>
        </div><p className="mt-2 text-xs text-slate-500">Rentang poin: jawaban benar 0–100; jawaban salah dan kosong −100–100. Maksimal dua angka desimal.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10"><p className="text-sm text-slate-500">Perubahan hanya memengaruhi sesi ujian yang dibuat setelah pengaturan disimpan.</p><button type="submit" disabled={saving || !settingsDirty} className={BUTTON}><Check className="h-4 w-4" />{saving ? "Menyimpan…" : "Simpan pengaturan"}</button></div>
      </form>}
    </section>}

    {tab === "monitor" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Pemantauan peserta ujian</h2><p className="mt-1 text-sm text-slate-500">Status penugasan yang tersimpan pada tenant ini.</p><p className="mt-1 text-xs text-slate-500">{snapshotUpdatedAt ? `Data diperbarui ${formatTenantDateTime(snapshotUpdatedAt, tenantTimeZone)}` : "Waktu pembaruan belum tersedia"}</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang status</button>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sedang dikerjakan", value: monitorSummary.inProgressCount, tone: "text-indigo-700 dark:text-indigo-300" },
          { label: "Belum dimulai", value: monitorSummary.waitingCount, tone: "text-amber-700 dark:text-amber-300" },
          { label: "Selesai", value: monitorSummary.completedCount, tone: "text-emerald-700 dark:text-emerald-300" },
          { label: "Tidak hadir", value: monitorSummary.missedCount, tone: "text-slate-700 dark:text-slate-300" },
        ].map((item) => <article key={item.label} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><p className="text-sm text-slate-500">{item.label}</p><p className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</p></article>)}
      </div>
      <div className="space-y-4 border-t border-slate-200 p-4 dark:border-white/10">
        <label className="block max-w-md text-sm font-medium text-slate-700 dark:text-slate-200">Cari peserta, ujian, atau kelas<input aria-label="Cari peserta, ujian, atau kelas" className={FIELD + " mt-2"} value={monitorSearch} onChange={(event) => setMonitorSearch(event.target.value)} placeholder="Ketik nama atau kelas" /></label>
        {loading ? <div role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-white/5"><Loader2 className="h-4 w-4 animate-spin" />Memuat status peserta…</div> : error ? <div role="status" className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Status peserta belum dapat ditampilkan. Muat ulang untuk mencoba kembali.</div> : monitorSummary.activeParticipants.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5"><tr><th className="p-3">Santri</th><th className="p-3">Ujian</th><th className="p-3">Kelas</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{monitorSummary.activeParticipants.map((item) => <tr key={item.assignmentId}><td className="p-3 font-medium text-slate-800 dark:text-slate-100">{item.studentName}</td><td className="p-3">{item.examTitle}</td><td className="p-3">{item.className || "—"}</td><td className="p-3"><span className={item.status === "in_progress" ? "rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"}>{cbtStatusLabel(item.status)}</span></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-white/10"><p className="font-medium text-slate-800 dark:text-slate-100">{monitorSummary.totalAssignments ? "Tidak ada penugasan aktif yang cocok." : "Belum ada peserta yang ditugaskan."}</p><p className="mt-1 text-sm text-slate-500">Peserta dengan status menunggu atau sedang mengerjakan akan muncul di sini.</p></div>}
      </div>
    </section>}

    {tab === "calendar" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Kalender ujian</h2><p className="mt-1 text-sm text-slate-500">Jadwal mengikuti zona waktu pesantren: {tenantTimeZone}.</p></div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => moveCalendarMonth(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <h3 aria-live="polite" className="min-w-36 text-center text-sm font-semibold capitalize text-slate-900 dark:text-white">{calendarMonthLabel}</h3>
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
        {loading ? <div role="status" className="flex items-center gap-2 py-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat jadwal ujian…</div> : selectedCalendarExams.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">{selectedCalendarExams.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div><h4 className="font-semibold text-slate-900 dark:text-white">{item.title}</h4><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.startsAt, tenantTimeZone)}–{formatTenantDateTime(item.endsAt, tenantTimeZone)}</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span><span className="text-slate-500">{item.assignedCount} peserta · {item.completedCount} selesai</span></div></article>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">{snapshot.exams.length ? "Tidak ada sesi ujian pada tanggal ini." : "Belum ada jadwal ujian tersimpan."}</div>}
      </div>
    </section>}

    {tab === "questions" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10">
          <h2 className="font-semibold text-slate-900 dark:text-white">Bank soal pesantren</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input aria-label="Cari soal" className={FIELD + " mt-0"} placeholder="Cari teks soal, subjek, atau tag" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="Filter status soal" className={FIELD + " mt-0"} value={questionStatus} onChange={(event) => setQuestionStatus(event.target.value as "all" | "active" | "archived")}>
              <option value="all">Semua status</option><option value="active">Aktif</option><option value="archived">Diarsipkan</option>
            </select>
            <select aria-label="Filter paket soal" className={FIELD + " mt-0"} value={questionTemplateFilter} onChange={(event) => setQuestionTemplateFilter(event.target.value)}>
              <option value="all">Semua paket</option>{snapshot.references.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          {search.trim().length > 0 && search.trim().length < 3 && <p className="text-xs text-amber-700 dark:text-amber-300">Masukkan sedikitnya 3 karakter untuk mencari.</p>}
        </div>
        {questionPageLoading && !visibleQuestions.length ? <div role="status" className="flex justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat halaman bank soal…</div>
          : visibleQuestions.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{visibleQuestions.map((question) => <article key={question.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{question.subject}</span><span>·</span><span>{question.grade}</span><span>·</span><span>{question.template}</span>{question.status !== "active" && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">Arsip</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{question.text}</p><ol className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">{question.options.map((option, index) => <li key={index} className={index === question.correctAnswer ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}>{String.fromCharCode(65 + index)}. {option}</li>)}</ol></div><button type="button" disabled={question.status !== "active"} onClick={() => editQuestion(question)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200">Ubah</button></div></article>)}</div>
          : questionPageError ? null : <div className="p-10 text-center text-sm text-slate-500">{search.trim() || questionTemplateFilter !== "all" || questionStatus !== "all" ? "Tidak ada soal yang sesuai dengan pencarian dan filter." : "Belum ada soal. Gunakan formulir Tambah soal untuk mulai menyusun bank soal pada pesantren ini."}</div>}
        {questionPageError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-t border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><span>{questionPageError}</span><button type="button" onClick={() => void loadQuestionPage(null, false)} className="rounded-lg border border-rose-300 px-3 py-1.5 font-semibold dark:border-rose-300/30">Coba lagi</button></div>}
        {questionPageLoading && visibleQuestions.length > 0 && <p role="status" className="border-t border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-white/10">Memuat halaman soal berikutnya…</p>}
        {questionPage.hasMore && <div className="border-t border-slate-200 p-4 text-center dark:border-white/10"><button type="button" onClick={() => void loadQuestionPage(questionPage.nextCursor, true)} disabled={questionPageLoading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">Muat soal berikutnya</button></div>}
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
        {snapshot.exams.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.exams.map((item) => <article key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{cbtStatusLabel(item.status)}</span></div><p className="mt-1 text-sm text-slate-500">{item.subject} · {item.grade} · {item.durationMinutes} menit</p><p className="mt-1 text-xs text-slate-500">{formatTenantDateTime(item.startsAt, tenantTimeZone)} · {item.assignedCount} peserta · {item.completedCount} selesai</p></article>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada sesi ujian.</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Buat jadwal ujian</h2>
        {loading ? <p className="text-sm text-slate-500">Memuat daftar santri…</p> : <form onSubmit={submitExam} className="space-y-3">
          <label className={LABEL}>Nama ujian<input required maxLength={180} className={FIELD} value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mata pelajaran<select required className={FIELD} value={exam.subjectReferenceId} onChange={(e) => { setExam({ ...exam, subjectReferenceId: e.target.value, gradeLevelReferenceId: "" }); setSelectedQuestions([]); setBuilderQuestionPage(EMPTY_QUESTION_PAGE); builderQuestionPageFilter.current = ""; }}><option value="">Pilih mata pelajaran</option>{snapshot.references.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={LABEL}>Jenjang<select required className={FIELD} value={exam.gradeLevelReferenceId} onChange={(e) => { setExam({ ...exam, gradeLevelReferenceId: e.target.value }); setSelectedQuestions([]); setBuilderQuestionPage(EMPTY_QUESTION_PAGE); builderQuestionPageFilter.current = ""; }}><option value="">Pilih jenjang</option>{snapshot.references.gradeLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mulai<input type="datetime-local" required className={FIELD} value={exam.startsAt} onChange={(e) => setExam({ ...exam, startsAt: e.target.value })} /></label><label className={LABEL}>Akhir jendela<input type="datetime-local" required className={FIELD} value={exam.endsAt} onChange={(e) => setExam({ ...exam, endsAt: e.target.value })} /></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className={LABEL}>Durasi (menit)<input type="number" min="1" max="600" required className={FIELD} value={exam.durationMinutes} onChange={(e) => setExam({ ...exam, durationMinutes: Number(e.target.value) })} /></label><label className={LABEL}>Nilai lulus<input type="number" min="0" max="100" step="any" className={FIELD} value={exam.passingScore} onChange={(e) => setExam({ ...exam, passingScore: Number(e.target.value) })} /></label><label className={LABEL}>Status<select className={FIELD} value={exam.status} onChange={(e) => setExam({ ...exam, status: e.target.value })}><option value="draft">Draf</option><option value="published">Terbit</option></select></label></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className={LABEL}>Poin jawaban benar<input type="number" min="0" max="100" step="any" className={FIELD} value={exam.correctPoints} onChange={(e) => setExam({ ...exam, correctPoints: Number(e.target.value) })} /></label><label className={LABEL}>Poin jawaban salah<input type="number" min="-100" max="100" step="any" className={FIELD} value={exam.wrongPoints} onChange={(e) => setExam({ ...exam, wrongPoints: Number(e.target.value) })} /></label><label className={LABEL}>Poin tidak dijawab<input type="number" min="-100" max="100" step="any" className={FIELD} value={exam.blankPoints} onChange={(e) => setExam({ ...exam, blankPoints: Number(e.target.value) })} /></label></div>
          <fieldset className="space-y-2"><legend className={LABEL}>Soal ({selectedQuestionCount} dipilih)</legend>
            {builderQuestionPage.items.length > 0 && <p className="text-xs text-slate-500">Menampilkan {builderQuestionPage.items.length} soal aktif untuk mata pelajaran dan jenjang ini.</p>}
            <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-white/10">
              {eligibleQuestions.map((question) => <label key={question.id} className="flex items-start gap-2 p-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selectedQuestions.includes(question.id)} disabled={!selectedQuestions.includes(question.id) && selectedQuestions.length >= 500} onChange={(e) => setSelectedQuestions((current) => e.target.checked ? [...current, question.id] : current.filter((id) => id !== question.id))} />{question.text}</label>)}
              {builderQuestionPageLoading && !eligibleQuestions.length && <p role="status" className="p-2 text-xs text-slate-500">Memuat soal yang sesuai…</p>}
              {builderQuestionPageError && <p role="alert" className="p-2 text-xs text-rose-700 dark:text-rose-300">{builderQuestionPageError}</p>}
              {!builderQuestionPageLoading && !builderQuestionPageError && !eligibleQuestions.length && <p className="p-2 text-xs text-slate-500">Belum ada soal aktif dengan mata pelajaran dan jenjang ini.</p>}
            </div>
            {builderQuestionPage.hasMore && <button type="button" onClick={() => void loadBuilderQuestionPage(builderQuestionPage.nextCursor, true)} disabled={builderQuestionPageLoading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">{builderQuestionPageLoading ? "Memuat…" : "Muat soal lainnya"}</button>}
            {builderQuestionPageError && <button type="button" onClick={() => void loadBuilderQuestionPage(builderQuestionPage.items.length ? builderQuestionPage.nextCursor : null, builderQuestionPage.items.length > 0)} disabled={builderQuestionPageLoading} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-400/20 dark:text-rose-300">Coba muat ulang soal</button>}
          </fieldset>
          <fieldset className="space-y-2"><legend className={LABEL}>Peserta santri ({selectedStudents.length} dipilih, maksimal 500 per ujian)</legend>
            <label className={LABEL}>Cari nama atau NIS santri<input aria-label="Cari nama atau NIS santri" maxLength={100} className={FIELD} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Ketik minimal 3 karakter untuk mencari" /></label>
            {studentSearch.trim().length > 0 && Array.from(studentSearch.trim()).length < 3 && <p className="text-xs text-slate-500">Masukkan minimal 3 karakter untuk mencari.</p>}
            <div className="max-h-44 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-white/10">
              {studentPage.items.map((student) => <label key={student.id} className="flex items-start gap-2 p-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selectedStudents.includes(student.id)} disabled={!selectedStudents.includes(student.id) && selectedStudents.length >= 500} onChange={(e) => setSelectedStudents((current) => e.target.checked ? current.includes(student.id) ? current : [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}<span className="ml-1 text-slate-400">{student.className || student.grade}</span></span></label>)}
              {studentPageLoading && <p role="status" className="p-2 text-xs text-slate-500">Memuat daftar santri…</p>}
              {studentPageError && <p role="alert" className="p-2 text-xs text-rose-700 dark:text-rose-300">{studentPageError}</p>}
              {!studentPageLoading && !studentPageError && !studentPage.items.length && !(studentSearch.trim().length > 0 && Array.from(studentSearch.trim()).length < 3) && <p className="p-2 text-xs text-slate-500">Santri tidak ditemukan.</p>}
            </div>
            {studentPage.hasMore && <button type="button" onClick={() => void loadStudentPage(studentPage.nextCursor, true)} disabled={studentPageLoading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">{studentPageLoading ? "Memuat…" : "Muat santri lainnya"}</button>}
            {studentPageError && <button type="button" onClick={() => void loadStudentPage(studentPage.items.length ? studentPage.nextCursor : null, studentPage.items.length > 0)} disabled={studentPageLoading} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-400/20 dark:text-rose-300">Coba muat ulang santri</button>}
          </fieldset>
          <button type="submit" disabled={saving || !eligibleQuestions.length || !selectedQuestionCount || !selectedStudents.length || selectedStudents.length > 500} className={BUTTON + " w-full"}>{saving ? "Menyimpan…" : "Simpan sesi & tugaskan santri"}</button>
        </form>}
      </section>
    </div>}

    {tab === "results" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">Hasil ujian dan penugasan</h2></div>
      {snapshot.results.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5"><tr><th className="p-3">Santri</th><th className="p-3">Ujian</th><th className="p-3">Kelas</th><th className="p-3">Status</th><th className="p-3">Nilai</th><th className="p-3">Keputusan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.results.map((result) => <tr key={result.assignmentId}><td className="p-3 font-medium text-slate-800 dark:text-slate-100">{result.studentName}</td><td className="p-3">{result.examTitle}</td><td className="p-3">{result.className || "—"}</td><td className="p-3">{cbtStatusLabel(result.status)}</td><td className="p-3">{result.score == null ? "—" : result.score}</td><td className="p-3">{result.passed == null ? "—" : result.passed ? "Lulus" : "Belum lulus"}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada peserta ujian.</div>}
    </section>}

    {legacyArchiveImportEnabled && tab === "import" && <div className="grid gap-5 xl:grid-cols-2">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor bank soal</h2><p className="mt-1 text-sm text-slate-500">Tinjau daftar soal dan kecocokan referensi sebelum mengimpor.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacyImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Buat pratinjau</button><button type="button" disabled={saving || !importPreview?.canApply} onClick={() => void runLegacyImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan pratinjau</button></div>
        <ImportPreviewDetails preview={importPreview} />
      </section>
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor pengaturan ujian</h2><p className="mt-1 text-sm text-slate-500">Pengaturan yang diimpor akan menjadi nilai awal untuk formulir ujian baru.</p></div>
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Pengaturan aktif: <strong>{snapshot.settings.sourceSystem === "legacy_firestore" ? "hasil impor" : "nilai bawaan"}</strong>. Nilai ini digunakan sebagai pengaturan awal ujian baru.</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacySettingsImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Pratinjau pengaturan</button><button type="button" disabled={saving || !settingsImportPreview?.canApply} onClick={() => void runLegacySettingsImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan pengaturan</button></div>
        <ImportPreviewDetails preview={settingsImportPreview} />
      </section>
    </div>}
  </main>;
}
