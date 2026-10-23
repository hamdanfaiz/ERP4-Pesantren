import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock3, Loader2, Plus, RefreshCw, Shirt, Settings2, WashingMachine } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { pendingMutationIds } from "../utils/pendingMutationId";

type Student = { id: string; name: string; nis: string; room: string };
type Order = { id: string; orderNumber: string; studentId: string; student: string; nis: string; room: string; weightKg: number; pieces: number; status: string; receivedAt: string; collectedAt: string | null };
type Quota = Student & { monthlyQuotaKg: number; usedKg: number; remainingKg: number; excessKg: number; estimatedCharge: number };
type Snapshot = { timeZone: string; period: string; settings: { monthlyQuotaKg: number; excessRatePerKg: number; updatedAt: string | null }; students: Student[]; orders: Order[]; quotas: Quota[] };

const EMPTY: Snapshot = { timeZone: "Asia/Jakarta", period: "", settings: { monthlyQuotaKg: 20, excessRatePerKg: 15000, updatedAt: null }, students: [], orders: [], quotas: [] };
const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50";
const outlineClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const statusLabel: Record<string, string> = { received: "Diterima", washing: "Dicuci", ready: "Siap diambil", collected: "Sudah diambil", cancelled: "Dibatalkan" };
const money = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
const formatDate = (value: string, timeZone: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));

async function requestLaundry(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Layanan Laundry Supabase belum dapat diproses.");
  return payload;
}

