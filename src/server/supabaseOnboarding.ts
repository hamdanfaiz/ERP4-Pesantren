import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { isOperationalBoardingStudent } from "./boardingStatus";

export class SupabaseOnboardingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseOnboardingError";
    this.status = status;
  }
}

type JsonObject = Record<string, any>;
type StructureCategory = "Gedung" | "Kamar" | "Kelas";

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabaseOnboardingError(503, "Konfigurasi backend Supabase belum lengkap.");
  }
  return { baseUrl, serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = serviceConfig();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceKey);
  if (config.serviceKey.startsWith("sb_secret_")) {
    headers.delete("Authorization");
  } else {
    headers.set("Authorization", "Bearer " + config.serviceKey);
  }
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
      throw new SupabaseOnboardingError(409, body?.message || "Data berbenturan dengan data yang sudah tersimpan.");
    }
    if (code === "22023" || response.status === 400) {
      throw new SupabaseOnboardingError(400, body?.message || "Data tidak valid.");
    }
    if (code === "P0002" || response.status === 404) {
      throw new SupabaseOnboardingError(404, body?.message || "Data tidak ditemukan pada tenant ini.");
    }
    if (code === "42501" || response.status === 403) {
      throw new SupabaseOnboardingError(403, "Operasi ditolak oleh kebijakan tenant.");
    }
    if (response.status >= 500) {
      throw new SupabaseOnboardingError(503, "Layanan Supabase sementara tidak tersedia.");
    }
    throw new SupabaseOnboardingError(503, "Permintaan ke backend Supabase belum dapat diproses.");
  }
  return body;
}

function isCanonicalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveActiveTenantId(tenantIdentifier: string) {
  const normalized = String(tenantIdentifier || "").trim();
  if (!normalized) throw new SupabaseOnboardingError(403, "Tenant aktif tidak ditemukan.");

  const params = new URLSearchParams({
    select: "id,slug,status",
    limit: "2",
  });
  if (isCanonicalUuid(normalized)) params.set("id", "eq." + normalized);
  else params.set("slug", "eq." + normalized.toLowerCase());

  const rows = await supabaseRequest("/rest/v1/tenants?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.status || "").toLowerCase() !== "active") {
    throw new SupabaseOnboardingError(403, "Tenant aktif tidak ditemukan di Supabase.");
  }
  return String(rows[0].id);
}

function validateCategory(value: unknown): StructureCategory {
  if (value === "Gedung" || value === "Kamar" || value === "Kelas") return value;
  throw new SupabaseOnboardingError(400, "Kategori struktur tidak didukung pada tahap ini.");
}

function validateUuid(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!isCanonicalUuid(normalized)) throw new SupabaseOnboardingError(400, label + " tidak valid.");
  return normalized;
}

export type SupabaseStructureRecord = {
  id: string;
  name: string;
  category: StructureCategory;
  type: StructureCategory;
  status: string;
  organizationUnitId?: string | null;
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

  for (let offset = 0; offset <= 10000; offset += pageSize) {
    const remaining = 10001 - offset;
    const params = new URLSearchParams({
      select: "tenant_id,category,id,name,status,parent_id,grade,capacity,occupied,gender_code,location,attributes,organization_unit_id",
      tenant_id: "eq." + tenantId,
      category: "in.(Gedung,Kamar,Kelas)",
      order: "category.asc,name.asc",
      limit: String(Math.min(pageSize, remaining)),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/master_data_records?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Data struktur pesantren belum dapat dimuat.");
    if (offset + rows.length > 10000) throw new SupabaseOnboardingError(413, "Jumlah struktur melebihi batas 10.000 record untuk satu permintaan.");
    all.push(...rows);
    if (rows.length < Math.min(pageSize, remaining)) break;
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
      organizationUnitId: row.organization_unit_id == null ? null : String(row.organization_unit_id),
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
    throw new SupabaseOnboardingError(503, "Backend belum menghasilkan NIS yang valid.");
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
    throw new SupabaseOnboardingError(400, "ID struktur tidak valid.");
  }
  const rawRecord = recordValue && typeof recordValue === "object" && !Array.isArray(recordValue)
    ? recordValue as JsonObject
    : null;
  if (!rawRecord) throw new SupabaseOnboardingError(400, "Data struktur tidak valid.");
  const record = { ...rawRecord };
  if (category === "Kamar") {
    const capacity = parseCapacity(record.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) throw new SupabaseOnboardingError(400, "Kapasitas kamar harus minimal satu.");
    record.capacity = capacity;
  }

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
    throw new SupabaseOnboardingError(400, "ID struktur tidak valid.");
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
    throw new SupabaseOnboardingError(404, "Data struktur tidak ditemukan pada tenant ini.");
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

function parseCapacity(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : NaN;
  const text = typeof value === "string" ? value.trim() : "";
  const match = text.match(/^(\d+)(?:\s*(?:siswa|santri|orang))?$/i);
  return match ? Number(match[1]) : NaN;
}

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
      const capacity = parseCapacity(record.capacity);
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

  const buildings = new Map(result.records.filter((item) => item.category === "Gedung").map((item) => [item.id, item.record]));
  for (const item of result.records) {
    if (item.category !== "Kamar") continue;
    const parentId = typeof item.record.parentId === "string" ? item.record.parentId : "";
    if (parentId && !buildings.has(parentId)) {
      result.errors.push({ id: item.id, category: item.category, message: "Gedung induk kamar tidak ditemukan pada dataset tenant ini." });
    }
    const roomGender = normalizedGender(item.record.genderRestriction || item.record.gender);
    const building = parentId ? buildings.get(parentId) : null;
    const buildingGender = normalizedGender(building?.genderRestriction || building?.gender);
    if (!roomGender && !buildingGender) {
      result.warnings.push({ id: item.id, category: item.category, message: "Gender belum eksplisit pada kamar atau gedung; onboarding akan ditolak sampai konfigurasi dilengkapi." });
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
  const incomingCapacityText = String(incoming.capacity ?? "").trim();
  const incomingCapacityMatch = incomingCapacityText.match(/^(\d+)(?:\s*(?:siswa|santri|orang))?$/i);
  const incomingCapacity = incomingCapacityMatch ? Number(incomingCapacityMatch[1]) : undefined;
  return existing.name.trim() === String(incoming.name || "").trim()
    && existing.status.toLowerCase() === String(incoming.status || "Active").toLowerCase()
    && existingParentId === parentId
    && String(existing.grade || "") === String(incoming.grade || "")
    && (category === "Gedung" || (incomingCapacity === undefined && existing.capacity == null) || Number(existing.capacity) === incomingCapacity)
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
        message: error instanceof SupabaseOnboardingError
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
  actorUserIdValue: unknown,
  candidateIdValue: unknown,
  clientRequestIdValue: unknown,
  assignmentValue: unknown
) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const actorUserId = validateUuid(actorUserIdValue, "ID akun Admin");
  const candidateId = validateUuid(candidateIdValue, "ID calon santri");
  const clientRequestId = validateUuid(clientRequestIdValue, "ID permintaan");
  const assignment = assignmentValue && typeof assignmentValue === "object" && !Array.isArray(assignmentValue)
    ? assignmentValue as JsonObject
    : null;
  if (!assignment) throw new SupabaseOnboardingError(400, "Penempatan santri tidak valid.");

  const body = await supabaseRequest("/rest/v1/rpc/onboard_accepted_ppdb_candidate_with_room_history_actor", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_actor_user_id: actorUserId,
      p_candidate_id: candidateId,
      p_nis: String(assignment.nis || "").trim(),
      p_class_id: String(assignment.classId || "").trim(),
      p_room_id: String(assignment.roomId || "").trim(),
      p_building_id: String(assignment.buildingId || "").trim() || null,
      p_guardian_name: String(assignment.waliName || "").trim(),
      p_guardian_phone: String(assignment.waliPhone || "").trim(),
      p_client_request_id: clientRequestId,
    }),
  });
  if (!body || typeof body !== "object" || body.success !== true) {
    throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi onboarding santri.");
  }
  return {
    success: true,
    nis: String(body.nis || ""),
    santriId: String(body.santriId || ""),
    waliId: String(body.waliId || ""),
    alreadyOnboarded: Boolean(body.alreadyOnboarded),
    replayed: Boolean(body.replayed),
  };
}




export type SupabaseBoardingStudent = {
  id: string;
  supabaseId: string;
  sourceRecordId: string | null;
  name: string;
  gender: "L" | "P" | null;
  grade: string | null;
  nis: string | null;
  classId: string | null;
  className: string | null;
  roomId: string | null;
  room: string | null;
  dormitoryId: string | null;
  dormitory: string | null;
  status: string;
};

