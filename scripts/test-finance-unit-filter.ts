import assert from "node:assert/strict";
import {
  FINANCE_ALL_UNITS,
  FINANCE_UNASSIGNED_UNIT,
  filterFinanceRowsByUnit,
  getFinanceUnitFilterOptions,
} from "../src/lib/financeUnitFilter";

const rows = [
  { id: "bill-1", unitId: "unit-a", unitName: "Madrasah" },
  { id: "expense-1", unitId: "unit-b", unitName: "Asrama" },
  { id: "ledger-legacy", unitId: null, unitName: "Unit lama / belum dipetakan" },
  { id: "bill-inactive", unitId: "unit-inactive", unitName: "Unit lama" },
];

assert.deepEqual(filterFinanceRowsByUnit(rows, FINANCE_ALL_UNITS), rows, "Semua unit includes current and legacy records");
assert.deepEqual(filterFinanceRowsByUnit(rows, "unit-a").map((row) => row.id), ["bill-1"], "a unit filter returns only rows assigned to that unit");
assert.deepEqual(filterFinanceRowsByUnit(rows, FINANCE_UNASSIGNED_UNIT).map((row) => row.id), ["ledger-legacy"], "unassigned legacy rows have a dedicated filter");

const options = getFinanceUnitFilterOptions([{ id: "unit-a", name: "Madrasah", code: "MDR" }], rows);
assert.deepEqual(options.map((option) => option.id), [FINANCE_ALL_UNITS, "unit-a", "unit-b", "unit-inactive", FINANCE_UNASSIGNED_UNIT]);
assert.match(options.find((option) => option.id === "unit-b")?.label || "", /tidak aktif/);
assert.match(options.find((option) => option.id === FINANCE_UNASSIGNED_UNIT)?.label || "", /1/);

console.log("Finance unit filter checks passed.");
