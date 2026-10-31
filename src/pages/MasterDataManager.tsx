Warning: truncated output (original token count: 49443)
Total output lines: 3687

import { publicRuntimeConfigValue } from "../runtimeConfig";
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Building,
  FileText,
  Search,
  Filter,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  X,
  User,
  Phone,
  MapPin,
  HeartPulse,
  GraduationCap,
  Download,
  Activity,
  Clock,
  Printer,
  QrCode,
  Eye,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  AlertTriangle,
  Link2,
  ExternalLink,
  ArrowRight,
  UserCheck,
  ShieldCheck,
  SlidersHorizontal,
  FileSpreadsheet,
  Upload,
  Layers,
  BookOpen,
  FilterX
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { cn, generateUniqueId } from "../lib/utils";
import { CVReport } from "../components/CVReport";
import { ExportModal } from "../components/ExportModal";
import { MasterDataTransferModal } from "../components/MasterDataTransferModal";
import { downloadTransferCsv } from "../utils/dataTransferCsv";
import { legacyArchiveImportEnabled, supabaseRuntimeEnabled } from "../runtimeBackend";
import {
  COUNTRIES,
  PROVINCES,
  DISTRICTS,
  KECAMATAN,
  DESA,
} from "../data/geography";
import { MOCK_SANTRI, MOCK_WALISANTRI } from "../data/mockRecords";
import {
  archiveSupabaseMasterDataStudent,
  deleteSupabaseMasterDataStructure,
  getSupabaseMasterDataStudentDetails,
  listSupabaseMasterDataStudentsPage,
  listSupabaseMasterDataStructures,
  migrateLegacySupabaseMasterDataStructures,
  migrateLegacySupabaseStudents,
  listSupabaseStudentRoomAssignmentHistory,
  type SupabaseStudentRoomAssignmentHistoryEntry,
  upsertSupabaseMasterDataStudent,
  upsertSupabaseMasterDataStructure,
} from "../services/masterDataApi";

const SUPABASE_MASTER_DATA_RUNTIME = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_MASTER_DATA_RUNTIME_ENABLED"));
// Import is a separate migration-only capability; Supabase-only runtime must never unlock it.
const SUPABASE_MASTER_DATA_IMPORT = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_MASTER_DATA_IMPORT_ENABLED") === "true";
const SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES = new Set(["Gedung", "Kamar", "Kelas"]);

const TABS = [
  { id: "entities", label: "Data Entitas", icon: Users },
  { id: "structure", label: "Struktur", icon: Building },
  { id: "academic", label: "Akademik", icon: GraduationCap },
  { id: "booking", label: "Pemesanan Fasilitas", icon: Clock },
  { id: "audit", label: "Jejak Audit", icon: Activity },
];

const SUB_TABS: Record<string, string[]> = {
  entities: ["Santri", "Wali Santri", "Guru", "Asatidz", "Pegawai", "Alumni"],
  structure: ["Yayasan", "Kampus", "Gedung", "Kamar", "Kelas", "Halaqah", "Peta Struktur"],
  academic: ["Mata Pelajaran", "Kurikulum"],
  booking: ["Pemesanan Ruangan"],
  audit: ["Semua Aktivitas"],
};

import { DEFAULT_STRUCTURE } from "../data/defaultStructure";
import type { ModuleId } from "../types";
export { DEFAULT_STRUCTURE };

const getMockData = (subTab: string) => {
  if (subTab === "Santri") return MOCK_SANTRI;
  if (subTab === "Wali Santri") return MOCK_WALISANTRI;
  if (DEFAULT_STRUCTURE[subTab]) return DEFAULT_STRUCTURE[subTab];

  const isStructure = SUB_TABS.structure.includes(subTab);

  return Array.from({ length: 5 }).map((_, i) => {
    const id = generateUniqueId(subTab, []);
    const base = {
      id,
      name: `Data ${subTab} ${i + 1}`,
      status: "Active",
    };

    if (isStructure) {
      return {
        ...base,
        type: subTab,
        capacity: Math.floor(Math.random() * 50) + 10 + " Orang",
        location: `Blok ${String.fromCharCode(65 + i)}`,
      };
    }

    return {
      ...base,
      gender: i % 2 === 0 ? "L" : "P",
      grade: "-",
      enrolled: "2024-01-01",
      phone: "+62 800-0000-0000",
      email: `contact${i}@example.com`,
      address: "System Generated Data",
      parentName: "-",
      parentPhone: "-",
      medical: "-",
      bloodType: "-",
    };
  });
};

interface AuditLog {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "IMPORT";
  entity: string;
  recordId: string;
  recordName: string;
  timestamp: string;
  user: string;
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "active":
      return "bg-emerald-900/40 text-emerald-400 border-emerald-500/30";
    case "inactive":
      return "bg-rose-900/40 text-rose-400 border-rose-500/30";
    case "alumni":
      return "bg-indigo-900/40 text-indigo-400 border-indigo-500/30";
    default:
      return "bg-slate-900/40 text-slate-500 dark:text-slate-400 border-slate-500/30";
  }
};

