import assert from "node:assert/strict";
import {
  buildTahfidzSessionPageParams,
  decodeTahfidzSessionCursor,
  encodeTahfidzSessionCursor,
  TAHFIDZ_SESSION_PAGE_SIZE,
} from "../src/lib/tahfidzSessionPagination";
import { listSupabaseTahfidzSessions } from "../src/server/supabaseTahfidz";

const tenantId = "00000000-0000-4000-8000-000000000001";
const halaqahId = "00000000-0000-4000-8000-000000000002";
const studentId = "00000000-0000-4000-8000-000000000003";
const scheduledAt = "2026-10-25T12:30:45.123456+07:00";
const cursor = encodeTahfidzSessionCursor({ scheduledAt, id: studentId });

assert.equal(TAHFIDZ_SESSION_PAGE_SIZE, 100, "halaman jadwal dibatasi sampai 100 sesi");
assert.deepEqual(decodeTahfidzSessionCursor(cursor), { scheduledAt, id: studentId }, "kursor mempertahankan timestamp presisi database");

const adminParams = buildTahfidzSessionPageParams({ tenantId, role: "Admin", kind: "talaqqi", cursor });
assert.ok(adminParams);
assert.equal(adminParams.get("tenant_id"), `eq.${tenantId}`);
assert.equal(adminParams.get("kind"), "eq.talaqqi");
assert.equal(adminParams.get("order"), "scheduled_at.asc,id.asc");
assert.equal(adminParams.get("limit"), "101", "satu baris tambahan menentukan apakah masih ada halaman");
assert.equal(adminParams.get("or"), `(scheduled_at.gt.${scheduledAt},and(scheduled_at.eq.${scheduledAt},id.gt.${studentId}))`);

const ustadzParams = buildTahfidzSessionPageParams({
  tenantId, role: "Ustadz", kind: "exam", halaqahIds: [halaqahId, halaqahId],
});
assert.equal(ustadzParams?.get("halaqah_id"), `in.(${halaqahId})`, "Ustadz hanya membaca jadwal halaqah yang diampu");
assert.equal(ustadzParams?.get("student_id"), null);
assert.equal(buildTahfidzSessionPageParams({ tenantId, role: "Ustadz", kind: "exam", halaqahIds: [] }), null,
  "Ustadz tanpa halaqah tidak mendapat sesi tenant lain");

const guardianParams = buildTahfidzSessionPageParams({
  tenantId, role: "Walisantri", kind: "exam", studentIds: [studentId],
});
assert.equal(guardianParams?.get("student_id"), `in.(${studentId})`, "Wali hanya membaca sesi anak yang tertaut");
assert.equal(guardianParams?.get("halaqah_id"), null);
assert.throws(() => decodeTahfidzSessionCursor("bukan-kursor"), /Kursor jadwal/);
assert.throws(() => decodeTahfidzSessionCursor("A".repeat(513)), /Kursor jadwal/);
assert.throws(() => buildTahfidzSessionPageParams({ tenantId: "tenant", role: "Admin", kind: "exam" }), /Tenant Tahfidz/);
assert.throws(() => buildTahfidzSessionPageParams({ tenantId, role: "Admin", kind: "exam", cursor: "rusak" }), /Kursor jadwal/);
assert.throws(() => buildTahfidzSessionPageParams({ tenantId, role: "Wali", kind: "exam" }), /Role/);
assert.throws(() => buildTahfidzSessionPageParams({ tenantId, role: "Admin", kind: "invalid" as any }), /Jenis sesi/);

async function testServerReturnsBoundedTenantPage() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const testTenant = "00000000-0000-4000-8000-000000000011";
  const actor = "00000000-0000-4000-8000-000000000012";
  const halaqah = "00000000-0000-4000-8000-000000000013";
  const student = "00000000-0000-4000-8000-000000000014";
  const scheduledAt = "2026-10-25T12:30:45.123456+07:00";
  const requests: URL[] = [];
  const sessionRows = Array.from({ length: 101 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    kind: "exam", student_id: student, halaqah_id: halaqah, teacher_user_id: actor,
    exam_type: "munaqasyah", juz_start: 1, juz_end: 1, scheduled_at: scheduledAt,
    duration_minutes: 30, focus: "Juz 1", status: "scheduled", score: null, outcome: null,
    notes: null, completed_at: null, created_at: scheduledAt,
  }));
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split("/").pop();
    let body: unknown;
    if (table === "tenants" && url.searchParams.get("select") === "id,status") body = [{ id: testTenant, status: "active" }];
    else if (table === "tenants") body = [{ time_zone: "UTC" }];
    else if (table === "profiles" && url.searchParams.has("user_id")) body = [{ user_id: actor, role: "admin", status: "active" }];
    else if (table === "profiles") body = [];
    else if (table === "list_tahfidz_roster_page") body = {
      roster: [], hasMore: false, nextCursor: null, stats: { studentCount: 0 }, halaqahCounts: {},
      followUps: [], followUpCount: 0,
    };
    else if (table === "tahfidz_halaqahs") body = [{
      id: halaqah, name: "Halaqah Uji", ustadz_user_id: actor, ustadz_name: "Ustadz Uji", status: "active",
    }];
    else if (table === "tahfidz_sessions") body = sessionRows;
    else if (table === "students") body = [{ id: student, name: "Santri Uji", nis: "NIS-UJI", status: "active" }];
    else throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const page = await listSupabaseTahfidzSessions(testTenant, actor, "Admin", "exam");
    assert.equal(page.sessions.length, 100, "server hanya mengembalikan satu halaman sesi");
    assert.equal(page.hasMore, true);
    assert.deepEqual(decodeTahfidzSessionCursor(page.nextCursor), { scheduledAt, id: sessionRows[99].id });
    assert.equal(page.sessions[0].studentName, "Santri Uji", "identitas santri tetap ditampilkan meskipun tidak ada di roster awal");
    const sessionQuery = requests.find((url) => url.pathname.endsWith("/tahfidz_sessions"));
    assert.equal(sessionQuery?.searchParams.get("tenant_id"), `eq.${testTenant}`);
    assert.equal(sessionQuery?.searchParams.get("kind"), "eq.exam");
    assert.equal(sessionQuery?.searchParams.get("limit"), "101");
    assert.equal(sessionQuery?.searchParams.get("offset"), null, "paginasi tidak memindai data memakai offset");
    const studentQuery = requests.find((url) => url.pathname.endsWith("/students"));
    assert.equal(studentQuery?.searchParams.get("tenant_id"), `eq.${testTenant}`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

await testServerReturnsBoundedTenantPage();
console.log("Tahfidz session keyset pagination checks passed.");
