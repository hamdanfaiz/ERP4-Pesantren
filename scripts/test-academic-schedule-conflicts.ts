import assert from "node:assert/strict";
import { findAcademicScheduleConflicts } from "../src/lib/academicScheduleConflicts";
import { getSupabaseAcademicConflictSchedules, saveSupabaseAcademicRecord } from "../src/server/supabaseAcademic";

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
let overflowAcademicScan = false;
process.env.SUPABASE_URL = "https://academic-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  if (url.startsWith("https://academic-test.invalid/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "active" }]), { status: 200 });
  }
  if (url.startsWith("https://academic-test.invalid/rest/v1/academic_records?")) {
    const params = new URL(url).searchParams;
    assert.equal(params.get("tenant_id"), "eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(params.get("kind"), "eq.schedule");
    assert.equal(params.get("deleted_at"), "is.null");
    assert.equal(params.get("order"), "updated_at.desc,id.asc");
    if (overflowAcademicScan) {
      const offset = Number(params.get("offset") || 0);
      const limit = Number(params.get("limit") || 0);
      const count = Math.max(0, Math.min(limit, 5001 - offset));
      return new Response(JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `record-${offset + index}` }))), { status: 200 });
    }
    if (params.get("offset") !== "0") return new Response("[]", { status: 200 });
    return new Response(JSON.stringify([{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "schedule",
      teacher_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      student_id: null,
      record_data: { ...base, id: undefined, subject: "Matematika" },
      created_at: "2026-11-04T08:00:00.000Z",
      updated_at: "2026-11-04T08:00:00.000Z",
    }]), { status: 200 });
  }
  throw new Error("Unexpected external request in academic schedule validation test.");
};
try {
  await assert.rejects(
    getSupabaseAcademicConflictSchedules(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Ustadz",
      false,
      undefined,
      undefined,
    ),
    (error: any) => error?.status === 403,
  );
  assert.equal(requests.length, 0, "Role non-admin ditolak sebelum query tenant dilakukan.");
  const conflictScan = await getSupabaseAcademicConflictSchedules(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "Admin",
    false,
    undefined,
    undefined,
  );
  assert.equal(conflictScan.complete, true);
  assert.equal(conflictScan.scannedCount, 1);
  assert.equal(conflictScan.records[0].id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  assert.equal(conflictScan.records[0].subject, "Matematika");
  overflowAcademicScan = true;
  await assert.rejects(
    getSupabaseAcademicConflictSchedules(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "Admin",
      false,
      undefined,
      undefined,
    ),
    (error: any) => error?.status === 503 && error?.message.includes("batas aman"),
  );
  overflowAcademicScan = false;
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

