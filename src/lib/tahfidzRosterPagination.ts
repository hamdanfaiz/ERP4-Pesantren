export const TAHFIDZ_ROSTER_PAGE_SIZE = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeTahfidzRosterCursor(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error("Kursor roster Tahfidz tidak valid.");
  }
  return value.toLowerCase();
}

export function normalizeTahfidzRosterSearch(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Pencarian roster Tahfidz tidak valid.");
  const search = value.trim();
  if (search.length > 80 || /[\u0000-\u001f\u007f]/.test(search)) {
    throw new Error("Pencarian roster Tahfidz tidak valid.");
  }
  return search || null;
}
