import assert from "node:assert/strict";
import {
  ACADEMIC_ROSTER_PAGE_SIZE,
  decodeAcademicRosterCursor,
  encodeAcademicRosterCursor,
  normalizeAcademicRosterSearch,
} from "../src/lib/academicRosterPagination";
import { getSupabaseAcademicRosterPage } from "../src/server/supabaseAcademic";

const tenantId = "a1111111-1111-4111-8111-111111111111";
const actorId = "a2222222-2222-4222-8222-222222222222";
const otherActorId = "a3333333-3333-4333-8333-333333333333";
const unitId = "a4444444-4444-4444-8444-444444444444";
const scope = `${tenantId}:${actorId}:ustadz:all`;
const cursor = { name: "santri alfa", id: "a5555555-5555-4555-8555-555555555555", search: "santri", scope };

assert.equal(ACADEMIC_ROSTER_PAGE_SIZE, 50);
assert.equal(normalizeAcademicRosterSearch("  Santri   Alfa "), "Santri Alfa");
assert.throws(() => normalizeAcademicRosterSearch("%admin"), /hanya dapat berisi/);
assert.throws(() => normalizeAcademicRosterSearch("a".repeat(81)), /maksimal 80/);
assert.deepEqual(decodeAcademicRosterCursor(encodeAcademicRosterCursor(cursor), { search: "santri", scope }), cursor);
assert.throws(() => decodeAcademicRosterCursor(encodeAcademicRosterCursor(cursor), { search: "wali", scope }), /tidak cocok/);
assert.throws(() => decodeAcademicRosterCursor(encodeAcademicRosterCursor(cursor), { search: "santri", scope: `${tenantId}:${otherActorId}:ustadz:all` }), /tidak cocok/);

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; body: any }> = [];
process.env.SUPABASE_URL = "https://academic-roster-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://academic-roster-test.invalid/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (url === "https://academic-roster-test.invalid/rest/v1/rpc/get_tenant_academic_roster_page") {
    const body = JSON.parse(String(init?.body || "{}"));
    requests.push({ url, body });
    if (!body.p_after_id) {
      const students = Array.from({ length: ACADEMIC_ROSTER_PAGE_SIZE }, (_, index) => ({
        id: `b${String(index + 1).padStart(7, "0")}-1111-4111-8111-111111111111`,
        name: `Santri ${String(index + 1).padStart(2, "0")}`,
        nis: `927000${String(index).padStart(4, "0")}`,
        className: "VII-A",
        organizationUnitId: null,
      }));
      const last = students[students.length - 1];
      return new Response(JSON.stringify({
        success: true,
        students,
        classes: [{ id: "CLASS-A", name: "VII-A", organizationUnitId: null }],
        hasMore: true,
        nextCursor: { name: last.name.toLocaleLowerCase("id-ID"), id: last.id },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      success: true,
      students: [{ id: "b9999999-1111-4111-8111-111111111111", name: "Santri Berikutnya", nis: "9270009999", className: "VII-A", organizationUnitId: unitId }],
      classes: [{ id: "CLASS-A", name: "VII-A", organizationUnitId: unitId }],
      hasMore: false,
      nextCursor: null,
    }), { status: 200 });
  }
  throw new Error(`Permintaan tidak diharapkan: ${url}`);
};

try {
  const firstPage = await getSupabaseAcademicRosterPage(tenantId, actorId, "Ustadz", false, undefined, undefined, "Santri");
  assert.equal(firstPage.students.length, 50);
  assert.equal(firstPage.hasMore, true);
  assert.equal("classes" in firstPage, false, "class choices are loaded from their searchable page endpoint");
  assert.ok(firstPage.nextCursor);
  assert.equal(requests[0].body.p_tenant_id, tenantId);
  assert.equal(requests[0].body.p_actor_user_id, actorId);
  assert.equal(requests[0].body.p_expected_role, "ustadz");
  assert.equal(requests[0].body.p_search, "Santri");
  assert.equal(requests[0].body.p_unit_mode, "all");
  assert.equal(requests[0].body.p_after_id, null);

  const secondPage = await getSupabaseAcademicRosterPage(tenantId, actorId, "Ustadz", false, undefined, undefined, "Santri", firstPage.nextCursor);
  assert.equal(secondPage.students.length, 1);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(requests[1].body.p_after_id, firstPage.students[49].id);
  assert.equal(requests[1].body.p_after_name, "santri 50");
  assert.equal(requests.some((request) => request.url.includes("/students?")), false, "roster uses only the guarded RPC, never an unbounded REST list");

  const requestCount = requests.length;
  await assert.rejects(
    getSupabaseAcademicRosterPage(tenantId, actorId, "Ustadz", false, undefined, undefined, "Wali", firstPage.nextCursor),
    (error: any) => error?.status === 400 && error.message.includes("tidak cocok"),
  );
  await assert.rejects(
    getSupabaseAcademicRosterPage(tenantId, actorId, "Santri", false, undefined, undefined, "Santri"),
    (error: any) => error?.status === 403,
  );
  assert.equal(requests.length, requestCount, "invalid cursor scope and non-manager roles never reach the roster RPC");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Academic roster pagination passed: scoped search, keyset cursor, tenant/actor binding, and bounded RPC response.");
