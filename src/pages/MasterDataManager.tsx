import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect } from "react";
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
  Sparkles,
  Loader2,
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
  Layers,
  BookOpen,
  FilterX
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { cn, generateUniqueId } from "../lib/utils";
import { CVReport } from "../components/CVReport";
import { ExportModal } from "../components/ExportModal";
import { SUPABASE_ONLY_RUNTIME, supabaseRuntimeEnabled } from "../runtimeBackend";
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
  listSupabaseMasterDataStudents,
  listSupabaseMasterDataStructures,
  upsertSupabaseMasterDataStudent,
  upsertSupabaseMasterDataStructure,
} from "../services/masterDataApi";

const SUPABASE_MASTER_DATA_RUNTIME = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_MASTER_DATA_RUNTIME_ENABLED);
const SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES = new Set(["Gedung", "Kamar", "Kelas"]);
const MDM_DRAFT_KEY_PREFIX = "mdm-form-autosave";

const getMdmDraftKey = (tenantId: string | null | undefined, userId: string | null | undefined) => {
  const activeTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const activeUserId = typeof userId === "string" ? userId.trim() : "";
  return activeTenantId && activeUserId
    ? `${MDM_DRAFT_KEY_PREFIX}:${encodeURIComponent(activeTenantId)}:${encodeURIComponent(activeUserId)}`
    : null;
};

