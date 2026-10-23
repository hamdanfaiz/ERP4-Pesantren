import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Box, CheckCircle2, ClipboardCheck, Loader2, Package, Pencil, Plus, RefreshCw, Search, ShieldCheck, TrendingDown, Wrench } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type Facility = { id: string; asset_code: string; name: string; category: string; location: string; custodian: string; condition: string; acquisition_value: number; acquired_on: string | null; status: string; last_opname_on: string | null };
type InventoryItem = { id: string; item_code: string; name: string; category: string; quantity: number; minimum_quantity: number; unit: string; unit_cost: number; location: string; status: string; stockStatus: string };
type Movement = { id: string; item_id: string; itemName: string; quantity_delta: number; balance_after: number; reason: string; created_at: string };
type Snapshot = { facilities: Facility[]; inventory: InventoryItem[]; movements: Movement[] };
type Tab = "facilities" | "inventory";
type ImportPreview = { snapshotFingerprint: string; counts: Record<string, number>; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };

const EMPTY: Snapshot = { facilities: [], inventory: [], movements: [] };
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5";
const IMPORT_ENABLED = import.meta.env.VITE_SUPABASE_GA_ASSETS_IMPORT_ENABLED === "true";

async function requestGA(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak tersedia. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Layanan aset General Affairs belum dapat diproses.");
  return result;
}

