const SEARCH_PATTERN = /[%_\\\u0000-\u001f\u007f]/u;

export const ACADEMIC_CLASS_PAGE_SIZE = 100;

export type AcademicClassCursor = {
  name: string;
  id: string;
  search: string;
  scope: string;
};

function validCursor(value: unknown): value is AcademicClassCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<AcademicClassCursor>;
  return typeof cursor.name === "string" && cursor.name.length <= 180 && !/[\u0000-\u001f\u007f]/u.test(cursor.name)
    && typeof cursor.id === "string" && cursor.id.length > 0 && cursor.id.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(cursor.id)
    && typeof cursor.search === "string" && cursor.search.length <= 80 && !SEARCH_PATTERN.test(cursor.search)
    && typeof cursor.scope === "string" && cursor.scope.length <= 300;
}

export function normalizeAcademicClassSearch(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error("Pencarian kelas Akademik tidak valid.");
  const search = value.trim().replace(/\s+/g, " ").normalize("NFC");
  if (search.length > 80 || SEARCH_PATTERN.test(search)) {
    throw new Error("Pencarian kelas maksimal 80 karakter dan tidak boleh berisi karakter kontrol atau wildcard.");
  }
  return search;
}

export function encodeAcademicClassCursor(cursor: AcademicClassCursor): string {
  if (!validCursor(cursor)) throw new Error("Kursor kelas Akademik tidak valid.");
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAcademicClassCursor(value: unknown, expected: { search: string; scope: string }): AcademicClassCursor | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 1024) throw new Error("Kursor kelas Akademik tidak valid.");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!validCursor(cursor) || cursor.search !== expected.search || cursor.scope !== expected.scope) throw new Error("invalid cursor scope");
    return cursor;
  } catch {
    throw new Error("Kursor kelas Akademik tidak valid atau tidak cocok dengan filter saat ini.");
  }
}
