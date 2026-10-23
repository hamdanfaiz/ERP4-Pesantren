import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, BookOpen, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";

type DashboardPeriod = "today" | "week" | "month" | "year";
type DashboardSnapshot = {
  ppdb: { enabled: boolean; total?: number; accepted?: number; pending?: number; stages?: Array<{ stage: string; count: number }> };
  masterData: { enabled: boolean; activeStudents?: number; maleStudents?: number; femaleStudents?: number };
  finance: { enabled: boolean; openBillCount?: number; outstandingAmount?: number; unpaidCount?: number; partialCount?: number; verificationCount?: number; periodIncome?: number; periodExpense?: number; periodWalletDeposits?: number; periodWalletRedemptions?: number; walletLiability?: number; monthlyTrend?: Array<{ month: string; income: number; expense: number; walletDeposits?: number; walletRedemptions?: number }> };
};

const emptySnapshot: DashboardSnapshot = {
  ppdb: { enabled: false }, masterData: { enabled: false }, finance: { enabled: false },
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

async function loadDashboard(period: DashboardPeriod, signal?: AbortSignal) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Supabase tidak ditemukan. Silakan masuk kembali.");
  const response = await fetch(`/api/dashboard/snapshot?period=${encodeURIComponent(period)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ringkasan dashboard belum dapat dimuat.");
  return payload as DashboardSnapshot;
}

function MetricCard({ title, value, caption, icon: Icon, accent = "emerald" }: {
  title: string; value: string; caption: string; icon: LucideIcon; accent?: "emerald" | "blue" | "amber" | "rose";
}) {
  const accents = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p></div><span className={`rounded-lg p-2 ${accents[accent]}`}><Icon className="h-5 w-5" /></span></div>
    <p className="mt-3 text-xs text-slate-500">{caption}</p>
  </article>;
}

export function SupabaseDashboardOverview() {
  const { role, user } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>("year");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(emptySnapshot);
    setError("");
    if (!["Admin", "SuperAdmin"].includes(role || "")) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    loadDashboard(period, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setSnapshot(result); })
      .catch((loadError: any) => { if (!controller.signal.aborted) setError(loadError?.message || "Ringkasan dashboard belum dapat dimuat."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, reloadVersion, role, user?.tenantId, user?.uid]);

  const finance = snapshot.finance;
  const netCashflow = Number(finance.periodIncome || 0) + Number(finance.periodWalletDeposits || 0) - Number(finance.periodExpense || 0);
  const periodLabel: Record<DashboardPeriod, string> = { today: "Hari ini", week: "7 hari terakhir", month: "30 hari terakhir", year: "365 hari terakhir" };
  const stageRows = useMemo(() => (snapshot.ppdb.stages || []).map((entry) => ({
    stage: ({ Registered: "Terdaftar", "Document Review": "Verifikasi", "Entry Exam": "Ujian", Interview: "Wawancara", Accepted: "Diterima", Rejected: "Ditolak", Withdrawn: "Mengundurkan diri" } as Record<string, string>)[entry.stage] || entry.stage,
    jumlah: Number(entry.count || 0),
  })), [snapshot.ppdb.stages]);

  if (!(["Admin", "SuperAdmin"].includes(role || ""))) {
    return <main className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
      Ringkasan untuk peran {role || "ini"} belum tersedia. Aplikasi tidak mengambil data dari Firebase.
    </main>;
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Ringkasan tenant · Supabase</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Ringkasan eksekutif pesantren</h1><p className="mt-1 text-sm text-slate-500">Indikator PPDB, santri aktif, tagihan, dan arus kas tenant.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="dashboard-period">Rentang arus kas</label>
        <select id="dashboard-period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <option value="today">Hari ini</option><option value="week">7 hari</option><option value="month">30 hari</option><option value="year">365 hari</option>
        </select>
        <button onClick={() => setReloadVersion((value) => value + 1)} disabled={loading} aria-label="Muat ulang ringkasan" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang</button>
      </div>
    </header>

    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">Ringkasan ini hanya menghitung data yang sudah berada di Supabase. Data Firebase lama belum dihitung sampai proses impor dan rekonsiliasinya selesai.</div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indikator utama">
      <MetricCard title="Total pendaftar PPDB" value={loading ? "—" : snapshot.ppdb.enabled ? String(snapshot.ppdb.total || 0) : "—"} caption={loading ? "Memuat ringkasan tenant…" : snapshot.ppdb.enabled ? `${snapshot.ppdb.accepted || 0} diterima · ${snapshot.ppdb.pending || 0} masih dalam proses` : "Izin modul PPDB tidak diberikan"} icon={Users} accent="blue" />
      <MetricCard title="Santri aktif" value={loading ? "—" : snapshot.masterData.enabled ? String(snapshot.masterData.activeStudents || 0) : "—"} caption={loading ? "Memuat ringkasan tenant…" : snapshot.masterData.enabled ? `${snapshot.masterData.maleStudents || 0} putra · ${snapshot.masterData.femaleStudents || 0} putri` : "Izin Data Induk tidak diberikan"} icon={BookOpen} />
      <MetricCard title="Sisa tagihan" value={loading ? "—" : finance.enabled ? rupiah(finance.outstandingAmount || 0) : "—"} caption={loading ? "Memuat ringkasan tenant…" : finance.enabled ? `${finance.openBillCount || 0} tagihan terbuka` : "Izin modul keuangan tidak diberikan"} icon={Wallet} accent="amber" />
      <MetricCard title="Saldo titipan santri" value={loading ? "—" : finance.enabled ? rupiah(finance.walletLiability || 0) : "—"} caption={loading ? "Memuat ringkasan tenant…" : finance.enabled ? "Kewajiban dompet santri yang masih tersisa" : "Izin modul keuangan tidak diberikan"} icon={Wallet} accent="blue" />
      <MetricCard title={`Arus kas · ${periodLabel[period]}`} value={loading ? "—" : finance.enabled ? rupiah(netCashflow) : "—"} caption={loading ? "Memuat ringkasan tenant…" : finance.enabled ? `${rupiah(finance.periodIncome || 0)} pendapatan · ${rupiah(finance.periodWalletDeposits || 0)} titipan masuk · ${rupiah(finance.periodWalletRedemptions || 0)} titipan digunakan · ${rupiah(finance.periodExpense || 0)} pengeluaran; bukan saldo bank` : "Izin modul keuangan tidak diberikan"} icon={TrendingUp} accent={netCashflow < 0 ? "rose" : "emerald"} />
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Alur pendaftaran PPDB</h2><p className="mt-1 text-xs text-slate-500">Jumlah calon santri per tahap seleksi.</p></div><Activity className="h-5 w-5 text-blue-600 dark:text-blue-300" /></div>
        {!snapshot.ppdb.enabled ? <p className="mt-8 text-sm text-slate-500">Data PPDB disembunyikan karena izin modul tidak tersedia.</p> : loading ? <p className="mt-8 text-sm text-slate-500">Memuat data…</p> : stageRows.length ? <div className="mt-5 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageRows} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} vertical={false} /><XAxis dataKey="stage" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="jumlah" name="Calon santri" fill="#2563eb" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-8 text-sm text-slate-500">Belum ada calon santri di Supabase.</p>}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Arus kas tercatat</h2><p className="mt-1 text-xs text-slate-500">Pendapatan, titipan masuk/pemakaian, dan pengeluaran per bulan.</p></div><TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /></div>
        {!finance.enabled ? <p className="mt-8 text-sm text-slate-500">Data keuangan disembunyikan karena izin modul tidak tersedia.</p> : loading ? <p className="mt-8 text-sm text-slate-500">Memuat data…</p> : finance.monthlyTrend?.length ? <div className="mt-5 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={finance.monthlyTrend} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} vertical={false} /><XAxis dataKey="month" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0))} stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><Tooltip formatter={(value: any) => rupiah(Number(value || 0))} /><Legend /><Bar dataKey="income" name="Pendapatan" fill="#059669" radius={[4, 4, 0, 0]} /><Bar dataKey="walletDeposits" name="Titipan masuk" fill="#2563eb" radius={[4, 4, 0, 0]} /><Bar dataKey="walletRedemptions" name="Titipan digunakan" fill="#a855f7" radius={[4, 4, 0, 0]} /><Bar dataKey="expense" name="Pengeluaran" fill="#e11d48" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-8 text-sm text-slate-500">Belum ada mutasi keuangan pada buku besar Supabase.</p>}
      </article>
    </section>

    {finance.enabled && <section className="grid gap-4 sm:grid-cols-3">
      {[{ label: "Belum dibayar", value: finance.unpaidCount || 0 }, { label: "Pembayaran sebagian", value: finance.partialCount || 0 }, { label: "Menunggu verifikasi", value: finance.verificationCount || 0 }].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-medium text-slate-500">{item.label}</p><p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : item.value}</p></div>)}
    </section>}
  </main>;
}
