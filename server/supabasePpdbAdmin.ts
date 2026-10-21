import { createCipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

export class SupabasePpdbAdminError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabasePpdbAdminError";
    this.status = status;
  }
}

type JsonObject = Record<string, any>;

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) throw new SupabasePpdbAdminError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, serviceKey };
}

function secretKey(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new SupabasePpdbAdminError(503, "Kunci keamanan server " + name + " belum dikonfigurasi.");
  }
  return Buffer.from(value, "hex");
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", "Bearer " + config.serviceKey);
  headers.set("Accept", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers });
  const raw = await response.text();
  let body: any = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (response.status === 409 || code === "23505") {
      throw new SupabasePpdbAdminError(409, "Nomor pendaftaran, NIK, atau NISN sudah digunakan pada tenant ini.");
    }
    if (response.status >= 500) throw new SupabasePpdbAdminError(503, "Layanan Supabase sementara tidak tersedia.");
    if (response.status === 400 || code === "22023") throw new SupabasePpdbAdminError(400, "Data PPDB tidak valid.");
    if (code === "P0002") throw new SupabasePpdbAdminError(404, "Calon santri tidak ditemukan pada tenant ini.");
    throw new SupabasePpdbAdminError(503, "Permintaan PPDB belum dapat diproses.");
  }
  return body;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function byteaToBuffer(value: unknown) {
  if (typeof value !== "string") return Buffer.alloc(0);
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!hex || !/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return Buffer.alloc(0);
  return Buffer.from(hex, "hex");
}

function decryptIdentity(value: unknown) {
  const packed = byteaToBuffer(value);
  if (packed.length < 29) return "";
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", secretKey("PII_ENCRYPTION_KEY"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptIdentity(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey("PII_ENCRYPTION_KEY"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("hex");
}

function fingerprint(kind: "nik" | "nisn", value: string) {
  return createHmac("sha256", secretKey("PII_FINGERPRINT_KEY")).update(kind + ":" + value, "utf8").digest("hex");
}

function tenantQueryPath(tenantIdentifier: string) {
  const params = new URLSearchParams({ select: "id,slug,status", limit: "2" });
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdentifier)) params.set("id", "eq." + tenantIdentifier);
  else params.set("slug", "eq." + tenantIdentifier.trim().toLowerCase());
  return "/rest/v1/tenants?" + params.toString();
}

async function resolveActiveTenantId(tenantIdentifier: string) {
  const rows = await supabaseRequest(tenantQueryPath(tenantIdentifier));
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabasePpdbAdminError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

async function loadAllRows(table: string, tenantId: string) {
  const all: JsonObject[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 1000000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "*",
      tenant_id: "eq." + tenantId,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (table === "candidates") params.set("order", "created_at.desc");
    const rows = await supabaseRequest("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data PPDB Supabase tidak dapat dibaca.");
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new SupabasePpdbAdminError(413, "Jumlah data PPDB melebihi batas pengambilan aman.");
}

export async function listSupabasePpdbCandidates(tenantIdentifier: string) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const [candidateRows, documentRows] = await Promise.all([
    loadAllRows("candidates", tenantId),
    loadAllRows("candidate_documents", tenantId),
  ]);
  const documentByCandidate = new Map<string, JsonObject>();
  for (const row of documentRows) documentByCandidate.set(String(row.candidate_id), row);

  return candidateRows.map((row) => {
    const documents = documentByCandidate.get(String(row.id)) || {};
    const workflow = asObject(row.workflow_data);
    return {
      ...workflow,
      id: String(row.id),
      tenantId: tenantIdentifier,
      registrationId: String(row.registration_id || ""),
      name: String(row.name || ""),
      previousSchool: String(row.previous_school || ""),
      grade: String(row.grade || ""),
      phone: String(row.phone || ""),
      whatsappPhone: String(row.whatsapp_phone || ""),
      email: String(row.email || ""),
      nik: decryptIdentity(row.nik_ciphertext),
      nisn: decryptIdentity(row.nisn_ciphertext),
      pob: String(row.pob || ""),
      dob: String(row.dob || ""),
      address: String(row.address || ""),
      province: String(row.province || ""),
      regency: String(row.regency || ""),
      district: String(row.district || ""),
      village: String(row.village || ""),
      gender: row.gender,
      fatherName: String(row.father_name || ""),
      motherName: String(row.mother_name || ""),
      fatherJob: String(row.father_job || ""),
      motherJob: String(row.mother_job || ""),
      fatherEducation: String(row.father_education || ""),
      motherEducation: String(row.mother_education || ""),
      familyIncome: String(row.family_income || ""),
      stage: row.stage,
      score: row.score == null ? undefined : Number(row.score),
      dateApplied: String(row.date_applied || ""),
      examSlot: row.exam_slot || undefined,
      interviewer: row.interviewer || undefined,
      interviewSlot: row.interview_slot || undefined,
      interviewNotified: Boolean(row.interview_notified),
      notes: row.notes || "",
      syncToMasterData: Boolean(row.sync_to_master_data),
      onboardingStatus: row.onboarding_status || "Pending",
      documents: {
        kk: Boolean(documents.kk),
        birthCertificate: Boolean(documents.birth_certificate),
        reportCards: Boolean(documents.report_cards),
        ijazah: Boolean(documents.ijazah),
        skhun: Boolean(documents.skhun),
        pasPhoto: Boolean(documents.pas_photo),
      },
    };
  });
}

const CORE_FIELDS = new Set([
  "stage", "score", "examSlot", "interviewer", "interviewSlot", "interviewNotified", "notes",
  "syncToMasterData", "onboardingStatus",
]);
const DOCUMENT_FIELDS = new Set(["kk", "birthCertificate", "reportCards", "ijazah", "skhun", "pasPhoto"]);
const WORKFLOW_FIELDS = new Set([
  "interviewNotifiedAt", "syncDate", "onboardedAt", "waliAccountCreated", "waliAccountStatus", "waliUsername",
  "nis", "classId", "className", "dormitory", "dormitoryId", "room", "roomId",
  "examScores", "interviewScores", "religiousScores", "payment", "cbtSync", "socioEconomic", "socioEconomicData",
]);

function setNested(target: JsonObject, path: string[], value: any) {
  let current = target;
  for (const part of path.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) current[part] = {};
    current = current[part];
  }
  current[path[path.length - 1]] = value;
}

