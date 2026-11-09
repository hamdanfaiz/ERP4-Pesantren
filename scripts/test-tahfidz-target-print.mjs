import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/pages/TahfidzManager.tsx", import.meta.url), "utf8");
const supabasePrintStart = source.indexOf("{isPrintPlanOpen && SUPABASE_TAHFIDZ_RUNTIME && printPlanStudent && (");
const legacyPrintStart = source.indexOf("{/* Printable Study Plan Modal */}", supabasePrintStart);
assert.ok(supabasePrintStart >= 0 && legacyPrintStart > supabasePrintStart, "Supabase print modal must be separate from the legacy sample modal");

const supabasePrintModal = source.slice(supabasePrintStart, legacyPrintStart);
for (const field of [
  "printPlanStudent.name",
  "printPlanStudent.nis",
  "printPlanStudent.grade",
  "printPlanStudent.halaqah",
  "printPlanStudent.target.ziyadahPagesPerDay",
  "printPlanStudent.target.murojaahPagesPerDay",
  "records.filter((record) => String(record.studentId) === String(printPlanStudent.id))",
  "paling banyak lima catatan yang sudah dimuat",
]) {
  assert.ok(supabasePrintModal.includes(field), `Supabase study plan must use and disclose ${field}`);
}

for (const sample of ["Muhammad Ali", "2023.01.001", "Ma'had Tahfizhul Qur'an", "Jl. Pahlawan No. 123", "Semester Ganjil 2026/2027"]) {
  assert.ok(!supabasePrintModal.includes(sample), `Supabase study plan must not expose legacy sample ${sample}`);
}

assert.match(source, /const printPlanStudent = santriList\.find\(\(student\) => String\(student\.id\) === printPlanStudentId\) \|\| null/);
assert.match(source, /\{isPrintPlanOpen && !SUPABASE_TAHFIDZ_RUNTIME && \(/, "Legacy sample print modal must remain unavailable in Supabase runtime");
assert.ok(/setIsPrintPlanOpen\(false\);\s*setPrintPlanStudentId\(""\);[\s\S]*?\}, \[user\?\.tenantId, user\?\.uid\]\)/.test(source), "Tenant or user changes must clear print selection");

console.log("Tahfidz study-plan print checks passed: tenant roster data, persisted target, loaded-record disclosure, and legacy sample isolation.");
