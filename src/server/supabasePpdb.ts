import { createHash, createHmac, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { downloadSupabasePpdbDocument } from "./ppdbDocumentStorage";

type JsonObject = Record<string, any>;

export class SupabasePpdbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabasePpdbError";
    this.status = status;
  }
}

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) throw new SupabasePpdbError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, serviceKey };
}

async function request(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  if (config.serviceKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", `Bearer ${config.serviceKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabasePpdbError(409, body?.message || "Data PPDB bertentangan dengan data tenant.");
    }
    if (["22023", "22P02"].includes(code) || response.status === 400) {
      throw new SupabasePpdbError(400, body?.message || "Data PPDB tidak valid.");
    }
    if (code === "P0002" || response.status === 404) throw new SupabasePpdbError(404, "Calon santri tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabasePpdbError(403, "Operasi PPDB ditolak oleh kebijakan tenant.");
    throw new SupabasePpdbError(503, "Layanan PPDB Supabase belum dapat diproses.");
  }
  return body;
}

function requireUuid(value: string) {
  const normalized = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new SupabasePpdbError(403, "Tenant Supabase yang valid diperlukan.");
  }
  return normalized;
}

function cleanCandidateText(value: unknown, label: string, max: number, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new SupabasePpdbError(400, `${label} wajib diisi.`);
  if (result.length > max) throw new SupabasePpdbError(400, `${label} melebihi batas karakter.`);
  return result;
}

function ppdbRequestFingerprintKey() {
  const key = String(process.env.PII_FINGERPRINT_KEY || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new SupabasePpdbError(503, "Kunci fingerprint data pribadi backend belum dikonfigurasi.");
  }
  return Buffer.from(key, "hex");
}

