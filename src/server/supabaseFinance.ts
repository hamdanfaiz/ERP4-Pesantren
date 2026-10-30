import { listGuardianStudentIds } from "./identityStore";
import { readPostgrestRowsInPages } from "./postgrestPagination";

type Row = Record<string, any>;

export class SupabaseFinanceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseFinanceError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseFinanceError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(baseUrl + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseFinanceError(409, body?.message || "Data keuangan bertentangan dengan transaksi tenant.");
    if (code === "P0002" || response.status === 404) throw new SupabaseFinanceError(404, body?.message || "Data keuangan tidak ditemukan pada tenant.");
    if (code === "42501" || response.status === 403) throw new SupabaseFinanceError(403, "Operasi keuangan ditolak oleh kebijakan tenant.");
    if (code === "55000") throw new SupabaseFinanceError(423, body?.message || "Buku keuangan sedang ditutup.");
    if (code === "22023" || response.status === 400) throw new SupabaseFinanceError(400, body?.message || "Data keuangan tidak valid.");
    throw new SupabaseFinanceError(503, "Layanan keuangan Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function expectedRole(role: string) {
  const roles: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin", Ustadz: "ustadz", Walisantri: "wali_santri" };
  return roles[role] || "";
}

async function resolveTenantId(identifier: string) {
  const value = String(identifier || "").trim();
  if (!value) throw new SupabaseFinanceError(403, "Tenant aktif tidak ditemukan.");
  const lookup = async (column: "id" | "slug" | "legacy_tenant_key", key: string) => {
    const params = new URLSearchParams({ select: "id,status", [column]: "eq." + key, limit: "2" });
    return request("/rest/v1/tenants?" + params.toString());
  };
  let rows: Row[] = [];
  if (isUuid(value)) {
    const result = await lookup("id", value);
    if (Array.isArray(result)) rows = result;
  } else {
    const legacy = await lookup("legacy_tenant_key", value);
    if (Array.isArray(legacy)) rows = legacy;
    if (!rows.length) {
      const slug = await lookup("slug", value.toLowerCase());
      if (Array.isArray(slug)) rows = slug;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") throw new SupabaseFinanceError(403, "Tenant aktif tidak ditemukan di Supabase.");
  return String(rows[0].id);
}

async function tenantRows(table: string, tenantId: string, select: string, order: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: "5001", ...extra });
  return readPostgrestRowsInPages<Row>({
    request,
    path: `/rest/v1/${table}?${params.toString()}`,
    maxRows: 5000,
    onIncomplete: () => new SupabaseFinanceError(503, "Snapshot keuangan melebihi batas aman tampilan atau hasil pemindaian tidak lengkap."),
  });
}

export async function listSupabaseFinanceSnapshot(tenantIdentifier: string, actorUserId: string, role: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId)) throw new SupabaseFinanceError(403, "Akun ini tidak dapat membaca keuangan tenant.");
  if (!["Admin", "SuperAdmin", "Ustadz", "Walisantri"].includes(role)) throw new SupabaseFinanceError(403, "Role ini belum memiliki akses Finance Supabase.");
  const profileParams = new URLSearchParams({ select: "user_id,role,status,organization_unit_id", tenant_id: "eq." + tenantId, user_id: "eq." + actorUserId, status: "eq.active", limit: "2" });
  const profiles = await request("/rest/v1/profiles?" + profileParams.toString());
  if (!Array.isArray(profiles) || profiles.length !== 1 || String(profiles[0]?.role || "").toLowerCase() !== expected) throw new SupabaseFinanceError(403, "Profil Finance Supabase tidak cocok dengan tenant aktif.");
  const isAdmin = role === "Admin" || role === "SuperAdmin";
  const activeUnits = isAdmin || role === "Ustadz"
    ? await tenantRows("organization_units", tenantId, "id,code,name,unit_type", "name.asc,code.asc,id.asc", { status: "eq.active" })
    : [];
  const actorUnitKey = String(profiles[0]?.organization_unit_id || "").trim();
  const financeUnits = isAdmin
    ? activeUnits
    : role === "Ustadz" && actorUnitKey
      ? activeUnits.filter((unit) => String(unit.id) === actorUnitKey)
      : [];
  const unitNames = new Map(financeUnits.map((unit) => [String(unit.id), String(unit.name || unit.code)]));
  let guardianStudentIds: string[] = [];
  if (role === "Walisantri") {
    try { guardianStudentIds = await listGuardianStudentIds(tenantId, actorUserId); }
    catch { throw new SupabaseFinanceError(403, "Akun Wali belum tertaut ke santri aktif."); }
  }
  const [billRows, expenseRows, ledgerRows, students, controls] = await Promise.all([
    role === "Walisantri" && guardianStudentIds.length > 0
      ? tenantRows("finance_bills", tenantId, "id,student_id,student_name,grade,fee_type,period,amount,paid_amount,status,bill_date,payment_method,proof_file,proof_storage_path,uploaded_at,rejection_reason,receipt_no,paid_at,payment_type", "bill_date.desc,id.desc", { student_id: "in.(" + guardianStudentIds.join(",") + ")" })
      : isAdmin ? tenantRows("finance_bills", tenantId, "id,student_id,student_name,grade,fee_type,period,amount,paid_amount,status,bill_date,payment_method,proof_file,proof_storage_path,uploaded_at,rejection_reason,receipt_no,paid_at,payment_type", "bill_date.desc,id.desc") : Promise.resolve([]),
    isAdmin
      ? tenantRows("finance_expenses", tenantId, "id,unit_id,category,description,amount,expense_date,status,department,requester_user_id,requester_name,reviewed_by_user_id,reviewed_at,rejection_reason,created_at", "expense_date.desc,id.desc")
      : role === "Ustadz" && financeUnits.length === 1
        ? tenantRows("finance_expenses", tenantId, "id,unit_id,category,description,amount,expense_date,status,department,requester_user_id,requester_name,reviewed_by_user_id,reviewed_at,rejection_reason,created_at", "expense_date.desc,id.desc", { requester_user_id: "eq." + actorUserId, unit_id: "eq." + String(financeUnits[0].id) })
        : Promise.resolve([]),
    isAdmin ? tenantRows("finance_ledger", tenantId, "id,unit_id,entry_type,source_type,source_id,description,amount,payment_method,receipt_no,actor_user_id,posted_at", "posted_at.desc,id.desc") : Promise.resolve([]),
    isAdmin ? tenantRows("students", tenantId, "id,name,grade,status", "grade.asc,name.asc") : Promise.resolve([]),
    isAdmin ? request("/rest/v1/finance_controls?" + new URLSearchParams({ select: "finance_locked", tenant_id: "eq." + tenantId, limit: "2" }).toString()) : Promise.resolve([]),
  ]);
  const normalizedExpenses = expenseRows.map((row) => ({
    id: String(row.id), category: String(row.category), description: String(row.description), amount: Number(row.amount),
    date: String(row.expense_date), status: String(row.status), department: String(row.department),
    unitId: row.unit_id ? String(row.unit_id) : null,
    unitName: row.unit_id ? unitNames.get(String(row.unit_id)) || "Unit tidak aktif / belum dipetakan" : "Unit lama / belum dipetakan",
    requester: String(row.requester_name),
    requesterUid: String(row.requester_user_id), approvedByUid: row.reviewed_by_user_id || null, approvedAt: row.reviewed_at || null,
    rejectionReason: row.rejection_reason || "",
  }));
  const normalizedBills = billRows.map((row) => ({
    id: String(row.id), santriId: row.student_id ? String(row.student_id) : "", santriName: String(row.student_name), grade: String(row.grade || ""),
    type: String(row.fee_type), period: String(row.period), amount: Number(row.amount), paidAmount: Number(row.paid_amount),
    status: String(row.status), date: String(row.bill_date), paymentMethod: row.payment_method || null,
    proofFile: row.proof_file || null, proofStoragePath: row.proof_storage_path || null, uploadedAt: row.uploaded_at || null,
    rejectionReason: row.rejection_reason || "", receiptNo: row.receipt_no || null, paidAt: row.paid_at || null,
    paymentType: row.payment_type || null,
  }));
  return {
    bills: normalizedBills,
    units: financeUnits.map((unit) => ({ id: String(unit.id), code: String(unit.code), name: String(unit.name), unitType: String(unit.unit_type) })),
    expenses: normalizedExpenses,
    ledger: ledgerRows.map((row) => ({ id: String(row.id), type: String(row.entry_type), sourceType: String(row.source_type), sourceId: String(row.source_id), description: String(row.description), amount: Number(row.amount), paymentMethod: row.payment_method || null, receiptNo: row.receipt_no || null, unitId: row.unit_id ? String(row.unit_id) : null, unitName: row.unit_id ? unitNames.get(String(row.unit_id)) || "Unit tidak aktif / belum dipetakan" : null, date: String(row.posted_at) })),
    students: students
      .filter((row) => !["archived", "archive", "arsip", "inactive", "nonaktif", "tidak aktif", "alumni", "graduated", "lulus", "dikeluarkan"].includes(String(row.status || "").trim().toLowerCase()))
      .map((row) => ({ id: String(row.id), name: String(row.name || ""), grade: String(row.grade || "") })),
    financeLocked: Array.isArray(controls) && controls.length === 1 ? controls[0].finance_locked === true : false,
  };
}

