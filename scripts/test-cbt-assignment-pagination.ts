import assert from "node:assert/strict";
import {
  decodeCbtAdminAssignmentPageCursor,
  encodeCbtAdminAssignmentPageCursor,
  listSupabaseCbtAdminAssignmentPage,
  normalizeCbtAdminAssignmentPageQuery,
  SupabaseCbtError,
} from "../src/server/supabaseCbt";

const tenantId = "e1900000-0000-4000-8000-000000000009";
const otherTenantId = "e1900000-0000-4000-8000-000000000019";
const assignmentId = "e1900000-0000-4000-8000-000000000701";
const assignedAt = "2027-03-01T01:02:03.000Z";
const priorUrl = process.env.SUPABASE_URL;
const priorSecret = process.env.SUPABASE_SECRET_KEY;
const priorRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const priorFetch = globalThis.fetch;
process.env.SUPABASE_URL = "https://cbt-activity-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_fixture";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const filters = normalizeCbtAdminAssignmentPageQuery({ view: "results", limit: "50", search: "  Santri  " });
assert.equal(filters.pageSize, 50);
assert.equal(filters.view, "results");
assert.equal(filters.search, "Santri");
assert.equal(normalizeCbtAdminAssignmentPageQuery({ view: "monitor" }).pageSize, 50);
assert.equal(normalizeCbtAdminAssignmentPageQuery({ view: "monitor", limit: 100 }).pageSize, 100);
assert.equal(normalizeCbtAdminAssignmentPageQuery({ view: "results", search: "Ｓａｎｔｒｉ" }).search, "Santri");

for (const [label, input] of [
  ["missing view", {}],
  ["invalid view", { view: "admin" }],
  ["zero limit", { view: "results", limit: "0" }],
  ["oversized limit", { view: "results", limit: "101" }],
  ["non-numeric limit", { view: "results", limit: "50x" }],
  ["short search", { view: "results", search: "ab" }],
  ["long search", { view: "results", search: "x".repeat(101) }],
  ["non-text search", { view: "results", search: 123 }],
  ["malformed cursor", { view: "results", cursor: "not/valid" }],
] as const) {
  assert.throws(() => normalizeCbtAdminAssignmentPageQuery(input), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} is rejected before the assignment-page RPC`);
}

const cursor = encodeCbtAdminAssignmentPageCursor(tenantId, filters, {
  assigned_at: assignedAt, assignment_id: assignmentId,
});
assert.deepEqual(decodeCbtAdminAssignmentPageCursor(cursor, tenantId, filters), {
  assignedAt, assignmentId,
});
assert.ok(!cursor.includes("Santri"), "encrypted cursor does not expose search terms");
const tampered = cursor.slice(0, 20) + (cursor[20] === "A" ? "B" : "A") + cursor.slice(21);
assert.throws(() => decodeCbtAdminAssignmentPageCursor(tampered, tenantId, filters), (error: unknown) =>
  error instanceof SupabaseCbtError && error.status === 400,
"authenticated encryption rejects a modified cursor");

for (const [label, targetTenant, targetFilters] of [
  ["another tenant", otherTenantId, filters],
  ["changed search", tenantId, normalizeCbtAdminAssignmentPageQuery({ view: "results", search: "Guru" })],
  ["changed view", tenantId, normalizeCbtAdminAssignmentPageQuery({ view: "monitor" })],
  ["changed page size", tenantId, normalizeCbtAdminAssignmentPageQuery({ view: "results", limit: 25, search: "Santri" })],
] as const) {
  assert.throws(() => decodeCbtAdminAssignmentPageCursor(cursor, targetTenant, targetFilters), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} cannot reuse a cursor`);
}

const calls: Array<{ url: string; body?: any }> = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.includes("/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (url.includes("/rest/v1/rpc/list_cbt_admin_assignment_page")) {
    return new Response(JSON.stringify([
      {
        assigned_at: assignedAt, assignment_id: assignmentId, exam_title: "Ujian CBT",
        student_name: "Santri Uji", class_name: "Kelas VII", status: "completed",
        score: "100.00", passed: true, submitted_at: assignedAt, correct_count: 10, wrong_count: 0, blank_count: 0,
      },
      {
        assigned_at: "2027-02-28T01:02:03.000Z",
        assignment_id: "e1900000-0000-4000-8000-000000000702",
        exam_title: "Ujian CBT", student_name: "Santri Lain", class_name: "Kelas VII",
        status: "assigned", score: null, passed: null, submitted_at: null,
        correct_count: null, wrong_count: null, blank_count: null,
      },
    ]), { status: 200 });
  }
  throw new Error(`Unexpected test request: ${url}`);
}) as typeof fetch;

try {
  const page = await listSupabaseCbtAdminAssignmentPage(tenantId, { view: "results", limit: 1, search: "Santri" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].studentName, "Santri Uji");
  assert.equal(page.items[0].score, 100);
  assert.equal(page.items[0].className, "Kelas VII");
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assert.deepEqual(calls.at(-1)?.body, {
    p_tenant_id: tenantId,
    p_page_size: 2,
    p_view: "results",
    p_cursor_assigned_at: null,
    p_cursor_assignment_id: null,
    p_search: "Santri",
  });
  assert.ok(!JSON.stringify(page.items).includes("student_id"));
  assert.ok(!JSON.stringify(page.items).includes("nis"));
} finally {
  globalThis.fetch = priorFetch;
  if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = priorSecret;
  if (priorRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorRoleKey;
}

console.log("CBT assignment pagination: tenant/view-bound encrypted cursor, page mapping and input validation passed");
