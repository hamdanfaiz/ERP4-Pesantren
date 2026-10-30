type Row = Record<string, any>;

export class SupabaseEnterpriseUnitsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseEnterpriseUnitsError";
    this.status = status;
  }
}

function config() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !key) throw new SupabaseEnterpriseUnitsError(503, "Konfigurasi backend Supabase belum lengkap.");
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
    if (["23505", "23503", "23514", "40001"].includes(code) || response.status === 409) {
      const message = String(body?.message || "");
      throw new SupabaseEnterpriseUnitsError(409, code === "23505"
        ? message.includes("Kunci permintaan unit")
          ? "Kunci permintaan sudah digunakan untuk perubahan yang berbeda. Muat ulang data lalu coba kembali."
          : "Kode unit sudah digunakan pada tenant ini."
        : "Perubahan unit bertentangan dengan data tenant.");
    }
    if (code === "P0002" || response.status === 404) {
      throw new SupabaseEnterpriseUnitsError(404, body?.message || "Unit tidak ditemukan pada tenant ini.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabaseEnterpriseUnitsError(403, "Operasi unit ditolak oleh pemeriksaan role, permission, atau tenant.");
    }
    if (["22023", "22P02"].includes(code) || response.status === 400) {
      throw new SupabaseEnterpriseUnitsError(400, body?.message || "Data unit tidak valid.");
    }
    throw new SupabaseEnterpriseUnitsError(503, "Layanan unit Supabase belum dapat diproses.");
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
  if (!value) throw new SupabaseEnterpriseUnitsError(403, "Tenant aktif tidak ditemukan.");
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
    throw new SupabaseEnterpriseUnitsError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

async function callRpc(name: string, body: Row) {
  const result = await request("/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify(body) });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseEnterpriseUnitsError(503, "Backend unit belum mengonfirmasi perubahan.");
  }
  return result as Row;
}

export async function getSupabaseEnterpriseUnitsSnapshot(
  tenantIdentifier: string,
  actorUserId: string,
  role: string,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId)) {
    throw new SupabaseEnterpriseUnitsError(403, "Manajemen unit hanya tersedia untuk Admin tenant.");
  }
  return callRpc("get_tenant_enterprise_units_snapshot", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
    p_expected_role: expected,
  });
}

export async function getSupabaseUnmappedMasterDataUnits(
  tenantIdentifier: string,
  actorUserId: string,
  role: string,
  offsetValue: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  const offset = Number(offsetValue ?? 0);
  if (!expected || !isUuid(actorUserId) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    throw new SupabaseEnterpriseUnitsError(400, "Posisi daftar data tanpa unit tidak valid.");
  }
  const result = await request("/rest/v1/rpc/get_tenant_unmapped_master_data_units", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorUserId,
      p_expected_role: expected,
      p_limit: 100,
      p_offset: offset,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseEnterpriseUnitsError(503, "Daftar data tanpa unit belum dapat dimuat.");
  }
  return result as Row;
}

export async function assignSupabaseMasterDataUnit(
  tenantIdentifier: string,
  actorUserId: string,
  role: string,
  value: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseEnterpriseUnitsError(403, "Pemetaan data hanya tersedia untuk Admin tenant.");
  }
  const input = value as Row;
  const allowedKeys = new Set(["entityType", "entityId", "unitId", "clientRequestId"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))
    || Object.keys(input).length !== allowedKeys.size
    || !["candidate", "student"].includes(String(input.entityType || ""))
    || !isUuid(String(input.entityId || ""))
    || !isUuid(String(input.unitId || ""))
    || !isUuid(String(input.clientRequestId || ""))) {
    throw new SupabaseEnterpriseUnitsError(400, "Jenis data, ID, unit, atau kunci permintaan tidak valid.");
  }
  const result = await request("/rest/v1/rpc/assign_tenant_master_data_unit", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorUserId,
      p_expected_role: expected,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_unit_id: input.unitId,
      p_client_request_id: input.clientRequestId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseEnterpriseUnitsError(503, "Backend belum mengonfirmasi pemetaan unit.");
  }
  return result as Row;
}