export async function getSupabaseFinanceBill(tenantIdentifier: string, billId: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  if (!isUuid(billId)) throw new SupabaseFinanceError(400, "ID tagihan tidak valid.");
  const params = new URLSearchParams({ select: "id,student_id,status,proof_file,proof_storage_path,proof_storage_provider,amount,paid_amount", tenant_id: "eq." + tenantId, id: "eq." + billId, limit: "2" });
  const rows = await request("/rest/v1/finance_bills?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) throw new SupabaseFinanceError(404, "Tagihan tidak ditemukan pada tenant.");
  return rows[0] as Row;
}

async function rpc(name: string, body: Row) {
  const result = await request("/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify(body) });
  if (!result || typeof result !== "object" || result.success !== true) throw new SupabaseFinanceError(503, "Backend Finance belum mengonfirmasi transaksi.");
  return result as Row;
}

function validRequestId(value: unknown) {
  const id = String(value || "").trim();
  if (!isUuid(id)) throw new SupabaseFinanceError(400, "Kunci permintaan tidak valid.");
  return id;
}

export async function createSupabaseFinanceBills(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !["admin", "super_admin"].includes(expected) || !value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseFinanceError(403, "Hanya Admin tenant yang dapat menerbitkan tagihan.");
  const input = value as Row;
  const requestId = validRequestId(input.clientRequestId);
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 500) throw new SupabaseFinanceError(400, "Jumlah tagihan harus 1 sampai 500.");
  const items = input.items.map((entry: any) => {
    const studentId = String(entry?.studentId || "").trim();
    const feeType = String(entry?.feeType || "").trim();
    const period = String(entry?.period || "").trim();
    const amount = Number(entry?.amount);
    if (!isUuid(studentId) || !feeType || feeType.length > 160 || !period || period.length > 80 || !Number.isSafeInteger(amount) || amount <= 0) throw new SupabaseFinanceError(400, "Santri, jenis, periode, atau nominal tagihan tidak valid.");
    return { studentId, feeType, period, amount };
  });
  return rpc("create_tenant_finance_bills", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expected, p_items: items, p_client_request_id: requestId });
}

