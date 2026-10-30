import { createHmac, randomUUID } from "node:crypto";
import { protectPpdbIdentityValues, SupabaseOnboardingError } from "./supabaseOnboarding";
import { SupabasePpdbError } from "./supabasePpdb";

type JsonObject = Record<string, any>;
export type LegacyPpdbSourceRow = { id: string; data: JsonObject };

const MAX_SOURCE_ROWS = 500;
export const LEGACY_PPDB_DATE_FORMAT = "ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)";
const REGISTRATION_STAGES = new Map([
  ["registered", "Registered"],
  ["document review", "Document Review"],
  ["entry exam", "Entry Exam"],
  ["interview", "Interview"],
  ["accepted", "Accepted"],
  ["rejected", "Rejected"],
]);

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) throw new SupabasePpdbError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, serviceKey };
}

function fingerprintKey() {
  const value = String(process.env.PII_FINGERPRINT_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new SupabasePpdbError(503, "Konfigurasi perlindungan data pribadi backend belum lengkap.");
  }
  return Buffer.from(value, "hex");
}

function hmac(domain: string, value: string) {
  return createHmac("sha256", fingerprintKey()).update(domain + ":" + value, "utf8").digest("hex");
}

async function request(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  if (config.serviceKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + config.serviceKey);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabasePpdbError(409, "Data PPDB bertentangan dengan record tenant; tidak ada bagian batch yang disimpan.");
    }
    if (["22023", "22P02"].includes(code) || response.status === 400) {
      throw new SupabasePpdbError(400, "Data kandidat PPDB tidak memenuhi format impor.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabasePpdbError(403, "Impor PPDB ditolak oleh pemeriksaan role atau tenant.");
    }
    throw new SupabasePpdbError(503, "Layanan impor PPDB Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function rows(path: string, maximum: number, label: string) {
  const result: JsonObject[] = [];
  for (let offset = 0; offset <= maximum; offset += 500) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await request(path + separator + new URLSearchParams({
      limit: String(Math.min(500, maximum + 1 - offset)),
      offset: String(offset),
    }).toString());
    if (!Array.isArray(page)) throw new SupabasePpdbError(503, "Snapshot " + label + " belum dapat dimuat.");
    result.push(...page);
    if (result.length > maximum) throw new SupabasePpdbError(503, "Snapshot " + label + " melewati batas pratinjau yang aman.");
    if (page.length < Math.min(500, maximum + 1 - offset)) return result;
  }
  return result;
}

export async function getSupabasePpdbLegacyImportContext(tenantIdentifier: string) {
  if (!uuid(tenantIdentifier)) throw new SupabasePpdbError(403, "Tenant PPDB tidak valid.");
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({
    select: "id,status,legacy_tenant_key",
    id: "eq." + tenantIdentifier,
    limit: "2",
  }).toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") {
    throw new SupabasePpdbError(403, "Tenant PPDB tidak aktif atau tidak tersedia.");
  }
  const existingRows = await rows("/rest/v1/candidates?" + new URLSearchParams({
    select: "registration_id,nik_fingerprint,nisn_fingerprint,source_system,source_record_id,source_fingerprint",
    tenant_id: "eq." + tenantIdentifier,
    order: "id.asc",
  }).toString(), 20000, "kandidat tenant");
  return {
    tenantId: tenantIdentifier,
    legacyTenantKey: String(tenants[0].legacy_tenant_key || "").trim(),
    existingRows,
  };
}

function addIssue(issues: Set<string>, category: string) {
  issues.add(category);
}

function stringField(data: JsonObject, field: string, maximum: number, issues: Set<string>, required = false) {
  const raw = data[field];
  if (raw == null || raw === "") {
    if (required) addIssue(issues, "missing_" + field);
    return "";
  }
  if (typeof raw !== "string") {
    addIssue(issues, "non_text_" + field);
    return "";
  }
  const value = raw.trim();
  if (required && !value) addIssue(issues, "missing_" + field);
  if (value.length > maximum) addIssue(issues, "too_long_" + field);
  return value;
}

function isCalendarDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isCalendarDate(year, month, day) ? value : "";
}

function parseLegacyAppliedDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!isCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return "";
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function normalizeGender(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["l", "m", "male", "putra", "laki-laki", "laki laki", "ikhwan"].includes(normalized)) return "L";
  if (["p", "f", "female", "putri", "perempuan", "akhwat"].includes(normalized)) return "P";
  return "";
}

function normalizeIdentity(data: JsonObject, field: "nik" | "nisn", expectedLength: number, issues: Set<string>, required: boolean) {
  const raw = data[field];
  if (raw == null || raw === "") {
    if (required) addIssue(issues, "missing_" + field);
    return "";
  }
  if (typeof raw !== "string") {
    addIssue(issues, "non_text_" + field);
    return "";
  }
  const value = raw.trim();
  if (!/^[0-9 .-]+$/.test(value)) {
    addIssue(issues, "invalid_" + field);
    return "";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length !== expectedLength) addIssue(issues, "invalid_" + field);
  return digits.length === expectedLength ? digits : "";
}

function normalizeScore(value: unknown, issues: Set<string>) {
  if (value == null || value === "") return null;
  const score = typeof value === "number" ? value
    : typeof value === "string" && /^\d{1,3}$/.test(value.trim()) ? Number(value.trim())
      : Number.NaN;
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    addIssue(issues, "invalid_score");
    return null;
  }
  return score;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const entries = Object.entries(value as JsonObject)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + stableStringify(item)).join(",") + "}";
}

function fingerprintValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/^(?:\\x|0x)/i, "").toLowerCase();
}

function duplicateValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const duplicates = [...counts.values()].filter((count) => count > 1);
  return { groups: duplicates.length, rows: duplicates.reduce((sum, count) => sum + count, 0) };
}

