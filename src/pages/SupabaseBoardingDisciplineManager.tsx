import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { ERPEmptyState, ERPErrorState, ERPLoadingState, ERPNotice } from "../components/ERPDesignSystem";
import { useAuth } from "../contexts/AuthContext";
import { toERPUserMessage } from "../utils/userMessages";
import {
  createSupabaseBoardingDiscipline,
  listSupabaseBoardingDiscipline,
  migrateSupabaseBoardingDiscipline,
  resolveSupabaseBoardingDiscipline,
  type BoardingDisciplineImportReport,
  type BoardingDisciplineSnapshot,
} from "../services/boardingDisciplineApi";

const IMPORT_ENABLED = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_DISCIPLINE_IMPORT_ENABLED") === "true";
const CATEGORY_OPTIONS = ["Ringan", "Sedang", "Berat"];
const today = () => new Date().toISOString().slice(0, 10);

export function SupabaseBoardingDisciplineManager() {
  const { role } = useAuth();
  const [snapshot, setSnapshot] = useState<BoardingDisciplineSnapshot>({ incidents: [], students: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [importReport, setImportReport] = useState<BoardingDisciplineImportReport | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const createRequestId = useRef<string | null>(null);
  const [form, setForm] = useState({ studentId: "", offense: "", category: CATEGORY_OPTIONS[0], points: 1, incidentDate: today(), photoUrl: "", resolution: "" });

  const refresh = useCallback(async () => {
    const result = await listSupabaseBoardingDiscipline();
    setSnapshot(result);
    setListError("");
    setForm((current) => ({ ...current, studentId: result.students.some((student) => student.id === current.studentId) ? current.studentId : result.students[0]?.id || "" }));
  }, []);

  useEffect(() => {
    let active = true;
    setListError("");
    listSupabaseBoardingDiscipline().then((result) => {
      if (!active) return;
      setSnapshot(result);
      setForm((current) => ({ ...current, studentId: result.students[0]?.id || "" }));
    }).catch((e: any) => { if (active) setListError(toERPUserMessage(e, "Data kedisiplinan belum dapat dimuat.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleIncidents = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id-ID");
    if (!term) return snapshot.incidents;
    return snapshot.incidents.filter((incident) => [incident.santriName, incident.nis, incident.room, incident.offense, incident.category]
      .some((field) => field.toLocaleLowerCase("id-ID").includes(term)));
  }, [query, snapshot.incidents]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving("new"); setError(""); setNotice("");
    try {
      await createSupabaseBoardingDiscipline({
        clientRequestId: createRequestId.current || (createRequestId.current = crypto.randomUUID()), studentId: form.studentId, offense: form.offense,
        category: form.category, points: Number(form.points), incidentDate: form.incidentDate,
        photoUrl: form.photoUrl || null, resolution: form.resolution || null,
      });
      createRequestId.current = null;
      setOpenForm(false);
      setForm((current) => ({ ...current, offense: "", points: 1, incidentDate: today(), photoUrl: "", resolution: "" }));
      setNotice("Catatan kedisiplinan berhasil disimpan.");
      try { await refresh(); } catch { setError("Catatan sudah tersimpan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(toERPUserMessage(e, "Catatan pelanggaran belum dapat disimpan.")); }
    finally { setSaving(""); }
  };

  const resolve = async (incidentId: string) => {
    setSaving(incidentId); setError(""); setNotice("");
    try {
      const id = requestIds.current.get(incidentId) || crypto.randomUUID();
      requestIds.current.set(incidentId, id);
      await resolveSupabaseBoardingDiscipline(incidentId, id);
      requestIds.current.delete(incidentId);
      await refresh();
      setNotice("Catatan pelanggaran berhasil diselesaikan.");
    } catch (e: any) { setError(toERPUserMessage(e, "Tindak lanjut belum dapat disimpan.")); }
    finally { setSaving(""); }
  };

  const runImport = async (apply = false) => {
    setImportBusy(true); setError(""); setNotice("");
    try {
      const report = await migrateSupabaseBoardingDiscipline(apply, importReport?.previewFingerprint);
      setImportReport(report);
      if (apply) { await refresh(); setNotice(`Impor histori kedisiplinan selesai: ${report.imported} baru, ${report.unchanged} sudah sama.`); }
    } catch (e: any) { setError(toERPUserMessage(e, "Data kedisiplinan lama belum dapat diperiksa. Coba kembali.")); }
    finally { setImportBusy(false); }
  };

  const pendingCount = snapshot.incidents.filter((incident) => !incident.resolved).length;
  const pointsTotal = snapshot.incidents.reduce((sum, incident) => sum + incident.points, 0);
  const canImport = IMPORT_ENABLED && ["Admin", "SuperAdmin"].includes(role);

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-amber-700"><ShieldAlert className="h-4 w-4" />Asrama · Kedisiplinan</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--erp-text)]">Catatan Kedisiplinan</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--erp-text-muted)]">Catatan pelanggaran terhubung dengan data santri dan riwayat tindak lanjutnya.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setLoading(true); setListError(""); void refresh().catch((e: any) => setListError(toERPUserMessage(e, "Data kedisiplinan belum dapat dimuat."))).finally(() => setLoading(false)); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-sm font-medium text-[var(--erp-text)] hover:bg-[var(--erp-surface-subtle)] disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
        {snapshot.canManage && <button type="button" onClick={() => { setError(""); createRequestId.current = crypto.randomUUID(); setOpenForm(true); }} disabled={!snapshot.students.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Catat pelanggaran</button>}
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4"><div className="text-xs font-medium uppercase tracking-wide text-[var(--erp-text-muted)]">Total catatan</div><div className="mt-2 text-2xl font-bold text-[var(--erp-text)]">{snapshot.incidents.length}</div></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-amber-800">Belum selesai</div><div className="mt-2 text-2xl font-bold text-amber-900">{pendingCount}</div></div>
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4"><div className="text-xs font-medium uppercase tracking-wide text-rose-800">Akumulasi poin</div><div className="mt-2 text-2xl font-bold text-rose-900">{pointsTotal}</div></div>
    </div>
    {role === "Ustadz" && <ERPNotice tone="info">Daftar santri mengikuti penugasan kamar atau gedung yang diberikan kepada Anda.</ERPNotice>}

    {notice && <ERPNotice tone="success">{notice}</ERPNotice>}
    {error && <ERPNotice tone="error">{error}</ERPNotice>}
    <div role="note" className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-subtle)] px-4 py-3 text-sm text-[var(--erp-text)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><span className="font-semibold">Cakupan layar:</span> Catat pelanggaran dan tindak lanjutnya. Kelola kehadiran, penugasan petugas, dan fasilitas melalui bagian Asrama yang sesuai.</div>

    {canImport && <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-indigo-950">Impor riwayat kedisiplinan</h2><p className="mt-1 text-sm text-indigo-800">Periksa hasil pratinjau dan selesaikan setiap data yang belum cocok sebelum menerapkan impor.</p></div>
        <button type="button" onClick={() => void runImport(false)} disabled={importBusy} className="rounded-lg border border-indigo-300 bg-[var(--erp-surface)] px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50">{importBusy ? "Memeriksa…" : "Tinjau data lama"}</button></div>
      {importReport && <div className="mt-4 space-y-2 border-t border-indigo-200 pt-3 text-sm text-indigo-950"><div>{importReport.sourceCount} catatan arsip · {importReport.planned} siap diimpor · {importReport.alreadyImported} sudah tercatat · {importReport.issues.length} perlu diperiksa</div>
        {importReport.canApply && importReport.dryRun && <button type="button" onClick={() => void runImport(true)} disabled={importBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{importBusy ? "Mengimpor…" : "Impor catatan"}</button>}
        {importReport.issues.length > 0 && <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-rose-800">{importReport.issues.map((item, index) => <li key={`${item.sourceId}-${index}`}>{item.reason}</li>)}</ul>}
        {importReport.warnings.length > 0 && <ul className="max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-800">{importReport.warnings.map((item, index) => <li key={`${item.sourceId}-${index}`}>{item.reason}</li>)}</ul>}</div>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--erp-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-[var(--erp-text)]">Riwayat pelanggaran</h2><p className="mt-1 text-xs text-[var(--erp-text-muted)]">Data dan filter dibatasi ke pesantren ini.</p></div><input aria-label="Cari catatan kedisiplinan" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari santri, NIS, kamar, pelanggaran…" className="w-full rounded-lg border border-[var(--erp-border)] px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-xs" /></div>
      {loading ? <ERPLoadingState label="Memuat catatan kedisiplinan…" className="p-12" />
        : listError ? <ERPErrorState title="Catatan kedisiplinan belum dapat dimuat" description={listError} action={<button type="button" onClick={() => { setLoading(true); setListError(""); void refresh().catch((e: any) => setListError(toERPUserMessage(e, "Data kedisiplinan belum dapat dimuat."))).finally(() => setLoading(false)); }} className="erp-button-secondary">Coba lagi</button>} className="p-12" />
          : visibleIncidents.length === 0 ? <ERPEmptyState title={query ? "Catatan tidak ditemukan" : "Belum ada catatan pelanggaran"} description={query ? "Periksa kembali kata pencarian Anda." : "Catatan pelanggaran akan muncul setelah disimpan."} className="p-12" />
          : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--erp-surface-subtle)] text-xs uppercase tracking-wide text-[var(--erp-text-muted)]"><tr><th className="px-4 py-3 font-semibold">Santri</th><th className="px-4 py-3 font-semibold">Pelanggaran</th><th className="px-4 py-3 font-semibold">Poin</th><th className="px-4 py-3 font-semibold">Tanggal</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Tindakan</th></tr></thead><tbody className="divide-y divide-[var(--erp-border)]">{visibleIncidents.map((incident) => <tr key={incident.id} className="align-top hover:bg-[var(--erp-surface-subtle)]">
            <td className="px-4 py-4"><div className="font-semibold text-[var(--erp-text)]">{incident.santriName}</div><div className="mt-1 text-xs text-[var(--erp-text-muted)]">NIS {incident.nis || "—"} · Kamar {incident.room || "—"}</div></td>
            <td className="px-4 py-4"><div className="font-medium text-[var(--erp-text)]">{incident.offense}</div><div className="mt-1 text-xs text-[var(--erp-text-muted)]">{incident.category}{incident.resolution ? ` · Tindak lanjut: ${incident.resolution}` : ""}</div>{incident.photoUrl && <a className="mt-1 inline-block text-xs font-medium text-indigo-700 underline" href={incident.photoUrl} target="_blank" rel="noreferrer">Lihat bukti</a>}</td>
            <td className="px-4 py-4 font-mono text-rose-700">+{incident.points}</td><td className="whitespace-nowrap px-4 py-4 text-[var(--erp-text)]">{incident.date}</td>
            <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${incident.resolved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{incident.resolved ? "Selesai" : "Aktif"}</span></td>
            <td className="px-4 py-4 text-right">{!incident.resolved ? <button type="button" onClick={() => void resolve(incident.id)} disabled={saving === incident.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{saving === incident.id ? "Menyimpan…" : "Tandai selesai"}</button> : <span className="text-xs text-[var(--erp-text-muted)]">Sudah selesai</span>}</td>
          </tr>)}</tbody></table></div>}
    </section>

    {openForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && saving !== "new") setOpenForm(false); }}>
      <form onSubmit={(event) => void submit(event)} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-[var(--erp-surface)] p-5 shadow-xl" aria-labelledby="discipline-form-title">
        <div><h2 id="discipline-form-title" className="text-lg font-bold text-[var(--erp-text)]">Catat pelanggaran santri</h2><p className="mt-1 text-sm text-[var(--erp-text-muted)]">Sistem akan mengambil kamar dari data santri yang terdaftar.</p></div>
        <label className="block text-sm font-medium text-[var(--erp-text)]">Santri<select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2">{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name} {student.nis ? `· ${student.nis}` : ""}</option>)}</select></label>
        <label className="block text-sm font-medium text-[var(--erp-text)]">Pelanggaran<textarea required maxLength={1000} value={form.offense} onChange={(e) => setForm({ ...form, offense: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2" /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm font-medium text-[var(--erp-text)]">Kategori<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2">{CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label className="block text-sm font-medium text-[var(--erp-text)]">Poin<input required type="number" min={1} max={1000} value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2" /></label>
          <label className="block text-sm font-medium text-[var(--erp-text)]">Tanggal<input required type="date" value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2" /></label></div>
        <label className="block text-sm font-medium text-[var(--erp-text)]">URL bukti HTTPS (opsional)<input type="url" pattern="https://.*" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2" placeholder="https://…" /></label>
        <label className="block text-sm font-medium text-[var(--erp-text)]">Rencana tindak lanjut (opsional)<textarea maxLength={2000} value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} className="mt-1 min-h-16 w-full rounded-lg border border-[var(--erp-border)] px-3 py-2" /></label>
        <div className="flex justify-end gap-2 border-t border-[var(--erp-border)] pt-3"><button type="button" onClick={() => setOpenForm(false)} disabled={saving === "new"} className="rounded-lg border border-[var(--erp-border)] px-4 py-2 text-sm font-medium text-[var(--erp-text)]">Batal</button><button type="submit" disabled={saving === "new" || !snapshot.students.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving === "new" ? "Menyimpan…" : "Simpan catatan"}</button></div>
      </form>
    </div>}
  </section>;
}
