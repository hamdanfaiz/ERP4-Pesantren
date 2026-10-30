import { readPostgrestRowsInPages } from "./postgrestPagination";
import { createHmac } from "node:crypto";
import { academicSupabaseRequest, resolveAcademicTenantId, SupabaseAcademicError } from "./supabaseAcademic";

type Row = Record<string, any>;
export type LegacyAcademicSourceRow = { collection: string; id: string; data: Row };

const COLLECTION_KIND: Record<string, "schedule" | "journal" | "assessment"> = {
  academic_schedules: "schedule",
  academic_journals: "journal",
  academic_assessments: "assessment",
};

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const result: Row = {};
    for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}

function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseAcademicError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stableValue(value))).digest("hex");
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

function recordRef(source: LegacyAcademicSourceRow) {
  return fingerprint(source.collection + "\u0000" + source.id).slice(0, 12);
}

function timeParts(value: unknown) {
  const match = String(value || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d) - ([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return end > start ? { start, end } : null;
}

function overlaps(left: Row, right: Row) {
  if (left.day !== right.day) return false;
  const a = timeParts(left.time), b = timeParts(right.time);
  if (!a || !b || a.start >= b.end || a.end <= b.start) return false;
  return Boolean((left.teacherUserId && left.teacherUserId === right.teacherUserId)
    || (String(left.room || "").trim() && normalized(left.room) === normalized(right.room))
    || left.className === right.className);
}

function attendanceStatus(value: unknown): "present" | "absent" | "excused" | null {
  const status = normalized(value);
  if (["hadir", "present"].includes(status)) return "present";
  if (["sakit", "izin", "excused", "sick", "permission"].includes(status)) return "excused";
  if (["ghaib", "gaib", "absen", "alfa", "alpha", "absent"].includes(status)) return "absent";
  return null;
}

function active(row: Row, excluded: string[]) {
  return !excluded.includes(String(row.status || "").trim().toLowerCase());
}

export async function getSupabaseAcademicLegacyTenantKey(tenantIdentifier: string) {
  const tenantId = await resolveAcademicTenantId(tenantIdentifier);
  const query = new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" });
  const rows = await academicSupabaseRequest("/rest/v1/tenants?" + query.toString());
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabaseAcademicError(403, "Tenant Akademik tidak ditemukan.");
  const legacyTenantKey = String(rows[0].legacy_tenant_key || "").trim();
  if (!legacyTenantKey) throw new SupabaseAcademicError(409, "Tenant belum memiliki pemetaan sumber Firebase lama.");
  return { tenantId, legacyTenantKey };
}

async function loadAcademicImportContext(tenantId: string) {
  const [studentRows, staffRows, classRows, existingRows] = await Promise.all([
    readPostgrestRowsInPages<Row>({
      request: academicSupabaseRequest,
      path: `/rest/v1/students?${new URLSearchParams({ tenant_id: "eq." + tenantId, select: "id,name,status,class_id,grade,details", order: "id.asc" })}`,
      maxRows: 5000,
      verifyStableSnapshot: true,
      onIncomplete: () => new SupabaseAcademicError(503, "Roster santri melewati batas aman pratinjau migrasi atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request: academicSupabaseRequest,
      path: `/rest/v1/profiles?${new URLSearchParams({ tenant_id: "eq." + tenantId, select: "user_id,display_name", role: "eq.ustadz", status: "eq.active", order: "display_name.asc,user_id.asc" })}`,
      uniqueOrderColumn: "user_id",
      maxRows: 500,
      verifyStableSnapshot: true,
      onIncomplete: () => new SupabaseAcademicError(503, "Daftar pengajar melewati batas aman pratinjau migrasi atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request: academicSupabaseRequest,
      path: `/rest/v1/master_data_records?${new URLSearchParams({ tenant_id: "eq." + tenantId, select: "id,name,status", category: "eq.Kelas", order: "name.asc,id.asc" })}`,
      maxRows: 500,
      verifyStableSnapshot: true,
      onIncomplete: () => new SupabaseAcademicError(503, "Daftar kelas melewati batas aman pratinjau migrasi atau hasil pemindaian tidak lengkap."),
    }),
    readPostgrestRowsInPages<Row>({
      request: academicSupabaseRequest,
      path: `/rest/v1/academic_records?${new URLSearchParams({ tenant_id: "eq." + tenantId, select: "id,kind,teacher_user_id,record_data,source_system,source_record_id,source_fingerprint,deleted_at", order: "id.asc" })}`,
      maxRows: 5000,
      verifyStableSnapshot: true,
      onIncomplete: () => new SupabaseAcademicError(503, "Data akademik terimpor melewati batas aman pratinjau migrasi atau hasil pemindaian tidak lengkap."),
    }),
  ]);
  return {
    students: studentRows, staff: staffRows, classes: classRows, existing: existingRows,
  };
}
function preview(sourceRows: LegacyAcademicSourceRow[], context: Awaited<ReturnType<typeof loadAcademicImportContext>>) {
  const sources = sourceRows
    .filter((row) => Boolean(COLLECTION_KIND[row.collection]))
    .map((row) => ({ collection: row.collection, id: String(row.id || ""), data: stableValue(row.data || {}) as Row }))
    .sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources);
  const counts = { schedules: 0, journals: 0, assessments: 0, source: sources.length, ready: 0, alreadyImported: 0 };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }> = [];
  const addIssue = (row: LegacyAcademicSourceRow, code: string, severity: "blocking" | "warning" = "blocking") => {
    issues.push({ code, recordRef: recordRef(row), severity });
  };
  if (sources.length > 3000) {
    issues.push({ code: "record_limit_exceeded", recordRef: "", severity: "blocking" });
    return { snapshotFingerprint, counts, issues: issues.slice(0, 50), issueCount: issues.length, blockingCount: 1, canApply: false, items: [] as Row[] };
  }

  const classIndex = new Map<string, Row[]>();
  for (const row of context.classes) {
    if (!active(row, ["inactive", "nonaktif", "disabled", "arsip"])) continue;
    const key = normalized(row.name);
    if (key) classIndex.set(key, [...(classIndex.get(key) || []), row]);
  }
  const teacherIndex = new Map<string, Row[]>();
  for (const row of context.staff) {
    const key = normalized(row.display_name);
    if (key) teacherIndex.set(key, [...(teacherIndex.get(key) || []), row]);
  }
  const activeClassesById = new Map<string, string>(context.classes
    .filter((item) => active(item, ["inactive", "nonaktif", "disabled", "arsip"]))
    .map((item): [string, string] => [String(item.id), String(item.name || "")]));
  const classForStudent = (row: Row) => {
    const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
    return activeClassesById.get(String(row.class_id || "")) || details.className || row.grade || "";
  };
  const studentsByNameClass = new Map<string, Row[]>();
  for (const student of context.students.filter((row) => active(row, ["archived", "alumni", "graduated", "inactive", "nonaktif", "dikeluarkan"]))) {
    const key = normalized(student.name) + "\u0000" + normalized(classForStudent(student));
    if (key !== "\u0000") studentsByNameClass.set(key, [...(studentsByNameClass.get(key) || []), student]);
  }
  const existingBySource = new Map<string, Row>();
  const currentSchedules: Row[] = [];
  for (const row of context.existing) {
    if (row.kind === "schedule" && !row.deleted_at) currentSchedules.push({ ...(row.record_data || {}), teacherUserId: row.teacher_user_id || null });
    if (row.source_system === "legacy_firestore" && row.source_record_id) {
      existingBySource.set(String(row.kind) + "\u0000" + String(row.source_record_id), row);
    }
  }
  const items: Row[] = [];
  const schedules: Array<{ source: LegacyAcademicSourceRow; data: Row }> = [];
  const seenSourceIds = new Set<string>();

  for (const source of sources) {
    const kind = COLLECTION_KIND[source.collection];
    if (kind === "schedule") counts.schedules += 1;
    if (kind === "journal") counts.journals += 1;
    if (kind === "assessment") counts.assessments += 1;
    const data = source.data;
    if (!source.id || !data || typeof data !== "object" || Array.isArray(data)) { addIssue(source, "invalid_source_record"); continue; }
    const sourceRecordId = String(data.id || source.id).trim();
    const uniqueSourceKey = kind + "\u0000" + sourceRecordId;
    if (!sourceRecordId || sourceRecordId.length > 300) { addIssue(source, "invalid_source_record_id"); continue; }
    if (seenSourceIds.has(uniqueSourceKey)) { addIssue(source, "duplicate_source_id"); continue; }
    seenSourceIds.add(uniqueSourceKey);
    const sourceFingerprint = fingerprint(data);
    const prior = existingBySource.get(uniqueSourceKey);
    if (prior) {
      if (prior.source_fingerprint !== sourceFingerprint) addIssue(source, "source_changed_after_import");
      else counts.alreadyImported += 1;
      continue;
    }

    const matchingClasses = classIndex.get(normalized(data.class)) || [];
    if (matchingClasses.length !== 1) { addIssue(source, matchingClasses.length ? "ambiguous_class" : "class_not_found"); continue; }
    const className = String(matchingClasses[0].name || "").trim();
    let recordData: Row | null = null;
    let teacher: Row | undefined;
    if (kind === "schedule" || kind === "journal") {
      const matchingTeachers = teacherIndex.get(normalized(data.teacher)) || [];
      if (matchingTeachers.length !== 1) { addIssue(source, matchingTeachers.length ? "ambiguous_teacher" : "teacher_not_found"); continue; }
      teacher = matchingTeachers[0];
    }

    if (kind === "schedule") {
      const day = String(data.day || "").trim();
      const time = String(data.time || "").trim().replace(/\s+/g, " ");
      const subject = String(data.subject || "").trim();
      if (!["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].includes(day)
        || !timeParts(time) || !subject || subject.length > 150) { addIssue(source, "invalid_schedule"); continue; }
      recordData = {
        day, time, subject, className, teacherName: String(teacher?.display_name || "").trim(),
        teacherUserId: String(teacher?.user_id || ""), room: String(data.room || "").trim(), curriculum: String(data.curriculum || "").trim(),
      };
      schedules.push({ source, data: recordData });
    } else if (kind === "journal") {
      const date = String(data.date || "").trim();
      const topic = String(data.topic || "").trim();
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
        && Number.isFinite(new Date(date + "T00:00:00.000Z").getTime())
        && new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) === date;
      const subject = String(data.subject || "").trim();
      const competency = String(data.competency || "").trim();
      if (!validDate || !topic || topic.length > 2000 || competency.length > 4000 || !subject || subject.length > 150) {
        addIssue(source, "invalid_journal"); continue;
      }
      const studentStatuses: Row = {};
      let present = 0, absent = 0, excused = 0;
      const detailedAttendance = Boolean(data.studentAttendance && typeof data.studentAttendance === "object"
        && !Array.isArray(data.studentAttendance) && Object.keys(data.studentAttendance).length);
      if (detailedAttendance) {
        let invalid = false;
        for (const [studentName, value] of Object.entries(data.studentAttendance)) {
          const studentMatches = studentsByNameClass.get(normalized(studentName) + "\u0000" + normalized(className)) || [];
          const status = attendanceStatus(value);
          if (studentMatches.length !== 1 || !status) { invalid = true; break; }
          const studentId = String(studentMatches[0].id);
          if (studentStatuses[studentId]) { invalid = true; break; }
          studentStatuses[studentId] = status;
          if (status === "present") present += 1;
          else if (status === "absent") absent += 1;
          else excused += 1;
        }
        if (invalid) { addIssue(source, "attendance_student_mapping_failed"); continue; }
      } else {
        const aggregate = String(data.attendance || "").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
        if (!aggregate || Number(aggregate[1]) > Number(aggregate[2]) || Number(aggregate[2]) > 500) {
          addIssue(source, "attendance_summary_invalid"); continue;
        }
        present = Number(aggregate[1]);
        absent = 0;
        addIssue(source, "attendance_summary_only", "warning");
      }
      if (present + absent + excused > 500) { addIssue(source, "attendance_count_out_of_range"); continue; }
      recordData = {
        date, className, subject, topic, competency, teacherUserId: String(teacher?.user_id || ""),
        teacherName: String(teacher?.display_name || "").trim(), status: String(data.status || "Completed").slice(0, 40),
        attendance: {
          present, absent, excused,
          ...(Object.keys(studentStatuses).length ? { studentStatuses } : {}),
          ...(!detailedAttendance ? {
            legacyTotal: Number(String(data.attendance || "").trim().match(/^(\d+)\s*\/\s*(\d+)$/)?.[2] || 0),
            legacyBreakdownUnavailable: true,
          } : {}),
        },
      };
    } else {
      const studentName = String(data.student || data.studentName || "").trim();
      const matches = studentsByNameClass.get(normalized(studentName) + "\u0000" + normalized(className)) || [];
      const rawScore = data.score;
      const score = typeof rawScore === "number" ? rawScore
        : rawScore === null || rawScore === undefined || String(rawScore).trim() === "" ? Number.NaN : Number(String(rawScore));
      const assessmentType = String(data.type || data.assessmentType || "").trim();
      const subject = String(data.subject || "").trim();
      if (matches.length !== 1) { addIssue(source, matches.length ? "ambiguous_student" : "student_not_found"); continue; }
      if (!Number.isFinite(score) || score < 0 || score > 100 || !assessmentType || assessmentType.length > 100 || !subject || subject.length > 150) {
        addIssue(source, "invalid_assessment"); continue;
      }
      const category = data.category === "Summative" || data.category === "Formative"
        ? data.category : /PTS|UAS|Ujian/i.test(assessmentType) ? "Summative" : "Formative";
      const originalScore = data.originalScore === undefined || data.originalScore === null ? undefined : Number(data.originalScore);
      if (originalScore !== undefined && (!Number.isFinite(originalScore) || originalScore < 0 || originalScore > 100)) {
        addIssue(source, "invalid_original_score"); continue;
      }
      recordData = {
        studentId: String(matches[0].id), studentName: String(matches[0].name || "").trim(), className,
        teacherUserId: null, subject, assessmentType, category, score,
        remedialStatus: String(data.remedialStatus || (score < 75 ? "Needed" : "None")).slice(0, 30),
        ...(originalScore === undefined ? {} : { originalScore }),
      };
    }
    if (recordData) items.push({ kind, sourceRecordId, sourceFingerprint, recordData, recordRef: recordRef(source) });
  }

  for (let i = 0; i < schedules.length; i += 1) {
    if (currentSchedules.some((item) => overlaps(schedules[i].data, item))
      || schedules.slice(0, i).some((item) => overlaps(schedules[i].data, item.data))) {
      addIssue(schedules[i].source, "schedule_overlap");
    }
  }
  const blockingRefs = new Set(issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.recordRef));
  const safeItems = items.filter((item) => !blockingRefs.has(item.recordRef)).map(({ recordRef: _ref, ...item }) => item);
  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  counts.ready = safeItems.length;
  return {
    snapshotFingerprint, counts, issues: issues.slice(0, 50), issueCount: issues.length, blockingCount,
    canApply: blockingCount === 0 && safeItems.length > 0, items: safeItems,
  };
}

export async function previewSupabaseLegacyAcademic(tenantIdentifier: string, sourceRows: LegacyAcademicSourceRow[]) {
  const { tenantId } = await getSupabaseAcademicLegacyTenantKey(tenantIdentifier);
  const context = await loadAcademicImportContext(tenantId);
  const result = preview(sourceRows, context);
  const { items: _items, ...publicResult } = result;
  return publicResult;
}

export async function importSupabaseLegacyAcademic(
  tenantIdentifier: string,
  actorId: string,
  sourceRows: LegacyAcademicSourceRow[],
  expectedFingerprint: string,
) {
  const { tenantId } = await getSupabaseAcademicLegacyTenantKey(tenantIdentifier);
  const context = await loadAcademicImportContext(tenantId);
  const checked = preview(sourceRows, context);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || checked.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseAcademicError(409, "Snapshot sumber berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan migrasi.");
  }
  if (!checked.canApply) throw new SupabaseAcademicError(409, "Pratinjau memiliki masalah pemetaan atau bentrokan. Selesaikan semua masalah sebelum menerapkan migrasi.");
  const saved = await academicSupabaseRequest("/rest/v1/rpc/import_legacy_academic_records", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: checked.snapshotFingerprint,
      p_items: checked.items,
    }),
  });
  return { snapshotFingerprint: checked.snapshotFingerprint, counts: checked.counts, imported: Number(saved?.imported || 0), skipped: Number(saved?.skipped || 0) };
}