function sanitizePatch(raw: unknown) {
  const patch = asObject(raw);
  const core: JsonObject = {};
  const workflow: JsonObject = {};
  const documents: JsonObject = {};
  for (const [rawKey, value] of Object.entries(patch)) {
    const parts = rawKey.split(".");
    const top = parts[0];
    if (CORE_FIELDS.has(rawKey) && parts.length === 1) {
      core[rawKey] = value;
      continue;
    }
    if (DOCUMENT_FIELDS.has(rawKey) && parts.length === 1) {
      if (typeof value !== "boolean") throw new SupabasePpdbAdminError(400, "Status dokumen tidak valid.");
      documents[rawKey] = value;
      continue;
    }
    if (WORKFLOW_FIELDS.has(top) && (parts.length === 1 || (parts.length === 2 && ["examScores", "interviewScores"].includes(top) && /^[A-Za-z0-9_-]{1,40}$/.test(parts[1])))) {
      setNested(workflow, parts, value);
      continue;
    }
    throw new SupabasePpdbAdminError(400, "Kolom PPDB tidak diizinkan untuk diperbarui: " + rawKey);
  }
  if (core.stage && !["Registered", "Document Review", "Entry Exam", "Interview", "Accepted", "Rejected", "Withdrawn"].includes(String(core.stage))) {
    throw new SupabasePpdbAdminError(400, "Tahap pendaftaran tidak valid.");
  }
  if (core.score !== undefined && (!Number.isInteger(Number(core.score)) || Number(core.score) < 0 || Number(core.score) > 100)) {
    throw new SupabasePpdbAdminError(400, "Nilai harus antara 0 dan 100.");
  }
  if (core.interviewNotified !== undefined && typeof core.interviewNotified !== "boolean") {
    throw new SupabasePpdbAdminError(400, "Status notifikasi wawancara tidak valid.");
  }
  return { core, workflow, documents };
}

export async function updateSupabasePpdbCandidate(
  tenantIdentifier: string,
  candidateId: string,
  rawPatch: unknown
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const patch = sanitizePatch(rawPatch);
  const updated = await supabaseRequest("/rest/v1/rpc/update_ppdb_candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_candidate_id: candidateId,
      p_core_patch: patch.core,
      p_workflow_patch: patch.workflow,
      p_documents_patch: patch.documents,
    }),
  });
  if (updated !== true) throw new SupabasePpdbAdminError(404, "Calon santri tidak ditemukan pada tenant ini.");
  return true;
}

