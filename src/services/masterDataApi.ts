import { auth } from "../firebase";

export type SupabaseStructureCategory = "Gedung" | "Kamar" | "Kelas";

export interface SupabaseStructureRecord {
  id: string;
  name: string;
  category: SupabaseStructureCategory;
  type?: SupabaseStructureCategory;
  status?: string;
  parentId?: string;
  parentCode?: string;
  grade?: string;
  capacity?: number | string;
  occupied?: number;
  gender?: string;
  genderRestriction?: string;
  location?: string;
  building?: string;
  [key: string]: unknown;
}

async function requestMasterData<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
  const token = await currentUser.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Permintaan Master Data Supabase gagal diproses.");
  return payload as T;
}

export async function listSupabaseMasterDataStructures() {
  const result = await requestMasterData<{ records: SupabaseStructureRecord[] }>("/api/master-data/structures");
  return Array.isArray(result.records) ? result.records : [];
}

export async function upsertSupabaseMasterDataStructure(
  category: SupabaseStructureCategory,
  record: Record<string, unknown>
) {
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) throw new Error("ID struktur wajib diisi.");
  const result = await requestMasterData<{ record: SupabaseStructureRecord }>(
    "/api/master-data/structures/" + encodeURIComponent(category) + "/" + encodeURIComponent(id),
    { method: "PUT", body: JSON.stringify({ record }) }
  );
  return result.record;
}

export async function deleteSupabaseMasterDataStructure(
  category: SupabaseStructureCategory,
  recordId: string
) {
  return requestMasterData<{ deleted: boolean }>(
    "/api/master-data/structures/" + encodeURIComponent(category) + "/" + encodeURIComponent(recordId),
    { method: "DELETE" }
  );
}

export async function migrateLegacySupabaseMasterDataStructures(apply: false): Promise<{
  dryRun: true;
  sourceCount: number;
  planned: number;
  imported: number;
  skipped: number;
  errors: Array<{ id: string; category: string; message: string }>;
  warnings: Array<{ id: string; category: string; message: string }>;
}>;
export async function migrateLegacySupabaseMasterDataStructures(apply: true): Promise<{
  dryRun: false;
  sourceCount: number;
  planned: number;
  imported: number;
  skipped: number;
  errors: Array<{ id: string; category: string; message: string }>;
  warnings: Array<{ id: string; category: string; message: string }>;
}>;
export async function migrateLegacySupabaseMasterDataStructures(apply: boolean) {
  return requestMasterData<any>("/api/master-data/structures/migrate", {
    method: "POST",
    body: JSON.stringify(apply
      ? { apply: true, confirm: "IMPORT_MASTER_DATA_STRUCTURES" }
      : { apply: false }),
  });
}


export type LegacyStudentMigrationResult = {
  dryRun: boolean;
  sourceCount: number;
  planned: number;
  imported: number;
  skipped: number;
  errors: Array<{ id: string; category: string; message: string }>;
  warnings: Array<{ id: string; category: string; message: string }>;
};

export async function migrateLegacySupabaseStudents(apply: false): Promise<LegacyStudentMigrationResult>;
export async function migrateLegacySupabaseStudents(apply: true): Promise<LegacyStudentMigrationResult>;
export async function migrateLegacySupabaseStudents(apply: boolean) {
  return requestMasterData<LegacyStudentMigrationResult>("/api/master-data/students/migrate", {
    method: "POST",
    body: JSON.stringify(apply
      ? { apply: true, confirm: "IMPORT_LEGACY_MASTER_DATA_STUDENTS" }
      : { apply: false }),
  });
}

export type SupabaseRoomAssignmentResult = {
  success: true;
  alreadyAssigned?: boolean;
  alreadyUnassigned?: boolean;
  studentId: string;
  previousRoomId?: string | null;
  roomId: string | null;
  buildingId?: string | null;
  occupied?: number;
  capacity?: number;
};

export async function assignSupabaseStudentRoom(
  studentId: string,
  roomId: string | null,
  buildingId?: string | null
): Promise<SupabaseRoomAssignmentResult> {
  return requestMasterData<SupabaseRoomAssignmentResult>(
    "/api/boarding/students/" + encodeURIComponent(studentId) + "/room",
    { method: "PUT", body: JSON.stringify({ roomId, buildingId: buildingId ?? null }) }
  );
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

export async function listSupabaseBoardingSnapshot(): Promise<{
  structures: SupabaseStructureRecord[];
  students: SupabaseBoardingStudent[];
}> {
  const result = await requestMasterData<{ structures: SupabaseStructureRecord[]; students: SupabaseBoardingStudent[] }>(
    "/api/boarding/snapshot"
  );
  return {
    structures: Array.isArray(result.structures) ? result.structures : [],
    students: Array.isArray(result.students) ? result.students : [],
  };
}
