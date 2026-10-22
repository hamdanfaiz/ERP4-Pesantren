import { createHmac } from "node:crypto";
import { applySupabaseLegacyHealthcareImport as persistSupabaseLegacyHealthcareImport, SupabaseHealthcareError } from "./supabaseHealthcare";

type Row = Record<string, any>;
export type LegacyHealthcareSources = {
  records: Array<{ id: string; data: Row }>;
  visits: Array<{ id: string; data: Row }>;
  medicines: Array<{ id: string; data: Row }>;
};

function stableValue(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") { const result: Row = {}; for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]); return result; }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}
function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseHealthcareError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stableValue(value))).digest("hex");
}
function sourceId(kind: string, value: string) { return `${kind.slice(0, 1)}:${fingerprint(`${kind}\u0000${value}`)}`; }
function ref(kind: string, value: string) { return fingerprint(`${kind}\u0000${value}`).slice(0, 12); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function cleanOptional(value: unknown) { const result = text(value); return ["", "-", "—", "n/a", "none"].includes(result.toLowerCase()) ? "" : result; }
function normalizedName(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
function date(value: unknown): string | null {
  let dateValue = value as any;
  try { if (dateValue && typeof dateValue.toDate === "function") dateValue = dateValue.toDate(); else if (dateValue && typeof dateValue._seconds === "number") dateValue = new Date(dateValue._seconds * 1000); } catch { return null; }
  let raw = "";
  if (dateValue instanceof Date) { if (!Number.isFinite(dateValue.getTime())) return null; raw = dateValue.toISOString().slice(0, 10); }
  else raw = cleanOptional(dateValue);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return parsed.toISOString().slice(0, 10) === result ? result : null;
}
function measure(value: unknown, suffix: string, min: number, max: number): number | null | undefined {
  const raw = cleanOptional(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(suffix, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
  return Math.round(parsed * 100) / 100;
}
function temperature(value: unknown): number | null | undefined {
  const raw = cleanOptional(value);
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 25 && parsed <= 45 ? Math.round(parsed * 10) / 10 : undefined;
}
function visitStatus(value: unknown): string | null {
  const status = text(value).toLowerCase();
  if (status === "completed" || status === "selesai") return "completed";
  if (status === "referred" || status === "dirujuk") return "referred";
  if (status === "monitoring" || status === "pemantauan" || !status) return "monitoring";
  return null;
}
function cleanRows(value: Array<{ id: string; data: Row }> | undefined) { return [...(value || [])].map((row) => ({ id: String(row.id || ""), data: stableValue(row.data || {}) as Row })).sort((a, b) => a.id.localeCompare(b.id)); }

export function previewSupabaseLegacyHealthcare(sources: LegacyHealthcareSources, existingRows: Row[], students: Row[]) {
  const normalizedSources = { records: cleanRows(sources.records), visits: cleanRows(sources.visits), medicines: cleanRows(sources.medicines) };
  const snapshotFingerprint = fingerprint(normalizedSources);
  const sourceCount = normalizedSources.records.length + normalizedSources.visits.length + normalizedSources.medicines.length;
  const counts = { source: sourceCount, profiles: 0, visits: 0, medicines: 0, ready: 0, alreadyImported: 0, invalid: 0 };
  const issues: Array<{ code: string; recordRef: string; severity: "blocking" | "warning" }> = [];
  const items: Row[] = [];
  if (sourceCount > 3000) return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "", severity: "blocking" as const }], issueCount: 1, blockingCount: 1, canApply: false, items: [] as Row[] };

  const existing = new Map<string, string>();
  const existingRecordsByStudent = new Set(existingRows.filter((row) => row.kind === "record" && !row.source_record_id).map((row) => String(row.student_id)));
  const existingMedicineNames = existingRows.filter((row) => row.kind === "medicine");
  for (const row of existingRows) if (row.source_record_id) existing.set(`${row.kind}:${row.source_record_id}`, String(row.source_fingerprint || ""));
  const studentsByNis = new Map<string, Row[]>();
  for (const student of students) {
    const nis = cleanOptional(student.nis);
    if (nis) studentsByNis.set(nis, [...(studentsByNis.get(nis) || []), student]);
  }
  const seen = new Set<string>();
  const sourceProfileStudents = new Set<string>();
  const sourceMedicineNames = new Set<string>();
  const issuesByCode = (code: string, recordRef: string) => { issues.push({ code, recordRef, severity: "blocking" }); counts.invalid += 1; };
  const mapStudent = (data: Row, kind: string, originalId: string) => {
    const nis = cleanOptional(data.nis);
    const matches = nis ? studentsByNis.get(nis) || [] : [];
    if (matches.length !== 1) { issuesByCode(matches.length ? "ambiguous_student_nis" : "student_not_found_by_nis", ref(kind, originalId)); return null; }
    const oldName = normalizedName(data.santriName || data.studentName);
    if (oldName && oldName !== normalizedName(matches[0].name)) { issuesByCode("student_name_conflicts_with_nis", ref(kind, originalId)); return null; }
    return String(matches[0].id);
  };
  const append = (kind: string, originalId: string, data: Row, mapped: Row) => {
    const id = sourceId(kind, originalId);
    const key = `${kind}:${id}`;
    const sourceFingerprint = fingerprint(data);
    if (!originalId || seen.has(key)) { issuesByCode(originalId ? "duplicate_source_record" : "invalid_source_record", ref(kind, originalId)); return; }
    seen.add(key);
    const prior = existing.get(key);
    if (prior) { if (prior !== sourceFingerprint) issuesByCode("source_changed_after_import", ref(kind, originalId)); else counts.alreadyImported += 1; return; }
    items.push({ kind, sourceRecordId: id, sourceFingerprint, ...mapped });
    counts[kind === "record" ? "profiles" : kind === "visit" ? "visits" : "medicines"] += 1;
  };

  for (const row of normalizedSources.records) {
    const data = row.data;
    const studentId = mapStudent(data, "record", row.id);
    if (!studentId) continue;
    if (sourceProfileStudents.has(studentId)) { issuesByCode("duplicate_health_profile_for_student", ref("record", row.id)); continue; }
    sourceProfileStudents.add(studentId);
    if (existingRecordsByStudent.has(studentId)) { issuesByCode("student_already_has_health_profile", ref("record", row.id)); continue; }
    const blood = cleanOptional(data.bloodType).toUpperCase();
    const allowedBlood = ["A", "B", "AB", "O", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    const height = measure(data.height, "cm", 20, 250);
    const weight = measure(data.weight, "kg", 1, 400);
    const lastCheckRaw = cleanOptional(data.lastCheck);
    const lastCheck = lastCheckRaw ? date(lastCheckRaw) : null;
    if ((blood && !allowedBlood.includes(blood)) || height === undefined || weight === undefined || (lastCheckRaw && !lastCheck)
      || cleanOptional(data.allergies).length > 3000 || cleanOptional(data.chronicIllness).length > 3000) { issuesByCode("invalid_health_profile_record", ref("record", row.id)); continue; }
    append("record", row.id, data, { studentId, bloodType: blood, heightCm: height, weightKg: weight, allergies: cleanOptional(data.allergies), chronicConditions: cleanOptional(data.chronicIllness), lastCheck });
  }

  for (const row of normalizedSources.visits) {
    const data = row.data;
    const studentId = mapStudent(data, "visit", row.id);
    if (!studentId) continue;
    const visitDate = date(data.date);
    const visitTime = text(data.time);
    const status = visitStatus(data.status);
    const temp = temperature(data.temp);
    const complaint = cleanOptional(data.complaint);
    if (!visitDate || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(visitTime) || !status || temp === undefined || !complaint || complaint.length > 3000
      || cleanOptional(data.diagnosis).length > 3000 || cleanOptional(data.action).length > 5000) { issuesByCode("invalid_healthcare_visit", ref("visit", row.id)); continue; }
    append("visit", row.id, data, { studentId, visitDate, visitTime: visitTime.length === 5 ? `${visitTime}:00` : visitTime, complaint, temperatureC: temp, diagnosis: cleanOptional(data.diagnosis), actionTaken: cleanOptional(data.action), status });
  }

  for (const row of normalizedSources.medicines) {
    const data = row.data;
    const name = cleanOptional(data.name);
    const category = cleanOptional(data.category);
    const unit = cleanOptional(data.unit);
    const stock = Number(data.stock);
    const expiryRaw = cleanOptional(data.expDate);
    const expiresOn = expiryRaw ? date(expiryRaw) : null;
    const normalized = normalizedName(name);
    const sourceRecordId = sourceId("medicine", row.id);
    const nameConflict = existingMedicineNames.some((item) => normalizedName(item.name) === normalized && String(item.source_record_id || "") !== sourceRecordId);
    if (!name || name.length > 180 || category.length > 120 || unit.length > 40 || !Number.isInteger(stock) || stock < 0 || stock > 100000000
      || (expiryRaw && !expiresOn) || nameConflict || sourceMedicineNames.has(normalized)) { issuesByCode(nameConflict || sourceMedicineNames.has(normalized) ? "duplicate_medicine_name" : "invalid_medicine_record", ref("medicine", row.id)); continue; }
    sourceMedicineNames.add(normalized);
    append("medicine", row.id, data, { name, category, stockQuantity: stock, unit, expiresOn });
  }
  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  counts.ready = items.length;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), issueCount: issues.length, blockingCount, canApply: blockingCount === 0 && items.length > 0, items };
}

export async function applySupabaseLegacyHealthcareImport(tenantId: string, actorId: string, sources: LegacyHealthcareSources, existingRows: Row[], students: Row[], expectedFingerprint: string) {
  const preview = previewSupabaseLegacyHealthcare(sources, existingRows, students);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) throw new SupabaseHealthcareError(409, "Snapshot UKS berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  if (!preview.canApply) throw new SupabaseHealthcareError(409, "Pratinjau impor UKS memiliki konflik atau data tidak valid.");
  const result = await persistSupabaseLegacyHealthcareImport(tenantId, actorId, preview.snapshotFingerprint, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), skipped: Number(result?.skipped || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
