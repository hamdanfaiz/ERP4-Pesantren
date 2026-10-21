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
    if (code === "23505" || code === "23503" || code === "23514" || code === "55000" || response.status === 409) {
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


export type LegacyMasterDataStructure = {
  id: string;
  category: unknown;
  record: unknown;
  occupied?: number;
};

type StructureMigrationPlan = {
  records: Array<{ id: string; category: StructureCategory; record: JsonObject; occupied: number }>;
  errors: Array<{ id: string; category: string; message: string }>;
  warnings: Array<{ id: string; category: string; message: string }>;
};

function normalizedGender(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["l", "m", "male", "putra", "laki-laki", "laki laki"].includes(normalized)) return "L";
  if (["p", "f", "female", "putri", "perempuan"].includes(normalized)) return "P";
  return "";
}

function buildStructureMigrationPlan(source: LegacyMasterDataStructure[]): StructureMigrationPlan {
  const result: StructureMigrationPlan = { records: [], errors: [], warnings: [] };
  if (!Array.isArray(source) || source.length > 2000) {
    result.errors.push({ id: "", category: "", message: "Jumlah struktur migrasi harus berada pada rentang 0 sampai 2.000." });
    return result;
  }

  const seen = new Set<string>();
  for (const item of source) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const categoryValue = item?.category;
    const category = categoryValue === "Gedung" || categoryValue === "Kamar" || categoryValue === "Kelas"
      ? categoryValue
      : "";
    const record = item?.record && typeof item.record === "object" && !Array.isArray(item.record)
      ? item.record as JsonObject
      : null;
    if (!category || !id || id.length > 160 || id.includes("/") || !record) {
      result.errors.push({ id, category: String(categoryValue || ""), message: "ID, kategori, atau data struktur tidak valid." });
      continue;
    }
    const key = category + "\u0000" + id;
    if (seen.has(key)) {
      result.errors.push({ id, category, message: "ID struktur duplikat pada dataset migrasi." });
      continue;
    }
    seen.add(key);

    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name || name.length > 180) {
      result.errors.push({ id, category, message: "Nama struktur wajib diisi dan maksimal 180 karakter." });
      continue;
    }

    const normalized: JsonObject = {
      ...record,
      id,
      category,
      name,
      status: typeof record.status === "string" && record.status.trim() ? record.status.trim() : "Active",
    };
    let occupied = 0;
    if (category === "Kamar") {
      const digits = String(record.capacity ?? "").replace(/[^0-9]/g, "");
      const capacity = digits ? Number(digits) : NaN;
      occupied = Number.isInteger(item.occupied) && item.occupied! >= 0 ? item.occupied! : 0;
      if (!Number.isInteger(capacity) || capacity < 1) {
        result.errors.push({ id, category, message: "Kapasitas kamar harus diatur dengan angka minimal satu." });
        continue;
      }
      if (occupied > capacity) {
        result.errors.push({ id, category, message: "Jumlah penghuni lama melebihi kapasitas. Selesaikan konflik sebelum migrasi." });
        continue;
      }
      normalized.capacity = capacity;
      const ownGender = normalizedGender(record.genderRestriction || record.gender);
      if (!ownGender) result.warnings.push({ id, category, message: "Gender kamar belum eksplisit; onboarding akan ditolak sampai gender kamar atau gedung dikonfigurasi." });
      const parentId = typeof record.parentId === "string" && record.parentId.trim()
        ? record.parentId.trim()
        : typeof record.parentCode === "string" && record.parentCode.trim()
          ? record.parentCode.trim()
          : "";
      if (parentId) {
        normalized.parentId = parentId;
        normalized.parentCode = parentId;
      }
    }
    result.records.push({ id, category, record: normalized, occupied });
  }

  const buildingIds = new Set(result.records.filter((item) => item.category === "Gedung").map((item) => item.id));
  for (const item of result.records) {
    if (item.category === "Kamar" && typeof item.record.parentId === "string" && item.record.parentId && !buildingIds.has(item.record.parentId)) {
      result.errors.push({ id: item.id, category: item.category, message: "Gedung induk kamar tidak ditemukan pada dataset tenant ini." });
    }
  }

  result.records.sort((a, b) => {
    const order: Record<StructureCategory, number> = { Gedung: 0, Kelas: 1, Kamar: 2 };
    return order[a.category] - order[b.category] || a.id.localeCompare(b.id);
  });
  return result;
}

