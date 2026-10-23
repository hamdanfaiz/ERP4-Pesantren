import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, CircleCheck, ClipboardList, FilePlus2, Loader2, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Material = { id: string; title: string; material_type: "video" | "pdf" | "link" | "text"; resource_url: string; body: string; duration_seconds: number | null; display_order: number };
type Module = { id: string; title: string; description: string; display_order: number; materials: Material[] };
type Course = { id: string; title: string; description: string; grade: string; categoryId: string | null; category: string; instructorUserId: string; status: string; color: string; modules: Module[]; enrollmentCount: number };
type Assignment = { id: string; courseId: string; moduleId: string | null; title: string; instructions: string; dueAt: string | null; allowLate: boolean; maxScore: number; status: string };
type Submission = { id: string; assignmentId: string; assignmentTitle: string; studentId: string; studentName: string; responseText: string; resourceUrl: string; submittedAt: string; score: number | null; feedback: string; gradedAt: string | null };
type Snapshot = { courses: Course[]; categories: Array<{ id: string; name: string; description: string }>; instructors: Array<{ id: string; name: string }>; students: Array<{ id: string; name: string; grade: string; className: string }>; enrollments: Array<{ course_id: string; student_id: string; status: string }>; assignments: Assignment[]; submissions: Submission[]; progress: Array<{ materialId: string; positionSeconds: number; completedAt: string | null }>; notes: Array<{ id: string; materialId: string; timestampSeconds: number; note: string; createdAt: string }>; comments: Array<{ id: string; materialId: string; studentName: string; timestampSeconds: number; comment: string; createdAt: string }> };
type Tab = "courses" | "assignments" | "submissions";
type ImportPreview = { snapshotFingerprint: string; counts: Record<string, number>; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };

const EMPTY: Snapshot = { courses: [], categories: [], instructors: [], students: [], enrollments: [], assignments: [], submissions: [], progress: [], notes: [], comments: [] };
const INPUT = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const LEGACY_LMS_IMPORT_ENABLED = import.meta.env.VITE_SUPABASE_LMS_IMPORT_ENABLED === "true";

async function requestLms(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak tersedia. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Layanan LMS belum dapat diproses.");
  return result;
}

function lmsStatusLabel(status: string) {
  const labels: Record<string, string> = { draft: "Draf", published: "Terbit", archived: "Diarsipkan", active: "Aktif", inactive: "Nonaktif", completed: "Selesai", submitted: "Dikumpulkan", graded: "Dinilai", overdue: "Terlambat" };
  return labels[status.toLowerCase()] || status;
}
function lmsMaterialTypeLabel(type: string) { return ({ video: "Video", pdf: "PDF", link: "Tautan", text: "Teks" } as Record<string, string>)[type.toLowerCase()] || type; }