export async function listSupabaseBoardingSnapshot(
  tenantIdentifier: string,
  actor?: { uid?: string; role?: string; organizationUnitId?: string | null },
): Promise<{
  structures: SupabaseStructureRecord[];
  students: SupabaseBoardingStudent[];
}> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  let structures = await listSupabaseMasterDataStructures(tenantId);
  const all: JsonObject[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "id,source_record_id,name,gender,grade,nis,class_id,room_id,building_id,organization_unit_id,status",
      tenant_id: "eq." + tenantId,
      order: "name.asc,id.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Data santri belum dapat dimuat.");
    all.push(...rows);
    if (rows.length < pageSize) break;
    if (offset + pageSize >= 10000) {
      const overflowParams = new URLSearchParams({
        select: "id",
        tenant_id: "eq." + tenantId,
        limit: "1",
        offset: "10000",
      });
      const overflow = await supabaseRequest("/rest/v1/students?" + overflowParams.toString());
      if (!Array.isArray(overflow)) throw new SupabaseOnboardingError(503, "Jumlah data santri belum dapat diverifikasi.");
      if (overflow.length > 0) {
        throw new SupabaseOnboardingError(503, "Jumlah data santri melebihi batas snapshot 10.000 record.");
      }
      break;
    }
  }

  let visibleStudentRows = all;
  if (String(actor?.role || "").toLowerCase() === "ustadz") {
    const unitId = String(actor?.organizationUnitId || "").trim();
    const userId = String(actor?.uid || "").trim();
    if (!isCanonicalUuid(unitId) || !isCanonicalUuid(userId)) {
      throw new SupabaseOnboardingError(403, "Profil Ustadz belum memiliki unit organisasi aktif.");
    }
    const assignmentPath = "/rest/v1/boarding_staff_assignments?" + new URLSearchParams({
      select: "room_id,building_id", tenant_id: "eq." + tenantId, user_id: "eq." + userId,
      status: "eq.active", order: "id.asc", limit: "5001",
    }).toString();
    const assignments = await supabaseRequest(assignmentPath);
    if (!Array.isArray(assignments) || assignments.length > 5000) {
      throw new SupabaseOnboardingError(503, "Penugasan lokasi Ustadz belum dapat diverifikasi dengan aman.");
    }
    const byId = new Map(structures.map((item) => [String(item.id), item] as const));
    const unitStructures = structures.filter((item) => {
      if (String(item.organizationUnitId || "") !== unitId) return false;
      if (item.category !== "Kamar" || !item.parentId) return true;
      const parent = byId.get(item.parentId);
      return Boolean(parent && parent.category === "Gedung" && parent.organizationUnitId === unitId);
    });
    const structuresById = new Map(unitStructures.map((item) => [String(item.id), item] as const));
    const active = (item: SupabaseStructureRecord) => !["inactive", "nonaktif", "tidak aktif", "disabled"].includes(item.status.trim().toLowerCase());
    const assignedBuildings = new Set<string>();
    const assignedRooms = new Set<string>();
    for (const assignment of assignments) {
      const buildingId = String(assignment.building_id || "");
      const roomId = String(assignment.room_id || "");
      if (buildingId) {
        const building = structuresById.get(buildingId);
        if (building?.category === "Gedung" && active(building)) assignedBuildings.add(buildingId);
      }
      if (roomId) {
        const room = structuresById.get(roomId);
        if (room?.category === "Kamar" && active(room)) assignedRooms.add(roomId);
      }
    }
    const visibleRooms = new Set(unitStructures.filter((item) => item.category === "Kamar" && active(item)
      && (assignedRooms.has(item.id) || (item.parentId && assignedBuildings.has(item.parentId)))).map((item) => item.id));
    const unitBuildingIds = new Set(unitStructures.filter((item) => item.category === "Gedung" && active(item)).map((item) => item.id));
    if (!visibleRooms.size && !assignedBuildings.size) {
      throw new SupabaseOnboardingError(403, "Akun Ustadz belum memiliki penugasan lokasi aktif.");
    }
    const visibleBuildingIds = new Set(assignedBuildings);
    for (const room of unitStructures) if (room.category === "Kamar" && visibleRooms.has(room.id) && room.parentId) {
      visibleBuildingIds.add(room.parentId);
    }
    structures = unitStructures.filter((item) => item.category === "Kelas"
      || (item.category === "Gedung" && visibleBuildingIds.has(item.id))
      || (item.category === "Kamar" && visibleRooms.has(item.id)));
    visibleStudentRows = all.filter((student) => {
      if (!isOperationalBoardingStudent(student.status)) return false;
      if (String(student.organization_unit_id || "") !== unitId) return false;
      const roomId = String(student.room_id || ""), buildingId = String(student.building_id || "");
      if (!roomId) return Boolean(buildingId && assignedBuildings.has(buildingId));
      if (!visibleRooms.has(roomId)) return false;
      const roomBuildingId = byId.get(roomId)?.parentId || "";
      return !buildingId || (unitBuildingIds.has(buildingId) && (!roomBuildingId || roomBuildingId === buildingId));
    });
  }

  const byCategoryAndId = new Map(structures.map((item) => [item.category + ":" + item.id, item]));
  const students: SupabaseBoardingStudent[] = visibleStudentRows.map((row) => {
    const supabaseId = String(row.id || "");
    const sourceRecordId = typeof row.source_record_id === "string" ? row.source_record_id : null;
    const roomId = typeof row.room_id === "string" ? row.room_id : null;
    const buildingId = typeof row.building_id === "string" ? row.building_id : null;
    const classId = typeof row.class_id === "string" ? row.class_id : null;
    const room = roomId ? byCategoryAndId.get("Kamar:" + roomId) : undefined;
    const building = buildingId ? byCategoryAndId.get("Gedung:" + buildingId) : undefined;
    const schoolClass = classId ? byCategoryAndId.get("Kelas:" + classId) : undefined;
    return {
      id: sourceRecordId || supabaseId,
      supabaseId,
      sourceRecordId,
      name: String(row.name || ""),
      gender: row.gender === "L" || row.gender === "P" ? row.gender : null,
      grade: typeof row.grade === "string" ? row.grade : null,
      nis: typeof row.nis === "string" ? row.nis : null,
      classId,
      className: schoolClass?.name || null,
      roomId,
      room: room?.name || null,
      dormitoryId: buildingId,
      dormitory: building?.name || null,
      status: String(row.status || "Active"),
    };
  });

  return { structures, students };
}

export async function assignSupabaseStudentRoom(
  tenantIdentifier: string,
  studentIdValue: unknown,
  roomIdValue: unknown,
  buildingIdValue: unknown,
  actorUserId: string
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const actorId = validateUuid(actorUserId, "ID Admin");
  const studentId = validateUuid(studentIdValue, "ID santri");
  let roomId: string | null = null;
  if (roomIdValue !== null) {
    if (typeof roomIdValue !== "string") throw new SupabaseOnboardingError(400, "ID kamar tidak valid.");
    roomId = roomIdValue.trim();
    if (!roomId || roomId.length > 160 || roomId.includes("/")) {
      throw new SupabaseOnboardingError(400, "ID kamar tidak valid.");
    }
  }

  let buildingId: string | null = null;
  if (buildingIdValue !== undefined && buildingIdValue !== null) {
    if (typeof buildingIdValue !== "string") throw new SupabaseOnboardingError(400, "ID gedung tidak valid.");
    buildingId = buildingIdValue.trim();
    if (!buildingId || buildingId.length > 160 || buildingId.includes("/")) {
      throw new SupabaseOnboardingError(400, "ID gedung tidak valid.");
    }
  }

  const result = await supabaseRequest("/rest/v1/rpc/assign_student_to_room_audited", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_room_id: roomId,
      p_building_id: buildingId,
      p_actor_user_id: actorId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi perubahan penempatan kamar.");
  }
  return result as JsonObject;
}

export type SupabaseStudentRoomAssignmentHistoryEntry = {
  id: number;
  eventType: "baseline_snapshot" | "initial_assignment" | "assigned" | "moved" | "unassigned" | "building_changed";
  previousRoomName: string | null;
  roomName: string | null;
  previousBuildingName: string | null;
  buildingName: string | null;
  changedByName: string;
  changeSource: "boarding_runtime" | "master_data" | "legacy_import" | "ppdb_onboarding" | "migration_baseline" | "system";
  changedAt: string;
};

