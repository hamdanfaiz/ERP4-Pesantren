export const FINANCE_ALL_UNITS = "__all__";
export const FINANCE_UNASSIGNED_UNIT = "__unassigned__";

export type FinanceUnitRecord = {
  unitId?: string | null;
  unitName?: string | null;
};

export type FinanceUnitOption = {
  id: string;
  label: string;
};

export function filterFinanceRowsByUnit<T extends FinanceUnitRecord>(rows: T[], selectedUnitId: string): T[] {
  if (selectedUnitId === FINANCE_ALL_UNITS) return rows;
  if (selectedUnitId === FINANCE_UNASSIGNED_UNIT) return rows.filter((row) => !row.unitId);
  return rows.filter((row) => row.unitId === selectedUnitId);
}

export function getFinanceUnitFilterOptions(
  units: Array<{ id: string; name: string; code: string }>,
  records: FinanceUnitRecord[],
): FinanceUnitOption[] {
  const options: FinanceUnitOption[] = [
    { id: FINANCE_ALL_UNITS, label: "Semua unit" },
    ...units.map((unit) => ({ id: unit.id, label: `${unit.name} · ${unit.code}` })),
  ];
  const knownIds = new Set(units.map((unit) => unit.id));
  const unavailable = new Map<string, string>();
  for (const row of records) {
    const id = String(row.unitId || "");
    if (id && !knownIds.has(id)) unavailable.set(id, String(row.unitName || "Unit tidak tersedia"));
  }
  for (const [id, name] of [...unavailable.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    options.push({ id, label: `${name} · tidak aktif` });
  }

  const unassignedCount = records.filter((row) => !row.unitId).length;
  if (unassignedCount > 0) {
    options.push({ id: FINANCE_UNASSIGNED_UNIT, label: `Belum dipetakan (${unassignedCount})` });
  }
  return options;
}
