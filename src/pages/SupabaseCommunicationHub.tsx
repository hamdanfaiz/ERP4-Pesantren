import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, Megaphone, Plus, RefreshCw, Send, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type Announcement = {
  id: string;
  title: string;
  content: string;
  target: string;
  date: string;
  status: string;
  readCount: number;
  totalTarget: number;
  readByCurrentUser: boolean;
  acknowledgedBy: string[];
  isUrgent?: boolean;
};

const SUPABASE_COMMUNICATION_IMPORT = legacyArchiveImportEnabled && import.meta.env.VITE_SUPABASE_COMMUNICATION_IMPORT_ENABLED === "true";

async function requestCommunication(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan Komunikasi Supabase belum dapat diproses.");
  return payload;
}

export function SupabaseCommunicationHub() {
  const { role, user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [target, setTarget] = useState("Semua Wali Santri");
  const [urgent, setUrgent] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<any>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const canManage = role === "Admin" || role === "SuperAdmin";

  const refresh = useCallback(async () => {
    const payload = await requestCommunication("/api/communication/announcements");
    setAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestCommunication("/api/communication/announcements")
      .then((payload) => { if (active) setAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : []); })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Pengumuman belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  const submitAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await requestCommunication("/api/communication/announcements", {
        method: "POST",
        body: JSON.stringify({ title, content, target, isUrgent: urgent }),
      });
      if (payload.announcement) setAnnouncements((current) => [payload.announcement, ...current]);
      setComposeOpen(false);
      setTitle(""); setContent(""); setUrgent(false);
    } catch (submitError: any) {
      setError(submitError?.message || "Pengumuman belum dapat disimpan.");
    } finally { setBusy(false); }
  };

  const acknowledge = async (announcement: Announcement) => {
    setBusy(true);
    setError("");
    try {
      const result = await requestCommunication(`/api/communication/announcements/${encodeURIComponent(announcement.id)}/acknowledge`, { method: "POST" });
      if (result.alreadyRead) {
        setAnnouncements((current) => current.map((item) => item.id === announcement.id
          ? { ...item, readByCurrentUser: true }
          : item));
        await refresh();
      } else {
        setAnnouncements((current) => current.map((item) => item.id === announcement.id
          ? { ...item, readByCurrentUser: true, readCount: item.readCount + 1, acknowledgedBy: user?.name ? [...item.acknowledgedBy, user.name] : item.acknowledgedBy }
          : item));
      }
    } catch (ackError: any) {
      setError(ackError?.message || "Konfirmasi baca belum dapat disimpan.");
    } finally { setBusy(false); }
  };

  const migrateLegacyAnnouncements = async (apply: boolean) => {
    if (apply && !window.confirm("Terapkan impor pengumuman yang sudah dipreview ke tenant Supabase?")) return;
    setMigrationBusy(true);
    setError("");
    try {
      const payload = await requestCommunication("/api/communication/announcements/migrate", {
        method: "POST",
        body: JSON.stringify(apply ? {
          apply: true,
          confirmation: "IMPORT_COMMUNICATION_ANNOUNCEMENTS",
          previewFingerprint: migrationPreview?.previewFingerprint,
        } : { apply: false }),
      });
      setMigrationPreview(payload);
      if (apply) await refresh();
    } catch (migrationError: any) {
      setError(migrationError?.message || "Impor pengumuman lama belum dapat diproses.");
    } finally { setMigrationBusy(false); }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><Megaphone className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Pengumuman</h1>
          <p className="mt-1 text-sm text-slate-500">Pengumuman tersimpan pada backend Supabase tenant aktif.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUPABASE_COMMUNICATION_IMPORT && canManage && <button onClick={() => void migrateLegacyAnnouncements(false)} disabled={migrationBusy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{migrationBusy ? "Memproses…" : "Preview impor lama"}</button>}
          {canManage && <button onClick={() => setComposeOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Buat pengumuman</button>}
          <button onClick={() => { setLoading(true); setError(""); void refresh().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} aria-label="Muat ulang pengumuman" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        Mode Supabase saat ini menyediakan pengumuman dan konfirmasi baca. Pesan langsung, helpdesk, pengajuan izin, dan template belum tersedia di jalur Supabase; halaman legacy tidak dimuat pada mode ini.
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {migrationPreview && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">Pratinjau migrasi pengumuman lama</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Dipindai {migrationPreview.scanned ?? 0}; siap {migrationPreview.ready ?? 0}; perlu rekonsiliasi {migrationPreview.blockingIssues?.length ?? 0}.</p></div>{SUPABASE_COMMUNICATION_IMPORT && migrationPreview.canApply && migrationPreview.previewFingerprint && <button onClick={() => void migrateLegacyAnnouncements(true)} disabled={migrationBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{migrationBusy ? "Mengimpor…" : "Terapkan impor"}</button>}</div>{migrationPreview.blockingIssues?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-700 dark:text-rose-300">{migrationPreview.blockingIssues.slice(0, 20).map((issue: any, index: number) => <li key={`${issue.sourceId}-${index}`}>{issue.sourceId}: {issue.reason}</li>)}</ul>}</section>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat pengumuman…</div>
          : announcements.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">{announcements.map((announcement) => {
              const isRead = announcement.readByCurrentUser;
              const expanded = expandedId === announcement.id;
              return <article key={announcement.id} className={`p-4 sm:p-5 ${announcement.isUrgent ? "border-l-4 border-l-rose-500" : ""}`}><button onClick={() => setExpandedId(expanded ? "" : announcement.id)} className="flex w-full items-start justify-between gap-4 text-left"><span className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 rounded-lg p-2 ${announcement.isUrgent ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"}`}><Megaphone className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate font-medium text-slate-900 dark:text-white">{announcement.title}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{announcement.date}<span>·</span>{announcement.target}<span>·</span>{announcement.readCount}/{announcement.totalTarget} dibaca</span></span></span><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{isRead ? "Sudah dibaca" : announcement.status}</span></button>{expanded && <div className="ml-11 mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{announcement.content}</p>{role === "Walisantri" && !isRead && <button onClick={() => void acknowledge(announcement)} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Tandai sudah dibaca</button>}</div>}</article>;
            })}</div>
          : <div className="p-12 text-center"><Megaphone className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada pengumuman</h2><p className="mt-1 text-sm text-slate-500">Pengumuman yang ditujukan kepada tenant ini akan tampil di sini.</p></div>}
      </section>

      {composeOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitAnnouncement} className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Buat pengumuman</h2><p className="mt-1 text-xs text-slate-500">Penerbitan memerlukan akun aktif dalam tenant.</p></div><button type="button" onClick={() => setComposeOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Judul<input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Target audiens<select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option>Semua Wali Santri</option><option>Guru & Musyrif</option><option>Semua Santri</option><option>Wali Santri Kelas VII - A</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Isi pengumuman<textarea required maxLength={12000} rows={6} value={content} onChange={(event) => setContent(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /> Tandai sebagai pengumuman mendesak</label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setComposeOpen(false)} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Terbitkan</button></div></form></div>}
    </main>
  );
}
