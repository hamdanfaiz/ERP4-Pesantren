import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, LifeBuoy, Loader2, Megaphone, MessageSquare, Plus, RefreshCw, Send, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { ERPFeatureStatus, ERPLoadingSkeleton, ERPTabs } from "../components/ERPDesignSystem";

type CommunicationTab = "announcements" | "helpdesk" | "messages" | "permits" | "templates";
const COMMUNICATION_TABS: Array<{ id: CommunicationTab; label: string }> = [
  { id: "announcements", label: "Pengumuman" },
  { id: "helpdesk", label: "Bantuan & Helpdesk" },
  { id: "messages", label: "Pesan Langsung" },
  { id: "permits", label: "Perizinan" },
  { id: "templates", label: "Templat" },
];

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

type Ticket = {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: string;
  requestedByUserId: string;
  requestedByName: string;
  resolvedAt: string | null;
  createdAt: string;
};

type DirectMessage = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  body: string;
  status: string;
  createdAt: string;
};

type Template = { id: string; name: string; content: string; status: string };
type DirectoryUser = { userId: string; name: string; role: string };
type PermitRow = { id: string; santriName: string; nis?: string; room?: string; type: string; reason: string; status: string; startDate?: string; endDate?: string };

const SUPABASE_COMMUNICATION_IMPORT = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_COMMUNICATION_IMPORT_ENABLED") === "true";
const TICKET_STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  in_progress: "Diproses",
  resolved: "Selesai",
  closed: "Ditutup",
};

async function requestCommunication(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi masuk tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Pesan belum dapat diproses. Periksa koneksi lalu coba lagi.");
  return payload;
}

