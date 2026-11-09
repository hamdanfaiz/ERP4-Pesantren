import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const migration = read("supabase", "migrations", "20270309000000_tahfidz_quran_surah_catalog.sql");
const seed = migration.match(/jsonb_to_recordset\(\$quran_catalog\$([\s\S]*?)\$quran_catalog\$::jsonb\)/);
assert.ok(seed, "Quran Surah seed must be an embedded migration fixture.");
const entries = [...seed[1].matchAll(/\{"surah_number":(\d+),"name_latin":"([^"]+)","ayah_count":(\d+)\}/g)]
  .map((match) => ({ number: Number(match[1]), name: match[2], count: Number(match[3]) }));
assert.equal(entries.length, 114, "Reference catalog must define all 114 Surahs.");
assert.deepEqual(entries.map(({ number }) => number), Array.from({ length: 114 }, (_, index) => index + 1),
  "Surah numbers must be complete and in Mushaf order.");
assert.equal(new Set(entries.map(({ name }) => name.toLocaleLowerCase("id-ID"))).size, 114,
  "Surah names must be unique.");
assert.equal(entries.reduce((sum, entry) => sum + entry.count, 0), 6236,
  "Reference catalog verse counts must sum to 6,236.");

assert.match(migration, /FOREIGN KEY \(surah_number\) REFERENCES public\.quran_surahs\(surah_number\)/,
  "New Tahfidz records must relate to the canonical Surah catalog.");
assert.match(migration, /NEW\.ayah_end > v_catalog\.ayah_count/,
  "Database must reject Ayah ranges outside the selected Surah.");
assert.match(migration, /Surah setoran tidak ditemukan pada katalog referensi/,
  "Database must reject free-text Surah values.");
assert.match(migration, /quran_surahs ENABLE ROW LEVEL SECURITY;[\s\S]*quran_surahs FORCE ROW LEVEL SECURITY/,
  "Global Quran references must be protected by forced RLS.");

const api = read("src", "server", "supabaseQuranCatalog.ts");
assert.match(api, /\/rest\/v1\/quran_surahs/,
  "Server endpoint must read the canonical catalog from Supabase.");
assert.match(api, /SUPABASE_SECRET_KEY \|\| process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
  "Database catalog access must use a server-only credential.");
assert.doesNotMatch(api, /equran\.id|fetch\([^)]*https?:\/\//i,
  "Supabase catalog access must not fall back to an external data source.");

const server = read("server.ts");
const routeStart = server.indexOf('app.get("/api/tahfidz/references/surahs"');
const routeEnd = server.indexOf('app.get("/api/quran/surat"', routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, "Server must expose a dedicated Tahfidz catalog endpoint.");
const route = server.slice(routeStart, routeEnd);
assert.match(route, /listSupabaseQuranSurahs\(\)/,
  "Tahfidz catalog API must serve the Supabase-backed reference list.");
assert.doesNotMatch(route, /equran\.id/,
  "Tahfidz catalog route must not proxy the external Quran API.");

const tahfidz = read("src", "pages", "TahfidzManager.tsx");
assert.match(tahfidz, /fetch\(["']\/api\/tahfidz\/references\/surahs["']/,
  "Tahfidz quick entry must read Surah options from the Supabase-backed endpoint.");
assert.doesNotMatch(tahfidz, /fetch\(["']\/api\/quran\/surat["']/,
  "Tahfidz quick entry must not use the external Quran proxy.");
const recordsStart = tahfidz.indexOf("const renderRecords = () =>");
const targetsStart = tahfidz.indexOf("const renderTargets = () =>", recordsStart);
assert.ok(recordsStart >= 0 && targetsStart > recordsStart,
  "Tahfidz record entry UI must remain identifiable for regression checks.");
const recordsUi = tahfidz.slice(recordsStart, targetsStart);
const surahSelector = recordsUi.match(/<select[\s\S]*?aria-label="Surah setoran cepat"[\s\S]*?<\/select>/);
assert.ok(surahSelector, "Quick entry must select a Surah from a controlled dropdown.");
assert.match(surahSelector[0], /surahList\.map\(/,
  "Surah choices must be populated from the fetched canonical catalog.");
assert.match(surahSelector[0], /surah\.namaLatin/,
  "Surah labels must come from the canonical catalog response.");
assert.doesNotMatch(recordsUi, /placeholder="Misal: Al-Baqarah"/,
  "Tahfidz quick entry must not allow free-text Surah names.");
const ayahStartSelector = recordsUi.match(/<select[\s\S]*?aria-label="Ayat mulai setoran cepat"[\s\S]*?<\/select>/);
const ayahEndSelector = recordsUi.match(/<select[\s\S]*?aria-label="Ayat akhir setoran cepat"[\s\S]*?<\/select>/);
assert.ok(ayahStartSelector && ayahEndSelector,
  "Quick entry must select an Ayah range instead of accepting free text.");
assert.match(ayahStartSelector[0], /length: quickEntryAyahCount/,
  "Start Ayah options must use the selected Surah's catalog Ayah count.");
assert.match(ayahEndSelector[0], /quickEntryAyahCount/,
  "End Ayah options must be bounded by the selected Surah's catalog Ayah count.");
assert.match(ayahStartSelector[0], /required/);
assert.match(ayahEndSelector[0], /required/);
assert.match(ayahEndSelector[0], /!formData\.ayatStart/,
  "End Ayah must remain unavailable until a start Ayah is selected.");

const runtimeApiTest = read("scripts", "test-tahfidz-runtime-http.mjs");
const gradeCatalogSeed = runtimeApiTest.indexOf("domain: 'academic_grade_level'");
const studentStructureSeed = runtimeApiTest.indexOf("admin.from('master_data_records').insert([");
assert.ok(gradeCatalogSeed >= 0 && studentStructureSeed > gradeCatalogSeed,
  "Tahfidz API fixtures must create the tenant grade catalog before class structure.");
assert.match(runtimeApiTest, /grade_level_reference_id: gradeReference\.id/,
  "Synthetic class, candidate, and Santri rows must preserve the tenant-owned grade relationship.");
assert.match(runtimeApiTest, /created_by_user_id: tenantAdmin\.uid[\s\S]*updated_by_user_id: tenantAdmin\.uid/,
  "Tenant grade catalog fixture must have an accountable tenant Admin actor.");
const structureSeedEnd = runtimeApiTest.indexOf("\n    ]);", studentStructureSeed);
const structureSeed = runtimeApiTest.slice(studentStructureSeed, structureSeedEnd);
assert.equal([...structureSeed.matchAll(/occupied: 0/g)].length, 3,
  "Batch-inserted Tahfidz structure fixtures must provide the required occupied count on every row.");

assert.match(tahfidz, /\[surahListAttempt, setSurahListAttempt\]/,
  "Failed catalog reads must support retry without forcing a full page reload.");
assert.match(recordsUi, /setSurahListAttempt\(\(attempt\) => attempt \+ 1\)[\s\S]*?Coba lagi/,
  "Quick entry must offer an accessible catalog retry action after a read failure.");

const pgTap = read("supabase", "tests", "tahfidz_runtime_write_api.test.sql");
for (const phrase of ["Quran catalog contains all 114 Surahs", "free-text Surah values are rejected", "Ayah numbers beyond the selected Surah are rejected"]) {
  assert.ok(pgTap.includes(phrase), `Database regression coverage must include: ${phrase}.`);
}

console.log("Tahfidz references passed: 114 Surahs, 6,236 Ayahs, tenant-linked API fixtures, and database-backed entry.");

