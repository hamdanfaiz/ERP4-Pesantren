import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Download, FileCheck2, Lock, LockOpen, Plus, RefreshCw, Upload, Wallet, X } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { normalizeTenantTimeZone, tenantDate } from "../lib/tenantTimeZone";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Tab = "bills" | "expenses" | "ledger";
type Bill = { id: string; santriId: string; santriName: string; grade: string; type: string; period: string; amount: number; paidAmount: number; status: string; date: string; paymentMethod?: string | null; proofFile?: string | null; proofStoragePath?: string | null; uploadedAt?: string | null; rejectionReason?: string; receiptNo?: string | null; paidAt?: string | null };
type Expense = { id: string; category: string; description: string; amount: number; date: string; status: string; department: string; requester: string; requesterUid: string; approvedByUid?: string | null; approvedAt?: string | null; rejectionReason?: string };
type Student = { id: string; name: string; grade: string };
type Ledger = { id: string; type: string; sourceType: string; sourceId: string; description: string; amount: number; paymentMethod?: string | null; receiptNo?: string | null; date: string };
type Snapshot = { bills: Bill[]; expenses: Expense[]; students: Student[]; ledger: Ledger[]; financeLocked: boolean };

const emptySnapshot: Snapshot = { bills: [], expenses: [], students: [], ledger: [], financeLocked: false };
const today = (timeZone?: string) => tenantDate(new Date(), normalizeTenantTimeZone(timeZone));

async function runIdempotentFinanceMutation<T>(
  operation: string,
  tenantId: string,
  actorId: string,
  payload: unknown,
  send: (clientRequestId: string) => Promise<T>,
): Promise<T> {
  const lease = await pendingMutationIds.acquire(`finance:${operation}`, { tenantId, actorId, payload });
  const result = await send(lease.requestId);
  lease.clear();
  return result;
}

