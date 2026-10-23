import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardCheck, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { DEFAULT_TENANT_TIME_ZONE, formatTenantDateTime, normalizeTenantTimeZone, tenantLocalDateTime, tenantLocalDateTimeToIso } from "../lib/tenantTimeZone";

type Kind = "talaqqi" | "exam";
type Student = { id: string; name: string; nis?: string; halaqahId?: string | null; halaqah?: string };
type Halaqah = { id: string; name: string; ustadzUserId?: string | null; ustadz?: string };
type Session = {
  id: string; kind: Kind; studentId: string; studentName: string; nis: string;
  halaqahId: string; halaqahName: string; teacherName: string; examType: string | null;
  juzStart: number | null; juzEnd: number | null; scheduledAt: string; durationMinutes: number;
  focus: string; status: "scheduled" | "completed" | "cancelled"; score: number | null;
  outcome: "pass" | "retest" | null; notes: string;
};

async function requestSessions(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Sesi Tahfidz belum dapat diproses.");
  return payload;
}

export function SupabaseTahfidzSessions({ kind, students, halaqahs, tenantTimeZone }: { kind: Kind; students: Student[]; halaqahs: Halaqah[]; tenantTimeZone?: string }) {
  const { role, user } = useAuth();
  const timeZone = normalizeTenantTimeZone(tenantTimeZone || user?.tenantTimeZone || DEFAULT_TENANT_TIME_ZONE);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [completeSession, setCompleteSession] = useState<Session | null>(null);
  const [form, setForm] = useState(() => ({ studentId: "", scheduledAt: tenantLocalDateTime(1, timeZone), durationMinutes: "30", focus: "", examType: "munaqasyah", juzStart: "1", juzEnd: "1" }));
  const [resultForm, setResultForm] = useState({ score: "", outcome: "pass", notes: "" });
  const requestIds = useRef(new Map<string, string>());
  const canManage = ["Admin", "SuperAdmin", "Ustadz"].includes(role);

  const requestIdFor = (signature: string) => {
    const existing = requestIds.current.get(signature);
    if (existing) return existing;
    const requestId = crypto.randomUUID();
    requestIds.current.set(signature, requestId);
    while (requestIds.current.size > 32) {
      const oldestSignature = requestIds.current.keys().next().value;
      if (oldestSignature === undefined) break;
      requestIds.current.delete(oldestSignature);
    }
    return requestId;
  };

  const releaseRequestId = (signature: string, requestId: string) => {
    if (requestIds.current.get(signature) === requestId) requestIds.current.delete(signature);
  };

  useEffect(() => {
    setCreateOpen(false);
    setCompleteSession(null);
    setForm({ studentId: "", scheduledAt: tenantLocalDateTime(1, timeZone), durationMinutes: "30", focus: "", examType: "munaqasyah", juzStart: "1", juzEnd: "1" });
    requestIds.current.clear();
  }, [user?.tenantId, user?.uid, timeZone]);

  const refresh = useCallback(async () => {
    const payload = await requestSessions(`/api/tahfidz/sessions?kind=${kind}`);
    setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
  }, [kind]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    requestSessions(`/api/tahfidz/sessions?kind=${kind}`)
      .then((payload) => { if (active) setSessions(Array.isArray(payload.sessions) ? payload.sessions : []); })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Jadwal Tahfidz belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, user?.tenantId, user?.uid]);

  const eligibleStudents = useMemo(() => students.filter((student) => {
    const halaqah = halaqahs.find((item) => item.id === student.halaqahId);
    return Boolean(halaqah?.ustadzUserId);
  }), [students, halaqahs]);

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const student = eligibleStudents.find((item) => item.id === form.studentId);
      const halaqah = student && halaqahs.find((item) => item.id === student.halaqahId);
      if (!student || !halaqah?.ustadzUserId) throw new Error("Pilih santri dengan penempatan halaqah aktif.");
      const focus = kind === "exam" ? (form.focus.trim() || `Ujian juz ${form.juzStart}–${form.juzEnd}`) : form.focus;
      const session = {
        kind, studentId: student.id, halaqahId: halaqah.id, teacherUserId: halaqah.ustadzUserId,
        scheduledAt: tenantLocalDateTimeToIso(form.scheduledAt, timeZone), durationMinutes: Number(form.durationMinutes), focus,
        examType: kind === "exam" ? form.examType : null,
        juzStart: kind === "exam" ? Number(form.juzStart) : null,
        juzEnd: kind === "exam" ? Number(form.juzEnd) : null,
      };
      const signature = JSON.stringify({ action: "create", tenantId: user?.tenantId || "", userId: user?.uid || "", ...session });
      const clientRequestId = requestIdFor(signature);
      await requestSessions("/api/tahfidz/sessions", {
        method: "POST",
        body: JSON.stringify({ session: { ...session, clientRequestId } }),
      });
      await refresh();
      releaseRequestId(signature, clientRequestId);
      setCreateOpen(false); setForm({ studentId: "", scheduledAt: tenantLocalDateTime(1, timeZone), durationMinutes: "30", focus: "", examType: "munaqasyah", juzStart: "1", juzEnd: "1" });
    } catch (saveError: any) { setError(saveError?.message || "Jadwal belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const mutateStatus = async (session: Session, status: "completed" | "cancelled", score: number | null = null, outcome: string | null = null, notes = "") => {
    setSaving(true); setError("");
    try {
      const command = { sessionId: session.id, kind, status, score, outcome, notes: notes.trim() };
      const signature = JSON.stringify({ tenantId: user?.tenantId || "", userId: user?.uid || "", ...command });
      const clientRequestId = requestIdFor(signature);
      await requestSessions("/api/tahfidz/sessions", {
        method: "POST",
        body: JSON.stringify({ session: { ...command, clientRequestId } }),
      });
      await refresh();
      releaseRequestId(signature, clientRequestId);
      setCompleteSession(null);
    } catch (saveError: any) { setError(saveError?.message || "Perubahan sesi belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const submitResult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completeSession) return;
    const score = Number(resultForm.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) { setError("Nilai ujian harus berada antara 0 sampai 100."); return; }
    await mutateStatus(completeSession, "completed", score, resultForm.outcome, resultForm.notes);
  };

  const title = kind === "talaqqi" ? "Jadwal Talaqqi" : "Jadwal Munaqasyah";
  const statusLabel = (session: Session) => session.status === "completed" ? "Selesai" : session.status === "cancelled" ? "Dibatalkan" : "Terjadwal";

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><CalendarClock className="h-5 w-5 text-emerald-600" />{title}</h2><p className="mt-1 text-sm text-slate-500">Jadwal dan hasil disimpan pada tenant Supabase, dengan validasi penempatan santri dan pengampu.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setLoading(true); setError(""); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} aria-label="Muat ulang jadwal" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
          {canManage && <button type="button" disabled={!eligibleStudents.length} onClick={() => { setError(""); setCreateOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Jadwalkan</button>}
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat jadwal tenant…</div>
        : sessions.length ? <div className="grid gap-3">{sessions.map((session) => <article key={session.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{session.studentName}</h3><span className="text-xs text-slate-500">{session.nis || "—"}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${session.status === "completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : session.status === "cancelled" ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>{statusLabel(session)}</span></div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatTenantDateTime(session.scheduledAt, timeZone)} ({timeZone}) · {session.durationMinutes} menit · {session.halaqahName}</p>
            <p className="mt-1 text-sm text-slate-500">{kind === "exam" ? `${session.examType === "tasmi" ? "Tasmi'" : "Munaqasyah"} juz ${session.juzStart}–${session.juzEnd}` : session.focus} · Pengampu: {session.teacherName}</p>
            {session.status === "completed" && kind === "exam" && <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">Nilai {session.score} · {session.outcome === "pass" ? "Lulus" : "Ujian ulang"}{session.notes ? ` · ${session.notes}` : ""}</p>}
            {session.status === "completed" && kind === "talaqqi" && session.notes && <p className="mt-1 text-sm text-slate-500">Catatan: {session.notes}</p>}
          </div>
          {canManage && session.status === "scheduled" && <div className="flex shrink-0 gap-2"><button type="button" disabled={saving} onClick={() => { setError(""); setCompleteSession(session); setResultForm({ score: "", outcome: "pass", notes: "" }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-950/30"><CheckCircle2 className="h-4 w-4" /> Selesaikan</button><button type="button" disabled={saving} onClick={() => { if (window.confirm("Batalkan jadwal ini?")) void mutateStatus(session, "cancelled"); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Batalkan</button></div>}
        </article>)}</div>
        : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-white/15"><ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada {kind === "talaqqi" ? "jadwal talaqqi" : "jadwal munaqasyah"}</p><p className="mt-1 text-sm text-slate-500">Tidak ada data contoh yang dimasukkan otomatis.</p></div>}

      {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitCreate} className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10"><div><h3 className="font-semibold text-slate-900 dark:text-white">{title} baru</h3><p className="mt-1 text-xs text-slate-500">Jadwal pengampu yang bertabrakan ditolak oleh transaksi di basis data.</p></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Santri dan halaqah<select required value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10"><option value="">Pilih santri…</option>{eligibleStudents.map((student) => { const h = halaqahs.find((item) => item.id === student.halaqahId); return <option key={student.id} value={student.id}>{student.name} · {student.nis || "tanpa NIS"} · {h?.name}</option>; })}</select></label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal dan waktu ({timeZone})<input required type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Durasi (menit)<input required type="number" min="15" max="240" step="15" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label>
          {kind === "exam" && <><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jenis ujian<select value={form.examType} onChange={(event) => setForm({ ...form, examType: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10"><option value="munaqasyah">Munaqasyah</option><option value="tasmi">Tasmi'</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Juz mulai<input required type="number" min="1" max="30" value={form.juzStart} onChange={(event) => setForm({ ...form, juzStart: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Juz akhir<input required type="number" min={form.juzStart} max="30" value={form.juzEnd} onChange={(event) => setForm({ ...form, juzEnd: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label></div></>}
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">{kind === "exam" ? "Fokus / catatan ujian (opsional)" : "Fokus talaqqi"}<textarea required={kind === "talaqqi"} maxLength={500} value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} placeholder={kind === "exam" ? `Ujian juz ${form.juzStart}–${form.juzEnd}` : "Contoh: makharijul huruf dan ghunnah"} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button type="submit" disabled={saving || !form.studentId} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Simpan jadwal"}</button></div>
      </form></div>}

      {completeSession && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitResult} className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10"><div><h3 className="font-semibold text-slate-900 dark:text-white">Selesaikan sesi</h3><p className="mt-1 text-xs text-slate-500">{completeSession.studentName} · {kind === "exam" ? "Ujian" : "Talaqqi"}</p></div><button type="button" onClick={() => setCompleteSession(null)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-4 p-5">{kind === "exam" && <><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nilai (0–100)<input required type="number" min="0" max="100" step="0.01" value={resultForm.score} onChange={(event) => setResultForm({ ...resultForm, score: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Keputusan<select value={resultForm.outcome} onChange={(event) => setResultForm({ ...resultForm, outcome: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10"><option value="pass">Lulus</option><option value="retest">Ujian ulang</option></select></label></>}
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Catatan (opsional)<textarea maxLength={2000} value={resultForm.notes} onChange={(event) => setResultForm({ ...resultForm, notes: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-white/10" /></label>
        </div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-white/10"><button type="button" onClick={() => setCompleteSession(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Tandai selesai"}</button></div>
      </form></div>}
    </section>
  );
}
