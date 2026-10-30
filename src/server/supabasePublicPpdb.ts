import { createHash, createHmac, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { protectPpdbIdentityValues, SupabaseOnboardingError } from "./supabaseOnboarding";

type JsonObject = Record<string, any>;
type UploadedDocument = { name: string; mimeType: string; base64: string };
const DOCUMENT_KEYS = ["kk", "birthCertificate", "reportCards", "ijazah", "skhun", "pasPhoto"] as const;
type DocumentKey = typeof DOCUMENT_KEYS[number];

export class SupabasePublicPpdbError extends Error {
  status: number;
  outcomeUnknown: boolean;
  constructor(status: number, message: string, outcomeUnknown = false) {
    super(message);
    this.outcomeUnknown = outcomeUnknown;
    this.name = "SupabasePublicPpdbError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !secretKey) throw new SupabasePublicPpdbError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, secretKey };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, secretKey } = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", secretKey);
  if (secretKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", `Bearer ${secretKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof Uint8Array) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    const isDatabaseError = /^[0-9A-Z]{5}$/.test(code);
    const outcomeUnknown = response.status >= 500 && !isDatabaseError;
    if (code === "P0001") {
      throw new SupabasePublicPpdbError(409, "Kunci permintaan PPDB sudah digunakan untuk data yang berbeda. Periksa status pendaftaran atau buka kembali formulir sebelum mencoba lagi.");
    }
    if (["23505", "23503"].includes(code) || response.status === 409) {
      throw new SupabasePublicPpdbError(409, "NIK/NISN atau nomor pendaftaran sudah tercatat. Periksa kembali data calon santri.");
    }
    if (["22023", "22P02", "23514"].includes(code) || response.status === 400) {
      throw new SupabasePublicPpdbError(400, body?.message || "Data pendaftaran atau berkas tidak valid.");
    }
    if (code === "42501" || response.status === 403) throw new SupabasePublicPpdbError(503, "Pendaftaran untuk pesantren ini belum tersedia.");
    throw new SupabasePublicPpdbError(
      503,
      "Layanan pendaftaran Supabase belum dapat diproses.",
      outcomeUnknown,
    );
  }
  return body;
}

function cleanText(value: unknown, key: string, max: number, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new SupabasePublicPpdbError(400, `Kolom ${key} wajib diisi.`);
  if (result.length > max) throw new SupabasePublicPpdbError(400, `Kolom ${key} melebihi batas karakter.`);
  return result;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getSupabasePublicPpdbConfig(tenantIdentifier: string) {
  const identifier = String(tenantIdentifier || "").trim();
  if (!identifier) throw new SupabasePublicPpdbError(503, "Konfigurasi tenant PPDB belum tersedia.");
  const lookupColumn = isUuid(identifier) ? "id" : "legacy_tenant_key";
  const tenantParams = new URLSearchParams({ select: "id,name,status", [lookupColumn]: `eq.${identifier}`, limit: "2" });
  const tenants = await request(`/rest/v1/tenants?${tenantParams.toString()}`);
  if (!Array.isArray(tenants) || tenants.length !== 1 || String(tenants[0]?.status || "") !== "active") {
    throw new SupabasePublicPpdbError(503, "Tenant PPDB belum aktif atau belum dipetakan ke Supabase.");
  }
  const tenantId = String(tenants[0].id);
  const settingsParams = new URLSearchParams({ select: "settings", tenant_id: `eq.${tenantId}`, limit: "2" });
  const settingsRows = await request(`/rest/v1/tenant_settings?${settingsParams.toString()}`);
  if (!Array.isArray(settingsRows) || settingsRows.length !== 1) throw new SupabasePublicPpdbError(503, "Pengaturan tahun ajaran PPDB belum dimigrasikan ke Supabase.");
  const settings = settingsRows[0]?.settings && typeof settingsRows[0].settings === "object" ? settingsRows[0].settings : {};
  const general = settings.generalSettings && typeof settings.generalSettings === "object" ? settings.generalSettings : {};
  const org = settings.orgInfo && typeof settings.orgInfo === "object" ? settings.orgInfo : {};
  const academicYear = cleanText(general.academicYear, "tahun ajaran", 20, true);
  if (!/^(20\d{2})/.test(academicYear)) throw new SupabasePublicPpdbError(503, "Tahun ajaran PPDB Supabase belum memakai tahun kalender yang didukung.");
  return {
    tenantId,
    tenantName: cleanText(tenants[0].name, "nama pesantren", 180) || "Pesantren",
    academicYear,
    orgInfo: {
      schoolName: cleanText(org.schoolName, "nama pesantren", 180) || cleanText(tenants[0].name, "nama pesantren", 180) || "Pesantren",
      address: cleanText(org.address, "alamat", 500),
      phone: cleanText(org.phone, "telepon pesantren", 40),
      email: cleanText(org.email, "email pesantren", 254),
      website: cleanText(org.website, "website", 200),
      logoUrl: cleanText(org.logoUrl, "logo", 1000),
    },
  };
}

export async function getSupabasePublicGuardianRegistrationConfig(tenantIdentifier: string) {
  const identifier = String(tenantIdentifier || "").trim();
  if (!identifier) throw new SupabasePublicPpdbError(503, "Konfigurasi tenant portal wali belum tersedia.");
  const lookupColumn = isUuid(identifier) ? "id" : "legacy_tenant_key";
  const params = new URLSearchParams({ select: "id,name,status", [lookupColumn]: `eq.${identifier}`, limit: "2" });
  const tenants = await request(`/rest/v1/tenants?${params.toString()}`);
  if (!Array.isArray(tenants) || tenants.length !== 1 || String(tenants[0]?.status || "") !== "active") {
    throw new SupabasePublicPpdbError(503, "Tenant portal wali belum aktif atau belum dipetakan ke Supabase.");
  }
  let appUrl: URL;
  try { appUrl = new URL(String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "").trim()); } catch {
    throw new SupabasePublicPpdbError(503, "Alamat aplikasi belum disiapkan untuk konfirmasi email.");
  }
  if (!["https:", "http:"].includes(appUrl.protocol)
      || (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname))
      || appUrl.username || appUrl.password || appUrl.search || appUrl.hash) {
    throw new SupabasePublicPpdbError(503, "Alamat aplikasi untuk konfirmasi email tidak aman.");
  }
  appUrl.searchParams.set("guardianRegistration", "1");
  return {
    tenantId: String(tenants[0].id),
    tenantName: cleanText(tenants[0].name, "nama pesantren", 180) || "Pesantren",
    registrationRedirectUrl: appUrl.toString(),
  };
}

