import assert from "node:assert/strict";
import {
  listSupabaseMasterDataStudentsPage,
  SupabaseOnboardingError,
} from "../src/server/supabaseOnboarding";

const tenantId = "11111111-1111-4111-8111-111111111111";
const originalFetch = globalThis.fetch;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
};
let studentQueries: URL[] = [];

function makeStudentRow(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    tenant_id: tenantId,
    source_system: "legacy",
    source_record_id: `LEGACY-${String(index).padStart(6, "0")}`,
    nis: String(index).padStart(10, "0").slice(-10),
    name: `Santri ${index}`,
    gender: "L",
    grade: "Kelas A",
    nik_ciphertext: "encrypted-nik",
    nisn_ciphertext: "encrypted-nisn",
    class_id: null,
    room_id: null,
    building_id: null,
    details: {
      publicNote: "catatan yang boleh dilihat",
      profile: {
        nik: `RAW-NIK-${index}`,
        nisn: `RAW-NISN-${index}`,
        occupation: "Wiraswasta",
      },
      contacts: [{ phone: "081234567890", apiKey: "RAW-API-KEY" }],
      _privateMetadata: "RAW-PRIVATE-METADATA",
    },
    status: "Active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

try {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/rest/v1/tenants") {
      return response([{ id: tenantId, slug: "pesantren-uji", status: "active" }]);
    }
    if (url.pathname === "/rest/v1/master_data_records") return response([]);
    if (url.pathname === "/rest/v1/students") {
      studentQueries.push(url);
      const offset = Number(url.searchParams.get("offset"));
      if (offset === 10000) return response(Array.from({ length: 11 }, (_, i) => makeStudentRow(offset + i + 1)));
      if (offset === 10010) return response(Array.from({ length: 3 }, (_, i) => makeStudentRow(offset + i + 1)));
      return response([]);
    }
    throw new Error(`Unexpected Supabase test request: ${url.pathname}`);
  }) as typeof fetch;

  const page = await listSupabaseMasterDataStudentsPage("pesantren-uji", {
    page: 1001,
    pageSize: 10,
    search: "Aminah 12",
    statuses: ["Active", "Inactive"],
    gender: "L",
    grade: "Kelas A",
    dormitory: "Asrama Utama",
    completeness: "WITH_NIK",
  });
  assert.equal(page.page, 1001);
  assert.equal(page.pageSize, 10);
  assert.equal(page.records.length, 10);
  assert.equal(page.hasMore, true);
  const query = studentQueries.at(-1);
  assert.ok(query);
  assert.equal(query.searchParams.get("tenant_id"), `eq.${tenantId}`);
  assert.equal(query.searchParams.get("offset"), "10000");
  assert.equal(query.searchParams.get("limit"), "11");
  assert.equal(query.searchParams.get("order"), "name.asc,id.asc");
  assert.equal(query.searchParams.get("status"), "in.(Active,Inactive)");
  assert.equal(query.searchParams.get("gender"), "eq.L");
  assert.equal(query.searchParams.get("nik_ciphertext"), "not.is.null");
  const filters = query.searchParams.get("and") || "";
  assert.match(filters, /Aminah/);
  assert.match(filters, /grade\.eq/);
  assert.match(filters, /dormitory\.eq/);

  const first = page.records[0] as Record<string, any>;
  assert.equal(first.nik, "");
  assert.equal(first.nisn, "");
  assert.equal(first.hasNik, true);
  assert.equal(first.hasNisn, true);
  assert.equal(first.publicNote, "catatan yang boleh dilihat");
  assert.equal(first.profile?.occupation, "Wiraswasta");
  const serialized = JSON.stringify(page.records);
  for (const secret of ["RAW-NIK-", "RAW-NISN-", "RAW-API-KEY", "RAW-PRIVATE-METADATA"]) {
    assert.equal(serialized.includes(secret), false, `response must omit ${secret}`);
  }
  assert.equal(first.profile?.nik, undefined);
  assert.equal(first.profile?.nisn, undefined);
  assert.equal(first.contacts?.[0]?.apiKey, undefined);

  const lastPage = await listSupabaseMasterDataStudentsPage(tenantId, { page: 1002, pageSize: 10 });
  assert.equal(lastPage.records.length, 3);
  assert.equal(lastPage.hasMore, false);

  const studentQueryCount = studentQueries.length;
  await assert.rejects(
    () => listSupabaseMasterDataStudentsPage(tenantId, { page: 100002, pageSize: 10 }),
    (error: unknown) => error instanceof SupabaseOnboardingError && error.status === 400,
  );
  assert.equal(studentQueries.length, studentQueryCount, "out-of-range page must fail before querying the roster");

  console.log("Master Data pagination and recursive PII minimization checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalEnv.secret;
}
