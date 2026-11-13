import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listSupabaseQuranSurahs, SupabaseQuranCatalogError } from "../src/server/supabaseQuranCatalog";

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

    const tahfidzUi = readFileSync(fileURLToPath(new URL("../src/pages/TahfidzManager.tsx", import.meta.url)), "utf8");
    assert.match(tahfidzUi, /SUPABASE_TAHFIDZ_RUNTIME\\s*\\?\\s*await requestSupabaseTahfidzApi\\("\\/api\\/tahfidz\\/references\\/surahs"/);
    const recordsStart = tahfidzUi.indexOf("const renderRecords = () => (");
    const recordsEnd = tahfidzUi.indexOf("const renderTargets = () => (", recordsStart);
    assert.ok(recordsStart >= 0 && recordsEnd > recordsStart, "Tahfidz quick-entry UI boundary should exist");
    const recordsUi = tahfidzUi.slice(recordsStart, recordsEnd);
    const surahSelectStart = recordsUi.indexOf("{SUPABASE_TAHFIDZ_RUNTIME ? <select");
    const surahLegacyFallback = recordsUi.indexOf(" : <input", surahSelectStart);
    assert.ok(surahSelectStart >= 0 && surahLegacyFallback > surahSelectStart, "Supabase mode must render the catalogue-backed Surah select");
    const supabaseSurahSelect = recordsUi.slice(surahSelectStart, surahLegacyFallback);
    assert.match(supabaseSurahSelect, /surahList\\.map\\(/, "Surah options must come from the loaded reference catalogue");
    assert.match(recordsUi, /formData\\.ayatCount/, "Ayah options must use the selected Surah reference count");
    assert.match(recordsUi, /ayah >= Number\\(formData\\.ayatStart\\)/, "End ayah choices must not precede the start ayah");
    assert.doesNotMatch(tahfidzUi, /belum terhubung ke layanan backend dan tidak menjalankan aksi/i, "Operator-facing backend notes must not appear in the Tahfidz UI");
    assert.match(tahfidzUi, /aria-label="Penilaian audio AI belum tersedia"/);

    console.log("Passed: Quran catalog validates server data and Tahfidz Supabase entry uses reference-backed Surah and bounded Ayah controls.");
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

