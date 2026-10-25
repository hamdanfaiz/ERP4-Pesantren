import assert from "node:assert/strict";
import { listSupabaseTahfidzRecordPage, listSupabaseTahfidzSnapshot } from "../src/server/supabaseTahfidz";
import {
  buildTahfidzRecordPageParams,
  decodeTahfidzRecordCursor,
  encodeTahfidzRecordCursor,
  TAHFIDZ_RECORD_PAGE_SIZE,
} from "../src/lib/tahfidzRecordPagination";
import { normalizeTahfidzRosterCursor, normalizeTahfidzRosterSearch } from "../src/lib/tahfidzRosterPagination";
import { listSupabaseTahfidzRosterPage, listSupabaseTahfidzSessions } from "../src/server/supabaseTahfidz";

const tenantId = "00000000-0000-4000-8000-000000000001";
const halaqahId = "00000000-0000-4000-8000-000000000002";
const studentId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-25T12:30:45.123456+07:00";
const cursor = encodeTahfidzRecordCursor({ performedAt: timestamp, id: studentId });

assert.equal(TAHFIDZ_RECORD_PAGE_SIZE, 100, "halaman riwayat dibatasi");
assert.deepEqual(decodeTahfidzRecordCursor(cursor), { performedAt: timestamp, id: studentId }, "cursor mempertahankan presisi timestamp database");

const adminParams = buildTahfidzRecordPageParams({ tenantId, role: "Admin", cursor });
assert.ok(adminParams);
assert.equal(adminParams.get("tenant_id"), `eq.${tenantId}`);
assert.equal(adminParams.get("order"), "performed_at.desc,id.desc");
assert.equal(adminParams.get("limit"), "101", "satu baris tambahan dipakai untuk menentukan hasMore");
assert.equal(adminParams.get("or"), `(performed_at.lt.${timestamp},and(performed_at.eq.${timestamp},id.lt.${studentId}))`);

const ustadzParams = buildTahfidzRecordPageParams({
  tenantId,
  role: "Ustadz",
  halaqahIds: [halaqahId, halaqahId],
});
assert.equal(ustadzParams?.get("halaqah_id"), `in.(${halaqahId})`, "riwayat Ustadz dibatasi pada halaqah yang diizinkan");
assert.equal(buildTahfidzRecordPageParams({ tenantId, role: "Ustadz", halaqahIds: [] }), null, "Ustadz tanpa halaqah tidak mendapat baris tenant lain");

const waliParams = buildTahfidzRecordPageParams({
  tenantId,
  role: "Walisantri",
  studentIds: [studentId],
});
assert.equal(waliParams?.get("student_id"), `in.(${studentId})`, "Wali hanya dapat meminta riwayat santri tertaut");
assert.equal(waliParams?.get("halaqah_id"), null);

assert.throws(() => decodeTahfidzRecordCursor("not-a-cursor"), /Kursor riwayat/);
assert.throws(() => decodeTahfidzRecordCursor("A".repeat(513)), /Kursor riwayat/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId: "tenant", role: "Admin" }), /Tenant Tahfidz/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Ustadz", halaqahIds: ["bad-id"] }), /Cakupan halaqah/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Santri", studentIds: [studentId], cursor: "bad" }), /Kursor riwayat/);
assert.throws(() => buildTahfidzRecordPageParams({ tenantId, role: "Guest" }), /Role/);
assert.equal(normalizeTahfidzRosterCursor(studentId), studentId);
assert.equal(normalizeTahfidzRosterCursor(null), null);
assert.equal(normalizeTahfidzRosterSearch("  A_B%  "), "A_B%");
assert.equal(normalizeTahfidzRosterSearch("   "), null);
assert.throws(() => normalizeTahfidzRosterCursor("not-a-cursor"), /Kursor roster/);
assert.throws(() => normalizeTahfidzRosterSearch("x".repeat(81)), /Pencarian roster/);
assert.throws(() => normalizeTahfidzRosterSearch("santri\nbaru"), /Pencarian roster/);

