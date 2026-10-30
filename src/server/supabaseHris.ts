type Row = Record<string, any>;

export class SupabaseHrisError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseHrisError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseHrisError(503, "Konfigurasi backend Supabase belum lengkap.");
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
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabaseHrisError(409, body?.message || "Data HRIS berbenturan dengan record tenant yang sudah ada.");
    }
    if (code === "22023" || response.status === 400) throw new SupabaseHrisError(400, body?.message || "Data HRIS tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseHrisError(404, body?.message || "Record HRIS tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseHrisError(403, "Operasi HRIS ditolak oleh kebijakan tenant.");
    throw new SupabaseHrisError(response.status >= 500 ? 503 : response.status, "Layanan HRIS Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantId(identifier: string) {
  const value = String(identifier || "").trim();
  if (!value) throw new SupabaseHrisError(403, "Tenant aktif tidak ditemukan.");
  const params = new URLSearchParams({ select: "id,status", limit: "2" });
  if (isUuid(value)) params.set("id", "eq." + value);
  else {
    params.set("legacy_tenant_key", "eq." + value);
    let rows = await request("/rest/v1/tenants?" + params.toString());
    if (Array.isArray(rows) && rows.length === 0) {
      const slugParams = new URLSearchParams({ select: "id,status", slug: "eq." + value.toLowerCase(), limit: "2" });
      rows = await request("/rest/v1/tenants?" + slugParams.toString());
    }
    if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status) !== "active") {
      throw new SupabaseHrisError(403, "Tenant aktif tidak ditemukan di Supabase.");
    }
    return String(rows[0].id);
  }
  const rows = await request("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status) !== "active") {
    throw new SupabaseHrisError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

async function listTenantRows(table: string, tenantId: string, select: string, order: string) {
  const all: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const params = new URLSearchParams({
      select, tenant_id: "eq." + tenantId, order, limit: String(pageSize), offset: String(offset),
    });
    const rows = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseHrisError(503, "Data HRIS tenant belum dapat dimuat.");
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new SupabaseHrisError(503, "Data HRIS melampaui batas snapshot. Tambahkan paginasi sebelum melanjutkan.");
}

export async function listSupabaseHrisSnapshot(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const [employees, attendance, leaveRequests] = await Promise.all([
    listTenantRows("hris_employees", tenantId,
      "id,employee_number,full_name,job_title,department,email,phone,hire_date,employment_status,created_at,updated_at",
      "full_name.asc,id.asc"),
    listTenantRows("hris_attendance", tenantId,
      "id,employee_id,work_date,attendance_status,check_in_at,check_out_at,recorded_by_user_id,created_at,updated_at",
      "work_date.desc,created_at.desc"),
    listTenantRows("hris_leave_requests", tenantId,
      "id,employee_id,leave_type,starts_on,ends_on,reason,status,requested_by_user_id,reviewed_by_user_id,review_note,reviewed_at,created_at,updated_at",
      "created_at.desc,id.desc"),
  ]);
  return {
    employees: employees.map((row) => ({
      id: String(row.id), employeeNumber: String(row.employee_number), fullName: String(row.full_name),
      jobTitle: String(row.job_title), department: String(row.department), email: row.email || "",
      phone: row.phone || "", hireDate: row.hire_date || null, employmentStatus: String(row.employment_status),
      createdAt: row.created_at, updatedAt: row.updated_at,
    })),
    attendance: attendance.map((row) => ({
      id: String(row.id), employeeId: String(row.employee_id), workDate: String(row.work_date),
      status: String(row.attendance_status), checkInAt: row.check_in_at || null, checkOutAt: row.check_out_at || null,
      recordedByUserId: String(row.recorded_by_user_id),
    })),
    leaveRequests: leaveRequests.map((row) => ({
      id: String(row.id), employeeId: String(row.employee_id), leaveType: String(row.leave_type),
      startsOn: String(row.starts_on), endsOn: String(row.ends_on), reason: String(row.reason || ""),
      status: String(row.status), requestedByUserId: String(row.requested_by_user_id),
      reviewedByUserId: row.reviewed_by_user_id || null, reviewNote: row.review_note || "",
      reviewedAt: row.reviewed_at || null, createdAt: row.created_at,
    })),
  };
}

export async function getSupabaseHrisLegacyImportContext(tenantIdentifier: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({
    select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2",
  }).toString());
  const legacyTenantKey = Array.isArray(tenants) ? String(tenants[0]?.legacy_tenant_key || "").trim() : "";
  if (!legacyTenantKey) throw new SupabaseHrisError(409, "Tenant belum memiliki pemetaan arsip Firestore lama.");
  const existingRows = await listTenantRows(
    "hris_employees", tenantId,
    "id,employee_number,email,employment_status,source_system,source_record_id,source_fingerprint",
    "employee_number.asc,id.asc",
  );
  return { tenantId, legacyTenantKey, existingRows };
}

