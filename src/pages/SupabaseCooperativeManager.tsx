import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Check, Loader2, Package, Plus, RefreshCw, ShoppingCart, Truck, Wallet, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type Product = { id: string; sku: string; name: string; category: string; stock: number; costPrice: number; price: number; reorderPoint: number; expiryDate: string; status: string };
type WalletAccount = { id: string; studentId: string; student: string; nis: string; grade: string; balance: number; limit: number; status: "Active" | "Blocked" };
type Supplier = { id: string; name: string; category: string; contact: string; pic: string; status: string };
type Sale = { id: string; walletId: string; studentId: string; studentName: string; grade: string; date: string; total: number; status: string; items: Array<{ id: string; name: string; quantity: number; price: number; lineTotal: number }> };
type Snapshot = { products: Product[]; suppliers: Supplier[]; wallets: WalletAccount[]; sales: Sale[]; walletLedger: Array<{ id: string; walletId: string; studentId: string; type: string; amount: number; balanceAfter: number; reference: string; createdAt: string }> };
type CartLine = { productId: string; quantity: number };
type ProductDraft = { id?: string; sku: string; name: string; category: string; costPrice: string; price: string; stock: string; reorderPoint: string; expiryDate: string };
type SupplierDraft = { id?: string; name: string; category: string; contact: string; pic: string };

const EMPTY: Snapshot = { products: [], suppliers: [], wallets: [], sales: [], walletLedger: [] };
const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50";
const outlineClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const money = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

async function requestCooperative(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan Koperasi Supabase belum dapat diproses.");
  return payload;
}