/** Create tenant-bound offline PPDB records atomically and make uncertain retries idempotent. */
export async function createSupabasePpdbCandidates(
  tenantIdentifier: string,
  actorUserId: string,
  actorRole: string,
  input: unknown,
) {
  const tenantId = requireUuid(tenantIdentifier);
  const actorId = requireUuid(actorUserId);
  const expectedRole = String(actorRole || "").trim().toLowerCase();
  if (expectedRole !== "admin" && expectedRole !== "super_admin") {
    throw new SupabasePpdbError(403, "Hanya Admin tenant yang dapat menambahkan pendaftar PPDB.");
  }
  const payload = input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
  const clientRequestId = String(payload.clientRequestId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    throw new SupabasePpdbError(400, "ID permintaan PPDB tidak valid. Silakan kirim ulang formulir.");
  }
  if (!Array.isArray(payload.candidates) || payload.candidates.length < 1 || payload.candidates.length > 100) {
    throw new SupabasePpdbError(400, "Permintaan harus berisi 1 sampai 100 calon santri.");
  }

  const fingerprintKey = ppdbRequestFingerprintKey();
  const candidates = payload.candidates.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new SupabasePpdbError(400, `Data calon santri ke-${index + 1} tidak valid.`);
    }
    const candidate = raw as JsonObject;
    const registrationId = cleanCandidateText(candidate.registrationId, "Nomor pendaftaran", 50, true);
    const name = cleanCandidateText(candidate.name, "Nama calon santri", 120, true);
    const gender = cleanCandidateText(candidate.gender, "Jenis kelamin", 1, true).toUpperCase();
    const grade = cleanCandidateText(candidate.grade, "Jenjang", 40, true);
    const previousSchool = cleanCandidateText(candidate.previousSchool, "Asal sekolah", 160, true);
    const phone = cleanCandidateText(candidate.phone, "Nomor telepon", 24, true);
    const whatsappPhone = cleanCandidateText(candidate.whatsappPhone, "Nomor WhatsApp", 24, true);
    const email = cleanCandidateText(candidate.email, "Email", 254).toLowerCase();
    const nik = cleanCandidateText(candidate.nik, "NIK", 16, true).replace(/\D/g, "");
    const nisn = cleanCandidateText(candidate.nisn, "NISN", 10).replace(/\D/g, "");
    const pob = cleanCandidateText(candidate.pob, "Tempat lahir", 100, true);
    const dob = cleanCandidateText(candidate.dob, "Tanggal lahir", 10, true);
    const address = cleanCandidateText(candidate.address, "Alamat", 500, true);
    const fatherName = cleanCandidateText(candidate.fatherName, "Nama ayah", 120, true);
    const motherName = cleanCandidateText(candidate.motherName, "Nama ibu", 120, true);
    const fatherJob = cleanCandidateText(candidate.fatherJob, "Pekerjaan ayah", 100);
    const motherJob = cleanCandidateText(candidate.motherJob, "Pekerjaan ibu", 100);
    const fatherEducation = cleanCandidateText(candidate.fatherEducation, "Pendidikan ayah", 80);
    const motherEducation = cleanCandidateText(candidate.motherEducation, "Pendidikan ibu", 80);
    const familyIncome = cleanCandidateText(candidate.familyIncome, "Penghasilan keluarga", 80);
    if (gender !== "L" && gender !== "P") throw new SupabasePpdbError(400, "Jenis kelamin harus L atau P.");
    if (!/^\d{16}$/.test(nik)) throw new SupabasePpdbError(400, "NIK harus terdiri dari 16 digit.");
    if (nisn && !/^\d{10}$/.test(nisn)) throw new SupabasePpdbError(400, "NISN harus terdiri dari 10 digit.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new SupabasePpdbError(400, "Tanggal lahir harus menggunakan format YYYY-MM-DD.");
    const [year, month, day] = dob.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() + 1 !== month || parsedDate.getUTCDate() !== day) {
      throw new SupabasePpdbError(400, "Tanggal lahir tidak valid.");
    }
    if (parsedDate.getTime() > Date.now()) throw new SupabasePpdbError(400, "Tanggal lahir tidak boleh di masa depan.");
    const validPhone = /^\+?[0-9 ().-]{8,24}$/;
    if (!validPhone.test(phone) || !validPhone.test(whatsappPhone)) throw new SupabasePpdbError(400, "Nomor telepon tidak valid.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupabasePpdbError(400, "Alamat email tidak valid.");
    let protectedIdentity: ReturnType<typeof protectPpdbIdentityValues>;
    try { protectedIdentity = protectPpdbIdentityValues(nik, nisn); }
    catch (error: any) {
      if (error instanceof SupabaseOnboardingError) throw new SupabasePpdbError(error.status, error.message);
      throw error;
    }
    return {
      candidateId: randomUUID(),
      registrationId,
      requestFingerprintMaterial: {
        registrationId, name, gender, grade, previousSchool, phone, whatsappPhone, email, nik, nisn,
        pob, dob, address, fatherName, motherName, fatherJob, motherJob,
        fatherEducation, motherEducation, familyIncome,
      },
      candidate: {
        name, gender, grade, previousSchool, phone, whatsappPhone, email,
        nikCiphertext: protectedIdentity.nikCiphertextHex,
        nikFingerprint: protectedIdentity.nikFingerprintHex,
        nisnCiphertext: protectedIdentity.nisnCiphertextHex,
        nisnFingerprint: protectedIdentity.nisnFingerprintHex,
        pob, dob, address, fatherName, motherName, fatherJob, motherJob,
        fatherEducation, motherEducation, familyIncome,
      },
      workflowData: {},
      documents: { kk: false, birthCertificate: false, reportCards: false, ijazah: false, skhun: false, pasPhoto: false },
    };
  });
  // Fingerprint stable normalized plaintext before randomized encryption. Only the HMAC is stored.
  const canonical = JSON.stringify(candidates.map((entry) => entry.requestFingerprintMaterial));
  const payloadFingerprint = createHmac("sha256", fingerprintKey).update(canonical, "utf8").digest("hex");
  const result = await request("/rest/v1/rpc/create_admin_ppdb_candidates_batch", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: expectedRole,
      p_client_request_id: clientRequestId,
      p_payload_fingerprint: payloadFingerprint,
      p_candidates: candidates.map(({ requestFingerprintMaterial: _fingerprintMaterial, ...entry }) => entry),
    }),
  });
  if (!result || typeof result !== "object" || !Array.isArray(result.candidates)
    || result.candidates.length !== candidates.length) {
    throw new SupabasePpdbError(503, "Backend belum mengonfirmasi seluruh calon santri.");
  }
  const createdCandidates = result.candidates.map((item: JsonObject, index: number) => {
    const id = String(item.id || "");
    const registrationId = String(item.registrationId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || registrationId !== candidates[index].registrationId) {
      throw new SupabasePpdbError(503, "Backend belum mengonfirmasi identitas calon santri yang tersimpan.");
    }
    return { id, registrationId };
  });
  return {
    alreadyApplied: result.alreadyApplied === true,
    requestId: String(result.requestId || clientRequestId),
    candidates: createdCandidates,
  };
}

