import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, FileText, Loader2, Package, Plus, RefreshCw, Search, ShoppingBag, ShoppingCart, Store, Truck, X } from "lucide-react";
import { ERPTabs } from "../components/ERPDesignSystem";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Product = { id: string; sku: string; name: string; category: string; price: number; stock: number; seller: string; image: string; status: string };
type OrderLine = { id: string; product_id: string | null; product_sku_snapshot: string; product_name_snapshot: string; quantity: number; unit_price: number; line_total: number };
type Order = { id: string; customer: string; type: string; status: "pending" | "processing" | "ready_to_ship" | "delivered" | "cancelled"; total: number; items: number; date: string; lines: OrderLine[]; source_system?: string; legacy_date_known?: boolean };
type Movement = { id: string; product_id: string; productName: string; quantity_delta: number; balance_after: number; reason: string; created_at: string };
type Snapshot = { products: Product[]; orders: Order[]; movements: Movement[] };
type Tab = "storefront" | "orders" | "inventory" | "analytics";
type ImportPreview = { snapshotFingerprint: string; counts: Record<string, number>; issues: Array<{ code: string; recordRef: string; severity: string }>; issueCount: number; blockingCount: number; canApply: boolean };
const EMPTY: Snapshot = { products: [], orders: [], movements: [] };
const FIELD = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-pink-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-800 disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5";
const IMPORT_ENABLED = import.meta.env.VITE_SUPABASE_MARKETPLACE_IMPORT_ENABLED === "true";
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "storefront", label: "Etalase", icon: <Store className="h-4 w-4" /> },
  { id: "orders", label: "Pesanan", icon: <ShoppingBag className="h-4 w-4" /> },
  { id: "inventory", label: "Inventaris", icon: <Package className="h-4 w-4" /> },
  { id: "analytics", label: "Ringkasan", icon: <Activity className="h-4 w-4" /> },
];
function money(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function statusLabel(status: string) { return ({ pending: "Menunggu", processing: "Diproses", ready_to_ship: "Siap dikirim", delivered: "Selesai", cancelled: "Dibatalkan" } as Record<string, string>)[status] || status; }
function nextStatuses(status: string) { return status === "pending" ? ["processing", "cancelled"] : status === "processing" ? ["ready_to_ship", "cancelled"] : status === "ready_to_ship" ? ["delivered"] : []; }

async function runIdempotentMarketplaceMutation<T>(operation: string, tenantId: string, actorId: string, payload: unknown, send: (clientRequestId: string) => Promise<T>): Promise<T> {
  const lease = await pendingMutationIds.acquire(`marketplace:${operation}`, { tenantId, actorId, payload });
  const result = await send(lease.requestId);
  lease.clear();
  return result;
}

async function requestMarketplace(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak tersedia. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {}); headers.set("Authorization", "Bearer " + token); headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Layanan Marketplace belum dapat diproses.");
  return result;
}
const emptyProduct = () => ({ sku: "", name: "", category: "Uniforms", price: "0", initialStock: "0", seller: "Koperasi", imageLabel: "📦" });