export async function applySupabaseLegacyHrisEmployees(
  tenantId: string,
  actorId: string,
  snapshotFingerprint: string,
  sourceCount: number,
  items: Row[],
) {
  if (!isUuid(tenantId) || !isUuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint)
    || !Number.isInteger(sourceCount) || sourceCount < 0 || sourceCount > 1000
    || !Array.isArray(items) || items.length > 1000 || items.length !== sourceCount) {
    throw new SupabaseHrisError(400, "Snapshot impor Pegawai tidak valid.");
  }
  return request("/rest/v1/rpc/import_legacy_hris_employees", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorId,
      p_snapshot_fingerprint: snapshotFingerprint,
      p_source_count: sourceCount,
      p_rows: items,
    }),
  });
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) throw new SupabaseHrisError(400, `${label} tidak valid.`);
  return text;
}

function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function upsertSupabaseHrisEmployee(tenantIdentifier: string, actorUserIdValue: unknown, inputValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const actorId = requiredText(actorUserIdValue, "ID akun Admin", 64);
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : null;
  if (!input) throw new SupabaseHrisError(400, "Data pegawai tidak valid.");
  const employeeId = requiredText(input.id, "ID pegawai", 64);
  const requestId = requiredText(input.clientRequestId, "ID permintaan", 64);
  if (!isUuid(actorId) || !isUuid(employeeId) || !isUuid(requestId)) throw new SupabaseHrisError(400, "Identitas permintaan tidak valid.");
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  let hireDate: string | null = null;
  if (input.hireDate != null && input.hireDate !== "") {
    if (!dateOnly(input.hireDate)) throw new SupabaseHrisError(400, "Tanggal mulai tidak valid.");
    hireDate = String(input.hireDate);
  }
  const result = await request("/rest/v1/rpc/upsert_hris_employee", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_employee_id: employeeId,
      p_employee_number: requiredText(input.employeeNumber, "Nomor pegawai", 40),
      p_full_name: requiredText(input.fullName, "Nama pegawai", 180),
      p_job_title: requiredText(input.jobTitle, "Jabatan", 120),
      p_department: requiredText(input.department, "Unit kerja", 120),
      p_email: email || null, p_phone: phone || null, p_hire_date: hireDate,
      p_employment_status: requiredText(input.employmentStatus, "Status kerja", 20),
      p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || !result.id) throw new SupabaseHrisError(503, "Backend tidak mengembalikan pegawai tersimpan.");
  return { id: String(result.id), employeeNumber: String(result.employeeNumber || ""), replayed: Boolean(result.replayed) };
}

