import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, FileText, Loader2 } from "lucide-react";
import { getAccessToken } from "../authSession";

type ReportTerm = { id: string; name: string; startsOn: string; endsOn: string; status: string };
type ReportChoice = { id: string; name: string };
type ReportLine = { subject: string; assessmentType: string; category: string; score: number; remedialStatus: string };
type ReportStudent = {
  studentId: string;
  studentName: string;
  nis: string;
  classId: string;
  className: string;
  status: string;
  comment: string | null;
  lines: ReportLine[] | null;
  publishedAt: string | null;
};
type ReportWorkspace = {
  threshold: number;
  term: ReportTerm | null;
  homerooms: Array<{ classId: string; className: string; teacherUserId: string; teacherName: string }>;
  students: ReportStudent[];
  classes: ReportChoice[];
  teachers: ReportChoice[];
};

const fieldClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

async function reportRequest(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Rapor akademik belum dapat diproses.");
  return payload;
}

function statusLabel(status: string) {
  if (status === "draft") return "Draf";
  if (status === "validated") return "Menunggu pengesahan";
  if (status === "published") return "Terbit";
  return "Belum disusun";
}

function lineLabel(status: string) {
  return status === "Needed" ? "Perlu tindak lanjut" : status === "None" ? "Tuntas" : "Status belum tersedia";
}

export function SupabaseAcademicReportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [termName, setTermName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [threshold, setThreshold] = useState("75");
  const [classId, setClassId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await reportRequest("/api/academic/report-cards") as ReportWorkspace;
      setWorkspace(payload);
      setThreshold(String(payload.threshold ?? 75));
      if (payload.term) {
        setTermName(payload.term.name);
        setStartsOn(payload.term.startsOn);
        setEndsOn(payload.term.endsOn);
      }
      setComments(Object.fromEntries((payload.students || []).map((student) => [student.studentId, student.comment || ""])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rapor akademik belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (action: string, payload: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await reportRequest("/api/academic/report-cards", {
        method: "POST",
        body: JSON.stringify({ action, payload, clientRequestId: crypto.randomUUID() }),
      });
      setNotice("Perubahan rapor tersimpan.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Perubahan rapor belum tersimpan.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
    <div>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><FileText className="h-4 w-4 text-emerald-700" />E-Rapor semester</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">Satu semester terbuka menampung catatan wali kelas. Validasi mengunci susunan nilai saat itu. Penerbitan oleh Admin membekukan rapor. Nilai yang berubah sesudah validasi harus divalidasi ulang.</p>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}
    {loading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat rapor semester…</div> : workspace && <>
      {isAdmin && <div className="grid gap-4 lg:grid-cols-3">
        <form className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); void act("save_term", { name: termName.trim(), startsOn, endsOn }); }}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Semester terbuka</h3>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Nama<input required maxLength={80} className={fieldClass} value={termName} onChange={(event) => setTermName(event.target.value)} /></label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Mulai<input required type="date" className={fieldClass} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Selesai<input required type="date" className={fieldClass} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
          <button type="submit" disabled={saving} className={buttonClass}>Simpan semester</button>
          {workspace.term && <button type="button" disabled={saving} onClick={() => void act("close_term", { termId: workspace.term?.id })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">Tutup semester</button>}
        </form>
        <form className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); void act("save_threshold", { threshold: Number(threshold) }); }}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ambang KKTP</h3>
          <p className="text-xs leading-5 text-slate-500">Nilai di bawah ambang ditandai perlu tindak lanjut. Mengubah ambang membuka kembali rapor yang sudah divalidasi tetapi belum terbit.</p>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Ambang 0–100<input required type="number" min="0" max="100" step="0.01" className={fieldClass} value={threshold} onChange={(event) => setThreshold(event.target.value)} /></label>
          <button type="submit" disabled={saving} className={buttonClass}>Simpan ambang</button>
        </form>
        <form className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10" onSubmit={(event) => { event.preventDefault(); void act("assign_homeroom", { classId, teacherUserId }); }}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Wali kelas</h3>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Kelas<select required className={fieldClass} value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Pilih kelas</option>{workspace.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">Pengajar<select required className={fieldClass} value={teacherUserId} onChange={(event) => setTeacherUserId(event.target.value)}><option value="">Pilih pengajar</option>{workspace.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="submit" disabled={saving || !workspace.term} className={buttonClass}>Tetapkan wali kelas</button>
        </form>
      </div>}
      {!isAdmin && <p className="text-sm text-slate-500">Ambang KKTP semester ini {workspace.threshold}. Anda melihat kelas yang menunjuk Anda sebagai wali.</p>}
      {workspace.homerooms.length > 0 && <p className="text-xs text-slate-500">{workspace.homerooms.map((item) => `${item.className}: ${item.teacherName}`).join(" · ")}</p>}
      {workspace.students.length === 0 ? <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10">Belum ada santri pada kelas yang sudah memiliki wali untuk semester ini.</p> : <div className="space-y-3">{workspace.students.map((student) => <article key={student.studentId} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-medium text-slate-900 dark:text-white">{student.studentName}</h3><p className="mt-1 text-xs text-slate-500">{student.className}{student.nis ? ` · NIS ${student.nis}` : ""} · {statusLabel(student.status)}</p></div>
        </div>
        <label className="mt-3 block text-sm text-slate-600 dark:text-slate-300">Catatan wali kelas<textarea maxLength={2000} rows={3} className={fieldClass} value={comments[student.studentId] || ""} onChange={(event) => setComments((current) => ({ ...current, [student.studentId]: event.target.value }))} disabled={student.status === "validated" || student.status === "published"} /></label>
        <div className="mt-3 flex flex-wrap gap-2">
          {student.status !== "validated" && student.status !== "published" && <button type="button" disabled={saving} onClick={() => void act("save_comment", { studentId: student.studentId, comment: (comments[student.studentId] || "").trim() })} className={buttonClass}>Simpan catatan</button>}
          {student.status === "draft" && <button type="button" disabled={saving} onClick={() => void act("validate_card", { studentId: student.studentId })} className={buttonClass}>Validasi</button>}
          {student.status === "validated" && <button type="button" disabled={saving} onClick={() => void act("reopen_card", { studentId: student.studentId })} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">Buka kembali</button>}
          {isAdmin && student.status === "validated" && <button type="button" disabled={saving} onClick={() => void act("publish_card", { studentId: student.studentId })} className={buttonClass}>Terbitkan</button>}
        </div>
        {student.status === "published" && Array.isArray(student.lines) && <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">{student.lines.map((line, index) => <li key={`${line.subject}-${line.assessmentType}-${index}`}>{line.subject} · {line.assessmentType} · {line.score} · {lineLabel(line.remedialStatus)}</li>)}</ul>}
      </article>)}</div>}
    </>}
  </section>;
}
