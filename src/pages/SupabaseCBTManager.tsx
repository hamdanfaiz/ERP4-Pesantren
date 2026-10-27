import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, CalendarClock, Check, ClipboardList, Loader2, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type Question = {
  id: string; subject: string; grade: string; template: string; text: string; options: string[];
  correctAnswer: number; explanation: string; difficulty: string; tags: string[]; status: string;
};
type Student = { id: string; name: string; grade: string; className: string };
type Exam = {
  id: string; title: string; subject: string; grade: string; startsAt: string; endsAt: string;
  durationMinutes: number; passingScore: number; status: string; assignedCount: number; completedCount: number;
};
type Result = {
  assignmentId: string; examTitle: string; studentName: string; className: string; status: string;
  score: number | null; passed: boolean | null; submittedAt: string | null; correct: number | null; wrong: number | null; blank: number | null;
};
type CbtSettings = {
  subjects: string[]; grades: string[]; templates: string[]; autoGrading: boolean; shuffleQuestions: boolean;
  correctPoints: number; wrongPoints: number; blankPoints: number; sourceSystem: string;
};
type Snapshot = { questions: Question[]; students: Student[]; exams: Exam[]; results: Result[]; classes: string[]; settings: CbtSettings };
type Tab = "questions" | "exams" | "results" | "import";
type ImportPreview = { snapshotFingerprint: string; counts: { source: number; ready: number; alreadyImported: number; invalid: number }; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };

const EMPTY_SETTINGS: CbtSettings = { subjects: [], grades: [], templates: [], autoGrading: true, shuffleQuestions: false, correctPoints: 1, wrongPoints: 0, blankPoints: 0, sourceSystem: "defaults" };
const EMPTY: Snapshot = { questions: [], students: [], exams: [], results: [], classes: [], settings: EMPTY_SETTINGS };
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";

async function requestCbt(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
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
  const labels: Record<string, string> = { draft: "Draf", published: "Terbit", active: "Aktif", archived: "Diarsipkan", assigned: "Ditugaskan", in_progress: "Sedang dikerjakan", completed: "Selesai", submitted: "Dikumpulkan", graded: "Dinilai", cancelled: "Dibatalkan", expired: "Kedaluwarsa" };
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
    <p className={preview.canApply ? "text-sm font-medium text-emerald-700 dark:text-emerald-300" : "text-sm font-medium text-amber-700 dark:text-amber-300"}>{preview.canApply ? "Data dapat diterapkan. Server akan memeriksa ulang sidik digital sebelum penerapan." : "Data belum dapat diterapkan; perbaiki konflik atau selesaikan rekonsiliasi terlebih dahulu."}</p>
  </div>;
}

