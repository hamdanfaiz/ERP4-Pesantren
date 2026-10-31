import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Building2, Check, ChevronDown, Loader2, MessageSquareText, Plus, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";
import { ERPFeatureStatus, ERPTabs } from "../components/ERPDesignSystem";

type CrmTab = "directory" | "pipeline" | "broadcast" | "analytics";
const CRM_TABS: Array<{ id: CrmTab; label: string }> = [
  { id: "directory", label: "Direktori" },
  { id: "pipeline", label: "Alur Prospek" },
  { id: "broadcast", label: "Siaran" },
  { id: "analytics", label: "Analitik" },
];

type ContactType = "parent" | "prospect" | "alumni" | "donor" | "partner";
type LifecycleStage = "lead" | "qualified" | "engaged" | "active" | "lost";
type Consent = "unknown" | "granted" | "revoked";
type Contact = {
  id: string; contactType: ContactType; name: string; organizationName: string; email: string; phone: string;
  lifecycleStage: LifecycleStage; marketingConsent: Consent; consentSource: string; consentRecordedAt: string | null;
  interactionCount: number; lastInteractionAt: string | null; createdAt: string; updatedAt: string;
};
type Interaction = {
  id: string; contactId: string; interactionType: string; direction: string; subject: string;
  summary: string; occurredAt: string; createdAt: string;
};
type Summary = { totalContacts: number; openLeads: number; interactionsLast30Days: number; marketingConsentedContacts: number };
type ContactDraft = Omit<Contact, "id" | "consentRecordedAt" | "interactionCount" | "lastInteractionAt" | "createdAt" | "updatedAt"> & { consentSource: string };
type Page = { contacts: Contact[]; nextCursor: string | null; summary: Summary };
type InteractionPage = { interactions: Interaction[]; nextCursor: string | null };

const EMPTY_SUMMARY: Summary = { totalContacts: 0, openLeads: 0, interactionsLast30Days: 0, marketingConsentedContacts: 0 };
const EMPTY_DRAFT: ContactDraft = { contactType: "prospect", name: "", organizationName: "", email: "", phone: "", lifecycleStage: "lead", marketingConsent: "unknown", consentSource: "" };
const CONTACT_TYPES: Array<[ContactType, string]> = [["parent", "Wali santri"], ["prospect", "Calon wali"], ["alumni", "Alumni"], ["donor", "Donatur"], ["partner", "Mitra"]];
const STAGES: Array<[LifecycleStage, string]> = [["lead", "Prospek baru"], ["qualified", "Terkualifikasi"], ["engaged", "Berinteraksi"], ["active", "Aktif"], ["lost", "Tidak dilanjutkan"]];
const INTERACTION_TYPES: Array<[string, string]> = [["call", "Telepon"], ["email", "Email"], ["meeting", "Pertemuan"], ["message", "Pesan"], ["note", "Catatan"]];
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/40";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10";

async function crmRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Layanan CRM belum dapat diproses.");
  return body as T;
}

