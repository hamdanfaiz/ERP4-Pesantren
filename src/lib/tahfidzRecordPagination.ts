import { Buffer } from "node:buffer";

export const TAHFIDZ_RECORD_PAGE_SIZE = 100;

export type TahfidzRecordCursor = {
  performedAt: string;
  id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function encodeTahfidzRecordCursor(cursor: TahfidzRecordCursor): string {
  if (!TIMESTAMP_PATTERN.test(cursor.performedAt) || !Number.isFinite(Date.parse(cursor.performedAt)) || !isUuid(cursor.id)) {
    throw new Error("Posisi riwayat Tahfidz tidak valid.");
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTahfidzRecordCursor(value: unknown): TahfidzRecordCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Kursor riwayat Tahfidz tidak valid.");
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<TahfidzRecordCursor>;
    if (!parsed || typeof parsed.performedAt !== "string" || typeof parsed.id !== "string"
      || !TIMESTAMP_PATTERN.test(parsed.performedAt) || !Number.isFinite(Date.parse(parsed.performedAt))
      || !isUuid(parsed.id) || encodeTahfidzRecordCursor(parsed as TahfidzRecordCursor) !== value) {
      throw new Error("invalid cursor payload");
    }
    return { performedAt: parsed.performedAt, id: parsed.id };
  } catch {
    throw new Error("Kursor riwayat Tahfidz tidak valid.");
  }
}

export function buildTahfidzRecordPageParams(input: {
  tenantId: string;
  role: string;
  halaqahIds?: string[];
  studentIds?: string[];
  cursor?: unknown;
}): URLSearchParams | null {
  if (!isUuid(input.tenantId)) throw new Error("Tenant Tahfidz tidak valid.");
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(input.role)) {
    throw new Error("Role tidak dapat membaca riwayat Tahfidz.");
  }

  const params = new URLSearchParams({
    select: "id,student_id,halaqah_id,activity_type,surah_name,ayah_start,ayah_end,fluency_grade,tajweed_grade,notes,performed_at,recorded_by_name",
    tenant_id: "eq." + input.tenantId,
    order: "performed_at.desc,id.desc",
    limit: String(TAHFIDZ_RECORD_PAGE_SIZE + 1),
  });

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

  const cursor = decodeTahfidzRecordCursor(input.cursor);
  if (cursor) {
    params.set("or", "(performed_at.lt." + cursor.performedAt
      + ",and(performed_at.eq." + cursor.performedAt + ",id.lt." + cursor.id + "))");
  }
  return params;
}