async function requireActiveTenant(tenantId: string) {
  const params = new URLSearchParams({ select: "id", id: `eq.${tenantId}`, status: "eq.active", limit: "2" });
  const rows = await request(`/rest/v1/tenants?${params.toString()}`);
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabasePpdbError(403, "Tenant PPDB tidak aktif atau tidak tersedia.");
}

const CANDIDATE_SELECT = [
  "id", "registration_id", "name", "previous_school", "grade", "phone", "email", "gender",
  "stage", "score", "date_applied", "exam_slot", "interviewer", "interview_slot",
  "interview_notified", "notes", "onboarding_status", "sync_to_master_data", "workflow_data",
].join(",");

function safeScoreMap(value: unknown, allowedFields: readonly string[], min: number, max: number) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const result: Record<string, number> = {};
  for (const field of allowedFields) {
    const score = input[field];
    if (typeof score !== "number") continue;
    if (Number.isInteger(score) && score >= min && score <= max) result[field] = score;
  }
  return result;
}

function safeReligiousScores(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const grades = safeScoreMap(input, ["quranFluency", "tajweedMastery", "worshipPractice"], 0, 100);
  return {
    ...grades,
    memorizedJuz: typeof input.memorizedJuz === "string" ? input.memorizedJuz.slice(0, 500) : "",
    notes: typeof input.notes === "string" ? input.notes.slice(0, 4000) : "",
    totalScore: typeof input.totalScore === "number" && Number.isInteger(input.totalScore) && input.totalScore >= 0 && input.totalScore <= 100 ? input.totalScore : undefined,
    evaluatedAt: typeof input.evaluatedAt === "string" ? input.evaluatedAt.slice(0, 40) : undefined,
    evaluator: typeof input.evaluator === "string" ? input.evaluator.slice(0, 180) : undefined,
  };
}

function safeWorkflow(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  return {
    examScores: safeScoreMap(input.examScores, ["math", "science", "english", "tpa", "quran"], 0, 100),
    interviewScores: safeScoreMap(input.interviewScores, ["academicPotential", "personality", "communication"], 1, 5),
    religiousScores: safeReligiousScores(input.religiousScores),
  };
}

