import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Play, RefreshCw, ShieldCheck, Send } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type AssignedExam = {
  assignmentId: string; id: string; title: string; subject: string; grade: string; startsAt: string; endsAt: string;
  durationMinutes: number; status: string; attemptId: string | null; attemptExpiresAt: string | null;
  score: number | null; passed: boolean | null; submittedAt: string | null;
};
type Question = { id: string; text: string; options: string[] };
type Attempt = {
  attemptId: string; examId: string; title: string; startsAt: string; expiresAt: string;
  expired: boolean; submitted: boolean; questions: Question[]; answers: Record<string, number>;
};

async function requestCbt(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Layanan ujian belum dapat diproses.");
  return result;
}

export function SupabaseCBTStudentDashboard() {
  const { role, user } = useAuth();
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submitLock = useRef(false);
  const restoreComplete = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await requestCbt("/api/cbt/student");
      setExams(Array.isArray(result.exams) ? result.exams : []);
    } catch (cause: any) { setExams([]); setError(cause?.message || "Daftar ujian belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const startExam = async (examId: string) => {
    setBusy(true); setError(""); setNotice(""); setConfirmSubmit(false); restoreComplete.current = false;
    try {
      const result = await requestCbt("/api/cbt/exams/" + encodeURIComponent(examId) + "/start", { method: "POST" });
      const nextAttempt = result as Attempt;
      setAttempt(nextAttempt);
      setAnswers(nextAttempt.answers || {});
      setCurrentIndex(0);
      setTimeLeft(Math.max(0, Math.ceil((Date.parse(nextAttempt.expiresAt) - Date.now()) / 1000)));
      restoreComplete.current = true;
      if (nextAttempt.expired) {
        await submitAttempt(nextAttempt.attemptId, nextAttempt.answers || {}, true);
      }
    } catch (cause: any) { setError(cause?.message || "Ujian tidak dapat dimulai."); }
    finally { setBusy(false); }
  };

  const submitAttempt = async (attemptId = attempt?.attemptId || "", finalAnswers = answers, automatic = false) => {
    if (!attemptId || submitLock.current) return;
    submitLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (Date.now() < Date.parse(attempt?.expiresAt || "")) {
        await requestCbt("/api/cbt/attempts/" + encodeURIComponent(attemptId) + "/answers", {
          method: "PUT", body: JSON.stringify({ answers: finalAnswers }),
        });
      }
      const result = await requestCbt("/api/cbt/attempts/" + encodeURIComponent(attemptId) + "/submit", { method: "POST" });
      setNotice((automatic ? "Waktu habis. Jawaban tersimpan dikumpulkan otomatis. " : "Ujian selesai. ")
        + "Nilai " + Number(result.score || 0) + " — " + (result.passed ? "Lulus." : "Belum lulus."));
      setAttempt(null); setAnswers({}); setConfirmSubmit(false);
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Jawaban belum dapat dikumpulkan."); }
    finally { setBusy(false); submitLock.current = false; }
  };

  useEffect(() => {
    if (!attempt || !restoreComplete.current || !attempt.attemptId || busy || Date.now() >= Date.parse(attempt.expiresAt)) return;
    const saveTimer = setTimeout(() => {
      void requestCbt("/api/cbt/attempts/" + encodeURIComponent(attempt.attemptId) + "/answers", {
        method: "PUT", body: JSON.stringify({ answers }),
      }).catch((cause: any) => setError(cause?.message || "Jawaban belum tersinkron."));
    }, 500);
    return () => clearTimeout(saveTimer);
  }, [answers, attempt?.attemptId, attempt?.expiresAt, busy]);

  useEffect(() => {
    if (!attempt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((Date.parse(attempt.expiresAt) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !submitLock.current) void submitAttempt(attempt.attemptId, answers, true);
    }, 1000);
    return () => clearInterval(timer);
  }, [attempt?.attemptId, attempt?.expiresAt, answers]);

  const currentQuestion = attempt?.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const formatTime = (value: number) => {
    const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60), seconds = value % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  };
  const canStart = (exam: AssignedExam) => {
    if (exam.status === "completed" || exam.submittedAt || exam.status === "missed") return false;
    if (exam.attemptId) return true;
    const now = Date.now();
    return exam.status === "assigned" && now >= Date.parse(exam.startsAt) && now < Date.parse(exam.endsAt);
  };

  if (role !== "Santri") return <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Portal pengerjaan ujian ini hanya tersedia untuk akun Santri yang tertaut ke roster tenant.</div>;

  if (attempt && currentQuestion) return <main className="fixed inset-0 z-50 flex flex-col bg-slate-50 font-sans dark:bg-slate-950">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:px-7">
      <div><div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{attempt.title}</div><h1 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Soal {currentIndex + 1} dari {attempt.questions.length}</h1></div>
      <div className={"flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-lg font-bold " + (timeLeft < 300 ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200" : "border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-200")}><Clock className="h-4 w-4" />{formatTime(timeLeft)}</div>
    </header>
    {error && <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</div>}
    <section className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="mb-5 flex items-center justify-between text-xs text-slate-500"><span>{answeredCount} jawaban tersimpan sementara</span><span>{attempt.questions.length} soal</span></div>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-8">
        <div className="whitespace-pre-wrap text-base leading-7 text-slate-900 dark:text-white">{currentQuestion.text}</div>
        <div className="mt-6 space-y-3">{currentQuestion.options.map((option, index) => <label key={index} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition " + (answers[currentQuestion.id] === index ? "border-indigo-500 bg-indigo-50 text-indigo-950 dark:bg-indigo-400/10 dark:text-indigo-100" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5")}><input type="radio" name={currentQuestion.id} checked={answers[currentQuestion.id] === index} onChange={() => setAnswers((current) => ({ ...current, [currentQuestion.id]: index }))} />{option}</label>)}</div>
      </article>
    </section>
    <footer className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40 dark:border-white/10 dark:text-slate-200"><ChevronLeft className="h-4 w-4" />Sebelumnya</button>
        <div className="flex flex-wrap gap-2">{attempt.questions.map((question, index) => <button key={question.id} type="button" onClick={() => setCurrentIndex(index)} aria-label={"Buka soal " + (index + 1)} className={"h-8 w-8 rounded-lg text-xs font-bold " + (currentIndex === index ? "bg-indigo-700 text-white" : answers[question.id] !== undefined ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300")}>{index + 1}</button>)}</div>
        {currentIndex + 1 < attempt.questions.length ? <button type="button" onClick={() => setCurrentIndex((index) => Math.min(attempt.questions.length - 1, index + 1))} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white"><span>Berikutnya</span><ChevronRight className="h-4 w-4" /></button> : confirmSubmit ? <div className="flex gap-2"><button type="button" onClick={() => setConfirmSubmit(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:text-slate-200">Batal</button><button type="button" onClick={() => void submitAttempt()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />Kumpulkan</button></div> : <button type="button" onClick={() => setConfirmSubmit(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Send className="h-4 w-4" />Selesai</button>}
      </div>
    </footer>
  </main>;

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
    <header><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" />Sumber data: Supabase tenant</div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ujian Saya</h1><p className="mt-1 text-sm text-slate-500">Jadwal dan jawaban ujian terhubung dengan akun santri Anda.</p></header>
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Hanya ujian yang ditugaskan pada akun santri ini yang ditampilkan. Kunci jawaban tidak dikirim ke browser; pemeriksaan dilakukan backend saat ujian dikumpulkan.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {loading ? <div role="status" className="flex justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat jadwal ujian…</div> : exams.length ? <div className="grid gap-4 sm:grid-cols-2">{exams.map((exam) => {
      const now = Date.now(), start = Date.parse(exam.startsAt), end = Date.parse(exam.endsAt);
      const isSubmitted = Boolean(exam.submittedAt);
      const available = canStart(exam);
      const statusText = isSubmitted ? "Selesai" : exam.status === "in_progress" ? "Sedang dikerjakan" : exam.status === "completed" ? "Selesai" : now < start ? "Terjadwal" : now >= end ? "Jendela berakhir" : "Tersedia";
      return <article key={exam.assignmentId} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">{exam.title}</h2><p className="mt-1 text-sm text-slate-500">{exam.subject} · {exam.grade}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{statusText}</span></div>
        <div className="mt-4 space-y-1 text-xs text-slate-500"><p>Mulai: {new Date(exam.startsAt).toLocaleString("id-ID")}</p><p>Batas sesi: {new Date(exam.endsAt).toLocaleString("id-ID")}</p><p>Durasi: {exam.durationMinutes} menit</p></div>
        {isSubmitted && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">Nilai: <strong>{exam.score}</strong> · {exam.passed ? "Lulus" : "Belum lulus"}</div>}
        <button type="button" onClick={() => void startExam(exam.id)} disabled={busy || !available} className={"mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 " + (available ? "bg-indigo-700 text-white hover:bg-indigo-800" : "border border-slate-200 text-slate-500 dark:border-white/10")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{exam.attemptId ? "Lanjutkan / kumpulkan" : "Mulai ujian"}</button>
      </article>;
    })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><RefreshCw className="mx-auto mb-3 h-5 w-5 opacity-50" />Belum ada ujian yang ditugaskan untuk akun ini.</div>}
  </main>;
}
