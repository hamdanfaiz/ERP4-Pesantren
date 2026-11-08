import { publicRuntimeConfigValue } from "../runtimeConfig";
import { legacyArchiveImportEnabled } from "../runtimeBackend";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, CalendarDays, Check, ClipboardList, FileText, Loader2, Plus, RefreshCw, ShieldCheck, Users, Wrench } from "lucide-react";
import { getAccessToken } from "../authSession";
import { useAuth } from "../contexts/AuthContext";
import { SupabaseAcademicPortal } from "./SupabaseAcademicPortal";
import { ERPFeatureStatus, ERPTabs } from "../components/ERPDesignSystem";
import { SupabaseModuleReferenceSettings } from "../components/SupabaseReferenceCatalogManager";
import { findAcademicScheduleConflicts } from "../lib/academicScheduleConflicts";

type RecordRow = Record<string, any> & { id: string };
type Student = { id: string; name: string; nis: string; className: string; organizationUnitId?: string | null; organizationUnitName?: string | null };
type Teacher = { id: string; name: string; organizationUnitId?: string | null; organizationUnitName?: string | null };
type Unit = { id: string; name: string; code: string; status: string; unitType: string };
type AcademicClass = { id: string; name: string; organizationUnitId?: string | null };
type AcademicReference = { id: string; code: string; name: string; description?: string; organizationUnitId?: string | null };
type UnmappedAcademicClass = { id: string; name: string; status: string };
type UnmappedAcademicClassSnapshot = { classes: UnmappedAcademicClass[]; classCount: number; limit: number; offset: number };
type PageableAcademicKind = "schedule" | "journal" | "assessment";
type AcademicRecordPageMeta = { hasMore: boolean; nextCursor: string | null };
type Snapshot = { schedules: RecordRow[]; journals: RecordRow[]; assessments: RecordRow[]; recordPages: Record<PageableAcademicKind, AcademicRecordPageMeta>; students: Student[]; studentPage: AcademicRecordPageMeta; teachers: Teacher[]; subjects: AcademicReference[]; curricula: AcademicReference[]; assessmentTypes: AcademicReference[]; facilities: AcademicReference[]; units: Unit[]; unitsEnabled: boolean };
type Tab = "schedule" | "journal" | "assessment" | "report-card" | "conflict-resolver" | "teachers" | "subjects" | "curricula";
type SubjectReference = { name: string; schedules: number; journals: number; assessments: number };
type CurriculumReference = { name: string; schedules: number };

const EMPTY: Snapshot = { schedules: [], journals: [], assessments: [], recordPages: { schedule: { hasMore: false, nextCursor: null }, journal: { hasMore: false, nextCursor: null }, assessment: { hasMore: false, nextCursor: null } }, students: [], studentPage: { hasMore: false, nextCursor: null }, teachers: [], subjects: [], curricula: [], assessmentTypes: [], facilities: [], units: [], unitsEnabled: false };
const EMPTY_UNMAPPED_CLASSES: UnmappedAcademicClassSnapshot = { classes: [], classCount: 0, limit: 100, offset: 0 };
const ACADEMIC_IMPORT_ENABLED = legacyArchiveImportEnabled && publicRuntimeConfigValue("VITE_SUPABASE_ACADEMIC_IMPORT_ENABLED") === "true";
type AcademicImportPreview = {
  snapshotFingerprint: string;
  counts: { schedules: number; journals: number; assessments: number; source: number; ready: number; alreadyImported: number };
  issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }>;
  issueCount: number;
  blockingCount: number;
  canApply: boolean;
};
const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "schedule", label: "Jadwal KBM", icon: CalendarDays },
  { id: "journal", label: "Jurnal KBM", icon: ClipboardList },
  { id: "assessment", label: "Penilaian", icon: BookOpen },
  { id: "report-card", label: "E-Rapor", icon: FileText },
  { id: "conflict-resolver", label: "Konflik Jadwal", icon: Wrench },
  { id: "teachers", label: "Pengajar", icon: Users },
  { id: "subjects", label: "Mata Pelajaran", icon: BookOpen },
  { id: "curricula", label: "Kurikulum", icon: FileText },
];

async function requestAcademic(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sesi Anda telah berakhir. Silakan masuk kembali.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Data akademik belum dapat diproses.");
  return payload;
}

const fieldClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

