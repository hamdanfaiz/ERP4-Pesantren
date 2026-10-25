import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const invitedUserId = "b9000000-0000-4000-8000-000000000011";
const tenantId = "b9000000-0000-4000-8000-000000000021";
const guardianId = "b9000000-0000-4000-8000-000000000031";
const studentId = "b9000000-0000-4000-8000-000000000041";
const invitedEmail = "wali-verifikasi@example.test";
const invitationToken = "a".repeat(43);
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";

const originalFetch = globalThis.fetch;
const paths: string[] = [];
let scenario: {
  email?: string;
  emailConfirmed?: boolean;
  invitationStatus?: string;
  expiresAt?: string;
  guardianStatus?: string;
  studentStatus?: string;
} = {};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  paths.push(url.pathname);
  let body: unknown;
  if (url.pathname === "/auth/v1/admin/users/" + invitedUserId) {
    body = { user: {
      id: invitedUserId,
      email: scenario.email ?? invitedEmail,
      email_confirmed_at: scenario.emailConfirmed === false ? null : new Date().toISOString(),
    } };
  } else if (url.pathname === "/rest/v1/guardian_account_invitations") {
    const expectedHash = "eq." + String.fromCharCode(92) + "x" + createHash("sha256").update(invitationToken).digest("hex");
    assert.equal(url.searchParams.get("token_hash"), expectedHash, "only a SHA-256 token hash is queried");
    body = [{
      tenant_id: tenantId,
      guardian_id: guardianId,
      email: invitedEmail,
      status: scenario.invitationStatus ?? "pending",
      expires_at: scenario.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    }];
  } else if (url.pathname === "/rest/v1/guardians") {
    body = [{ id: guardianId, status: scenario.guardianStatus ?? "active" }];
  } else if (url.pathname === "/rest/v1/guardian_students") {
    body = [{ student_id: studentId }];
  } else if (url.pathname === "/rest/v1/students") {
    body = [{ id: studentId, status: scenario.studentStatus ?? "active" }];
  } else {
    throw new Error("Unexpected verification request: " + url.pathname);
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

try {
  const { IdentityConflictError, verifyGuardianAccountInvitation } = await import("../src/server/identityStore");
  const verified = await verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail);
  assert.equal(verified, invitedEmail);
  assert.deepEqual(paths, [
    "/auth/v1/admin/users/" + invitedUserId,
    "/rest/v1/guardian_account_invitations",
    "/rest/v1/guardians",
    "/rest/v1/guardian_students",
    "/rest/v1/students",
  ]);

  paths.length = 0;
  scenario = { email: "akun-lain@example.test" };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );
  assert.deepEqual(paths, ["/auth/v1/admin/users/" + invitedUserId], "email mismatch must fail before reading invitation data");

  scenario = { emailConfirmed: false };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );
  scenario = { invitationStatus: "revoked" };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );
  scenario = { expiresAt: new Date(Date.now() - 60_000).toISOString() };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );
  scenario = { guardianStatus: "inactive" };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );
  scenario = { studentStatus: "inactive" };
  await assert.rejects(
    () => verifyGuardianAccountInvitation(invitationToken, invitedUserId, invitedEmail),
    (error: unknown) => error instanceof IdentityConflictError,
  );

  console.log("Guardian invitation verification passed (7 scenarios: 1 accepted, 6 rejected).");
} finally {
  globalThis.fetch = originalFetch;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSupabaseSecretKey;
}