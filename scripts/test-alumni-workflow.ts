import assert from "node:assert/strict";
import { createAlumniClientRequestId, getStableAlumniRequestIdentity, isAlumniGraduationCandidate, submitAlumniGraduation } from "../src/lib/alumniWorkflow";
import { tenantDate, tenantLocalDateTimeToIso } from "../src/lib/tenantTimeZone";
import { normalizeAlumniCommunityEventPayload, normalizeAlumniTracerResponsePayload, SupabaseAlumniError } from "../src/server/supabaseAlumni";

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
assert.equal(tenantLocalDateTimeToIso("2027-06-01T10:00", "Asia/Jakarta"), "2027-06-01T03:00:00.000Z",
  "community event input is interpreted in the tenant timezone");
assert.equal(tenantLocalDateTimeToIso("2027-06-01T10:00", "America/Los_Angeles"), "2027-06-01T17:00:00.000Z",
  "community event time remains tenant-scoped when the browser is elsewhere");
assert.match(createAlumniClientRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

const communityEvent = normalizeAlumniCommunityEventPayload({
  clientRequestId: "e7400000-0000-4000-8000-000000000101",
  title: " Reuni Alumni ",
  eventType: "reunion",
  startsAt: "2027-06-01T03:00:00.000Z",
  location: " Aula Pesantren ",
  description: " Lintas angkatan ",
});
assert.deepEqual(communityEvent, {
  clientRequestId: "e7400000-0000-4000-8000-000000000101",
  title: "Reuni Alumni",
  eventType: "reunion",
  startsAt: "2027-06-01T03:00:00.000Z",
  location: "Aula Pesantren",
  description: "Lintas angkatan",
});
assert.throws(() => normalizeAlumniCommunityEventPayload({
  ...communityEvent,
  eventType: "acara bebas",
}), (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
"community event categories cannot be free-typed");
assert.throws(() => normalizeAlumniCommunityEventPayload({
  ...communityEvent,
  startsAt: "bukan tanggal",
}), (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
"invalid event dates are rejected before persistence");

const tracerResponse = normalizeAlumniTracerResponsePayload({
  clientRequestId: "e7400000-0000-4000-8000-000000000201",
  alumniProfileId: "e7400000-0000-4000-8000-000000000202",
  surveyYear: 2026,
  activityStatus: "working_and_studying",
  educationLevel: "bachelor",
  employmentSector: "education",
  consentConfirmed: true,
});
assert.deepEqual(tracerResponse, {
  clientRequestId: "e7400000-0000-4000-8000-000000000201",
  alumniProfileId: "e7400000-0000-4000-8000-000000000202",
  surveyYear: 2026,
  activityStatus: "working_and_studying",
  educationLevel: "bachelor",
  employmentSector: "education",
});
assert.throws(() => normalizeAlumniTracerResponsePayload({ ...tracerResponse, activityStatus: "I work at Example Co" }),
  (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
  "Tracer activity cannot be free-typed");
assert.throws(() => normalizeAlumniTracerResponsePayload({ ...tracerResponse, consentConfirmed: false }),
  (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
  "a response without confirmed consent is rejected");
assert.throws(() => normalizeAlumniTracerResponsePayload({ ...tracerResponse, educationLevel: "not_applicable" }),
  (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
  "study statuses require an education category");
assert.throws(() => normalizeAlumniTracerResponsePayload({ ...tracerResponse, employmentSector: "not_applicable" }),
  (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
  "work statuses require an employment sector");
assert.throws(() => normalizeAlumniTracerResponsePayload({ ...tracerResponse, surveyYear: 1800 }),
  (error: unknown) => error instanceof SupabaseAlumniError && error.status === 400,
  "Tracer survey years are bounded before persistence");

console.log("Alumni workflow, community event, and Tracer Study validation tests passed.");