function toCandidate(row: JsonObject, documents: JsonObject = {}, bills: JsonObject = {}) {
  const workflow = safeWorkflow(row.workflow_data);
  return {
    id: String(row.id),
    registrationId: String(row.registration_id || ""),
    name: String(row.name || ""),
    previousSchool: String(row.previous_school || ""),
    grade: String(row.grade || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    gender: String(row.gender || "").toUpperCase() === "P" ? "P" : "L",
    stage: String(row.stage || "Registered"),
    score: row.score == null ? undefined : Number(row.score),
    dateApplied: String(row.date_applied || ""),
    examSlot: String(row.exam_slot || ""),
    interviewer: String(row.interviewer || ""),
    interviewSlot: String(row.interview_slot || ""),
    interviewNotified: Boolean(row.interview_notified),
    notes: String(row.notes || "").slice(0, 4000),
    onboardingStatus: String(row.onboarding_status || "Pending"),
    syncToMasterData: Boolean(row.sync_to_master_data),
    examScores: workflow.examScores,
    interviewScores: workflow.interviewScores,
    religiousScores: workflow.religiousScores,
    bills: {
      registration: bills.registration || null,
      tuition: bills.tuition || null,
    },
    documents: {
      kk: Boolean(documents.kk),
      birthCertificate: Boolean(documents.birth_certificate),
      reportCards: Boolean(documents.report_cards),
      ijazah: Boolean(documents.ijazah),
      skhun: Boolean(documents.skhun),
      pasPhoto: Boolean(documents.pas_photo),
      downloadable: {
        kk: typeof documents.kk_path === "string" && Boolean(documents.kk_path),
        birthCertificate: typeof documents.birth_certificate_path === "string" && Boolean(documents.birth_certificate_path),
        reportCards: typeof documents.report_cards_path === "string" && Boolean(documents.report_cards_path),
        ijazah: typeof documents.ijazah_path === "string" && Boolean(documents.ijazah_path),
        skhun: typeof documents.skhun_path === "string" && Boolean(documents.skhun_path),
        pasPhoto: typeof documents.pas_photo_path === "string" && Boolean(documents.pas_photo_path),
      },
    },
  };
}

export async function listSupabasePpdbCandidates(tenantIdentifier: string, requestedLimit = 250, requestedOffset = 0) {
  const tenantId = requireUuid(tenantIdentifier);
  await requireActiveTenant(tenantId);
  const limit = Math.max(1, Math.min(250, Math.floor(Number(requestedLimit) || 250)));
  const offset = Math.max(0, Math.min(50000, Math.floor(Number(requestedOffset) || 0)));
  const params = new URLSearchParams({
    select: CANDIDATE_SELECT,
    tenant_id: `eq.${tenantId}`,
    order: "date_applied.desc,id.desc",
    limit: String(limit),
    offset: String(offset),
  });
  const rows = await request(`/rest/v1/candidates?${params.toString()}`);
  if (!Array.isArray(rows)) throw new SupabasePpdbError(503, "Daftar PPDB belum dapat dimuat.");
  const ids = rows.map((row: JsonObject) => String(row.id)).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));
  let documentByCandidate = new Map<string, JsonObject>();
  let billsByCandidate = new Map<string, JsonObject>();
  if (ids.length) {
    const documentParams = new URLSearchParams({
      select: "candidate_id,kk,birth_certificate,report_cards,ijazah,skhun,pas_photo,kk_path,birth_certificate_path,report_cards_path,ijazah_path,skhun_path,pas_photo_path",
      tenant_id: `eq.${tenantId}`,
      candidate_id: `in.(${ids.join(",")})`,
      limit: String(Math.min(ids.length + 1, 501)),
    });
    const billParams = new URLSearchParams({
      select: "id,candidate_id,payment_type,fee_type,period,amount,paid_amount,status",
      tenant_id: `eq.${tenantId}`,
      candidate_id: `in.(${ids.join(",")})`,
      payment_type: "in.(registration,tuition)",
      order: "created_at.asc,id.asc",
      limit: "501",
    });
    const [documentRows, billRows] = await Promise.all([
      request(`/rest/v1/candidate_documents?${documentParams.toString()}`),
      String(process.env.SUPABASE_PPDB_FINANCE_BILLS_ENABLED || "").trim().toLowerCase() === "true"
        ? request(`/rest/v1/finance_bills?${billParams.toString()}`)
        : Promise.resolve([]),
    ]);
    if (!Array.isArray(documentRows)) throw new SupabasePpdbError(503, "Dokumen PPDB belum dapat dimuat.");
    documentByCandidate = new Map(documentRows.map((row: JsonObject) => [String(row.candidate_id), row] as [string, JsonObject]));
    if (!Array.isArray(billRows)) throw new SupabasePpdbError(503, "Status tagihan PPDB belum dapat dimuat.");
    billsByCandidate = new Map();
    for (const row of billRows as JsonObject[]) {
      const candidateId = String(row.candidate_id || "");
      const paymentType = String(row.payment_type || "");
      if (!ids.includes(candidateId) || !["registration", "tuition"].includes(paymentType)) continue;
      const entry = billsByCandidate.get(candidateId) || {};
      entry[paymentType] = {
        id: String(row.id),
        feeType: String(row.fee_type || ""),
        period: String(row.period || ""),
        amount: Number(row.amount),
        paidAmount: Number(row.paid_amount),
        status: String(row.status || "unpaid"),
      };
      billsByCandidate.set(candidateId, entry);
    }
  }
  return {
    candidates: rows.map((row: JsonObject) => toCandidate(
      row,
      documentByCandidate.get(String(row.id)),
      billsByCandidate.get(String(row.id)),
    )),
    hasMore: rows.length === limit,
    nextOffset: rows.length === limit ? offset + rows.length : null,
  };
}

