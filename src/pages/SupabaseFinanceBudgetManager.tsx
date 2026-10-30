import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, AlertCircle, Check, ClipboardList, Loader2, Plus, RefreshCw, Save, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";

type BudgetLine = {
  id: string;
  department: string;
  category: string;
  allocatedAmount: number;
  actualAmount: number | null;
};

type BudgetPlan = {
  id: string;
  unitId: string | null;
  unitCode?: string | null;
  unitName?: string | null;
  unitStatus?: "active" | "inactive" | null;
  needsUnitMapping: boolean;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
  status: "draft" | "approved" | "closed";
  createdByUserId: string;
  updatedByUserId: string;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  closedByUserId?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: BudgetLine[];
};

type OrganizationUnit = { id: string; code: string; name: string; status: "active" | "inactive" };
type Snapshot = { plans: BudgetPlan[]; units: OrganizationUnit[]; financeLocked: boolean };
type DraftLine = { department: string; category: string; allocatedAmount: string };
type Draft = { unitId: string; periodLabel: string; periodStart: string; periodEnd: string; notes: string; lines: DraftLine[] };

const EMPTY: Snapshot = { plans: [], units: [], financeLocked: false };
const EMPTY_DRAFT: Draft = { unitId: "", periodLabel: "", periodStart: "", periodEnd: "", notes: "", lines: [{ department: "", category: "", allocatedAmount: "" }] };
const FIELD = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5";

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: BudgetPlan["status"]) {
  if (status === "approved") return "Disetujui";
  if (status === "closed") return "Ditutup";
  return "Rancangan";
}

async function requestBudget(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan anggaran belum dapat diproses.");
  return payload;
}

async function runIdempotentBudgetMutation<T>(
  action: string,
  tenantId: string,
  actorId: string,
  payload: unknown,
  send: (clientRequestId: string) => Promise<T>,
) {
  const lease = await pendingMutationIds.acquire(`erp:finance-budget:${action}`, { tenantId, actorId, payload });
  const result = await send(lease.requestId);
  lease.clear();
  return result;
}

export function SupabaseFinanceBudgetManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [mappingUnitSelections, setMappingUnitSelections] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const refresh = useCallback(async () => {
    const result = await requestBudget("/api/erp/budget/snapshot");
    const units = Array.isArray(result.units) ? result.units : [];
    setSnapshot({ plans: Array.isArray(result.plans) ? result.plans : [], units, financeLocked: result.financeLocked === true });
    setSelectedUnitId((current) => current || units.find((unit: OrganizationUnit) => unit.status === "active")?.id || "");
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestBudget("/api/erp/budget/snapshot")
      .then((result) => {
        if (active) {
          const units = Array.isArray(result.units) ? result.units : [];
          setSnapshot({ plans: Array.isArray(result.plans) ? result.plans : [], units, financeLocked: result.financeLocked === true });
          setSelectedUnitId((current) => current || units.find((unit: OrganizationUnit) => unit.status === "active")?.id || "");
        }
      })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data anggaran belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, user?.tenantId, user?.uid]);

  const activeUnits = useMemo(() => snapshot.units.filter((unit) => unit.status === "active"), [snapshot.units]);
  const selectedUnit = snapshot.units.find((unit) => unit.id === selectedUnitId) || null;
  const unitPlans = useMemo(() => snapshot.plans.filter((plan) => plan.unitId === selectedUnitId), [snapshot.plans, selectedUnitId]);
  const unmappedPlans = useMemo(() => snapshot.plans.filter((plan) => !plan.unitId), [snapshot.plans]);
  const activePlan = useMemo(() => unitPlans.find((plan) => plan.status !== "closed") || null, [unitPlans]);
  const totals = useMemo(() => {
    const lines = activePlan?.lines || [];
    const allocated = lines.reduce((sum, line) => sum + Number(line.allocatedAmount || 0), 0);
    const actual = lines.reduce((sum, line) => sum + Number(line.actualAmount ?? 0), 0);
    return { allocated, actual, remaining: allocated - actual };
  }, [activePlan]);

  const clearForm = () => { setEditingId(null); setDraft({ ...EMPTY_DRAFT, unitId: selectedUnitId }); };

  const mutation = async (action: "save_draft" | "approve" | "close" | "map_legacy_unit", plan: Draft | { unitId: string } | null, planId: string | null) => {
    setSaving(true);
    setError("");
    setNotice("");
    const mutationPayload = { action, planId, plan };
    try {
      const result = await runIdempotentBudgetMutation(action, user?.tenantId || "", user?.uid || "", mutationPayload,
        (clientRequestId) => requestBudget("/api/erp/budget/mutations", {
          method: "POST",
          body: JSON.stringify({ ...mutationPayload, clientRequestId }),
        }));
      setNotice(result.alreadyApplied ? "Permintaan ini sudah diterapkan sebelumnya." : action === "approve" ? "Rencana anggaran disetujui." : action === "close" ? "Rencana anggaran ditutup." : action === "map_legacy_unit" ? "Unit untuk rencana lama berhasil dipetakan." : "Rancangan anggaran tersimpan.");
      if (action === "save_draft") clearForm();
      try { await refresh(); }
      catch { setError("Perubahan sudah tersimpan, tetapi daftar belum berhasil dimuat. Tekan Muat ulang."); }
    } catch (saveError: any) {
      setError(saveError?.message || "Perubahan anggaran belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (plan: BudgetPlan) => {
    setEditingId(plan.id);
    setDraft({
      unitId: plan.unitId && activeUnits.some((unit) => unit.id === plan.unitId) ? plan.unitId : "",
      periodLabel: plan.periodLabel,
      periodStart: plan.periodStart.slice(0, 10),
      periodEnd: plan.periodEnd.slice(0, 10),
      notes: plan.notes || "",
      lines: plan.lines.length ? plan.lines.map((line) => ({ department: line.department, category: line.category, allocatedAmount: String(line.allocatedAmount) })) : [{ department: "", category: "", allocatedAmount: "" }],
    });
    setError("");
  };

  const formValid = useMemo(() => {
    if (!draft.unitId || !draft.periodLabel.trim() || !draft.periodStart || !draft.periodEnd || draft.periodEnd < draft.periodStart || !draft.lines.length) return false;
    const seen = new Set<string>();
    return draft.lines.every((line) => {
      const department = line.department.trim();
      const category = line.category.trim();
      const amount = Number(line.allocatedAmount);
      const key = `${department.toLocaleLowerCase()}\u0000${category.toLocaleLowerCase()}`;
      if (!department || !category || !Number.isSafeInteger(amount) || amount <= 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [draft]);

  const addLine = () => setDraft((current) => ({ ...current, lines: [...current.lines, { department: "", category: "", allocatedAmount: "" }] }));
  const removeLine = (index: number) => setDraft((current) => ({ ...current, lines: current.lines.length === 1 ? current.lines : current.lines.filter((_, lineIndex) => lineIndex !== index) }));

  if (role !== "Admin" && role !== "SuperAdmin") {
    return <main className="mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">Anggaran hanya dapat dikelola Admin tenant.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ClipboardList className="h-5 w-5" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Keuangan & Anggaran</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Susun RKAT per periode dan pantau realisasi dari pengeluaran yang disetujui serta tercatat di buku Keuangan.</p>
        </div>
        <button type="button" className={OUTLINE} disabled={loading || saving} onClick={() => { setLoading(true); setError(""); refresh().catch((e: any) => setError(e?.message || "Data anggaran belum dapat dimuat.")).finally(() => setLoading(false)); }}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang
        </button>
      </header>

      {snapshot.financeLocked && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Buku Keuangan sedang ditutup. Pengelolaan RKAT tidak memposting transaksi; pengeluaran tetap mengikuti kontrol buku Keuangan.</div>}
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><Check className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <section aria-label="Ringkasan anggaran aktif" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Alokasi rencana aktif", value: currency(totals.allocated), tone: "text-slate-900 dark:text-white" },
          { label: "Realisasi tercatat", value: currency(totals.actual), tone: "text-blue-700 dark:text-blue-300" },
          { label: "Sisa alokasi", value: currency(totals.remaining), tone: totals.remaining < 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300" },
        ].map((item) => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><p className="text-xs font-medium text-slate-500">{item.label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>{!activePlan && <p className="mt-1 text-xs text-slate-500">Buat rancangan periode untuk melihat ringkasan.</p>}</article>)}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold text-slate-900 dark:text-white">{editingId ? "Ubah rancangan" : "Buat rancangan RKAT"}</h2><p className="mt-1 text-xs text-slate-500">Setiap bagian dan kategori hanya dapat dicatat satu kali dalam satu rencana.</p></div>
          {editingId && <button type="button" className={OUTLINE} onClick={clearForm}><X className="h-4 w-4" />Batal ubah</button>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void mutation("save_draft", draft, editingId); }} className="space-y-4">
          <label className="block max-w-xl text-sm font-medium text-slate-700 dark:text-slate-200">Unit pesantren<select required className={`${FIELD} mt-1.5`} value={draft.unitId} onChange={(event) => { setDraft({ ...draft, unitId: event.target.value }); setSelectedUnitId(event.target.value); }}><option value="">Pilih unit aktif</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nama periode<input required maxLength={120} className={`${FIELD} mt-1.5`} placeholder="Tahun ajaran 2026/2027" value={draft.periodLabel} onChange={(event) => setDraft({ ...draft, periodLabel: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Mulai<input required type="date" className={`${FIELD} mt-1.5`} value={draft.periodStart} onChange={(event) => setDraft({ ...draft, periodStart: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Selesai<input required type="date" className={`${FIELD} mt-1.5`} value={draft.periodEnd} onChange={(event) => setDraft({ ...draft, periodEnd: event.target.value })} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Catatan<textarea maxLength={2000} rows={2} className={`${FIELD} mt-1.5`} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Alokasi per bagian dan kategori</h3><button type="button" className={OUTLINE} onClick={addLine} disabled={saving || draft.lines.length >= 500}><Plus className="h-4 w-4" />Tambah alokasi</button></div>
            {draft.lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end dark:border-white/10">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Bagian<input required maxLength={120} className={`${FIELD} mt-1`} placeholder="Operasional" value={line.department} onChange={(event) => setDraft((current) => ({ ...current, lines: current.lines.map((item, row) => row === index ? { ...item, department: event.target.value } : item) }))} /></label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Kategori<input required maxLength={100} className={`${FIELD} mt-1`} placeholder="Listrik" value={line.category} onChange={(event) => setDraft((current) => ({ ...current, lines: current.lines.map((item, row) => row === index ? { ...item, category: event.target.value } : item) }))} /></label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Alokasi (Rp)<input required type="number" min="1" max="999999999999" step="1" className={`${FIELD} mt-1`} placeholder="500000" value={line.allocatedAmount} onChange={(event) => setDraft((current) => ({ ...current, lines: current.lines.map((item, row) => row === index ? { ...item, allocatedAmount: event.target.value } : item) }))} /></label>
              <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700" aria-label={`Hapus alokasi ${index + 1}`} disabled={saving || draft.lines.length <= 1} onClick={() => removeLine(index)}><X className="h-4 w-4" /></button>
            </div>)}
          </div>
          <div className="flex justify-end"><button type="submit" className={PRIMARY} disabled={saving || !formValid}><Save className="h-4 w-4" />{saving ? "Menyimpan…" : "Simpan rancangan"}</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Rencana anggaran per unit</h2><p className="mt-1 text-xs text-slate-500">Realisasi hanya menghitung pengeluaran dan posting buku Keuangan dari unit serta periode yang sama.</p></div><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tampilkan unit<select className={`${FIELD} mt-1 min-w-64`} value={selectedUnitId} onChange={(event) => { setSelectedUnitId(event.target.value); if (!editingId) setDraft((current) => ({ ...current, unitId: event.target.value })); }}>{snapshot.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}{unit.status === "inactive" ? " (nonaktif)" : ""}</option>)}</select></label><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">{unitPlans.length} rencana</span></div>
        {unmappedPlans.length > 0 && <div className="border-b border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20"><h3 className="font-semibold text-amber-950 dark:text-amber-100">Rencana lama perlu dipetakan ke unit</h3><p className="mt-1 text-sm text-amber-900 dark:text-amber-200">Rencana ini tidak dihitung pada ringkasan unit sampai Admin memilih unit yang benar. Pemetaan dicatat dan tidak dilakukan otomatis.</p><ul className="mt-3 space-y-2">{unmappedPlans.map((plan) => <li key={plan.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 dark:border-amber-900 dark:bg-black/10"><span className="min-w-56 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{plan.periodLabel} · {dateLabel(plan.periodStart)} – {dateLabel(plan.periodEnd)} · {statusLabel(plan.status)}</span><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Unit yang benar<select className={`${FIELD} mt-1 min-w-64`} value={mappingUnitSelections[plan.id] || ""} onChange={(event) => setMappingUnitSelections((current) => ({ ...current, [plan.id]: event.target.value }))}><option value="">Pilih unit</option>{snapshot.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}{unit.status === "inactive" ? " (nonaktif)" : ""}</option>)}</select></label><button type="button" className={OUTLINE} disabled={saving || !mappingUnitSelections[plan.id]} onClick={() => { const unitId = mappingUnitSelections[plan.id]; if (!unitId || !window.confirm(`Petakan rencana ${plan.periodLabel} ke unit yang dipilih? Perubahan ini akan dicatat sebagai tindakan Admin.`)) return; setSelectedUnitId(unitId); void mutation("map_legacy_unit", { unitId }, plan.id); }}>Terapkan pemetaan</button></li>)}</ul></div>}
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat rencana anggaran…</div> : unitPlans.length === 0 ? <div className="p-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="mt-3 font-medium text-slate-700 dark:text-slate-200">Belum ada rencana anggaran untuk unit ini</p><p className="mt-1 text-sm text-slate-500">{selectedUnit ? `${selectedUnit.name} dapat mulai dengan membuat rencana sendiri.` : "Pilih atau buat unit aktif sebelum menambahkan RKAT."}</p></div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{unitPlans.map((plan) => {
          const allocated = plan.lines.reduce((sum, line) => sum + Number(line.allocatedAmount || 0), 0);
          const actual = plan.lines.reduce((sum, line) => sum + Number(line.actualAmount ?? 0), 0);
          const statusColor = plan.status === "approved" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : plan.status === "closed" ? "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300" : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200";
          return <article key={plan.id} className="space-y-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{plan.periodLabel}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor}`}>{statusLabel(plan.status)}</span>{plan.unitCode && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-400/10 dark:text-blue-200">{plan.unitCode} · {plan.unitName}</span>}</div><p className="mt-1 text-xs text-slate-500">{dateLabel(plan.periodStart)} – {dateLabel(plan.periodEnd)} · {plan.lines.length} alokasi</p>{plan.notes && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{plan.notes}</p>}</div>
              <div className="flex flex-wrap gap-2">{plan.status === "draft" && <><button type="button" className={OUTLINE} disabled={saving} onClick={() => startEditing(plan)}>Ubah</button><button type="button" className={PRIMARY} disabled={saving || plan.lines.length === 0} onClick={() => void mutation("approve", null, plan.id)}><Check className="h-4 w-4" />Setujui</button></>}{plan.status === "approved" && <button type="button" className={OUTLINE} disabled={saving} onClick={() => { if (window.confirm(`Tutup rencana ${plan.periodLabel}? Rencana tertutup tidak dapat diubah.`)) void mutation("close", null, plan.id); }}><Archive className="h-4 w-4" />Tutup rencana</button>}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3"><Metric label="Total alokasi" value={currency(allocated)} /><Metric label="Realisasi" value={currency(actual)} /><Metric label="Sisa" value={currency(allocated - actual)} /></div>
            {plan.lines.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-3 py-2.5 font-semibold">Bagian</th><th className="px-3 py-2.5 font-semibold">Kategori</th><th className="px-3 py-2.5 text-right font-semibold">Alokasi</th><th className="px-3 py-2.5 text-right font-semibold">Realisasi</th><th className="px-3 py-2.5 text-right font-semibold">Sisa</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{plan.lines.map((line) => <tr key={line.id}><td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{line.department}</td><td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{line.category}</td><td className="px-3 py-2.5 text-right tabular-nums">{currency(line.allocatedAmount)}</td><td className="px-3 py-2.5 text-right tabular-nums">{currency(line.actualAmount)}</td><td className={`px-3 py-2.5 text-right tabular-nums ${line.allocatedAmount - line.actualAmount < 0 ? "font-semibold text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-200"}`}>{currency(line.allocatedAmount - line.actualAmount)}</td></tr>)}</tbody></table></div>}
            {plan.status !== "draft" && <p className="text-xs text-slate-500">{plan.approvedAt ? `Disetujui ${dateLabel(plan.approvedAt)}.` : ""}{plan.closedAt ? ` Ditutup ${dateLabel(plan.closedAt)}.` : ""} Rencana yang disetujui tidak dapat diubah.</p>}
          </article>;
        })}</div>}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p></div>;
}