export function SupabaseCooperativeManager() {
  const { role, user } = useAuth();
  const canTopUp = role === "SuperAdmin" || (role === "Admin" && user?.modulePermissions?.finance !== false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [activeTab, setActiveTab] = useState("pos");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [walletId, setWalletId] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft | null>(null);
  const [topUpWallet, setTopUpWallet] = useState<WalletAccount | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReference, setTopUpReference] = useState("");

  const refresh = useCallback(async () => {
    const payload = await requestCooperative("/api/cooperative/snapshot");
    setSnapshot({ ...EMPTY, ...payload });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestCooperative("/api/cooperative/snapshot")
      .then((payload) => { if (active) setSnapshot({ ...EMPTY, ...payload }); })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data koperasi belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const products = useMemo(() => snapshot.products.filter((item) => item.status === "active" && `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [snapshot.products, search]);
  const selectedWallet = snapshot.wallets.find((item) => item.id === walletId) || null;
  const total = cart.reduce((sum, line) => sum + (snapshot.products.find((item) => item.id === line.productId)?.price || 0) * line.quantity, 0);
  const lowStockCount = snapshot.products.filter((item) => item.status === "active" && item.stock <= item.reorderPoint).length;
  const completedToday = snapshot.sales.filter((sale) => new Date(sale.date).toDateString() === new Date().toDateString());

  const runMutation = async (path: string, method: string, body: Record<string, unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await requestCooperative(path, { method, body: JSON.stringify(body) });
      await refresh();
      setNotice(success);
      return true;
    } catch (mutationError: any) {
      setError(mutationError?.message || "Perubahan belum dapat disimpan.");
      return false;
    } finally { setBusy(false); }
  };

  const checkout = async () => {
    if (!selectedWallet || cart.length === 0) return;
    const result = await runMutation("/api/cooperative/sales", "POST", {
      walletId: selectedWallet.id,
      clientRequestId: crypto.randomUUID(),
      items: cart,
    }, "Transaksi berhasil dicatat secara atomik pada saldo dompet dan stok.");
    if (result) { setCart([]); setWalletId(""); }
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productDraft) return;
    const payload = {
      action: productDraft.id ? "update" : "create",
      ...(productDraft.id ? { id: productDraft.id } : {}),
      sku: productDraft.sku, name: productDraft.name, category: productDraft.category,
      costPrice: Number(productDraft.costPrice), unitPrice: Number(productDraft.price),
      ...(productDraft.id ? {} : { initialStock: Number(productDraft.stock) }),
      reorderPoint: Number(productDraft.reorderPoint), expiryDate: productDraft.expiryDate || null,
      clientRequestId: crypto.randomUUID(),
    };
    if (await runMutation("/api/cooperative/products", "POST", payload, "Produk tersimpan.")) setProductDraft(null);
  };

  const saveSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supplierDraft) return;
    const payload = { action: supplierDraft.id ? "update" : "create", ...supplierDraft, clientRequestId: crypto.randomUUID() };
    if (await runMutation("/api/cooperative/suppliers", "POST", payload, "Pemasok tersimpan.")) setSupplierDraft(null);
  };

  const submitTopUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topUpWallet) return;
    if (await runMutation(`/api/cooperative/wallets/${encodeURIComponent(topUpWallet.id)}/top-ups`, "POST", {
      amount: Number(topUpAmount), reference: topUpReference, clientRequestId: crypto.randomUUID(),
    }, "Top-up tercatat pada ledger dompet.")) {
      setTopUpWallet(null); setTopUpAmount(""); setTopUpReference("");
    }
  };

  const adjustStock = async (product: Product) => {
    const rawDelta = window.prompt(`Perubahan stok untuk ${product.name}. Gunakan angka positif untuk menambah dan negatif untuk mengurangi.`);
    if (rawDelta == null) return;
    const delta = Number(rawDelta);
    if (!Number.isInteger(delta) || delta === 0) { setError("Perubahan stok harus berupa bilangan bulat selain nol."); return; }
    const reason = window.prompt("Alasan penyesuaian stok:")?.trim();
    if (!reason) return;
    await runMutation("/api/cooperative/stock-adjustments", "POST", { productId: product.id, delta, reason, clientRequestId: crypto.randomUUID() }, "Mutasi stok tercatat pada ledger.");
  };

  const updateWalletPolicy = async (wallet: WalletAccount) => {
    const proposedLimit = window.prompt("Batas belanja harian dalam rupiah:", String(wallet.limit));
    if (proposedLimit == null) return;
    const dailyLimit = Number(proposedLimit);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) { setError("Batas belanja harian tidak valid."); return; }
    const status = wallet.status === "Active" ? "blocked" : "active";
    if (!window.confirm(`Simpan batas ${money(dailyLimit)} dan ubah status dompet menjadi ${status === "active" ? "aktif" : "diblokir"}?`)) return;
    await runMutation(`/api/cooperative/wallets/${encodeURIComponent(wallet.id)}/policy`, "PATCH", { dailyLimit, status, clientRequestId: crypto.randomUUID() }, "Kebijakan dompet diperbarui.");
  };

  if (role !== "Admin" && role !== "SuperAdmin") return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Modul Koperasi Supabase saat ini tersedia untuk Admin tenant dengan izin Koperasi.</div>;

  const tabs = [
    { id: "pos", label: "Kasir", icon: ShoppingCart },
    { id: "inventory", label: "Inventaris", icon: Package },
    { id: "wallets", label: "Dompet Santri", icon: Wallet },
    { id: "suppliers", label: "Pemasok", icon: Truck },
    { id: "transactions", label: "Transaksi", icon: BarChart3 },
  ];

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-400/10 dark:text-orange-200"><Wallet className="h-3.5 w-3.5" />Data tenant melalui Supabase</div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Koperasi Pesantren</h1><p className="mt-1 text-sm text-slate-500">Kasir, inventaris, pemasok, dan dompet santri tersimpan pada backend tenant.</p></div>
      <button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} disabled={loading || busy} className={outlineClass}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Catatan migrasi:</strong> produk, pemasok, dompet, dan transaksi contoh lama tidak diimpor. Dompet baru berawal dari saldo nol. Top-up memerlukan izin Finance, referensi penerimaan, dan buku keuangan yang terbuka; petugas harus memverifikasi pembayaran karena aplikasi belum mencocokkan referensi ke bank atau payment gateway. Top-up dicatat sebagai titipan saldo santri, terpisah dari pendapatan. Cashbook Finance belum menerapkan pembukuan double-entry.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Produk aktif</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.products.filter((x) => x.status === "active").length}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Stok perlu diperiksa</p><p className="mt-1 text-2xl font-semibold text-orange-700 dark:text-orange-300">{lowStockCount}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Transaksi hari ini</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{completedToday.length}</p></div></section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === id ? "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-200" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data Koperasi…</div> : <div className="p-4 sm:p-5">
        {activeTab === "pos" && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4"><label className="block"><span className="text-xs font-medium text-slate-500">Cari produk</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama, SKU, kategori" className={inputClass} /></label>
            {products.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <button key={product.id} type="button" disabled={product.stock < 1} onClick={() => setCart((current) => { const existing = current.find((line) => line.productId === product.id); return existing ? current.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) } : line) : [...current, { productId: product.id, quantity: 1 }]; })} className="rounded-xl border border-slate-200 p-4 text-left hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:border-orange-500/40"><div className="text-xs text-slate-500">{product.category || "Umum"} · stok {product.stock}</div><div className="mt-1 font-semibold text-slate-900 dark:text-white">{product.name}</div><div className="mt-3 font-semibold text-orange-700 dark:text-orange-300">{money(product.price)}</div></button>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Belum ada produk pada tenant ini.</div>}
          </div>
          <aside className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40"><h2 className="font-semibold text-slate-900 dark:text-white">Keranjang</h2><label className="block text-xs font-medium text-slate-500">Dompet santri<select value={walletId} onChange={(e) => setWalletId(e.target.value)} className={inputClass}><option value="">Pilih santri</option>{snapshot.wallets.filter((w) => w.status === "Active").map((w) => <option key={w.id} value={w.id}>{w.student} · {w.grade} · {money(w.balance)}</option>)}</select></label>
            <div className="max-h-64 space-y-3 overflow-y-auto">{cart.map((line) => { const product = snapshot.products.find((x) => x.id === line.productId); if (!product) return null; return <div key={line.productId} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium text-slate-800 dark:text-slate-200">{product.name}</span><span className="text-xs text-slate-500">{money(product.price)} per item</span></span><span className="flex items-center gap-2"><input aria-label={`Jumlah ${product.name}`} type="number" min="1" max={product.stock} value={line.quantity} onChange={(e) => setCart((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Math.min(product.stock, Math.max(1, Number(e.target.value) || 1)) } : item))} className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900" /><button type="button" aria-label={`Hapus ${product.name}`} onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))} className="rounded p-1 text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button></span></div>; })}</div>
            {selectedWallet && <p className="rounded-lg bg-white p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">Saldo {money(selectedWallet.balance)} · Batas harian {money(selectedWallet.limit)}</p>}
            <div className="flex justify-between border-t border-slate-200 pt-3 font-semibold dark:border-slate-700"><span>Total</span><span>{money(total)}</span></div>
            {selectedWallet && (total > selectedWallet.balance || total > selectedWallet.limit) && <p className="text-xs text-rose-700 dark:text-rose-300">Saldo atau batas belanja harian tidak mencukupi.</p>}
            <button type="button" onClick={() => void checkout()} disabled={busy || !selectedWallet || cart.length === 0 || total > (selectedWallet?.balance ?? 0) || total > (selectedWallet?.limit ?? 0)} className={`${primaryClass} w-full`}><ShoppingCart className="h-4 w-4" />{busy ? "Memproses…" : "Selesaikan transaksi"}</button>
          </aside>
        </div>}

        {activeTab === "inventory" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Inventaris Produk</h2><p className="mt-1 text-xs text-slate-500">Penyesuaian stok dicatat sebagai ledger tenant.</p></div><button type="button" className={primaryClass} onClick={() => setProductDraft({ sku: "", name: "", category: "Kantin", costPrice: "0", price: "0", stock: "0", reorderPoint: "0", expiryDate: "" })}><Plus className="h-4 w-4" />Produk baru</button></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Produk</th><th className="p-3">Kategori</th><th className="p-3 text-right">Stok</th><th className="p-3 text-right">HPP / Harga</th><th className="p-3">Kedaluwarsa</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.products.filter((x) => x.status === "active").map((product) => <tr key={product.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{product.name}</div><div className="text-xs text-slate-500">{product.sku}</div></td><td className="p-3 text-slate-600 dark:text-slate-300">{product.category}</td><td className="p-3 text-right"><span className={product.stock <= product.reorderPoint ? "font-semibold text-rose-600" : "text-slate-700 dark:text-slate-300"}>{product.stock} / {product.reorderPoint}</span></td><td className="p-3 text-right text-xs text-slate-600 dark:text-slate-300">{money(product.costPrice)} / {money(product.price)}</td><td className="p-3 text-slate-500">{product.expiryDate || "—"}</td><td className="p-3 text-right"><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setProductDraft({ id: product.id, sku: product.sku, name: product.name, category: product.category, costPrice: String(product.costPrice), price: String(product.price), stock: String(product.stock), reorderPoint: String(product.reorderPoint), expiryDate: product.expiryDate || "" })}>Ubah</button><button type="button" className={outlineClass} onClick={() => void adjustStock(product)}>Stok ±</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={() => window.confirm(`Arsipkan ${product.name}?`) && void runMutation("/api/cooperative/products", "POST", { action: "archive", id: product.id, clientRequestId: crypto.randomUUID() }, "Produk diarsipkan.")}>Arsip</button></div></td></tr>)}</tbody></table></div>
        </div>}

        {activeTab === "wallets" && <div className="space-y-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Dompet Santri</h2><p className="mt-1 text-xs text-slate-500">Saldo berasal dari ledger. Pengubahan batas/status dan top-up direkam di backend.</p></div><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Santri</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Batas harian</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.wallets.map((wallet) => <tr key={wallet.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{wallet.student}</div><div className="text-xs text-slate-500">{wallet.nis} · {wallet.grade}</div></td><td className="p-3 text-right font-semibold">{money(wallet.balance)}</td><td className="p-3 text-right">{money(wallet.limit)}</td><td className="p-3"><span className={wallet.status === "Active" ? "text-emerald-700" : "text-rose-700"}>{wallet.status === "Active" ? "Aktif" : "Diblokir"}</span></td><td className="p-3"><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => { setTopUpWallet(wallet); setTopUpAmount(""); setTopUpReference(""); }} disabled={!canTopUp || wallet.status !== "Active"}>Top-up</button><button type="button" className={outlineClass} onClick={() => void updateWalletPolicy(wallet)}>Atur</button></div></td></tr>)}</tbody></table></div></div>}

        {activeTab === "suppliers" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Pemasok</h2><p className="mt-1 text-xs text-slate-500">Direktori pemasok tenant.</p></div><button type="button" className={primaryClass} onClick={() => setSupplierDraft({ name: "", category: "", contact: "", pic: "" })}><Plus className="h-4 w-4" />Pemasok baru</button></div><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Nama / PIC</th><th className="p-3">Kategori</th><th className="p-3">Kontak</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.suppliers.map((supplier) => <tr key={supplier.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{supplier.name}</div><div className="text-xs text-slate-500">{supplier.pic || "—"}</div></td><td className="p-3">{supplier.category || "—"}</td><td className="p-3">{supplier.contact || "—"}</td><td className="p-3">{supplier.status === "active" ? "Aktif" : "Nonaktif"}</td><td className="p-3 text-right"><div className="flex justify-end gap-2">{supplier.status === "active" && <><button type="button" className={outlineClass} onClick={() => setSupplierDraft({ id: supplier.id, name: supplier.name, category: supplier.category, contact: supplier.contact, pic: supplier.pic })}>Ubah</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50" onClick={() => void runMutation("/api/cooperative/suppliers", "POST", { action: "deactivate", id: supplier.id, clientRequestId: crypto.randomUUID() }, "Pemasok dinonaktifkan.")}>Nonaktifkan</button></>}</div></td></tr>)}</tbody></table></div></div>}

        {activeTab === "transactions" && <div className="space-y-3"><h2 className="font-semibold text-slate-900 dark:text-white">Riwayat Transaksi & Ledger Dompet</h2>{snapshot.sales.length ? <div className="space-y-3">{snapshot.sales.map((sale) => <article key={sale.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-900 dark:text-white">{sale.studentName} <span className="text-xs font-normal text-slate-500">{sale.grade}</span></div><div className="mt-1 font-mono text-xs text-slate-500">{sale.id} · {new Date(sale.date).toLocaleString("id-ID")}</div></div><div className="font-semibold text-slate-900 dark:text-white">{money(sale.total)}</div></div><div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">{sale.items.map((item) => <div key={item.id} className="flex justify-between gap-4 text-slate-600 dark:text-slate-300"><span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span></div>)}</div></article>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Belum ada transaksi pada tenant ini.</div>}
          <div className="mt-6"><h3 className="font-semibold text-slate-900 dark:text-white">Mutasi saldo terbaru</h3><div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Waktu</th><th className="p-3">Jenis / Referensi</th><th className="p-3 text-right">Perubahan</th><th className="p-3 text-right">Saldo akhir</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.walletLedger.map((entry) => <tr key={entry.id}><td className="p-3 text-xs">{new Date(entry.createdAt).toLocaleString("id-ID")}</td><td className="p-3">{entry.type} · {entry.reference}</td><td className="p-3 text-right">{money(entry.amount)}</td><td className="p-3 text-right">{money(entry.balanceAfter)}</td></tr>)}</tbody></table></div></div></div>}
      </div>}
    </section>

    {productDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void saveProduct(e)} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">{productDraft.id ? "Ubah produk" : "Produk baru"}</h2><p className="mt-1 text-xs text-slate-500">Harga dan stok divalidasi kembali di database.</p></div><button type="button" aria-label="Tutup" onClick={() => setProductDraft(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">SKU<input required maxLength={48} value={productDraft.sku} onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })} className={inputClass} /></label><label className="text-sm">Nama<input required maxLength={180} value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} className={inputClass} /></label><label className="text-sm">Kategori<input maxLength={100} value={productDraft.category} onChange={(e) => setProductDraft({ ...productDraft, category: e.target.value })} className={inputClass} /></label><label className="text-sm">Harga jual<input required type="number" min="0" step="100" value={productDraft.price} onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })} className={inputClass} /></label><label className="text-sm">Harga pokok<input required type="number" min="0" step="100" value={productDraft.costPrice} onChange={(e) => setProductDraft({ ...productDraft, costPrice: e.target.value })} className={inputClass} /></label>{!productDraft.id && <label className="text-sm">Stok awal<input required type="number" min="0" step="1" value={productDraft.stock} onChange={(e) => setProductDraft({ ...productDraft, stock: e.target.value })} className={inputClass} /></label>}<label className="text-sm">Batas stok minimum<input required type="number" min="0" step="1" value={productDraft.reorderPoint} onChange={(e) => setProductDraft({ ...productDraft, reorderPoint: e.target.value })} className={inputClass} /></label><label className="text-sm">Kedaluwarsa<input type="date" value={productDraft.expiryDate} onChange={(e) => setProductDraft({ ...productDraft, expiryDate: e.target.value })} className={inputClass} /></label></div><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setProductDraft(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy}>{busy ? "Menyimpan…" : "Simpan produk"}</button></div></form></div>}

    {supplierDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void saveSupplier(e)} className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900 dark:text-white">{supplierDraft.id ? "Ubah pemasok" : "Pemasok baru"}</h2><button type="button" aria-label="Tutup" onClick={() => setSupplierDraft(null)} className="rounded p-1 text-slate-400"><X className="h-5 w-5" /></button></div><label className="block text-sm">Nama / perusahaan<input required maxLength={180} value={supplierDraft.name} onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Kategori<input maxLength={100} value={supplierDraft.category} onChange={(e) => setSupplierDraft({ ...supplierDraft, category: e.target.value })} className={inputClass} /></label><label className="text-sm">PIC<input maxLength={120} value={supplierDraft.pic} onChange={(e) => setSupplierDraft({ ...supplierDraft, pic: e.target.value })} className={inputClass} /></label></div><label className="block text-sm">Kontak<input maxLength={80} value={supplierDraft.contact} onChange={(e) => setSupplierDraft({ ...supplierDraft, contact: e.target.value })} className={inputClass} /></label><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setSupplierDraft(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy}>{busy ? "Menyimpan…" : "Simpan pemasok"}</button></div></form></div>}

    {topUpWallet && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void submitTopUp(e)} className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">Top-up dompet</h2><p className="mt-1 text-xs text-slate-500">{topUpWallet.student} · saldo {money(topUpWallet.balance)}</p></div><button type="button" aria-label="Tutup" onClick={() => setTopUpWallet(null)} className="rounded p-1 text-slate-400"><X className="h-5 w-5" /></button></div><label className="block text-sm">Jumlah<input required type="number" min="1" max="100000000" step="1000" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} className={inputClass} /></label><label className="block text-sm">Referensi penerimaan Finance<input required maxLength={180} value={topUpReference} onChange={(e) => setTopUpReference(e.target.value)} placeholder="Nomor kuitansi / transaksi" className={inputClass} /></label><p className="text-xs text-amber-700 dark:text-amber-300">Akun harus memiliki izin Finance. Aplikasi menyimpan referensi, tetapi belum memverifikasinya ke bank atau payment gateway. Cocokkan pembayaran sebelum mencatat top-up.</p><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setTopUpWallet(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy || !topUpAmount || !topUpReference.trim()}>{busy ? "Mencatat…" : "Catat top-up"}</button></div></form></div>}
  </main>;
}