function sameCoreStructure(existing: SupabaseStructureRecord, incoming: JsonObject, category: StructureCategory) {
  const existingGender = normalizedGender(existing.genderRestriction || existing.gender);
  const incomingGender = normalizedGender(incoming.genderRestriction || incoming.gender);
  const parentId = typeof incoming.parentId === "string" ? incoming.parentId : "";
  const existingParentId = existing.parentId || existing.parentCode || "";
  const incomingCapacity = category === "Kamar" ? Number(String(incoming.capacity ?? "").replace(/[^0-9]/g, "")) : undefined;
  return existing.name.trim() === String(incoming.name || "").trim()
    && existing.status.toLowerCase() === String(incoming.status || "Active").toLowerCase()
    && existingParentId === parentId
    && String(existing.grade || "") === String(incoming.grade || "")
    && (category !== "Kamar" || Number(existing.capacity) === incomingCapacity)
    && (!incomingGender || !existingGender || existingGender === incomingGender)
    && String(existing.location || "") === String(incoming.location || "");
}

/**
 * Preview or import legacy Firebase structure records into Supabase.
 * Import is idempotent, does not delete rows, and refuses to overwrite conflicting Supabase records.
 */
export async function migrateSupabaseMasterDataStructures(
  tenantIdentifier: string,
  source: LegacyMasterDataStructure[],
  apply: boolean
) {
  const plan = buildStructureMigrationPlan(source);
  if (plan.errors.length) {
    return {
      dryRun: !apply,
      sourceCount: Array.isArray(source) ? source.length : 0,
      planned: plan.records.length,
      imported: 0,
      skipped: 0,
      errors: plan.errors,
      warnings: plan.warnings,
    };
  }

  const existing = await listSupabaseMasterDataStructures(tenantIdentifier);
  const existingByKey = new Map(existing.map((item) => [item.category + "\u0000" + item.id, item]));
  const conflicts = plan.records
    .filter((item) => {
      const found = existingByKey.get(item.category + "\u0000" + item.id);
      return Boolean(found && !sameCoreStructure(found, item.record, item.category));
    })
    .map((item) => ({ id: item.id, category: item.category, message: "ID sudah ada di Supabase dengan nilai inti berbeda; tidak ditimpa." }));

  if (conflicts.length) {
    return {
      dryRun: !apply,
      sourceCount: source.length,
      planned: plan.records.length,
      imported: 0,
      skipped: 0,
      errors: conflicts,
      warnings: plan.warnings,
    };
  }

  const alreadyPresent = plan.records.filter((item) => existingByKey.has(item.category + "\u0000" + item.id)).length;
  if (!apply) {
    return {
      dryRun: true,
      sourceCount: source.length,
      planned: plan.records.length,
      imported: plan.records.length - alreadyPresent,
      skipped: alreadyPresent,
      errors: [],
      warnings: plan.warnings,
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ id: string; category: string; message: string }> = [];
  for (const item of plan.records) {
    const key = item.category + "\u0000" + item.id;
    const wasPresent = existingByKey.has(key);
    try {
      if (!wasPresent) {
        await upsertSupabaseMasterDataStructure(tenantIdentifier, item.category, item.id, item.record);
        imported += 1;
      } else {
        skipped += 1;
      }
      if (item.category === "Kamar") {
        await setImportedSupabaseRoomOccupancy(tenantIdentifier, item.id, item.occupied);
      }
    } catch (error: any) {
      errors.push({
        id: item.id,
        category: item.category,
        message: error instanceof SupabasePpdbAdminError
          ? error.message
          : "Struktur belum dapat dimigrasikan.",
      });
    }
  }

  return {
    dryRun: false,
    sourceCount: source.length,
    planned: plan.records.length,
    imported,
    skipped,
    errors,
    warnings: plan.warnings,
  };
}

async function setImportedSupabaseRoomOccupancy(tenantIdentifier: string, roomId: string, occupied: number) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  return supabaseRequest("/rest/v1/rpc/set_imported_room_occupancy", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_room_id: roomId, p_occupied: occupied }),
  });
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
