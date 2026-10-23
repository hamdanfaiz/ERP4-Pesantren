import { createHmac, randomUUID } from "node:crypto";
import { applySupabaseLegacyHrisEmployees as applySupabaseLegacyHrisEmployeesRpc, SupabaseHrisError } from "./supabaseHris";

type Row = Record<string, any>;
export type LegacyHrisSources = Array<{ id: string; data: Row }>;

const MAX_SOURCE_ROWS = 1000;

function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseHrisError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalized(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
function sourceId(id: string) { return fingerprint(`hris-employee\u0000${id}`); }
function recordRef(id: string) { return sourceId(id).slice(0, 12); }

function stable(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  if (value && typeof value === "object" && typeof value._seconds === "number") {
    const millis = value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1_000_000);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const result: Row = {};
    for (const key of Object.keys(value).sort()) result[key] = stable(value[key]);
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}

function employmentStatus(value: unknown): "active" | "inactive" | "on_leave" | "terminated" | null {
  const status = normalized(value);
  if (["active", "aktif"].includes(status)) return "active";
  if (["inactive", "nonaktif", "tidak aktif"].includes(status)) return "inactive";
  if (["on leave", "leave", "cuti"].includes(status)) return "on_leave";
  if (["alumni", "terminated", "resigned", "resign", "berhenti"].includes(status)) return "terminated";
  return null;
}

function legacyDetails(raw: Row) {
  const details: Row = {};
  const limits = { address: 2000, gender: 20, shift: 80, category: 100, type: 80 } as const;
  for (const field of ["address", "gender", "shift", "category", "type"] as const) {
    const value = raw[field];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.trim().length > limits[field]) return null;
    details[field] = value.trim();
  }
  if (raw.createdAt != null && raw.createdAt !== "") {
    const createdAt = stable(raw.createdAt);
    if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) return null;
    details.sourceCreatedAt = createdAt;
  }
  if (raw.status != null) {
    const sourceStatus = text(raw.status);
    if (!sourceStatus || sourceStatus.length > 40) return null;
    details.sourceStatus = sourceStatus;
  }
  return details;
}