export async function listSupabaseStudentRoomAssignmentHistory(
  tenantIdentifier: string,
  studentIdentifier: string
): Promise<SupabaseStudentRoomAssignmentHistoryEntry[]> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const studentId = validateUuid(studentIdentifier, "ID santri");
  const params = new URLSearchParams({
    select: "id,event_type,previous_room_name,room_name,previous_building_name,building_name,changed_by,change_source,changed_at",
    tenant_id: "eq." + tenantId,
    student_id: "eq." + studentId,
    order: "changed_at.desc,id.desc",
    limit: "100",
  });
  const rows = await supabaseRequest("/rest/v1/student_room_assignment_history?" + params.toString());
  if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Riwayat penempatan kamar belum dapat dibaca.");
  const actorIds = [...new Set(rows.map((row: any) => String(row?.changed_by || "")).filter(isCanonicalUuid))];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const profileParams = new URLSearchParams({
      select: "user_id,display_name",
      tenant_id: "eq." + tenantId,
      user_id: "in.(" + actorIds.join(",") + ")",
    });
    const profiles = await supabaseRequest("/rest/v1/profiles?" + profileParams.toString());
    if (Array.isArray(profiles)) {
      for (const profile of profiles) {
        if (isCanonicalUuid(String(profile?.user_id || "")) && typeof profile?.display_name === "string") {
          actorNames.set(profile.user_id, profile.display_name);
        }
      }
    }
  }
  return rows.map((row: any) => ({
    id: Number(row.id),
    eventType: row.event_type,
    previousRoomName: typeof row.previous_room_name === "string" ? row.previous_room_name : null,
    roomName: typeof row.room_name === "string" ? row.room_name : null,
    previousBuildingName: typeof row.previous_building_name === "string" ? row.previous_building_name : null,
    buildingName: typeof row.building_name === "string" ? row.building_name : null,
    changedByName: actorNames.get(String(row.changed_by || "")) || (row.changed_by ? "Admin" : "Sistem"),
    changeSource: row.change_source,
    changedAt: row.changed_at,
  }));
}

export type LegacySupabaseStudentSource = {
  id: string;
  record: unknown;
  guardian?: { id: string; record: unknown } | null;
  sourceWarnings?: string[];
};

type LegacyMigrationIssue = { id: string; category: string; message: string };

function piiKey(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new SupabaseOnboardingError(503, "Konfigurasi perlindungan data pribadi backend belum lengkap.");
  }
  return Buffer.from(value, "hex");
}

function legacyIdentity(value: unknown, expectedLength: number, label: string) {
  if (value == null || value === "") return { original: "", value: "", error: "" };
  if (typeof value !== "string") {
    return { original: "", value: "", error: label + " harus disimpan sebagai teks untuk menjaga digit secara utuh." };
  }
  const original = value.trim();
  if (!original) return { original: "", value: "", error: "" };
  if (!/^[0-9 .-]+$/.test(original)) {
    return { original: "", value: "", error: label + " lama perlu diperbaiki sebelum data ini dapat dimigrasikan." };
  }
  const digits = original.replace(/\D/g, "");
  if (digits.length !== expectedLength) {
    return { original: "", value: "", error: label + " lama perlu diperbaiki sebelum data ini dapat dimigrasikan." };
  }
  return { original, value: digits, error: "" };
}

function encryptLegacyIdentity(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", piiKey("PII_ENCRYPTION_KEY"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("hex");
}

function fingerprintLegacyIdentity(kind: "nik" | "nisn", value: string) {
  return createHmac("sha256", piiKey("PII_FINGERPRINT_KEY"))
    .update(kind + ":" + value, "utf8")
    .digest("hex");
}

/** Protect applicant identifiers on the trusted server before they enter Supabase. */
export function protectPpdbIdentityValues(nik: string, nisn: string) {
  if (!/^\d{16}$/.test(nik) || (nisn && !/^\d{10}$/.test(nisn))) {
    throw new SupabaseOnboardingError(400, "NIK atau NISN PPDB tidak valid.");
  }
  return {
    nikCiphertextHex: encryptLegacyIdentity(nik),
    nikFingerprintHex: fingerprintLegacyIdentity("nik", nik),
    nisnCiphertextHex: nisn ? encryptLegacyIdentity(nisn) : "",
    nisnFingerprintHex: nisn ? fingerprintLegacyIdentity("nisn", nisn) : "",
  };
}

function legacyText(value: unknown, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value).trim().slice(0, maxLength);
}

function legacyDateText(value: unknown) {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "";
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(normalized)) {
      const [year, month, day] = normalized.split("-").map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
        ? normalized
        : "";
    }
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(value);
  } else if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number };
    try {
      if (typeof timestamp.toDate === "function") date = timestamp.toDate();
      else {
        const seconds = Number(timestamp.seconds ?? timestamp._seconds);
        const nanoseconds = Number(timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0);
        if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
          date = new Date(seconds * 1000 + nanoseconds / 1_000_000);
        }
      }
    } catch {
      return "";
    }
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function safeLegacyDetails(record: JsonObject, fields: string[]) {
  const result: JsonObject = {};
  for (const field of fields) {
    const value = record[field];
    const normalized = field === "dob" || field === "enrolled"
      ? legacyDateText(value)
      : legacyText(value);
    if (normalized) result[field] = normalized;
  }
  return result;
}

function normalizeLegacyGender(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["l", "m", "male", "putra", "laki-laki", "laki laki", "ikhwan"].includes(normalized)) return "L";
  if (["p", "f", "female", "putri", "perempuan", "akhwat"].includes(normalized)) return "P";
  return null;
}

function decryptLegacyIdentity(ciphertext: unknown) {
  if (ciphertext == null || ciphertext === "") return "";
  const hex = typeof ciphertext === "string" ? ciphertext.replace(/^\\\\x/i, "").trim() : "";
  if (!hex || !/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
    throw new SupabaseOnboardingError(503, "Data identitas terenkripsi tidak dapat dibaca.");
  }
  const packed = Buffer.from(hex, "hex");
  if (packed.length < 29) throw new SupabaseOnboardingError(503, "Data identitas terenkripsi tidak valid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", piiKey("PII_ENCRYPTION_KEY"), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new SupabaseOnboardingError(503, "Kunci perlindungan data pribadi tidak cocok dengan data terenkripsi.");
  }
}

function safeStudentJsonValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => safeStudentJsonValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const result: JsonObject = {};
    Object.entries(value as JsonObject).slice(0, 100).forEach(([key, item]) => {
      if (/nik|nisn|password|secret|token|api.?key/i.test(key) || key.startsWith("_")) return;
      const safeValue = safeStudentJsonValue(item, depth + 1);
      if (safeValue !== undefined) result[key.slice(0, 80)] = safeValue;
    });
    return result;
  }
  return undefined;
}

function safeStudentDetails(record: JsonObject): JsonObject {
  const excluded = new Set([
    "id", "supabaseId", "sourceRecordId", "tenantId", "type", "category",
    "name", "nis", "gender", "grade", "classId", "roomId", "buildingId",
    "dormitoryId", "status", "nik", "nisn", "createdAt", "updatedAt",
  ]);
  const details: JsonObject = {};
  Object.entries(record).forEach(([key, value]) => {
    if (excluded.has(key) || key.startsWith("_") || /nik|nisn|password|secret|token|api.?key/i.test(key)) return;
    const safeValue = safeStudentJsonValue(value);
    if (safeValue !== undefined) details[key] = safeValue;
  });
  if (Buffer.byteLength(JSON.stringify(details), "utf8") > 32000) {
    throw new SupabaseOnboardingError(400, "Detail data santri melebihi batas ukuran.");
  }
  return details;
}