const getStatusLabel = (status: unknown) => {
  const labels: Record<string, string> = {
    active: "Aktif",
    inactive: "Nonaktif",
    alumni: "Alumni",
    suspended: "Ditangguhkan",
    pending: "Menunggu",
    graduated: "Lulus",
  };
  const value = String(status || "").trim();
  return labels[value.toLowerCase()] || value || "—";
};

import { EntityRegistrationForm } from "../components/EntityRegistrationForm";
import { StructureRegistrationForm } from "../components/StructureRegistrationForm";
import { 
  validateMasterData, 
  checkIdentityConflicts, 
  IdentityConflict, 
  NIK_REGEX, 
  NISN_REGEX, 
  NUPTK_REGEX 
} from "../schema/masterDataSchema";
const LazyStructureHierarchyD3 = React.lazy(async () => ({ default: (await import("../components/StructureHierarchyD3")).StructureHierarchyD3 }));
const LazyFacilityBooking = React.lazy(async () => ({ default: (await import("../components/FacilityBooking")).FacilityBooking }));

function masterDataFieldLabel(key: string) {
  const labels: Record<string, string> = { id: "ID", name: "Nama", gender: "Jenis Kelamin", grade: "Jenjang", className: "Kelas", nis: "NIS", nisn: "NISN", nik: "NIK", phone: "Nomor Telepon", email: "Email", parentName: "Nama Wali", parentPhone: "Telepon Wali", whatsappPhone: "Nomor WhatsApp", address: "Alamat", dateOfBirth: "Tanggal Lahir", birthDate: "Tanggal Lahir", placeOfBirth: "Tempat Lahir", religion: "Agama", bloodType: "Golongan Darah", medical: "Riwayat Kesehatan", status: "Status", qrcode: "Kode QR", currentActivity: "Kegiatan Saat Ini", institution: "Instansi", employmentType: "Jenis Kepegawaian", gradeOrDepartment: "Jenjang/Unit", graduationYear: "Tahun Lulus", occupation: "Pekerjaan", income: "Penghasilan", relation: "Hubungan", nuptk: "NUPTK", npwp: "NPWP", createdAt: "Dibuat pada", updatedAt: "Diperbarui pada" };
  return labels[key] || key.replace(/([A-Z])/g, " $1").trim();
}

function masterAuditActionLabel(action: string) {
  const labels: Record<string, string> = { CREATE: "Ditambahkan", UPDATE: "Diperbarui", DELETE: "Dihapus", IMPORT: "Diimpor" };
  return labels[action] || action;
}

type MasterDataManagerProps = { onNavigate?: (module: ModuleId) => void };

const MASTER_DATA_DESTINATIONS: Array<{
  label: string;
  categories: string[];
  destination: string;
  module?: ModuleId;
}> = [
  { label: "Wali Santri", categories: ["Wali Santri"], destination: "Relasi Wali & Donatur", module: "crm" },
  { label: "Guru dan Asatidz", categories: ["Guru", "Asatidz"], destination: "Akademik Formal", module: "academic" },
  { label: "Pegawai", categories: ["Pegawai"], destination: "Sumber Daya Manusia", module: "hris" },
  { label: "Alumni", categories: ["Alumni"], destination: "Data Alumni", module: "alumni" },
  { label: "Mata Pelajaran dan Kurikulum", categories: ["Mata Pelajaran", "Kurikulum"], destination: "Akademik Formal", module: "academic" },
  { label: "Yayasan dan Kampus", categories: ["Yayasan", "Kampus"], destination: "Manajemen Multi-Unit", module: "enterprise" },
  { label: "Halaqah", categories: ["Halaqah"], destination: "Tahfidz", module: "tahfidz" },
  { label: "Jejak Audit", categories: ["Semua Aktivitas"], destination: "Belum tersedia di runtime Supabase" },
];

