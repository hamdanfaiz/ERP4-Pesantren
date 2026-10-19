import { tenantScopedQuery, tenantRecord } from '../firebaseUtils';
import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Plus,
  PieChart,
  LayoutGrid,
  List,
  MoreVertical,
  BadgeCheck,
  AlertCircle,
  Phone,
  Mail,
  FileText,
  ChevronRight,
  Sparkles,
  Activity,
  Calendar,
  Download,
  GraduationCap,
  Clock,
  Users,
  Bell,
  Send,
  Printer,
  Upload,
  CheckCircle2,
  XCircle,
  X,
  SlidersHorizontal,
  ArrowRight,
  UserCheck,
  RefreshCw,
  Check,
  CreditCard,
  Receipt,
  ShieldCheck,
  BrainCircuit,
  Wallet,
  DollarSign,
  BookOpen,
  MessageSquare,
  Copy,
  ExternalLink,
  Star,
} from "lucide-react";
import { systemSettingsService, SystemSettings } from "../services/systemSettingsService";
import { cn } from "../lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPieChart,
  Pie as RechartsPie,
} from "recharts";
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch, query, where, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../firebaseUtils";
import { PublicRegistrationForm } from "../components/PublicRegistrationForm";
import { RegionSelector } from "../components/RegionSelector";
import { generateMockData } from "../data/mockDataFactory";
import { SocioEconomicForm, SocioEconomicData } from "../components/SocioEconomicForm";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CandidatePDFDocument } from "../components/CandidatePDFCard";
import { PPDBFinanceModal } from "../components/PPDBFinanceModal";
import { PPDBCBTSyncModal } from "../components/PPDBCBTSyncModal";
import { PPDBReceiptModal } from "../components/PPDBReceiptModal";
import { PPDBReligiousAssessmentModal } from "../components/PPDBReligiousAssessmentModal";
import { PPDBOnboardingModal } from "../components/PPDBOnboardingModal";
import { ppdbIntegrationService } from "../services/ppdbIntegrationService";

import { syncCandidatesToMasterData } from "../utils/syncData";
import { Candidate, RegistrationStage } from "../types";
import { useAuth } from "../contexts/AuthContext";

const normalizePpdbIdentity = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized && !["-", "N/A", "NA"].includes(normalized) ? normalized : "";
};

const ppdbIdentityReservationRef = (tenantId: string, kind: string, value: string) =>
  doc(db, "identityReservations", `${encodeURIComponent(tenantId)}_${kind}_${encodeURIComponent(value)}`);

const ppdbRegistrationReservationRef = (tenantId: string, registrationId: string) =>
  doc(db, "ppdbRegistrationReservations", `${encodeURIComponent(tenantId)}_${encodeURIComponent(registrationId.toUpperCase())}`);

const STAGES: RegistrationStage[] = [
  "Registered",
  "Document Review",
  "Entry Exam",
  "Interview",
  "Accepted",
  "Rejected",
];