export function SupabaseCBTManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>("questions");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    subject: "", grade: "", template: "Paket A", text: "", options: ["", "", "", ""],
    correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "",
  });
  const [exam, setExam] = useState({
    title: "", subject: "", grade: "", startsAt: localDateTimeOffset(60), endsAt: localDateTimeOffset(180),
    durationMinutes: 90, passingScore: 75, correctPoints: 1, wrongPoints: 0, blankPoints: 0, shuffleQuestions: true, status: "draft",
  });
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [settingsImportPreview, setSettingsImportPreview] = useState<ImportPreview | null>(null);
  const settingsAppliedTenant = useRef("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestCbt("/api/cbt/admin");
      setSnapshot({
        questions: Array.isArray(result.questions) ? result.questions : [],
        exams: Array.isArray(result.exams) ? result.exams : [],
        results: Array.isArray(result.results) ? result.results : [],
        students: Array.isArray(result.students) ? result.students : [],
        classes: Array.isArray(result.classes) ? result.classes : [],
        settings: result.settings && typeof result.settings === "object" ? { ...EMPTY_SETTINGS, ...result.settings } : EMPTY_SETTINGS,
      });
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
          subject: settings.subjects[0] || "", grade: settings.grades[0] || "",
          template: settings.templates[0] || "Paket A", text: "", options: ["", "", "", ""],
          correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "",
        });
        setExam((current) => ({
          ...current, title: "", subject: settings.subjects[0] || "", grade: settings.grades[0] || "",
          correctPoints: settings.correctPoints, wrongPoints: settings.wrongPoints,
          blankPoints: settings.blankPoints, shuffleQuestions: settings.shuffleQuestions,
        }));
      }
    } catch (cause: any) { setSnapshot(EMPTY); setError(cause?.message || "Data CBT Supabase belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleQuestions = useMemo(() => snapshot.questions.filter((question) =>
    [question.subject, question.grade, question.template, question.text, question.tags.join(" ")]
      .join(" ").toLowerCase().includes(search.toLowerCase())), [snapshot.questions, search]);
  const eligibleQuestions = useMemo(() => snapshot.questions.filter((question) => question.status === "active"
    && question.subject === exam.subject && question.grade === exam.grade), [snapshot.questions, exam.subject, exam.grade]);
  const selectedQuestionCount = selectedQuestions.filter((id) => eligibleQuestions.some((question) => question.id === id)).length;

  const resetQuestion = () => {
    setEditingQuestionId(null);
    setForm({ subject: "", grade: "", template: "Paket A", text: "", options: ["", "", "", ""], correctAnswer: "0", explanation: "", difficulty: "Medium", tags: "" });
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
      setNotice(editingQuestionId ? "Soal diperbarui di Supabase." : "Soal ditambahkan ke bank tenant.");
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
      subject: question.subject, grade: question.grade, template: question.template,
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
      setNotice("Ujian dan penugasan tersimpan pada tenant Supabase.");
      setSelectedQuestions([]); setSelectedStudents([]);
      setExam((current) => ({ ...current, title: "", startsAt: localDateTimeOffset(60), endsAt: localDateTimeOffset(180) }));
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Ujian belum dapat dibuat."); }
    finally { setSaving(false); }
  };

  if (role !== "Admin" && role !== "SuperAdmin") {
    return <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pengelolaan bank soal dan jadwal ujian hanya tersedia untuk Admin tenant.</section>;
  }

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" />Sumber data: Supabase tenant</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ujian Berbasis Komputer (CBT)</h1>
        <p className="mt-1 text-sm text-slate-500">Bank soal, sesi ujian, penugasan santri, dan hasil pemeriksaan tersimpan di backend.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>Peralihan CBT bertahap.</strong> Bank soal lama dapat dipratinjau lalu diimpor oleh Admin pesantren. Slot statis dan ujian contoh tidak menjadi data migrasi. Pengendali fitur tetap harus nonaktif sampai migrasi basis data dan pengujian akhir selesai.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Bank soal", value: snapshot.questions.filter((item) => item.status === "active").length, icon: BookOpen }, { label: "Ujian", value: snapshot.exams.length, icon: CalendarClock }, { label: "Peserta ditugaskan", value: snapshot.results.length, icon: Users }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900" aria-label="Modul CBT">
      {([{ id: "questions", label: "Bank Soal", icon: BookOpen }, { id: "exams", label: "Ujian & Peserta", icon: CalendarClock }, { id: "results", label: "Hasil", icon: ClipboardList }, ...(legacyArchiveImportEnabled ? [{ id: "import", label: "Impor Data Lama", icon: RefreshCw }] : [])] as Array<{ id: Tab; label: string; icon: React.ElementType }>).map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); setError(""); setNotice(""); }} className={"inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold " + (tab === item.id ? "bg-indigo-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5")}><item.icon className="h-4 w-4" />{item.label}</button>)}
    </nav>

    {tab === "questions" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-semibold text-slate-900 dark:text-white">Bank soal tenant</h2><input aria-label="Cari soal" className={FIELD + " mt-0 sm:max-w-xs"} placeholder="Cari soal, subjek, atau tag" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {loading ? <div role="status" className="flex justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat bank soal…</div> : visibleQuestions.length ? <div className="divide-y divide-slate-100 dark:divide-white/5">{visibleQuestions.map((question) => <article key={question.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{question.subject}</span><span>·</span><span>{question.grade}</span><span>·</span><span>{question.template}</span>{question.status !== "active" && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">Arsip</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{question.text}</p><ol className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">{question.options.map((option, index) => <li key={index} className={index === question.correctAnswer ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}>{String.fromCharCode(65 + index)}. {option}</li>)}</ol></div><button type="button" disabled={question.status !== "active"} onClick={() => editQuestion(question)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200">Ubah</button></div></article>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Belum ada soal Supabase. Gunakan tab Impor Data Lama untuk meninjau bank soal Firestore yang tersimpan.</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-indigo-700" /><h2 className="font-semibold text-slate-900 dark:text-white">{editingQuestionId ? "Ubah soal" : "Tambah soal"}</h2></div>
        <form onSubmit={saveQuestion} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mata pelajaran<input list="cbt-subject-options" required maxLength={150} className={FIELD} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label><label className={LABEL}>Jenjang<input list="cbt-grade-options" required maxLength={40} className={FIELD} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Paket<input list="cbt-template-options" required maxLength={80} className={FIELD} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /></label><label className={LABEL}>Kesulitan<select className={FIELD} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option value="Easy">Mudah</option><option value="Medium">Sedang</option><option value="Hard">Sulit</option></select></label></div>
          <datalist id="cbt-subject-options">{snapshot.settings.subjects.map((item) => <option key={item} value={item} />)}</datalist><datalist id="cbt-grade-options">{snapshot.settings.grades.map((item) => <option key={item} value={item} />)}</datalist><datalist id="cbt-template-options">{snapshot.settings.templates.map((item) => <option key={item} value={item} />)}</datalist>
          <label className={LABEL}>Teks soal<textarea required rows={4} maxLength={12000} className={FIELD} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
          <div className="space-y-2"><span className={LABEL}>Opsi jawaban</span>{form.options.map((option, index) => <div key={index} className="flex items-center gap-2"><span className="w-6 text-xs font-bold text-slate-500">{String.fromCharCode(65 + index)}</span><input aria-label={"Opsi " + String.fromCharCode(65 + index)} maxLength={1000} className={FIELD + " mt-0"} value={option} onChange={(e) => setForm({ ...form, options: form.options.map((value, optionIndex) => optionIndex === index ? e.target.value : value) })} /></div>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Indeks jawaban benar<select className={FIELD} value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}>{form.options.map((_, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>)}</select></label><label className={LABEL}>Tag, pisahkan dengan koma<input className={FIELD} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
          <label className={LABEL}>Pembahasan<textarea rows={2} maxLength={4000} className={FIELD} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></label>
          <div className="flex gap-2">{editingQuestionId && <button type="button" onClick={resetQuestion} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">Batal</button>}<button type="submit" disabled={saving} className={BUTTON + " flex-1"}>{saving ? "Menyimpan…" : "Simpan ke Supabase"}</button></div>
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
        {loading ? <p className="text-sm text-slate-500">Memuat roster tenant…</p> : <form onSubmit={submitExam} className="space-y-3">
          <label className={LABEL}>Nama ujian<input required maxLength={180} className={FIELD} value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Mata pelajaran<select required className={FIELD} value={exam.subject} onChange={(e) => { setExam({ ...exam, subject: e.target.value, grade: "", }); setSelectedQuestions([]); }}><option value="">Pilih</option>{[...new Set([...snapshot.settings.subjects, ...snapshot.questions.filter((q) => q.status === "active").map((q) => q.subject)])].map((item) => <option key={item}>{item}</option>)}</select></label><label className={LABEL}>Jenjang<select required className={FIELD} value={exam.grade} onChange={(e) => { setExam({ ...exam, grade: e.target.value }); setSelectedQuestions([]); }}><option value="">Pilih</option>{[...new Set([...snapshot.settings.grades, ...snapshot.questions.filter((q) => q.status === "active" && (!exam.subject || q.subject === exam.subject)).map((q) => q.grade)])].map((item) => <option key={item}>{item}</option>)}</select></label></div>
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
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor bank soal Firestore</h2><p className="mt-1 text-sm text-slate-500">Backend memindai maksimal 3.000 soal dengan tenant key yang cocok. Pratinjau hanya menampilkan ringkasan dan referensi tersamar.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacyImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Buat pratinjau</button><button type="button" disabled={saving || !importPreview?.canApply} onClick={() => void runLegacyImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan pratinjau</button></div>
        <ImportPreviewDetails preview={importPreview} />
      </section>
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Impor konfigurasi CBT Firestore</h2><p className="mt-1 text-sm text-slate-500">Hanya satu dokumen konfigurasi yang ID-nya harus sama dengan pemetaan tenant arsip. Nilai penilaian manual ditahan karena runtime Supabase saat ini memakai penilaian otomatis.</p></div>
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Sumber pengaturan aktif: <strong>{snapshot.settings.sourceSystem === "legacy_firestore" ? "hasil migrasi Firestore" : "nilai bawaan Supabase"}</strong>. Nilai menjadi default form ujian setelah dimuat.</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void runLegacySettingsImport("preview")} className={BUTTON}><RefreshCw className={saving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Pratinjau konfigurasi</button><button type="button" disabled={saving || !settingsImportPreview?.canApply} onClick={() => void runLegacySettingsImport("apply")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Terapkan konfigurasi</button></div>
        <ImportPreviewDetails preview={settingsImportPreview} />
      </section>
    </div>}
  </main>;
}
