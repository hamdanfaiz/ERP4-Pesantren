import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Calendar,
  Users,
  Award,
  Search,
  Filter,
  Plus,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Download,
  AlertTriangle,
  Clock,
  Trash2,
  Edit3,
  Bookmark,
  MapPin,
  RefreshCw,
  Sliders,
  Check,
  UserCheck,
  CalendarDays,
  Grid,
  List,
  Printer,
  Sparkles,
  TrendingUp,
  Heart
} from 'lucide-react';
import { cn, generateUniqueId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useCentralStructure } from '../hooks/useCentralStructure';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { CentralSyncBadge } from '../components/CentralSyncBadge';
import { X, Link2 } from 'lucide-react';

// Helper for parsing "07:30 - 09:00" to hour and minute numbers
interface TimeParts {
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

function parseTimeString(timeStr: string): TimeParts | null {
  try {
    const parts = timeStr.split(' - ');
    if (parts.length < 2) return null;
    const startParts = parts[0].split(':');
    const endParts = parts[1].split(':');
    return {
      startHour: parseInt(startParts[0]),
      startMin: parseInt(startParts[1]),
      endHour: parseInt(endParts[0]),
      endMin: parseInt(endParts[1])
    };
  } catch (err) {
    return null;
  }
}

// Initial Rich Schedule Data containing a deliberate teacher time clash (conflict!)
const INITIAL_SCHEDULES = [
  { id: 'S-1', time: '07:30 - 09:00', day: 'Senin', subject: 'Fiqih (Merdeka)', teacher: 'Ust. Hidayat Lc.', class: 'VII - A', room: 'Ruang 101', curriculum: 'Formal' },
  { id: 'S-2', time: '09:15 - 10:45', day: 'Senin', subject: 'Bahasa Arab', teacher: 'Ust. Zaki M.A.', class: 'VII - A', room: 'Ruang 101', curriculum: 'Formal' },
  { id: 'S-3', time: '13:00 - 14:30', day: 'Senin', subject: 'Matematika', teacher: 'Bpk. Ahmad S.Pd', class: 'VII - A', room: 'Ruang 101', curriculum: 'Formal' },
  { id: 'S-4', time: '07:30 - 09:00', day: 'Selasa', subject: 'Tahfidz & Tahsin', teacher: 'Ust. Fulan Al-Hafidz', class: 'VII - A', room: 'Masjid Jami', curriculum: 'Kepesantrenan' },
  // Deliberate Conflict for Ust. Hidayat Lc. at Senin 07:30 - 09:00 (In Class VIII-B)
  { id: 'S-5', time: '07:30 - 09:00', day: 'Senin', subject: 'Aqidatul Awam (Tauhid)', teacher: 'Ust. Hidayat Lc.', class: 'VIII - B', room: 'Ruang 102', curriculum: 'Kepesantrenan' },
  { id: 'S-6', time: '13:00 - 14:30', day: 'Senin', subject: 'Fathul Mu\'in (Fiqih Senior)', teacher: 'Ust. Hidayat Lc.', class: 'IX - A', room: 'Aula Utama', curriculum: 'Kepesantrenan' },
  { id: 'S-7', time: '15:30 - 17:00', day: 'Senin', subject: 'Hadits Arba\'in Nawawi', teacher: 'Ust. Zaki M.A.', class: 'VIII - B', room: 'Ruang 102', curriculum: 'Kepesantrenan' },
  { id: 'S-8', time: '19:30 - 21:00', day: 'Senin', subject: 'Kajian Kitab Riyadhus Shalihin', teacher: 'Ust. Fulan Al-Hafidz', class: 'Siswa Semua', room: 'Masjid Jami', curriculum: 'Kepesantrenan' }
];

const MOCK_STUDENTS_BY_CLASS: Record<string, string[]> = {
  'VII - A': ['Ahmad Muzakki', 'Budi Santoso', 'Syamil Al-Farizi', 'Muhammad Tegar', 'Fatih Al-Kahfi'],
  'VII - B': ['Yusuf Mahendra', 'Wildan Fauzi', 'Zulkifli', 'Imron Rosyadi', 'Fajar Ramadhan'],
  'VIII - A': ['Farhan Akhtar', 'Haris Munandar', 'Rafi Ahmad', 'Daniswara', 'Luqman Hakim'],
  'VIII - B': ['Ihsan Kamil', 'Faiz Ar-Raihan', 'Ridwan Sodiq', 'Salman Al-Farisi', 'Zackiyul Fuad'],
  'IX - A': ['Abe Cendana', 'Bagas Pramana', 'Chandra Wijaya', 'Dimas Prasetyo', 'Erick Setiawan'],
};

const INITIAL_JURNALS = [
  {
    id: 'J-01',
    date: '2026-06-01',
    class: 'VII - A',
    subject: 'Fiqih (Merdeka)',
    topic: 'Thaharah (Bab Bersuci dari Najis)',
    competency: 'CP 1.1: Memahami konsep thaharah, macam-macam najis, dan tata cara mensucikannya sesuai Madzhab Syafii.',
    teacher: 'Ust. Hidayat Lc.',
    attendance: '4/5',
    status: 'Completed',
    studentAttendance: {
      'Ahmad Muzakki': 'Hadir',
      'Budi Santoso': 'Hadir',
      'Syamil Al-Farizi': 'Hadir',
      'Muhammad Tegar': 'Ghaib',
      'Fatih Al-Kahfi': 'Hadir'
    }
  },
  {
    id: 'J-02',
    date: '2026-06-01',
    class: 'VIII - B',
    subject: 'Bahasa Arab',
    topic: 'Praktek Isim & Fi\'il dalam Kitab',
    competency: 'CP 3.2: Mengidentifikasi kedudukan kata (isim/fi\'il/harf) dalam rangkaian kalimat kitab gundul.',
    teacher: 'Ust. Zaki M.A.',
    attendance: '5/5',
    status: 'Completed',
    studentAttendance: {
      'Ihsan Kamil': 'Hadir',
      'Faiz Ar-Raihan': 'Hadir',
      'Ridwan Sodiq': 'Hadir',
      'Salman Al-Farisi': 'Hadir',
      'Zackiyul Fuad': 'Hadir'
    }
  },
  {
    id: 'J-03',
    date: '2026-06-04',
    class: 'IX - A',
    subject: 'Matematika',
    topic: 'Sistem Persamaan Linier Dua Variabel',
    competency: 'CP 4.1: Menyelesaikan masalah kontekstual menggunakan sistem persamaan linier dua variabel.',
    teacher: 'Bpk. Ahmad S.Pd',
    attendance: '4/5',
    status: 'Pending',
    studentAttendance: {
      'Abe Cendana': 'Hadir',
      'Bagas Pramana': 'Sakit',
      'Chandra Wijaya': 'Hadir',
      'Dimas Prasetyo': 'Hadir',
      'Erick Setiawan': 'Hadir'
    }
  }
];

const INITIAL_ASSESSMENTS = [
  { id: 'N-01', student: 'Ahmad Muzakki', class: 'VII - A', type: 'PTS Genap', subject: 'Fiqih (Merdeka)', score: 85, category: 'Summative', remedialStatus: 'None' },
  { id: 'N-02', student: 'Budi Santoso', class: 'VII - A', type: 'PTS Genap', subject: 'Fiqih (Merdeka)', score: 78, category: 'Summative', remedialStatus: 'None' },
  { id: 'N-03', student: 'Syamil Al-Farizi', class: 'VII - A', type: 'PTS Genap', subject: 'Fiqih (Merdeka)', score: 55, category: 'Summative', remedialStatus: 'Needed', originalScore: 55 },
  { id: 'N-04', student: 'Muhammad Tegar', class: 'VII - A', type: 'PTS Genap', subject: 'Fiqih (Merdeka)', score: 45, category: 'Summative', remedialStatus: 'Needed', originalScore: 45 },
  { id: 'N-05', student: 'Fatih Al-Kahfi', class: 'VII - A', type: 'PTS Genap', subject: 'Fiqih (Merdeka)', score: 90, category: 'Summative', remedialStatus: 'None' },
  { id: 'N-06', student: 'Ahmad Muzakki', class: 'VII - A', type: 'Tugas Harian', subject: 'Fiqih (Merdeka)', score: 92, category: 'Formative', remedialStatus: 'None' },
  { id: 'N-07', student: 'Budi Santoso', class: 'VII - A', type: 'Tugas Harian', subject: 'Fiqih (Merdeka)', score: 65, category: 'Formative', remedialStatus: 'None' },
  { id: 'N-08', student: 'Syamil Al-Farizi', class: 'VII - A', type: 'Tugas Harian', subject: 'Fiqih (Merdeka)', score: 68, category: 'Formative', remedialStatus: 'None' },
  { id: 'N-09', student: 'Muhammad Tegar', class: 'VII - A', type: 'Tugas Harian', subject: 'Fiqih (Merdeka)', score: 35, category: 'Formative', remedialStatus: 'Needed', originalScore: 35 },
  { id: 'N-10', student: 'Fatih Al-Kahfi', class: 'VII - A', type: 'Tugas Harian', subject: 'Fiqih (Merdeka)', score: 88, category: 'Formative', remedialStatus: 'None' },
  { id: 'N-11', student: 'Ihsan Kamil', class: 'VIII - B', type: 'Tugas Harian', subject: 'Bahasa Arab', score: 92, category: 'Formative', remedialStatus: 'None' },
  { id: 'N-12', student: 'Faiz Ar-Raihan', class: 'VIII - B', type: 'Tugas Harian', subject: 'Bahasa Arab', score: 50, category: 'Formative', remedialStatus: 'Needed', originalScore: 50 }
];

import { useTenantOperationalCollection } from '../firebaseUtils';

const PREDEFINED_SUBJECTS_DEFAULT = [
  'Fiqih (Merdeka)',
  'Bahasa Arab',
  'Matematika',
  'Tahfidz & Tahsin',
  'Aqidatul Awam (Tauhid)',
  'Fathul Mu\'in (Fiqih Senior)',
  'Hadits Arba\'in Nawawi',
  'Kajian Kitab Riyadhus Shalihin',
  'Ilmu Pengetahuan Alam (IPA)',
  'Ilmu Pengetahuan Sosial (IPS)',
  'Bahasa Indonesia',
  'Bahasa Inggris',
  'Pendidikan Agama Islam (PAI)',
  'Pendidikan Kewarganegaraan (PKn)',
  'Sejarah Kebudayaan Islam (SKI)',
  'Nahwu Shorof',
  'Lainnya'
];

export function AcademicManager() {
  const { role, user } = useAuth();
  const { academicYear, semester, isReportCardLocked, orgInfo } = useSystemSettings();

  // Rekomendasi 5: Centralized Structure Relations from Master Data
  const {
    classes: centralClasses,
    subjects: centralSubjects,
    curricula: centralCurricula,
    teachers: centralTeachers,
    santriList: centralSantriList,
    getStudentsByClass,
  } = useCentralStructure();

  const [academicToast, setAcademicToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [scheduleClashModal, setScheduleClashModal] = useState<{ clashes: string[] } | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);

  const availableClasses = React.useMemo(() => {
    const list: string[] = [];
    for (const c of centralClasses) {
      if (c.name && !list.includes(c.name)) list.push(c.name);
    }
    const legacyDefaults = ['VII - A', 'VII - B', 'VIII - A', 'VIII - B', 'IX - A', 'X - A', 'XI - A', 'XII - A'];
    for (const leg of legacyDefaults) {
      if (!list.includes(leg)) list.push(leg);
    }
    return list;
  }, [centralClasses]);

  const availableSubjects = React.useMemo(() => {
    const list: string[] = [];
    for (const s of centralSubjects) {
      if (s.name && !list.includes(s.name)) list.push(s.name);
    }
    for (const s of PREDEFINED_SUBJECTS_DEFAULT) {
      if (!list.includes(s)) list.push(s);
    }
    return list;
  }, [centralSubjects]);

  const availableCurriculums = React.useMemo(() => {
    const list: string[] = [];
    for (const c of centralCurricula) {
      if (c.name && !list.includes(c.name)) list.push(c.name);
    }
    const defaults = ['Formal', 'Kepesantrenan', 'Kurikulum Merdeka IT', 'Salafiyah Muadalah', 'Lainnya'];
    for (const d of defaults) {
      if (!list.includes(d)) list.push(d);
    }
    return list;
  }, [centralCurricula]);

  const availableTeachers = React.useMemo(() => {
    const list: string[] = [];
    for (const t of centralTeachers) {
      if (t.name && !list.includes(t.name)) list.push(t.name);
    }
    const defaults = ['Ust. Hidayat Lc.', 'Ust. Zaki M.A.', 'Ust. Fulan Al-Hafidz', 'Bpk. Ahmad S.Pd', 'Ust. Rahman'];
    for (const d of defaults) {
      if (!list.includes(d)) list.push(d);
    }
    return list;
  }, [centralTeachers]);

  // Centralized student roster lookup per class
  const getStudentsForClass = (clsName: string): string[] => {
    const fromMaster = getStudentsByClass(clsName);
    if (fromMaster && fromMaster.length > 0) return fromMaster;
    return MOCK_STUDENTS_BY_CLASS[clsName] || ['Ahmad Muzakki', 'Budi Santoso', 'Syamil Al-Farizi', 'Muhammad Tegar', 'Fatih Al-Kahfi'];
  };

  const subjectsList = availableSubjects;
  const curriculumList = availableCurriculums;

  // Operational records are live tenant-scoped Firestore collections.
  const academicStaffTenantId = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role) ? user?.tenantId : null;
  const schedulesStore = useTenantOperationalCollection<any>('academic_schedules', user?.tenantId);
  const jurnalsStore = useTenantOperationalCollection<any>('academic_journals', academicStaffTenantId);
  const assessmentsStore = useTenantOperationalCollection<any>('academic_assessments', academicStaffTenantId);
  const academicSettingsStore = useTenantOperationalCollection<any>('academic_settings', academicStaffTenantId);
  const schedules = schedulesStore.records;
  const setSchedules = schedulesStore.setRecords;
  const jurnals = jurnalsStore.records;
  const setJurnals = jurnalsStore.setRecords;
  const assessments = assessmentsStore.records;
  const setAssessments = assessmentsStore.setRecords;
  const academicSettings = academicSettingsStore.records;
  const setAcademicSettings = academicSettingsStore.setRecords;
  const getAcademicSetting = (id: string, fallback: any) => academicSettings.find(record => record.id === id)?.value ?? fallback;
  const updateAcademicSetting = (id: string, valueOrUpdater: any) => setAcademicSettings(previous => {
    const existing = previous.find(record => record.id === id);
    const previousValue = existing?.value;
    const value = typeof valueOrUpdater === 'function' ? valueOrUpdater(previousValue) : valueOrUpdater;
    return existing ? previous.map(record => record.id === id ? { ...record, value } : record) : [...previous, { id, value }];
  });
  const kktpThreshold = Number(getAcademicSetting('kktpThreshold', 75));
  const setKktpThreshold = (value: number) => updateAcademicSetting('kktpThreshold', value);
  const formativeWeight = Number(getAcademicSetting('formativeWeight', 40));
  const setFormativeWeight = (value: number) => updateAcademicSetting('formativeWeight', value);

