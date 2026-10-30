import assert from "node:assert/strict";
import { selectCurrentTahfidzMemberships } from "../src/lib/tahfidzMembership";

const memberships = [
  { id: "starts-today", student_id: "student-a", halaqah_id: "halaqah-a", starts_on: "2026-10-25", ends_on: null, status: "active" },
  { id: "future", student_id: "student-b", halaqah_id: "halaqah-b", starts_on: "2026-10-26", ends_on: null, status: "active" },
  { id: "ends-today", student_id: "student-c", halaqah_id: "halaqah-c", starts_on: "2026-09-01", ends_on: "2026-10-25", status: "active" },
  { id: "expired", student_id: "student-d", halaqah_id: "halaqah-d", starts_on: "2026-09-01", ends_on: "2026-10-24", status: "active" },
  { id: "ended-status", student_id: "student-e", halaqah_id: "halaqah-e", starts_on: "2026-09-01", ends_on: null, status: "ended" },
  { id: "invalid-start", student_id: "student-f", halaqah_id: "halaqah-f", starts_on: "2026-02-30", ends_on: null, status: "active" },
  { id: "invalid-end", student_id: "student-g", halaqah_id: "halaqah-g", starts_on: "2026-09-01", ends_on: "2026-10-2x", status: "active" },
];

const current = selectCurrentTahfidzMemberships(memberships, "2026-10-25");
assert.deepEqual(current.map((membership) => membership.id), ["starts-today", "ends-today"]);
assert.deepEqual(selectCurrentTahfidzMemberships(memberships, "2026-02-30"), []);
console.log("Tahfidz membership date checks passed (7 fixtures, 2 active on business date).");
