import type { SupabaseStructureRecord } from "../services/masterDataApi";

const DISABLED_STATUSES = new Set(["inactive", "nonaktif", "disabled"]);

export function isActiveOnboardingStructure(record: Pick<SupabaseStructureRecord, "status">) {
  return !DISABLED_STATUSES.has(String(record.status || "Active").trim().toLowerCase());
}

export function getEligibleSupabaseOnboardingRooms(
  structures: SupabaseStructureRecord[],
  candidateGender: unknown
): SupabaseStructureRecord[] {
  if (candidateGender !== "L" && candidateGender !== "P") return [];

  const buildings = new Map(
    structures
      .filter((record) => record.category === "Gedung" && isActiveOnboardingStructure(record))
      .map((record) => [record.id, record])
  );

  return structures.filter((room) => {
    if (room.category !== "Kamar" || !isActiveOnboardingStructure(room)) return false;

    const capacity = Number(room.capacity);
    const occupied = Number(room.occupied ?? 0);
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(occupied) || occupied < 0 || occupied >= capacity) {
      return false;
    }

    const parentId = String(room.parentId || room.parentCode || "").trim();
    if (room.parentId && room.parentCode && room.parentId !== room.parentCode) return false;
    const building = parentId ? buildings.get(parentId) : undefined;
    if (parentId && !building) return false;

    const effectiveGender = room.gender || room.genderRestriction || building?.gender || building?.genderRestriction;
    return effectiveGender === candidateGender;
  });
}