  // UI state
  const [activeTab, setActiveTab] = useState('schedule');
  const [searchQuery, setSearchQuery] = useState('');
  const [curriculumFilter, setCurriculumFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [expandedJurnalId, setExpandedJurnalId] = useState<string | null>(null);

  // KKTP & Grading System States
  const [assessmentSubTab, setAssessmentSubTab] = useState<'list' | 'batch' | 'recap'>('list');

  // Batch input settings
  const [batchClass, setBatchClass] = useState<string>('VII - A');
  const [batchSubject, setBatchSubject] = useState<string>('Fiqih (Merdeka)');
  const [batchType, setBatchType] = useState<string>('Tugas Harian');
  const [batchCategory, setBatchCategory] = useState<'Formative' | 'Summative'>('Formative');
  const [batchScores, setBatchScores] = useState<Record<string, string>>({});

  // Remedial target
  const [remedialAssessment, setRemedialAssessment] = useState<any | null>(null);
  const [remedialNewScore, setRemedialNewScore] = useState<number>(75);

  // Dynamic Walisantri / Santri child tracker
  const loggedInChildName = user?.linkedSantriName;
  const loggedInChildClass = user?.linkedSantriClass;

  const mockChildren = useMemo(() => {
    const list = [
      { name: 'Ahmad Muzakki', class: 'VII - A' },
      { name: 'Ihsan Kamil', class: 'VIII - B' },
      { name: 'Yusuf Mahendra', class: 'VII - B' }
    ];
    if (loggedInChildName) {
      return [{ name: loggedInChildName, class: loggedInChildClass || 'VII - A' }, ...list.filter(c => c.name !== loggedInChildName)];
    }
    return list;
  }, [loggedInChildName, loggedInChildClass]);

  const [selectedChild, setSelectedChild] = useState(mockChildren[0]);

  useEffect(() => {
    if (mockChildren.length > 0) {
      setSelectedChild(mockChildren[0]);
    }
  }, [mockChildren]);

  // E-Rapor & Wali Kelas Comments states
  const [reportsSubTab, setReportsSubTab] = useState<'leger' | 'comments' | 'rapor'>('leger');
  const waliKelasComments = getAcademicSetting('waliKelasComments', {}) as Record<string, string>;
  const setWaliKelasComments: React.Dispatch<React.SetStateAction<Record<string, string>>> = (valueOrUpdater) =>
    updateAcademicSetting('waliKelasComments', valueOrUpdater);

  const [selectedCommentStudent, setSelectedCommentStudent] = useState<string>('Ahmad Muzakki');
  const [commentDraftText, setCommentDraftText] = useState<string>('');

  // Lock and Export states
  const raporLocked = Boolean(getAcademicSetting('raporLocked', false));
  const setRaporLocked = (value: boolean) => updateAcademicSetting('raporLocked', value);
  const isRaporEffectivelyLocked = isReportCardLocked || raporLocked;

  const [isExportingStats, setIsExportingStats] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // States for E-Rapor downloads and student previews (moved to top level to comply with Rules of Hooks)
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [previewStudentName, setPreviewStudentName] = useState<string>('Ahmad Muzakki');


  useEffect(() => {
    if (waliKelasComments[selectedCommentStudent]) {
      setCommentDraftText(waliKelasComments[selectedCommentStudent]);
    } else {
      setCommentDraftText('');
    }
  }, [selectedCommentStudent]);

  // Simulated Time Center state
  const [simDay, setSimDay] = useState('Senin');
  const [simTime, setSimTime] = useState('07:15'); // default to 15 mins before first class at 07:30

  // Active acting teacher context (for Ustadz simulation filter)
  const [activeUstadz, setActiveUstadz] = useState('Ust. Hidayat Lc.');

  // Modal Control
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'schedule' | 'kbm' | 'assessment'>('schedule');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Data and Validation
  const [formData, setFormData] = useState<any>({
    time: '07:30 - 09:00',
    day: 'Senin',
    subject: '',
    teacher: 'Ust. Hidayat Lc.',
    class: 'VII - A',
    room: 'Ruang 101',
    curriculum: 'Formal',
    date: new Date().toISOString().split('T')[0],
    topic: '',
    attendance: '28/30',
    status: 'Completed',
    student: '',
    type: 'Tugas Harian2',
    score: 80
  });

  // Conflict detection algorithm! Overlapping day & time block & ustadz teacher
  const findSchedulesConflicts = () => {
    const clashes: any[] = [];
    schedules.forEach((s1, index1) => {
      schedules.forEach((s2, index2) => {
        if (index1 < index2) {
          const isSameDayAndTimeAndTeacher = s1.day === s2.day && s1.time === s2.time && s1.teacher === s2.teacher;
          if (isSameDayAndTimeAndTeacher) {
            clashes.push({ s1, s2 });
          }
        }
      });
    });
    return clashes;
  };

  const conflictsList = findSchedulesConflicts();

  // Switch to Substitute Teacher resolving clash instantly
  const handleAutoResolveConflict = (clashPair: any) => {
    const { s2 } = clashPair;
    // Substitute Ust. Zaki M.A. or Ust. Fulan Al-Hafidz depending on current
    const substituteTeacher = s2.teacher === 'Ust. Zaki M.A.' ? 'Ust. Fulan Al-Hafidz' : 'Ust. Zaki M.A.';
    setSchedules(prev => prev.map(item => {
      if (item.id === s2.id) {
        return { ...item, teacher: substituteTeacher };
      }
      return item;
    }));
    setAcademicToast({
      message: `[Jadwal Teratasi] Mengganti pengajar '${s2.subject}' (Kelas ${s2.class}) ke '${substituteTeacher}'.`,
      type: 'success'
    });
  };

  // Helper timer function
  const getTimeStatus = (schedDay: string, timeStr: string) => {
    if (simDay !== schedDay) {
      return {
        status: 'upcoming',
        label: 'Belum Mulai',
        colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/15'
      };
    }

    const times = parseTimeString(timeStr);
    if (!times) {
      return {
        status: 'upcoming',
        label: 'Format Error',
        colorClass: 'text-red-400 bg-red-500/10 border-red-500/15'
      };
    }

    const simParts = simTime.split(':');
    const simH = parseInt(simParts[0]) || 0;
    const simM = parseInt(simParts[1]) || 0;

    const simTotal = simH * 60 + simM;
    const startTotal = times.startHour * 60 + times.startMin;
    const endTotal = times.endHour * 60 + times.endMin;

    if (simTotal < startTotal) {
      const diff = startTotal - simTotal;
      if (diff <= 60) {
        return {
          status: 'imminent',
          label: `Mulai dalam ${diff} mnt`,
          colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25 animate-pulse'
        };
      }
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      return {
        status: 'upcoming',
        label: `${hrs > 0 ? hrs + 'j ' : ''}${mins}m lagi`,
        colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/15'
      };
    } else if (simTotal >= startTotal && simTotal <= endTotal) {
      const remaining = endTotal - simTotal;
      return {
        status: 'running',
        label: `Berlangsung (${remaining} m sisa)`,
        colorClass: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30 animate-pulse font-medium'
      };
    } else {
      return {
        status: 'completed',
        label: 'Selesai',
        colorClass: 'text-slate-500 bg-slate-800/10 border-slate-800'
      };
    }
  };

  // Filter schedule list
  const getFilteredSchedules = () => {
    let result = [...schedules];

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.subject.toLowerCase().includes(query) ||
        item.teacher.toLowerCase().includes(query) ||
        item.class.toLowerCase().includes(query) ||
        item.room.toLowerCase().includes(query)
      );
    }

    // Filter by dual curriculum toggle
    if (curriculumFilter !== 'All') {
      result = result.filter(item => item.curriculum === curriculumFilter);
    }

    // Role-based restrictions:
    // Santri sees only their active simulated class schedule
    if (role === 'Santri') {
      result = result.filter(item => item.class === selectedChild.class || item.class === 'Siswa Semua');
    }
    // Walisantri sees active simulated child's class schedule
    else if (role === 'Walisantri') {
      result = result.filter(item => item.class === selectedChild.class || item.class === 'Siswa Semua');
    }
    // Ustadz sees only their own schedule
    else if (role === 'Ustadz') {
      result = result.filter(item => item.teacher === activeUstadz);
    }