function displayDate(value?: string | null) {
  if (!value) return "Belum ada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Belum ada" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function typeLabel(value: ContactType) { return CONTACT_TYPES.find(([key]) => key === value)?.[1] || value; }
function stageLabel(value: LifecycleStage) { return STAGES.find(([key]) => key === value)?.[1] || value; }

export function SupabaseCrmManager() {
  const { role, user } = useAuth();
  const [tab, setTab] = useState<CrmTab>("directory");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [interactionCursor, setInteractionCursor] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [interactionDraft, setInteractionDraft] = useState({ interactionType: "note", direction: "internal", subject: "", summary: "" });
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const canManage = (role === "Admin" || role === "SuperAdmin") && user?.modulePermissions?.crm !== false;
  const selectedContact = useMemo(() => contacts.find((contact) => contact.id === selectedId) || null, [contacts, selectedId]);

  const queryString = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (contactTypeFilter) params.set("contactType", contactTypeFilter);
    if (stageFilter) params.set("lifecycleStage", stageFilter);
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const loadContacts = useCallback(async (cursor?: string | null, append = false) => {
    const result = await crmRequest<Page>(`/api/crm/contacts${queryString(cursor)}`);
    const rows = Array.isArray(result.contacts) ? result.contacts : [];
    setContacts((current) => append ? [...current, ...rows] : rows);
    setSummary(result.summary || EMPTY_SUMMARY);
    setNextCursor(typeof result.nextCursor === "string" ? result.nextCursor : null);
    if (!append) setSelectedId((current) => rows.some((contact) => contact.id === current) ? current : rows[0]?.id || "");
    return rows;
  }, [search, contactTypeFilter, stageFilter]);

  const refresh = useCallback(async () => {
    setError(""); setNotice(""); setLoading(true);
    try { await loadContacts(null, false); }
    catch (loadError: any) { setError(loadError?.message || "Daftar kontak CRM belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [loadContacts]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setInteractions([]); setInteractionCursor(null); return; }
    let active = true;
    setLoadingInteractions(true);
    crmRequest<InteractionPage>(`/api/crm/contacts/${encodeURIComponent(selectedId)}/interactions`)
      .then((result) => { if (active) { setInteractions(Array.isArray(result.interactions) ? result.interactions : []); setInteractionCursor(result.nextCursor || null); } })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Riwayat interaksi belum dapat dimuat."); })
      .finally(() => { if (active) setLoadingInteractions(false); });
    return () => { active = false; };
  }, [selectedId]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchInput.trim() && searchInput.trim().length < 3) { setError("Pencarian minimal 3 karakter."); return; }
    setError(""); setSearch(searchInput.trim());
  };

  const openCreate = () => { setEditingId(""); setDraft(EMPTY_DRAFT); setFormOpen(true); setError(""); };
  const openEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setDraft({ contactType: contact.contactType, name: contact.name, organizationName: contact.organizationName, email: contact.email, phone: contact.phone, lifecycleStage: contact.lifecycleStage, marketingConsent: contact.marketingConsent, consentSource: contact.consentSource || "" });
    setFormOpen(true); setError("");
  };

  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const payload = { ...draft, contactId: editingId || undefined };
    let lease: Awaited<ReturnType<typeof pendingMutationIds.acquire>> | null = null;
    try {
      lease = await pendingMutationIds.acquire(`crm-contact:${user?.uid || "unknown"}:${editingId || "new"}`, payload);
      await crmRequest(editingId ? `/api/crm/contacts/${encodeURIComponent(editingId)}` : "/api/crm/contacts", {
        method: editingId ? "PUT" : "POST", body: JSON.stringify({ contact: { ...payload, clientRequestId: lease.requestId } }),
      });
      lease.clear(); setFormOpen(false); setNotice(editingId ? "Kontak berhasil diperbarui." : "Kontak berhasil ditambahkan.");
      await loadContacts(null, false);
    } catch (saveError: any) { setError(saveError?.message || "Kontak belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const addInteraction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContact) return;
    setInteractionBusy(true); setError(""); setNotice("");
    const payload = { contactId: selectedContact.id, ...interactionDraft };
    let lease: Awaited<ReturnType<typeof pendingMutationIds.acquire>> | null = null;
    try {
      lease = await pendingMutationIds.acquire(`crm-interaction:${user?.uid || "unknown"}`, payload);
      await crmRequest("/api/crm/interactions", { method: "POST", body: JSON.stringify({ interaction: { ...payload, clientRequestId: lease.requestId } }) });
      lease.clear(); setInteractionDraft({ interactionType: "note", direction: "internal", subject: "", summary: "" });
      setNotice("Interaksi berhasil dicatat.");
      const result = await crmRequest<InteractionPage>(`/api/crm/contacts/${encodeURIComponent(selectedContact.id)}/interactions`);
      setInteractions(result.interactions || []); setInteractionCursor(result.nextCursor || null);
      await loadContacts(null, false);
    } catch (saveError: any) { setError(saveError?.message || "Interaksi belum dapat dicatat."); }
    finally { setInteractionBusy(false); }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError("");
    try { await loadContacts(nextCursor, true); }
    catch (loadError: any) { setError(loadError?.message || "Halaman berikutnya belum dapat dimuat."); }
    finally { setLoadingMore(false); }
  };

  const loadMoreInteractions = async () => {
    if (!selectedId || !interactionCursor) return;
    try {
      const result = await crmRequest<InteractionPage>(`/api/crm/contacts/${encodeURIComponent(selectedId)}/interactions?cursor=${encodeURIComponent(interactionCursor)}`);
      setInteractions((current) => [...current, ...(result.interactions || [])]); setInteractionCursor(result.nextCursor || null);
    } catch (loadError: any) { setError(loadError?.message || "Riwayat berikutnya belum dapat dimuat."); }
  };

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Relasi pesantren</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">CRM Pesantren</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Kelola relasi wali, calon wali, alumni, donatur, dan mitra dalam ruang data tenant pesantren.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void refresh()} className={buttonClass} aria-label="Muat ulang kontak CRM"><RefreshCw className="h-4 w-4" /> Muat ulang</button>
        {canManage && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"><Plus className="h-4 w-4" /> Tambah kontak</button>}
      </div>
    </header>

    <ERPTabs tabs={CRM_TABS} value={tab} onChange={(id) => { setTab(id as CrmTab); setFormOpen(false); setError(""); }} ariaLabel="Bagian Relasi Wali dan Donatur" />

    {tab === "broadcast" && <ERPFeatureStatus title="Siaran" description="Pengiriman siaran belum terhubung ke penyedia pesan dan alur persetujuan. CRM saat ini hanya mencatat relasi serta persetujuan menerima informasi; tidak ada pesan yang dikirim." />}
    {tab === "analytics" && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[[Users, "Total relasi", summary.totalContacts], [Activity, "Prospek terbuka", summary.openLeads], [MessageSquareText, "Interaksi 30 hari", summary.interactionsLast30Days], [ShieldCheck, "Setuju menerima informasi", summary.marketingConsentedContacts]].map(([Icon, label, value]: any) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"><div className="flex items-center justify-between"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : Number(value).toLocaleString("id-ID")}</p></article>)}</section>}

    {(tab === "directory" || tab === "pipeline") && <>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{error || notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[[Users, "Total relasi", summary.totalContacts], [Activity, "Prospek terbuka", summary.openLeads], [MessageSquareText, "Interaksi 30 hari", summary.interactionsLast30Days], [ShieldCheck, "Setuju menerima informasi", summary.marketingConsentedContacts]].map(([Icon, label, value]: any) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"><div className="flex items-center justify-between"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : Number(value).toLocaleString("id-ID")}</p></article>)}
    </div>

    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-950/25 dark:text-sky-200">
      <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Pengiriman kampanye belum diaktifkan.</strong> CRM ini hanya menyimpan relasi dan catatan interaksi. Sistem tidak mengirim email atau pesan otomatis; persetujuan pemasaran dicatat terpisah.</p></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <div className="border-b border-slate-100 p-4 dark:border-white/10">
          <form onSubmit={submitSearch} className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_170px_170px_auto]">
            <label className="relative"><span className="sr-only">Cari kontak</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${inputClass} pl-9`} placeholder="Nama, lembaga, email, telepon" /></label>
            <label><span className="sr-only">Jenis kontak</span><select className={inputClass} value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value)}><option value="">Semua jenis</option>{CONTACT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="sr-only">Tahap relasi</span><select className={inputClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">Semua tahap</option>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"><Search className="h-4 w-4" /> Cari</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/[0.03] dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold">Nama relasi</th><th className="px-4 py-3 font-semibold">Jenis</th><th className="px-4 py-3 font-semibold">Tahap</th><th className="px-4 py-3 font-semibold">Interaksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat kontak tenant…</td></tr>}
              {!loading && contacts.map((contact) => <tr key={contact.id} onClick={() => setSelectedId(contact.id)} className={`cursor-pointer transition hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 ${selectedId === contact.id ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                <td className="px-4 py-3"><div className="font-semibold text-slate-900 dark:text-white">{contact.name}</div><div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">{contact.organizationName ? <><Building2 className="h-3 w-3" />{contact.organizationName}</> : contact.email || contact.phone || "Belum ada detail kontak"}</div></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{typeLabel(contact.contactType)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">{stageLabel(contact.lifecycleStage)}</span></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{contact.interactionCount}</td>
              </tr>)}
              {!loading && contacts.length === 0 && <tr><td colSpan={4} className="px-4 py-14 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5"><Users className="h-5 w-5" /></div><p className="mt-3 font-medium text-slate-800 dark:text-white">Belum ada kontak pada filter ini</p><p className="mt-1 text-sm text-slate-500">Tambahkan kontak untuk mulai mencatat relasi pesantren.</p></td></tr>}
            </tbody>
          </table>
        </div>
        {nextCursor && <div className="border-t border-slate-100 p-3 text-center dark:border-white/10"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClass}>{loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />} Muat kontak berikutnya</button></div>}
      </section>

      <aside className="space-y-4">
        {selectedContact ? <>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{typeLabel(selectedContact.contactType)}</p><h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{selectedContact.name}</h2></div>{canManage && <button type="button" onClick={() => openEdit(selectedContact)} className={buttonClass}>Ubah</button>}</div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-0.5 break-all text-slate-800 dark:text-slate-200">{selectedContact.email || "—"}</dd></div><div><dt className="text-xs text-slate-500">Telepon</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{selectedContact.phone || "—"}</dd></div><div><dt className="text-xs text-slate-500">Persetujuan info</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{selectedContact.marketingConsent === "granted" ? "Disetujui" : selectedContact.marketingConsent === "revoked" ? "Dicabut" : "Belum dicatat"}</dd></div><div><dt className="text-xs text-slate-500">Interaksi terakhir</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-200">{displayDate(selectedContact.lastInteractionAt)}</dd></div></dl>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900 dark:text-white">Catatan interaksi</h3><span className="text-xs text-slate-500">Tidak dapat diubah</span></div>
            {canManage && <form onSubmit={addInteraction} className="mt-4 space-y-2.5">
              <div className="grid grid-cols-2 gap-2"><label><span className="sr-only">Jenis interaksi</span><select className={inputClass} value={interactionDraft.interactionType} onChange={(event) => setInteractionDraft((current) => ({ ...current, interactionType: event.target.value }))}>{INTERACTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="sr-only">Arah interaksi</span><select className={inputClass} value={interactionDraft.direction} onChange={(event) => setInteractionDraft((current) => ({ ...current, direction: event.target.value }))}><option value="internal">Internal</option><option value="inbound">Masuk</option><option value="outbound">Keluar</option></select></label></div>
              <input required maxLength={200} className={inputClass} placeholder="Judul interaksi" value={interactionDraft.subject} onChange={(event) => setInteractionDraft((current) => ({ ...current, subject: event.target.value }))} />
              <textarea maxLength={2000} rows={2} className={inputClass} placeholder="Ringkasan singkat (opsional)" value={interactionDraft.summary} onChange={(event) => setInteractionDraft((current) => ({ ...current, summary: event.target.value }))} />
              <button disabled={interactionBusy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">{interactionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Catat interaksi</button>
            </form>}
            <div className="mt-4 space-y-3">
              {loadingInteractions && <p className="py-4 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />Memuat riwayat…</p>}
              {!loadingInteractions && interactions.map((interaction) => <div key={interaction.id} className="border-l-2 border-emerald-500 pl-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-900 dark:text-white">{interaction.subject}</p><span className="shrink-0 text-[11px] text-slate-500">{interaction.direction === "inbound" ? <ArrowDown className="inline h-3 w-3" /> : interaction.direction === "outbound" ? <ArrowUp className="inline h-3 w-3" /> : <Check className="inline h-3 w-3" />} {displayDate(interaction.occurredAt)}</span></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{INTERACTION_TYPES.find(([value]) => value === interaction.interactionType)?.[1] || interaction.interactionType}{interaction.summary ? ` · ${interaction.summary}` : ""}</p></div>)}
              {!loadingInteractions && interactions.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Belum ada catatan interaksi.</p>}
              {interactionCursor && <button type="button" onClick={() => void loadMoreInteractions()} className="w-full py-2 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">Tampilkan riwayat sebelumnya</button>}
            </div>
          </article>
        </> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-white/15"><Users className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-medium text-slate-800 dark:text-white">Pilih kontak</p><p className="mt-1 text-sm text-slate-500">Rincian dan catatan interaksi akan tampil di sini.</p></div>}
      </aside>
    </div>
    </>}

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
      <form onSubmit={saveContact} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editingId ? "Perbarui kontak" : "Tambah kontak"}</h2><p className="mt-1 text-sm text-slate-500">Semua data tersimpan untuk tenant pesantren aktif.</p></div><button type="button" onClick={() => setFormOpen(false)} className={buttonClass} aria-label="Tutup formulir"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Nama kontak<input required minLength={2} maxLength={160} className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Jenis kontak<select className={inputClass} value={draft.contactType} onChange={(event) => setDraft((current) => ({ ...current, contactType: event.target.value as ContactType }))}>{CONTACT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Nama lembaga<input maxLength={200} className={inputClass} value={draft.organizationName} onChange={(event) => setDraft((current) => ({ ...current, organizationName: event.target.value }))} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Email<input type="email" maxLength={254} className={inputClass} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Nomor telepon<input maxLength={32} className={inputClass} value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Tahap relasi<select className={inputClass} value={draft.lifecycleStage} onChange={(event) => setDraft((current) => ({ ...current, lifecycleStage: event.target.value as LifecycleStage }))}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Persetujuan menerima informasi<select className={inputClass} value={draft.marketingConsent} onChange={(event) => setDraft((current) => ({ ...current, marketingConsent: event.target.value as Consent, consentSource: event.target.value === "unknown" ? "" : current.consentSource }))}><option value="unknown">Belum dicatat</option><option value="granted">Disetujui</option><option value="revoked">Dicabut</option></select></label>
          {draft.marketingConsent !== "unknown" && <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Sumber atau bukti persetujuan/pencabutan<input required maxLength={120} className={inputClass} placeholder="Contoh: formulir tertulis, 26-10-2026" value={draft.consentSource} onChange={(event) => setDraft((current) => ({ ...current, consentSource: event.target.value }))} /></label>}
        </div>
        <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={() => setFormOpen(false)} className={buttonClass}>Batal</button><button disabled={saving || !canManage} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{editingId ? "Simpan perubahan" : "Simpan kontak"}</button></div>
      </form>
    </div>}
  </section>;
}
