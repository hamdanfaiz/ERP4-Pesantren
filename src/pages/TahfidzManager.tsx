Warning: truncated output (original token count: 96212)
Total output lines: 6583

import { publicRuntimeConfigValue } from "../runtimeConfig";
import { useAuth } from '../contexts/AuthContext';
import { isRolePermissionAllowed } from "../rbac";
import { getAccessToken } from '../authSession';
import React, { useState, useEffect, useRef } from "react";
import { TahfidzStudentSearchSelect } from "../components/TahfidzStudentSearchSelect";
import { ERPTabs } from "../components/ERPDesignSystem";
import { toERPUserMessage } from "../utils/userMessages";
import {
  Search,
  Filter,
  Plus,
  Mic,
  Settings2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  BookOpen,
  Clock,
  Calendar,
  ChevronRight,
  Activity,
  Download,
  Target,
  Trophy,
  Medal,
  Bell,
  BellRing,
  User,
  MessageSquare,
  BrainCircuit,
  Layers,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  FileText,
  Printer,
  Share2,
  Maximize2,
  Minimize2,
  GraduationCap,
  ClipboardCheck,
  Award,
  Headphones,
  ThumbsUp,
  Star,
  Users,
  UploadCloud,
} from "lucide-react";
import { GamificationProfile } from "../components/GamificationManager";
import { SupabaseTahfidzSessions } from "./SupabaseTahfidzSessions";
import { SupabaseTahfidzPeerReview } from "../components/SupabaseTahfidzPeerReview";
import { legacyArchiveImportEnabled, supabaseRuntimeEnabled } from "../runtimeBackend";
import { normalizeTenantTimeZone, tenantDate, tenantLocalDateTimeToIso, tenantTime } from "../lib/tenantTimeZone";
import { resolveGuardianStudentId } from "../lib/guardianStudentSelection";
import { getTahfidzAchievementProgress } from "../lib/tahfidzAchievements";
import { loadTahfidzReportPages, nextCalendarDate, TAHFIDZ_REPORT_EXPORT_PAGE_SIZE } from "../lib/tahfidzReportExport";
import { buildTahfidzViewScopeKey, getRowsForTahfidzViewScope, isTahfidzViewScopeCurrent } from "../lib/tahfidzViewScope";
import { cn, generateUniqueId } from "../lib/utils";
import { downloadTransferCsv } from "../utils/dataTransferCsv";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const SUPABASE_TAHFIDZ_RUNTIME = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED"));
const SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED = SUPABASE_TAHFIDZ_RUNTIME
  && publicRuntimeConfigValue("VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED") === "true";
const SUPABASE_TAHFIDZ_IMPORT = legacyArchiveImportEnabled;

type TahfidzLeaderboard = {
  rankingMode: "lifetime_hafalan" | "monthly_ziyadah";
  periodStart: string | null;
  businessDate: string;
  students: Array<{
    rank: number;
    id: string;
    name: string;
    grade: string;
    halaqah: string;
    ziyadahRecords: number;
    hafalanAyahs: number | null;
    ziyadahAyahs: number | null;
    ziyadahActiveDays: number;
  }>;
  hasMore: boolean;
  participants: number;
};

async function requestSupabaseTahfidzApi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const responseError = payload.error || 'Data Tahfidz belum dapat diproses.';
    throw new Error(toERPUserMessage(responseError, 'Layanan Tahfidz belum dapat diproses saat ini. Silakan coba kembali.'));
  }
  return payload;
}

function mapSupabaseTahfidzRosterStudent(student: any, latestRecord?: any) {
  return {
    id: student.id,
    nis: student.nis || "",
    name: student.name || "Santri",
    grade: student.grade || student.classId || "",
    halaqahId: student.halaqahId || "",
    halaqah: student.halaqah || "Belum ditempatkan",
    juz: null,
    status: student.target ? "on-track" : "no-target",
    progress: null,
    lastSetoran: latestRecord ? `${latestRecord.surah}: ${latestRecord.ayahStart}-${latestRecord.ayahEnd}` : "Riwayat belum dimuat",
    score: null,
    target: student.target || null,
  };
}

async function searchSupabaseTahfidzRoster(search: string, cursor?: string) {
  const params = new URLSearchParams();
  params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  const page = await requestSupabaseTahfidzApi(`/api/tahfidz/roster?${params.toString()}`);
  return {
    students: Array.isArray(page.roster)
      ? page.roster.map((student: any) => mapSupabaseTahfidzRosterStudent(student))
      : [],
    hasMore: page.hasMore === true,
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
  };
}