function mapSupabaseStudentRow(
  row: JsonObject,
  tenantId: string,
  structures: SupabaseStructureRecord[],
  includeSensitive = false,
) {
  const supabaseId = String(row.id || "");
  const sourceRecordId = typeof row.source_record_id === "string" ? row.source_record_id : null;
  const rawDetails = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
  const safeDetails = includeSensitive ? rawDetails : safeStudentJsonValue(rawDetails);
  const details = safeDetails && typeof safeDetails === "object" && !Array.isArray(safeDetails)
    ? safeDetails as JsonObject
    : {};
  const classId = typeof row.class_id === "string" ? row.class_id : null;
  const roomId = typeof row.room_id === "string" ? row.room_id : null;
  const buildingId = typeof row.building_id === "string" ? row.building_id : null;
  const schoolClass = classId ? structures.find((item) => item.category === "Kelas" && item.id === classId) : undefined;
  const room = roomId ? structures.find((item) => item.category === "Kamar" && item.id === roomId) : undefined;
  const building = buildingId ? structures.find((item) => item.category === "Gedung" && item.id === buildingId) : undefined;
  return {
    ...details,
    id: sourceRecordId || supabaseId,
    supabaseId,
    sourceRecordId,
    tenantId,
    type: "Santri",
    name: String(row.name || ""),
    nis: typeof row.nis === "string" ? row.nis : "",
    nik: includeSensitive ? decryptLegacyIdentity(row.nik_ciphertext) : "",
    nisn: includeSensitive ? decryptLegacyIdentity(row.nisn_ciphertext) : "",
    hasNik: Boolean(row.nik_ciphertext),
    hasNisn: Boolean(row.nisn_ciphertext),
    gender: row.gender === "L" || row.gender === "P" ? row.gender : "",
    grade: typeof row.grade === "string" ? row.grade : "",
    classId,
    className: schoolClass?.name || details.className || "",
    roomId,
    room: room?.name || details.room || "",
    dormitoryId: buildingId,
    dormitory: building?.name || details.dormitory || "",
    status: String(row.status || "Active"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSupabaseStudentRow(tenantId: string, studentId: string) {
  const params = new URLSearchParams({
    select: "id,tenant_id,source_system,source_record_id,nis,name,gender,grade,nik_ciphertext,nisn_ciphertext,class_id,room_id,building_id,details,status,created_at,updated_at",
    tenant_id: "eq." + tenantId,
    id: "eq." + studentId,
    limit: "1",
  });
  const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
  if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Data santri belum dapat dimuat.");
  return rows[0] as JsonObject | undefined;
}


type MasterDataStudentPageOptions = {
  page?: number;
  pageSize?: number;
  cursor?: unknown;
  search?: string;
  statuses?: string[];
  gender?: string;
  grade?: string;
  dormitory?: string;
  completeness?: string;
};

type MasterDataStudentCursor = { name: string; id: string };

function decodeMasterDataStudentCursor(raw: unknown): MasterDataStudentCursor | null {
  if (typeof raw !== "string" || !raw || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as MasterDataStudentCursor;
    if (!cursor || typeof cursor.name !== "string" || cursor.name.length > 180 || !isCanonicalUuid(cursor.id)) return null;
    return { name: cursor.name, id: cursor.id };
  } catch {
    return null;
  }
}

function encodeMasterDataStudentCursor(cursor: MasterDataStudentCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function postgrestQuotedValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export async function listSupabaseMasterDataStudentsPage(
  tenantIdentifier: string,
  options: MasterDataStudentPageOptions = {},
): Promise<{ records: JsonObject[]; page: number; pageSize: number; hasMore: boolean; nextCursor: string | null }> {
  const search = String(options.search || "").normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s._-]/gu, " ").trim().replace(/\s+/g, " ").slice(0, 80);
  if (search && Array.from(search).length < 3) {
    throw new SupabaseOnboardingError(400, "Pencarian santri harus berisi minimal 3 karakter.");
  }

  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const page = Number(options.page ?? 1);
  const pageSize = Number(options.pageSize ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new SupabaseOnboardingError(400, "Nomor halaman atau ukuran halaman santri tidak valid.");
  }
  const cursor = options.cursor == null ? null : decodeMasterDataStudentCursor(options.cursor);
  if ((options.cursor != null && !cursor) || (page === 1 && cursor) || (page > 1 && !cursor)) {
    throw new SupabaseOnboardingError(400, "Penanda halaman santri tidak valid atau tidak sesuai nomor halaman.");
  }

  const structures = await listSupabaseMasterDataStructures(tenantId);
  const params = new URLSearchParams({
    select: "id,tenant_id,source_system,source_record_id,nis,name,gender,grade,nik_ciphertext,nisn_ciphertext,class_id,room_id,building_id,details,status,created_at,updated_at",
    tenant_id: "eq." + tenantId,
    order: "name.asc,id.asc",
    limit: String(pageSize + 1),
  });
  const logic: string[] = [];
  if (cursor) {
    const name = postgrestQuotedValue(cursor.name);
    logic.push(`or(name.gt.${name},and(name.eq.${name},id.gt.${cursor.id}))`);
  }
  if (search) {
    const pattern = `*${search.replace(/\s/g, "*")}*`;
    logic.push(`or(name.ilike.${pattern},nis.ilike.${pattern},source_record_id.ilike.${pattern})`);
  }

  const allowedStatuses = new Set(["Active", "Inactive", "Alumni", "Suspended"]);
  const statuses = Array.isArray(options.statuses)
    ? [...new Set(options.statuses.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  if (statuses.some((status) => !allowedStatuses.has(status))) {
    throw new SupabaseOnboardingError(400, "Filter status santri tidak valid.");
  }
  if (statuses.length) params.set("status", `in.(${statuses.join(",")})`);
  else params.set("status", "neq.Archived");

  const gender = String(options.gender || "ALL");
  if (gender !== "ALL") {
    if (gender !== "L" && gender !== "P") throw new SupabaseOnboardingError(400, "Filter jenis kelamin tidak valid.");
    params.set("gender", "eq." + gender);
  }

  const grade = String(options.grade || "").trim().slice(0, 100);
  if (grade) {
    const schoolClass = structures.find((row) => row.category === "Kelas" && row.name === grade);
    const filters = [`grade.eq.${postgrestQuotedValue(grade)}`];
    if (schoolClass) filters.push(`class_id.eq.${schoolClass.id}`);
    logic.push(`or(${filters.join(",")})`);
  }

  const dormitory = String(options.dormitory || "").trim().slice(0, 100);
  if (dormitory) {
    const building = structures.find((row) => row.category === "Gedung" && row.name === dormitory);
    const filters = [`details->>dormitory.eq.${postgrestQuotedValue(dormitory)}`];
    if (building) filters.push(`building_id.eq.${building.id}`);
    logic.push(`or(${filters.join(",")})`);
  }

  const completeness = String(options.completeness || "ALL");
  if (completeness === "WITH_NIK") params.set("nik_ciphertext", "not.is.null");
  else if (completeness === "WITH_WALI") {
    logic.push("or(details->>waliSantriId.not.is.null,details->>parentName.not.is.null)");
  } else if (completeness === "WITHOUT_WALI") {
    logic.push("and(details->>waliSantriId.is.null,details->>parentName.is.null)");
  } else if (completeness !== "ALL") throw new SupabaseOnboardingError(400, "Filter kelengkapan data tidak valid.");

  if (logic.length) params.set("and", `(${logic.join(",")})`);
  const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
  if (!Array.isArray(rows) || rows.length > pageSize + 1) {
    throw new SupabaseOnboardingError(503, "Halaman data santri tidak dapat diverifikasi.");
  }
  const hasMore = rows.length > pageSize;
  const lastVisibleRow = rows[pageSize - 1];
  if (hasMore && (!lastVisibleRow || typeof lastVisibleRow.name !== "string" || !isCanonicalUuid(String(lastVisibleRow.id || "")))) {
    throw new SupabaseOnboardingError(503, "Penanda halaman santri tidak dapat diverifikasi.");
  }
  return {
    records: rows.slice(0, pageSize).map((row) => mapSupabaseStudentRow(row, tenantId, structures, false)),
    page,
    pageSize,
    hasMore,
    nextCursor: hasMore
      ? encodeMasterDataStudentCursor({ name: String(lastVisibleRow.name), id: String(lastVisibleRow.id) })
      : null,
  };
}

export async function getSupabaseMasterDataStudent(
  tenantIdentifier: string,
  studentIdentifier: string,
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const identifier = String(studentIdentifier || "").trim();
  if (!identifier || identifier.length > 1500) throw new SupabaseOnboardingError(400, "ID santri tidak valid.");
  const params = new URLSearchParams({
    select: "id,tenant_id,source_system,source_record_id,nis,name,gender,grade,nik_ciphertext,nisn_ciphertext,class_id,room_id,building_id,details,status,created_at,updated_at",
    tenant_id: "eq." + tenantId,
    limit: "2",
  });
  if (isCanonicalUuid(identifier)) params.set("id", "eq." + identifier);
  else params.set("source_record_id", "eq." + identifier);
  const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new SupabaseOnboardingError(rows?.length > 1 ? 409 : 404, "Data santri tidak ditemukan secara unik pada tenant ini.");
  }
  const structures = await listSupabaseMasterDataStructures(tenantId);
  return mapSupabaseStudentRow(rows[0], tenantId, structures, true);
}

export async function upsertSupabaseMasterDataStudent(
  tenantIdentifier: string,
  studentIdentifier: string,
  recordValue: unknown,
  actorUserId: string
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const actorId = validateUuid(actorUserId, "ID Admin");
  if (!recordValue || typeof recordValue !== "object" || Array.isArray(recordValue)) {
    throw new SupabaseOnboardingError(400, "Data santri tidak valid.");
  }
  const record = recordValue as JsonObject;
  const studentId = isCanonicalUuid(record.supabaseId)
    ? validateUuid(record.supabaseId, "ID santri")
    : null;
  const providedSourceRecordId = typeof record.sourceRecordId === "string" ? record.sourceRecordId.trim() : "";
  const recordId = typeof record.id === "string" ? record.id.trim() : "";
  const sourceRecordId = providedSourceRecordId
    || (studentId ? (recordId && !isCanonicalUuid(recordId) ? recordId : "") : (recordId || studentIdentifier).trim());
  if (!studentId && (!sourceRecordId || sourceRecordId.length > 1500)) {
    throw new SupabaseOnboardingError(400, "ID santri tidak valid.");
  }
  const rawName = typeof record.name === "string" ? record.name.trim() : "";
  if (!rawName || rawName.length > 180) throw new SupabaseOnboardingError(400, "Nama santri wajib diisi dan maksimal 180 karakter.");
  const name = rawName;
  if (record.nis != null && typeof record.nis !== "string") {
    throw new SupabaseOnboardingError(400, "NIS harus dikirim sebagai teks agar angka nol di depan tetap terjaga.");
  }
  const nis = typeof record.nis === "string" ? record.nis.trim() : "";
  if (nis && !/^[0-9]{1,10}$/.test(nis)) throw new SupabaseOnboardingError(400, "NIS harus berisi 1 sampai 10 digit.");
  const rawGender = String(record.gender || "").trim();
  const gender = rawGender ? normalizeLegacyGender(rawGender) : null;
  if (rawGender && !gender) throw new SupabaseOnboardingError(400, "Jenis kelamin santri tidak valid.");
  const rawGrade = record.grade == null ? "" : String(record.grade).trim();
  if (rawGrade.length > 80) throw new SupabaseOnboardingError(400, "Jenjang santri maksimal 80 karakter.");
  const grade = rawGrade;
  const rawStatus = record.status == null || record.status === "" ? "Active" : String(record.status).trim();
  if (rawStatus.length > 40 || rawStatus.toLowerCase() === "archived") {
    throw new SupabaseOnboardingError(400, "Status santri tidak valid; gunakan operasi arsip untuk mengarsipkan data.");
  }
  const status = rawStatus || "Active";

  const nik = legacyIdentity(record.nik, 16, "NIK");
  const nisn = legacyIdentity(record.nisn, 10, "NISN");
  if (nik.error) throw new SupabaseOnboardingError(400, nik.error);
  if (nisn.error) throw new SupabaseOnboardingError(400, nisn.error);
  const nikCiphertextHex = nik.value ? encryptLegacyIdentity(nik.value) : null;
  const nikFingerprintHex = nik.value ? fingerprintLegacyIdentity("nik", nik.value) : null;
  const nisnCiphertextHex = nisn.value ? encryptLegacyIdentity(nisn.value) : null;
  const nisnFingerprintHex = nisn.value ? fingerprintLegacyIdentity("nisn", nisn.value) : null;
  const rawClassId = record.classId == null ? "" : String(record.classId).trim();
  const rawRoomId = record.roomId == null ? "" : String(record.roomId).trim();
  const rawBuildingId = record.dormitoryId != null ? String(record.dormitoryId).trim() : (record.buildingId == null ? "" : String(record.buildingId).trim());
  if (rawClassId.length > 160 || rawRoomId.length > 160 || rawBuildingId.length > 160) {
    throw new SupabaseOnboardingError(400, "ID kelas, kamar, atau gedung tidak valid.");
  }
  const classId = rawClassId || null;
  const roomId = rawRoomId || null;
  const buildingId = rawBuildingId || null;
  const details = safeStudentDetails(record);

  const result = await supabaseRequest("/rest/v1/rpc/upsert_master_data_student_with_actor", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_source_record_id: sourceRecordId || null,
      p_student: { name, nis: nis || null, gender, grade: grade || null, classId, roomId, buildingId, status, details },
      p_nik_ciphertext_hex: nikCiphertextHex,
      p_nik_fingerprint_hex: nikFingerprintHex,
      p_nisn_ciphertext_hex: nisnCiphertextHex,
      p_nisn_fingerprint_hex: nisnFingerprintHex,
      p_actor_user_id: actorId,
    }),
  });
  const savedStudentId = isCanonicalUuid(String(result?.studentId || "")) ? String(result.studentId) : "";
  if (!savedStudentId) throw new SupabaseOnboardingError(503, "Backend tidak mengembalikan ID santri yang valid.");
  const row = await getSupabaseStudentRow(tenantId, savedStudentId);
  if (!row) throw new SupabaseOnboardingError(503, "Data santri tersimpan tetapi tidak dapat dibaca ulang.");
  const structures = await listSupabaseMasterDataStructures(tenantId);
  return mapSupabaseStudentRow(row, tenantId, structures, false);
}

