import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownToLine, ArrowDownWideNarrow, FileText, Inbox, Loader2, Plus, RefreshCw, Search, Send, ShieldCheck, UploadCloud, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabase";
import { pendingMutationIds } from "../utils/pendingMutationId";
import { tenantBusinessDate } from "../utils/businessDate";
import { ERPFeatureStatus } from "../components/ERPDesignSystem";

type Direction = "incoming" | "outgoing" | "internal";
type Status = "registered" | "in_review" | "approved" | "rejected" | "archived";
type Attachment = { id: string; fileName: string; contentType: string; fileSize: number; uploadedAt: string };
type DocumentRecord = {
  id: string; documentNumber: string; direction: Direction; subject: string;
  senderName: string | null; recipientName: string | null; documentDate: string;
  summary: string | null; status: Status; createdAt: string; updatedAt: string; attachments: Attachment[];
};
type Draft = { documentNumber: string; direction: Direction; subject: string; senderName: string; recipientName: string; documentDate: string; summary: string };
type PageResult = { documents: DocumentRecord[]; nextCursor: string | null };
type ViewTab = "all" | Direction | "approval" | "archive" | "ocr";

const INITIAL_DRAFT: Draft = { documentNumber: "", direction: "incoming", subject: "", senderName: "", recipientName: "", documentDate: tenantBusinessDate(), summary: "" };
const TAB_LABEL: Record<ViewTab, string> = { all: "Semua dokumen", incoming: "Surat masuk", outgoing: "Surat keluar", internal: "Internal", approval: "Persetujuan elektronik", archive: "Arsip Digital", ocr: "Pemindai OCR" };
const DIRECTION_LABEL: Record<Direction, string> = { incoming: "Masuk", outgoing: "Keluar", internal: "Internal" };
const STATUS_LABEL: Record<Status, string> = { registered: "Terdaftar", in_review: "Dalam telaah", approved: "Disetujui", rejected: "Perlu perbaikan", archived: "Diarsipkan" };
const STATUS_STYLE: Record<Status, string> = {
  registered: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
  in_review: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  rejected: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
  archived: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
};

