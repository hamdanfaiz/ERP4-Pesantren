type Row = Record<string, any>;

export type TenantNamingSeriesKey = "nis" | "ppdb_registration" | "employee_number" | "building_code" | "room_code" | "class_code" | "document_number" | "finance_receipt" | "asset_code" | "inventory_item_code" | "donation_receipt" | "waqf_asset_code" | "laundry_order_number" | "cooperative_product_sku" | "marketplace_product_sku";
export type TenantNamingSeries = {
  seriesKey: TenantNamingSeriesKey;
  moduleId: "master-data" | "ppdb" | "hris" | "document" | "finance" | "ga" | "donation" | "laundry" | "cooperative" | "marketplace";
  displayName: string;
  description: string;
  formatTemplate: string;
  sequenceWidth: number;
  resetPeriod: "never" | "yearly" | "monthly";
  startNumber: number;
  isActive: boolean;
  updatedAt: string;
};

export class SupabaseNamingSeriesError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseNamingSeriesError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseNamingSeriesError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { baseUrl, key };
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    if (code === "42501" || response.status === 403) throw new SupabaseNamingSeriesError(403, "Perubahan seri penomoran ditolak oleh kebijakan tenant.");
    if (["22023", "22P02"].includes(code) || response.status === 400) {
      throw new SupabaseNamingSeriesError(400, body?.message || "Format seri penomoran tidak valid.");
    }
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) {
      throw new SupabaseNamingSeriesError(409, body?.message || "Seri penomoran berbenturan dengan kode yang telah digunakan.");
    }
    if (code === "P0002" || response.status === 404) throw new SupabaseNamingSeriesError(404, "Seri penomoran tidak ditemukan untuk tenant ini.");
    throw new SupabaseNamingSeriesError(503, "Layanan seri penomoran Supabase belum dapat diproses.");
  }
  return body;
}

function validateTenant(value: string) {
  if (!uuid(value)) throw new SupabaseNamingSeriesError(403, "Tenant aktif tidak valid.");
  return value;
}

function mapSeries(row: Row): TenantNamingSeries {
  return {
    seriesKey: String(row.series_key) as TenantNamingSeriesKey,
    moduleId: String(row.module_id) as TenantNamingSeries["moduleId"],
    displayName: String(row.display_name || ""),
    description: String(row.description || ""),
    formatTemplate: String(row.format_template || ""),
    sequenceWidth: Number(row.sequence_width),
    resetPeriod: String(row.reset_period) as TenantNamingSeries["resetPeriod"],
    startNumber: Number(row.start_number),
    isActive: row.is_active === true,
    updatedAt: String(row.updated_at || ""),
  };
}

export async function listSupabaseTenantNamingSeries(tenantIdentifier: string): Promise<TenantNamingSeries[]> {
  const tenantId = validateTenant(tenantIdentifier);
  const params = new URLSearchParams({
    select: "series_key,module_id,display_name,description,format_template,sequence_width,reset_period,start_number,is_active,updated_at",
    tenant_id: "eq." + tenantId,
    order: "module_id.asc,series_key.asc",
    limit: "20",
  });
  const rows = await request("/rest/v1/tenant_naming_series?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 15) {
    throw new SupabaseNamingSeriesError(503, "Lima belas seri penomoran baku tenant belum lengkap.");
  }
  return rows.map(mapSeries);
}

export async function saveSupabaseTenantNamingSeries(
  tenantIdentifier: string,
  actorIdentifier: string,
  inputValue: unknown,
) {
  const tenantId = validateTenant(tenantIdentifier);
  if (!uuid(actorIdentifier)) throw new SupabaseNamingSeriesError(403, "Akun Admin tidak valid.");
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue as Row : {};
  const seriesKey = String(input.seriesKey || "");
  const formatTemplate = String(input.formatTemplate || "").trim();
  const sequenceWidth = Number(input.sequenceWidth);
  const resetPeriod = String(input.resetPeriod || "");
  const startNumber = Number(input.startNumber);
  const isActive = input.isActive === true;
  const clientRequestId = String(input.clientRequestId || "");
  if (!["nis", "ppdb_registration", "employee_number", "building_code", "room_code", "class_code", "document_number", "finance_receipt", "asset_code", "inventory_item_code", "donation_receipt", "waqf_asset_code", "laundry_order_number", "cooperative_product_sku", "marketplace_product_sku"].includes(seriesKey)
    || !uuid(clientRequestId)
    || !Number.isInteger(sequenceWidth) || sequenceWidth < 1 || sequenceWidth > 12
    || !Number.isSafeInteger(startNumber) || startNumber < 1 || startNumber > 999999999999
    || !["never", "yearly", "monthly"].includes(resetPeriod)
    || !formatTemplate || formatTemplate.length > 120) {
    throw new SupabaseNamingSeriesError(400, "Lengkapi aturan seri dengan nilai yang didukung.");
  }
  const structureSeries = ["building_code", "room_code", "class_code"].includes(seriesKey);
  const extendedSeries = ["document_number", "finance_receipt", "asset_code", "inventory_item_code", "donation_receipt", "waqf_asset_code", "laundry_order_number", "cooperative_product_sku", "marketplace_product_sku"].includes(seriesKey);
  const saveRpc = structureSeries
    ? "save_tenant_structure_naming_series"
    : extendedSeries ? "save_tenant_extended_naming_series" : "save_tenant_naming_series";
  await request("/rest/v1/rpc/" + saveRpc, {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorIdentifier,
      p_series_key: seriesKey,
      p_format_template: formatTemplate,
      p_sequence_width: sequenceWidth,
      p_reset_period: resetPeriod,
      p_start_number: startNumber,
      p_is_active: isActive,
      p_client_request_id: clientRequestId,
    }),
  });
  const records = await listSupabaseTenantNamingSeries(tenantId);
  const saved = records.find((record) => record.seriesKey === seriesKey);
  if (!saved) throw new SupabaseNamingSeriesError(503, "Perubahan tersimpan tetapi belum dapat diverifikasi.");
  return saved;
}