export async function archiveSupabaseMasterDataStudent(
  tenantIdentifier: string,
  studentIdentifier: string,
  actorUserId: string
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const actorId = validateUuid(actorUserId, "ID Admin");
  const studentId = isCanonicalUuid(studentIdentifier) ? validateUuid(studentIdentifier, "ID santri") : null;
  const result = await supabaseRequest("/rest/v1/rpc/archive_master_data_student_with_actor", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_source_record_id: studentId ? null : studentIdentifier,
      p_actor_user_id: actorId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabaseOnboardingError(503, "Backend belum mengonfirmasi pengarsipan santri.");
  }
  return result as JsonObject;
}

const MASTER_DATA_TRANSFER_MAX_ROWS = 250;
const MASTER_DATA_EXPORT_MAX_ROWS = 20000;

type TransferStatus = "ready" | "skip" | "error";

function transferText(value: unknown, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, maxLength);
}

function transferRows(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MASTER_DATA_TRANSFER_MAX_ROWS) {
    throw new SupabaseOnboardingError(400, "Impor harus berisi 1 sampai " + MASTER_DATA_TRANSFER_MAX_ROWS + " baris per berkas.");
  }
  if (value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new SupabaseOnboardingError(400, "Setiap baris impor harus berupa objek data.");
  }
  return value as JsonObject[];
}

function splitTransferValues(values: string[]) {
  const unique = [...new Set(values)];
  return Array.from({ length: Math.ceil(unique.length / 80) }, (_, index) => unique.slice(index * 80, index * 80 + 80));
}

async function fetchExistingStudentTransferKeys(tenantId: string, sourceIds: string[], nisValues: string[]) {
  const existingSources = new Set<string>();
  const nisToSource = new Map<string, string>();
  for (const values of splitTransferValues(sourceIds)) {
    if (!values.length) continue;
    const params = new URLSearchParams({
      select: "source_record_id,nis",
      tenant_id: "eq." + tenantId,
      source_system: "eq.legacy_import",
      source_record_id: "in.(" + values.map(postgrestQuotedValue).join(",") + ")",
      limit: String(values.length + 1),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows) || rows.length > values.length) throw new SupabaseOnboardingError(503, "Pemeriksaan ID sumber belum dapat diverifikasi.");
    for (const row of rows) {
      if (typeof row.source_record_id === "string") existingSources.add(row.source_record_id);
      if (typeof row.nis === "string") nisToSource.set(row.nis, String(row.source_record_id || ""));
    }
  }
  for (const values of splitTransferValues(nisValues)) {
    if (!values.length) continue;
    const params = new URLSearchParams({
      select: "source_record_id,nis",
      tenant_id: "eq." + tenantId,
      nis: "in.(" + values.map(postgrestQuotedValue).join(",") + ")",
      limit: String(values.length + 1),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows) || rows.length > values.length) throw new SupabaseOnboardingError(503, "Pemeriksaan NIS belum dapat diverifikasi.");
    for (const row of rows) {
      if (typeof row.nis === "string") nisToSource.set(row.nis, String(row.source_record_id || "PPDB"));
    }
  }
  return { existingSources, nisToSource };
}

