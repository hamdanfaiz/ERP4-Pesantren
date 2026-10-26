export const ACADEMIC_PORTAL_PAGE_SIZE = 50;

export type AcademicPortalCursor = { updatedAt: string; id: string };
export type AcademicPortalRole = "Santri" | "Walisantri";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function encodeAcademicPortalCursor(cursor: AcademicPortalCursor): string {
  if (!UUID_PATTERN.test(cursor.id) || !TIMESTAMP_PATTERN.test(cursor.updatedAt) || !Number.isFinite(Date.parse(cursor.updatedAt))) {
    throw new Error("Kursor riwayat akademik tidak valid.");
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAcademicPortalCursor(value: unknown): AcademicPortalCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 512) throw new Error("Kursor riwayat akademik tidak valid.");
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const cursor = JSON.parse(decoded) as Partial<AcademicPortalCursor>;
    if (!cursor || typeof cursor !== "object" || typeof cursor.updatedAt !== "string" || typeof cursor.id !== "string"
      || !UUID_PATTERN.test(cursor.id) || !TIMESTAMP_PATTERN.test(cursor.updatedAt) || !Number.isFinite(Date.parse(cursor.updatedAt))) {
      throw new Error("Kursor riwayat akademik tidak valid.");
    }
    return { updatedAt: cursor.updatedAt, id: cursor.id };
  } catch {
    throw new Error("Kursor riwayat akademik tidak valid.");
  }
}

export function buildAcademicPortalAssessmentParams(input: {
  tenantId: string;
  studentId: string;
  cursor?: AcademicPortalCursor | null;
}) {
  if (!UUID_PATTERN.test(input.tenantId) || !UUID_PATTERN.test(input.studentId)) {
    throw new Error("Tenant atau santri untuk riwayat akademik tidak valid.");
  }
  const params = new URLSearchParams({
    select: "id,student_id,record_data,updated_at",
    tenant_id: "eq." + input.tenantId,
    kind: "eq.assessment",
    student_id: "eq." + input.studentId,
    deleted_at: "is.null",
    order: "updated_at.desc,id.desc",
    limit: String(ACADEMIC_PORTAL_PAGE_SIZE + 1),
  });
  if (input.cursor) {
    if (!UUID_PATTERN.test(input.cursor.id) || !TIMESTAMP_PATTERN.test(input.cursor.updatedAt)
      || !Number.isFinite(Date.parse(input.cursor.updatedAt))) {
      throw new Error("Kursor riwayat akademik tidak valid.");
    }
    params.set("or", `(updated_at.lt.${input.cursor.updatedAt},and(updated_at.eq.${input.cursor.updatedAt},id.lt.${input.cursor.id}))`);
  }
  return params;
}

export function resolveAcademicPortalStudentId(input: {
  role: AcademicPortalRole;
  linkedSantriId?: string | null;
  guardianStudentIds?: string[];
  requestedStudentId?: string | null;
}): string {
  const requested = String(input.requestedStudentId || "").trim();
  if (input.role === "Santri") {
    const linked = String(input.linkedSantriId || "").trim();
    if (!UUID_PATTERN.test(linked) || (requested && requested !== linked)) {
      throw new Error("Akun Santri hanya dapat melihat data akademik miliknya sendiri.");
    }
    return linked;
  }
  const allowed = [...new Set((input.guardianStudentIds || []).filter((id) => UUID_PATTERN.test(id)))];
  if (!allowed.length) throw new Error("Belum ada santri aktif yang tertaut ke akun Wali ini.");
  if (requested && !allowed.includes(requested)) {
    throw new Error("Santri yang dipilih tidak tertaut ke akun Wali ini.");
  }
  return requested || allowed[0];
}