    return result;
  };

  const filteredSchedules = getFilteredSchedules();

  // CRUD handlers
  const handleOpenAddModal = (type: 'schedule' | 'kbm' | 'assessment') => {
    setModalType(type);
    setEditingId(null);
    if (type === 'schedule') {
      setFormData({
        time: '07:30 - 09:00',
        day: 'Senin',
        subject: '',
        teacher: role === 'Ustadz' ? activeUstadz : 'Ust. Hidayat Lc.',
        class: 'VII - A',
        room: 'Ruang 101',
        curriculum: 'Formal'
      });
    } else if (type === 'kbm') {
      const defaultClass = availableClasses[0] || 'VII - A';
      const students = getStudentsForClass(defaultClass);
      const initialAttendance: Record<string, string> = {};
      students.forEach(st => {
        initialAttendance[st] = 'Hadir';
      });
      setFormData({
        date: new Date().toISOString().split('T')[0],
        class: defaultClass,
        subject: 'Fiqih (Merdeka)',
        topic: '',
        competency: 'CP 1.1: Memahami konsep thaharah, macam-macam najis, dan tata cara bersuci.',
        teacher: role === 'Ustadz' ? activeUstadz : 'Ust. Hidayat Lc.',
        studentAttendance: initialAttendance,
        attendance: `${students.length}/${students.length}`,
        status: 'Completed'
      });
    } else if (type === 'assessment') {
      setFormData({
        student: '',
        class: 'VII - A',
        type: 'Tugas Harian',
        subject: 'Fiqih (Merdeka)',
        score: 80
      });
    }
    setIsModalOpen(true);
  };

  const handleEditSchedule = (item: any) => {
    setModalType('schedule');
    setEditingId(item.id);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleDeleteSchedule = (id: string) => {
    setScheduleToDelete(id);
  };

  const handlePrintJurnal = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setAcademicToast({ message: "Mohon izinkan pop-ups browser untuk mencetak jurnal.", type: 'warning' });
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Cetak Jurnal Mengajar Harian</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .header h2 { margin: 0; padding: 0; }
            .header p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; font-weight: bold; }
            .details { margin-top: 5px; font-size: 11px; color: #555; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Jurnal Mengajar Harian (KBM)</h2>
            <p>Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kelas</th>
                <th>Mata Pelajaran</th>
                <th>Pendidik</th>
                <th>Topik / Materi</th>
                <th>Presensi (Hadir)</th>
              </tr>
            </thead>
            <tbody>
              ${jurnals.map(j => `
                <tr>
                  <td>${j.date}</td>
                  <td>${j.class}</td>
                  <td>${j.subject}</td>
                  <td>${j.teacher}</td>
                  <td>
                    <strong>${j.topic}</strong>
                    <div class="details">${j.status || 'Selesai'}</div>
                  </td>
                  <td>${j.attendance}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (modalType === 'schedule') {
      // Conflict mitigation
      const liveClashes: string[] = [];
      schedules.forEach(s => {
        if (editingId && s.id === editingId) return;
        if (s.day === formData.day && s.time === formData.time) {
          if (s.teacher === formData.teacher) {
            liveClashes.push(`Ustadz ${s.teacher} sudah memiliki jadwal mengajar ${s.subject} di kelas ${s.class} pada waktu ini.`);
          }
          if (s.room && formData.room && s.room.toLowerCase() === formData.room.toLowerCase()) {
            liveClashes.push(`Ruang ${s.room} sudah digunakan untuk kelas ${s.class} (${s.subject}) pada waktu ini.`);
          }
          if (s.class === formData.class) {
            liveClashes.push(`Kelas ${s.class} sudah memiliki jadwal pelajaran ${s.subject} dengan Ustadz ${s.teacher} pada waktu ini.`);
          }
        }
      });

      // Filter out duplicate clash messages
      const uniqueClashes = Array.from(new Set(liveClashes));
      if (uniqueClashes.length > 0) {
        setScheduleClashModal({ clashes: uniqueClashes });
        setAcademicToast({ message: "⚠️ Terdeteksi bentrok jadwal KBM!", type: 'error' });
        return; // Prevent saving
      }

      if (editingId) {
        setSchedules(prev => prev.map(s => s.id === editingId ? { ...s, ...formData } : s));
        setAcademicToast({ message: "Jadwal berhasil diperbarui.", type: 'success' });
      } else {
        const newRecord = {
          id: `S-${Date.now()}`,
          ...formData
        };
        setSchedules(prev => [newRecord, ...prev]);
        setAcademicToast({ message: "Jadwal baru berhasil ditambahkan.", type: 'success' });
      }
    } else if (modalType === 'kbm') {
      const studs = formData.studentAttendance || {};
      const presentCount = Object.values(studs).filter(st => st === 'Hadir').length;
      const totalStudents = Object.keys(studs).length;
      const newRecord = {
        id: `J-${Date.now()}`,
        date: formData.date || new Date().toISOString().split('T')[0],
        class: formData.class || 'VII - A',
        subject: formData.subject || 'Lainnya',
        topic: formData.topic || '',
        competency: formData.competency || 'CP 1.1: Memahami materi kepesantrenan dasar.',
        teacher: formData.teacher || (role === 'Ustadz' ? activeUstadz : 'Ust. Hidayat Lc.'),
        attendance: `${presentCount}/${totalStudents}`,
        studentAttendance: studs,
        status: formData.status || 'Completed'
      };
      setJurnals(prev => [newRecord, ...prev]);
      setAcademicToast({ message: "Jurnal KBM berhasil disimpan.", type: 'success' });
    } else if (modalType === 'assessment') {
      if (raporLocked) {
        setAcademicToast({ message: '🔒 Sistem Penilaian Dikunci oleh Administrator. Penilaian baru tidak dapat didaftarkan sementara waktu.', type: 'warning' });
        return;
      }
      const rawScore = formData.score;
      const scoreVal = rawScore === '' || rawScore === null || rawScore === undefined ? NaN : Number(rawScore);
      if (!Number.isFinite(scoreVal) || scoreVal < 0 || scoreVal > 100) {
        setAcademicToast({ message: 'Nilai harus berupa angka antara 0 dan 100.', type: 'warning' });
        return;
      }
      const isRemedial = scoreVal < kktpThreshold;
      const typeStr = formData.type || 'Tugas Harian';
      const isSummative = typeStr.includes('PTS') || typeStr.includes('UAS') || typeStr.includes('Ujian');
      const newRecord = {
        id: `N-${Date.now()}`,
        student: formData.student || 'Unknown Student',
        class: formData.class || 'VII - A',
        type: typeStr,
        subject: formData.subject || 'Fiqih (Merdeka)',
        score: scoreVal,
        category: isSummative ? 'Summative' : 'Formative',
        remedialStatus: isRemedial ? 'Needed' : 'None',
        originalScore: isRemedial ? scoreVal : undefined
      };
      setAssessments(prev => [newRecord, ...prev]);
    }

    setIsModalOpen(false);
  };

  // Quick Preset Simulation trigger
  const applySimPreset = (day: string, time: string) => {
    setSimDay(day);
    setSimTime(time);
  };

  // Render Schedule Tab View
  const renderScheduleTab = () => {
    // Overlapping conflicts alert logic for Admin
    const hasConflicts = conflictsList.length > 0;
    const isWalisantriOrSantri = ['Santri', 'Walisantri'].includes(role);
    const isUstadz = role === 'Ustadz';
    const isAdmin = ['SuperAdmin', 'Admin'].includes(role);

    // Filter ustadz schedules for "My Schedule View"
    const myUstadzSchedules = schedules.filter(s => s.teacher === activeUstadz);

    return (
      <div className="space-y-6">

        {/* 1. MY SCHEDULE VIEW FOR USTADZ ROLE */}
        {isUstadz && (
          <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl p-6 shadow-sm animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
              <div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 text-[10px] font-bold rounded-full uppercase tracking-wider">
                  👨‍🏫 Dashboard Ustadz
                </div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1.5">Jadwal Mengajar Saya Hari Ini ({simDay})</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Menampilkan tugas mengajar Anda yang dicocokkan dengan waktu simulasi saat ini.</p>
              </div>
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-right">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Ustadz Aktif</div>
                <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {activeUstadz}
                </div>
              </div>
            </div>

            {myUstadzSchedules.filter(s => s.day === simDay).length === 0 ? (
              <div className="bg-white/50 dark:bg-black/10 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                😴 Anda tidak memiliki jadwal mengajar pada hari <strong>{simDay}</strong> berdasarkan simulasi waktu ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myUstadzSchedules.filter(s => s.day === simDay).map(item => {
                  const timerInfo = getTimeStatus(item.day, item.time);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "bg-white dark:bg-[#0d1017]/70 border rounded-xl p-4 flex flex-col justify-between transition-all shadow-sm hover:shadow-md",
                        timerInfo.status === 'running' ? "border-emerald-300 dark:border-emerald-500/40 outline outline-1 outline-emerald-500/10 bg-emerald-50 dark:bg-emerald-950/5" : "border-slate-200 dark:border-slate-800"
                      )}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                            item.curriculum === 'Formal' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-200 dark:border-amber-500/20'
                          )}>
                            {item.curriculum}
                          </span>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold", timerInfo.colorClass)}>
                            {timerInfo.label}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{item.subject}</h4>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span className="font-mono">{item.time}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Kelas: {item.class}</span>
                        <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300"><MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {item.room}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. DYNAMIC SCHEDULE CONFLICT RESOLVER PANEL FOR ADMINS */}
        {isAdmin && hasConflicts && (
          <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-6 shadow-sm relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 p-4 text-amber-100 dark:text-amber-500/10 font-mono text-7xl font-bold select-none pointer-events-none">
              CLASH
            </div>

            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-amber-100 dark:bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400 shrink-0 border border-amber-200 dark:border-amber-500/20">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
              </div>
              <div className="space-y-3 w-full">
                <div>
                  <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Dynamic Conflict Resolver Detected Overlaps</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Terdeteksi <span className="font-bold text-amber-600 dark:text-amber-300">{conflictsList.length} bentrokan mengajar</span>. Ustadz yang sama dijadwalkan mengajar kelas yang berbeda di waktu bersamaan. Silakan selesaikan bentrokan ini di bawah:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {conflictsList.map((clash, idx) => (
                    <div key={idx} className="bg-white dark:bg-black/40 border border-amber-200 dark:border-amber-500/[0.15] p-3 rounded-xl flex flex-col justify-between gap-3 text-slate-600 dark:text-slate-300 text-xs shadow-sm">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/5 pb-1 mb-2">Bentrokan #{idx + 1}: {clash.s1.teacher}</div>
                        <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                          <p>
                            🏫 Slot 1: <strong className="text-slate-800 dark:text-slate-200">{clash.s1.subject}</strong> ({clash.s1.class} - {clash.s1.room}) pada <span className="font-mono text-amber-600 dark:text-amber-400">{clash.s1.day} {clash.s1.time}</span>
                          </p>
                          <p>
                            🏫 Slot 2: <strong className="text-slate-800 dark:text-slate-200">{clash.s2.subject}</strong> ({clash.s2.class} - {clash.s2.room}) pada <span className="font-mono text-amber-600 dark:text-amber-400">{clash.s2.day} {clash.s2.time}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-2 shrink-0">
                        <button
                          id={`resolve-swap-${idx}`}
                          onClick={() => handleAutoResolveConflict(clash)}
                          className="flex-1 py-1 px-2.5 bg-amber-500 text-white dark:text-black font-bold rounded hover:bg-amber-600 dark:hover:bg-amber-400 transition-colors text-center text-[10px]"
                        >
                          Auto-Resolve Swap Teacher
                        </button>
                        <button
                          id={`resolve-edit-${idx}`}
                          onClick={() => handleEditSchedule(clash.s2)}
                          className="py-1 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-center text-[10px]"
                        >
                          Manual Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. STUDENT & PARENT SPECIFIC OVERVIEW (Jadwal Kelas VII-A Ahmad Muzakki) */}
        {isWalisantriOrSantri && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-xs font-semibold rounded-full font-sans uppercase tracking-wider">
                  📖 Pendataan Jadwal Siswa
                </div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Jadwal Belajar: <span className="text-emerald-600 dark:text-emerald-400">Ahmad Muzakki (Kelas VII - A)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                  {role === 'Walisantri'
                    ? "Orang tua dapat memantau padatnya program belajar santri di bawah ini—mencakup porsi Sekolah Formal Kemenag di pagi hari serta kurikulum internal Salafiyah/Kitab Kuning dan Tahfidz pada sore & malam."
                    : "Santri dapat memantau jadwal belajar harian Anda di bawah ini—selalu perhatikan transisi dari Kurikulum Formal pagi ke Kurikulum Kepesantrenan sore hari."}
                </p>
              </div>
              <div className="bg-white dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/20 p-4 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs leading-5 shadow-sm">
                <div className="font-bold flex items-center gap-1 text-[11px] mb-1"><Bookmark className="w-3.5 h-3.5" /> STATS BEBAN BELAJAR:</div>
                <div className="text-[11px] font-mono whitespace-nowrap">📚 Kurikulum Formal: 3 Matpel</div>
                <div className="text-[11px] font-mono whitespace-nowrap">🕌 Kurikulum Kepesantrenan: 5 Matpel</div>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH AND FILTERS (DUAL CURRICULUM TOGGLE) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          {/* Dynamic Curriculum Switcher Tabs */}
          <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-lg overflow-x-auto w-full sm:w-auto border border-slate-200 dark:border-white/5">
            <button
              id="curriculum-toggle-all"
              onClick={() => setCurriculumFilter('All')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm",
                curriculumFilter === 'All'
                  ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              Semua Kurikulum
            </button>
            {curriculumList.map((curr, idx) => (
              <button
                key={curr}
                id={`curriculum-toggle-${curr.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                onClick={() => setCurriculumFilter(curr)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm",
                  curriculumFilter === curr
                    ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", idx % 2 === 0 ? "bg-blue-500" : "bg-emerald-500")}></span>
                {curr}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* View Mode Grid/List Toggle */}
            <div className="flex items-center border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 rounded-lg p-0.5 shrink-0 shadow-sm">
              <button
                id="viewmode-grid"
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 rounded-md transition-colors", viewMode === 'grid' ? "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                title="Grid Cards"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                id="viewmode-table"
                onClick={() => setViewMode('table')}
                className={cn("p-1.5 rounded-md transition-colors", viewMode === 'table' ? "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                title="List Table"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {isAdmin && (
              <button
                id="add-schedule-btn"
                onClick={() => handleOpenAddModal('schedule')}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition-all shrink-0 ml-auto shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Jadwal
              </button>
            )}
          </div>
        </div>

        {/* RENDER GRID MODE */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSchedules.map(item => {
              const timerInfo = getTimeStatus(item.day, item.time);
              const isFormal = item.curriculum === 'Formal';

              return (
                <div
                  key={item.id}
                  className={cn(
                    "relative border rounded-2xl p-5 overflow-hidden transition-all duration-300 flex flex-col justify-between shadow-sm",
                    isFormal ? "bg-blue-50/30 dark:bg-blue-950/5 hover:border-blue-500/30 dark:hover:border-blue-500/20" : "bg-amber-50/30 dark:bg-amber-950/5 hover:border-amber-500/30 dark:hover:border-amber-500/20",
                    timerInfo.status === 'running' ? "border-emerald-500/40 outline outline-1 outline-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/10" : "border-slate-200 dark:border-white/10",
                    "group bg-white dark:bg-[#0a0a0a]"
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border font-sans shadow-sm",
                        isFormal
                          ? "bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                          : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/25"
                      )}>
                        {item.curriculum}
                      </span>

                      <span className={cn("text-[9px] px-2 py-0.5 rounded border font-bold font-mono tracking-wider", timerInfo.colorClass)}>
                        {timerInfo.label}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight line-clamp-1">{item.subject}</h4>
                      <p className="text-xs text-slate-500 mt-1 dark:text-slate-400 flex items-center gap-1 font-medium select-none">
                        👤 {item.teacher}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-black/20 p-2.5 rounded-lg space-y-1.5 border border-slate-200 dark:border-slate-800/20 font-mono text-xs">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>🗓️ Hari KBM</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold">{item.day}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>🕒 Jam Belajar</span>
                        <span className="text-slate-800 dark:text-slate-100 font-bold">{item.time}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400 font-sans">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      Kelas {item.class}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-350">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {item.room}
                    </span>
                  </div>

                  {/* Actions for Admins */}
                  {isAdmin && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-900/90 py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-sm">
                      <button
                        id={`edit-sched-${item.id}`}
                        onClick={() => handleEditSchedule(item)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="Edit Schedule"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`del-sched-${item.id}`}
                        onClick={() => handleDeleteSchedule(item.id)}
                        className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-white/5 transition-colors"
                        title="Delete Schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST / TABLE VIEW */
          <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-300">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="p-4">Hari / Waktu</th>
                  <th className="p-4">Mata Pelajaran</th>
                  <th className="p-4">Tipe Kurikulum</th>
                  <th className="p-4">Guru / Ustadz</th>
                  <th className="p-4">Kelompok Belajar & Ruangan</th>
                  <th className="p-4">Status Sim</th>
                  {isAdmin && <th className="p-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
                {filteredSchedules.map(item => {
                  const timerInfo = getTimeStatus(item.day, item.time);
                  const isFormal = item.curriculum === 'Formal';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 font-mono font-medium text-slate-800 dark:text-slate-100 block sm:table-cell">
                        <div>{item.day}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.time}</div>
                      </td>
                      <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                        {item.subject}
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                          isFormal ? "bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500"
                        )}>
                          {item.curriculum}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-400 font-medium">
                        {item.teacher}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-300">{item.class}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.room}</div>
                      </td>
                      <td className="p-4">
                        <span className={cn("text-[9px] px-2 py-0.5 rounded border font-semibold font-mono whitespace-nowrap", timerInfo.colorClass)}>
                          {timerInfo.label}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              id={`table-edit-${item.id}`}
                              onClick={() => handleEditSchedule(item)}
                              className="p-1 px-2.5 bg-indigo-50 dark:bg-indigo-600/10 hover:bg-indigo-100 dark:hover:bg-indigo-600/30 text-indigo-600 dark:text-indigo-400 rounded transition-all font-medium text-[10px]"
                            >
                              Edit
                            </button>
                            <button
                              id={`table-del-${item.id}`}
                              onClick={() => handleDeleteSchedule(item.id)}
                              className="p-1 px-2 bg-red-50 dark:bg-red-600/10 hover:bg-red-100 dark:hover:bg-red-600/30 text-red-600 dark:text-red-400 rounded transition-all font-medium text-[10px]"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Render Jurnal Tab View
  const renderKBM = () => {
    const isAllowAddKBM = role === 'Ustadz';
    const isWalisantriOrSantri = ['Santri', 'Walisantri'].includes(role);

    if (isWalisantriOrSantri) {
      // Transparency Panel (Parent / Student View)
      // Filter jurnals according to selected child's class
      const childJurnals = jurnals.filter(item => item.class === selectedChild.class);

      return (
        <div className="space-y-6">
          {/* Transparency Info Banner */}
          <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-md">
                🔍 Transparansi Akademik Walisantri & Santri
              </span>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">Laporan Real-Time Kegiatan Belajar Mengajar (KBM)</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Pencatatan materi harian ustadz, keselarasan Kurikulum Merdeka, serta status kehadiran ananda sesi-demi-sesi.
              </p>
            </div>

            {/* Child Selector for simulation and real view */}
            <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center gap-3 shrink-0 shadow-sm">
              <div className="text-left font-sans">
                <label className="block text-[9px] uppercase font-bold text-slate-500">Pilih Santri (Simulasi)</label>
                <select
                  value={selectedChild.name}
                  onChange={e => {
                    const found = mockChildren.find(c => c.name === e.target.value);
                    if (found) setSelectedChild(found);
                  }}
                  className="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-300 focus:outline-none cursor-pointer mt-0.5"
                >
                  {mockChildren.map(c => (
                    <option key={c.name} value={c.name} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {c.name} ({c.class})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                {selectedChild.name.charAt(0)}
              </div>
            </div>
          </div>

          {childJurnals.length === 0 ? (
            <div className="bg-slate-50 dark:bg-black/20 border border-dashed border-slate-200 dark:border-slate-800 p-10 rounded-xl text-center text-slate-500 dark:text-slate-400 text-xs">
              📭 Belum ada pencatatan Jurnal KBM yang terpublish untuk kelas <strong>{selectedChild.class}</strong> hari ini.
            </div>
          ) : (
            <div className="relative border-l-2 border-indigo-200 dark:border-indigo-500/20 pl-6 space-y-6">
              {childJurnals.map((item) => {
                const myAttendance = item.studentAttendance?.[selectedChild.name] || 'Hadir';
                return (
                  <div key={item.id} className="relative bg-white dark:bg-[#0d111a]/80 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all space-y-4 animate-in fade-in duration-300">
                    {/* Timestamp Dot */}
                    <div className="absolute -left-[32px] top-6 w-3 h-3 rounded-full bg-indigo-500 border-4 border-slate-50 dark:border-slate-950 shadow-sm" />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-white/[0.04]">
                      <div className="space-y-1 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold">{item.date}</span>
                          <span className="text-[10px] text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/15 font-bold font-mono">
                            Kelas {item.class}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">{item.subject}</h4>
                      </div>

                      {/* INDIVIDUAL ATTENDANCE STATE BADGES */}
                      <div>
                        {myAttendance === 'Hadir' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-full text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            Ananda Hadir Kelas (H)
                          </span>
                        )}
                        {myAttendance === 'Sakit' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-full text-xs font-bold text-amber-700 dark:text-amber-400 font-sans">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Ananda Sakit (S)
                          </span>
                        )}
                        {myAttendance === 'Izin' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-full text-xs font-bold text-blue-700 dark:text-blue-400 font-sans">
                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            Ananda Izin (I)
                          </span>
                        )}
                        {myAttendance === 'Ghaib' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-full text-xs font-bold text-red-700 dark:text-red-400 font-sans">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            Ananda Ghaib / Absen (A)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Objective Box */}
                    <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/40 p-3 rounded-lg text-xs space-y-1">
                      <div className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 font-sans">
                        Capaian / Tujuan Pembelajaran (Kurikulum Merdeka PT)
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 font-medium">
                        {item.competency || 'Menguasai materi bab yang diajarkan oleh Ustadz'}
                      </div>
                    </div>

                    {/* Topic Update Bubble */}
                    <div className="text-xs space-y-1.5">
                      <div className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                        Rangkuman Pembahasan Materi Hari Ini
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 italic font-sans leading-relaxed">
                        &ldquo;{item.topic}&rdquo;
                      </p>
                    </div>

                    {/* Teacher Footer Info */}
                    <div className="pt-3 border-t border-slate-100 dark:border-white/[0.03] flex items-center justify-between text-[11px] text-slate-500 font-medium font-sans">
                      <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                          {item.teacher.substring(5, 6) || 'U'}
                        </div>
                        Pendidik: <strong className="text-slate-800 dark:text-slate-300">{item.teacher}</strong>
                      </span>
                      <span>
                        Sesi status: <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">{item.status}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Otherwise, Administrator / Teacher Table View with Dynamic Attendance Sheet Expansion!
    return (
      <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-black/20">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Jurnal Mengajar Harian (KBM)</h3>
            <p className="text-xs text-slate-500">Log pencatatan materi ustadz di kelas setelah selesai waktu belajar. Klik baris untuk detail presensi.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintJurnal}
              disabled={jurnals.length === 0}
              className={cn("text-xs px-3.5 py-2 rounded-lg transition-all font-bold flex items-center gap-1",
                jurnals.length === 0 ? "bg-slate-800/50 text-slate-500 cursor-not-allowed" : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Cetak Jurnal
            </button>
            {isAllowAddKBM && (
              <button
                id="isi-jurnal-btn"
                onClick={() => handleOpenAddModal('kbm')}
                className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3.5 py-2 rounded-lg hover:bg-indigo-500/20 transition-all font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Isi Jurnal KBM
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/60 text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                <th className="p-4 w-28">Tanggal</th>
                <th className="p-4">Kelas & Mata Pelajaran</th>
                <th className="p-4">Capaian Pembelajaran (Kurikulum Merdeka)</th>
                <th className="p-4">Materi (Topic)</th>
                <th className="p-4 text-center">Kehadiran</th>
                <th className="p-4">Status & Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {jurnals.map(item => {
                const isExpanded = expandedJurnalId === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setExpandedJurnalId(isExpanded ? null : item.id)}
                    >
                      <td className="p-4 font-mono font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {item.date}
                      </td>
                      <td className="p-4">
                        <div className="text-slate-800 dark:text-slate-200 font-semibold">{item.subject}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Ustadz: {item.teacher}</div>
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5 font-bold font-mono">Kelas: {item.class}</div>
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={item.competency}>
                        {item.competency || 'Kompetensi draf terlampir'}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-400 font-sans italic max-w-xs truncate" title={item.topic}>
                        &ldquo;{item.topic}&rdquo;
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                          {item.attendance}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border uppercase", item.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20")}>
                            {item.status === 'Completed' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {item.status}
                          </span>
                          <button
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedJurnalId(isExpanded ? null : item.id);
                            }}
                          >
                            <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded ? "rotate-90" : "")} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDABLE ATTENDANCE SHEET DETAIL ROWS */}
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-slate-950/40">
                        <td colSpan={6} className="p-4 sm:px-6">
                          <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-850 rounded-xl p-4 space-y-3 shadow-inner">
                            <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider font-sans block">
                              📋 Lembar Presensi Sesi Detail Kelas {item.class}
                            </span>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                              {item.studentAttendance && Object.keys(item.studentAttendance).length > 0 ? (
                                Object.entries(item.studentAttendance).map(([studName, status]) => (
                                  <div key={studName} className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg flex items-center justify-between gap-2.5">
                                    <div className="truncate">
                                      <div className="font-semibold text-[11px] text-slate-800 dark:text-slate-200 truncate">{studName}</div>
                                      <div className="text-[9px] text-slate-500">Santri Aktif</div>
                                    </div>

                                    <div>
                                      {status === 'Hadir' && (
                                        <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[9px] font-bold rounded">
                                          Hadir
                                        </span>
                                      )}
                                      {status === 'Sakit' && (
                                        <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-500/20 text-[9px] font-bold rounded">
                                          Sakit
                                        </span>
                                      )}
                                      {status === 'Izin' && (
                                        <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 text-[9px] font-bold rounded">
                                          Izin
                                        </span>
                                      )}
                                      {status === 'Ghaib' && (
                                        <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border border-red-200 dark:border-red-500/20 text-[9px] font-bold rounded">
                                          Ghaib
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="col-span-full py-2 text-center text-slate-500 text-xs">
                                  Presensi detil tersimpan secara global as {item.attendance} untuk sesi KBM ini.
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render Grade Tab View
  const renderAssessment = () => {
    const isAllowGrading = role === 'Ustadz';
    const isWalisantriOrSantri = ['Santri', 'Walisantri'].includes(role);

    // Filter assessments dynamically
    const filteredAssessments = assessments.filter(item => {
      // If parent/student, auto-restrict to their registered child
      if (isWalisantriOrSantri) {
        return item.student === selectedChild.name;
      }
      return true;
    });

    const getScoreStatusProps = (score: number) => {
      if (score >= kktpThreshold) {
        return {
          label: 'Lulus KKTP',
          colorClass: 'bg-emerald-550/15 text-emerald-400 border-emerald-500/30',
          badgeText: 'MEMENUHI'
        };
      } else if (score >= 60) {
        return {
          label: 'Limit KKTP',
          colorClass: 'bg-amber-550/15 text-amber-500 border-amber-500/30',
          badgeText: 'MENDEKATI'
        };
      } else {
        return {
          label: 'Butuh Remedial',
          colorClass: 'bg-red-550/15 text-red-400 border-red-500/30',
          badgeText: 'REMEDIAL'
        };
      }
    };

    // Calculate unique list of classes and subjects for select selectors
    const uniqueSubjects = Array.from(new Set(assessments.map(a => a.subject)));

    // Handler for opening Remedial Input Dialog
    const handleOpenRemedial = (item: any) => {
      setRemedialAssessment(item);
      setRemedialNewScore(Math.max(kktpThreshold, 75)); // Suggest standard pass
    };

    const handleSaveRemedialSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!remedialAssessment) return;

      if (raporLocked) {
        setAcademicToast({ message: '🔒 Sistem Remedial Dikunci oleh Administrator. Nilai baru tidak dapat disunting sementara waktu.', type: 'warning' });
        return;
      }

      const updatedScore = remedialNewScore;
      setAssessments(prev => prev.map(item => {
        if (item.id === remedialAssessment.id) {
          return {
            ...item,
            score: updatedScore,
            remedialStatus: 'Solved',
            originalScore: item.originalScore || item.score
          };
        }
        return item;
      }));

      setAcademicToast({ message: `✅ Re-test Berhasil! Status remedial ananda "${remedialAssessment.student}" dinyatakan Tuntas dengan nilai: ${updatedScore}.`, type: 'success' });
      setRemedialAssessment(null);
    };

    // Handler for submitting batch grades
    const handleSaveBatch = () => {
      if (raporLocked) {
        setAcademicToast({ message: '🔒 Sistem Penilaian Dikunci oleh Administrator. Nilai baru tidak dapat disimpan sementara waktu.', type: 'warning' });
        return;
      }
      const activeStudentsInClass = getStudentsForClass(batchClass);
      const newBatchItems: any[] = [];
      let inputCount = 0;

      activeStudentsInClass.forEach(student => {
        const inputString = batchScores[student];
        if (inputString !== undefined && inputString.trim() !== '') {
          const numScore = Number(inputString);
          if (Number.isFinite(numScore) && numScore >= 0 && numScore <= 100) {
            const isNeedRemedial = numScore < kktpThreshold;
            newBatchItems.push({
              id: generateUniqueId('Batch Grades', []),
              student: student,
              class: batchClass,
              type: batchType,
              subject: batchSubject,
              score: numScore,
              category: batchCategory,
              remedialStatus: isNeedRemedial ? 'Needed' : 'None',
              originalScore: isNeedRemedial ? numScore : undefined
            });
            inputCount++;
          }
        }
      });

      if (inputCount === 0) {
        setAcademicToast({ message: "⚠️ Mohon isi nilai angka valid (0 - 100) untuk minimal satu atau beberapa santri terlebih dahulu.", type: 'warning' });
        return;
      }

      setAssessments(prev => [...newBatchItems, ...prev]);
      setBatchScores({});
      setAssessmentSubTab('list');
      setAcademicToast({ message: `🎉 Sukses mempublikasikan ${inputCount} nilai mata pelajaran ${batchSubject} untuk Kelas ${batchClass}!`, type: 'success' });
    };

    // Calculate dynamically calculated values for report card tab (SubTab 3)
    // List all students in class (either parent's selected child, or the dynamic class selected)
    const activeRecapClass = isWalisantriOrSantri ? selectedChild.class : batchClass;
    const recapStudents = isWalisantriOrSantri ? [selectedChild.name] : getStudentsForClass(activeRecapClass);

    const dynamicRecapData = recapStudents.map(studentName => {
      const studentGrades = assessments.filter(a => a.student === studentName && a.class === activeRecapClass);

      const hasValidScore = (grade: any) =>
        grade.score !== null &&
        grade.score !== undefined &&
        String(grade.score).trim() !== '' &&
        Number.isFinite(Number(grade.score)) &&
        Number(grade.score) >= 0 &&
        Number(grade.score) <= 100;
      const formativeGrades = studentGrades.filter(g => g.category === 'Formative' && hasValidScore(g));
      const summativeGrades = studentGrades.filter(g => g.category === 'Summative' && hasValidScore(g));

      const formativeAvg = formativeGrades.length > 0
        ? formativeGrades.reduce((sum, g) => sum + Number(g.score), 0) / formativeGrades.length
        : 0;

      const summativeAvg = summativeGrades.length > 0
        ? summativeGrades.reduce((sum, g) => sum + Number(g.score), 0) / summativeGrades.length
        : 0;

      // Do not publish a weighted result until both weighted categories have valid scores.
      const safeFormativeWeight = Number.isFinite(formativeWeight)
        ? Math.min(100, Math.max(0, formativeWeight))
        : 40;
      const summativeWeight = 100 - safeFormativeWeight;
      const hasCompleteWeights = formativeGrades.length > 0 && summativeGrades.length > 0;
      const finalWeightedScore = hasCompleteWeights
        ? Math.round((formativeAvg * safeFormativeWeight + summativeAvg * summativeWeight) / 100)
        : null;

      return {
        student: studentName,
        formativeAvg: Math.round(formativeAvg),
        summativeAvg: Math.round(summativeAvg),
        hasFormativeGrades: formativeGrades.length > 0,
        hasSummativeGrades: summativeGrades.length > 0,
        weightedScore: finalWeightedScore,
        gradesCount: formativeGrades.length + summativeGrades.length,
        isQualified: finalWeightedScore !== null && finalWeightedScore >= kktpThreshold,
        remedialCount: studentGrades.filter(g => hasValidScore(g) && Number(g.score) < kktpThreshold && g.remedialStatus !== 'Solved').length
      };
    });

    return (
      <div className="space-y-6">
        {isRaporEffectivelyLocked && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 rounded-2xl flex items-center gap-3 text-red-700 dark:text-red-400 font-sans shadow-sm animate-pulse">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-500" />
            <div>
              <span className="font-bold text-red-800 dark:text-slate-100 text-xs uppercase block tracking-wider">🔒 SISTEM PENILAIAN DIKUNCI (SEMESTER FINAL)</span>
              <p className="text-[11px] text-red-600 dark:text-slate-300 mt-0.5 leading-relaxed font-sans">
                SuperAdmin atau Administrator sekolah telah mengunci seluruh penginputan rapor semester ganjil ini. Nilai baru tidak dapat direkam, dan penginputan remedial dinonaktifkan sementara waktu sampai kunci dibuka kembali.
              </p>
            </div>
          </div>
        )}

        {/* Parent Simulation Switcher (Only for Parents/Students) */}
        {isWalisantriOrSantri && (
          <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm font-sans">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-md">
                🎓 Buku Rapor & Nilai Saya
              </span>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">Sistem Evaluasi Kurikulum Merdeka</h3>
              <p className="text-xs text-slate-400">
                Laporan transparan akumulasi nilai formatif harian, nilai sumatif PTS/PAS, dan status ketuntasan KKTP ananda.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center gap-3 shrink-0 shadow-sm">
              <div className="text-left">
                <label className="block text-[9px] uppercase font-bold text-slate-500">Pilih Santri (Simulasi)</label>
                <select
                  value={selectedChild.name}
                  onChange={e => {
                    const found = mockChildren.find(c => c.name === e.target.value);
                    if (found) setSelectedChild(found);
                  }}
                  className="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-300 focus:outline-none cursor-pointer mt-0.5"
                >
                  {mockChildren.map(c => (
                    <option key={c.name} value={c.name} className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {c.name} ({c.class})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                {selectedChild.name.charAt(0)}
              </div>
            </div>
          </div>
        )}

        {/* Global Kurikulum Merdeka Configuration Panel (Adjustable Standards & Weightings) */}
        <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 p-5 rounded-xl space-y-4 shadow-sm font-sans animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 pb-3">
            <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pengaturan Standar Penilaian (Kurikulum Merdeka)</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* KKTP Standard Limit Setup */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Standar nilai minimal ketuntasan mata pelajaran.</p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded font-mono font-medium text-xs">
                  {kktpThreshold}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={65} max={85}
                  value={kktpThreshold}
                  onChange={e => setKktpThreshold(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer accent-indigo-500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standar default pondok pesantren adalah 75.
              </p>
            </div>

            {/* Formative vs Summative Weighting Config */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Proporsi Bobot Penilaian
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Rasio asesmen Formatif (Harian) & Sumatif (Ujian).</p>
                </div>
                <div className="flex gap-2 font-mono text-xs font-medium">
                  <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded">F: {formativeWeight}%</span>
                  <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded">S: {100 - formativeWeight}%</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={20} max={60} step={5}
                  value={formativeWeight}
                  onChange={e => setFormativeWeight(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer accent-indigo-500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rumus: ({formativeWeight}% Formatif) + ({100 - formativeWeight}% Sumatif)
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg overflow-x-auto w-full sm:w-auto border border-slate-200 dark:border-white/5">
            <button
              onClick={() => setAssessmentSubTab('list')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm",
                assessmentSubTab === 'list'
                  ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <FileText className="w-4 h-4" /> Log Nilai Harian
            </button>

            {isAllowGrading && (
              <button
                onClick={() => setAssessmentSubTab('batch')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm",
                  assessmentSubTab === 'batch'
                    ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Grid className="w-4 h-4" /> Rapid Input Masal
              </button>
            )}

            <button
              onClick={() => setAssessmentSubTab('recap')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm",
                assessmentSubTab === 'recap'
                  ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <Award className="w-4 h-4" /> Rangkuman Kurikulum Merdeka
            </button>
          </div>

          {!isWalisantriOrSantri && isAllowGrading && assessmentSubTab === 'list' && (
            <button
              id="tambah-nilai-cepat-btn"
              onClick={() => handleOpenAddModal('assessment')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Tambah Individu
            </button>
          )}
        </div>

        {/* SUBTAB 1: INDIVIDUAL LOG LIST VIEW */}
        {assessmentSubTab === 'list' && (
          <div className="bg-white dark:bg-[#0d121f] border border-slate-200 dark:border-slate-800/70 rounded-2xl overflow-hidden shadow-sm animate-in font-sans fade-in-30 speed-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/30 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Riwayat Entri & Pencapaian Evaluasi Belajar</h3>
                <p className="text-[11px] text-slate-500">Daftar buku nilai komparatif seluruh mata ujian dan kuis kepesantrenan.</p>
              </div>

              {!isWalisantriOrSantri && (
                <div className="flex gap-2">
                  <select
                    value={batchClass}
                    onChange={e => setBatchClass(e.target.value)}
                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-300 rounded px-2.5 py-1 text-[11px] focus:outline-none focus:border-indigo-500"
                  >
                    <option value="VII - A">Filter Kelas VII - A</option>
                    <option value="VII - B">Filter Kelas VII - B</option>
                    <option value="VIII - B">Filter Kelas VIII - B</option>
                    <option value="IX - A">Filter Kelas IX - A</option>
                  </select>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/60 text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 font-sans">
                    <th className="p-4">Santri</th>
                    <th className="p-4">Kelas</th>
                    <th className="p-4">Agenda Penilaian & Kategori</th>
                    <th className="p-4">Kajian Pelajaran</th>
                    <th className="p-4 text-center">Skor Angka</th>
                    <th className="p-4 text-center">Status KKTP</th>
                    <th className="p-4 text-right">Opsi Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03] text-slate-700 dark:text-slate-300 font-sans">
                  {filteredAssessments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                        📭 Belum ada pencatatan nilai yang memenuhi filter kriteria saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredAssessments.map(item => {
                      const statusProps = getScoreStatusProps(item.score);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{item.student}</td>
                          <td className="p-4 text-slate-500 font-medium font-mono">{item.class}</td>
                          <td className="p-4">
                            <div className="text-slate-700 dark:text-slate-300 font-semibold">{item.type}</div>
                            <span className={cn(
                              "text-[9px] uppercase font-bold font-sans px-1.5 py-0.2 rounded border",
                              item.category === 'Summative'
                                ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20"
                                : "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/20"
                            )}>
                              {item.category || 'Formative'}
                            </span>
                          </td>
                          <td className="p-4 font-medium text-slate-600 dark:text-slate-400">{item.subject}</td>

                          {/* RAW GRADE SCORE WITH COMPARATIVE COLORS */}
                          <td className="p-4 text-center font-mono">
                            <span className={cn(
                              "px-2.5 py-1 rounded inline-flex flex-col items-center justify-center min-w-[44px] font-bold text-center border font-mono text-sm",
                              item.score >= kktpThreshold
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                                : item.score >= 60
                                  ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20"
                                  : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/25"
                            )}>
                              {item.score}
                            </span>
                          </td>

                          {/* KKTP QUALITY BADGES */}
                          <td className="p-4 text-center">
                            <span className={cn(
                              "text-[9px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded-full border",
                              statusProps.colorClass
                            )}>
                              {statusProps.badgeText}
                            </span>
                          </td>

                          {/* DYNAMIC REMEDIAL TRIGGERS */}
                          <td className="p-4 text-right">
                            <div className="flex justify-end items-center gap-2">
                              {/* If below configured KKTP and unresolved, offer remedial action */}
                              {item.score < kktpThreshold && item.remedialStatus !== 'Solved' && (
                                <>
                                  <span className="text-[10px] text-red-700 dark:text-red-400 font-bold bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-505 px-2 py-0.5 rounded flex items-center gap-1 font-sans">
                                    <AlertTriangle className="w-2.5 h-2.5 text-red-600 dark:text-red-400 animate-bounce" /> Butuh Remedial
                                  </span>
                                  {isAllowGrading && (
                                    <button
                                      onClick={() => handleOpenRemedial(item)}
                                      className="text-[10px] bg-red-600 hover:bg-red-500 dark:bg-red-650/80 dark:hover:bg-red-600 font-bold text-white px-2 py-1 rounded-md transition-all shadow-sm active:scale-95"
                                    >
                                      Re-Test Sekarang
                                    </button>
                                  )}
                                </>
                              )}

                              {/* If remedial has been resolved previously */}
                              {item.remedialStatus === 'Solved' && (
                                <div className="text-left select-none text-[10px] leading-tight flex flex-col items-end">
                                  <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" /> Remedial Tuntas
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                    Histori: {item.originalScore} &rarr; {item.score}
                                  </span>
                                </div>
                              )}

                              {/* Standard score above 60 with no remedial needed */}
                              {item.score >= 60 && item.remedialStatus !== 'Solved' && (
                                <span className="text-[10px] text-slate-500 font-medium font-sans">
                                  Sesi Selesai (Aman)
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 2: RAPID BATCH SCORE INPUT SPREADSHEET */}
        {assessmentSubTab === 'batch' && isAllowGrading && (
          <div className="bg-white dark:bg-[#0c0f1b] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm animate-in font-sans fade-in duration-300">
            {/* Batch Select Options Block */}
            <div className="p-5 border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/40 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/30 pb-2">
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Grid className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Lembar Spreadsheet Input Kelas Masal
                  </h3>
                  <p className="text-xs text-slate-500">Isi seluruh nilai santri se-kelas secara vertikal untuk efisiensi entri harian.</p>
                </div>
                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-md font-mono font-bold shadow-sm">
                  MODE: RAPID DOWNWARD GRADING
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 mb-1.5">1. Target Kelas</label>
                  <select
                    value={batchClass}
                    onChange={e => {
                      setBatchClass(e.target.value);
                      setBatchScores({}); // clear form state to avoid cross-classroom dirty typing
                    }}
                    className="w-full bg-white dark:bg-black/45 border border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
                  >
                    {availableClasses.map(cls => (
                      <option key={cls} value={cls}>Kelas {cls}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 mb-1.5">2. Mata Pelajaran</label>
                  <select
                    value={batchSubject}
                    onChange={e => setBatchSubject(e.target.value)}
                    className="w-full bg-white dark:bg-black/45 border border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
                  >
                    {subjectsList.map(subj => (
                      <option key={subj} value={subj}>{subj}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 mb-1.5">3. Agenda Evaluasi</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tugas Harian II, Quiz 1, UAS"
                    value={batchType}
                    onChange={e => setBatchType(e.target.value)}
                    className="w-full bg-white dark:bg-black/45 border border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs font-mono font-medium shadow-sm placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 mb-1.5">4. Kategori Kurikulum</label>
                  <select
                    value={batchCategory}
                    onChange={e => setBatchCategory(e.target.value as 'Formative' | 'Summative')}
                    className="w-full bg-white dark:bg-black/45 border border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
                  >
                    <option value="Formative">Formatif (Tugas/Praktek/Harian)</option>
                    <option value="Summative">Sumatif (PTS/PAS/Ujian)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Downward Vertical Spreadsheet */}
            <div className="p-4 sm:p-6 space-y-4 bg-slate-50 dark:bg-transparent">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase block">
                📋 Pengisian Nilai Angka Anggota Kelas {batchClass} ({getStudentsForClass(batchClass).length} Santri Aktif ditemukan di Master Data)
              </span>

              <div className="border border-slate-200 dark:border-slate-800/60 rounded-xl overflow-hidden bg-white dark:bg-slate-950/20 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[9px] uppercase font-bold text-slate-500 tracking-widest font-sans">
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3">Nama Santri</th>
                      <th className="p-3 w-40">Kredit Status</th>
                      <th className="p-3 w-36 text-center">Nilai Angka (0-100)</th>
                      <th className="p-3 text-center">Status Visual (Live KKTP)</th>
                      <th className="p-3 w-28 text-right">Kelayakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
                    {getStudentsForClass(batchClass).map((student, index) => {
                      const typedValue = batchScores[student] || '';
                      const hasValue = typedValue.trim() !== '';
                      const parseScore = Number(typedValue);
                      const isValid = Number.isFinite(parseScore) && parseScore >= 0 && parseScore <= 100;

                      let liveStatusLabel = "Menunggu...";
                      let liveBadgeClasses = "bg-slate-100 dark:bg-slate-800/30 text-slate-500 dark:text-slate-550 border-slate-200 dark:border-slate-800";

                      if (hasValue && isValid) {
                        if (parseScore >= kktpThreshold) {
                          liveStatusLabel = `≥ ${kktpThreshold} (TUNTAS)`;
                          liveBadgeClasses = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20";
                        } else if (parseScore >= 60) {
                          liveStatusLabel = "Limit KKTP";
                          liveBadgeClasses = "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20";
                        } else {
                          liveStatusLabel = '< ' + kktpThreshold + ' (Remedial)';
                          liveBadgeClasses = "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20 animate-pulse";
                        }
                      } else if (hasValue && !isValid) {
                        liveStatusLabel = "Format Salah";
                        liveBadgeClasses = "bg-slate-100 dark:bg-slate-850 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/40";
                      }

                      return (
                        <tr key={student} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                          <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-550">{index + 1}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{student}</td>
                          <td className="p-3 text-slate-500 font-sans">Santri Reguler</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min={0} max={100}
                              placeholder="Ketik nilai..."
                              value={typedValue}
                              onChange={e => {
                                const val = e.target.value;
                                setBatchScores(prev => ({
                                  ...prev,
                                  [student]: val
                                }));
                              }}
                              className="w-24 text-center bg-white dark:bg-black/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded px-2.5 py-1 text-xs font-mono font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm"
                            />
                          </td>

                          {/* INSTANT INTERACTIVE VISUAL STATUS BADGE */}
                          <td className="p-3 text-center">
                            <span className={cn(
                              "text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded border inline-block whitespace-nowrap",
                              liveBadgeClasses
                            )}>
                              {liveStatusLabel}
                            </span>
                          </td>

                          <td className="p-3 text-right">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {hasValue && isValid ? (parseScore >= 60 ? "Ready ✔" : "Trigger Remedial (Red)") : "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action submission buttons */}
              <div className="flex gap-3 justify-end items-center pt-4 border-t border-slate-200 dark:border-slate-800/50">
                <button
                  type="button"
                  onClick={() => {
                    setBatchScores({});
                    setAssessmentSubTab('list');
                  }}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold font-sans hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                >
                  Batalkan
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Simpan & Publikasikan Nilai Masal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: KURIKULUM MERDEKA INTERACTIVE CLASS RECAP */}
        {assessmentSubTab === 'recap' && (
          <div className="bg-white dark:bg-[#0c0f1c] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm animate-in font-sans fade-in-40">
            {/* Header / Config info info */}
            <div className="p-5 border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/40 flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Rapor Kelas & Akumulasi Evaluasi Kurikulum Merdeka
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rangkuman matematis real-time nilai Formatif ({formativeWeight}%) & Sumatif ({100 - formativeWeight}%) penentu kelayakan KKTP <strong>({kktpThreshold})</strong>.
                </p>
              </div>

              {!isWalisantriOrSantri && (
                <div className="flex gap-2">
                  <select
                    value={batchClass}
                    onChange={e => setBatchClass(e.target.value)}
                    className="bg-white dark:bg-black/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 shadow-sm"
                  >
                    {availableClasses.map(cls => (
                      <option key={cls} value={cls}>Kelas {cls}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Cumulative recap grid list table */}
            <div className="p-4 sm:p-6 space-y-4 bg-slate-50 dark:bg-transparent">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block font-sans">
                📊 Lembar Penghitungan Rata-rata Bobot Kelas: Kelas {activeRecapClass}
              </span>

              <div className="border border-slate-200 dark:border-slate-800/60 rounded-xl overflow-hidden bg-white dark:bg-slate-950/20 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[9px] uppercase font-bold text-slate-500 tracking-widest font-sans">
                      <th className="p-3">Nama Lengkap Santri</th>
                      <th className="p-3 text-center">Rerata Formatif (Bobot {formativeWeight}%)</th>
                      <th className="p-3 text-center">Rerata Sumatif (Bobot {100 - formativeWeight}%)</th>
                      <th className="p-3 text-center bg-indigo-50 dark:bg-indigo-950/10">Nilai Akhir Rapor</th>
                      <th className="p-3 text-center">Status Kelulusan BB</th>
                      <th className="p-3 text-right">Catatan Defisit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-slate-700 dark:text-slate-300">
                    {dynamicRecapData.map(item => {
                      return (
                        <tr key={item.student} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.student}</td>
                          <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-300">
                            {item.hasFormativeGrades ? (
                              <span className="font-semibold">{item.formativeAvg}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-550 italic text-[11px]">Belum ada entri</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-300">
                            {item.hasSummativeGrades ? (
                              <span className="font-semibold">{item.summativeAvg}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-550 italic text-[11px]">Belum ada entri</span>
                            )}
                          </td>

                          {/* FINAL CALCULATED ACCUMULATION SCORE */}
                          <td className="p-3 text-center font-mono bg-indigo-50 dark:bg-indigo-950/10">
                            <span className={cn(
                              "text-xs font-black px-2.5 py-1 rounded border",
                              item.weightedScore === null
                                ? "bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                : item.weightedScore >= kktpThreshold
                                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                                  : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                            )}>
                              {item.weightedScore === null ? "—" : item.weightedScore}
                            </span>
                          </td>

                          {/* STANDARD QUALIFICATION EVALUATION */}
                          <td className="p-3 text-center">
                            {item.weightedScore !== null ? (
                              item.isQualified ? (
                                <span className="text-[9px] uppercase font-extrabold tracking-wider bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full">
                                  TUNTAS KKTP ✔
                                </span>
                              ) : (
                                <span className="text-[9px] uppercase font-extrabold tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
                                  DEFISIT TARGET ❌
                                </span>
                              )
                            ) : (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wide">
                                {item.gradesCount > 0 ? 'Nilai belum lengkap' : 'Belum ada nilai'}
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            {item.remedialCount > 0 ? (
                              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-2 py-0.5 rounded">
                                {item.remedialCount} Ujian Butuh Remedial!
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                Seluruh evaluasi tuntas kelola
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Informational Guidance */}
              <div className="bg-indigo-50 dark:bg-slate-900/30 border border-indigo-200 dark:border-slate-800/40 p-4 rounded-xl flex items-start gap-3 shadow-sm">
                <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">ℹ Prosedur Penetapan Nilai Merdeka Kurikulum</span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                    Nilai Akhir diperoleh dengan memadukan seluruh nilai formatif harian ustadz serta nilai penentu sumatif (PTS/PAS) dengan formula pembobotan yang berlaku (misal: 40% Formatif + 60% Sumatif). Santri dinyatakan <strong>TUNTAS KKTP</strong> apabila perolehan nilai akhir melampaui nilai rujukan KKTP <strong>({kktpThreshold})</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL OVERLAY: REMEDIAL RE-TEST SUBMISSION FORM */}
        {remedialAssessment && (
          <div className="fixed inset-0 bg-slate-900/80 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#0b0e17] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200 shadow-2xl font-sans">
              <div className="p-4 border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-500" />
                  Sesi Ujian Ulang / Remedial
                </span>
                <button
                  onClick={() => setRemedialAssessment(null)}
                  className="font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-xs cursor-pointer focus:outline-none"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveRemedialSubmit} className="p-5 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 p-3 rounded-xl space-y-1 text-xs shadow-sm">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Santri Terpilih</div>
                  <div className="font-bold text-indigo-600 dark:text-indigo-300">{remedialAssessment.student}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-sans mt-1">
                    Ujian: <strong>{remedialAssessment.subject}</strong> ({remedialAssessment.type})
                  </div>
                  <div className="text-[11px] text-red-600 dark:text-red-400 font-semibold font-mono mt-0.5">
                    Skor Gagal Awal: {remedialAssessment.score} (Failing Score &lt; 60)
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase tracking-wider font-extrabold text-slate-600 dark:text-slate-400">
                    Masukkan Nilai Baru Re-Test (0 - 100)
                  </label>
                  <input
                    type="number"
                    min={60} max={100}
                    required
                    placeholder="e.g. 78"
                    value={remedialNewScore}
                    onChange={e => setRemedialNewScore(parseInt(e.target.value, 10))}
                    className="w-full bg-white dark:bg-black/55 border border-slate-200 dark:border-slate-805 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm font-mono font-bold focus:border-indigo-500 focus:outline-none text-center shadow-sm"
                  />
                  <span className="text-[9px] text-slate-500 italic block text-center">
                    *Nilai remedial minimum kelulusan Kurikulum Merdeka disarankan ≥{kktpThreshold}.
                  </span>
                </div>

                <div className="flex gap-2.5 justify-end pt-3 border-t border-slate-200 dark:border-slate-850">
                  <button
                    type="button"
                    onClick={() => setRemedialAssessment(null)}
                    className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-850 dark:hover:text-slate-200 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm shadow-indigo-600/10 active:scale-95"
                  >
                    Tuntaskan & Simpan
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Assessment Reports Tab
  const renderReports = () => {
    const isWalisantriOrSantri = ['Santri', 'Walisantri'].includes(role);
    const isAllowGrading = ['SuperAdmin', 'Admin', 'Ustadz'].includes(role);

    // If parent/student is simulated, they should be forced into 'rapor' sub-tab. If Ustadz is active, redirect from Leger to Comments.
    const activeSubTab = isWalisantriOrSantri
      ? 'rapor'
      : (role === 'Ustadz' && reportsSubTab === 'leger')
        ? 'comments'
        : reportsSubTab;

    const LEGER_SUBJECTS = [
      'Fiqih (Merdeka)',
      'Bahasa Arab',
      'Matematika',
      'Tahfidz & Tahsin',
      'Hadits Arba\'in'
    ];

    const activeLegerClass = isWalisantriOrSantri ? selectedChild.class : batchClass;
    const legerStudents = getStudentsForClass(activeLegerClass);

    // Helper to get grade for a student & subject
    const getStudentSubjectAverage = (studentName: string, subjectName: string) => {
      const matchGrades = assessments.filter(a => a.student === studentName && a.subject === subjectName);
      if (matchGrades.length > 0) {
        return Math.round(matchGrades.reduce((sum, g) => sum + g.score, 0) / matchGrades.length);
      }
      // Stable realistic mock formula
      const studentIndex = legerStudents.indexOf(studentName) >= 0 ? legerStudents.indexOf(studentName) : 0;
      const subjectHash = subjectName.charCodeAt(0) + subjectName.charCodeAt(subjectName.length - 1);
      const scoreValue = 72 + (studentIndex * 6 + subjectHash * 4) % 24;
      return scoreValue;
    };

    // Calculate dynamic attendance from journals for this class or fallback beautifully
    const getStudentAttendanceStats = (studentName: string) => {
      let countHadir = 18;
      let countSakit = 1;
      let countIzin = 0;
      let countGhaib = 0;

      const nameHash = studentName.charCodeAt(0) + studentName.charCodeAt(studentName.length - 1);
      countHadir = 16 + (nameHash % 5);
      countSakit = nameHash % 2;
      countIzin = (nameHash % 3) === 0 ? 1 : 0;
      countGhaib = (nameHash % 7) === 0 ? 1 : 0;

      jurnals.forEach(journal => {
        if (journal.class === activeLegerClass && journal.studentAttendance) {
          const status = journal.studentAttendance[studentName];
          if (status === 'Hadir') countHadir++;
          else if (status === 'Sakit') countSakit++;
          else if (status === 'Izin') countIzin++;
          else if (status === 'Sakit (Ustadz)' || status === 'Izin (Ustadz)' || status === 'Absen') {
            countGhaib++;
          }
        }
      });

      return { Hadir: countHadir, Sakit: countSakit, Izin: countIzin, Ghaib: countGhaib };
    };

    // Prepare student recap list
    const ledgerData = legerStudents.map(studentName => {
      const grades = LEGER_SUBJECTS.reduce((acc, sub) => {
        acc[sub] = getStudentSubjectAverage(studentName, sub);
        return acc;
      }, {} as Record<string, number>);

      const totalScore = Object.values(grades).reduce((a, b) => a + b, 0);
      const averageScore = Math.round(totalScore / LEGER_SUBJECTS.length);
      const attendance = getStudentAttendanceStats(studentName);

      return {
        student: studentName,
        grades,
        averageScore,
        attendance
      };
    });

    // Sort by average score to determine ranking
    const sortedLedgerData = [...ledgerData].sort((a, b) => b.averageScore - a.averageScore);

    const handlePrintLeger = () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setAcademicToast({ message: "Mohon izinkan pop-ups browser untuk mencetak Leger Kelas.", type: 'warning' });
        return;
      }

      const htmlContent = `
        <html>
          <head>
            <title>Leger Kelas - ${activeLegerClass}</title>
            <style>
              body { font-family: 'Arial', sans-serif; padding: 20px; color: #111; font-size: 11px; }
              .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .header h2 { margin: 0; padding: 0; font-size: 18px; }
              .header p { margin: 5px 0 0; color: #444; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #333; padding: 6px; text-align: center; }
              th { background-color: #f4f4f4; font-weight: bold; }
              td.name { text-align: left; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>LEGER KELAS (DOKUMEN PENILAIAN AKADEMIK)</h2>
              <p>Kelas: ${activeLegerClass} | Tahun Ajaran: ${academicYear} ${semester} (Merdeka)</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Nama Santri</th>
                  ${LEGER_SUBJECTS.map(sub => `<th>${sub}</th>`).join('')}
                  <th>Rerata Akhir</th>
                  <th>Kehadiran (H/S/I/A)</th>
                </tr>
              </thead>
              <tbody>
                ${sortedLedgerData.map((row, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="name">${row.student}</td>
                    ${LEGER_SUBJECTS.map(sub => `<td>${row.grades[sub]}</td>`).join('')}
                    <td><strong>${row.averageScore}</strong></td>
                    <td>${row.attendance.Hadir}/${row.attendance.Sakit}/${row.attendance.Izin}/${row.attendance.Ghaib}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <script>
              window.onload = () => {
                window.print();
              };
            </script>
          </body>
        </html>
      `;
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    };

    // Get rank function
    const getStudentRank = (studentName: string) => {
      const idx = sortedLedgerData.findIndex(s => s.student === studentName);
      return idx >= 0 ? idx + 1 : 1;
    };

    // Pre-written templates for Comment Generator
    const COMMENT_TEMPLATES = [
      {
        id: 'excellence',
        category: '🌟 Akhlak Mulia & Akademik Unggul',
        text: 'Ananda [Name] menunjukkan pencapaian akademik dan asrama yang luar biasa semester ini. Disiplinnya dalam shalat lima waktu berjamaah serta keaktifannya merespon penjelasan ustadz pantas dicontoh. Hafalan Al-Qur\'an ananda juga sangat progresif. Pertahankan!'
      },
      {
        id: 'motivation',
        category: '📈 Motivasi & Konsistensi Belajar',
        text: 'Ananda [Name] berkepribadian santun dan memiliki kemauan belajar yang stabil. Konsistensi dalam menyimak pelajaran Fiqih dan Bahasa Arab sudah bagus, ustadz berpesan agar meluangkan waktu muraja\'ah mandiri sebelum shalat fardhu.'
      },
      {
        id: 'guidance',
        category: '⚠️ Perlu Stimulasi & Bimbingan Akhlak',
        text: 'Ananda [Name] anak yang cerdas dan berbakat, namun hendaknya lebih disiplin mengurangi bergurau dan berbicara saat halaqah asrama berlangsung. Nilai beberapa mapel masih membutuhkan perhatian lebih. Teruslah berusaha!'
      },
      {
        id: 'discipline',
        category: '🕌 Teladan Disiplin Ibadah & Asrama',
        text: 'Ananda [Name] menunjukkan kemandirian mutlak selama tinggal di asrama kepesantrenan. Ketetapan hati ananda dalam menjaga kebersihan kamar dan selalu hadir halaqah tepat waktu patut dihargai tinggi. Semoga istiqomah.'
      }
    ];

    const handleApplyTemplate = (templateText: string) => {
      const customizedText = templateText.replace(/\[Name\]/g, selectedCommentStudent);
      setCommentDraftText(customizedText);
    };

    const handleSaveCommentDraft = (e: React.FormEvent) => {
      e.preventDefault();
      setWaliKelasComments(prev => ({
        ...prev,
        [selectedCommentStudent]: commentDraftText
      }));
      setAcademicToast({ message: `✅ Berhasil menyimpan Catatan Wali Kelas untuk santri "${selectedCommentStudent}"!`, type: 'success' });
    };

    const handleTriggerOfficialPDF = (studentName: string) => {
      setIsDownloading(true);
      setDownloadProgress(10);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setIsDownloading(false);
        setAcademicToast({ message: "Mohon izinkan pop-ups browser untuk mencetak dokumen E-Rapor.", type: 'warning' });
        return;
      }

      const interval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              setIsDownloading(false);

              const studentData = ledgerData.find(s => s.student === studentName) || {
                student: studentName,
                grades: LEGER_SUBJECTS.reduce((acc, sub) => { acc[sub] = 80; return acc; }, {} as Record<string, number>),
                averageScore: 80,
                attendance: { Hadir: 20, Sakit: 1, Izin: 1, Ghaib: 0 }
              };

              const rank = getStudentRank(studentName);
              const comment = waliKelasComments[studentName] || 'Belum ada catatan tertulis dari wali kelas.';
              const classNameStr = isWalisantriOrSantri ? selectedChild.class : activeLegerClass;

              const htmlContent = `
                <html>
                  <head>
                    <title>E-Rapor Digital - ${studentName}</title>
                    <style>
                      body { font-family: 'Arial', sans-serif; padding: 40px; color: #111; line-height: 1.5; }
                      .header { text-align: center; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 20px; }
                      .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
                      .header p { margin: 5px 0 0; font-size: 14px; color: #444; }
                      .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 30px; font-size: 14px; }
                      .info-grid div { margin-bottom: 5px; }
                      .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; text-transform: uppercase; }
                      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
                      th, td { border: 1px solid #111; padding: 8px; text-align: center; }
                      th { background-color: #f4f4f4; font-weight: bold; }
                      td.subject { text-align: left; font-weight: bold; }
                      .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; font-size: 14px; }
                      .signature { margin-top: 60px; font-weight: bold; text-decoration: underline; }
                      .attendance { display: flex; gap: 20px; font-size: 14px; margin-bottom: 30px; }
                      .attendance div { border: 1px solid #111; padding: 10px 20px; border-radius: 4px; }
                      .comment-box { border: 1px solid #111; padding: 15px; border-radius: 4px; font-size: 14px; font-style: italic; }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <h1>E-Rapor Akademik & Kepesantrenan</h1>
                      <p>${orgInfo.schoolName || 'Pesantren Modern AI Studio'} | Tahun Ajaran ${academicYear} ${semester} (Merdeka)</p>
                    </div>

                    <div class="info-grid">
                      <div><strong>Nama Santri:</strong> ${studentName}</div>
                      <div><strong>Kelas:</strong> ${classNameStr}</div>
                      <div><strong>NIS / NISN:</strong> -</div>
                      <div><strong>Peringkat Kelas:</strong> Ke-${rank}</div>
                    </div>

                    <div class="section-title">I. Capaian Akademik (KBM)</div>
                    <table>
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Mata Pelajaran</th>
                          <th>KKTP</th>
                          <th>Rerata Formatif</th>
                          <th>Rerata Sumatif</th>
                          <th>Nilai Akhir</th>
                          <th>Predikat</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${LEGER_SUBJECTS.map((sub, idx) => {
                          const score = studentData.grades[sub] || 80;
                          const formatVal = Math.min(100, Math.round(score + 2));
                          const sumatVal = Math.max(20, Math.round(score - 3));

                          let predText = "SANGAT BAIK (A)";
                          if (score < kktpThreshold) predText = "PERLU REMEDIAL (D)";
                          else if (score < 75) predText = "CUKUP (C)";
                          else if (score < 85) predText = "BAIK (B)";

                          return `
                            <tr>
                              <td>${idx + 1}</td>
                              <td class="subject">${sub}</td>
                              <td>${kktpThreshold}</td>
                              <td>${formatVal}</td>
                              <td>${sumatVal}</td>
                              <td><strong>${score}</strong></td>
                              <td>${predText}</td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>

                    <div class="section-title">II. Rekapitulasi Kehadiran</div>
                    <div class="attendance">
                      <div><strong>Hadir:</strong> ${studentData.attendance.Hadir} Hari</div>
                      <div><strong>Sakit:</strong> ${studentData.attendance.Sakit} Hari</div>
                      <div><strong>Izin:</strong> ${studentData.attendance.Izin} Hari</div>
                      <div><strong>Ghaib:</strong> ${studentData.attendance.Ghaib} Hari</div>
                    </div>

                    <div class="section-title">III. Catatan Perkembangan Karakter (Wali Kelas)</div>
                    <div class="comment-box">
                      "${comment}"
                    </div>

                    <div class="footer">
                      <div>
                        Mengetahui,<br>Orang Tua / Wali
                        <div class="signature">_______________________</div>
                      </div>
                      <div>
                        Ditetapkan di: Pesantren<br>Tanggal: ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}<br>Wali Kelas
                        <div class="signature">_______________________</div>
                      </div>
                    </div>

                    <script>
                      window.onload = () => {
                        window.print();
                      };
                    </script>
                  </body>
                </html>
              `;

              printWindow.document.write(htmlContent);
              printWindow.document.close();

            }, 300);
            return 100;
          }
          return prev + 30;
        });
      }, 200);
    };

    // Effective student currently viewing in report card
    const currentRaporStudent = isWalisantriOrSantri ? selectedChild.name : previewStudentName;
    const currentRaporClass = isWalisantriOrSantri ? selectedChild.class : activeLegerClass;

    const currentRaporData = ledgerData.find(s => s.student === currentRaporStudent) || {
      student: currentRaporStudent,
      grades: LEGER_SUBJECTS.reduce((acc, sub) => { acc[sub] = 80; return acc; }, {} as Record<string, number>),
      averageScore: 80,
      attendance: { Hadir: 20, Sakit: 1, Izin: 1, Ghaib: 0 }
    };

    const currentRaporRank = getStudentRank(currentRaporStudent);
    const currentRaporComment = waliKelasComments[currentRaporStudent] || 'Belum ada catatan tertulis dari wali kelas.';

    return (
      <div className="space-y-6">
        {/* Parent Simulation Switcher - Only for Walisantri / Santri */}
        {isWalisantriOrSantri && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/15 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm font-sans">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-md">
                🎓 Buku Rapor & Nilai Saya
              </span>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">Sistem Evaluasi Kurikulum Merdeka</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Laporan transparan akumulasi nilai formatif harian, nilai sumatif PTS/PAS, dan status ketuntasan KKTP ananda.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center gap-3 shrink-0 shadow-sm">
              <div className="text-left">
                <label className="block text-[9px] uppercase font-bold text-slate-500">Pilih Santri (Simulasi)</label>
                <select
                  value={selectedChild.name}
                  onChange={e => {
                    const found = mockChildren.find(c => c.name === e.target.value);
                    if (found) setSelectedChild(found);
                  }}
                  className="bg-transparent text-xs font-bold text-emerald-600 dark:text-emerald-300 focus:outline-none cursor-pointer mt-0.5"
                >
                  {mockChildren.map(c => (
                    <option key={c.name} value={c.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {c.name} ({c.class})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                {selectedChild.name.charAt(0)}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Sub Tab Switcher for Admin & Ustadz */}
        {!isWalisantriOrSantri && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-black/40 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800/50 shadow-sm font-sans">
            <div className="flex items-center gap-1 overflow-x-auto">
              {['SuperAdmin', 'Admin'].includes(role) && (
                <button
                  onClick={() => setReportsSubTab('leger')}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                    reportsSubTab === 'leger'
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                      : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  <Grid className="w-3.5 h-3.5" /> Leger Matrix
                </button>
              )}

              <button
                onClick={() => setReportsSubTab('comments')}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                  reportsSubTab === 'comments'
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                    : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Wali Kelas Comments
              </button>

              <button
                onClick={() => setReportsSubTab('rapor')}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap",
                  reportsSubTab === 'rapor'
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                    : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <FileText className="w-3.5 h-3.5" /> E-Rapor Card Preview
              </button>
            </div>

            {/* Target Class Selector for Admin */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Kelas Aktif:</span>
              <select
                value={batchClass}
                onChange={e => {
                  setBatchClass(e.target.value);
                  // Auto adjust previews first student from centralized roster
                  const firstOfClass = getStudentsForClass(e.target.value)?.[0];
                  if (firstOfClass) {
                    setSelectedCommentStudent(firstOfClass);
                    setPreviewStudentName(firstOfClass);
                  }
                }}
                className="bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold rounded px-2 py-1 focus:outline-none focus:border-indigo-500 shadow-sm"
              >
                {availableClasses.map(cls => (
                  <option key={cls} value={cls}>Kelas {cls}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 1. SUB-TAB: LEGER MATRIX SPREADSHEET */}
        {activeSubTab === 'leger' && (
          <div className="space-y-6">
            {/* Admin Configuration Control Panel */}
            {['SuperAdmin', 'Admin'].includes(role) && (
              <div className="bg-white dark:bg-[#0b101d] border border-indigo-100 dark:border-indigo-500/15 p-5 rounded-2xl space-y-4 shadow-sm font-sans animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 dark:border-slate-800/60 pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">SISTEM KONFIGURASI & KUNCI E-RAPOR</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">Kelola bobot nilai kurikulum merdeka, kunci kelayakan remedial, dan ekspor data leger harian.</p>
                    </div>
                  </div>

                  {/* Lock Switcher Button */}
                  <button
                    onClick={() => {
                      const nextLocked = !raporLocked;
                      setRaporLocked(nextLocked);
                      setAcademicToast({
                        message: nextLocked
                          ? '🔒 E-Rapor Berhasil DIKUNCI! Pengisian nilai dan catatan dinonaktifkan sementara.'
                          : '🔓 E-Rapor Berhasil DIBUKA! Ustadz pengajar dapat kembali melengkapi nilai.',
                        type: nextLocked ? 'warning' : 'success'
                      });
                    }}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer font-sans",
                      raporLocked
                        ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20"
                        : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                    )}
                  >
                    {raporLocked ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-red-600 dark:text-red-500" /> Lock Status: TERKUNCI (Klik Buka)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Lock Status: TERBUKA (Klik Kunci)
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  {/* Slider 1: KKTP */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Ambang Batas KKTP</span>
                      <span className="text-[10.5px] font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 rounded">≥{kktpThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min={65} max={85}
                      value={kktpThreshold}
                      onChange={e => setKktpThreshold(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 animate-none"
                    />
                    <p className="text-[9px] text-slate-500 leading-none">Standar penentu kelulusan mata pelajaran.</p>
                  </div>

                  {/* Slider 2: Formula Formative */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Porsi Bobot Formatif</span>
                      <span className="text-[10.5px] font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 rounded">{formativeWeight}%</span>
                    </div>
                    <input
                      type="range"
                      min={20} max={60} step={5}
                      value={formativeWeight}
                      onChange={e => setFormativeWeight(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 animate-none"
                    />
                    <p className="text-[9px] text-slate-400 leading-none">Sumatif otomatis dihitung sebesar {100 - formativeWeight}%.</p>
                  </div>

                  {/* Bulk Export Button CSV */}
                  <div className="pt-2 sm:pt-0">
                    <button
                      onClick={() => {
                        // Extract dynamically built ledger rows
                        const dataToCSV = sortedLedgerData;
                        let csvContent = "data:text/csv;charset=utf-8,";
                        csvContent += "Rank,Nama Santri,Fiqih,Bahasa Arab,Matematika,Tahfidz,Hadits,Rata-rata,Hadir,Sakit,Izin,Ghaib\n";

                        dataToCSV.forEach((row, idx) => {
                          const g = row.grades;
                          const att = row.attendance;
                          const line = `${idx + 1},"${row.student}",${g['Fiqih (Merdeka)'] || 80},${g['Bahasa Arab'] || 80},${g['Matematika'] || 80},${g['Tahfidz & Tahsin'] || 80},${g['Hadits Arba\'in'] || 80},${row.averageScore},${att.Hadir},${att.Sakit},${att.Izin},${att.Ghaib}`;
                          csvContent += line + "\n";
                        });

                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", `LEGER_UTAMA_${batchClass.replace(/\s+/g, '_')}_GANJIL.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        setAcademicToast({
                          message: `📊 Sukses mengekspor leger utama ${batchClass} ke format CSV!`,
                          type: 'success'
                        });
                      }}
                      className="w-full text-center text-xs py-2 bg-indigo-600 hover:bg-indigo-550 text-white border border-indigo-500/20 rounded-xl transition-all font-black flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-650/10 font-sans"
                    >
                      <Download className="w-3.5 h-3.5" /> Ekspor File Leger Master (.CSV)
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-[#0c0f1c] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300 font-sans w-full">
            <div className="p-5 border-b border-slate-200 dark:border-white/[0.04] bg-slate-50 dark:bg-slate-950/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">Dokumen Leger Nilai Ujian (Semester Report Card Master)</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Spreadsheet tabular komparatif seluruh mata pelajaran, akumulasi nilai rerata, peringkat kelas, dan presensi santri.</p>
              </div>

              <button
                onClick={handlePrintLeger}
                className="text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 px-3.5 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all font-bold flex items-center gap-1.5 shrink-0"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak Leger Kelas
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                    <th className="p-4 w-12 text-center">Rank</th>
                    <th className="p-4 w-52 font-sans">Nama Lengkap Santri</th>
                    {LEGER_SUBJECTS.map(sub => (
                      <th key={sub} className="p-4 text-center border-l border-slate-200 dark:border-slate-800/40">{sub}</th>
                    ))}
                    <th className="p-4 text-center border-l-2 border-indigo-100 dark:border-indigo-950/60 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300">Rerata Akhir</th>
                    <th className="p-4 text-center border-l border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950/40">Kehadiran (H | S | I | A)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                  {sortedLedgerData.map((studentRow, idx) => {
                    return (
                      <tr key={studentRow.student} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                        {/* Rank */}
                        <td className="p-4 text-center font-mono">
                          <span className={cn(
                            "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold font-mono",
                            idx === 0
                              ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25"
                              : idx === 1
                                ? "bg-slate-100 dark:bg-slate-400/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-400/25"
                                : idx === 2
                                  ? "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/25"
                                  : "text-slate-500"
                          )}>
                            {idx + 1}
                          </span>
                        </td>

                        {/* Name */}
                        <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                          <div>{studentRow.student}</div>
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-normal font-sans">Santri Reguler</span>
                        </td>

                        {/* Subject columns */}
                        {LEGER_SUBJECTS.map(sub => {
                          const avg = studentRow.grades[sub];
                          return (
                            <td key={sub} className="p-4 text-center font-mono border-l border-slate-200 dark:border-slate-800/30">
                              <span className={cn(
                                "font-bold",
                                avg >= kktpThreshold
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : avg >= 60
                                    ? "text-amber-600 dark:text-amber-500"
                                    : "text-red-600 dark:text-red-400"
                              )}>
                                {avg}
                              </span>
                            </td>
                          );
                        })}

                        {/* Cumulative Average */}
                        <td className="p-4 text-center font-mono border-l-2 border-indigo-100 dark:border-indigo-950/60 bg-indigo-50 dark:bg-indigo-950/10">
                          <span className={cn(
                            "text-xs font-black px-2 py-0.5 rounded border font-mono",
                            studentRow.averageScore >= kktpThreshold
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/15"
                              : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                          )}>
                            {studentRow.averageScore}
                          </span>
                        </td>

                        {/* Attendance blocks (H | S | I | A) */}
                        <td className="p-4 text-center border-l border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950/20 font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{studentRow.attendance.Hadir}</span>
                          <span className="text-slate-300 dark:text-slate-600 px-1">|</span>
                          <span className="text-amber-500 font-bold">{studentRow.attendance.Sakit}</span>
                          <span className="text-slate-300 dark:text-slate-600 px-1">|</span>
                          <span className="text-sky-500 dark:text-sky-400 font-bold">{studentRow.attendance.Izin}</span>
                          <span className="text-slate-300 dark:text-slate-600 px-1">|</span>
                          <span className="text-red-600 dark:text-red-500 font-bold">{studentRow.attendance.Ghaib}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Leger footer information status indicators */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-850 flex flex-wrap gap-4 text-[10px] text-slate-500 dark:text-slate-400 justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-emerald-100 dark:bg-emerald-500/25 border border-emerald-500 rounded-full inline-block"></span>
                  Lulus KKTP (≥{kktpThreshold})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-amber-100 dark:bg-amber-500/25 border border-amber-500 rounded-full inline-block"></span>
                  Limit/Rendah (60-{kktpThreshold - 1})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-red-100 dark:bg-red-500/25 border border-red-500 rounded-full inline-block"></span>
                  Butuh Remedial (&lt;60)
                </span>
              </div>
              <p className="italic text-slate-400 dark:text-slate-500">Keterangan kehadiran: Hadir (H) | Sakit (S) | Izin (I) | Absen (A)</p>
            </div>
          </div>
        </div>
      )}

        {/* 2. SUB-TAB: WALI KELAS COMMENT GENERATOR (TEMPLATE ENGINE) */}
        {activeSubTab === 'comments' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
            {/* Left: Student selection listing */}
            <div className="bg-white dark:bg-[#0b0e17] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Pilih Anggota Kelas
                </h4>
                <p className="text-[10px] text-slate-500 mt-1">Daftar santri aktif di kelas {activeLegerClass}.</p>
              </div>

              <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                {legerStudents.map(studentName => {
                  const alreadyHasCustom = waliKelasComments[studentName];
                  const isCurSelected = selectedCommentStudent === studentName;
                  return (
                    <button
                      key={studentName}
                      type="button"
                      onClick={() => setSelectedCommentStudent(studentName)}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all border block focus:outline-none cursor-pointer",
                        isCurSelected
                          ? "bg-indigo-50 dark:bg-indigo-600/10 border-indigo-200 dark:border-indigo-505 text-indigo-700 dark:text-white"
                          : "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{studentName}</span>
                        {alreadyHasCustom && (
                          <span className="text-[9px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.2 rounded font-sans border border-emerald-200 dark:border-emerald-500/15">
                            Isi ✔
                          </span>
                        )}
                      </div>
                      <p className="text-[9.5px] text-slate-500 truncate mt-1">
                        {alreadyHasCustom ? alreadyHasCustom : "Belum ada narasi wali kelas"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Middle & Right: Comment narrative & pre-written templates */}
            <div className="lg:col-span-2 space-y-6">
              {/* Form narrative draft */}
              <form onSubmit={handleSaveCommentDraft} className="bg-white dark:bg-[#0c0f1c] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800/60 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">
                      Formulir Narasi Catatan Wali Kelas ({activeLegerClass})
                    </h3>
                    <p className="text-xs text-indigo-600 dark:text-indigo-300 font-bold mt-1">
                      Deskripsi karakter untuk ananda: {selectedCommentStudent}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 italic font-mono">Penyimpanan dinamis</span>
                </div>

                {/* Interactive template generator list */}
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                    Asisten Penulisan - Klik Template Pendukung:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {COMMENT_TEMPLATES.map(tmp => (
                      <button
                        key={tmp.id}
                        type="button"
                        onClick={() => {
                          if (raporLocked) {
                            setAcademicToast({ message: '🔒 Sistem Terkunci. E-Rapor Semester ini telah ditutup oleh Administrator.', type: 'warning' });
                            return;
                          }
                          handleApplyTemplate(tmp.text);
                        }}
                        disabled={raporLocked}
                        className={cn(
                          "p-2.5 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-505 rounded-xl text-left transition-all group flex flex-col justify-between h-auto cursor-pointer",
                          raporLocked && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center gap-1.5 transition-colors">
                          {tmp.category}
                        </span>
                        <p className="text-[9.5px] text-slate-500 truncate mt-1 leading-relaxed">
                          {tmp.text.replace(/\[Name\]/g, selectedCommentStudent)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Real text area editor */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                    Editor Catatan Akhir Wali Kelas (Dapat Diubah Manual)
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={commentDraftText}
                    onChange={e => setCommentDraftText(e.target.value)}
                    disabled={raporLocked}
                    placeholder={raporLocked ? "🔒 Pengisian catatan telah dikunci oleh administrator." : "Tulis sendiri atau pilih template di atas untuk membuat modifikasi instan nilai moral santri..."}
                    className={cn(
                      "w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl p-3 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed focus:outline-none shadow-sm",
                      raporLocked && "opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-950/40"
                    )}
                  />
                  <span className="text-[10px] text-slate-500 block">
                    *Catatan ini akan otomatis terintegrasi langsung pada **Halaman Pratinjau Rapor Digital** ananda.
                  </span>
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-850">
                  <button
                    type="submit"
                    disabled={raporLocked}
                    className={cn(
                      "px-4.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer",
                      raporLocked && "opacity-50 cursor-not-allowed bg-slate-400 dark:bg-slate-800"
                    )}
                  >
                    {raporLocked ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Catatan Terkunci Admin
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" /> Simpan Catatan Ke E-Rapor
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Tips for Wali Kelas */}
              <div className="bg-amber-50 dark:bg-slate-900/30 border border-amber-100 dark:border-slate-800/40 p-4 rounded-xl flex gap-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed shadow-sm">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">💡 Arahan Penulisan Karakter Kurikulum Merdeka</span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-450 leading-relaxed">
                    Ustadz wali kelas diharapkan mendeskripsikan secara deskriptif mengenai kemajuan aspek religiusitas (akhlaqul karimah), kedisiplinan asrama serta pencapaian mapel khas kepesantrenan. Hindari penulisan catatan karakter yang terlalu singkat agar wali santri mendapat kejelasan utuh bimbingan di rumah.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. SUB-TAB: DIGITAL REPORT CARD ENGINE (Sleek printable view) */}
        {activeSubTab === 'rapor' && (
          <div className="space-y-6 font-sans">
            {/* If Admin/Ustadz we allow shifting report preview students */}
            {!isWalisantriOrSantri && (
              <div className="bg-white dark:bg-[#0b0e17] border border-slate-200 dark:border-slate-850 p-4.5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-1">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Penjelajah & Cetak Rapor Digital Santri
                  </h4>
                  <p className="text-[11px] text-slate-500">Pilih santri manapun sekelas untuk menampilkan visual dokumen aslinya.</p>
                </div>

                <div className="flex gap-2">
                  <select
                    value={previewStudentName}
                    onChange={e => setPreviewStudentName(e.target.value)}
                    className="bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
                  >
                    {legerStudents.map(studentName => (
                      <option key={studentName} value={studentName} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-250">
                        Evaluasi Rapor: {studentName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* PREMIUM SLEEK REPORT CARD CONTAINER (FORMAL PREVIEW STYLE) */}
            <div className="bg-white dark:bg-gradient-to-b dark:from-[#0a0f1d] dark:to-[#040710] border border-slate-200 dark:border-slate-800/85 rounded-3xl overflow-hidden shadow-md relative animate-in zoom-in-95 font-sans">

              {/* Formal Header Badge */}
              <div className="bg-slate-50 dark:bg-[#0e1628] border-b border-slate-200 dark:border-white/[0.04] p-6 text-center space-y-2 relative">
                <div className="absolute top-4 right-4 text-[9px] uppercase font-mono font-bold tracking-widest bg-emerald-50 dark:bg-emerald-550/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 px-2.5 py-0.5 rounded-md">
                  Status: FINAL SEMESTER (Diterbitkan)
                </div>

                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-full flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 text-lg font-black tracking-widest">
                  PES
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-wide uppercase">E-RAPOR DIGITAL HASIL EVALUASI SANTRI</h2>
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-305 font-bold uppercase tracking-widest">PONDOK PESANTREN AL-IBTIDAIYAH MODEREN</p>
                  <p className="text-[9.5px] text-slate-500 tracking-wide">Jalan Pesantren Raya No. 45, Kompleks Islamic Center, Jakarta Raya</p>
                </div>
              </div>

              {/* Rapor Details Metadata Grid */}
              <div className="p-6 border-b border-slate-200 dark:border-white/[0.03] bg-white dark:bg-slate-950/20 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans text-slate-700 dark:text-slate-300">
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold block">NAMA SANTRI</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{currentRaporStudent}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-550 text-[10px] uppercase font-bold block">NOMOR INDUK SANTRI (NIS)</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px]">8817.2026.091</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold block">KELAS & ANGKATAN</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-205">Kelas {currentRaporClass} (Muthawassith)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-555 text-[10px] uppercase font-bold block">PERINGKAT DI KELAS</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-305">Peringkat Ke-{currentRaporRank} dari {legerStudents.length} Santri</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500 dark:text-slate-550 text-[10px] uppercase font-bold block">TAHUN AJARAN</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-205">{academicYear} {semester} (Merdeka)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-555 text-[10px] uppercase font-bold block">RATA-RATA KAPASITAS</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm font-mono">{currentRaporData.averageScore} / 100</span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">

                {/* 3.1. Detailed Academic Grades table */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    I. TRANSKRIP NILAI MATA PENILAIAN KURIKULUM
                  </span>

                  <div className="border border-slate-200 dark:border-slate-850 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950/30">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950/60 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                          <th className="p-3 w-10 text-center">No</th>
                          <th className="p-3 font-sans">Mata Pelajaran (Kurikulum Merdeka & Pondok)</th>
                          <th className="p-3 text-center">Target KKTP</th>
                          <th className="p-3 text-center">Rerata Formatif</th>
                          <th className="p-3 text-center">Rerata Sumatif</th>
                          <th className="p-3 text-center bg-indigo-50 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400">Nilai Rapor Akhir</th>
                          <th className="p-3 text-right">Predikat/Kelayakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-850/60">
                        {LEGER_SUBJECTS.map((sub, idx) => {
                          const score = currentRaporData.grades[sub] || 80;

                          // Formative is slightly higher than score, sumative slightly lower for high-fidelity realistic math feel!
                          const formatVal = Math.min(100, Math.round(score + 2));
                          const sumatVal = Math.max(20, Math.round(score - 3));

                          let predText = "SANGAT BAIK (A)";
                          if (score < kktpThreshold) predText = "PERLU REMEDIAL (D)";
                          else if (score < 75) predText = "CUKUP (C)";
                          else if (score < 85) predText = "BAIK (B)";

                          return (
                            <tr key={idx} className="hover:bg-white dark:hover:bg-white/[0.01] transition-colors">
                              <td className="p-3 text-center text-slate-400 dark:text-slate-500 font-mono">{idx + 1}</td>
                              <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{sub}</td>
                              <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400">{kktpThreshold}</td>
                              <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400">{formatVal}</td>
                              <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400">{sumatVal}</td>

                              {/* Weighted */}
                              <td className="p-3 text-center font-mono bg-indigo-50 dark:bg-indigo-950/10 font-bold">
                                <span className={cn(
                                  "text-sm font-bold font-mono px-2 py-0.5 rounded",
                                  score >= kktpThreshold ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                                )}>
                                  {score}
                                </span>
                              </td>

                              <td className="p-3 text-right">
                                <span className={cn(
                                  "text-[10px] font-extrabold tracking-wide font-sans",
                                  score >= kktpThreshold ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                                )}>
                                  {predText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Grid for Attendance Summary & Moral progression comment */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* Attendance block card */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-405 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                      II. REKAPITULASI PRESENSI HALAQAH
                    </span>

                    <div className="bg-slate-50 dark:bg-slate-950/45 border border-slate-200 dark:border-slate-850 p-4.5 rounded-2xl space-y-3 font-sans">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Hadir Pesantren (Hari):</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{currentRaporData.attendance.Hadir} Sesi</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Sakit dengan Surat:</span>
                        <span className="font-bold text-amber-600 dark:text-amber-550 font-mono">{currentRaporData.attendance.Sakit} Sesi</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Izin Pulang/Dinas:</span>
                        <span className="font-bold text-sky-600 dark:text-sky-400 font-mono">{currentRaporData.attendance.Izin} Sesi</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-slate-200 dark:border-slate-850 pt-2">
                        <span className="text-slate-600 dark:text-slate-400 font-semibold">Absen Tanpa Berita:</span>
                        <span className="font-bold text-red-600 dark:text-red-500 font-mono">{currentRaporData.attendance.Ghaib} Sesi</span>
                      </div>
                    </div>
                  </div>

                  {/* Character progress notes narrative */}
                  <div className="md:col-span-2 space-y-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-405 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      III. CATATAN PERKEMBANGAN MORAL & KARAKTER (WALI KELAS)
                    </span>

                    <div className="bg-slate-50 dark:bg-slate-950/45 border border-slate-200 dark:border-slate-850 p-4.5 rounded-2xl h-[120px] overflow-y-auto leading-relaxed text-xs text-slate-700 dark:text-slate-300 font-sans relative">
                      <p className="italic">
                        "{currentRaporComment}"
                      </p>

                      <div className="absolute right-3 bottom-2 text-[9px] text-slate-500 dark:text-slate-500 font-sans font-bold">
                        Wali Kelas: {role === 'Ustadz' ? activeUstadz : 'Ust. Hidayat Lc.'}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Printable Signature Stamp Block */}
                <div className="border-t border-slate-200 dark:border-slate-850 pt-5 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-sans">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Mengesahkan,</p>
                    <p className="font-bold text-slate-700 dark:text-slate-300">Ust. Hidayat Lc.</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">WALI KELAS {currentRaporClass}</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#111827]/40 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl text-center flex flex-col items-center gap-1 text-[9px] shrink-0 font-sans shadow-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">AL-IBTIDAIYAH VERIFIED</span>
                    <span className="text-slate-500 dark:text-slate-500 leading-none">ID: A-RAPOR-{currentRaporStudent.toUpperCase().replace(/\s+/g, '')}-2026</span>
                  </div>

                  <div className="space-y-1 text-right">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Mengetahui,</p>
                    <p className="font-bold text-slate-700 dark:text-slate-300">KH. Muhammad Syakir M.A.</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-mono">PIMPINAN PESANTREN</p>
                  </div>
                </div>

              </div>

              {/* Rapor actions buttons footer */}
              <div className="bg-slate-50 dark:bg-[#0b0f19] border-t border-slate-200 dark:border-slate-800 p-5 flex flex-wrap gap-4 items-center justify-between">
                <div className="text-xs text-slate-500 justify-start">
                  E-Rapor ini sah & diakui resmi secara administratif oleh biro akademik Kepesantrenan.
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleTriggerOfficialPDF(currentRaporStudent)}
                    disabled={isDownloading}
                    className="text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-705 font-bold text-slate-700 dark:text-slate-350 dark:hover:text-white px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 border border-slate-200 dark:border-slate-700/60 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Print Lembar Rapor
                  </button>

                  <button
                    onClick={() => handleTriggerOfficialPDF(currentRaporStudent)}
                    disabled={isDownloading}
                    className="bg-indigo-600 hover:bg-indigo-505 text-white font-extrabold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDownloading ? (
                      <span className="flex items-center gap-1 font-sans">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {downloadProgress}% Generating...
                      </span>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" /> Unduh Dokumen PDF Resmi
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    );
  };

  const getLiveConflictsAndRecommendations = () => {
    if (modalType !== 'schedule') return { conflicts: [], recommendations: [] };
    const liveClashes: string[] = [];
    schedules.forEach(s => {
      if (editingId && s.id === editingId) return;
      if (s.day === formData.day && s.time === formData.time) {
        if (s.teacher === formData.teacher) {
          liveClashes.push(`Ustadz ${s.teacher} mengajar ${s.subject} (${s.class})`);
        }
        if (s.room && formData.room && s.room.toLowerCase() === formData.room.toLowerCase()) {
          liveClashes.push(`Ruang ${s.room} dipakai ${s.subject} (${s.class})`);
        }
        if (s.class === formData.class) {
          liveClashes.push(`Kelas ${s.class} belajar ${s.subject} (Ust. ${s.teacher})`);
        }
      }
    });
    const uniqueClashes = Array.from(new Set(liveClashes));

    const recommendations: { day: string, time: string }[] = [];
    if (uniqueClashes.length > 0) {
      const allDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const allTimes = [
        "07:30 - 09:00",
        "09:15 - 10:45",
        "13:00 - 14:30",
        "15:30 - 17:00",
        "19:30 - 21:00"
      ];
      for (const d of allDays) {
        for (const t of allTimes) {
          const isBusy = schedules.some(s => {
            if (editingId && s.id === editingId) return false;
            return s.day === d && s.time === t && (
              s.teacher === formData.teacher ||
              s.class === formData.class ||
              (s.room && formData.room && s.room.toLowerCase() === formData.room.toLowerCase())
            );
          });
          if (!isBusy) {
            recommendations.push({ day: d, time: t });
            if (recommendations.length >= 3) break;
          }
        }
        if (recommendations.length >= 3) break;
      }
    }
    return { conflicts: uniqueClashes, recommendations };
  };

  const { conflicts: liveConflicts, recommendations } = getLiveConflictsAndRecommendations();

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12 relative">

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-indigo-500 pb-1 inline-block">
              Academic & Formal System
            </h1>
            <CentralSyncBadge moduleName="Akademik" />
          </div>
          <p className="text-slate-500 text-sm mt-2">
            Pengelolaan jadwal KBM, jurnal mengajar, penilaian, dan e-Rapor santri &mdash; Terintegrasi penuh dengan Master Data
          </p>
        </div>

        {/* Trigger Generic Form additions based on selected view */}
        <div className="flex items-center gap-3">
          {activeTab === 'schedule' && ['SuperAdmin', 'Admin'].includes(role) && (
            <button
              id="add-sched-header-btn"
              onClick={() => handleOpenAddModal('schedule')}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Jadwal Baru</span>
            </button>
          )}
          {activeTab === 'kbm' && role === 'Ustadz' && (
            <button
              id="add-kbm-header-btn"
              onClick={() => handleOpenAddModal('kbm')}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Isi Jurnal KBM</span>
            </button>
          )}
          {activeTab === 'assessment' && role === 'Ustadz' && (
            <button
              id="add-assess-header-btn"
              onClick={() => handleOpenAddModal('assessment')}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Beri Nilai Baru</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-max mb-6 border border-slate-200 dark:border-white/5">
        {[
          { id: 'schedule', label: 'Jadwal & Kalender', icon: <CalendarDays className="w-4 h-4" /> },
          { id: 'kbm', label: 'KBM & Jurnal', icon: <BookOpen className="w-4 h-4" /> },
          { id: 'assessment', label: 'Penilaian', icon: <Award className="w-4 h-4" /> },
          { id: 'reports', label: 'E-Rapor', icon: <FileText className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            aria-pressed={activeTab === tab.id}
            id={`tab-btn-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`erp-tab-control flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap relative text-sm ${
              activeTab === tab.id
                ? "bg-white dark:bg-[#1a1a1a] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/5"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden min-h-[600px] relative">
        {/* CONTROLS AREA WITH LOCAL SEARCH (PRE-TAB SPECIFIC) */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="search-input"
                type="text"
                placeholder="Search subjects, teachers, class or room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-colors"
              />
            </div>
            {searchQuery && (
              <button
                id="clear-search-btn"
                onClick={() => setSearchQuery('')}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* DYNAMIC CONTENT CONTAINER */}
        <div className="p-6">
          {activeTab === 'schedule' && renderScheduleTab()}
          {activeTab === 'kbm' && renderKBM()}
          {activeTab === 'assessment' && renderAssessment()}
          {activeTab === 'reports' && renderReports()}
        </div>
      </div>

      {/* CORE MODAL DIALOGS AND POPUPS FOR ACADEMIC RECORD PERSISTENCE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-slate-200">

            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-black/40 shrink-0">
              <h3 className="font-bold text-slate-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                {editingId
                  ? 'Sunting Catatan Akademik'
                  : modalType === 'schedule'
                    ? 'Tambah Jadwal Mengajar (Dual Curriculum)'
                    : modalType === 'kbm'
                      ? 'Input Jurnal Harian Pengajaran'
                      : 'Beri Penilaian Santri'}
              </h3>
              <button
                id="close-modal-x"
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-200 rounded-md hover:bg-white/5 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Modal Body Scroll Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto font-sans">

              {/* SCHEMA 1: NEW/EDIT SCHEDULE CARD */}
              {modalType === 'schedule' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Klasifikasi Kurikulum</label>
                      <select
                        id="form-curriculum-select"
                        value={formData.curriculum || 'Formal'}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({
                            ...formData,
                            curriculum: val,
                            // Autofill placeholder subjects for pesantren vs kemenag
                            subject: subjectsList[0] || 'Fiqih (Merdeka)'
                          });
                        }}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        {curriculumList.map(curr => (
                          <option key={curr} value={curr}>{curr}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Nama Mata Pelajaran</label>
                      <select
                        id="form-subject-input"
                        required
                        value={formData.subject || ''}
                        onChange={e => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-100 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="" disabled>Pilih Mata Pelajaran...</option>
                        {subjectsList.map(subj => (
                          <option key={subj} value={subj}>{subj}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Hari KBM</label>
                      <select
                        id="form-day-select"
                        value={formData.day || 'Senin'}
                        onChange={e => setFormData({ ...formData, day: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-250 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="Senin">Senin</option>
                        <option value="Selasa">Selasa</option>
                        <option value="Rabu">Rabu</option>
                        <option value="Kamis">Kamis</option>
                        <option value="Jumat">Jumat</option>
                        <option value="Sabtu">Sabtu</option>
                        <option value="Ahad">Ahad</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Blok Waktu Pengajaran</label>
                      <select
                        id="form-time-select"
                        value={formData.time || '07:30 - 09:00'}
                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-250 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="07:30 - 09:00">07:30 - 09:00 (Pagi Block I)</option>
                        <option value="09:15 - 10:45">09:15 - 10:45 (Pagi Block II)</option>
                        <option value="13:00 - 14:30">13:00 - 14:30 (Sore Block I)</option>
                        <option value="15:30 - 17:00">15:30 - 17:00 (Sore Block II)</option>
                        <option value="19:30 - 21:00">19:30 - 21:00 (Malam Intensive)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Pendidik / Ustadz Pengajar</label>
                      <select
                        id="form-teacher-select"
                        value={formData.teacher || (availableTeachers[0] || '')}
                        onChange={e => setFormData({ ...formData, teacher: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        {availableTeachers.map(tch => (
                          <option key={tch} value={tch}>{tch}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Group Kelas</label>
                      <select
                        id="form-class-select"
                        value={formData.class || (availableClasses[0] || 'VII - A')}
                        onChange={e => setFormData({ ...formData, class: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        {availableClasses.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                        <option value="Siswa Semua">Siswa Semua</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Ruang Fisik KBM</label>
                    <input
                      id="form-room-input"
                      type="text"
                      placeholder="e.g. Ruang 103, Masjid Jami, Lab MIPA"
                      required
                      value={formData.room || ''}
                      onChange={e => setFormData({ ...formData, room: e.target.value })}
                      className="w-full bg-black/40 border border-slate-805 text-slate-100 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                    />
                  </div>

                  {liveConflicts.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-red-500 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4" />
                        Mitigasi Bentrok Jadwal
                      </div>
                      <ul className="list-disc list-inside text-xs text-red-400 space-y-1">
                        {liveConflicts.map((clash, idx) => (
                          <li key={idx}>{clash}</li>
                        ))}
                      </ul>

                      {recommendations.length > 0 && (
                        <div className="pt-2 border-t border-red-500/20">
                          <div className="text-[10px] text-slate-300 mb-2 font-medium">REKOMENDASI WAKTU AVAILABLE:</div>
                          <div className="flex flex-wrap gap-2">
                            {recommendations.map((rec, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setFormData({ ...formData, day: rec.day, time: rec.time })}
                                className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 px-2.5 py-1.5 rounded flex items-center gap-1.5 text-xs transition-colors"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                {rec.day}, {rec.time}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* SCHEMA 2: PREFABRICATED TAB JOURNAL COMPOSER */}
              {modalType === 'kbm' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Tanggal Pelaksanaan</label>
                      <input
                        id="journal-date"
                        type="date"
                        required
                        value={formData.date || ''}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Kelompok Kelas</label>
                      <select
                        id="journal-class"
                        value={formData.class || (availableClasses[0] || 'VII - A')}
                        onChange={e => {
                          const cls = e.target.value;
                          const students = getStudentsForClass(cls);
                          const initialAttendance: Record<string, string> = {};
                          students.forEach(st => {
                            initialAttendance[st] = 'Hadir';
                          });
                          setFormData({
                            ...formData,
                            class: cls,
                            studentAttendance: initialAttendance,
                            attendance: `${students.length}/${students.length}`
                          });
                        }}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        {availableClasses.map(cls => (
                          <option key={cls} value={cls}>Kelas {cls}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Mata Pelajaran Santri</label>
                      <select
                        id="journal-subject"
                        required
                        value={formData.subject || ''}
                        onChange={e => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="" disabled>Pilih Mata Pelajaran...</option>
                        {subjectsList.map(subj => (
                          <option key={subj} value={subj}>{subj}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Ustadz / Guru Pengajar</label>
                      <select
                        id="journal-teacher"
                        value={formData.teacher || ''}
                        onChange={e => setFormData({ ...formData, teacher: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="Ust. Hidayat Lc.">Ust. Hidayat Lc.</option>
                        <option value="Ust. Zaki M.A.">Ust. Zaki M.A.</option>
                        <option value="Ust. Fulan Al-Hafidz">Ust. Fulan Al-Hafidz</option>
                        <option value="Bpk. Ahmad S.Pd">Bpk. Ahmad S.Pd</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Tujuan / Capaian Pembelajaran (Kurikulum Merdeka PT)</label>
                    <input
                      id="journal-competency"
                      type="text" required
                      placeholder="e.g. CP 1.2: Membaca tafsir surah Al-Baqarah ayat 1-5"
                      value={formData.competency || ''}
                      onChange={e => setFormData({ ...formData, competency: e.target.value })}
                      className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Materi Pembahasan Spesifik (Bab/Kitab)</label>
                    <textarea
                      id="journal-topic"
                      rows={2}
                      required
                      placeholder="Uraikan bab kitab yang dikaji atau latihan soal yang dikerjakan hari ini..."
                      value={formData.topic || ''}
                      onChange={e => setFormData({ ...formData, topic: e.target.value })}
                      className="w-full bg-black/40 border border-slate-805 text-slate-100 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                    />
                  </div>

                  {/* Immediate Student Attendance Sheet Checklist */}
                  <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Presensi Sesi Kelas Santri</span>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-300 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {Object.values(formData.studentAttendance || {}).filter(st => st === 'Hadir').length}/{Object.keys(formData.studentAttendance || {}).length} Hadir
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated: Record<string, string> = {};
                          getStudentsForClass(formData.class).forEach(st => updated[st] = 'Hadir');
                          setFormData({ ...formData, studentAttendance: updated, attendance: `${Object.keys(updated).length}/${Object.keys(updated).length}` });
                        }}
                        className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded font-bold"
                      >Tandai Semua Hadir</button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated: Record<string, string> = {};
                          getStudentsForClass(formData.class).forEach(st => updated[st] = 'Ghaib');
                          setFormData({ ...formData, studentAttendance: updated, attendance: `0/${Object.keys(updated).length}` });
                        }}
                        className="text-[10px] bg-red-500/20 text-red-500 border border-red-500/30 px-2 py-1 rounded font-bold"
                      >Batalkan Semua</button>
                    </div>

                    <div className="overflow-y-auto max-h-48 pr-1">
                      <table className="w-full text-[11px] text-left">
                        <thead>
                          <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/40">
                            <th className="pb-1.5 font-sans">Nama Santri</th>
                            <th className="pb-1.5 text-center font-sans w-14">Hadir</th>
                            <th className="pb-1.5 text-center font-sans w-14">Sakit</th>
                            <th className="pb-1.5 text-center font-sans w-14">Izin</th>
                            <th className="pb-1.5 text-center font-sans w-14">Ghaib</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/20">
                          {getStudentsForClass(formData.class).map(student => {
                            const currentStatus = (formData.studentAttendance && formData.studentAttendance[student]) || 'Hadir';
                            return (
                              <tr key={student} className="hover:bg-white/[0.01]">
                                <td className="py-2 text-slate-200 font-medium font-sans">{student}</td>
                                <td className="py-2 text-center">
                                  <input
                                    type="radio"
                                    name={`form-attendance-${student}`}
                                    checked={currentStatus === 'Hadir'}
                                    onChange={() => {
                                      const updated = { ...(formData.studentAttendance || {}) };
                                      updated[student] = 'Hadir';
                                      const pCount = Object.values(updated).filter(st => st === 'Hadir').length;
                                      const tCount = Object.keys(updated).length;
                                      setFormData({
                                        ...formData,
                                        studentAttendance: updated,
                                        attendance: `${pCount}/${tCount}`
                                      });
                                    }}
                                    className="cursor-pointer accent-emerald-500 w-3.5 h-3.5"
                                  />
                                </td>
                                <td className="py-2 text-center">
                                  <input
                                    type="radio"
                                    name={`form-attendance-${student}`}
                                    checked={currentStatus === 'Sakit'}
                                    onChange={() => {
                                      const updated = { ...(formData.studentAttendance || {}) };
                                      updated[student] = 'Sakit';
                                      const pCount = Object.values(updated).filter(st => st === 'Hadir').length;
                                      const tCount = Object.keys(updated).length;
                                      setFormData({
                                        ...formData,
                                        studentAttendance: updated,
                                        attendance: `${pCount}/${tCount}`
                                      });
                                    }}
                                    className="cursor-pointer accent-amber-500 w-3.5 h-3.5"
                                  />
                                </td>
                                <td className="py-2 text-center">
                                  <input
                                    type="radio"
                                    name={`form-attendance-${student}`}
                                    checked={currentStatus === 'Izin'}
                                    onChange={() => {
                                      const updated = { ...(formData.studentAttendance || {}) };
                                      updated[student] = 'Izin';
                                      const pCount = Object.values(updated).filter(st => st === 'Hadir').length;
                                      const tCount = Object.keys(updated).length;
                                      setFormData({
                                        ...formData,
                                        studentAttendance: updated,
                                        attendance: `${pCount}/${tCount}`
                                      });
                                    }}
                                    className="cursor-pointer accent-blue-500 w-3.5 h-3.5"
                                  />
                                </td>
                                <td className="py-2 text-center">
                                  <input
                                    type="radio"
                                    name={`form-attendance-${student}`}
                                    checked={currentStatus === 'Ghaib'}
                                    onChange={() => {
                                      const updated = { ...(formData.studentAttendance || {}) };
                                      updated[student] = 'Ghaib';
                                      const pCount = Object.values(updated).filter(st => st === 'Hadir').length;
                                      const tCount = Object.keys(updated).length;
                                      setFormData({
                                        ...formData,
                                        studentAttendance: updated,
                                        attendance: `${pCount}/${tCount}`
                                      });
                                    }}
                                    className="cursor-pointer accent-red-500 w-3.5 h-3.5"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* SCHEMA 3: EVALUATION GRADES RECORD */}
              {modalType === 'assessment' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Pilih Kelompok Kelas</label>
                      <select
                        id="assessment-class"
                        value={formData.class || (availableClasses[0] || 'VII - A')}
                        onChange={e => setFormData({ ...formData, class: e.target.value, student: '' })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        {availableClasses.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Mata Pelajaran</label>
                      <select
                        id="assessment-subject"
                        required
                        value={formData.subject || ''}
                        onChange={e => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="" disabled>Pilih Mata Pelajaran...</option>
                        {subjectsList.map(subj => (
                          <option key={subj} value={subj}>{subj}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5 font-sans">Kriteria Tugas / Evaluasi</label>
                      <select
                        id="assessment-type"
                        value={formData.type || 'Tugas Harian'}
                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                      >
                        <option value="Tugas Harian">Tugas Harian</option>
                        <option value="Sabaq (Setoran Tahfidz)">Sabaq (Setoran Tahfidz)</option>
                        <option value="Ujian Akhir Semester (UAS)">Ujian Akhir Semester (UAS)</option>
                        <option value="PTS Genap">PTS Genap</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Nilai Maksimum (0 - 100)</label>
                      <input
                        id="assessment-score"
                        type="number" min={0} max={100} required
                        placeholder="e.g. 85"
                        value={formData.score === undefined ? '' : formData.score}
                        onChange={e => setFormData({ ...formData, score: e.target.value })}
                        className="w-full bg-black/40 border border-slate-805 text-slate-200 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Nama Lengkap Santri</label>
                    <select
                      id="assessment-student"
                      required
                      value={formData.student || ''}
                      onChange={e => setFormData({ ...formData, student: e.target.value })}
                      className="w-full bg-black/40 border border-slate-805 text-slate-100 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-xs"
                    >
                      <option value="" disabled>Pilih Santri...</option>
                      {(getStudentsForClass(formData.class || availableClasses[0] || 'VII - A') || []).map(studentName => (
                        <option key={studentName} value={studentName}>{studentName}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Modal Footer Buttons */}
              <div className="flex gap-3 justify-end items-center pt-4 border-t border-slate-850 shrink-0">
                <button
                  id="cancel-modal-btn"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-800 text-slate-350 hover:bg-slate-700 hover:text-white transition-colors rounded-lg px-4 py-2 text-xs font-bold font-sans"
                >
                  Batal
                </button>
                <button
                  id="submit-modal-btn"
                  type="submit"
                  disabled={modalType === 'schedule' && liveConflicts.length > 0}
                  className={cn(
                    "bg-indigo-600 hover:bg-indigo-500 text-white transition-colors rounded-lg px-4.5 py-2 text-xs font-bold font-sans shadow-md",
                    (modalType === 'schedule' && liveConflicts.length > 0) && "opacity-50 cursor-not-allowed bg-slate-400 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-700"
                  )}
                >
                  {editingId ? 'Simpan Perubahan' : 'Simpan Data'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Rekomendasi 5: Schedule Clash Dialog Modal */}
      {scheduleClashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 bg-red-950/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">Bentrok Jadwal Terdeteksi</h3>
                  <p className="text-xs text-red-300">Peringatan Validasi Waktu & Pengajar</p>
                </div>
              </div>
              <button
                onClick={() => setScheduleClashModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-300">
                Jadwal yang Anda ajukan bertabrakan dengan jadwal mengajar yang sudah ada di sistem:
              </p>
              <div className="space-y-2">
                {scheduleClashModal.clashes.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
                    <span className="text-red-400 font-bold">&bull;</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 italic pt-1">
                Silakan pilih jam, hari, pengajar, atau ruang lain agar tidak terjadi tabrakan kalender akademik.
              </p>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setScheduleClashModal(null)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
              >
                Kembali & Sesuaikan Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-App Academic Toast */}
      {academicToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border animate-in slide-in-from-bottom-5 duration-200 backdrop-blur-md bg-slate-900/95 text-slate-100 border-slate-700">
          {academicToast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {academicToast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
          {academicToast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
          {academicToast.type === 'info' && <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />}
          <span className="text-xs font-medium">{academicToast.message}</span>
          <button
            onClick={() => setAcademicToast(null)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Schedule Delete Confirmation Modal */}
      {scheduleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-100 text-sm">Hapus Jadwal KBM?</h4>
                <p className="text-xs text-slate-400 mt-0.5">Tindakan ini akan menghapus jadwal pengajaran ini.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setScheduleToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setSchedules(prev => prev.filter(s => s.id !== scheduleToDelete));
                  setAcademicToast({ message: "Jadwal berhasil dihapus.", type: 'info' });
                  setScheduleToDelete(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
