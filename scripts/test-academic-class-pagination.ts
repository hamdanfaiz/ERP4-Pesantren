import assert from "node:assert/strict";
import {
  ACADEMIC_CLASS_PAGE_SIZE,
  decodeAcademicClassCursor,
  encodeAcademicClassCursor,
  normalizeAcademicClassSearch,
} from "../src/lib/academicClassPagination";
import { getSupabaseAcademicClassPage } from "../src/server/supabaseAcademic";

const tenantId = "a1111111-1111-4111-8111-111111111111";
const actorId = "a2222222-2222-4222-8222-222222222222";
const otherActorId = "a3333333-3333-4333-8333-333333333333";
const unitId = "a4444444-4444-4444-8444-444444444444";
const scope = `${tenantId}:${actorId}:admin:unit:${unitId}`;
const cursor = { name: "kelas 100", id: "CLASS-100", search: "Kelas", scope };

assert.equal(ACADEMIC_CLASS_PAGE_SIZE, 100);
assert.equal(normalizeAcademicClassSearch("  Kelas   VII "), "Kelas VII");
assert.throws(() => normalizeAcademicClassSearch("%admin"), /wildcard/);
assert.throws(() => normalizeAcademicClassSearch("a".repeat(81)), /maksimal 80/);
assert.deepEqual(decodeAcademicClassCursor(encodeAcademicClassCursor(cursor), { search: "Kelas", scope }), cursor);
assert.throws(() => decodeAcademicClassCursor(encodeAcademicClassCursor(cursor), { search: "VII", scope }), /tidak cocok/);
assert.throws(() => decodeAcademicClassCursor(encodeAcademicClassCursor(cursor), { search: "Kelas", scope: `${tenantId}:${otherActorId}:admin:unit:${unitId}` }), /tidak cocok/);

const originalFetch = globalThis.fetch;
const rpcRequests: Array<{ url: string; body: any }> = [];
process.env.SUPABASE_URL = "https://academic-class-test.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://academic-class-test.invalid/rest/v1/tenants?")) {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (url.startsWith("https://academic-class-test.invalid/rest/v1/organization_units?")) {
    return new Response(JSON.stringify([{ id: unitId }]), { status: 200 });
  }
  if (url === "https://academic-class-test.invalid/rest/v1/rpc/get_tenant_academic_class_page") {
    const body = JSON.parse(String(init?.body || "{}"));
    rpcRequests.push({ url, body });
    if (body.p_search === "Kelas" && !body.p_after_id) {
      const classes = Array.from({ length: ACADEMIC_CLASS_PAGE_SIZE }, (_, index) => ({
        id: `CLASS-${String(index + 1).padStart(3, "0")}`,
        name: `Kelas ${String(index + 1).padStart(3, "0")}`,
        organizationUnitId: unitId,
      }));
      return new Response(JSON.stringify({
        success: true, classes, hasMore: true,
        nextCursor: { name: "kelas 100", id: "CLASS-100" },
      }), { status: 200 });
    }
    if (body.p_search === "Kelas" && body.p_after_id === "CLASS-100") {
      return new Response(JSON.stringify({
        success: true,
        classes: [{ id: "CLASS-101", name: "Kelas 101", organizationUnitId: unitId }],
        hasMore: false,
        nextCursor: null,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      success: true,
      classes: [{ id: "CLASS-USTADZ", name: "Kelas Ustadz", organizationUnitId: unitId }],
      hasMore: false,
      nextCursor: null,
    }), { status: 200 });
  }
  throw new Error(`Unexpected request: ${url}`);
};

try {
  const firstPage = await getSupabaseAcademicClassPage(tenantId, actorId, "Admin", true, unitId, unitId, "Kelas");
  assert.equal(firstPage.classes.length, 100);
  assert.equal(firstPage.hasMore, true);
  assert.ok(firstPage.nextCursor);
  assert.equal(rpcRequests[0].body.p_tenant_id, tenantId);
  assert.equal(rpcRequests[0].body.p_actor_user_id, actorId);
  assert.equal(rpcRequests[0].body.p_expected_role, "admin");
  assert.equal(rpcRequests[0].body.p_unit_mode, "unit");
  assert.equal(rpcRequests[0].body.p_unit_id, unitId);
  assert.equal(rpcRequests[0].body.p_limit, ACADEMIC_CLASS_PAGE_SIZE);

  const secondPage = await getSupabaseAcademicClassPage(tenantId, actorId, "Admin", true, unitId, unitId, "Kelas", firstPage.nextCursor);
  assert.deepEqual(secondPage.classes.map((item) => item.id), ["CLASS-101"]);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(rpcRequests[1].body.p_after_name, "kelas 100");
  assert.equal(rpcRequests[1].body.p_after_id, "CLASS-100");

  const ustadzPage = await getSupabaseAcademicClassPage(tenantId, actorId, "Ustadz", true, unitId, "all", "VII");
  assert.equal(ustadzPage.classes[0].id, "CLASS-USTADZ");
  assert.equal(rpcRequests[2].body.p_expected_role, "ustadz");
  assert.equal(rpcRequests[2].body.p_unit_mode, "unit");
  assert.equal(rpcRequests[2].body.p_unit_id, unitId, "Ustadz scope comes from their active profile unit");

  const beforeInvalid = rpcRequests.length;
  await assert.rejects(
    getSupabaseAcademicClassPage(tenantId, actorId, "Admin", true, unitId, unitId, "%admin"),
    (error: any) => error?.status === 400 && error.message.includes("wildcard"),
  );
  await assert.rejects(
    getSupabaseAcademicClassPage(tenantId, actorId, "Admin", true, unitId, unitId, "Kelas", encodeAcademicClassCursor({ ...cursor, scope: `${scope}:stale` })),
    (error: any) => error?.status === 400 && error.message.includes("tidak cocok"),
  );
  await assert.rejects(
    getSupabaseAcademicClassPage(tenantId, actorId, "Santri", true, unitId, unitId, "Kelas"),
    (error: any) => error?.status === 403,
  );
  assert.equal(rpcRequests.length, beforeInvalid, "invalid search/cursor and non-manager roles never reach the class RPC");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Academic class pagination passed: search validation, stable cursor, tenant/unit/actor binding, and Ustadz scope.");