function timestamp(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new SupabaseHrisError(400, `${label} tidak valid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new SupabaseHrisError(400, `${label} tidak valid.`);
  return parsed.toISOString();
}

export async function recordSupabaseHrisAttendance(tenantIdentifier: string, actorUserIdValue: unknown, inputValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : null;
  if (!input) throw new SupabaseHrisError(400, "Data kehadiran tidak valid.");
  const actorId = requiredText(actorUserIdValue, "ID akun Admin", 64);
  const employeeId = requiredText(input.employeeId, "ID pegawai", 64);
  const requestId = requiredText(input.clientRequestId, "ID permintaan", 64);
  const workDate = requiredText(input.workDate, "Tanggal kehadiran", 10);
  if (!isUuid(actorId) || !isUuid(employeeId) || !isUuid(requestId) || !dateOnly(workDate)) {
    throw new SupabaseHrisError(400, "Identitas atau tanggal kehadiran tidak valid.");
  }
  const result = await request("/rest/v1/rpc/record_hris_attendance", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_employee_id: employeeId, p_work_date: workDate,
      p_attendance_status: requiredText(input.status, "Status kehadiran", 20),
      p_check_in_at: timestamp(input.checkInAt, "Waktu masuk"),
      p_check_out_at: timestamp(input.checkOutAt, "Waktu pulang"), p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || !result.id) throw new SupabaseHrisError(503, "Backend tidak mengembalikan kehadiran tersimpan.");
  return { id: String(result.id), workDate: String(result.workDate), status: String(result.status), replayed: Boolean(result.replayed) };
}

export async function requestSupabaseHrisLeave(tenantIdentifier: string, actorUserIdValue: unknown, inputValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : null;
  if (!input) throw new SupabaseHrisError(400, "Pengajuan cuti tidak valid.");
  const actorId = requiredText(actorUserIdValue, "ID akun Admin", 64);
  const employeeId = requiredText(input.employeeId, "ID pegawai", 64);
  const requestId = requiredText(input.clientRequestId, "ID permintaan", 64);
  const startsOn = requiredText(input.startsOn, "Tanggal mulai", 10);
  const endsOn = requiredText(input.endsOn, "Tanggal akhir", 10);
  if (!isUuid(actorId) || !isUuid(employeeId) || !isUuid(requestId) || !dateOnly(startsOn) || !dateOnly(endsOn) || endsOn < startsOn) {
    throw new SupabaseHrisError(400, "Identitas atau rentang tanggal cuti tidak valid.");
  }
  const dayCount = (Date.parse(endsOn + "T00:00:00.000Z") - Date.parse(startsOn + "T00:00:00.000Z")) / 86_400_000 + 1;
  if (dayCount > 120) throw new SupabaseHrisError(400, "Rentang cuti tidak boleh lebih dari 120 hari.");
  const result = await request("/rest/v1/rpc/request_hris_leave", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_employee_id: employeeId,
      p_leave_type: requiredText(input.leaveType, "Jenis cuti", 20),
      p_starts_on: startsOn, p_ends_on: endsOn,
      p_reason: requiredText(input.reason, "Catatan alasan", 1000), p_client_request_id: requestId,
    }),
  });
  if (!result || typeof result !== "object" || !result.id) throw new SupabaseHrisError(503, "Backend tidak mengembalikan pengajuan cuti.");
  return { id: String(result.id), status: String(result.status), replayed: Boolean(result.replayed) };
}

export async function reviewSupabaseHrisLeave(tenantIdentifier: string, actorUserIdValue: unknown, inputValue: unknown) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : null;
  if (!input) throw new SupabaseHrisError(400, "Keputusan cuti tidak valid.");
  const actorId = requiredText(actorUserIdValue, "ID akun Admin", 64);
  const leaveRequestId = requiredText(input.leaveRequestId, "ID permintaan cuti", 64);
  const clientRequestId = requiredText(input.clientRequestId, "ID permintaan", 64);
  const reviewStatus = requiredText(input.status, "Keputusan", 20);
  const reviewNote = typeof input.reviewNote === "string" ? input.reviewNote.trim() : "";
  if (!isUuid(actorId) || !isUuid(leaveRequestId) || !isUuid(clientRequestId)
    || !["approved", "rejected"].includes(reviewStatus) || reviewNote.length > 1000
    || (reviewStatus === "rejected" && reviewNote.length < 3)) {
    throw new SupabaseHrisError(400, "Keputusan atau catatan review tidak valid.");
  }
  const result = await request("/rest/v1/rpc/review_hris_leave", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_leave_request_id: leaveRequestId,
      p_target_status: reviewStatus, p_review_note: reviewNote || null, p_client_request_id: clientRequestId,
    }),
  });
  if (!result || typeof result !== "object" || !result.id) throw new SupabaseHrisError(503, "Backend tidak mengembalikan keputusan cuti.");
  return { id: String(result.id), status: String(result.status), replayed: Boolean(result.replayed) };
}
