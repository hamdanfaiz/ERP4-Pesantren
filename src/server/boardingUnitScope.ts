import { SupabaseOnboardingError } from "./supabaseOnboarding";

type Structure = Record<string, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ustadz boarding access always needs a trusted, active unit from the server-side profile. */
export function requireBoardingUnitId(value: unknown): string {
  const unitId = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(unitId)) throw new SupabaseOnboardingError(403, "Profil Ustadz belum memiliki unit organisasi aktif.");
  return unitId;
}

/** Unmapped historical locations remain Admin-only until the source unit is known. */
export function filterBoardingStructuresByUnit<T extends Structure>(structures: T[], unitId: string): T[] {
  const byId = new Map(structures.map((row) => [String(row.id), row] as const));
  return structures.filter((row) => {
    if (String(row.organization_unit_id || "") !== unitId) return false;
    if (row.category !== "Kamar" || !row.parent_id) return true;
    const building = byId.get(String(row.parent_id));
    if (!building || building.category !== "Gedung"
      || ["inactive", "nonaktif", "tidak aktif", "disabled"].includes(String(building.status || "").trim().toLowerCase())) return false;
    return String(building.organization_unit_id || "") === unitId;
  });
}

/** Unmapped historical students stay visible to tenant admins, but never to an Ustadz. */
export function isBoardingStudentInUnit(student: Structure, unitId: string): boolean {
  return String(student.organization_unit_id || "") === unitId;
}
