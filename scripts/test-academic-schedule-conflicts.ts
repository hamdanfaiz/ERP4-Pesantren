import assert from "node:assert/strict";
import { findAcademicScheduleConflicts } from "../src/lib/academicScheduleConflicts";
import { saveSupabaseAcademicRecord } from "../src/server/supabaseAcademic";

const base = {
  day: "Senin",
  time: "07:30 - 09:00",
  teacherUserId: "teacher-a",
  className: "VII-A",
  room: "Ruang 1",
  organizationUnitId: "unit-a",
};

const overlapping = findAcademicScheduleConflicts([
  { ...base, id: "one", subject: "Matematika" },
  { ...base, id: "two", time: "08:00 - 09:30", subject: "Bahasa Indonesia" },
]);
assert.equal(overlapping.conflicts.length, 1);
assert.deepEqual(overlapping.conflicts[0].reasons, ["Pengajar", "Ruang", "Kelas"]);
assert.equal(overlapping.conflicts[0].overlapStart, "08:00");
assert.equal(overlapping.conflicts[0].overlapEnd, "09:00");

const adjacent = findAcademicScheduleConflicts([
  { ...base, id: "one", time: "07:30 - 09:00" },
  { ...base, id: "two", time: "09:00 - 10:30" },
]);
assert.equal(adjacent.conflicts.length, 0);

const differentUnits = findAcademicScheduleConflicts([
  { ...base, id: "one", organizationUnitId: "unit-a" },
  { ...base, id: "two", organizationUnitId: "unit-b", time: "08:00 - 09:30" },
]);
assert.equal(differentUnits.conflicts.length, 0);

const unassignedConflicts = findAcademicScheduleConflicts([
  { ...base, id: "one", organizationUnitId: null },
  { ...base, id: "two", organizationUnitId: "unit-b", time: "08:00 - 09:30" },
]);
assert.equal(unassignedConflicts.conflicts.length, 1);

const separateResources = findAcademicScheduleConflicts([
  { ...base, id: "one", teacherUserId: "teacher-a", room: "Ruang 1", className: "VII-A" },
  { ...base, id: "two", teacherUserId: "teacher-b", room: "Ruang 2", className: "VII-B", time: "08:00 - 09:30" },
]);
assert.equal(separateResources.conflicts.length, 0);

const invalid = findAcademicScheduleConflicts([
  { ...base, id: "invalid-time", time: "09:00 - 07:30" },
  { ...base, id: "invalid-day", day: "Hari ke-8" },
]);
assert.deepEqual(invalid.invalidRecordIds, ["invalid-time", "invalid-day"]);

const threeWay = findAcademicScheduleConflicts([
  { ...base, id: "one" },
  { ...base, id: "two", time: "08:00 - 09:30" },
  { ...base, id: "three", time: "08:30 - 10:00" },
]);
assert.equal(threeWay.conflicts.length, 3);

const manyConflicts = findAcademicScheduleConflicts(Array.from({ length: 35 }, (_, index) => ({
  ...base,
  id: `many-${index}`,
  time: "07:30 - 09:00",
})));
assert.equal(manyConflicts.conflicts.length, 500);
assert.equal(manyConflicts.truncated, true);

const originalFetch = globalThis.fetch;
const requests: string[] = [];
process.env.SUPABASE_URL = "https://academic-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  if (url.startsWith("https://academic-test.invalid/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "active" }]), { status: 200 });
  }
  throw new Error("Unexpected external request in academic schedule validation test.");
};
try {
  await assert.rejects(
    saveSupabaseAcademicRecord(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Admin",
      "schedule",
      { day: "Senin", time: "07:30 - 09:00", subject: "Matematika", teacherName: "Pengajar", teacherUserId: "", className: "VII-A", clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    ),
    (error: any) => error?.status === 400 && error?.message.includes("Pengajar aktif wajib dipilih"),
  );
  assert.equal(requests.some((url) => url.includes("/rpc/save_academic_record")), false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Academic schedule conflict checks passed.");

