import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect } from "react";
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
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";

const SUPABASE_TAHFIDZ_CUTOVER = import.meta.env.VITE_SUPABASE_TAHFIDZ_CUTOVER === "true";

function createTahfidzRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function requestSupabaseTahfidzApi(path: string, init: RequestInit = {}) {
  if (!auth.currentUser) throw new Error("Sesi login tidak tersedia. Silakan masuk kembali.");
  const token = await auth.currentUser.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Data Tahfidz belum dapat diproses.");
  return payload;
}

function mapSupabaseTahfidzSnapshot(snapshot: any) {
  const roster = Array.isArray(snapshot?.roster) ? snapshot.roster : [];
  const halaqahs = Array.isArray(snapshot?.halaqahs) ? snapshot.halaqahs : [];
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const mappedSantri = roster.map((student: any) => ({
    id: String(student.id),
    nis: String(student.nis || ""),
    name: String(student.name || ""),
    grade: String(student.grade || ""),
    halaqahId: student.halaqahId ? String(student.halaqahId) : "",
    halaqah: String(student.halaqah || ""),
    juz: null,
    status: "Belum ada analitik hafalan",
    progress: 0,
    lastSetoran: "-",
    score: null,
    target: student.target || null,
  }));
  const mappedHalaqahs = halaqahs.map((halaqah: any) => ({
    id: String(halaqah.id),
    name: String(halaqah.name || ""),
    ustadz: String(halaqah.ustadz || ""),
    schedule: String(halaqah.schedule || ""),
    room: String(halaqah.room || ""),
    target: `Ziyadah ${Number(halaqah.dailyTargetPages || 0)} halaman/hari`,
    dailyTargetPages: Number(halaqah.dailyTargetPages || 0),
  }));
  const halaqahNameById = new Map(mappedHalaqahs.map((halaqah: any) => [halaqah.id, halaqah.name]));
  const mappedRecords = records.map((record: any) => {
    const performedAt = new Date(record.performedAt);
    const isValidDate = Number.isFinite(performedAt.getTime());
    const pad = (value: number) => String(value).padStart(2, "0");
    return {
      id: String(record.id),
      studentId: String(record.studentId || ""),
      halaqahId: String(record.halaqahId || ""),
      halaqah: String(halaqahNameById.get(String(record.halaqahId || "")) || ""),
      date: isValidDate ? `${performedAt.getFullYear()}-${pad(performedAt.getMonth() + 1)}-${pad(performedAt.getDate())}` : "",
      time: isValidDate ? `${pad(performedAt.getHours())}:${pad(performedAt.getMinutes())}` : "",
      santriName: String(record.studentName || "Santri tidak tersedia"),
      nis: String(record.nis || ""),
      type: String(record.activityType || ""),
      surah: String(record.surah || ""),
      ayat: record.ayahStart === record.ayahEnd ? String(record.ayahStart) : `${record.ayahStart}-${record.ayahEnd}`,
      fluency: record.fluency || "-",
      tajweed: record.tajweed || "-",
      notes: String(record.notes || ""),
      ust: String(record.recordedByName || ""),
    };
  });
  return { roster: mappedSantri, halaqahs: mappedHalaqahs, records: mappedRecords };
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
  const [isTahfidzMigrationOpen, setIsTahfidzMigrationOpen] = useState(false);
  const [tahfidzMigrationReport, setTahfidzMigrationReport] = useState<any>(null);
  const [tahfidzMigrationError, setTahfidzMigrationError] = useState("");
  const [isTahfidzMigrationBusy, setIsTahfidzMigrationBusy] = useState(false);
  const [confirmTahfidzMigration, setConfirmTahfidzMigration] = useState(false);
  const canManageTahfidzMigration = ["Admin", "SuperAdmin"].includes(String(role)) && user?.modulePermissions?.tahfidz !== false;
  const runTahfidzMigration = async (apply: boolean) => {
    if (!auth.currentUser) {
      setTahfidzMigrationError("Sesi login tidak tersedia. Silakan masuk kembali.");
      return;
    }
    setIsTahfidzMigrationBusy(true);
    setTahfidzMigrationError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/tahfidz/migrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify(apply
          ? {
              apply: true,
              confirm: "IMPORT_TAHFIDZ_HALAQAHS_AND_MEMBERSHIPS",
              previewFingerprint: tahfidzMigrationReport?.previewFingerprint,
            }
          : { apply: false }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (apply && response.status === 409) {
          setTahfidzMigrationReport(null);
          setConfirmTahfidzMigration(false);
        }
        throw new Error(payload.error || "Migrasi Tahfidz belum dapat diproses.");
      }
      setTahfidzMigrationReport(payload);
      setConfirmTahfidzMigration(false);
    } catch (error: any) {
      setTahfidzMigrationError(error?.message || "Migrasi Tahfidz belum dapat diproses.");
    } finally {
      setIsTahfidzMigrationBusy(false);
    }
  };
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
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [selectedSantri, setSelectedSantri] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [halaqahList, setHalaqahList] = useState<any[]>([]);
  const [selectedHalaqahFilter, setSelectedHalaqahFilter] =
    useState("Semua Halaqah");
  const [santriList, setSantriList] = useState<any[]>(
    SUPABASE_TAHFIDZ_CUTOVER ? [] : SANTRI_DATA,
  );
  const [records, setRecords] = useState<any[]>(
    SUPABASE_TAHFIDZ_CUTOVER ? [] : INITIAL_RECORDS,
  );
  const [isTahfidzDataLoading, setIsTahfidzDataLoading] = useState(SUPABASE_TAHFIDZ_CUTOVER);
  const [hasSupabaseTahfidzSnapshot, setHasSupabaseTahfidzSnapshot] = useState(!SUPABASE_TAHFIDZ_CUTOVER);
  const [isSavingTahfidzRecord, setIsSavingTahfidzRecord] = useState(false);
  const [tahfidzDataError, setTahfidzDataError] = useState("");
  const pendingRecordRequestsRef = React.useRef(new Map<string, { id: string; payload: any }>());
  const [formData, setFormData] = useState<any>({
    type: "Ziyadah",
    fluency: "A",
    tajweed: "A",
  });

  const loadSupabaseTahfidzSnapshot = async () => {
    const snapshot = await requestSupabaseTahfidzApi("/api/tahfidz/snapshot");
    const mapped = mapSupabaseTahfidzSnapshot(snapshot);
    setHalaqahList(mapped.halaqahs);
    setSantriList(mapped.roster);
    setRecords(mapped.records);
    setHasSupabaseTahfidzSnapshot(true);
    return mapped;
  };

  useEffect(() => {
    if (SUPABASE_TAHFIDZ_CUTOVER) {
      let cancelled = false;
      setIsTahfidzDataLoading(true);
      setHasSupabaseTahfidzSnapshot(false);
      setTahfidzDataError("");
      setHalaqahList([]);
      setSantriList([]);
      setRecords([]);
      if (!user?.tenantId || !user?.uid || user?.modulePermissions?.tahfidz === false) {
        setTahfidzDataError("Akses Tahfidz atau identitas tenant belum tersedia.");
        setHasSupabaseTahfidzSnapshot(false);
        setIsTahfidzDataLoading(false);
        return () => { cancelled = true; };
      }
      requestSupabaseTahfidzApi("/api/tahfidz/snapshot")
        .then((snapshot) => {
          if (cancelled) return;
          const mapped = mapSupabaseTahfidzSnapshot(snapshot);
          setHalaqahList(mapped.halaqahs);
          setSantriList(mapped.roster);
          setRecords(mapped.records);
          setHasSupabaseTahfidzSnapshot(true);
        })
        .catch((error: any) => {
          if (!cancelled) {
            setHasSupabaseTahfidzSnapshot(false);
            setTahfidzDataError(error?.message || "Data Tahfidz Supabase belum dapat dimuat.");
          }
        })
        .finally(() => {
          if (!cancelled) setIsTahfidzDataLoading(false);
        });
      return () => { cancelled = true; };
    }

    // Transitional legacy source, tenant scoped until the Supabase runtime is enabled.
    const qHalaqah = tenantScopedQuery(collection(db, "master_data"), user?.tenantId, where("category", "==", "Halaqah"));
    const unsubHalaqah = onSnapshot(qHalaqah, (snapshot) => {
      const h: any[] = [];
      snapshot.forEach((doc) => {
        h.push({ id: doc.id, ...(doc.data() as Record<string, any>) });
      });
      setHalaqahList(h);
    });

    const canReadSantriList = ["Admin", "SuperAdmin", "Ustadz"].includes(role) && user?.modulePermissions?.tahfidz !== false;
    let unsubSantri: () => void = () => {};
    if (canReadSantriList) {
      const qSantri = tenantScopedQuery(collection(db, "entityRecords"), user?.tenantId, where("type", "==", "Santri"));
      unsubSantri = onSnapshot(qSantri, (snapshot) => {
        const s: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, any>;
          s.push({
            id: doc.id,
            nis: data.id || "N/A",
            name: data.name,
            grade: data.gradeOrDepartment || "N/A",
            halaqah: data.halaqah || "Abu Bakar",
            juz: 0,
            status: "on-track",
            progress: 0,
            lastSetoran: "-",
            score: 0,
          });
        });
        if (s.length > 0) setSantriList(s);
        else setSantriList([]);
      }, (error) => {
        setTahfidzDataError(error?.message || "Data santri Tahfidz belum dapat dimuat.");
      });
    } else {
      setSantriList([]);
    }

    return () => {
      unsubHalaqah();
      unsubSantri();
    };
  }, [user?.tenantId, user?.uid, role, user?.modulePermissions?.tahfidz]);

  const handleInputSubmit = async (e: React.FormEvent | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (SUPABASE_TAHFIDZ_CUTOVER) {
      const selectedStudent = santriList.find((student) => student.id === formData.studentId);
      if (!selectedStudent?.halaqahId) {
        setTahfidzDataError("Santri harus terdaftar pada halaqah aktif sebelum setoran dicatat.");
        return;
      }
      const inputFingerprint = JSON.stringify({
        studentId: selectedStudent.id,
        halaqahId: selectedStudent.halaqahId,
        activityType: formData.type,
        surahName: formData.surah,
        ayahRange: formData.ayat,
        fluencyGrade: formData.fluency || "A",
        tajweedGrade: formData.tajweed || "A",
        notes: formData.notes || "",
        time: formData.time || "",
      });
      let pendingRecord = pendingRecordRequestsRef.current.get(inputFingerprint);
      if (!pendingRecord) {
        const timeParts = String(formData.time || "").match(/^(\d{2}):(\d{2})$/);
        const performedAt = new Date();
        if (timeParts) performedAt.setHours(Number(timeParts[1]), Number(timeParts[2]), 0, 0);
        pendingRecord = {
          id: createTahfidzRequestId(),
          payload: {
            studentId: selectedStudent.id,
            halaqahId: selectedStudent.halaqahId,
            activityType: formData.type,
            surahName: formData.surah,
            ayahRange: formData.ayat,
            fluencyGrade: formData.fluency || "A",
            tajweedGrade: formData.tajweed || "A",
            notes: formData.notes || "",
            performedAt: performedAt.toISOString(),
          },
        };
        pendingRecordRequestsRef.current.set(inputFingerprint, pendingRecord);
      }
      const recordPayload = pendingRecord.payload;
      setIsSavingTahfidzRecord(true);
      setTahfidzDataError("");
      try {
        await requestSupabaseTahfidzApi("/api/tahfidz/records", {
          method: "POST",
          body: JSON.stringify({
            record: {
              ...recordPayload,
              clientRequestId: pendingRecord.id,
            },
          }),
        });
        pendingRecordRequestsRef.current.delete(inputFingerprint);
        setFormData({ type: "Ziyadah", fluency: "A", tajweed: "A" });
        setIsInputOpen(false);
        try {
          await loadSupabaseTahfidzSnapshot();
        } catch {
          setTahfidzDataError("Setoran tersimpan, tetapi daftar belum dapat diperbarui. Muat ulang untuk melihatnya.");
        }
      } catch (error: any) {
        setTahfidzDataError(error?.message || "Setoran belum dapat disimpan ke Supabase.");
      } finally {
        setIsSavingTahfidzRecord(false);
      }
      return;
    }

    const newRecord = {
      id: generateUniqueId("Record Tahfidz", []),
      date: formData.date || new Date().toISOString().split("T")[0],
      time: formData.time || new Date().toTimeString().substring(0, 5),
      santriName: formData.santriName || "Unknown Santri",
      type: formData.type,
      surah: formData.surah || "-",
      ayat: formData.ayat || "-",
      fluency: formData.fluency,
      tajweed: formData.tajweed,
      notes: formData.notes || "-",
      ust: user?.name || "Ustadz",
    };
    setRecords([newRecord, ...records]);
    setFormData({ type: "Ziyadah", fluency: "A", tajweed: "A" });
    setIsInputOpen(false);
  };

  const filteredSantri = santriList.filter((student) => {
    const matchQuery =
      String(student.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(student.nis || "").includes(searchQuery);
    const matchHalaqah =
      selectedHalaqahFilter === "Semua Halaqah" ||
      student.halaqah === selectedHalaqahFilter;
    return matchQuery && matchHalaqah;
  });

  const localDateKey = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const todayKey = localDateKey(new Date());
  const recordsToday = records.filter((record) => record.date === todayKey);
  const studentsSubmittingToday = new Set(
    recordsToday.map((record) => record.studentId || record.santriName).filter(Boolean),
  ).size;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const recordsLast30Days = records.filter(
    (record) => record.date >= localDateKey(thirtyDaysAgo) && record.date <= todayKey,
  );
  const weeklySetoranData = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date();
    dayDate.setHours(0, 0, 0, 0);
    dayDate.setDate(dayDate.getDate() - (6 - index));
    const dayRecords = records.filter((record) => record.date === localDateKey(dayDate));
    return {
      day: dayDate.toLocaleDateString("id-ID", { weekday: "short" }),
      Ziyadah: dayRecords.filter((record) => record.type === "Ziyadah").length,
      "Muroja'ah": dayRecords.filter((record) => record.type === "Muroja'ah").length,
      Lainnya: dayRecords.filter((record) => !["Ziyadah", "Muroja'ah"].includes(record.type)).length,
      santriSetor: new Set(dayRecords.map((record) => record.studentId || record.santriName).filter(Boolean)).size,
      jumlahSetoran: dayRecords.length,
    };
  });

  const renderHalaqahManagement = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Manajemen Halaqah
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Atur pembagian halaqah, ustadz pengampu, dan daftar santri
          </p>
        </div>
        {!SUPABASE_TAHFIDZ_CUTOVER && (
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Halaqah
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {SUPABASE_TAHFIDZ_CUTOVER && halaqahList.length === 0 ? (
          <div className="lg:col-span-3 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">
            {isTahfidzDataLoading
              ? "Memuat halaqah..."
              : tahfidzDataError
                ? "Halaqah belum dapat dimuat. Periksa pesan status di atas."
                : "Belum ada halaqah aktif pada tenant ini."}
          </div>
        ) : (SUPABASE_TAHFIDZ_CUTOVER ? halaqahList : MOCK_HALAQAH).map((halaqah) => {
          const halaqahSantri = santriList.filter((student) =>
            SUPABASE_TAHFIDZ_CUTOVER
              ? student.halaqahId === halaqah.id
              : student.halaqah === halaqah.name,
          );
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
                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                  <Settings2 className="w-4 h-4" />
                </button>
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
                      {halaqahSantri.length} Orang
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
                    <button className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                      Lihat Semua
                    </button>
                  </div>
                  <div className="space-y-2">
                    {halaqahSantri.length > 0 ? (
                      halaqahSantri.slice(0, 3).map((santri) => (
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
                            {santri.juz} Juz
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-sm text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                        Belum ada santri
                      </div>
                    )}
                    {halaqahSantri.length > 3 && (
                      <div className="text-center pt-2">
                        <span className="text-xs text-slate-500">
                          +{halaqahSantri.length - 3} santri lainnya
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 flex gap-2">
                <button
                  onClick={() => {
                    setSelectedHalaqahFilter(halaqah.name);
                    setActiveTab("dashboard");
                  }}
                  className="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Detail Halaqah
                </button>
                <button
                  onClick={() => {
                    setSelectedHalaqahFilter(halaqah.name);
                    setActiveTab("records");
                    setIsAssessmentOpen(true);
                  }}
                  className="flex-1 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                >
                  Input Setoran
                </button>
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
            {SUPABASE_TAHFIDZ_CUTOVER
              ? hasSupabaseTahfidzSnapshot ? santriList.length.toLocaleString("id-ID") : "—"
              : "1,240"}
          </h3>
        </div>
        <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
            {SUPABASE_TAHFIDZ_CUTOVER ? "Setoran 30 Hari Terakhir" : "Rata-rata Setoran/Bulan"}
          </p>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {SUPABASE_TAHFIDZ_CUTOVER
              ? hasSupabaseTahfidzSnapshot ? `${recordsLast30Days.length.toLocaleString("id-ID")} setoran` : "—"
              : "12 Halaman"}
          </h3>
        </div>
        <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-4 rounded-xl">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
            {SUPABASE_TAHFIDZ_CUTOVER ? "Santri Setor Hari Ini" : "Rata-rata Mutu (Skor)"}
          </p>
          <h3 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {SUPABASE_TAHFIDZ_CUTOVER
              ? hasSupabaseTahfidzSnapshot ? `${studentsSubmittingToday.toLocaleString("id-ID")} santri` : "—"
              : <>88.5%{" "}<span className="text-xs font-normal text-slate-500 flex-inline items-center gap-1"><BookOpen className="w-3 h-3 inline" /> Jayyid Jiddan</span></>}
          </h3>
        </div>
        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-4 rounded-xl">
          <p className="text-xs text-amber-600 dark:text-amber-500/70 uppercase tracking-wider font-semibold mb-1">
            {SUPABASE_TAHFIDZ_CUTOVER ? "Halaqah Aktif" : "Perlu Perhatian Khusus"}
          </p>
          <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {SUPABASE_TAHFIDZ_CUTOVER
              ? hasSupabaseTahfidzSnapshot ? `${halaqahList.length.toLocaleString("id-ID")} halaqah` : "—"
              : "42 Santri"}
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
                    placeholder="Cari santri berdasar nama/NIS..."
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
                              title="Student Profile"
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
                              title="Generate Progress Summary"
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
                              title="Teacher Comments"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSantri(santri);
                                setIsAssessmentOpen(true);
                              }}
                              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors shadow-sm"
                              title="AI Audio Assessment"
                            >
                              <Mic className="w-4 h-4" />
                            </button>
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
                        Tidak ada santri yang cocok dengan pencarian Anda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
              {[...santriList]
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
            {!SUPABASE_TAHFIDZ_CUTOVER && <button
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

  const renderRecords = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Quick Entry Form */}
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-auto flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-1.5">
            Santri
          </label>
          <select
            value={SUPABASE_TAHFIDZ_CUTOVER ? formData.studentId || "" : formData.santriName || ""}
            onChange={(e) => {
              const student = santriList.find((item) =>
                SUPABASE_TAHFIDZ_CUTOVER ? item.id === e.target.value : item.name === e.target.value,
              );
              setFormData({
                ...formData,
                studentId: SUPABASE_TAHFIDZ_CUTOVER ? student?.id || "" : undefined,
                halaqahId: SUPABASE_TAHFIDZ_CUTOVER ? student?.halaqahId || "" : undefined,
                santriName: student?.name || "",
              });
            }}
            className="w-full bg-white dark:bg-black/40 border border-emerald-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">-- Pilih Santri --</option>
            {santriList.map((s) => (
              <option key={s.id} value={SUPABASE_TAHFIDZ_CUTOVER ? s.id : s.name}>
                {s.name} - {s.nis}
              </option>
            ))}
          </select>
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
        <button
          onClick={handleInputSubmit}
          disabled={isSavingTahfidzRecord || isTahfidzDataLoading || !formData.santriName || !formData.surah || !formData.ayat}
          className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20 whitespace-nowrap flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> {isSavingTahfidzRecord ? "Menyimpan..." : "Entri Cepat"}
        </button>
      </div>

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
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                    {isTahfidzDataLoading
                      ? "Memuat catatan setoran..."
                      : tahfidzDataError
                        ? "Catatan belum dapat dimuat. Periksa pesan status di atas."
                        : "Belum ada catatan setoran pada periode ini."}
                  </td>
                </tr>
              ) : records.map((r) => (
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
                    <div className="text-xs text-slate-500 mt-0.5">
                      {[r.halaqah, r.ust].filter(Boolean).join(" • ") || "—"}
                    </div>
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
                          {r.fluency}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          Tajwid
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {r.tajweed}
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
              {SUPABASE_TAHFIDZ_CUTOVER
                ? "Target aktif dibaca dari backend; perubahan target belum tersedia pada tahap ini."
                : "Atur dan pantau target setoran ziyadah & muroja'ah harian untuk semua santri."}
            </p>
          </div>
          {!SUPABASE_TAHFIDZ_CUTOVER && <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPrintPlanOpen(true)}
              className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border border-slate-200 dark:border-white/10 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Cetak Study Plan
            </button>
            <button
              onClick={() => setIsAiPlannerOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:from-emerald-500 hover:to-teal-500 transition-colors shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              AI Planner
            </button>
            <button
              onClick={() => setIsTargetModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors border border-emerald-200 dark:border-emerald-500/20 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Set Target Massal
            </button>
          </div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-black/40 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200 dark:border-white/5">
              <tr>
                <th className="px-4 py-3">Santri</th>
                <th className="px-4 py-3">{SUPABASE_TAHFIDZ_CUTOVER ? "Setoran Hari Ini" : "Pencapaian Hari Ini"}</th>
                <th className="px-4 py-3">Target Ziyadah</th>
                <th className="px-4 py-3">Target Muroja'ah</th>
                {!SUPABASE_TAHFIDZ_CUTOVER && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {SUPABASE_TAHFIDZ_CUTOVER && santriList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    {isTahfidzDataLoading
                      ? "Memuat target santri..."
                      : tahfidzDataError
                        ? "Roster belum dapat dimuat. Periksa pesan status di atas."
                        : "Belum ada roster santri atau data target."}
                  </td>
                </tr>
              ) : (SUPABASE_TAHFIDZ_CUTOVER ? santriList : santriList.slice(0, 3)).map((santri) => (
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
                    {SUPABASE_TAHFIDZ_CUTOVER ? (
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {recordsToday.filter((record) => record.studentId === santri.id).length} setoran
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "60%" }}></div>
                        </div>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">60%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400 font-medium">
                    {SUPABASE_TAHFIDZ_CUTOVER
                      ? santri.target ? `${santri.target.ziyadahPagesPerDay} halaman/hari` : "Belum diatur"
                      : "1 Halaman"}
                  </td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-400 font-medium">
                    {SUPABASE_TAHFIDZ_CUTOVER
                      ? santri.target ? `${santri.target.murojaahPagesPerDay} halaman/hari` : "Belum diatur"
                      : "¼ Juz"}
                  </td>
                  {!SUPABASE_TAHFIDZ_CUTOVER && <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setIsTargetModalOpen(true)}
                      className="text-xs text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium bg-slate-100 dark:bg-white/5 px-2 py-1 rounded"
                    >
                      Sesuaikan
                    </button>
                  </td>}
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
              {SUPABASE_TAHFIDZ_CUTOVER ? "Setoran Harian Menurut Jenis (7 Hari)" : "Konsistensi Hafalan Mingguan"}
            </h3>
            <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300 outline-none">
              <option>Minggu Ini</option>
              <option>Minggu Lalu</option>
            </select>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={SUPABASE_TAHFIDZ_CUTOVER ? weeklySetoranData : WEEKLY_DATA}
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
                {SUPABASE_TAHFIDZ_CUTOVER && (
                  <Bar
                    dataKey="Lainnya"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    stackId="a"
                    maxBarSize={40}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {SUPABASE_TAHFIDZ_CUTOVER ? "Ziyadah (Setoran)" : "Ziyadah (Halaman)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {SUPABASE_TAHFIDZ_CUTOVER ? "Muroja'ah (Setoran)" : "Muroja'ah (Halaman)"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
              {SUPABASE_TAHFIDZ_CUTOVER ? "Santri Setor dan Jumlah Setoran per Hari" : "Tingkat Penyelesaian (Target vs Aktual)"}
            </h3>
            <select className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300 outline-none">
              <option>Semester Ganjil</option>
              <option>Semester Genap</option>
            </select>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={SUPABASE_TAHFIDZ_CUTOVER ? weeklySetoranData : COMPLETION_DATA}
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
                  dataKey={SUPABASE_TAHFIDZ_CUTOVER ? "day" : "month"}
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
                  dataKey={SUPABASE_TAHFIDZ_CUTOVER ? "santriSetor" : "Target"}
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#colorTarget)"
                />
                <Area
                  type="monotone"
                  dataKey={SUPABASE_TAHFIDZ_CUTOVER ? "jumlahSetoran" : "Aktual"}
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
                {SUPABASE_TAHFIDZ_CUTOVER ? "Santri Unik" : "Target Semester"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 border-t-4 border-emerald-500"></div>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {SUPABASE_TAHFIDZ_CUTOVER ? "Jumlah Setoran" : "Aktual Area"}
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
            {santriList.map((s) => (
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
            Badges & Achievements
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Penghargaan dan pencapaian santri atas target hafalan.
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
            Leaderboard Pencapaian Santri
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-white/5">
          {santriList.map((s) => {
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
                  data={SUPABASE_TAHFIDZ_CUTOVER ? weeklySetoranData : WEEKLY_DATA}
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
          <button
            onClick={() => setIsTalaqqiModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Jadwalkan Sesi
          </button>
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
                        {santriList[i]?.name}
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
                            {santriList[0]?.name.split(" ")[0]}
                          </div>
                          <div className="text-[9px] bg-white dark:bg-black/40 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-transparent dark:border-white/5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30">
                            <div className="font-bold">14.00</div>
                            {santriList[1]?.name.split(" ")[0]}
                          </div>
                          <div className="text-[9px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-blue-100 dark:border-blue-500/20 cursor-pointer hover:border-blue-300">
                            <div className="font-bold">15.00</div>
                            {santriList[2]?.name.split(" ")[0]}
                          </div>
                        </div>
                      )}
                      {i === 4 && (
                        <div className="mt-auto flex flex-col gap-1">
                          <div className="text-[9px] bg-white text-slate-700 dark:bg-black/40 dark:text-slate-300 px-1 py-1 rounded leading-tight shadow-sm text-left truncate border border-slate-200 dark:border-white/5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30">
                            <div className="font-bold">16.00</div>
                            {santriList[3]?.name.split(" ")[0]}
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
      {SUPABASE_TAHFIDZ_CUTOVER && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="font-semibold">Sumber data: API Supabase (tahap bertahap)</div>
          <div className="mt-1">
            {isTahfidzDataLoading
              ? "Memuat roster, halaqah, dan setoran dari backend..."
              : "Roster, halaqah, target baca-saja, KPI, dan grafik tren setoran memakai data tenant dari backend. Pengubahan target, jadwal, milestone, gamifikasi, munaqasyah, dan laporan lanjutan masih menunggu migrasi tahap berikutnya."}
          </div>
          {tahfidzDataError && (
            <div role="alert" className="mt-2 font-medium text-rose-700 dark:text-rose-300">{tahfidzDataError}</div>
          )}
        </div>
      )}
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
          <button
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
          </button>
          <button className="flex items-center gap-2 bg-white dark:bg-black/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Laporan</span>
          </button>
          <button
            onClick={() => {
              setSelectedSantri(santriList[0]);
              setIsAssessmentOpen(true);
            }}
            className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors border border-emerald-200 dark:border-emerald-500/20 shadow-sm"
          >
            <Mic className="w-4 h-4" />
            AI Audio Assessment
          </button>
          {canManageTahfidzMigration && (
            <button
              onClick={() => {
                setTahfidzMigrationReport(null);
                setTahfidzMigrationError("");
                setConfirmTahfidzMigration(false);
                setIsTahfidzMigrationOpen(true);
              }}
              className="flex items-center gap-2 bg-white dark:bg-black/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Migrasi Data
            </button>
          )}
          <button
            onClick={() => setIsInputOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Input Setoran
          </button>
        </div>
      </div>

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
          Badges & Achievements
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
          Manajemen Halaqah
        </button>
      </div>

      {activeTab === "dashboard" && renderDashboard()}
      {activeTab === "halaqah" && renderHalaqahManagement()}
      {activeTab === "records" && renderRecords()}
      {activeTab === "targets" && renderTargets()}
      {activeTab === "talaqqi" && renderTalaqqiCalendar()}
      {activeTab === "exams" && renderExams()}
      {activeTab === "parent" && renderParentDashboard()}
      {activeTab === "peer-review" && renderPeerReview()}
      {activeTab === "badges" && renderBadges()}
      {activeTab === "quran" && (
        <div className="flex-1 min-h-0">
          <QuranViewer />
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
                onClick={() => setIsTargetModalOpen(false)}
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
                <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                  <option>Semua Santri (Massal)</option>
                  {santriList.map((s) => (
                    <option key={s.id}>
                      {s.name} - {s.nis}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                    Target Ziyadah (Hafalan Baru)
                  </label>
                  <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                    <option>½ Halaman</option>
                    <option>1 Halaman</option>
                    <option>2 Halaman</option>
                    <option>1 Lembar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5">
                    Target Muroja'ah (Pengulangan)
                  </label>
                  <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                    <option>1 Halaman</option>
                    <option>¼ Juz</option>
                    <option>½ Juz</option>
                    <option>1 Juz</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Tipe Sanksi/Reward (Opsional)
                </label>
                <select className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                  <option>Standard (Poin Keaktifan)</option>
                  <option>Strict (Surat Teguran jika 3x tidak tercapai)</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setIsTargetModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/5 font-medium transition-colors border border-slate-200 dark:border-transparent bg-white dark:bg-slate-900"
              >
                Batal
              </button>
              <button
                onClick={() => setIsTargetModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Simpan Target
              </button>
            </div>
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
                  {santriList.map((s) => (
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
                  <select
                    required
                    value={SUPABASE_TAHFIDZ_CUTOVER ? formData.studentId || "" : formData.santriName || ""}
                    onChange={(e) => {
                      const student = filteredSantri.find((item) =>
                        SUPABASE_TAHFIDZ_CUTOVER ? item.id === e.target.value : item.name === e.target.value,
                      );
                      setFormData({
                        ...formData,
                        studentId: SUPABASE_TAHFIDZ_CUTOVER ? student?.id || "" : undefined,
                        halaqahId: SUPABASE_TAHFIDZ_CUTOVER ? student?.halaqahId || "" : undefined,
                        santriName: student?.name || "",
                      });
                    }}
                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    <option value="">-- Pilih Santri --</option>
                    {filteredSantri.map((s) => (
                      <option key={s.id} value={SUPABASE_TAHFIDZ_CUTOVER ? s.id : s.name}>
                        {s.name} - {s.nis}
                      </option>
                    ))}
                  </select>
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
                        value={formData.fluency}
                        onChange={(e) =>
                          setFormData({ ...formData, fluency: e.target.value })
                        }
                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="A+">A+ (Mumtaz/Sangat Lancar)</option>
                        <option value="A">A (Jayyid Jiddan/Lancar)</option>
                        <option value="B">B (Jayyid/Cukup Lancar)</option>
                        <option value="C">C (Maqbul/Banyak Salah)</option>
                        <option value="D">D (Rasib/Mengulang)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Tajwid & Makhraj
                      </label>
                      <select
                        value={formData.tajweed}
                        onChange={(e) =>
                          setFormData({ ...formData, tajweed: e.target.value })
                        }
                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="A+">A+ (Sangat Baik)</option>
                        <option value="A">A (Baik)</option>
                        <option value="B">B (Cukup)</option>
                        <option value="C">C (Kurang)</option>
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
                  disabled={isSavingTahfidzRecord || isTahfidzDataLoading || (SUPABASE_TAHFIDZ_CUTOVER && !formData.studentId)}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
                >
                  {isSavingTahfidzRecord ? "Menyimpan..." : "Simpan Setoran"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Assessment Modal */}
      {isAssessmentOpen && selectedSantri && (
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
      {isTahfidzMigrationOpen && canManageTahfidzMigration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tahfidz-migration-title"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="tahfidz-migration-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Migrasi konfigurasi Tahfidz
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Pratinjau membaca halaqah dan penugasan santri dari tenant ini. Data contoh pada layar tidak ikut dimigrasikan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTahfidzMigrationOpen(false)}
                disabled={isTahfidzMigrationBusy}
                aria-label="Tutup migrasi Tahfidz"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200">
              Pencocokan santri memakai source ID hasil impor Master Data, lalu NIS yang unik. Konflik harus direkonsiliasi sebelum apply. Perubahan database memerlukan feature flag server terpisah dan konfirmasi backup.
            </div>

            {tahfidzMigrationError && (
              <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
                {tahfidzMigrationError}
              </div>
            )}

            {tahfidzMigrationReport && (
              <div className="mt-5 space-y-4">
                <div className={cn(
                  "rounded-xl border p-4 text-sm",
                  tahfidzMigrationReport.dryRun
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200",
                )}>
                  {tahfidzMigrationReport.dryRun
                    ? "Pratinjau selesai. Belum ada data yang ditulis."
                    : "Apply selesai. Periksa jumlah impor dan rekonsiliasi setelah migrasi."}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="text-xs text-slate-500">Halaqah direncanakan</div>
                    <div className="mt-1 text-lg font-bold">{tahfidzMigrationReport.planned?.halaqahs ?? 0}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="text-xs text-slate-500">Keanggotaan</div>
                    <div className="mt-1 text-lg font-bold">{tahfidzMigrationReport.planned?.memberships ?? 0}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="text-xs text-slate-500">Tidak punya halaqah</div>
                    <div className="mt-1 text-lg font-bold">{tahfidzMigrationReport.unassignedStudents ?? 0}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <div className="text-xs text-slate-500">Masalah</div>
                    <div className="mt-1 text-lg font-bold">{tahfidzMigrationReport.errors?.length ?? 0}</div>
                  </div>
                </div>
                {!!tahfidzMigrationReport.errors?.length && (
                  <div className="rounded-xl border border-rose-200 p-4 dark:border-rose-500/30">
                    <h3 className="font-semibold text-rose-800 dark:text-rose-300">Perlu diperbaiki</h3>
                    <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
                      {tahfidzMigrationReport.errors.slice(0, 20).map((issue: any, index: number) => (
                        <li key={issue.id + issue.category + index}>
                          <span className="font-medium">{issue.category} · {issue.id || "tanpa ID"}:</span> {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!tahfidzMigrationReport.warnings?.length && (
                  <div className="rounded-xl border border-amber-200 p-4 dark:border-amber-500/30">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-300">Peringatan</h3>
                    <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
                      {tahfidzMigrationReport.warnings.slice(0, 20).map((issue: any, index: number) => (
                        <li key={issue.id + issue.category + index}>
                          <span className="font-medium">{issue.category} · {issue.id || "tanpa ID"}:</span> {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!tahfidzMigrationReport.dryRun && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Diimpor: {tahfidzMigrationReport.imported?.halaqahs ?? 0} halaqah dan {tahfidzMigrationReport.imported?.memberships ?? 0} keanggotaan. Tidak berubah: {tahfidzMigrationReport.unchanged?.halaqahs ?? 0} halaqah dan {tahfidzMigrationReport.unchanged?.memberships ?? 0} keanggotaan.
                  </p>
                )}
              </div>
            )}

            {confirmTahfidzMigration && tahfidzMigrationReport?.dryRun && (
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={confirmTahfidzMigration}
                  onChange={(event) => setConfirmTahfidzMigration(event.target.checked)}
                  className="mt-0.5"
                />
                Saya sudah meninjau pratinjau dan memastikan backup tenant tersedia.
              </label>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTahfidzMigrationOpen(false)}
                disabled={isTahfidzMigrationBusy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => runTahfidzMigration(false)}
                disabled={isTahfidzMigrationBusy}
                className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                {isTahfidzMigrationBusy ? "Memproses..." : "Jalankan Pratinjau"}
              </button>
              {tahfidzMigrationReport?.dryRun && tahfidzMigrationReport?.canApply && tahfidzMigrationReport.errors?.length === 0 && !confirmTahfidzMigration && (
                <button
                  type="button"
                  onClick={() => setConfirmTahfidzMigration(true)}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                >
                  Siapkan Apply
                </button>
              )}
              {tahfidzMigrationReport?.dryRun && tahfidzMigrationReport?.canApply && tahfidzMigrationReport.errors?.length === 0 && confirmTahfidzMigration && (
                <button
                  type="button"
                  onClick={() => runTahfidzMigration(true)}
                  disabled={isTahfidzMigrationBusy}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  {isTahfidzMigrationBusy ? "Mengimpor..." : "Apply impor"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