function AcademicClassPicker({
  label,
  value,
  selectedName,
  unitId,
  unitsEnabled,
  onChange,
}: {
  label: string;
  value: string;
  selectedName: string;
  unitId: string;
  unitsEnabled: boolean;
  onChange: (id: string, name: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestEpoch = useRef(0);

  const loadPage = useCallback(async (search: string, cursor: string | null, append: boolean) => {
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (unitsEnabled && unitId) query.set("unitId", unitId);
      if (cursor) query.set("cursor", cursor);
      const result = await requestAcademic(`/api/academic/classes${query.size ? `?${query.toString()}` : ""}`);
      if (epoch !== requestEpoch.current) return;
      if (!Array.isArray(result.classes) || result.classes.length > 100 || typeof result.hasMore !== "boolean"
        || (result.hasMore && (result.classes.length !== 100 || typeof result.nextCursor !== "string" || !result.nextCursor || result.nextCursor === cursor))
        || (!result.hasMore && result.nextCursor != null)) {
        throw new Error("Halaman pilihan kelas belum lengkap.");
      }
      const loaded = result.classes.map((item: any) => {
        const id = typeof item?.id === "string" ? item.id : "";
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        if (!id || id.length > 160 || !name || name.length > 180) throw new Error("Ada referensi kelas yang tidak valid.");
        return { id, name, organizationUnitId: typeof item.organizationUnitId === "string" ? item.organizationUnitId : null } as AcademicClass;
      });
      setClasses((current) => {
        if (!append) return loaded;
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...loaded.filter((item) => !existing.has(item.id))];
      });
      setAppliedSearch(search);
      setNextCursor(typeof result.nextCursor === "string" ? result.nextCursor : null);
      setHasMore(result.hasMore);
    } catch (loadError: any) {
      if (epoch === requestEpoch.current) setError(loadError?.message || "Daftar kelas belum dapat dimuat.");
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }, [unitId, unitsEnabled]);

  useEffect(() => {
    setSearchInput("");
    setAppliedSearch("");
    setClasses([]);
    setNextCursor(null);
    setHasMore(false);
    void loadPage("", null, false);
    return () => { requestEpoch.current += 1; };
  }, [loadPage]);

  const search = () => void loadPage(searchInput.trim().replace(/\s+/g, " ").normalize("NFC"), null, false);
  return <div className="space-y-2">
    <div className="flex gap-2">
      <input type="search" maxLength={80} className={fieldClass} value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); search(); } }}
        placeholder="Cari nama kelas" aria-label={`Cari ${label.toLocaleLowerCase("id-ID")}`} />
      <button type="button" onClick={search} disabled={loading}
        className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">
        {loading ? "Memuat…" : "Cari"}
      </button>
    </div>
    <select required className={fieldClass} value={value} aria-label={label}
      onChange={(event) => {
        const selected = classes.find((item) => item.id === event.target.value);
        if (selected) onChange(selected.id, selected.name);
        else if (!event.target.value) onChange("", "");
      }}>
      <option value="">Pilih kelas dari Data Induk</option>
      {value && !classes.some((item) => item.id === value) && <option value={value}>{selectedName || "Kelas terpilih"} · dipilih</option>}
      {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>{classes.length} kelas dimuat{appliedSearch ? ` untuk “${appliedSearch}”` : ""}{hasMore ? "; masih ada hasil berikutnya" : ""}.</span>
      {hasMore && <button type="button" onClick={() => void loadPage(appliedSearch, nextCursor, true)} disabled={loading}
        className="font-semibold text-emerald-700 underline disabled:opacity-50 dark:text-emerald-300">Muat kelas berikutnya</button>}
    </div>
    {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
  </div>;
}

function today() { return new Date().toISOString().slice(0, 10); }

export function SupabaseAcademicManager() {
  const { role, user } = useAuth();
  const academicRequestEpoch = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [unitFilter, setUnitFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>("schedule");
  const [conflictSchedules, setConflictSchedules] = useState<RecordRow[]>([]);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const [conflictScannedCount, setConflictScannedCount] = useState(0);
  const conflictRequestEpoch = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadingMoreKind, setLoadingMoreKind] = useState<PageableAcademicKind | null>(null);
  const [studentRoster, setStudentRoster] = useState<Student[]>([]);
  const [studentRosterPage, setStudentRosterPage] = useState<AcademicRecordPageMeta>({ hasMore: false, nextCursor: null });
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentRosterLoading, setStudentRosterLoading] = useState(false);
  const [selectedStudentCache, setSelectedStudentCache] = useState<Student | null>(null);
  const studentRosterRequestEpoch = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [migrationNotice, setMigrationNotice] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<AcademicImportPreview | null>(null);
  const [unmappedClasses, setUnmappedClasses] = useState<UnmappedAcademicClassSnapshot>(EMPTY_UNMAPPED_CLASSES);
  const [classMappingLoading, setClassMappingLoading] = useState(false);
  const [classMappingError, setClassMappingError] = useState("");
  const [classMappingNotice, setClassMappingNotice] = useState("");
  const [classMappingRequest, setClassMappingRequest] = useState("");
  const [classMappingSelections, setClassMappingSelections] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState({ day: "Senin", time: "07:30 - 09:00", subject: "", subjectReferenceId: "", teacherUserId: "", teacherName: "", className: "", classReferenceId: "", room: "", facilityReferenceId: "", curriculum: "", curriculumReferenceId: "", organizationUnitId: "" });
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [journal, setJournal] = useState({ date: today(), className: "", classReferenceId: "", subject: "", subjectReferenceId: "", topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "", teacherUserId: "", teacherName: "", organizationUnitId: "" });
  const [assessment, setAssessment] = useState({ studentId: "", studentName: "", className: "", teacherUserId: "", subject: "", subjectReferenceId: "", assessmentType: "", assessmentTypeReferenceId: "", category: "Formative", score: "" });

  useEffect(() => {
    if (role === "Ustadz" && user?.uid) {
      const currentTeacher = snapshot.teachers.find((teacher) => teacher.id === user.uid);
      const teacherName = currentTeacher?.name || user.name || "";
      if (teacherName) setJournal((current) => ({ ...current, teacherUserId: user.uid, teacherName }));
      setActiveTab("journal");
    }
  }, [role, user?.uid, user?.name, snapshot.teachers]);

  const isAdmin = role === "Admin" || role === "SuperAdmin";
  const canManage = isAdmin || role === "Ustadz";
  const scheduleConflictReport = useMemo(() => findAcademicScheduleConflicts(conflictSchedules), [conflictSchedules]);
  const activeUnits = useMemo(() => snapshot.units.filter((unit) => unit.status === "active"), [snapshot.units]);
  const refreshUnmappedClasses = useCallback(async (offset = 0) => {
    setClassMappingLoading(true);
    setClassMappingError("");
    try {
      const result = await requestAcademic(`/api/academic/classes/unit-assignment/unmapped?offset=${offset}`);
      setUnmappedClasses({
        classes: Array.isArray(result.classes) ? result.classes : [],
        classCount: Number(result.classCount || 0),
        limit: Number(result.limit || 100),
        offset: Number(result.offset || 0),
      });
    } catch (loadError: any) {
      setUnmappedClasses(EMPTY_UNMAPPED_CLASSES);
      setClassMappingError(loadError?.message || "Daftar kelas tanpa unit belum dapat dimuat.");
    } finally { setClassMappingLoading(false); }
  }, []);
  const scheduleUnitId = schedule.organizationUnitId || activeUnits[0]?.id || "";
  const journalUnitId = journal.organizationUnitId || activeUnits[0]?.id || "";
  const forUnit = (items: AcademicReference[], unitId: string) => items.filter((item) => !snapshot.unitsEnabled || !item.organizationUnitId || item.organizationUnitId === unitId);
  const scheduleSubjects = useMemo(() => forUnit(snapshot.subjects, scheduleUnitId), [snapshot.subjects, snapshot.unitsEnabled, scheduleUnitId]);
  const journalSubjects = useMemo(() => forUnit(snapshot.subjects, journalUnitId), [snapshot.subjects, snapshot.unitsEnabled, journalUnitId]);
  const scheduleCurricula = useMemo(() => forUnit(snapshot.curricula, scheduleUnitId), [snapshot.curricula, snapshot.unitsEnabled, scheduleUnitId]);
  const scheduleFacilities = useMemo(() => forUnit(snapshot.facilities, scheduleUnitId), [snapshot.facilities, snapshot.unitsEnabled, scheduleUnitId]);
  const scheduleTeachers = useMemo(() => snapshot.unitsEnabled && isAdmin
    ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === scheduleUnitId)
    : snapshot.teachers, [snapshot.teachers, snapshot.unitsEnabled, isAdmin, scheduleUnitId]);
  const journalTeachers = useMemo(() => snapshot.unitsEnabled && isAdmin
    ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === journalUnitId)
    : snapshot.teachers, [snapshot.teachers, snapshot.unitsEnabled, isAdmin, journalUnitId]);
  const subjectReferences = useMemo(() => {
    const references = new Map<string, SubjectReference>();
    const add = (value: unknown, source: "schedules" | "journals" | "assessments") => {
      const name = String(value || "").trim();
      if (!name) return;
      const key = name.toLocaleLowerCase("id-ID");
      const reference = references.get(key) || { name, schedules: 0, journals: 0, assessments: 0 };
      reference[source] += 1;
      references.set(key, reference);
    };
    snapshot.schedules.forEach((row) => add(row.subject, "schedules"));
    snapshot.journals.forEach((row) => add(row.subject, "journals"));
    snapshot.assessments.forEach((row) => add(row.subject, "assessments"));
    return [...references.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [snapshot.schedules, snapshot.journals, snapshot.assessments]);
  const curriculumReferences = useMemo(() => {
    const references = new Map<string, CurriculumReference>();
    snapshot.schedules.forEach((row) => {
      const name = String(row.curriculum || "").trim();
      if (!name) return;
      const key = name.toLocaleLowerCase("id-ID");
      const reference = references.get(key) || { name, schedules: 0 };
      reference.schedules += 1;
      references.set(key, reference);
    });
    return [...references.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [snapshot.schedules]);

  const refresh = useCallback(async () => {
    const requestEpoch = ++academicRequestEpoch.current;
    studentRosterRequestEpoch.current += 1;
    setStudentRosterLoading(false);
    setLoadingMoreKind(null);
    if (!canManage || !user?.tenantId) { setSnapshot(EMPTY); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams();
      if (unitFilter !== "all") query.set("unitId", unitFilter);
      const queryString = query.toString();
      const payload = await requestAcademic("/api/academic/snapshot" + (queryString ? "?" + queryString : ""));
      if (requestEpoch !== academicRequestEpoch.current) return;
      setSnapshot({
        schedules: Array.isArray(payload.schedules) ? payload.schedules : [],
        journals: Array.isArray(payload.journals) ? payload.journals : [],
        assessments: Array.isArray(payload.assessments) ? payload.assessments : [],
        recordPages: {
          schedule: { hasMore: payload.recordPages?.schedule?.hasMore === true, nextCursor: typeof payload.recordPages?.schedule?.nextCursor === "string" ? payload.recordPages.schedule.nextCursor : null },
          journal: { hasMore: payload.recordPages?.journal?.hasMore === true, nextCursor: typeof payload.recordPages?.journal?.nextCursor === "string" ? payload.recordPages.journal.nextCursor : null },
          assessment: { hasMore: payload.recordPages?.assessment?.hasMore === true, nextCursor: typeof payload.recordPages?.assessment?.nextCursor === "string" ? payload.recordPages.assessment.nextCursor : null },
        },
        students: Array.isArray(payload.students) ? payload.students : [],
        studentPage: { hasMore: payload.studentPage?.hasMore === true, nextCursor: typeof payload.studentPage?.nextCursor === "string" ? payload.studentPage.nextCursor : null },
        teachers: Array.isArray(payload.teachers) ? payload.teachers : [],
        subjects: Array.isArray(payload.subjects) ? payload.subjects : [],
        curricula: Array.isArray(payload.curricula) ? payload.curricula : [],
        assessmentTypes: Array.isArray(payload.assessmentTypes) ? payload.assessmentTypes : [],
        facilities: Array.isArray(payload.facilities) ? payload.facilities : [],
        units: Array.isArray(payload.units) ? payload.units : [],
        unitsEnabled: payload.unitsEnabled === true,
      });
      setStudentRoster(Array.isArray(payload.students) ? payload.students : []);
      setStudentRosterPage({ hasMore: payload.studentPage?.hasMore === true, nextCursor: typeof payload.studentPage?.nextCursor === "string" ? payload.studentPage.nextCursor : null });
      setStudentSearch("");
      setStudentSearchInput("");
      if (payload.unitsEnabled === true && isAdmin) await refreshUnmappedClasses();
      else setUnmappedClasses(EMPTY_UNMAPPED_CLASSES);
    } catch (loadError: any) {
    if (requestEpoch === academicRequestEpoch.current) { setSnapshot(EMPTY); setError("Data akademik belum dapat dimuat. Silakan coba lagi."); }
    } finally { if (requestEpoch === academicRequestEpoch.current) setLoading(false); }
  }, [canManage, isAdmin, refreshUnmappedClasses, user?.tenantId, user?.uid, unitFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadStudentRosterPage = useCallback(async (searchValue: string, cursorValue: string | null = null) => {
    if (loading || studentRosterLoading) return;
    const requestEpoch = ++studentRosterRequestEpoch.current;
    setStudentRosterLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      const normalizedSearch = searchValue.trim().replace(/\s+/g, " ").normalize("NFC");
      if (normalizedSearch) query.set("q", normalizedSearch);
      if (cursorValue) query.set("cursor", cursorValue);
      if (unitFilter !== "all") query.set("unitId", unitFilter);
      const result = await requestAcademic(`/api/academic/students${query.size ? `?${query.toString()}` : ""}`);
      if (requestEpoch !== studentRosterRequestEpoch.current) return;
      if (!Array.isArray(result.students) || result.students.length > 50 || typeof result.hasMore !== "boolean"
        || (result.hasMore && (typeof result.nextCursor !== "string" || !result.nextCursor || result.nextCursor === cursorValue))
        || (!result.hasMore && result.nextCursor != null)) {
        throw new Error("Halaman roster santri belum lengkap.");
      }
      setStudentRoster((current) => {
        if (!cursorValue) return result.students;
        const existing = new Set(current.map((student: Student) => student.id));
        return [...current, ...result.students.filter((student: Student) => !existing.has(student.id))];
      });
      setStudentSearch(normalizedSearch);
      setStudentRosterPage({ hasMore: result.hasMore, nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null });
    } catch (loadError: any) {
      if (requestEpoch === studentRosterRequestEpoch.current) setError(loadError?.message || "Roster santri belum dapat dimuat.");
    } finally {
      if (requestEpoch === studentRosterRequestEpoch.current) setStudentRosterLoading(false);
    }
  }, [loading, studentRosterLoading, unitFilter]);

  const loadMoreAcademicRecords = useCallback(async (kind: PageableAcademicKind) => {
    const page = snapshot.recordPages[kind];
    if (loading || loadingMoreKind || !page.hasMore || !page.nextCursor) return;
    const requestEpoch = academicRequestEpoch.current;
    setLoadingMoreKind(kind); setError("");
    try {
      const query = new URLSearchParams({ kind, cursor: page.nextCursor });
      if (unitFilter !== "all") query.set("unitId", unitFilter);
      const result = await requestAcademic(`/api/academic/records?${query.toString()}`);
      if (requestEpoch !== academicRequestEpoch.current) return;
      if (!Array.isArray(result.records) || typeof result.hasMore !== "boolean"
        || (result.hasMore && (typeof result.nextCursor !== "string" || !result.nextCursor))) {
        throw new Error("Halaman catatan Akademik belum lengkap.");
      }
      setSnapshot((current) => {
        const existing = new Set(current[kind].map((record) => record.id));
        const appended = result.records.filter((record: RecordRow) => !existing.has(String(record.id)));
        return {
          ...current,
          [kind]: [...current[kind], ...appended],
          recordPages: {
            ...current.recordPages,
            [kind]: { hasMore: result.hasMore, nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null },
          },
        };
      });
    } catch (loadError: any) {
      if (requestEpoch === academicRequestEpoch.current) setError(loadError?.message || "Halaman catatan Akademik belum dapat dimuat.");
    } finally { if (requestEpoch === academicRequestEpoch.current) setLoadingMoreKind(null); }
  }, [loading, loadingMoreKind, snapshot.recordPages, unitFilter]);

  const loadConflictSchedules = useCallback(async () => {
    const requestEpoch = ++conflictRequestEpoch.current;
    setConflictSchedules([]);
    setConflictScannedCount(0);
    setConflictLoading(true);
    setConflictError("");
    try {
      const query = new URLSearchParams();
      if (unitFilter !== "all") query.set("unitId", unitFilter);
      const payload = await requestAcademic("/api/academic/schedule-conflicts" + (query.size ? "?" + query.toString() : ""));
      if (requestEpoch !== conflictRequestEpoch.current) return;
      if (payload.complete !== true || !Array.isArray(payload.records)
        || !Number.isSafeInteger(payload.scannedCount) || payload.scannedCount !== payload.records.length) {
        throw new Error("Hasil pemeriksaan konflik jadwal belum lengkap. Muat ulang sebelum mengambil keputusan.");
      }
      setConflictSchedules(payload.records);
      setConflictScannedCount(payload.scannedCount);
    } catch (loadError: any) {
      if (requestEpoch === conflictRequestEpoch.current) {
        setConflictSchedules([]);
        setConflictScannedCount(0);
        setConflictError(loadError?.message || "Pemeriksaan konflik jadwal belum dapat dimuat.");
      }
    } finally {
      if (requestEpoch === conflictRequestEpoch.current) setConflictLoading(false);
    }
  }, [unitFilter]);

  useEffect(() => {
    if (activeTab === "conflict-resolver" && isAdmin) {
      void loadConflictSchedules();
      return;
    }
    conflictRequestEpoch.current += 1;
    setConflictLoading(false);
    setConflictSchedules([]);
    setConflictScannedCount(0);
    setConflictError("");
    if (activeTab === "conflict-resolver" && !isAdmin) setActiveTab("journal");
  }, [activeTab, isAdmin, loadConflictSchedules]);

  if (role === "Santri" || role === "Walisantri") return <SupabaseAcademicPortal />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const form = activeTab === "schedule" ? schedule : activeTab === "journal" ? journal : assessment;
      const editingId = activeTab === "schedule" ? editingScheduleId : "";
      const payload = {
        ...form,
        ...(editingId ? { id: editingId } : {}),
        ...(snapshot.unitsEnabled && activeTab === "schedule" && isAdmin ? { organizationUnitId: scheduleUnitId } : {}),
        ...(snapshot.unitsEnabled && activeTab === "journal" && isAdmin ? { organizationUnitId: journalUnitId } : {}),
        clientRequestId: crypto.randomUUID(),
      };
      await requestAcademic(`/api/academic/${activeTab}`, { method: "POST", body: JSON.stringify({ record: payload }) });
      setNotice(editingId ? "Jadwal berhasil diperbarui." : "Data akademik berhasil disimpan.");
      if (activeTab === "schedule") {
        setEditingScheduleId("");
        setSchedule({ day: "Senin", time: "07:30 - 09:00", subject: "", subjectReferenceId: "", teacherUserId: "", teacherName: "", className: "", classReferenceId: "", room: "", facilityReferenceId: "", curriculum: "", curriculumReferenceId: "", organizationUnitId: scheduleUnitId });
      }
      if (activeTab === "journal") setJournal((current) => ({ ...current, organizationUnitId: journalUnitId, topic: "", competency: "", attendancePresent: "", attendanceAbsent: "", attendanceExcused: "" }));
      if (activeTab === "assessment") setAssessment((current) => ({ ...current, score: "" }));
      await refresh();
    } catch (saveError: any) { setError(saveError?.message || "Data akademik belum dapat disimpan."); }
    finally { setSaving(false); }
  };

  const selectedStudent = studentRoster.find((student) => student.id === assessment.studentId) || selectedStudentCache;
  const assessmentTeachers = snapshot.unitsEnabled && isAdmin
    ? selectedStudent?.organizationUnitId
      ? snapshot.teachers.filter((teacher) => teacher.organizationUnitId === selectedStudent.organizationUnitId)
      : []
    : snapshot.teachers;
  const creatingAcademicRecord = unitFilter !== "unassigned";
  const hasUnitForWrite = !snapshot.unitsEnabled || !isAdmin || activeUnits.length > 0;
  const changeStudent = (studentId: string) => {
    const student = studentRoster.find((item) => item.id === studentId) || null;
    setSelectedStudentCache(student);
    setAssessment((current) => ({ ...current, studentId, studentName: student?.name || "", className: student?.className || "", subject: "", subjectReferenceId: "" }));
  };
  const changeAcademicUnitFilter = (nextUnitFilter: string) => {
    if (nextUnitFilter === unitFilter) return;
    studentRosterRequestEpoch.current += 1;
    setStudentRosterLoading(false);
    setStudentRoster([]);
    setStudentRosterPage({ hasMore: false, nextCursor: null });
    setStudentSearch("");
    setStudentSearchInput("");
    setSelectedStudentCache(null);
    setAssessment((current) => ({ ...current, studentId: "", studentName: "", className: "", subject: "", subjectReferenceId: "" }));
    setUnitFilter(nextUnitFilter);
  };
  const setScheduleSubject = (subjectReferenceId: string) => {
    const selected = snapshot.subjects.find((item) => item.id === subjectReferenceId);
    setSchedule((current) => ({ ...current, subjectReferenceId, subject: selected?.name || "" }));
  };
  const setJournalSubject = (subjectReferenceId: string) => {
    const selected = snapshot.subjects.find((item) => item.id === subjectReferenceId);
    setJournal((current) => ({ ...current, subjectReferenceId, subject: selected?.name || "" }));
  };
  const setAssessmentSubject = (subjectReferenceId: string) => {
    const selected = snapshot.subjects.find((item) => item.id === subjectReferenceId);
    setAssessment((current) => ({ ...current, subjectReferenceId, subject: selected?.name || "" }));
  };
  const setAssessmentType = (assessmentTypeReferenceId: string) => {
    const selected = snapshot.assessmentTypes.find((item) => item.id === assessmentTypeReferenceId);
    setAssessment((current) => ({ ...current, assessmentTypeReferenceId, assessmentType: selected?.name || "" }));
  };
  const setJournalTeacher = (teacherId: string) => {
    const teacher = snapshot.teachers.find((item) => item.id === teacherId);
    setJournal((current) => ({ ...current, teacherUserId: teacherId, teacherName: teacher?.name || "" }));
  };
  const setScheduleTeacher = (teacherId: string) => {
    const teacher = snapshot.teachers.find((item) => item.id === teacherId);
    setSchedule((current) => ({ ...current, teacherUserId: teacherId, teacherName: teacher?.name || "" }));
  };
  const setAssessmentTeacher = (teacherId: string) => setAssessment((current) => ({ ...current, teacherUserId: teacherId }));

  const editConflictedSchedule = (record: RecordRow) => {
    if (snapshot.unitsEnabled && !record.organizationUnitId) {
      setError("Jadwal belum dipetakan ke unit organisasi. Petakan data jadwal terlebih dahulu sebelum mengubahnya.");
      setActiveTab("schedule");
      return;
    }
    setSchedule({
      day: String(record.day || "Senin"), time: String(record.time || ""), subject: String(record.subject || ""), subjectReferenceId: String(record.subjectReferenceId || ""),
      teacherUserId: String(record.teacherUserId || ""), teacherName: String(record.teacherName || ""),
      className: String(record.className || ""), classReferenceId: String(record.classReferenceId || ""), room: String(record.room || ""), facilityReferenceId: String(record.facilityReferenceId || ""),
      curriculum: String(record.curriculum || ""), curriculumReferenceId: String(record.curriculumReferenceId || ""), organizationUnitId: String(record.organizationUnitId || ""),
    });
    setEditingScheduleId(String(record.id));
    setActiveTab("schedule");
    setError("");
    setNotice("Ubah waktu, ruang, kelas, atau pengajar lalu simpan. Bentrok akan diperiksa ulang secara transaksional.");
  };

  const cancelScheduleEdit = () => {
    setEditingScheduleId("");
    setSchedule({ day: "Senin", time: "07:30 - 09:00", subject: "", subjectReferenceId: "", teacherUserId: "", teacherName: "", className: "", classReferenceId: "", room: "", facilityReferenceId: "", curriculum: "", curriculumReferenceId: "", organizationUnitId: scheduleUnitId });
    setError("");
    setNotice("");
  };

  const assignClassUnit = async (classId: string, unitId: string) => {
    setClassMappingRequest(classId);
    setClassMappingError("");
    setClassMappingNotice("");
    try {
      const result = await requestAcademic("/api/academic/classes/unit-assignment", {
        method: "POST",
        body: JSON.stringify({ classId, unitId, clientRequestId: crypto.randomUUID() }),
      });
      setClassMappingNotice(result.alreadyApplied ? "Pemetaan kelas ini sudah tercatat." : "Kelas berhasil dipetakan ke unit.");
      setClassMappingSelections((current) => { const next = { ...current }; delete next[classId]; return next; });
      await refresh();
    } catch (cause: any) {
      setClassMappingError(cause?.message || "Kelas belum dapat dipetakan ke unit.");
    } finally { setClassMappingRequest(""); }
  };

  const previewLegacyImport = async () => {
    setMigrationLoading(true); setMigrationError(""); setMigrationNotice(""); setMigrationPreview(null);
    try {
      const result = await requestAcademic("/api/academic/legacy/import", {
        method: "POST", body: JSON.stringify({ action: "preview" }),
      });
      setMigrationPreview(result as AcademicImportPreview);
    } catch (cause: any) { setMigrationError(cause?.message || "Pratinjau data lama gagal."); }
    finally { setMigrationLoading(false); }
  };

  const applyLegacyImport = async () => {
    if (!migrationPreview?.canApply) return;
    setMigrationLoading(true); setMigrationError(""); setMigrationNotice("");
    try {
      const result = await requestAcademic("/api/academic/legacy/import", {
        method: "POST",
        body: JSON.stringify({ action: "apply", expectedFingerprint: migrationPreview.snapshotFingerprint }),
      });
      setMigrationNotice("Impor selesai: " + Number(result.imported || 0) + " data baru, " + Number(result.skipped || 0) + " data sudah tersedia.");
      setMigrationPreview(null);
      await refresh();
    } catch { setMigrationError("Arsip akademik belum dapat diimpor. Periksa data dan coba lagi."); }
    finally { setMigrationLoading(false); }
  };

  if (!canManage) return <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Akses Akademik tidak tersedia untuk akun ini.</section>;

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Akademik</h1><p className="mt-1 text-sm text-slate-500">Kelola jadwal KBM, jurnal pengajaran, dan penilaian santri.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Muat ulang</button>
    </header>

    {snapshot.unitsEnabled && isAdmin && <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Cakupan unit organisasi</p><p className="mt-1 text-xs text-slate-500">Data lama tanpa pemetaan tetap tersedia melalui filter khusus.</p></div>
      <label className={`${labelClass} sm:min-w-64`}>Tampilkan data
        <select className={fieldClass} value={unitFilter} onChange={(event) => changeAcademicUnitFilter(event.target.value)}>
          <option value="all">Semua unit</option>
          {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          <option value="unassigned">Belum dipetakan</option>
        </select>
      </label>
    </div>}
    {snapshot.unitsEnabled && role === "Ustadz" && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">Cakupan data dibatasi ke unit {activeUnits[0]?.name || "akun Anda"}.</p>}
    {snapshot.unitsEnabled && unitFilter === "unassigned" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Mode ini hanya untuk meninjau arsip yang belum dipetakan. Pencatatan baru dinonaktifkan sampai unit dipilih.</p>}

    {snapshot.unitsEnabled && isAdmin && <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white dark:border-amber-400/20 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-amber-100 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-slate-900 dark:text-white">Pemetaan kelas lama ke unit</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pilih unit berdasarkan data pesantren. Setiap pemetaan dicatat dan tidak dapat dipindahkan lewat tindakan biasa.</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{unmappedClasses.classCount} belum dipetakan</span><button type="button" onClick={() => void refreshUnmappedClasses(unmappedClasses.offset)} disabled={classMappingLoading || Boolean(classMappingRequest)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5" aria-label="Muat ulang kelas tanpa unit"><RefreshCw className={`h-4 w-4 ${classMappingLoading ? "animate-spin" : ""}`} /></button></div>
      </div>
      {classMappingError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{classMappingError}</p>}
      {classMappingNotice && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">{classMappingNotice}</p>}
      {classMappingLoading && unmappedClasses.classes.length === 0 ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat kelas lama…</div>
        : classMappingError ? <div className="p-8 text-center text-sm text-slate-500">Daftar kelas tanpa unit belum dapat diverifikasi.</div>
          : unmappedClasses.classCount === 0 ? <div className="p-8 text-center text-sm text-slate-500">Semua kelas sudah memiliki unit.</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Kelas yang belum dipetakan ke unit organisasi</caption><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Unit yang benar</th><th className="px-4 py-3 text-right">Tindakan</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{unmappedClasses.classes.map((item) => { const selectedUnit = classMappingSelections[item.id] || ""; const pending = classMappingRequest === item.id; return <tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-white">{item.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{item.id}</p></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.status || "—"}</td><td className="px-4 py-3"><select aria-label={`Unit untuk kelas ${item.name}`} className={fieldClass} disabled={Boolean(classMappingRequest) || classMappingLoading || activeUnits.length === 0} value={selectedUnit} onChange={(event) => setClassMappingSelections((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Pilih unit</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></td><td className="px-4 py-3 text-right"><button type="button" className={buttonClass} disabled={!selectedUnit || Boolean(classMappingRequest) || activeUnits.length === 0} onClick={() => void assignClassUnit(item.id, selectedUnit)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pending ? "Menyimpan…" : "Tetapkan"}</button></td></tr>; })}</tbody></table></div>}
      {unmappedClasses.classCount > unmappedClasses.limit && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800"><span>Menampilkan kelas {unmappedClasses.offset + 1}–{Math.min(unmappedClasses.offset + unmappedClasses.limit, unmappedClasses.classCount)} dari {unmappedClasses.classCount}.</span><div className="flex gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-slate-700" disabled={unmappedClasses.offset === 0 || classMappingLoading || Boolean(classMappingRequest)} onClick={() => void refreshUnmappedClasses(Math.max(0, unmappedClasses.offset - unmappedClasses.limit))}>Sebelumnya</button><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-slate-700" disabled={unmappedClasses.offset + unmappedClasses.limit >= unmappedClasses.classCount || classMappingLoading || Boolean(classMappingRequest)} onClick={() => void refreshUnmappedClasses(unmappedClasses.offset + unmappedClasses.limit)}>Berikutnya</button></div></div>}
      {activeUnits.length === 0 && <p className="border-t border-amber-100 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:text-amber-200">Buat unit aktif terlebih dahulu sebelum memetakan kelas.</p>}
    </section>}

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Jadwal termuat", value: `${snapshot.schedules.length}${snapshot.recordPages.schedule.hasMore ? "+" : ""}`, icon: CalendarDays }, { label: "Jurnal termuat", value: `${snapshot.journals.length}${snapshot.recordPages.journal.hasMore ? "+" : ""}`, icon: ClipboardList }, { label: "Penilaian termuat", value: `${snapshot.assessments.length}${snapshot.recordPages.assessment.hasMore ? "+" : ""}`, icon: BookOpen }].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{stat.label}</span><stat.icon className="h-4 w-4 text-emerald-700" /></div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p></article>)}
    </div>

    {isAdmin && ACADEMIC_IMPORT_ENABLED && <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-400/20 dark:bg-violet-400/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-violet-950 dark:text-violet-100">Impor arsip akademik</h2><p className="mt-1 text-sm text-violet-900/80 dark:text-violet-100/70">Tinjau jadwal, jurnal, dan penilaian sebelum menambahkan data.</p></div>
        <button type="button" onClick={() => void previewLegacyImport()} disabled={migrationLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-300/20 dark:bg-slate-900 dark:text-violet-100"><RefreshCw className={migrationLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{migrationLoading ? "Memeriksa…" : "Pratinjau data lama"}</button>
      </div>
      {migrationError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{migrationError}</div>}
      {migrationNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">{migrationNotice}</div>}
      {migrationPreview && <div className="space-y-3 rounded-xl border border-violet-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Jadwal", value: migrationPreview.counts.schedules },
            { label: "Jurnal", value: migrationPreview.counts.journals },
            { label: "Penilaian", value: migrationPreview.counts.assessments },
            { label: "Siap diimpor", value: migrationPreview.counts.ready },
            { label: "Sudah diimpor", value: migrationPreview.counts.alreadyImported },
          ].map((stat) => <div key={stat.label} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs text-slate-500">{stat.label}</div><div className="mt-1 font-semibold text-slate-900 dark:text-white">{stat.value}</div></div>)}
        </div>
        {migrationPreview.issueCount > 0 && <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{migrationPreview.blockingCount} data perlu diperbaiki; {migrationPreview.issueCount - migrationPreview.blockingCount} catatan lain perlu diperhatikan.</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-600 dark:text-slate-300">{migrationPreview.issues.map((issue, index) => <li key={issue.recordRef + issue.code + index} className={issue.severity === "blocking" ? "font-medium text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}>{academicImportIssueLabel(issue.code)}</li>)}</ul>
          {migrationPreview.issueCount > migrationPreview.issues.length && <p className="text-xs text-slate-500">Menampilkan {migrationPreview.issues.length} dari {migrationPreview.issueCount} masalah.</p>}
        </div>}
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Jika data berubah setelah diperiksa, lakukan pemeriksaan ulang. Nama ganda dan jadwal berbenturan perlu dipilih secara manual.</p>
          <button type="button" onClick={() => void applyLegacyImport()} disabled={migrationLoading || !migrationPreview.canApply} className={buttonClass}>{migrationLoading ? "Menerapkan…" : "Terapkan impor"}</button>
        </div>
      </div>}
    </section>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"><Check className="h-4 w-4" />{notice}</div>}

    <ERPTabs tabs={TABS.filter((tab) => !["schedule", "conflict-resolver", "teachers", "subjects", "curricula"].includes(tab.id) || isAdmin).map((tab) => ({ ...tab, icon: <tab.icon className="h-4 w-4" /> }))} value={activeTab} onChange={(id) => { setActiveTab(id as Tab); if (id !== "schedule") setEditingScheduleId(""); setError(""); setNotice(""); }} ariaLabel="Bagian akademik" />
    <SupabaseModuleReferenceSettings domains={["academic_subject", "academic_curriculum", "academic_assessment_type", "academic_grade_level"]} />

    {activeTab === "report-card" ? <ERPFeatureStatus
      title="E-Rapor"
      description="Penyusunan, pengesahan, dan penerbitan rapor semester belum tersedia. Nilai harian tetap dapat dikelola pada bagian Penilaian."
    /> : activeTab === "conflict-resolver" ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Penyelesaian konflik jadwal</h2><p className="mt-1 text-sm text-slate-500">Pemeriksaan mencakup jadwal sesuai filter. Jika jumlahnya melebihi batas pemeriksaan, hasil tidak ditampilkan. Perubahan akan diperiksa kembali saat disimpan.</p>{!conflictLoading && !conflictError && <p className="mt-1 text-xs text-slate-500">{conflictScannedCount.toLocaleString("id-ID")} jadwal berhasil diperiksa.</p>}</div><button type="button" onClick={() => void loadConflictSchedules()} disabled={conflictLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${conflictLoading ? "animate-spin" : ""}`} />Muat ulang</button></div>
      {conflictError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">{conflictError}</div> : conflictLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" />Memeriksa jadwal…</div> : scheduleConflictReport.conflicts.length === 0 ? scheduleConflictReport.invalidRecordIds.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Belum dapat memastikan tidak ada bentrok karena ada jadwal yang formatnya tidak valid.</div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">Tidak ditemukan konflik pada {conflictScannedCount.toLocaleString("id-ID")} jadwal yang diperiksa.</div> : <div className="space-y-3">{scheduleConflictReport.conflicts.map((conflict) => <article key={`${conflict.first.id}:${conflict.second.id}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-400/5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{conflict.day} · {conflict.overlapStart}–{conflict.overlapEnd} · bentrok {conflict.reasons.join(", ").toLocaleLowerCase("id-ID")}</p><div className="mt-3 grid gap-3 md:grid-cols-2">{[conflict.first, conflict.second].map((record) => <div key={record.id} className="rounded-lg border border-amber-200/70 bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-slate-950/50"><p className="font-semibold text-slate-900 dark:text-white">{record.subject || "Mata pelajaran belum diisi"}</p><p className="mt-1 text-slate-600 dark:text-slate-300">{record.time} · {record.className || "Kelas belum diisi"}</p><p className="mt-1 text-xs text-slate-500">{record.teacherName || "Pengajar belum dipetakan"}{record.room ? ` · ${record.room}` : ""}{record.organizationUnitName ? ` · ${record.organizationUnitName}` : ""}</p></div>)}</div></div><div className="flex shrink-0 flex-col gap-2">{[conflict.first, conflict.second].map((record) => { const unitMissing = snapshot.unitsEnabled && !record.organizationUnitId; return <button key={`edit-${record.id}`} type="button" disabled={unitMissing} title={unitMissing ? "Petakan jadwal ke unit sebelum mengubahnya." : `Ubah jadwal ${record.subject || "tanpa nama"}`} onClick={() => editConflictedSchedule(record as RecordRow)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Perbaiki {record.subject || "jadwal"}</button>; })}</div></div></article>)}</div>}
      {scheduleConflictReport.truncated && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Daftar dibatasi hingga 500 konflik agar pemeriksaan tetap responsif. Perbaiki sebagian jadwal, lalu muat ulang untuk melihat sisanya.</div>}
      {scheduleConflictReport.invalidRecordIds.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100"><strong>{scheduleConflictReport.invalidRecordIds.length} jadwal tidak dapat diperiksa.</strong> Format hari/waktunya tidak valid. Tinjau record sebelum menganggap tidak ada bentrok.</div>}
      {snapshot.unitsEnabled && <p className="text-xs text-slate-500">Jadwal tanpa unit organisasi tetap terdeteksi sebagai kemungkinan bentrok, tetapi harus dipetakan sebelum dapat diubah. Perbedaan unit aktif mengikuti batas konflik yang sama dengan penyimpanan jadwal.</p>}
    </section> : activeTab === "teachers" ? <TeacherDirectory loading={loading} teachers={snapshot.teachers} />
      : activeTab === "subjects" ? <SubjectReferenceList loading={loading} items={subjectReferences} />
      : activeTab === "curricula" ? <CurriculumReferenceList loading={loading} items={curriculumReferences} />
      : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? "Jadwal tersimpan" : activeTab === "journal" ? "Jurnal terbaru" : "Penilaian terbaru"}</h2></div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat data…</div> : activeTab === "schedule" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.schedules.length ? snapshot.schedules.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{row.day} · {row.time}</span></div><p className="mt-1 text-sm text-slate-500">{row.className} · {row.teacherName}{row.room ? ` · ${row.room}` : ""}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</article>) : <Empty label="Belum ada jadwal KBM di pesantren ini." />}</div> : activeTab === "journal" ? <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.journals.length ? snapshot.journals.map((row) => <article key={row.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{row.subject} · {row.className}</h3><span className="text-xs text-slate-500">{row.date}</span></div><p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.topic}</p><p className="mt-1 text-xs text-slate-500">Pengajar: {row.teacherName} · {journalAttendanceLabel(row.attendance)}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</article>) : <Empty label="Belum ada jurnal KBM di pesantren ini." />}</div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{snapshot.assessments.length ? snapshot.assessments.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h3 className="font-semibold text-slate-900 dark:text-white">{row.studentName}</h3><p className="mt-1 text-sm text-slate-500">{row.className} · {row.subject} · {row.assessmentType}</p>{snapshot.unitsEnabled && <p className="mt-1 text-xs text-slate-500">Unit: {row.organizationUnitName || "Belum dipetakan"}</p>}</div><span className={`rounded-lg px-3 py-1 text-sm font-bold ${Number(row.score) < 75 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"}`}>{row.score}</span></article>) : <Empty label="Belum ada penilaian di pesantren ini." />}</div>}
        {!loading && activeTab === "schedule" && snapshot.recordPages.schedule.hasMore && <div className="flex justify-center border-t border-slate-100 p-4 dark:border-white/5"><button type="button" onClick={() => void loadMoreAcademicRecords("schedule")} disabled={loadingMoreKind !== null} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{loadingMoreKind === "schedule" ? "Memuat jadwal…" : "Muat jadwal berikutnya"}</button></div>}
        {!loading && activeTab === "journal" && snapshot.recordPages.journal.hasMore && <div className="flex justify-center border-t border-slate-100 p-4 dark:border-white/5"><button type="button" onClick={() => void loadMoreAcademicRecords("journal")} disabled={loadingMoreKind !== null} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{loadingMoreKind === "journal" ? "Memuat jurnal…" : "Muat jurnal berikutnya"}</button></div>}
        {!loading && activeTab === "assessment" && snapshot.recordPages.assessment.hasMore && <div className="flex justify-center border-t border-slate-100 p-4 dark:border-white/5"><button type="button" onClick={() => void loadMoreAcademicRecords("assessment")} disabled={loadingMoreKind !== null} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{loadingMoreKind === "assessment" ? "Memuat penilaian…" : "Muat penilaian berikutnya"}</button></div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold text-slate-900 dark:text-white">{activeTab === "schedule" ? editingScheduleId ? "Perbaiki jadwal" : "Tambah jadwal" : activeTab === "journal" ? "Catat jurnal KBM" : "Input penilaian"}</h2></div>
        {loading ? <p className="text-sm text-slate-500">Memuat data Akademik…</p> : <form onSubmit={submit} className="space-y-4">
          {activeTab === "schedule" && <>
            {snapshot.unitsEnabled && isAdmin && <Field label="Unit organisasi"><select required className={fieldClass} value={scheduleUnitId} onChange={(e) => setSchedule((current) => ({ ...current, organizationUnitId: e.target.value, teacherUserId: "", teacherName: "", subject: "", subjectReferenceId: "", className: "", classReferenceId: "", room: "", facilityReferenceId: "", curriculum: "", curriculumReferenceId: "" }))}><option value="">Pilih unit aktif</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
            <Field label="Hari"><select className={fieldClass} value={schedule.day} onChange={(e) => setSchedule({ ...schedule, day: e.target.value })}>{["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((day) => <option key={day}>{day}</option>)}</select></Field>
            <Field label="Waktu (HH:MM - HH:MM)"><input required className={fieldClass} value={schedule.time} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} placeholder="07:30 - 09:00" /></Field>
            <Field label="Mata pelajaran"><select required className={fieldClass} value={schedule.subjectReferenceId} onChange={(e) => setScheduleSubject(e.target.value)}><option value="">Pilih mata pelajaran</option>{scheduleSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <div className={labelClass}><span className="block">Kelas</span><AcademicClassPicker label="Kelas jadwal KBM" value={schedule.classReferenceId} selectedName={schedule.className} unitId={scheduleUnitId} unitsEnabled={snapshot.unitsEnabled} onChange={(classReferenceId, className) => setSchedule((current) => ({ ...current, classReferenceId, className }))} /></div>
            <Field label="Pengajar"><select required className={fieldClass} value={schedule.teacherUserId} onChange={(e) => setScheduleTeacher(e.target.value)}><option value="">Pilih pengajar</option>{scheduleTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>
            <Field label="Ruang"><select className={fieldClass} value={schedule.facilityReferenceId} onChange={(e) => { const selected = snapshot.facilities.find((item) => item.id === e.target.value); setSchedule((current) => ({ ...current, facilityReferenceId: e.target.value, room: selected?.name || "" })); }}><option value="">Tanpa ruang khusus</option>{scheduleFacilities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Kurikulum"><select required className={fieldClass} value={schedule.curriculumReferenceId} onChange={(e) => { const selected = snapshot.curricula.find((item) => item.id === e.target.value); setSchedule((current) => ({ ...current, curriculumReferenceId: e.target.value, curriculum: selected?.name || "" })); }}><option value="">Pilih kurikulum</option>{scheduleCurricula.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          </>}
          {activeTab === "journal" && <>
            {snapshot.unitsEnabled && isAdmin && <Field label="Unit organisasi"><select required className={fieldClass} value={journalUnitId} onChange={(e) => setJournal((current) => ({ ...current, organizationUnitId: e.target.value, teacherUserId: "", teacherName: "", subject: "", subjectReferenceId: "", className: "", classReferenceId: "" }))}><option value="">Pilih unit aktif</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
            <Field label="Tanggal"><input type="date" required className={fieldClass} value={journal.date} onChange={(e) => setJournal({ ...journal, date: e.target.value })} /></Field>
            <div className={labelClass}><span className="block">Kelas</span><AcademicClassPicker label="Kelas jurnal KBM" value={journal.classReferenceId} selectedName={journal.className} unitId={journalUnitId} unitsEnabled={snapshot.unitsEnabled} onChange={(classReferenceId, className) => setJournal((current) => ({ ...current, classReferenceId, className }))} /></div>
            <Field label="Mata pelajaran"><select required className={fieldClass} value={journal.subjectReferenceId} onChange={(e) => setJournalSubject(e.target.value)}><option value="">Pilih mata pelajaran</option>{journalSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Materi"><textarea required maxLength={2000} rows={3} className={fieldClass} value={journal.topic} onChange={(e) => setJournal({ ...journal, topic: e.target.value })} /></Field>
            <Field label="Kompetensi / catatan"><textarea maxLength={4000} rows={2} className={fieldClass} value={journal.competency} onChange={(e) => setJournal({ ...journal, competency: e.target.value })} /></Field>
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={journal.teacherUserId} onChange={(e) => setJournalTeacher(e.target.value)}><option value="">Pilih pengajar</option>{journalTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <div className="grid grid-cols-3 gap-2">{([["attendancePresent", "Hadir"], ["attendanceExcused", "Izin/sakit"], ["attendanceAbsent", "Absen"]] as const).map(([key, label]) => <label key={key} className={labelClass}>{label}<input type="number" min="0" max="500" className={fieldClass} value={journal[key]} onChange={(e) => setJournal({ ...journal, [key]: e.target.value })} /></label>)}</div>
          </>}
          {activeTab === "assessment" && <>
            <Field label="Santri"><select required className={fieldClass} value={assessment.studentId} onChange={(e) => changeStudent(e.target.value)}><option value="">Pilih santri aktif</option>{assessment.studentId && !studentRoster.some((student) => student.id === assessment.studentId) && <option value={assessment.studentId}>{assessment.studentName || "Santri terpilih"} · dipilih</option>}{studentRoster.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis}</option>)}</select></Field>
            <Field label="Cari santri berdasarkan nama atau NIS"><input type="search" maxLength={80} className={fieldClass} value={studentSearchInput} onChange={(event) => setStudentSearchInput(event.target.value)} placeholder="Ketik nama atau nomor induk" /></Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void loadStudentRosterPage(studentSearchInput)} disabled={loading || studentRosterLoading} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{studentRosterLoading ? "Mencari…" : "Cari santri"}</button>
              {studentRosterPage.hasMore && <button type="button" onClick={() => void loadStudentRosterPage(studentSearch, studentRosterPage.nextCursor)} disabled={loading || studentRosterLoading} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">{studentRosterLoading ? "Memuat…" : "Muat santri berikutnya"}</button>}
              <span className="text-xs text-slate-500">{studentRoster.length.toLocaleString("id-ID")} santri dimuat{studentSearch ? ` untuk “${studentSearch}”` : ""}{studentRosterPage.hasMore ? "; masih ada hasil berikutnya" : ""}.</span>
            </div>
            {!loading && studentRoster.length === 0 && <p role="status" className="text-xs text-amber-700 dark:text-amber-200">{studentSearch ? "Tidak ditemukan santri yang cocok." : "Belum ada santri yang dapat dipilih pada cakupan ini."}</p>}
            {selectedStudent && <p className="-mt-2 text-xs text-slate-500">Kelas {selectedStudent.className || "belum ditetapkan"}{selectedStudent.organizationUnitName ? ` · ${selectedStudent.organizationUnitName}` : snapshot.unitsEnabled ? " · belum dipetakan ke unit" : ""}</p>}
            {isAdmin && <Field label="Pengajar"><select required className={fieldClass} value={assessment.teacherUserId} onChange={(e) => setAssessmentTeacher(e.target.value)}><option value="">Pilih pengajar</option>{assessmentTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>}
            <Field label="Mata pelajaran"><select required className={fieldClass} value={assessment.subjectReferenceId} onChange={(e) => setAssessmentSubject(e.target.value)}><option value="">Pilih mata pelajaran</option>{forUnit(snapshot.subjects, selectedStudent?.organizationUnitId || "").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Jenis penilaian"><select required className={fieldClass} value={assessment.assessmentTypeReferenceId} onChange={(e) => setAssessmentType(e.target.value)}><option value="">Pilih jenis penilaian</option>{snapshot.assessmentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Kategori"><select className={fieldClass} value={assessment.category} onChange={(e) => setAssessment({ ...assessment, category: e.target.value })}><option value="Formative">Formatif</option><option value="Summative">Sumatif</option></select></Field><Field label="Nilai (0–100)"><input type="number" required min="0" max="100" step="any" className={fieldClass} value={assessment.score} onChange={(e) => setAssessment({ ...assessment, score: e.target.value })} /></Field></div>
          </>}
          <button type="submit" disabled={saving || loading || !creatingAcademicRecord || !hasUnitForWrite || (activeTab === "assessment" && (!assessment.studentId || (snapshot.unitsEnabled && !selectedStudent?.organizationUnitId)))} className={`${buttonClass} w-full`}><Plus className="h-4 w-4" />{saving ? "Menyimpan…" : editingScheduleId && activeTab === "schedule" ? "Simpan perubahan" : "Simpan"}</button>
          {editingScheduleId && activeTab === "schedule" && <button type="button" onClick={cancelScheduleEdit} disabled={saving} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">Batalkan perubahan</button>}
          {snapshot.unitsEnabled && isAdmin && activeUnits.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-200">Belum ada unit aktif. Admin perlu menyiapkan unit sebelum pencatatan akademik.</p>}
          {snapshot.unitsEnabled && activeTab === "assessment" && selectedStudent && !selectedStudent.organizationUnitId && <p className="text-xs text-amber-700 dark:text-amber-200">Santri ini belum dipetakan ke unit; nilai belum dapat disimpan agar cakupan unit tetap konsisten.</p>}
          {role === "Ustadz" && <p className="flex items-start gap-2 text-xs text-slate-500"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />Akses roster dibatasi pada kelas yang memiliki jadwal dengan pengajar ini.</p>}
        </form>}
      </section>
    </div>}
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={labelClass}>{label}{children}</label>; }
function Empty({ label }: { label: string }) { return <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500"><BookOpen className="h-5 w-5 opacity-50" />{label}</div>; }
function ReferenceNotice() { return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">Informasi pada bagian ini hanya dapat dilihat. Pengelolaan daftar dapat dilakukan melalui Kategori dan Referensi.</p>; }
function TeacherDirectory({ loading, teachers }: { loading: boolean; teachers: Teacher[] }) {
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
    <div><h2 className="font-semibold text-slate-900 dark:text-white">Pengajar dan Asatidz</h2><p className="mt-1 text-sm text-slate-500">Data profil pengajar pesantren.</p></div>
    <ReferenceNotice />
    {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat profil pengajar…</p> : teachers.length === 0 ? <Empty label="Belum ada profil pengajar pada pesantren ini." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{teachers.map((teacher) => <article key={teacher.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><h3 className="font-medium text-slate-900 dark:text-white">{teacher.name}</h3><p className="mt-1 text-xs text-slate-500">{teacher.organizationUnitName || "Unit belum dipetakan"}</p></article>)}</div>}
  </section>;
}
function SubjectReferenceList({ loading, items }: { loading: boolean; items: SubjectReference[] }) {
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
    <div><h2 className="font-semibold text-slate-900 dark:text-white">Mata Pelajaran</h2><p className="mt-1 text-sm text-slate-500">Daftar nama yang digunakan pada jadwal dan catatan Akademik. Jumlah jurnal dan penilaian mengikuti data yang ditampilkan.</p></div>
    <ReferenceNotice />
    {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat mata pelajaran…</p> : items.length === 0 ? <Empty label="Belum ada mata pelajaran yang tercatat." /> : <div className="divide-y divide-slate-100 dark:divide-white/5">{items.map((item) => <article key={item.name} className="flex flex-wrap items-center justify-between gap-2 py-3"><h3 className="font-medium text-slate-900 dark:text-white">{item.name}</h3><p className="text-xs text-slate-500">Jadwal {item.schedules} · Jurnal {item.journals} · Penilaian {item.assessments}</p></article>)}</div>}
  </section>;
}
function CurriculumReferenceList({ loading, items }: { loading: boolean; items: CurriculumReference[] }) {
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
    <div><h2 className="font-semibold text-slate-900 dark:text-white">Kurikulum</h2><p className="mt-1 text-sm text-slate-500">Kurikulum yang digunakan pada jadwal kegiatan belajar mengajar.</p></div>
    <ReferenceNotice />
    {loading ? <p role="status" className="py-8 text-sm text-slate-500">Memuat kurikulum…</p> : items.length === 0 ? <Empty label="Belum ada kurikulum yang tercatat pada jadwal." /> : <div className="divide-y divide-slate-100 dark:divide-white/5">{items.map((item) => <article key={item.name} className="flex flex-wrap items-center justify-between gap-2 py-3"><h3 className="font-medium text-slate-900 dark:text-white">{item.name}</h3><p className="text-xs text-slate-500">Digunakan pada {item.schedules} jadwal</p></article>)}</div>}
  </section>;
}
function academicImportIssueLabel(code: string) {
  const labels: Record<string, string> = {
    record_limit_exceeded: "Jumlah data melebihi batas 3.000 baris.",
    invalid_source_record: "Sebagian data sumber belum sesuai.",
    invalid_source_record_id: "Identitas sebagian data sumber belum sesuai.",
    duplicate_source_id: "Ada data dengan identitas yang tercatat lebih dari sekali.",
    source_changed_after_import: "Sebagian data yang sudah pernah diimpor telah berubah.",
    ambiguous_class: "Nama kelas cocok ke lebih dari satu kelas.",
    class_not_found: "Kelas belum tersedia atau tidak cocok di Data Induk.",
    ambiguous_teacher: "Nama pengajar cocok dengan lebih dari satu profil.",
    teacher_not_found: "Pengajar aktif belum ditemukan.",
    invalid_schedule: "Format jadwal atau mata pelajaran belum sesuai.",
    invalid_journal: "Tanggal, materi, atau isi jurnal belum sesuai.",
    attendance_student_mapping_failed: "Nama/status kehadiran santri tidak dapat dipetakan dengan aman.",
    attendance_summary_invalid: "Ringkasan kehadiran tidak valid.",
    attendance_summary_only: "Sumber hanya menyimpan jumlah hadir/total; rincian status tidak tersedia.",
    attendance_count_out_of_range: "Jumlah kehadiran melewati batas.",
    ambiguous_student: "Nama santri cocok dengan lebih dari satu orang.",
    student_not_found: "Santri aktif tidak ditemukan pada kelas tersebut.",
    invalid_assessment: "Nilai atau informasi penilaian tidak valid.",
    invalid_original_score: "Nilai awal remedial tidak valid.",
    schedule_overlap: "Jadwal berbenturan untuk pengajar, ruang, atau kelas.",
  };
  return labels[code] || "Perlu pemeriksaan manual.";
}
function journalAttendanceLabel(attendance: Record<string, any> | undefined) {
  if (attendance?.legacyBreakdownUnavailable) {
    return "Hadir " + Number(attendance.present || 0) + "/" + Number(attendance.legacyTotal || 0) + " · rincian status tidak tersedia";
  }
  return "Hadir " + Number(attendance?.present || 0) + ", izin/sakit " + Number(attendance?.excused || 0) + ", absen " + Number(attendance?.absent || 0);
}

