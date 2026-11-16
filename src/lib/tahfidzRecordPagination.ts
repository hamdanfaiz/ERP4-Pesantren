import { Buffer } from "node:buffer";
import { TAHFIDZ_RECORD_MAX_PAGE_SIZE, TAHFIDZ_RECORD_PAGE_SIZE } from "./tahfidzRecordPaginationConstants";

export { TAHFIDZ_RECORD_MAX_PAGE_SIZE, TAHFIDZ_RECORD_PAGE_SIZE } from "./tahfidzRecordPaginationConstants";

export type TahfidzRecordCursor = {
  performedAt: string;
  id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const calendarDate = value.slice(0, 10);
  const parsedDate = new Date(`${calendarDate}T00:00:00.000Z`);
  return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === calendarDate;
}

export function encodeTahfidzRecordCursor(cursor: TahfidzRecordCursor): string {
  if (!isValidTimestamp(cursor.performedAt) || !isUuid(cursor.id)) {
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
      || !isValidTimestamp(parsed.performedAt)
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
  pageSize?: number;
  from?: unknown;
  to?: unknown;
}): URLSearchParams | null {
  if (!isUuid(input.tenantId)) throw new Error("Tenant Tahfidz tidak valid.");
  if (!["Admin", "SuperAdmin", "Ustadz", "Santri", "Walisantri"].includes(input.role)) {
    throw new Error("Role tidak dapat membaca riwayat Tahfidz.");
  }
  const pageSize = input.pageSize ?? TAHFIDZ_RECORD_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > TAHFIDZ_RECORD_MAX_PAGE_SIZE) {
    throw new Error("Ukuran halaman riwayat Tahfidz tidak valid.");
  }
  const from = input.from == null || input.from === "" ? null : input.from;
  const to = input.to == null || input.to === "" ? null : input.to;
  if ((from === null) !== (to === null)) throw new Error("Rentang tanggal laporan Tahfidz tidak lengkap.");
  if (from !== null || to !== null) {
    if (typeof from !== "string" || typeof to !== "string"
      || !isValidTimestamp(from) || !isValidTimestamp(to)
      || Date.parse(from) >= Date.parse(to)) {
      throw new Error("Rentang tanggal laporan Tahfidz tidak valid.");
    }
  }

  const params = new URLSearchParams({
    select: "id,student_id,halaqah_id,activity_type,surah_name,ayah_start,ayah_end,fluency_grade,tajweed_grade,notes,performed_at,recorded_by_name",
    tenant_id: "eq." + input.tenantId,
    order: "performed_at.desc,id.desc",
    limit: String(pageSize + 1),
  });

  if (from !== null && to !== null) {
    params.set("and", `(performed_at.gte.${from},performed_at.lt.${to})`);
  }

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