const clearMdmDrafts = (allTenants = false) => {
  try {
    if (!allTenants) {
      localStorage.removeItem(MDM_DRAFT_KEY_PREFIX);
      // Old tenant-only keys cannot be safely restored after users share a browser.
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(`${MDM_DRAFT_KEY_PREFIX}:`)) continue;
        const identityPart = key.slice(MDM_DRAFT_KEY_PREFIX.length + 1);
        if (!identityPart.includes(":")) localStorage.removeItem(key);
      }
      return;
    }
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key === MDM_DRAFT_KEY_PREFIX || key?.startsWith(`${MDM_DRAFT_KEY_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* Browser storage is optional. */ }
};

const readMdmDraft = (key: string | null) => {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const TABS = [
  { id: "entities", label: "Entities", icon: Users },
  { id: "structure", label: "Structure", icon: Building },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "booking", label: "Facility Booking", icon: Clock },
  { id: "audit", label: "Audit Trail", icon: Activity },
];

const SUB_TABS: Record<string, string[]> = {
  entities: ["Santri", "Wali Santri", "Guru", "Asatidz", "Pegawai", "Alumni"],
  structure: ["Yayasan", "Kampus", "Gedung", "Kamar", "Kelas", "Halaqah", "Map View"],
  academic: ["Mata Pelajaran", "Kurikulum"],
  booking: ["Room Booking"],
  audit: ["All Activity"],
};

import { DEFAULT_STRUCTURE } from "../data/defaultStructure";
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

function masterAuditActionLabel(action: string) {
  const labels: Record<string, string> = { CREATE: "Ditambahkan", UPDATE: "Diperbarui", DELETE: "Dihapus", IMPORT: "Diimpor" };
  return labels[action] || action;
}

export function MasterDataManager() {
  const { user } = useAuth();
  const visibleTabs = SUPABASE_MASTER_DATA_RUNTIME ? TABS.filter((tab) => ["entities", "structure"].includes(tab.id)) : TABS;
  const [activeTab, setActiveTab] = useState<
    "entities" | "structure" | "academic" | "booking" | "audit"
  >("entities");
  const [activeSubTab, setActiveSubTab] = useState("Santri");
  const visibleSubTabs = SUPABASE_MASTER_DATA_RUNTIME
    ? activeTab === "entities" ? ["Santri"] : activeTab === "structure" ? ["Gedung", "Kamar", "Kelas"] : []
    : SUB_TABS[activeTab];
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
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
  const [recordToDelete, setRecordToDelete] = useState<any | null>(null);
  const [draftToRestore, setDraftToRestore] = useState<{ mode: "add" | "edit"; draft: any; record?: any } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [isHierarchyView, setIsHierarchyView] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const handleDownloadTemplate = () => {
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
          const items = await listSupabaseMasterDataStudents();
          if (!cancelled) setDataSources((prev) => ({ ...prev, Santri: items }));
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
      }
    };

    void loadSupabase();
    return () => { cancelled = true; };
  }, [activeTab, activeSubTab, user?.tenantId, user?.uid]);

  useEffect(() => {
    // We intentionally removed the auto-pop-up on mount for drafts,
    // as it interrupts the user on every visit to Master Data.
    // Drafts are still optionally restored when they click Add or Edit.
  }, [user?.tenantId, user?.uid]);

  useEffect(() => {
    // Old drafts have no tenant marker, so they cannot be restored safely.
    clearMdmDrafts(SUPABASE_MASTER_DATA_RUNTIME);
  }, [user?.tenantId]);

  useEffect(() => {
    const draftKey = getMdmDraftKey(user?.tenantId, user?.uid);
    if (SUPABASE_MASTER_DATA_RUNTIME) {
      if (draftKey) {
        try { localStorage.removeItem(draftKey); } catch { /* Browser storage is optional. */ }
      }
      return;
    }
    if (isModalOpen && draftKey) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          isDraft: true,
          tenantId: user?.tenantId,
          userId: user?.uid,
          modalMode,
          editingId,
          formData,
          activeSubTab,
        }));
      } catch { /* Browser storage is optional. */ }
    }
  }, [isModalOpen, formData, modalMode, editingId, activeSubTab, user?.tenantId]);

  const handleTabChange = (
    tabId: string,
  ) => {
    setActiveTab(tabId as "entities" | "structure" | "academic" | "booking" | "audit");
    const nextSubTabs = SUPABASE_MASTER_DATA_RUNTIME
      ? tabId === "entities" ? ["Santri"] : tabId === "structure" ? ["Gedung", "Kamar", "Kelas"] : []
      : SUB_TABS[tabId];
    setActiveSubTab(nextSubTabs[0] || "Santri");
    setSelectedRecord(null);
    setSearchQuery("");
    setSearchResults(null);
    setCurrentPage(1);
    setIsFilterOpen(false);
    setSelectedRows([]);
  };

  const performAISearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const records = dataSources[activeSubTab] || getMockData(activeSubTab);
      const response = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, records }),
      });
      const data = await response.json();
      if (data.matchedIds) {
        setSearchResults(data.matchedIds);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddClick = () => {
    setFormErrors({});
    setTouchedFields({});

    const draftKey = getMdmDraftKey(user?.tenantId, user?.uid);
    const savedDraft = SUPABASE_MASTER_DATA_RUNTIME ? null : readMdmDraft(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.tenantId === user?.tenantId && parsed.userId === user?.uid && parsed.isDraft && parsed.modalMode === "add") {
          setDraftToRestore({ mode: "add", draft: parsed });
          return;
        }
      } catch (e) {
        console.error("Failed to restore draft:", e);
      }
    }

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

  const handleEditClick = (record: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFormErrors({});
    setTouchedFields({});

    const draftKey = getMdmDraftKey(user?.tenantId, user?.uid);
    const savedDraft = SUPABASE_MASTER_DATA_RUNTIME ? null : readMdmDraft(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (
          parsed.isDraft &&
          parsed.tenantId === user?.tenantId &&
          parsed.userId === user?.uid &&
          parsed.modalMode === "edit" &&
          parsed.editingId === record.id
        ) {
          setDraftToRestore({ mode: "edit", draft: parsed, record });
          return;
        }
      } catch (e) {
        console.error("Failed to restore draft:", e);
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
      addAuditLog("DELETE", record.id, record.name);
      if (selectedRecord?.id === record.id) setSelectedRecord(null);
      showToast(`Data "${record.name}" berhasil diarsipkan atau dihapus.`, "success");
    } catch (error: any) {
      showToast(error?.message || "Perubahan data Supabase gagal.", "error");
    } finally {
      setRecordToDelete(null);
    }
  };

  const handleEntitySavedRelationalSync = (savedRecord: any) => {
    if (!savedRecord) return;
    
    // 1. If Santri was saved and has waliSantriId, update Wali Santri bidirectional link
    if (activeSubTab === "Santri" || savedRecord.type === "Santri") {
      const waliId = savedRecord.waliSantriId;
      if (waliId) {
        setDataSources((prev) => {
          const currentWaliList = prev["Wali Santri"] || MOCK_WALISANTRI;
          const updatedWaliList = currentWaliList.map((w: any) => {
            if (w.id === waliId) {
              const prevSantriIds = Array.isArray(w.santriIds) ? w.santriIds : [];
              const newSantriIds = prevSantriIds.includes(savedRecord.id)
                ? prevSantriIds
                : [...prevSantriIds, savedRecord.id];
              const prevNames = w.studentName ? w.studentName.split(", ").map((n: string) => n.trim()) : [];
              const newNames = prevNames.includes(savedRecord.name) ? prevNames : [...prevNames, savedRecord.name];
              return {
                ...w,
                santriIds: newSantriIds,
                studentName: newNames.join(", "),
                studentGrade: savedRecord.grade || w.studentGrade,
              };
            }
            return w;
          });
          return {
            ...prev,
            "Wali Santri": updatedWaliList,
            Santri: (prev.Santri || []).map((s) => s.id === savedRecord.id ? { ...s, ...savedRecord } : s),
          };
        });
      }
    }

    // 2. If Wali Santri was saved and has santriIds, update all linked Santri
    if (activeSubTab === "Wali Santri" || savedRecord.type === "Wali Santri") {
      const studentIds = Array.isArray(savedRecord.santriIds) ? savedRecord.santriIds : [];
      if (studentIds.length > 0) {
        setDataSources((prev) => {
          const currentSantriList = prev.Santri || MOCK_SANTRI;
          const updatedSantriList = currentSantriList.map((s: any) => {
            if (studentIds.includes(s.id)) {
              return {
                ...s,
                waliSantriId: savedRecord.id,
                parentName: savedRecord.name,
                parentPhone: savedRecord.phone || s.parentPhone,
              };
            }
            return s;
          });
          return {
            ...prev,
            Santri: updatedSantriList,
            "Wali Santri": (prev["Wali Santri"] || []).map((w) => w.id === savedRecord.id ? { ...w, ...savedRecord } : w),
          };
        });
      }
    }
  };

  const validateField = (key: string, value: string): string => {
    const strVal = value.trim();
    if (key === "name" && (!strVal || strVal.length < 2)) return "Nama minimal harus 2 karakter";
    if (key === "id" && !strVal) return "ID is required";
    if (strVal) {
      if (key === "nik") {
        if (!NIK_REGEX.test(strVal)) return "NIK harus terdiri dari tepat 16 digit angka";
      }
      if (key === "nisn" && activeSubTab === "Santri") {
        if (!NISN_REGEX.test(strVal)) return "NISN harus terdiri dari tepat 10 digit angka";
      }
      if (key === "nuptk" && (activeSubTab === "Guru" || activeSubTab === "Asatidz")) {
        if (!NUPTK_REGEX.test(strVal)) return "NUPTK harus terdiri dari tepat 16 digit angka";
      }
      if (key.toLowerCase().includes("email")) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal))
          return "Format email tidak valid";
      }
      if (key.toLowerCase().includes("phone")) {
        if (
          !/^(\+62|62|08|0)[0-9\s\-]{8,15}$/.test(strVal.replace(/\s+/g, '')) &&
          !/^[0-9]{7,15}$/.test(strVal)
        )
          return "Format nomor telepon tidak valid";
      }
    }
    return "";
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    setTouchedFields((prev: any) => ({ ...prev, [field]: true }));
    const error = validateField(field, value);
    setFormErrors((prev: any) => {
      const next = { ...prev };
      if (error) {
        next[field] = error;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const handleUseTemplate = () => {
    let defaults: any = {};
    if (activeSubTab === "Santri") {
      defaults = {
        name: "Fulan bin Fulan",
        gender: "L",
        grade: "10 IPA 1",
        phone: "+62 812-3456-7890",
        address: "Jl. Pesantren No. 1, Jakarta",
        email: "fulan@example.com",
        parentName: "Bapak Fulan",
        parentPhone: "+62 812-9999-8888",
        medical: "None",
        bloodType: "O",
        status: "Active",
      };
    } else if (activeTab === "entities") {
      defaults = {
        name: `Template ${activeSubTab}`,
        gender: "L",
        phone: "+62 811-1222-3333",
        address: "Jl. Contoh Alamat No. 2",
        email: "template@example.com",
        status: "Active",
      };
    } else {
      defaults = {
        name: `Template ${activeSubTab}`,
        status: "Active",
      };
    }

    setFormData((prev: any) => ({
      ...prev,
      ...defaults,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateMasterData(formData, activeTab, activeSubTab);
    if (!result.success) {
      const formattedErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        formattedErrors[issue.path[0] as string] = issue.message;
      });
      setFormErrors(formattedErrors);
      showToast(`Validasi gagal: ${result.error.issues[0]?.message || 'Periksa kembali data formulir'}`, "error");
      return;
    }

    if (!formData.id?.trim()) {
      setFormErrors({ id: "ID is required" });
      showToast("ID wajib diisi", "error");
      return;
    }
    if (!user?.tenantId) {
      showToast("Tenant aktif tidak ditemukan. Muat ulang sesi sebelum menyimpan.", "error");
      return;
    }

    const currentList = dataSources[activeSubTab] || [];
    const conflicts = checkIdentityConflicts(
      formData,
      currentList,
      modalMode === "edit" ? editingId || undefined : undefined
    );
    if (conflicts.length > 0) {
      const first = conflicts[0];
      setFormErrors({ [first.field]: first.message });
      showToast(`Duplikasi terdeteksi: ${first.message}`, "error");
      return;
    }
    if (modalMode === "edit" && String(result.data.id || "").trim() !== String(editingId || "").trim()) {
      setFormErrors({ id: "ID record tidak dapat diubah setelah data dibuat." });
      showToast("ID record tidak dapat diubah setelah data dibuat.", "error");
      return;
    }

    setFormErrors({});
    const draftKey = getMdmDraftKey(user?.tenantId, user?.uid);
    if (draftKey) {
      try { localStorage.removeItem(draftKey); } catch { /* Browser storage is optional. */ }
    }

    const validatedData = result.data;
    const recordId = modalMode === "edit" ? String(editingId || "") : String(validatedData.id);
    try {
      let savedRecord: any;
      if (activeTab === "entities" && activeSubTab === "Santri") {
        savedRecord = await upsertSupabaseMasterDataStudent({
          ...validatedData,
          id: recordId,
          type: "Santri",
          tenantId: user.tenantId,
        });
      } else if (activeTab === "structure" && SUPABASE_MASTER_DATA_STRUCTURE_CATEGORIES.has(activeSubTab)) {
        savedRecord = await upsertSupabaseMasterDataStructure(activeSubTab as "Gedung" | "Kamar" | "Kelas", {
          ...validatedData,
          id: recordId,
          category: activeSubTab,
        });
      } else {
        throw new Error("Kategori ini belum tersedia pada runtime Supabase.");
      }
      setDataSources((prev) => ({
        ...prev,
        [activeSubTab]: modalMode === "add"
          ? [savedRecord, ...(prev[activeSubTab] || [])]
          : (prev[activeSubTab] || []).map((record) => record.id === editingId ? { ...record, ...savedRecord } : record),
      }));
      if (modalMode === "add") addAuditLog("CREATE", recordId, String(savedRecord.name || ""));
      else addAuditLog("UPDATE", recordId, String(savedRecord.name || ""));
      if (selectedRecord?.id === editingId) setSelectedRecord({ ...selectedRecord, ...savedRecord });
      setIsModalOpen(false);
      showToast(`Data "${savedRecord.name}" berhasil ${modalMode === "add" ? "disimpan" : "diperbarui"}.`, "success");
    } catch (error: any) {
      showToast(error?.message || "Gagal menyimpan data ke Supabase.", "error");
    }
  };

  const baseData = dataSources[activeSubTab] || [];
  
  // Instant search query fallback if AI search is not triggered
  const searchFiltered = React.useMemo(() => {
    let list = baseData;
    if (searchResults) {
      list = list.filter((r) => searchResults.includes(r.id));
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        return (
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.nik && r.nik.toLowerCase().includes(q)) ||
          (r.nisn && r.nisn.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.grade && r.grade.toLowerCase().includes(q)) ||
          (r.dormitory && r.dormitory.toLowerCase().includes(q)) ||
          (r.room && r.room.toLowerCase().includes(q)) ||
          (r.halaqah && r.halaqah.toLowerCase().includes(q)) ||
          (r.type && r.type.toLowerCase().includes(q)) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.location && r.location.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [baseData, searchResults, searchQuery]);

  // Multi-facet filtering (Status, Gender, Grade, Dormitory, Completeness)
  const filteredData = React.useMemo(() => {
    return searchFiltered.filter((r) => {
      // 1. Status Filter
      if (statusFilter.length > 0 && !statusFilter.includes(r.status)) {
        return false;
      }
      // 2. Gender Filter
      if (genderFilter !== 'ALL' && r.gender && r.gender !== genderFilter) {
        return false;
      }
      // 3. Grade / Kelas Filter
      if (gradeFilter && r.grade !== gradeFilter && r.classId !== gradeFilter) {
        return false;
      }
      // 4. Dormitory Filter
      if (dormitoryFilter && r.dormitory !== dormitoryFilter && r.dormitoryId !== dormitoryFilter) {
        return false;
      }
      // 5. Completeness Filter
      if (completenessFilter === 'WITH_NIK' && (!r.nik || r.nik.trim() === '')) {
        return false;
      }
      if (completenessFilter === 'WITH_WALI' && (!r.waliSantriId && !r.parentName)) {
        return false;
      }
      if (completenessFilter === 'WITHOUT_WALI' && (r.waliSantriId || r.parentName)) {
        return false;
      }

      return true;
    });
  }, [searchFiltered, statusFilter, genderFilter, gradeFilter, dormitoryFilter, completenessFilter]);

  const resetAllFilters = () => {
    setStatusFilter([]);
    setGenderFilter('ALL');
    setGradeFilter('');
    setDormitoryFilter('');
    setCompletenessFilter('ALL');
    setSearchQuery('');
    setSearchResults(null);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    statusFilter.length > 0 ||
    genderFilter !== 'ALL' ||
    Boolean(gradeFilter) ||
    Boolean(dormitoryFilter) ||
    completenessFilter !== 'ALL' ||
    Boolean(searchQuery.trim());

  const totalPages = Math.ceil(filteredData.length / recordsPerPage) || 1;
  const paginatedData = filteredData.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage,
  );

  const allSelected =
    paginatedData.length > 0 &&
    paginatedData.every((r) => selectedRows.includes(r.id));
  const toggleAll = () =>
    setSelectedRows(
      allSelected
        ? selectedRows.filter((id) => !paginatedData.some((r) => r.id === id))
        : [...new Set([...selectedRows, ...paginatedData.map((r) => r.id)])],
    );
  const toggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleExportSuccess = (format: string, count: number) => {
    showToast(`Berhasil mengekspor ${count} data ${activeSubTab} ke format ${format.toUpperCase()}.`, "success");
  };

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    const headers = Object.keys(filteredData[0]).filter(
      (k) => k !== "selected" && typeof filteredData[0][k] !== "object",
    );
    const csvContent = [
      headers.join(","),
      ...filteredData.map((row) =>
        headers
          .map(
            (header) =>
              `"${(row[header] || "").toString().replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${activeSubTab}_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAuditLogs = () => {
    if (auditLogs.length === 0) {
      showToast("Tidak ada log audit untuk diekspor", "error");
      return;
    }
    const headers = ["id", "action", "entity", "recordId", "recordName", "user", "timestamp"];
    const csvContent = [
      headers.join(","),
      ...auditLogs.map((log) =>
        headers.map((h) => `"${((log as any)[h] || "").toString().replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `Audit_Logs_${new Date().toISOString().split("T")[0]}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Audit logs berhasil diekspor ke CSV.", "success");
  };

  const renderTableHeaders = () => {
    if (activeTab === "structure") {
      return (
        <tr>
          <th className="px-6 py-4 w-12 text-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 mt-1 cursor-pointer"
            />
          </th>
          <th className="px-6 py-4">ID</th>
          <th className="px-6 py-4">Name</th>
          <th className="px-6 py-4">Type</th>
          <th className="px-6 py-4">Capacity/Size</th>
          <th className="px-6 py-4">Status</th>
          <th className="px-6 py-4">Location</th>
          <th className="px-6 py-4 text-right">Actions</th>
        </tr>
      );
    }
    if (activeTab === "academic") {
      return (
        <tr>
          <th className="px-6 py-4 w-12 text-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 mt-1 cursor-pointer"
            />
          </th>
          <th className="px-6 py-4">Kode / ID</th>
          <th className="px-6 py-4">Nama {activeSubTab}</th>
          <th className="px-6 py-4">Kategori / Rumpun</th>
          <th className="px-6 py-4">{activeSubTab === "Mata Pelajaran" ? "Tingkat / Sasaran" : "Fase / Jenjang"}</th>
          <th className="px-6 py-4">Status</th>
          <th className="px-6 py-4">{activeSubTab === "Mata Pelajaran" ? "Beban Jam" : "Deskripsi"}</th>
          <th className="px-6 py-4 text-right">Actions</th>
        </tr>
      );
    }
    if (activeSubTab === "Wali Santri") {
      return (
        <tr>
          <th className="px-6 py-4 w-12 text-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 mt-1 cursor-pointer"
            />
          </th>
          <th className="px-6 py-4">ID</th>
          <th className="px-6 py-4">Name</th>
          <th className="px-6 py-4">NIK</th>
          <th className="px-6 py-4">Nama Santri</th>
          <th className="px-6 py-4">Status</th>
          <th className="px-6 py-4">Telepon</th>
          <th className="px-6 py-4 text-right">Actions</th>
        </tr>
      );
    }

    return (
      <tr>
        <th className="px-6 py-4 w-12 text-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 mt-1 cursor-pointer"
          />
        </th>
        <th className="px-6 py-4">ID</th>
        <th className="px-6 py-4">Name</th>
        <th className="px-6 py-4">Gender</th>
        <th className="px-6 py-4">Jenjang/Kelas</th>
        <th className="px-6 py-4">Status</th>
        <th className="px-6 py-4">Enrolled/Date</th>
        <th className="px-6 py-4 text-right">Actions</th>
      </tr>
    );
  };

  const renderTableRow = (row: any) => {
    const isSelected = selectedRows.includes(row.id);
    if (activeTab === "structure") {
      return (
        <tr
          key={row.id}
          className={cn(
            "transition-colors group cursor-pointer",
            selectedRecord?.id === row.id
              ? "bg-white/[0.05]"
              : isSelected
                ? "bg-emerald-900/10"
                : "hover:bg-white/[0.02]",
          )}
          onClick={() => setSelectedRecord(row)}
        >
          <td className="px-6 py-4" onClick={(e) => toggleRow(row.id, e)}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 cursor-pointer pointer-events-none"
            />
          </td>
          <td className="px-6 py-4 font-mono text-xs opacity-60 text-slate-500 dark:text-slate-400">
            {row.id}
          </td>
          <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
            {row.type || activeSubTab}
          </td>
          <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{row.capacity || "-"}</td>
          <td className="px-6 py-4">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wider",
                getStatusColor(row.status),
              )}
            >
              {row.status}
            </span>
          </td>
          <td className="px-6 py-4 text-slate-500">{row.location || "-"}</td>
          <td className="px-6 py-4 text-right">
            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
                title="Ubah"
                onClick={(e) => handleEditClick(row, e)}
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                disabled={userRole !== "Super Administrator"}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm disabled:opacity-30 disabled:hover:text-slate-500 dark:text-slate-400 disabled:cursor-not-allowed"
                title={
                  userRole !== "Super Administrator"
                    ? "Memerlukan akses Super Administrator"
                    : "Hapus"
                }
                onClick={(e) => handleDeleteClick(row, e)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    
    if (activeTab === "academic") {
      return (
        <tr
          key={row.id}
          className={cn(
            "transition-colors group cursor-pointer",
            selectedRecord?.id === row.id
              ? "bg-white/[0.05]"
              : isSelected
                ? "bg-emerald-900/10"
                : "hover:bg-white/[0.02]",
          )}
          onClick={() => setSelectedRecord(row)}
        >
          <td className="px-6 py-4" onClick={(e) => toggleRow(row.id, e)}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 cursor-pointer pointer-events-none"
            />
          </td>
          <td className="px-6 py-4 font-mono text-xs opacity-80 text-slate-500 dark:text-slate-400 font-semibold">
            {row.id}
          </td>
          <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{row.name}</span>
            </div>
          </td>
          <td className="px-6 py-4">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {row.category || "Umum"}
            </span>
          </td>
          <td className="px-6 py-4 text-slate-700 dark:text-slate-300 text-xs">
            {row.grade || row.capacity || "-"}
          </td>
          <td className="px-6 py-4">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wider",
                getStatusColor(row.status),
              )}
            >
              {row.status}
            </span>
          </td>
          <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-xs">
            {row.capacity || row.description || row.location || "-"}
          </td>
          <td className="px-6 py-4 text-right">
            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 transition-colors shadow-sm"
                title="Ubah"
                onClick={(e) => handleEditClick(row, e)}
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                disabled={userRole !== "Super Administrator"}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 transition-colors shadow-sm disabled:opacity-30 disabled:hover:text-slate-500 dark:text-slate-400 disabled:cursor-not-allowed"
                title="Hapus"
                onClick={(e) => handleDeleteClick(row, e)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      );
    }

    if (activeSubTab === "Wali Santri") {
      return (
        <tr
          key={row.id}
          className={cn(
            "transition-colors group cursor-pointer",
            selectedRecord?.id === row.id
              ? "bg-white/[0.05]"
              : isSelected
                ? "bg-emerald-900/10"
                : "hover:bg-white/[0.02]",
          )}
          onClick={() => setSelectedRecord(row)}
        >
          <td className="px-6 py-4" onClick={(e) => toggleRow(row.id, e)}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 cursor-pointer pointer-events-none"
            />
          </td>
          <td className="px-6 py-4 font-mono text-xs opacity-60 text-slate-500 dark:text-slate-400">
            {row.id}
          </td>
          <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
            {row.nik || "-"}
          </td>
          <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">
            {row.studentName || "-"}
          </td>
          <td className="px-6 py-4">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wider",
                getStatusColor(row.status),
              )}
            >
              {row.status}
            </span>
          </td>
          <td className="px-6 py-4 font-mono text-xs text-slate-500">
            {row.phone || "-"}
          </td>
          <td className="px-6 py-4 text-right">
            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
                title="Ubah"
                onClick={(e) => handleEditClick(row, e)}
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                disabled={userRole !== "Super Administrator"}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm disabled:opacity-30 disabled:hover:text-slate-500 dark:text-slate-400 disabled:cursor-not-allowed"
                title={
                  userRole !== "Super Administrator"
                    ? "Memerlukan akses Super Administrator"
                    : "Hapus"
                }
                onClick={(e) => handleDeleteClick(row, e)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
                title="More Options"
                onClick={(e) => {
                  e.stopPropagation();
                  window.print();
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr
        key={row.id}
        className={cn(
          "transition-colors group cursor-pointer",
          selectedRecord?.id === row.id
            ? "bg-white/[0.05]"
            : isSelected
              ? "bg-emerald-900/10"
              : "hover:bg-white/[0.02]",
        )}
        onClick={() => setSelectedRecord(row)}
      >
        <td className="px-6 py-4" onClick={(e) => toggleRow(row.id, e)}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 cursor-pointer pointer-events-none"
          />
        </td>
        <td className="px-6 py-4 font-mono text-xs opacity-60 text-slate-500 dark:text-slate-400">
          {row.id}
        </td>
        <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{row.gender}</td>
        <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{row.grade}</td>
        <td className="px-6 py-4">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wider",
              getStatusColor(row.status),
            )}
          >
            {row.status}
          </span>
        </td>
        <td className="px-6 py-4 font-mono text-xs text-slate-500">
          {row.enrolled || "-"}
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
              title="Ubah"
              onClick={(e) => handleEditClick(row, e)}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              disabled={userRole !== "Super Administrator"}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm disabled:opacity-30 disabled:hover:text-slate-500 dark:text-slate-400 disabled:cursor-not-allowed"
              title={
                userRole !== "Super Administrator"
                  ? "Memerlukan akses Super Administrator"
                  : "Hapus"
              }
              onClick={(e) => handleDeleteClick(row, e)}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10  transition-colors shadow-sm"
              title="More Options"
              onClick={(e) => {
                e.stopPropagation();
                window.print();
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12 relative">
      {notification && (
        <div className={`p-4 rounded-lg flex items-center justify-between border ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <p className="font-medium">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100">
             <X className="w-5 h-5" />
          </button>
        </div>
      )}
      {SUPABASE_MASTER_DATA_RUNTIME && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          Mode Supabase aktif. Sumber data tenant untuk Santri, Gedung, Kamar, dan Kelas berasal dari backend. Modul Master Data lain belum dipindahkan dan disembunyikan pada mode ini.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-emerald-500 pb-1 inline-block">
                Master Data Management
              </h1>
            </div>
            <p className="text-slate-500 text-sm mt-2">
              Centralized single source of truth for all foundational data &mdash; Terkoneksi ke Asrama & Akademik
            </p>
          </div>
          {!SUPABASE_MASTER_DATA_RUNTIME && <div className="flex flex-col gap-1 ml-4 py-1 border-l border-slate-200 dark:border-white/10 pl-6">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Active Unit / Entity
            </span>
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-slate-50 dark:bg-[#0a0a0a]  rounded px-2 py-1 text-xs font-medium text-emerald-400 focus:outline-none focus:border-emerald-500/50"
            >
              {getHierarchicalUnits().map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {'\u00A0'.repeat(unit.depth * 4)}
                  {unit.depth > 0 ? '↳ ' : ''}
                  {unit.name}
                </option>
              ))}
            </select>
          </div>}
          {!SUPABASE_MASTER_DATA_RUNTIME && <div className="flex flex-col gap-1 ml-2 py-1 border-l border-slate-200 dark:border-white/10 pl-6">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Peran Aktif
            </span>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as any)}
              className="bg-slate-50 dark:bg-[#0a0a0a]  rounded px-2 py-1 text-xs font-medium text-blue-400 focus:outline-none focus:border-blue-500/50"
            >
              <option value="Admin">Admin</option>
              <option value="Super Administrator">Super Admin</option>
            </select>
          </div>}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-3.5 py-2 rounded-lg font-medium text-sm transition-colors hover:bg-slate-200 dark:bg-white/10"
            title={`Unduh Template CSV Terstruktur untuk ${activeSubTab}`}
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            Template CSV
          </button>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-3.5 py-2 rounded-lg font-medium text-sm transition-colors hover:bg-slate-200 dark:bg-white/10"
            title="Ekspor Data ke Excel (.xlsx/.csv), CSV, atau JSON"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Data</span>
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2 bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 shadow-inner px-4 py-2 rounded-lg font-medium text-sm transition-colors hover:bg-emerald-900/60"
          >
            <QrCode className="w-4 h-4" />
            Scan QR
          </button>
          {activeTab !== 'audit' && (
            <button
              onClick={handleAddClick}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Record
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 text-sm bg-black/20 border border-slate-200 dark:border-white/5 rounded-lg p-1 w-fit mb-6 print:hidden">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button aria-pressed={isActive}
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`erp-tab-control flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                isActive
                  ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 shadow-inner"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-700 dark:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white/[0.02] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden flex flex-col md:flex-row min-h-[600px] relative print:border-none print:shadow-none print:bg-transparent print:min-h-0 print:block">
        {/* Left Sidebar / Sub-nav */}
        <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/5 bg-black/20 p-4 print:hidden">
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest mb-3 px-2">
            Categories
          </div>
          <div className="space-y-1">
            {visibleSubTabs.map((sub) => {
              const isActive = activeSubTab === sub;
              return (
                <button
                  key={sub}
                  onClick={() => {
                    setActiveSubTab(sub);
                    setSelectedRecord(null);
                    setCurrentPage(1);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200 shadow-sm "
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {activeTab === "audit" ? (
            <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[#0a0a0a]/50">
              <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-black/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    Activity Logs & Audit Trail (Rekomendasi 3)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Histori mutasi data yayasan, integritas identitas, dan audit operasional sistem.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Cari log / ID / entitas..."
                      value={auditSearchQuery}
                      onChange={(e) => setAuditSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 w-48 sm:w-60"
                    />
                  </div>
                  <button
                    onClick={handleExportAuditLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium transition-colors"
                    title="Ekspor Log Audit ke CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor Log</span>
                  </button>
                </div>
              </div>

              {/* Action Filter Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border-b border-slate-200 dark:border-white/5 bg-black/20">
                <button
                  type="button"
                  onClick={() => setAuditActionFilter("ALL")}
                  className={cn(
                    "p-3 rounded-xl flex flex-col justify-center text-left border transition-all",
                    auditActionFilter === "ALL"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/20"
                      : "bg-slate-100/50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-400"
                  )}
                >
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1 text-slate-400">
                    Semua Aksi
                  </div>
                  <div className="text-xl font-mono font-medium text-slate-200">
                    {auditLogs.length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter("CREATE")}
                  className={cn(
                    "p-3 rounded-xl flex flex-col justify-center text-left border transition-all",
                    auditActionFilter === "CREATE"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/20"
                      : "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40"
                  )}
                >
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-1">
                    Tambah
                  </div>
                  <div className="text-xl font-mono font-medium text-emerald-300">
                    {auditLogs.filter((log) => log.action === "CREATE").length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter("UPDATE")}
                  className={cn(
                    "p-3 rounded-xl flex flex-col justify-center text-left border transition-all",
                    auditActionFilter === "UPDATE"
                      ? "bg-blue-500/20 border-blue-500 text-blue-300 ring-2 ring-blue-500/20"
                      : "bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40"
                  )}
                >
                  <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wider mb-1">
                    Perbarui
                  </div>
                  <div className="text-xl font-mono font-medium text-blue-300">
                    {auditLogs.filter((log) => log.action === "UPDATE").length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter("DELETE")}
                  className={cn(
                    "p-3 rounded-xl flex flex-col justify-center text-left border transition-all",
                    auditActionFilter === "DELETE"
                      ? "bg-red-500/20 border-red-500 text-red-300 ring-2 ring-red-500/20"
                      : "bg-red-500/10 border-red-500/20 hover:border-red-500/40"
                  )}
                >
                  <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider mb-1">
                    Hapus
                  </div>
                  <div className="text-xl font-mono font-medium text-red-300">
                    {auditLogs.filter((log) => log.action === "DELETE").length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter("IMPORT")}
                  className={cn(
                    "p-3 rounded-xl flex flex-col justify-center text-left border transition-all",
                    auditActionFilter === "IMPORT"
                      ? "bg-amber-500/20 border-amber-500 text-amber-300 ring-2 ring-amber-500/20"
                      : "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40"
                  )}
                >
                  <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-1">
                    Impor
                  </div>
                  <div className="text-xl font-mono font-medium text-amber-300">
                    {auditLogs.filter((log) => log.action === "IMPORT").length}
                  </div>
                </button>
              </div>

              {/* Log List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(() => {
                  const filteredLogs = auditLogs.filter((log) => {
                    const matchAction = auditActionFilter === "ALL" || log.action === auditActionFilter;
                    const matchSearch =
                      !auditSearchQuery ||
                      log.recordName.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.recordId.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.entity.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      log.user.toLowerCase().includes(auditSearchQuery.toLowerCase());
                    return matchAction && matchSearch;
                  });

                  if (filteredLogs.length === 0) {
                    return (
                      <div className="text-center py-12 text-slate-500 text-sm">
                        Tidak ada aktivitas yang sesuai dengan kriteria filter audit.
                      </div>
                    );
                  }

                  return filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl p-4 flex items-start gap-4 hover:bg-white/[0.07] transition-colors"
                    >
                      <div
                        className={cn(
                          "p-2.5 rounded-xl shrink-0",
                          log.action === "CREATE"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : log.action === "UPDATE"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : log.action === "DELETE"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                        )}
                      >
                        <Activity className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                              {masterAuditActionLabel(log.action)}
                            </span>
                            <span className="text-[10px] bg-slate-200 dark:bg-white/10 px-2 py-0.5 rounded uppercase font-mono tracking-wider text-slate-400">
                              {log.entity}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />{" "}
                            {new Date(log.timestamp).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {log.user}
                          </span>{" "}
                          menjalankan aksi{" "}
                          <span className="uppercase text-[10px] bg-slate-200 dark:bg-white/10 px-1 py-0.5 rounded tracking-wide font-medium">
                            {masterAuditActionLabel(log.action)}
                          </span>{" "}
                          pada entitas{" "}
                          <span className="text-emerald-400 font-medium">
                            {log.entity}
                          </span>
                        </p>
                        <div className="mt-2 text-xs bg-black/40 border border-slate-200 dark:border-white/5 rounded-lg p-2.5 text-slate-700 dark:text-slate-300 flex items-center justify-between">
                          <div className="truncate">
                            Record:{" "}
                            <span className="font-semibold text-white">
                              {log.recordName}
                            </span>{" "}
                            <span className="text-slate-400 font-mono ml-1.5">
                              ({log.recordId})
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                            Log ID: {log.id}
                          </span>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          ) : activeTab === "booking" ? (
            <React.Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat pemesanan fasilitas…</div>}><LazyFacilityBooking /></React.Suspense>
          ) : (
            <div className="flex-1 flex flex-col h-full print:block">
              <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/10 print:hidden">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <form
                    onSubmit={performAISearch}
                    className="relative w-full sm:w-80 group"
                  >
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`AI Search ${activeSubTab}... (e.g. "enrolled in 2022")`}
                      className="pl-9 pr-10 py-2  rounded-md text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 w-full bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300 transition-all placeholder:text-slate-600"
                    />
                    <button
                      type="submit"
                      disabled={isSearching}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-emerald-500/70 hover:text-emerald-400 disabled:opacity-50 transition-colors"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                  <div className="relative">
                    <button
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className={cn(
                        "p-2 rounded-md flex items-center gap-2 transition-colors",
                        hasActiveFilters
                          ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                      )}
                    >
                      <Filter className="w-4 h-4" />
                      <span className="text-sm font-medium hidden sm:inline">
                        Filter
                      </span>
                      {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      )}
                    </button>
                    {isFilterOpen && (
                      <div className="absolute top-12 left-0 w-80 glass-panel rounded-xl shadow-2xl z-30 p-4 border border-slate-700 bg-slate-900/95 text-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Multi-Facet Filter
                          </span>
                          <button
                            onClick={resetAllFilters}
                            className="text-[11px] text-slate-400 hover:text-emerald-300 transition-colors"
                          >
                            Reset Semua
                          </button>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {["Active", "Inactive", "Alumni", "Suspended"].map((st) => (
                              <label key={st} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-800/60 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={statusFilter.includes(st)}
                                  onChange={() => toggleStatusFilter(st)}
                                  className="accent-emerald-500 rounded border-slate-700"
                                />
                                <span>{st}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Gender Filter (Entities only) */}
                        {activeTab === "entities" && (
                          <div className="space-y-1.5 border-t border-slate-800 pt-2">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Jenis Kelamin</label>
                            <div className="grid grid-cols-3 gap-1.5 text-xs">
                              {(["ALL", "L", "P"] as const).map((g) => (
                                <button
                                  key={g}
                                  type="button"
                                  onClick={() => setGenderFilter(g)}
                                  className={cn(
                                    "py-1 px-2 rounded-lg border text-center transition-colors",
                                    genderFilter === g
                                      ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold"
                                      : "bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800"
                                  )}
                                >
                                  {g === "ALL" ? "Semua" : g === "L" ? "Laki-laki" : "Perempuan"}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Grade / Class Filter */}
                        {activeTab === "entities" && activeSubTab === "Santri" && (
                          <div className="space-y-1.5 border-t border-slate-800 pt-2 text-xs">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kelas / Tingkat</label>
                            <select
                              value={gradeFilter}
                              onChange={(e) => setGradeFilter(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="">Semua Kelas</option>
                              {(dataSources["Kelas"] || DEFAULT_STRUCTURE["Kelas"] || []).map((c: any) => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Dormitory Filter */}
                        {activeTab === "entities" && activeSubTab === "Santri" && (
                          <div className="space-y-1.5 border-t border-slate-800 pt-2 text-xs">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gedung Asrama</label>
                            <select
                              value={dormitoryFilter}
                              onChange={(e) => setDormitoryFilter(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="">Semua Asrama</option>
                              {(dataSources["Gedung"] || DEFAULT_STRUCTURE["Gedung"] || []).map((d: any) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Completeness Filter */}
                        <div className="space-y-1.5 border-t border-slate-800 pt-2 text-xs">
                          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kelengkapan Identitas</label>
                          <select
                            value={completenessFilter}
                            onChange={(e) => setCompletenessFilter(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="ALL">Semua Catatan</option>
                            <option value="WITH_NIK">Memiliki NIK (16-digit)</option>
                            <option value="WITH_WALI">Sudah Terhubung Wali</option>
                            <option value="WITHOUT_WALI">Belum Terhubung Wali</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-xs">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Relasi Terintegrasi (ID-Normalized)</span>
                  </div>
                  <span>
                    Total records:{" "}
                    <span className="font-mono text-emerald-400 text-sm font-bold">
                      {filteredData.length}
                    </span>
                  </span>
                </div>
              </div>

              {/* Rekomendasi 4: Active Filter Chips Bar */}
              {hasActiveFilters && (
                <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 flex-wrap text-xs print:hidden animate-in fade-in duration-150">
                  <span className="text-slate-500 font-medium">Filter Aktif:</span>
                  {statusFilter.map((st) => (
                    <span
                      key={st}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium text-[11px]"
                    >
                      Status: {st}
                      <button onClick={() => toggleStatusFilter(st)} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {genderFilter !== "ALL" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 font-medium text-[11px]">
                      JK: {genderFilter === "L" ? "Laki-laki" : "Perempuan"}
                      <button onClick={() => setGenderFilter("ALL")} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {gradeFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-medium text-[11px]">
                      Kelas: {gradeFilter}
                      <button onClick={() => setGradeFilter("")} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {dormitoryFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium text-[11px]">
                      Asrama: {dormitoryFilter}
                      <button onClick={() => setDormitoryFilter("")} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {completenessFilter !== "ALL" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-medium text-[11px]">
                      {completenessFilter === "WITH_NIK" ? "Ada NIK" : completenessFilter === "WITH_WALI" ? "Ada Wali" : "Belum Ada Wali"}
                      <button onClick={() => setCompletenessFilter("ALL")} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {searchQuery.trim() && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-medium text-[11px]">
                      Cari: "{searchQuery}"
                      <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={resetAllFilters}
                    className="text-xs text-rose-400 hover:text-rose-300 hover:underline ml-1"
                  >
                    Hapus Semua
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-x-auto relative print:hidden">
                {activeSubTab === "Map View" ? (
                  <React.Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat struktur…</div>}><LazyStructureHierarchyD3 /></React.Suspense>
                ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-[#0a0a0a] border-b border-slate-200 dark:border-white/5 text-[10px] text-slate-500 uppercase font-semibold">
                    {renderTableHeaders()}
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    {paginatedData.length > 0 ? (
                      paginatedData.map((row) => renderTableRow(row))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-12 text-center text-slate-500"
                        >
                          No records found for {activeSubTab}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                )}

                {/* Slide-over Profile Panel */}
                {selectedRecord && (
                  <div className="absolute top-0 right-0 h-full w-full max-w-[400px] glass-panel border-l border-slate-200 dark:border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-20 flex flex-col animate-in slide-in-from-right duration-300 print:relative print:w-full print:max-w-none print:shadow-none print:bg-white print:text-black print:border-none print:h-auto print:block">
                    <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 print:hidden">
                      <h3 className="font-medium text-slate-800 dark:text-slate-200">
                        Record Profile
                      </h3>
                      <button
                        onClick={() => setSelectedRecord(null)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 rounded-xl bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-400 shadow-inner">
                            {selectedRecord.name
                              ?.split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .substring(0, 2) ||
                              "ID"}
                          </div>
                          <div>
                            <h2
                              className={cn(
                                "text-xl font-serif text-white",
                                printFields["name"] === false
                                  ? "print:hidden"
                                  : "",
                              )}
                            >
                              {selectedRecord.name}
                            </h2>
                            <div className="text-sm font-mono text-emerald-400 mt-1">
                              {selectedRecord.id}
                            </div>
                            <span
                              className={cn(
                                "inline-block mt-2 px-2 py-0.5 rounded text-[10px] uppercase font-bold border",
                                getStatusColor(selectedRecord.status),
                                printFields["status"] === false
                                  ? "print:hidden"
                                  : "",
                              )}
                            >
                              {selectedRecord.status}
                            </span>
                          </div>
                        </div>
                        {/* QR Code */}
                        <div
                          className={cn(
                            "flex flex-col items-center gap-2",
                            printFields["qrcode"] === false
                              ? "print:hidden hidden"
                              : "block",
                          )}
                        >
                          <div className="p-2 bg-white rounded-xl shrink-0 shadow-sm border border-emerald-500/20">
                            <QRCodeSVG
                              id="qr-code-svg"
                              value={JSON.stringify({
                                id: selectedRecord.id,
                                name: selectedRecord.name,
                              })}
                              size={64}
                              level="M"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 print:hidden">
                            <button
                              onClick={() => downloadQRCode("png")}
                              className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-900/40 px-2 py-1 rounded border border-emerald-500/30"
                            >
                              <Download className="w-3 h-3" /> PNG
                            </button>
                            <button
                              onClick={() => downloadQRCode("svg")}
                              className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-900/40 px-2 py-1 rounded border border-emerald-500/30"
                            >
                              <Download className="w-3 h-3" /> SVG
                            </button>
                          </div>
                        </div>
                      </div>

                      {activeTab === "entities" && activeSubTab === "Santri" ? (
                        <>
                          <div
                            className={cn(
                              "grid grid-cols-2 gap-4",
                              printFields["grade"] === false &&
                                printFields["gender"] === false
                                ? "print:hidden"
                                : "",
                            )}
                          >
                            <div
                              className={cn(
                                "bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5",
                                printFields["grade"] === false
                                  ? "print:hidden"
                                  : "",
                              )}
                            >
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                                Grade
                              </div>
                              <div className="text-sm text-slate-800 dark:text-slate-200">
                                {selectedRecord.grade || "-"}
                              </div>
                            </div>
                            <div
                              className={cn(
                                "bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5",
                                printFields["gender"] === false
                                  ? "print:hidden"
                                  : "",
                              )}
                            >
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                                Gender
                              </div>
                              <div className="text-sm text-slate-800 dark:text-slate-200">
                                {selectedRecord.gender === "L"
                                  ? "Laki-laki"
                                  : selectedRecord.gender === "P"
                                    ? "Perempuan"
                                    : "-"}
                              </div>
                            </div>
                          </div>

                          {/* Identitas Nasional & Sekolah */}
                          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Identitas Resmi
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="text-sm">
                                <span className="block text-[10px] text-slate-500 uppercase">
                                  NIK
                                </span>
                                <span className="font-mono text-emerald-400">
                                  {selectedRecord.nik || "-"}
                                </span>
                              </div>
                              <div className="text-sm">
                                <span className="block text-[10px] text-slate-500 uppercase">
                                  NISN / NIS
                                </span>
                                <span className="font-mono text-emerald-400">
                                  {selectedRecord.nisn || "-"} /{" "}
                                  {selectedRecord.nis || "-"}
                                </span>
                              </div>
                              <div className="text-sm col-span-2">
                                <span className="block text-[10px] text-slate-500 uppercase">
                                  Tempat, Tanggal Lahir
                                </span>
                                <span className="text-slate-800 dark:text-slate-200">
                                  {selectedRecord.pob || "-"},{" "}
                                  {selectedRecord.dob || "-"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Penempatan & Akademik Terakreditasi */}
                          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-emerald-400" />
                                Penempatan & Struktur (Normalized)
                              </h4>
                              <button
                                type="button"
                                onClick={() => {
                                  handleTabChange("structure");
                                  if (selectedRecord.dormitoryId) {
                                    setActiveSubTab("Gedung");
                                  }
                                }}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors"
                              >
                                Lihat Struktur <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-3">
                              <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-200 dark:border-white/5">
                                <span className="text-slate-500 dark:text-slate-400">Kelas / Rombel</span>
                                <div className="text-right">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {selectedRecord.grade || "-"}
                                  </span>
                                  {selectedRecord.classId && (
                                    <span className="ml-1.5 font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                      {selectedRecord.classId}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-200 dark:border-white/5">
                                <span className="text-slate-500 dark:text-slate-400">Asrama & Kamar</span>
                                <div className="text-right">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {selectedRecord.dormitory || "-"}{" "}
                                    <span className="text-slate-500 font-normal">
                                      (Kmr: {selectedRecord.room || "-"})
                                    </span>
                                  </span>
                                  {(selectedRecord.dormitoryId || selectedRecord.roomId) && (
                                    <div className="font-mono text-[10px] text-emerald-400 mt-0.5">
                                      {selectedRecord.dormitoryId && <span>{selectedRecord.dormitoryId}</span>}
                                      {selectedRecord.dormitoryId && selectedRecord.roomId && <span> • </span>}
                                      {selectedRecord.roomId && <span>{selectedRecord.roomId}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-200 dark:border-white/5">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Halaqah Tahfidz
                                </span>
                                <div className="text-right">
                                  <span className="font-medium text-emerald-400">
                                    {selectedRecord.halaqah || "-"}
                                  </span>
                                  {selectedRecord.halaqahId && (
                                    <span className="ml-1.5 font-mono text-[10px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                      {selectedRecord.halaqahId}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Asal Sekolah
                                </span>
                                <span className="text-slate-800 dark:text-slate-200">
                                  {selectedRecord.previousSchool || "-"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Keuangan */}
                          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Info Keuangan Digital
                            </h4>
                            <div className="flex items-center gap-3 p-3 bg-indigo-950/10 border border-indigo-500/20 rounded-xl">
                              <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                <CreditCard className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-[10px] uppercase text-indigo-400/80 font-bold mb-0.5">
                                  Virtual Account / Santri Card
                                </div>
                                <span className="font-mono font-medium text-indigo-300 tracking-wider text-sm">
                                  {selectedRecord.virtualAccount || "-"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Contact & Personal */}
                          <div
                            className={cn(
                              "space-y-4 pt-4 border-t border-slate-200 dark:border-white/5",
                              printFields["phone"] === false &&
                                printFields["address"] === false
                                ? "print:hidden"
                                : "",
                            )}
                          >
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Contact & Personal Details
                            </h4>
                            <div className="space-y-3">
                              <div
                                className={cn(
                                  "flex items-start gap-3 text-sm",
                                  printFields["phone"] === false
                                    ? "print:hidden"
                                    : "",
                                )}
                              >
                                <Phone className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5" />
                                <div>
                                  <div className="text-emerald-400 font-mono">
                                    {selectedRecord.phone || "-"}
                                  </div>
                                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">
                                    Nomor Ponsel
                                  </div>
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "flex items-start gap-3 text-sm",
                                  printFields["address"] === false
                                    ? "print:hidden"
                                    : "",
                                )}
                              >
                                <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5" />
                                <div>
                                  <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                                    {selectedRecord.address || "-"}
                                  </div>
                                  {(selectedRecord.village || selectedRecord.desa || selectedRecord.district || selectedRecord.kecamatan || selectedRecord.regency || selectedRecord.province || selectedRecord.country) && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex gap-2 flex-wrap">
                                      {(selectedRecord.village || selectedRecord.desa) && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.village || selectedRecord.desa}
                                        </span>
                                      )}
                                      {(selectedRecord.district || selectedRecord.kecamatan) && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.district || selectedRecord.kecamatan}
                                        </span>
                                      )}
                                      {selectedRecord.regency && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.regency}
                                        </span>
                                      )}
                                      {selectedRecord.province && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.province}
                                        </span>
                                      )}
                                      {selectedRecord.country && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {COUNTRIES.find(
                                            (c) =>
                                              c.id === selectedRecord.country,
                                          )?.name || selectedRecord.country}
                                        </span>
                                      )}
                                      {selectedRecord.postalCode && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          [{selectedRecord.postalCode}]
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">
                                    Home Address
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Data Wali Santri Terintegrasi */}
                          {(() => {
                            const waliList = dataSources["Wali Santri"] || MOCK_WALISANTRI;
                            const matchedWali = selectedRecord.waliSantriId 
                              ? waliList.find((w) => w.id === selectedRecord.waliSantriId)
                              : waliList.find((w) => w.name?.toLowerCase() === selectedRecord.parentName?.toLowerCase());
                            const isNormalized = Boolean(selectedRecord.waliSantriId || matchedWali);

                            return (
                              <div
                                className={cn(
                                  "space-y-4 pt-4 border-t border-slate-200 dark:border-white/5",
                                  printFields["parentName"] === false &&
                                    printFields["parentPhone"] === false
                                    ? "print:hidden"
                                    : "",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-blue-400" />
                                    Data Wali Santri Terintegrasi
                                  </h4>
                                  {isNormalized ? (
                                    <span className="text-[9px] bg-blue-500/20 text-blue-300 font-mono px-2 py-0.5 rounded flex items-center gap-1">
                                      <ShieldCheck className="w-3 h-3 text-blue-400" /> ID Normalized
                                    </span>
                                  ) : (
                                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                                      Unlinked Plain Text
                                    </span>
                                  )}
                                </div>

                                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {matchedWali?.name || selectedRecord.parentName || "-"}
                                      </div>
                                      {(matchedWali?.id || selectedRecord.waliSantriId) && (
                                        <div className="text-[10px] font-mono text-blue-400 mt-0.5">
                                          ID: {matchedWali?.id || selectedRecord.waliSantriId}
                                        </div>
                                      )}
                                      {matchedWali?.occupation && (
                                        <div className="text-xs text-slate-400 mt-1">
                                          Profesi: <span className="text-slate-300 font-medium">{matchedWali.occupation}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-500/30 px-2 py-1 rounded font-bold uppercase tracking-wider">
                                      Wali / Orang Tua
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 text-sm text-emerald-400 pt-1">
                                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="font-mono">
                                      {matchedWali?.phone || selectedRecord.parentPhone || "-"}
                                    </span>
                                  </div>

                                  {matchedWali ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSubTab("Wali Santri");
                                        setSelectedRecord(matchedWali);
                                      }}
                                      className="w-full mt-2 py-1.5 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white rounded-lg border border-blue-500/30 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                                    >
                                      <span>Buka Profil Lengkap Wali Santri</span>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleEditClick(selectedRecord)}
                                      className="w-full mt-2 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                                    >
                                      <span>Tautkan ke Master Wali Santri</span>
                                      <Link2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Medical */}
                          <div
                            className={cn(
                              "space-y-4 pt-4 border-t border-slate-200 dark:border-white/5",
                              printFields["medical"] === false &&
                                printFields["bloodType"] === false
                                ? "print:hidden"
                                : "",
                            )}
                          >
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Medical History
                            </h4>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <div
                                className={cn(
                                  "flex justify-center items-center gap-2 bg-red-950/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-lg text-sm shrink-0",
                                  printFields["bloodType"] === false
                                    ? "print:hidden"
                                    : "",
                                )}
                              >
                                <HeartPulse className="w-4 h-4" />
                                <span>
                                  Blood:{" "}
                                  <b className="font-mono">
                                    {selectedRecord.bloodType || "-"}
                                  </b>
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "flex-1 bg-black/20 p-2 text-sm text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-white/5",
                                  printFields["medical"] === false
                                    ? "print:hidden"
                                    : "",
                                )}
                              >
                                Riwayat:{" "}
                                <span className="font-medium text-slate-800 dark:text-slate-200 ml-1">
                                  {selectedRecord.medical || "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : activeTab === "entities" &&
                        activeSubTab === "Wali Santri" ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                                Gender
                              </div>
                              <div className="text-sm text-slate-800 dark:text-slate-200">
                                {selectedRecord.gender === "L"
                                  ? "Laki-laki"
                                  : selectedRecord.gender === "P"
                                    ? "Perempuan"
                                    : "-"}
                              </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
                              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                                NIK
                              </div>
                              <div className="text-sm font-mono text-emerald-400">
                                {selectedRecord.nik || "-"}
                              </div>
                            </div>
                          </div>

                          {/* Relasi Santri Terintegrasi */}
                          {(() => {
                            const santriList = dataSources.Santri || MOCK_SANTRI;
                            const linkedStudents = santriList.filter((s) => {
                              if (selectedRecord.santriIds && Array.isArray(selectedRecord.santriIds)) {
                                if (selectedRecord.santriIds.includes(s.id)) return true;
                              }
                              if (s.waliSantriId && s.waliSantriId === selectedRecord.id) return true;
                              if (s.parentName && s.parentName.toLowerCase() === selectedRecord.name?.toLowerCase()) return true;
                              if (selectedRecord.studentName && selectedRecord.studentName.toLowerCase().includes(s.name?.toLowerCase())) return true;
                              return false;
                            });

                            return (
                              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                                    Relasi Anak / Santri Terdaftar
                                  </h4>
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded">
                                    {linkedStudents.length} Santri Terkait
                                  </span>
                                </div>

                                {linkedStudents.length > 0 ? (
                                  <div className="space-y-2.5">
                                    {linkedStudents.map((child) => (
                                      <div
                                        key={child.id}
                                        className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2 hover:border-emerald-500/40 transition-colors"
                                      >
                                        <div className="flex items-start justify-between">
                                          <div>
                                            <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                                              {child.name}
                                            </div>
                                            <div className="text-[10px] font-mono text-emerald-400">
                                              ID: {child.id} • Kelas: {child.grade || "-"}
                                            </div>
                                          </div>
                                          <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded text-slate-400 uppercase font-semibold">
                                            {child.gender === "L" ? "Putra" : "Putri"}
                                          </span>
                                        </div>

                                        {(child.dormitory || child.room) && (
                                          <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                            <Building className="w-3 h-3 text-slate-500" />
                                            <span>{child.dormitory || "Asrama"}</span>
                                            {child.room && <span>(Kmr: {child.room})</span>}
                                          </div>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveSubTab("Santri");
                                            setSelectedRecord(child);
                                          }}
                                          className="w-full mt-1 py-1 px-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white rounded-lg border border-emerald-500/30 text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                        >
                                          <span>Buka Profil Santri</span>
                                          <ArrowRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-4 bg-black/20 rounded-xl border border-dashed border-slate-700 text-center space-y-2">
                                    <p className="text-xs text-slate-400">
                                      Belum ada profil santri yang terhubung dengan ID wali ini.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleEditClick(selectedRecord)}
                                      className="py-1 px-3 bg-emerald-600/20 text-emerald-300 hover:text-white rounded-lg border border-emerald-500/30 text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                                    >
                                      <Link2 className="w-3.5 h-3.5" />
                                      <span>Tautkan Santri Sekarang</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Info Pekerjaan */}
                          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Sosio-Ekonomi & Pendidikan
                            </h4>
                            <div className="bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-3">
                              <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-200 dark:border-white/5">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Profesi / Pekerjaan
                                </span>
                                <span className="text-slate-800 dark:text-slate-200 font-medium">
                                  {selectedRecord.occupation || "-"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm pb-2 border-b border-slate-200 dark:border-white/5">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Pendidikan Terakhir
                                </span>
                                <span className="text-slate-800 dark:text-slate-200">
                                  {selectedRecord.education || "-"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Penghasilan / Bulan
                                </span>
                                <span className="text-emerald-400 font-medium">
                                  {selectedRecord.income || "-"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Kontak */}
                          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                            <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                              Contact Information
                            </h4>
                            <div className="space-y-3">
                              <div className="flex items-start gap-3 text-sm">
                                <Phone className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5" />
                                <div>
                                  <div className="text-emerald-400 font-mono">
                                    {selectedRecord.phone || "-"}
                                  </div>
                                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">
                                    Nomor Ponsel / WhatsApp
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-start gap-3 text-sm">
                                <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5" />
                                <div>
                                  <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                                    {selectedRecord.address || "-"}
                                  </div>
                                  {(selectedRecord.village || selectedRecord.desa || selectedRecord.district || selectedRecord.kecamatan || selectedRecord.regency || selectedRecord.province || selectedRecord.country) && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex gap-2 flex-wrap">
                                      {(selectedRecord.village || selectedRecord.desa) && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.village || selectedRecord.desa}
                                        </span>
                                      )}
                                      {(selectedRecord.district || selectedRecord.kecamatan) && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.district || selectedRecord.kecamatan}
                                        </span>
                                      )}
                                      {selectedRecord.regency && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.regency}
                                        </span>
                                      )}
                                      {selectedRecord.province && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {selectedRecord.province}
                                        </span>
                                      )}
                                      {selectedRecord.country && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          {COUNTRIES.find(
                                            (c) =>
                                              c.id === selectedRecord.country,
                                          )?.name || selectedRecord.country}
                                        </span>
                                      )}
                                      {selectedRecord.postalCode && (
                                        <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                          [{selectedRecord.postalCode}]
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">
                                    Alamat Tempat Tinggal
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : activeTab === "entities" ? (
                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
                          <h4 className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
                            Data Profil {activeSubTab}
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(selectedRecord)
                              .filter(
                                ([k, v]) => !["id", "name", "status", "educations", "certifications", "experiences", "assignments"].includes(k) && !Array.isArray(v) && typeof v !== 'object',
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

                          {/* Special Render for Arrays */}
                          {selectedRecord.assignments && Array.isArray(selectedRecord.assignments) && selectedRecord.assignments.length > 0 && (
                            <div className="mt-4">
                               <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Penempatan Tugas / Roles</div>
                               <div className="space-y-2">
                                  {selectedRecord.assignments.map((assignment: any, i: number) => (
                                     <div key={i} className="bg-slate-50 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/10 text-xs">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{assignment.role} <span className="text-emerald-500 font-medium">@ {assignment.unitId}</span></div>
                                        {assignment.description && <div className="text-slate-500 dark:text-slate-400 mt-0.5">{assignment.description}</div>}
                                     </div>
                                  ))}
                               </div>
                            </div>
                          )}

                          {selectedRecord.educations && Array.isArray(selectedRecord.educations) && selectedRecord.educations.length > 0 && (
                            <div className="mt-4">
                               <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Riwayat Pendidikan</div>
                               <div className="space-y-2">
                                  {selectedRecord.educations.map((edu: any, i: number) => (
                                     <div key={i} className="bg-slate-50 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/10 text-xs">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{edu.level} - {edu.major}</div>
                                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">{edu.institution} {edu.graduationYear ? `(${edu.graduationYear})` : ''}</div>
                                     </div>
                                  ))}
                               </div>
                            </div>
                          )}
                          
                          {selectedRecord.experiences && Array.isArray(selectedRecord.experiences) && selectedRecord.experiences.length > 0 && (
                            <div className="mt-4">
                               <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Work Experiences</div>
                               <div className="space-y-2">
                                  {selectedRecord.experiences.map((exp: any, i: number) => (
                                     <div key={i} className="bg-slate-50 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/10 text-xs">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{exp.role}</div>
                                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">{exp.company} {exp.startDate || exp.endDate ? `(${exp.startDate} - ${exp.endDate})` : ''}</div>
                                     </div>
                                  ))}
                               </div>
                            </div>
                          )}

                          {selectedRecord.certifications && Array.isArray(selectedRecord.certifications) && selectedRecord.certifications.length > 0 && (
                            <div className="mt-4">
                               <div className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Certifications</div>
                               <div className="space-y-2">
                                  {selectedRecord.certifications.map((cert: any, i: number) => (
                                     <div key={i} className="bg-slate-50 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/10 text-xs">
                                        <div className="font-semibold text-slate-800 dark:text-slate-200">{cert.name}</div>
                                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">{cert.institution} {cert.year ? `(${cert.year})` : ''}</div>
                                     </div>
                                  ))}
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
                  Showing {paginatedData.length} of {filteredData.length}{" "}
                  records
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className="px-3 py-1  rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
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
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1  rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    Next
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
                        {key.replace(/([A-Z])/g, " $1").trim()}
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
                Scan QR Code
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
                Preview: {previewDocument.name}
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
                    Simulated Preview Content
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
                Close Preview
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

      {/* Restore Draft Modal */}
      {draftToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Pulihkan Draf Tersimpan?</h3>
                <p className="text-xs text-slate-400">Autosave Form Terdeteksi</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Sistem mendeteksi draf pengisian formulir yang belum sempat tersimpan. Apakah Anda ingin melanjutkan pengisian dari draf tersebut?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const draftKey = getMdmDraftKey(user?.tenantId, user?.uid);
                  if (draftKey) {
                    try { localStorage.removeItem(draftKey); } catch { /* Browser storage is optional. */ }
                  }
                  const mode = draftToRestore.mode;
                  const rec = draftToRestore.record;
                  setDraftToRestore(null);
                  if (mode === "add") {
                    setModalMode("add");
                    const currentData = dataSources[activeSubTab] || [];
                    setFormData({
                      enrolled: new Date().toISOString().split("T")[0],
                      id: generateUniqueId(activeSubTab, currentData),
                    });
                    setIsModalOpen(true);
                  } else if (mode === "edit" && rec) {
                    setModalMode("edit");
                    setEditingId(rec.id);
                    setFormData(rec);
                    setIsModalOpen(true);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
              >
                Buang & Mulai Baru
              </button>
              <button
                type="button"
                onClick={() => {
                  const draftData = draftToRestore.draft;
                  const mode = draftToRestore.mode;
                  const rec = draftToRestore.record;
                  setDraftToRestore(null);
                  setModalMode(mode);
                  setEditingId(mode === "edit" ? (rec?.id || draftData.editingId || null) : null);
                  setFormData(draftData.formData);
                  if (draftData.activeSubTab) setActiveSubTab(draftData.activeSubTab);
                  setIsModalOpen(true);
                  showToast("Draf berhasil dipulihkan.", "success");
                }}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors shadow-lg shadow-amber-900/30 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Pulihkan Draf
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

    </div>
  );
}