export function SupabaseMarketplaceManager() {
  const { user, role } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>("storefront");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ name: "", type: "Parent" });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [productDraft, setProductDraft] = useState(emptyProduct());
  const [stockDraft, setStockDraft] = useState<Record<string, { delta: string; reason: string }>>({});
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const canManage = ["Admin", "SuperAdmin"].includes(role) && user?.modulePermissions?.marketplace !== false;

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setSnapshot({ ...EMPTY, ...(await requestMarketplace("/api/marketplace/snapshot")) }); }
    catch (cause: any) { setSnapshot(EMPTY); setError(cause?.message || "Data marketplace belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [user?.tenantId, user?.uid]);
  useEffect(() => { void refresh(); }, [refresh]);

  const categories = useMemo(() => ["All", ...new Set(snapshot.products.map((item) => item.category).filter(Boolean))], [snapshot.products]);
  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return snapshot.products.filter((item) => item.status === "active" && (category === "All" || item.category === category) && (!needle || [item.sku, item.name, item.category, item.seller].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(needle))));
  }, [snapshot.products, category, search]);
  const cartLines = snapshot.products.filter((item) => (cart[item.id] || 0) > 0).map((product) => ({ product, quantity: cart[product.id] }));
  const cartTotal = cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const deliveredTotal = snapshot.orders.filter((order) => order.status === "delivered").reduce((sum, order) => sum + order.total, 0);
  const pendingCount = snapshot.orders.filter((order) => ["pending", "processing", "ready_to_ship"].includes(order.status)).length;

  const checkout = async (event: React.FormEvent) => {
    event.preventDefault(); if (!cartLines.length || !customer.name.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const order = {
        customerName: customer.name.trim(), customerType: customer.type,
        items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })).sort((a, b) => a.productId.localeCompare(b.productId)),
      };
      await runIdempotentMarketplaceMutation("create-order", user?.tenantId || "", user?.uid || "", order, (clientRequestId) =>
        requestMarketplace("/api/marketplace/orders", { method: "POST", body: JSON.stringify({ ...order, clientRequestId }) }));
      setCart({}); setCheckoutOpen(false); setCustomer({ name: "", type: "Parent" }); setTab("orders"); setNotice("Pesanan tercatat dan stok dipesan secara transaksional."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Pesanan belum dapat dicatat."); await refresh(); }
    finally { setBusy(false); }
  };
  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const product = { action: "create", sku: productDraft.sku.trim(), name: productDraft.name.trim(), category: productDraft.category.trim(), unitPrice: Number(productDraft.price), initialStock: Number(productDraft.initialStock), seller: productDraft.seller.trim(), imageLabel: productDraft.imageLabel.trim() };
      await runIdempotentMarketplaceMutation("create-product", user?.tenantId || "", user?.uid || "", product, (clientRequestId) =>
        requestMarketplace("/api/marketplace/products", { method: "POST", body: JSON.stringify({ ...product, clientRequestId }) }));
      setProductDraft(emptyProduct()); setProductModal(false); setNotice("Produk tersimpan di katalog tenant."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Produk belum dapat disimpan."); }
    finally { setBusy(false); }
  };
  const adjustStock = async (product: Product) => {
    const draft = stockDraft[product.id]; const delta = Math.trunc(Number(draft?.delta));
    if (!draft?.reason.trim() || !Number.isFinite(delta) || delta === 0) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const adjustment = { productId: product.id, delta, reason: draft.reason.trim() };
      await runIdempotentMarketplaceMutation("adjust-stock", user?.tenantId || "", user?.uid || "", adjustment, (clientRequestId) =>
        requestMarketplace("/api/marketplace/stock-adjustments", { method: "POST", body: JSON.stringify({ ...adjustment, clientRequestId }) }));
      setStockDraft((old) => ({ ...old, [product.id]: { delta: "", reason: "" } })); setNotice("Mutasi inventaris tersimpan di ledger."); await refresh();
    } catch (cause: any) { setError(cause?.message || "Mutasi inventaris belum dapat dicatat."); }
    finally { setBusy(false); }
  };
  const transitionOrder = async (order: Order, next: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const transition = { orderId: order.id, status: next };
      await runIdempotentMarketplaceMutation("transition-order", user?.tenantId || "", user?.uid || "", transition, (clientRequestId) =>
        requestMarketplace(`/api/marketplace/orders/${encodeURIComponent(order.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: next, clientRequestId }) }));
      setNotice(next === "cancelled" ? "Pesanan dibatalkan dan stok dikembalikan." : `Status pesanan menjadi ${statusLabel(next)}.`); await refresh();
    } catch (cause: any) { setError(cause?.message || "Status pesanan belum dapat diperbarui."); }
    finally { setBusy(false); }
  };
  const previewLegacyImport = async () => {
    setBusy(true); setError(""); setNotice(""); setImportPreview(null);
    try { setImportPreview(await requestMarketplace("/api/marketplace/legacy/import", { method: "POST", body: JSON.stringify({ action: "preview" }) })); }
    catch (cause: any) { setError(cause?.message || "Pratinjau impor Marketplace belum dapat dibuat."); }
    finally { setBusy(false); }
  };
  const applyLegacyImport = async () => {
    if (!importPreview?.canApply) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestMarketplace("/api/marketplace/legacy/import", { method: "POST", body: JSON.stringify({ action: "apply", expectedFingerprint: importPreview.snapshotFingerprint }) });
      setImportPreview(null); setNotice(`Impor selesai: ${result.importedProducts || 0} produk dan ${result.importedOrders || 0} pesanan lama.`);
    } catch (cause: any) { setError(cause?.message || "Impor Marketplace belum dapat diterapkan."); }
    finally { setBusy(false); }
  };

  if (!canManage) return <main className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10">Marketplace tenant pada tahap ini hanya tersedia untuk Admin yang memiliki permission Marketplace.</main>;
  return <main className="mx-auto max-w-7xl space-y-5 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-800 dark:bg-pink-400/10 dark:text-pink-200"><Store className="h-3.5 w-3.5" />Data tenant melalui Supabase</div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">DPesantren Marketplace</h1><p className="mt-1 text-sm text-slate-500">Katalog, pesanan, dan persediaan dengan reservasi stok transaksional.</p></div><div className="flex gap-2"><button type="button" className={OUTLINE} onClick={() => setCheckoutOpen(true)}><ShoppingCart className="h-4 w-4" />Keranjang {cartCount ? `(${cartCount})` : ""}</button><button type="button" className={OUTLINE} disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button></div></header>
    <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Catatan migrasi:</strong> runtime Supabase hanya menampilkan record Supabase. Histori Firestore lama belum diimpor; flag harus tetap mati sampai rekonsiliasi impor selesai.</div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</div>}{notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
    {IMPORT_ENABLED && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Impor katalog dan histori lama</h2><p className="mt-1 text-sm text-slate-500">Histori pesanan lama tidak memiliki rincian barang; jumlah, nilai, status, dan nama pelanggan dipertahankan, tanpa menebak produk.</p></div><button type="button" className={OUTLINE} disabled={busy} onClick={() => void previewLegacyImport()}><RefreshCw className="h-4 w-4" />Pratinjau</button></div>{importPreview && <><div className="flex flex-wrap gap-2 text-xs">{[["Sumber", importPreview.counts.source], ["Produk", importPreview.counts.products], ["Pesanan", importPreview.counts.orders], ["Siap", importPreview.counts.ready], ["Sudah diimpor", importPreview.counts.alreadyImported]].map(([label, value]) => <span key={String(label)} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5">{label}: <strong>{value}</strong></span>)}</div>{importPreview.issueCount > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>{importPreview.blockingCount} konflik memerlukan tinjauan.</strong><ul className="mt-2 space-y-1">{importPreview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.recordRef}-${index}`}>{issue.code} · {issue.recordRef || "snapshot"}</li>)}</ul></div>}<button type="button" className={BUTTON} disabled={busy || !importPreview.canApply} onClick={() => void applyLegacyImport()}><FileText className="h-4 w-4" />Konfirmasi & terapkan impor</button></>}</section>}
    <section className="grid gap-3 sm:grid-cols-3"><Metric label="Produk aktif" value={snapshot.products.length} icon={<Package className="h-4 w-4" />} /><Metric label="Pesanan berjalan" value={pendingCount} icon={<Clock3 className="h-4 w-4" />} /><Metric label="Penjualan selesai" value={money(deliveredTotal)} icon={<CheckCircle2 className="h-4 w-4" />} /></section>
    <ERPTabs tabs={TABS} value={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Navigasi Marketplace" />
    {loading ? <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900"><Loader2 className="h-4 w-4 animate-spin" />Memuat data Marketplace…</div> : <>
      {tab === "storefront" && <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={FIELD + " pl-9"} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk" /></label><select className={FIELD + " sm:w-56 sm:mt-0"} value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((value) => <option key={value}>{value}</option>)}</select></div>{filteredProducts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"><div className="flex h-36 items-center justify-center bg-slate-50 text-5xl dark:bg-white/5">{product.image || "📦"}</div><div className="space-y-2 p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold text-slate-900 dark:text-white">{product.name}</h2><span className="shrink-0 text-xs text-slate-500">{product.sku}</span></div><p className="text-xs text-slate-500">{product.category} · {product.seller || "Koperasi"}</p><div className="flex items-center justify-between"><strong className="text-pink-700 dark:text-pink-300">{money(product.price)}</strong><span className="text-xs text-slate-500">Stok {product.stock}</span></div><button type="button" className={BUTTON + " w-full"} disabled={busy || product.stock <= (cart[product.id] || 0)} onClick={() => setCart((old) => ({ ...old, [product.id]: (old[product.id] || 0) + 1 }))}><Plus className="h-4 w-4" />Tambah ke keranjang</button></div></article>)}</div> : <Empty message="Belum ada produk aktif yang cocok." />}</section>}
      {tab === "orders" && <section className="space-y-3">{snapshot.orders.length ? snapshot.orders.map((order) => <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">{order.customer} <span className="font-normal text-slate-500">· {order.type}</span></h2><p className="mt-1 text-xs text-slate-500">{order.legacy_date_known === false ? "Tanggal lama tidak tersedia" : new Date(order.date).toLocaleString("id-ID")} · {order.items} barang · {order.id.slice(0, 8)}</p></div><div className="text-right"><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${order.status === "delivered" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : order.status === "cancelled" ? "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300" : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"}`}>{statusLabel(order.status)}</span><p className="mt-2 font-semibold text-slate-900 dark:text-white">{money(order.total)}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{order.lines.map((line) => <span key={line.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{line.product_name_snapshot} × {line.quantity}</span>)}{order.source_system === "legacy_firestore" && !order.lines.length && <span className="text-xs text-slate-500">Rincian barang tidak tersedia pada data lama.</span>}</div>{nextStatuses(order.status).length > 0 && order.source_system !== "legacy_firestore" && <div className="mt-4 flex flex-wrap gap-2">{nextStatuses(order.status).map((status) => <button key={status} type="button" className={status === "cancelled" ? OUTLINE : BUTTON} disabled={busy} onClick={() => void transitionOrder(order, status)}>{status === "delivered" ? <CheckCircle2 className="h-4 w-4" /> : status === "ready_to_ship" ? <Truck className="h-4 w-4" /> : status === "cancelled" ? <X className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{status === "cancelled" ? "Batalkan" : `Tandai ${statusLabel(status).toLowerCase()}`}</button>)}</div>}</article>) : <Empty message="Belum ada pesanan." />}</section>}
      {tab === "inventory" && <section className="space-y-3">{snapshot.products.length ? snapshot.products.map((product) => { const draft = stockDraft[product.id] || { delta: "", reason: "" }; return <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-3xl">{product.image || "📦"}</span><div><h2 className="font-semibold text-slate-900 dark:text-white">{product.name}</h2><p className="text-xs text-slate-500">{product.sku} · {product.category} · {money(product.price)}</p></div></div><div className="text-right"><strong className="text-slate-900 dark:text-white">{product.stock}</strong><p className="text-xs text-slate-500">tersedia</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-[130px_minmax(140px,1fr)_auto]"><input aria-label="Perubahan stok, gunakan angka negatif untuk stok keluar" type="number" step="1" className={FIELD + " mt-0"} placeholder="±Jumlah" value={draft.delta} onChange={(e) => setStockDraft((old) => ({ ...old, [product.id]: { ...draft, delta: e.target.value } }))} /><input aria-label="Alasan mutasi stok" maxLength={500} className={FIELD + " mt-0"} placeholder="Alasan perubahan stok" value={draft.reason} onChange={(e) => setStockDraft((old) => ({ ...old, [product.id]: { ...draft, reason: e.target.value } }))} /><button type="button" className={OUTLINE} disabled={busy || !draft.delta || !draft.reason.trim()} onClick={() => void adjustStock(product)}>Catat mutasi</button></div></article>; }) : <Empty message="Belum ada produk aktif." />}<button type="button" className={BUTTON} onClick={() => { setProductDraft(emptyProduct()); setProductModal(true); }}><Plus className="h-4 w-4" />Tambah produk</button><section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><h2 className="mb-3 font-semibold">Mutasi stok terbaru</h2>{snapshot.movements.length ? <div className="space-y-2">{snapshot.movements.slice(0, 20).map((movement) => <div key={movement.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-white/10"><span>{movement.productName} · {movement.reason}</span><span className={movement.quantity_delta > 0 ? "text-emerald-700" : "text-rose-700"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta} · saldo {movement.balance_after} · {new Date(movement.created_at).toLocaleString("id-ID")}</span></div>)}</div> : <Empty message="Belum ada mutasi stok." />}</section></section>}
      {tab === "analytics" && <section className="grid gap-4 md:grid-cols-2"><Metric label="Transaksi selesai" value={snapshot.orders.filter((order) => order.status === "delivered").length} icon={<CheckCircle2 className="h-4 w-4" />} /><Metric label="Nilai transaksi selesai" value={money(deliveredTotal)} icon={<Activity className="h-4 w-4" />} /><Metric label="Pesanan menunggu tindakan" value={pendingCount} icon={<Clock3 className="h-4 w-4" />} /><Metric label="Nilai stok aktif" value={money(snapshot.products.reduce((sum, product) => sum + product.stock * product.price, 0))} icon={<Package className="h-4 w-4" />} /></section>}
    </>}
    {productModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="marketplace-product-title"><form onSubmit={saveProduct} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between"><h2 id="marketplace-product-title" className="font-semibold text-slate-900 dark:text-white">Tambah produk</h2><button type="button" className={OUTLINE} aria-label="Tutup" onClick={() => setProductModal(false)}><X className="h-4 w-4" /></button></div><label className={LABEL}>SKU<input required maxLength={40} className={FIELD} value={productDraft.sku} onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })} /></label><label className={LABEL}>Nama produk<input required maxLength={180} className={FIELD} value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Kategori<input maxLength={100} className={FIELD} value={productDraft.category} onChange={(e) => setProductDraft({ ...productDraft, category: e.target.value })} /></label><label className={LABEL}>Label gambar / emoji<input maxLength={80} className={FIELD} value={productDraft.imageLabel} onChange={(e) => setProductDraft({ ...productDraft, imageLabel: e.target.value })} /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Harga<input required type="number" min="0" step="100" className={FIELD} value={productDraft.price} onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })} /></label><label className={LABEL}>Stok awal<input required type="number" min="0" step="1" className={FIELD} value={productDraft.initialStock} onChange={(e) => setProductDraft({ ...productDraft, initialStock: e.target.value })} /></label></div><label className={LABEL}>Penjual<input maxLength={120} className={FIELD} value={productDraft.seller} onChange={(e) => setProductDraft({ ...productDraft, seller: e.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" className={OUTLINE} onClick={() => setProductModal(false)}>Batal</button><button className={BUTTON} disabled={busy}><Plus className="h-4 w-4" />Simpan</button></div></form></div>}
    {checkoutOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="marketplace-checkout-title"><form onSubmit={checkout} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between"><h2 id="marketplace-checkout-title" className="font-semibold text-slate-900 dark:text-white">Keranjang & checkout</h2><button type="button" className={OUTLINE} aria-label="Tutup" onClick={() => setCheckoutOpen(false)}><X className="h-4 w-4" /></button></div>{cartLines.length ? <div className="max-h-64 space-y-2 overflow-y-auto">{cartLines.map(({ product, quantity }) => <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5"><div><p className="font-medium">{product.name}</p><p className="text-xs text-slate-500">{money(product.price)} × {quantity}</p></div><div className="flex items-center gap-2"><button type="button" className={OUTLINE} onClick={() => setCart((old) => ({ ...old, [product.id]: quantity - 1 <= 0 ? 0 : quantity - 1 }))}>−</button><span>{quantity}</span><button type="button" className={OUTLINE} disabled={quantity >= product.stock} onClick={() => setCart((old) => ({ ...old, [product.id]: quantity + 1 }))}>+</button></div></div>)}</div> : <Empty message="Keranjang masih kosong." />}<div className="grid gap-3 sm:grid-cols-2"><label className={LABEL}>Nama pembeli<input required maxLength={160} className={FIELD} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label><label className={LABEL}>Tipe pembeli<select className={FIELD} value={customer.type} onChange={(e) => setCustomer({ ...customer, type: e.target.value })}>{["Parent", "Alumni", "Public", "Internal"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Total</span><strong className="text-lg text-slate-900 dark:text-white">{money(cartTotal)}</strong></div><button className={BUTTON + " w-full"} disabled={busy || !cartLines.length || !customer.name.trim()}><ShoppingCart className="h-4 w-4" />Buat pesanan dan reservasi stok</button><p className="text-xs text-slate-500">Stok dan pesanan disimpan dalam satu transaksi. Jika stok sudah berubah, transaksi ditolak dan keranjang tetap tersedia.</p></form></div>}
  </main>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) { return <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex justify-between text-sm text-slate-500">{label}<span className="text-pink-700">{icon}</span></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p></article>; }
function Empty({ message }: { message: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">{message}</div>; }