export async function updateSupabasePpdbCandidatesBatch(
  tenantIdentifier: string,
  updates: Array<{ id: string; patch: unknown }>
) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 500) {
    throw new SupabasePpdbAdminError(400, "Jumlah perubahan kandidat tidak valid.");
  }
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const sanitized = updates.map((item) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(item?.id || ""))) throw new SupabasePpdbAdminError(400, "ID calon santri tidak valid.");
    return { id: item.id, ...sanitizePatch(item.patch) };
  });
  await supabaseRequest("/rest/v1/rpc/update_ppdb_candidates_batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_id: tenantId, p_updates: sanitized }),
  });
  return sanitized.length;
}

const DOCUMENT_PATH_FIELDS: Record<string, string> = {
  kk: "kk_path",
  birthCertificate: "birth_certificate_path",
  reportCards: "report_cards_path",
  ijazah: "ijazah_path",
  skhun: "skhun_path",
  pasPhoto: "pas_photo_path",
};
const DOCUMENT_RPC_PATH_FIELDS: Record<string, string> = {
  kk: "kkPath",
  birthCertificate: "birthCertificatePath",
  reportCards: "reportCardsPath",
  ijazah: "ijazahPath",
  skhun: "skhunPath",
  pasPhoto: "pasPhotoPath",
};

async function removeStorageObject(path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  try {
    await supabaseRequest("/storage/v1/object/ppdb-documents/" + encodedPath, { method: "DELETE" });
  } catch {
    // A scheduled Storage reconciliation can remove an orphan if compensation fails.
  }
}

export async function uploadSupabasePpdbCandidateDocument(
  tenantIdentifier: string,
  candidateId: string,
  docKey: string,
  rawFile: unknown
) {
  if (!/^[0-9a-f-]{36}$/i.test(candidateId) || !Object.prototype.hasOwnProperty.call(DOCUMENT_PATH_FIELDS, docKey)) {
    throw new SupabasePpdbAdminError(400, "ID calon atau jenis dokumen tidak valid.");
  }
  const file = asObject(rawFile);
  const mimeType = String(file.mimeType || "");
  const base64 = typeof file.base64 === "string" ? file.base64 : "";
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mimeType)) {
    throw new SupabasePpdbAdminError(400, "Dokumen harus berupa PDF, JPG, atau PNG.");
  }
  const maxBytes = 2 * 1024 * 1024;
  const maxLength = Math.ceil(maxBytes / 3) * 4;
  if (!base64 || base64.length > maxLength || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new SupabasePpdbAdminError(400, "Encoding atau ukuran dokumen tidak valid. Maksimal 2 MB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== base64) {
    throw new SupabasePpdbAdminError(400, "Ukuran dokumen tidak valid. Maksimal 2 MB.");
  }
  const isPdf = mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isPng = mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = mimeType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPdf && !isPng && !isJpeg) throw new SupabasePpdbAdminError(400, "Isi dokumen tidak cocok dengan format berkasnya.");

  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const currentRows = await supabaseRequest(
    "/rest/v1/candidate_documents?" + new URLSearchParams({
      select: DOCUMENT_PATH_FIELDS[docKey],
      tenant_id: "eq." + tenantId,
      candidate_id: "eq." + candidateId,
      limit: "1",
    }).toString()
  );
  const previousPath = Array.isArray(currentRows) ? String(currentRows[0]?.[DOCUMENT_PATH_FIELDS[docKey]] || "") : "";
  const extension = isPdf ? "pdf" : (isPng ? "png" : "jpg");
  const objectPath = tenantId + "/" + candidateId + "/" + docKey + "-" + randomUUID() + "." + extension;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  try {
    await supabaseRequest("/storage/v1/object/ppdb-documents/" + encodedPath, {
      method: "POST",
      headers: { "Content-Type": mimeType, "x-upsert": "false" },
      body: bytes,
    });
    const documentsPatch = { [DOCUMENT_RPC_PATH_FIELDS[docKey]]: objectPath };
    const updated = await supabaseRequest("/rest/v1/rpc/update_ppdb_candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_tenant_id: tenantId,
        p_candidate_id: candidateId,
        p_core_patch: {},
        p_workflow_patch: {},
        p_documents_patch: documentsPatch,
      }),
    });
    if (updated !== true) throw new SupabasePpdbAdminError(404, "Calon santri tidak ditemukan pada tenant ini.");
    if (previousPath && previousPath !== objectPath) await removeStorageObject(previousPath);
    return true;
  } catch (error: any) {
    await removeStorageObject(objectPath);
    if (error instanceof SupabasePpdbAdminError) throw error;
    throw new SupabasePpdbAdminError(503, "Dokumen belum dapat disimpan.");
  }
}

