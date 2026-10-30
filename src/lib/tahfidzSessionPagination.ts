import { Buffer } from "node:buffer";

export const TAHFIDZ_SESSION_PAGE_SIZE = 100;

export type TahfidzSessionCursor = {
  scheduledAt: string;
  id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function encodeTahfidzSessionCursor(cursor: TahfidzSessionCursor): string {
  if (!TIMESTAMP_PATTERN.test(cursor.scheduledAt) || !Number.isFinite(Date.parse(cursor.scheduledAt)) || !isUuid(cursor.id)) {
    throw new Error("Posisi jadwal Tahfidz tidak valid.");
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTahfidzSessionCursor(value: unknown): TahfidzSessionCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Kursor jadwal Tahfidz tidak valid.");
  }
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<TahfidzSessionCursor>;
    if (!parsed || typeof parsed.scheduledAt !== "string" || typeof parsed.id !== "string"
      || !TIMESTAMP_PATTERN.test(parsed.scheduledAt) || !Number.isFinite(Date.parse(parsed.scheduledAt))
      || !isUuid(parsed.id) || encodeTahfidzSessionCursor(parsed as TahfidzSessionCursor) !== value) {
      throw new Error("invalid cursor payload");
    }
    return { scheduledAt: parsed.scheduledAt, id: parsed.id };
  } catch {
    throw new Error("Kursor jadwal Tahfidz tidak valid.");
  }
}

export function buildTahfidzSessionPageParams(input: {
  tenantId: string;
  kind: "talaqqi" | "exam";
  role: string;
  halaqahIds?: string[];
  studentIds?: string[];
  cursor?: unknown;
}): URLSearchParams | null {
  if (!isUuid(input.tenantId)) throw new Error("Tenant Tahfidz tidak valid.");
  if (input.kind !== "talaqqi" && input.kind !== "exam") throw new Error("Jenis sesi Tahfidz tidak valid.");
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(input.role)) {
    throw new Error("Role tidak dapat membaca sesi Tahfidz.");
  }

  const params = new URLSearchParams({
    select: "id,kind,student_id,halaqah_id,teacher_user_id,exam_type,juz_start,juz_end,scheduled_at,duration_minutes,focus,status,score,outcome,notes,completed_at,created_at",
    tenant_id: "eq." + input.tenantId,
    kind: "eq." + input.kind,
    order: "scheduled_at.asc,id.asc",
    limit: String(TAHFIDZ_SESSION_PAGE_SIZE + 1),
  });
  const cursor = decodeTahfidzSessionCursor(input.cursor);
  if (input.role === "Ustadz") {
    const ids = [...new Set(input.halaqahIds || [])];
    if (!ids.length) return null;
    if (ids.some((id) => !isUuid(id))) throw new Error("Cakupan halaqah tidak valid.");
    params.set("halaqah_id", "in.(" + ids.join(",") + ")");
  } else if (input.role === "Santri" || input.role === "Walisantri") {
    const ids = [...new Set(input.studentIds || [])];
    if (!ids.length) return null;
    if (ids.some((id) => !isUuid(id))) throw new Error("Cakupan santri tidak valid.");
    params.set("student_id", "in.(" + ids.join(",") + ")");
  }

  if (cursor) params.set("or", "(scheduled_at.gt." + cursor.scheduledAt
    + ",and(scheduled_at.eq." + cursor.scheduledAt + ",id.gt." + cursor.id + "))");
  return params;
}