export function MasterDataManager({ onNavigate }: MasterDataManagerProps) {
  const { user } = useAuth();
  // Keep the established navigation visible during the backend cutover. Unsupported
  // categories render an explicit handoff/status view below, never legacy mock data.
  const visibleTabs = TABS;
  const [activeTab, setActiveTab] = useState<
    "entities" | "structure" | "academic" | "booking" | "audit"
  >("entities");
  const [activeSubTab, setActiveSubTab] = useState("Santri");
  const visibleSubTabs = activeTab === "booking" ? SUB_TABS.booking : SUB_TABS[activeTab];
  const isSupabaseTransferView = SUPABASE_MASTER_DATA_RUNTIME
    && (activeTab === "entities" && activeSubTab === "Santri"
      || activeTab === "structure" && SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES.has(activeSubTab));
  const isSupabaseStructureMap = SUPABASE_MASTER_DATA_RUNTIME && activeTab === "structure" && activeSubTab === "Peta Struktur";
  const isSupabaseHandoffView = SUPABASE_MASTER_DATA_RUNTIME
    && activeTab !== "booking"
    && !isSupabaseTransferView
    && !isSupabaseStructureMap;
  const activeHandoff = MASTER_DATA_DESTINATIONS.find((item) => item.categories.includes(activeSubTab));
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [roomHistory, setRoomHistory] = useState<SupabaseStudentRoomAssignmentHistoryEntry[]>([]);
  const [roomHistoryStudentId, setRoomHistoryStudentId] = useState("");
  const [roomHistoryLoading, setRoomHistoryLoading] = useState(false);
  const [roomHistoryError, setRoomHistoryError] = useState("");
  const [dataSources, setDataSources] = useState<Record<string, any[]>>(() => SUPABASE_MASTER_DATA_RUNTIME
    ? { Santri: [], "Wali Santri": [], Gedung: [], Kamar: [], Kelas: [] }
    : { Santri: MOCK_SANTRI, "Wali Santri": MOCK_WALISANTRI, ...DEFAULT_STRUCTURE });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>(
    {},
  );

  // Rekomendasi 4: Advanced Import, Multi-Format Export, & Bulk Operations State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [transferModal, setTransferModal] = useState<null | {
    mode: "export" | "import";
    kind: "students" | "structures";
    category?: "Gedung" | "Kamar" | "Kelas";
  }>(null);

  // Rekomendasi 4: Multi-Facet Advanced Filter States
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'L' | 'P'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [dormitoryFilter, setDormitoryFilter] = useState<string>('');
  const [completenessFilter, setCompletenessFilter] = useState<'ALL' | 'WITH_NIK' | 'WITH_WALI' | 'WITHOUT_WALI'>('ALL');

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCVModal, setShowCVModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [printFields, setPrintFields] = useState<Record<string, boolean>>({});
  const [auditActionFilter, setAuditActionFilter] = useState<string>("ALL");
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: "LOG-1",
      action: "CREATE",
      entity: "Santri",
      recordId: "SID-22041",
      recordName: "Abdullah Al-Fatih",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      user: "Admin",
    },
  ]);

  const addAuditLog = (
    action: AuditLog["action"],
    recordId: string,
    recordName: string,
    count?: number,
  ) => {
    const newLog: AuditLog = {
      id: generateUniqueId('Log', auditLogs),
      action,
      entity: activeSubTab,
      recordId: count ? `${count} records` : recordId,
      recordName: count ? "Bulk Import" : recordName,
      timestamp: new Date().toISOString(),
      user: "Admin",
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const [userRole, setUserRole] = useState<"Admin" | "Super Administrator">("Super Administrator");
  const [units] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('hq');

  const getHierarchicalUnits = React.useCallback(() => {
    const unitMap = new Map<string, any>();
    const roots: any[] = [];
    
    // Create deep copies to avoid mutating state directly
    const unitsCopy = units.map(u => ({ ...u, children: [] }));
    
    unitsCopy.forEach(u => {
      unitMap.set(u.id, u);
    });
    
    unitsCopy.forEach(u => {
      if (u.parentUnitId && unitMap.has(u.parentUnitId)) {
        unitMap.get(u.parentUnitId).children.push(u);
      } else {
        roots.push(u);
      }
    });
    
    const flatList: any[] = [];
    const flatten = (node: any, depth: number) => {
      flatList.push({ ...node, depth });
      if (node.children) {
        node.children.forEach((child: any) => flatten(child, depth + 1));
      }
    };
    
    roots.forEach(r => flatten(r, 0));
    return flatList;
  }, [units]);

  const [notification, setNotification] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [legacyMigrationPreviews, setLegacyMigrationPreviews] = useState<Record<string, any>>({});
  const [legacyMigrationBusy, setLegacyMigrationBusy] = useState<string | null>(null);
  const [legacyMigrationRefreshKey, setLegacyMigrationRefreshKey] = useState(0);
  const runLegacyMasterDataMigration = async (kind: "structures" | "students", apply: boolean) => {
    const preview = legacyMigrationPreviews[kind];
    if (apply) {
      if (!preview || preview.dryRun !== true || (preview.errors || []).length > 0) {
        showToast("Jalankan pratinjau yang valid dan selesaikan konflik sebelum menerapkan impor.", "error");
        return;
      }
      const label = kind === "structures" ? "struktur Gedung, Kamar, dan Kelas" : "data Santri dan relasi Wali";
      if (!window.confirm("Impor " + (preview.planned || 0) + " record " + label + " ke tenant aktif? Data yang ada tidak akan dihapus. Pastikan backup dan pratinjau sudah ditinjau.")) return;
    }

    setLegacyMigrationPreviews((current) => ({ ...current, [kind]: null }));
    const actionKey = kind + "-" + (apply ? "apply" : "preview");
    setLegacyMigrationBusy(actionKey);
    try {
      const result = kind === "structures"
        ? (apply
          ? await migrateLegacySupabaseMasterDataStructures(true)
          : await migrateLegacySupabaseMasterDataStructures(false))
        : (apply
          ? await migrateLegacySupabaseStudents(true)
          : await migrateLegacySupabaseStudents(false));
      if (apply) {
        setLegacyMigrationPreviews((current) => ({ ...current, [kind]: null }));
        setLegacyMigrationRefreshKey((value) => value + 1);
        showToast("Impor selesai: " + (result.imported || 0) + " ditambahkan, " + (result.skipped || 0) + " dilewati, " + (result.errors?.length || 0) + " konflik.", result.errors?.length ? "error" : "success");
      } else {
        setLegacyMigrationPreviews((current) => ({ ...current, [kind]: result }));
        showToast(result.errors?.length
          ? "Pratinjau selesai dengan " + result.errors.length + " konflik yang perlu diselesaikan."
          : "Pratinjau selesai: " + (result.planned || 0) + " record siap ditinjau.",
        result.errors?.length ? "error" : "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Impor arsip Master Data belum dapat diproses.", "error");
    } finally {
      setLegacyMigrationBusy(null);
    }
  };
  const [recordToDelete, setRecordToDelete] = useState<any | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleLoadRoomHistory = async (studentId: unknown) => {
    const id = typeof studentId === "string" ? studentId.trim() : "";
    if (!id) return;
    setRoomHistory([]);
    setRoomHistoryStudentId("");
    setRoomHistoryLoading(true);
    setRoomHistoryError("");
    try {
      const records = await listSupabaseStudentRoomAssignmentHistory(id);
      setRoomHistory(records);
      setRoomHistoryStudentId(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Riwayat penempatan kamar belum dapat dimuat.";
      setRoomHistoryError(message);
      setRoomHistoryStudentId(id);
    } finally {
      setRoomHistoryLoading(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [isHierarchyView, setIsHierarchyView] = useState(true);
  const normalizedStudentSearch = searchQuery.normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s._-]/gu, " ").trim().replace(/\s+/g, " ").slice(0, 80);
  const studentSearchTooShort = SUPABASE_MASTER_DATA_RUNTIME
    && activeTab === "entities" && activeSubTab === "Santri"
    && normalizedStudentSearch.length > 0 && Array.from(normalizedStudentSearch).length < 3;

  const [currentPage, setCurrentPage] = useState(1);
  const [serverStudentHasMore, setServerStudentHasMore] = useState(false);
  const serverStudentCursorHistory = useRef<Record<number, string | null>>({ 1: null });
  const recordsPerPage = 10;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  useEffect(() => {
    setCurrentPage(1);
    serverStudentCursorHistory.current = { 1: null };
    setSearchResults(null);
  }, [searchQuery, statusFilter, genderFilter, gradeFilter, dormitoryFilter, completenessFilter, user?.tenantId, user?.uid]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const handleDownloadTemplate = () => {
    if (SUPABASE_MASTER_DATA_RUNTIME && activeTab === "entities" && activeSubTab === "Santri") {
      downloadTransferCsv("templat-impor-santri.csv", [
        "id", "name", "nis", "gender", "grade", "nik", "nisn", "phone", "email",
        "parentName", "parentPhone", "address", "dormitory", "room", "status",
      ], []);
      showToast("Templat CSV kosong untuk Santri diunduh.", "success");
      return;
    }
    if (SUPABASE_MASTER_DATA_RUNTIME && activeTab === "structure" && SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES.has(activeSubTab)) {
      downloadTransferCsv("templat-impor-" + activeSubTab.toLocaleLowerCase("id-ID") + ".csv", [
        "id", "name", "category", "status", "parentId", "grade", "capacity", "genderRestriction", "location",
      ], []);
      showToast("Templat CSV kosong untuk " + activeSubTab + " diunduh.", "success");
      return;
    }
    let headers: string[] = [];
    let sampleRow: string[] = [];

    if (activeSubTab === "Santri") {
      headers = ["id", "name", "gender", "grade", "nik", "nisn", "phone", "email", "parentName", "parentPhone", "address"];
      sampleRow = ["SID-99001", "Contoh Santri", "L", "X-A", "3171010101010001", "0059998881", "081234567890", "santri@example.com", "Bpk. Fulan", "081298765432", "Jl. Pesantren No. 10"];
    } else if (activeSubTab === "Wali Santri") {
      headers = ["id", "name", "nik", "relation", "phone", "whatsappPhone", "occupation", "income", "address"];
      sampleRow = ["WAL-99001", "Bpk. Contoh Wali", "3171010101010002", "Ayah", "081298765432", "081298765432", "Wiraswasta", "Rp 5.000.000 - Rp 10.000.000", "Jl. Melati No. 5"];
    } else if (activeSubTab === "Guru" || activeSubTab === "Asatidz") {
      headers = ["id", "name", "gender", "nik", "nuptk", "phone", "email", "gradeOrDepartment", "employmentType"];
      sampleRow = ["TCH-99001", "Ustadz Ahmad Fauzi", "L", "3171010101010003", "1234567890123456", "081211112222", "ahmad.fauzi@pesantren.id", "Bahasa Arab", "Full-time"];
    } else if (activeSubTab === "Pegawai") {
      headers = ["id", "name", "gender", "nik", "phone", "email", "gradeOrDepartment", "employmentType", "npwp"];
      sampleRow = ["STF-99001", "Staf Administrasi", "P", "3171010101010004", "081233334444", "staf@pesantren.id", "Keuangan", "Full-time", "1234567890123456"];
    } else if (activeSubTab === "Alumni") {
      headers = ["id", "name", "gender", "graduationYear", "phone", "email", "currentActivity", "institution"];
      sampleRow = ["ALM-99001", "Alumni Berprestasi", "L", "2023", "081255556666", "alumni@example.com", "Kuliah", "Universitas Al-Azhar"];
    } else {
      headers = ["id", "name", "type", "capacity", "location", "status", "parentCode"];
      sampleRow = [`${activeSubTab.substring(0, 3).toUpperCase()}-901`, `Contoh ${activeSubTab}`, activeSubTab, "30 Orang", "Gedung Utama", "Active", ""];
    }

    const csvContent = [headers.join(","), sampleRow.map(v => `"${v}"`).join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Template_Import_${activeSubTab.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Template CSV untuk ${activeSubTab} berhasil diunduh.`, 'success');
  };

  useEffect(() => {
    let cancelled = false;
    const loadSupabase = async () => {
      try {
        if (activeTab === "entities" && activeSubTab === "Santri") {
          if (studentSearchTooShort) {
            if (!cancelled) {
              setDataSources((prev) => ({ ...prev, Santri: [] }));
              setServerStudentHasMore(false);
            }
            return;
          }
          const cursor = currentPage === 1 ? null : serverStudentCursorHistory.current[currentPage];
          if (currentPage > 1 && !cursor) {
            if (!cancelled) setCurrentPage(1);
            return;
          }
          const page = await listSupabaseMasterDataStudentsPage({
            page: currentPage,
            pageSize: recordsPerPage,
            cursor,
            search: searchQuery,
            statuses: statusFilter,
            gender: genderFilter,
            grade: gradeFilter,
            dormitory: dormitoryFilter,
            completeness: completenessFilter,
          });
          if (!cancelled) {
            serverStudentCursorHistory.current[currentPage + 1] = page.nextCursor;
            setDataSources((prev) => ({ ...prev, Santri: page.records }));
            setServerStudentHasMore(page.hasMore);
          }
          return;
        }
        if (activeTab === "structure" && SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES.has(activeSubTab)) {
          const items = await listSupabaseMasterDataStructures();
          if (!cancelled) setDataSources((prev) => ({
            ...prev,
            [activeSubTab]: items.filter((item) => item.category === activeSubTab),
          }));
          return;
        }
        if (!cancelled) setDataSources((prev) => ({ ...prev, [activeSubTab]: [] }));
      } catch (error) {
        if (cancelled) return;
        console.error(`Supabase Master Data ${activeSubTab} failed:`, error);
        setDataSources((prev) => ({ ...prev, [activeSubTab]: [] }));
        if (activeTab === "entities" && activeSubTab === "Santri") {
          setServerStudentHasMore(false);
          showToast(error instanceof Error ? error.message : "Daftar santri belum dapat dimuat.", "error");
        }
      }
    };

    void loadSupabase();
    return () => { cancelled = true; };
  }, [activeTab, activeSubTab, user?.tenantId, user?.uid, currentPage, searchQuery, statusFilter, genderFilter, gradeFilter, dormitoryFilter, completenessFilter, legacyMigrationRefreshKey]);

  const handleTabChange = (
    tabId: string,
  ) => {
    setActiveTab(tabId as "entities" | "structure" | "academic" | "booking" | "audit");
    const nextSubTabs = SUB_TABS[tabId] || [];
    setActiveSubTab(nextSubTabs[0] || "Santri");
    setSelectedRecord(null);
    setSearchQuery("");
    setSearchResults(null);
    setCurrentPage(1);
    serverStudentCursorHistory.current = { 1: null };
    setIsFilterOpen(false);
    setSelectedRows([]);
  };

  const submitSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchResults(null);
    setCurrentPage(1);
    serverStudentCursorHistory.current = { 1: null };
  };

  const handleAddClick = () => {
    setFormErrors({});
    setTouchedFields({});

    setModalMode("add");
    const currentData = dataSources[activeSubTab] || [];
    setFormData({
      enrolled: new Date().toISOString().split("T")[0],
      id: generateUniqueId(activeSubTab, currentData),
    });
    setIsModalOpen(true);
  };

  const handleQrScan = (detectedCodes: any[]) => {
    if (detectedCodes.length > 0) {
      try {
        const qrData = JSON.parse(detectedCodes[0].rawValue);
        if (qrData.id) {
          setShowScanner(false);
          const currentData =
            dataSources[activeSubTab] || getMockData(activeSubTab);
          const found = currentData.find((r) => r.id === qrData.id);
          if (found) {
            setSelectedRecord(found);
            showToast(`Data "${found.name}" (${found.id}) ditemukan.`, "success");
          } else {
            showToast(`Record ${qrData.id} tidak ditemukan pada kategori ${activeSubTab}.`, "error");
          }
        }
      } catch (err) {
        console.error("Invalid QR Code payload");
        showToast("Format QR Code tidak valid.", "error");
      }
    }
  };

  const downloadQRCode = (format: "svg" | "png" = "png") => {
    const svg = document.getElementById("qr-code-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);

    if (format === "svg") {
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedRecord?.id || "qr"}-code.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      const scale = 10; // High quality upscale
      img.onload = () => {
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        if (ctx) {
          ctx.scale(scale, scale);
          // Set white background
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, img.width, img.height);
          ctx.drawImage(img, 0, 0);
          const pngFile = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.download = `${selectedRecord?.id || "qr"}-code.png`;
          downloadLink.href = pngFile;
          downloadLink.click();
        }
      };
      img.src =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  const handlePrintClick = () => {
    if (selectedRecord) {
      const initialFields: Record<string, boolean> = {};
      Object.keys(selectedRecord).forEach((key) => {
        initialFields[key] = true;
      });
      initialFields["qrcode"] = true;
      setPrintFields(initialFields);
      setShowPrintModal(true);
    }
  };

  const handleEditClick = async (record: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFormErrors({});
    setTouchedFields({});

    if (SUPABASE_MASTER_DATA_RUNTIME && activeTab === "entities" && activeSubTab === "Santri") {
      try {
        record = await getSupabaseMasterDataStudentDetails(String(record.id || ""));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Rincian santri belum dapat dibuka.", "error");
        return;
      }
    }

    setModalMode("edit");
    setEditingId(record.id);
    setFormData(record);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecordToDelete(record);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    const record = recordToDelete;
    try {
      if (activeTab === "entities" && activeSubTab === "Santri") {
        await archiveSupabaseMasterDataStudent({ id: String(record.id), supabaseId: String(record.supabaseId || "") });
      } else if (activeTab === "structure" && SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES.has(activeSubTab)) {
        await deleteSupabaseMasterDataStructure(activeSubTab as "Gedung" | "Kamar" | "Kelas", String(record.id));
      } else {
        throw new Error("Kategori ini belum tersedia pada runtime Supabase.");
      }
      setDataSources((prev) => ({
        ...prev,
        [activeSubTab]: (prev[activeSubTab] || []).filter((item) => item.id !== record.id),
      }));
      addAuditLog("DELETE", r…34443 tokens truncated…))}
                               </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                          <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                            Data Attributes
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(selectedRecord)
                              .filter(
                                ([k]) => !["id", "name", "status"].includes(k),
                              )
                              .map(([key, value]) => (
                                <div
                                  key={key}
                                  className={cn(
                                    "bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5 break-words",
                                    printFields[key] === false
                                      ? "print:hidden"
                                      : "",
                                  )}
                                >
                                  <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1 truncate">
                                    {key}
                                  </div>
                                  <div className="text-sm text-slate-800 dark:text-slate-200">
                                    {String(value)}
                                  </div>
                                </div>
                              ))}
                          </div>

                          {/* Structure Relational Occupancy List */}
                          {activeTab === "structure" && (() => {
                            const santriList = dataSources.Santri || MOCK_SANTRI;
                            const occupants = santriList.filter((s) => {
                              const sId = selectedRecord.id;
                              const sName = selectedRecord.name;
                              return (
                                s.dormitoryId === sId ||
                                s.dormitory === sName ||
                                s.roomId === sId ||
                                s.room === sName ||
                                s.classId === sId ||
                                s.grade === sName ||
                                s.halaqahId === sId ||
                                s.halaqah === sName
                              );
                            });

                            return (
                              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                                    Penghuni / Santri Terdaftar ({occupants.length})
                                  </h4>
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded">
                                    Relasi Aktif
                                  </span>
                                </div>

                                {occupants.length > 0 ? (
                                  <div className="space-y-2">
                                    {occupants.map((occ) => (
                                      <div
                                        key={occ.id}
                                        className="p-2.5 bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg flex items-center justify-between gap-3 text-xs hover:border-emerald-500/40 transition-colors"
                                      >
                                        <div>
                                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                                            {occ.name}
                                          </div>
                                          <div className="text-[10px] font-mono text-emerald-400">
                                            {occ.id} • Kelas: {occ.grade || "-"}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleTabChange("entities");
                                            setActiveSubTab("Santri");
                                            setSelectedRecord(occ);
                                          }}
                                          className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0"
                                        >
                                          <span>Profil</span>
                                          <ArrowRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-black/20 rounded-lg border border-dashed border-slate-700 text-center text-xs text-slate-400">
                                    Belum ada santri yang dialokasikan ke {selectedRecord.name}.
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-black/40 flex gap-2 print:hidden">
                      <button
                        onClick={() => handleEditClick(selectedRecord)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Ubah Profil
                      </button>
                      <button
                        onClick={handlePrintClick}
                        className="px-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300  rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                        title="Cetak Data"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Cetak</span>
                      </button>
                      {activeTab === 'entities' && ['Guru', 'Asatidz', 'Pegawai'].includes(activeSubTab) && (
                        <button
                          onClick={() => setShowCVModal(true)}
                          className="px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                          title="Buat CV"
                        >
                          <FileText className="w-4 h-4" />
                          <span>Buat CV</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-500 bg-black/40 uppercase tracking-widest mt-auto print:hidden">
                <div>
                  {isServerPaginatedSantri
                    ? `Menampilkan ${paginatedData.length} santri · halaman ${currentPage}${serverStudentHasMore ? " · masih ada halaman berikutnya" : " · halaman terakhir"}`
                    : `Menampilkan ${paginatedData.length} dari ${filteredData.length} data`}
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className="px-3 py-1  rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    Sebelumnya
                  </button>
                  {!isServerPaginatedSantri && Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={cn(
                        "px-2 py-1 rounded transition-colors",
                        currentPage === i + 1
                          ? "bg-slate-200 dark:bg-white/10  text-slate-700 dark:text-slate-300"
                          : "hover:bg-slate-100 dark:bg-white/5 cursor-pointer",
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={isServerPaginatedSantri ? !serverStudentHasMore : currentPage === totalPages}
                    className="px-3 py-1  rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-xl print:hidden">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-300">
            {selectedRows.length} terpilih
          </span>
          <button type="button" onClick={() => setIsExportModalOpen(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            Ekspor pilihan
          </button>
          <button type="button" onClick={() => setSelectedRows([])} aria-label="Batal pilih" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CV Modal */}
      {showCVModal && selectedRecord && (
        <>
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #cv-print-area, #cv-print-area * {
                visibility: visible;
              }
              #cv-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `}</style>
          <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/90 backdrop-blur-sm print:static print:bg-white print:p-0">
            {/* Controls - Hidden when printing */}
            <div className="h-16 border-b border-white/10 bg-black/50 flex items-center justify-between px-6 shrink-0 print:hidden">
              <div className="flex items-center gap-3 text-white">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold">Curriculum Vitae</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Printer className="w-4 h-4" />
                  Cetak CV
                </button>
                <button
                  onClick={() => setShowCVModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* CV Content - Scrollable in UI, full block when printing */}
            <div id="cv-print-area" className="flex-1 overflow-y-auto p-4 md:p-8 print:p-0 print:overflow-visible flex justify-center">
               <CVReport data={selectedRecord} />
            </div>
          </div>
        </>
      )}

      {/* Pengaturan Cetak Modal */}
      {showPrintModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden animate-in fade-in duration-200">
          <div className="glass-panel  rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40">
              <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                Pengaturan Cetak
              </h3>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 tracking-wide">
                Pilih kolom yang ingin disertakan dalam laporan cetak.
                Nama dan ID selalu disertakan.
              </p>
              <div className="space-y-1 mt-2">
                <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 dark:bg-white/5 cursor-pointer border border-transparent hover:border-slate-200 dark:border-white/5 transition-colors">
                  <input
                    type="checkbox"
                    checked={printFields["qrcode"] !== false}
                    onChange={(e) =>
                      setPrintFields((prev) => ({
                        ...prev,
                        qrcode: e.target.checked,
                      }))
                    }
                    className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700 dark:text-slate-300">Kode QR</span>
                    <span className="text-[10px] text-emerald-400 uppercase font-semibold bg-emerald-900/40 px-1.5 py-0.5 rounded">
                      Pindai
                    </span>
                  </div>
                </label>
                {Object.keys(selectedRecord)
                  .filter((k) => !["id", "name"].includes(k))
                  .map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 dark:bg-white/5 cursor-pointer border border-transparent hover:border-slate-200 dark:border-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={printFields[key] !== false}
                        onChange={(e) =>
                          setPrintFields((prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                        className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                        {masterDataFieldLabel(key)}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-white/5 bg-black/40 mt-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:bg-white/5 rounded-lg transition-colors border border-transparent"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowPrintModal(false);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
              >
                <Printer className="w-4 h-4" />
                Cetak Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          {activeTab === 'entities' ? (
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <EntityRegistrationForm 
                onCancel={() => setIsModalOpen(false)} 
                onSuccess={(savedData) => {
                  if (SUPABASE_MASTER_DATA_RUNTIME && savedData) {
                    setDataSources((prev) => ({
                      ...prev,
                      Santri: modalMode === "add"
                        ? [savedData, ...(prev.Santri || [])]
                        : (prev.Santri || []).map((record) => record.id === savedData.id ? { ...record, ...savedData } : record),
                    }));
                  } else if (savedData) {
                    handleEntitySavedRelationalSync(savedData);
                  }
                  setIsModalOpen(false);
                }}
                initialData={modalMode === "edit" ? formData : { type: activeSubTab }}
                isEdit={modalMode === "edit"}
                availableWali={dataSources["Wali Santri"] || MOCK_WALISANTRI}
                availableSantri={dataSources["Santri"] || MOCK_SANTRI}
                availableStructure={dataSources}
              />
            </div>
          ) : (
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <StructureRegistrationForm 
                onCancel={() => setIsModalOpen(false)} 
                onSuccess={(savedData) => {
                  if (SUPABASE_MASTER_DATA_RUNTIME && savedData) {
                    setDataSources((prev) => ({
                      ...prev,
                      [activeSubTab]: modalMode === "add"
                        ? [savedData, ...(prev[activeSubTab] || [])]
                        : (prev[activeSubTab] || []).map((record) => record.id === savedData.id ? { ...record, ...savedData } : record),
                    }));
                  }
                  setIsModalOpen(false);
                }}
                initialData={modalMode === "edit" ? formData : undefined}
                isEdit={modalMode === "edit"}
                type={activeSubTab}
                availableBuildings={dataSources["Gedung"] || []}
              />
            </div>
          )}
        </div>
      )}
      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel  rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40">
              <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                Pindai QR
              </h3>
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 aspect-square">
              <div className="w-full h-full rounded-lg overflow-hidden  bg-black relative">
                <Scanner onScan={handleQrScan} />
                <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-lg pointer-events-none scale-[0.8] opacity-50" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-black/40 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Position the QR code inside the frame to scan.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Document Preview Modal */}
      {previewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel  rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative flex flex-col h-[80vh]">
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40">
              <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Pratinjau: {previewDocument.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewDocument(null)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 flex items-center justify-center bg-black/50 overflow-hidden relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none" />
              <div className="w-full max-w-xl aspect-[1/1.4] bg-white rounded-lg shadow-xl relative overflow-hidden flex flex-col border border-slate-300">
                {/* Fake Document Body */}
                <div className="p-8 space-y-4 flex-1">
                  <div className="h-8 bg-slate-200 rounded w-2/3 mb-8" />
                  <div className="h-4 bg-slate-100 rounded w-full" />
                  <div className="h-4 bg-slate-100 rounded w-full" />
                  <div className="h-4 bg-slate-100 rounded w-5/6" />
                  <div className="h-4 bg-slate-100 rounded w-full mt-8" />
                  <div className="h-4 bg-slate-100 rounded w-4/5" />
                  <div className="h-4 bg-slate-100 rounded w-full" />

                  {/* Fake Signature */}
                  <div className="mt-12 flex justify-end">
                    <div className="w-32 h-12 border-b-2 border-slate-400 border-dashed" />
                  </div>
                </div>
                {/* Overlay indicating it's a simulated preview */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[1px]">
                  <div className="px-4 py-2 bg-black/70 backdrop-blur-md rounded-full text-white/90 text-sm font-medium  shadow-xl flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Isi Pratinjau Simulasi
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-black/40 text-center flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                ID: {previewDocument.id} | Size:{" "}
                {previewDocument.size || "1.2MB"}
              </div>
              <button
                onClick={() => setPreviewDocument(null)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-in slide-in-from-bottom-5 duration-300 backdrop-blur-md ${
          notification.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
        }`}>
          {notification.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <p className="text-sm font-medium">{notification.message}</p>
          <button 
            type="button"
            onClick={() => setNotification(null)}
            className="ml-2 p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Konfirmasi Hapus Data</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Apakah Anda yakin ingin menghapus data <strong className="text-rose-400">{recordToDelete.name}</strong> ({recordToDelete.id}) dari modul Master Data?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-lg shadow-rose-900/30 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rekomendasi 4: Advanced Multi-Format Export Engine */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        activeTab={activeTab}
        activeSubTab={activeSubTab}
        allData={baseData}
        filteredData={filteredData}
        selectedRows={selectedRows}
        onExportSuccess={handleExportSuccess}
      />

      {transferModal && (
        <MasterDataTransferModal
          key={transferModal.mode + "-" + transferModal.kind + "-" + (transferModal.category || "")}
          isOpen={Boolean(transferModal)}
          mode={transferModal.mode}
          kind={transferModal.kind}
          structureCategory={transferModal.category}
          onClose={() => setTransferModal(null)}
          onComplete={() => setLegacyMigrationRefreshKey((value) => value + 1)}
        />
      )}

    </div>
  );
}

