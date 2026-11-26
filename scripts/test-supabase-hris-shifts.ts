import assert from "node:assert/strict";
import {
  assignSupabaseHrisShift,
  cancelSupabaseHrisShiftAssignment,
  createSupabaseHrisShiftTemplate,
  deactivateSupabaseHrisShiftTemplate,
  listSupabaseHrisShiftSnapshot,
} from "../src/server/supabaseHris";

const tenantId = "d5200000-0000-4000-8000-000000000001";
const actorId = "d5200000-0000-4000-8000-000000000011";
const templateId = "d5200000-0000-4000-8000-000000000201";
const assignmentId = "d5200000-0000-4000-8000-000000000301";
const requestId = "d5200000-0000-4000-8000-000000000391";
const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalFetch = globalThis.fetch;
const calls: Array<{ url: URL; init: RequestInit }> = [];
let nextRpcResponse: { status: number; body: unknown } | null = null;

process.env.SUPABASE_URL = "https://vqe-shifts-test.example.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only_not_a_real_key";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

globalThis.fetch = (async (input: URL | RequestInfo, init: RequestInit = {}) => {
  const url = new URL(String(input));
  calls.push({ url, init });
  if (url.pathname === "/rest/v1/tenants") {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (url.pathname === "/rest/v1/hris_shift_templates") {
    return new Response(JSON.stringify([{
      id: templateId, name: "Piket malam", weekday_mask: 8,
      starts_at: "22:00:00", ends_at: "06:00:00", break_minutes: 30,
      status: "active", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
    }]), { status: 200 });
  }
  if (url.pathname === "/rest/v1/hris_shift_assignments") {
    return new Response(JSON.stringify([{
      id: assignmentId, employee_id: "d5200000-0000-4000-8000-000000000101",
      shift_template_id: templateId, starts_on: "2026-11-26", ends_on: "2026-11-26",
      status: "active", created_at: "2026-11-01T00:00:00Z", cancelled_at: null,
    }]), { status: 200 });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const response = nextRpcResponse || { status: 200, body: { id: templateId, status: "active", replayed: false } };
    nextRpcResponse = null;
    return new Response(JSON.stringify(response.body), { status: response.status });
  }
  return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500 });
}) as typeof fetch;

function lastCall(pathSuffix: string) {
  const call = [...calls].reverse().find((entry) => entry.url.pathname.endsWith(pathSuffix));
  assert.ok(call, `Expected request ending with ${pathSuffix}`);
  return call;
}

