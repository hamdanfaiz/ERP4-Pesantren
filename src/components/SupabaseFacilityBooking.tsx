import { publicRuntimeConfigValue } from "../runtimeConfig";
import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, Clock, Loader2, MapPin, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { legacyArchiveImportEnabled } from "../runtimeBackend";

type Booking = { id: string; room: string; date: string; startTime: string; endTime: string; purpose: string; booker: string; status: "Confirmed" | "Cancelled"; source_system: string };
type Preview = { snapshotFingerprint: string; counts: { source: number; ready: number; alreadyImported: number; invalid: number; confirmed: number; cancelled: number }; issues: { code: string; recordRef: string }[]; issueCount: number; blockingCount: number; canApply: boolean };
const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const PRIMARY = "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5";
const SUPABASE_FACILITY_BOOKINGS_IMPORT = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_FACILITY_BOOKINGS_IMPORT_ENABLED") === "true";

async function bookingRequest(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`); headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Pemesanan fasilitas belum dapat diproses.");
  return body;
}
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const emptyForm = (name = "") => ({ room: "", date: localDate(), startTime: "08:00", endTime: "10:00", purpose: "", booker: name });

export function SupabaseFacilityBooking() {
  const { user, role } = useAuth();
  const isAdmin = ["Admin", "SuperAdmin"].includes(role);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [form, setForm] = useState(emptyForm(user?.name || ""));
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await bookingRequest("/api/facility-bookings");
    setBookings(Array.isArray(result.bookings) ? result.bookings : []);
  }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    bookingRequest("/api/facility-bookings").then((result) => { if (active) setBookings(Array.isArray(result.bookings) ? result.bookings : []); })
      .catch((cause: any) => { if (active) setError(cause?.message || "Jadwal fasilitas belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, user?.tenantId, user?.uid]);

  const openForm = (booking?: Booking) => {
    setError(""); setNotice(""); setEditing(booking || null);
    setForm(booking ? { room: booking.room, date: booking.date, startTime: booking.startTime, endTime: booking.endTime, purpose: booking.purpose, booker: booking.booker } : emptyForm(user?.name || ""));
    setModalOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await bookingRequest("/api/facility-bookings", { method: "POST", body: JSON.stringify({ ...form, action: editing ? "update" : "create", id: editing?.id, clientRequestId: crypto.randomUUID() }) });
      setModalOpen(false); setNotice(editing ? "Pemesanan berhasil diperbarui." : "Pemesanan berhasil disimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Jadwal belum dapat disimpan."); }
    finally { setSaving(false); }
  };
  const cancel = async () => {
    if (!cancelTarget) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await bookingRequest("/api/facility-bookings", { method: "POST", body: JSON.stringify({ action: "cancel", id: cancelTarget.id, reason: "Dibatalkan oleh Admin", clientRequestId: crypto.randomUUID() }) });
      setCancelTarget(null); setNotice("Pemesanan dibatalkan. Riwayat tetap tersimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Pemesanan belum dapat dibatalkan."); }
    finally { setSaving(false); }
  };
  const previewImport = async () => {
    if (!SUPABASE_FACILITY_BOOKINGS_IMPORT) return;
    setImportBusy(true); setError(""); setNotice(""); setPreview(null);
    try { setPreview(await bookingRequest("/api/facility-bookings/legacy/import", { method: "POST", body: JSON.stringify({ action: "preview" }) })); }
    catch (cause: any) { setError(cause?.message || "Arsip jadwal lama belum dapat dibaca."); }
    finally { setImportBusy(false); }
  };
  const applyImport = async () => {
    if (!SUPABASE_FACILITY_BOOKINGS_IMPORT) return;
    if (!preview?.canApply || !window.confirm(`Terapkan pratinjau ${preview.counts.source} pemesanan lama ke tenant Supabase?`)) return;
    setImportBusy(true); setError(""); setNotice("");
    try {
      const result = await bookingRequest("/api/facility-bookings/legacy/import", { method: "POST", body: JSON.stringify({ action: "apply", expectedFingerprint: preview.snapshotFingerprint }) });
      setNotice(`Impor selesai: ${result.imported} baru, ${result.unchanged} tidak berubah.`); setPreview(null); await refresh();
    } catch (cause: any) { setError(cause?.message || "Impor belum dapat diterapkan. Buat pratinjau terbaru."); }
    finally { setImportBusy(false); }
  };

  const sortedBookings = [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return <div className="flex h-full min-h-[32rem] flex-col bg-slate-50 dark:bg-[#0a0a0a]/50">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Pemesanan Fasilitas</h2><p className="mt-1 text-sm text-slate-500">Jadwal ruang tenant, dengan pencegahan bentrok pada transaksi database.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={SECONDARY} disabled={loading} onClick={() => { setLoading(true); setError(""); void refresh().catch((cause: any) => setError(cause?.message || "Jadwal gagal dimuat.")).finally(() => setLoading(false)); }}><RefreshCw className="h-4 w-4" />Muat ulang</button>{isAdmin && <button type="button" className={PRIMARY} onClick={() => openForm()}><Plus className="h-4 w-4" />Pemesanan baru</button>}</div></header>
    <main className="flex-1 space-y-4 overflow-y-auto p-5">
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}{notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">{notice}</div>}
      {isAdmin && SUPABASE_FACILITY_BOOKINGS_IMPORT && <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-400/20 dark:bg-indigo-400/5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-indigo-950 dark:text-indigo-100">Impor arsip pemesanan lama</h3><p className="mt-1 text-sm text-indigo-900/75 dark:text-indigo-100/70">Pratinjau hanya mengirim jumlah, kode konflik, dan referensi yang di-hash. Jadwal berbenturan harus direkonsiliasi sebelum impor.</p></div><button type="button" className={SECONDARY} disabled={importBusy} onClick={() => void previewImport()}><RefreshCw className="h-4 w-4" />{importBusy ? "Memeriksa…" : "Buat pratinjau"}</button></div>{preview && <><div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">{[["Arsip", preview.counts.source], ["Siap", preview.counts.ready], ["Sudah diimpor", preview.counts.alreadyImported], ["Aktif", preview.counts.confirmed], ["Batal", preview.counts.cancelled], ["Konflik", preview.blockingCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/80 p-3 dark:bg-white/5"><span className="text-slate-500">{label}</span><strong className="ml-2 text-slate-900 dark:text-white">{value}</strong></div>)}</div>{preview.issueCount > 0 && <ul className="space-y-1 text-sm text-rose-800 dark:text-rose-200">{preview.issues.slice(0, 10).map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code} · ref {issue.recordRef || "—"}</li>)}</ul>}<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Fingerprint {preview.snapshotFingerprint.slice(0, 16)}…</span><button type="button" className={PRIMARY} disabled={importBusy || !preview.canApply} onClick={() => void applyImport()}>{importBusy ? "Menerapkan…" : "Terapkan impor"}</button></div></>}</section>}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat jadwal tenant…</div> : sortedBookings.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sortedBookings.map((booking) => <article key={booking.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-500/40 dark:border-white/10 dark:bg-slate-900"><div className="mb-4 flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{booking.room}</span></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${booking.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}>{booking.status === "Confirmed" ? "Terkonfirmasi" : "Dibatalkan"}</span></div><div className="space-y-2 text-sm text-slate-600 dark:text-slate-300"><p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" />{new Date(`${booking.date}T00:00:00`).toLocaleDateString("id-ID", { dateStyle: "medium" })}</p><p className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" />{booking.startTime}–{booking.endTime}</p></div><div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5"><p className="font-medium text-slate-900 dark:text-white">{booking.purpose}</p><p className="mt-1 text-xs text-slate-500">Pemesan: {booking.booker}{booking.source_system === "legacy_firestore" ? " · arsip lama" : ""}</p></div>{isAdmin && booking.status === "Confirmed" && booking.source_system !== "legacy_firestore" && <div className="mt-4 flex justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-emerald-700 dark:hover:bg-white/5" aria-label={`Ubah pemesanan ${booking.room}`} onClick={() => openForm(booking)}>Ubah</button><button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10" aria-label={`Batalkan pemesanan ${booking.room}`} onClick={() => setCancelTarget(booking)}><Trash2 className="h-4 w-4" /></button></div>}</article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-white/15 dark:bg-slate-900"><Calendar className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">Belum ada pemesanan fasilitas</p><p className="mt-1 text-sm text-slate-500">Setelah arsip lama ditinjau, buat jadwal baru dari data tenant.</p>{isAdmin && <button type="button" className={`${PRIMARY} mt-4`} onClick={() => openForm()}><Plus className="h-4 w-4" />Buat pemesanan</button>}</div>}
    </main>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-label="Form pemesanan fasilitas" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"><header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10"><div><h3 className="font-semibold text-slate-900 dark:text-white">{editing ? "Ubah pemesanan" : "Pemesanan baru"}</h3><p className="mt-1 text-xs text-slate-500">Jadwal yang berbenturan akan ditolak oleh database.</p></div><button type="button" aria-label="Tutup" onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><X className="h-5 w-5" /></button></header><form onSubmit={(event) => void save(event)} className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nama ruang/fasilitas<input required maxLength={180} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Contoh: Aula utama" className={`${INPUT} mt-1.5`} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${INPUT} mt-1.5`} /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Mulai<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={`${INPUT} mt-1.5`} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Selesai<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={`${INPUT} mt-1.5`} /></label></div><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Keperluan<input required maxLength={500} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={`${INPUT} mt-1.5`} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nama pemesan<input required maxLength={180} value={form.booker} onChange={(e) => setForm({ ...form, booker: e.target.value })} className={`${INPUT} mt-1.5`} /></label>{error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10"><button type="button" className={SECONDARY} onClick={() => setModalOpen(false)}>Batal</button><button type="submit" className={PRIMARY} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? "Menyimpan…" : "Simpan"}</button></div></form></section></div>}
    {cancelTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="Konfirmasi pembatalan" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center gap-3"><AlertCircle className="h-6 w-6 text-rose-600" /><h3 className="font-semibold text-slate-900 dark:text-white">Batalkan pemesanan?</h3></div><p className="text-sm text-slate-600 dark:text-slate-300">{cancelTarget.room} · {cancelTarget.date} · {cancelTarget.startTime}–{cancelTarget.endTime}. Riwayat tetap tersimpan untuk audit.</p><div className="flex justify-end gap-2"><button type="button" className={SECONDARY} disabled={saving} onClick={() => setCancelTarget(null)}>Kembali</button><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void cancel()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Batalkan</button></div></section></div>}
  </div>;
}
