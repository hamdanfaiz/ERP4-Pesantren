import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, LoaderCircle, Plus, RotateCcw, X } from "lucide-react";
import { ERPEmptyState, ERPErrorState, ERPLoadingState, ERPNotice } from "../components/ERPDesignSystem";
import { useAuth } from "../contexts/AuthContext";
import { isRolePermissionAllowed } from "../rbac";
import { toERPUserMessage } from "../utils/userMessages";
import {
  listSupabaseBoardingPermits,
  migrateSupabaseBoardingPermits,
  requestSupabaseBoardingPermit,
  transitionSupabaseBoardingPermit,
  type BoardingPermit,
  type BoardingPermitStudent,
  type BoardingPermitsSnapshot,
  type BoardingPermitsImportReport,
} from "../services/boardingPermitsApi";

const PERMIT_TYPES = [
  { value: "Pulang", label: "Pulang" },
  { value: "Keluar Area", label: "Keluar Area" },
  { value: "Kegiatan Eksternal", label: "Kegiatan Eksternal" },
  { value: "Izin Walisantri (Parental Leave)", label: "Izin Wali Santri" },
];
const SUPABASE_BOARDING_PERMITS_IMPORT = legacyArchiveImportEnabled;

function localDateInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusStyle(status: string) {
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status.startsWith("Pending")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "Active") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Returned") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function permitStatusLabel(status: string) {
  return ({
    "Pending Musyrif": "Menunggu persetujuan Ustadz",
    "Pending Keamanan": "Menunggu persetujuan Keamanan",
    Approved: "Disetujui",
    Active: "Sedang di luar",
    Returned: "Sudah kembali",
    Rejected: "Ditolak",
  } as Record<string, string>)[status] || status;
}

export function SupabaseBoardingPermitsManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<BoardingPermitsSnapshot>({
    permits: [], students: [], canManage: false, canRequest: false, canFinalize: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<BoardingPermitsImportReport | null>(null);
  const createRequestId = useRef<string | null>(null);
  const statusRequestIds = useRef(new Map<string, string>());
  const today = useMemo(localDateInputValue, []);
  const [form, setForm] = useState({ studentId: "", type: PERMIT_TYPES[0].value, reason: "", startDate: today, endDate: today });

  const refresh = useCallback(async () => {
    setError("");
    const result = await listSupabaseBoardingPermits();
    setSnapshot(result);
    setListError("");
    setForm((current) => ({
      ...current,
      studentId: result.students.some((student) => student.id === current.studentId)
        ? current.studentId
        : result.students[0]?.id || "",
    }));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError("");
    listSupabaseBoardingPermits()
      .then((result) => {
        if (!active) return;
        setSnapshot(result);
        setForm((current) => ({ ...current, studentId: result.students[0]?.id || "" }));
      })
      .catch((loadError) => { if (active) setListError(toERPUserMessage(loadError, "Data izin belum dapat dimuat.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visiblePermits = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id-ID");
    if (!normalized) return snapshot.permits;
    return snapshot.permits.filter((permit) =>
      [permit.santriName, permit.nis, permit.room, permit.type, permit.reason, permit.status]
        .some((field) => field.toLocaleLowerCase("id-ID").includes(normalized)),
    );
  }, [query, snapshot.permits]);

  const submitPermit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving("new");
    setError("");
    setNotice("");
    try {
      await requestSupabaseBoardingPermit({
        clientRequestId: createRequestId.current || (createRequestId.current = crypto.randomUUID()),
        studentId: form.studentId,
        type: form.type,
        reason: form.reason,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      await refresh();
      setNotice("Permohonan izin berhasil dikirim dan menunggu persetujuan.");
      setIsFormOpen(false);
      createRequestId.current = null;
      setForm((current) => ({ ...current, reason: "", startDate: today, endDate: today }));
    } catch (submitError: any) {
      setError(toERPUserMessage(submitError, "Permohonan izin belum dapat disimpan."));
    } finally {
      setSaving("");
    }
  };

  const changeStatus = async (permit: BoardingPermit, status: string) => {
    setSaving(permit.id);
    setError("");
    setNotice("");
    try {
      const requestKey = permit.id + ":" + status;
      const requestId = statusRequestIds.current.get(requestKey) || crypto.randomUUID();
      statusRequestIds.current.set(requestKey, requestId);
      await transitionSupabaseBoardingPermit(permit.id, status, requestId);
      statusRequestIds.current.delete(requestKey);
      await refresh();
      setNotice(`Status izin ${permit.santriName} diperbarui menjadi ${permitStatusLabel(status)}.`);
    } catch (transitionError: any) {
      setError(toERPUserMessage(transitionError, "Status izin belum dapat diperbarui."));
      try { await refresh(); } catch { /* Keep the actionable mutation error visible. */ }
    } finally {
      setSaving("");
    }
  };

  const runLegacyImport = async (apply = false) => {
    setImportBusy(true);
    setError("");
    setNotice("");
    try {
      const report = await migrateSupabaseBoardingPermits(apply, importReport?.previewFingerprint);
      setImportReport(report);
      if (apply) {
        await refresh();
        setNotice(`Impor izin selesai: ${report.imported} baru, ${report.unchanged} sudah sama.`);
      }
    } catch (importError: any) {
      setError(toERPUserMessage(importError, "Data izin lama belum dapat diperiksa. Coba kembali."));
    } finally {
      setImportBusy(false);
    }
  };

  const pendingCount = snapshot.permits.filter((permit) => permit.status.startsWith("Pending")).length;
  const activeCount = snapshot.permits.filter((permit) => permit.status === "Active").length;
  const canManage = snapshot.canManage && isRolePermissionAllowed(role, "boarding.action.process-permit", user?.modulePermissions);
  const canRequest = snapshot.canRequest && isRolePermissionAllowed(role, "boarding.action.request-permit", user?.modulePermissions);
  const canFinalize = snapshot.canFinalize && isRolePermissionAllowed(role, "boarding.action.process-permit", user?.modulePermissions);
  const canReadPermitIdentifiers = isRolePermissionAllowed(role, "boarding.field.permit-identifiers", user?.modulePermissions);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <ClipboardList className="h-4 w-4" /> Asrama · Izin Santri
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Permohonan Izin</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Kelola permohonan izin santri dan tinjau persetujuannya.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(toERPUserMessage(e, "Data belum dapat dimuat."))).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5">
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
          </button>
          {canRequest && <button type="button" onClick={() => { setError(""); createRequestId.current = crypto.randomUUID(); setIsFormOpen(true); }} disabled={!snapshot.students.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Ajukan izin
          </button>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total permohonan</div><div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{snapshot.permits.length}</div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20"><div className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">Menunggu proses</div><div className="mt-2 text-2xl font-bold text-amber-900 dark:text-amber-200">{pendingCount}</div></div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-sky-800">Sedang di luar</div><div className="mt-2 text-2xl font-bold text-sky-900">{activeCount}</div></div>
      </div>

      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-400/20 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:border-rose-400/20 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}


      {SUPABASE_BOARDING_PERMITS_IMPORT && ["Admin", "SuperAdmin"].includes(role) && <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/20 dark:bg-indigo-950/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-indigo-950">Impor riwayat izin</h2><p className="mt-1 text-sm text-indigo-800 dark:text-indigo-200">Pratinjau mencocokkan data santri dan menampilkan catatan yang perlu ditinjau sebelum diterapkan.</p></div>
          <button type="button" onClick={() => void runLegacyImport(false)} disabled={importBusy} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 dark:bg-slate-900 dark:text-indigo-200">{importBusy ? "Memproses…" : "Pratinjau impor"}</button>
        </div>
        {importReport && <div className="mt-4 space-y-2 border-t border-indigo-200 pt-3 text-sm text-indigo-950 dark:border-indigo-400/20">
          <div>{importReport.sourceCount} sumber · {importReport.planned} siap · {importReport.alreadyImported} sudah sama · {importReport.issues.length} perlu ditinjau</div>
          {importReport.canApply && importReport.dryRun && <button type="button" onClick={() => void runLegacyImport(true)} disabled={importBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{importBusy ? "Mengimpor…" : "Terapkan data ini"}</button>}
          {importReport.issues.length > 0 && <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-rose-800 dark:text-rose-200">{importReport.issues.map((item, index) => <li key={`${item.sourceId}-${index}`}><span className="font-mono">{item.sourceId}:</span> {toERPUserMessage(item.reason, "Periksa data izin pada baris ini sebelum melanjutkan.")}</li>)}</ul>}
          {importReport.warnings.length > 0 && <ul className="max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-800 dark:text-amber-200">{importReport.warnings.map((item, index) => <li key={`${item.sourceId}-${index}`}><span className="font-mono">{item.sourceId}:</span> {toERPUserMessage(item.reason, "Tinjau catatan pada data ini sebelum melanjutkan.")}</li>)}</ul>}
        </div>}
      </section>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <div><h2 className="font-semibold text-slate-900 dark:text-slate-100">Daftar izin</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{canManage ? "Daftar ini memuat permohonan dari pesantren Anda." : "Hanya permohonan milik santri yang tertaut pada akun Anda."}</p></div>
          <input aria-label="Cari permohonan izin" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari santri, NIS, kamar…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-xs dark:border-white/15" />
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500 dark:text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat daftar izin…</div>
          : visiblePermits.length === 0 ? <div className="p-12 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-700 dark:text-slate-300">Belum ada permohonan izin</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Data akan muncul setelah permohonan dibuat melalui akun yang tertaut.</p></div>
            : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">Santri</th><th className="px-4 py-3 font-semibold">Jenis / alasan</th><th className="px-4 py-3 font-semibold">Periode</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Tindakan</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {visiblePermits.map((permit) => <tr key={permit.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-white/5">
                  <td className="px-4 py-4"><div className="font-semibold text-slate-900 dark:text-slate-100">{permit.santriName}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{canReadPermitIdentifiers && <>NIS {permit.nis || "—"} · </>}Kamar {permit.room}</div></td>
                  <td className="px-4 py-4"><div className="font-medium text-slate-800 dark:text-slate-200">{PERMIT_TYPES.find((type) => type.value === permit.type)?.label || permit.type}</div><div className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{permit.reason}</div></td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-700 dark:text-slate-300">{permit.startDate}<div className="mt-1 text-xs text-slate-500 dark:text-slate-400">s.d. {permit.endDate}</div></td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(permit.status)}`}>{permitStatusLabel(permit.status)}</span></td>
                  <td className="px-4 py-4 text-right">
                    {canManage && permit.status === "Pending Musyrif" && <div className="inline-flex gap-1"><button type="button" onClick={() => void changeStatus(permit, "Pending Keamanan")} disabled={saving === permit.id} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300" title="Teruskan ke keamanan">Teruskan <ArrowRight className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void changeStatus(permit, "Rejected")} disabled={saving === permit.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300">Tolak</button></div>}
                    {canManage && permit.status === "Pending Keamanan" && <div className="inline-flex gap-1"><button type="button" onClick={() => void changeStatus(permit, "Approved")} disabled={saving === permit.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300">Setujui</button><button type="button" onClick={() => void changeStatus(permit, "Rejected")} disabled={saving === permit.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300">Tolak</button></div>}
                    {canFinalize && permit.status === "Approved" && <button type="button" onClick={() => void changeStatus(permit, "Active")} disabled={saving === permit.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">Catat keluar</button>}
                    {canFinalize && permit.status === "Active" && <button type="button" onClick={() => void changeStatus(permit, "Returned")} disabled={saving === permit.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">Catat kembali</button>}
                    {saving === permit.id && <LoaderCircle className="ml-2 inline h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />}
                    {!canManage && <span className="text-xs text-slate-400 dark:text-slate-500">Menunggu petugas</span>}
                  </td>
                </tr>)}
              </tbody>
            </table></div>}
      </div>

      {isFormOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && saving !== "new") setIsFormOpen(false); }}>
        <form onSubmit={(event) => void submitPermit(event)} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" aria-label="Form permohonan izin">
          <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ajukan izin asrama</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Permohonan masuk ke alur persetujuan petugas.</p></div><button type="button" onClick={() => setIsFormOpen(false)} disabled={saving === "new"} aria-label="Tutup" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400"><X className="h-5 w-5" /></button></div>
          {(role === "Admin" || role === "SuperAdmin" || role === "Ustadz") && <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Santri<select required value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-white/15 dark:bg-slate-900"><option value="" disabled>Pilih santri</option>{snapshot.students.map((student: BoardingPermitStudent) => <option key={student.id} value={student.id}>{student.name} ({student.nis || "tanpa NIS"})</option>)}</select></label>}
          {!(role === "Admin" || role === "SuperAdmin" || role === "Ustadz") && <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">{snapshot.students[0]?.name || "Santri tertaut"}</div>}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Jenis izin<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-white/15 dark:bg-slate-900">{PERMIT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Alasan<textarea required maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows={3} className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 dark:border-white/15" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mulai<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/15" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sampai<input required type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/15" /></label></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" onClick={() => setIsFormOpen(false)} disabled={saving === "new"} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300">Batal</button><button type="submit" disabled={saving === "new" || !form.studentId || !form.reason.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving === "new" && <LoaderCircle className="h-4 w-4 animate-spin" />}Simpan permohonan</button></div>
        </form>
      </div>}
    </section>
  );
}

