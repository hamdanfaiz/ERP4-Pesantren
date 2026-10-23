import { createHmac } from "node:crypto";
import {
  applySupabaseLegacyLibraryCirculations as applySupabaseLegacyLibraryCirculationsRpc,
  SupabaseLibraryError,
} from "./supabaseLibrary";

type Row = Record<string, any>;
export type LegacyLibraryCirculationSources = Array<{ id: string; data: Row }>;
export type LegacyLibraryCirculationContext = {
  books: Row[];
  students: Row[];
  existingCirculations: Row[];
};
export type LegacyLibraryStudentMappings = Record<string, string>;

const MAX_SOURCE_ROWS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hmac(value: string) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseLibraryError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(value).digest("hex");
}

function fingerprint(value: unknown) {
  return hmac(JSON.stringify(stableValue(value)));
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableSource(value: Row) {
  const entries = Object.entries(value)
    .filter(([key]) => key !== "tenantId" && key !== "tenant_id")
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function sourceId(namespace: string, id: string) {
  // Keep the exact JSON-string HMAC encoding used by the catalog importer.
  return fingerprint(`${namespace}\u0000${id}`);
}

function recordRef(id: string) {
  return sourceId("library-circulation", id).slice(0, 16);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function parseLegacyDate(value: unknown): string | null {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function mapStatus(value: unknown): "active" | "returned" | null {
  const status = normalized(value);
  if (["active", "borrowed", "overdue", "dipinjam", "terlambat"].includes(status)) return "active";
  if (["returned", "return", "dikembalikan", "kembali", "selesai"].includes(status)) return "returned";
  return null;
}

function asSources(sourceRows: LegacyLibraryCirculationSources) {
  return [...(sourceRows || [])]
    .map((row) => ({
      id: String(row?.id || "").trim(),
      data: row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function previewSupabaseLegacyLibraryCirculations(
  sourceRows: LegacyLibraryCirculationSources,
  context: LegacyLibraryCirculationContext,
  studentMappings: LegacyLibraryStudentMappings = {},
) {
  const sources = asSources(sourceRows || []);
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, active: 0, returned: 0, invalid: 0 };
  const issues: Array<{ code: string; recordRef: string }> = [];
  const warnings: Array<{ code: string; recordRef: string }> = [];
  const records: Array<{
    recordRef: string; borrower: string; sourceBookTitle: string; targetBookTitle: string;
    borrowedOn: string | null; dueOn: string | null; returnedOn: string | null;
    status: "active" | "returned" | null; studentId: string; studentName: string;
    alreadyImported: boolean; issues: string[]; warnings: string[];
  }> = [];
  const items: Row[] = [];
  const issue = (code: string, ref: string, rowIssues: string[]) => {
    issues.push({ code, recordRef: ref });
    rowIssues.push(code);
  };
  if (sources.length > MAX_SOURCE_ROWS) {
    return {
      snapshotFingerprint: fingerprint({ overflow: sources.length }), counts,
      issues: [{ code: "record_limit_exceeded", recordRef: "" }], warnings, records,
      issueCount: 1, blockingCount: 1, canApply: false, items,
    };
  }

  const booksBySource = new Map<string, Row>();
  for (const book of context?.books || []) {
    if (book.source_system === "legacy_import" && book.source_record_id) booksBySource.set(String(book.source_record_id), book);
  }
  const studentsById = new Map<string, Row>();
  for (const student of context?.students || []) {
    if (UUID.test(String(student.id || ""))) studentsById.set(String(student.id), student);
  }
  const existingBySource = new Map<string, Row>();
  for (const circulation of context?.existingCirculations || []) {
    if (circulation.source_system === "legacy_import" && circulation.source_record_id) {
      existingBySource.set(String(circulation.source_record_id), circulation);
    }
  }

  const seenIds = new Set<string>();
  const seenRefs = new Set<string>();
  const effectiveMappings: Array<[string, string]> = [];
  for (const source of sources) {
    const ref = source.id ? recordRef(source.id) : "";
    const rowIssues: string[] = [];
    const rowWarnings: string[] = [];
    if (!source.id || source.id.length > 1500) {
      issue("invalid_source_record_id", ref, rowIssues);
      records.push({ recordRef: ref, borrower: "", sourceBookTitle: "", targetBookTitle: "", borrowedOn: null, dueOn: null, returnedOn: null, status: null, studentId: "", studentName: "", alreadyImported: false, issues: rowIssues, warnings: rowWarnings });
      continue;
    }
    const sourceRecordId = sourceId("library-circulation", source.id);
    if (seenIds.has(sourceRecordId) || seenRefs.has(ref)) {
      issue("duplicate_source_record", ref, rowIssues);
      records.push({ recordRef: ref, borrower: "", sourceBookTitle: "", targetBookTitle: "", borrowedOn: null, dueOn: null, returnedOn: null, status: null, studentId: "", studentName: "", alreadyImported: false, issues: rowIssues, warnings: rowWarnings });
      continue;
    }
    seenIds.add(sourceRecordId);
    seenRefs.add(ref);

    const raw = source.data;
    const sourceFingerprint = fingerprint(stableSource(raw));
    const borrower = text(raw.student).slice(0, 180);
    const sourceBookTitle = text(raw.bookTitle).slice(0, 240);
    const sourceBookId = text(raw.bookId);
    const book = sourceBookId ? booksBySource.get(sourceId("library-book", sourceBookId)) : undefined;
    const borrowedOn = parseLegacyDate(raw.borrowDate);
    const dueOn = parseLegacyDate(raw.dueDate);
    const returnedValue = raw.returnedDate ?? raw.returnDate ?? raw.returnedOn;
    const returnedOn = returnedValue == null || returnedValue === "" ? null : parseLegacyDate(returnedValue);
    const status = mapStatus(raw.status);
    const existing = existingBySource.get(sourceRecordId);
    const requestedStudentId = String(studentMappings?.[ref] || "").trim();
    const studentId = requestedStudentId || String(existing?.student_id || "");
    const student = studentId ? studentsById.get(studentId) : undefined;
    let alreadyImported = false;

    if (!borrower) issue("borrower_name_missing", ref, rowIssues);
    if (!sourceBookTitle) issue("book_title_missing", ref, rowIssues);
    if (!sourceBookId || !book) issue("book_not_imported_by_source_id", ref, rowIssues);
    if (!borrowedOn) issue("invalid_borrow_date", ref, rowIssues);
    if (!dueOn) issue("invalid_due_date", ref, rowIssues);
    if (borrowedOn && dueOn && (dueOn < borrowedOn || dueOn > addCalendarDays(borrowedOn, 90))) issue("due_date_out_of_range", ref, rowIssues);
    if (!status) issue("unsupported_status", ref, rowIssues);
    if (status === "returned" && !returnedOn) issue("returned_date_missing_or_invalid", ref, rowIssues);
    if (status === "active" && returnedOn) issue("active_record_has_returned_date", ref, rowIssues);
    if (typeof raw.fine !== "number" || !Number.isFinite(raw.fine) || raw.fine !== 0) issue("fine_requires_finance_reconciliation", ref, rowIssues);
    if (!studentId) issue("student_mapping_required", ref, rowIssues);
    else if (!UUID.test(studentId) || !student) issue("student_not_found_in_tenant", ref, rowIssues);
    if (requestedStudentId && student && normalized(borrower) !== normalized(student.name)) issue("student_name_mismatch_review_identity", ref, rowIssues);

    if (existing) {
      const unchanged = existing.source_fingerprint === sourceFingerprint
        && String(existing.book_id) === String(book?.id || "")
        && String(existing.student_id) === String(studentId)
        && String(existing.borrowed_on) === String(borrowedOn || "")
        && String(existing.due_on) === String(dueOn || "")
        && String(existing.returned_on || "") === String(returnedOn || "")
        && String(existing.status) === String(status || "");
      if (unchanged) {
        alreadyImported = true;
        counts.alreadyImported += 1;
      } else {
        issue("imported_record_changed_or_mapping_conflict", ref, rowIssues);
      }
    }

    if (rowIssues.length === 0 && book && student && borrowedOn && dueOn && status) {
      effectiveMappings.push([ref, studentId]);
      items.push({ sourceRecordId, sourceFingerprint, bookId: String(book.id), studentId, borrowedOn, dueOn, returnedOn, status });
      if (status === "active") counts.active += 1;
      else counts.returned += 1;
      counts.ready += 1;
    } else counts.invalid += 1;
    records.push({ recordRef: ref, borrower, sourceBookTitle, targetBookTitle: String(book?.title || ""), borrowedOn, dueOn, returnedOn, status, studentId, studentName: String(student?.name || ""), alreadyImported, issues: rowIssues, warnings: rowWarnings });
  }

  const snapshotFingerprint = fingerprint({
    source: sources.map((row) => ({ id: sourceId("library-circulation", row.id), data: stableSource(row.data) })),
    mappings: effectiveMappings.sort(([left], [right]) => left.localeCompare(right)),
    targetBooks: items.map((item) => [item.sourceRecordId, item.bookId]).sort(([left], [right]) => String(left).localeCompare(String(right))),
  });
  const blockingCount = issues.length;
  const canApply = blockingCount === 0 && items.length === sources.length && sources.length > 0;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 200), warnings: warnings.slice(0, 200), records, issueCount: issues.length, blockingCount, canApply, items };
}

function addCalendarDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function applySupabaseLegacyLibraryCirculations(
  tenantId: string,
  actorId: string,
  sourceRows: LegacyLibraryCirculationSources,
  context: LegacyLibraryCirculationContext,
  studentMappings: LegacyLibraryStudentMappings,
  expectedFingerprint: string,
) {
  const preview = previewSupabaseLegacyLibraryCirculations(sourceRows, context, studentMappings);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseLibraryError(409, "Snapshot peminjaman berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!preview.canApply) throw new SupabaseLibraryError(409, "Pratinjau sirkulasi memiliki konflik atau relasi yang perlu ditinjau.");
  const result = await applySupabaseLegacyLibraryCirculationsRpc(tenantId, actorId, preview.snapshotFingerprint, preview.counts.source, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), unchanged: Number(result?.unchanged || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}