async function buildStudentTransferPlan(tenantIdentifier: string, value: unknown) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const rows = transferRows(value);
  const structures = await listSupabaseMasterDataStructures(tenantId);
  const sourceIds = rows.map((row) => transferText(row.id, 1500)).filter(Boolean);
  const nisValues = rows.map((row) => transferText(row.nis, 32)).filter(Boolean);
  const existing = await fetchExistingStudentTransferKeys(tenantId, sourceIds, nisValues);
  if (rows.some((row) => transferText(row.nik, 80) || transferText(row.nisn, 80))) {
    piiKey("PII_ENCRYPTION_KEY");
    piiKey("PII_FINGERPRINT_KEY");
  }
  const idsInFile = new Set<string>();
  const nisInFile = new Set<string>();
  const nikInFile = new Set<string>();
  const nisnInFile = new Set<string>();
  const findStructure = (category: StructureCategory, name: string) => {
    if (!name) return { id: "", count: 0 };
    const matches = structures.filter((item) => item.category === category
      && item.name.trim().toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"));
    return { id: matches.length === 1 ? matches[0].id : "", count: matches.length };
  };

  return rows.map((row, index) => {
    const id = transferText(row.id, 1500);
    const name = transferText(row.name, 180);
    const messages: string[] = [];
    const record: JsonObject = { id, sourceRecordId: id, name };
    if (!id || id.includes("/")) messages.push("Kolom id wajib diisi dan tidak boleh memuat garis miring.");
    if (!name) messages.push("Kolom name wajib diisi.");
    if (id && idsInFile.has(id)) messages.push("ID sumber muncul lebih dari sekali dalam berkas.");
    if (id) idsInFile.add(id);
    if (id && existing.existingSources.has(id)) {
      return { row: index + 2, id, name, status: "skip" as const, messages: ["ID sumber sudah ada; record tidak ditimpa."], record };
    }

    const nis = transferText(row.nis, 32);
    if (nis && !/^[0-9]{1,10}$/.test(nis)) messages.push("NIS harus berisi 1–10 digit dan diformat sebagai teks.");
    if (nis && nisInFile.has(nis)) messages.push("NIS muncul lebih dari sekali dalam berkas.");
    if (nis) nisInFile.add(nis);
    if (nis && existing.nisToSource.has(nis)) messages.push("NIS sudah dipakai record lain pada tenant ini.");
    record.nis = nis;

    const gender = transferText(row.gender, 40);
    const normalizedGender = gender ? normalizeLegacyGender(gender) : null;
    if (gender && !normalizedGender) messages.push("gender harus L/P, Putra/Putri, atau padanan yang didukung.");
    if (normalizedGender) record.gender = normalizedGender;

    const grade = transferText(row.grade, 80);
    if (grade) {
      record.grade = grade;
      const match = findStructure("Kelas", grade);
      if (match.count > 1) messages.push("Nama kelas cocok dengan lebih dari satu struktur; gunakan nama unik.");
      else if (match.id) record.classId = match.id;
    }
    const buildingName = transferText(row.dormitory, 180);
    if (buildingName) {
      const match = findStructure("Gedung", buildingName);
      if (match.count !== 1) messages.push(match.count ? "Nama gedung tidak unik." : "Gedung pada kolom dormitory tidak ditemukan.");
      else record.dormitoryId = match.id;
    }
    const roomName = transferText(row.room, 180);
    if (roomName) {
      const match = findStructure("Kamar", roomName);
      if (match.count !== 1) messages.push(match.count ? "Nama kamar tidak unik." : "Kamar pada kolom room tidak ditemukan.");
      else record.roomId = match.id;
    }

    const nik = transferText(row.nik, 80);
    const nisn = transferText(row.nisn, 80);
    const normalizedNik = legacyIdentity(nik, 16, "NIK");
    const normalizedNisn = legacyIdentity(nisn, 10, "NISN");
    if (normalizedNik.error) messages.push(normalizedNik.error);
    if (normalizedNisn.error) messages.push(normalizedNisn.error);
    if (normalizedNik.value && nikInFile.has(normalizedNik.value)) messages.push("NIK muncul lebih dari sekali dalam berkas.");
    if (normalizedNisn.value && nisnInFile.has(normalizedNisn.value)) messages.push("NISN muncul lebih dari sekali dalam berkas.");
    if (normalizedNik.value) { nikInFile.add(normalizedNik.value); record.nik = normalizedNik.value; }
    if (normalizedNisn.value) { nisnInFile.add(normalizedNisn.value); record.nisn = normalizedNisn.value; }

    const rawStatus = transferText(row.status, 40) || "Active";
    const status = new Map([
      ["active", "Active"], ["inactive", "Inactive"], ["alumni", "Alumni"], ["suspended", "Suspended"],
    ]).get(rawStatus.toLocaleLowerCase("id-ID")) || rawStatus;
    if (!new Set(["Active", "Inactive", "Alumni", "Suspended"]).has(status)) {
      messages.push("status harus Active, Inactive, Alumni, atau Suspended.");
    }
    record.status = status;
    for (const field of ["phone", "email", "parentName", "parentPhone", "address"]) {
      const fieldValue = transferText(row[field], field === "address" ? 1000 : 180);
      if (fieldValue) record[field] = fieldValue;
    }
    return { row: index + 2, id, name, status: messages.length ? "error" as const : "ready" as const, messages, record };
  });
}

function transferSummary(items: Array<{ row: number; id: string; name: string; status: TransferStatus; messages: string[] }>) {
  return {
    rowCount: items.length,
    readyCount: items.filter((item) => item.status === "ready").length,
    skippedCount: items.filter((item) => item.status === "skip").length,
    errorCount: items.filter((item) => item.status === "error").length,
    items,
  };
}

export async function previewSupabaseMasterDataStudentImport(tenantIdentifier: string, value: unknown) {
  const items = await buildStudentTransferPlan(tenantIdentifier, value);
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  await preflightStudentTransferItems(tenantId, items);
  return transferSummary(items.map(({ row, id, name, status, messages }) => ({ row, id, name, status, messages })));
}

async function preflightStudentTransferItems(tenantId: string, items: Array<{ id: string; status: TransferStatus; messages: string[]; record: JsonObject }>) {
  for (let offset = 0; offset < items.length; offset += 12) {
    const batch = items.slice(offset, offset + 12).filter((item) => item.status === "ready");
    const checked = await Promise.all(batch.map(async (item) => {
      try {
        return await supabaseRequest("/rest/v1/rpc/import_legacy_master_data_student", {
          method: "POST",
          body: JSON.stringify({
            p_tenant_id: tenantId,
            p_student: buildStudentTransferRpcRecord(item.id, item.record),
            p_guardian: null,
            p_apply: false,
          }),
        });
      } catch (error) {
        return { status: "error", message: error instanceof SupabaseOnboardingError ? error.message : "Pemeriksaan backend belum dapat diselesaikan." };
      }
    }));
    checked.forEach((result: any, index) => {
      const item = batch[index];
      if (result?.status === "already_imported") {
        item.status = "skip";
        item.messages.push("ID sumber sudah diimpor; data tidak ditimpa.");
      } else if (result?.status !== "planned") {
        item.status = "error";
        item.messages.push(String(result?.message || "Data berbenturan dengan data tenant yang sudah ada."));
      }
    });
  }
}

function buildStudentTransferRpcRecord(sourceId: string, record: JsonObject): JsonObject {
  const nik = legacyIdentity(record.nik, 16, "NIK");
  const nisn = legacyIdentity(record.nisn, 10, "NISN");
  if (nik.error || nisn.error) throw new SupabaseOnboardingError(400, nik.error || nisn.error || "Identitas tidak valid.");
  const details: JsonObject = {};
  for (const field of ["phone", "email", "parentName", "parentPhone", "address"]) {
    if (record[field]) details[field] = record[field];
  }
  const student: JsonObject = {
    sourceRecordId: sourceId,
    name: record.name,
    nis: record.nis || null,
    gender: record.gender || null,
    grade: record.grade || null,
    classId: record.classId || null,
    roomId: record.roomId || null,
    buildingId: record.dormitoryId || null,
    status: record.status || "Active",
    details,
  };
  if (nik.value) {
    student.nikCiphertextHex = encryptLegacyIdentity(nik.value);
    student.nikFingerprintHex = fingerprintLegacyIdentity("nik", nik.value);
  }
  if (nisn.value) {
    student.nisnCiphertextHex = encryptLegacyIdentity(nisn.value);
    student.nisnFingerprintHex = fingerprintLegacyIdentity("nisn", nisn.value);
  }
  return student;
}

export async function applySupabaseMasterDataStudentImport(tenantIdentifier: string, actorUserId: string, value: unknown) {
  const items = await buildStudentTransferPlan(tenantIdentifier, value);
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  await preflightStudentTransferItems(tenantId, items);
  if (items.some((item) => item.status === "error")) throw new SupabaseOnboardingError(400, "Selesaikan semua kesalahan pada pratinjau sebelum menerapkan impor.");
  validateUuid(actorUserId, "ID Admin");
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; id: string; message: string }> = [];
  for (const item of items) {
    if (item.status === "skip") { skipped += 1; continue; }
    try {
      const result = await supabaseRequest("/rest/v1/rpc/import_legacy_master_data_student", {
        method: "POST",
        body: JSON.stringify({
          p_tenant_id: tenantId,
          p_student: buildStudentTransferRpcRecord(item.id, item.record),
          p_guardian: null,
          p_apply: true,
        }),
      });
      if (result?.status === "imported") imported += 1;
      else if (result?.status === "already_imported") skipped += 1;
      else throw new SupabaseOnboardingError(409, String(result?.message || "Record bertentangan dengan data tenant yang sudah ada."));
    } catch (error) {
      errors.push({ row: item.row, id: item.id, message: error instanceof SupabaseOnboardingError ? error.message : "Record belum dapat disimpan." });
    }
  }
  return { rowCount: items.length, imported, skipped, errorCount: errors.length, errors };
}