function money(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function today() { return new Date().toISOString().slice(0, 10); }
const emptyAsset = () => ({ assetCode: "", name: "", category: "Elektronik", location: "", custodian: "", condition: "Baik", acquisitionValue: "0", acquiredOn: today() });
const emptyItem = () => ({ itemCode: "", name: "", category: "ATK", initialQuantity: "0", minimumQuantity: "0", unit: "Pcs", unitCost: "0", location: "Gudang GA" });

export function SupabaseGeneralAffairsAssets() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>("facilities");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [assetDraft, setAssetDraft] = useState(emptyAsset());
  const [editingAsset, setEditingAsset] = useState<Facility | null>(null);
  const [itemDraft, setItemDraft] = useState(emptyItem());
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<Record<string, { direction: "in" | "out"; quantity: string; reason: string }>>({});
  const [opname, setOpname] = useState<{ facility: Facility; condition: string } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const canManage = ["Admin", "SuperAdmin"].includes(role) && user?.modulePermissions?.ga !== false;

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setSnapshot({ ...EMPTY, ...(await requestGA("/api/ga/assets-snapshot")) }); }
    catch (cause: any) { setSnapshot(EMPTY); setError(cause?.message || "Data aset dan inventaris belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);
  useEffect(() => { void refresh(); }, [refresh]);

  const visibleFacilities = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return snapshot.facilities.filter((item) => (!needle || [item.asset_code, item.name, item.category, item.location, item.custodian].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle))) && item.status === "active");
  }, [search, snapshot.facilities]);
  const visibleInventory = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return snapshot.inventory.filter((item) => (!needle || [item.item_code, item.name, item.category, item.location].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle))) && item.status === "active");
  }, [search, snapshot.inventory]);
  const lowStock = snapshot.inventory.filter((item) => item.status === "active" && item.quantity <= item.minimum_quantity).length;
  const assetValue = snapshot.facilities.filter((item) => item.status === "active").reduce((sum, item) => sum + Number(item.acquisition_value || 0), 0);

  const saveAsset = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await requestGA("/api/ga/assets", { method: "POST", body: JSON.stringify({ action: editingAsset ? "update" : "create", ...(editingAsset ? { id: editingAsset.id } : {}), ...assetDraft, clientRequestId: crypto.randomUUID() }) });
      setAssetDraft(emptyAsset()); setEditingAsset(null); setNotice("Data aset tersimpan pada tenant."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Aset belum dapat disimpan."); }
    finally { setBusy(false); }
  };
  const saveOpname = async () => {
    if (!opname) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestGA("/api/ga/assets", { method: "POST", body: JSON.stringify({ action: "opname", id: opname.facility.id, condition: opname.condition, opnameOn: today(), clientRequestId: crypto.randomUUID() }) });
      setOpname(null); setNotice("Hasil pemeriksaan aset tercatat."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Pemeriksaan aset belum dapat dicatat."); }
    finally { setBusy(false); }
  };
  const disposeAsset = async (facility: Facility) => {
    if (!window.confirm(`Tandai ${facility.name} sebagai aset yang sudah dilepas?`)) return;
    setBusy(true); setError("");
    try { await requestGA("/api/ga/assets", { method: "POST", body: JSON.stringify({ action: "dispose", id: facility.id, clientRequestId: crypto.randomUUID() }) }); setNotice("Aset ditandai sebagai dilepas."); await refresh(); }
    catch (cause: any) { setError(cause?.message || "Status aset belum dapat diubah."); }
    finally { setBusy(false); }
  };
  const saveInventory = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await requestGA("/api/ga/inventory", { method: "POST", body: JSON.stringify({ action: editingItem ? "update" : "create", ...(editingItem ? { id: editingItem.id } : {}), ...itemDraft, clientRequestId: crypto.randomUUID() }) });
      setItemDraft(emptyItem()); setEditingItem(null); setNotice("Data inventaris tersimpan."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Inventaris belum dapat disimpan."); }
    finally { setBusy(false); }
  };
  const adjustStock = async (item: InventoryItem) => {
    const draft = adjustmentDraft[item.id];
    if (!draft || !draft.reason.trim() || Number(draft.quantity) < 1) return;
    setBusy(true); setError(""); setNotice("");
    const quantity = Math.floor(Number(draft.quantity));
    try {
      await requestGA("/api/ga/stock-adjustments", { method: "POST", body: JSON.stringify({ itemId: item.id, delta: draft.direction === "in" ? quantity : -quantity, reason: draft.reason.trim(), clientRequestId: crypto.randomUUID() }) });
      setAdjustmentDraft((old) => ({ ...old, [item.id]: { direction: "in", quantity: "", reason: "" } })); setNotice("Mutasi stok tersimpan dalam ledger."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Mutasi stok belum dapat dicatat."); }
    finally { setBusy(false); }
  };
  const archiveItem = async (item: InventoryItem) => {
    if (item.quantity !== 0 || !window.confirm(`Arsipkan ${item.name}?`)) return;
    setBusy(true); setError("");
    try { await requestGA("/api/ga/inventory", { method: "POST", body: JSON.stringify({ action: "archive", id: item.id, clientRequestId: crypto.randomUUID() }) }); setNotice("Inventaris diarsipkan."); await refresh(); }
    catch (cause: any) { setError(cause?.message || "Inventaris belum dapat diarsipkan."); }
    finally { setBusy(false); }
  };
  const previewLegacyImport = async () => {
    setBusy(true); setError(""); setNotice(""); setImportPreview(null);
    try { setImportPreview(await requestGA("/api/ga/legacy/import", { method: "POST", body: JSON.stringify({ action: "preview" }) })); }
    catch (cause: any) { setError(cause?.message || "Pratinjau impor lama belum dapat dibuat."); }
    finally { setBusy(false); }
  };
  const applyLegacyImport = async () => {
    if (!importPreview?.canApply) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestGA("/api/ga/legacy/import", { method: "POST", body: JSON.stringify({ action: "apply", expectedFingerprint: importPreview.snapshotFingerprint }) });
      setImportPreview(null); setNotice(`Impor selesai: ${result.imported || 0} record baru, ${result.skipped || 0} record sudah ada.`); await refresh();
    } catch (cause: any) { setError(cause?.message || "Impor belum dapat diterapkan."); }
    finally { setBusy(false); }
  };

  if (!canManage) return <main className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Register aset dan inventaris Supabase pada tahap ini hanya dapat dikelola Admin tenant yang memiliki izin Sarana & Prasarana.</main>;
  return <main className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" />Sumber data: Supabase tenant</div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Sarana & Prasarana · Aset & Inventaris</h1><p className="mt-1 text-sm text-slate-500">Register fasilitas dan mutasi stok operasional dengan jejak perubahan.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className={OUTLINE}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Bagian yang sudah dipindahkan:</strong> aset/fasilitas dan inventaris barang GA. Pengadaan, kendaraan, housekeeping, dapur, dan tiket pemeliharaan masih berada di jalur lama; tab tersebut belum ikut dialihkan.</div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</div>}{notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
    {IMPORT_ENABLED && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Impor aset dan inventaris lama</h2><p className="mt-1 text-sm text-slate-500">Sumber dibaca dari record Firestore tenant. Data contoh yang hanya ada di browser tidak dimigrasikan.</p></div><button type="button" className={OUTLINE} disabled={busy} onClick={() => void previewLegacyImport()}><RefreshCw className="h-4 w-4" />Pratinjau</button></div>{importPreview && <><div className="flex flex-wrap gap-2 text-xs">{[["Sumber", importPreview.counts.source], ["Aset", importPreview.counts.facilities], ["Inventaris", importPreview.counts.inventory], ["Siap", importPreview.counts.ready], ["Sudah diimpor", importPreview.counts.alreadyImported]].map(([label, value]) => <span key={String(label)} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5">{label}: <strong>{value}</strong></span>)}</div>{importPreview.issueCount > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>{importPreview.blockingCount} konflik memblokir impor.</strong><ul className="mt-2 space-y-1">{importPreview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.recordRef}-${index}`}>{issue.code} · {issue.recordRef || "snapshot"}</li>)}</ul></div>}<button type="button" className={BUTTON} disabled={busy || !importPreview.canApply} onClick={() => void applyLegacyImport()}>Terapkan impor</button></>}</section>}
    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex justify-between text-sm text-slate-500">Aset aktif<Box className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{snapshot.facilities.filter((item) => item.status === "active").length}</p><p className="text-xs text-slate-500">Nilai perolehan {money(assetValue)}</p></article><article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex justify-between text-sm text-slate-500">Barang aktif<Package className="h-4 w-4 text-indigo-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{snapshot.inventory.filter((item) => item.status === "active").length}</p></article><article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex justify-between text-sm text-slate-500">Stok perlu perhatian<TrendingDown className="h-4 w-4 text-amber-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{lowStock}</p><p className="text-xs text-slate-500">Stok sama dengan atau di bawah ambang</p></article></section>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-900" aria-label="Bagian aset dan inventaris GA">{([{ id: "facilities", label: "Register Aset", icon: Box }, { id: "inventory", label: "Stok Operasional", icon: Package }] as const).map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setSearch(""); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === item.id ? "bg-indigo-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}><item.icon className="h-4 w-4" />{item.label}</button>)}</nav>
    <label className={LABEL}><span className="inline-flex items-center gap-2">Cari <Search className="h-3.5 w-3.5" /></span><input className={FIELD} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "facilities" ? "Kode, nama, lokasi, atau penanggung jawab" : "Kode, nama, kategori, atau lokasi"} /></label>
    {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat data GA…</div> : <>
      {tab === "facilities" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)]"><section className="space-y-3">{visibleFacilities.length ? visibleFacilities.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900 dark:text-white">{item.name}</h2><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">{item.asset_code}</span></div><p className="mt-1 text-sm text-slate-500">{item.category} · {item.location}</p></div><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${item.condition === "Baik" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"}`}>{item.condition}</span></div><div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3 dark:text-slate-300"><p>Penanggung jawab: {item.custodian || "—"}</p><p>Nilai perolehan: {money(item.acquisition_value)}</p><p>Opname terakhir: {item.last_opname_on || "Belum dicatat"}</p></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={OUTLINE} onClick={() => { setEditingAsset(item); setAssetDraft({ assetCode: item.asset_code, name: item.name, category: item.category, location: item.location, custodian: item.custodian, condition: item.condition, acquisitionValue: String(item.acquisition_value), acquiredOn: item.acquired_on || "" }); }}><Pencil className="h-4 w-4" />Ubah</button><button type="button" className={OUTLINE} onClick={() => setOpname({ facility: item, condition: item.condition })}><ClipboardCheck className="h-4 w-4" />Opname</button><button type="button" className={OUTLINE} disabled={busy} onClick={() => void disposeAsset(item)}><Archive className="h-4 w-4" />Tandai dilepas</button></div></article>) : <Empty message="Belum ada aset aktif yang cocok." />}</section><form onSubmit={saveAsset} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">{editingAsset ? "Ubah data aset" : "Daftarkan aset"}</h2><label className={LABEL}>Kode aset<input required maxLength={40} className={FIELD} value={assetDraft.assetCode} onChange={(e) => setAssetDraft({ ...assetDraft, assetCode: e.target.value })} /></label><label className={LABEL}>Nama<input required maxLength={180} className={FIELD} value={assetDraft.name} onChange={(e) => setAssetDraft({ ...assetDraft, name: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Kategori<input maxLength={100} className={FIELD} value={assetDraft.category} onChange={(e) => setAssetDraft({ ...assetDraft, category: e.target.value })} /></label><label className={LABEL}>Kondisi<select className={FIELD} value={assetDraft.condition} onChange={(e) => setAssetDraft({ ...assetDraft, condition: e.target.value })}>{["Baik", "Perlu Servis", "Rusak Berat"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label className={LABEL}>Lokasi<input maxLength={180} className={FIELD} value={assetDraft.location} onChange={(e) => setAssetDraft({ ...assetDraft, location: e.target.value })} /></label><label className={LABEL}>Penanggung jawab<input maxLength={160} className={FIELD} value={assetDraft.custodian} onChange={(e) => setAssetDraft({ ...assetDraft, custodian: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nilai perolehan<input type="number" min="0" step="1000" className={FIELD} value={assetDraft.acquisitionValue} onChange={(e) => setAssetDraft({ ...assetDraft, acquisitionValue: e.target.value })} /></label><label className={LABEL}>Tanggal perolehan<input type="date" className={FIELD} value={assetDraft.acquiredOn} onChange={(e) => setAssetDraft({ ...assetDraft, acquiredOn: e.target.value })} /></label></div><div className="flex gap-2"><button disabled={busy} className={BUTTON}><Plus className="h-4 w-4" />Simpan aset</button>{editingAsset && <button type="button" className={OUTLINE} onClick={() => { setEditingAsset(null); setAssetDraft(emptyAsset()); }}>Batal</button>}</div></form></div>}
      {tab === "inventory" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)]"><section className="space-y-3">{visibleInventory.length ? visibleInventory.map((item) => { const draft = adjustmentDraft[item.id] || { direction: "in" as const, quantity: "", reason: "" }; return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900 dark:text-white">{item.name}</h2><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-white/5">{item.item_code}</span></div><p className="mt-1 text-sm text-slate-500">{item.category} · {item.location}</p></div><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${item.stockStatus === "In Stock" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"}`}>{item.stockStatus}</span></div><p className="mt-3 text-sm text-slate-700 dark:text-slate-200">Saldo: <strong>{item.quantity} {item.unit}</strong> · ambang minimum {item.minimum_quantity} · biaya/unit {money(item.unit_cost)}</p><div className="mt-4 grid gap-2 sm:grid-cols-[130px_110px_minmax(120px,1fr)_auto]"><select aria-label="Jenis mutasi stok" className={FIELD + " mt-0"} value={draft.direction} onChange={(e) => setAdjustmentDraft((old) => ({ ...old, [item.id]: { ...draft, direction: e.target.value as "in" | "out" } }))}><option value="in">Stok masuk</option><option value="out">Stok keluar</option></select><input aria-label="Kuantitas" type="number" min="1" step="1" className={FIELD + " mt-0"} placeholder="Jumlah" value={draft.quantity} onChange={(e) => setAdjustmentDraft((old) => ({ ...old, [item.id]: { ...draft, quantity: e.target.value } }))} /><input aria-label="Alasan mutasi" maxLength={1000} className={FIELD + " mt-0"} placeholder="Alasan mutasi" value={draft.reason} onChange={(e) => setAdjustmentDraft((old) => ({ ...old, [item.id]: { ...draft, reason: e.target.value } }))} /><button type="button" className={OUTLINE} disabled={busy || !draft.reason.trim() || !draft.quantity} onClick={() => void adjustStock(item)}>Catat</button></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={OUTLINE} onClick={() => { setEditingItem(item); setItemDraft({ itemCode: item.item_code, name: item.name, category: item.category, initialQuantity: String(item.quantity), minimumQuantity: String(item.minimum_quantity), unit: item.unit, unitCost: String(item.unit_cost), location: item.location }); }}><Pencil className="h-4 w-4" />Ubah detail</button><button type="button" className={OUTLINE} disabled={busy || item.quantity !== 0} title={item.quantity !== 0 ? "Saldo harus nol sebelum diarsipkan" : "Arsipkan item"} onClick={() => void archiveItem(item)}><Archive className="h-4 w-4" />Arsipkan</button></div></article>; }) : <Empty message="Belum ada barang aktif yang cocok." />}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><h2 className="mb-3 font-semibold">Mutasi stok terbaru</h2>{snapshot.movements.length ? <div className="space-y-2">{snapshot.movements.slice(0, 20).map((movement) => <div key={movement.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-white/10"><span>{movement.itemName} · {movement.reason}</span><span className={movement.quantity_delta > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta} · saldo {movement.balance_after} · {new Date(movement.created_at).toLocaleString("id-ID")}</span></div>)}</div> : <Empty message="Belum ada mutasi stok." />}</section></section><form onSubmit={saveInventory} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">{editingItem ? "Ubah inventaris" : "Daftarkan barang"}</h2><label className={LABEL}>Kode barang<input required maxLength={40} className={FIELD} value={itemDraft.itemCode} onChange={(e) => setItemDraft({ ...itemDraft, itemCode: e.target.value })} /></label><label className={LABEL}>Nama barang<input required maxLength={180} className={FIELD} value={itemDraft.name} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Kategori<input maxLength={100} className={FIELD} value={itemDraft.category} onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })} /></label><label className={LABEL}>Satuan<input required maxLength={40} className={FIELD} value={itemDraft.unit} onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })} /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>{editingItem ? "Saldo stok (tidak dapat diedit di sini)" : "Stok awal"}<input type="number" min="0" step="1" className={FIELD} disabled={Boolean(editingItem)} value={itemDraft.initialQuantity} onChange={(e) => setItemDraft({ ...itemDraft, initialQuantity: e.target.value })} /></label><label className={LABEL}>Ambang minimum<input type="number" min="0" step="1" className={FIELD} value={itemDraft.minimumQuantity} onChange={(e) => setItemDraft({ ...itemDraft, minimumQuantity: e.target.value })} /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Biaya per unit<input type="number" min="0" step="100" className={FIELD} value={itemDraft.unitCost} onChange={(e) => setItemDraft({ ...itemDraft, unitCost: e.target.value })} /></label><label className={LABEL}>Lokasi<input maxLength={180} className={FIELD} value={itemDraft.location} onChange={(e) => setItemDraft({ ...itemDraft, location: e.target.value })} /></label></div><div className="flex gap-2"><button disabled={busy} className={BUTTON}><Plus className="h-4 w-4" />Simpan barang</button>{editingItem && <button type="button" className={OUTLINE} onClick={() => { setEditingItem(null); setItemDraft(emptyItem()); }}>Batal</button>}</div></form></div>}
    </>}
    {opname && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="ga-opname-title"><form onSubmit={(event) => { event.preventDefault(); void saveOpname(); }} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-indigo-700" /><h2 id="ga-opname-title" className="font-semibold">Opname aset: {opname.facility.name}</h2></div><label className={LABEL}>Kondisi hasil pemeriksaan<select className={FIELD} value={opname.condition} onChange={(e) => setOpname({ ...opname, condition: e.target.value })}>{["Baik", "Perlu Servis", "Rusak Berat"].map((value) => <option key={value}>{value}</option>)}</select></label><div className="flex justify-end gap-2"><button type="button" className={OUTLINE} onClick={() => setOpname(null)}>Batal</button><button disabled={busy} className={BUTTON}><ClipboardCheck className="h-4 w-4" />Simpan opname</button></div></form></div>}
  </main>;
}

function Empty({ message }: { message: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">{message}</div>; }
