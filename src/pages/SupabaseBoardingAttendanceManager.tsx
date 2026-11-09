import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Users } from "lucide-react";
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
        setNotice("Status kehadiran berhasil disimpan.");
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
    } catch (e: any) { setError(toERPUserMessage(e, "Data kehadiran lama belum dapat diperiksa. Coba kembali.")); }
    finally { setImportBusy(false); }
  };
  const canImport = IMPORT_ENABLED && ["Admin", "SuperAdmin"].includes(role);

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>
      <div className="flex items-center gap-2 text-sm font-semibold text-sky-700"><Users className="h-4 w-4" />Asrama · Kehadiran</div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--erp-text)]">Kehadiran Malam Santri</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--erp-text-muted)]">Setiap status masuk ke sesi bertanggal. Daftar santri dan lokasi kamar mengikuti data aktif pesantren.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-medium text-[var(--erp-text-muted)]">Tanggal<input aria-label="Tanggal kehadiran" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-text)]" /></label>
        <button type="button" onClick={() => { setLoading(true); setListError(""); void refresh(date).catch((e: any) => setListError(toERPUserMessage(e, "Data kehadiran belum dapat dimuat."))).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-sm font-medium text-[var(--erp-text)] hover:bg-[var(--erp-surface-subtle)] disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4"><div className="text-xs font-medium uppercase tracking-wide text-[var(--erp-text-muted)]">Total santri aktif</div><div className="mt-2 text-2xl font-bold text-[var(--erp-text)]">{snapshot.records.length}</div></div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-emerald-800">Hadir</div><div className="mt-2 text-2xl font-bold text-emerald-900">{present}</div></div>
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-rose-800">Tidak hadir</div><div className="mt-2 text-2xl font-bold text-rose-900">{absent}</div></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-amber-800">Belum ditandai</div><div className="mt-2 text-2xl font-bold text-amber-900">{unmarked}</div></div>
    </div>
    {role === "Ustadz" && <ERPNotice tone="info">Daftar santri mengikuti penugasan kamar atau gedung yang diberikan kepada Anda.</ERPNotice>}
    {notice && <ERPNotice tone="success">{notice}</ERPNotice>}
    {error && <ERPNotice tone="error">{error}</ERPNotice>}

    {canImport && <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-semibold text-indigo-950">Impor catatan kehadiran lama</h2><p className="mt-1 text-sm text-indigo-800">Catatan lama tidak menyertakan tanggal kehadiran. Tanggal di atas akan digunakan untuk impor. Periksa data yang belum cocok sebelum melanjutkan.</p></div>
      <button type="button" onClick={() => void runImport(false)} disabled={importBusy} className="rounded-lg border border-indigo-300 bg-[var(--erp-surface)] px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50">{importBusy ? "Memeriksa…" : "Tinjau data lama"}</button></div>
      {report && <div className="mt-4 space-y-2 border-t border-indigo-200 pt-3 text-sm text-indigo-950"><div>{report.attendanceDate} · {report.sourceCount} catatan arsip · {report.planned} siap diimpor · {report.alreadyImported} sudah tercatat · {report.issues.length} perlu diperiksa</div>
        {report.canApply && report.dryRun && <button type="button" onClick={() => void runImport(true)} disabled={importBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{importBusy ? "Mengimpor…" : "Impor catatan"}</button>}
        {report.issues.length > 0 && <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-rose-800">{report.issues.map((item, index) => <li key={`${item.sourceId}-${index}`}>{item.reason}</li>)}</ul>}
        {report.warnings.length > 0 && <ul className="max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-800">{report.warnings.map((item, index) => <li key={`${item.sourceId}-${index}`}>{item.reason}</li>)}</ul>}</div>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-sm"><div className="flex flex-col gap-3 border-b border-[var(--erp-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-semibold text-[var(--erp-text)]">Daftar kehadiran · {date}</h2><p className="mt-1 text-xs text-[var(--erp-text-muted)]">Klik status untuk menyimpan langsung; permintaan aman diulang bila jaringan terputus.</p></div>
      <input aria-label="Cari santri" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, NIS, kamar…" className="w-full rounded-lg border border-[var(--erp-border)] px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-xs" /></div>
      {loading ? <ERPLoadingState label="Memuat daftar santri…" className="p-12" />
        : listError ? <ERPErrorState title="Data kehadiran belum dapat dimuat" description={listError} action={<button type="button" onClick={() => { setLoading(true); setListError(""); void refresh(date).catch((e: any) => setListError(toERPUserMessage(e, "Data kehadiran belum dapat dimuat."))).finally(() => setLoading(false)); }} className="erp-button-secondary">Coba lagi</button>} className="p-12" />
          : visibleRecords.length === 0 ? <ERPEmptyState title={query ? "Santri tidak ditemukan" : "Belum ada data kehadiran"} description={query ? "Periksa kembali kata pencarian Anda." : "Data kehadiran akan muncul setelah santri aktif tersedia di Data Induk."} className="p-12" />
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--erp-surface-subtle)] text-xs uppercase tracking-wide text-[var(--erp-text-muted)]"><tr><th className="px-4 py-3 font-semibold">Santri</th><th className="px-4 py-3 font-semibold">Kamar</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Tandai</th></tr></thead><tbody className="divide-y divide-[var(--erp-border)]">{visibleRecords.map((record) => <tr key={record.studentId} className="hover:bg-[var(--erp-surface-subtle)]">
            <td className="px-4 py-4"><div className="font-semibold text-[var(--erp-text)]">{record.studentName}</div><div className="mt-1 text-xs text-[var(--erp-text-muted)]">NIS {record.nis || "—"}</div></td><td className="px-4 py-4 text-[var(--erp-text)]">{record.room}</td>
            <td className="px-4 py-4">{record.status ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${record.status === "Hadir" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{record.status === "Ghaib" ? "Tidak hadir" : "Hadir"}</span> : <span className="text-xs text-amber-700">Belum ditandai</span>}</td>
            <td className="px-4 py-4 text-right"><div className="inline-flex gap-1 rounded-lg bg-[var(--erp-surface-subtle)] p-1"><button type="button" aria-pressed={record.status === "Hadir"} onClick={() => void mark(record.studentId, "Hadir")} disabled={saving === record.studentId || record.status === "Hadir"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${record.status === "Hadir" ? "bg-emerald-600 text-white" : "text-[var(--erp-text-muted)] hover:bg-[var(--erp-surface)]"}`}>Hadir</button><button type="button" aria-pressed={record.status === "Ghaib"} onClick={() => void mark(record.studentId, "Ghaib")} disabled={saving === record.studentId || record.status === "Ghaib"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${record.status === "Ghaib" ? "bg-rose-600 text-white" : "text-[var(--erp-text-muted)] hover:bg-[var(--erp-surface)]"}`}>Tidak hadir</button></div>{saving === record.studentId && <LoaderCircle className="ml-2 inline h-4 w-4 animate-spin text-[var(--erp-text-muted)]" />}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </section>;
}