export async function exportSupabaseMasterDataStudents(tenantIdentifier: string, includeSensitive = false) {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const structures = await listSupabaseMasterDataStructures(tenantId);
  const records: JsonObject[] = [];
  const pageSize = 500;
  for (let offset = 0; offset <= MASTER_DATA_EXPORT_MAX_ROWS; offset += pageSize) {
    const params = new URLSearchParams({
      select: "id,tenant_id,source_system,source_record_id,nis,name,gender,grade,nik_ciphertext,nisn_ciphertext,class_id,room_id,building_id,details,status,created_at,updated_at",
      tenant_id: "eq." + tenantId,
      status: "neq.Archived",
      order: "name.asc,id.asc",
      limit: String(Math.min(pageSize, MASTER_DATA_EXPORT_MAX_ROWS + 1 - offset)),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabaseOnboardingError(503, "Ekspor data santri belum dapat diverifikasi.");
    if (offset + rows.length > MASTER_DATA_EXPORT_MAX_ROWS) {
      throw new SupabaseOnboardingError(413, "Ekspor melebihi batas 20.000 record. Pecah migrasi berdasarkan kelompok data.");
    }
    records.push(...rows.map((row: JsonObject) => {
      const mapped = mapSupabaseStudentRow(row, tenantId, structures, includeSensitive);
      const record: JsonObject = {
        id: mapped.id, name: mapped.name, nis: mapped.nis, gender: mapped.gender, grade: mapped.grade,
        className: mapped.className, room: mapped.room, dormitory: mapped.dormitory, status: mapped.status,
      };
      if (includeSensitive) {
        for (const field of ["nik", "nisn", "phone", "email", "parentName", "parentPhone", "address"]) {
          record[field] = mapped[field] || "";
        }
      }
      return record;
    }));
    if (rows.length < pageSize) break;
  }
  return records;
}

export async function previewSupabaseMasterDataStructureImport(tenantIdentifier: string, categoryValue: unknown, value: unknown) {
  const category = validateCategory(categoryValue);
  const rows = transferRows(value);
  const existing = await listSupabaseMasterDataStructures(tenantIdentifier);
  const existingIds = new Set(existing.filter((row) => row.category === category).map((row) => row.id));
  const incomingIds = new Set<string>();
  const existingBuildingIds = new Set(existing.filter((row) => row.category === "Gedung").map((row) => row.id));
  const items = rows.map((row, index) => {
    const id = transferText(row.id, 160);
    const name = transferText(row.name, 180);
    const messages: string[] = [];
    if (transferText(row.category, 32) !== category) messages.push("category harus sama dengan tab aktif: " + category + ".");
    if (!id || id.includes("/")) messages.push("id struktur wajib diisi dan tidak boleh memuat garis miring.");
    if (!name) messages.push("name struktur wajib diisi.");
    if (id && incomingIds.has(id)) messages.push("ID struktur muncul lebih dari sekali dalam berkas.");
    if (id) incomingIds.add(id);
    if (id && existingIds.has(id)) return { row: index + 2, id, name, status: "skip" as const, messages: ["ID struktur sudah ada; record tidak ditimpa."] };
    const parentId = transferText(row.parentId, 160);
    if (category === "Kamar" && parentId && !existingBuildingIds.has(parentId)) {
      messages.push("parentId harus merujuk Gedung yang sudah tersimpan pada tenant ini.");
    }
    if (category === "Kamar") {
      const capacity = Number(transferText(row.capacity, 20));
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2147483647) messages.push("Kapasitas kamar harus bilangan bulat 1 sampai 2.147.483.647.");
    } else if (transferText(row.capacity, 20)) {
      const capacity = Number(transferText(row.capacity, 20));
      if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 2147483647) messages.push("Kapasitas harus bilangan bulat 0 sampai 2.147.483.647.");
    }
    return { row: index + 2, id, name, status: messages.length ? "error" as const : "ready" as const, messages };
  });
  return transferSummary(items);
}

export async function applySupabaseMasterDataStructureImport(tenantIdentifier: string, categoryValue: unknown, value: unknown) {
  const preview = await previewSupabaseMasterDataStructureImport(tenantIdentifier, categoryValue, value);
  if (preview.errorCount) throw new SupabaseOnboardingError(400, "Selesaikan semua kesalahan pada pratinjau sebelum menerapkan impor.");
  const category = validateCategory(categoryValue);
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const rows = transferRows(value);
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; id: string; message: string }> = [];
  const statuses = new Map<number, TransferStatus>(preview.items.map((item) => [item.row, item.status] as const));
  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    if (statuses.get(index + 2) === "skip") { skipped += 1; continue; }
    const id = transferText(record.id, 160);
    try {
      const safeRecord: JsonObject = {
        id,
        name: transferText(record.name, 180),
        category,
        type: category,
        status: transferText(record.status, 40) || "Active",
        parentId: transferText(record.parentId, 160),
        grade: transferText(record.grade, 80),
        capacity: transferText(record.capacity, 20),
        genderRestriction: transferText(record.genderRestriction, 40),
        location: transferText(record.location, 180),
      };
      const result = await supabaseRequest("/rest/v1/rpc/create_master_data_structure_if_absent", {
        method: "POST",
        body: JSON.stringify({ p_tenant_id: tenantId, p_category: category, p_id: id, p_record: safeRecord }),
      });
      if (result?.status === "created") imported += 1;
      else if (result?.status === "already_exists") skipped += 1;
      else throw new SupabaseOnboardingError(503, "Backend tidak mengembalikan hasil impor struktur yang valid.");
    } catch (error) {
      errors.push({ row: index + 2, id, message: error instanceof SupabaseOnboardingError ? error.message : "Struktur belum dapat disimpan." });
    }
  }
  return { rowCount: rows.length, imported, skipped, errorCount: errors.length, errors };
}

function normalizeLegacyNis(value: unknown) {
  const original = legacyText(value, 80);
  if (!original) return { nis: null as string | null, legacyValue: "" };
  if (/^[0-9]{1,10}$/.test(original)) return { nis: original, legacyValue: "" };
  return { nis: null as string | null, legacyValue: original };
}

/**
 * Preview or import a bounded Firebase tenant dataset into Supabase.
 * NIK/NISN are encrypted and fingerprinted in this server process; only ciphertext
 * and keyed fingerprints are sent to the service-role RPC.
 */