export async function createSupabaseFinanceExpense(tenantIdentifier: string, actorId: string, role: string, requesterName: string, actorUnitKey: string | undefined, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !["admin", "super_admin", "ustadz"].includes(expected) || !value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseFinanceError(403, "Role ini tidak dapat mengajukan pengeluaran.");
  const item = value as Row;
  const category = String(item.category || "").trim();
  const description = String(item.description || "").trim();
  const department = String(item.department || "").trim();
  const requestedUnitId = String(item.unitId || "").trim();
  const amount = Number(item.amount);
  const expenseDate = String(item.expenseDate || "").trim();
  if (!category || category.length > 100 || !description || description.length > 1000 || !department || department.length > 120 || !Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new SupabaseFinanceError(400, "Kategori, uraian, unit, nominal, atau tanggal tidak valid.");
  const unitKey = role === "Ustadz" ? String(actorUnitKey || "").trim() : requestedUnitId;
  if (!unitKey) throw new SupabaseFinanceError(403, "Unit kerja belum ditetapkan pada profil akun ini.");
  const unitFilter = isUuid(unitKey)
    ? { id: "eq." + unitKey }
    : { code: "eq." + unitKey.toUpperCase() };
  const unitParams = new URLSearchParams({ select: "id", tenant_id: "eq." + tenantId, status: "eq.active", limit: "2", ...unitFilter });
  const units = await request("/rest/v1/organization_units?" + unitParams.toString());
  if (!Array.isArray(units) || units.length !== 1 || !isUuid(String(units[0]?.id || ""))) {
    throw new SupabaseFinanceError(403, "Pilih satu unit organisasi yang aktif pada tenant ini.");
  }
  const unitId = String(units[0].id);
  return rpc("create_tenant_finance_expense_for_unit", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expected, p_unit_id: unitId, p_category: category,
    p_description: description, p_department: department, p_amount: amount, p_expense_date: expenseDate,
    p_requester_name: String(requesterName || "Pengguna").trim().slice(0, 180), p_client_request_id: validRequestId(item.clientRequestId),
  });
}

