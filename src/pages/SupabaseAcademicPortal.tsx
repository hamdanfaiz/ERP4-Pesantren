import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type StudentOption = { id: string; name: string; nis: string; className: string };
type Assessment = {
  id: string;
  subject: string;
  assessmentType: string;
  category: string;
  score: number;
  remedialStatus: string;
  className: string;
  updatedAt: string;
};

async function loadPortalPage(studentId?: string, cursor?: string) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const params = new URLSearchParams();
  if (studentId) params.set("studentId", studentId);
  if (cursor) params.set("cursor", cursor);
  const encodedParams = params.toString();
  const query = encodedParams ? `?${encodedParams}` : "";
  const response = await fetch(`/api/academic/portal${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Riwayat akademik belum dapat dimuat.");
  return payload;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date)
    : "Tanggal belum tersedia";
}

export function SupabaseAcademicPortal() {
  const { role, user } = useAuth();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState(user?.linkedSantriId || "");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const isGuardian = role === "Walisantri";

  const fetchPage = useCallback(async (studentId?: string, cursor?: string, append = false) => {
    const sequence = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const payload = await loadPortalPage(studentId, cursor);
      if (sequence !== requestSequence.current) return;
      const nextStudents = Array.isArray(payload.students) ? payload.students as StudentOption[] : [];
      setStudents(nextStudents);
      if (payload.selectedStudentId && payload.selectedStudentId !== selectedStudentId) {
        setSelectedStudentId(String(payload.selectedStudentId));
      }
      const page = Array.isArray(payload.assessments) ? payload.assessments as Assessment[] : [];
      setAssessments((current) => append ? [...current, ...page] : page);
      setHasMore(Boolean(payload.hasMore));
      setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Riwayat akademik belum dapat dimuat.");
      if (!append) {
        setStudents([]);
        setAssessments([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [selectedStudentId]);

  useEffect(() => {
    void fetchPage(user?.linkedSantriId || undefined);
  // The initial request resolves the Wali's default child on the server.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, user?.linkedSantriId]);

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    void fetchPage(id || undefined);
  };

  const retry = () => void fetchPage(selectedStudentId || user?.linkedSantriId || undefined);

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" />Data tenant terverifikasi</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Akademik</h1>
        <p className="mt-1 text-sm text-slate-500">Riwayat penilaian {isGuardian ? "santri yang tertaut ke akun Wali" : "milik Anda"}.</p>
      </div>
      <button type="button" onClick={retry} disabled={loading || loadingMore} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
    </header>

    {isGuardian && <section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <label htmlFor="academic-portal-student" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Pilih santri</label>
      <select id="academic-portal-student" value={selectedStudentId} onChange={(event) => selectStudent(event.target.value)} disabled={loading || students.length === 0} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
        {!selectedStudentId && <option value="">Pilih santri tertaut</option>}
        {students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.nis ? ` · NIS ${student.nis}` : ""}</option>)}
      </select>
    </section>}

    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Daftar ini menampilkan catatan penilaian yang telah dimasukkan pengajar. Nilai ini bukan rapor resmi atau nilai rata-rata akhir; hubungi pengajar untuk klarifikasi.</div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10"><BookOpen className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold text-slate-900 dark:text-white">Riwayat penilaian</h2></div>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data tenant…</div>
        : assessments.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">{students.length === 0 ? "Belum ada data santri aktif yang tertaut ke akun ini." : "Belum ada catatan penilaian untuk santri ini."}</div>
          : <div className="divide-y divide-slate-100 dark:divide-white/5">{assessments.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
            <div className="min-w-0"><h3 className="font-semibold text-slate-900 dark:text-white">{item.subject}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.assessmentType} · {item.category}{item.className ? ` · ${item.className}` : ""}</p><p className="mt-1 text-xs text-slate-500">Diperbarui {formatDate(item.updatedAt)}</p></div>
            <div className="flex items-center gap-2"><span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${item.score < 75 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"}`}>Nilai {item.score}</span><span className="text-xs text-slate-500">{item.remedialStatus}</span></div>
          </article>)}</div>}
      {hasMore && !loading && <div className="border-t border-slate-100 p-4 text-center dark:border-white/5"><button type="button" onClick={() => nextCursor && void fetchPage(selectedStudentId || user?.linkedSantriId || undefined, nextCursor, true)} disabled={loadingMore || !nextCursor} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}{loadingMore ? "Memuat…" : "Muat penilaian sebelumnya"}</button></div>}
    </section>
  </main>;
}