function field(raw: JsonObject, key: string, max: number, required = false) {
  const value = typeof raw[key] === "string" ? raw[key].trim() : "";
  if (required && !value) throw new SupabasePpdbAdminError(400, "Kolom " + key + " wajib diisi.");
  if (value.length > max) throw new SupabasePpdbAdminError(400, "Kolom " + key + " terlalu panjang.");
  return value;
}

export async function createSupabasePpdbCandidate(tenantIdentifier: string, raw: unknown) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const input = asObject(raw);
  const registrationId = field(input, "registrationId", 50, true).toUpperCase();
  const candidate = {
    name: field(input, "name", 150, true),
    previousSchool: field(input, "previousSchool", 150),
    grade: field(input, "grade", 50, true),
    phone: field(input, "phone", 24),
    whatsappPhone: field(input, "whatsappPhone", 24),
    email: field(input, "email", 254).toLowerCase(),
    nik: field(input, "nik", 16, true).replace(/\D/g, ""),
    nisn: field(input, "nisn", 10).replace(/\D/g, ""),
    pob: field(input, "pob", 100),
    dob: field(input, "dob", 10),
    address: field(input, "address", 500),
    province: field(input, "province", 80),
    regency: field(input, "regency", 80),
    district: field(input, "district", 80),
    village: field(input, "village", 80),
    fatherName: field(input, "fatherName", 150),
    motherName: field(input, "motherName", 150),
    fatherJob: field(input, "fatherJob", 100),
    motherJob: field(input, "motherJob", 100),
    fatherEducation: field(input, "fatherEducation", 80),
    motherEducation: field(input, "motherEducation", 80),
    familyIncome: field(input, "familyIncome", 80),
    gender: field(input, "gender", 1) || "L",
    stage: field(input, "stage", 30) || "Registered",
    dateApplied: field(input, "dateApplied", 10) || new Date().toISOString().slice(0, 10),
    score: input.score == null ? 0 : Number(input.score),
    onboardingStatus: field(input, "onboardingStatus", 30) || "Pending",
    syncToMasterData: input.syncToMasterData === true,
  };
  if (!/^[A-Z0-9._-]{1,50}$/.test(registrationId)) throw new SupabasePpdbAdminError(400, "Nomor pendaftaran tidak valid.");
  if (!/^\d{16}$/.test(candidate.nik)) throw new SupabasePpdbAdminError(400, "NIK harus terdiri dari 16 digit.");
  if (candidate.nisn && !/^\d{10}$/.test(candidate.nisn)) throw new SupabasePpdbAdminError(400, "NISN harus terdiri dari 10 digit.");
  if (candidate.gender !== "L" && candidate.gender !== "P") throw new SupabasePpdbAdminError(400, "Jenis kelamin tidak valid.");
  if (!["Registered", "Document Review", "Entry Exam", "Interview", "Accepted", "Rejected", "Withdrawn"].includes(candidate.stage)) {
    throw new SupabasePpdbAdminError(400, "Tahap pendaftaran tidak valid.");
  }
  if (!Number.isInteger(candidate.score) || candidate.score < 0 || candidate.score > 100) {
    throw new SupabasePpdbAdminError(400, "Nilai harus antara 0 dan 100.");
  }
  const encrypted = {
    ...candidate,
    nikCiphertext: encryptIdentity(candidate.nik),
    nikFingerprint: fingerprint("nik", candidate.nik),
    nisnCiphertext: candidate.nisn ? encryptIdentity(candidate.nisn) : "",
    nisnFingerprint: candidate.nisn ? fingerprint("nisn", candidate.nisn) : "",
  };
  const workflow = asObject(input.workflowData);
  const documents = asObject(input.documents);
  for (const key of Object.keys(documents)) {
    if (!DOCUMENT_FIELDS.has(key) || typeof documents[key] !== "boolean") {
      throw new SupabasePpdbAdminError(400, "Checklist dokumen tidak valid.");
    }
  }
  const result = await supabaseRequest("/rest/v1/rpc/create_admin_ppdb_candidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_candidate_id: randomUUID(),
      p_registration_id: registrationId,
      p_candidate: encrypted,
      p_workflow_data: workflow,
      p_documents: documents,
    }),
  });
  return result;
}