async function testRecordPageDoesNotLoadFullSnapshot() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const tenant = "00000000-0000-4000-8000-000000000011";
  const actor = "00000000-0000-4000-8000-000000000012";
  const halaqah = "00000000-0000-4000-8000-000000000013";
  const student = "00000000-0000-4000-8000-000000000014";
  const requests: URL[] = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split("/").pop();
    let rows: unknown[] = [];
    if (table === "tenants") rows = [{ id: tenant, status: "active" }];
    else if (table === "profiles") rows = [{ user_id: actor, role: "ustadz", status: "active" }];
    else if (table === "tahfidz_halaqahs") rows = [{ id: halaqah }];
    else if (table === "tahfidz_records") rows = [{
      id: "00000000-0000-4000-8000-000000000015",
      student_id: student,
      halaqah_id: halaqah,
      activity_type: "Ziyadah",
      surah_name: "Al-Baqarah",
      ayah_start: 1,
      ayah_end: 5,
      fluency_grade: "A",
      tajweed_grade: "A",
      notes: "",
      performed_at: timestamp,
      recorded_by_name: "Ustadz",
    }];
    else if (table === "students") rows = [{
      id: student, name: "Santri Uji", nis: "NIS-1", status: "Active",
    }];
    else throw new Error(`Unexpected table request: ${table}`);
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const page = await listSupabaseTahfidzRecordPage(tenant, actor, "Ustadz");
    assert.equal(page.records.length, 1);
    assert.equal(page.records[0].studentName, "Santri Uji");
    assert.equal(page.hasMore, false);

    const tableNames = requests.map((url) => url.pathname.split("/").pop());
    assert.deepEqual(tableNames, ["tenants", "profiles", "tahfidz_halaqahs", "tahfidz_records", "students"]);
    assert.ok(!tableNames.some((name) => ["tahfidz_memberships", "tahfidz_targets"].includes(String(name))),
      "memuat halaman riwayat tidak memindai snapshot operasional penuh");
    const halaqahQuery = requests.find((url) => url.pathname.endsWith("/tahfidz_halaqahs"));
    assert.equal(halaqahQuery?.searchParams.get("tenant_id"), `eq.${tenant}`);
    assert.equal(halaqahQuery?.searchParams.get("ustadz_user_id"), `eq.${actor}`);
    const recordsQuery = requests.find((url) => url.pathname.endsWith("/tahfidz_records"));
    assert.equal(recordsQuery?.searchParams.get("tenant_id"), `eq.${tenant}`);
    assert.equal(recordsQuery?.searchParams.get("halaqah_id"), `in.(${halaqah})`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

async function testSnapshotUsesTenantScopedRosterRpc() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const tenant = "00000000-0000-4000-8000-000000000021";
  const actor = "00000000-0000-4000-8000-000000000022";
  const halaqahA = "00000000-0000-4000-8000-000000000023";
  const studentA = "00000000-0000-4000-8000-000000000025";
  const studentB = "00000000-0000-4000-8000-000000000026";
  const requests: URL[] = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split("/").pop();
    let rows: unknown[] = [];
    if (table === "tenants" && url.searchParams.get("select") === "id,status") {
      rows = [{ id: tenant, status: "active" }];
    } else if (table === "tenants") {
      rows = [{ time_zone: "Asia/Jakarta" }];
    } else if (table === "profiles" && url.searchParams.get("select") === "user_id,role,status") {
      rows = [{ user_id: actor, role: "admin", status: "active" }];
    } else if (table === "profiles") {
      rows = [{ user_id: "00000000-0000-4000-8000-000000000027", display_name: "Ustadz Uji" }];
    } else if (url.pathname.endsWith("/rpc/list_tahfidz_roster_page")) {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.p_tenant_id, tenant);
      assert.equal(body.p_actor_user_id, actor);
      assert.equal(body.p_expected_role, "admin");
      assert.match(body.p_business_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(body.p_after_student_id, null);
      assert.equal(body.p_search, null);
      assert.equal(body.p_page_size, 100);
      assert.equal(body.p_include_support, true);
      return new Response(JSON.stringify({
        roster: [
          { id: studentA, nis: "0000000001", name: "Santri A", grade: "VII", halaqahId: halaqahA, halaqah: "Halaqah A", target: null },
          { id: studentB, nis: "0000000002", name: "Santri B", grade: "VIII", halaqahId: halaqahA, halaqah: "Halaqah A", target: { periodStart: "2026-01-01", ziyadahPagesPerDay: 1, murojaahPagesPerDay: 0.5, policy: "standard" } },
        ],
        hasMore: false,
        nextCursor: null,
        stats: { studentCount: 2, studentsWithTarget: 1, studentsWithoutTarget: 1, studentsWithoutHalaqah: 0 },
        halaqahCounts: { [halaqahA]: 2 },
        followUpCount: 1,
        followUps: [{ id: studentA, nis: "0000000001", name: "Santri A", halaqahId: halaqahA, halaqah: "Halaqah A", reasons: ["Target harian belum ditetapkan"] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } else if (table === "tahfidz_halaqahs") {
      rows = [{ id: halaqahA, name: "Halaqah A", status: "active", daily_target_pages: 1 }];
    } else {
      rows = [];
    }
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const snapshot = await listSupabaseTahfidzSnapshot(tenant, actor, "Admin", false);
    assert.deepEqual(snapshot.records, []);
    assert.equal(snapshot.roster.length, 2, "snapshot memuat halaman roster dari RPC");
    assert.equal(snapshot.rosterStats.studentCount, 2, "jumlah santri pasti dihitung di backend");
    assert.equal(snapshot.rosterStats.studentsWithoutTarget, 1);
    assert.equal(snapshot.followUps.count, 1, "jumlah tindak lanjut pasti dihitung di backend");
    assert.deepEqual(snapshot.followUps.rows[0].reasons, ["Target harian belum ditetapkan"]);
    assert.equal(snapshot.halaqahs[0].studentCount, 2, "jumlah anggota halaqah dihitung di backend");
    assert.ok(!Object.hasOwn(snapshot.halaqahs[0], "students"), "snapshot tidak menduplikasi identitas santri di tiap halaqah");
    const rpcQuery = requests.find((url) => url.pathname.endsWith("/rpc/list_tahfidz_roster_page"));
    assert.ok(rpcQuery, "snapshot memakai satu RPC terikat tenant, bukan membaca semua baris operasional");
    const tableNames = requests.filter((url) => url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/"))
      .map((url) => url.pathname.split("/").pop());
    assert.ok(!tableNames.some((name) => ["students", "tahfidz_memberships", "tahfidz_targets"].includes(String(name))),
      "snapshot tidak memindai roster, membership, atau target secara langsung");
    assert.equal(snapshot.rosterPage.hasMore, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

async function testRosterPagePassesCursorAndSearchToRpc() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const tenant = "00000000-0000-4000-8000-000000000031";
  const actor = "00000000-0000-4000-8000-000000000032";
  const cursorId = "00000000-0000-4000-8000-000000000033";
  let rpcBody: Record<string, unknown> | null = null;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/tenants") && url.searchParams.get("select") === "time_zone") {
      return new Response(JSON.stringify([{ time_zone: "Asia/Jakarta" }]), { status: 200 });
    }
    if (url.pathname.endsWith("/tenants")) {
      return new Response(JSON.stringify([{ id: tenant, status: "active" }]), { status: 200 });
    }
    if (url.pathname.endsWith("/profiles")) {
      return new Response(JSON.stringify([{ user_id: actor, role: "ustadz", status: "active" }]), { status: 200 });
    }
    if (url.pathname.endsWith("/rpc/list_tahfidz_roster_page")) {
      rpcBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({ roster: [], hasMore: true, nextCursor: cursorId, stats: null, halaqahCounts: null }), { status: 200 });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  }) as typeof fetch;
  try {
    const page = await listSupabaseTahfidzRosterPage(tenant, actor, "Ustadz", cursorId, "Nur");
    assert.equal(page.hasMore, true);
    assert.equal(page.nextCursor, cursorId);
    assert.equal(rpcBody?.p_expected_role, "ustadz");
    assert.equal(rpcBody?.p_after_student_id, cursorId);
    assert.equal(rpcBody?.p_search, "Nur");
    assert.equal(rpcBody?.p_include_support, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

async function testUstadzWithoutHalaqahDoesNotReadTenantSessions() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const tenant = "00000000-0000-4000-8000-000000000041";
  const actor = "00000000-0000-4000-8000-000000000042";
  const requests: URL[] = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.endsWith("/tenants")) {
      return new Response(JSON.stringify([{ id: tenant, status: "active" }]), { status: 200 });
    }
    if (url.pathname.endsWith("/profiles")) {
      return new Response(JSON.stringify([{ user_id: actor, role: "ustadz", status: "active" }]), { status: 200 });
    }
    if (url.pathname.endsWith("/tahfidz_halaqahs")) return new Response("[]", { status: 200 });
    throw new Error(`Unexpected unscoped request ${url.pathname}`);
  }) as typeof fetch;
  try {
    const result = await listSupabaseTahfidzSessions(tenant, actor, "Ustadz", "talaqqi");
    assert.deepEqual(result.sessions, []);
    assert.equal(result.canManage, true);
    assert.ok(!requests.some((url) => url.pathname.endsWith("/tahfidz_sessions")), "empty assigned-halaqah scope never queries tenant session rows");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

await testRecordPageDoesNotLoadFullSnapshot();
await testSnapshotUsesTenantScopedRosterRpc();
await testRosterPagePassesCursorAndSearchToRpc();
await testUstadzWithoutHalaqahDoesNotReadTenantSessions();
console.log("Tes pagination roster dan riwayat Tahfidz lulus.");
