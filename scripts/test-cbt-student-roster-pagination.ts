import assert from "node:assert/strict";
import {
  decodeCbtStudentPageCursor,
  encodeCbtStudentPageCursor,
  listSupabaseCbtAdminStudentPage,
  normalizeCbtStudentPageQuery,
  SupabaseCbtError,
} from "../src/server/supabaseCbt";

const tenantId = "e1900000-0000-4000-8000-000000000009";
const otherTenantId = "e1900000-0000-4000-8000-000000000019";
const firstStudentId = "e1900000-0000-4000-8000-000000000701";
const secondStudentId = "e1900000-0000-4000-8000-000000000702";

const priorUrl = process.env.SUPABASE_URL;
const priorSecret = process.env.SUPABASE_SECRET_KEY;
const priorRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const priorFetch = globalThis.fetch;
process.env.SUPABASE_URL = "https://cbt-roster-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_fixture";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;


const normalized = normalizeCbtStudentPageQuery({ limit: "50", search: "  Santri  " });
assert.equal(normalized.pageSize, 50, "page size is explicit");
assert.equal(normalized.search, "Santri", "search is trimmed before cursor binding");
assert.equal(normalizeCbtStudentPageQuery({}).pageSize, 50, "default page size is 50");
assert.equal(normalizeCbtStudentPageQuery({ limit: "100" }).pageSize, 100, "limit accepts its maximum");
assert.equal(normalizeCbtStudentPageQuery({ search: "Ａ％＿" }).search, "A%_", "search is normalized with NFKC before query binding");

for (const [label, input] of [
  ["zero limit", { limit: "0" }],
  ["oversized limit", { limit: "101" }],
  ["non-numeric limit", { limit: "50x" }],
  ["short search", { search: "ab" }],
  ["long search", { search: "x".repeat(101) }],
  ["non-text search", { search: 123 }],
  ["malformed cursor alphabet", { cursor: "not/valid" }],
] as const) {
  assert.throws(() => normalizeCbtStudentPageQuery(input), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} is rejected before the roster RPC`);
}

const cursor = encodeCbtStudentPageCursor(tenantId, normalized, {
  id: firstStudentId, name: "Santri A",
});
assert.deepEqual(decodeCbtStudentPageCursor(cursor, tenantId, normalized), {
  name: "Santri A", id: firstStudentId,
}, "cursor round-trips the stable name and ID keyset");
assert.ok(!cursor.includes("Santri A"), "cursor encryption does not expose student names in URL or logs");
const tamperedCursor = cursor.slice(0, 12) + (cursor[12] === "A" ? "B" : "A") + cursor.slice(13);
assert.throws(() => decodeCbtStudentPageCursor(tamperedCursor, tenantId, normalized), (error: unknown) =>
  error instanceof SupabaseCbtError && error.status === 400,
"authenticated encryption rejects a modified cursor");

for (const [label, targetTenant, filters] of [
  ["another tenant", otherTenantId, normalized],
  ["changed search", tenantId, normalizeCbtStudentPageQuery({ ...normalized, search: "Guru" })],
  ["changed page size", tenantId, normalizeCbtStudentPageQuery({ ...normalized, limit: "25" })],
] as const) {
  assert.throws(() => decodeCbtStudentPageCursor(cursor, targetTenant, filters), (error: unknown) =>
    error instanceof SupabaseCbtError && error.status === 400,
  `${label} cannot reuse a cursor`);
}
assert.throws(() => decodeCbtStudentPageCursor("e30", tenantId, normalized), (error: unknown) =>
  error instanceof SupabaseCbtError && error.status === 400,
  "a structurally incomplete cursor is rejected");

const calls: Array<{ url: string; body?: any }> = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.includes("/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (url.includes("/rest/v1/rpc/list_cbt_admin_student_page")) {
    return new Response(JSON.stringify([
      { id: firstStudentId, name: "Santri A", grade: "VII", class_name: "Kelas VII A" },
      { id: secondStudentId, name: "Santri B", grade: "VII", class_name: "Kelas VII A" },
    ]), { status: 200 });
  }
  throw new Error(`Unexpected test request: ${url}`);
}) as typeof fetch;

try {
  const page = await listSupabaseCbtAdminStudentPage(tenantId, { limit: "1", search: "Santri" });
  assert.equal(page.items.length, 1, "service returns the requested number of rows");
  assert.equal(page.items[0].className, "Kelas VII A", "service maps the tenant class label");
  assert.equal(page.hasMore, true, "one look-ahead row advertises a next page");
  assert.ok(page.nextCursor, "a next page includes a cursor");
  assert.deepEqual(calls.at(-1)?.body, {
    p_tenant_id: tenantId,
    p_page_size: 2,
    p_cursor_name: null,
    p_cursor_id: null,
    p_search: "Santri",
  }, "service calls the bounded tenant RPC with a look-ahead row");
  assert.ok(!JSON.stringify(page.items).includes("nis"), "page response does not expose NIS");
} finally {
  globalThis.fetch = priorFetch;
  if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = priorSecret;
  if (priorRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorRoleKey;
}

console.log("CBT student roster pagination: encrypted cursor, tenant-scoped page and input validation passed");
