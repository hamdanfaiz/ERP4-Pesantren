export const ACADEMIC_RECORD_PAGE_SIZE = 50;

export type AcademicRecordKind = "schedule" | "journal" | "assessment";
export type AcademicRecordCursor = { createdAt: string; id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function validCursor(value: unknown): value is AcademicRecordCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<AcademicRecordCursor>;
  return typeof cursor.id === "string" && UUID_PATTERN.test(cursor.id)
    && typeof cursor.createdAt === "string" && TIMESTAMP_PATTERN.test(cursor.createdAt)
    && Number.isFinite(Date.parse(cursor.createdAt));
}

export function encodeAcademicRecordCursor(cursor: AcademicRecordCursor) {
  if (!validCursor(cursor)) throw new Error("Kursor catatan akademik tidak valid.");
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAcademicRecordCursor(value: unknown): AcademicRecordCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 512) throw new Error("Kursor catatan akademik tidak valid.");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!validCursor(cursor)) throw new Error("invalid cursor");
    return { createdAt: cursor.createdAt, id: cursor.id };
  } catch {
    throw new Error("Kursor catatan akademik tidak valid.");
  }
}

export function buildAcademicRecordPageParams(input: {
  tenantId: string;
  kind: AcademicRecordKind;
  includeOrganizationUnit?: boolean;
  organizationUnitId?: string | null;
  includeUnassignedUnit?: boolean;
  teacherUserId?: string | null;
  cursor?: AcademicRecordCursor | null;
}) {
  if (!UUID_PATTERN.test(input.tenantId)) throw new Error("Tenant akademik tidak valid.");
  if (input.kind !== "schedule" && input.kind !== "journal" && input.kind !== "assessment") throw new Error("Jenis catatan akademik tidak valid.");
  const params = new URLSearchParams({
    select: "id,kind,teacher_user_id,student_id,record_data,created_at,updated_at" + (input.includeOrganizationUnit ? ",organization_unit_id" : ""),
    tenant_id: "eq." + input.tenantId,
    kind: "eq." + input.kind,
    deleted_at: "is.null",
    order: "created_at.desc,id.desc",
    limit: String(ACADEMIC_RECORD_PAGE_SIZE + 1),
  });
  if (input.organizationUnitId) {
    if (!UUID_PATTERN.test(input.organizationUnitId)) throw new Error("Unit Akademik tidak valid.");
    if (input.includeUnassignedUnit) throw new Error("Cakupan unit Akademik tidak valid.");
    params.set("organization_unit_id", "eq." + input.organizationUnitId);
  }
  else if (input.includeUnassignedUnit) params.set("organization_unit_id", "is.null");
  if (input.teacherUserId) {
    if (!UUID_PATTERN.test(input.teacherUserId)) throw new Error("Pengajar akademik tidak valid.");
    params.set("teacher_user_id", "eq." + input.teacherUserId);
  }
  if (input.cursor) {
    if (!validCursor(input.cursor)) throw new Error("Kursor catatan akademik tidak valid.");
    params.set("or", `(created_at.lt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.lt.${input.cursor.id}))`);
  }
  return params;
}
