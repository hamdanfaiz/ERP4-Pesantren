import assert from "node:assert/strict";
import {
  recordSupabaseTahfidzTarget,
  recordSupabaseTahfidzTargetsBulk,
} from "../src/server/supabaseTahfidz";

const tenantId = "00000000-0000-4000-8000-000000000011";
const actorId = "00000000-0000-4000-8000-000000000012";
const studentA = "00000000-0000-4000-8000-000000000013";
const studentB = "00000000-0000-4000-8000-000000000014";
const requestId = "00000000-0000-4000-8000-000000000015";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
const requestBodies: Array<{ path: string; body: Record<string, unknown> }> = [];
process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname;
  if (path === "/rest/v1/tenants") {
    return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
  }
  if (path === "/rest/v1/profiles") {
    return new Response(JSON.stringify([{ user_id: actorId, role: "admin", status: "active" }]), { status: 200 });
  }
  if (path === "/rest/v1/rpc/record_tahfidz_daily_targets_bulk") {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    requestBodies.push({ path, body });
    return new Response(JSON.stringify({
      success: true,
      alreadyApplied: false,
      count: 2,
      targets: [
        { studentId: studentA, targetId: requestId, alreadyApplied: false },
        { studentId: studentB, targetId: "00000000-0000-4000-8000-000000000016", alreadyApplied: false },
      ],
    }), { status: 200 });
  }
  throw new Error(`Unexpected request: ${path}`);
}) as typeof fetch;

try {
  const invalidSingleTarget = recordSupabaseTahfidzTarget(tenantId, actorId, "Admin", {
    studentId: studentA,
    periodStart: "2026-11-14",
    ziyadahPagesPerDay: 1.001,
    murojaahPagesPerDay: 0,
    policy: "standard",
    clientRequestId: requestId,
  });
  await assert.rejects(invalidSingleTarget, (error: unknown) =>
    error instanceof Error
      && "status" in error && error.status === 400
      && error.message.includes("dua angka di belakang koma"));
  assert.equal(requestBodies.length, 0, "invalid single targets are rejected before a write request");

  const invalidBulkTarget = recordSupabaseTahfidzTargetsBulk(tenantId, actorId, "Admin", {
    studentIds: [studentA, studentB],
    periodStart: "2026-11-14",
    ziyadahPagesPerDay: "0.125",
    murojaahPagesPerDay: 0,
    policy: "standard",
    clientRequestId: requestId,
  });
  await assert.rejects(invalidBulkTarget, (error: unknown) =>
    error instanceof Error
      && "status" in error && error.status === 400
      && error.message.includes("dua angka di belakang koma"));
  assert.equal(requestBodies.length, 0, "invalid bulk targets are rejected before a write request");

  const result = await recordSupabaseTahfidzTargetsBulk(tenantId, actorId, "Admin", {
    studentIds: [studentB, studentA],
    periodStart: "2026-11-14",
    ziyadahPagesPerDay: "1.25",
    murojaahPagesPerDay: 0.5,
    policy: "standard",
    clientRequestId: requestId,
  });
  assert.equal(result.success, true);
  assert.equal(requestBodies.length, 1, "valid batch reaches the trusted write RPC exactly once");
  assert.deepEqual(requestBodies[0].body.p_student_ids, [studentA, studentB], "batch IDs are canonicalized before RPC");
  assert.equal(requestBodies[0].body.p_ziyadah_pages_per_day, 1.25);
  assert.equal(requestBodies[0].body.p_murojaah_pages_per_day, 0.5);
  assert.equal(requestBodies[0].body.p_created_by_user_id, actorId);
  assert.equal(requestBodies[0].body.p_expected_role, "admin");
  console.log("Tahfidz target precision and trusted batch API checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
}
