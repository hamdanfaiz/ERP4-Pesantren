import { createCipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

type PpdbSettings = Record<string, any>;
type UploadedDocument = { base64: string; mimeType: string; fileName?: string };
type DocumentKey = "kk" | "birthCertificate" | "reportCards" | "ijazah" | "skhun" | "pasPhoto";

const DOCUMENT_KEYS: DocumentKey[] = ["kk", "birthCertificate", "reportCards", "ijazah", "skhun", "pasPhoto"];
const REQUIRED_DOCUMENTS: DocumentKey[] = ["kk", "birthCertificate", "pasPhoto"];
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export class PublicPpdbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicPpdbError";
    this.status = status;
  }
}

function configuration() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const tenantSlug = String(process.env.PUBLIC_PPDB_TENANT_SLUG || "").trim().toLowerCase();
  const enabled = String(process.env.PUBLIC_PPDB_ENABLED || "").trim().toLowerCase() === "true";
  if (!enabled) throw new PublicPpdbError(503, "Pendaftaran PPDB online belum diaktifkan oleh pengelola pesantren.");
  if (!baseUrl || !serviceKey || !tenantSlug) {
    throw new PublicPpdbError(503, "Konfigurasi layanan PPDB Supabase belum lengkap.");
  }
  return { baseUrl, serviceKey, tenantSlug };
}

function secretKey(name: string): Buffer {
  const value = String(process.env[name] || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new PublicPpdbError(503, "Kunci keamanan server " + name + " belum dikonfigurasi dengan benar.");
  }
  return Buffer.from(value, "hex");
}

async function requestSupabase(path: string, init: RequestInit = {}) {
  const config = configuration();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", "Bearer " + config.serviceKey);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers });
  const bodyText = await response.text();
  let body: any = null;
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch { body = null; }
  }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (response.status === 409 || code === "23505") {
      throw new PublicPpdbError(409, "NIK atau NISN sudah terdaftar. Periksa kembali data atau hubungi panitia.");
    }
    if (response.status >= 500) {
      throw new PublicPpdbError(503, "Layanan PPDB Supabase sementara tidak tersedia.");
    }
    throw new PublicPpdbError(503, "Permintaan PPDB belum dapat diproses oleh backend.");
  }
  return body;
}

function objectOrEmpty(value: unknown): PpdbSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PpdbSettings : {};
}

function currentTenantQueryPath(tenantSlug: string) {
  const params = new URLSearchParams({
    select: "id,name,status,settings",
    slug: "eq." + tenantSlug,
    limit: "1",
  });
  return "/rest/v1/tenants?" + params.toString();
}

async function loadTenant() {
  const config = configuration();
  const tenants = await requestSupabase(currentTenantQueryPath(config.tenantSlug));
  if (!Array.isArray(tenants) || tenants.length !== 1) {
    throw new PublicPpdbError(503, "Tenant PPDB belum dikonfigurasi di Supabase.");
  }
  const tenant = tenants[0] || {};
  if (String(tenant.status || "").toLowerCase() !== "active") {
    throw new PublicPpdbError(503, "Pendaftaran PPDB untuk pesantren ini sedang tidak tersedia.");
  }
  const settings = objectOrEmpty(tenant.settings);
  const general = objectOrEmpty(settings.generalSettings);
  const org = objectOrEmpty(settings.orgInfo);
  const academicYear = String(general.academicYear || "").trim();
  return {
    tenantId: String(tenant.id || ""),
    academicYear,
    orgInfo: {
      schoolName: String(org.schoolName || tenant.name || "Pesantren"),
      address: String(org.address || ""),
      phone: String(org.phone || ""),
      email: String(org.email || ""),
      website: String(org.website || ""),
      logoUrl: String(org.logoUrl || ""),
    },
  };
}

export async function loadSupabasePublicPpdbConfig() {
  const tenant = await loadTenant();
  if (!tenant.academicYear) {
    throw new PublicPpdbError(503, "Tahun ajaran PPDB belum dikonfigurasi.");
  }
  return { academicYear: tenant.academicYear, orgInfo: tenant.orgInfo };
}

