import { readPostgrestRowsInPages } from "./postgrestPagination";

type Row = Record<string, any>;

export class SupabaseLaundryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseLaundryError";
    this.status = status;
  }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseLaundryError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text();
  let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514", "55000"].includes(code) || response.status === 409) {
      throw new SupabaseLaundryError(409, body?.message || "Transaksi laundry berubah atau bertentangan dengan transaksi lain.");
    }
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseLaundryError(400, body?.message || "Data laundry tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseLaundryError(404, "Santri atau pesanan tidak ditemukan pada tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseLaundryError(403, "Akses laundry ditolak oleh role atau tenant.");
    throw new SupabaseLaundryError(503, "Layanan Laundry Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function tenant(tenantId: string) {
  if (!uuid(tenantId)) throw new SupabaseLaundryError(403, "Tenant laundry tidak valid.");
  const params = new URLSearchParams({ select: "id,status,time_zone", id: "eq." + tenantId, limit: "2" });
  const rows = await request("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0].status).toLowerCase() !== "active") {
    throw new SupabaseLaundryError(403, "Tenant laundry tidak aktif.");
  }
  const timeZone = String(rows[0].time_zone || "Asia/Jakarta");
  try { new Intl.DateTimeFormat("en", { timeZone }).format(new Date()); }
  catch { throw new SupabaseLaundryError(503, "Zona waktu tenant belum valid; perbaiki pengaturan tenant terlebih dahulu."); }
  return { timeZone };
}

async function rows(table: string, tenantId: string, select: string, order: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: "5001", ...extra });
  return readPostgrestRowsInPages<Row>({
    request,
    path: `/rest/v1/${table}?${params.toString()}`,
    maxRows: 5000,
    onIncomplete: () => new SupabaseLaundryError(503, "Data laundry melewati batas aman tampilan atau hasil pemindaian tidak lengkap."),
  });
}

function localMonthBounds(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function localMonthOf(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export async function getSupabaseLaundrySnapshot(tenantId: string) {
  const { timeZone } = await tenant(tenantId);
  const period = localMonthBounds(timeZone);
  const [studentRows, roomRows, orderRows, settingRows] = await Promise.all([
    rows("students", tenantId, "id,name,nis,room_id,status", "name.asc,id.asc", { status: "not.in.(Archived,Inactive,Alumni,Graduated)" }),
    rows("master_data_records", tenantId, "id,name,category", "name.asc,id.asc", { category: "eq.Kamar" }),
    rows("laundry_orders", tenantId, "id,order_number,student_id,weight_kg,pieces,status,received_at,collected_at,created_at", "created_at.desc,id.desc"),
    rows("laundry_settings", tenantId, "monthly_quota_kg,excess_rate_per_kg,updated_at", "updated_at.desc,id.asc"),
  ]);
  const students = studentRows.map((student) => ({
    id: String(student.id), name: String(student.name || ""), nis: String(student.nis || ""),
    room: String(roomRows.find((room) => String(room.id) === String(student.room_id))?.name || "—"),
  }));
  const studentById = new Map(students.map((student) => [student.id, student]));
  const settings = settingRows[0] || {};
  const monthlyQuotaKg = Number(settings.monthly_quota_kg ?? 20);
  const excessRatePerKg = Number(settings.excess_rate_per_kg ?? 15000);
  const monthOrders = orderRows.filter((order) =>
    order.status !== "cancelled" && localMonthOf(String(order.created_at || ""), timeZone) === period
  );
  const usedByStudent = new Map<string, number>();
  for (const order of monthOrders) {
    const id = String(order.student_id);
    usedByStudent.set(id, (usedByStudent.get(id) || 0) + Number(order.weight_kg || 0));
  }
  return {
    timeZone,
    period,
    settings: { monthlyQuotaKg, excessRatePerKg, updatedAt: settings.updated_at || null },
    students,
    orders: orderRows.map((order) => {
      const student = studentById.get(String(order.student_id));
      return {
        id: String(order.id), orderNumber: String(order.order_number), studentId: String(order.student_id),
        student: student?.name || "Santri tidak aktif", nis: student?.nis || "", room: student?.room || "—",
        weightKg: Number(order.weight_kg), pieces: Number(order.pieces), status: String(order.status),
        receivedAt: String(order.received_at), collectedAt: order.collected_at || null,
      };
    }),
    quotas: students.map((student) => {
      const usedKg = Number((usedByStudent.get(student.id) || 0).toFixed(2));
      const excessKg = Math.max(0, usedKg - monthlyQuotaKg);
      return { ...student, monthlyQuotaKg, usedKg, remainingKg: Math.max(0, monthlyQuotaKg - usedKg), excessKg,
        estimatedCharge: Math.ceil(excessKg * excessRatePerKg) };
    }),
  };
}

export async function createSupabaseLaundryOrder(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId) || !uuid(item?.studentId)) {
    throw new SupabaseLaundryError(400, "Identitas tenant, petugas, santri, atau permintaan laundry tidak valid.");
  }
  const weightKg = Number(item.weightKg);
  const pieces = Number(item.pieces);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 100 || !Number.isInteger(pieces) || pieces < 0 || pieces > 1000) {
    throw new SupabaseLaundryError(400, "Berat harus lebih dari 0 sampai 100 kg, dan jumlah potong harus bilangan bulat 0–1000.");
  }
  return request("/rest/v1/rpc/create_tenant_laundry_order", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_student_id: item.studentId,
      p_weight_kg: weightKg, p_pieces: pieces, p_client_request_id: item.clientRequestId,
    }),
  });
}

export async function transitionSupabaseLaundryOrder(tenantId: string, actorId: string, orderId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(orderId) || !uuid(item?.clientRequestId)) {
    throw new SupabaseLaundryError(400, "Identitas pesanan atau permintaan laundry tidak valid.");
  }
  const status = String(item.status || "");
  if (!["washing", "ready", "collected", "cancelled"].includes(status)) throw new SupabaseLaundryError(400, "Status laundry tidak valid.");
  return request("/rest/v1/rpc/transition_tenant_laundry_order", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_order_id: orderId,
      p_next_status: status, p_client_request_id: item.clientRequestId,
    }),
  });
}

export async function saveSupabaseLaundrySettings(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseLaundryError(400, "Identitas pengaturan laundry tidak valid.");
  const monthlyQuotaKg = Number(item.monthlyQuotaKg);
  const excessRatePerKg = Number(item.excessRatePerKg);
  if (!Number.isFinite(monthlyQuotaKg) || monthlyQuotaKg < 0 || monthlyQuotaKg > 1000
    || !Number.isInteger(excessRatePerKg) || excessRatePerKg < 0 || excessRatePerKg > 10000000) {
    throw new SupabaseLaundryError(400, "Kuota harus 0–1000 kg dan tarif harus 0–10.000.000 rupiah per kg.");
  }
  return request("/rest/v1/rpc/save_tenant_laundry_settings", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: tenantId, p_actor_user_id: actorId, p_monthly_quota_kg: monthlyQuotaKg,
      p_excess_rate_per_kg: excessRatePerKg, p_client_request_id: item.clientRequestId,
    }),
  });
}
