import { publicRuntimeConfigValue } from "../runtimeConfig";
import { useAuth } from '../contexts/AuthContext';
import { getAccessToken } from '../authSession';
import React, { useState, useEffect, useRef } from "react";
import { TahfidzStudentSearchSelect } from "../components/TahfidzStudentSearchSelect";
import {
  Search,
  Filter,
  Plus,
  Mic,
  Settings2,
  MoreVertical,
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
import { legacyArchiveImportEnabled, supabaseRuntimeEnabled } from "../runtimeBackend";
import { normalizeTenantTimeZone, tenantDate, tenantLocalDateTimeToIso, tenantTime } from "../lib/tenantTimeZone";
import { resolveGuardianStudentId } from "../lib/guardianStudentSelection";
import { getTahfidzAchievementProgress } from "../lib/tahfidzAchievements";
import { cn, generateUniqueId } from "../lib/utils";
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
const SUPABASE_TAHFIDZ_IMPORT = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_TAHFIDZ_IMPORT_ENABLED") === 'true';

async function requestSupabaseTahfidzApi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Data Tahfidz belum dapat diproses.');
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
  const canManageTahfidz = ["Admin", "SuperAdmin"].includes(role);
  const canRecordTahfidz = ["Admin", "SuperAdmin", "Ustadz"].includes(role);
  const canManageTargets = ["Admin", "SuperAdmin", "Ustadz"].includes(role);
  const isTahfidzLearner = ["Santri", "Walisantri"].includes(role);
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, records, targets, quran
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

  useEffect(() => {
    fetch("/api/quran/surat")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.data) {
          setSurahList(data.data);
        }
      })
      .catch(console.error);
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz]);
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
  }, [user?.tenantId, user?.uid, timeZone]);

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
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [recordsNextCursor, setRecordsNextCursor] = useState("");
  const [recordsOldestDate, setRecordsOldestDate] = useState("");
  const [recordsLoadingMore, setRecordsLoadingMore] = useState(false);
  const [achievementRows, setAchievementRows] = useState<any[]>([]);
  const [achievementHasMore, setAchievementHasMore] = useState(false);
  const [achievementNextCursor, setAchievementNextCursor] = useState("");
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementError, setAchievementError] = useState("");
  const achievementRequestSequence = useRef(0);

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
      halaqahId: record.halaqahId,
      date: Number.isNaN(performedAt.getTime()) ? "" : currentTenantDate(performedAt),
      time: Number.isNaN(performedAt.getTime()) ? "" : currentTenantTime(performedAt),
      santriName: record.studentName || "Santri tidak tersedia",
      type: record.activityType,
      surah: record.surah,
      ayat: `${record.ayahStart}-${record.ayahEnd}`,
      fluency: record.fluency || "N/A",
      tajweed: record.tajweed || "N/A",
      notes: record.notes || "-",
      ust: record.recordedByName || "",
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
      setTahfidzError(error?.message || "Riwayat setoran berikutnya belum dapat dimuat.");
    } finally {
      setRecordsLoadingMore(false);
    }
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
      setTahfidzError(error?.message || "Halaman roster santri berikutnya belum dapat dimuat.");
    } finally {
      setRosterLoadingMore(false);
    }
  };

  const loadSupabaseTahfidzAchievements = async (cursor = "", append = false) => {
    const requestSequence = ++achievementRequestSequence.current;
    setAchievementLoading(true);
    setAchievementError("");
    if (!append) {
      setAchievementRows([]);
      setAchievementHasMore(false);
      setAchievementNextCursor("");
    }
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const page = await requestSupabaseTahfidzApi(`/api/tahfidz/achievements?${params.toString()}`);
      if (requestSequence !== achievementRequestSequence.current) return;
      const incoming = Array.isArray(page.students) ? page.students : [];
      setAchievementRows((current) => {
        const existing = append ? current : [];
        const knownIds = new Set(existing.map((student) => String(student.id)));
        return [...existing, ...incoming.filter((student: any) => !knownIds.has(String(student.id)))];
      });
      setAchievementHasMore(page.hasMore === true);
      setAchievementNextCursor(typeof page.nextCursor === "string" ? page.nextCursor : "");
    } catch (error: any) {
      if (requestSequence === achievementRequestSequence.current) {
        setAchievementError(error?.message || "Pencapaian Tahfidz belum dapat dimuat.");
      }
    } finally {
      if (requestSequence === achievementRequestSequence.current) setAchievementLoading(false);
    }
  };

  useEffect(() => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || activeTab !== "badges") return;
    void loadSupabaseTahfidzAchievements();
    return () => { achievementRequestSequence.current += 1; };
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
        setTahfidzError(error?.message || "Hasil pencarian santri berikutnya belum dapat dimuat.");
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
          if (active && requestSequence === rosterSearchRequestSequence.current) setTahfidzError(error?.message || "Pencarian roster santri belum dapat dimuat.");
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
      setTahfidzError("Profil tenant aktif diperlukan untuk membaca data Tahfidz.");
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
        setTahfidzError(error?.message || "Data Tahfidz belum dapat dimuat.");
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
    if (!targetForm.studentId) {
      setTahfidzError("Pilih santri sebelum menyimpan target.");
      return;
    }
    setIsSavingTarget(true);
    setTahfidzError("");
    try {
      const target = {
        ...targetForm,
        periodEnd: targetForm.periodEnd || null,
        ziyadahPagesPerDay: Number(targetForm.ziyadahPagesPerDay),
        murojaahPagesPerDay: Number(targetForm.murojaahPagesPerDay),
      };
      const signature = JSON.stringify({ action: "target", tenantId: user?.tenantId || "", userId: user?.uid || "", target });
      const clientRequestId = tahfidzWriteRequestId(signature);
      await requestSupabaseTahfidzApi("/api/tahfidz/targets", {
        method: "POST",
        body: JSON.stringify({ target: { ...target, clientRequestId } }),
      });
      releaseTahfidzWriteRequestId(signature, clientRequestId);
      setIsTargetModalOpen(false);
      setDashboardActionStudent(null);
      try { await refreshSupabaseTahfidz(); }
      catch { setTahfidzError("Target tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang snapshot sebelum melakukan perubahan berikutnya."); }
    } catch (error: any) {
      setTahfidzError(error?.message || "Target Tahfidz belum dapat disimpan.");
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
      catch { setTahfidzError("Halaqah tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang snapshot sebelum melakukan perubahan berikutnya."); }
    } catch (error: any) {
      setTahfidzError(error?.message || "Halaqah belum dapat disimpan.");
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
      catch { setTahfidzError("Penempatan tersimpan, tetapi daftar terbaru belum dapat dimuat. Muat ulang snapshot sebelum melakukan perubahan berikutnya."); }
    } catch (error: any) {
      setTahfidzError(error?.message || "Penempatan halaqah belum dapat disimpan.");
    } finally {
      setIsSavingMembership(false);
    }
  };

  const handleTahfidzImport = async (apply = false) => {
    if (!SUPABASE_TAHFIDZ_RUNTIME || !SUPABASE_TAHFIDZ_IMPORT) return;
    if (apply && !window.confirm("Impor konfigurasi halaqah dan penempatan saat ini dari Firestore ke tenant Supabase? Pastikan hasil preview sudah direkonsiliasi.")) return;
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
        catch { setTahfidzError("Impor selesai, tetapi snapshot terbaru belum dapat dimuat."); }
      }
    } catch (error: any) {
      setTahfidzError(error?.message || "Preview impor Tahfidz belum dapat diproses.");
    } finally {
      setIsPreviewingTahfidzImport(false);
      setIsApplyingTahfidzImport(false);
    }
  };

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setTahfidzError(error?.message || "Setoran belum dapat disimpan.");
        return;
      } finally {
        setIsSavingRecord(false);
      }
      setFormData(createEmptyTahfidzRecordForm());
      setIsInputOpen(false);
      return;
    }

    const newRecord = {
      id: generateUniqueId('Record Tahfidz', []),
      date: formData.date || localDate(),
      time: formData.time || new Date().toTimeString().substring(0, 5),
      santriName: formData.santriName || "Unknown Santri",
      type: formData.type,
      surah: formData.surah || "-",
      ayat: formData.ayat || "-",
      fluency: formData.fluency,
      tajweed: formData.tajweed,
      notes: formData.notes || "-",
      ust: "Ust. Current User",
    };
    setRecords([newRecord, ...records]);
    setFormData(createEmptyTahfidzRecordForm());
    setIsInputOpen(false);
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
            {isPreviewingTahfidzImport ? "Memindai…" : "Preview Impor Legacy"}
          </button>}
          {(!SUPABASE_TAHFIDZ_RUNTIME || canManageTahfidz) && <button onClick={() => openHalaqahForm()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Halaqah
          </button>}
        </div>
      </div>

      {SUPABASE_TAHFIDZ_RUNTIME && SUPABASE_TAHFIDZ_IMPORT && tahfidzImportPreview && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900 dark:text-slate-100">Pratinjau impor konfigurasi Tahfidz</h3><p className="mt-1 text-xs text-slate-500">{tahfidzImportPreview.sourceCount?.halaqahs || 0} halaqah · {tahfidzImportPreview.sourceCount?.students || 0} santri · {tahfidzImportPreview.planned?.memberships || 0} penempatan direncanakan</p></div>
            {tahfidzImportPreview.canApply && tahfidzImportPreview.dryRun && <button onClick={() => void handleTahfidzImport(true)} disabled={isApplyingTahfidzImport} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isApplyingTahfidzImport ? "Mengimpor…" : "Terapkan hasil preview"}</button>}
          </div>
          {!!tahfidzImportPreview.errors?.length && <div className="text-sm text-rose-700 dark:text-rose-300">{tahfidzImportPreview.errors.map((issue: any) => <p key={`${issue.category}-${issue.id}`}>{issue.category} {issue.id}: {issue.message}</p>)}</div>}
          {!!tahfidzImportPreview.warnings?.length && <div className="text-sm text-amber-700 dark:text-amber-300">{tahfidzImportPreview.warnings.map((issue: any) => <p key={`${issue.category}-${issue.id}`}>{issue.category} {issue.id}: {issue.message}</p>)}</div>}
          {!tahfidzImportPreview.canApply && <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Selesaikan konflik, lalu jalankan pratinjau baru sebelum impor.</p>}
          {!tahfidzImportPreview.dryRun && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Impor selesai. {tahfidzImportPreview.imported?.halaqahs || 0} halaqah dan {tahfidzImportPreview.imported?.memberships || 0} penempatan diimpor.</p>}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {SUPABASE_TAHFIDZ_RUNTIME && !tahfidzLoading && displayHalaqah.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">
            Belum ada halaqah aktif pada tenant ini. Admin dapat membuat halaqah setelah daftar ustadz aktif tersedia.
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
                {(!SUPABASE_TAHFIDZ_RUNTIME || canManageTahfidz) && <button onClick={() => openHalaqahForm(halaqah)} aria-label={`Ubah halaqah ${halaqah.name}`} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
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
                        Daftar santri halaqah dimuat bertahap. Pilih “Lihat Semua” untuk membuka roster.
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
                  {!SUPABASE_TAHFIDZ_RUNTIME && <button
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
                {(!SUPABASE_TAHFIDZ_RUNTIME || canRecordTahfidz) && <button
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
                            <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsCommentModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Komentar Pengajar"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            {!SUPABASE_TAHFIDZ_RUNTIME && <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsAssessmentOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="AI Audio Assessment"
                            >
                              <Mic className="w-4 h-4" />
                            </button>}
                            <button
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="Listen to last setoran"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded border border-transparent transition-colors shadow-sm">
                              <MoreVertical className="w-4 h-4" />
                            </button>
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
        {isQuickActionsOpen && (
          <div className="flex flex-col items-end gap-2 mb-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
            <button
              onClick={() => {
                setActiveTab("records");
                setIsAssessmentOpen(true);
                setIsQuickActionsOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <span className="text-sm font-medium">Input Setoran Baru</span>
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
            </button>
            <button
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
            </button>
            <button
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
            </button>
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
        <button
          onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-600/30 transition-all duration-300 ${isQuickActionsOpen ? "bg-slate-800 rotate-45" : "bg-emerald-600 hover:bg-emerald-500 hover:scale-105"}`}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </>
  );

  const renderSupabaseDashboard = () => {
    const today = currentTenantDate();
    const todayRecords = records.filter((record) => record.date === today);
    const studentsWithoutTargets = Number(rosterStats?.studentsWithoutTarget ?? santriList.filter((student) => !student.target).length);
    const studentsWithoutHalaqah = Number(rosterStats?.studentsWithoutHalaqah ?? santriList.filter((student) => !student.halaqahId).length);
    const latestRecordByStudent = new Map<string, any>();
    for (const record of records) {
      const studentId = String(record.studentId || "");
      if (studentId && !latestRecordByStudent.has(studentId)) latestRecordByStudent.set(studentId, record);
    }
    const inferredFollowUpRows = santriList.map((student) => {
      const latest = latestRecordByStudent.get(String(student.id));
      const reasons = [
        !student.halaqahId ? "Belum ditempatkan pada halaqah" : "",
        !student.target ? "Target harian belum ditetapkan" : "",
        latest && ["D"].includes(String(latest.fluency || "").toUpperCase()) ? "Kelancaran perlu diulang" : "",
        latest && ["D"].includes(String(latest.tajweed || "").toUpperCase()) ? "Tajwid perlu diperbaiki" : "",
      ].filter(Boolean);
      return { ...student, reasons };
    }).filter((student) => student.reasons.length > 0).slice(0, 6);
    const followUpRows = dashboardFollowUps?.rows ?? inferredFollowUpRows;
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        label: new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short" }).format(date),
        count: records.filter((record) => record.date === key).length,
      };
    });
    const maxDailyRecords = Math.max(1, ...weekDays.map((day) => day.count));
    const weekRecords = weekDays.reduce((total, day) => total + day.count, 0);
    const recordCoverageCompleteBefore = (date: string) => !recordsHasMore || Boolean(recordsOldestDate && recordsOldestDate < date);
    const todayCoverageComplete = recordCoverageCompleteBefore(today);
    const weekCoverageComplete = recordCoverageCompleteBefore(weekDays[0].date);
    const todayRecordsDisplay = todayCoverageComplete ? todayRecords.length : `≥${todayRecords.length}`;
    const weekRecordsDisplay = weekCoverageComplete ? weekRecords : `≥${weekRecords}`;
    const totalStudents = Number(rosterStats?.studentCount ?? santriList.length);
    const studentsWithTarget = Number(rosterStats?.studentsWithTarget ?? (santriList.length - studentsWithoutTargets));
    const targetCoverage = totalStudents
      ? `${studentsWithTarget}/${totalStudents}`
      : "0/0";
    const metricCards = [
      { label: "Santri dalam Roster", value: totalStudents, tone: "emerald" },
      { label: "Halaqah Aktif", value: halaqahList.length, tone: "blue" },
      { label: "Setoran Hari Ini", value: todayRecordsDisplay, tone: "violet" },
      { label: "Cakupan Target", value: targetCoverage, tone: "amber" },
    ];
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-950/20 dark:text-blue-200">
          Ringkasan roster dan cakupan target dihitung tepat di backend Supabase untuk cakupan akun Anda. Tabel santri dimuat bertahap; grafik menunjukkan jumlah setoran, bukan jumlah halaman atau juz.
        </div>
        {rosterHasMore && <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span>Menampilkan {santriList.length} dari {totalStudents} santri pada roster. Ringkasan tindak lanjut dihitung terpisah untuk seluruh cakupan akun Anda.</span>
          <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50">{rosterLoadingMore ? "Memuat…" : "Muat santri berikutnya"}</button>
        </div>}
        {recordsHasMore && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200">
          Riwayat setoran dimuat bertahap. Ringkasan yang rentangnya belum tercakup penuh ditandai ≥.
        </div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{tahfidzLoading ? "—" : card.value}</p>
              {card.label === "Cakupan Target" && <p className="mt-1 text-xs text-slate-500">{studentsWithoutTargets} santri tanpa target aktif</p>}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">Aktivitas setoran 7 hari</h2>
                <p className="mt-1 text-sm text-slate-500">{weekRecordsDisplay} setoran pada cakupan akun ini</p>
              </div>
              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200">{studentsWithoutHalaqah} tanpa halaqah</span>
            </div>
            <div className="mt-6 grid grid-cols-7 gap-2" role="img" aria-label={`Grafik aktivitas setoran selama 7 hari, total ${weekRecords}`}>
              {weekDays.map((day) => (
                <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
                  <span className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">{recordCoverageCompleteBefore(day.date) ? day.count : `≥${day.count}`}</span>
                  <div className="flex h-28 w-full items-end rounded-lg bg-slate-50 px-1 dark:bg-white/5">
                    <div
                      className="w-full rounded-md bg-emerald-500 transition-[height]"
                      style={{ height: `${day.count ? Math.max(10, Math.round((day.count / maxDailyRecords) * 100)) : 2}%` }}
                      title={`${day.date}: ${recordCoverageCompleteBefore(day.date) ? day.count : `≥${day.count}`} setoran`}
                    />
                  </div>
                  <span className="text-[11px] capitalize text-slate-500">{day.label}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Perlu ditindaklanjuti</h2>
              <p className="mt-1 text-sm text-slate-500">{dashboardFollowUps ? `${dashboardFollowUps.count} santri dalam antrean prioritas` : "Penempatan, target, atau nilai terbaru yang memerlukan perhatian"}</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {followUpRows.length ? followUpRows.map((student) => (
                <div key={student.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-200">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">NIS {student.nis || "—"}{student.halaqah ? ` · ${student.halaqah}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {student.reasons.map((reason: string) => <span key={reason} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{reason}</span>)}
                    {canManageTargets && student.reasons.includes("Target harian belum ditetapkan") && <button type="button" onClick={() => { setDashboardActionStudent(student); setTargetForm({ studentId: student.id, ziyadahPagesPerDay: "1", murojaahPagesPerDay: "0.5", periodStart: currentTenantDate(), periodEnd: "", policy: "standard" }); setIsTargetModalOpen(true); }} className="rounded-full border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-400/10">Tetapkan target</button>}
                    {canManageTahfidz && student.reasons.includes("Belum ditempatkan pada halaqah") && <button type="button" onClick={() => { setDashboardActionStudent(student); setMembershipForm({ halaqahId: "", studentId: student.id, startsOn: currentTenantDate() }); setIsMembershipModalOpen(true); }} className="rounded-full border border-blue-200 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-400/10">Tempatkan ke halaqah</button>}
                  </div>
                </div>
              )) : <p className="px-5 py-8 text-center text-sm text-slate-500">{tahfidzLoading ? "Memuat ringkasan tindak lanjut…" : dashboardFollowUps ? "Tidak ada sinyal tindak lanjut dari data yang tersedia." : rosterHasMore ? "Belum ada sinyal tindak lanjut pada halaman roster yang dimuat." : "Tidak ada sinyal tindak lanjut dari data yang tersedia."}</p>}
              {dashboardFollowUps && dashboardFollowUps.count > followUpRows.length && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-white/5">Menampilkan {followUpRows.length} dari {dashboardFollowUps.count} santri. Urutan memprioritaskan jumlah dan tingkat risiko.</p>}
              {!dashboardFollowUps && followUpRows.length === 6 && santriList.length > followUpRows.length && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-white/5">Daftar ini berdasarkan halaman roster yang telah dimuat.</p>}
            </div>
          </section>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Halaqah</h2>
              <p className="mt-1 text-sm text-slate-500">Data kelompok aktif dari tenant ini</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {halaqahList.length ? halaqahList.map((halaqah) => (
                <div key={halaqah.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{halaqah.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{halaqah.ustadz || "Belum ada ustadz"} · {halaqah.schedule || "Jadwal belum diatur"}</p>
                  </div>
                  <span className="text-sm text-slate-500">{Number(halaqah.studentCount ?? halaqah.students?.length ?? 0)} santri</span>
                </div>
              )) : <p className="px-5 py-8 text-center text-sm text-slate-500">{tahfidzLoading ? "Memuat data…" : "Belum ada halaqah aktif."}</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Setoran Terbaru</h2>
              <p className="mt-1 text-sm text-slate-500">Catatan yang tersimpan di Supabase</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {records.slice(0, 6).length ? records.slice(0, 6).map((record) => (
                <div key={record.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{record.santriName}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{record.surah} · ayat {record.ayat}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{record.date || "—"}</span>
                </div>
              )) : <p className="px-5 py-8 text-center text-sm text-slate-500">{tahfidzLoading ? "Memuat data…" : "Belum ada setoran."}</p>}
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderSupabaseParentDashboard = () => {
    if (!isTahfidzLearner) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
          Portal ini hanya tersedia untuk akun Santri dan Wali Santri yang sudah tertaut ke data santri.
        </div>
      );
    }

    const studentId = role === "Walisantri"
      ? resolveGuardianStudentId(santriList, selectedGuardianStudentId)
      : String(santriList[0]?.id || "");
    const student = santriList.find((item) => String(item.id) === studentId);
    if (!student) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Data santri belum tertaut</h2>
          <p className="mt-2 text-sm text-slate-500">Minta Admin memeriksa tautan profil akun dengan data santri pada tenant pesantren.</p>
        </div>
      );
    }

    const halaqah = halaqahList.find((item) => String(item.id) === String(student.halaqahId || ""));
    const studentRecords = records.filter((record) => String(record.studentId || "") === String(student.id));
    const currentMonth = currentTenantDate().slice(0, 7);
    const monthlySubmissions = studentRecords.filter((record) => String(record.date || "").slice(0, 7) === currentMonth).length;
    const monthStart = `${currentMonth}-01`;
    const monthlyCoverageComplete = !recordsHasMore || Boolean(recordsOldestDate && recordsOldestDate < monthStart);
    const monthlySubmissionsDisplay = monthlyCoverageComplete ? monthlySubmissions : `≥${monthlySubmissions}`;
    const latestRecord = studentRecords[0];

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 dark:border-emerald-500/20 dark:from-emerald-950/30 dark:to-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{role === "Walisantri" ? "Portal Wali Santri" : "Progres Saya"}</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{student.name}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">NIS {student.nis || "—"} · {student.grade || "Kelas belum tercatat"}</p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              {role === "Walisantri" && santriList.length > 1 && <label className="w-full text-xs font-medium text-slate-600 dark:text-slate-300 sm:w-64">Pilih santri
                <select value={studentId} onChange={(event) => setSelectedGuardianStudentId(resolveGuardianStudentId(santriList, event.target.value))} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-white">
                  {santriList.map((linkedStudent) => <option key={linkedStudent.id} value={linkedStudent.id}>{linkedStudent.name} · {linkedStudent.nis || "tanpa NIS"}</option>)}
                </select>
              </label>}
              <div className="rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-sm dark:border-emerald-500/20 dark:bg-black/10">
              <p className="text-xs text-slate-500">Halaqah</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{halaqah?.name || "Belum ditempatkan"}</p>
              {halaqah?.ustadz && <p className="mt-1 text-xs text-slate-500">Pengampu: {halaqah.ustadz}</p>}
            </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setoran bulan ini</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{tahfidzLoading ? "—" : monthlySubmissionsDisplay}</p>
            <p className="mt-1 text-xs text-slate-500">{monthlyCoverageComplete ? "Jumlah setoran pada bulan berjalan" : "Jumlah minimum dari riwayat yang termuat; buka Riwayat Setoran untuk melengkapi."}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target harian</p>
            <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{student.target ? `${student.target.ziyadahPagesPerDay} halaman ziyadah` : "Belum diatur"}</p>
            <p className="mt-1 text-xs text-slate-500">{student.target ? `${student.target.murojaahPagesPerDay} halaman muroja'ah per hari` : "Hubungi pembimbing untuk menetapkan target."}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setoran terakhir</p>
            <p className="mt-2 font-bold text-slate-900 dark:text-white">{latestRecord ? `${latestRecord.surah} · ayat ${latestRecord.ayat}` : recordsHasMore ? "Riwayat lama belum dimuat" : "Belum ada setoran"}</p>
            <p className="mt-1 text-xs text-slate-500">{latestRecord ? `${latestRecord.date || "Tanggal tidak tersedia"} · ${latestRecord.time || "Waktu tidak tersedia"}` : recordsHasMore ? "Muat riwayat lama untuk memeriksa setoran sebelumnya." : "Catatan akan muncul setelah setoran tersimpan."}</p>
          </article>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Riwayat setoran</h3>
            <p className="mt-1 text-sm text-slate-500">Data aktual untuk santri yang tertaut pada akun ini.</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {tahfidzLoading ? <p role="status" className="px-5 py-8 text-center text-sm text-slate-500">Memuat riwayat setoran…</p>
              : studentRecords.length ? studentRecords.slice(0, 12).map((record) => (
                <article key={record.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{record.surah} · ayat {record.ayat}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.type} · {record.date || "Tanggal tidak tersedia"} {record.time ? `· ${record.time}` : ""}</p>
                    {record.notes && record.notes !== "-" && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Catatan: {record.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">Kelancaran: {record.fluency === "N/A" ? "Belum dinilai" : record.fluency}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">Tajwid: {record.tajweed === "N/A" ? "Belum dinilai" : record.tajweed}</span>
                  </div>
                </article>
              )) : <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada catatan setoran tersimpan.</p>}
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-white/5">Total hafalan dan grafik progres belum ditampilkan karena backend belum menyimpan ukuran hafalan kumulatif yang dapat diverifikasi.</p>
        </section>
      </div>
    );
  };

  const renderSupabaseTargets = () => (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Target Harian Santri</h2>
            <p className="mt-1 text-sm text-slate-500">{isTahfidzLearner ? "Target aktif untuk santri yang tertaut dengan akun ini." : "Target aktif ditarik dari backend Supabase."}</p>
          </div>
          {canManageTargets && <button onClick={() => setIsTargetModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
            <Plus className="h-4 w-4" /> Atur Target
          </button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-white/10"><tr><th className="px-3 py-3">Santri</th><th className="px-3 py-3">Halaqah</th><th className="px-3 py-3">Ziyadah / hari</th><th className="px-3 py-3">Muroja'ah / hari</th><th className="px-3 py-3">Periode</th><th className="px-3 py-3">Kebijakan</th><th className="px-3 py-3">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {santriList.map((student) => (
                <tr key={student.id}>
                  <td className="px-3 py-3"><span className="font-medium text-slate-800 dark:text-slate-200">{student.name}</span><span className="block text-xs text-slate-500">{student.nis}</span></td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{student.halaqah || "Belum ditempatkan"}</td>
                  <td className="px-3 py-3">{student.target ? `${student.target.ziyadahPagesPerDay} halaman` : "Belum diatur"}</td>
                  <td className="px-3 py-3">{student.target ? `${student.target.murojaahPagesPerDay} halaman` : "Belum diatur"}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{student.target ? `${student.target.periodStart} – ${student.target.periodEnd || "seterusnya"}` : "—"}</td>
                  <td className="px-3 py-3 capitalize">{student.target?.policy || "—"}</td>
          <td className="px-3 py-3">{canManageTargets ? <button onClick={() => { setTargetForm({ studentId: student.id, ziyadahPagesPerDay: String(student.target?.ziyadahPagesPerDay ?? 1), murojaahPagesPerDay: String(student.target?.murojaahPagesPerDay ?? 0.5), periodStart: student.target?.periodStart || currentTenantDate(), periodEnd: student.target?.periodEnd || "", policy: student.target?.policy || "standard" }); setIsTargetModalOpen(true); }} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-white/10 dark:text-emerald-400 dark:hover:bg-white/5">Sesuaikan</button> : "—"}</td>
                </tr>
              ))}
              {!santriList.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">{tahfidzLoading ? "Memuat data…" : "Belum ada data santri."}</td></tr>}
            </tbody>
          </table>
        </div>
        {rosterHasMore && <div className="border-t border-slate-100 px-3 py-3 text-center dark:border-white/5"><button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="text-sm font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri berikutnya…" : "Muat santri berikutnya"}</button></div>}
      </section>
    </div>
  );

  const renderRecords = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Quick Entry Form */}
      {(!SUPABASE_TAHFIDZ_RUNTIME || canRecordTahfidz) && <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-auto flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">
            Santri
          </label>
          {SUPABASE_TAHFIDZ_RUNTIME ? <TahfidzStudentSearchSelect
            key={tahfidzStudentScopeKey}
            scopeKey={tahfidzStudentScopeKey}
            searchStudents={searchSupabaseTahfidzRoster}
            initialStudents={selectableSantri}
            selectedStudentId={formData.studentId || ""}
            selectedStudent={selectableSantri.find((student) => String(student.id) === String(formData.studentId || "")) || null}
            onSelect={(student) => selectTahfidzStudent(String(student?.id || ""), student)}
            filterStudent={(student) => Boolean(student.halaqahId)}
            disabled={isSavingRecord}
          /> : <select
            value={formData.santriName || ""}
            onChange={(e) => selectTahfidzStudent(e.target.value)}
            className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">-- Pilih Santri --</option>
            {displaySantri.map((s) => <option key={s.id} value={s.name}>{s.name} - {s.nis}</option>)}
          </select>}
          {SUPABASE_TAHFIDZ_RUNTIME && rosterHasMore && <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="mt-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri…" : "Santri belum terlihat? Muat halaman berikutnya"}</button>}
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">
            Surah
          </label>
          <input
            type="text"
            placeholder="Misal: Al-Baqarah"
            value={formData.surah || ""}
            onChange={(e) =>
              setFormData({ ...formData, surah: e.target.value })
            }
            className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <div className="w-full md:w-32">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">
            Ayat
          </label>
          <input
            type="text"
            placeholder="Misal: 1-10"
            value={formData.ayat || ""}
            onChange={(e) => setFormData({ ...formData, ayat: e.target.value })}
            className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">
            Tipe
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="Ziyadah">Ziyadah</option>
            <option value="Muroja'ah">Muroja'ah</option>
          </select>
        </div>
        {SUPABASE_TAHFIDZ_RUNTIME && <>
        <div className="w-full md:w-40">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">Kelancaran</label>
          <select required value={formData.fluency} onChange={(e) => setFormData({ ...formData, fluency: e.target.value })} className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
            <option value="">Pilih nilai</option><option value="A+">A+ · Mumtaz</option><option value="A">A · Lancar</option><option value="B">B · Cukup</option><option value="C">C · Perlu latihan</option><option value="D">D · Mengulang</option><option value="N/A">Belum dinilai</option>
          </select>
        </div>
        <div className="w-full md:w-40">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">Tajwid</label>
          <select required value={formData.tajweed} onChange={(e) => setFormData({ ...formData, tajweed: e.target.value })} className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
            <option value="">Pilih nilai</option><option value="A+">A+ · Sangat baik</option><option value="A">A · Baik</option><option value="B">B · Cukup</option><option value="C">C · Perlu latihan</option><option value="D">D · Mengulang</option><option value="N/A">Belum dinilai</option>
          </select>
        </div>
        </>}
        <button
          onClick={handleInputSubmit}
          disabled={!(SUPABASE_TAHFIDZ_RUNTIME ? formData.studentId : formData.santriName) || !formData.surah || !formData.ayat || (SUPABASE_TAHFIDZ_RUNTIME && (!formData.fluency || !formData.tajweed)) || isSavingRecord}
          className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20 whitespace-nowrap flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Entri Cepat
        </button>
      </div>}

      <div className="bg-white dark:bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-black/40 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4">Waktu Setoran</th>
                <th className="px-6 py-4">Santri & Halaqah</th>
                <th className="px-6 py-4">Tipe & Hafalan</th>
                <th className="px-6 py-4">Penilaian</th>
                <th className="px-6 py-4">Catatan Musyrif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {records.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {r.date}
                    </span>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {r.time}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-800 dark:text-slate-200 font-bold">
                      {r.santriName}
                    </span>
                    <div className="text-xs text-slate-500 mt-0.5">{r.ust}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          "inline-flex w-max items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                          r.type === "Ziyadah"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
                        )}
                      >
                        {r.type}
                      </span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        QS. {r.surah}: {r.ayat}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          Kelancaran
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {!r.fluency || r.fluency === "N/A" ? "Belum dinilai" : r.fluency}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          Tajwid
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {!r.tajweed || r.tajweed === "N/A" ? "Belum dinilai" : r.tajweed}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm max-w-[200px] truncate">
                    {r.notes !== "-" ? (
                      r.notes
                    ) : (
                      <span className="italic text-slate-400">
                        Tidak ada catatan
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {SUPABASE_TAHFIDZ_RUNTIME && recordsHasMore && <div className="flex justify-center border-t border-slate-100 px-4 py-4 dark:border-white/5">
          <button type="button" onClick={loadMoreTahfidzRecords} disabled={recordsLoadingMore} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-white/5">
            {recordsLoadingMore ? "Memuat riwayat…" : "Muat riwayat lebih lama"}
          </button>
        </div>}
        {SUPABASE_TAHFIDZ_RUNTIME && <p className="text-center text-xs text-slate-500">Menampilkan {records.length} catatan terbaru yang telah dimuat.</p>}
      </div>
    </div>
  );

  const renderTargets = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Daily Goal Setting Section */}
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />{" "}
              Target Harian Santri
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Atur dan pantau target setoran ziyadah & muroja'ah harian untuk
              semua santri.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!SUPABASE_TAHFIDZ_RUNTIME && <button
              onClick={() => setIsPrintPlanOpen(true)}
              className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/10 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Cetak Study Plan
            </button>}
            {!SUPABASE_TAHFIDZ_RUNTIME && <button
              onClick={() => setIsAiPlannerOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:from-emerald-500 hover:to-teal-500 transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI Planner
            </button>}
            <button
              onClick={() => setIsTargetModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors border border-emerald-200 dark:border-emerald-500/20 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Set Target Massal
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-black/40 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-4 py-3">Santri</th>
                <th className="px-4 py-3">Pencapaian Hari Ini</th>
                <th className="px-4 py-3">Target Ziyadah</th>
                <th className="px-4 py-3">Target Muroja'ah</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {displaySantri.slice(0, 3).map((santri) => (
                <tr
                  key={santri.id}
                  className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {santri.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {santri.name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {santri.nis}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: "60%" }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        60%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    1 Halaman
                  </td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium">
                    ¼ Juz
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setIsTargetModalOpen(true)}
                      className="text-xs text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium bg-slate-100 dark:bg-white/5 px-2 py-1 rounded"
                    >
                      Sesuaikan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
              Konsistensi Hafalan Mingguan
            </h3>
            <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300 outline-none">
              <option>Minggu Ini</option>
              <option>Minggu Lalu</option>
            </select>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={WEEKLY_DATA}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  contentStyle={{
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{ fontWeight: "bold", color: "#1e293b" }}
                />
                <Bar
                  dataKey="Ziyadah"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                  maxBarSize={40}
                />
                <Bar
                  dataKey="Muroja'ah"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Ziyadah (Halaman)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Muroja'ah (Halaman)
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
              Tingkat Penyelesaian (Target vs Aktual)
            </h3>
            <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300 outline-none">
              <option>Semester Ganjil</option>
              <option>Semester Genap</option>
            </select>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={COMPLETION_DATA}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAktual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{ fontWeight: "bold", color: "#1e293b" }}
                />
                <Area
                  type="monotone"
                  dataKey="Target"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#colorTarget)"
                />
                <Area
                  type="monotone"
                  dataKey="Aktual"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAktual)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-2 border-dashed border-slate-400"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Target Semester
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-4 border-emerald-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Aktual Area
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
              Milestone Hafalan (30 Juz)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Peta visual perkembangan hafalan santri secara keseluruhan.
            </p>
          </div>
          <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 outline-none">
            <option>Ahmad Muzakki (Contoh)</option>
            {displaySantri.map((s) => (
              <option key={s.id}>
                {s.name} - {s.grade}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
          {Array.from({ length: 30 }).map((_, i) => {
            const juz = i + 1;
            // Mockup data for presentation
            let status: "completed" | "in-progress" | "locked" = "locked";
            let progress = 0;
            if (juz <= 15) {
              status = "completed";
              progress = 100;
            } else if (juz === 16) {
              status = "in-progress";
              progress = 65;
            }

            return (
              <div
                key={juz}
                className={cn(
                  "relative p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all duration-300 overflow-hidden group cursor-pointer",
                  status === "completed"
                    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-500/30 hover:border-emerald-300"
                    : status === "in-progress"
                      ? "bg-white border-blue-200 dark:bg-[#1a1a1a] dark:border-blue-500/30 hover:border-blue-300 ring-2 ring-blue-500/20 ring-offset-1 dark:ring-offset-black"
                      : "bg-slate-50 border-slate-200 opacity-60 dark:bg-white/[0.02] dark:border-white/5 hover:opacity-100",
                )}
              >
                {status === "in-progress" && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                )}
                <span
                  className={cn(
                    "text-sm font-bold block mb-1",
                    status === "completed"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : status === "in-progress"
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  Juz {juz}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
                    status === "completed"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : status === "in-progress"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                        : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400",
                  )}
                >
                  {status === "completed"
                    ? "Jayyid"
                    : status === "in-progress"
                      ? `${progress}%`
                      : "--"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200 dark:bg-emerald-900/50 dark:border-emerald-500/50"></div>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Selesai Munaqasyah
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white border-2 border-blue-200 dark:bg-black dark:border-blue-500/50"></div>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Sedang Dihafal
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-50 border border-slate-200 dark:bg-white/5 dark:border-white/10"></div>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Belum Dihafal
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderExams = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Ujian & Munaqasyah
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manajemen sertifikasi dan evaluasi akhir tahfidz
          </p>
        </div>
        <button
          onClick={() => setIsExamModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm shadow-emerald-500/20 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Jadwalkan Ujian Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Statistik Ujian */}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm col-span-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-500" /> Ringkasan Munaqasyah
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-500/20 text-center">
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                12
              </div>
              <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                Menunggu Ujian
              </div>
            </div>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20 text-center">
              <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                45
              </div>
              <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                Lulus Semester Ini
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Penguji Aktif Bulan Ini
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                    UT
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    Ust. Tarmudzi
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded">
                  15 Ujian
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                    AS
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                    Ust. Ahmad S.
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded">
                  8 Ujian
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter dan Daftar Jadwal Ujian */}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm col-span-1 md:col-span-2 flex flex-col h-full">
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex gap-2">
            <button
              onClick={() => setExamFilter("upcoming")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${examFilter === "upcoming" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 border border-transparent"}`}
            >
              Jadwal Mendatang
            </button>
            <button
              onClick={() => setExamFilter("completed")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${examFilter === "completed" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 border border-transparent"}`}
            >
              Selesai/Riwayat
            </button>
            <div className="flex-1"></div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari santri..."
                className="bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:border-emerald-500 border transition-colors dark:text-white"
              />
            </div>
          </div>

          <div className="flex-1 p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Santri
                  </th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {examFilter === "upcoming"
                      ? "Jadwal & Penguji"
                      : "Tanggal & Nilai"}
                  </th>
                  <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {examFilter === "upcoming" ? (
                  <>
                    <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Muhammad Ali
                        </div>
                        <div className="text-xs text-slate-500">
                          Kelas VIII-B • 22001
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs font-semibold border border-indigo-100 dark:border-indigo-500/20">
                          <ClipboardCheck className="w-3.5 h-3.5" /> 5 Juz (Juz
                          26-30)
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />{" "}
                          Besok, 08:00
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <User className="w-3.5 h-3.5" /> Ust. Tarmudzi
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-500/20">
                          Menunggu
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setIsExamActive(true)}
                          className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors text-slate-400"
                          title="Mulai Ujian"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Ibrahim Pasha
                        </div>
                        <div className="text-xs text-slate-500">
                          Kelas VII-A • 23015
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-semibold border border-purple-100 dark:border-purple-500/20">
                          <GraduationCap className="w-3.5 h-3.5" /> Khotmil
                          Qur'an 30 Juz
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> 15
                          Nov, 09:30
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <User className="w-3.5 h-3.5" /> Syekh Abdullah
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-500/20">
                          Menunggu
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setIsExamActive(true)}
                          className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors text-slate-400"
                          title="Mulai Ujian"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Umar Faruq
                        </div>
                        <div className="text-xs text-slate-500">
                          Kelas IX-C • 21104
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold border border-emerald-100 dark:border-emerald-500/20">
                          <ClipboardCheck className="w-3.5 h-3.5" /> 2 Juz (Juz
                          29-30)
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />{" "}
                          Hari Ini, 14:00
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <User className="w-3.5 h-3.5" /> Ust. Ahmad S.
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-500/20">
                          Sedang Berlangsung
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setIsExamActive(true)}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors text-slate-400"
                          title="Buka Ujian"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Ahmad Muzakki
                        </div>
                        <div className="text-xs text-slate-500">
                          Kelas VII-A • 2024001
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs font-semibold border border-indigo-100 dark:border-indigo-500/20">
                          <ClipboardCheck className="w-3.5 h-3.5" /> 5 Juz (Juz
                          1-5)
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> 10
                          Nov 2023
                        </div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-2">
                          <Award className="w-3.5 h-3.5" /> Nilai: 95 (Mumtaz)
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-500/20">
                          Lulus
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() =>
                            setSelectedCertificate({
                              name: "Ahmad Muzakki",
                              id: "2024001",
                              category: "Hafalan 5 Juz (Juz 1-5)",
                              date: "10 November 2023",
                              score: "95 (Mumtaz)",
                              headmaster: "K.H. Syekh Abdullah",
                              headOfTahfidz: "Ust. Tarmudzi, Al-Hafizh",
                            })
                          }
                          className="px-3 py-1.5 flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-500/30 text-xs font-medium"
                          title="Lihat Sertifikat"
                        >
                          <Printer className="w-3.5 h-3.5" /> Sertifikat
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Syamil Al-Farizi
                        </div>
                        <div className="text-xs text-slate-500">
                          Kelas VIII-B • 2024003
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-semibold border border-purple-100 dark:border-purple-500/20">
                          <GraduationCap className="w-3.5 h-3.5" /> 10 Juz (Juz
                          1-10)
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> 05
                          Nov 2023
                        </div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-2">
                          <Award className="w-3.5 h-3.5" /> Nilai: 98 (Mumtaz)
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-500/20">
                          Lulus
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() =>
                            setSelectedCertificate({
                              name: "Syamil Al-Farizi",
                              id: "2024003",
                              category: "Hafalan 10 Juz (Juz 1-10)",
                              date: "05 November 2023",
                              score: "98 (Mumtaz)",
                              headmaster: "K.H. Syekh Abdullah",
                              headOfTahfidz: "Ust. Tarmudzi, Al-Hafizh",
                            })
                          }
                          className="px-3 py-1.5 flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-500/30 text-xs font-medium"
                          title="Lihat Sertifikat"
                        >
                          <Printer className="w-3.5 h-3.5" /> Sertifikat
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const MOCK_PEER_REVIEWS = [
    {
      id: 1,
      studentName: "Ahmad Muzakki",
      surah: "Al-Mulk: 1-15",
      date: "Hari Ini, 05:30",
      duration: "2:15",
      views: 12,
      comments: 3,
      avatar: "AM",
    },
    {
      id: 2,
      studentName: "Umar Faruq",
      surah: "Al-Waqiah: 1-20",
      date: "Kemarin, 16:00",
      duration: "3:40",
      views: 8,
      comments: 1,
      avatar: "UF",
    },
    {
      id: 3,
      studentName: "Ibrahim Pasha",
      surah: "An-Naba",
      date: "2 Hari Lalu, 06:15",
      duration: "4:10",
      views: 24,
      comments: 5,
      avatar: "IP",
    },
  ];

  const renderPeerReview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Kajian & Peer-Review
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Dengarkan setoran teman, beri masukan, dan belajar bersama
          </p>
        </div>
        <button className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm shadow-purple-500/20 flex items-center gap-2">
          <UploadCloud className="w-4 h-4" /> Unggah Setoran Anda
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {MOCK_PEER_REVIEWS.map((review) => (
            <div
              key={review.id}
              className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm hover:border-purple-200 dark:hover:border-purple-500/30 transition-all flex flex-col sm:flex-row gap-4"
            >
              <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-full font-bold">
                {review.avatar}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                      {review.surah}
                    </h3>
                    <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> {review.studentName}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{review.date}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedReview(review);
                      setIsPeerReviewOpen(true);
                    }}
                    className="bg-slate-100/50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-slate-200 dark:border-white/10"
                  >
                    <Play className="w-4 h-4" /> Dengarkan ({review.duration})
                  </button>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 ml-auto">
                    <Headphones className="w-3.5 h-3.5" /> {review.views}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> {review.comments}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 shadow-sm text-white">
            <h3 className="font-semibold flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" /> Komunitas Penghafal
            </h3>
            <p className="text-purple-100 text-sm leading-relaxed mb-4">
              Mendengarkan bacaan teman dapat melatih kepekaan kita terhadap
              tajwid dan fashahah, serta membiasakan telinga dengan berbagai
              langgam bacaan.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-white/20 rounded-md text-xs font-semibold backdrop-blur-sm shadow-sm flex items-center gap-1.5">
                <ThumbsUp className="w-3 h-3" /> +10 XP per Review
              </span>
              <span className="px-2.5 py-1 bg-white/20 rounded-md text-xs font-semibold backdrop-blur-sm shadow-sm flex items-center gap-1.5">
                <Star className="w-3 h-3" /> Best Reviewer
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Review Teratas Anda
            </h3>
            <div className="space-y-3">
              <div className="border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] p-3 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Untuk: Umar Faruq
                  </span>
                  <span className="text-[10px] text-slate-500 flex gap-1 items-center">
                    <ThumbsUp className="w-3 h-3 text-emerald-500" /> 5
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                  "Masyaallah bacaannya sangat tartil, hanya pada ayat 15 perlu
                  diperjelas huruf dhad-nya."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBadges = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Lencana dan Pencapaian
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Apresiasi atas proses belajar dan target hafalan santri.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {MOCK_BADGES.map((b) => (
          <div
            key={b.id}
            className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col items-center text-center"
          >
            <div
              className={`w-12 h-12 rounded-full ${b.bg} ${b.color} flex items-center justify-center mb-3`}
            >
              <b.icon className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              {b.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">
            Papan Pencapaian Santri
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-white/5">
          {displaySantri.map((s) => {
            const ach = STUDENT_ACHIEVEMENTS.find((a) => a.id === s.id);
            const unlockedIds = ach ? ach.unlocked : [];
            return (
              <div
                key={s.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex flex-col items-center justify-center font-bold text-xs shrink-0">
                    {s.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                      {s.name}
                    </h4>
                    <div className="text-xs text-slate-500">
                      {s.grade} • {s.halaqah}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {MOCK_BADGES.map((b) => {
                    const isUnlocked = unlockedIds.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        title={isUnlocked ? b.name : "Belum terbuka"}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isUnlocked ? `${b.bg} ${b.color}` : "bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-700 grayscale opacity-50"}`}
                      >
                        <b.icon className="w-4 h-4" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderSupabaseAchievements = () => {
    const icons: Record<string, any> = {
      "first-record": CheckCircle2,
      "ten-records": BookOpen,
      "seven-study-days": Calendar,
      "ziyadah-25": Layers,
      "murojaah-25": RotateCcw,
      "hundred-records": Trophy,
    };
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Pencapaian Tahfidz</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ringkasan dihitung dari catatan setoran tersimpan. Hari belajar berarti tanggal kalender berbeda, bukan rentetan hari.</p>
        </div>

        {achievementError && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-200">
            <div className="flex items-center justify-between gap-3">
              <span>{achievementError}</span>
              <button type="button" onClick={() => void loadSupabaseTahfidzAchievements()} className="shrink-0 font-semibold underline underline-offset-2">Coba lagi</button>
            </div>
          </div>
        )}

        {achievementLoading && achievementRows.length === 0 && (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400">Memuat pencapaian…</div>
        )}

        {!achievementLoading && !achievementError && achievementRows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/10 dark:bg-black/20">
            <Award className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-medium text-slate-700 dark:text-slate-200">Belum ada santri pada cakupan akun ini.</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Data akan muncul setelah penempatan halaqah atau tautan akun tersedia.</p>
          </div>
        )}

        <div className="space-y-4">
          {achievementRows.map((student) => {
            const achievements = getTahfidzAchievementProgress(student.metrics || {
              totalRecords: 0, ziyadahRecords: 0, murojaahRecords: 0, studyDays: 0,
            });
            const earnedCount = achievements.filter((item) => item.earned).length;
            return (
              <section key={student.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">{student.name || "Santri"}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{student.grade || "Kelas belum diatur"}{student.halaqah ? ` · Halaqah ${student.halaqah}` : " · Belum ditempatkan pada halaqah"}</p>
                  </div>
                  <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">{earnedCount} dari {achievements.length} pencapaian</div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {student.metrics.totalRecords} catatan · {student.metrics.ziyadahRecords} Ziyadah · {student.metrics.murojaahRecords} Murojaah · {student.metrics.studyDays} hari belajar
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {achievements.map((achievement) => {
                    const Icon = icons[achievement.id] || Award;
                    const progressPercent = achievement.threshold > 0
                      ? Math.round((achievement.progress / achievement.threshold) * 100)
                      : 0;
                    return (
                      <div key={achievement.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/[0.03]">
                        <div className="flex items-start gap-3">
                          <span className={`rounded-lg p-2 ${achievement.earned ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-slate-200/70 text-slate-500 dark:bg-white/5 dark:text-slate-400"}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{achievement.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{achievement.description}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-label={`Progres ${achievement.name}`} aria-valuemin={0} aria-valuemax={achievement.threshold} aria-valuenow={achievement.progress}>
                            <div className={`h-full rounded-full ${achievement.earned ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${progressPercent}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{achievement.progress}/{achievement.threshold}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {achievementHasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={() => void loadSupabaseTahfidzAchievements(achievementNextCursor, true)} disabled={achievementLoading} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5">
              {achievementLoading ? "Memuat…" : "Muat pencapaian berikutnya"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderParentDashboard = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 shadow-sm text-white flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex flex-col items-center justify-center font-bold text-2xl border-2 border-white/30 shrink-0 shadow-inner">
            AM
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Ahmad Muzakki</h2>
            <p className="text-emerald-100 flex items-center gap-2 mt-1">
              <User className="w-4 h-4" /> Kelas VII-A • Halaqah Ust. Abu Bakar
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="bg-black/20 p-4 rounded-xl border border-white/10 text-center min-w-[120px] backdrop-blur-sm">
            <div className="text-xs text-emerald-200 uppercase tracking-wider mb-1">
              Total Hafalan
            </div>
            <div className="text-2xl font-bold">5 Juz</div>
          </div>
          <div className="bg-black/20 p-4 rounded-xl border border-white/10 text-center min-w-[120px] backdrop-blur-sm">
            <div className="text-xs text-emerald-200 uppercase tracking-wider mb-1">
              Rata² Mutu
            </div>
            <div className="text-2xl font-bold">Jayyid</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" /> Grafik Progres
                Hafalan
              </h3>
              <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300">
                <option>Bulan Ini</option>
                <option>Bulan Lalu</option>
              </select>
            </div>
            <div className="h-[200px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={WEEKLY_DATA}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorParent"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.05)" }}
                    contentStyle={{ borderRadius: "8px", border: "none" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Ziyadah"
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorParent)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-emerald-500" /> Riwayat Setoran
              Terakhir
            </h3>
            <div className="space-y-4">
              {[
                {
                  date: "Hari Ini",
                  time: "05:30",
                  surah: "Al-Mulk: 1-15",
                  type: "Ziyadah",
                  note: "Alhamdulillah lancar, perhatikan panjang pendek mad wajib.",
                  score: "A",
                },
                {
                  date: "Kemarin",
                  time: "16:00",
                  surah: "Al-Jin: 1-20",
                  type: "Muroja'ah",
                  note: "Sudah baik, coba murojaah kembali ayat 15-18.",
                  score: "B",
                },
                {
                  date: "2 Hari Lalu",
                  time: "05:40",
                  surah: "Tabarak: Full",
                  type: "Muroja'ah",
                  note: "Sangat lancar (Mumtaz).",
                  score: "A+",
                },
              ].map((rec, i) => (
                <div
                  key={i}
                  className="flex gap-4 p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full font-bold">
                    {rec.score}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                        {rec.surah}
                      </h4>
                      <span className="text-[10px] text-slate-500">
                        {rec.date} • {rec.time} WIB
                      </span>
                    </div>
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2",
                        rec.type === "Ziyadah"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                      )}
                    >
                      {rec.type}
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      "{rec.note}"
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 py-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-800">
              Lihat Semua Riwayat
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-emerald-500" /> Target Hari Ini
            </h3>
            <div className="p-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10 mb-4 text-center">
              <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">
                Ziyadah (Hafalan Baru)
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Surah Al-Qalam: 1-20
              </div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium italic">
                Status: Belum Disetor
              </div>
            </div>
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10 text-center">
              <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">
                Muroja'ah (Ulangan)
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Juz 29: Al-Mulk - Al-Jin
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Sudah Disetor
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-emerald-500" /> Pesan
              Musyrif
            </h3>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
              <div className="flex gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-700 flex items-center justify-center font-bold text-amber-800 dark:text-amber-100 text-xs shrink-0">
                  UB
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Ust. Abu Bakar
                  </div>
                  <span className="text-[10px] text-slate-500">
                    2 hari yang lalu
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                "Assalamu'alaikum Ayah/Bunda. Alhamdulillah ananda Muzakki
                progresnya sangat baik. Mohon dibantu pantau murojaah di rumah
                terutama saat libur akhir pekan."
              </p>
              <button className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                Balas Pesan
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTalaqqiCalendar = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />{" "}
              Jadwal Talaqqi
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Jadwalkan dan pantau sesi bimbingan khusus tahsin & tahfidz.
            </p>
          </div>
          {!SUPABASE_TAHFIDZ_RUNTIME && <button
            onClick={() => setIsTalaqqiModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Jadwalkan Sesi
          </button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl">
              <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-400 mb-2">
                Sesi Hari Ini
              </h4>
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mb-4">
                Anda memiliki 3 sesi talaqqi terjadwal.
              </p>
              <div className="space-y-3">
                {[1, 2, 3].map((_, i) => (
                  <div
                    key={`session-${i}`}
                    className="flex gap-3 bg-white dark:bg-black/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/50 transition-colors cursor-pointer"
                  >
                    <div className="w-10 text-center shrink-0">
                      <span className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                        1{3 + i}:00
                      </span>
                      <span className="block text-[10px] text-slate-500 uppercase">
                        WIB
                      </span>
                    </div>
                    <div className="border-l border-slate-200 dark:border-white/10 pl-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {displaySantri[i]?.name}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        Fokus: Makharijul Huruf & Ghunnah
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button className="w-full mt-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors border border-emerald-200/50 dark:border-emerald-500/20">
                Lihat Semua Sesi Hari Ini
              </button>
            </div>
          </div>

          <div className="md:col-span-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Minggu Ini
              </h4>
              <div className="flex items-center gap-2">
                <button className="p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  12 - 18 Nov 2026
                </span>
                <button className="p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Aha"].map(
                (day, i) => (
                  <div key={day} className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                      {day}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-medium p-2 rounded-lg min-h-[120px] border flex flex-col gap-1 transition-colors",
                        i === 2
                          ? "bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/20 ring-offset-1 dark:ring-offset-black"
                          : "bg-white border-slate-200 dark:bg-black/20 dark:border-white/5 text-slate-700 dark:text-slate-300 hover:border-emerald-500/30",
                      )}
                    >
                      <span>{12 + i}</span>
                      {i === 2 && (
                        <div className="mt-auto flex flex-col gap-1">
                          <div className="text-[9px] bg-white dark:bg-black/40 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-transparent dark:border-white/5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30">
                            <div className="font-bold">13.00</div>
                            {displaySantri[0]?.name.split(" ")[0]}
                          </div>
                          <div className="text-[9px] bg-white dark:bg-black/40 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-transparent dark:border-white/5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30">
                            <div className="font-bold">14.00</div>
                            {displaySantri[1]?.name.split(" ")[0]}
                          </div>
                          <div className="text-[9px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-blue-100 dark:border-blue-500/20 cursor-pointer hover:border-blue-300">
                            <div className="font-bold">15.00</div>
                            {displaySantri[2]?.name.split(" ")[0]}
                          </div>
                        </div>
                      )}
                      {i === 4 && (
                        <div className="mt-auto flex flex-col gap-1">
                          <div className="text-[9px] bg-white text-slate-700 dark:bg-black/40 dark:text-slate-300 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-slate-200 dark:border-white/5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30">
                            <div className="font-bold">16.00</div>
                            {displaySantri[3]?.name.split(" ")[0]}
                          </div>
                        </div>
                      )}
                      {i === 6 && (
                        <div className="mt-auto flex flex-col gap-1">
                          <div className="text-[9px] bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-amber-100 dark:border-amber-500/20 cursor-pointer hover:border-amber-300">
                            <div className="font-bold">09.00</div>
                            Ujian Tahfidz
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-emerald-800 dark:text-emerald-400 hidden-border">
            Sistem Tahfidz ITQAN
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Sistem Pemantauan Hafalan, Muroja'ah, dan Munaqasyah Al-Qur'an.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!SUPABASE_TAHFIDZ_RUNTIME && <button
            onClick={() =>
              isReminderEnabled
                ? setIsReminderEnabled(false)
                : setIsReminderModalOpen(true)
            }
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm border",
              isReminderEnabled
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                : "bg-white dark:bg-black/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5",
            )}
          >
            {isReminderEnabled ? (
              <BellRing className="w-4 h-4" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {isReminderEnabled ? "Pengingat Aktif" : "Aktifkan Pengingat"}
            </span>
          </button>}
          {!SUPABASE_TAHFIDZ_RUNTIME && <button className="flex items-center gap-2 bg-white dark:bg-black/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Ekspor Laporan</span>
          </button>}
          {!SUPABASE_TAHFIDZ_RUNTIME && <button
            onClick={() => {
              setSelectedSantri(displaySantri[0]);
              setIsAssessmentOpen(true);
            }}
            className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors border border-emerald-200 dark:border-emerald-500/20 shadow-sm"
          >
            <Mic className="w-4 h-4" />
            AI Audio Assessment
          </button>}
          {(!SUPABASE_TAHFIDZ_RUNTIME || canRecordTahfidz) && <button
            onClick={startNewTahfidzRecord}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Input Setoran
          </button>}
        </div>
      </div>

      {SUPABASE_TAHFIDZ_RUNTIME && (tahfidzLoading || tahfidzError) && (
        <div className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tahfidzError ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300")}>
          <span>{tahfidzError || "Memuat snapshot tenant Tahfidz dari Supabase…"}</span>
          {tahfidzError && <button onClick={() => { setTahfidzLoading(true); setTahfidzError(""); void refreshSupabaseTahfidz().catch((error: any) => setTahfidzError(error?.message || "Data belum dapat dimuat.")).finally(() => setTahfidzLoading(false)); }} className="font-semibold underline underline-offset-2">Coba lagi</button>}
        </div>
      )}
      {SUPABASE_TAHFIDZ_RUNTIME && rosterHasMore && <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/20 dark:bg-blue-950/20 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
        <span>Roster dimuat bertahap: {santriList.length}{rosterStats?.studentCount != null ? ` dari ${Number(rosterStats.studentCount)}` : " santri"}.</span>
        <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50">{rosterLoadingMore ? "Memuat…" : "Muat santri berikutnya"}</button>
      </div>}

      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-max mb-6 border border-slate-200 dark:border-white/5">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "dashboard"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Overview Halaqah
        </button>
        <button
          onClick={() => setActiveTab("records")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "records"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Log Setoran Terbaru
        </button>
        <button
          onClick={() => setActiveTab("targets")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "targets"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Target & Raport
        </button>
        <button
          onClick={() => setActiveTab("talaqqi")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "talaqqi"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Jadwal Talaqqi
        </button>
        <button
          onClick={() => setActiveTab("exams")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "exams"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Munaqasyah
        </button>
        <button
          onClick={() => setActiveTab("parent")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "parent"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Portal Wali Santri
        </button>
        <button
          onClick={() => setActiveTab("peer-review")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "peer-review"
              ? "bg-white dark:bg-[#1a1a1a] text-purple-600 dark:text-purple-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Peer Review
        </button>
        <button
          onClick={() => setActiveTab("quran")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "quran"
              ? "bg-white dark:bg-[#1a1a1a] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Al-Qur'an
        </button>
        <button
          onClick={() => setActiveTab("badges")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "badges"
              ? "bg-white dark:bg-[#1a1a1a] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          Pencapaian Tahfidz
        </button>
        <button
          onClick={() => setActiveTab("halaqah")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
            activeTab === "halaqah"
              ? "bg-white dark:bg-[#1a1a1a] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-white/5"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
          )}
        >
          {isTahfidzLearner && SUPABASE_TAHFIDZ_RUNTIME ? "Halaqah Saya" : "Manajemen Halaqah"}
        </button>
      </div>

      {activeTab === "dashboard" && (SUPABASE_TAHFIDZ_RUNTIME ? renderSupabaseDashboard() : renderDashboard())}
      {activeTab === "halaqah" && renderHalaqahManagement()}
      {activeTab === "records" && renderRecords()}
      {activeTab === "targets" && (SUPABASE_TAHFIDZ_RUNTIME ? renderSupabaseTargets() : renderTargets())}
      {activeTab === "talaqqi" && !SUPABASE_TAHFIDZ_RUNTIME && renderTalaqqiCalendar()}
      {activeTab === "exams" && !SUPABASE_TAHFIDZ_RUNTIME && renderExams()}
      {activeTab === "talaqqi" && SUPABASE_TAHFIDZ_RUNTIME && <SupabaseTahfidzSessions kind="talaqqi" students={displaySantri} halaqahs={displayHalaqah} tenantTimeZone={user?.tenantTimeZone} rosterHasMore={rosterHasMore} rosterLoadingMore={rosterLoadingMore} onLoadMoreRoster={() => void loadMoreTahfidzRoster()} />}
      {activeTab === "exams" && SUPABASE_TAHFIDZ_RUNTIME && <SupabaseTahfidzSessions kind="exam" students={displaySantri} halaqahs={displayHalaqah} tenantTimeZone={user?.tenantTimeZone} rosterHasMore={rosterHasMore} rosterLoadingMore={rosterLoadingMore} onLoadMoreRoster={() => void loadMoreTahfidzRoster()} />}
      {activeTab === "parent" && (SUPABASE_TAHFIDZ_RUNTIME ? renderSupabaseParentDashboard() : renderParentDashboard())}
      {activeTab === "peer-review" && !SUPABASE_TAHFIDZ_RUNTIME && renderPeerReview()}
      {activeTab === "badges" && !SUPABASE_TAHFIDZ_RUNTIME && renderBadges()}
      {activeTab === "badges" && SUPABASE_TAHFIDZ_RUNTIME && renderSupabaseAchievements()}
      {activeTab === "quran" && (
        <div className="flex-1 min-h-0">
          <QuranViewer />
        </div>
      )}
      {SUPABASE_TAHFIDZ_RUNTIME && activeTab === "peer-review" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-100">
          <h2 className="font-semibold">Peer review belum tersedia</h2>
          <p className="mt-2 max-w-3xl text-sm">Fitur ini belum memiliki penyimpanan audio, persetujuan wali, moderasi, dan aturan akses tenant. Konten contoh dari mode lama disembunyikan.</p>
        </div>
      )}

      {/* Target Harian Modal */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Set Target Harian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atur komitmen ziyadah dan muroja'ah
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setIsTargetModalOpen(false); setDashboardActionStudent(null); }}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Pilih Santri
                </label>
                {SUPABASE_TAHFIDZ_RUNTIME ? <TahfidzStudentSearchSelect
                  key={tahfidzStudentScopeKey}
                  scopeKey={tahfidzStudentScopeKey}
                  searchStudents={searchSupabaseTahfidzRoster}
                  initialStudents={selectableSantri}
                  selectedStudentId={targetForm.studentId}
                  selectedStudent={selectableSantri.find((student) => String(student.id) === String(targetForm.studentId)) || null}
                  onSelect={(student) => setTargetForm((current) => ({ ...current, studentId: String(student?.id || "") }))}
                /> : <select value={targetForm.studentId || ""} onChange={(event) => setTargetForm((current) => ({ ...current, studentId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-black/40 dark:text-slate-200"><option value="">Pilih santri…</option>{selectableSantri.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select>}
                {rosterHasMore && <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="mt-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri…" : "Santri belum terlihat? Muat halaman berikutnya"}</button>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                    Target Ziyadah (Hafalan Baru)
                  </label>
                  <select value={targetForm.ziyadahPagesPerDay} onChange={(e) => setTargetForm({ ...targetForm, ziyadahPagesPerDay: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                    <option value="0.5">½ Halaman</option>
                    <option value="1">1 Halaman</option>
                    <option value="2">2 Halaman</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5">
                    Target Muroja'ah (Pengulangan)
                  </label>
                  <select value={targetForm.murojaahPagesPerDay} onChange={(e) => setTargetForm({ ...targetForm, murojaahPagesPerDay: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                    <option value="0.25">¼ Halaman</option>
                    <option value="0.5">½ Halaman</option>
                    <option value="1">1 Halaman</option>
                    <option value="2">2 Halaman</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Tipe Sanksi/Reward (Opsional)
                </label>
                <select value={targetForm.policy} onChange={(e) => setTargetForm({ ...targetForm, policy: e.target.value })} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs font-semibold text-slate-500">Mulai berlaku<input type="date" value={targetForm.periodStart} onChange={(e) => setTargetForm({ ...targetForm, periodStart: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 dark:border-white/10 dark:bg-black/40 dark:text-slate-200" /></label>
                <label className="text-xs font-semibold text-slate-500">Akhir periode (opsional)<input type="date" value={targetForm.periodEnd} onChange={(e) => setTargetForm({ ...targetForm, periodEnd: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 dark:border-white/10 dark:bg-black/40 dark:text-slate-200" /></label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => { setIsTargetModalOpen(false); setDashboardActionStudent(null); }}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => void handleTargetSubmit()}
                disabled={isSavingTarget || !targetForm.studentId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {isSavingTarget ? "Menyimpan…" : "Simpan Target"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isHalaqahModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm dark:bg-black/80">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-slate-100">{editingHalaqah ? "Ubah Halaqah" : "Tambah Halaqah"}</h2><p className="mt-1 text-sm text-slate-500">Perubahan disimpan melalui API tenant Supabase.</p></div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nama halaqah<input value={halaqahForm.name} onChange={(e) => setHalaqahForm({ ...halaqahForm, name: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40" maxLength={120} /></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ustadz pengampu<select value={halaqahForm.ustadzUserId} onChange={(e) => setHalaqahForm({ ...halaqahForm, ustadzUserId: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40"><option value="">Pilih ustadz…</option>{ustadzOptions.map((option) => <option key={option.userId} value={option.userId}>{option.name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Jadwal<input value={halaqahForm.schedule} onChange={(e) => setHalaqahForm({ ...halaqahForm, schedule: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40" maxLength={500} /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ruang/lokasi<input value={halaqahForm.room} onChange={(e) => setHalaqahForm({ ...halaqahForm, room: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40" maxLength={180} /></label></div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Target harian halaqah (halaman)<input type="number" min="0" max="100" step="0.01" value={halaqahForm.dailyTargetPages} onChange={(e) => setHalaqahForm({ ...halaqahForm, dailyTargetPages: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20"><button onClick={() => setIsHalaqahModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button onClick={() => void handleHalaqahSubmit()} disabled={isSavingHalaqah || !halaqahForm.name.trim() || !halaqahForm.ustadzUserId} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSavingHalaqah ? "Menyimpan…" : "Simpan Halaqah"}</button></div>
          </div>
        </div>
      )}

      {isMembershipModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm dark:bg-black/80">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-slate-100">Tempatkan Santri ke Halaqah</h2><p className="mt-1 text-sm text-slate-500">Penempatan aktif akan disimpan pada tenant Supabase.</p></div>
            <div className="space-y-4 p-5">
              <div><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Santri</span>{SUPABASE_TAHFIDZ_RUNTIME ? <TahfidzStudentSearchSelect
                key={tahfidzStudentScopeKey}
                scopeKey={tahfidzStudentScopeKey}
                searchStudents={searchSupabaseTahfidzRoster}
                initialStudents={selectableSantri}
                selectedStudentId={membershipForm.studentId}
                selectedStudent={selectableSantri.find((student) => String(student.id) === String(membershipForm.studentId)) || null}
                onSelect={(student) => setMembershipForm((current) => ({ ...current, studentId: String(student?.id || "") }))}
              /> : <select value={membershipForm.studentId} onChange={(event) => setMembershipForm((current) => ({ ...current, studentId: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40"><option value="">Pilih santri…</option>{selectableSantri.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select>}{SUPABASE_TAHFIDZ_RUNTIME && rosterHasMore && <button type="button" onClick={() => void loadMoreTahfidzRoster()} disabled={rosterLoadingMore} className="mt-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 disabled:opacity-50 dark:text-emerald-300">{rosterLoadingMore ? "Memuat santri…" : "Santri belum terlihat? Muat halaman berikutnya"}</button>}</div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Halaqah<select value={membershipForm.halaqahId} onChange={(e) => setMembershipForm({ ...membershipForm, halaqahId: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40"><option value="">Pilih halaqah…</option>{halaqahList.map((halaqah) => <option key={halaqah.id} value={halaqah.id}>{halaqah.name}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mulai tanggal<input type="date" value={membershipForm.startsOn} onChange={(e) => setMembershipForm({ ...membershipForm, startsOn: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/40" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20"><button onClick={() => { setIsMembershipModalOpen(false); setDashboardActionStudent(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-white/10">Batal</button><button onClick={() => void handleMembershipSubmit()} disabled={isSavingMembership || !membershipForm.studentId || !membershipForm.halaqahId || !membershipForm.startsOn} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{isSavingMembership ? "Menyimpan…" : "Simpan Penempatan"}</button></div>
          </div>
        </div>
      )}

      {/* Reminder Notification Modal */}
      {isReminderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Pengingat Hafalan Harian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kirim notifikasi ke santri/wali
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReminderModalOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Waktu Pengingat
                </label>
                <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                  <option>05:00 WIB (Ba'da Subuh)</option>
                  <option>16:00 WIB (Ba'da Ashar)</option>
                  <option>18:30 WIB (Ba'da Maghrib)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Penerima Notifikasi
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Aplikasi Wali Santri
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      WhatsApp / SMS Wali Santri
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Pesan Default
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  defaultValue="Ahlan wa sahlan! Jangan lupa untuk menunaikan target hafalan harian Ananda hari ini. Semoga Allah mudahkan."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsReminderModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setIsReminderEnabled(true);
                  setIsReminderModalOpen(false);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Aktifkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {isProfileOpen && selectedSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Profil & Pencapaian Santri
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedSantri.name} • {selectedSantri.nis}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  setSelectedSantri(null);
                }}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col md:flex-row gap-6 mb-6">
                <div className="w-full md:w-1/3 flex flex-col items-center p-4 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold border-2 border-emerald-200 dark:border-emerald-500/30 text-2xl mb-3">
                    {selectedSantri.name.substring(0, 2).toUpperCase()}
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 text-center">
                    {selectedSantri.name}
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    {selectedSantri.grade}
                  </p>

                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Mutu Hafalan</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        Jayyid Jiddan
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Kehadiran</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        95%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total Hafalan</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        14 Juz
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-2/3">
                  <GamificationProfile
                    studentId={selectedSantri.id}
                    studentName={selectedSantri.name}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end">
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  setSelectedSantri(null);
                }}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {isCommentModalOpen && selectedSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Evaluasi & Komentar Guru
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedSantri.name} • {selectedSantri.nis}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCommentModalOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Komentar / Catatan Khusus
                </label>
                <textarea
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  placeholder="Masukkan evaluasi atau pesan penyemangat untuk santri..."
                />
                <p className="text-[10px] text-slate-500 mt-1.5 italic">
                  Catatan ini akan terlihat di raport dan aplikasi wali santri.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsCommentModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => setIsCommentModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Kirim Komentar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Talaqqi Scheduling Modal */}
      {isTalaqqiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Jadwalkan Sesi Talaqqi
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih santri dan waktu bimbingan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTalaqqiModalOpen(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Santri
                </label>
                <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                  <option value="">Pilih Santri...</option>
                  {displaySantri.map((s) => (
                    <option key={`talaqqi-s-${s.id}`}>
                      {s.name} - {s.nis}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Waktu
                  </label>
                  <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                    <option>08:00 WIB</option>
                    <option>09:00 WIB</option>
                    <option>10:00 WIB</option>
                    <option>13:00 WIB</option>
                    <option>14:00 WIB</option>
                    <option>15:00 WIB</option>
                    <option>16:00 WIB</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Fokus Bimbingan
                </label>
                <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-2">
                  <option>Makharijul Huruf</option>
                  <option>Sifatul Huruf</option>
                  <option>Ahkamul Tajwid (Ghunnah, Mad, dsb)</option>
                  <option>Lancar Hafalan (Muraja'ah)</option>
                  <option>Persiapan Munaqasyah</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  placeholder="Misal: Bawa mushaf ustmani..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsTalaqqiModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => setIsTalaqqiModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Simpan Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flashcard Modal */}
      {isFlashcardOpen && selectedSantri && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in transition-all duration-700",
            isFocusMode
              ? "bg-slate-900 dark:bg-black"
              : "bg-slate-900/60 dark:bg-black/80",
          )}
        >
          {isFocusMode && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
              <div className="w-[800px] h-[800px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse"></div>
            </div>
          )}
          <div
            className={cn(
              "bg-white dark:bg-slate-900 rounded-2xl overflow-hidden flex flex-col transition-all duration-500 relative z-10",
              isFocusMode
                ? "w-full max-w-4xl min-h-[70vh] shadow-[0_0_50px_rgba(16,185,129,0.15)] border-transparent bg-white/90 dark:bg-black/60 backdrop-blur-xl"
                : "w-full max-w-lg shadow-2xl max-h-[90vh] border border-slate-200 dark:border-white/10",
            )}
          >
            <div
              className={cn(
                "flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40",
                isFocusMode && "bg-transparent border-transparent",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-3 transition-opacity duration-300",
                  isFocusMode && "opacity-0",
                )}
              >
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Smart Flashcards
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedSantri.name} • {selectedSantri.lastSetoran}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
                  title={isFocusMode ? "Tutup Focus Mode" : "Mulai Focus Mode"}
                >
                  {isFocusMode ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsFlashcardOpen(false);
                    setIsFlipped(false);
                    setFlashcardIndex(0);
                    setIsFocusMode(false);
                  }}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              className={cn(
                "flex flex-col items-center transition-all duration-500 flex-1 justify-center",
                isFocusMode ? "p-12 mb-8" : "p-6 min-h-[300px]",
              )}
            >
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className={cn(
                  "relative w-full cursor-pointer perspective-1000 mx-auto",
                  isFocusMode ? "h-80 max-w-2xl" : "h-48",
                )}
                style={{ perspective: "1000px" }}
              >
                <div
                  className={cn(
                    "w-full h-full absolute top-0 left-0 transition-all duration-700 rounded-xl flex items-center justify-center p-6 text-center shadow-sm",
                    isFlipped
                      ? "opacity-0 -rotate-y-180 bg-slate-50 dark:bg-black/40 border-2 border-slate-200 dark:border-white/10"
                      : "opacity-100 rotate-y-0 bg-white dark:bg-black/20 border-2 border-slate-200 dark:border-white/10",
                    isFocusMode &&
                      !isFlipped &&
                      "border-emerald-200/50 dark:border-emerald-500/30 shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
                  )}
                  style={{
                    backfaceVisibility: "hidden",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  <div
                    className={cn(
                      "transition-transform duration-500",
                      isFocusMode && "scale-125",
                    )}
                  >
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 block">
                      Depan (Ayat)
                    </span>
                    <h2
                      className={cn(
                        "font-medium text-slate-800 dark:text-slate-200 leading-snug",
                        isFocusMode ? "text-4xl leading-relaxed" : "text-2xl",
                      )}
                      dir="rtl"
                    >
                      {selectedSantri.lastSetoran.includes("Mulk")
                        ? "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ"
                        : "عَمَّ يَتَسَاءَلُونَ"}
                    </h2>
                    <p
                      className={cn(
                        "text-slate-400 mt-6",
                        isFocusMode ? "text-sm" : "text-xs",
                      )}
                    >
                      Ketuk untuk membalik
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "w-full h-full absolute top-0 left-0 transition-all duration-700 rounded-xl flex items-center justify-center p-6 text-center border-2 border-emerald-200 dark:border-emerald-500/20 shadow-sm",
                    isFlipped
                      ? "opacity-100 rotate-y-0 bg-emerald-50 dark:bg-emerald-950/20"
                      : "opacity-0 rotate-y-180 bg-white dark:bg-black/20",
                    isFocusMode &&
                      isFlipped &&
                      "shadow-[0_8px_30px_rgba(16,185,129,0.15)]",
                  )}
                  style={{
                    backfaceVisibility: "hidden",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(0deg)" : "rotateY(-180deg)",
                  }}
                >
                  <div
                    className={cn(
                      "transition-transform duration-500 flex flex-col h-full",
                      isFocusMode && "scale-110",
                    )}
                  >
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-4 block">
                      Belakang (Arti)
                    </span>
                    <p
                      className={cn(
                        "font-medium text-slate-700 dark:text-slate-300 flex-1 flex items-center justify-center",
                        isFocusMode ? "text-2xl leading-relaxed" : "text-sm",
                      )}
                    >
                      {selectedSantri.lastSetoran.includes("Mulk")
                        ? "Maha Suci Allah yang di tangan-Nya-lah segala kerajaan"
                        : "Tentang apakah mereka saling bertanya-tanya?"}
                    </p>
                    <p
                      className={cn(
                        "text-slate-400 mt-6",
                        isFocusMode ? "text-sm" : "text-xs",
                      )}
                    >
                      Ketuk untuk membalik kembali
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-center justify-between w-full mx-auto",
                  isFocusMode ? "max-w-2xl mt-12" : "mt-8",
                )}
              >
                <button
                  onClick={() => {
                    setFlashcardIndex(Math.max(0, flashcardIndex - 1));
                    setIsFlipped(false);
                  }}
                  disabled={flashcardIndex === 0}
                  className={cn(
                    "p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors",
                    isFocusMode &&
                      "p-4 hover:bg-slate-200/50 dark:hover:bg-white/10 bg-slate-100/50 dark:bg-white/5",
                  )}
                >
                  <ArrowLeft
                    className={cn(isFocusMode ? "w-6 h-6" : "w-5 h-5")}
                  />
                </button>

                <div
                  className={cn(
                    "font-medium text-slate-500",
                    isFocusMode ? "text-lg" : "text-sm",
                  )}
                >
                  Card {flashcardIndex + 1} of 3
                </div>

                <button
                  onClick={() => {
                    setFlashcardIndex(Math.min(2, flashcardIndex + 1));
                    setIsFlipped(false);
                  }}
                  disabled={flashcardIndex === 2}
                  className={cn(
                    "p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors",
                    isFocusMode &&
                      "p-4 hover:bg-slate-200/50 dark:hover:bg-white/10 bg-slate-100/50 dark:bg-white/5",
                  )}
                >
                  <ArrowRight
                    className={cn(isFocusMode ? "w-6 h-6" : "w-5 h-5")}
                  />
                </button>
              </div>
            </div>

            <div
              className={cn(
                "p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-between gap-3 transition-opacity duration-300",
                isFocusMode &&
                  "opacity-0 absolute bottom-0 w-full pointer-events-none",
              )}
            >
              <button
                onClick={() => {
                  setIsFlipped(false);
                  setFlashcardIndex(0);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5 transition-colors pointer-events-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Ulangi
              </button>
              <div className="flex gap-2 pointer-events-auto">
                <button
                  onClick={() => {
                    setFlashcardIndex(Math.min(2, flashcardIndex + 1));
                    setIsFlipped(false);
                  }}
                  className="px-4 py-2 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 rounded-lg text-sm font-medium transition-colors"
                >
                  Perlu Ulang
                </button>
                <button
                  onClick={() => {
                    if (flashcardIndex === 2) {
                      setIsFlashcardOpen(false);
                      setIsFocusMode(false);
                    } else {
                      setFlashcardIndex(Math.min(2, flashcardIndex + 1));
                      setIsFlipped(false);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  Hafal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Automated Progress Summary Modal */}
      {isSummaryOpen && selectedSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
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
      {isAiPlannerOpen && (
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
      {isInputOpen && (
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
                        const juzNum = parseInt(e.target.value);
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
                      onChange={(e) => {
                        const surahVal = e.target.value;
                        const surah = surahList.find(
                          (s) => s.namaLatin === surahVal,
                        );
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
                      <option value="">-- Surah --</option>
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
                      onChange={(e) => {
                        const startAyat = parseInt(e.target.value);
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
                          ayatStart: e.target.value,
                          ayat: `${e.target.value}-${formData.ayatEnd || e.target.value}`,
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">-- Mulai --</option>
                      {(() => {
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
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          ayatEnd: e.target.value,
                          ayat: `${formData.ayatStart || e.target.value}-${e.target.value}`,
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option value="">-- Selesai --</option>
                      {(() => {
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
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
                >
                  Simpan Setoran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Assessment Modal */}
      {!SUPABASE_TAHFIDZ_RUNTIME && isAssessmentOpen && selectedSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-500/30">
                  {selectedSantri.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                    AI Audio Assessment
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
      {isExamModalOpen && (
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
      {isExamActive && (
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
      {isMilestoneModalOpen && (
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
      {isPeerReviewOpen && selectedReview && (
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

      {/* Printable Study Plan Modal */}
      {isPrintPlanOpen && (
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
