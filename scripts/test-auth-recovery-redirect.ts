import assert from "node:assert/strict";
import { passwordRecoveryErrorMessage } from "../src/utils/passwordRecoveryErrorMessage";

assert.match(passwordRecoveryErrorMessage({ status: 429, code: "over_email_send_rate_limit" }), /Batas email pemulihan proyek.*Jangan kirim permintaan berulang\./);
assert.match(passwordRecoveryErrorMessage({ status: 400, message: "Invalid redirect URL" }), /Alamat aplikasi belum diizinkan/);
assert.match(passwordRecoveryErrorMessage({ status: 500, message: "SMTP unavailable" }), /Permintaan pemulihan belum dapat diproses/);


const originalValues = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  appUrl: process.env.APP_URL,
  publicAppUrl: process.env.PUBLIC_APP_URL,
};

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
delete process.env.APP_URL;
process.env.PUBLIC_APP_URL = "https://erp.example.test";

const originalFetch = globalThis.fetch;
let capturedUrl = "";
let capturedBody: Record<string, unknown> | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  capturedUrl = new URL(input instanceof Request ? input.url : String(input)).href;
  capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
  return new Response(JSON.stringify({
    action_link: "https://supabase.test/auth/v1/verify?token=test&type=recovery",
    user: { id: "e0000000-0000-4000-8000-000000000001", email: "admin@example.test" },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

try {
  const { createRecoveryLink } = await import("../src/server/identityStore");
  const link = await createRecoveryLink("admin@example.test");

  assert.equal(link, "https://supabase.test/auth/v1/verify?token=test&type=recovery");
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.pathname, "/auth/v1/admin/generate_link");
  assert.equal(requestUrl.searchParams.get("redirect_to"), "https://erp.example.test/");
  assert.equal(capturedBody?.type, "recovery");
  assert.equal(capturedBody?.email, "admin@example.test");

  console.log("Auth recovery redirect passed: generateLink uses configured PUBLIC_APP_URL.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalValues.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalValues.supabaseUrl;
  if (originalValues.supabaseSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalValues.supabaseSecretKey;
  if (originalValues.appUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalValues.appUrl;
  if (originalValues.publicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalValues.publicAppUrl;
}

