import assert from "node:assert/strict";
import { addCalendarDays, businessDateForInstant, isCalendarDate, tenantBusinessDate } from "../src/utils/businessDate";

const nearJakartaMidnight = new Date("2026-10-22T17:30:00.000Z");
assert.equal(tenantBusinessDate(nearJakartaMidnight, "Asia/Jakarta"), "2026-10-23");
assert.equal(tenantBusinessDate(nearJakartaMidnight, "Asia/Makassar"), "2026-10-23");
assert.equal(tenantBusinessDate(nearJakartaMidnight, "America/Los_Angeles"), "2026-10-22");
assert.equal(businessDateForInstant("2026-10-22T17:30:00.000Z", "Asia/Jakarta"), "2026-10-23", "transaction instants use the tenant calendar date");
assert.equal(businessDateForInstant("2026-10-22T17:30:00.000Z", "America/Los_Angeles"), "2026-10-22", "the same instant can belong to a different tenant-local day");
assert.throws(() => businessDateForInstant("invalid", "Asia/Jakarta"), RangeError);

assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29", "calendar offsets preserve leap days");
assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01", "calendar offsets cross year boundaries");
assert.equal(addCalendarDays("2026-10-23", 14), "2026-11-06");
assert.equal(isCalendarDate("2024-02-29"), true, "leap-day input is accepted");
assert.equal(isCalendarDate("2026-02-29"), false, "invalid dates are rejected rather than normalized");
assert.throws(() => addCalendarDays("not-a-date", 1), RangeError);

console.log("tenant business date: 12 cases passed");