export function SupabaseCommunicationHub() {
  const { role, user } = useAuth();
  const [tab, setTab] = useState<CommunicationTab>("announcements");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [target, setTarget] = useState("Semua Wali Santri");
  const [urgent, setUrgent] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<any>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [ticketDraft, setTicketDraft] = useState({ subject: "", category: "Lainnya", description: "" });
  const [messageDraft, setMessageDraft] = useState({ toUserId: "", body: "" });
  const [templateDraft, setTemplateDraft] = useState({ id: "", name: "", content: "" });
  const canManage = role === "Admin" || role === "SuperAdmin";
  const activeTabLabel = COMMUNICATION_TABS.find((item) => item.id === tab)?.label || "Pengumuman";

  const refreshAnnouncements = useCallback(async () => {
    const payload = await requestCommunication("/api/communication/announcements");
    setAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : []);
  }, []);

  const refreshOps = useCallback(async () => {
    const payload = await requestCommunication("/api/communication/ops");
    setTickets(Array.isArray(payload.tickets) ? payload.tickets : []);
    setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
    setDirectory(Array.isArray(payload.directory) ? payload.directory : []);
  }, []);

  const refreshPermits = useCallback(async () => {
    try {
      const payload = await requestCommunication("/api/boarding/permits");
      setPermits(Array.isArray(payload.permits) ? payload.permits : []);
    } catch {
      setPermits([]);
    }
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

  useEffect(() => {
    if (!["helpdesk", "messages", "templates"].includes(tab)) return;
    let active = true;
    setOpsLoading(true);
    setError("");
    refreshOps()
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data operasional komunikasi belum dapat dimuat."); })
      .finally(() => { if (active) setOpsLoading(false); });
    return () => { active = false; };
  }, [tab, refreshOps]);

  useEffect(() => {
    if (tab !== "permits") return;
    let active = true;
    setOpsLoading(true);
    setError("");
    refreshPermits()
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data perizinan belum dapat dimuat."); })
      .finally(() => { if (active) setOpsLoading(false); });
    return () => { active = false; };
  }, [tab, refreshPermits]);

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
        await refreshAnnouncements();
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
    if (apply && !window.confirm("Terapkan impor pengumuman yang sudah dipreview untuk pesantren ini?")) return;
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
      if (apply) await refreshAnnouncements();
    } catch (migrationError: any) {
      setError(migrationError?.message || "Impor pengumuman lama belum dapat diproses.");
    } finally { setMigrationBusy(false); }
  };

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication("/api/communication/tickets", {
        method: "POST",
        body: JSON.stringify({ ...ticketDraft, clientRequestId: crypto.randomUUID() }),
      });
      setTicketDraft({ subject: "", category: "Lainnya", description: "" });
      setNotice("Tiket bantuan tercatat.");
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Tiket belum dapat disimpan.");
    } finally { setBusy(false); }
  };

  const transitionTicket = async (ticket: Ticket, status: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication(`/api/communication/tickets/${encodeURIComponent(ticket.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status, clientRequestId: crypto.randomUUID() }),
      });
      setNotice(`Status tiket diperbarui: ${TICKET_STATUS_LABEL[status] || status}.`);
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Status tiket belum dapat diubah.");
    } finally { setBusy(false); }
  };

  const submitMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication("/api/communication/messages", {
        method: "POST",
        body: JSON.stringify({ ...messageDraft, clientRequestId: crypto.randomUUID() }),
      });
      setMessageDraft({ toUserId: "", body: "" });
      setNotice("Pesan terkirim.");
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Pesan belum dapat dikirim.");
    } finally { setBusy(false); }
  };

  const transitionMessage = async (message: DirectMessage, status: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication(`/api/communication/messages/${encodeURIComponent(message.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status, clientRequestId: crypto.randomUUID() }),
      });
      setNotice(status === "read" ? "Pesan ditandai sudah dibaca." : "Pesan diarsipkan.");
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Status pesan belum dapat diubah.");
    } finally { setBusy(false); }
  };

  const submitTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication("/api/communication/templates", {
        method: "POST",
        body: JSON.stringify({
          id: templateDraft.id || null,
          name: templateDraft.name,
          content: templateDraft.content,
          status: "active",
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setTemplateDraft({ id: "", name: "", content: "" });
      setNotice("Templat tersimpan.");
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Templat belum dapat disimpan.");
    } finally { setBusy(false); }
  };

  const archiveTemplate = async (template: Template) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCommunication("/api/communication/templates", {
        method: "POST",
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          content: template.content,
          status: "archived",
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setNotice("Templat diarsipkan.");
      await refreshOps();
    } catch (cause: any) {
      setError(cause?.message || "Templat belum dapat diarsipkan.");
    } finally { setBusy(false); }
  };

  const useTemplate = (template: Template) => {
    setTab("announcements");
    setComposeOpen(true);
    setContent(template.content);
    setTitle(template.name);
    setNotice(`Templat “${template.name}” dimuat ke formulir pengumuman.`);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800"><Megaphone className="h-5 w-5 text-slate-700 dark:text-slate-200" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{activeTabLabel}</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola pengumuman dan pesan untuk warga pesantren dari modul ini.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "announcements" && SUPABASE_COMMUNICATION_IMPORT && canManage && <button onClick={() => void migrateLegacyAnnouncements(false)} disabled={migrationBusy} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{migrationBusy ? "Memproses…" : "Pratinjau impor pengumuman"}</button>}
          {tab === "announcements" && canManage && <button onClick={() => setComposeOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Buat pengumuman</button>}
          <button onClick={() => {
            setError(""); setNotice("");
            if (tab === "announcements") {
              setLoading(true);
              void refreshAnnouncements().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false));
            } else if (tab === "permits") {
              setOpsLoading(true);
              void refreshPermits().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setOpsLoading(false));
            } else {
              setOpsLoading(true);
              void refreshOps().catch((refreshError: any) => setError(refreshError?.message || "Data belum dapat dimuat.")).finally(() => setOpsLoading(false));
            }
          }} aria-label="Muat ulang" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <ERPTabs tabs={COMMUNICATION_TABS} value={tab} onChange={(id) => { setTab(id as CommunicationTab); setComposeOpen(false); setMigrationPreview(null); setError(""); setNotice(""); }} ariaLabel="Bagian Pusat Komunikasi" />
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      {migrationPreview && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">Pratinjau pengumuman yang akan diimpor</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Dipindai {migrationPreview.scanned ?? 0}; siap {migrationPreview.ready ?? 0}; perlu rekonsiliasi {migrationPreview.blockingIssues?.length ?? 0}.</p></div>{SUPABASE_COMMUNICATION_IMPORT && migrationPreview.canApply && migrationPreview.previewFingerprint && <button onClick={() => void migrateLegacyAnnouncements(true)} disabled={migrationBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{migrationBusy ? "Mengimpor…" : "Terapkan impor"}</button>}</div>{migrationPreview.blockingIssues?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-700 dark:text-rose-300">{migrationPreview.blockingIssues.slice(0, 20).map((issue: any, index: number) => <li key={`${issue.sourceId}-${index}`}>{issue.sourceId}: {issue.reason}</li>)}</ul>}</section>}

      {tab === "announcements" && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? <div className="p-4"><ERPLoadingSkeleton variant="list" label="Memuat pengumuman…" rows={4} /></div>
          : announcements.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">{announcements.map((announcement) => {
              const isRead = announcement.readByCurrentUser;
              const expanded = expandedId === announcement.id;
              return <article key={announcement.id} className={`p-4 sm:p-5 ${announcement.isUrgent ? "border-l-4 border-l-rose-500" : ""}`}><button onClick={() => setExpandedId(expanded ? "" : announcement.id)} className="flex w-full items-start justify-between gap-4 text-left"><span className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 rounded-lg p-2 ${announcement.isUrgent ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"}`}><Megaphone className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate font-medium text-slate-900 dark:text-white">{announcement.title}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{announcement.date}<span>·</span>{announcement.target}<span>·</span>{announcement.readCount}/{announcement.totalTarget} dibaca</span></span></span><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{isRead ? "Sudah dibaca" : announcement.status}</span></button>{expanded && <div className="ml-11 mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{announcement.content}</p>{role === "Walisantri" && !isRead && <button onClick={() => void acknowledge(announcement)} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Tandai sudah dibaca</button>}</div>}</article>;
            })}</div>
          : <div className="p-12 text-center"><Megaphone className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada pengumuman</h2><p className="mt-1 text-sm text-slate-500">Pengumuman untuk pesantren ini akan tampil di sini.</p></div>}
      </section>}

      {tab === "helpdesk" && <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {opsLoading ? <div className="p-4"><ERPLoadingSkeleton variant="list" label="Memuat tiket…" rows={4} /></div>
            : tickets.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">{tickets.map((ticket) => <article key={ticket.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><LifeBuoy className="h-4 w-4 text-indigo-600" />{ticket.subject}</div><p className="mt-1 text-xs text-slate-500">{ticket.requestedByName} · {ticket.category} · {new Date(ticket.createdAt).toLocaleString("id-ID")}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{TICKET_STATUS_LABEL[ticket.status] || ticket.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{ticket.description}</p>{canManage && ticket.status !== "closed" && <div className="mt-3 flex flex-wrap gap-2">{ticket.status === "open" && <button type="button" disabled={busy} onClick={() => void transitionTicket(ticket, "in_progress")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Proses</button>}{["open", "in_progress"].includes(ticket.status) && <button type="button" disabled={busy} onClick={() => void transitionTicket(ticket, "resolved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Selesaikan</button>}{ticket.status === "resolved" && <button type="button" disabled={busy} onClick={() => void transitionTicket(ticket, "closed")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Tutup</button>}</div>}</article>)}</div>
            : <div className="p-10 text-center text-sm text-slate-500">Belum ada tiket bantuan.</div>}
        </div>
        <form onSubmit={(event) => void submitTicket(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-white">Buat tiket</h2>
          <label className="block text-sm font-medium">Subjek<input required maxLength={180} value={ticketDraft.subject} onChange={(e) => setTicketDraft({ ...ticketDraft, subject: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
          <label className="block text-sm font-medium">Kategori<select value={ticketDraft.category} onChange={(e) => setTicketDraft({ ...ticketDraft, category: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option>Teknis</option><option>Akademik</option><option>Asrama</option><option>Keuangan</option><option>Lainnya</option></select></label>
          <label className="block text-sm font-medium">Uraian<textarea required maxLength={4000} rows={5} value={ticketDraft.description} onChange={(e) => setTicketDraft({ ...ticketDraft, description: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Kirim tiket</button>
        </form>
      </section>}

      {tab === "messages" && <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {opsLoading ? <div className="p-4"><ERPLoadingSkeleton variant="list" label="Memuat pesan…" rows={4} /></div>
            : messages.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">{messages.map((message) => {
              const incoming = message.toUserId === user?.uid;
              return <article key={message.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white"><MessageSquare className="h-4 w-4 text-indigo-600" />{incoming ? message.fromName : `Kepada ${message.toName}`}</div><p className="mt-1 text-xs text-slate-500">{new Date(message.createdAt).toLocaleString("id-ID")} · {message.status}</p></div></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{message.body}</p><div className="mt-3 flex flex-wrap gap-2">{incoming && message.status === "sent" && <button type="button" disabled={busy} onClick={() => void transitionMessage(message, "read")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Tandai dibaca</button>}{message.status !== "archived" && <button type="button" disabled={busy} onClick={() => void transitionMessage(message, "archived")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Arsipkan</button>}</div></article>;
            })}</div>
            : <div className="p-10 text-center text-sm text-slate-500">Belum ada pesan langsung.</div>}
        </div>
        <form onSubmit={(event) => void submitMessage(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-white">Kirim pesan</h2>
          <label className="block text-sm font-medium">Penerima<select required value={messageDraft.toUserId} onChange={(e) => setMessageDraft({ ...messageDraft, toUserId: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">{canManage ? "Pilih akun pesantren" : "Pilih Admin pesantren"}</option>{directory.map((item) => <option key={item.userId} value={item.userId}>{item.name} · {item.role}</option>)}</select></label>
          <label className="block text-sm font-medium">Isi pesan<textarea required maxLength={4000} rows={5} value={messageDraft.body} onChange={(e) => setMessageDraft({ ...messageDraft, body: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
          <button type="submit" disabled={busy || !messageDraft.toUserId || !directory.length} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Kirim</button>
        </form>
      </section>}

      {tab === "permits" && <section className="space-y-4">
        <ERPFeatureStatus title="Perizinan" status="Dikelola pada modul Asrama" tone="available" description="Alur setuju/tolak/kembali izin santri tetap pada tab Perizinan modul Asrama. Ringkasan di bawah bersifat baca untuk Admin Komunikasi." />
        {opsLoading ? <ERPLoadingSkeleton variant="list" label="Memuat ringkasan izin…" rows={4} />
          : permits.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="divide-y divide-slate-200 dark:divide-slate-800">{permits.slice(0, 20).map((permit) => <article key={permit.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-slate-900 dark:text-white">{permit.santriName}</div><p className="mt-1 text-xs text-slate-500">{permit.type} · NIS {permit.nis || "—"} · {permit.room || "—"}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{permit.status}</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{permit.reason}</p></article>)}</div></div>
            : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Belum ada izin yang dapat ditampilkan.</div>}
      </section>}

      {tab === "templates" && <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {opsLoading ? <ERPLoadingSkeleton variant="list" label="Memuat templat…" rows={3} />
            : templates.filter((item) => item.status === "active").length ? templates.filter((item) => item.status === "active").map((template) => <article key={template.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="font-semibold text-slate-900 dark:text-white">{template.name}</h3><p className="mt-2 line-clamp-4 text-sm text-slate-600 dark:text-slate-300">{template.content}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => useTemplate(template)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Pakai di pengumuman</button>{canManage && <button type="button" disabled={busy} onClick={() => setTemplateDraft({ id: template.id, name: template.name, content: template.content })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Ubah</button>}{canManage && <button type="button" disabled={busy} onClick={() => void archiveTemplate(template)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700">Arsipkan</button>}</div></article>)
              : <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Belum ada templat aktif.</div>}
        </div>
        {canManage ? <form onSubmit={(event) => void submitTemplate(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-white">{templateDraft.id ? "Ubah templat" : "Templat baru"}</h2>
          <label className="block text-sm font-medium">Nama<input required maxLength={120} value={templateDraft.name} onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
          <label className="block text-sm font-medium">Isi<textarea required maxLength={12000} rows={8} value={templateDraft.content} onChange={(e) => setTemplateDraft({ ...templateDraft, content: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
          <div className="flex gap-2"><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Simpan</button>{templateDraft.id && <button type="button" onClick={() => setTemplateDraft({ id: "", name: "", content: "" })} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Batal ubah</button>}</div>
        </form> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">Pengelolaan templat hanya untuk Admin pesantren. Anda tetap dapat memakai templat aktif ke pengumuman bila tersedia.</div>}
      </section>}

      {composeOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitAnnouncement} className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Buat pengumuman</h2><p className="mt-1 text-xs text-slate-500">Hanya akun aktif yang dapat menerbitkan pengumuman.</p></div><button type="button" onClick={() => setComposeOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Judul<input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Target audiens<select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option>Semua Wali Santri</option><option>Guru & Musyrif</option><option>Semua Santri</option><option>Wali Santri Kelas VII - A</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Isi pengumuman<textarea required maxLength={12000} rows={6} value={content} onChange={(event) => setContent(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /> Tandai sebagai pengumuman mendesak</label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setComposeOpen(false)} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Batal</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Terbitkan</button></div></form></div>}
    </main>
  );
}
