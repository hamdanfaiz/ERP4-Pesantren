import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { SupabasePpdbAdminError } from "./supabasePpdbAdmin";

type JsonObject = Record<string, any>;
type StructureCategory = "Gedung" | "Kamar" | "Kelas";

function serviceConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    throw new SupabasePpdbAdminError(503, "Konfigurasi backend Supabase belum lengkap.");
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
  const rawRecord = recordValue && typeof recordValue === "object" && !Array.isArray(recordValue)
    ? recordValue as JsonObject
    : null;
  if (!rawRecord) throw new SupabasePpdbAdminError(400, "Data struktur tidak valid.");
  const record = { ...rawRecord };
  if (category === "Kamar") {
    const capacity = parseCapacity(record.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) throw new SupabasePpdbAdminError(400, "Kapasitas kamar harus minimal satu.");
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

export async function listSupabaseBoardingSnapshot(tenantIdentifier: string): Promise<{
  structures: SupabaseStructureRecord[];
  students: SupabaseBoardingStudent[];
}> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const structures = await listSupabaseMasterDataStructures(tenantId);
  const all: JsonObject[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "id,source_record_id,name,gender,grade,nis,class_id,room_id,building_id,status",
      tenant_id: "eq." + tenantId,
      order: "name.asc,id.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data santri belum dapat dimuat.");
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
      if (!Array.isArray(overflow)) throw new SupabasePpdbAdminError(503, "Jumlah data santri belum dapat diverifikasi.");
      if (overflow.length > 0) {
        throw new SupabasePpdbAdminError(503, "Jumlah data santri melebihi batas snapshot 10.000 record.");
      }
      break;
    }
  }

  const byCategoryAndId = new Map(structures.map((item) => [item.category + ":" + item.id, item]));
  const students: SupabaseBoardingStudent[] = all.map((row) => {
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
  buildingIdValue?: unknown
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const studentId = validateUuid(studentIdValue, "ID santri");
  let roomId: string | null = null;
  if (roomIdValue !== null) {
    if (typeof roomIdValue !== "string") throw new SupabasePpdbAdminError(400, "ID kamar tidak valid.");
    roomId = roomIdValue.trim();
    if (!roomId || roomId.length > 160 || roomId.includes("/")) {
      throw new SupabasePpdbAdminError(400, "ID kamar tidak valid.");
    }
  }

  let buildingId: string | null = null;
  if (buildingIdValue !== undefined && buildingIdValue !== null) {
    if (typeof buildingIdValue !== "string") throw new SupabasePpdbAdminError(400, "ID gedung tidak valid.");
    buildingId = buildingIdValue.trim();
    if (!buildingId || buildingId.length > 160 || buildingId.includes("/")) {
      throw new SupabasePpdbAdminError(400, "ID gedung tidak valid.");
    }
  }

  const result = await supabaseRequest("/rest/v1/rpc/assign_student_to_room", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_room_id: roomId,
      p_building_id: buildingId,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabasePpdbAdminError(503, "Backend belum mengonfirmasi perubahan penempatan kamar.");
  }
  return result as JsonObject;
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
    throw new SupabasePpdbAdminError(503, "Konfigurasi perlindungan data pribadi backend belum lengkap.");
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
    throw new SupabasePpdbAdminError(503, "Data identitas terenkripsi tidak dapat dibaca.");
  }
  const packed = Buffer.from(hex, "hex");
  if (packed.length < 29) throw new SupabasePpdbAdminError(503, "Data identitas terenkripsi tidak valid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", piiKey("PII_ENCRYPTION_KEY"), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new SupabasePpdbAdminError(503, "Kunci perlindungan data pribadi tidak cocok dengan data terenkripsi.");
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
    throw new SupabasePpdbAdminError(400, "Detail data santri melebihi batas ukuran.");
  }
  return details;
}

function mapSupabaseStudentRow(row: JsonObject, tenantId: string, structures: SupabaseStructureRecord[]) {
  const supabaseId = String(row.id || "");
  const sourceRecordId = typeof row.source_record_id === "string" ? row.source_record_id : null;
  const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
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
    nik: decryptLegacyIdentity(row.nik_ciphertext),
    nisn: decryptLegacyIdentity(row.nisn_ciphertext),
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
  if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data santri belum dapat dimuat.");
  return rows[0] as JsonObject | undefined;
}

export async function listSupabaseMasterDataStudents(tenantIdentifier: string): Promise<JsonObject[]> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const structures = await listSupabaseMasterDataStructures(tenantId);
  const all: JsonObject[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      select: "id,tenant_id,source_system,source_record_id,nis,name,gender,grade,nik_ciphertext,nisn_ciphertext,class_id,room_id,building_id,details,status,created_at,updated_at",
      tenant_id: "eq." + tenantId,
      status: "neq.Archived",
      order: "name.asc,id.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await supabaseRequest("/rest/v1/students?" + params.toString());
    if (!Array.isArray(rows)) throw new SupabasePpdbAdminError(503, "Data santri belum dapat dimuat.");
    all.push(...rows);
    if (rows.length < pageSize) break;
    if (offset + pageSize >= 10000) {
      const overflowParams = new URLSearchParams({
        select: "id",
        tenant_id: "eq." + tenantId,
        status: "neq.Archived",
        limit: "1",
        offset: "10000",
      });
      const overflow = await supabaseRequest("/rest/v1/students?" + overflowParams.toString());
      if (!Array.isArray(overflow)) throw new SupabasePpdbAdminError(503, "Jumlah data santri belum dapat diverifikasi.");
      if (overflow.length > 0) throw new SupabasePpdbAdminError(503, "Jumlah data santri melebihi batas tampilan 10.000 record.");
      break;
    }
  }
  return all.map((row) => mapSupabaseStudentRow(row, tenantId, structures));
}

