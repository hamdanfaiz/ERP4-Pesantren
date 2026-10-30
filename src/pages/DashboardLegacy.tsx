import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  BookOpen,
  Wallet,
  Activity,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  BrainCircuit,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Receipt,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../firebaseUtils";
import { useAuth } from "../contexts/AuthContext";
import { isModuleAccessible, UserRole } from "../rbac";

const KPICard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  progress,
  statusText,
  alert,
}: any) => (
  <div className="bg-white/[0.02] border border-slate-200 dark:border-white/5 p-5 rounded-xl flex flex-col hover:border-slate-200 dark:border-white/10 transition-colors erp-card">
    <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
      {title}
      <Icon className="w-4 h-4 text-slate-600" />
    </div>
    <div
      className={`text-3xl font-bold tracking-tight ${alert ? "text-red-400" : "text-slate-100"}`}
    >
      {value}{" "}
      <span
        className={`${alert ? "text-red-500/60" : "text-emerald-500"} text-xs ml-1 font-sans font-medium`}
      >
        {trendValue}
      </span>
    </div>
    {progress !== undefined ? (
      <div className="w-full bg-slate-100 dark:bg-white/5 h-1.5 mt-4 rounded-full overflow-hidden">
        <div
          className="bg-emerald-500 h-full rounded-full"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    ) : (
      <div
        className={`text-[10px] mt-4 ${alert ? "text-red-500/60" : "text-emerald-500/60"} font-mono uppercase font-semibold tracking-wider`}
      >
        {statusText}
      </div>
    )}
  </div>
);

