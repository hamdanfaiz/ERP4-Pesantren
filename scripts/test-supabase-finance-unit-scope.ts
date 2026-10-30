import assert from "node:assert/strict";
import { createSupabaseFinanceExpense, SupabaseFinanceError } from "../src/server/supabaseFinance";

const tenantId = "e5200000-0000-4000-8000-000000000001";
const unitId = "e5200000-0000-4000-8000-000000000101";
const unknownUnitId = "e5200000-0000-4000-8000-000000000102";
const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
const calls: Array<{ url: URL; method: string; body: any }> = [];

process.env.SUPABASE_URL = "https://supabase.example.invalid";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test_placeholder";

globalThis.fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = String(init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ url, method, body });

  if (url.pathname === "/rest/v1/tenants") {
    return Response.json([{ id: tenantId, status: "active" }]);
  }
  if (url.pathname === "/rest/v1/organization_units") {
    const requestedId = url.searchParams.get("id")?.slice(3);
    const requestedCode = url.searchParams.get("code")?.slice(3);
    if (requestedId === unitId || requestedCode === "MADRASAH") return Response.json([{ id: unitId }]);
    return Response.json([]);
  }
  if (url.pathname === "/rest/v1/rpc/create_tenant_finance_expense_for_unit" && method === "POST") {
    return Response.json({ success: true, expenseId: "e5200000-0000-4000-8000-000000000401", unitId: body.p_unit_id });
  }
  return Response.json({ message: `Unexpected request: ${method} ${url.pathname}` }, { status: 500 });
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    category: "Operasional",
    description: "Perbaikan kelas",
    department: "Pendidikan",
    amount: 150000,
    expenseDate: "2026-10-30",
    clientRequestId: "e5200000-0000-4000-8000-000000000301",
    ...overrides,
  };
}

try {
  const adminResult = await createSupabaseFinanceExpense(
    tenantId,
    "e5200000-0000-4000-8000-000000000011",
    "Admin",
    "Admin Unit",
    undefined,
    input({ unitId }),
  );
  assert.equal(adminResult.unitId, unitId);
  const adminRpc = calls.find((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit"));
  assert.ok(adminRpc, "Admin request calls the new unit-scoped RPC");
  assert.equal(adminRpc?.body.p_unit_id, unitId);
  assert.equal(adminRpc?.body.p_department, "Pendidikan");

  const rpcCount = calls.filter((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit")).length;
  await assert.rejects(
    () => createSupabaseFinanceExpense(tenantId, "e5200000-0000-4000-8000-000000000011", "Admin", "Admin Unit", undefined, input()),
    (error: unknown) => error instanceof SupabaseFinanceError && error.status === 403,
  );
  assert.equal(calls.filter((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit")).length, rpcCount, "missing Admin unit is rejected before the write RPC");

  await createSupabaseFinanceExpense(
    tenantId,
    "e5200000-0000-4000-8000-000000000013",
    "Ustadz",
    "Ustadz Unit",
    unitId,
    input({ unitId: unknownUnitId }),
  );
  const ustadzRpc = calls.filter((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit")).at(-1);
  assert.equal(ustadzRpc?.body.p_unit_id, unitId, "Ustadz unit is derived from the active profile, not the submitted body");
  assert.equal(ustadzRpc?.body.p_expected_role, "ustadz");

  const beforeUnassigned = calls.length;
  await assert.rejects(
    () => createSupabaseFinanceExpense(tenantId, "e5200000-0000-4000-8000-000000000013", "Ustadz", "Ustadz Unit", undefined, input({ unitId })),
    (error: unknown) => error instanceof SupabaseFinanceError && error.status === 403,
  );
  const unassignedCalls = calls.slice(beforeUnassigned);
  assert.ok(unassignedCalls.every((call) => call.url.pathname === "/rest/v1/tenants"), "Ustadz without a profile unit may resolve the tenant but cannot query units or write");

  const beforeUnknown = calls.filter((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit")).length;
  await assert.rejects(
    () => createSupabaseFinanceExpense(tenantId, "e5200000-0000-4000-8000-000000000011", "Admin", "Admin Unit", undefined, input({ unitId: unknownUnitId })),
    (error: unknown) => error instanceof SupabaseFinanceError && error.status === 403,
  );
  assert.equal(calls.filter((call) => call.url.pathname.endsWith("/rpc/create_tenant_finance_expense_for_unit")).length, beforeUnknown, "unknown or cross-tenant unit never reaches the write RPC");

  console.log("Supabase Finance unit-scope API checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
}
