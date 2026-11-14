import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ERPTabs } from "../components/ERPDesignSystem";
import { SupabaseModuleReferenceSettings } from "../components/SupabaseReferenceCatalogManager";
import { getAccessToken } from "../authSession";
import { AlertCircle, Box, CalendarDays, Car, ClipboardList, Coffee, Database, Loader2, ShoppingCart } from "lucide-react";

const AssetsInventory = lazy(() => import("./SupabaseGeneralAffairsAssets").then((module) => ({ default: module.SupabaseGeneralAffairsAssets })));
const FacilityBooking = lazy(() => import("../components/FacilityBooking").then((module) => ({ default: module.FacilityBooking })));
const FacilityOps = lazy(() => import("./SupabaseBoardingFacilityOpsManager").then((module) => ({ default: module.SupabaseBoardingFacilityOpsManager })));

type Tab = "master" | "maintenance" | "assets" | "booking" | "procurement" | "fleet" | "housekeeping" | "kitchen";
type Facility = { id: string; asset_code: string; name: string; category: string; location: string; condition: string; status: string; custodian: string };
type InventoryItem = { id: string; item_code: string; name: string; category: string; quantity: number; minimum_quantity: number; unit: string; location: string; stockStatus: string };
type Movement = { id: string; itemName: string; reason: string; quantity_delta: number; balance_after: number; created_at: string };
type GaSnap = { facilities: Facility[]; inventory: InventoryItem[]; movements: Movement[] };

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "master", label: "Master Data", icon: <Database className="h-4 w-4" /> },
  { id: "maintenance", label: "Tiket & Pemeliharaan", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "assets", label: "Aset & Inventaris", icon: <Box className="h-4 w-4" /> },
  { id: "booking", label: "Pemesanan Fasilitas", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "procurement", label: "Procurement", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "fleet", label: "Fleet & Logistik", icon: <Car className="h-4 w-4" /> },
  { id: "housekeeping", label: "Housekeeping", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "kitchen", label: "Kitchen & Catering", icon: <Coffee className="h-4 w-4" /> },
];

async function requestGa(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Data sarana belum dapat dimuat.");
  return body;
}

