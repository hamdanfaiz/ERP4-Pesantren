import assert from "node:assert/strict";
import { createAlumniClientRequestId, getStableAlumniRequestIdentity, isAlumniGraduationCandidate, submitAlumniGraduation } from "../src/lib/alumniWorkflow";
import { tenantDate } from "../src/lib/tenantTimeZone";

assert.equal(isAlumniGraduationCandidate("Active", false), true);
assert.equal(isAlumniGraduationCandidate("Inactive", false), true);
assert.equal(isAlumniGraduationCandidate(" Alumni ", false), true, "legacy Alumni status remains available for completing its profile");
assert.equal(isAlumniGraduationCandidate("Archived", false), false);
assert.equal(isAlumniGraduationCandidate("archived", false), false, "archived status is case-insensitive");
assert.equal(isAlumniGraduationCandidate("Alumni", true), false, "students already linked to an Alumni profile are not offered twice");

let generated = 0;
const createId = () => `request-${++generated}`;
const first = getStableAlumniRequestIdentity(null, '["student-1","2026-06-30"]', createId);
const retry = getStableAlumniRequestIdentity(first, '["student-1","2026-06-30"]', createId);
const changedDate = getStableAlumniRequestIdentity(retry, '["student-1","2026-07-01"]', createId);
const changedStudent = getStableAlumniRequestIdentity(changedDate, '["student-2","2026-07-01"]', createId);

assert.equal(retry.requestId, first.requestId, "same graduation payload reuses the idempotency key after an uncertain response");
assert.notEqual(changedDate.requestId, first.requestId, "a changed graduation date receives a new key");
assert.notEqual(changedStudent.requestId, changedDate.requestId, "a changed student receives a new key");
assert.equal(generated, 3);
assert.throws(() => getStableAlumniRequestIdentity(null, "", createId));

let saved = 0;
let refreshed = 0;
const savedAndRefreshed = await submitAlumniGraduation(
  async () => { saved += 1; },
  async () => { refreshed += 1; },
);
assert.deepEqual(savedAndRefreshed, { saved: true, refreshed: true });
assert.equal(saved, 1);
assert.equal(refreshed, 1);

const savedButRefreshFailed = await submitAlumniGraduation(
  async () => { saved += 1; },
  async () => { throw new Error("refresh unavailable"); },
);
assert.deepEqual(savedButRefreshFailed, { saved: true, refreshed: false },
  "a refresh failure after a successful save must not look like a failed graduation");

let refreshedAfterFailedSave = false;
await assert.rejects(() => submitAlumniGraduation(
  async () => { throw new Error("save unavailable"); },
  async () => { refreshedAfterFailedSave = true; },
));
assert.equal(refreshedAfterFailedSave, false, "a failed save must not trigger a success refresh");

const yearBoundary = new Date("2026-12-31T17:30:00.000Z");
assert.equal(tenantDate(yearBoundary, "Asia/Jakarta"), "2027-01-01", "Alumni reporting follows the tenant's calendar year");
assert.equal(tenantDate(yearBoundary, "UTC"), "2026-12-31", "date boundaries differ correctly across tenant time zones");
assert.match(createAlumniClientRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

console.log("Alumni workflow logic tests passed (21 assertions).");

