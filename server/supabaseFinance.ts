import { SupabasePpdbAdminError } from "./supabasePpdbAdmin";

type JsonObject = Record<string, any>;

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabasePpdbAdminError(503, "Konfigurasi backend Supabase belum lengkap.");
  }
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  headers.set("Authorization", "Bearer " + config.serviceKey);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(config.baseUrl + path, { ...init, headers });
  const raw = await response.text();
  let body: any = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (code === "23505" || code === "23503" || code === "23514" || response.status === 409) {
      throw new SupabasePpdbAdminError(409, body?.message || "Transaksi keuangan berbenturan dengan data yang sudah tersimpan.");
    }
    if (code === "22023" || response.status === 400) {
      throw new SupabasePpdbAdminError(400, body?.message || "Data keuangan tidak valid.");
    }
    if (code === "P0002" || response.status === 404) {
      throw new SupabasePpdbAdminError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabasePpdbAdminError(403, "Operasi ditolak oleh kebijakan tenant.");
    }
    if (response.status >= 500) {
      throw new SupabasePpdbAdminError(503, "Layanan Supabase sementara tidak tersedia.");
    }
    throw new SupabasePpdbAdminError(503, "Permintaan ke backend Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantId(tenantIdentifier: string) {
  const normalized = String(tenantIdentifier || "").trim();
  if (!normalized) throw new SupabasePpdbAdminError(403, "Tenant aktif tidak ditemukan.");
  const params = new URLSearchParams({ select: "id,slug,status", limit: "2" });
  if (isUuid(normalized)) params.set("id", "eq." + normalized);
  else params.set("slug", "eq." + normalized.toLowerCase());
  const rows = await supabaseRequest("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabasePpdbAdminError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

function nonEmpty(value: unknown, max = 180) {
  const result = typeof value === "string" ? value.trim() : "";
  return result.length > 0 && result.length <= max ? result : "";
}

function amount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000000000) {
    throw new SupabasePpdbAdminError(400, "Nominal tagihan harus lebih besar dari nol dan berada dalam batas yang didukung.");
  }
  return parsed;
}