const StudentDashboard = () => {
  const { user } = useAuth();
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.tenantId || !user?.uid) {
      setStudentInfo(null);
      setNotifications([]);
      return;
    }
    const subscriptions: Array<() => void> = [];
    const linkedSantriId = typeof user.linkedSantriId === "string" ? user.linkedSantriId.trim() : "";
    if (linkedSantriId) {
      subscriptions.push(onSnapshot(
        doc(db, "entityRecords", linkedSantriId),
        (snapshot) => {
          const record = snapshot.exists() ? snapshot.data() : null;
          setStudentInfo(record && record.tenantId === user.tenantId && record.type === "Santri"
            ? { id: snapshot.id, ...record } : null);
        },
        (error) => {
          setStudentInfo(null);
          handleFirestoreError(error, OperationType.GET, "entityRecords");
        },
      ));
    } else {
      setStudentInfo(null);
    }

    const ownNotificationQuery = tenantScopedQuery(
      collection(db, "notifications"), user.tenantId,
      where("userId", "==", user.uid), orderBy("createdAt", "desc")
    );
    subscriptions.push(onSnapshot(
      ownNotificationQuery,
      (snapshot) => setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) }))),
      (error) => handleFirestoreError(error, OperationType.GET, "notifications"),
    ));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [user?.tenantId, user?.uid, user?.linkedSantriId]);

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), { isRead: true });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-medium text-slate-800 dark:text-slate-200 border-b-2 border-emerald-500/50 pb-1 inline-block">
          Dashboard Santri & Wali
        </h1>
        <p className="text-slate-500 text-sm mt-2">Informasi hanya ditampilkan untuk santri yang tertaut pada akun Anda.</p>
      </div>

      <section className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Users className="w-5 h-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">{studentInfo?.name || user?.name || "Akun Santri"}</h2>
            <p className="text-xs text-slate-500">{studentInfo ? "Profil santri tertaut" : "Belum ada profil santri yang tertaut"}</p>
          </div>
        </div>
        {studentInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "NIS", value: studentInfo.nis || user?.linkedSantriNis || "—" },
              { label: "Kelas", value: studentInfo.className || studentInfo.gradeOrDepartment || user?.linkedSantriClass || "—" },
              { label: "Asrama", value: studentInfo.dormitory || user?.linkedSantriRoom || "—" },
              { label: "Status", value: studentInfo.status || "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 dark:border-white/5 bg-white/5 p-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-slate-500 dark:text-slate-400">
            Hubungi administrator pesantren untuk menautkan akun ini ke profil santri yang benar.
          </div>
        )}
      </section>

      <section className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center gap-3">
          <Bell className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Notifikasi untuk akun ini</h2>
          <span className="ml-auto text-xs text-slate-500">{notifications.length}</span>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-white/5">
          {notifications.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Belum ada notifikasi.</p>
          ) : notifications.slice(0, 20).map((notification) => (
            <div key={notification.id} className="p-4 flex items-start gap-3">
              <div className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{notification.title || "Informasi pesantren"}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{notification.message || notification.body || ""}</p>
                <p className="mt-2 text-[10px] text-slate-500">{notification.createdAt ? new Date(notification.createdAt).toLocaleString("id-ID") : ""}</p>
              </div>
              {!notification.isRead && (
                <button onClick={() => markAsRead(notification.id)} className="text-xs text-emerald-500 hover:text-emerald-400">Tandai dibaca</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export function DashboardOverview() {
  const { role, user } = useAuth();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [openBillings, setOpenBillings] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<{
    cashflow?: string | null;
    billings?: string | null;
  }>({});

  type PeriodOption = "today" | "week" | "month" | "year";
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>("year");

  const isTenantAdmin = Boolean(
    role === "Admin" ||
    role === "SuperAdmin" ||
    (typeof role === "string" && (role.toLowerCase() === "admin" || role.toLowerCase() === "superadmin"))
  );
  const effectiveRole: UserRole = (role === "SuperAdmin" || role === "Admin" || role === "Ustadz" || role === "Santri" || role === "Walisantri")
    ? role
    : (typeof role === "string" && role.toLowerCase() === "superadmin")
      ? "SuperAdmin"
      : "Admin";
  const canReadPpdb = isTenantAdmin && isModuleAccessible(effectiveRole, "ppdb", user?.modulePermissions);
  const canReadMasterData = isTenantAdmin && isModuleAccessible(effectiveRole, "master-data", user?.modulePermissions);
  const canReadFinance = isTenantAdmin && isModuleAccessible(effectiveRole, "finance", user?.modulePermissions);

  const dateRange = useMemo(() => {
    const end = new Date(Date.now() + 5 * 60 * 1000);
    let start: Date;
    if (selectedPeriod === "today") {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === "week") {
      start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (selectedPeriod === "month") {
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else {
      // 365 days period
      start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    }
    return { start, end };
  }, [selectedPeriod]);

  useEffect(() => {
    if (!isTenantAdmin || !user?.tenantId) {
      setCandidates([]);
      setStudents([]);
      setOpenBillings([]);
      setTransactions([]);
      setTransactionsLoading(false);
      setTransactionsError(null);
      setSourceErrors({});
      return;
    }
    const subscriptions: Array<() => void> = [];

    if (canReadPpdb) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "candidates"), user.tenantId),
        (snapshot) => setCandidates(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) }))),
        (error) => {
          setCandidates([]);
          handleFirestoreError(error, OperationType.LIST, "candidates");
        },
      ));
    } else setCandidates([]);

    if (canReadMasterData) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "entityRecords"), user.tenantId, where("type", "==", "Santri")),
        (snapshot) => setStudents(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) }))),
        (error) => {
          setStudents([]);
          handleFirestoreError(error, OperationType.LIST, "entityRecords");
        },
      ));
    } else setStudents([]);

    if (canReadFinance) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "financeBillings"), user.tenantId, where("status", "in", ["Unpaid", "Partial", "Overdue"])),
        (snapshot) => setOpenBillings(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) }))),
        (error) => {
          setOpenBillings([]);
          handleFirestoreError(error, OperationType.LIST, "financeBillings");
        },
      ));

      setTransactionsLoading(true);
      setTransactionsError(null);
      setSourceErrors((prev) => ({ ...prev, cashflow: null }));
      const startTimestamp = Timestamp.fromDate(dateRange.start);
      const endTimestamp = Timestamp.fromDate(dateRange.end);

      subscriptions.push(onSnapshot(
        tenantScopedQuery(
          collection(db, "financeTransactions"),
          user.tenantId,
          where("createdAt", ">=", startTimestamp),
          where("createdAt", "<=", endTimestamp)
        ),
        (snapshot) => {
          setTransactions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) })));
          setTransactionsLoading(false);
          setTransactionsError(null);
          setSourceErrors((prev) => ({ ...prev, cashflow: null }));
        },
        (error) => {
          setTransactions([]);
          setTransactionsLoading(false);
          const errorMsg = error instanceof Error ? error.message : String(error);
          setTransactionsError(errorMsg);
          setSourceErrors((prev) => ({ ...prev, cashflow: errorMsg }));
          handleFirestoreError(error, OperationType.LIST, "financeTransactions");
        }
      ));
    } else {
      setOpenBillings([]);
      setTransactions([]);
      setTransactionsLoading(false);
      setTransactionsError(null);
      setSourceErrors((prev) => ({ ...prev, cashflow: null }));
    }

    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [user?.tenantId, isTenantAdmin, canReadPpdb, canReadMasterData, canReadFinance, dateRange.start, dateRange.end]);

  const totalCandidates = canReadPpdb ? candidates.length : 0;
  const acceptedCandidates = canReadPpdb ? candidates.filter((candidate) => candidate.stage === "Accepted").length : 0;
  const pendingCandidates = canReadPpdb ? candidates.filter((candidate) => !["Accepted", "Rejected", "Withdrawn"].includes(candidate.stage)).length : 0;
  const activeStudents = canReadMasterData ? students.filter((student) => ["active", "aktif", "santri aktif"].includes(String(student.status || "").trim().toLowerCase())) : [];
  const outstandingAmount = canReadFinance ? openBillings.reduce((total, billing) =>
    total + Math.max(0, Number(billing.amount || 0) - Number(billing.paidAmount || 0)), 0) : 0;
  const ppdbConversion = totalCandidates > 0 ? ((acceptedCandidates / totalCandidates) * 100).toFixed(1) : 0;

  const recordedIncome = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount || 0)), 0);
  }, [transactions]);

  const recordedExpense = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === "expense")
      .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount || 0)), 0);
  }, [transactions]);

  const recordedNetCashFlow = recordedIncome - recordedExpense;

  const unpaidBillings = useMemo(() => openBillings.filter((b) => b.status === "Unpaid"), [openBillings]);
  const partialBillings = useMemo(() => openBillings.filter((b) => b.status === "Partial"), [openBillings]);
  const overdueBillings = useMemo(() => openBillings.filter((b) => b.status === "Overdue"), [openBillings]);
  const unpaidTotal = useMemo(() => unpaidBillings.reduce((sum, b) => sum + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0), [unpaidBillings]);
  const partialTotal = useMemo(() => partialBillings.reduce((sum, b) => sum + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0), [partialBillings]);
  const overdueTotal = useMemo(() => overdueBillings.reduce((sum, b) => sum + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0), [overdueBillings]);

  const monthlyCashFlowData = useMemo(() => {
    const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    const getTxDate = (tx: any): Date | null => {
      if (tx.createdAt?.toDate && typeof tx.createdAt.toDate === "function") {
        return tx.createdAt.toDate();
      }
      if (tx.createdAt instanceof Date) return tx.createdAt;
      if (typeof tx.createdAt === "number" || typeof tx.createdAt === "string") {
        const d = new Date(tx.createdAt);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    if (selectedPeriod === "year") {
      const start365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const buckets: Array<{
        monthKey: string;
        label: string;
        income: number;
        expense: number;
        net: number;
      }> = [];

      const cursor = new Date(start365.getFullYear(), start365.getMonth(), 1);
      const targetEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      let isFirst = true;

      while (cursor <= targetEnd) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
        const shortYear = String(y).slice(-2);
        const name = MONTH_LABELS[m];
        const label = isFirst ? `${name} '${shortYear}*` : `${name} '${shortYear}`;

        buckets.push({
          monthKey,
          label,
          income: 0,
          expense: 0,
          net: 0,
        });

        isFirst = false;
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const bucketMap = new Map(buckets.map((b) => [b.monthKey, b]));

      transactions.forEach((tx) => {
        const tDate = getTxDate(tx);
        if (tDate) {
          const key = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}`;
          const bucket = bucketMap.get(key);
          if (bucket) {
            const amt = Math.max(0, Number(tx.amount || 0));
            if (tx.type === "income") {
              bucket.income += amt;
            } else if (tx.type === "expense") {
              bucket.expense += amt;
            }
            bucket.net = bucket.income - bucket.expense;
          }
        }
      });

      return buckets;
    }

    if (selectedPeriod === "month") {
      const buckets: Array<{ monthKey: string; label: string; income: number; expense: number; net: number }> = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const dStart = new Date(now.getTime() - (i + 1) * 5 * 24 * 60 * 60 * 1000);
        const dEnd = new Date(now.getTime() - i * 5 * 24 * 60 * 60 * 1000);
        const label = `${dStart.getDate()}-${dEnd.getDate()} ${MONTH_LABELS[dEnd.getMonth()]}`;
        buckets.push({ monthKey: `m-${i}`, label, income: 0, expense: 0, net: 0 });
      }
      transactions.forEach((tx) => {
        const d = getTxDate(tx);
        if (d) {
          const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
          const idx = Math.min(5, Math.max(0, 5 - Math.floor(diffDays / 5)));
          if (buckets[idx]) {
            const amt = Math.max(0, Number(tx.amount || 0));
            if (tx.type === "income") buckets[idx].income += amt;
            else if (tx.type === "expense") buckets[idx].expense += amt;
            buckets[idx].net = buckets[idx].income - buckets[idx].expense;
          }
        }
      });
      return buckets;
    }

    if (selectedPeriod === "week") {
      const buckets: Array<{ monthKey: string; label: string; income: number; expense: number; net: number }> = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const label = `${DAY_LABELS[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;
        buckets.push({ monthKey: key, label, income: 0, expense: 0, net: 0 });
      }
      const bucketMap = new Map(buckets.map((b) => [b.monthKey, b]));
      transactions.forEach((tx) => {
        const d = getTxDate(tx);
        if (d) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const b = bucketMap.get(key);
          if (b) {
            const amt = Math.max(0, Number(tx.amount || 0));
            if (tx.type === "income") b.income += amt;
            else if (tx.type === "expense") b.expense += amt;
            b.net = b.income - b.expense;
          }
        }
      });
      return buckets;
    }

    const timeIntervals = [
      { key: "00-06", label: "00:00 - 06:00", hStart: 0, hEnd: 6 },
      { key: "06-12", label: "06:00 - 12:00", hStart: 6, hEnd: 12 },
      { key: "12-18", label: "12:00 - 18:00", hStart: 12, hEnd: 18 },
      { key: "18-24", label: "18:00 - 24:00", hStart: 18, hEnd: 24 },
    ];
    const buckets = timeIntervals.map((t) => ({ monthKey: t.key, label: t.label, income: 0, expense: 0, net: 0 }));
    transactions.forEach((tx) => {
      const d = getTxDate(tx);
      if (d) {
        const h = d.getHours();
        const b = buckets.find((_, idx) => h >= timeIntervals[idx].hStart && h < timeIntervals[idx].hEnd);
        if (b) {
          const amt = Math.max(0, Number(tx.amount || 0));
          if (tx.type === "income") b.income += amt;
          else if (tx.type === "expense") b.expense += amt;
          b.net = b.income - b.expense;
        }
      }
    });
    return buckets;
  }, [selectedPeriod, transactions]);

  const formatRupiah = (amount: number) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(amount);

  const formatCompactIdr = (amount: number) => {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_000_000_000) {
      return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (abs >= 1_000_000) {
      return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}Jt`;
    }
    if (abs >= 1_000) {
      return `${sign}Rp ${(abs / 1_000).toFixed(0)}Rb`;
    }
    return `${sign}Rp ${abs}`;
  };

  const ppdbStageSummary = [
    { stage: "Terdaftar", count: candidates.filter((item) => item.stage === "Registered").length },
    { stage: "Verifikasi", count: candidates.filter((item) => item.stage === "Document Review" || item.stage === "Document Verification").length },
    { stage: "Ujian", count: candidates.filter((item) => item.stage === "Entry Exam").length },
    { stage: "Wawancara", count: candidates.filter((item) => item.stage === "Interview").length },
    { stage: "Diterima", count: acceptedCandidates },
  ];

  const studentGenderSummary = [
    { gender: "Putra", count: activeStudents.filter((item) => item.gender === "L").length },
    { gender: "Putri", count: activeStudents.filter((item) => item.gender === "P").length },
  ];

  if (role === "Santri" || role === "Walisantri") {
    return <StudentDashboard />;
  }

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-800 dark:text-slate-200 border-b-2 border-emerald-500/50 pb-1 inline-block">
            Ringkasan Eksekutif Pesantren
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Metrik operasional dan performa keuangan real-time untuk tenant aktif sesuai wewenang akun.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs bg-black/40 border border-slate-200 dark:border-white/5 rounded-lg p-1">
          <button
            onClick={() => setSelectedPeriod("today")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedPeriod === "today"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            Hari Ini
          </button>
          <button
            onClick={() => setSelectedPeriod("week")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedPeriod === "week"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            7 Hari
          </button>
          <button
            onClick={() => setSelectedPeriod("month")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedPeriod === "month"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            30 Hari
          </button>
          <button
            onClick={() => setSelectedPeriod("year")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              selectedPeriod === "year"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            365 Hari (12 Bulan)
          </button>
        </div>
      </div>

      {/* Top Level KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Pendaftar PPDB"
          value={canReadPpdb ? totalCandidates : "—"}
          icon={Users}
          trend="up"
          trendValue={canReadPpdb ? acceptedCandidates + " diterima" : "akses terbatas"}
          progress={canReadPpdb ? ppdbConversion : undefined}
          statusText={canReadPpdb ? "REAL-TIME TENANT" : "AKSES PPDB TERBATAS"}
        />
        <KPICard
          title="Santri Aktif"
          value={canReadMasterData ? activeStudents.length : "—"}
          icon={BookOpen}
          trendValue={canReadMasterData ? "data master" : "akses terbatas"}
          statusText={canReadMasterData ? "RECORD AKTIF" : "AKSES MASTER DATA TERBATAS"}
        />
        <KPICard
          title="Arus kas bersih"
          value={
            !canReadFinance
              ? "—"
              : (sourceErrors.cashflow || transactionsError)
                ? "Gagal dimuat"
                : formatRupiah(recordedNetCashFlow)
          }
          icon={TrendingUp}
          alert={canReadFinance && Boolean(sourceErrors.cashflow || transactionsError || recordedNetCashFlow < 0)}
          trendValue={
            !canReadFinance
              ? "akses terbatas"
              : (sourceErrors.cashflow || transactionsError)
                ? undefined
                : (recordedNetCashFlow >= 0 ? "+ Surplus" : "- Defisit")
          }
          statusText={
            !canReadFinance
              ? "AKSES KEUANGAN TERBATAS"
              : (sourceErrors.cashflow || transactionsError)
                ? "GAGAL MEMUAT MUTASI KAS"
                : "ARUS KAS TERCATAT (BUKAN SALDO BANK)"
          }
        />
        <KPICard
          title="Tagihan Terbuka"
          value={canReadFinance ? formatRupiah(outstandingAmount) : "—"}
          icon={Wallet}
          alert={canReadFinance && outstandingAmount > 0}
          trendValue={canReadFinance ? openBillings.length + " tagihan" : "akses terbatas"}
          statusText={canReadFinance ? "SISA PIUTANG SANTRI" : "AKSES KEUANGAN TERBATAS"}
        />
        <KPICard
          title="Pendaftar Menunggu"
          value={canReadPpdb ? pendingCandidates : "—"}
          icon={Activity}
          trendValue={canReadPpdb ? "proses seleksi" : "akses terbatas"}
          statusText={canReadPpdb ? "ALUR PPDB AKTIF" : "AKSES PPDB TERBATAS"}
        />
      </div>

      {/* Finance Executive Section: Open Billings Status + Recorded Cash Flow Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Billings Card */}
        <div className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                  Status Tagihan Terbuka
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rekapitulasi sisa kewajiban pembayaran santri pada tenant saat ini
                </p>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                Piutang Terbuka
              </span>
            </div>

            {canReadFinance ? (
              openBillings.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-white/[0.02] border border-slate-200/50 dark:border-white/5">
                    <span className="text-xs text-slate-400 block mb-1">Total Sisa Tagihan Terbuka</span>
                    <span className="text-2xl font-bold text-amber-400 tracking-tight">
                      {formatRupiah(outstandingAmount)}
                    </span>
                    <span className="text-xs text-slate-500 block mt-1">
                      Tersebar pada {openBillings.length} tagihan belum lunas
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-black/30 border border-slate-200/40 dark:border-white/5">
                      <span className="text-[11px] text-slate-400 block mb-1">Belum Bayar</span>
                      <span className="text-base font-semibold text-slate-200">
                        {unpaidBillings.length}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        {formatCompactIdr(unpaidTotal)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-black/30 border border-slate-200/40 dark:border-white/5">
                      <span className="text-[11px] text-slate-400 block mb-1">Sebagian</span>
                      <span className="text-base font-semibold text-amber-300">
                        {partialBillings.length}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        {formatCompactIdr(partialTotal)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-black/30 border border-slate-200/40 dark:border-white/5">
                      <span className="text-[11px] text-slate-400 block mb-1">Jatuh Tempo</span>
                      <span className="text-base font-semibold text-rose-400">
                        {overdueBillings.length}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        {formatCompactIdr(overdueTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2 opacity-80" />
                  <p className="text-sm font-medium text-slate-300">Semua Tagihan Selesai</p>
                  <p className="text-xs text-slate-500 mt-1">Tidak ada tagihan tertunggak atau terbuka pada tenant ini.</p>
                </div>
              )
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-slate-500">
                Akses modul keuangan tidak diberikan.
              </div>
            )}
          </div>
          <div className="pt-3 mt-4 border-t border-slate-200/30 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Sistem Billing Pesantren</span>
            <span>Ledger Terverifikasi</span>
          </div>
        </div>

        {/* Recorded Cash Flow Trend Card */}
        <div className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                  Tren Arus Kas Tercatat (12 Bulan)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Arus kas tercatat (bukan saldo bank atau prakiraan)
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {sourceErrors.cashflow || transactionsError ? (
                  <span className="text-rose-400 font-medium text-xs">Gagal dimuat</span>
                ) : (
                  <>
                    <span className="text-emerald-400 font-medium">
                      + {formatCompactIdr(recordedIncome)}
                    </span>
                    <span className="text-rose-400 font-medium">
                      - {formatCompactIdr(recordedExpense)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {canReadFinance ? (
              transactionsLoading ? (
                <div className="h-56 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="text-xs text-slate-400">Memuat mutasi keuangan...</span>
                </div>
              ) : (sourceErrors.cashflow || transactionsError) ? (
                <div className="h-56 flex flex-col items-center justify-center p-4 text-center">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                  <span className="text-xs text-red-400 font-medium">Gagal memuat mutasi arus kas</span>
                  <span className="text-[11px] text-slate-500 mt-1 max-w-sm">
                    {sourceErrors.cashflow || transactionsError}
                  </span>
                </div>
              ) : monthlyCashFlowData.every((b) => b.income === 0 && b.expense === 0) ? (
                <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                  <Receipt className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-300">Belum Ada Mutasi Tercatat</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Belum ada transaksi pemasukan atau pengeluaran pada rentang tanggal ini.
                  </p>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={monthlyCashFlowData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={formatCompactIdr} allowDecimals={false} stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f1115",
                          borderColor: "#334155",
                          color: "#f8fafc",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: any, name: any) => [formatRupiah(Number(value) || 0), name]}
                        labelFormatter={(lbl) => `Bulan: ${lbl}`}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} />
                      <Bar dataKey="income" name="Pemasukan tercatat" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="expense" name="Pengeluaran tercatat" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-slate-500">
                Akses modul keuangan tidak diberikan.
              </div>
            )}
          </div>
          <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-200/30 dark:border-white/5 mt-2">
            <span>* Bulan pertama mencakup periode parsial dalam rentang 365 hari terakhir.</span>
            <span className="font-mono text-emerald-400/80">
              Net: {sourceErrors.cashflow || transactionsError ? "Gagal dimuat" : formatCompactIdr(recordedNetCashFlow)}
            </span>
          </div>
        </div>
      </div>

      {/* Operational Charts Section: PPDB & Gender */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <h3 className="font-medium text-slate-800 dark:text-slate-200 text-sm mb-6">Pendaftar PPDB per tahap</h3>
          {canReadPpdb ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={ppdbStageSummary} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                  <XAxis dataKey="stage" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f1115", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }} />
                  <Bar dataKey="count" name="Pendaftar" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="h-64 flex items-center justify-center text-sm text-slate-500">Akses modul PPDB tidak diberikan.</p>}
        </div>

        <div className="bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <h3 className="font-medium text-slate-800 dark:text-slate-200 text-sm mb-6">Santri aktif berdasarkan jenis kelamin</h3>
          {canReadMasterData ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={studentGenderSummary} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                  <XAxis dataKey="gender" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f1115", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorStudents)" name="Santri aktif" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="h-64 flex items-center justify-center text-sm text-slate-500">Akses data master tidak diberikan.</p>}
        </div>
      </div>

      {/* AI Insight Section */}
      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 text-slate-700 dark:text-slate-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              AI Executive Intelligence
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-black/20 p-5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-sm tracking-wide">
                    PPDB Intelligence
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {canReadPpdb ? <>Total pendaftar tercatat <strong>{totalCandidates}</strong>; <strong>{acceptedCandidates}</strong> diterima dan <strong>{pendingCandidates}</strong> masih diproses.</> : "Akses data PPDB tidak diberikan untuk akun ini."}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/20 p-5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-amber-500/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-sm tracking-wide">
                    Ringkasan Keuangan
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {canReadFinance ? (openBillings.length > 0 ? <>Ada <strong>{openBillings.length}</strong> tagihan terbuka dengan estimasi sisa <strong>{formatRupiah(outstandingAmount)}</strong>.</> : "Tidak ada tagihan terbuka yang terdeteksi pada data tenant ini.") : "Akses data keuangan tidak diberikan untuk akun ini."}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/20 p-5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-sm tracking-wide">
                    Arus Kas Tercatat
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {!canReadFinance ? (
                      "Akses data keuangan tidak diberikan untuk akun ini."
                    ) : (sourceErrors.cashflow || transactionsError) ? (
                      <span className="text-rose-400 font-medium">Gagal dimuat</span>
                    ) : (
                      <>
                        Total pemasukan <strong>{formatCompactIdr(recordedIncome)}</strong>, pengeluaran <strong>{formatCompactIdr(recordedExpense)}</strong>, arus kas bersih <strong>{formatCompactIdr(recordedNetCashFlow)}</strong> ({recordedNetCashFlow >= 0 ? "Surplus" : "Defisit"}).
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-black/20 p-5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-blue-500/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <BrainCircuit className="w-5 h-5 text-blue-400 shrink-0" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 text-sm tracking-wide">
                    Demografi Santri
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {canReadMasterData ? (
                      <>Tercatat <strong>{activeStudents.length}</strong> santri aktif ({studentGenderSummary[0].count} putra, {studentGenderSummary[1].count} putri) terdaftar pada tenant aktif.</>
                    ) : (
                      "Akses data master santri tidak diberikan untuk akun ini."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Quick Actions Menu */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3 group">
        <div className="flex flex-col gap-2 transition-all duration-300 opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto">
          <button className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-end gap-2 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors">
            Input New Tahfidz Record{" "}
            <BookOpen className="w-4 h-4 text-emerald-500" />
          </button>
          <button className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-end gap-2 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors">
            View Daily Attendance{" "}
            <Calendar className="w-4 h-4 text-indigo-500" />
          </button>
          <button className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-end gap-2 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors">
            Manage PPDB Admissions <Users className="w-4 h-4 text-amber-500" />
          </button>
        </div>
        <button className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-emerald-900/20 hover:bg-emerald-500 hover:scale-105 transition-all focus:outline-none">
          <Sparkles className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
