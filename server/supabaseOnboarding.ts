import { SupabasePpdbAdminError } from "./supabasePpdbAdmin";

type JsonObject = Record<string, any>;
type StructureCategory = "Gedung" | "Kamar" | "Kelas";

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
      throw new SupabasePpdbAdminError(409, body?.message || "Data berbenturan dengan data yang sudah tersimpan.");
    }
    if (code === "22023" || response.status === 400) {
      throw new SupabasePpdbAdminError(400, body?.message || "Data tidak valid.");
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

function isCanonicalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveActiveTenantId(tenantIdentifier: string) {
  const normalized = String(tenantIdentifier || "").trim();
  if (!normalized) throw new SupabasePpdbAdminError(403, "Tenant aktif tidak ditemukan.");

  const params = new URLSearchParams({
    select: "id,slug,status",
    limit: "2",
  });
  if (isCanonicalUuid(normalized)) params.set("id", "eq." + normalized);
  else params.set("slug", "eq." + normalized.toLowerCase());

  const rows = await supabaseRequest("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabasePpdbAdminError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

function validateCategory(value: unknown): StructureCategory {
  if (value === "Gedung" || value === "Kamar" || value === "Kelas") return value;
  throw new SupabasePpdbAdminError(400, "Kategori struktur tidak didukung pada tahap ini.");
}

function validateUuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!isCanonicalUuid(normalized)) throw new SupabasePpdbAdminError(400, label + " tidak valid.");
  return normalized;
}

export type SupabaseStructureRecord = {
  id: string;
  name: string;
  category: StructureCategory;
  type: StructureCategory;
  status: string;
  parentId?: string;
  parentCode?: string;
  grade?: string;
  capacity?: number;
  occupied: number;
  gender?: string;
  genderRestriction?: string;
  location?: string;
  building?: string;
  [key: string]: any;
};

export async function listSupabaseMasterDataStructures(tenantIdentifier: string): Promise<SupabaseStructureRecord[]> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const all: JsonObject[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "tenant_id,category,id,name,status,parent_id,grade,capacity,occupied,gender_code,location,attributes",
      tenant_id: "eq." + tenantId,
      category: "in.(Gedung,Kamar,Kelas)",
      order: "category.asc,name.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/master_data_records?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data struktur pesantren belum dapat dimuat.");
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  const buildingsById = new Map<string, string>();
  for (const row of all) {
    if (row.category === "Gedung") buildingsById.set(String(row.id), String(row.name || ""));
  }

  return all.map((row) => {
    const attributes = row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
      ? row.attributes as JsonObject
      : {};
    const parentId = typeof row.parent_id === "string" ? row.parent_id : "";
    const gender = typeof row.gender_code === "string" ? row.gender_code : "";
    const category = validateCategory(row.category);
    return {
      ...attributes,
      id: String(row.id),
      name: String(row.name || ""),
      category,
      type: category,
      status: String(row.status || "Active"),
      parentId: parentId || undefined,
      parentCode: parentId || undefined,
      grade: String(row.grade || attributes.grade || ""),
      capacity: row.capacity == null ? undefined : Number(row.capacity),
      occupied: Number(row.occupied || 0),
      gender: gender || undefined,
      genderRestriction: gender || undefined,
      location: String(row.location || attributes.location || ""),
      building: parentId ? buildingsById.get(parentId) || "" : "",
    };
  });
}

export async function getSupabaseNextSantriNis(
  tenantIdentifier: string,
  grade: string,
  candidateId?: string
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const body = await supabaseRequest("/rest/v1/rpc/next_available_santri_nis", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_grade: String(grade || ""),
      p_exclude_candidate_id: candidateId ? validateUuid(candidateId, "ID calon santri") : null,
    }),
  });
  if (typeof body !== "string" || !/^[0-9]{10}$/.test(body)) {
    throw new SupabasePpdbAdminError(503, "Backend belum menghasilkan NIS yang valid.");
  }
  return body;
}

export async function upsertSupabaseMasterDataStructure(
  tenantIdentifier: string,
  categoryValue: unknown,
  recordId: unknown,
  recordValue: unknown
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const category = validateCategory(categoryValue);
  const id = typeof recordId === "string" ? recordId.trim() : "";
  if (!id || id.length > 160 || id.includes("/")) {
    throw new SupabasePpdbAdminError(400, "ID struktur tidak valid.");
  }
  const record = recordValue && typeof recordValue === "object" && !Array.isArray(recordValue)
    ? recordValue as JsonObject
    : null;
  if (!record) throw new SupabasePpdbAdminError(400, "Data struktur tidak valid.");

  return supabaseRequest("/rest/v1/rpc/upsert_master_data_structure", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_category: category,
      p_id: id,
      p_record: record,
    }),
  });
}

export async function deleteSupabaseMasterDataStructure(
  tenantIdentifier: string,
  categoryValue: unknown,
  recordId: unknown
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const category = validateCategory(categoryValue);
  const id = typeof recordId === "string" ? recordId.trim() : "";
  if (!id || id.length > 160 || id.includes("/")) {
    throw new SupabasePpdbAdminError(400, "ID struktur tidak valid.");
  }

  const params = new URLSearchParams({
    tenant_id: "eq." + tenantId,
    category: "eq." + category,
    id: "eq." + id,
    select: "id",
  });
  const deleted = await supabaseRequest("/rest/v1/master_data_records?" + params.toString(), {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!Array.isArray(deleted) || deleted.length === 0) {
    throw new SupabasePpdbAdminError(404, "Data struktur tidak ditemukan pada tenant ini.");
  }
  return { deleted: true };
}

export async function onboardSupabaseAcceptedCandidate(
  tenantIdentifier: string,
  candidateIdValue: unknown,
  assignmentValue: unknown
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const candidateId = validateUuid(candidateIdValue, "ID calon santri");
  const assignment = assignmentValue && typeof assignmentValue === "object" && !Array.isArray(assignmentValue)
    ? assignmentValue as JsonObject
    : null;
  if (!assignment) throw new SupabasePpdbAdminError(400, "Penempatan santri tidak valid.");

  const body = await supabaseRequest("/rest/v1/rpc/onboard_accepted_ppdb_candidate", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_candidate_id: candidateId,
      p_nis: String(assignment.nis || "").trim(),
      p_class_id: String(assignment.classId || "").trim(),
      p_room_id: String(assignment.roomId || "").trim(),
      p_building_id: String(assignment.buildingId || "").trim() || null,
      p_guardian_name: String(assignment.waliName || "").trim(),
      p_guardian_phone: String(assignment.waliPhone || "").trim(),
    }),
  });
  if (!body || typeof body !== "object" || body.success !== true) {
    throw new SupabasePpdbAdminError(503, "Backend belum mengonfirmasi onboarding santri.");
  }
  return {
    success: true,
    nis: String(body.nis || ""),
    santriId: String(body.santriId || ""),
    waliId: String(body.waliId || ""),
    alreadyOnboarded: Boolean(body.alreadyOnboarded),
  };
}
