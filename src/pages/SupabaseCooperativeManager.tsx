import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BarChart3, Check, Loader2, Package, Plus, RefreshCw, ShoppingCart, Truck, Wallet, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { DEFAULT_TENANT_TIME_ZONE } from "../utils/businessDate";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Product = { id: string; sku: string; name: string; category: string; stock: number; costPrice: number; price: number; reorderPoint: number; expiryDate: string; status: string };
type WalletAccount = { id: string; studentId: string; student: string; nis: string; grade: string; balance: number; limit: number; status: "Active" | "Blocked" };
type Supplier = { id: string; name: string; category: string; contact: string; pic: string; status: string };
type Sale = { id: string; walletId: string; studentId: string; studentName: string; grade: string; date: string; businessDate: string; total: number; status: string; items: Array<{ id: string; name: string; quantity: number; price: number; lineTotal: number }> };
type Snapshot = { timeZone: string; businessDate: string; products: Product[]; suppliers: Supplier[]; wallets: WalletAccount[]; sales: Sale[]; walletLedger: Array<{ id: string; walletId: string; studentId: string; type: string; amount: number; balanceAfter: number; reference: string; createdAt: string }> };
type CartLine = { productId: string; quantity: number };
type ProductDraft = { id?: string; sku: string; name: string; category: string; costPrice: string; price: string; stock: string; reorderPoint: string; expiryDate: string };
type SupplierDraft = { id?: string; name: string; category: string; contact: string; pic: string };

type LegacyFinancialPreview = {
  snapshotFingerprint: string;
  applyEnabled: boolean;
  canApply: boolean;
  attestCompleteHistory: boolean;
  issueCount: number;
  blockingCount: number;
  counts: { sourceWallets: number; sourceTransactions: number; sourceItems: number; mappedWallets: number; mappedProducts: number; readyWallets: number; readyTransactions: number; invalid: number };
  issues: Array<{ code: string; recordRef: string; severity: string }>;
  warnings: Array<{ code: string; count: number }>;
  wallets: Array<{ sourceRef: string; studentLabel: string; closingBalance: number; salesTotal: number; targetWalletId: string | null; targetStudentLabel?: string | null; targetStudentNis?: string; openingBalance: number | null; expectedClosingBalance: number | null }>;
  transactions: Array<{ sourceRef: string; status: string; createdAt: string | null; total: number | null; items: Array<{ itemRef: string; name: string; unitPrice: number; quantity: number; lineTotal: number; productId: string | null; skuSnapshot: string }> }>;
  targetWalletOptions: Array<{ walletId: string; student: string; nis: string; grade: string; balance: number; status: string }>;
  targetProductOptions: Array<{ id: string; sku: string; name: string; status: string }>;
};

type LegacyFinancialMappings = {
  wallets: Record<string, { targetWalletId?: string; openingBalance?: number }>;
  products: Record<string, string>;
  confirmCompleteHistory: boolean;
};

const EMPTY: Snapshot = { timeZone: DEFAULT_TENANT_TIME_ZONE, businessDate: "", products: [], suppliers: [], wallets: [], sales: [], walletLedger: [] };
const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50";
const outlineClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const money = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
function cooperativeFinancialIssueLabel(code: string): string {
  const labels: Record<string, string> = {
    record_limit_exceeded: "Jumlah arsip melebihi batas pemeriksaan.",
    invalid_or_duplicate_source_wallet: "Data dompet arsip tidak valid atau terduplikasi.",
    ambiguous_source_wallet_reference: "Referensi dompet pada arsip tidak dapat dipastikan.",
    invalid_or_duplicate_source_transaction: "Data transaksi arsip tidak valid atau terduplikasi.",
    transaction_wallet_reference_unresolved: "Dompet transaksi tidak cocok dengan dompet arsip.",
    unsupported_transaction_status: "Status transaksi bukan transaksi berhasil.",
    invalid_transaction_total: "Nilai total transaksi tidak valid.",
    invalid_transaction_date: "Tanggal transaksi tidak valid atau zona waktunya tidak jelas.",
    invalid_transaction_items: "Jumlah baris produk pada transaksi tidak valid.",
    invalid_transaction_item: "Data salah satu baris produk tidak valid.",
    transaction_item_product_mapping_required: "Pilih produk tujuan untuk setiap baris transaksi.",
    transaction_total_does_not_match_items: "Jumlah baris transaksi tidak cocok dengan total transaksi.",
    wallet_student_mapping_required: "Pilih dompet santri tujuan untuk setiap dompet arsip.",
    target_wallet_mapped_more_than_once: "Satu dompet tujuan dipakai lebih dari satu kali.",
    target_wallet_student_missing: "Dompet tujuan tidak terhubung dengan data santri.",
    target_wallet_has_existing_history: "Dompet tujuan sudah memiliki riwayat transaksi.",
    target_wallet_balance_must_be_zero: "Saldo dompet tujuan harus nol sebelum migrasi.",
    opening_balance_required: "Masukkan saldo pembuka yang sudah dikonfirmasi.",
    opening_balance_less_than_archived_sales: "Saldo pembuka lebih kecil daripada total penjualan arsip.",
    opening_balance_does_not_reconcile: "Saldo pembuka tidak cocok dengan saldo akhir arsip.",
  };
  return labels[code] || "Pemeriksaan gagal (" + code + ").";
}