export function SupabaseLMSManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>("courses");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState({ name: "", description: "" });
  const [course, setCourse] = useState({ title: "", description: "", grade: "", categoryId: "", categoryName: "Umum", instructorUserId: "", status: "published", color: "indigo" });
  const [moduleDraft, setModuleDraft] = useState({ title: "", description: "" });
  const [materialDraft, setMaterialDraft] = useState({ moduleId: "", title: "", type: "video", url: "", body: "" });
  const [enrollment, setEnrollment] = useState({ courseId: "", studentId: "" });
  const [assignmentDraft, setAssignmentDraft] = useState({ courseId: "", moduleId: "", title: "", instructions: "", dueAt: "", maxScore: 100, allowLate: false, status: "published" });
  const [submissionsDraft, setSubmissionsDraft] = useState<Record<string, { responseText: string; resourceUrl: string }>>({});
  const [gradeDraft, setGradeDraft] = useState<Record<string, { score: string; feedback: string }>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [legacyImportPreview, setLegacyImportPreview] = useState<ImportPreview | null>(null);

  const isAdmin = role === "Admin" || role === "SuperAdmin";
  const canManage = isAdmin || role === "Ustadz";
  const selectedCourse = snapshot.courses.find((item) => item.id === selectedCourseId) || null;

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestLms("/api/lms/snapshot");
      setSnapshot({ ...EMPTY, ...result });
      setSelectedCourseId((current) => result.courses?.some((item: Course) => item.id === current) ? current : result.courses?.[0]?.id || "");
    } catch (cause: any) { setSnapshot(EMPTY); setError(cause?.message || "Data LMS belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);

  const previewLegacyImport = async () => {
    setBusy(true); setError(""); setNotice(""); setLegacyImportPreview(null);
    try {
      const result = await requestLms("/api/lms/legacy/import", { method: "POST", body: JSON.stringify({ action: "preview" }) });
      setLegacyImportPreview(result);
      setNotice(result.canApply ? "Pratinjau impor selesai. Tinjau hitungan dan konflik sebelum menerapkan." : "Pratinjau selesai; perbaiki konflik atau periksa apakah data sumber memang kosong.");
    } catch (cause: any) { setError(cause?.message || "Pratinjau impor LMS gagal."); }
    finally { setBusy(false); }
  };

  const applyLegacyImport = async () => {
    if (!legacyImportPreview?.canApply || !window.confirm(`Terapkan ${legacyImportPreview.counts.ready} record katalog LMS ke tenant Supabase?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestLms("/api/lms/legacy/import", { method: "POST", body: JSON.stringify({ action: "apply", expectedFingerprint: legacyImportPreview.snapshotFingerprint }) });
      setNotice(`Impor LMS selesai: ${result.imported} record ditambahkan, ${result.skipped} record dikenali sudah sama.`);
      setLegacyImportPreview(null); await refresh();
    } catch (cause: any) { setError(cause?.message || "Impor LMS gagal; tidak ada hasil yang dikonfirmasi."); }
    finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, [refresh]);

  const catalogWrite = async (action: string, item: Record<string, any>, message: string, lease?: { clear: () => void }) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestLms("/api/lms/catalog/" + action, { method: "POST", body: JSON.stringify({ item }) });
      // Clear the retry key after the RPC confirms success; refresh errors must not turn a committed write into a duplicate submission.
      lease?.clear();
      if (action === "course" && result.id) setSelectedCourseId(String(result.id));
      setNotice(message); await refresh(); return result;
    } catch (cause: any) { setError(cause?.message || "Perubahan LMS belum terkonfirmasi. Ulangi dengan data yang sama bila koneksi terputus."); return null; }
    finally { setBusy(false); }
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await catalogWrite("category", { ...category }, "Kategori LMS disimpan.");
    if (result) setCategory({ name: "", description: "" });
  };

  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    const instructorUserId = isAdmin ? course.instructorUserId : user?.uid || "";
    const item = { ...course, instructorUserId };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:course`, item);
    const result = await catalogWrite("course", { ...item, clientRequestId: lease.requestId }, "Kursus tersimpan di tenant Supabase.", lease);
    if (result) setCourse({ title: "", description: "", grade: "", categoryId: "", categoryName: "Umum", instructorUserId: "", status: "published", color: "indigo" });
  };

  const saveModule = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedCourse) return;
    const item = { courseId: selectedCourse.id, ...moduleDraft, displayOrder: selectedCourse.modules.length };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:module`, item);
    const result = await catalogWrite("module", { ...item, clientRequestId: lease.requestId }, "Modul pembelajaran ditambahkan.", lease);
    if (result) { setModuleDraft({ title: "", description: "" }); setMaterialDraft((old) => ({ ...old, moduleId: result.id })); }
  };

  const saveMaterial = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedCourse || !materialDraft.moduleId) return;
    const module = selectedCourse.modules.find((item) => item.id === materialDraft.moduleId);
    const item = { ...materialDraft, courseId: selectedCourse.id, displayOrder: module?.materials.length || 0, durationSeconds: null };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:material`, item);
    const result = await catalogWrite("material", { ...item, clientRequestId: lease.requestId }, "Materi tersimpan.", lease);
    if (result) setMaterialDraft((old) => ({ ...old, title: "", url: "", body: "" }));
  };

  const enrollStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await catalogWrite("enroll", { ...enrollment }, "Santri ditugaskan ke kursus.");
    if (result) setEnrollment((old) => ({ ...old, studentId: "" }));
  };

  const saveAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    const item = { ...assignmentDraft, dueAt: assignmentDraft.dueAt ? new Date(assignmentDraft.dueAt).toISOString() : null };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:assignment`, item);
    const result = await catalogWrite("assignment", { ...item, clientRequestId: lease.requestId }, "Tugas LMS diterbitkan.", lease);
    if (result) setAssignmentDraft((old) => ({ ...old, title: "", instructions: "", dueAt: "", moduleId: "" }));
  };

  const submitAssignment = async (assignmentId: string) => {
    const draft = submissionsDraft[assignmentId] || { responseText: "", resourceUrl: "" };
    const payload = { assignmentId, responseText: draft.responseText, resourceUrl: draft.resourceUrl };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:submission`, payload);
    setBusy(true); setError(""); setNotice("");
    try {
      await requestLms(`/api/lms/assignments/${encodeURIComponent(assignmentId)}/submissions`, {
        method: "POST", body: JSON.stringify({ responseText: draft.responseText, resourceUrl: draft.resourceUrl, requestId: lease.requestId }),
      });
      lease.clear();
      setNotice("Pengumpulan tugas tersimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Pengumpulan belum terkonfirmasi. Ulangi dengan jawaban yang sama jika koneksi terputus."); }
    finally { setBusy(false); }
  };

  const gradeSubmission = async (submission: Submission) => {
    const draft = gradeDraft[submission.id] || { score: submission.score == null ? "" : String(submission.score), feedback: submission.feedback || "" };
    const payload = { submissionId: submission.id, score: Number(draft.score), feedback: draft.feedback };
    const lease = await pendingMutationIds.acquire(`lms:${user?.tenantId || ""}:${user?.uid || ""}:grade`, payload);
    setBusy(true); setError(""); setNotice("");
    try {
      await requestLms(`/api/lms/submissions/${encodeURIComponent(submission.id)}/grade`, {
        method: "PATCH", body: JSON.stringify({ score: payload.score, feedback: payload.feedback, requestId: lease.requestId }),
      });
      lease.clear();
      setNotice("Nilai dan umpan balik tersimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Penilaian belum terkonfirmasi. Ulangi dengan data yang sama jika koneksi terputus."); }
    finally { setBusy(false); }
  };

  const markComplete = async (material: Material) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestLms("/api/lms/progress", { method: "POST", body: JSON.stringify({ materialId: material.id, positionSeconds: material.duration_seconds || 0, completed: true }) });
      setNotice("Kemajuan materi tersimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Kemajuan belum tersimpan."); }
    finally { setBusy(false); }
  };

  const addLearningRecord = async (kind: "note" | "comment", materialId: string) => {
    const text = (kind === "note" ? noteDraft : commentDraft)[materialId] || "";
    if (!text.trim()) return;
    const payload = { kind, materialId, timestampSeconds: 0, text: text.trim() };
    const lease = await pendingMutationIds.acquire(
      `lms:${user?.tenantId || ""}:${user?.uid || ""}:learning-record:${kind}`,
      payload,
    );
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestLms("/api/lms/learning-records", {
        method: "POST",
        body: JSON.stringify({ ...payload, requestId: lease.requestId }),
      });
      lease.clear();
      if (kind === "note") setNoteDraft((old) => ({ ...old, [materialId]: "" }));
      else setCommentDraft((old) => ({ ...old, [materialId]: "" }));
      setNotice(result?.alreadyApplied
        ? (kind === "note" ? "Catatan sudah tersimpan; percobaan ulang dikenali." : "Komentar sudah terkirim; percobaan ulang dikenali.")
        : (kind === "note" ? "Catatan pribadi tersimpan." : "Komentar materi terkirim."));
      await refresh();
    } catch (cause: any) {
      setError(cause?.message || "Catatan belum terkonfirmasi. Ulangi dengan isi yang sama jika koneksi terputus.");
    } finally { setBusy(false); }
  };

  const completedMaterialIds = useMemo(() => new Set(snapshot.progress.filter((item) => item.completedAt).map((item) => item.materialId)), [snapshot.progress]);
  const publishedAssignments = snapshot.assignments.filter((item) => item.status === "published");
  const ownSubmission = (assignmentId: string) => snapshot.submissions.find((item) => item.assignmentId === assignmentId);
  const classCourseOptions = isAdmin ? snapshot.courses : snapshot.courses.filter((item) => item.instructorUserId === user?.uid);

  if (!["Admin", "SuperAdmin", "Ustadz", "Santri"].includes(role || "")) return <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">LMS Supabase tersedia untuk Admin, Ustadz, dan Santri yang memiliki izin modul.</div>;

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" />Sumber data: Supabase tenant</div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pembelajaran Digital (LMS)</h1><p className="mt-1 text-sm text-slate-500">Kursus, materi, progres, tugas, dan penilaian terhubung ke roster tenant.</p></div><button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button></header>
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100"><strong>Cutover LMS bertahap.</strong> Modul memakai katalog, materi, enrollment, progres, pengumpulan, dan nilai backend. Peer review, sertifikat, dan statistik lama yang memakai identitas atau angka mock belum ditampilkan. Flag runtime tetap mati sampai migrasi dan uji akhir disetujui.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}{notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
    {isAdmin && LEGACY_LMS_IMPORT_ENABLED && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Migrasi katalog lama</h2><p className="mt-1 text-sm text-slate-500">Pratinjau membaca kategori, kursus, modul, materi, dan tugas pesantren dari arsip Firebase. Pengumpulan tugas contoh dengan angka agregat tidak diimpor.</p></div><button type="button" onClick={() => void previewLegacyImport()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"><RefreshCw className="h-4 w-4" />Buat pratinjau</button></div>{legacyImportPreview && <><div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">{[["Kategori", legacyImportPreview.counts.categories], ["Kursus", legacyImportPreview.counts.courses], ["Modul", legacyImportPreview.counts.modules], ["Materi", legacyImportPreview.counts.materials], ["Tugas", legacyImportPreview.counts.assignments], ["Sudah cocok", legacyImportPreview.counts.alreadyImported]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><span className="text-slate-500">{label}</span><strong className="ml-2 text-slate-900 dark:text-white">{value}</strong></div>)}</div>{legacyImportPreview.issueCount > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><p className="font-semibold">{legacyImportPreview.blockingCount} konflik memblokir impor</p><ul className="mt-2 space-y-1">{legacyImportPreview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.recordRef}-${index}`}>{issue.code} · referensi {issue.recordRef || "—"}</li>)}</ul></div>}<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Data sumber {legacyImportPreview.snapshotFingerprint.slice(0, 16)}… · {legacyImportPreview.counts.ready} data siap</span><button type="button" onClick={() => void applyLegacyImport()} disabled={busy || !legacyImportPreview.canApply} className={PRIMARY}><FilePlus2 className="h-4 w-4" />Terapkan impor</button></div></>}</section>}
    <div className="grid gap-3 sm:grid-cols-3">{[{ title: "Kursus", value: snapshot.courses.length, icon: BookOpen }, { title: "Santri di roster", value: isAdmin ? snapshot.students.length : snapshot.enrollments.length, icon: Users }, { title: "Tugas", value: snapshot.assignments.length, icon: ClipboardList }].map((item) => <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500">{item.title}<item.icon className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{item.value}</p></article>)}</div>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900" aria-label="Bagian LMS">{([{ id: "courses", label: "Kursus & Materi" }, { id: "assignments", label: "Tugas" }, { id: "submissions", label: "Pengumpulan & Nilai" }] as Array<{ id: Tab; label: string }>).map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); setError(""); setNotice(""); }} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === item.id ? "bg-indigo-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>{item.label}</button>)}</nav>
    {loading ? <div role="status" className="flex justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat LMS…</div> : <>
      {tab === "courses" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]">
        <section className="space-y-3">{snapshot.courses.length ? snapshot.courses.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><button type="button" onClick={() => { setSelectedCourseId(item.id); setMaterialDraft((old) => ({ ...old, moduleId: "" })); }} className="text-left"><h2 className="font-semibold text-slate-900 dark:text-white">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.category} · {item.grade || "Semua jenjang"} · {lmsStatusLabel(item.status)}</p></button><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{item.enrollmentCount} santri</span></div>{item.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>}{selectedCourseId === item.id && <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 dark:border-white/10">
          {item.modules.map((module) => <div key={module.id} className="rounded-xl bg-slate-50 p-4 dark:bg-white/5"><h3 className="font-medium text-slate-800 dark:text-slate-100">{module.display_order + 1}. {module.title}</h3>{module.description && <p className="mt-1 text-xs text-slate-500">{module.description}</p>}<div className="mt-3 space-y-3">{module.materials.map((material) => { const done = completedMaterialIds.has(material.id); const studentNoteList = snapshot.notes.filter((note) => note.materialId === material.id); const commentList = snapshot.comments.filter((comment) => comment.materialId === material.id); return <div key={material.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-medium text-slate-800 dark:text-slate-100">{material.title}</div><div className="text-xs text-slate-500">{lmsMaterialTypeLabel(material.material_type)}</div></div>{material.resource_url && <a href={material.resource_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 underline dark:text-indigo-300">Buka materi</a>}</div>{material.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{material.body}</p>}{role === "Santri" && <div className="mt-3 space-y-2"><button type="button" disabled={busy || done} onClick={() => void markComplete(material)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-400/20 dark:text-emerald-200"><CircleCheck className="h-3.5 w-3.5" />{done ? "Selesai" : "Tandai selesai"}</button><div className="grid gap-2 sm:grid-cols-2"><div><textarea rows={2} maxLength={3000} aria-label="Catatan pribadi" placeholder="Catatan pribadi" className={INPUT} value={noteDraft[material.id] || ""} onChange={(e) => setNoteDraft((old) => ({ ...old, [material.id]: e.target.value }))} /><button type="button" disabled={busy || !noteDraft[material.id]?.trim()} onClick={() => void addLearningRecord("note", material.id)} className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Simpan catatan</button>{studentNoteList.slice(0,2).map((note) => <p key={note.id} className="mt-1 text-xs text-slate-500">Catatan: {note.note}</p>)}</div><div><textarea rows={2} maxLength={3000} aria-label="Komentar materi" placeholder="Komentar untuk peserta kursus" className={INPUT} value={commentDraft[material.id] || ""} onChange={(e) => setCommentDraft((old) => ({ ...old, [material.id]: e.target.value }))} /><button type="button" disabled={busy || !commentDraft[material.id]?.trim()} onClick={() => void addLearningRecord("comment", material.id)} className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Kirim komentar</button>{commentList.slice(-2).map((comment) => <p key={comment.id} className="mt-1 text-xs text-slate-500">{comment.studentName}: {comment.comment}</p>)}</div></div></div>}</div>; })}</div></div>)}
          {!item.modules.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-white/10">Belum ada modul pembelajaran.</p>}
          {canManage && <div className="grid gap-4 lg:grid-cols-2"><form onSubmit={saveModule} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-white/10"><h3 className="text-sm font-semibold">Tambah modul</h3><input required maxLength={180} className={INPUT} placeholder="Nama modul" value={moduleDraft.title} onChange={(e) => setModuleDraft({ ...moduleDraft, title: e.target.value })} /><input maxLength={3000} className={INPUT} placeholder="Deskripsi" value={moduleDraft.description} onChange={(e) => setModuleDraft({ ...moduleDraft, description: e.target.value })} /><button disabled={busy} className={PRIMARY}><Plus className="h-4 w-4" />Tambah modul</button></form><form onSubmit={saveMaterial} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-white/10"><h3 className="text-sm font-semibold">Tambah materi</h3><select required className={INPUT} value={materialDraft.moduleId} onChange={(e) => setMaterialDraft({ ...materialDraft, moduleId: e.target.value })}><option value="">Pilih modul</option>{item.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><input required maxLength={180} className={INPUT} placeholder="Judul materi" value={materialDraft.title} onChange={(e) => setMaterialDraft({ ...materialDraft, title: e.target.value })} /><select className={INPUT} value={materialDraft.type} onChange={(e) => setMaterialDraft({ ...materialDraft, type: e.target.value })}><option value="video">Video</option><option value="pdf">PDF</option><option value="link">Tautan</option><option value="text">Teks</option></select>{materialDraft.type === "text" ? <textarea required rows={3} maxLength={12000} className={INPUT} placeholder="Isi materi" value={materialDraft.body} onChange={(e) => setMaterialDraft({ ...materialDraft, body: e.target.value })} /> : <input type="url" required pattern="https://.*" className={INPUT} placeholder="URL HTTPS materi" value={materialDraft.url} onChange={(e) => setMaterialDraft({ ...materialDraft, url: e.target.value })} />}<button disabled={busy || !item.modules.length} className={PRIMARY}><Plus className="h-4 w-4" />Simpan materi</button></form></div>}
        </div>}</article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Belum ada kursus yang diterbitkan atau ditugaskan untuk akun ini.</div>}</section>
        {canManage && <aside className="space-y-5">{isAdmin && <form onSubmit={saveCategory} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold">Kategori kursus</h2><label className={LABEL}>Nama<input required maxLength={100} className={INPUT} value={category.name} onChange={(e) => setCategory({ ...category, name: e.target.value })} /></label><label className={LABEL}>Deskripsi<input maxLength={1000} className={INPUT} value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })} /></label><button disabled={busy} className={PRIMARY}><Plus className="h-4 w-4" />Simpan kategori</button></form>}
          <form onSubmit={saveCourse} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold">Buat kursus</h2><label className={LABEL}>Judul<input required maxLength={180} className={INPUT} value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} /></label><label className={LABEL}>Kategori<select className={INPUT} value={course.categoryId} onChange={(e) => setCourse({ ...course, categoryId: e.target.value, categoryName: snapshot.categories.find((item) => item.id === e.target.value)?.name || "Umum" })}><option value="">Umum</option>{snapshot.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={LABEL}>Jenjang<input maxLength={80} className={INPUT} placeholder="Mis. SMP atau kelas 7" value={course.grade} onChange={(e) => setCourse({ ...course, grade: e.target.value })} /></label>{isAdmin && <label className={LABEL}>Pengajar<select required className={INPUT} value={course.instructorUserId} onChange={(e) => setCourse({ ...course, instructorUserId: e.target.value })}><option value="">Pilih pengajar</option>{snapshot.instructors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label className={LABEL}>Deskripsi<textarea rows={3} maxLength={5000} className={INPUT} value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} /></label><label className={LABEL}>Status<select className={INPUT} value={course.status} onChange={(e) => setCourse({ ...course, status: e.target.value })}><option value="draft">Draf</option><option value="published">Terbit</option></select></label><button disabled={busy || (isAdmin && !snapshot.instructors.length)} className={PRIMARY}><Plus className="h-4 w-4" />Simpan kursus</button></form>
          {isAdmin && <form onSubmit={enrollStudent} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold">Tugaskan santri ke kursus</h2><select required className={INPUT} value={enrollment.courseId} onChange={(e) => setEnrollment({ ...enrollment, courseId: e.target.value })}><option value="">Pilih kursus</option>{snapshot.courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select required className={INPUT} value={enrollment.studentId} onChange={(e) => setEnrollment({ ...enrollment, studentId: e.target.value })}><option value="">Pilih santri</option>{snapshot.students.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.className || item.grade}</option>)}</select><button disabled={busy || !snapshot.students.length} className={PRIMARY}><Users className="h-4 w-4" />Tugaskan</button></form>}
        </aside>}
      </div>}
      {tab === "assignments" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]"><section className="space-y-3">{publishedAssignments.length ? publishedAssignments.map((item) => { const submission = ownSubmission(item.id); const draft = submissionsDraft[item.id] || { responseText: submission?.responseText || "", resourceUrl: submission?.resourceUrl || "" }; return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{snapshot.courses.find((courseItem) => courseItem.id === item.courseId)?.title} · Batas nilai {item.maxScore}{item.dueAt ? ` · Tenggat ${new Date(item.dueAt).toLocaleString("id-ID")}` : ""}</p>{item.instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.instructions}</p>}{role === "Santri" && <div className="mt-4 space-y-3">{submission?.score != null ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">Nilai: <strong>{submission.score}</strong> / {item.maxScore}{submission.feedback && <p className="mt-1">{submission.feedback}</p>}</div> : <><textarea rows={4} maxLength={12000} className={INPUT} placeholder="Jawaban atau uraian tugas" value={draft.responseText} onChange={(e) => setSubmissionsDraft((old) => ({ ...old, [item.id]: { ...draft, responseText: e.target.value } }))} /><input type="url" pattern="https://.*" className={INPUT} placeholder="Tautan hasil (opsional, HTTPS)" value={draft.resourceUrl} onChange={(e) => setSubmissionsDraft((old) => ({ ...old, [item.id]: { ...draft, resourceUrl: e.target.value } }))} /><button type="button" disabled={busy || (!draft.responseText.trim() && !draft.resourceUrl.trim())} onClick={() => void submitAssignment(item.id)} className={PRIMARY}><FilePlus2 className="h-4 w-4" />{submission ? "Perbarui pengumpulan" : "Kumpulkan tugas"}</button></>}</div>}</article>; }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Belum ada tugas terbit untuk kursus yang tersedia.</div>}</section>{canManage && <form onSubmit={saveAssignment} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold">Terbitkan tugas</h2><label className={LABEL}>Kursus<select required className={INPUT} value={assignmentDraft.courseId} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, courseId: e.target.value, moduleId: "" })}><option value="">Pilih kursus</option>{classCourseOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className={LABEL}>Modul<select className={INPUT} value={assignmentDraft.moduleId} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, moduleId: e.target.value })}><option value="">Umum</option>{classCourseOptions.find((item) => item.id === assignmentDraft.courseId)?.modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className={LABEL}>Judul<input required maxLength={180} className={INPUT} value={assignmentDraft.title} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, title: e.target.value })} /></label><label className={LABEL}>Petunjuk<textarea rows={4} maxLength={12000} className={INPUT} value={assignmentDraft.instructions} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, instructions: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Tenggat<input type="datetime-local" className={INPUT} value={assignmentDraft.dueAt} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, dueAt: e.target.value })} /></label><label className={LABEL}>Nilai maksimal<input type="number" min="0" max="1000" step="any" className={INPUT} value={assignmentDraft.maxScore} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, maxScore: Number(e.target.value) })} /></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignmentDraft.allowLate} onChange={(e) => setAssignmentDraft({ ...assignmentDraft, allowLate: e.target.checked })} />Izinkan pengumpulan terlambat</label><button disabled={busy || !classCourseOptions.length} className={PRIMARY}><Plus className="h-4 w-4" />Terbitkan tugas</button></form>}</div>}
      {tab === "submissions" && <section className="space-y-3">{snapshot.submissions.length ? snapshot.submissions.map((item) => { const draft = gradeDraft[item.id] || { score: item.score == null ? "" : String(item.score), feedback: item.feedback || "" }; return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">{item.assignmentTitle}</h2><p className="mt-1 text-sm text-slate-500">{item.studentName} · dikumpulkan {new Date(item.submittedAt).toLocaleString("id-ID")}</p></div>{item.score != null && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200">Nilai {item.score}</span>}</div>{item.responseText && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{item.responseText}</p>}{item.resourceUrl && <a href={item.resourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-indigo-700 underline dark:text-indigo-300">Buka tautan pengumpulan</a>}{canManage && <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto]"><input type="number" min="0" max={snapshot.assignments.find((assignment) => assignment.id === item.assignmentId)?.maxScore || 100} step="any" className={INPUT + " mt-0"} placeholder="Nilai" value={draft.score} onChange={(e) => setGradeDraft((old) => ({ ...old, [item.id]: { ...draft, score: e.target.value } }))} /><input className={INPUT + " mt-0"} placeholder="Umpan balik" value={draft.feedback} onChange={(e) => setGradeDraft((old) => ({ ...old, [item.id]: { ...draft, feedback: e.target.value } }))} /><button type="button" disabled={busy || draft.score === ""} onClick={() => void gradeSubmission(item)} className={PRIMARY}><CheckCircle2 className="h-4 w-4" />Simpan nilai</button></div>}{role === "Santri" && item.feedback && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">Umpan balik: {item.feedback}</p>}</article>; }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Belum ada tugas yang dikumpulkan.</div>}</section>}
    </>}
  </main>;
}