export async function createSupabasePpdbCandidateBill(
  tenantIdentifier: string,
  actorUserId: string,
  actorRole: string,
  candidateIdentifier: string,
  value: unknown,
) {
  const tenantId = requireUuid(tenantIdentifier);
  await requireActiveTenant(tenantId);
  const actorId = requireUuid(actorUserId);
  const candidateId = requireUuid(candidateIdentifier);
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const role = actorRole === "Admin" ? "admin" : actorRole === "SuperAdmin" ? "super_admin" : "";
  const paymentType = String(input.paymentType || "");
  const amount = Number(input.amount);
  const clientRequestId = String(input.clientRequestId || "").trim();
  if (!role) throw new SupabasePpdbError(403, "Hanya Admin tenant yang dapat menerbitkan tagihan PPDB.");
  if (!["registration", "tuition"].includes(paymentType)
      || !Number.isSafeInteger(amount) || amount <= 0
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    throw new SupabasePpdbError(400, "Jenis, nominal, atau kunci permintaan tagihan PPDB tidak valid.");
  }
  const result = await request("/rest/v1/rpc/create_tenant_ppdb_candidate_bill", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_expected_role: role,
      p_candidate_id: candidateId,
      p_payment_type: paymentType,
      p_amount: amount,
      p_client_request_id: clientRequestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabasePpdbError(503, "Backend Keuangan belum mengonfirmasi tagihan PPDB.");
  }
  return result as JsonObject;
}

const PPDB_DOCUMENT_PATH_COLUMNS = {
  kk: "kk_path",
  birthCertificate: "birth_certificate_path",
  reportCards: "report_cards_path",
  ijazah: "ijazah_path",
  skhun: "skhun_path",
  pasPhoto: "pas_photo_path",
} as const;

export async function downloadSupabasePpdbCandidateDocument(
  tenantIdentifier: string,
  candidateIdentifier: string,
  actorUserIdentifier: string,
  documentKey: string,
) {
  const tenantId = requireUuid(tenantIdentifier);
  await requireActiveTenant(tenantId);
  const candidateId = requireUuid(candidateIdentifier);
  const actorUserId = requireUuid(actorUserIdentifier);
  if (!Object.hasOwn(PPDB_DOCUMENT_PATH_COLUMNS, documentKey)) {
    throw new SupabasePpdbError(404, "Berkas PPDB tidak ditemukan pada tenant ini.");
  }
  const column = PPDB_DOCUMENT_PATH_COLUMNS[documentKey as keyof typeof PPDB_DOCUMENT_PATH_COLUMNS];
  const params = new URLSearchParams({
    select: column,
    tenant_id: `eq.${tenantId}`,
    candidate_id: `eq.${candidateId}`,
    limit: "2",
  });
  const rows = await request(`/rest/v1/candidate_documents?${params.toString()}`);
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.[column] !== "string") {
    throw new SupabasePpdbError(404, "Berkas PPDB tidak ditemukan pada tenant ini.");
  }

  let downloaded: { bytes: Buffer; contentType: string };
  try {
    downloaded = await downloadSupabasePpdbDocument(rows[0][column], tenantId, candidateId, documentKey);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = Number((error as Error & { status?: number }).status);
      throw new SupabasePpdbError(status || 503, error.message);
    }
    throw error;
  }

  await request("/rest/v1/ppdb_document_access_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenantId,
      candidate_id: candidateId,
      actor_user_id: actorUserId,
      document_key: documentKey,
      content_sha256: `\\x${createHash("sha256").update(downloaded.bytes).digest("hex")}`,
    }),
  });
  const extension = downloaded.contentType === "application/pdf" ? "pdf" : downloaded.contentType === "image/png" ? "png" : "jpg";
  return { ...downloaded, fileName: `ppdb-${documentKey}-${candidateId}.${extension}` };
}

const CORE_FIELDS = new Set(["stage", "notes"]);
// No UI upload/storage flow exists yet, so clients cannot assert document completeness.
const DOCUMENT_FIELDS = new Set<string>();
const WORKFLOW_FIELDS = new Set(["examScores", "interviewScores", "religiousScores"]);

function pickPatch(value: unknown, allowed: Set<string>, label: string) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(input)) {
    if (!allowed.has(key)) throw new SupabasePpdbError(400, `Kolom ${label} tidak didukung.`);
    result[key] = item;
  }
  return result;
}

