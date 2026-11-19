import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw, Users } from "lucide-react";
import { ERPEmptyState, ERPErrorState, ERPLoadingState, ERPNotice } from "../components/ERPDesignSystem";
import { useAuth } from "../contexts/AuthContext";
import { toERPUserMessage } from "../utils/userMessages";
import {
  listSupabaseBoardingAttendance,
  migrateSupabaseBoardingAttendance,
  setSupabaseBoardingAttendanceStatus,
  type BoardingAttendanceImportReport,
  type BoardingAttendanceSnapshot,
} from "../services/boardingAttendanceApi";

const IMPORT_ENABLED = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_ATTENDANCE_IMPORT_ENABLED") === "true";
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SupabaseBoardingAttendanceManager() {
  const { role } = useAuth();
  const [date, setDate] = useState(localDate);
  const [snapshot, setSnapshot] = useState<BoardingAttendanceSnapshot>({ attendanceDate: localDate(), records: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState<BoardingAttendanceImportReport | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const refresh = useCallback(async (selectedDate = date) => {
    const result = await listSupabaseBoardingAttendance(selectedDate);
    setSnapshot(result);
    setListError("");
  }, [date]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setListError(""); setReport(null);
    listSupabaseBoardingAttendance(date).then((result) => { if (active) setSnapshot(result); })
      .catch((e: any) => { if (active) setListError(toERPUserMessage(e, "Data kehadiran belum dapat dimuat.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  const visibleRecords = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id-ID");
    if (!term) return snapshot.records;
    return snapshot.records.filter((record) => [record.studentName, record.nis, record.room].some((field) => field.toLocaleLowerCase("id-ID").includes(term)));
  }, [query, snapshot.records]);
  const present = snapshot.records.filter((record) => record.status === "Hadir").length;
  const absent = snapshot.records.filter((record) => record.status === "Ghaib").length;
  const unmarked = snapshot.records.length - present - absent;

  const mark = async (studentId: string, status: "Hadir" | "Ghaib") => {
    const requestKey = `${date}:${studentId}:${status}`;
    setSaving(studentId); setError(""); setNotice("");
    try {
      const clientRequestId = requestIds.current.get(requestKey) || crypto.randomUUID();
      requestIds.current.set(requestKey, clientRequestId);
      await setSupabaseBoardingAttendanceStatus({ clientRequestId, studentId, attendanceDate: date, status });
      try {
        await refresh(date);
        requestIds.current.delete(requestKey);
        setNotice("Status kehadiran berhasil diperbarui.");
      } catch { setError("Status sudah tersimpan, tetapi daftar kehadiran belum dapat dimuat ulang."); }
    } catch (e: any) { setError(toERPUserMessage(e, "Status kehadiran belum dapat disimpan.")); }
    finally { setSaving(""); }
  };

  const runImport = async (apply = false) => {
    setImportBusy(true); setError(""); setNotice("");
    try {
      const nextReport = await migrateSupabaseBoardingAttendance(date, apply, report?.previewFingerprint);
      setReport(nextReport);
      if (apply) { await refresh(date); setNotice(`Impor data kehadiran tanggal ${date}: ${nextReport.imported} data baru, ${nextReport.unchanged} data sudah sama.`); }
    } catch (e: any) { setError(toERPUserMessage(e, "Pratinjau impor kehadiran belum dapat diproses.")); }
    finally { setImportBusy(false); }
  };
  const canImport = IMPORT_ENABLED && ["Admin", "SuperAdmin"].includes(role);

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Users className="h-4 w-4" />Asrama · Kehadiran</div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Kehadiran Malam Santri</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Setiap status tercatat sesuai tanggal. Daftar santri dan lokasi kamar mengikuti data aktif pesantren.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-medium text-slate-600 dark:text-slate-300">Tanggal<input aria-label="Tanggal kehadiran" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-white/15 dark:bg-slate-900 dark:text-slate-200" /></label>
        <button type="button" onClick={() => { setLoading(true); setError(""); void refresh(date).catch((e: any) => setError(toERPUserMessage(e, "Data belum dapat dimuat."))).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total santri aktif</div><div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{snapshot.records.length}</div></div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/20"><div className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Hadir</div><div className="mt-2 text-2xl font-bold text-emerald-900">{present}</div></div>
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-400/20"><div className="text-xs font-medium uppercase tracking-wide text-rose-800 dark:text-rose-200">Ghaib</div><div className="mt-2 text-2xl font-bold text-rose-900">{absent}</div></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20"><div className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">Belum ditandai</div><div className="mt-2 text-2xl font-bold text-amber-900 dark:text-amber-200">{unmarked}</div></div>
    </div>
    {role === "Ustadz" && <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Daftar santri dan pencatatan kehadiran Anda dibatasi otomatis ke kamar atau gedung yang masih ditugaskan oleh Admin.</div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-400/20 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:border-rose-400/20 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

    {canImport && <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/20 dark:bg-indigo-950/30"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-semibold text-indigo-950">Impor catatan kehadiran lama</h2><p className="mt-1 text-sm text-indigo-800 dark:text-indigo-200">Pilih tanggal resmi untuk catatan lama. Pratinjau akan menandai data santri yang belum cocok atau memiliki konflik.</p></div>
      <button type="button" onClick={() => void runImport(false)} disabled={importBusy} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 dark:bg-slate-900 dark:text-indigo-200">{importBusy ? "Memproses…" : "Buat pratinjau impor"}</button></div>
      {report && <div className="mt-4 space-y-2 border-t border-indigo-200 pt-3 text-sm text-indigo-950 dark:border-indigo-400/20"><div>Tanggal {report.attendanceDate} · {report.sourceCount} sumber · {report.planned} siap · {report.alreadyImported} sudah sama · {report.issues.length} perlu rekonsiliasi</div>
        {report.canApply && report.dryRun && <button type="button" onClick={() => void runImport(true)} disabled={importBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{importBusy ? "Mengimpor…" : "Terapkan data ini"}</button>}
        {report.issues.length > 0 && <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-rose-800 dark:text-rose-200">{report.issues.map((item, index) => <li key={`${item.sourceId}-${index}`}><span className="font-mono">{item.sourceId}:</span> {item.reason}</li>)}</ul>}
        {report.warnings.length > 0 && <ul className="max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-800 dark:text-amber-200">{report.warnings.map((item, index) => <li key={`${item.sourceId}-${index}`}><span className="font-mono">{item.sourceId}:</span> {item.reason}</li>)}</ul>}</div>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
      <div><h2 className="font-semibold text-slate-900 dark:text-slate-100">Daftar kehadiran · {date}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Klik status untuk menyimpan. Perubahan akan dicoba kembali jika koneksi terputus.</p></div>
      <input aria-label="Cari santri" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, NIS, kamar…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-xs dark:border-white/15" /></div>
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500 dark:text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat daftar santri…</div>
        : visibleRecords.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-700 dark:text-slate-300">Tidak ada santri untuk ditampilkan</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Periksa data santri aktif di Master Data.</p></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">Santri</th><th className="px-4 py-3 font-semibold">Kamar</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Tandai</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{visibleRecords.map((record) => <tr key={record.studentId} className="hover:bg-slate-50/70 dark:hover:bg-white/5">
            <td className="px-4 py-4"><div className="font-semibold text-slate-900 dark:text-slate-100">{record.studentName}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">NIS {record.nis || "—"}</div></td><td className="px-4 py-4 text-slate-700 dark:text-slate-300">{record.room}</td>
            <td className="px-4 py-4">{record.status ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${record.status === "Hadir" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{record.status}</span> : <span className="text-xs text-amber-700 dark:text-amber-200">Belum ditandai</span>}</td>
            <td className="px-4 py-4 text-right"><div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"><button type="button" aria-pressed={record.status === "Hadir"} onClick={() => void mark(record.studentId, "Hadir")} disabled={saving === record.studentId || record.status === "Hadir"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${record.status === "Hadir" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-white"}`}>Hadir</button><button type="button" aria-pressed={record.status === "Ghaib"} onClick={() => void mark(record.studentId, "Ghaib")} disabled={saving === record.studentId || record.status === "Ghaib"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${record.status === "Ghaib" ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-white"}`}>Ghaib</button></div>{saving === record.studentId && <LoaderCircle className="ml-2 inline h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </section>;
}