function textField(raw: any, key: string, max: number, required = false) {
  const value = typeof raw?.[key] === "string" ? raw[key].trim() : "";
  if (required && !value) throw new PublicPpdbError(400, "Kolom " + key + " wajib diisi.");
  if (value.length > max) throw new PublicPpdbError(400, "Kolom " + key + " melebihi batas karakter.");
  return value;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateCandidate(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PublicPpdbError(400, "Data pendaftaran tidak valid.");
  }
  const candidate = {
    name: textField(raw, "name", 120, true),
    gender: textField(raw, "gender", 1, true),
    grade: textField(raw, "grade", 40, true),
    previousSchool: textField(raw, "previousSchool", 160, true),
    nik: textField(raw, "nik", 16, true).replace(/\D/g, ""),
    nisn: textField(raw, "nisn", 10).replace(/\D/g, ""),
    phone: textField(raw, "phone", 24, true),
    whatsappPhone: textField(raw, "whatsappPhone", 24, true),
    email: textField(raw, "email", 254).toLowerCase(),
    pob: textField(raw, "pob", 100, true),
    dob: textField(raw, "dob", 10, true),
    address: textField(raw, "address", 500, true),
    province: textField(raw, "province", 80),
    regency: textField(raw, "regency", 80),
    district: textField(raw, "district", 80),
    village: textField(raw, "village", 80),
    fatherName: textField(raw, "fatherName", 120, true),
    motherName: textField(raw, "motherName", 120, true),
    fatherJob: textField(raw, "fatherJob", 100),
    motherJob: textField(raw, "motherJob", 100),
    fatherEducation: textField(raw, "fatherEducation", 80),
    motherEducation: textField(raw, "motherEducation", 80),
    familyIncome: textField(raw, "familyIncome", 80),
  };
  if (candidate.gender !== "L" && candidate.gender !== "P") throw new PublicPpdbError(400, "Jenis kelamin tidak valid.");
  if (!/^\d{16}$/.test(candidate.nik)) throw new PublicPpdbError(400, "NIK harus terdiri dari 16 digit.");
  if (candidate.nisn && !/^\d{10}$/.test(candidate.nisn)) throw new PublicPpdbError(400, "NISN harus terdiri dari 10 digit.");
  if (!isValidDate(candidate.dob)) throw new PublicPpdbError(400, "Tanggal lahir tidak valid.");
  const validPhone = /^\+?[0-9 ().-]{8,24}$/;
  if (!validPhone.test(candidate.phone) || !validPhone.test(candidate.whatsappPhone)) {
    throw new PublicPpdbError(400, "Nomor telepon tidak valid.");
  }
  if (candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
    throw new PublicPpdbError(400, "Alamat email tidak valid.");
  }
  return candidate;
}

function inspectDocument(file: UploadedDocument, key: DocumentKey) {
  if (!file || typeof file.base64 !== "string" || !ALLOWED_MIME_TYPES.has(String(file.mimeType || ""))) {
    throw new PublicPpdbError(400, "Dokumen " + key + " harus berupa PDF, JPG, atau PNG.");
  }
  const base64 = file.base64;
  const maxEncodedLength = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4;
  if (!base64 || base64.length > maxEncodedLength || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new PublicPpdbError(400, "Ukuran atau encoding dokumen " + key + " tidak valid. Maksimal 2 MB per berkas.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || bytes.toString("base64") !== base64) {
    throw new PublicPpdbError(400, "Ukuran dokumen " + key + " tidak valid. Maksimal 2 MB per berkas.");
  }
  const isPdf = file.mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isPng = file.mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = file.mimeType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPdf && !isPng && !isJpeg) throw new PublicPpdbError(400, "Isi dokumen " + key + " tidak cocok dengan format berkasnya.");
  const extension = isPdf ? "pdf" : (isPng ? "png" : "jpg");
  return { bytes, mimeType: file.mimeType, extension };
}