export async function mutateSupabaseEnterpriseUnit(
  tenantIdentifier: string,
  actorUserId: string,
  role: string,
  value: unknown,
) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const expected = expectedRole(role);
  if (!expected || !isUuid(actorUserId) || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupabaseEnterpriseUnitsError(403, "Manajemen unit hanya tersedia untuk Admin tenant.");
  }
  const input = value as Row;
  const action = String(input.action || "");
  const requestId = String(input.clientRequestId || "").trim();
  const unitId = input.unitId == null || input.unitId === "" ? null : String(input.unitId).trim();
  const allowedKeys = new Set(["action", "unitId", "clientRequestId", "unit", "status"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new SupabaseEnterpriseUnitsError(400, "Permintaan unit berisi kolom yang tidak didukung.");
  }
  if (!isUuid(requestId) || (unitId !== null && !isUuid(unitId))) {
    throw new SupabaseEnterpriseUnitsError(400, "Kunci permintaan atau ID unit tidak valid.");
  }
  if (!["create", "update", "set_status"].includes(action)) {
    throw new SupabaseEnterpriseUnitsError(400, "Tindakan unit tidak didukung.");
  }

  let payload: Row;
  if (action === "create" || action === "update") {
    const requiredKeys = ["action", "clientRequestId", "unit"];
    const allowedKeysForAction = new Set([...requiredKeys, ...(action === "update" ? ["unitId"] : [])]);
    if (requiredKeys.some((key) => !(key in input))
      || Object.keys(input).some((key) => !allowedKeysForAction.has(key))) {
      throw new SupabaseEnterpriseUnitsError(400, "Data perubahan unit tidak cocok dengan tindakannya.");
    }
    if (input.unit == null || typeof input.unit !== "object" || Array.isArray(input.unit)) {
      throw new SupabaseEnterpriseUnitsError(400, "Data unit tidak valid.");
    }
    const unit = input.unit as Row;
    const unitKeys = new Set(["code", "name", "unitType", "location"]);
    if (Object.keys(unit).some((key) => !unitKeys.has(key))) {
      throw new SupabaseEnterpriseUnitsError(400, "Data unit berisi kolom yang tidak didukung.");
    }
    const code = String(unit.code || "").trim().toUpperCase();
    const name = String(unit.name || "").trim();
    const unitType = String(unit.unitType || "").trim().toLowerCase();
    const location = String(unit.location || "").trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)
      || name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)
      || !["pesantren", "sekolah", "klinik", "usaha", "yayasan", "lainnya"].includes(unitType)
      || location.length > 240 || /[\u0000-\u001f\u007f]/.test(location)) {
      throw new SupabaseEnterpriseUnitsError(400, "Periksa kode, nama, jenis, dan lokasi unit.");
    }
    payload = { code, name, unitType, location };
  } else {
    const requiredKeys = ["action", "clientRequestId", "unitId", "status"];
    if (requiredKeys.some((key) => !(key in input))
      || Object.keys(input).some((key) => !requiredKeys.includes(key))) {
      throw new SupabaseEnterpriseUnitsError(400, "Data perubahan status unit tidak valid.");
    }
    const status = String(input.status || "").trim().toLowerCase();
    if (!["active", "inactive"].includes(status)) {
      throw new SupabaseEnterpriseUnitsError(400, "Status unit tidak valid.");
    }
    payload = { status };
  }

  if ((action === "create" && unitId !== null) || (action !== "create" && unitId === null)) {
    throw new SupabaseEnterpriseUnitsError(400, "ID unit tidak cocok dengan tindakan yang diminta.");
  }
  return callRpc("manage_tenant_enterprise_unit", {
    p_tenant_id: tenantId,
    p_actor_user_id: actorUserId,
    p_expected_role: expected,
    p_action: action,
    p_unit_id: unitId,
    p_payload: payload,
    p_client_request_id: requestId,
  });
}
