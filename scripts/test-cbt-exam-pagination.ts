import assert from "node:assert/strict";
import {
  decodeCbtAdminExamPageCursor,
  encodeCbtAdminExamPageCursor,
  listSupabaseCbtAdminExamPage,
  normalizeCbtAdminExamPageQuery,
  SupabaseCbtError,
} from "../src/server/supabaseCbt";

const tenantId = "e2600000-0000-4000-8000-000000000001";
const otherTenantId = "e2600000-0000-4000-8000-000000000002";
const examId = "e2600000-0000-4000-8004-000000000001";
const startsAt = "2027-03-20T08:00:00.000Z";
const range = { startsAtFrom: "2027-03-01T00:00:00.000Z", startsAtUntil: "2027-04-01T00:00:00.000Z" };
const priorUrl = process.env.SUPABASE_URL;
const priorSecret = process.env.SUPABASE_SECRET_KEY;
const priorRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const priorFetch = globalThis.fetch;
process.env.SUPABASE_URL = "https://cbt-exam-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_fixture";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const filters = normalizeCbtAdminExamPageQuery({ limit: "50", ...range });
assert.equal(filters.pageSize, 50);
assert.equal(filters.startsAtFrom, range.startsAtFrom);
assert.equal(normalizeCbtAdminExamPageQuery({ limit: 100 }).pageSize, 100);

for (const input of [
  { limit: 0 }, { limit: 101 }, { limit: "50x" }, { cursor: "bad/cursor" },
  { startsAtFrom: range.startsAtFrom },
  { startsAtFrom: range.startsAtUntil, startsAtUntil: range.startsAtFrom },
  { startsAtFrom: "2027-01-01T00:00:00Z", startsAtUntil: "2027-03-01T00:00:00Z" },
  { startsAtFrom: "2027-02-30T00:00:00Z", startsAtUntil: range.startsAtUntil },
]) {
  assert.throws(() => normalizeCbtAdminExamPageQuery(input), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
    `invalid exam page query ${JSON.stringify(input)} is rejected`,
  );
}

const firstCursor = encodeCbtAdminExamPageCursor(tenantId, filters, { id: examId, starts_at: startsAt });
assert.deepEqual(decodeCbtAdminExamPageCursor(firstCursor, tenantId, filters), { startsAt, examId });
assert.ok(!firstCursor.includes("2027-03"), "cursor does not expose schedule fields");
assert.throws(() => decodeCbtAdminExamPageCursor(firstCursor, otherTenantId, filters), (error: unknown) => error instanceof SupabaseCbtError && error.status === 400);
assert.throws(() => decodeCbtAdminExamPageCursor(firstCursor, tenantId, normalizeCbtAdminExamPageQuery({ limit: 50 })), (error: unknown) => error instanceof SupabaseCbtError && error.status === 400);

const calls: Array<{ url: string; body?: any }> = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.includes("/rest/v1/tenants?")) return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  if (url.includes("/rest/v1/rpc/list_cbt_admin_exam_page")) return new Response(JSON.stringify([
    { id: examId, title: "Ujian CBT", subject: "Matematika", grade: "Kelas VII", starts_at: startsAt, ends_at: "2027-03-20T09:00:00.000Z", duration_minutes: 60, passing_score: "75.00", status: "published", assigned_count: "1200", completed_count: "900" },
    { id: "e2600000-0000-4000-8004-000000000002", title: "Ujian berikutnya", subject: "IPA", grade: "Kelas VIII", starts_at: "2027-03-19T08:00:00.000Z", ends_at: "2027-03-19T09:00:00.000Z", duration_minutes: 60, passing_score: "75.00", status: "draft", assigned_count: "0", completed_count: "0" },
  ]), { status: 200 });
  throw new Error(`Unexpected test request: ${url}`);
}) as typeof fetch;

try {
  const page = await listSupabaseCbtAdminExamPage(tenantId, { limit: 1, ...range });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, examId);
  assert.equal(page.items[0].assignedCount, 1200);
  assert.equal(page.items[0].completedCount, 900);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assert.deepEqual(calls.at(-1)?.body, {
    p_tenant_id: tenantId, p_page_size: 2, p_cursor_starts_at: null, p_cursor_exam_id: null,
    p_starts_at_from: range.startsAtFrom, p_starts_at_until: range.startsAtUntil,
  });
  assert.throws(() => decodeCbtAdminExamPageCursor(page.nextCursor!, tenantId, normalizeCbtAdminExamPageQuery({ limit: 1, startsAtFrom: range.startsAtFrom, startsAtUntil: "2027-05-01T00:00:00.000Z" })), (error: unknown) => error instanceof SupabaseCbtError && error.status === 400,
    "calendar cursors cannot be replayed with another month");
} finally {
  globalThis.fetch = priorFetch;
  if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = priorSecret;
  if (priorRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorRoleKey;
}

console.log("CBT exam pagination: bounded tenant page, encrypted cursor, date window and validation passed");