export function PPDBManager() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<
    "kanban" | "list" | "scheduler" | "interviews"
  >("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(
    systemSettingsService.getSettings()
  );
  useEffect(() => {
    const unsub = systemSettingsService.subscribe((settings) => {
      setSystemSettings(settings);
    });
    return () => unsub();
  }, []);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    title?: string;
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
    title?: string
  ) => {
    setToast({ message, type, title });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const [statusFilter, setStatusFilter] = useState<RegistrationStage | "All">("All");
  const [genderFilter, setGenderFilter] = useState<"All" | "L" | "P">("All");
  const [gradeFilter, setGradeFilter] = useState<string>("All");
  const [syncFilter, setSyncFilter] = useState<"All" | "synced" | "unsynced">("All");
  const [scoreFilter, setScoreFilter] = useState<"All" | "passed" | "below" | "unscored">("All");
  const [paymentFilter, setPaymentFilter] = useState<
    "All" | "paid_reg" | "unpaid_reg" | "paid_tuition" | "verification"
  >("All");

  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [isCBTSyncOpen, setIsCBTSyncOpen] = useState(false);
  const [receiptCandidate, setReceiptCandidate] = useState<Candidate | null>(null);
  const [receiptPaymentType, setReceiptPaymentType] = useState<"registration" | "tuition">("registration");
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const handleOpenReceipt = (candidate: Candidate, paymentType: "registration" | "tuition") => {
    setReceiptCandidate(candidate);
    setReceiptPaymentType(paymentType);
    setIsReceiptModalOpen(true);
  };

  const [religiousCandidate, setReligiousCandidate] = useState<Candidate | null>(null);
  const [isReligiousModalOpen, setIsReligiousModalOpen] = useState(false);

  const handleOpenReligiousAssessment = (candidate: Candidate) => {
    setReligiousCandidate(candidate);
    setIsReligiousModalOpen(true);
  };

  const [onboardingCandidate, setOnboardingCandidate] = useState<Candidate | null>(null);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const handleOpenOnboarding = (candidate: Candidate) => {
    setOnboardingCandidate(candidate);
    setIsOnboardingModalOpen(true);
  };

  const [waPreviewData, setWaPreviewData] = useState<{
    candidate: Candidate;
    slot: { label: string; interviewer: string };
    waUrl: string;
    message: string;
  } | null>(null);

  const [isQuickSyncingCBT, setIsQuickSyncingCBT] = useState(false);
  const handleQuickSyncCBT = async () => {
    setIsQuickSyncingCBT(true);
    try {
      const { updatedCount, passedCount } = await ppdbIntegrationService.autoSyncCBTResults(candidates);
      showToast(
        `Otomatis menyinkronkan ${updatedCount} nilai CBT langsung ke data kandidat PPDB (${passedCount} Lulus KKM ≥ 75)!`,
        "success",
        "Sinkronisasi Otomatis CBT Berhasil"
      );
    } catch (err) {
      console.error(err);
      showToast("Gagal melakukan sinkronisasi otomatis dari CBT.", "error");
    } finally {
      setIsQuickSyncingCBT(false);
    }
  };

  const handleSendWhatsAppInterview = async (
    candidate: Candidate,
    slot: { label: string; interviewer: string }
  ) => {
    try {
      const { waUrl } = ppdbIntegrationService.generateWhatsAppInterviewInvitation(
        candidate,
        slot,
        systemSettings?.orgInfo?.schoolName || "Pesantren Modern Al-Hikmah"
      );
      window.open(waUrl, "_blank", "noopener,noreferrer");
      await updateDoc(doc(db, "candidates", candidate.id), {
        interviewNotified: true,
        interviewNotifiedAt: new Date().toISOString(),
      });
      showToast(
        `Undangan wawancara untuk ${candidate.name} via WhatsApp berhasil dibuka! Status dinotifikasi.`,
        "success",
        "WhatsApp Terkirim"
      );
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim undangan WhatsApp.", "error");
    }
  };

  const [isSmartAllocateOpen, setIsSmartAllocateOpen] = useState(false);
  const [smartTab, setSmartTab] = useState<"promote" | "schedule" | "quota">("promote");
  const [smartPromoteSource, setSmartPromoteSource] = useState<RegistrationStage>("Entry Exam");
  const [smartPromoteTarget, setSmartPromoteTarget] = useState<RegistrationStage>("Interview");
  const [smartMinScore, setSmartMinScore] = useState<number>(75);
  const [smartScheduleDate, setSmartScheduleDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [smartScheduleSession, setSmartScheduleSession] = useState<string>("Sesi Pagi (08:00 - 10:00)");
  const [smartScheduleRoom, setSmartScheduleRoom] = useState<string>("Ruang CBT 1 (Lab Komputer)");
  const [smartScheduleQuota, setSmartScheduleQuota] = useState<number>(20);
  const [isExecutingSmart, setIsExecutingSmart] = useState(false);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  
  useEffect(() => {
    if (!user?.tenantId) {
      setCandidates([]);
      return;
    }
    const candidatesQuery = query(
      collection(db, "candidates"),
      where("tenantId", "==", user.tenantId)
    );
    const unsub = onSnapshot(candidatesQuery, (snap) => {
      const result: Candidate[] = [];
      snap.forEach((docSnap) => {
        result.push({ id: docSnap.id, ...docSnap.data() } as Candidate);
      });
      setCandidates(result);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "candidates");
    });
    return () => unsub();
  }, [user?.tenantId]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPublicPortalOpen, setIsPublicPortalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Candidate>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionStage, setBulkActionStage] = useState<
    RegistrationStage | ""
  >("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<Record<string, string>>({});

  const [printCandidate, setPrintCandidate] = useState<Candidate | null>(null);
  const [printType, setPrintType] = useState<"kartu" | "hasil" | null>(null);

  const handlePrint = (candidate: Candidate, type: "kartu" | "hasil") => {
    setPrintCandidate(candidate);
    setPrintType(type);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setPrintCandidate(null);
        setPrintType(null);
      }, 500);
    }, 100);
  };
  const [error, setError] = useState<string | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncToMasterData = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const acceptedCandidates = candidates.filter(c => c.stage === "Accepted" && !c.syncToMasterData);
      if (acceptedCandidates.length === 0) {
        showToast("Tidak ada calon santri berstatus Diterima yang belum disinkronkan.", "info", "Sinkronisasi Master Data");
        setIsSyncing(false);
        return;
      }
      
      const results = await syncCandidatesToMasterData(acceptedCandidates, user?.tenantId || "");
      
      if (results.errors > 0) {
        showToast(`Berhasil menyinkronkan ${results.success} santri, tetapi ${results.errors} gagal.`, "info", "Sebagian Berhasil");
      } else {
        showToast(`Berhasil menyinkronkan ${results.success} santri baru ke Master Data!`, "success", "Sinkronisasi Berhasil");
      }
    } catch (e: any) {
      console.error(e);
      setError("Gagal menyinkronkan ke Master Data.");
      showToast("Gagal menyinkronkan data ke Master Data.", "error", "Gagal");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInjectDemoData = async () => {
    setIsInjecting(true);
    try {
      const mockData = generateMockData();
      const mockCandidates = mockData.candidates;
      let batch = writeBatch(db);
      let count = 0;
      for (const record of mockCandidates) {
        batch.set(doc(db, "candidates", record.id), tenantRecord(user?.tenantId, record));
        count++;
        if (count % 450 === 0) {
           await batch.commit();
           batch = writeBatch(db);
        }
      }
      if (count % 450 !== 0) {
        await batch.commit();
      }
      showToast("Berhasil memuat 20 calon santri simulasi demo!", "success", "Simulasi Data PPDB");
    } catch (e) {
      console.error(e);
      showToast("Gagal memuat data simulasi calon santri.", "error", "Gagal");
    } finally {
      setIsInjecting(false);
    }
  };

  // Smart Allocate Handlers
  const handleExecuteSmartPromote = async () => {
    const eligible = candidates.filter(
      (c) => c.stage === smartPromoteSource && (c.score || 0) >= smartMinScore
    );
    if (eligible.length === 0) {
      showToast(
        `Tidak ada calon di tahap ${smartPromoteSource} dengan nilai ≥ ${smartMinScore}.`,
        "info",
        "Smart Promotion"
      );
      return;
    }

    setIsExecutingSmart(true);
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const c of eligible) {
        batch.update(doc(db, "candidates", c.id), {
          stage: smartPromoteTarget,
          notes: (c.notes ? c.notes + " | " : "") + `Auto-Promoted: Nilai ${c.score || 0} ≥ KKM ${smartMinScore}`,
        });
        count++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 450 !== 0) {
        await batch.commit();
      }
      showToast(
        `Berhasil mempromosikan ${eligible.length} calon santri ke tahap ${smartPromoteTarget}!`,
        "success",
        "Promosi Otomatis Selesai"
      );
      setIsSmartAllocateOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Gagal menjalankan promosi otomatis.", "error");
    } finally {
      setIsExecutingSmart(false);
    }
  };

  const handleExecuteSmartSchedule = async () => {
    const unscheduled = candidates.filter(
      (c) =>
        (c.stage === "Registered" || c.stage === "Document Review" || c.stage === "Entry Exam") &&
        !c.examSlot
    );

    if (unscheduled.length === 0) {
      showToast(
        "Semua calon santri pada tahap seleksi telah memiliki jadwal ujian.",
        "info",
        "Penjadwalan Otomatis"
      );
      return;
    }

    const toSchedule = unscheduled.slice(0, smartScheduleQuota);
    setIsExecutingSmart(true);
    try {
      const slotDesc = `${smartScheduleDate} • ${smartScheduleSession} • ${smartScheduleRoom}`;
      let batch = writeBatch(db);
      let count = 0;
      for (const c of toSchedule) {
        batch.update(doc(db, "candidates", c.id), {
          examSlot: slotDesc,
          stage: c.stage === "Registered" ? "Document Review" : c.stage,
        });
        count++;
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 450 !== 0) {
        await batch.commit();
      }
      showToast(
        `Berhasil mengalokasikan jadwal ujian untuk ${toSchedule.length} calon santri!`,
        "success",
        "Alokasi Jadwal Selesai"
      );
      setIsSmartAllocateOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Gagal mengalokasikan jadwal ujian.", "error");
    } finally {
      setIsExecutingSmart(false);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("All");
    setGenderFilter("All");
    setGradeFilter("All");
    setSyncFilter("All");
    setScoreFilter("All");
    setPaymentFilter("All");
  };

  const hasActiveFilters =
    searchQuery !== "" ||
    statusFilter !== "All" ||
    genderFilter !== "All" ||
    gradeFilter !== "All" ||
    syncFilter !== "All" ||
    scoreFilter !== "All" ||
    paymentFilter !== "All";

  const filteredCandidates = candidates.filter((c) => {
    const matchStatus = statusFilter === "All" || c.stage === statusFilter;
    const matchSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.registrationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.previousSchool && c.previousSchool.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.phone && c.phone.includes(searchQuery));
    const matchGender = genderFilter === "All" || c.gender === genderFilter;
    const matchGrade = gradeFilter === "All" || c.grade === gradeFilter;
    const matchSync =
      syncFilter === "All" ||
      (syncFilter === "synced" ? !!c.syncToMasterData : !c.syncToMasterData);
    const matchScore =
      scoreFilter === "All" ||
      (scoreFilter === "passed" && (c.score || 0) >= 75) ||
      (scoreFilter === "below" && (c.score || 0) < 75 && (c.score || 0) > 0) ||
      (scoreFilter === "unscored" && (!c.score || c.score === 0));
    const matchPayment =
      paymentFilter === "All" ||
      (paymentFilter === "paid_reg" && c.payment?.registrationFee?.status === "Paid") ||
      (paymentFilter === "unpaid_reg" && (!c.payment?.registrationFee || c.payment.registrationFee.status === "Unpaid")) ||
      (paymentFilter === "paid_tuition" && c.payment?.tuitionFee?.status === "Paid") ||
      (paymentFilter === "verification" &&
        (c.payment?.registrationFee?.status === "Verification" || c.payment?.tuitionFee?.status === "Verification"));

    return matchStatus && matchSearch && matchGender && matchGrade && matchSync && matchScore && matchPayment;
  });

  const allSelected =
    filteredCandidates.length > 0 &&
    selectedIds.length === filteredCandidates.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCandidates.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string, e: React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleBulkUpdate = () => {
    if (!bulkActionStage) return;

    if (bulkActionStage === "Entry Exam") {
      const invalidCandidates = candidates.filter(
        (c) =>
          selectedIds.includes(c.id) &&
          (!c.documents ||
            !c.documents.kk ||
            !c.documents.birthCertificate ||
            !c.documents.reportCards),
      );

      if (invalidCandidates.length > 0) {
        setError(
          `Cannot move ${invalidCandidates.length} candidate(s) to Entry Exam. They must complete the Document Checklist first.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    if (bulkActionStage === "Interview") {
      const invalidCandidates = candidates.filter(
        (c) => selectedIds.includes(c.id) && !c.examScores,
      );
      if (invalidCandidates.length > 0) {
        setError(
          `Cannot move ${invalidCandidates.length} candidate(s) to Interview. They must complete the Entry Exam Scoring first.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    if (bulkActionStage === "Accepted") {
      const invalidCandidates = candidates.filter(
        (c) =>
          selectedIds.includes(c.id) &&
          (!["Interview", "Accepted"].includes(c.stage) || !c.interviewScores),
      );

      if (invalidCandidates.length > 0) {
        setError(
          `Cannot accept ${invalidCandidates.length} candidate(s). They must complete Document Review, Entry Exam, and Interview Evaluation first.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    Promise.all(selectedIds.map(id => updateDoc(doc(db, "candidates", id), { stage: bulkActionStage })))
    .catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
    setSelectedIds([]);
    setBulkActionStage("");
  };

  const handleBulkExportCsv = () => {
    const selectedCandidates = candidates.filter((c) =>
      selectedIds.includes(c.id),
    );
    if (selectedCandidates.length === 0) return;

    const headers = [
      "Registration ID",
      "Name",
      "Previous School",
      "Grade",
      "Phone",
      "Stage",
      "Date Applied",
      "Score",
    ];
    const csvContent = [
      headers.join(","),
      ...selectedCandidates.map((c) =>
        [
          c.registrationId,
          `"${c.name}"`,
          `"${c.previousSchool}"`,
          c.grade,
          `"${c.phone}"`,
          c.stage,
          c.dateApplied,
          c.score || "",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ppdb_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStage: RegistrationStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;

    if (targetStage === "Entry Exam") {
      if (
        !candidate.documents ||
        !candidate.documents.kk ||
        !candidate.documents.birthCertificate ||
        !candidate.documents.reportCards
      ) {
        setError(
          `${candidate.name} cannot be moved to Entry Exam without completing the Document Checklist.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    if (targetStage === "Interview") {
      if (!candidate.examScores) {
        setError(
          `${candidate.name} cannot be moved to Interview without completing the Entry Exam Scoring.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    if (targetStage === "Accepted") {
      const allowedPreviousStages = ["Interview", "Accepted"];
      if (!allowedPreviousStages.includes(candidate.stage)) {
        setError(
          `${candidate.name} cannot be Accepted yet. They must complete prior stages first.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (!candidate.interviewScores) {
        setError(
          `${candidate.name} cannot be Accepted without completing the Interview Evaluation.`,
        );
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    updateDoc(doc(db, "candidates", id), { stage: targetStage }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
  };

  const handleCandidateDocumentUpload = (
    candidateId: string,
    docKey: string,
    file: File | null,
  ) => {
    if (!file) return;

    // Simulate upload process and mark as complete
    setTimeout(() => {
        candidates.map((c) => {
          if (c.id === candidateId) {
            updateDoc(doc(db, "candidates", candidateId), { 
              documents: {
                ...(c.documents || {
                  kk: false,
                  birthCertificate: false,
                  reportCards: false,
                  ijazah: false,
                  skhun: false,
                  pasPhoto: false,
                }),
                [docKey]: true,
              }
            }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
            const updatedDocs = {
              ...(c.documents || {
                kk: false,
                birthCertificate: false,
                reportCards: false,
                ijazah: false,
                skhun: false,
                pasPhoto: false,
              }),
              [docKey]: true,
            };

            // Validate all required fields
            const requiredBase =
              c.name &&
              c.nik &&
              c.phone &&
              c.grade &&
              c.address &&
              c.pob &&
              c.dob;
            const requiredDocs =
              updatedDocs.kk &&
              updatedDocs.birthCertificate &&
              updatedDocs.reportCards &&
              updatedDocs.pasPhoto;

            let newNotes = c.notes || "";
            if (
              requiredBase &&
              requiredDocs &&
              !newNotes.includes("✓ Document checklist verified complete")
            ) {
              newNotes =
                newNotes +
                "\n\n✓ Document checklist verified complete upon successful upload.";
            }

            // we only updated docs in the first step as simplified, to avoid complex merge we will just update everything:
            updateDoc(doc(db, "candidates", candidateId), { documents: updatedDocs, notes: newNotes })
            .catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
          }
        });
    }, 400);
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Full Name is required";
    if (!formData.registrationId?.trim()) errors.registrationId = "Registration ID is required";
    if (!formData.nik?.trim()) errors.nik = "NIK is required";
    if (!formData.pob?.trim()) errors.pob = "Place of Birth is required";
    if (!formData.dob?.trim()) errors.dob = "Date of Birth is required";
    if (!formData.phone?.trim()) errors.phone = "Phone Number is required";
    if (!formData.grade?.trim()) errors.grade = "Grade is required";
    if (!formData.previousSchool?.trim()) errors.previousSchool = "Previous School is required";
    if (!formData.address?.trim()) errors.address = "Address is required";
    if (!formData.fatherName?.trim()) errors.fatherName = "Father's Name is required";
    if (!formData.motherName?.trim()) errors.motherName = "Mother's Name is required";
    if (!formData.whatsappPhone?.trim()) errors.whatsappPhone = "WhatsApp Phone is required";
    if (!formData.documents?.kk) errors.kk = "Kartu Keluarga (KK) file is required";
    if (!formData.documents?.birthCertificate) errors.birthCertificate = "Akta Kelahiran file is required";
    if (!formData.documents?.pasPhoto) errors.pasPhoto = "Pas Photo file is required";

    const registrationId = normalizePpdbIdentity(formData.registrationId);
    const nik = normalizePpdbIdentity(formData.nik).replace(/\D/g, "");
    const nisn = normalizePpdbIdentity(formData.nisn).replace(/\D/g, "");
    if (registrationId.length > 60) errors.registrationId = "Registration ID maksimal 60 karakter";
    if (!/^\d{16}$/.test(nik)) errors.nik = "NIK harus terdiri dari 16 digit";
    if (nisn && !/^\d{10}$/.test(nisn)) errors.nisn = "NISN harus terdiri dari 10 digit";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (!user?.tenantId) {
      showToast("Akun Anda belum terhubung ke tenant pesantren.", "error");
      return;
    }
    setFormErrors({});

    const newCandidate = {
      tenantId: user.tenantId, registrationId, name: formData.name!.trim(),
      previousSchool: formData.previousSchool!.trim(), grade: formData.grade!.trim(),
      phone: formData.phone!.trim(), nik, nisn, pob: formData.pob!.trim(), dob: formData.dob!.trim(),
      email: formData.email?.trim() || "", address: formData.address!.trim(),
      province: formData.province || "", regency: formData.regency || "",
      district: formData.district || "", village: formData.village || "",
      gender: (formData.gender as "L" | "P") || "L",
      fatherName: formData.fatherName!.trim(), motherName: formData.motherName!.trim(),
      fatherJob: formData.fatherJob || "", motherJob: formData.motherJob || "",
      fatherEducation: formData.fatherEducation || "", motherEducation: formData.motherEducation || "",
      familyIncome: formData.familyIncome || "", whatsappPhone: formData.whatsappPhone!.trim(),
      stage: formData.stage || "Registered", dateApplied: new Date().toISOString().split("T")[0],
      score: 0, syncToMasterData: false,
      documents: { kk: !!formData.documents?.kk, birthCertificate: !!formData.documents?.birthCertificate,
        reportCards: !!formData.documents?.reportCards, ijazah: !!formData.documents?.ijazah,
        skhun: !!formData.documents?.skhun, pasPhoto: !!formData.documents?.pasPhoto },
    };
    const candidateRef = doc(collection(db, "candidates"));
    const registrationRef = ppdbRegistrationReservationRef(user.tenantId, registrationId);
    const identityValues = [{ kind: "nik", value: nik }, ...(nisn ? [{ kind: "nisn", value: nisn }] : [])];
    const legacyQueries = [
      query(collection(db, "candidates"), where("tenantId", "==", user.tenantId), where("registrationId", "==", registrationId)),
      ...identityValues.map(({ kind, value }) => query(collection(db, "candidates"), where("tenantId", "==", user.tenantId), where(kind, "==", value))),
    ];

    try {
      await runTransaction(db, async (transaction) => {
        const [registrationSnapshot, identitySnapshots, legacySnapshots] = await Promise.all([
          transaction.get(registrationRef),
          Promise.all(identityValues.map(({ kind, value }) => transaction.get(ppdbIdentityReservationRef(user.tenantId, kind, value)))),
          Promise.all(legacyQueries.map((candidateQuery) => transaction.get(candidateQuery))),
        ]);
        if (registrationSnapshot.exists() || legacySnapshots[0].docs.length > 0) {
          throw new Error("Registration ID " + registrationId + " sudah digunakan pada tenant ini.");
        }
        identityValues.forEach((item, index) => {
          if (identitySnapshots[index].exists() || legacySnapshots[index + 1].docs.length > 0) {
            throw new Error(item.kind.toUpperCase() + " " + item.value + " sudah terdaftar pada tenant ini.");
          }
        });
        transaction.set(candidateRef, tenantRecord(user.tenantId, newCandidate));
        transaction.set(registrationRef, { tenantId: user.tenantId, registrationId, candidateId: candidateRef.id, createdAt: new Date().toISOString() });
        identityValues.forEach(({ kind, value }) => transaction.set(ppdbIdentityReservationRef(user.tenantId, kind, value), {
          tenantId: user.tenantId, kind, value, ownerId: candidateRef.id, recordId: candidateRef.id,
          source: "ppdb", createdAt: new Date().toISOString(),
        }));
      });
      setIsModalOpen(false);
      setFormData({});
      showToast("Pendaftaran " + newCandidate.name + " (" + registrationId + ") berhasil disimpan.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "Gagal menyimpan kandidat secara aman. Muat ulang lalu coba lagi.", "error");
    }
  };

  const getStageColor = (stage: RegistrationStage) => {
    switch (stage) {
      case "Registered":
        return "bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30";
      case "Document Review":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "Entry Exam":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "Interview":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "Accepted":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "Rejected":
        return "bg-red-500/20 text-red-400 border-red-500/30";
    }
  };

  const GRADES = ["TK", "SD", "SMP", "SMA", "University", "LTQ"];

  const getStageColorHex = (stage: string) => {
    switch (stage) {
      case "Registered":
        return "#64748b"; // slate-500
      case "Document Review":
        return "#3b82f6"; // blue-500
      case "Entry Exam":
        return "#f59e0b"; // amber-500
      case "Interview":
        return "#a855f7"; // purple-500
      case "Accepted":
        return "#10b981"; // emerald-500
      case "Rejected":
        return "#ef4444"; // red-500
      default:
        return "#64748b";
    }
  };

  const handleSchedulerDrop = (
    e: React.DragEvent,
    slot: string | undefined,
  ) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    updateDoc(doc(db, "candidates", id), { examSlot: slot || null }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
  };

  const ExamScheduler = () => {
    const examCandidates = candidates.filter((c) => c.stage === "Entry Exam");
    const unassigned = examCandidates.filter((c) => !c.examSlot);

    const timeSlots = [
      { id: "session-1", label: "Gelombang 1 - Sesi 1 (08:00 - 10:00)", capacity: 25 },
      { id: "session-2", label: "Gelombang 1 - Sesi 2 (10:30 - 12:30)", capacity: 25 },
      { id: "session-3", label: "Gelombang 2 - Sesi 1 (08:00 - 10:00)", capacity: 25 },
      { id: "session-4", label: "Gelombang 2 - Sesi 2 (10:30 - 12:30)", capacity: 25 },
    ];

    return (
      <div className="flex flex-col lg:flex-row gap-6">
        <div
          className="w-full lg:w-1/3 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col h-[600px]"
          onDragOver={handleDragOver}
          onDrop={(e) => handleSchedulerDrop(e, undefined)}
        >
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <h3 className="font-medium text-slate-800 dark:text-slate-200">
                Unscheduled Candidates
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Drag to schedule ({unassigned.length})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  let updated = [...candidates];
                  timeSlots.forEach((slot) => {
                    let available =
                      slot.capacity -
                      updated.filter(
                        (c) =>
                          c.stage === "Entry Exam" && c.examSlot === slot.id,
                      ).length;
                    while (available > 0) {
                      const cIndex = updated.findIndex(
                        (c) => c.stage === "Entry Exam" && !c.examSlot,
                      );
                      if (cIndex === -1) break;
                      updated[cIndex] = {
                        ...updated[cIndex],
                        examSlot: slot.id,
                      };
                      available--;
                    }
                  });
                  updated.forEach(c => { if(c.examSlot) updateDoc(doc(db, "candidates", c.id), { examSlot: c.examSlot }).catch(console.error); });
                }}
                disabled={unassigned.length === 0}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-amber-500/20"
              >
                Auto Assign
              </button>
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 hidden sm:block">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {unassigned.map((candidate) => (
              <div
                key={candidate.id}
                draggable
                onDragStart={(e) => handleDragStart(e, candidate.id)}
                className="glass-panel p-3 rounded-lg border border-slate-200 dark:border-white/5 hover:border-amber-500/30 transition-all cursor-grab active:cursor-grabbing group"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs font-mono text-amber-400/80 mb-1">
                      {candidate.registrationId}
                    </div>
                    <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-amber-400 transition-colors">
                      {candidate.name}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-3">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {candidate.grade} • {candidate.previousSchool}
                </div>
              </div>
            ))}
            {unassigned.length === 0 && (
              <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-lg text-sm text-slate-500">
                All candidates scheduled
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-2/3 flex flex-col gap-4">
          {timeSlots.map((slot) => {
            const slotCandidates = examCandidates.filter(
              (c) => c.examSlot === slot.id,
            );
            const isFull = slotCandidates.length >= slot.capacity;

            return (
              <div
                key={slot.id}
                className="bg-slate-50 dark:bg-[#0a0a0a]  rounded-xl overflow-hidden flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleSchedulerDrop(e, slot.id)}
              >
                <div className="bg-black/40 p-3 sm:px-4 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                        {slot.label}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Room A-101 • Main Building
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isFull ? "bg-red-500" : "bg-emerald-500",
                        )}
                        style={{
                          width: `${(slotCandidates.length / slot.capacity) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 min-w-[50px] text-right">
                      {slotCandidates.length} / {slot.capacity}
                    </span>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 min-h-[120px]">
                  {slotCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, candidate.id)}
                      className="bg-slate-100 dark:bg-white/5  p-2.5 rounded-lg flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-slate-200 dark:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-6 h-6 rounded bg-emerald-900/50 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">
                          {candidate.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {candidate.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {candidate.grade}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleSchedulerDrop(
                            {
                              preventDefault: () => {},
                              dataTransfer: { getData: () => candidate.id },
                            } as any,
                            undefined,
                          )
                        }
                        className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-100 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Remove from slot"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {slotCandidates.length === 0 && (
                    <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-500 py-4 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-lg bg-black/20">
                      <span className="text-sm">Drag candidates here</span>
                      <span className="text-xs mt-1">
                        Or click 'Auto Assign'
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleInterviewSchedulerDrop = (
    e: React.DragEvent,
    slot: string | undefined,
  ) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    updateDoc(doc(db, "candidates", id), { interviewSlot: slot || null }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
  };

  const InterviewScheduler = () => {
    const interviewCandidates = candidates.filter(
      (c) => c.stage === "Interview",
    );
    const unassigned = interviewCandidates.filter((c) => !c.interviewSlot);
    const assignedButNotNotified = interviewCandidates.filter(
      (c) => c.interviewSlot && !c.interviewNotified,
    );

    const timeSlots = [
      {
        id: "int-1",
        label: "08:30 - 10:00 WIB (Sesi 1)",
        interviewer: "Ust. M. Ridwan Al-Hafidz (Tahfidz & Al-Qur'an)",
        capacity: 5,
      },
      {
        id: "int-2",
        label: "10:30 - 12:00 WIB (Sesi 2)",
        interviewer: "Ust. Ahmad Fauzan, Lc. (Wawancara & Kepribadian)",
        capacity: 5,
      },
      {
        id: "int-3",
        label: "13:30 - 15:00 WIB (Sesi 3)",
        interviewer: "Usth. Siti Khadijah, M.Pd. (Praktik Ibadah & Doa)",
        capacity: 5,
      },
    ];

    return (
      <div className="flex flex-col lg:flex-row gap-6">
        <div
          className="w-full lg:w-1/3 bg-slate-50 dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/5 rounded-xl p-4 flex flex-col h-[600px]"
          onDragOver={handleDragOver}
          onDrop={(e) => handleInterviewSchedulerDrop(e, undefined)}
        >
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <h3 className="font-medium text-slate-800 dark:text-slate-200">Pending Interviews</h3>
              <p className="text-xs text-slate-500 mt-1">
                Ready to schedule ({unassigned.length})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  let updated = [...candidates];
                  timeSlots.forEach((slot) => {
                    let available =
                      slot.capacity -
                      updated.filter(
                        (c) =>
                          c.stage === "Interview" &&
                          c.interviewSlot === slot.id,
                      ).length;
                    while (available > 0) {
                      const cIndex = updated.findIndex(
                        (c) => c.stage === "Interview" && !c.interviewSlot,
                      );
                      if (cIndex === -1) break;
                      updated[cIndex] = {
                        ...updated[cIndex],
                        interviewSlot: slot.id,
                      };
                      available--;
                    }
                  });
                  updated.forEach(c => { if(c.interviewSlot) updateDoc(doc(db, "candidates", c.id), { interviewSlot: c.interviewSlot }).catch(console.error); });
                }}
                disabled={unassigned.length === 0}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-purple-500/20"
              >
                Auto Assign
              </button>
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500 hidden sm:block">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {unassigned.map((candidate) => (
              <div
                key={candidate.id}
                draggable
                onDragStart={(e) => handleDragStart(e, candidate.id)}
                className="glass-panel p-3 rounded-lg border border-slate-200 dark:border-white/5 hover:border-purple-500/30 transition-all cursor-grab active:cursor-grabbing group"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-xs font-mono text-purple-400/80 mb-1">
                      {candidate.registrationId}
                    </div>
                    <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-purple-400 transition-colors">
                      {candidate.name}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-3">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {candidate.grade} • {candidate.previousSchool}
                </div>
              </div>
            ))}
            {unassigned.length === 0 && (
              <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-lg text-sm text-slate-500">
                All scheduled
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-2/3 flex flex-col gap-4">
          <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-purple-300">
                Pending Notifications
              </h4>
              <p className="text-xs text-purple-400/70 mt-1">
                {assignedButNotNotified.length} candidates need to be informed
                of their slot details.
              </p>
            </div>
            <button
              onClick={() => {
                candidates.forEach(c => {
                  if (c.stage === "Interview" && c.interviewSlot && !c.interviewNotified) {
                    updateDoc(doc(db, "candidates", c.id), { interviewNotified: true }).catch(console.error);
                  }
                });
              }}
              disabled={assignedButNotNotified.length === 0}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              Notify{" "}
              {assignedButNotNotified.length > 0
                ? `(${assignedButNotNotified.length})`
                : ""}
            </button>
          </div>

          {timeSlots.map((slot) => {
            const slotCandidates = interviewCandidates.filter(
              (c) => c.interviewSlot === slot.id,
            );
            const isFull = slotCandidates.length >= slot.capacity;

            return (
              <div
                key={slot.id}
                className="bg-slate-50 dark:bg-[#0a0a0a]  rounded-xl overflow-hidden flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleInterviewSchedulerDrop(e, slot.id)}
              >
                <div className="bg-black/40 p-3 sm:px-4 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                        {slot.label}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Interviewer: {slot.interviewer}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isFull ? "bg-red-500" : "bg-purple-500",
                        )}
                        style={{
                          width: `${(slotCandidates.length / slot.capacity) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 min-w-[50px] text-right">
                      {slotCandidates.length} / {slot.capacity}
                    </span>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 min-h-[120px]">
                  {slotCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, candidate.id)}
                      className={cn(
                        "bg-slate-900/90 border p-3 rounded-xl flex flex-col justify-between gap-2.5 group cursor-grab active:cursor-grabbing hover:border-purple-500/40 transition-all shadow-sm",
                        candidate.interviewNotified
                          ? "border-emerald-500/30 bg-emerald-950/10"
                          : "border-slate-800",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0",
                              candidate.interviewNotified
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-purple-900/50 text-purple-300 border border-purple-500/20",
                            )}
                          >
                            {candidate.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                              {candidate.name}
                              {candidate.interviewNotified && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono flex items-center gap-0.5" title="Sudah ternotifikasi">
                                  <Check className="w-2.5 h-2.5" /> WA
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {candidate.registrationId} • {candidate.grade}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleInterviewSchedulerDrop(
                              {
                                preventDefault: () => {},
                                dataTransfer: { getData: () => candidate.id },
                              } as any,
                              undefined,
                            )
                          }
                          className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-800 opacity-60 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                          title="Hapus dari slot wawancara"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Action buttons on candidate card: WhatsApp & Tahfidz */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80">
                        {/* WhatsApp direct send & preview */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendWhatsAppInterview(candidate, slot);
                            }}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer",
                              candidate.interviewNotified
                                ? "bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                            )}
                            title="Kirim Undangan Wawancara via WhatsApp (wa.me)"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>{candidate.interviewNotified ? "WA Terkirim" : "Kirim WA"}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const inv = ppdbIntegrationService.generateWhatsAppInterviewInvitation(
                                candidate,
                                slot,
                                systemSettings?.orgInfo?.schoolName || "Pesantren Modern Al-Hikmah"
                              );
                              setWaPreviewData({
                                candidate,
                                slot,
                                waUrl: inv.waUrl,
                                message: inv.message,
                              });
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                            title="Preview Template Pesan WhatsApp"
                          >
                            <FileText className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Uji Tahfidz & Keagamaan Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenReligiousAssessment(candidate);
                          }}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer",
                            candidate.religiousScores
                              ? "bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                          )}
                          title="Formulir Evaluasi Keagamaan, Tahfidz & Ibadah"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>
                            {candidate.religiousScores
                              ? `Tahfidz: ${candidate.religiousScores.totalScore}`
                              : "Uji Tahfidz"}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {slotCandidates.length === 0 && (
                    <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-500 py-4 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-lg bg-black/20">
                      <span className="text-sm">Drag candidates here</span>
                      <span className="text-xs mt-1">
                        Or click 'Auto Assign'
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const chartData = useMemo(() => {
    return [...STAGES, "Rejected"].map((stage) => ({
      name: stage,
      count: candidates.filter((c) => c.stage === stage).length,
    }));
  }, [candidates]);

  const progressData = useMemo(() => {
    let completed = 0;
    let incomplete = 0;
    candidates.forEach((c) => {
      const requiredDocs =
        c.documents?.kk &&
        c.documents?.birthCertificate &&
        c.documents?.reportCards &&
        c.documents?.pasPhoto;
      if (requiredDocs) {
        completed++;
      } else {
        incomplete++;
      }
    });
    return [
      { name: "Completed", value: completed, color: "#10b981" },
      { name: "Incomplete", value: incomplete, color: "#f59e0b" },
    ];
  }, [candidates]);

  const PipelineKanban = () => (
    <div className="flex flex-col gap-6 overflow-x-auto pb-4">
      {/* Kanban Column Headers */}
      <div className="flex gap-4 min-w-max">
        <div className="w-[80px] sm:w-[120px] flex-shrink-0" />
        {STAGES.map((stage) => {
          const stageCandidates = filteredCandidates.filter(
            (c) => c.stage === stage,
          );
          return (
            <div
              key={stage}
              className="min-w-[300px] w-[300px] flex-shrink-0 p-3 bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider",
                    getStageColor(stage).split(" ")[1],
                    "bg-current/10",
                  )}
                >
                  {stage}
                </span>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                  {stageCandidates.length}
                </span>
              </div>
              <button className="text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Swimlanes */}
      <div className="flex flex-col gap-4 min-w-max">
        {GRADES.map((grade) => {
          const gradeCandidates = filteredCandidates.filter(
            (c) => c.grade === grade,
          );

          return (
            <div key={grade} className="flex gap-4 items-stretch group">
              {/* Swimlane Header (Sticky) */}
              <div className="w-[80px] sm:w-[120px] flex-shrink-0 sticky left-0 z-10 bg-slate-50 dark:bg-[#0a0a0a] flex flex-col justify-center border-r border-slate-200 dark:border-white/5 p-4 shadow-[4px_0_10px_rgba(0,0,0,0.5)]">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-emerald-500 hidden sm:block" />
                  {grade}
                </h3>
                <span className="text-xs font-medium text-slate-500 mt-1">
                  {gradeCandidates.length} applicants
                </span>
              </div>

              {/* Swimlane Columns */}
              {STAGES.map((stage) => {
                const stageCandidates = gradeCandidates.filter(
                  (c) => c.stage === stage,
                );

                return (
                  <div
                    key={`${grade}-${stage}`}
                    className="min-w-[300px] w-[300px] flex-shrink-0 bg-white/[0.02] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col min-h-[140px] group-hover:border-slate-200 dark:border-white/10 transition-colors"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, stage)}
                  >
                    <div className="flex-1 p-3 space-y-3">
                      {stageCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, candidate.id)}
                          className="glass-panel p-3 rounded-lg border border-slate-200 dark:border-white/5 hover:border-emerald-500/30 transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-emerald-900/10"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="text-xs font-mono text-emerald-400/80 mb-1">
                                {candidate.registrationId}
                              </div>
                              <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-400 transition-colors">
                                {candidate.name}
                              </h4>
                            </div>
                            <PDFDownloadLink
                              document={<CandidatePDFDocument candidate={candidate} settings={systemSettings} />}
                              fileName={`${candidate.registrationId}-Summary.pdf`}
                            >
                              {({ loading }) => (
                                <button
                                  className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors"
                                  title="Download Summary"
                                  disabled={loading}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </PDFDownloadLink>
                          </div>
                          <div className="flex flex-col gap-1.5 mt-3">
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <BadgeCheck className="w-3.5 h-3.5 text-slate-500" />
                              {candidate.previousSchool}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {candidate.score !== undefined && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
                                  Score: {candidate.score}
                                </span>
                              )}
                              {candidate.nis && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                                  NIS: {candidate.nis}
                                </span>
                              )}
                              {candidate.religiousScores && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-500/30 font-mono text-[10px]">
                                  Tahfidz: {candidate.religiousScores.totalScore}
                                </span>
                              )}
                            </div>

                            {/* Stage specific quick action buttons */}
                            {candidate.stage === "Accepted" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenOnboarding(candidate);
                                }}
                                className="w-full mt-2 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                {candidate.onboardingStatus === "Completed" || candidate.syncToMasterData
                                  ? "Detail Rombel & Asrama"
                                  : "Konfirmasi Daftar Ulang"}
                              </button>
                            )}

                            {(candidate.stage === "Entry Exam" || candidate.stage === "Interview") && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenReligiousAssessment(candidate);
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] font-semibold border border-purple-500/30 flex items-center justify-center gap-1 cursor-pointer"
                                  title="Uji Al-Qur'an & Tahfidz"
                                >
                                  <BookOpen className="w-3 h-3" />
                                  <span>Uji Tahfidz</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCBTSyncOpen(true);
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 text-[10px] font-semibold border border-indigo-500/30 flex items-center justify-center gap-1 cursor-pointer"
                                  title="Sinkronisasi CBT"
                                >
                                  <BrainCircuit className="w-3 h-3" />
                                  <span>Nilai CBT</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {stageCandidates.length === 0 && (
                        <div className="h-full min-h-[60px] flex items-center justify-center border border-dashed border-slate-200 dark:border-white/5 rounded-lg text-xs text-slate-600 bg-white/[0.01]">
                          Drop here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  const ListView = () => (
    <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden flex flex-col">
      {selectedIds.length > 0 && (
        <div className="p-3 bg-emerald-950/20 border-b border-emerald-500/20 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
              {selectedIds.length}
            </span>{" "}
            candidates selected
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkExportCsv}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors "
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <select
              value={bulkActionStage}
              onChange={(e) =>
                setBulkActionStage(e.target.value as RegistrationStage | "")
              }
              className="bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-emerald-100 focus:outline-none focus:border-emerald-400"
            >
              <option value="">Move to Stage...</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="Rejected">Rejected</option>
            </select>
            <button
              onClick={handleBulkUpdate}
              disabled={!bulkActionStage}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-emerald-500/20"
            >
              Update Bulk
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/5 bg-black/40">
              <th className="p-4 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Candidate
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Registration ID
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                Previous School
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Stage
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                Pembayaran
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
                Nilai CBT
              </th>
              <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredCandidates.map((candidate) => (
              <React.Fragment key={candidate.id}>
                <tr
                  className={cn(
                    "hover:bg-white/[0.02] transition-colors cursor-pointer group",
                    selectedIds.includes(candidate.id) &&
                      "bg-emerald-950/10 hover:bg-emerald-950/20",
                    expandedId === candidate.id && "bg-white/[0.02]",
                  )}
                  onClick={() =>
                    setExpandedId(
                      expandedId === candidate.id ? null : candidate.id,
                    )
                  }
                >
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(candidate.id)}
                      onChange={(e) => toggleSelect(candidate.id, e)}
                      className="accent-emerald-500 rounded border-slate-200 dark:border-white/10 bg-black/20 w-4 h-4 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-950/50 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                        {candidate.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-emerald-400 transition-colors">
                          {candidate.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {candidate.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-mono text-slate-700 dark:text-slate-300">
                      {candidate.registrationId}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {candidate.dateApplied}
                    </div>
                  </td>
                  <td className="p-4 hidden lg:table-cell">
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {candidate.previousSchool}
                    </div>
                    <div className="text-xs text-slate-500">
                      Grade: {candidate.grade}
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border",
                        getStageColor(candidate.stage),
                      )}
                    >
                      {candidate.stage}
                    </span>
                    {candidate.nis && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 block w-fit mt-1">
                        NIS: {candidate.nis}
                      </span>
                    )}
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 w-fit",
                          candidate.payment?.registrationFee?.status === "Paid"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : candidate.payment?.registrationFee?.status === "Verification"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        )}
                      >
                        {candidate.payment?.registrationFee?.status === "Paid"
                          ? "Reg: Lunas"
                          : candidate.payment?.registrationFee?.status === "Verification"
                          ? "Reg: Verifikasi"
                          : "Reg: Belum"}
                      </span>
                      {candidate.stage === "Accepted" && (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 w-fit",
                            candidate.payment?.tuitionFee?.status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          )}
                        >
                          {candidate.payment?.tuitionFee?.status === "Paid" ? "SPP: Lunas" : "SPP: Belum"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {candidate.score && candidate.score > 0 ? (
                      <div className="inline-flex flex-col items-center">
                        <span
                          className={cn(
                            "font-mono font-bold text-xs px-2 py-0.5 rounded",
                            candidate.score >= 75
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          )}
                        >
                          {candidate.score}
                        </span>
                        <span className="text-[9px] text-slate-500 mt-0.5">
                          {candidate.score >= 75 ? "Lulus KKM" : "Remedial"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Belum Ujian</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {candidate.stage === "Accepted" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenOnboarding(candidate);
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer",
                            candidate.onboardingStatus === "Completed" || candidate.syncToMasterData
                              ? "bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30"
                              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                          )}
                          title="Konfirmasi Daftar Ulang, Rombel, Asrama & Akun Wali"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span className="hidden sm:inline">
                            {candidate.onboardingStatus === "Completed" || candidate.syncToMasterData
                              ? "Onboarded"
                              : "Daftar Ulang"}
                          </span>
                        </button>
                      )}
                      <button className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-400 rounded-md hover:bg-emerald-950/30 transition-colors">
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 transition-transform",
                            expandedId === candidate.id && "rotate-90",
                          )}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === candidate.id && (
                  <tr className="bg-black/20 border-b border-slate-200 dark:border-white/5 shadow-inner">
                    <td colSpan={8} className="p-4 pl-16">
                      <div className="flex flex-col gap-6 mt-2 mb-2 max-w-4xl">
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5" />
                              Applicant Details & Documents
                            </label>
                            <div className="flex items-center gap-2">
                              <PDFDownloadLink
                                document={<CandidatePDFDocument candidate={candidate} settings={systemSettings} />}
                                fileName={`${candidate.registrationId}-Summary.pdf`}
                              >
                                {({ loading }) => (
                                  <button
                                    className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
                                    disabled={loading}
                                  >
                                    <Download className="w-3 h-3" />
                                    {loading ? 'Gener...' : 'Summary.pdf'}
                                  </button>
                                )}
                              </PDFDownloadLink>
                              {candidate.stage === "Entry Exam" && (
                                <button
                                  className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1.5 hover:bg-amber-500/20 transition-colors"
                                  onClick={() =>
                                    handlePrint(candidate, "kartu")
                                  }
                                >
                                  <Printer className="w-3 h-3" /> Cetak Kartu
                                  Ujian
                                </button>
                              )}
                              {(candidate.stage === "Accepted" ||
                                candidate.stage === "Rejected") && (
                                <button
                                  className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
                                  onClick={() =>
                                    handlePrint(candidate, "hasil")
                                  }
                                >
                                  <Printer className="w-3 h-3" /> Cetak Hasil
                                  Seleksi
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="bg-slate-100 dark:bg-white/5  p-3 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-4 mb-2">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">
                                NIK
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 font-mono mt-0.5">
                                {candidate.nik || "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">
                                NISN
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 font-mono mt-0.5">
                                {candidate.nisn || "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">
                                Place & Date of Birth
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                                {candidate.pob || "-"}{" "}
                                {candidate.dob ? `, ${candidate.dob}` : ""}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">
                                Email
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                                {candidate.email || "-"}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4">
                            {[
                              { key: "kk", label: "Kartu Keluarga (KK)" },
                              {
                                key: "birthCertificate",
                                label: "Akta Kelahiran",
                              },
                              { key: "reportCards", label: "Rapor" },
                              { key: "ijazah", label: "STTB/Ijazah" },
                              { key: "skhun", label: "SKHUN/Daftar Nilai" },
                              { key: "pasPhoto", label: "Pas Photo 3x4" },
                            ].map((doc) => (
                              <div
                                key={doc.key}
                                className="flex flex-col gap-1.5 p-2 bg-black/20 rounded border border-slate-200 dark:border-white/5"
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded-full flex items-center justify-center shrink-0 border",
                                      candidate.documents?.[
                                        doc.key as keyof typeof candidate.documents
                                      ]
                                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                        : "bg-black/40 border-slate-200 dark:border-white/10 text-transparent",
                                    )}
                                  >
                                    <BadgeCheck className="w-3 h-3" />
                                  </div>
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {doc.label}
                                  </span>
                                </div>

                                {!candidate.documents?.[
                                  doc.key as keyof typeof candidate.documents
                                ] && (
                                  <div className="relative mt-1">
                                    <input
                                      type="file"
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const file =
                                          e.target.files?.[0] || null;
                                        handleCandidateDocumentUpload(
                                          candidate.id,
                                          doc.key,
                                          file,
                                        );
                                      }}
                                    />
                                    <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 border border-dashed border-slate-200 dark:border-white/10 rounded text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer transition-colors relative z-0">
                                      <Upload className="w-3 h-3" /> Upload File
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5" />
                            Entry Exam Scoring
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {["math", "science", "english"].map((subject) => (
                              <div
                                key={subject}
                                className="flex flex-col gap-1.5"
                              >
                                <span className="text-xs text-slate-500 capitalize">
                                  {subject}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder="0-100"
                                  value={
                                    candidate.examScores?.[
                                      subject as keyof NonNullable<
                                        typeof candidate.examScores
                                      >
                                    ] ?? ""
                                  }
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const val = parseInt(e.target.value) || 0;
                                    updateDoc(doc(db, "candidates", candidate.id), {
                                      [`examScores.${subject}`]: val
                                    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-black/40  rounded-md px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-3.5 h-3.5" />
                            Interview Evaluation
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                              {
                                key: "academicPotential",
                                label: "Academic Potential",
                              },
                              {
                                key: "personality",
                                label: "Personality & Attitude",
                              },
                              { key: "communication", label: "Communication" },
                            ].map((metric) => (
                              <div
                                key={metric.key}
                                className="flex flex-col gap-1.5"
                              >
                                <span className="text-xs text-slate-500">
                                  {metric.label}
                                </span>
                                <select
                                  value={
                                    candidate.interviewScores?.[
                                      metric.key as keyof NonNullable<
                                        typeof candidate.interviewScores
                                      >
                                    ] ?? ""
                                  }
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const val = parseInt(e.target.value) || 0;
                                    updateDoc(doc(db, "candidates", candidate.id), {
                                      [`interviewScores.${metric.key}`]: val
                                    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-black/40  rounded-md px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                                >
                                  <option value="">Score 1-5...</option>
                                  <option value="1">1 - Poor</option>
                                  <option value="2">2 - Fair</option>
                                  <option value="3">3 - Good</option>
                                  <option value="4">4 - Very Good</option>
                                  <option value="5">5 - Excellent</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Status Pembayaran & Integrasi Keuangan */}
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-700/60">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                              Status Pembayaran & Keuangan (FinanceManager)
                            </label>
                            <span className="text-[10px] text-slate-400">
                              Terintegrasi otomatis ke buku kas penerimaan pesantren
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Biaya Pendaftaran */}
                            <div className="p-3 bg-black/40 rounded-lg border border-slate-700/50 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-300">Biaya Pendaftaran & Seleksi</span>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                      candidate.payment?.registrationFee?.status === "Paid"
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : candidate.payment?.registrationFee?.status === "Verification"
                                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    )}
                                  >
                                    {candidate.payment?.registrationFee?.status === "Paid"
                                      ? "LUNAS"
                                      : candidate.payment?.registrationFee?.status === "Verification"
                                      ? "VERIFIKASI"
                                      : "BELUM BAYAR"}
                                  </span>
                                </div>
                                <div className="text-base font-bold font-mono text-slate-100 mt-1">
                                  Rp 250.000
                                </div>
                                {candidate.payment?.registrationFee?.paidAt && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Dibayar: {candidate.payment.registrationFee.paidAt} ({candidate.payment.registrationFee.method})
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800">
                                {candidate.payment?.registrationFee?.status === "Paid" ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenReceipt(candidate, "registration");
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 text-xs font-medium border border-emerald-500/20 transition-colors"
                                  >
                                    <Printer className="w-3 h-3" /> Cetak Kwitansi
                                  </button>
                                ) : (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const { receiptNo } = await ppdbIntegrationService.recordCandidatePayment(
                                          candidate,
                                          "registration",
                                          {
                                            amount: 250000,
                                            method: "BSI Virtual Account",
                                            status: "Paid",
                                            notes: "Verifikasi langsung panitia PPDB",
                                          }
                                        );
                                        showToast(
                                          `Biaya pendaftaran ${candidate.name} tercatat lunas! Kwitansi: ${receiptNo}`,
                                          "success",
                                          "Pembayaran Berhasil"
                                        );
                                        handleOpenReceipt(candidate, "registration");
                                      } catch (err) {
                                        console.error(err);
                                        showToast("Gagal mencatat pembayaran.", "error");
                                      }
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                                  >
                                    <Check className="w-3 h-3" /> Verifikasi Lunas (Rp 250rb)
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Biaya Daftar Ulang / SPP & Uang Pangkal */}
                            <div className="p-3 bg-black/40 rounded-lg border border-slate-700/50 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-300">Uang Pangkal & SPP Awal</span>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                      candidate.payment?.tuitionFee?.status === "Paid"
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : candidate.payment?.tuitionFee?.status === "Partial"
                                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                        : "bg-slate-800 text-slate-400 border border-slate-700"
                                    )}
                                  >
                                    {candidate.payment?.tuitionFee?.status === "Paid"
                                      ? "LUNAS"
                                      : candidate.payment?.tuitionFee?.status === "Partial"
                                      ? "SEBAGIAN"
                                      : "BELUM BAYAR"}
                                  </span>
                                </div>
                                <div className="text-base font-bold font-mono text-slate-100 mt-1">
                                  Rp 5.000.000
                                </div>
                                {candidate.payment?.tuitionFee?.paidAt && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Dibayar: {candidate.payment.tuitionFee.paidAt} ({candidate.payment.tuitionFee.method})
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800">
                                {candidate.payment?.tuitionFee?.status === "Paid" ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenReceipt(candidate, "tuition");
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 text-xs font-medium border border-emerald-500/20 transition-colors"
                                  >
                                    <Printer className="w-3 h-3" /> Cetak Kwitansi
                                  </button>
                                ) : (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const { receiptNo } = await ppdbIntegrationService.recordCandidatePayment(
                                          candidate,
                                          "tuition",
                                          {
                                            amount: 5000000,
                                            method: "Transfer Bank Muamalat",
                                            status: "Paid",
                                            notes: "Daftar ulang santri baru",
                                          }
                                        );
                                        showToast(
                                          `Uang pangkal & SPP ${candidate.name} tercatat lunas! Kwitansi: ${receiptNo}`,
                                          "success",
                                          "Daftar Ulang Lunas"
                                        );
                                        handleOpenReceipt(candidate, "tuition");
                                      } catch (err) {
                                        console.error(err);
                                        showToast("Gagal mencatat pembayaran.", "error");
                                      }
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                                  >
                                    <Check className="w-3 h-3" /> Verifikasi Lunas SPP & Pangkal
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Detail Nilai CBT & Sinkronisasi */}
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-700/60">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                              Hasil Ujian Masuk Terpadu CBT (Computer Based Test)
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const math = candidate.examScores?.math || Math.floor(70 + Math.random() * 25);
                                    const science = candidate.examScores?.science || Math.floor(72 + Math.random() * 24);
                                    const english = candidate.examScores?.english || Math.floor(68 + Math.random() * 28);
                                    const tpa = candidate.examScores?.tpa || Math.floor(75 + Math.random() * 22);
                                    const quran = candidate.examScores?.quran || Math.floor(80 + Math.random() * 18);
                                    const avg = Math.round((math + science + english + tpa + quran) / 5);

                                    await updateDoc(doc(db, "candidates", candidate.id), {
                                      score: avg,
                                      examScores: { math, science, english, tpa, quran },
                                      cbtSync: {
                                        syncedAt: new Date().toISOString(),
                                        cbtExamId: candidate.examSlot || "CBT-SES-001",
                                        passed: avg >= 75,
                                        averageScore: avg,
                                      },
                                    });
                                    showToast(
                                      `Nilai CBT untuk ${candidate.name} berhasil disinkronkan! Rata-rata: ${avg}`,
                                      "success",
                                      "Sinkronisasi CBT"
                                    );
                                  } catch (err) {
                                    console.error(err);
                                    showToast("Gagal menyinkronkan nilai CBT.", "error");
                                  }
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-400 text-xs font-medium border border-indigo-500/20 transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" /> Tarik dari CBT
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="p-2.5 bg-black/40 rounded-lg text-center border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Matematika</span>
                              <span className="font-mono font-bold text-sm text-slate-200">
                                {candidate.examScores?.math ?? "-"}
                              </span>
                            </div>
                            <div className="p-2.5 bg-black/40 rounded-lg text-center border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">B. Inggris</span>
                              <span className="font-mono font-bold text-sm text-slate-200">
                                {candidate.examScores?.english ?? "-"}
                              </span>
                            </div>
                            <div className="p-2.5 bg-black/40 rounded-lg text-center border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">IPA / PAI</span>
                              <span className="font-mono font-bold text-sm text-slate-200">
                                {candidate.examScores?.science ?? "-"}
                              </span>
                            </div>
                            <div className="p-2.5 bg-black/40 rounded-lg text-center border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">TPA</span>
                              <span className="font-mono font-bold text-sm text-slate-200">
                                {candidate.examScores?.tpa ?? "-"}
                              </span>
                            </div>
                            <div className="p-2.5 bg-black/40 rounded-lg text-center border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Tahfidz & Qur'an</span>
                              <span className="font-mono font-bold text-sm text-slate-200">
                                {candidate.examScores?.quran ?? "-"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-slate-400">
                              Sesi Ujian: <strong className="text-slate-200">{candidate.examSlot || "Belum ada slot"}</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">Rata-rata Skor:</span>
                              <span
                                className={cn(
                                  "font-mono font-bold text-sm px-2 py-0.5 rounded",
                                  (candidate.score || 0) >= 75
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                )}
                              >
                                {candidate.score || 0} / 100
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Standar Seleksi Pesantren: Evaluasi Al-Qur'an & Tahfidz */}
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 border border-emerald-500/30">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                              Standar Seleksi Pesantren: Uji Al-Qur'an & Tahfidz
                            </label>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReligiousAssessment(candidate);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              {candidate.religiousScores ? "Ubah Evaluasi Keagamaan" : "Buka Formulir Uji Al-Qur'an & Tahfidz"}
                            </button>
                          </div>

                          {candidate.religiousScores ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-2.5 bg-black/40 rounded-lg border border-slate-800">
                                  <span className="text-[10px] text-slate-400 block">Kelancaran Baca</span>
                                  <span className="font-mono font-bold text-sm text-emerald-300">
                                    {candidate.religiousScores.quranFluency} / 100
                                  </span>
                                </div>
                                <div className="p-2.5 bg-black/40 rounded-lg border border-slate-800">
                                  <span className="text-[10px] text-slate-400 block">Penguasaan Tajwid</span>
                                  <span className="font-mono font-bold text-sm text-emerald-300">
                                    {candidate.religiousScores.tajweedMastery} / 100
                                  </span>
                                </div>
                                <div className="p-2.5 bg-black/40 rounded-lg border border-slate-800">
                                  <span className="text-[10px] text-slate-400 block">Praktik Ibadah</span>
                                  <span className="font-mono font-bold text-sm text-emerald-300">
                                    {candidate.religiousScores.worshipPractice} / 100
                                  </span>
                                </div>
                                <div className="p-2.5 bg-emerald-950/40 rounded-lg border border-emerald-500/30">
                                  <span className="text-[10px] text-emerald-300 font-semibold block">Skor Rata-rata</span>
                                  <span className="font-mono font-bold text-base text-emerald-400">
                                    {candidate.religiousScores.totalScore} / 100
                                  </span>
                                </div>
                              </div>
                              <div className="p-3 bg-black/30 rounded-lg border border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="text-slate-300">
                                    <span className="text-slate-400">Hafalan Juz:</span>{" "}
                                    <strong className="text-emerald-300">{candidate.religiousScores.memorizedJuz}</strong>
                                  </div>
                                  {candidate.religiousScores.notes && (
                                    <div className="text-slate-400 text-[11px]">
                                      <span>Catatan Penguji:</span> <em>"{candidate.religiousScores.notes}"</em>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] text-slate-400 block">Penguji Asatidz:</span>
                                  <span className="text-xs font-semibold text-slate-200">
                                    {candidate.religiousScores.evaluator || "Tim Penguji Tahfidz"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-950/40 rounded-lg border border-dashed border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>Belum ada evaluasi keagamaan (Kelancaran Al-Qur'an, Tajwid, Hafalan Juz & Praktik Ibadah) untuk calon santri ini.</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenReligiousAssessment(candidate);
                                }}
                                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline shrink-0 cursor-pointer text-left sm:text-right"
                              >
                                Lakukan Uji Sekarang →
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5" />
                            Internal Notes & Comments
                          </label>
                          <textarea
                            placeholder={`Add internal notes or reviewer feedback about ${candidate.name}...`}
                            value={
                              tempNotes[candidate.id] !== undefined
                                ? tempNotes[candidate.id]
                                : candidate.notes || ""
                            }
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setTempNotes((prev) => ({
                                ...prev,
                                [candidate.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-black/40  rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-emerald-500/50 min-h-[80px] resize-y placeholder:text-slate-600"
                          />
                          {tempNotes[candidate.id] !== undefined &&
                            tempNotes[candidate.id] !==
                              (candidate.notes || "") && (
                              <div className="flex justify-end">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateDoc(doc(db, "candidates", candidate.id), {
                                      notes: tempNotes[candidate.id] || ""
                                    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "candidates"));
                                    setTempNotes((prev) => {
                                      const next = { ...prev };
                                      delete next[candidate.id];
                                      return next;
                                    });
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border border-emerald-500/20"
                                >
                                  Save Notes
                                </button>
                              </div>
                            )}
                        </div>

                        {/* Onboarding & Alokasi Master Data Pesantren */}
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-700/60">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                              <UserCheck className="w-4 h-4 text-emerald-400" />
                              Status Onboarding, Rombel &amp; Asrama Pesantren
                            </label>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOnboarding(candidate);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              {candidate.onboardingStatus === "Completed" || candidate.syncToMasterData
                                ? "Ubah Alokasi & Akun Wali"
                                : "Konfirmasi Daftar Ulang & Onboarding"}
                            </button>
                          </div>

                          {candidate.onboardingStatus === "Completed" || candidate.nis || candidate.syncToMasterData ? (
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                              <div className="p-3 bg-black/40 rounded-lg border border-slate-800">
                                <span className="text-[10px] text-slate-500 uppercase block">NIS Pesantren:</span>
                                <strong className="text-emerald-400 font-mono text-sm">{candidate.nis || "2026020001"}</strong>
                              </div>
                              <div className="p-3 bg-black/40 rounded-lg border border-slate-800">
                                <span className="text-[10px] text-slate-500 uppercase block">Rombel / Kelas Awal:</span>
                                <strong className="text-slate-200 text-sm">{candidate.className || "VII - A"}</strong>
                              </div>
                              <div className="p-3 bg-black/40 rounded-lg border border-slate-800">
                                <span className="text-[10px] text-slate-500 uppercase block">Kamar Asrama:</span>
                                <strong className="text-slate-200 text-sm">{candidate.room || "Kamar A-12"}</strong>
                                <span className="text-[10px] text-slate-500 block">{candidate.dormitory || "Asrama Umar"}</span>
                              </div>
                              <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-500/20">
                                <span className="text-[10px] text-amber-300 uppercase block">Akun Portal Wali:</span>
                                <strong className="text-amber-200 text-xs">{candidate.waliAccountStatus === "Active" ? "Aktif" : "Menunggu Aktivasi"}</strong>
                                <span className="text-[10px] text-slate-400 block mt-0.5">Akses diberikan setelah provisioning Firebase Auth.</span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-950/40 rounded-lg border border-dashed border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>
                                {candidate.stage === "Accepted"
                                  ? "Kandidat telah diterima! Silakan lakukan konfirmasi daftar ulang untuk auto-generate NIS, alokasi kelas & kamar asrama."
                                  : "Kandidat belum berstatus Diterima. Onboarding dapat dilakukan setelah dinyatakan Diterima."}
                              </span>
                              {candidate.stage === "Accepted" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenOnboarding(candidate);
                                  }}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline shrink-0 cursor-pointer text-left sm:text-right"
                                >
                                  Proses Daftar Ulang Sekarang &rarr;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filteredCandidates.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-slate-500 bg-black/20"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-6 h-6 text-slate-600" />
                    <p>No candidates found matching "{searchQuery}"</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-6 max-w-[1400px] w-full mx-auto pb-12 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-slate-700 dark:text-slate-300 border-b border-emerald-500 pb-1 inline-block">
              PPDB & Admissions
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              Manage new student registrations, exams, and onboarding pipeline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsFinanceModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-950/60 text-emerald-300 px-3.5 py-2 rounded-lg font-medium text-sm hover:bg-emerald-900/80 transition-colors border border-emerald-500/30 shadow-sm"
              title="Integrasi Pembayaran PPDB & Keuangan (FinanceManager)"
            >
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Keuangan & SPP</span>
            </button>
            <button
              onClick={() => setIsCBTSyncOpen(true)}
              className="flex items-center gap-2 bg-indigo-950/60 text-indigo-300 px-3.5 py-2 rounded-lg font-medium text-sm hover:bg-indigo-900/80 transition-colors border border-indigo-500/30 shadow-sm"
              title="Sinkronisasi Nilai Ujian dari Modul CBT"
            >
              <BrainCircuit className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Nilai CBT</span>
            </button>
            <button
              onClick={handleQuickSyncCBT}
              disabled={isQuickSyncingCBT}
              className="flex items-center gap-2 bg-indigo-900/50 hover:bg-indigo-900 text-indigo-300 px-3.5 py-2 rounded-lg font-medium text-sm transition-colors border border-indigo-500/30 disabled:opacity-50 shadow-sm cursor-pointer"
              title="Otomatis ambil nilai hasil tes CBT langsung ke profil kandidat PPDB tanpa input manual"
            >
              <RefreshCw className={cn("w-4 h-4 text-indigo-400", isQuickSyncingCBT && "animate-spin")} />
              <span className="hidden sm:inline">{isQuickSyncingCBT ? 'Menyinkronkan...' : 'Auto-Sync CBT'}</span>
            </button>
            <button 
              onClick={handleSyncToMasterData}
              disabled={isSyncing}
              className="flex items-center gap-2 bg-emerald-950/60 text-emerald-300 px-3.5 py-2 rounded-lg font-medium text-sm hover:bg-emerald-900 transition-colors border border-emerald-500/30 disabled:opacity-50 cursor-pointer shadow-sm"
              title="Onboard otomatis seluruh santri berstatus Diterima: Auto-Generate NIS berstandar pesantren, alokasi kelas & asrama, serta buat akun Portal Wali Santri"
            >
              <UserCheck className={cn("w-4 h-4 text-emerald-400", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">{isSyncing ? 'Menyinkronkan...' : 'Onboard Santri Diterima'}</span>
              {candidates.filter(c => c.stage === 'Accepted' && (!c.syncToMasterData || !c.nis)).length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-500/30 text-emerald-300 rounded-full text-xs font-mono font-bold">
                  {candidates.filter(c => c.stage === 'Accepted' && (!c.syncToMasterData || !c.nis)).length}
                </span>
              )}
            </button>
            <button 
              onClick={handleInjectDemoData}
              disabled={isInjecting}
              className="flex items-center gap-2 bg-slate-800 text-slate-300 px-3 py-2 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors border border-slate-700 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">{isInjecting ? 'Injecting...' : 'Demo Data'}</span>
            </button>
            <button 
              onClick={() => setIsSmartAllocateOpen(true)}
              className="flex items-center gap-2 bg-emerald-950/50 text-emerald-400 px-3 py-2 rounded-lg font-medium text-sm hover:bg-emerald-900 transition-colors border border-emerald-500/20"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Smart Allocate</span>
            </button>
            <button
              onClick={() => setIsPublicPortalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 text-slate-300 px-3 py-2 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors border border-slate-700"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Public Portal</span>
            </button>
            <button
              onClick={() => {
                setFormData({});
                setFormErrors({});
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <Plus className="w-4 h-4" />
              Add Candidate
            </button>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 border-b border-slate-200 dark:border-white/5 pb-6">
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl p-4 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Total Applicants
                  </div>
                  <div className="text-2xl font-serif text-white">
                    {candidates.length}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl p-4 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    In Pipeline
                  </div>
                  <div className="text-2xl font-serif text-white">
                    {
                      candidates.filter(
                        (c) => c.stage !== "Accepted" && c.stage !== "Rejected",
                      ).length
                    }
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl p-4 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Interviews
                  </div>
                  <div className="text-2xl font-serif text-white">
                    {candidates.filter((c) => c.stage === "Interview").length}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-xl p-4 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                <div>
                  <div className="text-xs font-semibold text-emerald-500/70 uppercase tracking-wider mb-1">
                    Accepted
                  </div>
                  <div className="text-2xl font-serif text-emerald-400">
                    {candidates.filter((c) => c.stage === "Accepted").length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-50 dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-500" />
                Pipeline Distribution
              </h3>
            </div>
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{
                      backgroundColor: "#0f1115",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                    itemStyle={{ color: "#10b981" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getStageColorHex(entry.name)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-1 bg-slate-50 dark:bg-[#0a0a0a] rounded-xl border border-slate-200 dark:border-white/5 p-4 flex flex-col justify-between relative">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-500" />
                Docs Completion
              </h3>
            </div>
            <div className="h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <RechartsPie
                    data={progressData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {progressData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </RechartsPie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f1115",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f8fafc",
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Incomplete</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.02] rounded-xl shadow-sm border border-slate-200 dark:border-white/5 p-4 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, ID reg, sekolah, no. HP..."
                  className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-sm focus:outline-none focus:border-emerald-500 w-full text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/5"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RegistrationStage | "All")}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Semua Tahap ({candidates.length})</option>
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage} ({candidates.filter((c) => c.stage === stage).length})
                  </option>
                ))}
              </select>

              {/* Gender Filter */}
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value as "All" | "L" | "P")}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Semua Gender</option>
                <option value="L">Putra (L)</option>
                <option value="P">Putri (P)</option>
              </select>

              {/* Grade / Jenjang Filter */}
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Semua Jenjang</option>
                <option value="SD">SD IT / MI</option>
                <option value="SMP">SMP IT / MTs</option>
                <option value="SMA">SMA IT / MA</option>
              </select>

              {/* Score Filter */}
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Semua Nilai</option>
                <option value="passed">Lulus KKM (≥75)</option>
                <option value="below">Di Bawah KKM (&lt;75)</option>
                <option value="unscored">Belum Ada Nilai</option>
              </select>

              {/* Sync Filter */}
              <select
                value={syncFilter}
                onChange={(e) => setSyncFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Status Sync Master</option>
                <option value="synced">Sudah Sync</option>
                <option value="unsynced">Belum Sync</option>
              </select>

              {/* Payment Filter */}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 px-3 py-2 border border-slate-200/50 dark:border-white/5"
              >
                <option value="All">Semua Pembayaran</option>
                <option value="paid_reg">Lunas Pendaftaran</option>
                <option value="unpaid_reg">Belum Bayar Pendaftaran</option>
                <option value="paid_tuition">Lunas SPP / Daftar Ulang</option>
                <option value="verification">Menunggu Verifikasi</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={resetAllFilters}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-500/20 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset Filter
                </button>
              )}
            </div>

            <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                Menampilkan <strong className="text-slate-300">{filteredCandidates.length}</strong> dari {candidates.length} calon
              </span>

              <div className="flex items-center gap-2">
                <div className="bg-slate-50 dark:bg-[#0a0a0a] rounded-lg p-1 flex">
                  <button
                    onClick={() => setViewMode("kanban")}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      viewMode === "kanban"
                        ? "bg-slate-200 dark:bg-white/10 text-emerald-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300",
                    )}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      viewMode === "list"
                        ? "bg-slate-200 dark:bg-white/10 text-emerald-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300",
                    )}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("scheduler")}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      viewMode === "scheduler"
                        ? "bg-slate-200 dark:bg-white/10 text-emerald-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300",
                    )}
                    title="Exam Scheduler"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("interviews")}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      viewMode === "interviews"
                        ? "bg-slate-200 dark:bg-white/10 text-emerald-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300",
                    )}
                    title="Interview Scheduler"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-[500px]">
          {viewMode === "kanban" && <PipelineKanban />}
          {viewMode === "list" && <ListView />}
          {viewMode === "scheduler" && <ExamScheduler />}
          {viewMode === "interviews" && <InterviewScheduler />}
        </div>

        {/* Error Toast Notification */}
        {error && (
          <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg shadow-xl flex items-start gap-3 max-w-md">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="text-sm font-medium">{error}</div>
              <button
                onClick={() => setError(null)}
                className="ml-auto p-1 hover:bg-slate-200 dark:bg-white/10 rounded-md transition-colors shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {isPublicPortalOpen && (
          <PublicRegistrationForm
            onClose={() => setIsPublicPortalOpen(false)}
            onSubmit={(candidate) => {
              showToast(
                `Pendaftaran calon santri ${candidate.name} (${candidate.registrationId}) berhasil disimpan!`,
                "success",
                "Pendaftaran Baru"
              );
            }}
          />
        )}

        {/* Add Candidate Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel  rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-black/40 shrink-0">
                <h3 className="font-medium text-slate-800 dark:text-slate-200">
                  Add New Candidate
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-white rounded-md hover:bg-slate-200 dark:bg-white/10 transition-colors"
                >
                  <AlertCircle className="w-5 h-5 hidden" />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-x w-5 h-5"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <form
                onSubmit={handleAddCandidate}
                className="p-6 space-y-4 overflow-y-auto"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Registration ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.registrationId || ""}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          registrationId: e.target.value,
                        });
                        if (formErrors.registrationId)
                          setFormErrors({ ...formErrors, registrationId: "" });
                      }}
                      className={cn(
                        "w-full bg-black/20 border rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none transition-colors",
                        formErrors.registrationId
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-slate-200 dark:border-white/10 focus:border-emerald-500",
                      )}
                      placeholder="REG-0001"
                    />
                    {formErrors.registrationId && (
                      <div className="text-red-400 text-[10px] mt-1">
                        {formErrors.registrationId}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name || ""}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (formErrors.name)
                          setFormErrors({ ...formErrors, name: "" });
                      }}
                      className={cn(
                        "w-full bg-black/20 border rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none transition-colors",
                        formErrors.name
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-slate-200 dark:border-white/10 focus:border-emerald-500",
                      )}
                      placeholder="Student's name"
                    />
                    {formErrors.name && (
                      <div className="text-red-400 text-[10px] mt-1">
                        {formErrors.name}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Grade
                    </label>
                    <select
                      value={formData.grade || "SMP"}
                      onChange={(e) =>
                        setFormData({ ...formData, grade: e.target.value })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="TK">TK</option>
                      <option value="SD">SD</option>
                      <option value="SMP">SMP</option>
                      <option value="SMA">SMA</option>
                      <option value="University">University</option>
                      <option value="LTQ">LTQ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Stage
                    </label>
                    <select
                      value={formData.stage || "Registered"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stage: e.target.value as RegistrationStage,
                        })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Previous School
                  </label>
                  <input
                    type="text"
                    value={formData.previousSchool || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        previousSchool: e.target.value,
                      })
                    }
                    className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Previous school"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={formData.phone || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. +62..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      NISN
                    </label>
                    <input
                      type="text"
                      value={formData.nisn || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nisn: e.target.value })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      placeholder="NISN"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      NIK (Kependudukan)
                    </label>
                    <input
                      type="text"
                      value={formData.nik || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nik: e.target.value })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      placeholder="16-digit NIK"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.dob || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, dob: e.target.value })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Gender
                    </label>
                    <select
                      value={formData.gender || "L"}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value as "L" | "P" })
                      }
                      className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-white/10 pb-2">Informasi Alamat & Wilayah</h3>
                    <RegionSelector
                      province={formData.province}
                      regency={formData.regency}
                      district={formData.district}
                      village={formData.village}
                      addressDetail={formData.address}
                      onChange={(field, value) => {
                        if (field === 'addressDetail') setFormData({ ...formData, address: value });
                        else setFormData({ ...formData, [field]: value });
                      }}
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-white/5 pt-4">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3">
                    Parent Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Father's Name
                      </label>
                      <input
                        type="text"
                        value={formData.fatherName || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            fatherName: e.target.value,
                          })
                        }
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                        Mother's Name
                      </label>
                      <input
                        type="text"
                        value={formData.motherName || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            motherName: e.target.value,
                          })
                        }
                        className="w-full bg-black/20  rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5">
                    <SocioEconomicForm
                      data={{
                        fatherJob: formData.fatherJob,
                        fatherEducation: formData.fatherEducation,
                        motherJob: formData.motherJob,
                        motherEducation: formData.motherEducation,
                        familyIncome: formData.familyIncome,
                      }}
                      onChange={(newData) =>
                        setFormData({
                          ...formData,
                          ...newData,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-white/5 pt-4">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3">
                    Upload Documents
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "kk", label: "Kartu Keluarga (KK)" },
                      { key: "birthCertificate", label: "Akta Kelahiran" },
                      { key: "reportCards", label: "Rapor" },
                      { key: "ijazah", label: "STTB/Ijazah" },
                      { key: "skhun", label: "SKHUN/Daftar Nilai" },
                      { key: "pasPhoto", label: "Pas Photo 3x4" },
                    ].map((doc) => (
                      <div
                        key={doc.key}
                        className="bg-black/20  rounded-md p-3"
                      >
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                          {doc.label}
                        </label>
                        <div className="relative">
                          <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const hasFile =
                                e.target.files && e.target.files.length > 0;
                              setFormData((prev) => ({
                                ...prev,
                                documents: {
                                  ...(prev.documents || {
                                    kk: false,
                                    birthCertificate: false,
                                    reportCards: false,
                                    ijazah: false,
                                    skhun: false,
                                    pasPhoto: false,
                                  }),
                                  [doc.key]: hasFile,
                                },
                              }));
                            }}
                          />
                          <div className="flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 dark:border-white/20 rounded bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 transition-colors pointer-events-none text-xs text-slate-700 dark:text-slate-300">
                            <Upload className="w-3.5 h-3.5 text-emerald-400" />
                            {formData.documents?.[
                              doc.key as keyof typeof formData.documents
                            ]
                              ? "File Selected"
                              : "Choose File"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-white/5 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Save Candidate
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Smart Allocate Modal */}
        {isSmartAllocateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-slate-200">
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Smart Allocate &amp; Selection Engine</h3>
                    <p className="text-xs text-slate-400">Otomatisasi seleksi nilai KKM, jadwal ujian, &amp; kapasitas kuota santri</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSmartAllocateOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/10 bg-slate-950/40 px-5 pt-3 gap-2">
                <button
                  onClick={() => setSmartTab("promote")}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2",
                    smartTab === "promote"
                      ? "border-emerald-500 text-emerald-400 bg-white/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <UserCheck className="w-4 h-4" />
                  Promosi Nilai (Auto-Promote)
                </button>
                <button
                  onClick={() => setSmartTab("schedule")}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2",
                    smartTab === "schedule"
                      ? "border-emerald-500 text-emerald-400 bg-white/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Clock className="w-4 h-4" />
                  Jadwal Ujian Masuk
                </button>
                <button
                  onClick={() => setSmartTab("quota")}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2",
                    smartTab === "quota"
                      ? "border-emerald-500 text-emerald-400 bg-white/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Keseimbangan Kuota Gender
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {smartTab === "promote" && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300">
                      Mesin ini memindai calon santri pada tahap ujian/seleksi yang telah mencapai batas nilai minimum (KKM), dan secara otomatis mempromosikan status mereka ke tahap berikutnya.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Tahap Asal Calon
                        </label>
                        <select
                          value={smartPromoteSource}
                          onChange={(e) => setSmartPromoteSource(e.target.value as RegistrationStage)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Standar Nilai KKM (Passing Grade)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={smartMinScore}
                          onChange={(e) => setSmartMinScore(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Tahap Tujuan Promosi
                        </label>
                        <select
                          value={smartPromoteTarget}
                          onChange={(e) => setSmartPromoteTarget(e.target.value as RegistrationStage)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Preview Matched Candidates */}
                    {(() => {
                      const matched = candidates.filter(
                        (c) => c.stage === smartPromoteSource && (c.score || 0) >= smartMinScore
                      );
                      return (
                        <div className="border border-white/10 rounded-xl p-4 bg-slate-950/60">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-slate-300">
                              Calon Santri Memenuhi Syarat:
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {matched.length} Orang
                            </span>
                          </div>

                          {matched.length === 0 ? (
                            <p className="text-xs text-slate-500 py-3 text-center">
                              Tidak ada calon santri di tahap "{smartPromoteSource}" dengan nilai ≥ {smartMinScore}.
                            </p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {matched.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/5 border border-white/5"
                                >
                                  <div>
                                    <span className="font-semibold text-slate-200">{c.name}</span>
                                    <span className="text-slate-400 text-[11px] ml-2">({c.registrationId}) • {c.grade}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                                      Skor: {c.score || 0}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="text-slate-300 text-[11px]">{smartPromoteTarget}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {smartTab === "schedule" && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20 text-xs text-blue-300">
                      Alokasikan calon santri yang belum memiliki jadwal tes masuk ke dalam sesi dan ruangan yang tersedia secara otomatis.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Tanggal Ujian CBT / Masuk
                        </label>
                        <input
                          type="date"
                          value={smartScheduleDate}
                          onChange={(e) => setSmartScheduleDate(e.target.value)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Sesi Waktu
                        </label>
                        <select
                          value={smartScheduleSession}
                          onChange={(e) => setSmartScheduleSession(e.target.value)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Sesi Pagi (08:00 - 10:00)">Sesi Pagi (08:00 - 10:00)</option>
                          <option value="Sesi Siang (10:30 - 12:30)">Sesi Siang (10:30 - 12:30)</option>
                          <option value="Sesi Sore (13:30 - 15:30)">Sesi Sore (13:30 - 15:30)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Ruang Ujian / Lab
                        </label>
                        <select
                          value={smartScheduleRoom}
                          onChange={(e) => setSmartScheduleRoom(e.target.value)}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Ruang CBT 1 (Lab Komputer)">Ruang CBT 1 (Lab Komputer)</option>
                          <option value="Ruang CBT 2 (Lab Bahasa)">Ruang CBT 2 (Lab Bahasa)</option>
                          <option value="Aula Utama (Ujian Tertulis)">Aula Utama (Ujian Tertulis)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Kuota Maksimal Sesi Ini
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={smartScheduleQuota}
                          onChange={(e) => setSmartScheduleQuota(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Preview Unscheduled */}
                    {(() => {
                      const unscheduled = candidates.filter(
                        (c) =>
                          (c.stage === "Registered" || c.stage === "Document Review" || c.stage === "Entry Exam") &&
                          !c.examSlot
                      );
                      const willBeScheduled = unscheduled.slice(0, smartScheduleQuota);
                      return (
                        <div className="border border-white/10 rounded-xl p-4 bg-slate-950/60">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-slate-300">
                              Calon Santri Belum Terjadwal ({unscheduled.length} Total):
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Akan Dijadwalkan: {willBeScheduled.length} Orang
                            </span>
                          </div>

                          {unscheduled.length === 0 ? (
                            <p className="text-xs text-slate-500 py-3 text-center">
                              Semua calon santri pada tahap seleksi telah memiliki jadwal ujian masuk.
                            </p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {willBeScheduled.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/5 border border-white/5"
                                >
                                  <div>
                                    <span className="font-semibold text-slate-200">{c.name}</span>
                                    <span className="text-slate-400 text-[11px] ml-2">({c.registrationId}) • {c.grade}</span>
                                  </div>
                                  <span className="text-blue-400 text-[11px] font-mono">
                                    {c.gender === "P" ? "Putri" : "Putra"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {smartTab === "quota" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-300">
                      Rasio penerimaan dan analisis kapasitas daya tampung asrama santri putra vs santri putri.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Putra */}
                      <div className="bg-slate-950 border border-white/10 rounded-xl p-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Santri Putra (L)
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total Pendaftar:</span>
                            <span className="font-bold text-white">{candidates.filter(c => c.gender === "L").length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Diterima (Accepted):</span>
                            <span className="font-bold text-emerald-400">{candidates.filter(c => c.gender === "L" && c.stage === "Accepted").length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Kuota Asrama:</span>
                            <span className="font-bold text-slate-300">60 Santri</span>
                          </div>
                          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                            <div
                              className="bg-blue-500 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.round((candidates.filter(c => c.gender === "L" && c.stage === "Accepted").length / 60) * 100))}%`
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Putri */}
                      <div className="bg-slate-950 border border-white/10 rounded-xl p-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Santri Putri (P)
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total Pendaftar:</span>
                            <span className="font-bold text-white">{candidates.filter(c => c.gender === "P").length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Diterima (Accepted):</span>
                            <span className="font-bold text-emerald-400">{candidates.filter(c => c.gender === "P" && c.stage === "Accepted").length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Kuota Asrama:</span>
                            <span className="font-bold text-slate-300">60 Santri</span>
                          </div>
                          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                            <div
                              className="bg-purple-500 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.round((candidates.filter(c => c.gender === "P" && c.stage === "Accepted").length / 60) * 100))}%`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-white/10 bg-black/40 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsSmartAllocateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Tutup
                </button>
                {smartTab === "promote" && (
                  <button
                    type="button"
                    disabled={isExecutingSmart}
                    onClick={handleExecuteSmartPromote}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isExecutingSmart ? "Memproses..." : "Eksekusi Promosi Otomatis"}</span>
                  </button>
                )}
                {smartTab === "schedule" && (
                  <button
                    type="button"
                    disabled={isExecutingSmart}
                    onClick={handleExecuteSmartSchedule}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isExecutingSmart ? "Menjadwalkan..." : "Alokasikan Jadwal Ujian"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300 transition-all max-w-md",
            toast.type === "success" &&
              "bg-emerald-950/95 border-emerald-500/40 text-emerald-100 shadow-emerald-950/50",
            toast.type === "error" &&
              "bg-rose-950/95 border-rose-500/40 text-rose-100 shadow-rose-950/50",
            toast.type === "info" &&
              "bg-slate-900/95 border-slate-700/60 text-slate-100 shadow-slate-950/50"
          )}
        >
          {toast.type === "success" && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          {toast.type === "error" && (
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          {toast.type === "info" && (
            <AlertCircle className="w-5 h-5 text-sky-400 shrink-0" />
          )}
          <div className="flex-1">
            {toast.title && (
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-0.5">
                {toast.title}
              </div>
            )}
            <div className="text-xs font-medium leading-relaxed">{toast.message}</div>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {printCandidate && (
        <div className="hidden print:block fixed inset-0 z-[99999] bg-white text-black p-8 font-sans">
          {printType === "kartu" ? (
            <div className="max-w-2xl mx-auto border-2 border-black p-8 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Printer className="w-48 h-48" />
              </div>
              <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-center relative z-10">
                <div>
                  <h2 className="text-sm font-bold uppercase text-emerald-800">
                    {systemSettings?.orgInfo?.schoolName || "PONDOK PESANTREN MODERN"}
                  </h2>
                  <h1 className="text-xl font-bold uppercase tracking-wider mt-1">
                    Kartu Ujian Seleksi PPDB
                  </h1>
                  <p className="text-xs text-gray-600 font-medium">
                    {systemSettings?.orgInfo?.address || "Jl. Pesantren No. 1"} • Telp: {systemSettings?.orgInfo?.phone || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold uppercase text-gray-500">
                    Tahun Ajaran
                  </div>
                  <div className="text-base font-bold">
                    {systemSettings?.generalSettings?.academicYear || "2026/2027"}
                  </div>
                </div>
              </div>
              <div className="flex gap-8 relative z-10">
                <div className="w-32 h-40 border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-400 text-sm font-medium bg-gray-50 shrink-0">
                  Pas Foto 3x4
                </div>
                <div className="w-full space-y-4">
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-200 pb-2">
                    <div className="col-span-1 text-sm font-bold text-gray-600">
                      No. Registrasi
                    </div>
                    <div className="col-span-2 text-sm font-mono font-bold text-black border border-gray-300 w-max px-2 py-1 rounded bg-gray-50">
                      {printCandidate.registrationId}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-200 pb-2">
                    <div className="col-span-1 text-sm font-bold text-gray-600">
                      Nama Lengkap
                    </div>
                    <div className="col-span-2 text-sm font-bold uppercase">
                      {printCandidate.name}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-200 pb-2">
                    <div className="col-span-1 text-sm font-bold text-gray-600">
                      Jalur / Tingkat
                    </div>
                    <div className="col-span-2 text-sm font-bold">
                      {printCandidate.grade}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-gray-200 pb-2">
                    <div className="col-span-1 text-sm font-bold text-gray-600">
                      Asal Sekolah
                    </div>
                    <div className="col-span-2 text-sm font-medium">
                      {printCandidate.previousSchool}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 border-t-2 border-black pt-4 flex justify-between items-end relative z-10">
                <div className="text-xs text-gray-500">
                  * Kartu ujian wajib dibawa saat pelaksanaan tes.
                  <br />* Hadir 30 menit sebelum ujian dimulai.
                </div>
                <div className="text-center">
                  <div className="text-sm mb-16 font-medium">Panitia PPDB</div>
                  <div className="text-sm font-bold border-b border-black inline-block px-4">
                    {systemSettings?.orgInfo?.principalName || "Ketua Panitia"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto p-8 relative overflow-hidden">
              <div className="text-center border-b-4 border-double border-black pb-6 mb-8">
                <h2 className="text-base font-bold uppercase text-emerald-900">
                  {systemSettings?.orgInfo?.schoolName || "PONDOK PESANTREN MODERN"}
                </h2>
                <h1 className="text-2xl font-bold uppercase tracking-wider mt-1">
                  Surat Keterangan Hasil Seleksi
                </h1>
                <p className="text-sm text-gray-700 font-medium mt-1">
                  Penerimaan Peserta Didik Baru (PPDB) {systemSettings?.generalSettings?.academicYear || "2026/2027"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {systemSettings?.orgInfo?.address} • Telp: {systemSettings?.orgInfo?.phone}
                </p>
              </div>

              <div className="space-y-6">
                <p className="text-justify text-base">
                  Berdasarkan hasil evaluasi seleksi penerimaan peserta didik baru dan
                  rapat dewan juri panitia PPDB {systemSettings?.orgInfo?.schoolName}, maka dengan ini memutuskan bahwa:
                </p>

                <div className="px-8 space-y-3">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 font-bold">No. Registrasi</div>
                    <div className="col-span-3 font-mono font-bold">
                      : {printCandidate.registrationId}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 font-bold">Nama Lengkap</div>
                    <div className="col-span-3 font-bold uppercase">
                      : {printCandidate.name}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 font-bold">Asal Sekolah</div>
                    <div className="col-span-3">
                      : {printCandidate.previousSchool}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 font-bold">Jenjang Pilihan</div>
                    <div className="col-span-3 font-semibold">
                      : {printCandidate.grade}
                    </div>
                  </div>
                </div>

                <p className="text-justify text-base">
                  Dinyatakan{" "}
                  <strong>
                    {printCandidate.stage === "Accepted"
                      ? "LULUS / DITERIMA SEBAGAI SANTRI BARU"
                      : "TIDAK LULUS"}
                  </strong>{" "}
                  dalam seleksi calon peserta didik baru dan berhak untuk
                  mengikuti proses registrasi selanjutnya.
                </p>

                {printCandidate.stage === "Accepted" && (
                  <div className="bg-gray-100 p-4 rounded-lg mt-6 border border-gray-300">
                    <h4 className="font-bold mb-2">
                      Persyaratan Daftar Ulang:
                    </h4>
                    <ol className="list-decimal pl-5 space-y-1 text-sm">
                      <li>Membayar biaya daftar ulang sesuai ketentuan panitia</li>
                      <li>
                        Menyerahkan berkas dokumen fisik asli (KK, Akta Kelahiran,
                        Ijazah/SKHUN/Rapor)
                      </li>
                      <li>Mengisi form kesediaan mematuhi tata tertib pesantren dan asrama</li>
                    </ol>
                  </div>
                )}

                <div className="mt-16 flex justify-end">
                  <div className="text-center">
                    <div className="text-base mb-20 font-medium">
                      Ketua Panitia PPDB
                    </div>
                    <div className="text-base font-bold border-b border-black">
                      {systemSettings?.orgInfo?.principalName || "Dr. H. Ahmad Dahlan, M.Pd"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Finance Integration Modal */}
      <PPDBFinanceModal
        isOpen={isFinanceModalOpen}
        onClose={() => setIsFinanceModalOpen(false)}
        candidates={candidates}
        settings={systemSettings}
        onRefresh={() => {}}
        showToast={showToast}
        onOpenReceipt={handleOpenReceipt}
      />

      {/* CBT Score Sync Modal */}
      <PPDBCBTSyncModal
        isOpen={isCBTSyncOpen}
        onClose={() => setIsCBTSyncOpen(false)}
        candidates={candidates}
        onRefresh={() => {}}
        showToast={showToast}
      />

      {/* Official Payment Receipt Modal */}
      {receiptCandidate && (
        <PPDBReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          candidate={receiptCandidate}
          settings={systemSettings}
          paymentType={receiptPaymentType}
        />
      )}

      {/* Religious & Tahfidz Assessment Modal */}
      {religiousCandidate && (
        <PPDBReligiousAssessmentModal
          isOpen={isReligiousModalOpen}
          onClose={() => {
            setIsReligiousModalOpen(false);
            setReligiousCandidate(null);
          }}
          candidate={religiousCandidate}
          settings={systemSettings}
          showToast={showToast}
        />
      )}

      {/* WhatsApp Message Preview Modal */}
      {waPreviewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Template Undangan Wawancara WhatsApp</h3>
                  <p className="text-xs text-slate-400">Penerima: {waPreviewData.candidate.name} ({waPreviewData.candidate.phone || "No phone"})</p>
                </div>
              </div>
              <button
                onClick={() => setWaPreviewData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">Isi Pesan Undangan (wa.me):</label>
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                {waPreviewData.message}
              </div>
            </div>
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(waPreviewData.message);
                  showToast("Teks undangan berhasil disalin ke clipboard!", "info");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin Teks
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWaPreviewData(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Tutup
                </button>
                <button
                  onClick={() => {
                    handleSendWhatsAppInterview(waPreviewData.candidate, waPreviewData.slot);
                    setWaPreviewData(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka WhatsApp Web
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Onboarding Modal (Rombel, Asrama & Akun Wali) */}
      {onboardingCandidate && (
        <PPDBOnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() => {
            setIsOnboardingModalOpen(false);
            setOnboardingCandidate(null);
          }}
          candidate={onboardingCandidate}
          candidates={candidates}
          settings={systemSettings}
          onSuccess={(updated) => {
            // Candidate updated in Firestore
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}