try {
  const snapshot = await listSupabaseHrisShiftSnapshot(tenantId, "2026-11-23", "2026-11-29");
  assert.equal(snapshot.templates[0].startsAt, "22:00");
  assert.equal(snapshot.templates[0].endsAt, "06:00");
  assert.equal(snapshot.assignments[0].employeeId, "d5200000-0000-4000-8000-000000000101");
  assert.equal(snapshot.truncated, false);
  const templateList = lastCall("/rest/v1/hris_shift_templates");
  const templateQuery = templateList.url.searchParams;
  assert.equal(templateQuery.get("tenant_id"), `eq.${tenantId}`);
  assert.equal(templateQuery.get("limit"), "1000");
  const assignmentQuery = lastCall("/rest/v1/hris_shift_assignments").url.searchParams;
  assert.equal(assignmentQuery.get("tenant_id"), `eq.${tenantId}`);
  assert.equal(assignmentQuery.get("starts_on"), "lte.2026-11-29");
  assert.equal(assignmentQuery.get("ends_on"), "gte.2026-11-23");

  const createResult = await createSupabaseHrisShiftTemplate(tenantId, actorId, {
    id: templateId, clientRequestId: requestId, name: "Piket malam", weekdayMask: 8,
    startsAt: "22:00", endsAt: "06:00", breakMinutes: 30,
  });
  assert.equal(createResult.id, templateId);
  const createCall = lastCall("/rest/v1/rpc/create_hris_shift_template");
  const createBody = JSON.parse(String(createCall.init.body));
  assert.equal(createBody.p_tenant_id, tenantId);
  assert.equal(createBody.p_actor_user_id, actorId);
  assert.equal(createBody.p_starts_at, "22:00:00");
  assert.equal(createBody.p_ends_at, "06:00:00");
  assert.equal(createCall.init.method, "POST");
  assert.equal(new Headers(createCall.init.headers).get("apikey"), process.env.SUPABASE_SECRET_KEY);
  assert.equal(new Headers(createCall.init.headers).get("authorization"), null, "secret keys must not be duplicated into bearer headers");

  await assert.rejects(
    createSupabaseHrisShiftTemplate(tenantId, actorId, {
      id: "d5200000-0000-4000-8000-000000000202", clientRequestId: "d5200000-0000-4000-8000-000000000392",
      name: "Waktu tidak valid", weekdayMask: 8, startsAt: "24:00", endsAt: "06:00", breakMinutes: 0,
    }),
    (error: any) => error.status === 400,
  );
  const rpcCountBeforeInvalidRange = calls.filter((call) => call.url.pathname.startsWith("/rest/v1/rpc/")).length;
  await assert.rejects(
    assignSupabaseHrisShift(tenantId, actorId, {
      id: assignmentId, clientRequestId: requestId, employeeId: "d5200000-0000-4000-8000-000000000101",
      shiftTemplateId: templateId, startsOn: "2026-11-27", endsOn: "2026-11-26",
    }),
    (error: any) => error.status === 400,
  );
  assert.equal(calls.filter((call) => call.url.pathname.startsWith("/rest/v1/rpc/")).length, rpcCountBeforeInvalidRange,
    "invalid date ranges must be rejected before writing");

  const assignmentResult = await assignSupabaseHrisShift(tenantId, actorId, {
    id: assignmentId, clientRequestId: requestId, employeeId: "d5200000-0000-4000-8000-000000000101",
    shiftTemplateId: templateId, startsOn: "2026-11-26", endsOn: "2026-11-26",
  });
  assert.equal(assignmentResult.status, "active");
  const assignmentCall = lastCall("/rest/v1/rpc/assign_hris_shift");
  const assignmentBody = JSON.parse(String(assignmentCall.init.body));
  assert.equal(assignmentBody.p_tenant_id, tenantId);
  assert.equal(assignmentBody.p_employee_id, "d5200000-0000-4000-8000-000000000101");
  assert.equal(assignmentBody.p_starts_on, "2026-11-26");

  assert.equal((await deactivateSupabaseHrisShiftTemplate(tenantId, actorId, {
    shiftTemplateId: templateId, clientRequestId: "d5200000-0000-4000-8000-000000000397",
  })).status, "active");
  assert.equal((await cancelSupabaseHrisShiftAssignment(tenantId, actorId, {
    shiftAssignmentId: assignmentId, clientRequestId: "d5200000-0000-4000-8000-000000000398",
  })).status, "active");

  nextRpcResponse = { status: 403, body: { code: "42501", message: "Admin tenant dengan izin HRIS diperlukan", details: "tenant id must not be exposed" } };
  await assert.rejects(
    assignSupabaseHrisShift(tenantId, actorId, {
      id: "d5200000-0000-4000-8000-000000000302", clientRequestId: "d5200000-0000-4000-8000-000000000399",
      employeeId: "d5200000-0000-4000-8000-000000000101", shiftTemplateId: templateId,
      startsOn: "2026-11-27", endsOn: "2026-11-27",
    }),
    (error: any) => error.status === 403 && error.message === "Operasi HRIS ditolak oleh kebijakan tenant."
      && !error.message.includes("tenant id"),
  );

  console.log("HRIS shift API adapter: tenant filters, input validation, RPC payloads, server key handling, and safe errors passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalSecret;
  if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
}
