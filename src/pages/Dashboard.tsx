import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import React, { useState, useEffect } from "react";
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
} from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../firebaseUtils";
import { useAuth } from "../contexts/AuthContext";

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
      (snapshot) => setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
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
  const isTenantAdmin = ["Admin", "SuperAdmin"].includes(role);
  const canReadPpdb = isTenantAdmin && user?.modulePermissions?.ppdb !== false;
  const canReadMasterData = isTenantAdmin && user?.modulePermissions?.["master-data"] !== false;
  const canReadFinance = isTenantAdmin && user?.modulePermissions?.finance !== false;

  useEffect(() => {
    if (!isTenantAdmin || !user?.tenantId) {
      setCandidates([]); setStudents([]); setOpenBillings([]);
      return;
    }
    const subscriptions: Array<() => void> = [];
    if (canReadPpdb) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "candidates"), user.tenantId),
        (snapshot) => setCandidates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
        (error) => handleFirestoreError(error, OperationType.GET, "candidates"),
      ));
    } else setCandidates([]);

    if (canReadMasterData) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "entityRecords"), user.tenantId, where("type", "==", "Santri")),
        (snapshot) => setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
        (error) => handleFirestoreError(error, OperationType.GET, "entityRecords"),
      ));
    } else setStudents([]);

    if (canReadFinance) {
      subscriptions.push(onSnapshot(
        tenantScopedQuery(collection(db, "financeBillings"), user.tenantId, where("status", "in", ["Unpaid", "Partial", "Overdue"])),
        (snapshot) => setOpenBillings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
        (error) => handleFirestoreError(error, OperationType.GET, "financeBillings"),
      ));
    } else setOpenBillings([]);
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [user?.tenantId, isTenantAdmin, canReadPpdb, canReadMasterData, canReadFinance]);

  const totalCandidates = canReadPpdb ? candidates.length : 0;
  const acceptedCandidates = canReadPpdb ? candidates.filter((candidate) => candidate.stage === "Accepted").length : 0;
  const pendingCandidates = canReadPpdb ? candidates.filter((candidate) => !["Accepted", "Rejected", "Withdrawn"].includes(candidate.stage)).length : 0;
  const activeStudents = canReadMasterData ? students.filter((student) => ["active", "aktif", "santri aktif"].includes(String(student.status || "").trim().toLowerCase())) : [];
  const outstandingAmount = canReadFinance ? openBillings.reduce((total, billing) =>
    total + Math.max(0, Number(billing.amount || 0) - Number(billing.paidAmount || 0)), 0) : 0;
  const ppdbConversion = totalCandidates > 0 ? ((acceptedCandidates / totalCandidates) * 100).toFixed(1) : 0;
  const formatRupiah = (amount: number) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(amount);
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
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-medium text-slate-800 dark:text-slate-200 border-b-2 border-emerald-500/50 pb-1 inline-block">
            Ringkasan Pesantren
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            Metrik real-time untuk tenant aktif sesuai hak akses akun.
          </p>
        </div>
        <div className="flex gap-2 text-sm bg-black/40 border border-slate-200 dark:border-white/5 rounded-lg p-1">
          <button className="px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
            Today
          </button>
          <button className="px-3 py-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-700 dark:text-slate-300 transition-colors">
            This Week
          </button>
          <span className="px-3 py-1.5 rounded-md text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5">Semua periode</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          title="Tagihan Terbuka"
          value={canReadFinance ? formatRupiah(outstandingAmount) : "—"}
          icon={Wallet}
          alert={canReadFinance && outstandingAmount > 0}
          trendValue={canReadFinance ? openBillings.length + " tagihan" : "akses terbatas"}
          statusText={canReadFinance ? "SISA TAGIHAN" : "AKSES KEUANGAN TERBATAS"}
        />
        <KPICard
          title="Pendaftar Menunggu"
          value={canReadPpdb ? pendingCandidates : "—"}
          icon={Activity}
          trendValue={canReadPpdb ? "belum diterima / ditolak" : "akses terbatas"}
          statusText={canReadPpdb ? "ALUR PPDB AKTIF" : "AKSES PPDB TERBATAS"}
        />
      </div>

      {/* Charts Section */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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

            <div className="bg-black/20 p-5 rounded-xl border border-slate-200 dark:border-white/5 hover:border-emerald-500/20 transition-colors">
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
