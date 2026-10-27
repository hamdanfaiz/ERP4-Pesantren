import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, RotateCcw, Wrench } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  createSupabaseCleanlinessAudit,
  createSupabaseFacilityTicket,
  listSupabaseBoardingFacilityOps,
  migrateSupabaseFacilityOps,
  resolveSupabaseFacilityTicket,
  type FacilityOpsMigrationReport,
  type FacilityOpsSnapshot,
} from "../services/boardingFacilityOpsApi";

const FACILITY_OPS_IMPORT_ENABLED = legacyArchiveImportEnabled && import.meta.env.VITE_SUPABASE_BOARDING_FACILITY_OPS_IMPORT_ENABLED === "true";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
type View = "audits" | "tickets";
function boardingPriorityLabel(priority: string) { return ({ Low: "Rendah", Medium: "Sedang", High: "Tinggi", Urgent: "Mendesak" } as Record<string, string>)[priority] || priority; }
function boardingTicketStatusLabel(status: string) { return status === "Resolved" ? "Selesai" : status === "Open" ? "Terbuka" : status; }

export function SupabaseBoardingFacilityOpsManager() {
  const { role } = useAuth();
  const [data, setData] = useState<FacilityOpsSnapshot>({ rooms: [], audits: [], tickets: [], canCreateAudit: false, canCreateTicket: false, canResolveTicket: false });
  const [view, setView] = useState<View>(role === "Santri" || role === "Walisantri" ? "tickets" : "audits");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationReport, setMigrationReport] = useState<FacilityOpsMigrationReport | null>(null);
  const [auditForm, setAuditForm] = useState({ roomId: "", date: today(), score: 90, notes: "" });
  const [ticketForm, setTicketForm] = useState({ roomId: "", issue: "", description: "", priority: "Medium" });
  const auditRequestId = useRef<string | null>(null);
  const ticketRequestId = useRef<string | null>(null);
  const resolveRequestIds = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const result = await listSupabaseBoardingFacilityOps();
    setData(result);
    setAuditForm((current) => ({ ...current, roomId: result.rooms.some((room) => room.id === current.roomId) ? current.roomId : result.rooms[0]?.id || "" }));
    setTicketForm((current) => ({ ...current, roomId: result.rooms.some((room) => room.id === current.roomId) ? current.roomId : result.rooms[0]?.id || "" }));
  }, []);
  useEffect(() => {
    let active = true;
    listSupabaseBoardingFacilityOps().then((result) => {
      if (!active) return;
      setData(result);
      setAuditForm((current) => ({ ...current, roomId: result.rooms[0]?.id || "" }));
      setTicketForm((current) => ({ ...current, roomId: result.rooms[0]?.id || "" }));
    }).catch((e: any) => { if (active) setError(e?.message || "Data fasilitas asrama belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visibleViews = useMemo(() => [
    ...(data.canCreateAudit ? [{ id: "audits" as const, label: "Audit kebersihan", icon: ClipboardCheck }] : []),
    ...(data.canCreateTicket || data.tickets.length ? [{ id: "tickets" as const, label: "Tiket fasilitas", icon: Wrench }] : []),
  ], [data.canCreateAudit, data.canCreateTicket, data.tickets.length]);
  const selectedView = visibleViews.some((item) => item.id === view) ? view : visibleViews[0]?.id || "tickets";

  const saveAudit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving("audit"); setError(""); setNotice("");
    try {
      const clientRequestId = auditRequestId.current || (auditRequestId.current = crypto.randomUUID());
      await createSupabaseCleanlinessAudit({ ...auditForm, clientRequestId, score: Number(auditForm.score) });
      auditRequestId.current = null;
      setNotice("Audit kebersihan tersimpan di Supabase dan tercatat pada audit tenant.");
      try { await refresh(); } catch { setError("Audit sudah tersimpan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(e?.message || "Audit kebersihan belum dapat disimpan."); }
    finally { setSaving(""); }
  };
  const saveTicket = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving("ticket"); setError(""); setNotice("");
    try {
      const clientRequestId = ticketRequestId.current || (ticketRequestId.current = crypto.randomUUID());
      await createSupabaseFacilityTicket({ ...ticketForm, clientRequestId });
      ticketRequestId.current = null;
      setTicketForm((current) => ({ ...current, issue: "", description: "", priority: "Medium" }));
      setNotice("Tiket fasilitas tersimpan di Supabase.");
      try { await refresh(); } catch { setError("Tiket sudah tersimpan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(e?.message || "Tiket fasilitas belum dapat dibuat."); }
    finally { setSaving(""); }
  };
  const resolve = async (ticketId: string) => {
    setSaving(ticketId); setError(""); setNotice("");
    try {
      const clientRequestId = resolveRequestIds.current.get(ticketId) || crypto.randomUUID();
      resolveRequestIds.current.set(ticketId, clientRequestId);
      await resolveSupabaseFacilityTicket(ticketId, clientRequestId);
      resolveRequestIds.current.delete(ticketId);
      setNotice("Tiket diselesaikan dan perubahannya tercatat pada audit tenant.");
      try { await refresh(); } catch { setError("Tiket sudah diselesaikan, tetapi daftar belum dapat dimuat ulang."); }
    } catch (e: any) { setError(e?.message || "Tiket belum dapat diselesaikan."); }
    finally { setSaving(""); }
  };
  const reload = () => { setLoading(true); setError(""); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); };
  const runLegacyImport = async (apply = false) => {
    if (apply && (!migrationReport?.canApply || !window.confirm("Impor data audit dan tiket Firestore ke data pesantren di Supabase? Data lama tidak dihapus."))) return;
    setMigrationBusy(true); setError(""); setNotice("");
    try {
      const report = await migrateSupabaseFacilityOps(apply, migrationReport?.previewFingerprint || "");
      setMigrationReport(report);
      if (apply) {
        setNotice(`Impor selesai: ${report.imported?.audits || 0} audit dan ${report.imported?.tickets || 0} tiket baru; record identik yang sudah ada dilewati.`);
        try { await refresh(); } catch { setError("Impor selesai, tetapi snapshot fasilitas belum dapat dimuat ulang."); }
      }
    } catch (e: any) { setError(e?.message || "Pratinjau impor audit dan tiket belum dapat diproses."); }
    finally { setMigrationBusy(false); }
  };

  return <section className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-slate-600">Asrama · Operasional fasilitas · Supabase</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Kebersihan dan Fasilitas</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Audit dan tiket disimpan per tenant. Akses Ustadz serta pelapor santri dibatasi ke kamar yang berhak diakses.</p></div>
      <button type="button" onClick={reload} disabled={loading} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button></header>
    {visibleViews.length > 1 && <nav aria-label="Operasional fasilitas asrama" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">{visibleViews.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} aria-current={selectedView === id ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${selectedView === id ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {FACILITY_OPS_IMPORT_ENABLED && ["Admin", "SuperAdmin"].includes(role) && <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold text-indigo-950">Migrasi riwayat audit dan tiket</h2><p className="mt-1 text-sm text-indigo-800">Pratinjau membaca data pesantren dari Firestore. Nama kamar harus cocok secara unik dengan Data Induk Supabase; data lama tetap tersimpan selama rekonsiliasi.</p></div>
        <div className="flex shrink-0 gap-2"><button type="button" onClick={() => void runLegacyImport(false)} disabled={migrationBusy} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-50">{migrationBusy ? "Memproses…" : "Pratinjau impor"}</button><button type="button" onClick={() => void runLegacyImport(true)} disabled={migrationBusy || !migrationReport?.canApply} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Terapkan data</button></div>
      </div>
      {migrationReport && <div className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3 text-sm text-slate-700"><p>Sumber: {migrationReport.sourceCount.audits} audit · {migrationReport.sourceCount.tickets} tiket. Rencana baru: {migrationReport.planned.audits} audit · {migrationReport.planned.tickets} tiket. Sudah terimpor: {migrationReport.alreadyImported.audits} · {migrationReport.alreadyImported.tickets}.</p><p className={migrationReport.canApply ? "font-medium text-emerald-800" : "font-medium text-rose-700"}>{migrationReport.canApply ? "Snapshot siap diterapkan; fingerprint akan diperiksa kembali oleh server." : `${migrationReport.blockingIssues.length} masalah harus direkonsiliasi sebelum apply.`}</p>{migrationReport.blockingIssues.length > 0 && <ul className="max-h-40 space-y-1 overflow-auto text-xs text-rose-800">{migrationReport.blockingIssues.map((issue, index) => <li key={`${issue.type}-${issue.id}-${index}`}><strong>{issue.type} {issue.id}:</strong> {issue.message}</li>)}</ul>}<p className="break-all font-mono text-[10px] text-slate-500">Fingerprint: {migrationReport.previewFingerprint}</p></div>}
    </div>}
    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat data tenant…</div>
      : selectedView === "audits" ? <div className="space-y-4">
        {data.canCreateAudit && <form onSubmit={(event) => void saveAudit(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5 sm:items-end"><label className="text-sm font-medium text-slate-700">Kamar<select required value={auditForm.roomId} onChange={(e) => { auditRequestId.current = null; setAuditForm({ ...auditForm, roomId: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Tanggal<input required type="date" value={auditForm.date} onChange={(e) => { auditRequestId.current = null; setAuditForm({ ...auditForm, date: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">Skor<input required type="number" min={0} max={100} value={auditForm.score} onChange={(e) => { auditRequestId.current = null; setAuditForm({ ...auditForm, score: Number(e.target.value) }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">Catatan<input maxLength={2000} value={auditForm.notes} onChange={(e) => { auditRequestId.current = null; setAuditForm({ ...auditForm, notes: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><button disabled={saving === "audit" || !data.rooms.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:col-span-5">{saving === "audit" ? "Menyimpan…" : "Simpan audit"}</button></form>}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Riwayat audit kebersihan</h2></div>{!data.audits.length ? <div className="p-10 text-center text-sm text-slate-500">Belum ada audit pada kamar yang dapat Anda akses.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Kamar</th><th className="px-4 py-3">Skor</th><th className="px-4 py-3">Catatan / Pemeriksa</th></tr></thead><tbody className="divide-y divide-slate-100">{data.audits.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.room}</td><td className="px-4 py-3 font-semibold">{item.score}/100</td><td className="px-4 py-3 text-slate-600">{item.notes || "—"}<div className="mt-1 text-xs text-slate-500">{item.inspector}</div></td></tr>)}</tbody></table></div>}</div>
      </div> : <div className="space-y-4">
        {data.canCreateTicket && <form onSubmit={(event) => void saveTicket(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4 sm:items-end"><label className="text-sm font-medium text-slate-700">Kamar<select required value={ticketForm.roomId} onChange={(e) => { ticketRequestId.current = null; setTicketForm({ ...ticketForm, roomId: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Masalah<input required maxLength={200} value={ticketForm.issue} onChange={(e) => { ticketRequestId.current = null; setTicketForm({ ...ticketForm, issue: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Contoh: lampu kamar mati" /></label><label className="text-sm font-medium text-slate-700">Prioritas<select value={ticketForm.priority} onChange={(e) => { ticketRequestId.current = null; setTicketForm({ ...ticketForm, priority: e.target.value }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="Low">Rendah</option><option value="Medium">Sedang</option><option value="High">Tinggi</option><option value="Urgent">Mendesak</option></select></label><button disabled={saving === "ticket" || !data.rooms.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving === "ticket" ? "Mengirim…" : "Buat tiket"}</button><label className="text-sm font-medium text-slate-700 sm:col-span-4">Uraian<textarea maxLength={4000} value={ticketForm.description} onChange={(e) => { ticketRequestId.current = null; setTicketForm({ ...ticketForm, description: e.target.value }); }} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></form>}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Tiket perbaikan fasilitas</h2><p className="mt-1 text-xs text-slate-500">Status penyelesaian masuk ke catatan audit tenant.</p></div>{!data.tickets.length ? <div className="p-10 text-center text-sm text-slate-500">Belum ada tiket untuk kamar yang dapat Anda akses.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tanggal / Pelapor</th><th className="px-4 py-3">Kamar</th><th className="px-4 py-3">Masalah</th><th className="px-4 py-3">Status / Prioritas</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{data.tickets.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.date}<div className="text-xs text-slate-500">{item.reportedBy}</div></td><td className="px-4 py-3">{item.room}</td><td className="px-4 py-3"><div className="font-medium">{item.issue}</div><div className="text-xs text-slate-500">{item.description || "—"}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{boardingTicketStatusLabel(item.status)}</span><div className="mt-1 text-xs text-slate-500">{boardingPriorityLabel(item.priority)}</div></td><td className="px-4 py-3 text-right">{item.status === "Open" && data.canResolveTicket ? <button type="button" onClick={() => void resolve(item.id)} disabled={saving === item.id} className="rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{saving === item.id ? "Menyimpan…" : "Selesaikan"}</button> : "—"}</td></tr>)}</tbody></table></div>}</div>
      </div>}
  </section>;
}