function cooperativeFinancialWarningLabel(code: string): string {
  const labels: Record<string, string> = {
    operator_must_confirm_sales_archive_is_complete_and_opening_balance_is_reconciled: "Konfirmasi bahwa arsip penjualan lengkap dan saldo pembuka sudah direkonsiliasi.",
    date_only_transactions_use_tenant_local_noon: "Transaksi yang hanya memiliki tanggal ditafsirkan pada tengah hari zona waktu tenant.",
    historical_cost_is_unknown_and_will_not_be_used_for_margin: "HPP historis tidak tersedia dan tidak digunakan untuk menghitung margin.",
  };
  return labels[code] || "Catatan pemeriksaan: " + code + ".";
}


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
  const [financialPreview, setFinancialPreview] = useState<LegacyFinancialPreview | null>(null);
  const [financialMappings, setFinancialMappings] = useState<LegacyFinancialMappings>({ wallets: {}, products: {}, confirmCompleteHistory: false });
  const [financialBusy, setFinancialBusy] = useState(false);
  const [financialApplyBusy, setFinancialApplyBusy] = useState(false);
  const [financialDirty, setFinancialDirty] = useState(false);
  const financialMappingRevision = useRef(0);
  const financialPreviewRequestId = useRef(0);

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
  const completedToday = snapshot.businessDate
    ? snapshot.sales.filter((sale) => sale.businessDate === snapshot.businessDate)
    : [];

  const runMutation = async (path: string, method: string, body: Record<string, unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    const { clientRequestId: _callerRequestId, ...payload } = body;
    const stablePath = path.split("/").map((part) => /^[0-9a-f-]{36}$/i.test(part) ? ":id" : part).join("/");
    let lease: Awaited<ReturnType<typeof pendingMutationIds.acquire>> | null = null;
    try {
      lease = await pendingMutationIds.acquire(`cooperative:${method.toUpperCase()}:${stablePath}`, {
        tenantId: user?.tenantId || null,
        actorId: user?.uid || null,
        method: method.toUpperCase(),
        path,
        payload,
      });
      await requestCooperative(path, { method, body: JSON.stringify({ ...payload, clientRequestId: lease.requestId }) });
      // The API confirmed its atomic mutation; clear the key before refreshing.
      // If refresh fails, don't invite the user to charge the same cart again.
      lease.clear();
    } catch (mutationError: any) {
      setError(mutationError?.message || "Perubahan belum dapat disimpan.");
      setBusy(false);
      return false;
    }
    try {
      await refresh();
      setNotice(success);
    } catch {
      setError("Perubahan berhasil dicatat, tetapi data terbaru belum dapat dimuat. Gunakan Muat ulang sebelum transaksi berikutnya.");
    } finally { setBusy(false); }
    return true;
  };

  const checkout = async () => {
    if (!selectedWallet || cart.length === 0) return;
    const result = await runMutation("/api/cooperative/sales", "POST", {
      walletId: selectedWallet.id,
      items: [...cart].sort((left, right) => left.productId.localeCompare(right.productId)),
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
    };
    if (await runMutation("/api/cooperative/products", "POST", payload, "Produk tersimpan.")) setProductDraft(null);
  };

  const saveSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supplierDraft) return;
    const payload = { action: supplierDraft.id ? "update" : "create", ...supplierDraft };
    if (await runMutation("/api/cooperative/suppliers", "POST", payload, "Pemasok tersimpan.")) setSupplierDraft(null);
  };

  const submitTopUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topUpWallet) return;
    if (await runMutation(`/api/cooperative/wallets/${encodeURIComponent(topUpWallet.id)}/top-ups`, "POST", {
      amount: Number(topUpAmount), reference: topUpReference.trim(),
    }, "Top-up tercatat pada ledger dompet.")) {
      setTopUpWallet(null); setTopUpAmount(""); setTopUpReference("");
    }
  };

  const runFinancialPreview = async () => {
    const requestId = ++financialPreviewRequestId.current;
    const mappingRevision = financialMappingRevision.current;
    setFinancialBusy(true); setError(""); setNotice("");
    try {
      const result = await requestCooperative("/api/cooperative/legacy/financial-import/preview", {
        method: "POST",
        body: JSON.stringify({ mappings: financialMappings }),
      });
      if (requestId !== financialPreviewRequestId.current) return;
      setFinancialPreview(result as LegacyFinancialPreview);
      const mappingsUnchanged = mappingRevision === financialMappingRevision.current;
      setFinancialDirty(!mappingsUnchanged);
      setNotice(mappingsUnchanged
        ? "Pratinjau finansial berhasil dihitung. Belum ada data yang diubah."
        : "Pemetaan berubah saat pratinjau berjalan. Hasil ini kedaluwarsa; hitung ulang sebelum melanjutkan.");
    } catch (previewError: any) {
      if (requestId === financialPreviewRequestId.current) {
        setError(previewError?.message || "Pratinjau arsip Koperasi belum dapat dimuat.");
      }
    } finally {
      if (requestId === financialPreviewRequestId.current) setFinancialBusy(false);
    }
  };

  const applyFinancialHistory = async () => {
    if (!financialPreview || !financialPreview.applyEnabled || !financialPreview.canApply || financialDirty) return;
    const confirmed = window.confirm(
      `Terapkan ${financialPreview.counts.sourceWallets} dompet dan ${financialPreview.counts.sourceTransactions} transaksi arsip ke tenant ini? Perubahan akan menambah saldo, penjualan historis, serta ledger Koperasi dan Finance. Stok saat ini tidak berubah; HPP historis tetap tidak diketahui.`,
    );
    if (!confirmed) return;
    setFinancialApplyBusy(true); setError(""); setNotice("");
    let result: any;
    try {
      result = await requestCooperative("/api/cooperative/legacy/financial-import/apply", {
        method: "POST",
        body: JSON.stringify({
          mappings: financialMappings,
          expectedFingerprint: financialPreview.snapshotFingerprint,
        }),
      });
    } catch (applyError: any) {
      setError(applyError?.message || "Hasil penerapan belum dapat dipastikan. Jalankan pratinjau ulang dengan pemetaan yang sama sebelum mencoba lagi.");
      setFinancialApplyBusy(false);
      return;
    }
    setFinancialPreview(null);
    setFinancialDirty(false);
    const message = result?.alreadyApplied
      ? "Arsip ini sudah pernah diterapkan; tidak ada transaksi duplikat."
      : `Impor selesai: ${Number(result?.importedWallets || 0)} dompet, ${Number(result?.importedSales || 0)} transaksi, dan ${Number(result?.importedItems || 0)} baris produk historis.`;
    try {
      await refresh();
      setNotice(message);
    } catch {
      setNotice(message + " Data sudah tersimpan, tetapi ringkasan perlu dimuat ulang.");
    } finally { setFinancialApplyBusy(false); }
  };

  const markFinancialMappingChanged = () => {
    financialMappingRevision.current += 1;
    setFinancialDirty(true); setNotice("");
  };

  const adjustStock = async (product: Product) => {
    const rawDelta = window.prompt(`Perubahan stok untuk ${product.name}. Gunakan angka positif untuk menambah dan negatif untuk mengurangi.`);
    if (rawDelta == null) return;
    const delta = Number(rawDelta);
    if (!Number.isInteger(delta) || delta === 0) { setError("Perubahan stok harus berupa bilangan bulat selain nol."); return; }
    const reason = window.prompt("Alasan penyesuaian stok:")?.trim();
    if (!reason) return;
    await runMutation("/api/cooperative/stock-adjustments", "POST", { productId: product.id, delta, reason }, "Mutasi stok tercatat pada ledger.");
  };

  const updateWalletPolicy = async (wallet: WalletAccount) => {
    const proposedLimit = window.prompt("Batas belanja harian dalam rupiah:", String(wallet.limit));
    if (proposedLimit == null) return;
    const dailyLimit = Number(proposedLimit);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) { setError("Batas belanja harian tidak valid."); return; }
    const status = wallet.status === "Active" ? "blocked" : "active";
    if (!window.confirm(`Simpan batas ${money(dailyLimit)} dan ubah status dompet menjadi ${status === "active" ? "aktif" : "diblokir"}?`)) return;
    await runMutation(`/api/cooperative/wallets/${encodeURIComponent(wallet.id)}/policy`, "PATCH", { dailyLimit, status }, "Kebijakan dompet diperbarui.");
  };

  if (role !== "Admin" && role !== "SuperAdmin") return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Modul Koperasi Supabase saat ini tersedia untuk Admin tenant dengan izin Koperasi.</div>;

  const tabs = [
    { id: "pos", label: "Kasir", icon: ShoppingCart },
    { id: "inventory", label: "Inventaris", icon: Package },
    { id: "wallets", label: "Dompet Santri", icon: Wallet },
    { id: "suppliers", label: "Pemasok", icon: Truck },
    { id: "transactions", label: "Transaksi", icon: BarChart3 },
    { id: "migration", label: "Impor Arsip", icon: RefreshCw },
  ];

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-400/10 dark:text-orange-200"><Wallet className="h-3.5 w-3.5" />Data tenant melalui Supabase</div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Koperasi Pesantren</h1><p className="mt-1 text-sm text-slate-500">Kasir, inventaris, pemasok, dan dompet santri tersimpan pada backend tenant.</p></div>
      <button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} disabled={loading || busy} className={outlineClass}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Catatan migrasi:</strong> produk, pemasok, dompet, dan transaksi contoh lama tidak diimpor. Dompet baru berawal dari saldo nol. Pengisian saldo memerlukan izin Keuangan, referensi penerimaan, dan buku keuangan yang terbuka; petugas harus memverifikasi pembayaran karena aplikasi belum mencocokkan referensi ke bank atau layanan pembayaran. Pengisian saldo dicatat sebagai titipan santri, terpisah dari pendapatan. Buku kas Keuangan belum menerapkan pencatatan berpasangan.</div>
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

        {activeTab === "inventory" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Inventaris Produk</h2><p className="mt-1 text-xs text-slate-500">Penyesuaian stok dicatat pada buku besar transaksi pesantren.</p></div><button type="button" className={primaryClass} onClick={() => setProductDraft({ sku: "", name: "", category: "Kantin", costPrice: "0", price: "0", stock: "0", reorderPoint: "0", expiryDate: "" })}><Plus className="h-4 w-4" />Produk baru</button></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Produk</th><th className="p-3">Kategori</th><th className="p-3 text-right">Stok</th><th className="p-3 text-right">HPP / Harga</th><th className="p-3">Kedaluwarsa</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.products.filter((x) => x.status === "active").map((product) => <tr key={product.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{product.name}</div><div className="text-xs text-slate-500">{product.sku}</div></td><td className="p-3 text-slate-600 dark:text-slate-300">{product.category}</td><td className="p-3 text-right"><span className={product.stock <= product.reorderPoint ? "font-semibold text-rose-600" : "text-slate-700 dark:text-slate-300"}>{product.stock} / {product.reorderPoint}</span></td><td className="p-3 text-right text-xs text-slate-600 dark:text-slate-300">{money(product.costPrice)} / {money(product.price)}</td><td className="p-3 text-slate-500">{product.expiryDate || "—"}</td><td className="p-3 text-right"><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setProductDraft({ id: product.id, sku: product.sku, name: product.name, category: product.category, costPrice: String(product.costPrice), price: String(product.price), stock: String(product.stock), reorderPoint: String(product.reorderPoint), expiryDate: product.expiryDate || "" })}>Ubah</button><button type="button" className={outlineClass} onClick={() => void adjustStock(product)}>Stok ±</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={() => window.confirm(`Arsipkan ${product.name}?`) && void runMutation("/api/cooperative/products", "POST", { action: "archive", id: product.id }, "Produk diarsipkan.")}>Arsip</button></div></td></tr>)}</tbody></table></div>
        </div>}

        {activeTab === "wallets" && <div className="space-y-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Dompet Santri</h2><p className="mt-1 text-xs text-slate-500">Saldo berasal dari buku besar transaksi. Perubahan batas/status dan pengisian saldo dicatat di backend.</p></div><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Santri</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Batas harian</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.wallets.map((wallet) => <tr key={wallet.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{wallet.student}</div><div className="text-xs text-slate-500">{wallet.nis} · {wallet.grade}</div></td><td className="p-3 text-right font-semibold">{money(wallet.balance)}</td><td className="p-3 text-right">{money(wallet.limit)}</td><td className="p-3"><span className={wallet.status === "Active" ? "text-emerald-700" : "text-rose-700"}>{wallet.status === "Active" ? "Aktif" : "Diblokir"}</span></td><td className="p-3"><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => { setTopUpWallet(wallet); setTopUpAmount(""); setTopUpReference(""); }} disabled={!canTopUp || wallet.status !== "Active"}>Isi Saldo</button><button type="button" className={outlineClass} onClick={() => void updateWalletPolicy(wallet)}>Atur</button></div></td></tr>)}</tbody></table></div></div>}

        {activeTab === "suppliers" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Pemasok</h2><p className="mt-1 text-xs text-slate-500">Direktori pemasok tenant.</p></div><button type="button" className={primaryClass} onClick={() => setSupplierDraft({ name: "", category: "", contact: "", pic: "" })}><Plus className="h-4 w-4" />Pemasok baru</button></div><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Nama / PIC</th><th className="p-3">Kategori</th><th className="p-3">Kontak</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.suppliers.map((supplier) => <tr key={supplier.id}><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{supplier.name}</div><div className="text-xs text-slate-500">{supplier.pic || "—"}</div></td><td className="p-3">{supplier.category || "—"}</td><td className="p-3">{supplier.contact || "—"}</td><td className="p-3">{supplier.status === "active" ? "Aktif" : "Nonaktif"}</td><td className="p-3 text-right"><div className="flex justify-end gap-2">{supplier.status === "active" && <><button type="button" className={outlineClass} onClick={() => setSupplierDraft({ id: supplier.id, name: supplier.name, category: supplier.category, contact: supplier.contact, pic: supplier.pic })}>Ubah</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-50" onClick={() => void runMutation("/api/cooperative/suppliers", "POST", { action: "deactivate", id: supplier.id }, "Pemasok dinonaktifkan.")}>Nonaktifkan</button></>}</div></td></tr>)}</tbody></table></div></div>}

        {activeTab === "transactions" && <div className="space-y-3"><h2 className="font-semibold text-slate-900 dark:text-white">Riwayat Transaksi & Buku Besar Dompet</h2>{snapshot.sales.length ? <div className="space-y-3">{snapshot.sales.map((sale) => <article key={sale.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-900 dark:text-white">{sale.studentName} <span className="text-xs font-normal text-slate-500">{sale.grade}</span></div><div className="mt-1 font-mono text-xs text-slate-500">{sale.id} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: snapshot.timeZone }).format(new Date(sale.date))}</div></div><div className="font-semibold text-slate-900 dark:text-white">{money(sale.total)}</div></div><div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">{sale.items.map((item) => <div key={item.id} className="flex justify-between gap-4 text-slate-600 dark:text-slate-300"><span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span></div>)}</div></article>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Belum ada transaksi pada tenant ini.</div>}
          <div className="mt-6"><h3 className="font-semibold text-slate-900 dark:text-white">Mutasi saldo terbaru</h3><div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/40"><tr><th className="p-3">Waktu</th><th className="p-3">Jenis / Referensi</th><th className="p-3 text-right">Perubahan</th><th className="p-3 text-right">Saldo akhir</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.walletLedger.map((entry) => <tr key={entry.id}><td className="p-3 text-xs">{new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: snapshot.timeZone }).format(new Date(entry.createdAt))}</td><td className="p-3">{entry.type} · {entry.reference}</td><td className="p-3 text-right">{money(entry.amount)}</td><td className="p-3 text-right">{money(entry.balanceAfter)}</td></tr>)}</tbody></table></div></div></div>}
        {activeTab === "migration" && <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900 dark:text-white">Pratinjau migrasi saldo dan transaksi</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Cocokkan dompet arsip dengan dompet santri dan produk tujuan. Saldo pembuka harus dapat direkonsiliasi dengan saldo akhir arsip setelah dikurangi seluruh penjualan yang ditemukan.</p></div>
            <button type="button" onClick={() => void runFinancialPreview()} disabled={financialBusy || busy} className={outlineClass}><RefreshCw className={financialBusy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{financialBusy ? "Menghitung…" : financialPreview ? "Hitung ulang pratinjau" : "Muat arsip dan pratinjau"}</button>
          </div>
          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Pratinjau arsip:</strong> belum ada data yang ditulis. Dompet dan baris produk harus dipetakan secara eksplisit; riwayat penjualan harus dinyatakan lengkap dan saldonya cocok. Penerapan memerlukan konfirmasi tambahan dan izin Admin Keuangan. HPP historis yang tidak tersedia tidak akan dihitung dari harga pokok produk saat ini.</div>
          {financialBusy && <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800"><Loader2 className="h-4 w-4 animate-spin" />Membaca arsip tenant dan memeriksa pemetaan…</div>}
          {financialPreview && <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Dompet arsip</p><p className="mt-1 text-xl font-semibold">{financialPreview.counts.sourceWallets}</p><p className="text-xs text-slate-500">{financialPreview.counts.readyWallets} lolos rekonsiliasi</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Transaksi arsip</p><p className="mt-1 text-xl font-semibold">{financialPreview.counts.sourceTransactions}</p><p className="text-xs text-slate-500">{financialPreview.counts.readyTransactions} tanggal dan item valid</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Baris produk</p><p className="mt-1 text-xl font-semibold">{financialPreview.counts.sourceItems}</p><p className="text-xs text-slate-500">{financialPreview.counts.mappedProducts} sudah dipetakan</p></div>
              <div className={financialPreview.blockingCount ? "rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"}><p className="text-xs">Pemeriksaan penghambat</p><p className="mt-1 text-xl font-semibold">{financialPreview.blockingCount}</p><p className="text-xs">{financialPreview.canApply ? "Semua pemeriksaan pratinjau terpenuhi" : "Perlu pemetaan atau perbaikan data"}</p></div>
            </section>
            {financialDirty && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Pemetaan berubah. Hasil pemeriksaan di bawah ini sudah kedaluwarsa; hitung ulang pratinjau sebelum menyimpulkan rekonsiliasi.</div>}
            <section className="space-y-3">
              <div><h3 className="font-semibold text-slate-900 dark:text-white">1. Pemetaan wallet dan saldo pembuka</h3><p className="mt-1 text-xs text-slate-500">Referensi arsip ditampilkan sebagai kode tersamar. Saldo tujuan harus nol dan belum memiliki riwayat.</p></div>
              {financialPreview.wallets.length ? financialPreview.wallets.map((wallet) => <article key={wallet.sourceRef} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-medium text-slate-900 dark:text-white">{wallet.studentLabel || "Wallet tanpa label santri"}</div><div className="font-mono text-xs text-slate-500">Ref arsip {wallet.sourceRef.slice(0, 12)}</div></div><div className="text-right text-xs text-slate-500">Saldo akhir arsip <strong className="text-slate-800 dark:text-slate-200">{money(wallet.closingBalance)}</strong><br />Penjualan terhitung <strong className="text-slate-800 dark:text-slate-200">{money(wallet.salesTotal)}</strong></div></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Dompet tujuan
                    <select value={financialMappings.wallets[wallet.sourceRef]?.targetWalletId || ""} onChange={(e) => { setFinancialMappings((current) => ({ ...current, wallets: { ...current.wallets, [wallet.sourceRef]: { ...current.wallets[wallet.sourceRef], targetWalletId: e.target.value || undefined } } })); markFinancialMappingChanged(); }} disabled={financialBusy || financialApplyBusy || busy} className={inputClass}>
                      <option value="">Pilih dompet santri</option>
                      {financialPreview.targetWalletOptions.map((target) => <option key={target.walletId} value={target.walletId}>{target.student} · {target.nis || "tanpa NIS"} · saldo {money(target.balance)} · {target.status === "active" ? "aktif" : "diblokir"}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Saldo pembuka hasil konfirmasi (rupiah)
                    <input type="number" min="0" step="1" inputMode="numeric" value={financialMappings.wallets[wallet.sourceRef]?.openingBalance ?? ""} onChange={(e) => { const value = e.target.value; setFinancialMappings((current) => ({ ...current, wallets: { ...current.wallets, [wallet.sourceRef]: { ...current.wallets[wallet.sourceRef], openingBalance: value === "" ? undefined : Number(value) } } })); markFinancialMappingChanged(); }} disabled={financialBusy || financialApplyBusy || busy} className={inputClass} />
                  </label>
                </div>
                {wallet.targetStudentLabel && <p className="text-xs text-slate-500">Santri tujuan: {wallet.targetStudentLabel} · {wallet.targetStudentNis || "tanpa NIS"} · perkiraan saldo akhir {money(wallet.expectedClosingBalance ?? 0)}</p>}
              </article>) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">Tidak ada dompet arsip yang dapat dipetakan.</div>}
            </section>
            <section className="space-y-3">
              <div><h3 className="font-semibold text-slate-900 dark:text-white">2. Pemetaan produk per baris transaksi</h3><p className="mt-1 text-xs text-slate-500">Pemetaan per baris produk menghindari pencocokan otomatis berdasarkan nama. Harga dan jumlah arsip tetap diperiksa terhadap total transaksi.</p></div>
              {financialPreview.transactions.some((transaction) => transaction.items.length > 0) ? financialPreview.transactions.flatMap((transaction) => transaction.items.map((item) => <article key={item.itemRef} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_1fr] dark:border-slate-800">
                <div><div className="font-medium text-slate-900 dark:text-white">{item.name}</div><div className="mt-1 text-xs text-slate-500">{transaction.createdAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeZone: snapshot.timeZone }).format(new Date(transaction.createdAt)) : "Tanggal tidak valid"} · {item.quantity} × {money(item.unitPrice)} = {money(item.lineTotal)}</div><div className="mt-1 font-mono text-[11px] text-slate-400">Transaksi {transaction.sourceRef.slice(0, 12)}</div></div>
                <label className="text-sm">Produk tujuan
                  <select value={financialMappings.products[item.itemRef] || ""} onChange={(e) => { setFinancialMappings((current) => ({ ...current, products: { ...current.products, [item.itemRef]: e.target.value } })); markFinancialMappingChanged(); }} disabled={financialBusy || financialApplyBusy || busy} className={inputClass}>
                    <option value="">Pilih produk</option>
                    {financialPreview.targetProductOptions.map((target) => <option key={target.id} value={target.id}>{target.sku || "tanpa SKU"} · {target.name} · {target.status === "active" ? "aktif" : "diarsipkan"}</option>)}
                  </select>
                </label>
              </article>)) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">Tidak ada baris produk yang ditemukan.</div>}
            </section>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200">
              <input type="checkbox" checked={financialMappings.confirmCompleteHistory} onChange={(e) => { setFinancialMappings((current) => ({ ...current, confirmCompleteHistory: e.target.checked })); markFinancialMappingChanged(); }} disabled={financialBusy || financialApplyBusy || busy} className="mt-0.5" />
              <span>Saya telah memastikan seluruh penjualan arsip untuk periode migrasi tersedia dan saldo pembuka dapat direkonsiliasi dengan saldo akhir setiap dompet.</span>
            </label>
            {financialPreview.warnings.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><h3 className="font-semibold text-amber-900 dark:text-amber-100">Catatan pemeriksaan</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">{financialPreview.warnings.map((warning) => <li key={warning.code}>{cooperativeFinancialWarningLabel(warning.code)} · {warning.count}</li>)}</ul></section>}
            {financialPreview.issues.length > 0 && <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30"><h3 className="font-semibold text-rose-900 dark:text-rose-100">Masalah yang menghambat ({financialPreview.blockingCount})</h3><ul className="mt-2 space-y-1 text-sm text-rose-900 dark:text-rose-100">{financialPreview.issues.map((issue, index) => <li key={issue.code + issue.recordRef + index}>{cooperativeFinancialIssueLabel(issue.code)}{issue.recordRef ? " · referensi " + issue.recordRef : ""}</li>)}</ul></section>}
            {!financialPreview.applyEnabled && <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Penerapan arsip belum diaktifkan operator. Pratinjau dan pemetaan tetap dapat ditinjau tanpa menulis data.</div>}
            {financialPreview.canApply && financialPreview.applyEnabled && !financialDirty && canTopUp && <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-sm text-emerald-900 dark:text-emerald-100">Pemetaan dan rekonsiliasi lolos pemeriksaan. Penerapan akan dicatat atomik pada saldo, transaksi, dan ledger tenant.</p><button type="button" onClick={() => void applyFinancialHistory()} disabled={financialApplyBusy || financialBusy || busy} className={primaryClass}>{financialApplyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{financialApplyBusy ? "Menerapkan…" : "Terapkan impor arsip"}</button></div>}
            {financialPreview.canApply && financialPreview.applyEnabled && !financialDirty && !canTopUp && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Pemeriksaan arsip lolos, tetapi akun ini belum memiliki izin Keuangan untuk menerapkan impor. Minta Admin dengan izin Keuangan untuk melanjutkan.</div>}
            <div role="note" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">Status "siap" berarti pemeriksaan awal lolos dan belum berarti data sudah dipindahkan. Pastikan arsip lengkap serta hasil saldo sudah direkonsiliasi sebelum penerapan.</div>
          </div>}
          {!financialPreview && !financialBusy && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">Muat arsip untuk melihat kandidat dompet, transaksi, dan pilihan tujuan tenant ini.</div>}
        </div>}
      </div>}
    </section>

    {productDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void saveProduct(e)} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">{productDraft.id ? "Ubah produk" : "Produk baru"}</h2><p className="mt-1 text-xs text-slate-500">Harga dan stok divalidasi kembali di basis data.</p></div><button type="button" aria-label="Tutup" onClick={() => setProductDraft(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">SKU<input required maxLength={48} value={productDraft.sku} onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })} className={inputClass} /></label><label className="text-sm">Nama<input required maxLength={180} value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} className={inputClass} /></label><label className="text-sm">Kategori<input maxLength={100} value={productDraft.category} onChange={(e) => setProductDraft({ ...productDraft, category: e.target.value })} className={inputClass} /></label><label className="text-sm">Harga jual<input required type="number" min="0" step="100" value={productDraft.price} onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })} className={inputClass} /></label><label className="text-sm">Harga pokok<input required type="number" min="0" step="100" value={productDraft.costPrice} onChange={(e) => setProductDraft({ ...productDraft, costPrice: e.target.value })} className={inputClass} /></label>{!productDraft.id && <label className="text-sm">Stok awal<input required type="number" min="0" step="1" value={productDraft.stock} onChange={(e) => setProductDraft({ ...productDraft, stock: e.target.value })} className={inputClass} /></label>}<label className="text-sm">Batas stok minimum<input required type="number" min="0" step="1" value={productDraft.reorderPoint} onChange={(e) => setProductDraft({ ...productDraft, reorderPoint: e.target.value })} className={inputClass} /></label><label className="text-sm">Kedaluwarsa<input type="date" value={productDraft.expiryDate} onChange={(e) => setProductDraft({ ...productDraft, expiryDate: e.target.value })} className={inputClass} /></label></div><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setProductDraft(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy}>{busy ? "Menyimpan…" : "Simpan produk"}</button></div></form></div>}

    {supplierDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void saveSupplier(e)} className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900 dark:text-white">{supplierDraft.id ? "Ubah pemasok" : "Pemasok baru"}</h2><button type="button" aria-label="Tutup" onClick={() => setSupplierDraft(null)} className="rounded p-1 text-slate-400"><X className="h-5 w-5" /></button></div><label className="block text-sm">Nama / perusahaan<input required maxLength={180} value={supplierDraft.name} onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Kategori<input maxLength={100} value={supplierDraft.category} onChange={(e) => setSupplierDraft({ ...supplierDraft, category: e.target.value })} className={inputClass} /></label><label className="text-sm">PIC<input maxLength={120} value={supplierDraft.pic} onChange={(e) => setSupplierDraft({ ...supplierDraft, pic: e.target.value })} className={inputClass} /></label></div><label className="block text-sm">Kontak<input maxLength={80} value={supplierDraft.contact} onChange={(e) => setSupplierDraft({ ...supplierDraft, contact: e.target.value })} className={inputClass} /></label><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setSupplierDraft(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy}>{busy ? "Menyimpan…" : "Simpan pemasok"}</button></div></form></div>}

    {topUpWallet && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(e) => void submitTopUp(e)} className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">Isi Saldo Dompet</h2><p className="mt-1 text-xs text-slate-500">{topUpWallet.student} · saldo {money(topUpWallet.balance)}</p></div><button type="button" aria-label="Tutup" onClick={() => setTopUpWallet(null)} className="rounded p-1 text-slate-400"><X className="h-5 w-5" /></button></div><label className="block text-sm">Jumlah<input required type="number" min="1" max="100000000" step="1000" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} className={inputClass} /></label><label className="block text-sm">Referensi penerimaan Finance<input required maxLength={180} value={topUpReference} onChange={(e) => setTopUpReference(e.target.value)} placeholder="Nomor kuitansi / transaksi" className={inputClass} /></label><p className="text-xs text-amber-700 dark:text-amber-300">Akun harus memiliki izin Keuangan. Aplikasi menyimpan referensi, tetapi belum memverifikasinya ke bank atau layanan pembayaran. Cocokkan pembayaran sebelum mencatat pengisian saldo.</p><div className="flex justify-end gap-2"><button type="button" className={outlineClass} onClick={() => setTopUpWallet(null)}>Batal</button><button type="submit" className={primaryClass} disabled={busy || !topUpAmount || !topUpReference.trim()}>{busy ? "Mencatat…" : "Catat pengisian saldo"}</button></div></form></div>}
  </main>;
}