function fingerprintClient(clientKey: string) {
  const key = String(process.env.PII_FINGERPRINT_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new SupabasePublicPpdbError(503, "Kunci rate limit PPDB backend belum dikonfigurasi.");
  return createHmac("sha256", Buffer.from(key, "hex")).update(`public-ppdb:${clientKey}`).digest("hex");
}

async function consumeRateLimit(tenantId: string, clientKey: string) {
  const result = await request("/rest/v1/rpc/consume_public_ppdb_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_client_fingerprint_hex: fingerprintClient(clientKey), p_limit: 5 }),
  });
  if (result !== true) throw new SupabasePublicPpdbError(429, "Batas pendaftaran sementara tercapai. Coba lagi 15 menit kemudian.");
}

function decodeDocument(raw: unknown, required: boolean): { bytes: Buffer; mimeType: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (required) throw new SupabasePublicPpdbError(400, "Berkas wajib belum diunggah.");
    return null;
  }
  const file = raw as UploadedDocument;
  if (typeof file.base64 !== "string" || typeof file.mimeType !== "string") {
    throw new SupabasePublicPpdbError(400, "Data berkas tidak valid.");
  }
  const maxBytes = 1024 * 1024;
  if (!file.base64 || file.base64.length > Math.ceil(maxBytes / 3) * 4 || file.base64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) {
    throw new SupabasePublicPpdbError(400, "Ukuran atau encoding berkas tidak valid. Maksimal 1 MB per berkas.");
  }
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== file.base64) throw new SupabasePublicPpdbError(400, "Isi berkas tidak valid.");
  let detectedMime = "";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) detectedMime = "image/png";
  else if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) detectedMime = "image/jpeg";
  else if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") detectedMime = "application/pdf";
  if (!detectedMime || detectedMime !== file.mimeType) throw new SupabasePublicPpdbError(400, "Isi berkas tidak sesuai dengan format PDF, JPG, atau PNG.");
  return { bytes, mimeType: detectedMime };
}

const MAX_TOTAL_DOCUMENT_BYTES = 3 * 1024 * 1024;

export function assertPublicPpdbTotalDocumentSize(files: Iterable<{ bytes: Uint8Array }>): void {
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_DOCUMENT_BYTES) {
      throw new SupabasePublicPpdbError(400, "Total seluruh berkas maksimal 3 MB.");
    }
  }
}

function fingerprintPublicPpdbSubmission(
  tenantId: string,
  admissionYear: number,
  candidate: JsonObject,
  files: Map<DocumentKey, { bytes: Buffer; mimeType: string }>,
) {
  const key = String(process.env.PII_FINGERPRINT_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new SupabasePublicPpdbError(503, "Kunci fingerprint PPDB backend belum dikonfigurasi.");
  }
  const documents = [...files.entries()]
    .map(([documentKey, file]) => ({
      documentKey,
      mimeType: file.mimeType,
      byteLength: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
    }))
    .sort((left, right) => left.documentKey.localeCompare(right.documentKey));
  const canonicalPayload = JSON.stringify({ tenantId, admissionYear, candidate, documents });
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update("public-ppdb-submission:v1:")
    .update(canonicalPayload)
    .digest("hex");
}