function localDate(value: Date = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTime(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function createEmptyTahfidzRecordForm() {
  return {
    studentId: "", santriName: "", type: "Ziyadah", time: "", juz: "", surah: "",
    surahNomor: null, ayatCount: null, ayatStart: "", ayatEnd: "", ayat: "", notes: "",
    fluency: SUPABASE_TAHFIDZ_RUNTIME ? "" : "A",
    tajweed: SUPABASE_TAHFIDZ_RUNTIME ? "" : "A",
  };
}

// Mock Data
const SANTRI_DATA = [
  {
    id: "1",
    nis: "2024001",
    name: "Ahmad Muzakki",
    grade: "VII - A",
    halaqah: "Abu Bakar",
    juz: 5,
    status: "on-track",
    progress: 85,
    lastSetoran: "Surah Al-Mulk: 1-15",
    score: 92,
  },
  {
    id: "2",
    nis: "2024002",
    name: "Budi Santoso",
    grade: "VII - A",
    halaqah: "Abu Bakar",
    juz: 4,
    status: "at-risk",
    progress: 40,
    lastSetoran: "Surah An-Naba: 1-20",
    score: 75,
  },
  {
    id: "3",
    nis: "2024003",
    name: "Syamil Al-Farizi",
    grade: "VIII - B",
    halaqah: "Umar",
    juz: 12,
    status: "ahead",
    progress: 95,
    lastSetoran: "Surah Yusuf: 1-30",
    score: 98,
  },
  {
    id: "4",
    nis: "2024004",
    name: "Yusuf Mansur",
    grade: "VII - A",
    halaqah: "Abu Bakar",
    juz: 5,
    status: "on-track",
    progress: 60,
    lastSetoran: "Surah Al-Waqi'ah: 1-40",
    score: 88,
  },
  {
    id: "5",
    nis: "2024005",
    name: "Ibrahim Khalil",
    grade: "IX - C",
    halaqah: "Utsman",
    juz: 20,
    status: "on-track",
    progress: 75,
    lastSetoran: "Surah Taha: 1-50",
    score: 90,
  },
];

const MOCK_HALAQAH = [
  {
    id: "h1",
    name: "Abu Bakar",
    ustadz: "Ust. Tarmudzi",
    schedule: "Senin - Jumat, 05:00 - 06:30",
    room: "Masjid Utama - Sayap Kanan",
    target: "Ziyadah 1 Halaman/Hari",
  },
  {
    id: "h2",
    name: "Umar",
    ustadz: "Ust. Ahmad S.",
    schedule: "Senin - Jumat, 15:30 - 17:00",
    room: "Kelas 7A",
    target: "Murojaah 5 Halaman/Hari",
  },
  {
    id: "h3",
    name: "Utsman",
    ustadz: "Ust. Ali R.",
    schedule: "Senin - Kamis, 18:30 - 20:00",
    room: "Masjid Utama - Sayap Kiri",
    target: "Ziyadah 2 Halaman/Hari",
  },
];

const INITIAL_RECORDS = [
  {
    id: "REC-001",
    date: "2023-11-20",
    time: "05:30",
    santriName: "Ahmad Muzakki",
    type: "Ziyadah",
    surah: "Al-Mulk",
    ayat: "1-15",
    fluency: "A",
    tajweed: "B+",
    notes: "Perhatikan mad wajib",
    ust: "Ust. Abu Bakar",
  },
  {
    id: "REC-002",
    date: "2023-11-20",
    time: "05:45",
    santriName: "Syamil Al-Farizi",
    type: "Ziyadah",
    surah: "Yusuf",
    ayat: "1-30",
    fluency: "A+",
    tajweed: "A",
    notes: "Mumtaz",
    ust: "Ust. Umar",
  },
  {
    id: "REC-003",
    date: "2023-11-19",
    time: "16:00",
    santriName: "Budi Santoso",
    type: "Muroja'ah",
    surah: "An-Naba",
    ayat: "1-40",
    fluency: "C",
    tajweed: "C",
    notes: "Banyak hafalan yang lupa, perlu diulang",
    ust: "Ust. Abu Bakar",
  },
];

const mockAudioData = [
  { time: "0s", amplitude: 20 },
  { time: "1s", amplitude: 45 },
  { time: "2s", amplitude: 30 },
  { time: "3s", amplitude: 80 },
  { time: "4s", amplitude: 60 },
  { time: "5s", amplitude: 90 },
  { time: "6s", amplitude: 40 },
  { time: "7s", amplitude: 15 },
];

const MOCK_BADGES = [
  {
    id: "juz-30",
    name: "Hafizh Juz 30",
    desc: "Menyelesaikan hafalan Juz 30",
    icon: Trophy,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    id: "juz-29",
    name: "Hafizh Juz 29",
    desc: "Menyelesaikan hafalan Juz 29",
    icon: Medal,
    color: "text-slate-400",
    bg: "bg-slate-400/10",
  },
  {
    id: "surah-albaqarah",
    name: "Al-Baqarah Master",
    desc: "Menyelesaikan hafalan Surah Al-Baqarah",
    icon: Award,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    id: "surah-alkahf",
    name: "Al-Kahfi Guardian",
    desc: "Menyelesaikan hafalan Surah Al-Kahfi",
    icon: Star,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    id: "fast-learner",
    name: "Fast Learner",
    desc: "Setoran 5 halaman dalam seminggu",
    icon: Sparkles,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    id: "consistent",
    name: "Istiqomah",
    desc: "Setoran tanpa absen selama 30 hari",
    icon: CheckCircle2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
];

const STUDENT_ACHIEVEMENTS = [
  { id: "1", unlocked: ["juz-30", "consistent"] },
  { id: "2", unlocked: ["surah-alkahf"] },
  {
    id: "3",
    unlocked: ["juz-30", "juz-29", "surah-albaqarah", "fast-learner"],
  },
  { id: "4", unlocked: ["juz-30"] },
  { id: "5", unlocked: ["juz-30", "juz-29", "consistent"] },
];

const WEEKLY_DATA = [
  { day: "Sen", Ziyadah: 5, "Muroja'ah": 15 },
  { day: "Sel", Ziyadah: 6, "Muroja'ah": 18 },
  { day: "Rab", Ziyadah: 5, "Muroja'ah": 15 },
  { day: "Kam", Ziyadah: 8, "Muroja'ah": 20 },
  { day: "Jum", Ziyadah: 4, "Muroja'ah": 10 },
  { day: "Sab", Ziyadah: 10, "Muroja'ah": 25 },
  { day: "Min", Ziyadah: 0, "Muroja'ah": 5 },
];

const COMPLETION_DATA = [
  { month: "Jul", Target: 100, Aktual: 95 },
  { month: "Agu", Target: 100, Aktual: 105 },
  { month: "Sep", Target: 100, Aktual: 90 },
  { month: "Okt", Target: 100, Aktual: 110 },
  { month: "Nov", Target: 100, Aktual: 100 },
];

import { QuranViewer } from "../components/QuranViewer";

const JUZ_MAPPING = [
  { juz: 1, start: { surah: 1, ayat: 1 }, end: { surah: 2, ayat: 141 } },
  { juz: 2, start: { surah: 2, ayat: 142 }, end: { surah: 2, ayat: 252 } },
  { juz: 3, start: { surah: 2, ayat: 253 }, end: { surah: 3, ayat: 92 } },
  { juz: 4, start: { surah: 3, ayat: 93 }, end: { surah: 4, ayat: 23 } },
  { juz: 5, start: { surah: 4, ayat: 24 }, end: { surah: 4, ayat: 147 } },
  { juz: 6, start: { surah: 4, ayat: 148 }, end: { surah: 5, ayat: 81 } },
  { juz: 7, start: { surah: 5, ayat: 82 }, end: { surah: 6, ayat: 110 } },
  { juz: 8, start: { surah: 6, ayat: 111 }, end: { surah: 7, ayat: 87 } },
  { juz: 9, start: { surah: 7, ayat: 88 }, end: { surah: 8, ayat: 40 } },
  { juz: 10, start: { surah: 8, ayat: 41 }, end: { surah: 9, ayat: 92 } },
  { juz: 11, start: { surah: 9, ayat: 93 }, end: { surah: 11, ayat: 5 } },
  { juz: 12, start: { surah: 11, ayat: 6 }, end: { surah: 12, ayat: 52 } },
  { juz: 13, start: { surah: 12, ayat: 53 }, end: { surah: 14, ayat: 52 } },
  { juz: 14, start: { surah: 15, ayat: 1 }, end: { surah: 16, ayat: 128 } },
  { juz: 15, start: { surah: 17, ayat: 1 }, end: { surah: 18, ayat: 74 } },
  { juz: 16, start: { surah: 18, ayat: 75 }, end: { surah: 20, ayat: 135 } },
  { juz: 17, start: { surah: 21, ayat: 1 }, end: { surah: 22, ayat: 78 } },
  { juz: 18, start: { surah: 23, ayat: 1 }, end: { surah: 25, ayat: 20 } },
  { juz: 19, start: { surah: 25, ayat: 21 }, end: { surah: 27, ayat: 55 } },
  { juz: 20, start: { surah: 27, ayat: 56 }, end: { surah: 29, ayat: 45 } },
  { juz: 21, start: { surah: 29, ayat: 46 }, end: { surah: 33, ayat: 30 } },
  { juz: 22, start: { surah: 33, ayat: 31 }, end: { surah: 36, ayat: 27 } },
  { juz: 23, start: { surah: 36, ayat: 28 }, end: { surah: 39, ayat: 31 } },
  { juz: 24, start: { surah: 39, ayat: 32 }, end: { surah: 41, ayat: 46 } },
  { juz: 25, start: { surah: 41, ayat: 47 }, end: { surah: 45, ayat: 37 } },
  { juz: 26, start: { surah: 46, ayat: 1 }, end: { surah: 51, ayat: 30 } },
  { juz: 27, start: { surah: 51, ayat: 31 }, end: { surah: 57, ayat: 29 } },
  { juz: 28, start: { surah: 58, ayat: 1 }, end: { surah: 66, ayat: 12 } },
  { juz: 29, start: { surah: 67, ayat: 1 }, end: { surah: 77, ayat: 50 } },
  { juz: 30, start: { surah: 78, ayat: 1 }, end: { surah: 114, ayat: 6 } },
];

export function TahfidzManager() {
  const { user, role } = useAuth();
  const timeZone = normalizeTenantTimeZone(user?.tenantTimeZone);
  const currentTenantDate = (value: Date = new Date()) => SUPABASE_TAHFIDZ_RUNTIME ? tenantDate(value, timeZone) : localDate(value);
  const currentTenantTime = (value: Date = new Date()) => SUPABASE_TAHFIDZ_RUNTIME ? tenantTime(value, timeZone) : localTime(value);
  const canManageTahfidz = isRolePermissionAllowed(role, "tahfidz.action.manage-halaqah", user?.modulePermissions);
  const canRecordTahfidz = isRolePermissionAllowed(role, "tahfidz.action.record-setoran", user?.modulePermissions);
  const canExportTahfidz = isRolePermissionAllowed(role, "tahfidz.action.export-report", user?.modulePermissions);
  const canManageTargets = isRolePermissionAllowed(role, "tahfidz.action.manage-targets", user?.modulePermissions);
  const canManageSessions = isRolePermissionAllowed(role, "tahfidz.action.manage-sessions", user?.modulePermissions);
  const canAssessAudio = isRolePermissionAllowed(role, "tahfidz.action.assess-audio", user?.modulePermissions);
  const canCommentOnStudent = isRolePermissionAllowed(role, "tahfidz.action.comment-student", user?.modulePermissions);
  const canSendTahfidzReminders = isRolePermissionAllowed(role, "tahfidz.action.send-reminders", user?.modulePermissions);
  const canSubmitPeerReview = isRolePermissionAllowed(role, "tahfidz.action.submit-peer-review", user?.modulePermissions);
  const canModeratePeerReview = isRolePermissionAllowed(role, "tahfidz.action.moderate-peer-review", user?.modulePermissions);
  const canViewRecordNotes = isRolePermissionAllowed(role, "tahfidz.field.record-notes", user?.modulePermissions);
  const canViewRecordedBy = isRolePermissionAllowed(role, "tahfidz.field.recorded-by", user?.modulePermissions);
  const canViewFollowUps = isRolePermissionAllowed(role, "tahfidz.field.follow-ups", user?.modulePermissions);
  const isTahfidzLearner = ["Santri", "Walisantri"].includes(role);
  const canViewUnscopedTahfidzDemo = role === "Admin" || role === "SuperAdmin";
  const renderScopedTahfidzUnavailable = (label: string) => (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{label} belum tersedia</h2>
      <p className="mt-2 text-sm text-slate-500">Data akun dan penugasan belum dapat dimuat. Hubungi Admin atau aktifkan sumber data pesantren untuk melihat informasi yang sesuai dengan akun Anda.</p>
    </section>
  );
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, records, targets, quran
  const visibleTahfidzTabs = [
    { id: "dashboard", label: "Ringkasan Halaqah" },
    { id: "records", label: "Riwayat Setoran" },
    { id: "targets", label: "Target & Rapor" },
    { id: "talaqqi", label: "Jadwal Talaqqi" },
    { id: "exams", label: "Munaqasyah" },
    { id: "parent", label: "Portal Wali Santri" },
    { id: "peer-review", label: "Penilaian Antar-Santri" },
    { id: "quran", label: "Al-Qur'an" },
    { id: "badges", label: "Pencapaian Tahfidz" },
    { id: "halaqah", label: isTahfidzLearner && SUPABASE_TAHFIDZ_RUNTIME ? "Halaqah Saya" : "Manajemen Halaqah" },
  ].filter((tab) => isRolePermissionAllowed(role, `tahfidz.tab.${tab.id}`, user?.modulePermissions));
  const renderedTahfidzTab = visibleTahfidzTabs.some((tab) => tab.id === activeTab) ? activeTab : "dashboard";

  useEffect(() => {
    if (!isRolePermissionAllowed(role, `tahfidz.tab.${activeTab}`, user?.modulePermissions)) {
      setActiveTab("dashboard");
    }
  }, [activeTab, role, user?.modulePermissions]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [examFilter, setExamFilter] = useState<"upcoming" | "completed">(
    "upcoming",
  );
  const [selectedCertificate, setSelectedCertificate] = useState<any>(null);
  const [isExamActive, setIsExamActive] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isPrintPlanOpen, setIsPrintPlanOpen] = useState(false);
  const [printPlanStudentId, setPrintPlanStudentId] = useState("");
  const [printPlanScopeKey, setPrintPlanScopeKey] = useState("");
  const [isPeerReviewOpen, setIsPeerReviewOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [isTalaqqiModalOpen, setIsTalaqqiModalOpen] = useState(false);
  const [isAiPlannerOpen, setIsAiPlannerOpen] = useState(false);
  const [isFlashcardOpen, setIsFlashcardOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [surahList, setSurahList] = useState<any[]>([]);
  const [isSurahListLoading, setIsSurahListLoading] = useState(true);
  const [surahListError, setSurahListError] = useState("");
  const [surahListAttempt, setSurahListAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadSurahs = async () => {
      setIsSurahListLoading(true);
      setSurahListError("");
      try {
        const data = await requestSupabaseTahfidzApi("/api/tahfidz/references/surahs", { signal: controller.signal });
        const entries = Array.isArray(data?.data) ? data.data : [];
        const validEntries = entries.filter((item: any) =>
          Number.isInteger(Number(item?.nomor))
          && Number(item.nomor) >= 1
          && Number(item.nomor) <= 114
          && typeof item?.namaLatin === "string"
          && item.namaLatin.trim().length > 0
          && Number.isInteger(Number(item?.jumlahAyat))
          && Number(item.jumlahAyat) >= 1
          && Number(item.jumlahAyat) <= 286,
        );
        if (validEntries.length !== 114) throw new Error("Katalog Surah belum lengkap. Coba muat ulang.");
        setSurahList(validEntries.sort((left: any, right: any) => Number(left.nomor) - Number(right.nomor)));
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          setSurahList([]);
          setSurahListError("Daftar Surah belum dapat dimuat. Silakan coba lagi.");
        }
      } finally {
        if (!controller.signal.aborted) setIsSurahListLoading(false);
      }
    };
    void loadSurahs();
    return () => controller.abort();
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz, surahListAttempt]);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isHalaqahModalOpen, setIsHalaqahModalOpen] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [editingHalaqah, setEditingHalaqah] = useState<any>(null);
  const [isSavingHalaqah, setIsSavingHalaqah] = useState(false);
  const [isSavingMembership, setIsSavingMembership] = useState(false);
  const [isPreviewingTahfidzImport, setIsPreviewingTahfidzImport] = useState(false);
  const [isApplyingTahfidzImport, setIsApplyingTahfidzImport] = useState(false);
  const [tahfidzImportPreview, setTahfidzImportPreview] = useState<any>(null);
  const [ustadzOptions, setUstadzOptions] = useState<any[]>([]);
  const [halaqahForm, setHalaqahForm] = useState({ name: "", ustadzUserId: "", schedule: "", room: "", dailyTargetPages: "1" });
  const [membershipForm, setMembershipForm] = useState({ halaqahId: "", studentId: "", startsOn: currentTenantDate() });
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [selectedGuardianStudentId, setSelectedGuardianStudentId] = useState("");
  const [selectedSantri, setSelectedSantri] = useState<any>(null);
  const [dashboardActionStudent, setDashboardActionStudent] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [halaqahList, setHalaqahList] = useState<any[]>([]);
  const [selectedHalaqahFilter, setSelectedHalaqahFilter] =
    useState("Semua Halaqah");
  const [tahfidzLoading, setTahfidzLoading] = useState(SUPABASE_TAHFIDZ_RUNTIME);
  const [tahfidzError, setTahfidzError] = useState("");
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const pendingSetoranRequest = useRef<{ signature: string; requestId: string; payload: Record<string, any> } | null>(null);
  const pendingWriteRequestIds = useRef(new Map<string, string>());
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [targetFormError, setTargetFormError] = useState("");
  const [selectedTargetStudentIds, setSelectedTargetStudentIds] = useState<string[]>([]);
  const [bulkTargetStudentIds, setBulkTargetStudentIds] = useState<string[]>([]);
  const [targetForm, setTargetForm] = useState({
    studentId: "",
    ziyadahPagesPerDay: "1",
    murojaahPagesPerDay: "0.5",
    periodStart: currentTenantDate(),
    periodEnd: "",
    policy: "standard",
  });
  useEffect(() => {
    if (!isMembershipModalOpen) setMembershipForm((current) => ({ ...current, startsOn: currentTenantDate() }));
    if (!isTargetModalOpen) setTargetForm((current) => ({ ...current, periodStart: currentTenantDate() }));
  }, [timeZone, isMembershipModalOpen, isTargetModalOpen]);
  useEffect(() => {
    pendingSetoranRequest.current = null;
    pendingWriteRequestIds.current.clear();
    setSelectedTargetStudentIds([]);
    setBulkTargetStudentIds([]);
    setTargetFormError("");
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz, timeZone]);

  const tahfidzWriteRequestId = (signature: string) => {
    const existing = pendingWriteRequestIds.current.get(signature);
    if (existing) return existing;
    const requestId = crypto.randomUUID();
    pendingWriteRequestIds.current.set(signature, requestId);
    while (pendingWriteRequestIds.current.size > 32) {
      const oldestSignature = pendingWriteRequestIds.current.keys().next().value;
      if (oldestSignature === undefined) break;
      pendingWriteRequestIds.current.delete(oldestSignature);
    }
    return requestId;
  };

  const releaseTahfidzWriteRequestId = (signature: string, requestId: string) => {
    if (pendingWriteRequestIds.current.get(signature) === requestId) {
      pendingWriteRequestIds.current.delete(signature);
    }
  };
  const [santriList, setSantriList] = useState<any[]>(SUPABASE_TAHFIDZ_RUNTIME ? [] : SANTRI_DATA);
  const printPlanStudent = santriList.find((student) => String(student.id) === printPlanStudentId) || null;
  const currentPrintPlanScopeKey = `${user?.tenantId || ""}:${user?.uid || ""}`;
  useEffect(() => {
    setIsPrintPlanOpen(false);
    setPrintPlanStudentId("");
    setPrintPlanScopeKey("");
  }, [user?.tenantId, user?.uid]);
  const [rosterHasMore, setRosterHasMore] = useState(false);
  const [rosterNextCursor, setRosterNextCursor] = useState("");
  const [rosterLoadingMore, setRosterLoadingMore] = useState(false);
  const [rosterStats, setRosterStats] = useState<any>(null);
  const [dashboardFollowUps, setDashboardFollowUps] = useState<{ count: number; rows: any[] } | null>(null);
  const [rosterSearchResults, setRosterSearchResults] = useState<any[] | null>(null);
  const [rosterSearchTerm, setRosterSearchTerm] = useState("");
  const [rosterSearchHasMore, setRosterSearchHasMore] = useState(false);
  const [rosterSearchCursor, setRosterSearchCursor] = useState("");
  const [rosterSearchLoading, setRosterSearchLoading] = useState(false);
  const rosterSearchRequestSequence = useRef(0);
  const [records, setRecords] = useState<any[]>(SUPABASE_TAHFIDZ_RUNTIME ? [] : INITIAL_RECORDS);
  const printPlanRecords = printPlanStudent
    ? records.filter((record) => String(record.studentId) === String(printPlanStudent.id)).slice(0, 5)
    : [];
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [recordsNextCursor, setRecordsNextCursor] = useState("");
  const [recordsOldestDate, setRecordsOldestDate] = useState("");
  const [recordsLoadingMore, setRecordsLoadingMore] = useState(false);
  const [isTahfidzExportOpen, setIsTahfidzExportOpen] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState(() => `${currentTenantDate().slice(0, 7)}-01`);
  const [reportDateTo, setReportDateTo] = useState(() => currentTenantDate());
  const [isExportingTahfidzReport, setIsExportingTahfidzReport] = useState(false);
  const [tahfidzExportError, setTahfidzExportError] = useState("");
  const tahfidzExportController = useRef<AbortController | null>(null);
  const tahfidzExportRequestSequence = useRef(0);
  const [achievementRows, setAchievementRows] = useState<any[]>([]);
  const [achievementHasMore, setAchievementHasMore] = useState(false);
  const [achievementNextCursor, setAchievementNextCursor] = useState("");
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementError, setAchievementError] = useState("");
  const [achievementScope, setAchievementScope] = useState("");
  const [achievementErrorScope, setAchievementErrorScope] = useState("");
  const achievementRequestSequence = useRef(0);
  const [leaderboard, setLeaderboard] = useState<TahfidzLeaderboard | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [leaderboardLimit, setLeaderboardLimit] = useState<5 | 20>(5);
  const leaderboardRequestSequence = useRef(0);
  const [leaderboardScope, setLeaderboardScope] = useState("");
  const currentTahfidzScopeKey = buildTahfidzViewScopeKey({
    tenantId: user?.tenantId,
    userId: user?.uid,
    role,
    modulePermission: user?.modulePermissions?.tahfidz,
  });
  const currentTahfidzScopeKeyRef = useRef(currentTahfidzScopeKey);
  currentTahfidzScopeKeyRef.current = currentTahfidzScopeKey;
  const currentLeaderboardScopeKey = currentTahfidzScopeKey;
  const currentAchievementScopeKey = currentTahfidzScopeKey;

  useEffect(() => {
    setIsTahfidzExportOpen(false);
    setIsExportingTahfidzReport(false);
    setTahfidzExportError("");
    return () => {
      tahfidzExportRequestSequence.current += 1;
      tahfidzExportController.current?.abort();
      tahfidzExportController.current = null;
    };
  }, [currentTahfidzScopeKey]);

  useEffect(() => {
    if (role !== "Walisantri") {
      setSelectedGuardianStudentId("");
      return;
    }
    setSelectedGuardianStudentId((current) => resolveGuardianStudentId(santriList, current));
  }, [role, santriList, user?.tenantId, user?.uid]);

  const mapTahfidzRecord = (record: any) => {
    const performedAt = new Date(record.performedAt);
    return {
      id: record.id,
      studentId: record.studentId,
      studentStatus: String(record.studentStatus || "").trim().toLowerCase(),
      halaqahId: record.halaqahId,
      date: Number.isNaN(performedAt.getTime()) ? "" : currentTenantDate(performedAt),
      time: Number.isNaN(performedAt.getTime()) ? "" : currentTenantTime(performedAt),
      santriName: record.studentName || "Santri tidak tersedia",
      type: record.activityType,
      surah: record.surah,
      ayat: `${record.ayahStart}-${record.ayahEnd}`,
      fluency: record.fluency || "N/A",
      tajweed: record.tajweed || "N/A",
      notes: canViewRecordNotes ? record.notes || "-" : "-",
      ust: canViewRecordedBy ? record.recordedByName || "" : "",
    };
  };

  const applyTahfidzSnapshot = (snapshot: any) => {
    const recordRows = Array.isArray(snapshot.records) ? snapshot.records : [];
    const hasMoreRecords = snapshot.recordsPage?.hasMore === true;
    const mappedRecords = recordRows.map(mapTahfidzRecord);
    const latestByStudent = new Map<string, any>();
    recordRows.forEach((record: any) => {
      if (!latestByStudent.has(String(record.studentId))) latestByStudent.set(String(record.studentId), record);
    });
    const students = (Array.isArray(snapshot.roster) ? snapshot.roster : []).map((student: any) =>
      mapSupabaseTahfidzRosterStudent(student, latestByStudent.get(String(student.id))));
    setSantriList(students);
    setRosterHasMore(snapshot.rosterPage?.hasMore === true);
    setRosterNextCursor(typeof snapshot.rosterPage?.nextCursor === "string" ? snapshot.rosterPage.nextCursor : "");
    setRosterStats(snapshot.rosterStats && typeof snapshot.rosterStats === "object" ? snapshot.rosterStats : null);
    setDashboardFollowUps(snapshot.followUps && typeof snapshot.followUps === "object" ? snapshot.followUps : null);
    setHalaqahList((Array.isArray(snapshot.halaqahs) ? snapshot.halaqahs : []).map((halaqah: any) => ({
      ...halaqah,
      target: `${Number(halaqah.dailyTargetPages || 0)} halaman/hari`,
    })));
    setRecords(mappedRecords);
    setRecordsHasMore(hasMoreRecords);
    setRecordsNextCursor(typeof snapshot.recordsPage?.nextCursor === "string" ? snapshot.recordsPage.nextCursor : "");
    setRecordsOldestDate(mappedRecords[mappedRecords.length - 1]?.date || "");
    setUstadzOptions(Array.isArray(snapshot.ustadzOptions) ? snapshot.ustadzOptions : []);
  };

  const refreshSupabaseTahfidz = async () => {
    const snapshot = await requestSupabaseTahfidzApi("/api/tahfidz/snapshot");
    applyTahfidzSnapshot(snapshot);
    return snapshot;
  };

  const loadMoreTahfidzRecords = async () => {
    if (!recordsHasMore || !recordsNextCursor || recordsLoadingMore) return;
    setRecordsLoadingMore(true);
    setTahfidzError("");
    try {
      const page = await requestSupabaseTahfidzApi(
        `/api/tahfidz/records?cursor=${encodeURIComponent(recordsNextCursor)}`,
      );
      const incoming = Array.isArray(page.records) ? page.records.map(mapTahfidzRecord) : [];
      setRecords((current) => {
        const knownIds = new Set(current.map((record) => String(record.id)));
        return [...current, ...incoming.filter((record: any) => !knownIds.has(String(record.id)))];
      });
      setRecordsHasMore(page.hasMore === true);
      setRecordsNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
      if (incoming[incoming.length - 1]?.date) setRecordsOldestDate(incoming[incoming.length - 1].date);
    } catch (error: any) {
      setTahfidzError(toERPUserMessage(error, "Riwayat setoran berikutnya belum dapat dimuat."));
    } finally {
      setRecordsLoadingMore(false);
    }
  };

  const exportTahfidzReport = async () => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || !canExportTahfidz || isExportingTahfidzReport) return;
    setTahfidzExportError("");
    if (!reportDateFrom || !reportDateTo || reportDateFrom > reportDateTo) {
      setTahfidzExportError("Pilih rentang tanggal yang valid.");
      return;
    }

    const requestSequence = ++tahfidzExportRequestSequence.current;
    const requestScope = currentTahfidzScopeKeyRef.current;
    const controller = new AbortController();
    tahfidzExportController.current = controller;
    setIsExportingTahfidzReport(true);

    try {
      const from = tenantLocalDateTimeToIso(`${reportDateFrom}T00:00`, timeZone);
      const to = tenantLocalDateTimeToIso(`${nextCalendarDate(reportDateTo)}T00:00`, timeZone);
      const reportRows = await loadTahfidzReportPages(async (cursor) => {
        if (controller.signal.aborted || requestSequence !== tahfidzExportRequestSequence.current
          || requestScope !== currentTahfidzScopeKeyRef.current) {
          throw new DOMException("Ekspor dibatalkan.", "AbortError");
        }
        const params = new URLSearchParams({
          from,
          to,
          pageSize: String(TAHFIDZ_REPORT_EXPORT_PAGE_SIZE),
        });
        if (cursor) params.set("cursor", cursor);
        const page = await requestSupabaseTahfidzApi(`/api/tahfidz/records?${params.toString()}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestSequence !== tahfidzExportRequestSequence.current
          || requestScope !== currentTahfidzScopeKeyRef.current) {
          throw new DOMException("Ekspor dibatalkan.", "AbortError");
        }
        return { records: page?.records, hasMore: page?.hasMore, nextCursor: page?.nextCursor };
      });

      if (controller.signal.aborted || requestSequence !== tahfidzExportRequestSequence.current
        || requestScope !== currentTahfidzScopeKeyRef.current) return;

      const halaqahNameById = new Map(halaqahList.map((halaqah) => [String(halaqah.id), String(halaqah.name || "")]));
      const exportedRows = reportRows.map((record: any) => {
        const performedAt = new Date(record?.performedAt);
        if (!Number.isFinite(performedAt.getTime()) || !record?.studentId) {
          throw new Error("Ada catatan Tahfidz yang tidak lengkap. Laporan tidak diunduh.");
        }
        return {
          Tanggal: currentTenantDate(performedAt),
          Waktu: currentTenantTime(performedAt),
          NIS: record.nis || "",
          "Nama Santri": record.studentName || "Santri tidak tersedia",
          Halaqah: halaqahNameById.get(String(record.halaqahId || "")) || "",
          "Jenis Setoran": record.activityType || "",
          Surah: record.surah || "",
          "Ayat Mulai": Number(record.ayahStart),
          "Ayat Akhir": Number(record.ayahEnd),
          Kelancaran: record.fluency || "Belum dinilai",
          Tajwid: record.tajweed || "Belum dinilai",
          ...(canViewRecordNotes ? { Catatan: record.notes || "" } : {}),
          ...(canViewRecordedBy ? { "Dicatat Oleh": record.recordedByName || "" } : {}),
        };
      });
      downloadTransferCsv(
        `laporan-tahfidz-${reportDateFrom}-${reportDateTo}.csv`,
        ["Tanggal", "Waktu", "NIS", "Nama Santri", "Halaqah", "Jenis Setoran", "Surah", "Ayat Mulai", "Ayat Akhir", "Kelancaran", "Tajwid", ...(canViewRecordNotes ? ["Catatan"] : []), ...(canViewRecordedBy ? ["Dicatat Oleh"] : [])],
        exportedRows,
      );
      setIsTahfidzExportOpen(false);
    } catch (error: any) {
      if (controller.signal.aborted || requestSequence !== tahfidzExportRequestSequence.current || error?.name === "AbortError") return;
      setTahfidzExportError(toERPUserMessage(error, "Laporan Tahfidz belum dapat diunduh."));
    } finally {
      if (requestSequence === tahfidzExportRequestSequence.current) {
        setIsExportingTahfidzReport(false);
        if (tahfidzExportController.current === controller) tahfidzExportController.current = null;
      }
    }
  };

  const cancelTahfidzReportExport = () => {
    tahfidzExportRequestSequence.current += 1;
    tahfidzExportController.current?.abort();
    tahfidzExportController.current = null;
    setIsExportingTahfidzReport(false);
    setIsTahfidzExportOpen(false);
  };

  const loadMoreTahfidzRoster = async () => {
    if (!rosterHasMore || !rosterNextCursor || rosterLoadingMore) return;
    setRosterLoadingMore(true);
    setTahfidzError("");
    try {
      const page = await requestSupabaseTahfidzApi(
        `/api/tahfidz/roster?cursor=${encodeURIComponent(rosterNextCursor)}`,
      );
      const incoming = Array.isArray(page.roster) ? page.roster.map((student: any) => mapSupabaseTahfidzRosterStudent(student)) : [];
      setSantriList((current) => {
        const knownIds = new Set(current.map((student) => String(student.id)));
        return [...current, ...incoming.filter((student: any) => !knownIds.has(String(student.id)))];
      });
      setRosterHasMore(page.hasMore === true);
      setRosterNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
    } catch (error: any) {
      setTahfidzError(toERPUserMessage(error, "Halaman daftar santri berikutnya belum dapat dimuat."));
    } finally {
      setRosterLoadingMore(false);
    }
  };

  const loadSupabaseTahfidzAchievements = async (cursor = "", append = false) => {
    const requestSequence = ++achievementRequestSequence.current;
    const requestScopeKey = currentAchievementScopeKey;
    const shouldAppend = append && isTahfidzViewScopeCurrent(achievementScope, requestScopeKey);
    setAchievementLoading(true);
    setAchievementError("");
    setAchievementErrorScope(requestScopeKey);
    if (!shouldAppend) {
      setAchievementScope("");
      setAchievementRows([]);
      setAchievementHasMore(false);
      setAchievementNextCursor("");
    }
    try {
      const params = new URLSearchParams();
      if (cursor && shouldAppend) params.set("cursor", cursor);
      const page = await requestSupabaseTahfidzApi(`/api/tahfidz/achievements?${params.toString()}`);
      if (requestSequence !== achievementRequestSequence.current) return;
      const incoming = Array.isArray(page.students) ? page.students : [];
      setAchievementRows((current) => {
        const existing = shouldAppend ? current : [];
        const knownIds = new Set(existing.map((student) => String(student.id)));
        return [...existing, ...incoming.filter((student: any) => !knownIds.has(String(student.id)))];
      });
      setAchievementScope(requestScopeKey);
      setAchievementHasMore(page.hasMore === true);
      setAchievementNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
    } catch (error: any) {
      if (requestSequence === achievementRequestSequence.current) {
        setAchievementErrorScope(requestScopeKey);
        setAchievementError(toERPUserMessage(error, "Pencapaian Tahfidz belum dapat dimuat."));
      }
    } finally {
      if (requestSequence === achievementRequestSequence.current) setAchievementLoading(false);
    }
  };

  const loadSupabaseTahfidzLeaderboard = async (limit: 5 | 20 = 5) => {
    const requestSequence = ++leaderboardRequestSequence.current;
    setLeaderboardLoading(true);
    setLeaderboardError("");
    setLeaderboard(null);
    setLeaderboardScope("");
    setLeaderboardLimit(limit);
    try {
      const result = await requestSupabaseTahfidzApi(`/api/tahfidz/leaderboard?limit=${limit}`);
      if (requestSequence !== leaderboardRequestSequence.current) return;
      setLeaderboard(result as TahfidzLeaderboard);
      setLeaderboardScope(currentLeaderboardScopeKey);
    } catch (error: any) {
      if (requestSequence === leaderboardRequestSequence.current) {
        setLeaderboardError(toERPUserMessage(error, "Peringkat Tahfidz belum dapat dimuat."));
      }
    } finally {
      if (requestSequence === leaderboardRequestSequence.current) setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || activeTab !== "badges") return;
    void loadSupabaseTahfidzAchievements();
    return () => { achievementRequestSequence.current += 1; };
  }, [activeTab, user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz]);

  useEffect(() => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || activeTab !== "dashboard"
      || !["Admin", "SuperAdmin", "Ustadz"].includes(role)) {
      setLeaderboard(null);
      setLeaderboardScope("");
      return;
    }
    void loadSupabaseTahfidzLeaderboard();
    return () => { leaderboardRequestSequence.current += 1; };
  }, [activeTab, user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz]);

  const loadMoreTahfidzSearch = async () => {
    if (!rosterSearchHasMore || !rosterSearchCursor || rosterSearchLoading || !searchQuery.trim()) return;
    const requestedSearch = searchQuery.trim();
    const requestSequence = rosterSearchRequestSequence.current;
    setRosterSearchLoading(true);
    setTahfidzError("");
    try {
      const page = await requestSupabaseTahfidzApi(
        `/api/tahfidz/roster?cursor=${encodeURIComponent(rosterSearchCursor)}&search=${encodeURIComponent(requestedSearch)}`,
      );
      if (requestSequence !== rosterSearchRequestSequence.current || requestedSearch !== searchQuery.trim()) return;
      const incoming = Array.isArray(page.roster) ? page.roster.map((student: any) => mapSupabaseTahfidzRosterStudent(student)) : [];
      setRosterSearchResults((current) => {
        const knownIds = new Set((current || []).map((student) => String(student.id)));
        return [...(current || []), ...incoming.filter((student: any) => !knownIds.has(String(student.id)))];
      });
      setRosterSearchHasMore(page.hasMore === true);
      setRosterSearchCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
    } catch (error: any) {
      if (requestSequence === rosterSearchRequestSequence.current && requestedSearch === searchQuery.trim()) {
        setTahfidzError(toERPUserMessage(error, "Hasil pencarian santri berikutnya belum dapat dimuat."));
      }
    } finally {
      if (requestSequence === rosterSearchRequestSequence.current) setRosterSearchLoading(false);
    }
  };

  useEffect(() => {
    const requestSequence = ++rosterSearchRequestSequence.current;
    if (!SUPABASE_TAHFIDZ_RUNTIME || !searchQuery.trim()) {
      setRosterSearchResults(null);
      setRosterSearchTerm("");
      setRosterSearchHasMore(false);
      setRosterSearchCursor("");
      setRosterSearchLoading(false);
      return;
    }
    let active = true;
    const query = searchQuery.trim();
    setRosterSearchTerm(query);
    setRosterSearchResults([]);
    setRosterSearchHasMore(false);
    setRosterSearchCursor("");
    setRosterSearchLoading(true);
    const timer = window.setTimeout(() => {
      requestSupabaseTahfidzApi(`/api/tahfidz/roster?search=${encodeURIComponent(query)}`)
        .then((page) => {
          if (!active || requestSequence !== rosterSearchRequestSequence.current) return;
          setRosterSearchResults(Array.isArray(page.roster) ? page.roster.map((student: any) => mapSupabaseTahfidzRosterStudent(student)) : []);
          setRosterSearchHasMore(page.hasMore === true);
          setRosterSearchCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
        })
        .catch((error: any) => {
          if (active && requestSequence === rosterSearchRequestSequence.current) setTahfidzError(toERPUserMessage(error, "Hasil pencarian santri belum dapat dimuat."));
        })
        .finally(() => { if (active && requestSequence === rosterSearchRequestSequence.current) setRosterSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchQuery, user?.tenantId, user?.uid, role]);

  useEffect(() => {
    let active = true;
    if (!user?.tenantId || !user?.uid) {
      setSantriList([]);
      setRosterHasMore(false);
      setRosterNextCursor("");
      setRosterStats(null);
      setDashboardFollowUps(null);
      setHalaqahList([]);
      setRecords([]);
      setRecordsHasMore(false);
      setRecordsNextCursor("");
      setRecordsOldestDate("");
      setTahfidzError("Akun Anda belum terhubung dengan pesantren aktif.");
      setTahfidzLoading(false);
      return () => { active = false; };
    }
    setTahfidzLoading(true);
    setTahfidzError("");
    requestSupabaseTahfidzApi("/api/tahfidz/snapshot")
      .then((snapshot) => {
        if (active) applyTahfidzSnapshot(snapshot);
      })
      .catch((error: any) => {
        if (!active) return;
        setSantriList([]);
        setRosterHasMore(false);
        setRosterNextCursor("");
        setRosterStats(null);
        setDashboardFollowUps(null);
        setHalaqahList([]);
        setRecords([]);
        setRecordsHasMore(false);
        setRecordsNextCursor("");
        setRecordsOldestDate("");
        setTahfidzError(toERPUserMessage(error, "Data Tahfidz belum dapat dimuat."));
      })
      .finally(() => { if (active) setTahfidzLoading(false); });
    return () => { active = false; };
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz]);

  const [formData, setFormData] = useState<any>(createEmptyTahfidzRecordForm);
  const displaySantri = santriList;
  const selectableSantri = dashboardActionStudent && !displaySantri.some((student) => String(student.id) === String(dashboardActionStudent.id))
    ? [dashboardActionStudent, ...displaySantri]
    : displaySantri;
  const tahfidzStudentScopeKey = `${user?.tenantId || ""}:${user?.uid || ""}:${role}`;
  const displayHalaqah = halaqahList;
  const selectTahfidzStudent = (value: string, selectedStudent?: any | null) => {
    const student = selectedStudent || selectableSantri.find((item) => String(SUPABASE_TAHFIDZ_RUNTIME ? item.id : item.name) === value);
    setFormData({
      ...formData,
      santriName: student?.name || "",
      studentId: SUPABASE_TAHFIDZ_RUNTIME ? student?.id || "" : "",
      halaqahId: student?.halaqahId || "",
    });
  };
  const startNewTahfidzRecord = () => {
    setFormData(createEmptyTahfidzRecordForm());
    setTahfidzError("");
    setIsInputOpen(true);
  };

  const handleTargetSubmit = async () => {
    if (!SUPABASE_TAHFIDZ_RUNTIME) {
      setIsTargetModalOpen(false);
      return;
    }
    const targetStudentIds = [...bulkTargetStudentIds];
    if (!targetStudentIds.length && !targetForm.studentId) {
      setTargetFormError("Pilih santri sebelum menyimpan target.");
      return;
    }
    if (targetStudentIds.length > 250) {
      setTargetFormError("Pilih maksimal 250 santri dalam satu penerapan target.");
      return;
    }
    setIsSavingTarget(true);
    setTargetFormError("");
    setTahfidzError("");
    try {
      const target = {
        ...targetForm,
        periodEnd: targetForm.periodEnd || null,
        ziyadahPagesPerDay: Number(targetForm.ziyadahPagesPerDay),
        murojaahPagesPerDay: Number(targetForm.murojaahPagesPerDay),
      };
      const isBulk = targetStudentIds.length > 0;
      const requestPayload = isBulk ? { ...target, studentIds: [...targetStudentIds].sort() } : target;
      const signature = JSON.stringify({ action: isBulk ? "target-bulk" : "target", tenantId: user?.tenantId || "", userId: user?.uid || "", target: requestPayload });
      const clientRequestId = tahfidzWriteRequestId(signature);
      await requestSupabaseTahfidzApi(isBulk ? "/api/tahfidz/targets/bulk" : "/api/tahfidz/targets", {
        method: "POST",
        body: JSON.stringify({ target: { ...requestPayload, clientRequestId } }),
      });
      releaseTahfidzWriteRequestId(signature, clientRequestId);
      setIsTargetModalOpen(false);
      setDashboardActionStudent(null);
      setBulkTargetStudentIds([]);
      if (isBulk) setSelectedTargetStudentIds((current) => current.filter((id) => !targetStudentIds.includes(id)));
      try { await refreshSupabaseTahfidz(); }
      catch { setTahfidzError("Target tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang data sebelum melanjutkan."); }
    } catch (error: any) {
      const message = toERPUserMessage(error, "Target Tahfidz belum dapat disimpan.");
      setTargetFormError(message);
      setTahfidzError(message);
    } finally {
      setIsSavingTarget(false);
    }
  };

  const openHalaqahForm = (halaqah?: any) => {
    setTahfidzError("");
    setEditingHalaqah(halaqah || null);
    setHalaqahForm(halaqah ? {
      name: halaqah.name || "",
      ustadzUserId: halaqah.ustadzUserId || "",
      schedule: halaqah.schedule || "",
      room: halaqah.room || "",
      dailyTargetPages: String(halaqah.dailyTargetPages || 1),
    } : { name: "", ustadzUserId: "", schedule: "", room: "", dailyTargetPages: "1" });
    setIsHalaqahModalOpen(true);
  };

  const handleHalaqahSubmit = async () => {
    if (!SUPABASE_TAHFIDZ_RUNTIME) {
      setIsHalaqahModalOpen(false);
      return;
    }
    setIsSavingHalaqah(true);
    setTahfidzError("");
    try {
      const halaqah = {
        ...(editingHalaqah?.id ? { id: editingHalaqah.id } : {}),
        ...halaqahForm,
        dailyTargetPages: Number(halaqahForm.dailyTargetPages),
        status: "active",
      };
      const signature = JSON.stringify({ action: "halaqah", tenantId: user?.tenantId || "", userId: user?.uid || "", halaqah });
      const clientRequestId = tahfidzWriteRequestId(signature);
      await requestSupabaseTahfidzApi("/api/tahfidz/halaqahs", {
        method: "POST",
        body: JSON.stringify({ halaqah: { ...halaqah, clientRequestId } }),
      });
      releaseTahfidzWriteRequestId(signature, clientRequestId);
      setIsHalaqahModalOpen(false);
      try { await refreshSupabaseTahfidz(); }
      catch { setTahfidzError("Halaqah tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang data sebelum melanjutkan."); }
    } catch (error: any) {
      setTahfidzError(toERPUserMessage(error, "Halaqah belum dapat disimpan."));
    } finally {
      setIsSavingHalaqah(false);
    }
  };

  const handleMembershipSubmit = async () => {
    if (!SUPABASE_TAHFIDZ_RUNTIME) {
      setIsMembershipModalOpen(false);
      return;
    }
    setIsSavingMembership(true);
    setTahfidzError("");
    try {
      const membership = { ...membershipForm };
      const signature = JSON.stringify({ action: "membership", tenantId: user?.tenantId || "", userId: user?.uid || "", membership });
      const clientRequestId = tahfidzWriteRequestId(signature);
      await requestSupabaseTahfidzApi("/api/tahfidz/memberships", {
        method: "POST",
        body: JSON.stringify({ membership: { ...membership, clientRequestId } }),
      });
      releaseTahfidzWriteRequestId(signature, clientRequestId);
      setIsMembershipModalOpen(false);
      setDashboardActionStudent(null);
      try { await refreshSupabaseTahfidz(); }
      catch { setTahfidzError("Penempatan tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang data sebelum melanjutkan."); }
    } catch (error: any) {
      setTahfidzError(toERPUserMessage(error, "Penempatan halaqah belum dapat disimpan."));
    } finally {
      setIsSavingMembership(false);
    }
  };

  const handleTahfidzImport = async (apply = false) => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || !SUPABASE_TAHFIDZ_IMPORT) return;
    if (apply && !window.confirm("Impor konfigurasi halaqah dan penempatan yang sudah ada ke pesantren ini? Pastikan pratinjau telah diperiksa.")) return;
    apply ? setIsApplyingTahfidzImport(true) : setIsPreviewingTahfidzImport(true);
    setTahfidzError("");
    try {
      const report = await requestSupabaseTahfidzApi("/api/tahfidz/migration", {
        method: "POST",
        body: JSON.stringify(apply ? {
          apply: true,
          confirmation: "IMPORT_TAHFIDZ_CONFIGURATION",
          previewFingerprint: tahfidzImportPreview?.previewFingerprint,
        } : { apply: false }),
      });
      setTahfidzImportPreview(report);
      if (apply) {
        try { await refreshSupabaseTahfidz(); }
        catch { setTahfidzError("Impor selesai, tetapi data terbaru belum dapat dimuat."); }
      }
    } catch (error: any) {
      setTahfidzError(toERPUserMessage(error, "Pratinjau impor Tahfidz belum dapat diproses."));
    } finally {
      setIsPreviewingTahfidzImport(false);
      setIsApplyingTahfidzImport(false);
    }
  };

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_TAHFIDZ_RUNTIME) {
      setTahfidzError("Pencatatan setoran belum tersedia. Silakan hubungi Admin pesantren.");
      return;
    }
    const selectedSurah = surahList.find((item) => item.namaLatin === formData.surah);
    const ayatStart = Number(formData.ayatStart);
    const ayatEnd = Number(formData.ayatEnd);
    if (!selectedSurah
      || !Number.isInteger(ayatStart)
      || !Number.isInteger(ayatEnd)
      || ayatStart < 1
      || ayatEnd < ayatStart
      || ayatEnd > Number(selectedSurah.jumlahAyat)
      || String(formData.ayat || "") !== `${ayatStart}-${ayatEnd}`) {
      setTahfidzError("Pilih Surah dan rentang ayat yang tersedia.");
      return;
    }
    if (SUPABASE_TAHFIDZ_RUNTIME) {
      const student = santriList.find((item) => String(item.id) === String(formData.studentId || ""));
      if (!student || !student.halaqahId) {
        setTahfidzError("Pilih santri yang sudah ditempatkan pada halaqah aktif.");
        return;
      }
      if (!formData.fluency || !formData.tajweed) {
        setTahfidzError("Pilih nilai kelancaran dan tajwid, atau tandai sebagai belum dinilai.");
        return;
      }
      setIsSavingRecord(true);
      setTahfidzError("");
      try {
        const ayahRange = String(formData.ayat || `${formData.ayatStart || ""}-${formData.ayatEnd || ""}`).trim();
        const formSignature = JSON.stringify({
          tenantId: user?.tenantId || "",
          userId: user?.uid || "",
          studentId: student.id,
          halaqahId: student.halaqahId,
          activityType: formData.type,
          surahName: formData.surah,
          ayahRange,
          time: formData.time || "",
          timeZone,
          fluencyGrade: formData.fluency,
          tajweedGrade: formData.tajweed,
          notes: formData.notes || "",
        });
        let pending = pendingSetoranRequest.current;
        if (!pending || pending.signature !== formSignature) {
          const date = currentTenantDate();
          const time = formData.time || currentTenantTime();
          pending = {
            signature: formSignature,
            requestId: crypto.randomUUID(),
            payload: {
              studentId: student.id,
              halaqahId: student.halaqahId,
              activityType: formData.type,
              surahName: formData.surah,
              ayahRange,
              fluencyGrade: formData.fluency,
              tajweedGrade: formData.tajweed,
              notes: formData.notes || "",
              performedAt: tenantLocalDateTimeToIso(`${date}T${time}`, timeZone),
            },
          };
          pendingSetoranRequest.current = pending;
        }
        const payload = { ...pending.payload, clientRequestId: pending.requestId };
        const result = await requestSupabaseTahfidzApi("/api/tahfidz/records", {
          method: "POST",
          body: JSON.stringify({ record: payload }),
        });
        if (pendingSetoranRequest.current?.requestId === pending.requestId) pendingSetoranRequest.current = null;
        setRecords((current) => current.some((record) => String(record.id) === String(result.recordId)) ? current : [{
          id: result.recordId,
          date: currentTenantDate(pending.payload.performedAt),
          time: currentTenantTime(pending.payload.performedAt),
          santriName: student.name,
          type: formData.type,
          surah: formData.surah,
          ayat: ayahRange,
          fluency: formData.fluency || "N/A",
          tajweed: formData.tajweed || "N/A",
          notes: formData.notes || "-",
          ust: user?.name || "",
        }, ...current]);
        setSantriList((current) => current.map((item) => item.id === student.id
          ? { ...item, lastSetoran: `${formData.surah}: ${ayahRange}` }
          : item));
      } catch (error: any) {
        setTahfidzError(toERPUserMessage(error, "Setoran belum dapat disimpan."));
        return;
      } finally {
        setIsSavingRecord(false);
      }
      setFormData(createEmptyTahfidzRecordForm());
      setIsInputOpen(false);
      return;
    }

    setTahfidzError("Setoran belum dapat disimpan. Periksa koneksi lalu coba lagi.");
  };

  const santriForSearch = SUPABASE_TAHFIDZ_RUNTIME && searchQuery.trim()
    ? (searchQuery.trim() === rosterSearchTerm ? rosterSearchResults || [] : [])
    : displaySantri;
  const filteredSantri = santriForSearch.filter((s) => {
    const matchQuery = SUPABASE_TAHFIDZ_RUNTIME && searchQuery.trim()
      ? true
      : s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.nis.includes(searchQuery);
    const matchHalaqah =
      selectedHalaqahFilter === "Semua Halaqah" ||
      s.halaqah === selectedHalaqahFilter;
    return matchQuery && matchHalaqah && (!SUPABASE_TAHFIDZ_RUNTIME || Boolean(s.halaqahId));
  });

  const renderHalaqahManagement = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {isTahfidzLearner && SUPABASE_TAHFIDZ_RUNTIME ? "Halaqah Saya" : "Manajemen Halaqah"}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isTahfidzLearner && SUPABASE_TAHFIDZ_RUNTIME ? "Lihat kelompok dan pembimbing yang terkait dengan akun Anda." : "Atur pembagian halaqah, ustadz pengampu, dan daftar santri."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SUPABASE_TAHFIDZ_RUNTIME && SUPABASE_TAHFIDZ_IMPORT && canManageTahfidz && <button onClick={() => void handleTahfidzImport(false)} disabled={isPreviewingTahfidzImport || isApplyingTahfidzImport} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
            {isPreviewingTahfidzImport ? "Memindai…" : "Pratinjau Impor Data Lama"}
          </button>}
          {canManageTahfidz && <button onClick={() => openHalaqahForm()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Halaqah
          </button>}
        </div>
      </div>

      {SUPABASE_TAHFIDZ_RUNTIME && SUPABASE_TAHFIDZ_IMPORT && tahfidzImportPreview && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900 dark:text-slate-100">Pratinjau impor konfigurasi Tahfidz</h3><p className="mt-1 text-xs text-slate-500">{tahfidzImportPreview.sourceCount?.halaqahs || 0} halaqah · {tahfidzImportPreview.sourceCount?.students || 0} santri · {tahfidzImportPreview.planned?.memberships || 0} penempatan direncanakan</p></div>
            {tahfidzImportPreview.canApply && tahfidzImportPreview.dryRun && <button onClick={() => void handleTahfidzImport(true)} disabled={isApplyingTahfidzImport} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isApplyingTahfidzImport ? "Mengimpor…" : "Terapkan hasil pratinjau"}</button>}
          </div>
          {!!tahfidzImportPreview.errors?.length && <div className="text-sm text-rose-700 dark:text-rose-300">{tahfidzImportPreview.errors.map((issue: any) => <p key={`${issue.category}-${issue.id}`}>{issue.category} {issue.id}: {toERPUserMessage(issue.message, "Periksa data Tahfidz pada baris ini sebelum melanjutkan.")}</p>)}</div>}
          {!!tahfidzImportPreview.warnings?.length && <div className="text-sm text-amber-700 dark:text-amber-300">{tahfidzImportPreview.warnings.map((issue: any) => <p key={`${issue.category}-${issue.id}`}>{issue.category} {issue.id}: {toERPUserMessage(issue.message, "Tinjau kembali catatan Tahfidz pada baris ini.")}</p>)}</div>}
          {!tahfidzImportPreview.canApply && <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Selesaikan konflik, lalu jalankan pratinjau baru sebelum impor.</p>}
          {!tahfidzImportPreview.dryRun && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Impor selesai. {tahfidzImportPreview.imported?.halaqahs || 0} halaqah dan {tahfidzImportPreview.imported?.memberships || 0} penempatan diimpor.</p>}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {SUPABASE_TAHFIDZ_RUNTIME && !tahfidzLoading && displayHalaqah.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">
            Belum ada halaqah aktif pada pesantren ini. Admin dapat membuat halaqah setelah daftar ustadz aktif tersedia.
          </div>
        )}
        {displayHalaqah.map((halaqah) => {
          const halaqahSantri = displaySantri.filter(
            (s) => s.halaqah === halaqah.name,
          );
          const halaqahStudentCount = SUPABASE_TAHFIDZ_RUNTIME && Number.isFinite(Number(halaqah.studentCount))
            ? Math.max(0, Number(halaqah.studentCount))
            : halaqahSantri.length;
          const halaqahStudentPreview = halaqahSantri.slice(0, 3);
          return (
            <div
              key={halaqah.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm flex flex-col"
            >
              <div className="p-5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">
                      Halaqah {halaqah.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase">
                      Aktif
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <User className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {halaqah.ustadz}
                    </span>
                  </div>
                </div>
                {canManageTahfidz && <button onClick={() => openHalaqahForm(halaqah)} aria-label={`Ubah halaqah ${halaqah.name}`} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                  <Settings2 className="w-4 h-4" />
                </button>}
              </div>

              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-transparent">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Jadwal
                    </div>
                    <div className="font-medium text-slate-700 dark:text-slate-300">
                      {halaqah.schedule}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-transparent">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Santri
                    </div>
                    <div className="font-medium text-slate-700 dark:text-slate-300">
                      {halaqahStudentCount} Orang
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-500/20 text-sm">
                  <div className="text-xs text-emerald-600 dark:text-emerald-500 mb-1 font-semibold flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Target Halaqah
                  </div>
                  <div className="text-emerald-800 dark:text-emerald-400">
                    {halaqah.target}
                  </div>
                </div>

                <div className="flex-1 mt-2">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Daftar Santri
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHalaqahFilter(halaqah.name);
                        setActiveTab("dashboard");
                      }}
                      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Lihat Semua
                    </button>
                  </div>
                  <div className="space-y-2">
                    {halaqahStudentPreview.length > 0 ? (
                      halaqahStudentPreview.map((santri) => (
                        <div
                          key={santri.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                              {santri.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .substring(0, 2)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {santri.name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {santri.nis}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            {SUPABASE_TAHFIDZ_RUNTIME ? (santri.target ? `${santri.target.ziyadahPagesPerDay} hlm target` : "Target belum ada") : `${santri.juz} Juz`}
                          </div>
                        </div>
                      ))
                    ) : halaqahStudentCount > 0 && SUPABASE_TAHFIDZ_RUNTIME ? (
                      <div className="text-center py-4 text-sm text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                        Daftar santri halaqah dimuat bertahap. Pilih “Lihat Semua” untuk membuka daftar santri.
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                        Belum ada santri
                      </div>
                    )}
                    {halaqahStudentCount > halaqahStudentPreview.length && (
                      <div className="text-center pt-2">
                        <span className="text-xs text-slate-500">
                          +{halaqahStudentCount - halaqahStudentPreview.length} santri lainnya
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 flex gap-2">
                  {!SUPABASE_TAHFIDZ_RUNTIME && canManageTahfidz && <button
                  onClick={() => {
                    setSelectedHalaqahFilter(halaqah.name);
                    setActiveTab("dashboard");
                  }}
                  className="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Detail Halaqah
                </button>}
                {SUPABASE_TAHFIDZ_RUNTIME && canManageTahfidz && (
                  <button
                    onClick={() => {
                      setMembershipForm({ halaqahId: halaqah.id, studentId: "", startsOn: currentTenantDate() });
                      setIsMembershipModalOpen(true);
                    }}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
                  >
                    Tempatkan Santri
                  </button>
                )}
                {canRecordTahfidz && <button
                  onClick={() => {
                    setSelectedHalaqahFilter(halaqah.name);
                    setActiveTab("records");
                    if (!SUPABASE_TAHFIDZ_RUNTIME) setIsAssessmentOpen(true);
                    else startNewTahfidzRecord();
                  }}
                  className="flex-1 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                >
                  {SUPABASE_TAHFIDZ_RUNTIME ? "Buka Setoran" : "Input Setoran"}
                </button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderDashboard = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 p-4 rounded-xl">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold mb-1">
            Total Santri Tahfidz
          </p>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            1,240
          </h3>
        </div>
        <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Rata-rata Setoran/Bulan
          </p>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            12 Halaman
          </h3>
        </div>
        <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Rata-rata Mutu (Skor)
          </p>
          <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            88.5%{" "}
            <span className="text-xs font-normal text-slate-500 flex-inline items-center gap-1">
              <BookOpen className="w-3 h-3 inline" /> Jayyid Jiddan
            </span>
          </h3>
        </div>
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-4 rounded-xl">
          <p className="text-xs text-amber-600 dark:text-amber-500/70 uppercase tracking-wider font-semibold mb-1">
            Perlu Perhatian Khusus
          </p>
          <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            42 Santri
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={SUPABASE_TAHFIDZ_RUNTIME ? "Cari awalan nama/NIS…" : "Cari santri berdasar nama/NIS..."}
                    className="pl-9 pr-4 py-2 rounded-md text-sm border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500 w-full sm:w-80 bg-white dark:bg-black/40 text-slate-700 dark:text-slate-300 shadow-sm"
                  />
                </div>
                <button className="p-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 flex items-center gap-2 transition-colors shadow-sm">
                  <Filter className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">
                    Filter
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-md shadow-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Halaqah Aktif:
                </span>
                <select
                  value={selectedHalaqahFilter}
                  onChange={(e) => setSelectedHalaqahFilter(e.target.value)}
                  className="bg-transparent focus:outline-none cursor-pointer text-emerald-600 dark:text-emerald-400 font-semibold border-none outline-none"
                >
                  <option
                    value="Semua Halaqah"
                    className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200"
                  >
                    Semua Halaqah
                  </option>
                  {halaqahList.length > 0 ? (
                    halaqahList.map((h: any) => (
                      <option
                        key={h.id}
                        value={h.name}
                        className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200"
                      >
                        {h.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option
                        value="Abu Bakar"
                        className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200"
                      >
                        Abu Bakar
                      </option>
                      <option
                        value="Umar"
                        className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200"
                      >
                        Umar
                      </option>
                      <option
                        value="Utsman"
                        className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-200"
                      >
                        Utsman
                      </option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-black/40 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-4">Santri</th>
                    <th className="px-6 py-4">Halaqah</th>
                    <th className="px-6 py-4">Pencapaian Target</th>
                    <th className="px-6 py-4">Setoran Terakhir</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                  {filteredSantri.length > 0 ? (
                    filteredSantri.map((santri) => (
                      <tr
                        key={santri.id}
                        className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                              {santri.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .substring(0, 2)}
                            </div>
                            <div>
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {santri.name}
                              </div>
                              <div className="text-xs text-slate-500 font-mono tracking-tight">
                                {santri.nis} • Kelas {santri.grade}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300">
                            Ust. {santri.halaqah}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5 w-48">
                            <div className="flex justify-between text-xs font-medium">
                              <span className="text-slate-700 dark:text-slate-300">
                                Juz {santri.juz}
                              </span>
                              <span
                                className={cn(
                                  santri.progress < 50
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-slate-500 dark:text-slate-400",
                                )}
                              >
                                {santri.progress}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  santri.status === "at-risk"
                                    ? "bg-amber-400"
                                    : "bg-emerald-500",
                                )}
                                style={{ width: `${santri.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {santri.lastSetoran}
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                              Nilai: {santri.score} (Jayyid)
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {santri.status === "on-track" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 tracking-wider">
                              <CheckCircle2 className="w-3.5 h-3.5" /> On Track
                            </span>
                          )}
                          {santri.status === "at-risk" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 tracking-wider">
                              <AlertTriangle className="w-3.5 h-3.5" /> At Risk
                            </span>
                          )}
                          {santri.status === "ahead" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 tracking-wider">
                              <Sparkles className="w-3.5 h-3.5" /> Ahead Target
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsProfileOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Profil Santri"
                            >
                              <User className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsSummaryOpen(true);
                                setIsGeneratingSummary(true);
                                setTimeout(
                                  () => setIsGeneratingSummary(false),
                                  2000,
                                );
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Buat Ringkasan Kemajuan"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setFlashcardIndex(0);
                                setIsFlipped(false);
                                setIsFlashcardOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Flashcards"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                            {canCommentOnStudent && <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsCommentModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Komentar Pengajar"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>}
                            {!SUPABASE_TAHFIDZ_RUNTIME && canAssessAudio && <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsAssessmentOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Penilaian audio otomatis"
                            >
                              <Mic className="w-4 h-4" />
                            </button>}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-8 text-slate-500 dark:text-slate-400 font-medium"
                      >
                        {rosterSearchLoading ? "Mencari santri…" : "Tidak ada santri yang cocok dengan pencarian Anda."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {SUPABASE_TAHFIDZ_RUNTIME && searchQuery.trim() && rosterSearchHasMore && <div className="border-t border-slate-100 px-4 py-3 text-center dark:border-white/5"><button type="button" onClick={() => void loadMoreTahfidzSearch()} disabled={rosterSearchLoading} className="text-sm font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300">{rosterSearchLoading ? "Memuat hasil…" : "Muat hasil pencarian berikutnya"}</button></div>}
            {SUPABASE_TAHFIDZ_RUNTIME && !searchQuery.trim() && rosterHasMore && <div className="border-t border-slate-100 px-4 py-3 text-center dark:border-white/5"><button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="text-sm font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri…" : "Muat santri berikutnya"}</button></div>}

            <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-500 bg-slate-50 dark:bg-black/40 uppercase tracking-widest font-semibold">
              <div>Menampilkan 1 hingga 5 dari 1,240 santri</div>
              <div className="flex items-center gap-2 font-mono text-sm">
                <button className="px-3 py-1 rounded bg-white dark:bg-white/5 border border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50 transition-colors shadow-sm">
                  Prev
                </button>
                <span className="px-2 py-1 bg-emerald-600 text-white rounded shadow-sm">
                  1
                </span>
                <span className="px-2 py-1 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5 rounded cursor-pointer transition-colors">
                  2
                </span>
                <span className="px-2 py-1 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5 rounded cursor-pointer transition-colors">
                  3
                </span>
                <button className="px-3 py-1 rounded bg-white dark:bg-white/5 border border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-sm">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard Widget */}
        <div className="lg:col-span-1 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm sticky top-6">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  Leaderboard
                </h3>
              </div>
              <span className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-medium rounded uppercase tracking-wider">
                Bulan Ini
              </span>
            </div>

            <div className="space-y-4">
              {[...displaySantri]
                .sort((a, b) => b.id.localeCompare(a.id))
                .slice(0, 5)
                .map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 group cursor-pointer"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 transition-all",
                        i === 0
                          ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:border-amber-500/30 group-hover:scale-110"
                          : i === 1
                            ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/5 group-hover:scale-110"
                            : i === 2
                              ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-900/50 group-hover:scale-110"
                              : "bg-slate-50 text-slate-500 border-transparent dark:bg-white/5 dark:text-slate-400",
                      )}
                    >
                      {i === 0 ? <Medal className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {s.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500 truncate">
                          {s.grade}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 rounded">
                          {15 - i * 2} Hal
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <button className="w-full mt-6 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors border border-slate-200 dark:border-transparent">
              Lihat Peringkat Lengkap
            </button>
          </div>
        </div>
      </div>

      {/* Floating Quick Actions Menu */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
        {isQuickActionsOpen && (canRecordTahfidz || canManageTargets || canManageSessions) && (
          <div className="flex flex-col items-end gap-2 mb-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
            {canRecordTahfidz && <button
              onClick={() => {
                setActiveTab("records");
                startNewTahfidzRecord();
                setIsQuickActionsOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <span className="text-sm font-medium">Input Setoran Baru</span>
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
            </button>}
            {canManageTargets && <button
              onClick={() => {
                setIsTargetModalOpen(true);
                setIsQuickActionsOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <span className="text-sm font-medium">Set Target Harian</span>
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
            </button>}
            {canManageSessions && <button
              onClick={() => {
                setActiveTab("exams");
                setIsExamModalOpen(true);
                setIsQuickActionsOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <span className="text-sm font-medium">Jadwalkan Munaqasyah</span>
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
            </button>}
            <button
              onClick={() => {
                setActiveTab("records");
                setIsQuickActionsOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <span className="text-sm font-medium">Lihat Kehadiran</span>
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}
        {(canRecordTahfidz || canManageTargets || canManageSessions) && <button
          onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-600/30 transition-all duration-300 ${isQuickActionsOpen ? "bg-slate-800 rotate-45" : "bg-emerald-600 hover:bg-emerald-500 hover:scale-105"}`}
        >
          <Plus className="w-6 h-6" />
        </button>}
      </div>
    </>
  );

  const renderSupabaseDashboard = () => {
    const currentLeaderboard = isTahfidzViewScopeCurrent(leaderboardScope, currentLeaderboardScopeKey)
      ? leaderboa…46212 tokens truncated…v className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Automated Progress Summary
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedSantri.name} • {selectedSantri.nis}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSummaryOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar min-h-[300px] relative">
              {isGeneratingSummary ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm z-10 w-full h-full">
                  <div className="mb-4 relative">
                    <div className="w-12 h-12 rounded-full border-4 border-emerald-200 dark:border-emerald-900/50"></div>
                    <div className="w-12 h-12 rounded-full border-4 border-emerald-600 dark:border-emerald-400 border-t-transparent animate-spin absolute top-0 left-0"></div>
                  </div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 animate-pulse">
                    Menghasilkan Laporan AI secara otomatis...
                  </p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-5">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                        Laporan Evaluasi Progres Menghafal
                      </h4>
                      <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded">
                        November 2026
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 mt-4">
                          1. Pencapaian Kuantitatif
                        </h5>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          Alhamdulillah, ananda{" "}
                          <span className="font-bold">
                            {selectedSantri.name}
                          </span>{" "}
                          telah menyelesaikan target ziyadah bulan ini dengan
                          konsistensi{" "}
                          <strong>{selectedSantri.progress}%</strong>. Hafalan
                          terakhir tercatat pada{" "}
                          <strong>{selectedSantri.lastSetoran}</strong>. Target
                          pencapaian akhir tahun berada pada kondisi{" "}
                          <strong>
                            {selectedSantri.status === "ahead"
                              ? "jauh di atas rata-rata"
                              : selectedSantri.status === "on-track"
                                ? "sesuai perencanaan"
                                : "membutuhkan akselerasi"}
                          </strong>
                          .
                        </p>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 mt-4">
                          2. Evaluasi Kualitatif (Mutu Hafalan)
                        </h5>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          Secara umum, kelancaran hafalan (Fashahah) ada di
                          tingkat <strong>Ghayatut Tasmi'</strong> (Sangat
                          Lancar) dengan nilai Mutu rata-rata{" "}
                          <strong>{selectedSantri.score}</strong>. Aplikasi
                          tajwid sudah sangat presisi, namun AI mendeteksi
                          diperlukannya sedikit lebih fokus pada hukum bacaan{" "}
                          <em>Mad Wajib Muttasil</em> ketika membaca tempo
                          cepat.
                        </p>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 mt-4">
                          3. Rekomendasi Selanjutnya
                        </h5>
                        <ul className="list-disc list-outside ml-4 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                          <li>
                            Pertahankan volume setoran ziyadah harian sebanyak 1
                            halaman per hari.
                          </li>
                          <li>
                            Tingkatkan volume murojaah menjadi ½ Juz per hari
                            menjelang Munaqasyah akhir semester.
                          </li>
                          <li>
                            Gunakan fitur "Smart Flashcards" untuk memperkuat
                            ingatan pada bagian ayat yang serupa (Mutasyabihat).
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-between gap-3">
              <button
                onClick={() => {
                  setIsGeneratingSummary(true);
                  setTimeout(() => setIsGeneratingSummary(false), 2000);
                }}
                disabled={isGeneratingSummary}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Generate Ulang
              </button>
              <div className="flex gap-2">
                <button
                  disabled={isGeneratingSummary}
                  className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 flex items-center gap-2 disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" /> Share
                </button>
                <button
                  disabled={isGeneratingSummary}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" /> Cetak PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Planner Modal */}
      {isAiPlannerOpen && canManageTargets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    AI Memorization Planner
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rekomendasi target hafalan cerdas berdasarkan progres santri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAiPlannerOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 flex gap-4">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg h-fit text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                    Analisis Progres Selesai
                  </h4>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    AI telah menganalisis riwayat setoran, kelancaran tajwid,
                    dan konsistensi 1,240 santri. Berikut adalah rekomendasi
                    target personalisasi untuk minggu ini.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {[
                  {
                    name: "Ahmad Faiz",
                    nis: "2023.01.001",
                    rec: "Ziyadah: 1 Hal/Hari | Murojaah: ½ Juz/Hari",
                    reason: "Konsistensi tinggi (85%). Kapasitas memori cepat.",
                    status: "naik",
                  },
                  {
                    name: "Budi Santoso",
                    nis: "2023.01.002",
                    rec: "Ziyadah: ½ Hal/Hari | Murojaah: 1 Juz/Hari",
                    reason:
                      "Nilai kelancaran 70%. Perlu fokus perbanyak murojaah.",
                    status: "fokus",
                  },
                  {
                    name: "Siti Aminah",
                    nis: "2023.01.003",
                    rec: "Ziyadah: 2 Hal/Hari | Murojaah: ¼ Juz/Hari",
                    reason:
                      "Tajwid Mumtaz (A+). Ritme ideal untuk ngebut Ziyadah.",
                    status: "cepat",
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 shrink-0">
                          {s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {s.name}
                          </div>
                          <div className="text-xs text-slate-500">{s.nis}</div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider",
                          s.status === "naik"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : s.status === "fokus"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                        )}
                      >
                        {s.status === "naik"
                          ? "Naikkan Target"
                          : s.status === "fokus"
                            ? "Fokus Muroja'ah"
                            : "Akselerasi"}
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-black/40 p-3 rounded-lg border border-slate-200 dark:border-white/5 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Rekomendasi AI:
                        </span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {s.rec}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-500">
                        <BrainCircuit className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>{s.reason}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsAiPlannerOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => setIsAiPlannerOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Validasi Pelaksanaan target & Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Setoran Modal */}
      {isInputOpen && canRecordTahfidz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-500/30">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
                    Input Setoran Hafalan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Log harian ziyadah dan muroja'ah santri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInputOpen(false)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleInputSubmit}
              className="p-6 overflow-y-auto space-y-5 bg-white dark:bg-slate-900"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Pilih Santri ({selectedHalaqahFilter})
                  </label>
                  {SUPABASE_TAHFIDZ_RUNTIME ? <TahfidzStudentSearchSelect
                    key={tahfidzStudentScopeKey}
                    scopeKey={tahfidzStudentScopeKey}
                    searchStudents={searchSupabaseTahfidzRoster}
                    initialStudents={selectableSantri}
                    selectedStudentId={formData.studentId || ""}
                    selectedStudent={selectableSantri.find((student) => String(student.id) === String(formData.studentId || "")) || null}
                    onSelect={(student) => selectTahfidzStudent(String(student?.id || ""), student)}
                    filterStudent={(student) => Boolean(student.halaqahId) && (selectedHalaqahFilter === "Semua Halaqah" || student.halaqah === selectedHalaqahFilter)}
                  /> : <select
                    required
                    value={formData.santriName || ""}
                    onChange={(e) => selectTahfidzStudent(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    <option value="">-- Pilih Santri --</option>
                    {filteredSantri.map((s) => <option key={s.id} value={s.name}>{s.name} - {s.nis}</option>)}
                  </select>}
                  {SUPABASE_TAHFIDZ_RUNTIME && searchQuery.trim() && rosterSearchHasMore && <button type="button" onClick={() => void loadMoreTahfidzSearch()} disabled={rosterSearchLoading} className="mt-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300">{rosterSearchLoading ? "Memuat hasil…" : "Muat hasil pencarian berikutnya"}</button>}
                  {SUPABASE_TAHFIDZ_RUNTIME && !searchQuery.trim() && rosterHasMore && <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="mt-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri…" : "Santri belum terlihat? Muat halaman berikutnya"}</button>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Tipe Setoran
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="Ziyadah">Ziyadah (Hafalan Baru)</option>
                      <option value="Muroja'ah">Muroja'ah Sabqi/Manzil</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Waktu
                    </label>
                    <input
                      type="time"
                      value={formData.time || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, time: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-4 sm:col-span-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Juz
                    </label>
                    <select
                      value={formData.juz || ""}
                      onChange={(e) => {
                        const juzNum = e.target.value ? parseInt(e.target.value, 10) : "";
                        setFormData({
                          ...formData,
                          juz: juzNum,
                          surah: "",
                          ayatStart: "",
                          ayatEnd: "",
                          ayat: "",
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">-- Juz --</option>
                      {Array.from({ length: 30 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Juz {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Surah
                    </label>
                    <select
                      required
                      value={formData.surah || ""}
                      disabled={!SUPABASE_TAHFIDZ_RUNTIME || isSurahListLoading || Boolean(surahListError) || !surahList.length || isSavingRecord}
                      onChange={(e) => {
                        const surahVal = e.target.value;
                        const surah = surahList.find(
                          (s) => s.namaLatin === surahVal,
                        );
                        if (!surahVal) {
                          setFormData({
                            ...formData,
                            surah: "",
                            surahNomor: null,
                            ayatCount: null,
                            ayatStart: "",
                            ayatEnd: "",
                            ayat: "",
                          });
                          return;
                        }
                        if (surah) {
                          // Find juz if not selected or if current juz doesn't match this surah
                          let newJuz = formData.juz;
                          const currentJuzMap = formData.juz
                            ? JUZ_MAPPING.find((j) => j.juz === formData.juz)
                            : null;
                          if (
                            !currentJuzMap ||
                            surah.nomor < currentJuzMap.start.surah ||
                            surah.nomor > currentJuzMap.end.surah
                          ) {
                            const matchingJuz = JUZ_MAPPING.find(
                              (j) =>
                                surah.nomor >= j.start.surah &&
                                surah.nomor <= j.end.surah,
                            );
                            if (matchingJuz) newJuz = matchingJuz.juz;
                          }
                          setFormData({
                            ...formData,
                            juz: newJuz,
                            surah: surahVal,
                            ayatCount: surah.jumlahAyat,
                            surahNomor: surah.nomor,
                            ayatStart: "",
                            ayatEnd: "",
                            ayat: "",
                          });
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">{isSurahListLoading ? "Memuat Surah…" : surahListError ? "Katalog Surah tidak tersedia" : "Pilih Surah"}</option>
                      {(() => {
                        let availableSurahs = surahList;
                        if (formData.juz) {
                          const juzMap = JUZ_MAPPING.find(
                            (j) => j.juz === formData.juz,
                          );
                          if (juzMap) {
                            availableSurahs = surahList.filter(
                              (s) =>
                                s.nomor >= juzMap.start.surah &&
                                s.nomor <= juzMap.end.surah,
                            );
                          }
                        }
                        return availableSurahs.map((s: any) => (
                          <option key={s.nomor} value={s.namaLatin}>
                            {s.nomor}. {s.namaLatin}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Dari Ayat
                    </label>
                    <select
                      required
                      value={formData.ayatStart || ""}
                      disabled={!SUPABASE_TAHFIDZ_RUNTIME || !formData.surah || isSurahListLoading || Boolean(surahListError) || isSavingRecord}
                      onChange={(e) => {
                        const startValue = e.target.value;
                        if (!startValue) {
                          setFormData({ ...formData, ayatStart: "", ayatEnd: "", ayat: "" });
                          return;
                        }
                        const startAyat = parseInt(startValue, 10);
                        let newJuz = formData.juz;
                        if (formData.surahNomor) {
                          const matchingJuz = JUZ_MAPPING.find((j) => {
                            if (
                              formData.surahNomor > j.start.surah &&
                              formData.surahNomor < j.end.surah
                            )
                              return true;
                            if (
                              formData.surahNomor === j.start.surah &&
                              formData.surahNomor === j.end.surah
                            )
                              return (
                                startAyat >= j.start.ayat &&
                                startAyat <= j.end.ayat
                              );
                            if (formData.surahNomor === j.start.surah)
                              return startAyat >= j.start.ayat;
                            if (formData.surahNomor === j.end.surah)
                              return startAyat <= j.end.ayat;
                            return false;
                          });
                          if (matchingJuz) newJuz = matchingJuz.juz;
                        }
                        setFormData({
                          ...formData,
                          juz: newJuz,
                          ayatStart: startValue,
                          ayatEnd: formData.ayatEnd && Number(formData.ayatEnd) >= startAyat ? formData.ayatEnd : startValue,
                          ayat: `${startValue}-${formData.ayatEnd && Number(formData.ayatEnd) >= startAyat ? formData.ayatEnd : startValue}`,
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">-- Mulai --</option>
                      {(() => {
                        if (!formData.surah || !Number(formData.ayatCount)) return null;
                        let start = 1;
                        let end = formData.ayatCount || 286;
                        if (formData.juz && formData.surahNomor) {
                          const juzMap = JUZ_MAPPING.find(
                            (j) => j.juz === formData.juz,
                          );
                          if (juzMap) {
                            if (formData.surahNomor === juzMap.start.surah)
                              start = Math.max(1, juzMap.start.ayat);
                            if (formData.surahNomor === juzMap.end.surah)
                              end = Math.min(end, juzMap.end.ayat);
                          }
                        }
                        return Array.from(
                          { length: end - start + 1 },
                          (_, i) => (
                            <option key={start + i} value={start + i}>
                              {start + i}
                            </option>
                          ),
                        );
                      })()}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Sampai Ayat
                    </label>
                    <select
                      required
                      value={formData.ayatEnd || ""}
                      disabled={!SUPABASE_TAHFIDZ_RUNTIME || !formData.surah || !formData.ayatStart || isSurahListLoading || Boolean(surahListError) || isSavingRecord}
                      onChange={(e) => {
                        const endValue = e.target.value;
                        setFormData({
                          ...formData,
                          ayatEnd: endValue,
                          ayat: formData.ayatStart && endValue ? `${formData.ayatStart}-${endValue}` : "",
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">-- Selesai --</option>
                      {(() => {
                        if (!formData.surah || !Number(formData.ayatCount)) return null;
                        let start = formData.ayatStart
                          ? parseInt(formData.ayatStart)
                          : 1;
                        let end = formData.ayatCount || 286;
                        if (formData.juz && formData.surahNomor) {
                          const juzMap = JUZ_MAPPING.find(
                            (j) => j.juz === formData.juz,
                          );
                          if (juzMap) {
                            if (formData.surahNomor === juzMap.start.surah)
                              start = Math.max(start, juzMap.start.ayat);
                            if (formData.surahNomor === juzMap.end.surah)
                              end = Math.min(end, juzMap.end.ayat);
                          }
                        }
                        return Array.from(
                          { length: end - start + 1 },
                          (_, i) => (
                            <option key={start + i} value={start + i}>
                              {start + i}
                            </option>
                          ),
                        );
                      })()}
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-white/[0.02] p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2">
                    Penilaian
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Kelancaran (Hifzh)
                      </label>
                      <select
                        required={SUPABASE_TAHFIDZ_RUNTIME}
                        value={formData.fluency}
                        onChange={(e) =>
                          setFormData({ ...formData, fluency: e.target.value })
                        }
                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        {SUPABASE_TAHFIDZ_RUNTIME && <option value="">Pilih nilai kelancaran</option>}
                        <option value="A+">A+ (Mumtaz/Sangat Lancar)</option>
                        <option value="A">A (Jayyid Jiddan/Lancar)</option>
                        <option value="B">B (Jayyid/Cukup Lancar)</option>
                        <option value="C">C (Maqbul/Banyak Salah)</option>
                        <option value="D">D (Rasib/Mengulang)</option>
                        {SUPABASE_TAHFIDZ_RUNTIME && <option value="N/A">Belum dinilai</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Tajwid & Makhraj
                      </label>
                      <select
                        required={SUPABASE_TAHFIDZ_RUNTIME}
                        value={formData.tajweed}
                        onChange={(e) =>
                          setFormData({ ...formData, tajweed: e.target.value })
                        }
                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        {SUPABASE_TAHFIDZ_RUNTIME && <option value="">Pilih nilai tajwid</option>}
                        <option value="A+">A+ (Sangat Baik)</option>
                        <option value="A">A (Baik)</option>
                        <option value="B">B (Cukup)</option>
                        <option value="C">C (Kurang)</option>
                        {SUPABASE_TAHFIDZ_RUNTIME && <><option value="D">D (Perlu Mengulang)</option><option value="N/A">Belum dinilai</option></>}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Catatan Musyrif (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Catatan untuk santri atau wali santri..."
                    value={formData.notes || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setIsInputOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!SUPABASE_TAHFIDZ_RUNTIME || isSurahListLoading || Boolean(surahListError) || !formData.surah || !formData.ayatStart || !formData.ayatEnd || isSavingRecord}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
                >
                  Simpan Setoran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Assessment Modal */}
      {!SUPABASE_TAHFIDZ_RUNTIME && canAssessAudio && isAssessmentOpen && selectedSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-500/30">
                  {selectedSantri.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                    Penilaian audio otomatis
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedSantri.name} • {selectedSantri.nis}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAssessmentOpen(false)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-white dark:bg-slate-900">
              <div className="flex gap-6 flex-col md:flex-row">
                {/* Left Column: Recording */}
                <div className="w-full md:w-1/3 flex flex-col gap-4">
                  <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                    <button
                      onClick={() => setIsRecording(!isRecording)}
                      className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all duration-300 shadow-[0_0_30px_rgba(0,0,0,0.1)] dark:shadow-[0_0_30px_rgba(0,0,0,0.5)]",
                        isRecording
                          ? "bg-red-50 dark:bg-red-500/20 text-red-500 border border-red-200 dark:border-red-500/50 animate-pulse"
                          : "bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105",
                      )}
                    >
                      <Mic
                        className={cn(
                          "w-8 h-8",
                          isRecording && "animate-bounce",
                        )}
                      />
                    </button>
                    <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">
                      {isRecording ? "Mendengarkan..." : "Mulai Rekam"}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Rekam setoran langsung dari mic
                    </p>

                    {isRecording && (
                      <div className="w-full h-12 mt-6 opacity-60">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={mockAudioData}>
                            <Area
                              type="monotone"
                              dataKey="amplitude"
                              stroke="#10b981"
                              fill="#10b981"
                              fillOpacity={0.2}
                              isAnimationActive={true}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-xl relative overflow-hidden">
                    <Sparkles className="w-16 h-16 text-emerald-500/10 absolute -top-4 -right-4" />
                    <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2 relative z-10">
                      AI Real-time Scoring
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 relative z-10">
                      AI mengevaluasi Tajwid, Makhraj, dan Kelancaran secara
                      otomatis.
                    </p>
                    <select className="w-full bg-white dark:bg-[#0a0a0a] rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500 relative z-10 block mb-2">
                      <option>Pilih Surah...</option>
                      <option>Al-Baqarah</option>
                      <option>Ali 'Imran</option>
                      <option>Al-Mulk</option>
                    </select>
                  </div>
                </div>

                {/* Right Column: Results */}
                <div className="w-full md:w-2/3 flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent p-4 rounded-xl text-center flex flex-col justify-center shadow-sm">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">
                        Tajwid
                      </span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                        {isRecording ? "85" : "--"}
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent p-4 rounded-xl text-center flex flex-col justify-center shadow-sm">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">
                        Makhraj
                      </span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                        {isRecording ? "92" : "--"}
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent p-4 rounded-xl text-center flex flex-col justify-center shadow-sm">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">
                        Kelancaran
                      </span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                        {isRecording ? "88" : "--"}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col shadow-sm">
                    <h4 className="text-sm font-medium text-slate-800 dark:text-slate-300 border-b border-slate-200 dark:border-white/10 pb-2 mb-4">
                      Transkripsi & Deteksi Kesalahan
                    </h4>
                    <div className="flex-1 text-slate-500 text-sm italic">
                      {!isRecording ? (
                        <div className="flex items-center justify-center h-full text-center">
                          Rekam audio untuk melihat transkripsi otomatis...
                        </div>
                      ) : (
                        <div className="text-slate-700 dark:text-slate-300 not-italic leading-relaxed">
                          ... bismillahirrahmanirrahim. Tabaarakalladhii
                          biyadihil mulku wa huwa 'alaa{" "}
                          <span className="p-1 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded underline decoration-red-400 decoration-wavy">
                            kulli syai-in qadiir
                          </span>
                          ...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      onClick={() => setIsAssessmentOpen(false)}
                      className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium transition-colors"
                    >
                      Batal
                    </button>
                    <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors opacity-50 cursor-not-allowed shadow-sm">
                      Simpan Otomatis ke Log
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Exam Scheduling Modal */}
      {isExamModalOpen && canManageSessions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Jadwalkan Ujian Baru
                  </h3>
                  <p className="text-xs text-slate-500">
                    Munaqasyah atau Ujian Semester
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExamModalOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Santri
                </label>
                <select className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white">
                  <option>Pilih Santri...</option>
                  <option>Muhammad Ali (Selesai 5 Juz)</option>
                  <option>Ibrahim Pasha (Selesai 30 Juz)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori Ujian
                </label>
                <select className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white">
                  <option>Munaqasyah 5 Juz</option>
                  <option>Munaqasyah 10 Juz</option>
                  <option>Khotmil Qur'an 30 Juz</option>
                  <option>Pra-Munaqasyah</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Waktu
                  </label>
                  <input
                    type="time"
                    className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Penguji (Musyrif Gabungan)
                </label>
                <select className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white">
                  <option>Ust. Tarmudzi</option>
                  <option>Syekh Abdullah</option>
                  <option>Ust. Ahmad S.</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsExamModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => setIsExamModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Buat Jadwal Ujian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Exam Action Modal */}
      {isExamActive && canManageSessions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10 max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Award className="w-5 h-5 flex-shrink-0" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Sidang Munaqasyah 5 Juz
                  </h3>
                  <p className="text-xs text-slate-500">
                    Muhammad Ali • Munaqasyah Menengah
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExamActive(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent rounded-xl p-4 text-center">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Tajwid
                  </div>
                  <input
                    type="number"
                    defaultValue="85"
                    className="w-16 bg-transparent text-center font-bold text-2xl border-b border-slate-300 dark:border-white/20 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent rounded-xl p-4 text-center">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Makhraj
                  </div>
                  <input
                    type="number"
                    defaultValue="90"
                    className="w-16 bg-transparent text-center font-bold text-2xl border-b border-slate-300 dark:border-white/20 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-transparent rounded-xl p-4 text-center">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Kelancaran
                  </div>
                  <input
                    type="number"
                    defaultValue="92"
                    className="w-16 bg-transparent text-center font-bold text-2xl border-b border-slate-300 dark:border-white/20 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Soal Sambung Ayat (Generate AI)
                </label>
                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 rounded-lg p-4 mb-3">
                  <p
                    className="text-sm font-arabic font-medium mb-2 text-right"
                    dir="rtl"
                  >
                    ...الَّذِي خَلَقَ سَبْعَ سَمَاوَاتٍ طِبَاقًا...
                  </p>
                  <div className="flex gap-2 items-center text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <button className="flex items-center gap-1 hover:underline">
                      <RotateCcw className="w-3 h-3" /> Ganti Soal
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center bg-slate-50 dark:bg-black/20 rounded-lg p-2 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-500 ml-2">
                    Skor Soal 1
                  </span>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((s) => (
                      <button
                        key={s}
                        className="w-8 h-8 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:border-emerald-500 hover:text-emerald-600 focus:border-emerald-500 focus:bg-emerald-50 dark:focus:bg-emerald-900/40 text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Penguji
                </label>
                <textarea
                  rows={3}
                  placeholder="Tuliskan evaluasi..."
                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:text-white resize-none"
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsExamActive(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setIsExamActive(false);
                  setIsMilestoneModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Selesaikan Ujian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {selectedCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 dark:bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10 max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Printer className="w-5 h-5 flex-shrink-0" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Sertifikat Kelulusan Munaqasyah
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pratinjau Dokumen Sertifikat
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCertificate(null)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-8 overflow-auto custom-scrollbar flex-1 bg-slate-100 dark:bg-black/60 flex justify-center items-start">
              {/* Certificate Canvas */}
              <div
                id="certificate-print-area"
                className="w-[800px] h-[565px] bg-white text-slate-800 shadow-xl relative overflow-hidden flex flex-col border-[12px] border-double border-emerald-800/80 p-8 font-serif shrink-0"
              >
                <div className="absolute top-0 left-0 w-32 h-32 border-b-[8px] border-r-[8px] border-emerald-800/20 rounded-br-full"></div>
                <div className="absolute top-0 right-0 w-32 h-32 border-b-[8px] border-l-[8px] border-emerald-800/20 rounded-bl-full"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 border-t-[8px] border-r-[8px] border-emerald-800/20 rounded-tr-full"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 border-t-[8px] border-l-[8px] border-emerald-800/20 rounded-tl-full"></div>

                <div className="text-center z-10 flex flex-col h-full relative">
                  <div className="flex justify-center items-center gap-6 mb-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-2xl shadow-md border-2 border-emerald-600">
                      AI
                    </div>
                    <div className="text-center">
                      <h1 className="text-2xl font-bold tracking-wider text-emerald-900">
                        PESANTREN AI STUDIO
                      </h1>
                      <p className="text-sm font-medium tracking-widest text-emerald-700">
                        LEMBAGA TAHFIDZ AL-QUR'AN
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-800 flex items-center justify-center font-bold text-emerald-800 bg-white">
                      LTQ
                    </div>
                  </div>

                  <div className="text-center my-6 space-y-2">
                    <h2 className="text-4xl font-extrabold text-emerald-900 tracking-wider">
                      SERTIFIKAT
                    </h2>
                    <p className="text-lg font-semibold text-emerald-700 tracking-[0.2em] uppercase">
                      SYAHADAH TAHFIDZ AL-QUR'AN
                    </p>
                    <p className="text-xs text-slate-500 font-mono">
                      NO: STQ/2023/{selectedCertificate.id}
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col justify-center space-y-6">
                    <p className="text-slate-600 text-sm">
                      Dengan memohon ridho Allah SWT, pimpinan Pesantren AI
                      Studio menerangkan bahwa:
                    </p>
                    <h3 className="text-3xl font-bold text-emerald-800 decoration-emerald-800/30 underline underline-offset-8">
                      {selectedCertificate.name}
                    </h3>
                    <p className="text-slate-600 text-sm">
                      Nomor Induk Santri:{" "}
                      <span className="font-semibold text-slate-800">
                        {selectedCertificate.id}
                      </span>
                    </p>

                    <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
                      Telah menyelesaikan Ujian Tahfidz (Munaqasyah) dengan
                      predikat{" "}
                      <strong className="text-emerald-700">
                        {selectedCertificate.score}
                      </strong>{" "}
                      pada kategori{" "}
                      <strong className="text-slate-800">
                        {selectedCertificate.category}
                      </strong>
                      . Semoga hafalan Al-Qur'an ini menjadi syafaat di hari
                      kiamat dan menjadi mahkota kehormatan bagi kedua orang
                      tuanya.
                    </p>
                  </div>

                  <div className="flex justify-between items-end px-12 mt-8">
                    <div className="text-center">
                      <p className="text-sm text-slate-500 mb-16">
                        Pimpinan Pesantren
                      </p>
                      <p className="font-bold border-b border-slate-800 px-4 inline-block">
                        {selectedCertificate.headmaster}
                      </p>
                    </div>
                    <div className="w-24 h-24 rounded-full border-[4px] border-emerald-800/40 flex items-center justify-center rotate-[-15deg] opacity-80">
                      <div className="w-20 h-20 rounded-full border-2 border-emerald-800/60 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-emerald-800">
                          LULUS
                        </span>
                        <span className="text-xs font-bold text-emerald-800 border-t border-emerald-800/30 mt-1 pt-1">
                          MUNAQASYAH
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-slate-500 mb-16">
                        Direktur Tahfidz
                      </p>
                      <p className="font-bold border-b border-slate-800 px-4 inline-block">
                        {selectedCertificate.headOfTahfidz}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setSelectedCertificate(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                Tutup
              </button>
              <button
                onClick={async () => {
                  try {
                    const certElement = document.getElementById(
                      "certificate-print-area",
                    );
                    if (!certElement) return;

                    const html2canvas = (await import("html2canvas")).default;
                    const { jsPDF } = await import("jspdf");

                    const canvas = await html2canvas(certElement, {
                      scale: 2,
                      useCORS: true,
                      backgroundColor: "#ffffff",
                    });

                    const imgData = canvas.toDataURL("image/png");

                    const pdf = new jsPDF({
                      orientation: "landscape",
                      unit: "px",
                      format: [800, 565],
                    });

                    pdf.addImage(imgData, "PNG", 0, 0, 800, 565);
                    pdf.save(
                      `Sertifikat_${selectedCertificate?.name.replace(/\s+/g, "_")}.pdf`,
                    );
                  } catch (error) {
                    console.error("Error generating PDF", error);
                    alert("Gagal membuat PDF.");
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm flex items-center gap-2"
              >
                <Printer className="w-4 h-4" /> Cetak PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gamified Milestone Modal */}
      {isMilestoneModalOpen && canManageSessions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/80 dark:bg-black/90 animate-in fade-in duration-500">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center p-8 border border-amber-200 dark:border-amber-500/20 transform animate-in zoom-in-95 slide-in-from-bottom-8 duration-700">
            {/* Confetti / Burst effect background */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30 dark:opacity-20">
              <div className="w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-400 via-amber-200/20 to-transparent rounded-full animate-pulse blur-3xl"></div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setIsMilestoneModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon / Badge */}
            <div className="relative z-10 mb-6 group">
              <div
                className="w-32 h-32 rounded-full border-8 border-amber-100 dark:border-amber-900/50 flex items-center justify-center bg-gradient-to-br from-amber-300 to-amber-500 shadow-inner overflow-hidden animate-bounce"
                style={{ animationDuration: "2s" }}
              >
                <Trophy className="w-16 h-16 text-white drop-shadow-md" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center font-bold text-sm shadow-sm scale-110">
                +50
              </div>
            </div>

            {/* Texts */}
            <div className="relative z-10 text-center space-y-2 mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                Alhamdulillah!
              </h2>
              <h3 className="text-xl font-medium text-amber-600 dark:text-amber-400">
                Khatam 5 Juz
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                Ananda Muhammad Ali telah berhasil menyelesaikan sidang
                munaqasyah 5 Juz dengan capaian Mumtaz.
              </p>
            </div>

            {/* Stats / Rewards */}
            <div className="w-full bg-slate-50 dark:bg-black/40 rounded-2xl p-4 flex gap-4 divide-x divide-slate-200 dark:divide-slate-800 relative z-10">
              <div className="flex-1 text-center">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                  XP Points
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                  <Sparkles className="w-4 h-4" /> 500
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                  Badge Baru
                </div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                  <Medal className="w-5 h-5" /> Gold
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full mt-8 flex flex-col sm:flex-row gap-3 relative z-10">
              <button className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-amber-500 dark:border-amber-600 text-amber-600 dark:text-amber-500 rounded-xl font-bold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center justify-center gap-2">
                <Share2 className="w-5 h-5" /> Bagikan Pencapaian
              </button>
              <button
                onClick={() => setIsMilestoneModalOpen(false)}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-amber-500/30 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" /> Unduh Sertifikat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Peer Review Modal */}
      {isPeerReviewOpen && selectedReview && (canSubmitPeerReview || canModeratePeerReview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                  <Headphones className="w-5 h-5 flex-shrink-0" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Review: {selectedReview.surah}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Oleh: {selectedReview.studentName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPeerReviewOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Player */}
              <div className="bg-slate-50 dark:bg-black/40 rounded-xl p-4 border border-slate-200 dark:border-white/5 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <button className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white shadow-md hover:bg-purple-700 transition flex-shrink-0">
                    <Play className="w-5 h-5 ml-1" />
                  </button>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-2">
                      <span>0:00</span>
                      <span>{selectedReview.duration}</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-purple-500 h-full w-0"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback guidelines */}
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-500 flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4" /> Panduan Review
                </h4>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc ml-4">
                  <li>
                    Fokus pada makharijul huruf dan tajwid (Mad, Ghunnah, dll).
                  </li>
                  <li>
                    Sampaikan masukan dengan bahasa yang santun dan memotivasi.
                  </li>
                  <li>Berikan pujian pada bagian bacaan yang sudah bagus.</li>
                </ul>
              </div>

              {/* Feedback Form */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                  <span>Komentar & Masukan Anda</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Tulis masukan tentang tajwid, makhraj, atau kelancaran..."
                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:text-white resize-none"
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsPeerReviewOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Tutup
              </button>
              <button
                onClick={() => setIsPeerReviewOpen(false)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4" /> Kirim Review & Dapatkan XP
              </button>
            </div>
          </div>
        </div>
      )}

      {isPrintPlanOpen && canManageTargets && SUPABASE_TAHFIDZ_RUNTIME && printPlanStudent && printPlanScopeKey === currentPrintPlanScopeKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 print:static print:block print:bg-white print:p-0" role="dialog" aria-modal="true" aria-labelledby="tahfidz-print-plan-title">
          <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10 print:hidden">
              <div><h2 id="tahfidz-print-plan-title" className="font-semibold">Rencana Target Hafalan</h2><p className="mt-1 text-sm text-slate-500">Dicetak dari catatan Tahfidz pesantren ini.</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"><Printer className="h-4 w-4" />Cetak</button><button type="button" onClick={() => { setIsPrintPlanOpen(false); setPrintPlanStudentId(""); setPrintPlanScopeKey(""); }} aria-label="Tutup rencana hafalan" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><X className="h-4 w-4" /></button></div>
            </header>
            <div className="overflow-y-auto p-6 print:overflow-visible print:p-0">
              <article className="mx-auto max-w-2xl space-y-6 print:max-w-none">
                <div className="border-b-2 border-slate-800 pb-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Tahfidz · Rencana Individu</p><h1 className="mt-2 text-2xl font-bold">Rencana Target Hafalan</h1><p className="mt-1 text-sm text-slate-500">Tanggal cetak {new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone }).format(new Date())}</p></div>
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold uppercase text-slate-500">Nama santri</dt><dd className="mt-1 font-medium">{printPlanStudent.name || "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-500">NIS</dt><dd className="mt-1 font-medium">{printPlanStudent.nis || "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-500">Kelas</dt><dd className="mt-1 font-medium">{printPlanStudent.grade || "Belum diatur"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-slate-500">Halaqah</dt><dd className="mt-1 font-medium">{printPlanStudent.halaqah || "Belum ditempatkan"}</dd></div>
                </dl>
                <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10 print:rounded-none">
                  <h2 className="font-semibold">Target harian aktif</h2>
                  {printPlanStudent.target ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Ziyadah</p><p className="mt-1 font-medium">{printPlanStudent.target.ziyadahPagesPerDay} halaman per hari</p></div><div><p className="text-xs text-slate-500">Muroja'ah</p><p className="mt-1 font-medium">{printPlanStudent.target.murojaahPagesPerDay} halaman per hari</p></div><div><p className="text-xs text-slate-500">Periode</p><p className="mt-1 font-medium">{printPlanStudent.target.periodStart} – {printPlanStudent.target.periodEnd || "seterusnya"}</p></div><div><p className="text-xs text-slate-500">Kebijakan</p><p className="mt-1 font-medium">{printPlanStudent.target.policy === "strict" ? "Ketat" : "Standar"}</p></div></div> : <p className="mt-2 text-sm text-slate-500">Belum ada target aktif yang tercatat untuk santri ini.</p>}
                </section>
                <section>
                  <h2 className="font-semibold">Setoran terbaru yang termuat</h2>
                  {printPlanRecords.length ? (
                    <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">
                      {printPlanRecords.map((record) => (
                        <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                          <span>{record.date} · {record.type} · QS. {record.surah}, ayat {record.ayat}</span>
                          <span className="text-xs text-slate-500">
                            Kelancaran {record.fluency === "N/A" ? "Belum dinilai" : record.fluency} · Tajwid {record.tajweed === "N/A" ? "Belum dinilai" : record.tajweed}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Belum ada setoran pada riwayat yang termuat.</p>
                  )}
                </section>
                <p className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-white/10">Rencana ini mencerminkan data yang tersimpan saat dicetak. Setoran terbaru menampilkan paling banyak lima catatan yang sudah dimuat.</p>
              </article>
            </div>
          </section>
        </div>
      )}

      {isTahfidzExportOpen && SUPABASE_TAHFIDZ_RUNTIME && canExportTahfidz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="tahfidz-export-title">
          <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div>
                <h2 id="tahfidz-export-title" className="text-lg font-semibold">Ekspor laporan Tahfidz</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pilih tanggal setoran yang akan dimasukkan ke berkas CSV.</p>
              </div>
              <button type="button" onClick={cancelTahfidzReportExport} aria-label="Tutup ekspor laporan" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Dari tanggal
                  <input type="date" required max={reportDateTo || currentTenantDate()} value={reportDateFrom} onChange={(event) => { setReportDateFrom(event.target.value); setTahfidzExportError(""); }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/30" />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Sampai tanggal
                  <input type="date" required min={reportDateFrom} max={currentTenantDate()} value={reportDateTo} onChange={(event) => { setReportDateTo(event.target.value); setTahfidzExportError(""); }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/30" />
                </label>
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">Berkas hanya memuat catatan yang dapat diakses oleh akun Anda. Maksimal 10.000 catatan per unduhan.</p>
              {tahfidzExportError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">{tahfidzExportError}</p>}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-black/20">
              <button type="button" onClick={cancelTahfidzReportExport} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{isExportingTahfidzReport ? "Batalkan" : "Tutup"}</button>
              <button type="button" onClick={() => void exportTahfidzReport()} disabled={isExportingTahfidzReport || !reportDateFrom || !reportDateTo || reportDateFrom > reportDateTo} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />{isExportingTahfidzReport ? "Menyiapkan laporan…" : "Unduh CSV"}</button>
            </footer>
          </section>
        </div>
      )}

      {/* Printable Study Plan Modal */}
      {isPrintPlanOpen && canManageTargets && !SUPABASE_TAHFIDZ_RUNTIME && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 print:hidden">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg">
                  <Printer className="w-5 h-5 flex-shrink-0" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Printable Study Plan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rencana Pembelajaran Individu (RPI)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print Plan
                </button>
                <button
                  onClick={() => setIsPrintPlanOpen(false)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-white print:p-0 print:bg-white text-slate-800 print:text-black">
              {/* Study Plan Content To Print */}
              <div className="max-w-3xl mx-auto border border-slate-200 print:border-none p-8 print:p-0 rounded-lg">
                <div className="flex justify-between items-start mb-8 border-b-2 border-slate-800 pb-4">
                  <div>
                    <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">
                      Rencana Target Hafalan
                    </h1>
                    <div className="text-sm text-slate-600">
                      Semester Ganjil 2026/2027
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-emerald-700">
                      Ma'had Tahfizhul Qur'an
                    </div>
                    <div className="text-sm text-slate-500">
                      Jl. Pahlawan No. 123, Kota
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">
                        Nama Santri:
                      </span>
                      <span className="text-sm">Muhammad Ali</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">NIS:</span>
                      <span className="text-sm">2023.01.001</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">Kelas:</span>
                      <span className="text-sm">10 IPA 1 - Kelompok 3</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">Musyrif:</span>
                      <span className="text-sm">Ust. Ahmad S.</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">
                        Target Utama:
                      </span>
                      <span className="text-sm font-medium text-emerald-600">
                        Khatam 10 Juz
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 border-dashed pb-1">
                      <span className="text-sm font-semibold">
                        Capaian Saat Ini:
                      </span>
                      <span className="text-sm">5 Juz 2 Halaman</span>
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="font-bold text-sm bg-slate-100 p-2 mb-3">
                    Misi Bulan Ini (Ziyadah & Muroja'ah)
                  </h3>
                  <table className="w-full text-sm border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-300 p-2 text-left w-24">
                          Pekan
                        </th>
                        <th className="border border-slate-300 p-2 text-left">
                          Target Ziyadah (Hafalan Baru)
                        </th>
                        <th className="border border-slate-300 p-2 text-left">
                          Muroja'ah (Pengulangan)
                        </th>
                        <th className="border border-slate-300 p-2 text-center w-24">
                          Paraf
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-2 font-medium">
                          Pekan 1
                        </td>
                        <td className="border border-slate-300 p-2">
                          Jum'at-Sabtu: Al-An'am (Ayat 1-40)
                        </td>
                        <td className="border border-slate-300 p-2">
                          Juz 1 & 2 (Setiap Hari 1/2 Juz)
                        </td>
                        <td className="border border-slate-300 p-2"></td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-2 font-medium">
                          Pekan 2
                        </td>
                        <td className="border border-slate-300 p-2">
                          Al-An'am (Ayat 41-90)
                        </td>
                        <td className="border border-slate-300 p-2">
                          Juz 3 & 4
                        </td>
                        <td className="border border-slate-300 p-2"></td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-2 font-medium">
                          Pekan 3
                        </td>
                        <td className="border border-slate-300 p-2">
                          Al-An'am (Ayat 91-140)
                        </td>
                        <td className="border border-slate-300 p-2">
                          Juz 5 & 6
                        </td>
                        <td className="border border-slate-300 p-2"></td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-2 font-medium">
                          Pekan 4
                        </td>
                        <td className="border border-slate-300 p-2">
                          Khatam Al-An'am (+ Ujian Surat)
                        </td>
                        <td className="border border-slate-300 p-2">
                          Ujian Muroja'ah Mutqin
                        </td>
                        <td className="border border-slate-300 p-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-12 pb-8">
                  <div className="text-center">
                    <p className="text-sm mb-16">Mengetahui, Orang Tua/Wali</p>
                    <div className="border-b border-slate-400 w-48 mx-auto"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm mb-16">Musyrif Pendamping</p>
                    <div className="border-b border-slate-400 w-48 mx-auto"></div>
                  </div>
                </div>

                <div className="mt-8 text-center text-xs text-slate-400 border-t border-slate-200 pt-4">
                  Dokumen ini dicetak secara otomatis dari sistem AI Manager
                  Tahfidz pada {new Date().toLocaleDateString("id-ID")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


