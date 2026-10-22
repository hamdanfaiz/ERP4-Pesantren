type Row = Record<string, any>;
type DashboardPeriod = "today" | "week" | "month" | "year";
type DashboardPermissions = { ppdb: boolean; "master-data": boolean; finance: boolean };

export class SupabaseDashboardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseDashboardError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseDashboardError(503, "Konfigurasi backend Supabase belum lengkap.");
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
  let payload: any = null;
  if (raw) { try { payload = JSON.parse(raw); } catch { payload = null; } }
  if (!response.ok) {
    const code = String(payload?.code || "");
    if (code === "22023") throw new SupabaseDashboardError(400, payload?.message || "Periode dashboard tidak valid.");
    if (code === "42501" || response.status === 403) throw new SupabaseDashboardError(403, "Akses dashboard ditolak oleh kebijakan tenant.");
    throw new SupabaseDashboardError(503, "Ringkasan Supabase belum dapat dimuat.");
  }
  return payload;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTenantId(identifier: string) {
  const value = String(identifier || "").trim();
  if (!value) throw new SupabaseDashboardError(403, "Tenant aktif tidak ditemukan.");
  const find = async (column: "id" | "slug" | "legacy_tenant_key", key: string) => {
    const params = new URLSearchParams({ select: "id,status", [column]: "eq." + key, limit: "2" });
    return request("/rest/v1/tenants?" + params.toString());
  };
  let rows: Row[] = [];
  if (isUuid(value)) {
    const result = await find("id", value);
    if (Array.isArray(result)) rows = result;
  } else {
    const legacy = await find("legacy_tenant_key", value);
    if (Array.isArray(legacy)) rows = legacy;
    if (!rows.length) {
      const bySlug = await find("slug", value.toLowerCase());
      if (Array.isArray(bySlug)) rows = bySlug;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseDashboardError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

function periodStart(period: DashboardPeriod, now: Date) {
  if (period === "today") {
    const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return new Date(jakartaDate + "T00:00:00+07:00");
  }
  const start = new Date(now);
  if (period === "week") start.setDate(start.getDate() - 7);
  else if (period === "month") start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 365);
  return start;
}

export async function getSupabaseDashboardSnapshot(
  tenantIdentifier: string,
  actorUserId: string,
  permissions: DashboardPermissions,
  periodValue: unknown,
) {
  if (!isUuid(actorUserId)) throw new SupabaseDashboardError(403, "Akun dashboard tidak valid.");
  const period = ["today", "week", "month", "year"].includes(String(periodValue))
    ? String(periodValue) as DashboardPeriod
    : "year";
  const tenantId = await resolveTenantId(tenantIdentifier);
  const end = new Date();
  const start = periodStart(period, end);
  const result = await request("/rest/v1/rpc/get_tenant_dashboard_snapshot", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorUserId,
      p_allow_ppdb: permissions.ppdb === true,
      p_allow_master_data: permissions["master-data"] === true,
      p_allow_finance: permissions.finance === true,
      p_period_start: start.toISOString(),
      p_period_end: end.toISOString(),
    }),
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new SupabaseDashboardError(503, "Format ringkasan Supabase tidak valid.");
  }
  return result as Row;
}
