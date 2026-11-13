import assert from "node:assert/strict";
import {
  buildCbtCalendarGrid,
  cbtTenantMonthKey,
  groupCbtExamsByTenantDate,
  shiftCbtCalendarMonth,
} from "../src/lib/cbtCalendar";

const november = buildCbtCalendarGrid("2026-11", "Asia/Jakarta", "2026-11-15T04:00:00.000Z");
assert.equal(november.length, 42, "month grid always occupies six weeks");
assert.equal(november[0].date, "2026-10-26", "week starts on Monday");
assert.equal(november[0].inCurrentMonth, false, "leading days are marked as adjacent month");
assert.equal(november.find((day) => day.date === "2026-11-15")?.isToday, true, "today uses tenant calendar date");
assert.equal(november[41].date, "2026-12-06", "grid ends after six complete weeks");

const leapFebruary = buildCbtCalendarGrid("2024-02", "Asia/Jakarta", "2024-02-29T05:00:00.000Z");
assert.equal(leapFebruary.find((day) => day.date === "2024-02-29")?.inCurrentMonth, true, "leap day stays in February");
assert.equal(leapFebruary.find((day) => day.date === "2024-02-29")?.isToday, true, "leap day can be selected as today");

assert.equal(shiftCbtCalendarMonth("2026-12", 1), "2027-01", "next month crosses a year boundary");
assert.equal(shiftCbtCalendarMonth("2027-01", -1), "2026-12", "previous month crosses a year boundary");
assert.throws(() => shiftCbtCalendarMonth("2026-13", 1), RangeError, "invalid month keys are rejected");
assert.throws(() => shiftCbtCalendarMonth("0099-12", 1), RangeError, "unsupported early years are rejected");
assert.throws(() => shiftCbtCalendarMonth("2026-11", 0.5), RangeError, "fractional navigation is rejected");

const nearMidnight = "2026-10-31T17:30:00.000Z";
assert.equal(cbtTenantMonthKey(nearMidnight, "Asia/Jakarta"), "2026-11", "tenant timezone determines month boundary");
assert.equal(cbtTenantMonthKey(nearMidnight, "America/Los_Angeles"), "2026-10", "different tenant zones can show different months");

const schedules = groupCbtExamsByTenantDate([
  { id: "late", title: "Ujian Z", startsAt: "2026-11-01T03:00:00.000Z" },
  { id: "early", title: "Ujian A", startsAt: "2026-10-31T18:00:00.000Z" },
  { id: "invalid", title: "Tidak valid", startsAt: "not-a-date" },
], "Asia/Jakarta");
assert.deepEqual(schedules.get("2026-11-01")?.map((exam) => exam.id), ["early", "late"], "events group by tenant-local start date and sort by start time");
assert.equal(schedules.has(""), false, "invalid schedules are excluded rather than rendered on an empty date");

console.log("CBT tenant calendar: 16 assertions passed");

