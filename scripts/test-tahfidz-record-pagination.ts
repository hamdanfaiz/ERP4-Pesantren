import assert from "node:assert/strict";
import { listSupabaseTahfidzRecordPage, listSupabaseTahfidzSnapshot } from "../src/server/supabaseTahfidz";
import {
  buildTahfidzRecordPageParams,
  decodeTahfidzRecordCursor,
  encodeTahfidzRecordCursor,
  TAHFIDZ_RECORD_PAGE_SIZE,
} from "../src/lib/tahfidzRecordPagination";

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

  globalThis.fetch = (async (input: RequestInfo | URL) => {
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

async function testSnapshotOnlyLoadsCurrentMembershipsAndTargets() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const tenant = "00000000-0000-4000-8000-000000000021";
  const actor = "00000000-0000-4000-8000-000000000022";
  const halaqahA = "00000000-0000-4000-8000-000000000023";
  const halaqahB = "00000000-0000-4000-8000-000000000024";
  const studentA = "00000000-0000-4000-8000-000000000025";
  const studentB = "00000000-0000-4000-8000-000000000026";
  const requests: URL[] = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
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
      rows = [];
    } else if (table === "tahfidz_halaqahs") {
      rows = [
        { id: halaqahA, name: "Halaqah A", status: "active", daily_target_pages: 1 },
        { id: halaqahB, name: "Halaqah B", status: "active", daily_target_pages: 1 },
      ];
    } else if (table === "tahfidz_memberships") {
      rows = [
        { halaqah_id: halaqahA, student_id: studentA, starts_on: "2000-01-01", ends_on: null, status: "active" },
        { halaqah_id: halaqahA, student_id: studentB, starts_on: "2000-01-01", ends_on: null, status: "active" },
      ];
    } else if (table === "students") {
      rows = [
        { id: studentA, name: "Santri A", nis: "0000000001", status: "Active" },
        { id: studentB, name: "Santri B", nis: "0000000002", status: "Active" },
      ];
    } else {
      rows = [];
    }
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const snapshot = await listSupabaseTahfidzSnapshot(tenant, actor, "Admin", false);
    assert.deepEqual(snapshot.records, []);
    assert.equal(snapshot.roster.length, 2, "roster tenant mencakup santri aktif");
    assert.equal(snapshot.halaqahs[0].studentCount, 2, "jumlah anggota halaqah dihitung dari penempatan aktif");
    assert.equal(snapshot.halaqahs[1].studentCount, 0, "halaqah tanpa penempatan memiliki jumlah nol");
    assert.ok(!Object.hasOwn(snapshot.halaqahs[0], "students"), "snapshot tidak menduplikasi identitas santri di tiap halaqah");
    const membershipQuery = requests.find((url) => url.pathname.endsWith("/tahfidz_memberships"));
    const targetQuery = requests.find((url) => url.pathname.endsWith("/tahfidz_targets"));
    const membershipStart = membershipQuery?.searchParams.get("starts_on") || "";
    const targetStart = targetQuery?.searchParams.get("period_start") || "";
    assert.match(membershipStart, /^lte\.\d{4}-\d{2}-\d{2}$/);
    assert.match(targetStart, /^lte\.\d{4}-\d{2}-\d{2}$/);
    const businessDate = membershipStart.slice("lte.".length);
    assert.equal(membershipQuery?.searchParams.get("or"), `(ends_on.is.null,ends_on.gte.${businessDate})`);
    assert.equal(targetQuery?.searchParams.get("or"), `(period_end.is.null,period_end.gte.${businessDate})`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
}

await testRecordPageDoesNotLoadFullSnapshot();
await testSnapshotOnlyLoadsCurrentMembershipsAndTargets();
console.log("Tes pagination riwayat Tahfidz lulus.");
