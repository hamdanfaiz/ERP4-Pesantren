const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s.'-]*$/u;

export const ACADEMIC_ROSTER_PAGE_SIZE = 50;

export type AcademicRosterCursor = {
  name: string;
  id: string;
  search: string;
  scope: string;
};

function validCursor(value: unknown): value is AcademicRosterCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<AcademicRosterCursor>;
  // The cursor name comes from PostgreSQL lower(name); its casing must not be
  // reinterpreted with the browser's locale before sending it back to SQL.
  return typeof cursor.name === "string" && cursor.name.length <= 180 && !/[\u0000-\u001f\u007f]/u.test(cursor.name)
    && typeof cursor.id === "string" && UUID_PATTERN.test(cursor.id)
    && typeof cursor.search === "string" && cursor.search.length <= 80 && SEARCH_PATTERN.test(cursor.search)
    && typeof cursor.scope === "string" && cursor.scope.length <= 300;
}

export function normalizeAcademicRosterSearch(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error("Pencarian roster Akademik tidak valid.");
  const search = value.trim().replace(/\s+/g, " ").normalize("NFC");
  if (search.length > 80 || !SEARCH_PATTERN.test(search)) throw new Error("Pencarian hanya dapat berisi huruf, angka, spasi, titik, petik, atau tanda hubung; maksimal 80 karakter.");
  return search;
}

export function encodeAcademicRosterCursor(cursor: AcademicRosterCursor): string {
  if (!validCursor(cursor)) throw new Error("Kursor roster Akademik tidak valid.");
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAcademicRosterCursor(value: unknown, expected: { search: string; scope: string }): AcademicRosterCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 1024) throw new Error("Kursor roster Akademik tidak valid.");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!validCursor(cursor) || cursor.search !== expected.search || cursor.scope !== expected.scope) throw new Error("invalid cursor scope");
    return cursor;
  } catch {
    throw new Error("Kursor roster Akademik tidak valid atau tidak cocok dengan filter saat ini.");
  }
}