export function SupabaseLaundryManager() {
  const { role, user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<"orders" | "history" | "quotas" | "settings">("orders");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [pieces, setPieces] = useState("0");
  const [monthlyQuotaKg, setMonthlyQuotaKg] = useState("20");
  const [excessRatePerKg, setExcessRatePerKg] = useState("15000");

  const refresh = useCallback(async () => {
    const data = await requestLaundry("/api/laundry/snapshot");
    setSnapshot({ ...EMPTY, ...data });
    setMonthlyQuotaKg(String(data?.settings?.monthlyQuotaKg ?? 20));
    setExcessRatePerKg(String(data?.settings?.excessRatePerKg ?? 15000));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    requestLaundry("/api/laundry/snapshot")
      .then((data) => { if (active) { setSnapshot({ ...EMPTY, ...data }); setMonthlyQuotaKg(String(data?.settings?.monthlyQuotaKg ?? 20)); setExcessRatePerKg(String(data?.settings?.excessRatePerKg ?? 15000)); } })
      .catch((e: any) => { if (active) setError(e?.message || "Data laundry belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const runMutation = async (path: string, body: Record<string, unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    let lease: Awaited<ReturnType<typeof pendingMutationIds.acquire>> | null = null;
    try {
      const { clientRequestId: _clientRequestId, ...payload } = body;
      lease = await pendingMutationIds.acquire(
        `laundry:${user?.tenantId || "unknown"}:${user?.uid || "unknown"}:${path}`,
        payload,
      );
      await requestLaundry(path, {
        method: "POST",
        body: JSON.stringify({ ...payload, clientRequestId: lease.requestId }),
      });
      try {
        await refresh();
        lease.clear();
        setNotice(success);
      } catch {
        setError("Perubahan laundry sudah tersimpan, tetapi daftar belum berhasil dimuat ulang. Klik Muat ulang.");
      }
      return true;
    } catch (e: any) {
      setError(e?.message || "Perubahan laundry gagal disimpan.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const activeOrders = useMemo(() => snapshot.orders.filter((order) => ["received", "washing", "ready"].includes(order.status)), [snapshot.orders]);
  const historyOrders = useMemo(() => snapshot.orders.filter((order) => ["collected", "cancelled"].includes(order.status)), [snapshot.orders]);
  const visibleOrders = (tab === "history" ? historyOrders : activeOrders).filter((order) => `${order.orderNumber} ${order.student} ${order.nis} ${order.room}`.toLowerCase().includes(search.toLowerCase()));
  const visibleQuotas = snapshot.quotas.filter((item) => `${item.name} ${item.nis} ${item.room}`.toLowerCase().includes(search.toLowerCase()));

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) { setError("Pilih santri yang akan dicatat cucianya."); return; }
    const created = await runMutation("/api/laundry/orders", {
      studentId, weightKg: Number(weightKg), pieces: Number(pieces),
    }, "Pesanan laundry tercatat.");
    if (created) { setStudentId(""); setWeightKg(""); setPieces("0"); }
  };

  const transition = (order: Order, status: string) => runMutation(`/api/laundry/orders/${encodeURIComponent(order.id)}/status`, {
    status,
  }, `Status ${order.orderNumber} diperbarui: ${statusLabel[status]}.`);

  const submitSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    await runMutation("/api/laundry/settings", {
      monthlyQuotaKg: Number(monthlyQuotaKg), excessRatePerKg: Number(excessRatePerKg),
    }, "Pengaturan kuota laundry disimpan.");
  };

  if (role !== "Admin" && role !== "SuperAdmin") return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Modul Laundry Supabase saat ini tersedia untuk Admin tenant dengan izin Laundry.</div>;

  const tabs = [
    { id: "orders" as const, label: "Pesanan aktif", icon: WashingMachine },
    { id: "history" as const, label: "Riwayat", icon: Clock3 },
    { id: "quotas" as const, label: "Kuota santri", icon: Shirt },
    { id: "settings" as const, label: "Pengaturan", icon: Settings2 },
  ];

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-400/10 dark:text-violet-200"><Shirt className="h-3.5 w-3.5" />Supabase · {snapshot.period || "tenant"}</div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Laundry Pesantren</h1>
        <p className="mt-1 text-sm text-slate-500">Pesanan, status, dan pemakaian kuota tersimpan pada backend tenant.</p>
      </div>
      <button type="button" onClick={() => { setLoading(true); void refresh().catch((e: any) => setError(e?.message || "Data belum dapat dimuat.")).finally(() => setLoading(false)); }} disabled={loading || busy} className={outlineClass}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Muat ulang</button>
    </header>

    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><strong>Catatan migrasi:</strong> pesanan lama yang ditampilkan pada layar sebelumnya adalah data contoh dan tidak diimpor. Kelebihan kuota hanya menjadi estimasi berdasarkan pesanan bulan ini; belum membuat tagihan atau jurnal Finance.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Pesanan sedang diproses</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{activeOrders.length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Cucian bulan ini</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.quotas.reduce((sum, item) => sum + item.usedKg, 0).toLocaleString("id-ID")} kg</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Santri melebihi kuota</p><p className="mt-1 text-2xl font-semibold text-violet-700 dark:text-violet-300">{snapshot.quotas.filter((item) => item.excessKg > 0).length}</p></div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

      {tab === "settings" ? <form onSubmit={submitSettings} className="max-w-2xl space-y-4 p-4 sm:p-6">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Kebijakan kuota per bulan</h2><p className="mt-1 text-sm text-slate-500">Berlaku untuk seluruh santri aktif dalam tenant ini.</p></div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Kuota standar (kg)<input type="number" min="0" max="1000" step="0.5" required value={monthlyQuotaKg} onChange={(e) => setMonthlyQuotaKg(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tarif estimasi kelebihan per kg (Rp)<input type="number" min="0" max="10000000" step="1" required value={excessRatePerKg} onChange={(e) => setExcessRatePerKg(e.target.value)} className={inputClass} /></label>
        <p className="text-xs text-slate-500">Tarif ini hanya dipakai untuk estimasi pada laporan kuota. Pencatatan tagihan memerlukan integrasi Finance tersendiri.</p>
        <button type="submit" disabled={busy || loading} className={primaryClass}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Simpan pengaturan</button>
      </form> : <div className="space-y-4 p-4 sm:p-5">
        {tab === "orders" && <form onSubmit={submitOrder} className="grid gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto] dark:border-violet-900/50 dark:bg-violet-950/20">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Santri<select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputClass}><option value="">Pilih santri</option>{snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Berat (kg)<input type="number" min="0.01" max="100" step="0.01" required value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputClass} /></label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Jumlah potong<input type="number" min="0" max="1000" step="1" value={pieces} onChange={(e) => setPieces(e.target.value)} className={inputClass} /></label>
          <div className="flex items-end"><button type="submit" disabled={busy || loading || snapshot.students.length === 0} className={primaryClass}><Plus className="h-4 w-4" />Catat pesanan</button></div>
        </form>}
        {tab !== "quotas" && <label className="block"><span className="sr-only">Cari pesanan</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor pesanan, nama, NIS, atau kamar" className={inputClass.replace("mt-1.5", "mt-0")} /></label>}
        {tab === "quotas" && <label className="block"><span className="sr-only">Cari santri</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari santri, NIS, atau kamar" className={inputClass.replace("mt-1.5", "mt-0")} /></label>}
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data Laundry…</div> : tab === "quotas" ? <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950"><tr>{["Santri", "Kuota", "Terpakai", "Sisa", "Estimasi lebih kuota"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleQuotas.map((item) => <tr key={item.id}><td className="px-4 py-3"><div className="font-medium text-slate-900 dark:text-white">{item.name}</div><div className="text-xs text-slate-500">NIS {item.nis} · {item.room}</div></td><td className="px-4 py-3">{item.monthlyQuotaKg} kg</td><td className="px-4 py-3">{item.usedKg.toLocaleString("id-ID")} kg</td><td className="px-4 py-3">{item.remainingKg.toLocaleString("id-ID")} kg</td><td className="px-4 py-3">{item.excessKg > 0 ? <span className="font-medium text-amber-700 dark:text-amber-300">{item.excessKg.toLocaleString("id-ID")} kg · {money(item.estimatedCharge)}</span> : "—"}</td></tr>)}{visibleQuotas.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">Belum ada data kuota santri.</td></tr>}</tbody></table></div> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950"><tr>{["Nomor", "Santri", "Berat", "Diterima", "Status", "Aksi"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleOrders.map((order) => <tr key={order.id}><td className="px-4 py-3 font-mono text-xs text-violet-700 dark:text-violet-300">{order.orderNumber}</td><td className="px-4 py-3"><div className="font-medium text-slate-900 dark:text-white">{order.student}</div><div className="text-xs text-slate-500">NIS {order.nis} · {order.room}</div></td><td className="px-4 py-3">{order.weightKg} kg · {order.pieces} potong</td><td className="px-4 py-3 text-slate-500">{formatDate(order.receivedAt, snapshot.timeZone)}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{statusLabel[order.status] || order.status}</span></td><td className="px-4 py-3">{tab === "orders" && <div className="flex flex-wrap gap-2">{order.status === "received" && <button type="button" disabled={busy} onClick={() => void transition(order, "washing")} className={outlineClass}>Mulai cuci</button>}{order.status === "washing" && <button type="button" disabled={busy} onClick={() => void transition(order, "ready")} className={outlineClass}>Tandai siap</button>}{order.status === "ready" && <button type="button" disabled={busy} onClick={() => void transition(order, "collected")} className={primaryClass}>Tandai diambil</button>}<button type="button" disabled={busy} onClick={() => { if (window.confirm(`Batalkan ${order.orderNumber}?`)) void transition(order, "cancelled"); }} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40">Batalkan</button></div>}</td></tr>)}{visibleOrders.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">{tab === "history" ? "Belum ada pesanan pada riwayat." : "Belum ada pesanan aktif."}</td></tr>}</tbody></table></div>}
      </div>}
    </section>
  </main>;
}