export type SupabaseFinanceBilling = {
  id: string;
  tenantId: string;
  candidateId?: string;
  candidateRegistrationId?: string;
  santriId?: string;
  santriName: string;
  grade: string;
  paymentType?: "registration" | "tuition";
  type: string;
  period: string;
  amount: number;
  paidAmount: number;
  status: string;
  date: string;
  paymentMethod?: string | null;
  receiptNo?: string | null;
  proofFile?: string | null;
  proofStoragePath?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function mapBilling(row: JsonObject, tenantIdentifier: string): SupabaseFinanceBilling {
  return {
    id: String(row.id || ""),
    tenantId: tenantIdentifier,
    candidateId: row.candidate_id ? String(row.candidate_id) : undefined,
    candidateRegistrationId: row.candidate_registration_id || undefined,
    santriId: row.student_ref || undefined,
    santriName: String(row.santri_name || ""),
    grade: String(row.grade || ""),
    paymentType: row.payment_type || undefined,
    type: String(row.billing_type || ""),
    period: String(row.period || ""),
    amount: Number(row.amount || 0),
    paidAmount: Number(row.paid_amount || 0),
    status: String(row.status || "Unpaid"),
    date: String(row.billing_date || ""),
    paymentMethod: row.payment_method || null,
    receiptNo: row.receipt_no || null,
    proofFile: row.proof_file || null,
    proofStoragePath: row.proof_storage_path || null,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

async function loadBillingRows(tenantId: string, studentRef?: string) {
  const all: JsonObject[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "tenant_id,id,candidate_id,candidate_registration_id,student_ref,santri_name,grade,payment_type,billing_type,period,amount,paid_amount,status,payment_method,receipt_no,proof_file,proof_storage_path,billing_date,paid_at,created_at,updated_at",
      tenant_id: "eq." + tenantId,
      order: "billing_date.desc,id.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    if (studentRef) params.set("student_ref", "eq." + studentRef);
    const rows = await supabaseRequest("/rest/v1/finance_billings?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data keuangan Supabase belum dapat dibaca.");
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new SupabasePpdbAdminError(503, "Data keuangan melebihi batas halaman migrasi yang didukung.");
}

export async function listSupabaseFinanceBillings(tenantIdentifier: string, studentRef?: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const rows = await loadBillingRows(tenantId, studentRef);
  return rows.map((row) => mapBilling(row, tenantIdentifier));
}

export async function createSupabasePpdbFinanceBilling(
  tenantIdentifier: string,
  candidateIdValue: unknown,
  paymentTypeValue: unknown,
  amountValue: unknown,
  actorUidValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const candidateId = typeof candidateIdValue === "string" ? candidateIdValue.trim() : "";
  const paymentType = paymentTypeValue === "registration" || paymentTypeValue === "tuition" ? paymentTypeValue : "";
  const actorUid = nonEmpty(actorUidValue, 160);
  if (!isUuid(candidateId) || !paymentType || !actorUid) {
    throw new SupabasePpdbAdminError(400, "Data kandidat atau jenis tagihan PPDB tidak valid.");
  }
  const result = await supabaseRequest("/rest/v1/rpc/create_ppdb_finance_billing", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_candidate_id: candidateId,
      p_payment_type: paymentType,
      p_amount: amount(amountValue),
      p_actor_uid: actorUid,
    }),
  });
  if (!result || typeof result !== "object" || typeof result.id !== "string") {
    throw new SupabasePpdbAdminError(503, "Supabase belum mengonfirmasi penerbitan tagihan.");
  }
  return { id: result.id, status: String(result.status || "Unpaid"), created: Boolean(result.created) };
}

export async function recordSupabasePpdbFinancePayment(
  tenantIdentifier: string,
  candidateIdValue: unknown,
  paymentTypeValue: unknown,
  paidAmountValue: unknown,
  statusValue: unknown,
  methodValue: unknown,
  receiptValue: unknown,
  actorUidValue: unknown
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const candidateId = typeof candidateIdValue === "string" ? candidateIdValue.trim() : "";
  const paymentType = paymentTypeValue === "registration" || paymentTypeValue === "tuition" ? paymentTypeValue : "";
  const status = ["Unpaid", "Overdue", "Partial", "Verification", "Paid"].includes(String(statusValue || ""))
    ? String(statusValue) : "";
  const method = nonEmpty(methodValue, 120);
  const actorUid = nonEmpty(actorUidValue, 160);
  const paidAmount = Number(paidAmountValue);
  const receiptNo = typeof receiptValue === "string" ? receiptValue.trim() : "";
  if (!isUuid(candidateId) || !paymentType || !status || !method || !actorUid
    || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > 100000000000
    || (paidAmount > 0 && !receiptNo)) {
    throw new SupabasePpdbAdminError(400, "Data pembayaran PPDB tidak valid.");
  }
  const result = await supabaseRequest("/rest/v1/rpc/record_ppdb_finance_payment", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_candidate_id: candidateId,
      p_payment_type: paymentType,
      p_paid_amount: paidAmount,
      p_status: status,
      p_payment_method: method,
      p_receipt_no: receiptNo || null,
      p_actor_uid: actorUid,
    }),
  });
  if (!result || typeof result !== "object" || typeof result.id !== "string") {
    throw new SupabasePpdbAdminError(503, "Supabase belum mengonfirmasi pencatatan pembayaran.");
  }
  return { id: result.id, status: String(result.status || ""), receiptNo: result.receiptNo || null, alreadyRecorded: Boolean(result.alreadyRecorded) };
}

function normalizeLegacyDate(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
    const date = (value as any).toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return "";
}