async function documentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Layanan Dokumen Digital belum dapat diproses.");
  return body as T;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupabaseDocumentManager() {
  const { role, user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const canManage = (role === "Admin" || role === "SuperAdmin") && user?.modulePermissions?.document !== false;

  const fetchPage = useCallback(async (cursor?: string | null, append = false) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const result = await documentRequest<PageResult>(`/api/documents${suffix}`);
    setDocuments((current) => append ? [...current, ...(Array.isArray(result.documents) ? result.documents : [])] : (Array.isArray(result.documents) ? result.documents : []));
    setNextCursor(typeof result.nextCursor === "string" ? result.nextCursor : null);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    try { await fetchPage(null, false); }
    catch (loadError: any) { setError(loadError?.message || "Daftar dokumen belum dapat dimuat."); }
  }, [fetchPage]);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError("");
    documentRequest<PageResult>("/api/documents")
      .then((result) => {
        if (!mounted) return;
        setDocuments(Array.isArray(result.documents) ? result.documents : []);
        setNextCursor(typeof result.nextCursor === "string" ? result.nextCursor : null);
      })
      .catch((loadError: any) => { if (mounted) setError(loadError?.message || "Daftar dokumen belum dapat dimuat."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user?.tenantId, user?.uid]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    return documents.filter((item) => {
      const matchesTab = tab === "all"
        || tab === "approval" && ["registered", "in_review", "approved", "rejected"].includes(item.status)
        || tab === "archive" && item.status === "archived"
        || (tab === "incoming" || tab === "outgoing" || tab === "internal") && item.direction === tab;
      return matchesTab
      && (!needle || [item.documentNumber, item.subject, item.senderName || "", item.recipientName || "", item.summary || ""]
        .some((value) => value.toLocaleLowerCase("id-ID").includes(needle)));
    });
  }, [documents, query, tab]);

  const createDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) { setError("Akses pengelolaan Dokumen Digital hanya tersedia untuk Admin tenant."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...draft, documentNumber: draft.documentNumber.trim(), subject: draft.subject.trim(), senderName: draft.senderName.trim(), recipientName: draft.recipientName.trim(), summary: draft.summary.trim() };
      const lease = await pendingMutationIds.acquire("document:register", { tenantId: user?.tenantId || "", actorId: user?.uid || "", payload });
      await documentRequest("/api/documents", { method: "POST", body: JSON.stringify({ document: { ...payload, clientRequestId: lease.requestId } }) });
      lease.clear();
      setFormOpen(false); setDraft(INITIAL_DRAFT);
      setNotice("Dokumen terdaftar dan tercatat pada tenant ini.");
      await fetchPage(null, false);
    } catch (saveError: any) { setError(saveError?.message || "Dokumen belum dapat didaftarkan."); }
    finally { setSaving(false); }
  };

  const changeStatus = async (document: DocumentRecord, status: Status) => {
    setBusyDocumentId(document.id); setError(""); setNotice("");
    try {
      await documentRequest(`/api/documents/${encodeURIComponent(document.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice(`Status dokumen ${document.documentNumber} diperbarui menjadi “${STATUS_LABEL[status]}”.`);
      await fetchPage(null, false);
    } catch (saveError: any) { setError(saveError?.message || "Status dokumen belum dapat diperbarui."); }
    finally { setBusyDocumentId(""); }
  };

  const chooseAttachment = (documentId: string) => {
    setUploadTarget(documentId);
    if (fileInput.current) { fileInput.current.value = ""; fileInput.current.click(); }
  };

  const uploadAttachment = async (file: File) => {
    const document = documents.find((item) => item.id === uploadTarget);
    if (!document) return;
    setBusyDocumentId(document.id); setError(""); setNotice("");
    try {
      if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) throw new Error("Pilih satu berkas PDF.");
      if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error("Ukuran berkas harus antara 1 byte dan 25 MB.");
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const contentSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const payload = { documentId: document.id, fileName: file.name, contentType: "application/pdf", fileSize: file.size, contentSha256 };
      const lease = await pendingMutationIds.acquire("document:attachment", { tenantId: user?.tenantId || "", actorId: user?.uid || "", payload });
      const reservation = await documentRequest<any>(`/api/documents/${encodeURIComponent(document.id)}/attachments/upload-url`, {
        method: "POST", body: JSON.stringify({ attachment: { ...payload, clientRequestId: lease.requestId } }),
      });
      if (!reservation.alreadyCompleted && !reservation.objectAlreadyUploaded) {
        const { error: uploadError } = await supabase.storage.from("erp4-private-document-attachments")
          .uploadToSignedUrl(reservation.storagePath, reservation.uploadToken, file, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw new Error("Unggahan lampiran gagal. Anda dapat mencoba kembali dengan berkas yang sama.");
      }
      if (!reservation.alreadyCompleted) {
        await documentRequest("/api/documents/attachments/finalize", { method: "POST", body: JSON.stringify({ clientRequestId: lease.requestId }) });
      }
      lease.clear();
      setNotice(`PDF berhasil disimpan secara privat pada dokumen ${document.documentNumber}.`);
      await fetchPage(null, false);
    } catch (uploadError: any) { setError(uploadError?.message || "Lampiran belum dapat disimpan."); }
    finally { setBusyDocumentId(""); setUploadTarget(""); }
  };

  const downloadAttachment = async (attachment: Attachment) => {
    setError(""); setNotice("");
    try {
      const result = await documentRequest<{ signedUrl: string }>(`/api/documents/attachments/${encodeURIComponent(attachment.id)}/download-url`);
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (downloadError: any) { setError(downloadError?.message || "Lampiran belum dapat dibuka."); }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError("");
    try { await fetchPage(nextCursor, true); }
    catch (loadError: any) { setError(loadError?.message || "Halaman berikutnya belum dapat dimuat."); }
    finally { setLoadingMore(false); }
  };

  const tabs: ViewTab[] = ["all", "incoming", "outgoing", "approval", "archive", "ocr", "internal"];
  const statusActions = (document: DocumentRecord): Array<{ label: string; status: Status; icon: React.ReactNode }> => {
    if (document.status === "registered") return [
      { label: "Mulai telaah", status: "in_review", icon: <ShieldCheck className="h-4 w-4" /> },
      { label: "Arsipkan", status: "archived", icon: <Archive className="h-4 w-4" /> },
    ];
    if (document.status === "in_review") return [
      { label: "Setujui", status: "approved", icon: <ShieldCheck className="h-4 w-4" /> },
      { label: "Perlu perbaikan", status: "rejected", icon: <X className="h-4 w-4" /> },
    ];
    if (document.status === "rejected") return [
      { label: "Telaah ulang", status: "in_review", icon: <ShieldCheck className="h-4 w-4" /> },
      { label: "Arsipkan", status: "archived", icon: <Archive className="h-4 w-4" /> },
    ];
    if (document.status === "approved") return [{ label: "Arsipkan", status: "archived", icon: <Archive className="h-4 w-4" /> }];
    return [];
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Administrasi pesantren</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">Dokumen Digital</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Catat surat masuk, surat keluar, dan dokumen internal dengan alur telaah serta arsip per tenant.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10" aria-label="Muat ulang dokumen">
            <RefreshCw className="h-4 w-4" /> Muat ulang
          </button>
          {canManage && <button type="button" onClick={() => { setDraft(INITIAL_DRAFT); setFormOpen(true); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"><Plus className="h-4 w-4" /> Catat dokumen</button>}
        </div>
      </header>

      {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{error || notice}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["incoming", "outgoing", "internal"] as Direction[]).map((direction) => {
          const Icon = direction === "incoming" ? Inbox : direction === "outgoing" ? Send : FileText;
          return <div key={direction} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60"><div className="flex items-center justify-between text-slate-500 dark:text-slate-400"><span className="text-sm">Surat {DIRECTION_LABEL[direction].toLocaleLowerCase("id-ID")}</span><Icon className="h-4 w-4" /></div><div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{documents.filter((item) => item.direction === direction && item.status !== "archived").length}</div><div className="mt-1 text-xs text-slate-500">di halaman yang dimuat</div></div>;
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div className="border-b border-slate-200 px-4 pt-3 dark:border-white/10 sm:px-5">
          <div role="tablist" aria-label="Jenis dokumen" className="flex gap-2 overflow-x-auto">
            {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition ${tab === item ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>{TAB_LABEL[item]}</button>)}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nomor, perihal, pengirim..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-slate-950/40 dark:text-white" /></div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Data dibatasi pada tenant aktif</span>
        </div>

        {tab === "ocr" ? <ERPFeatureStatus title="Pemindai OCR" description="Menu OCR tetap terlihat mengikuti acuan. Pembacaan otomatis belum terhubung ke layanan Supabase; unggah dan ekstraksi teks tidak dijalankan." />
          : loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Memuat daftar dokumen...</div>
          : error && documents.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><FileText className="h-9 w-9 text-slate-300 dark:text-slate-600" /><h2 className="mt-3 font-medium text-slate-800 dark:text-slate-200">Dokumen belum dapat dimuat</h2><p className="mt-1 max-w-lg text-sm text-slate-500">Periksa koneksi atau kesiapan layanan Supabase, lalu coba muat ulang.</p><button type="button" onClick={() => void refresh()} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Coba lagi</button></div>
          : filtered.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><FileText className="h-9 w-9 text-slate-300 dark:text-slate-600" /><h2 className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada dokumen</h2><p className="mt-1 max-w-lg text-sm text-slate-500">Catat surat atau dokumen pertama. Data contoh tidak ditampilkan pada runtime Supabase.</p>{canManage && <button type="button" onClick={() => setFormOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Catat dokumen</button>}</div>
          : <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filtered.map((document) => <article key={document.id} className="p-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{document.documentNumber}</span><span className="text-xs font-medium text-slate-500">{DIRECTION_LABEL[document.direction]}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[document.status]}`}>{STATUS_LABEL[document.status]}</span></div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{document.subject}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{document.direction === "incoming" ? `Dari ${document.senderName || "—"}` : document.direction === "outgoing" ? `Kepada ${document.recipientName || "—"}` : `Pengirim ${document.senderName || "—"} · Penerima ${document.recipientName || "—"}`} <span className="mx-1">·</span> {formatDate(document.documentDate)}</p>
                  {document.summary && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{document.summary}</p>}
                  {document.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{document.attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => void downloadAttachment(attachment)} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:text-slate-300 dark:hover:text-emerald-300"><ArrowDownToLine className="h-3.5 w-3.5 shrink-0" /><span className="max-w-56 truncate">{attachment.fileName}</span><span className="text-slate-400">{formatFileSize(attachment.fileSize)}</span></button>)}</div>}
                </div>
                {canManage && <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                  {document.status !== "archived" && <button type="button" disabled={busyDocumentId === document.id} onClick={() => chooseAttachment(document.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><UploadCloud className="h-3.5 w-3.5" /> Tambah PDF</button>}
                  {statusActions(document).map((action) => <button key={action.status} type="button" disabled={busyDocumentId === document.id} onClick={() => void changeStatus(document, action.status)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">{busyDocumentId === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action.icon}{action.label}</button>)}
                </div>}
              </div>
            </article>)}
          </div>}

        {!loading && nextCursor && <div className="border-t border-slate-200 p-4 text-center dark:border-white/10"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownWideNarrow className="h-4 w-4" />} Muat halaman berikutnya</button></div>}
      </div>

      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />

      {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
        <form onSubmit={createDocument} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="document-dialog-title">
          <div className="flex items-start justify-between gap-3"><div><h2 id="document-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">Catat dokumen</h2><p className="mt-1 text-sm text-slate-500">Nomor dokumen harus unik dalam pesantren ini.</p></div><button type="button" disabled={saving} onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5" aria-label="Tutup"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Jenis dokumen<select value={draft.direction} onChange={(event) => setDraft((item) => ({ ...item, direction: event.target.value as Direction }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white"><option value="incoming">Surat masuk</option><option value="outgoing">Surat keluar</option><option value="internal">Dokumen internal</option></select></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Tanggal dokumen<input required type="date" value={draft.documentDate} onChange={(event) => setDraft((item) => ({ ...item, documentDate: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Nomor dokumen<input required maxLength={80} value={draft.documentNumber} onChange={(event) => setDraft((item) => ({ ...item, documentNumber: event.target.value }))} placeholder="Contoh: 012/PP/2026" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Perihal<input required maxLength={240} value={draft.subject} onChange={(event) => setDraft((item) => ({ ...item, subject: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Pengirim<input maxLength={200} value={draft.senderName} onChange={(event) => setDraft((item) => ({ ...item, senderName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Penerima<input maxLength={200} value={draft.recipientName} onChange={(event) => setDraft((item) => ({ ...item, recipientName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Ringkasan<textarea maxLength={2000} rows={3} value={draft.summary} onChange={(event) => setDraft((item) => ({ ...item, summary: event.target.value }))} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950 dark:text-white" /></label>
          </div>
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/5 dark:text-sky-200">Setelah dicatat, lampiran PDF dapat ditambahkan melalui tombol “Tambah PDF”. Berkas disimpan privat dan hanya dibuka melalui tautan sementara.</div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Batal</button><button type="submit" disabled={saving || !canManage} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Simpan dokumen</button></div>
        </form>
      </div>}
    </section>
  );
}