export async function upsertSupabaseMasterDataStudent(
  tenantIdentifier: string,
  studentIdentifier: string,
  recordValue: unknown
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  if (!recordValue || typeof recordValue !== "object" || Array.isArray(recordValue)) {
    throw new SupabasePpdbAdminError(400, "Data santri tidak valid.");
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
    throw new SupabasePpdbAdminError(400, "ID santri tidak valid.");
  }
  const rawName = typeof record.name === "string" ? record.name.trim() : "";
  if (!rawName || rawName.length > 180) throw new SupabasePpdbAdminError(400, "Nama santri wajib diisi dan maksimal 180 karakter.");
  const name = rawName;
  if (record.nis != null && typeof record.nis !== "string") {
    throw new SupabasePpdbAdminError(400, "NIS harus dikirim sebagai teks agar angka nol di depan tetap terjaga.");
  }
  const nis = typeof record.nis === "string" ? record.nis.trim() : "";
  if (nis && !/^[0-9]{1,10}$/.test(nis)) throw new SupabasePpdbAdminError(400, "NIS harus berisi 1 sampai 10 digit.");
  const rawGender = String(record.gender || "").trim();
  const gender = rawGender ? normalizeLegacyGender(rawGender) : null;
  if (rawGender && !gender) throw new SupabasePpdbAdminError(400, "Jenis kelamin santri tidak valid.");
  const rawGrade = record.grade == null ? "" : String(record.grade).trim();
  if (rawGrade.length > 80) throw new SupabasePpdbAdminError(400, "Jenjang santri maksimal 80 karakter.");
  const grade = rawGrade;
  const rawStatus = record.status == null || record.status === "" ? "Active" : String(record.status).trim();
  if (rawStatus.length > 40 || rawStatus.toLowerCase() === "archived") {
    throw new SupabasePpdbAdminError(400, "Status santri tidak valid; gunakan operasi arsip untuk mengarsipkan data.");
  }
  const status = rawStatus || "Active";

  const nik = legacyIdentity(record.nik, 16, "NIK");
  const nisn = legacyIdentity(record.nisn, 10, "NISN");
  if (nik.error) throw new SupabasePpdbAdminError(400, nik.error);
  if (nisn.error) throw new SupabasePpdbAdminError(400, nisn.error);
  const nikCiphertextHex = nik.value ? encryptLegacyIdentity(nik.value) : null;
  const nikFingerprintHex = nik.value ? fingerprintLegacyIdentity("nik", nik.value) : null;
  const nisnCiphertextHex = nisn.value ? encryptLegacyIdentity(nisn.value) : null;
  const nisnFingerprintHex = nisn.value ? fingerprintLegacyIdentity("nisn", nisn.value) : null;
  const rawClassId = record.classId == null ? "" : String(record.classId).trim();
  const rawRoomId = record.roomId == null ? "" : String(record.roomId).trim();
  const rawBuildingId = record.dormitoryId != null ? String(record.dormitoryId).trim() : (record.buildingId == null ? "" : String(record.buildingId).trim());
  if (rawClassId.length > 160 || rawRoomId.length > 160 || rawBuildingId.length > 160) {
    throw new SupabasePpdbAdminError(400, "ID kelas, kamar, atau gedung tidak valid.");
  }
  const classId = rawClassId || null;
  const roomId = rawRoomId || null;
  const buildingId = rawBuildingId || null;
  const details = safeStudentDetails(record);

  const result = await supabaseRequest("/rest/v1/rpc/upsert_master_data_student", {
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
    }),
  });
  const savedStudentId = isCanonicalUuid(String(result?.studentId || "")) ? String(result.studentId) : "";
  if (!savedStudentId) throw new SupabasePpdbAdminError(503, "Backend tidak mengembalikan ID santri yang valid.");
  const row = await getSupabaseStudentRow(tenantId, savedStudentId);
  if (!row) throw new SupabasePpdbAdminError(503, "Data santri tersimpan tetapi tidak dapat dibaca ulang.");
  const structures = await listSupabaseMasterDataStructures(tenantId);
  return mapSupabaseStudentRow(row, tenantId, structures);
}

export async function archiveSupabaseMasterDataStudent(
  tenantIdentifier: string,
  studentIdentifier: string
): Promise<JsonObject> {
  const tenantId = await resolveActiveTenantId(tenantIdentifier);
  const studentId = isCanonicalUuid(studentIdentifier) ? validateUuid(studentIdentifier, "ID santri") : null;
  const result = await supabaseRequest("/rest/v1/rpc/archive_master_data_student", {
    method: "POST",
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_source_record_id: studentId ? null : studentIdentifier,
    }),
  });
  if (!result || typeof result !== "object" || result.success !== true) {
    throw new SupabasePpdbAdminError(503, "Backend belum mengonfirmasi pengarsipan santri.");
  }
  return result as JsonObject;
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
    throw new SupabasePpdbAdminError(400, "Jumlah data migrasi harus berada pada rentang 0 sampai 5.000 record.");
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
    if (legacyClassId) details.legacyClassId = legacyClassId;
    if (legacyRoomId) details.legacyRoomId = legacyRoomId;
    if (legacyBuildingId) details.legacyBuildingId = legacyBuildingId;
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
            message: error instanceof SupabasePpdbAdminError
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
          throw new SupabasePpdbAdminError(503, "Backend tidak mengembalikan status migrasi yang valid.");
        }
        return { item, result };
      } catch (error: any) {
        return {
          item,
          result: {
            status: "error",
            message: error instanceof SupabasePpdbAdminError
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