export async function reviewSupabaseFinanceExpense(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  const action = String(item.action || "");
  const expenseId = String(item.expenseId || "");
  const reason = String(item.rejectionReason || "").trim();
  if (!isUuid(expenseId) || !["approve", "reject"].includes(action) || (action === "reject" && (!reason || reason.length > 1000))) throw new SupabaseFinanceError(400, "Keputusan pengeluaran tidak valid.");
  return rpc("review_tenant_finance_expense", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expectedRole(role), p_expense_id: expenseId,
    p_action: action, p_rejection_reason: reason || null, p_client_request_id: validRequestId(item.clientRequestId),
  });
}

export async function reviewSupabaseFinanceBill(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  const action = String(item.action || "");
  const billId = String(item.billId || "");
  const methodOrReason = String(item.methodOrReason || "").trim();
  if (!isUuid(billId) || !["settle", "reject"].includes(action) || !methodOrReason || methodOrReason.length > (action === "settle" ? 100 : 1000)) throw new SupabaseFinanceError(400, "Keputusan tagihan tidak valid.");
  return rpc("review_tenant_finance_bill", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expectedRole(role), p_bill_id: billId,
    p_action: action, p_method_or_reason: methodOrReason, p_client_request_id: validRequestId(item.clientRequestId),
  });
}

export async function setSupabaseFinanceLock(tenantIdentifier: string, actorId: string, role: string, value: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  if (typeof item.locked !== "boolean") throw new SupabaseFinanceError(400, "Status buku tidak valid.");
  return rpc("set_tenant_finance_lock", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expectedRole(role), p_locked: item.locked,
    p_client_request_id: validRequestId(item.clientRequestId),
  });
}

export async function registerSupabaseFinanceProof(tenantIdentifier: string, actorId: string, role: string, billId: string, storagePath: string, fileName: string, paymentMethod: string, fileSha256: string, requestId: string) {
  if (!/^[0-9a-f]{64}$/i.test(fileSha256)) throw new SupabaseFinanceError(400, "Fingerprint berkas bukti tidak valid.");
  const tenantId = await resolveTenantId(tenantIdentifier);
  return rpc("register_tenant_finance_payment_proof", {
    p_tenant_id: tenantId, p_actor_user_id: actorId, p_expected_role: expectedRole(role), p_bill_id: billId,
    p_storage_path: storagePath, p_file_name: fileName, p_payment_method: paymentMethod, p_file_sha256: fileSha256.toLowerCase(), p_client_request_id: validRequestId(requestId),
  });
}