function normalizeLegacyBilling(idValue: unknown, value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const id = nonEmpty(idValue, 180);
  if (!id || id.includes("/")) throw new SupabasePpdbAdminError(400, "ID tagihan lama tidak valid.");
  const legacyAmount = amount(source.amount);
  const paidAmount = Number(source.paidAmount || 0);
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > legacyAmount) {
    throw new SupabasePpdbAdminError(400, "Nominal pembayaran pada tagihan lama tidak valid.");
  }
  const status = ["Unpaid", "Overdue", "Partial", "Verification", "Paid", "Rejected"].includes(String(source.status || ""))
    ? String(source.status) : "Unpaid";
  const paymentType = source.paymentType === "registration" || source.paymentType === "tuition" ? source.paymentType : null;
  const registrationId = nonEmpty(source.candidateRegistrationId, 180);
  const candidateId = nonEmpty(source.candidateId, 180);
  const candidateRef = registrationId || candidateId;
  const safe = {
    candidateRegistrationId: candidateRef,
    candidateId: candidateId || null,
    santriId: nonEmpty(source.santriId, 180) || null,
    santriName: nonEmpty(source.santriName, 180),
    grade: nonEmpty(source.grade, 180),
    paymentType,
    type: nonEmpty(source.type, 180),
    period: nonEmpty(source.period, 180),
    amount: legacyAmount,
    paidAmount,
    status,
    date: normalizeLegacyDate(source.date),
    paidAt: normalizeLegacyDate(source.paidAt),
    paymentMethod: nonEmpty(source.paymentMethod, 120) || null,
    receiptNo: nonEmpty(source.receiptNo, 160) || null,
    proofStoragePath: nonEmpty(source.proofStoragePath, 500) || null,
    proofUrl: nonEmpty(source.proofUrl, 1000) || null,
    proofFile: nonEmpty(source.proofFile, 180) || null,
    createdByUid: nonEmpty(source.createdByUid, 160) || null,
    updatedByUid: nonEmpty(source.updatedByUid, 160) || null,
  };
  return { id, safe };
}

function compareImported(existing: JsonObject, incoming: JsonObject) {
  return Number(existing.amount) === Number(incoming.amount)
    && String(existing.status) === String(incoming.status)
    && String(existing.candidate_registration_id || "") === String(incoming.candidateRegistrationId || "")
    && Number(existing.paid_amount || 0) === Number(incoming.paidAmount || 0);
}

export async function migrateSupabaseFinanceBillings(
  tenantIdentifier: string,
  recordsValue: unknown,
  apply: boolean
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!Array.isArray(recordsValue) || recordsValue.length > 5000) {
    throw new SupabasePpdbAdminError(400, "Daftar tagihan migrasi tidak valid atau melebihi batas 5.000 catatan per batch.");
  }
  const existingRows = await loadBillingRows(tenantId);
  const existingById = new Map(existingRows.map((row) => [String(row.id), row]));
  const seenIds = new Set<string>();
  const normalized: Array<{ id: string; safe: JsonObject }> = [];
  const conflicts: Array<{ id: string; reason: string }> = [];
  for (const raw of recordsValue) {
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JsonObject : {};
    try {
      const record = normalizeLegacyBilling(item.id, item.record);
      if (seenIds.has(record.id)) {
        conflicts.push({ id: record.id, reason: "ID muncul lebih dari sekali pada sumber Firestore." });
        continue;
      }
      seenIds.add(record.id);
      const existing = existingById.get(record.id);
      if (existing) {
        if (!compareImported(existing, record.safe)) conflicts.push({ id: record.id, reason: "ID sama tetapi isi inti berbeda; data tidak ditimpa." });
        continue;
      }
      normalized.push(record);
    } catch (error: any) {
      conflicts.push({ id: String(item.id || "(tanpa ID)"), reason: error?.message || "Bentuk data tidak valid." });
    }
  }
  if (!apply) {
    return { mode: "preview", sourceCount: recordsValue.length, readyCount: normalized.length, existingCount: recordsValue.length - normalized.length - conflicts.length, conflicts };
  }
  if (conflicts.length) {
    throw new SupabasePpdbAdminError(409, "Impor dibatalkan karena masih ada konflik; perbaiki datanya lalu jalankan pratinjau kembali.");
  }
  let importedCount = 0;
  const errors: Array<{ id: string; reason: string }> = [];
  for (const record of normalized) {
    try {
      const result = await supabaseRequest("/rest/v1/rpc/import_legacy_finance_billing", {
        method: "POST",
        body: JSON.stringify({ p_tenant_id: tenantId, p_billing_id: record.id, p_record: record.safe }),
      });
      if (result?.created === true) importedCount += 1;
    } catch (error: any) {
      errors.push({ id: record.id, reason: error?.message || "Impor gagal." });
    }
  }
  return { mode: "apply", sourceCount: recordsValue.length, importedCount, errors };
}