function normalizeWorkflowPatch(value: unknown) {
  const input = pickPatch(value, WORKFLOW_FIELDS, "workflow PPDB");
  const scoreFields: Record<string, { allowed: string[]; min: number; max: number }> = {
    examScores: { allowed: ["math", "science", "english", "tpa", "quran"], min: 0, max: 100 },
    interviewScores: { allowed: ["academicPotential", "personality", "communication"], min: 1, max: 5 },
    religiousScores: { allowed: ["quranFluency", "tajweedMastery", "worshipPractice"], min: 0, max: 100 },
  };
  const result: JsonObject = {};
  for (const [key, rawScores] of Object.entries(input)) {
    if (!rawScores || typeof rawScores !== "object" || Array.isArray(rawScores)) throw new SupabasePpdbError(400, "Nilai PPDB harus berupa objek bidang nilai.");
    const policy = scoreFields[key];
    if (!policy) throw new SupabasePpdbError(400, "Jenis nilai PPDB tidak didukung.");
    const allowed = key === "religiousScores" ? [...policy.allowed, "memorizedJuz", "notes"] : policy.allowed;
    const scores = pickPatch(rawScores, new Set(allowed), "nilai " + key);
    if (key === "religiousScores") {
      for (const field of policy.allowed) {
        if (!(field in scores)) throw new SupabasePpdbError(400, "Penilaian Al-Qur’an dan Tahfidz harus mengisi ketiga nilai.");
      }
      for (const field of ["memorizedJuz", "notes"]) {
        const value = scores[field];
        if (value !== undefined && (typeof value !== "string" || value.length > (field === "notes" ? 4000 : 500))) {
          throw new SupabasePpdbError(400, field === "notes" ? "Catatan penilaian maksimal 4.000 karakter." : "Keterangan hafalan maksimal 500 karakter.");
        }
      }
    }
    for (const [field, score] of Object.entries(scores)) {
      if (!policy.allowed.includes(field)) continue;
      if (typeof score !== "number" || !Number.isInteger(score) || score < policy.min || score > policy.max) {
        throw new SupabasePpdbError(400, "Nilai " + field + " di luar rentang yang diizinkan.");
      }
    }
    result[key] = scores;
  }
  return result;
}

export async function updateSupabasePpdbCandidate(tenantIdentifier: string, actorUserId: string, candidateIdentifier: string, input: unknown) {
  const tenantId = requireUuid(tenantIdentifier);
  await requireActiveTenant(tenantId);
  const actorId = requireUuid(actorUserId);
  const candidateId = requireUuid(candidateIdentifier);
  const patch = input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
  const core = pickPatch(patch.core, CORE_FIELDS, "PPDB");
  if (core.stage !== undefined && !["Registered", "Document Review", "Entry Exam", "Interview", "Accepted", "Rejected"].includes(String(core.stage))) {
    throw new SupabasePpdbError(400, "Tahap pendaftaran PPDB tidak valid.");
  }
  if (core.notes !== undefined && (typeof core.notes !== "string" || core.notes.length > 4000)) {
    throw new SupabasePpdbError(400, "Catatan PPDB maksimal 4.000 karakter.");
  }
  const workflow = normalizeWorkflowPatch(patch.workflow);
  const documents = pickPatch(patch.documents, DOCUMENT_FIELDS, "dokumen PPDB");
  for (const field of ["kk", "birthCertificate", "reportCards", "ijazah", "skhun", "pasPhoto"]) {
    if (field in documents && typeof documents[field] !== "boolean") throw new SupabasePpdbError(400, "Status kelengkapan dokumen tidak valid.");
  }
  if (!Object.keys(core).length && !Object.keys(workflow).length && !Object.keys(documents).length) {
    throw new SupabasePpdbError(400, "Tidak ada perubahan PPDB untuk disimpan.");
  }
  const result = await request("/rest/v1/rpc/update_ppdb_candidate_guarded", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_candidate_id: candidateId,
      p_core_patch: core,
      p_workflow_patch: workflow,
      p_documents_patch: documents,
    }),
  });
  if (result !== true) throw new SupabasePpdbError(404, "Calon santri tidak ditemukan pada tenant ini.");
  return { success: true };
}
