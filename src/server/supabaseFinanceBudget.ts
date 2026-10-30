type Row = Record<string, any>;

export class SupabaseFinanceBudgetError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseFinanceBudgetError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseFinanceBudgetError(503, "Konfigurasi backend Supabase belum lengkap.");
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
  let body: Row | null = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514", "23P01"].includes(code) || response.status === 409) {
      throw new SupabaseFinanceBudgetError(409, body?.message || "Data anggaran bertentangan dengan rencana tenant.");
    }
    if (code === "P0002" || response.status === 404) throw new SupabaseFinanceBudgetError(404, body?.message || "Rencana anggaran tidak ditemukan pada tenant.");
    if (code === "42501" || response.status === 403) throw new SupabaseFinanceBudgetError(403, "Operasi anggaran ditolak oleh kebijakan tenant.");
    if (code === "55000") throw new SupabaseFinanceBudgetError(423, body?.message || "Status rencana anggaran tidak mengizinkan perubahan ini.");
    if (["22023", "22P02", "22007", "22008"].includes(code) || response.status === 400) {
      throw new SupabaseFinanceBudgetError(400, body?.message || "Data anggaran tidak valid.");
    }
    throw new SupabaseFinanceBudgetError(503, "Layanan anggaran Supabase belum dapat diproses.");
  }
  return body;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function expectedRole(role: string) {
  const roles: Record<string, string> = { Admin: "admin", SuperAdmin: "super_admin" };
  return roles[role] || "";
}

async function resolveTenantId(identifier: string) {
  const value = String(identifier || "").trim();
  if (!value) throw new SupabaseFinanceBudgetError(403, "Tenant aktif tidak ditemukan.");
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
      const bySlug = await lookup("slug", value.toLowerCase());
      if (Array.isArray(bySlug)) rows = bySlug;
    }
  }
  if (rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseFinanceBudgetError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

async function callBudgetRpc(name: string, body: Row) {
  const result = await request("/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify(body) });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseFinanceBudgetError(503, "Backend anggaran belum mengonfirmasi perubahan.");
  }
  return result as Row;
}

export async function getSupabaseFinanceBudgetSnapshot(tenantIdentifier: string, actorUserId: string, role: string) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId)) throw new SupabaseFinanceBudgetError(403, "Akun ini tidak dapat membaca anggaran tenant.");
  return callBudgetRpc("get_tenant_finance_budget_snapshot", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
    p_expected_role: expected,
  });
}

export async function mutateSupabaseFinanceBudget(
  tenantIdentifier: string,
  actorUserId: string,
  role: string,
  value: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseFinanceBudgetError(403, "Hanya Admin tenant yang dapat mengelola anggaran.");
  }
  const input = value as Row;
  const action = String(input.action || "");
  const requestId = String(input.clientRequestId || "").trim();
  const planId = input.planId == null || input.planId === "" ? null : String(input.planId).trim();
  if (!isUuid(requestId) || (planId !== null && !isUuid(planId))) {
    throw new SupabaseFinanceBudgetError(400, "Kunci permintaan atau ID anggaran tidak valid.");
  }
  if (!("save_draft" === action || "approve" === action || "close" === action || "map_legacy_unit" === action)) {
    throw new SupabaseFinanceBudgetError(400, "Tindakan anggaran tidak didukung.");
  }
  const payload = action === "save_draft" || action === "map_legacy_unit" ? input.plan : {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SupabaseFinanceBudgetError(400, "Isi rencana anggaran tidak valid.");
  }
  if ((action === "save_draft" || action === "map_legacy_unit") && !isUuid(String((payload as Row).unitId || ""))) {
    throw new SupabaseFinanceBudgetError(400, "Pilih unit pesantren yang valid untuk rencana anggaran.");
  }
  return callBudgetRpc("manage_tenant_finance_budget", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
    p_expected_role: expected,
    p_action: action,
    p_plan_id: planId,
    p_payload: payload,
    p_client_request_id: requestId,
  });
}
