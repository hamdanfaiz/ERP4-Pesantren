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
      select: "candidate_id,kk,birth_certificate,report_cards,ijazah,skhun,pas_photo",
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
