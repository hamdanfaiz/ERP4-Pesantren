import { toERPUserMessage } from "../utils/userMessages";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, BookOpen, CheckCircle2, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { calculateDashboardNetCashflow } from "../utils/dashboardCashflow";
import { getCompletedDashboardFinanceTrend, hasDashboardFinanceActivity } from "../utils/dashboardFinanceTrend";
import { ERPTabs } from "../components/ERPDesignSystem";

const SupabaseDashboardBarChart = React.lazy(() => import("../components/SupabaseDashboardBarChart").then((module) => ({ default: module.SupabaseDashboardBarChart })));

type DashboardPeriod = "today" | "week" | "month" | "year";
type IntelligenceTab = "executive" | "predictive" | "tahfidz-ai" | "warehouse" | "knowledge";
type DashboardSnapshot = {
  ppdb: { enabled: boolean; total?: number; accepted?: number; pending?: number; stages?: Array<{ stage: string; count: number }> };
  masterData: { enabled: boolean; activeStudents?: number; maleStudents?: number; femaleStudents?: number };
  finance: { enabled: boolean; openBillCount?: number; outstandingAmount?: number; unpaidCount?: number; partialCount?: number; verificationCount?: number; periodIncome?: number; periodExpense?: number; periodWalletDeposits?: number; periodWalletRedemptions?: number; walletLiability?: number; monthlyTrend?: Array<{ month: string; income: number; expense: number; walletDeposits?: number; walletRedemptions?: number }> };
};
type TahfidzLeaderboard = {
  businessDate: string;
  rankingMode: "lifetime_hafalan" | "monthly_ziyadah";
  periodStart: string | null;
  students: Array<{ id: string; rank: number; name: string; grade: string; halaqah: string; ziyadahRecords: number; hafalanAyahs: number | null; ziyadahAyahs: number | null; ziyadahActiveDays: number }>;
  hasMore: boolean;
};
type DocumentSearchResult = {
  id: string;
  documentNumber: string;
  direction: "incoming" | "outgoing" | "internal";
  subject: string;
  senderName: string | null;
  recipientName: string | null;
  documentDate: string;
  status: string;
};

const emptySnapshot: DashboardSnapshot = {
  ppdb: { enabled: false }, masterData: { enabled: false }, finance: { enabled: false },
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function monthLabel(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)
    : month;
}

function monthChangeCaption(current: number, previous: number, previousMonth: string) {
  const difference = current - previous;
  const movement = difference > 0 ? "Naik" : difference < 0 ? "Turun" : "Tidak berubah";
  const percentage = previous === 0 ? "" : ` (${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Math.abs(difference / Math.abs(previous) * 100))}%)`;
  return `${movement} ${rupiah(Math.abs(difference))}${percentage} dibanding ${monthLabel(previousMonth)}.`;
}