export function previewSupabaseLegacyHrisEmployees(sourceRows: LegacyHrisSources, existingRows: Row[]) {
  const sources = [...(sourceRows || [])]
    .map((row) => ({ id: String(row?.id || "").trim(), data: row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {} }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources.map((row) => ({ sourceId: sourceId(row.id), fingerprint: fingerprint(stable(row.data)) })));
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, invalid: 0, warnings: 0, active: 0, inactive: 0, onLeave: 0, terminated: 0 };
  const issues: Array<{ code: string; recordRef: string }> = [];
  const warnings: Array<{ code: string; recordRef: string }> = [];
  const items: Row[] = [];
  const issue = (code: string, id: string) => { issues.push({ code, recordRef: id ? recordRef(id) : "" }); counts.invalid += 1; };
  const warn = (code: string, id: string) => { warnings.push({ code, recordRef: id ? recordRef(id) : "" }); counts.warnings += 1; };
  if (sources.length > MAX_SOURCE_ROWS) {
    return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "" }], warnings, issueCount: 1, blockingCount: 1, canApply: false, items };
  }

  const existingBySource = new Map<string, string>();
  const employeeNumbers = new Set<string>();
  const emails = new Set<string>();
  for (const row of existingRows || []) {
    const recordId = String(row.source_record_id || "").trim();
    if (recordId) existingBySource.set(recordId, String(row.source_fingerprint || ""));
    if (row.employee_number) employeeNumbers.add(normalized(row.employee_number));
    if (row.email) emails.add(normalized(row.email));
  }

  const seenSources = new Set<string>();
  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();
  for (const source of sources) {
    if (!source.id || source.id.length > 1500) { issue("invalid_source_record_id", source.id); continue; }
    const protectedSourceId = sourceId(source.id);
    if (seenSources.has(protectedSourceId)) { issue("duplicate_source_record", source.id); continue; }
    seenSources.add(protectedSourceId);
    const raw = source.data;
    const number = text(raw.id);
    const fullName = text(raw.name);
    const jobTitle = text(raw.role);
    const department = text(raw.department);
    const emailInput = raw.email == null ? "" : text(raw.email);
    const email = emailInput.toLowerCase();
    const phone = raw.phone == null ? "" : text(raw.phone);
    const status = employmentStatus(raw.status);
    const details = legacyDetails(raw);
    let invalid = false;

    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(number)) { issue("invalid_employee_number", source.id); invalid = true; }
    if (!fullName || fullName.length < 2 || fullName.length > 180) { issue("invalid_full_name", source.id); invalid = true; }
    if (!jobTitle || jobTitle.length > 120) { issue("invalid_job_title", source.id); invalid = true; }
    if (!department || department.length > 120) { issue("invalid_department", source.id); invalid = true; }
    if (raw.email != null && typeof raw.email !== "string") { issue("invalid_email", source.id); invalid = true; }
    if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { issue("invalid_email", source.id); invalid = true; }
    if (email.length > 254) { issue("email_too_long", source.id); invalid = true; }
    if (raw.phone != null && typeof raw.phone !== "string") { issue("invalid_phone", source.id); invalid = true; }
    if (phone && (phone.length < 5 || phone.length > 40)) { issue("invalid_phone", source.id); invalid = true; }
    if (!status) { issue("unmapped_employment_status", source.id); invalid = true; }
    if (!details) { issue("invalid_legacy_details", source.id); invalid = true; }
    if (invalid || !status || !details) continue;

    const sourceFingerprint = fingerprint(stable(raw));
    const priorFingerprint = existingBySource.get(protectedSourceId);
    if (priorFingerprint && priorFingerprint !== sourceFingerprint) { issue("source_changed_after_import", source.id); continue; }
    if (priorFingerprint === sourceFingerprint) counts.alreadyImported += 1;
    if (seenNumbers.has(normalized(number))) issue("duplicate_source_employee_number", source.id);
    else if (!priorFingerprint && employeeNumbers.has(normalized(number))) issue("target_employee_number_conflict", source.id);
    seenNumbers.add(normalized(number));
    if (email) {
      if (seenEmails.has(email)) issue("duplicate_source_email", source.id);
      else if (!priorFingerprint && emails.has(email)) issue("target_email_conflict", source.id);
      seenEmails.add(email);
    }

    counts[status === "active" ? "active" : status === "inactive" ? "inactive" : status === "on_leave" ? "onLeave" : "terminated"] += 1;
    if (status === "terminated" && normalized(raw.status) === "alumni") warn("alumni_mapped_to_terminated", source.id);
    items.push({
      employeeId: randomUUID(),
      sourceRecordId: protectedSourceId,
      sourceFingerprint,
      employeeNumber: number,
      fullName,
      jobTitle,
      department,
      email: email || null,
      phone: phone || null,
      employmentStatus: status,
      legacyDetails: details,
      clientRequestId: randomUUID(),
    });
  }

  counts.ready = items.length;
  const issueCount = issues.length;
  const alreadyComplete = sources.length === counts.alreadyImported;
  const canApply = issueCount === 0 && items.length === sources.length && (items.length > 0 || alreadyComplete);
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), warnings: warnings.slice(0, 100), issueCount, blockingCount: issueCount, canApply, items };
}

export async function applySupabaseLegacyHrisEmployeeImport(
  tenantId: string,
  actorId: string,
  sourceRows: LegacyHrisSources,
  existingRows: Row[],
  expectedFingerprint: string,
) {
  const preview = previewSupabaseLegacyHrisEmployees(sourceRows, existingRows);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) {
    throw new SupabaseHrisError(409, "Snapshot Pegawai berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  }
  if (!preview.canApply) throw new SupabaseHrisError(409, "Pratinjau Pegawai memiliki konflik atau data yang perlu ditinjau.");
  const result = await applySupabaseLegacyHrisEmployeesRpc(tenantId, actorId, preview.snapshotFingerprint, preview.counts.source, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), unchanged: Number(result?.unchanged || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