function normalizedKey(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

export function previewSupabaseLegacyPpdb(
  sourceRows: LegacyPpdbSourceRow[],
  existingRows: JsonObject[],
  ownership: {
    targetLegacyTenantKey: string;
    sourceTenantKeys: string[];
    sourceTenantConfirmation: string;
    dateFormatConfirmation: string;
  },
) {
  fingerprintKey();
  const issueCounts: Record<string, number> = {};
  const allIssues = new Set<string>();
  const validItems: JsonObject[] = [];
  const invalidRowIndexes = new Set<number>();
  const maxExceeded = sourceRows.length > MAX_SOURCE_ROWS;
  let tenantlessRows = 0;

  sourceRows.forEach((sourceRow, index) => {
    const issues = new Set<string>();
    const data = sourceRow?.data && typeof sourceRow.data === "object" && !Array.isArray(sourceRow.data)
      ? sourceRow.data : {};
    const sourceRecordId = typeof sourceRow?.id === "string" ? sourceRow.id.trim() : "";
    if (!sourceRecordId || sourceRecordId.length > 1500) addIssue(issues, "invalid_source_record_id");

    const explicitTenant = typeof data.tenantId === "string" ? data.tenantId.trim() : "";
    if (explicitTenant && explicitTenant !== ownership.targetLegacyTenantKey) addIssue(issues, "tenant_mismatch");
    if (!explicitTenant) tenantlessRows += 1;

    const name = stringField(data, "name", 150, issues, true);
    const registrationId = stringField(data, "registrationId", 50, issues, true);
    const previousSchool = stringField(data, "previousSchool", 150, issues);
    const grade = stringField(data, "grade", 50, issues);
    const phone = stringField(data, "phone", 24, issues);
    const whatsappPhone = stringField(data, "whatsappPhone", 24, issues);
    const email = stringField(data, "email", 254, issues);
    const pob = stringField(data, "pob", 100, issues);
    const address = stringField(data, "address", 2000, issues);
    const fatherName = stringField(data, "fatherName", 150, issues);
    const motherName = stringField(data, "motherName", 150, issues);
    const fatherJob = stringField(data, "fatherJob", 100, issues);
    const motherJob = stringField(data, "motherJob", 100, issues);
    const fatherEducation = stringField(data, "fatherEducation", 80, issues);
    const motherEducation = stringField(data, "motherEducation", 80, issues);
    const familyIncome = stringField(data, "familyIncome", 80, issues);
    const genderText = stringField(data, "gender", 20, issues, true);
    const gender = normalizeGender(genderText);
    if (!gender) addIssue(issues, "invalid_gender");
    const sourceStage = stringField(data, "stage", 50, issues, true);
    const stage = REGISTRATION_STAGES.get(sourceStage.toLowerCase()) || "";
    if (!stage) addIssue(issues, "invalid_stage");

    const nik = normalizeIdentity(data, "nik", 16, issues, true);
    const nisn = normalizeIdentity(data, "nisn", 10, issues, false);
    const dobText = stringField(data, "dob", 40, issues);
    const dob = dobText ? parseIsoDate(dobText) : "";
    if (dobText && !dob) addIssue(issues, "invalid_dob");
    const dateAppliedText = stringField(data, "dateApplied", 40, issues, true);
    const dateApplied = parseLegacyAppliedDate(dateAppliedText);
    if (!dateApplied) addIssue(issues, "invalid_date_applied");
    const score = normalizeScore(data.score, issues);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) addIssue(issues, "invalid_email");

    let protectedIdentity: ReturnType<typeof protectPpdbIdentityValues> | null = null;
    if (nik) {
      try {
        protectedIdentity = protectPpdbIdentityValues(nik, nisn);
      } catch (error) {
        if (error instanceof SupabaseOnboardingError) throw new SupabasePpdbError(error.status, error.message);
        throw error;
      }
    }

    const sourceFingerprint = hmac("ppdb-legacy-candidate", stableStringify({
      sourceRecordId,
      sourceTenantId: explicitTenant,
      name, registrationId, previousSchool, grade, phone, whatsappPhone, email, pob,
      dob: dobText, address, fatherName, motherName, fatherJob, motherJob,
      fatherEducation, motherEducation, familyIncome, gender: genderText, stage: sourceStage,
      nik, nisn, dateApplied: dateAppliedText, score: data.score ?? null,
    }));

    if (issues.size) {
      invalidRowIndexes.add(index);
      for (const category of issues) {
        issueCounts[category] = (issueCounts[category] || 0) + 1;
        allIssues.add(category);
      }
      return;
    }
    if (!protectedIdentity) {
      invalidRowIndexes.add(index);
      issueCounts.missing_nik = (issueCounts.missing_nik || 0) + 1;
      allIssues.add("missing_nik");
      return;
    }

    validItems.push({
      candidateId: randomUUID(),
      sourceRecordId,
      sourceFingerprint,
      registrationId,
      candidate: {
        name, gender, grade, previousSchool, phone, whatsappPhone, email, pob, dob, address,
        fatherName, motherName, fatherJob, motherJob, fatherEducation, motherEducation, familyIncome,
        nikCiphertext: protectedIdentity.nikCiphertextHex,
        nikFingerprint: protectedIdentity.nikFingerprintHex,
        nisnCiphertext: protectedIdentity.nisnCiphertextHex,
        nisnFingerprint: protectedIdentity.nisnFingerprintHex,
        stage, score: score == null ? null : String(score), dateApplied,
        onboardingStatus: "Pending", syncToMasterData: false,
      },
      workflowData: { legacyImport: { sourceCollection: "candidates", sourceDateFormat: LEGACY_PPDB_DATE_FORMAT } },
      documents: { kk: false, birthCertificate: false, reportCards: false, ijazah: false, skhun: false, pasPhoto: false },
    });
  });

  const sourceRegistrationDuplicates = duplicateValues(validItems.map((item) => normalizedKey(item.registrationId)));
  const sourceNikDuplicates = duplicateValues(validItems.map((item) => fingerprintValue(item.candidate.nikFingerprint)));
  const sourceNisnDuplicates = duplicateValues(validItems.map((item) => fingerprintValue(item.candidate.nisnFingerprint)));
  const existingSourceById = new Map<string, JsonObject>();
  const existingRegistrations = new Set<string>();
  const existingNik = new Set<string>();
  const existingNisn = new Set<string>();
  for (const row of existingRows) {
    const sourceRecordId = String(row.source_record_id || "").trim();
    if (sourceRecordId) existingSourceById.set(sourceRecordId, row);
    if (row.registration_id) existingRegistrations.add(normalizedKey(row.registration_id));
    const nik = fingerprintValue(row.nik_fingerprint);
    const nisn = fingerprintValue(row.nisn_fingerprint);
    if (nik) existingNik.add(nik);
    if (nisn) existingNisn.add(nisn);
  }
  let alreadyImported = 0;
  let changedImportedSource = 0;
  let targetRegistrationConflicts = 0;
  let targetNikConflicts = 0;
  let targetNisnConflicts = 0;
  for (const item of validItems) {
    const priorSource = existingSourceById.get(item.sourceRecordId);
    if (priorSource) {
      if (String(priorSource.source_fingerprint || "").toLowerCase() === item.sourceFingerprint) alreadyImported += 1;
      else changedImportedSource += 1;
      continue;
    }
    if (existingRegistrations.has(normalizedKey(item.registrationId))) targetRegistrationConflicts += 1;
    if (existingNik.has(fingerprintValue(item.candidate.nikFingerprint))) targetNikConflicts += 1;
    const nisnFingerprint = fingerprintValue(item.candidate.nisnFingerprint);
    if (nisnFingerprint && existingNisn.has(nisnFingerprint)) targetNisnConflicts += 1;
  }

  const targetLegacyTenantKey = ownership.targetLegacyTenantKey.trim();
  const sourceTenantKeys = [...new Set(ownership.sourceTenantKeys.map((key) => String(key || "").trim()).filter(Boolean))].sort();
  const ownershipConfirmed = Boolean(targetLegacyTenantKey)
    && sourceTenantKeys.length === 1
    && sourceTenantKeys[0] === targetLegacyTenantKey
    && ownership.sourceTenantConfirmation.trim() === targetLegacyTenantKey
    && !allIssues.has("tenant_mismatch");
  const dateFormatConfirmed = ownership.dateFormatConfirmation.trim() === LEGACY_PPDB_DATE_FORMAT;
  const targetConflicts = changedImportedSource + targetRegistrationConflicts + targetNikConflicts + targetNisnConflicts;
  const sourceDuplicates = sourceRegistrationDuplicates.rows + sourceNikDuplicates.rows + sourceNisnDuplicates.rows;
  const invalidRows = invalidRowIndexes.size;
  const canApply = !maxExceeded
    && sourceRows.length > 0
    && invalidRows === 0
    && sourceDuplicates === 0
    && targetConflicts === 0
    && ownershipConfirmed
    && dateFormatConfirmed;
  const orderedFingerprintRows = validItems.map((item) => item.sourceRecordId + ":" + item.sourceFingerprint).sort();
  const snapshotFingerprint = hmac("ppdb-legacy-snapshot", orderedFingerprintRows.join("\n"));

  return {
    sourceCount: sourceRows.length,
    validCount: validItems.length,
    invalidCount: invalidRows,
    tenantlessCount: tenantlessRows,
    alreadyImported,
    importableCount: Math.max(0, validItems.length - alreadyImported),
    overLimit: maxExceeded,
    ownershipConfirmed,
    sourceTenantKeyCount: sourceTenantKeys.length,
    sourceTenantKey: targetLegacyTenantKey || null,
    requiredSourceTenantConfirmation: targetLegacyTenantKey || null,
    dateFormat: LEGACY_PPDB_DATE_FORMAT,
    dateFormatConfirmed,
    sourceDuplicates: {
      registrationId: sourceRegistrationDuplicates,
      nik: sourceNikDuplicates,
      nisn: sourceNisnDuplicates,
    },
    targetConflicts: {
      changedImportedSource,
      registrationId: targetRegistrationConflicts,
      nik: targetNikConflicts,
      nisn: targetNisnConflicts,
    },
    issueCounts,
    canApply,
    snapshotFingerprint,
    items: validItems,
  };
}

export async function applySupabaseLegacyPpdbImport(
  tenantId: string,
  actorId: string,
  snapshotFingerprint: string,
  sourceTenantKey: string,
  items: JsonObject[],
) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint)
    || !sourceTenantKey.trim() || !Array.isArray(items) || items.length < 1 || items.length > MAX_SOURCE_ROWS) {
    throw new SupabasePpdbError(400, "Snapshot impor PPDB tidak valid.");
  }
  return request("/rest/v1/rpc/import_legacy_ppdb_candidates", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_source_tenant_key: sourceTenantKey,
      p_source_date_format: LEGACY_PPDB_DATE_FORMAT,
      p_snapshot_fingerprint: snapshotFingerprint,
      p_source_count: items.length,
      p_items: items,
    }),
  });
}