async function loadDashboard(period: DashboardPeriod, surface: "dashboard" | "intelligence", signal?: AbortSignal) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
  const query = new URLSearchParams({ period, surface });
  const response = await fetch(`/api/dashboard/snapshot?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ringkasan dashboard belum dapat dimuat.");
  return payload as DashboardSnapshot;
}

async function loadTahfidzLeaderboard(limit: 5 | 20, signal?: AbortSignal): Promise<TahfidzLeaderboard> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
  const response = await fetch(`/api/tahfidz/leaderboard?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Capaian Tahfidz belum dapat dimuat.");
  if (!payload || !Array.isArray(payload.students) || typeof payload.businessDate !== "string"
    || !["lifetime_hafalan", "monthly_ziyadah"].includes(payload.rankingMode)) {
    throw new Error("Format capaian Tahfidz tidak valid.");
  }
  return payload as TahfidzLeaderboard;
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

export function SupabaseDashboardOverview({ surface = "dashboard" }: { surface?: "dashboard" | "intelligence" }) {
  const { role, user } = useAuth();
  const isIntelligence = surface === "intelligence";
  const canViewTahfidz = Boolean(user)
    && ["Admin", "SuperAdmin"].includes(role || "")
    && user?.modulePermissions?.tahfidz !== false;
  const canSearchDocuments = Boolean(user)
    && ["Admin", "SuperAdmin"].includes(role || "")
    && user?.modulePermissions?.document !== false;
  const [period, setPeriod] = useState<DashboardPeriod>("year");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [intelligenceTab, setIntelligenceTab] = useState<IntelligenceTab>("executive");
  const [tahfidzLeaderboard, setTahfidzLeaderboard] = useState<TahfidzLeaderboard | null>(null);
  const [tahfidzLeaderboardLoading, setTahfidzLeaderboardLoading] = useState(false);
  const [tahfidzLeaderboardError, setTahfidzLeaderboardError] = useState("");
  const [tahfidzLeaderboardLimit, setTahfidzLeaderboardLimit] = useState<5 | 20>(5);
  const [tahfidzReloadVersion, setTahfidzReloadVersion] = useState(0);
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [documentSearchResults, setDocumentSearchResults] = useState<DocumentSearchResult[]>([]);
  const [documentSearchLoading, setDocumentSearchLoading] = useState(false);
  const [documentSearchError, setDocumentSearchError] = useState("");
  const notifyReloadRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(emptySnapshot);
    setError("");
    if (!["Admin", "SuperAdmin"].includes(role || "")) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    loadDashboard(period, surface, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSnapshot(result);
        if (notifyReloadRef.current) {
          setNotice("Ringkasan berhasil dimuat ulang.");
          notifyReloadRef.current = false;
        }
      })
      .catch((loadError: any) => {
        if (controller.signal.aborted) return;
        setNotice("");
        notifyReloadRef.current = false;
        setError(toERPUserMessage(loadError, "Ringkasan dashboard belum dapat dimuat."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, reloadVersion, role, surface, user?.tenantId, user?.uid]);

  useEffect(() => {
    if (!isIntelligence || intelligenceTab !== "tahfidz-ai" || !canViewTahfidz) {
      setTahfidzLeaderboard(null);
      setTahfidzLeaderboardError("");
      setTahfidzLeaderboardLoading(false);
      return;
    }
    const controller = new AbortController();
    setTahfidzLeaderboard(null);
    setTahfidzLeaderboardError("");
    setTahfidzLeaderboardLoading(true);
    loadTahfidzLeaderboard(tahfidzLeaderboardLimit, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setTahfidzLeaderboard(result); })
      .catch((loadError: any) => {
        if (!controller.signal.aborted) setTahfidzLeaderboardError(toERPUserMessage(loadError, "Capaian Tahfidz belum dapat dimuat."));
      })
      .finally(() => { if (!controller.signal.aborted) setTahfidzLeaderboardLoading(false); });
    return () => controller.abort();
  }, [canViewTahfidz, intelligenceTab, isIntelligence, tahfidzLeaderboardLimit, tahfidzReloadVersion, user?.tenantId, user?.uid]);

  useEffect(() => {
    const query = documentSearchQuery.trim();
    if (!isIntelligence || intelligenceTab !== "knowledge" || !canSearchDocuments || query.length < 2) {
      setDocumentSearchResults([]);
      setDocumentSearchError("");
      setDocumentSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDocumentSearchLoading(true);
      setDocumentSearchError("");
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
        const params = new URLSearchParams({ search: query });
        const response = await fetch(`/api/documents?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Pencarian dokumen belum dapat diproses.");
        if (!payload || !Array.isArray(payload.documents)) throw new Error("Hasil pencarian dokumen tidak valid.");
        if (!controller.signal.aborted) setDocumentSearchResults(payload.documents.slice(0, 20));
      } catch (searchError: any) {
        if (!controller.signal.aborted) {
          setDocumentSearchResults([]);
          setDocumentSearchError(toERPUserMessage(searchError, "Pencarian dokumen belum dapat diproses."));
        }
      } finally {
        if (!controller.signal.aborted) setDocumentSearchLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canSearchDocuments, documentSearchQuery, intelligenceTab, isIntelligence, user?.tenantId, user?.uid]);

  const finance = snapshot.finance;
  const netCashflow = calculateDashboardNetCashflow(finance);
  const hasMonthlyFinanceActivity = hasDashboardFinanceActivity(finance.monthlyTrend);
  const periodLabel: Record<DashboardPeriod, string> = { today: "Hari ini", week: "7 hari terakhir", month: "30 hari terakhir", year: "365 hari terakhir" };
  const financeTrend = useMemo(
    () => getCompletedDashboardFinanceTrend(finance.monthlyTrend || []),
    [finance.monthlyTrend],
  );
  const financeComparison = financeTrend.length >= 2
    ? { previous: financeTrend[financeTrend.length - 2], latest: financeTrend[financeTrend.length - 1] }
    : null;
  const stageRows = useMemo(() => (snapshot.ppdb.stages || []).map((entry) => ({
    stage: ({ Registered: "Terdaftar", "Document Review": "Verifikasi", "Entry Exam": "Ujian", Interview: "Wawancara", Accepted: "Diterima", Rejected: "Ditolak", Withdrawn: "Mengundurkan diri" } as Record<string, string>)[entry.stage] || entry.stage,
    jumlah: Number(entry.count || 0),
  })), [snapshot.ppdb.stages]);
  const operationalSignals = useMemo(() => {
    const signals: Array<{ title: string; detail: string; tone: "amber" | "rose" | "blue" }> = [];
    if (snapshot.ppdb.enabled && Number(snapshot.ppdb.pending || 0) > 0) {
      signals.push({
        title: "Tindak lanjut pendaftar",
        detail: `${Number(snapshot.ppdb.pending)} calon santri masih berada dalam proses seleksi.`,
        tone: "blue",
      });
    }
    if (finance.enabled && Number(finance.verificationCount || 0) > 0) {
      signals.push({
        title: "Verifikasi pembayaran",
        detail: `${Number(finance.verificationCount)} pembayaran menunggu pemeriksaan petugas.`,
        tone: "amber",
      });
    }
    const openBills = Number(finance.openBillCount || 0);
    if (finance.enabled && openBills > 0) {
      signals.push({
        title: "Tagihan belum berstatus lunas",
        detail: `${openBills} tagihan masih terbuka dengan sisa tercatat ${rupiah(finance.outstandingAmount || 0)}.`,
        tone: "amber",
      });
    }
    if (finance.enabled && netCashflow < 0) {
      signals.push({
        title: "Arus kas bersih negatif",
        detail: `Arus kas bersih tercatat negatif sebesar ${rupiah(Math.abs(netCashflow))} pada rentang yang dipilih.`,
        tone: "rose",
      });
    }
    return signals;
  }, [finance, netCashflow, snapshot.ppdb.enabled, snapshot.ppdb.pending]);

  if (!(["Admin", "SuperAdmin"].includes(role || ""))) {
    return <main className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
      Ringkasan untuk peran {role || "ini"} belum tersedia. Aplikasi tidak mengambil data dari arsip lama.
    </main>;
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">{isIntelligence ? "Analitik operasional" : "Ringkasan pesantren"}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{isIntelligence ? "Analitik operasional pesantren" : "Ringkasan eksekutif pesantren"}</h1><p className="mt-1 text-sm text-slate-500">Indikator PPDB, santri aktif, tagihan, dan arus kas pesantren.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="dashboard-period">Rentang arus kas</label>
        <select id="dashboard-period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <option value="today">Hari ini</option><option value="week">7 hari</option><option value="month">30 hari</option><option value="year">365 hari</option>
        </select>
        <button onClick={() => { notifyReloadRef.current = true; setNotice(""); setReloadVersion((value) => value + 1); }} disabled={loading} aria-label="Muat ulang ringkasan" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang</button>
      </div>
    </header>

    <div role="note" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{isIntelligence ? "Indikator dihitung dari data yang tersedia. Informasi tiap modul hanya ditampilkan jika akun Anda memiliki izin akses." : "Ringkasan dihitung dari data pesantren ini. Pesantren baru dimulai tanpa data; tambahkan catatan melalui modul terkait untuk mengisi indikator."}</div>
    {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    {isIntelligence && <ERPTabs tabs={[
      { id: "executive", label: "Dasbor Eksekutif" },
      { id: "predictive", label: "Tren Keuangan" },
      { id: "tahfidz-ai", label: "Capaian Tahfidz" },
      { id: "warehouse", label: "Ringkasan Data" },
      { id: "knowledge", label: "Pencarian Dokumen" },
    ]} value={intelligenceTab} onChange={(id) => setIntelligenceTab(id as IntelligenceTab)} ariaLabel="Bagian pusat data analitik" />}

    {isIntelligence && intelligenceTab !== "executive" ? <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white">{({ predictive: "Analitik Prediktif", "tahfidz-ai": "Mesin AI Tahfidz", warehouse: "Gudang Data", knowledge: "Pusat Pengetahuan" } as Record<Exclude<IntelligenceTab, "executive">, string>)[intelligenceTab]}</h2>
        <p className="mt-1 text-sm text-slate-500">{({
          predictive: "Tren operasional berdasarkan ringkasan data. Ini bukan prediksi AI.",
          "tahfidz-ai": "Ringkasan ini menggunakan aturan yang jelas dari data operasional.",
          warehouse: "Ringkasan dihitung dari data operasional yang tersedia.",
          knowledge: "Sinyal operasional yang tersedia dari modul berizin; indeks dokumen pengetahuan belum terpasang.",
        } as Record<Exclude<IntelligenceTab, "executive">, string>)[intelligenceTab]}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Santri aktif" value={loading ? "—" : snapshot.masterData.enabled ? String(snapshot.masterData.activeStudents || 0) : "—"} caption="Data Induk" icon={Users} />
        <MetricCard title="Pendaftar proses" value={loading ? "—" : snapshot.ppdb.enabled ? String(snapshot.ppdb.pending || 0) : "—"} caption="PPDB" icon={Activity} accent="blue" />
        <MetricCard title="Tagihan terbuka" value={loading ? "—" : finance.enabled ? String(finance.openBillCount || 0) : "—"} caption={finance.enabled ? rupiah(finance.outstandingAmount || 0) : "—"} icon={Wallet} accent="amber" />
        <MetricCard title={`Arus kas · ${periodLabel[period]}`} value={loading ? "—" : finance.enabled ? rupiah(netCashflow) : "—"} caption="Data operasional pesantren" icon={TrendingUp} accent={netCashflow < 0 ? "rose" : "emerald"} />
      </div>
      {loading ? <p className="text-sm text-slate-500">Memuat sinyal…</p> : operationalSignals.length ? <ul className="grid gap-3 md:grid-cols-2">{operationalSignals.map((signal) => <li key={signal.title} className={`rounded-lg border p-4 ${signal.tone === "rose" ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20" : signal.tone === "amber" ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20" : "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20"}`}><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{signal.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{signal.detail}</p></li>)}</ul> : <p className="text-sm text-slate-500">Belum ada sinyal operasional pada rentang dan izin modul saat ini.</p>}
    </section> : <>

    {isIntelligence && <section aria-labelledby="operational-signals-heading" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3"><div><h2 id="operational-signals-heading" className="font-semibold text-slate-900 dark:text-white">Hal yang perlu diperhatikan</h2><p className="mt-1 text-xs text-slate-500">Antrian dan tagihan menunjukkan kondisi saat ini; arus kas mengikuti rentang yang dipilih.</p></div><Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /></div>
      {loading ? <p className="mt-5 text-sm text-slate-500">Menghitung indikator…</p> : operationalSignals.length > 0 ? <ul className="mt-4 grid gap-3 md:grid-cols-2">{operationalSignals.map((signal) => <li key={signal.title} className={`rounded-lg border p-4 ${signal.tone === "rose" ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20" : signal.tone === "amber" ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20" : "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20"}`}><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{signal.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{signal.detail}</p></li>)}</ul> : <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Belum ada hal yang memerlukan tindak lanjut pada data dan modul yang dapat Anda lihat.</p>}
    </section>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indikator utama">
      <MetricCard title="Total pendaftar PPDB" value={loading ? "—" : snapshot.ppdb.enabled ? String(snapshot.ppdb.total || 0) : "—"} caption={loading ? "Memuat ringkasan pesantren…" : snapshot.ppdb.enabled ? `${snapshot.ppdb.accepted || 0} diterima · ${snapshot.ppdb.pending || 0} masih dalam proses` : error ? "Data PPDB belum dapat dimuat." : "Izin modul PPDB tidak diberikan"} icon={Users} accent="blue" />
      <MetricCard title="Santri aktif" value={loading ? "—" : snapshot.masterData.enabled ? String(snapshot.masterData.activeStudents || 0) : "—"} caption={loading ? "Memuat ringkasan pesantren…" : snapshot.masterData.enabled ? `${snapshot.masterData.maleStudents || 0} putra · ${snapshot.masterData.femaleStudents || 0} putri` : error ? "Data Induk belum dapat dimuat." : "Izin Data Induk tidak diberikan"} icon={BookOpen} />
      <MetricCard title="Sisa tagihan" value={loading ? "—" : finance.enabled ? rupiah(finance.outstandingAmount || 0) : "—"} caption={loading ? "Memuat ringkasan pesantren…" : finance.enabled ? `${finance.openBillCount || 0} tagihan terbuka` : error ? "Data keuangan belum dapat dimuat." : "Izin modul keuangan tidak diberikan"} icon={Wallet} accent="amber" />
      <MetricCard title="Saldo titipan santri" value={loading ? "—" : finance.enabled ? rupiah(finance.walletLiability || 0) : "—"} caption={loading ? "Memuat ringkasan pesantren…" : finance.enabled ? "Kewajiban dompet santri yang masih tersisa" : error ? "Data keuangan belum dapat dimuat." : "Izin modul keuangan tidak diberikan"} icon={Wallet} accent="blue" />
      <MetricCard title={`Arus kas · ${periodLabel[period]}`} value={loading ? "—" : finance.enabled ? rupiah(netCashflow) : "—"} caption={loading ? "Memuat ringkasan pesantren…" : finance.enabled ? `${rupiah(finance.periodIncome || 0)} pendapatan + ${rupiah(finance.periodWalletDeposits || 0)} titipan masuk − ${rupiah(finance.periodExpense || 0)} pengeluaran; belanja dari saldo titipan tidak dihitung lagi sebagai arus keluar kas. Bukan saldo bank.` : error ? "Data keuangan belum dapat dimuat." : "Izin modul keuangan tidak diberikan"} icon={TrendingUp} accent={netCashflow < 0 ? "rose" : "emerald"} />
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Alur pendaftaran PPDB</h2><p className="mt-1 text-xs text-slate-500">Jumlah calon santri per tahap seleksi.</p></div><Activity className="h-5 w-5 text-blue-600 dark:text-blue-300" /></div>
        {loading ? <p className="mt-8 text-sm text-slate-500">Memuat data…</p> : !snapshot.ppdb.enabled ? <p className="mt-8 text-sm text-slate-500">{error ? "Ringkasan PPDB belum dapat dimuat." : "Data PPDB disembunyikan karena izin modul tidak tersedia."}</p> : stageRows.length ? <div className="mt-5 h-64"><React.Suspense fallback={<p className="pt-16 text-center text-sm text-slate-500">Memuat grafik…</p>}><SupabaseDashboardBarChart kind="ppdb-stages" data={stageRows} /></React.Suspense></div> : <p className="mt-8 text-sm text-slate-500">Belum ada calon santri.</p>}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Arus kas tercatat</h2><p className="mt-1 text-xs text-slate-500">Pendapatan, titipan masuk/pemakaian, dan pengeluaran per bulan.</p></div><TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /></div>
        {loading ? <p className="mt-8 text-sm text-slate-500">Memuat data…</p> : !finance.enabled ? <p className="mt-8 text-sm text-slate-500">{error ? "Ringkasan keuangan belum dapat dimuat." : "Data keuangan disembunyikan karena izin modul tidak tersedia."}</p> : hasMonthlyFinanceActivity && finance.monthlyTrend?.length ? <div className="mt-5 h-64"><React.Suspense fallback={<p className="pt-16 text-center text-sm text-slate-500">Memuat grafik…</p>}><SupabaseDashboardBarChart kind="finance-monthly" data={finance.monthlyTrend} /></React.Suspense></div> : <p className="mt-8 text-sm text-slate-500">Belum ada transaksi keuangan pada buku besar.</p>}
      </article>
    </section>

    {finance.enabled && <section aria-labelledby="completed-finance-trend-heading" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="completed-finance-trend-heading" className="font-semibold text-slate-900 dark:text-white">Perbandingan arus kas bulanan</h2><p className="mt-1 text-xs text-slate-500">Grafik hanya membandingkan bulan yang sudah berakhir; bulan berjalan belum dihitung sebagai periode penuh.</p></div>
        {financeComparison && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-200">
          {monthLabel(financeComparison.latest.month)}: {financeComparison.latest.netCashflow >= financeComparison.previous.netCashflow ? "naik" : "turun"} {rupiah(Math.abs(financeComparison.latest.netCashflow - financeComparison.previous.netCashflow))} dibanding {monthLabel(financeComparison.previous.month)}
        </p>}
      </div>
      {financeTrend.length ? <div className="mt-5 h-64"><React.Suspense fallback={<p className="pt-16 text-center text-sm text-slate-500">Memuat grafik…</p>}><SupabaseDashboardBarChart kind="finance-completed" data={financeTrend} /></React.Suspense></div> : <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">{hasMonthlyFinanceActivity ? "Belum ada bulan lengkap untuk dibandingkan." : "Belum ada transaksi keuangan pada periode sebelumnya."}</p>}
    </section>}

    {finance.enabled && <section className="grid gap-4 sm:grid-cols-3">
      {[{ label: "Belum dibayar", value: finance.unpaidCount || 0 }, { label: "Pembayaran sebagian", value: finance.partialCount || 0 }, { label: "Menunggu verifikasi", value: finance.verificationCount || 0 }].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-medium text-slate-500">{item.label}</p><p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{loading ? "—" : item.value}</p></div>)}
    </section>}
    </>}
  </main>;
}