function GaLinkedPanel({ mode }: { mode: "procurement" | "fleet" | "kitchen" }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [snapshot, setSnapshot] = useState<GaSnap>({ facilities: [], inventory: [], movements: [] });
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const result = await requestGa("/api/ga/assets-snapshot");
    setSnapshot({
      facilities: Array.isArray(result.facilities) ? result.facilities : [],
      inventory: Array.isArray(result.inventory) ? result.inventory : [],
      movements: Array.isArray(result.movements) ? result.movements : [],
    });
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    refresh()
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Data belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const restock = async (item: InventoryItem) => {
    const quantity = Math.floor(Number(restockQty[item.id] || "0"));
    if (quantity < 1) { setError("Isi jumlah restock minimal 1."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await requestGa("/api/ga/stock-adjustments", {
        method: "POST",
        body: JSON.stringify({
          itemId: item.id,
          delta: quantity,
          reason: mode === "kitchen" ? "Restock dapur/catering" : "Restock pengadaan",
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setRestockQty((current) => ({ ...current, [item.id]: "" }));
      setNotice(`Stok ${item.name} ditambah ${quantity}.`);
      await refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Mutasi stok belum dapat dicatat.");
    } finally { setBusy(false); }
  };

  if (loading) return <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data tenant…</div>;
  if (error && snapshot.inventory.length === 0 && snapshot.facilities.length === 0) return <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>;

  if (mode === "procurement") {
    const reorder = snapshot.inventory.filter((item) => Number(item.quantity) <= Number(item.minimum_quantity));
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kebutuhan pengadaan</h2><p className="mt-1 text-sm text-slate-500">Item di atau di bawah stok minimum. Restock mencatat mutasi masuk ke ledger inventaris tenant.</p></div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="SKU inventaris" value={snapshot.inventory.length} /><Metric label="Perlu restock" value={reorder.length} /><Metric label="Mutasi tercatat" value={snapshot.movements.length} /></div>
      {reorder.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">Tidak ada item di bawah stok minimum.</p>
        : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3 text-right">Stok</th><th className="px-4 py-3 text-right">Minimum</th><th className="px-4 py-3">Restock</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{reorder.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.name}<div className="text-xs text-slate-400">{item.item_code} · {item.category}</div></td><td className="px-4 py-3">{item.location}</td><td className="px-4 py-3 text-right tabular-nums">{item.quantity} {item.unit}</td><td className="px-4 py-3 text-right tabular-nums">{item.minimum_quantity}</td><td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><input type="number" min={1} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-950" value={restockQty[item.id] || ""} onChange={(event) => setRestockQty((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Jumlah restock ${item.name}`} /><button type="button" disabled={busy} onClick={() => void restock(item)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Catat masuk</button></div></td></tr>)}</tbody></table></div>}
    </section>;
  }

  if (mode === "fleet") {
    const activeAssets = snapshot.facilities.filter((item) => item.status !== "Disposed");
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Aset operasional & logistik</h2><p className="mt-1 text-sm text-slate-500">Register aset tenant dipakai sebagai armada/peralatan operasional. Modul trip/logistik armada khusus belum tersedia.</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Aset aktif" value={activeAssets.length} /><Metric label="Perlu servis" value={activeAssets.filter((item) => item.condition !== "Baik").length} /><Metric label="Mutasi stok" value={snapshot.movements.length} /></div>
      {activeAssets.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">Belum ada aset. Tambahkan di Aset & Inventaris.</p>
        : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Aset</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Lokasi / penanggung jawab</th><th className="px-4 py-3">Kondisi</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{activeAssets.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.name}<div className="text-xs text-slate-400">{item.asset_code}</div></td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3">{item.location}<div className="text-xs text-slate-400">{item.custodian || "—"}</div></td><td className="px-4 py-3">{item.condition}</td></tr>)}</tbody></table></div>}
      {snapshot.movements.length > 0 && <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Mutasi stok terbaru</h3><div className="space-y-2">{snapshot.movements.slice(0, 15).map((movement) => <div key={movement.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-white/10"><span>{movement.itemName} · {movement.reason}</span><span className={movement.quantity_delta > 0 ? "text-emerald-700" : "text-rose-700"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta} · saldo {movement.balance_after}</span></div>)}</div></div>}
    </section>;
  }

  const kitchenItems = snapshot.inventory.filter((item) => /dapur|makan|bahan|catering|kitchen|food|minum|beras|minyak|sabun/i.test(`${item.category} ${item.name} ${item.location}`));
  const rows = kitchenItems.length ? kitchenItems : snapshot.inventory;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
    <div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Persediaan dapur & catering</h2><p className="mt-1 text-sm text-slate-500">{kitchenItems.length ? "Item dapur/konsumsi dari inventaris tenant. Restock mencatat mutasi masuk." : "Menampilkan inventaris tenant. Menu/resep catering khusus belum punya API."}</p></div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Item ditampilkan" value={rows.length} /><Metric label="Stok rendah" value={rows.filter((item) => Number(item.quantity) <= Number(item.minimum_quantity)).length} /><Metric label="SKU total" value={snapshot.inventory.length} /></div>
    {rows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">Belum ada inventaris. Tambahkan di Aset & Inventaris.</p>
      : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3 text-right">Stok</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Restock</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{rows.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.name}<div className="text-xs text-slate-400">{item.category}</div></td><td className="px-4 py-3">{item.location}</td><td className="px-4 py-3 text-right tabular-nums">{item.quantity} {item.unit}</td><td className="px-4 py-3">{item.stockStatus}</td><td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><input type="number" min={1} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-950" value={restockQty[item.id] || ""} onChange={(event) => setRestockQty((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Jumlah restock ${item.name}`} /><button type="button" disabled={busy} onClick={() => void restock(item)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Catat masuk</button></div></td></tr>)}</tbody></table></div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/50"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</div></div>;
}

export function SupabaseGeneralAffairManager() {
  const [activeTab, setActiveTab] = useState<Tab>("assets");
  const activeLabel = TABS.find((tab) => tab.id === activeTab)?.label || "Sarana & Prasarana";
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="border-b border-slate-200 pb-5 dark:border-slate-800"><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-200">Jalur runtime Supabase tenant</div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Sarana & Prasarana</h1><p className="mt-1 text-sm text-slate-500">{activeLabel} · operasi tenant pesantren.</p></header>
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Semua tab memakai data tenant yang sudah ada: katalog, tiket asrama, aset/inventaris, pemesanan, kebutuhan restock, aset operasional, audit kebersihan, dan persediaan.</div>
    <ERPTabs tabs={TABS} value={activeTab} onChange={(id) => setActiveTab(id as Tab)} ariaLabel="Navigasi Sarana & Prasarana Supabase" />
    {activeTab === "master" ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Katalog referensi sarana</h2><p className="text-sm text-slate-500">Kategori dan fasilitas di bawah dipakai register aset, inventaris, dan pemesanan.</p><SupabaseModuleReferenceSettings domains={["facility_resource", "ga_asset_category", "ga_inventory_category", "ga_inventory_unit"]} /></section>
      : activeTab === "maintenance" || activeTab === "housekeeping" ? <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Memuat tiket & audit fasilitas…</div>}><FacilityOps /></Suspense>
      : activeTab === "assets" ? <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Memuat register aset tenant…</div>}><AssetsInventory /></Suspense>
      : activeTab === "booking" ? <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Memuat pemesanan fasilitas tenant…</div>}><FacilityBooking /></Suspense>
      : activeTab === "procurement" ? <GaLinkedPanel mode="procurement" />
      : activeTab === "fleet" ? <GaLinkedPanel mode="fleet" />
      : <GaLinkedPanel mode="kitchen" />}
  </div>;
}
