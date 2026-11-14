import assert from "node:assert/strict";
import {
  findSupabaseQuranSurah,
  isValidSupabaseQuranAyahRange,
  listSupabaseQuranSurahs,
  SupabaseQuranCatalogError,
} from "../src/server/supabaseQuranCatalog";
import { recordSupabaseTahfidzSetoran, SupabaseTahfidzError } from "../src/server/supabaseTahfidz";

const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalFetch = globalThis.fetch;
const rows = Array.from({ length: 114 }, (_, index) => ({
  surah_number: index + 1,
  name_latin: `Surah ${index + 1}`,
  ayah_count: index === 0 ? 7 : 286,
}));

async function run() {
  try {
    process.env.SUPABASE_URL = "https://staging.example.invalid/";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://staging.example.invalid");
      assert.equal(url.pathname, "/rest/v1/quran_surahs");
      assert.equal(url.searchParams.get("select"), "surah_number,name_latin,ayah_count");
      assert.equal(url.searchParams.get("order"), "surah_number.asc");
      assert.equal(url.searchParams.get("limit"), "115");
      assert.equal(new Headers(init?.headers).get("apikey"), "sb_secret_test_only");
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const catalog = await listSupabaseQuranSurahs();
    assert.equal(catalog.length, 114);
    assert.deepEqual(catalog[0], { nomor: 1, namaLatin: "Surah 1", jumlahAyat: 7 });
    assert.equal(catalog[113].nomor, 114);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, "Surah 1", 1, 7), true);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, " surah 1 ", 2, 2), true);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, "Unknown", 1, 2), false);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, "Surah 1", 1, 8), false);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, "Surah 1", 2, 1), false);
    assert.equal(isValidSupabaseQuranAyahRange(catalog, "Surah 1", 1.5, 2), false);
    assert.equal(findSupabaseQuranSurah(catalog, " sURAH 1 ")?.namaLatin, "Surah 1");
    assert.equal(findSupabaseQuranSurah(catalog, "Unknown"), null);

    const tenantId = "00000000-0000-4000-8000-000000000001";
    const actorId = "00000000-0000-4000-8000-000000000002";
    let setoranWrites = 0;
    let storedSurahName = "";
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/tenants") {
        assert.equal(url.searchParams.get("id"), `eq.${tenantId}`);
        return new Response(JSON.stringify([{ id: tenantId, status: "active" }]), { status: 200 });
      }
      if (url.pathname === "/rest/v1/profiles") {
        assert.equal(url.searchParams.get("tenant_id"), `eq.${tenantId}`);
        assert.equal(url.searchParams.get("user_id"), `eq.${actorId}`);
        return new Response(JSON.stringify([{ user_id: actorId, role: "admin", status: "active" }]), { status: 200 });
      }
      if (url.pathname === "/rest/v1/quran_surahs") {
        return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/rest/v1/rpc/record_tahfidz_setoran") {
        setoranWrites += 1;
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body || "{}")) as { p_surah_name?: string };
        storedSurahName = String(body.p_surah_name || "");
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unexpected Tahfidz test request: ${url.pathname}`);
    }) as typeof fetch;

    const makeSetoran = (surahName: string, ayahRange: string, clientRequestId: string) => ({
      studentId: "00000000-0000-4000-8000-000000000003",
      halaqahId: "00000000-0000-4000-8000-000000000004",
      activityType: "Ziyadah",
      surahName,
      ayahRange,
      fluencyGrade: "A",
      tajweedGrade: "A",
      notes: "",
      clientRequestId,
      performedAt: "2026-11-15T04:00:00.000Z",
    });

    await assert.rejects(
      recordSupabaseTahfidzSetoran(
        tenantId,
        actorId,
        "Admin",
        "Admin Uji",
        makeSetoran("Surah 1", "1-8", "00000000-0000-4000-8000-000000000005"),
      ),
      (error: unknown) => error instanceof SupabaseTahfidzError && error.status === 400,
    );
    assert.equal(setoranWrites, 0, "A verse outside the selected Surah must be rejected before the transaction RPC.");

    const stored = await recordSupabaseTahfidzSetoran(
      tenantId,
      actorId,
      "Admin",
      "Admin Uji",
      makeSetoran("sURAH 1", "1-7", "00000000-0000-4000-8000-000000000006"),
    );
    assert.equal(stored.success, true);
    assert.equal(setoranWrites, 1, "A catalog-backed Surah and Ayah range should reach the transaction RPC once.");
    assert.equal(storedSurahName, "Surah 1", "The transaction must store the catalog's canonical Surah name.");

    globalThis.fetch = (async () => new Response(JSON.stringify(rows.slice(0, 113)), { status: 200 })) as typeof fetch;
    await assert.rejects(listSupabaseQuranSurahs(), (error: unknown) =>
      error instanceof SupabaseQuranCatalogError && /belum lengkap/.test(error.message));

    const outOfOrderRows = [...rows];
    outOfOrderRows[0] = { ...outOfOrderRows[0], surah_number: 2 };
    globalThis.fetch = (async () => new Response(JSON.stringify(outOfOrderRows), { status: 200 })) as typeof fetch;
    await assert.rejects(listSupabaseQuranSurahs(), (error: unknown) =>
      error instanceof SupabaseQuranCatalogError && /belum valid/.test(error.message));

    globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    await assert.rejects(listSupabaseQuranSurahs(), (error: unknown) =>
      error instanceof SupabaseQuranCatalogError && error.status === 503);

    console.log("Passed: Quran catalog validation and Tahfidz setoran writes are server-validated against the canonical catalog before the transaction RPC.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
}

void run();