export async function migrateSupabaseLegacyMasterDataStudents(
  tenantIdentifier: string,
  source: LegacySupabaseStudentSource[],
  apply: boolean
) {
  if (!Array.isArray(source) || source.length > 5000) {
    throw new SupabaseOnboardingError(400, "Jumlah data migrasi harus berada pada rentang 0 sampai 5.000 record.");
  }
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const errors: LegacyMigrationIssue[] = [];
  const warnings: LegacyMigrationIssue[] = [];
  const prepared: Array<{ id: string; student: JsonObject; guardian: JsonObject | null; warnings: string[] }> = [];
  const seenNis = new Map<string, string>();
  const seenIdentity = new Map<string, { sourceId: string; entityType: "student" | "guardian" }>();

  for (const item of source) {
    const sourceId = typeof item?.id === "string" ? item.id.trim() : "";
    const record = item?.record && typeof item.record === "object" && !Array.isArray(item.record)
      ? item.record as JsonObject
      : null;
    if (!sourceId || sourceId.length > 1500 || !record) {
      errors.push({ id: sourceId, category: "Santri", message: "ID sumber atau isi record santri tidak valid." });
      continue;
    }
    const name = legacyText(record.name, 180);
    if (!name) {
      errors.push({ id: sourceId, category: "Santri", message: "Nama santri wajib diisi sebelum migrasi." });
      continue;
    }

    const localWarnings: string[] = Array.isArray(item.sourceWarnings)
      ? item.sourceWarnings.filter((message): message is string => typeof message === "string").slice(0, 10)
      : [];
    const nis = normalizeLegacyNis(record.nis);
    const gender = normalizeLegacyGender(record.gender);
    for (const [field, label] of [["dob", "Tanggal lahir"], ["enrolled", "Tanggal masuk"]] as const) {
      const value = record[field];
      const supplied = value instanceof Date
        || (typeof value === "string" && Boolean(value.trim()))
        || typeof value === "number"
        || (value !== null && typeof value === "object");
      if (supplied && !legacyDateText(value)) {
        localWarnings.push(label + " lama tidak dapat dipetakan; perlu rekonsiliasi manual.");
      }
    }
    if (!gender) localWarnings.push("Jenis kelamin belum dapat dipetakan; data perlu dilengkapi.");
    if (nis.legacyValue) localWarnings.push("Format NIS lama tidak standar; NIS disimpan untuk rekonsiliasi manual.");

    const nik = legacyIdentity(record.nik, 16, "NIK");
    const nisn = legacyIdentity(record.nisn, 10, "NISN");
    if (nik.error) {
      errors.push({ id: sourceId, category: "Santri", message: nik.error });
      continue;
    }
    if (nisn.error) {
      errors.push({ id: sourceId, category: "Santri", message: nisn.error });
      continue;
    }

    if (nis.nis) {
      const previous = seenNis.get(nis.nis);
      if (previous) {
        errors.push({ id: sourceId, category: "Santri", message: "NIS duplikat dalam data sumber (record " + previous + ")." });
        continue;
      }
      seenNis.set(nis.nis, sourceId);
    }

    const nikFingerprint = nik.value ? fingerprintLegacyIdentity("nik", nik.value) : "";
    const nisnFingerprint = nisn.value ? fingerprintLegacyIdentity("nisn", nisn.value) : "";
    let duplicateIdentity = "";
    for (const [kind, fingerprint] of [["nik", nikFingerprint], ["nisn", nisnFingerprint]] as const) {
      if (!fingerprint) continue;
      const key = kind + ":" + fingerprint;
      const previous = seenIdentity.get(key);
      if (previous) duplicateIdentity = kind.toUpperCase() + " duplikat dalam data sumber (record " + previous.sourceId + ").";
      else seenIdentity.set(key, { sourceId, entityType: "student" });
    }
    if (duplicateIdentity) {
      errors.push({ id: sourceId, category: "Santri", message: duplicateIdentity });
      continue;
    }

    const details = safeLegacyDetails(record, [
      "enrolled", "previousSchool", "pob", "dob", "phone", "email", "address",
      "halaqah", "halaqahId", "medical", "bloodType", "parentName", "parentPhone",
      "fatherName", "motherName", "fatherJob", "motherJob",
    ]);
    if (nis.legacyValue) details.legacyNis = nis.legacyValue;
    const legacyClassId = legacyText(record.classId, 160);
    const legacyRoomId = legacyText(record.roomId, 160);
    const legacyBuildingId = legacyText(record.buildingId ?? record.dormitoryId, 160);
    const legacyDormitory = legacyText(record.dormitory, 160);
    if (legacyClassId) details.legacyClassId = legacyClassId;
    if (legacyRoomId) details.legacyRoomId = legacyRoomId;
    if (legacyBuildingId) details.legacyBuildingId = legacyBuildingId;
    if (legacyDormitory && !legacyRoomId && !legacyBuildingId) {
      details.legacyDormitory = legacyDormitory;
      localWarnings.push("Label asrama lama disimpan untuk rekonsiliasi; relasi kamar belum dapat dipetakan.");
    }
    const student: JsonObject = {
      sourceRecordId: sourceId,
      name,
      nis: nis.nis,
      gender,
      grade: legacyText(record.grade, 80),
      classId: legacyClassId,
      roomId: legacyRoomId,
      buildingId: legacyBuildingId,
      status: legacyText(record.status, 40) || "Active",
      details,
    };
    if (nik.value) {
      student.nikCiphertextHex = encryptLegacyIdentity(nik.value);
      student.nikFingerprintHex = nikFingerprint;
    }
    if (nisn.value) {
      student.nisnCiphertextHex = encryptLegacyIdentity(nisn.value);
      student.nisnFingerprintHex = nisnFingerprint;
    }

    const guardianSource = item.guardian?.record && typeof item.guardian.record === "object" && !Array.isArray(item.guardian.record)
      ? item.guardian.record as JsonObject
      : null;
    const guardian = guardianSource || record.parentName || record.parentPhone ? (guardianSource || record) : null;
    let guardianPayload: JsonObject | null = null;
    if (guardian) {
      const guardianName = legacyText(guardian.name || record.parentName, 180);
      const guardianPhone = legacyText(guardian.phone || record.parentPhone, 40);
      const guardianSourceId = item.guardian?.id
        ? String(item.guardian.id).trim()
        : "inline:" + sourceId;
      if (guardianName && guardianSourceId.length <= 1500) {
        const guardianDetails = safeLegacyDetails(guardian, [
          "email", "address", "occupation", "income", "education", "studentName", "studentGrade",
        ]);
        const guardianNik = legacyIdentity(guardian.nik, 16, "NIK wali");
        if (guardianNik.error) {
          errors.push({ id: guardianSourceId, category: "Wali Santri", message: guardianNik.error });
          localWarnings.push("Wali belum dimigrasikan karena NIK perlu diperbaiki.");
        }
        guardianPayload = {
          sourceRecordId: guardianSourceId,
          name: guardianName,
          phone: guardianPhone,
          relationship: legacyText(guardian.relationship, 80) || "Wali",
          details: guardianDetails,
        };
        if (guardianNik.value) {
          const guardianFingerprint = fingerprintLegacyIdentity("nik", guardianNik.value);
          guardianPayload.nikCiphertextHex = encryptLegacyIdentity(guardianNik.value);
          guardianPayload.nikFingerprintHex = guardianFingerprint;
          const identityKey = "nik:" + guardianFingerprint;
          const priorGuardian = seenIdentity.get(identityKey);
          if (priorGuardian && (priorGuardian.entityType !== "guardian" || priorGuardian.sourceId !== guardianSourceId)) {
            errors.push({ id: guardianSourceId, category: "Wali Santri", message: "NIK wali duplikat pada record sumber yang berbeda." });
          } else {
            seenIdentity.set(identityKey, { sourceId: guardianSourceId, entityType: "guardian" });
          }
        }
      } else {
        localWarnings.push(guardianName
          ? "ID sumber wali terlalu panjang; relasi wali belum dimigrasikan."
          : "Nama wali tidak tersedia; record wali perlu direkonsiliasi manual.");
      }
    } else {
      localWarnings.push("Data wali tidak ditemukan atau relasinya belum dapat dipetakan; perlu rekonsiliasi manual.");
    }
    prepared.push({ id: sourceId, student, guardian: guardianPayload, warnings: localWarnings });
  }

  if (apply && errors.length > 0) {
    return { dryRun: false, sourceCount: source.length, planned: 0, imported: 0, skipped: 0, errors, warnings };
  }

  if (apply) {
    for (let offset = 0; offset < prepared.length; offset += 12) {
      const batch = prepared.slice(offset, offset + 12);
      const checks = await Promise.all(batch.map(async (item) => {
        try {
          return await supabaseRequest("/rest/v1/rpc/import_legacy_master_data_student", {
            method: "POST",
            body: JSON.stringify({
              p_tenant_id: tenantId,
              p_student: item.student,
              p_guardian: item.guardian,
              p_apply: false,
            }),
          });
        } catch (error: any) {
          return {
            status: "error",
            message: error instanceof SupabaseOnboardingError
              ? error.message
              : "Record belum dapat divalidasi oleh backend migrasi.",
          };
        }
      }));
      checks.forEach((result: any, index: number) => {
        if (!result || !["planned", "already_imported"].includes(String(result.status))) {
          errors.push({
            id: batch[index].id,
            category: "Santri",
            message: String(result?.message || "Konflik ditemukan pada preview Supabase; belum ada data yang ditulis."),
          });
        }
      });
    }
    if (errors.length > 0) {
      return { dryRun: false, sourceCount: source.length, planned: 0, imported: 0, skipped: 0, errors, warnings };
    }
  }

  let imported = 0;
  let skipped = 0;
  let planned = 0;
  for (let offset = 0; offset < prepared.length; offset += 12) {
    const batch = prepared.slice(offset, offset + 12);
    const outcomes = await Promise.all(batch.map(async (item) => {
      try {
        const result = await supabaseRequest("/rest/v1/rpc/import_legacy_master_data_student", {
          method: "POST",
          body: JSON.stringify({
            p_tenant_id: tenantId,
            p_student: item.student,
            p_guardian: item.guardian,
            p_apply: apply,
          }),
        });
        if (!result || typeof result !== "object" || typeof result.status !== "string") {
          throw new SupabaseOnboardingError(503, "Backend tidak mengembalikan status migrasi yang valid.");
        }
        return { item, result };
      } catch (error: any) {
        return {
          item,
          result: {
            status: "error",
            message: error instanceof SupabaseOnboardingError
              ? error.message
              : "Record belum dapat diproses oleh backend migrasi.",
          },
        };
      }
    }));

    for (const outcome of outcomes) {
      const { item, result } = outcome;
      const status = String(result.status);
      if (status === "imported") imported += 1;
      else if (status === "already_imported") skipped += 1;
      else if (status === "planned") planned += 1;
      else errors.push({
        id: item.id,
        category: "Santri",
        message: String(result.message || "Record bertenturan dengan data tenant yang sudah ada."),
      });
      for (const message of item.warnings) warnings.push({ id: item.id, category: "Santri", message });
      const rpcWarnings = Array.isArray(result.warnings) ? result.warnings : [];
      for (const message of rpcWarnings) warnings.push({ id: item.id, category: "Santri", message: String(message) });
    }
  }

  return {
    dryRun: !apply,
    sourceCount: source.length,
    planned: apply ? imported + skipped : planned + skipped,
    imported,
    skipped,
    errors,
    warnings,
  };
}