function encryptedIdentity(value: string) {
  const key = secretKey("PII_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("hex");
}

function identityFingerprint(kind: "nik" | "nisn", value: string) {
  return createHmac("sha256", secretKey("PII_FINGERPRINT_KEY"))
    .update(kind + ":" + value, "utf8")
    .digest("hex");
}

function storageObjectPath(tenantId: string, candidateId: string, key: DocumentKey, extension: string) {
  return tenantId + "/" + candidateId + "/" + key + "." + extension;
}

async function uploadDocument(path: string, file: { bytes: Buffer; mimeType: string }) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  await requestSupabase("/storage/v1/object/ppdb-documents/" + encodedPath, {
    method: "POST",
    headers: { "Content-Type": file.mimeType, "x-upsert": "false" },
    body: file.bytes,
  });
}

async function removeDocument(path: string) {
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    await requestSupabase("/storage/v1/object/ppdb-documents/" + encodedPath, { method: "DELETE" });
  } catch {
    // Best-effort compensation; an orphan can be reconciled by the scheduled storage audit.
  }
}

export async function registerSupabasePublicPpdb(body: any) {
  const tenant = await loadTenant();
  const candidate = validateCandidate(body?.candidate);
  const rawDocuments = objectOrEmpty(body?.documents);
  const providedKeys = Object.keys(rawDocuments);
  if (providedKeys.some((key) => !DOCUMENT_KEYS.includes(key as DocumentKey))) {
    throw new PublicPpdbError(400, "Daftar dokumen pendaftaran tidak valid.");
  }

  const documents: Partial<Record<DocumentKey, ReturnType<typeof inspectDocument>>> = {};
  for (const key of providedKeys as DocumentKey[]) {
    documents[key] = inspectDocument(rawDocuments[key] as UploadedDocument, key);
  }
  if (REQUIRED_DOCUMENTS.some((key) => !documents[key])) {
    throw new PublicPpdbError(400, "Unggah Kartu Keluarga, Akta Kelahiran, dan Pas Foto sebelum mengirim pendaftaran.");
  }

  const yearMatch = tenant.academicYear.match(/^(\d{4})/);
  const admissionYear = Number(yearMatch ? yearMatch[1] : "");
  if (!Number.isInteger(admissionYear) || admissionYear < 2000 || admissionYear > 2200) {
    throw new PublicPpdbError(503, "Tahun ajaran PPDB belum valid.");
  }

  const candidateId = randomUUID();
  const uploadedPaths: string[] = [];
  const documentPaths: Record<string, string> = {};
  try {
    for (const key of DOCUMENT_KEYS) {
      const file = documents[key];
      if (!file) continue;
      const path = storageObjectPath(tenant.tenantId, candidateId, key, file.extension);
      await uploadDocument(path, file);
      uploadedPaths.push(path);
      documentPaths[key] = path;
    }

    const dbCandidate = {
      ...candidate,
      nikCiphertext: encryptedIdentity(candidate.nik),
      nikFingerprint: identityFingerprint("nik", candidate.nik),
      nisnCiphertext: candidate.nisn ? encryptedIdentity(candidate.nisn) : "",
      nisnFingerprint: candidate.nisn ? identityFingerprint("nisn", candidate.nisn) : "",
    };
    const year = tenant.academicYear.match(/^(\d{4})/)?.[1];
    const result = await requestSupabase("/rest/v1/rpc/submit_public_ppdb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_tenant_id: tenant.tenantId,
        p_candidate_id: candidateId,
        p_admission_year: admissionYear,
        p_candidate: dbCandidate,
        p_document_paths: documentPaths,
      }),
    });
    const registrationId = String(result?.registrationId || "");
    if (!registrationId) throw new PublicPpdbError(503, "Server belum menerima nomor pendaftaran yang valid.");
    return {
      id: candidateId,
      tenantId: tenant.tenantId,
      registrationId,
      name: candidate.name,
      gender: candidate.gender,
      grade: candidate.grade,
      previousSchool: candidate.previousSchool,
      stage: "Registered",
      dateApplied: new Date().toISOString().slice(0, 10),
      onboardingStatus: "Pending",
      syncToMasterData: false,
      documents: Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, Boolean(documentPaths[key])])),
    };
  } catch (error: any) {
    await Promise.all(uploadedPaths.map(removeDocument));
    if (error instanceof PublicPpdbError) throw error;
    throw new PublicPpdbError(503, "Pendaftaran gagal diproses. Silakan coba kembali atau hubungi panitia.");
  }
}