async function requestFinance(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan Finance belum dapat diproses.");
  return payload;
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function statusText(value: string) {
  const map: Record<string, string> = { unpaid: "Belum dibayar", partial: "Sebagian", verification: "Menunggu verifikasi", paid: "Lunas", pending: "Menunggu persetujuan", approved: "Disetujui", rejected: "Ditolak" };
  return map[value] || value;
}

export function SupabaseFinanceManager() {
  const { role, user } = useAuth();
  const isAdmin = role === "Admin" || role === "SuperAdmin";
  const canRequestExpense = isAdmin || role === "Ustadz";
  const isParent = role === "Walisantri";
  const isSupportedRole = isAdmin || isParent || role === "Ustadz";
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<Tab>(isAdmin || isParent ? "bills" : "expenses");
  const [createType, setCreateType] = useState<"bill" | "expense" | null>(null);
  const [billForm, setBillForm] = useState({ studentId: "", feeType: "SPP Bulanan", period: "", amount: "" });
  const [expenseForm, setExpenseForm] = useState({ category: "Operasional", description: "", amount: "", department: "Umum" });
  const expenseDateRef = useRef(today(user?.tenantTimeZone));
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentChannel, setPaymentChannel] = useState("BSI");

  const refresh = useCallback(async () => {
    const result = await requestFinance("/api/finance/snapshot");
    setSnapshot({
      bills: Array.isArray(result.bills) ? result.bills : [],
      expenses: Array.isArray(result.expenses) ? result.expenses : [],
      students: Array.isArray(result.students) ? result.students : [],
      ledger: Array.isArray(result.ledger) ? result.ledger : [],
      financeLocked: result.financeLocked === true,
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    requestFinance("/api/finance/snapshot")
      .then((result) => { if (active) setSnapshot({ bills: Array.isArray(result.bills) ? result.bills : [], expenses: Array.isArray(result.expenses) ? result.expenses : [], students: Array.isArray(result.students) ? result.students : [], ledger: Array.isArray(result.ledger) ? result.ledger : [], financeLocked: result.financeLocked === true }); })
      .catch((loadError: any) => { if (active) setError(loadError?.message || "Data keuangan belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    if (role === "Walisantri") setTab("bills");
    else if (role === "Ustadz") setTab("expenses");
  }, [role]);

  const totals = useMemo(() => {
    const billed = snapshot.bills.reduce((sum, item) => sum + item.amount, 0);
    const collected = snapshot.bills.reduce((sum, item) => sum + item.paidAmount, 0);
    const approvedExpenses = snapshot.expenses.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
    return { billed, collected, outstanding: Math.max(0, billed - collected), approvedExpenses };
  }, [snapshot.bills, snapshot.expenses]);

  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 4000); };

  const refreshAfterMutation = async (successMessage: string) => {
    showToast(successMessage);
    try {
      await refresh();
    } catch {
      setError("Perubahan sudah tersimpan, tetapi daftar belum berhasil dimuat. Gunakan tombol Muat ulang.");
    }
  };

  const submitBill = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const batch = { items: [{ studentId: billForm.studentId, feeType: billForm.feeType.trim(), period: billForm.period.trim(), amount: Number(billForm.amount) }] };
      await runIdempotentFinanceMutation("create-bills", user?.tenantId || "", user?.uid || "", batch, (clientRequestId) =>
        requestFinance("/api/finance/bills", { method: "POST", body: JSON.stringify({ batch: { ...batch, clientRequestId } }) }));
      setCreateType(null); setBillForm({ studentId: "", feeType: "SPP Bulanan", period: "", amount: "" }); await refreshAfterMutation("Tagihan berhasil diterbitkan.");
    } catch (saveError: any) { setError(saveError?.message || "Tagihan belum dapat diterbitkan."); }
    finally { setSaving(false); }
  };

  const submitExpense = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const expense = {
        category: expenseForm.category.trim(), description: expenseForm.description.trim(),
        amount: Number(expenseForm.amount), department: expenseForm.department.trim(), expenseDate: expenseDateRef.current,
      };
      await runIdempotentFinanceMutation("create-expense", user?.tenantId || "", user?.uid || "", expense, (clientRequestId) =>
        requestFinance("/api/finance/expenses", { method: "POST", body: JSON.stringify({ expense: { ...expense, clientRequestId } }) }));
      setCreateType(null); setExpenseForm({ category: "Operasional", description: "", amount: "", department: "Umum" });
      expenseDateRef.current = today(user?.tenantTimeZone);
      await refreshAfterMutation("Pengajuan pengeluaran tersimpan untuk diperiksa.");
    } catch (saveError: any) { setError(saveError?.message || "Pengajuan pengeluaran gagal disimpan."); }
    finally { setSaving(false); }
  };

  const reviewBill = async (bill: Bill, action: "settle" | "reject") => {
    const methodOrReason = action === "settle" ? (bill.status === "verification" ? "Transfer manual" : "Tunai Kasir") : window.prompt("Alasan penolakan bukti pembayaran:")?.trim() || "";
    if (!methodOrReason) return;
    if (action === "settle" && !window.confirm(`Catat pelunasan ${bill.santriName} sebesar ${currency(bill.amount - bill.paidAmount)}?`)) return;
    setSaving(true); setError("");
    try {
      const review = { billId: bill.id, action, methodOrReason };
      await runIdempotentFinanceMutation("review-bill", user?.tenantId || "", user?.uid || "", review, (clientRequestId) =>
        requestFinance("/api/finance/bills/review", { method: "POST", body: JSON.stringify({ review: { ...review, clientRequestId } }) }));
      await refreshAfterMutation(action === "settle" ? "Pembayaran disahkan dan masuk ledger." : "Bukti ditolak dan alasan dicatat.");
    } catch (reviewError: any) { setError(reviewError?.message || "Keputusan tagihan belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const reviewExpense = async (expense: Expense, action: "approve" | "reject") => {
    const rejectionReason = action === "reject" ? window.prompt("Alasan penolakan pengeluaran:")?.trim() || "" : "";
    if (action === "reject" && !rejectionReason) return;
    if (action === "approve" && !window.confirm(`Setujui pengeluaran ${currency(expense.amount)} untuk ${expense.description}?`)) return;
    setSaving(true); setError("");
    try {
      const review = { expenseId: expense.id, action, rejectionReason };
      await runIdempotentFinanceMutation("review-expense", user?.tenantId || "", user?.uid || "", review, (clientRequestId) =>
        requestFinance("/api/finance/expenses/review", { method: "POST", body: JSON.stringify({ review: { ...review, clientRequestId } }) }));
      await refreshAfterMutation(action === "approve" ? "Pengeluaran disetujui dan masuk ledger." : "Pengeluaran ditolak.");
    } catch (reviewError: any) { setError(reviewError?.message || "Keputusan pengeluaran gagal disimpan."); }
    finally { setSaving(false); }
  };

  const toggleLock = async () => {
    const locked = !snapshot.financeLocked;
    if (!window.confirm(locked ? "Tutup buku keuangan tenant?" : "Buka kembali buku keuangan tenant?")) return;
    setSaving(true); setError("");
    try {
      const change = { locked };
      await runIdempotentFinanceMutation("set-book-lock", user?.tenantId || "", user?.uid || "", change, (clientRequestId) =>
        requestFinance("/api/finance/lock", { method: "POST", body: JSON.stringify({ lock: { ...change, clientRequestId } }) }));
      await refreshAfterMutation(locked ? "Buku keuangan ditutup." : "Buku keuangan dibuka.");
    } catch (lockError: any) { setError(lockError?.message || "Status buku gagal disimpan."); }
    finally { setSaving(false); }
  };

  const uploadProof = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentBill || !paymentFile) { setError("Pilih bukti pembayaran terlebih dahulu."); return; }
    setSaving(true); setError("");
    try {
      if (!globalThis.crypto?.subtle) throw new Error("Peramban ini tidak mendukung pemeriksaan keamanan berkas.");
      const fileDigest = await crypto.subtle.digest("SHA-256", await paymentFile.arrayBuffer());
      const fileSha256 = Array.from(new Uint8Array(fileDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Berkas tidak dapat dibaca."));
        reader.onerror = () => reject(new Error("Berkas tidak dapat dibaca."));
        reader.readAsDataURL(paymentFile);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const identity = { billingId: paymentBill.id, fileName: paymentFile.name, mimeType: paymentFile.type, payChannel: paymentChannel, fileSha256 };
      await runIdempotentFinanceMutation("payment-proof", user?.tenantId || "", user?.uid || "", identity, (clientRequestId) =>
        requestFinance("/api/finance/payment-proofs", { method: "POST", body: JSON.stringify({ billingId: paymentBill.id, fileName: paymentFile.name, mimeType: paymentFile.type, base64, payChannel: paymentChannel, clientRequestId }) }));
      setPaymentBill(null); setPaymentFile(null); await refreshAfterMutation("Bukti pembayaran terkirim untuk verifikasi.");
    } catch (uploadError: any) { setError(uploadError?.message || "Bukti pembayaran belum dapat diunggah."); }
    finally { setSaving(false); }
  };

  const openProof = async (bill: Bill) => {
    const proofWindow = window.open("about:blank", "_blank");
    if (!proofWindow) { setError("Izinkan pop-up agar bukti transfer dapat dibuka."); return; }
    proofWindow.opener = null;
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/finance/payment-proofs/" + encodeURIComponent(bill.id), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Bukti transfer tidak dapat diakses."); }
      const objectUrl = URL.createObjectURL(await response.blob());
      proofWindow.location.replace(objectUrl); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    } catch (openError: any) { proofWindow.close(); setError(openError?.message || "Bukti transfer tidak dapat diakses."); }
  };

  const exportLedger = () => {
    const rows = [["Tanggal", "Jenis", "Deskripsi", "Nominal", "Metode", "Kuitansi"], ...snapshot.ledger.map((item) => [item.date, item.type === "custodial_inflow" ? "Titipan diterima" : item.type === "custodial_release" ? "Titipan digunakan" : item.type === "income" ? "Pemasukan" : "Pengeluaran", item.description, String(item.amount), item.paymentMethod || "", item.receiptNo || ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ledger-finance-${today(user?.tenantTimeZone)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const canSeeBills = isAdmin || isParent;
  if (!isSupportedRole) return <main className="mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">Fitur uang saku di Keuangan Supabase belum tersedia untuk peran ini.</main>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div><div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-950/40"><Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /></div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Keuangan</h1><p className="mt-1 text-sm text-slate-500">Tagihan, pengajuan, verifikasi, dan buku besar pesantren tersimpan pada Supabase.</p></div>
        <div className="flex flex-wrap gap-2">{isAdmin && canSeeBills && tab === "bills" && <button onClick={() => { setError(""); setCreateType("bill"); }} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> Terbitkan tagihan</button>}{canRequestExpense && tab === "expenses" && <button onClick={() => { expenseDateRef.current = today(user?.tenantTimeZone); setError(""); setCreateType("expense"); }} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> Ajukan pengeluaran</button>}{isAdmin && <button onClick={() => void toggleLock()} disabled={saving} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${snapshot.financeLocked ? "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>{snapshot.financeLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{snapshot.financeLocked ? "Buka buku" : "Tutup buku"}</button>}<button onClick={() => { setLoading(true); setError(""); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} aria-label="Muat ulang Finance" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button></div>
      </header>

      <div role="note" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Catatan keuangan baru disimpan langsung ke Supabase. Admin dapat menerbitkan tagihan atau mencatat pengeluaran dari modul ini; data contoh dari sistem lama tidak disalin.</div>
      {snapshot.financeLocked && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"><Lock className="h-4 w-4" /> Buku keuangan tenant ditutup. Pengajuan dan perubahan tagihan ditolak sampai Admin membukanya kembali.</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {toast && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{toast}</div>}

      {isAdmin && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Total tagihan", value: totals.billed, icon: ArrowUpRight },
        { label: "Terkumpul", value: totals.collected, icon: CheckCircle2 },
        { label: "Sisa tagihan", value: totals.outstanding, icon: ArrowDownRight },
        { label: "Pengeluaran disetujui", value: totals.approvedExpenses, icon: Wallet },
      ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : currency(value)}</p></div>)}</section>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          {canSeeBills && <button onClick={() => setTab("bills")} aria-pressed={tab === "bills"} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "bills" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Tagihan</button>}
          {(isAdmin || role === "Ustadz") && <button onClick={() => setTab("expenses")} aria-pressed={tab === "expenses"} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "expenses" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Pengeluaran</button>}
          {isAdmin && <button onClick={() => setTab("ledger")} aria-pressed={tab === "ledger"} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "ledger" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Buku Besar</button>}
          <span className="ml-auto text-xs text-slate-400">Sumber: Supabase tenant</span>
        </div>
        {loading ? <div role="status" className="p-12 text-center text-sm text-slate-500">Memuat data keuangan…</div> : tab === "bills" ? (snapshot.bills.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Santri</th><th className="p-4">Tagihan</th><th className="p-4">Periode</th><th className="p-4 text-right">Nominal</th><th className="p-4">Status</th><th className="p-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.bills.map((bill) => <tr key={bill.id}><td className="p-4"><div className="font-medium text-slate-900 dark:text-white">{bill.santriName}</div><div className="text-xs text-slate-500">{bill.grade || "—"}</div></td><td className="p-4 text-slate-700 dark:text-slate-300">{bill.type}</td><td className="p-4 text-slate-500">{bill.period}</td><td className="p-4 text-right font-medium text-slate-800 dark:text-slate-200">{currency(bill.amount)}{bill.paidAmount > 0 && <div className="text-xs text-slate-500">Dibayar {currency(bill.paidAmount)}</div>}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bill.status === "paid" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : bill.status === "verification" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>{statusText(bill.status)}</span>{bill.rejectionReason && <div className="mt-1 max-w-56 text-xs text-rose-600">{bill.rejectionReason}</div>}</td><td className="p-4 text-right"><div className="flex justify-end gap-2">{bill.proofStoragePath && <button onClick={() => void openProof(bill)} title="Lihat bukti" className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"><FileCheck2 className="h-4 w-4" /></button>}{isParent && ["unpaid", "partial"].includes(bill.status) && <button disabled={saving || snapshot.financeLocked} onClick={() => { setPaymentBill(bill); setPaymentFile(null); setError(""); }} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Bayar</button>}{isAdmin && bill.status !== "paid" && <><button disabled={saving || snapshot.financeLocked} onClick={() => void reviewBill(bill, "settle")} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/20 dark:text-emerald-300">{bill.status === "verification" ? "Setujui" : "Tunai"}</button>{bill.status === "verification" && <button disabled={saving || snapshot.financeLocked} onClick={() => void reviewBill(bill, "reject")} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/20 dark:text-rose-300">Tolak</button>}</>}</div></td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><Wallet className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada tagihan Supabase</p><p className="mt-1 text-sm text-slate-500">Admin dapat menerbitkan tagihan dari tombol di atas.</p></div>)
          : tab === "expenses" ? (snapshot.expenses.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Uraian</th><th className="p-4">Unit / Kategori</th><th className="p-4">Pengaju</th><th className="p-4 text-right">Nominal</th><th className="p-4">Status</th>{isAdmin && <th className="p-4 text-right">Aksi</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.expenses.map((expense) => <tr key={expense.id}><td className="p-4"><div className="font-medium text-slate-900 dark:text-white">{expense.description}</div><div className="text-xs text-slate-500">{expense.date}</div>{expense.rejectionReason && <div className="mt-1 text-xs text-rose-600">{expense.rejectionReason}</div>}</td><td className="p-4 text-slate-600 dark:text-slate-300">{expense.department}<div className="text-xs text-slate-500">{expense.category}</div></td><td className="p-4 text-slate-600 dark:text-slate-300">{expense.requester}</td><td className="p-4 text-right font-medium">{currency(expense.amount)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs ${expense.status === "approved" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : expense.status === "rejected" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>{statusText(expense.status)}</span></td>{isAdmin && <td className="p-4 text-right">{expense.status === "pending" && <div className="flex justify-end gap-2"><button disabled={saving || snapshot.financeLocked || expense.requesterUid === user?.uid} onClick={() => void reviewExpense(expense, "approve")} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50 dark:border-emerald-500/20 dark:text-emerald-300">Setujui</button><button disabled={saving || snapshot.financeLocked || expense.requesterUid === user?.uid} onClick={() => void reviewExpense(expense, "reject")} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-500/20 dark:text-rose-300">Tolak</button></div>}</td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><Wallet className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Belum ada pengajuan pengeluaran</p></div>)
            : (snapshot.ledger.length ? <div><div className="flex justify-end p-3"><button onClick={exportLedger} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"><Download className="h-4 w-4" /> Ekspor CSV</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="p-4">Tanggal</th><th className="p-4">Deskripsi</th><th className="p-4">Jenis</th><th className="p-4 text-right">Nominal</th><th className="p-4">Metode / kuitansi</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{snapshot.ledger.map((item) => <tr key={item.id}><td className="p-4 text-slate-500">{new Date(item.date).toLocaleDateString("id-ID")}</td><td className="p-4 font-medium text-slate-800 dark:text-slate-200">{item.description}</td><td className="p-4 text-slate-500">{item.type === "custodial_inflow" ? "Titipan diterima" : item.type === "custodial_release" ? "Titipan digunakan" : item.type === "income" ? "Pemasukan" : "Pengeluaran"}</td><td className="p-4 text-right font-medium">{currency(item.amount)}</td><td className="p-4 text-slate-500">{item.paymentMethod || "—"}<div className="text-xs">{item.receiptNo || "—"}</div></td></tr>)}</tbody></table></div></div> : <div className="p-12 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-800 dark:text-slate-200">Buku besar Supabase masih kosong</p><p className="mt-1 text-sm text-slate-500">Pelunasan, pengeluaran yang disetujui, dan pengisian saldo dompet tercatat pada buku besar.</p></div>)}
      </section>

      {createType === "bill" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitBill} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Terbitkan tagihan</h2><p className="mt-1 text-xs text-slate-500">Duplikasi kombinasi santri, jenis, dan periode ditolak secara transaksional.</p></div><button type="button" onClick={() => setCreateType(null)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Santri<select required value={billForm.studentId} onChange={(event) => setBillForm({ ...billForm, studentId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="">Pilih santri…</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.grade || "—"}</option>)}</select></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jenis tagihan<input required maxLength={160} value={billForm.feeType} onChange={(event) => setBillForm({ ...billForm, feeType: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Periode<input required maxLength={80} placeholder="Contoh: Oktober 2026" value={billForm.period} onChange={(event) => setBillForm({ ...billForm, period: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nominal (Rupiah)<input required type="number" min="1" step="1" value={billForm.amount} onChange={(event) => setBillForm({ ...billForm, amount: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setCreateType(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Batal</button><button type="submit" disabled={saving || snapshot.financeLocked || !billForm.studentId} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Terbitkan"}</button></div></form></div>}

      {createType === "expense" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={submitExpense} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Ajukan pengeluaran</h2><p className="mt-1 text-xs text-slate-500">Pengaju tidak dapat menyetujui pengajuannya sendiri.</p></div><button type="button" onClick={() => setCreateType(null)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Kategori<input required maxLength={100} value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Unit<input required maxLength={120} value={expenseForm.department} onChange={(event) => setExpenseForm({ ...expenseForm, department: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Uraian<textarea required maxLength={1000} value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nominal (Rupiah)<input required type="number" min="1" step="1" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setCreateType(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Batal</button><button type="submit" disabled={saving || snapshot.financeLocked} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Mengirim…" : "Ajukan"}</button></div></form></div>}

      {paymentBill && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={uploadProof} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Unggah bukti pembayaran</h2><p className="mt-1 text-xs text-slate-500">{paymentBill.type} · {currency(paymentBill.amount - paymentBill.paidAmount)} tersisa</p></div><button type="button" disabled={saving} onClick={() => { setPaymentBill(null); setPaymentFile(null); }} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Bank tujuan<select disabled={saving} value={paymentChannel} onChange={(event) => setPaymentChannel(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"><option>BSI</option><option>Muamalat</option><option>MandiriSyariah</option></select></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Berkas bukti <input required disabled={saving} type="file" accept="image/png,image/jpeg,application/pdf" onChange={(event) => { const file = event.target.files?.[0] || null; setPaymentFile(file); }} className="mt-1.5 block w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700" /></label><p className="text-xs text-slate-500">PNG, JPG, atau PDF; maksimal 3 MB. Berkas disimpan pada Storage privat tenant.</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" disabled={saving} onClick={() => { setPaymentBill(null); setPaymentFile(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700">Batal</button><button type="submit" disabled={saving || !paymentFile} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Mengunggah…" : "Kirim bukti"}</button></div></form></div>}
    </main>
  );
}

