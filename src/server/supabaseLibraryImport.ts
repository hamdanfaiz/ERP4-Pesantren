import { createHmac, randomUUID } from "node:crypto";
import { applySupabaseLegacyLibraryBooks as applySupabaseLegacyLibraryBooksRpc, SupabaseLibraryError } from "./supabaseLibrary";

type Row = Record<string, any>;
export type LegacyLibrarySources = Array<{ id: string; data: Row }>;

const MAX_SOURCE_ROWS = 1000;

function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseLibraryError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
}

function sourceId(id: string) { return fingerprint(`library-book\u0000${id}`); }
function recordRef(id: string) { return sourceId(id).slice(0, 12); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalized(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }

function normalizeIsbn(value: unknown): { value: string | null; checkDigitValid: boolean } | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (!/^[0-9X -]+$/.test(raw)) return undefined;
  const isbn = raw.replace(/[ -]/g, "");
  if (isbn.length === 10) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return undefined;
    const sum = [...isbn].reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return { value: isbn, checkDigitValid: sum % 11 === 0 };
  }
  if (isbn.length === 13 && /^\d{13}$/.test(isbn)) {
    const sum = [...isbn].slice(0, 12).reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const checkDigit = (10 - (sum % 10)) % 10;
    return { value: isbn, checkDigitValid: checkDigit === Number(isbn[12]) };
  }
  return undefined;
}

function stableSource(value: Row) {
  const entries = Object.entries(value).filter(([key]) => key !== "tenantId" && key !== "tenant_id").sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

export function previewSupabaseLegacyLibraryBooks(sourceRows: LegacyLibrarySources, existingRows: Row[]) {
  const sources = [...(sourceRows || [])]
    .map((row) => ({ id: String(row?.id || "").trim(), data: row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {} }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources.map((row) => ({ id: sourceId(row.id), source: fingerprint(stableSource(row.data)) })));
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, invalid: 0, warnings: 0, isbnPresent: 0, withoutIsbn: 0 };
  const issues: Array<{ code: string; recordRef: string }> = [];
  const warnings: Array<{ code: string; recordRef: string }> = [];
  const items: Row[] = [];
  const issue = (code: string, id: string) => { issues.push({ code, recordRef: id ? recordRef(id) : "" }); counts.invalid += 1; };
  const warn = (code: string, id: string) => { warnings.push({ code, recordRef: id ? recordRef(id) : "" }); counts.warnings += 1; };
  if (sources.length > MAX_SOURCE_ROWS) {
    return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "" }], warnings, issueCount: 1, blockingCount: 1, canApply: false, items };
  }

  const existingBySource = new Map<string, string>();
  const existingIsbn = new Set<string>();
  const existingTitleAuthors = new Set<string>();
  for (const row of existingRows || []) {
    const id = String(row.source_record_id || "").trim();
    if (id) existingBySource.set(id, String(row.source_fingerprint || ""));
    const isbn = normalizeIsbn(row.isbn);
    if (isbn?.value) existingIsbn.add(isbn.value);
    if (text(row.title) && text(row.author)) existingTitleAuthors.add(`${normalized(row.title)}\u0000${normalized(row.author)}`);
  }

  const seenSourceIds = new Set<string>();
  const seenIsbns = new Set<string>();
  const seenTitleAuthors = new Set<string>();
  for (const source of sources) {
    if (!source.id || source.id.length > 1500) { issue("invalid_source_record_id", source.id); continue; }
    const sourceRecordId = sourceId(source.id);
    if (seenSourceIds.has(sourceRecordId)) { issue("duplicate_source_record", source.id); continue; }
    seenSourceIds.add(sourceRecordId);
    const raw = source.data;
    const title = text(raw.title), author = text(raw.author), category = text(raw.category);
    const copies = raw.totalCopies;
    const isbn = normalizeIsbn(raw.isbn);
    const shelf = raw.shelf == null ? "" : text(raw.shelf);
    let invalid = false;
    if (!title || title.length > 240) { issue("invalid_title", source.id); invalid = true; }
    if (!author || author.length > 180) { issue("invalid_author", source.id); invalid = true; }
    if (!category || category.length > 100) { issue("invalid_category", source.id); invalid = true; }
    if (typeof copies !== "number" || !Number.isSafeInteger(copies) || copies < 0 || copies > 100000) { issue("invalid_total_copies", source.id); invalid = true; }
    if (isbn === undefined) { issue("invalid_isbn", source.id); invalid = true; }
    if (raw.shelf != null && typeof raw.shelf !== "string") { issue("invalid_shelf", source.id); invalid = true; }
    if (shelf.length > 80) { issue("shelf_too_long", source.id); invalid = true; }
    if (invalid) continue;

    const sourceFingerprint = fingerprint(stableSource(raw));
    const previousFingerprint = existingBySource.get(sourceRecordId);
    if (previousFingerprint && previousFingerprint !== sourceFingerprint) { issue("source_changed_after_import", source.id); continue; }
    if (previousFingerprint === sourceFingerprint) counts.alreadyImported += 1;
    if (isbn?.value) {
      counts.isbnPresent += 1;
      if (!isbn.checkDigitValid) warn("isbn_check_digit_needs_review", source.id);
      if (seenIsbns.has(isbn.value)) issue("duplicate_source_isbn", source.id);
      else if (!previousFingerprint && existingIsbn.has(isbn.value)) issue("target_isbn_conflict", source.id);
      seenIsbns.add(isbn.value);
    } else counts.withoutIsbn += 1;
    const titleAuthor = `${normalized(title)}\u0000${normalized(author)}`;
    if (seenTitleAuthors.has(titleAuthor)) issue("duplicate_source_title_author_review", source.id);
    else if (!previousFingerprint && existingTitleAuthors.has(titleAuthor)) issue("target_title_author_review", source.id);
    seenTitleAuthors.add(titleAuthor);
    items.push({
      sourceRecordId,
      sourceFingerprint,
      title,
      author,
      category,
      isbn: isbn?.value || null,
      totalCopies: copies,
      shelf: shelf || null,
      clientRequestId: randomUUID(),
    });
  }

  counts.ready = items.length;
  const blockingCount = issues.length;
  const alreadyComplete = sources.length === counts.alreadyImported;
  const canApply = blockingCount === 0 && items.length === sources.length && (items.length > 0 || alreadyComplete);
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), warnings: warnings.slice(0, 100), issueCount: issues.length, blockingCount, canApply, items };
}

export async function applySupabaseLegacyLibraryBooks(
  tenantId: string,
  actorId: string,
  sourceRows: LegacyLibrarySources,
  existingRows: Row[],
  expectedFingerprint: string,
) {
  const preview = previewSupabaseLegacyLibraryBooks(sourceRows, existingRows);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseLibraryError(409, "Snapshot katalog berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!preview.canApply) throw new SupabaseLibraryError(409, "Pratinjau katalog memiliki konflik atau data yang perlu ditinjau.");
  const result = await applySupabaseLegacyLibraryBooksRpc(tenantId, actorId, preview.snapshotFingerprint, preview.counts.source, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), unchanged: Number(result?.unchanged || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