function storageObjectPath(tenantId: string, candidateId: string, key: DocumentKey, mimeType: string) {
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg";
  return `${tenantId}/${candidateId}/${key}-${randomUUID()}.${ext}`;
}

async function uploadPrivateDocument(path: string, bytes: Buffer, mimeType: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  await request(`/storage/v1/object/ppdb-documents/${encodedPath}`, {
    method: "POST",
    headers: { "Content-Type": mimeType, "x-upsert": "false" },
    body: bytes,
  });
}

async function removePrivateDocuments(paths: string[]) {
  if (!paths.length) return;
  try {
    await request("/storage/v1/object/ppdb-documents", {
      method: "DELETE",
      body: JSON.stringify({ prefixes: paths }),
    });
  } catch { /* Keep the original registration error; orphan cleanup can be retried operationally. */ }
}

export async function submitSupabasePublicPpdbRegistration(tenantIdentifier: string, clientKey: string, input: unknown) {
  const config = await getSupabasePublicPpdbConfig(tenantIdentifier);
  await consumeRateLimit(config.tenantId, clientKey);
  const payload = input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
  const raw = payload.candidate && typeof payload.candidate === "object" && !Array.isArray(payload.candidate) ? payload.candidate as JsonObject : null;
  if (!raw) throw new SupabasePublicPpdbError(400, "Data pendaftaran tidak valid.");
  const clientRequestId = cleanText(payload.clientRequestId, "ID permintaan", 36, true);
  if (!isUuid(clientRequestId)) throw new SupabasePublicPpdbError(400, "ID permintaan pendaftaran tidak valid.");
  const name = cleanText(raw.name, "nama", 120, true);
  const gender = cleanText(raw.gender, "jenis kelamin", 1, true);
  const grade = cleanText(raw.grade, "jenjang", 40, true);
  const previousSchool = cleanText(raw.previousSchool, "asal sekolah", 160, true);
  const nik = cleanText(raw.nik, "NIK", 16, true).replace(/\D/g, "");
  const nisn = cleanText(raw.nisn, "NISN", 10).replace(/\D/g, "");
  const phone = cleanText(raw.phone, "nomor telepon", 24, true);
  const whatsappPhone = cleanText(raw.whatsappPhone, "nomor WhatsApp", 24, true);
  const email = cleanText(raw.email, "email wali", 254, true).toLowerCase();
  const pob = cleanText(raw.pob, "tempat lahir", 100, true);
  const dob = cleanText(raw.dob, "tanggal lahir", 10, true);
  const address = cleanText(raw.address, "alamat", 500, true);
  const province = cleanText(raw.province, "provinsi", 80);
  const regency = cleanText(raw.regency, "kabupaten/kota", 80);
  const district = cleanText(raw.district, "kecamatan", 80);
  const village = cleanText(raw.village, "desa/kelurahan", 80);
  const fatherName = cleanText(raw.fatherName, "nama ayah", 120, true);
  const motherName = cleanText(raw.motherName, "nama ibu", 120, true);
  const fatherJob = cleanText(raw.fatherJob, "pekerjaan ayah", 100);
  const motherJob = cleanText(raw.motherJob, "pekerjaan ibu", 100);
  const fatherEducation = cleanText(raw.fatherEducation, "pendidikan ayah", 80);
  const motherEducation = cleanText(raw.motherEducation, "pendidikan ibu", 80);
  const familyIncome = cleanText(raw.familyIncome, "penghasilan keluarga", 80);
  if (gender !== "L" && gender !== "P") throw new SupabasePublicPpdbError(400, "Jenis kelamin tidak valid.");
  if (!/^\d{16}$/.test(nik)) throw new SupabasePublicPpdbError(400, "NIK harus terdiri dari 16 digit.");
  if (nisn && !/^\d{10}$/.test(nisn)) throw new SupabasePublicPpdbError(400, "NISN harus terdiri dari 10 digit.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new SupabasePublicPpdbError(400, "Tanggal lahir tidak valid.");
  const [birthYear, birthMonth, birthDay] = dob.split("-").map(Number);
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (birthDate.getUTCFullYear() !== birthYear || birthDate.getUTCMonth() + 1 !== birthMonth || birthDate.getUTCDate() !== birthDay) {
    throw new SupabasePublicPpdbError(400, "Tanggal lahir tidak valid.");
  }
  const validPhone = /^\+?[0-9 ().-]{8,24}$/;
  if (!validPhone.test(phone) || !validPhone.test(whatsappPhone)) throw new SupabasePublicPpdbError(400, "Nomor telepon tidak valid.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupabasePublicPpdbError(400, "Alamat email tidak valid.");

  const inputFiles = payload.files && typeof payload.files === "object" && !Array.isArray(payload.files) ? payload.files as JsonObject : {};
  for (const key of Object.keys(inputFiles)) if (!DOCUMENT_KEYS.includes(key as DocumentKey)) throw new SupabasePublicPpdbError(400, "Jenis dokumen PPDB tidak didukung.");
  const files = new Map<DocumentKey, { bytes: Buffer; mimeType: string }>();
  for (const key of DOCUMENT_KEYS) {
    const required = ["kk", "birthCertificate", "reportCards", "pasPhoto"].includes(key);
    const decoded = decodeDocument(inputFiles[key], required);
    if (decoded) files.set(key, decoded);
  }
  assertPublicPpdbTotalDocumentSize(files.values());

  const yearMatch = config.academicYear.match(/^(\d{4})/);
  const admissionYear = yearMatch ? Number(yearMatch[1]) : 0;
  if (admissionYear < 2000 || admissionYear > 2200) throw new SupabasePublicPpdbError(503, "Tahun ajaran PPDB tidak dapat digunakan untuk membuat nomor pendaftaran.");
  let protectedIdentity: ReturnType<typeof protectPpdbIdentityValues>;
  try { protectedIdentity = protectPpdbIdentityValues(nik, nisn); }
  catch (error: any) {
    if (error instanceof SupabaseOnboardingError) throw new SupabasePublicPpdbError(error.status, error.message);
    throw error;
  }
  const candidateId = clientRequestId;
  const requestFingerprintHex = fingerprintPublicPpdbSubmission(config.tenantId, admissionYear, {
    name, gender, grade, previousSchool, phone, whatsappPhone, email, pob, dob, address,
    province, regency, district, village, fatherName, motherName, fatherJob, motherJob,
    fatherEducation, motherEducation, familyIncome,
    nikFingerprint: protectedIdentity.nikFingerprintHex,
    nisnFingerprint: protectedIdentity.nisnFingerprintHex,
  }, files);
  const paths: Partial<Record<DocumentKey, string>> = {};
  let rpcOutcomeUnknown = false;
  let rpcCommitted = false;
  try {
    for (const [key, file] of files) {
      const path = storageObjectPath(config.tenantId, candidateId, key, file.mimeType);
      await uploadPrivateDocument(path, file.bytes, file.mimeType);
      paths[key] = path;
    }
    rpcOutcomeUnknown = true;
    let result: any;
    try {
      result = await request("/rest/v1/rpc/submit_public_ppdb_idempotent", {
        method: "POST",
        body: JSON.stringify({
          p_tenant_id: config.tenantId,
          p_candidate_id: candidateId,
          p_admission_year: admissionYear,
          p_candidate: {
            name, gender, grade, previousSchool, phone, whatsappPhone, email, pob, dob, address,
            province, regency, district, village, fatherName, motherName, fatherJob, motherJob,
            fatherEducation, motherEducation, familyIncome,
            nikCiphertext: protectedIdentity.nikCiphertextHex,
            nikFingerprint: protectedIdentity.nikFingerprintHex,
            nisnCiphertext: protectedIdentity.nisnCiphertextHex,
            nisnFingerprint: protectedIdentity.nisnFingerprintHex,
          },
          p_document_paths: paths,
          p_request_fingerprint_hex: requestFingerprintHex,
        }),
      });
      rpcOutcomeUnknown = false;
      rpcCommitted = true;
    } catch (error) {
      if (error instanceof SupabasePublicPpdbError && !error.outcomeUnknown) rpcOutcomeUnknown = false;
      throw error;
    }
    const registrationId = String(result?.registrationId || "");
    if (String(result?.id || "") !== candidateId || !registrationId) throw new SupabasePublicPpdbError(503, "Nomor pendaftaran PPDB belum dapat dikonfirmasi.");
    if (result?.alreadyApplied === true && Array.isArray(result?.previousDocumentPaths)) {
      await removePrivateDocuments(result.previousDocumentPaths.filter((value: unknown): value is string => typeof value === "string"));
    }
    return {
      candidate: {
        id: candidateId, registrationId,
        name, gender, grade, previousSchool, phone, whatsappPhone, email, nik, nisn, pob, dob, address,
        province, regency, district, village, fatherName, motherName, fatherJob, motherJob,
        fatherEducation, motherEducation, familyIncome, stage: "Registered", score: 0,
        dateApplied: String(result?.dateApplied || new Date().toISOString().slice(0, 10)), syncToMasterData: false, onboardingStatus: "Pending",
        documents: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, files.has(key)])),
      },
    };
  } catch (error) {
    if (!rpcOutcomeUnknown && !rpcCommitted) {
      await removePrivateDocuments(Object.values(paths).filter((value): value is string => Boolean(value)));
    }
    throw error;
  }
}
