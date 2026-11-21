import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTahfidzLeaderboardResult, readTahfidzLeaderboardParticipantCount } from "../src/lib/tahfidzLeaderboardResponse.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = [
  "20270403000000_tahfidz_unique_memorization_leaderboard.sql",
  "20270404000000_tahfidz_unique_ayah_projection_indexes.sql",
].map((fileName) => fs.readFileSync(path.join(root, "supabase/migrations", fileName), "utf8")).join("\n");
const service = fs.readFileSync(path.join(root, "src/server/supabaseTahfidz.ts"), "utf8");
const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/TahfidzManager.tsx"), "utf8");
const dbTests = fs.readFileSync(path.join(root, "supabase/tests/tahfidz_runtime_write_api.test.sql"), "utf8");
const dashboardStart = page.indexOf("const renderSupabaseDashboard = () => {");
const dashboardEnd = page.indexOf("const renderSupabaseParentDashboard = () => {", dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, "Supabase Tahfidz dashboard stays independently testable.");
const dashboard = page.slice(dashboardStart, dashboardEnd);

assert.match(migration, /public\.list_tahfidz_roster_page\([\s\S]*?p_business_date[\s\S]*?FALSE\)/,
  "Leaderboard reuses the authenticated tenant, role, module, and assignment guard.");
assert.match(migration, /CREATE TABLE public\.tahfidz_student_ayah_progress/,
  "The source migration creates the persisted unique-ayah progress source used by the leaderboard.");
assert.match(migration, /ALTER TABLE public\.tahfidz_student_ayah_progress ENABLE ROW LEVEL SECURITY[\s\S]*?FORCE ROW LEVEL SECURITY/,
  "Persisted ayah progress is forced through row-level security.");
assert.match(migration, /CREATE POLICY tahfidz_student_ayah_progress_owner_all[\s\S]*?FOR ALL TO %I[\s\S]*?current_setting\(%L, true\)/,
  "Only the migration owner can access progress, scoped to the active tenant.");
assert.ok(migration.includes("USING (tenant_id = (SELECT NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID)) WITH CHECK (tenant_id = (SELECT NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID))"),
  "The progress policy evaluates the unchanged tenant context once per statement for reads and writes.");
assert.match(migration, /CREATE INDEX IF NOT EXISTS tahfidz_student_ayah_progress_tenant_halaqah_idx/,
  "The applied follow-up migration includes the tenant and halaqah lookup index.");
assert.match(migration, /CREATE TRIGGER tahfidz_records_sync_student_ayah_progress[\s\S]*?AFTER INSERT ON public\.tahfidz_records/,
  "New Ziyadah records update the unique-ayah progress table transactionally.");
assert.match(migration, /INSERT INTO public\.tahfidz_student_ayah_progress[\s\S]*?generate_series[\s\S]*?ON CONFLICT[\s\S]*?LEAST/,
  "Historical ayat are backfilled once and overlapping setoran do not double-count them.");
assert.match(migration, /record\.tenant_id = p_tenant_id[\s\S]*?record\.student_id = student\.id/,
  "Persisted setoran queries are tenant and student scoped.");
assert.match(migration, /halaqah\.ustadz_user_id = p_actor_user_id[\s\S]*?record\.halaqah_id = student\.halaqah_id/,
  "Ustadz results and counts stay inside currently assigned halaqah.");
assert.match(migration, /count\(DISTINCT \(record\.performed_at AT TIME ZONE v_time_zone\)::DATE\)[\s\S]*?AS ziyadah_active_days/i,
  "Active study days use the pesantren time zone.");
assert.match(migration, /count\(DISTINCT \(progress\.surah_number, progress\.ayah_number\)\)[\s\S]*?AS unique_memorized_ayahs/,
  "Ranking counts each memorized Surah and ayah only once.");
assert.match(migration, /ORDER BY unique_memorized_ayahs DESC, ziyadah_records DESC,[\s\S]*?ziyadah_active_days DESC, student_name, id/,
  "Lifetime ranking uses total unique hafalan first and stable setoran/day tie-breakers.");
assert.match(migration, /'uniqueMemorizedAyahs', limited\.unique_memorized_ayahs/,
  "The ranking response names the lifetime hafalan metric explicitly.");
assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?FROM PUBLIC, anon, authenticated/,
  "Browser roles cannot invoke the privileged SQL function directly.");
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?TO service_role/,
  "Only the trusted server role can invoke the ranking SQL function.");
assert.match(service, /export async function listSupabaseTahfidzLeaderboard\(/,
  "Server validates the leaderboard response before sending it to the browser.");
assert.match(service, /normalizeTahfidzLeaderboardResult\(result, pageSize\)/,
  "Server validates and normalizes both supported leaderboard response contracts.");
const responseNormalizer = fs.readFileSync(path.join(root, "src/lib/tahfidzLeaderboardResponse.mjs"), "utf8");
assert.match(responseNormalizer, /uniqueMemorizedAyahs/,
  "Response normalizer accepts the current staging RPC's lifetime unique memorized-ayah score.");
assert.match(responseNormalizer, /monthly_ziyadah/,
  "Response normalizer labels lifetime memorization separately from legacy monthly Ziyadah rankings.");
assert.match(responseNormalizer, /readTahfidzLeaderboardParticipantCount\(result\)/,
  "Response normalizer validates participant counts for empty and non-empty pages.");
assert.match(service, /\["Admin", "SuperAdmin", "Ustadz"\]\.includes\(role\)/,
  "Only staff roles receive cross-student leaderboard data.");
assert.match(responseNormalizer, /student\.ziyadahActiveDays > student\.ziyadahRecords/,
  "Server rejects impossible activity-day metrics.");
assert.match(server, /app\.get\("\/api\/tahfidz\/leaderboard", requireAuth/,
  "Leaderboard route requires an authenticated session.");
assert.match(server, /listSupabaseTahfidzLeaderboard\(\s*actor\.tenantId, actor\.uid, actor\.role/,
  "Route derives tenant and role from the verified profile.");
assert.match(dashboard, /isTahfidzViewScopeCurrent\(leaderboardScope, currentLeaderboardScopeKey\)/,
  "Leaderboard results fail closed when the active tenant, user, role, or module access changes.");
assert.match(dashboard, /Peringkat Hafalan Santri/,
  "The Tahfidz dashboard labels the requested lifetime hafalan leaderboard.");
assert.equal((dashboard.match(/Peringkat Hafalan Santri/g) ?? []).length, 1,
  "The Tahfidz dashboard renders the leaderboard only once.");
assert.match(dashboard, /student\.hafalanAyahs[\s\S]*?student\.ziyadahRecords[\s\S]*?student\.ziyadahActiveDays/,
  "Dashboard shows saved unique hafalan, setoran, and active-day metrics.");
assert.match(page, /\/api\/tahfidz\/leaderboard\?limit=\$\{limit\}/,
  "Dashboard fetches ranking data from the authenticated API.");
assert.match(dbTests, /lifetime ranking puts the learner with the most unique hafalan first/,
  "pgTAP checks that highest lifetime hafalan is ranked first.");
assert.match(dbTests, /overlapping Ziyadah ranges persist each student ayah once/,
  "pgTAP checks the transactional deduplication of overlapping ayah ranges.");
assert.match(dbTests, /Ustadz cannot see students outside assigned halaqahs/,
  "pgTAP checks teacher isolation.");
assert.match(dbTests, /ranking response excludes student NIS/,
  "pgTAP checks that the ranking never returns student NIS.");
const planned = Number(dbTests.match(/^SELECT\s+plan\((\d+)\);$/m)?.[1]);
const assertions = dbTests.match(/^SELECT\s+(?:is|ok|throws_ok)\s*\(/gm)?.length ?? 0;
assert.equal(planned, assertions, "pgTAP plan matches all Tahfidz assertions.");

assert.equal(readTahfidzLeaderboardParticipantCount({ students: [], hasMore: false }), 0,
  "An older RPC response with a complete empty page safely means zero participants.");
assert.equal(readTahfidzLeaderboardParticipantCount({ students: [], hasMore: false, participants: 0 }), 0,
  "A current empty leaderboard preserves its explicit zero count.");
assert.equal(readTahfidzLeaderboardParticipantCount({ students: [{ id: "student-1" }], hasMore: false }), null,
  "Non-empty legacy responses cannot hide missing participant metrics.");
assert.equal(readTahfidzLeaderboardParticipantCount({ students: [], hasMore: true }), null,
  "An incomplete page without its participant count remains invalid.");
assert.equal(readTahfidzLeaderboardParticipantCount({ students: [], hasMore: false, participants: "0" }), null,
  "Malformed count types remain rejected.");

const lifetimePayload = normalizeTahfidzLeaderboardResult({
  businessDate: "2026-11-21",
  students: [{
    rank: 1,
    id: "d1800000-0000-4000-8000-000000000201",
    name: "Santri UAT",
    grade: "UAT",
    halaqah: "Halaqah UAT",
    uniqueMemorizedAyahs: 25,
    ziyadahRecords: 2,
    ziyadahActiveDays: 2,
  }],
  hasMore: false,
  participants: 1,
}, 5);
assert.equal(lifetimePayload?.rankingMode, "lifetime_hafalan",
  "VQE's current RPC payload is normalized as lifetime memorization.");
assert.equal(lifetimePayload?.students[0]?.hafalanAyahs, 25,
  "Lifetime unique memorized ayat survives response normalization.");
assert.equal(lifetimePayload?.students[0]?.ziyadahAyahs, null,
  "Lifetime hafalan is never mislabeled as monthly Ziyadah ayat.");

const monthlyPayload = normalizeTahfidzLeaderboardResult({
  periodStart: "2026-11-01",
  businessDate: "2026-11-21",
  students: [{
    rank: 1,
    id: "d1800000-0000-4000-8000-000000000201",
    name: "Santri UAT",
    grade: "UAT",
    halaqah: "Halaqah UAT",
    ziyadahRecords: 2,
    ziyadahAyahs: 25,
    ziyadahActiveDays: 2,
  }],
  hasMore: false,
  participants: 1,
}, 5);
assert.equal(monthlyPayload?.rankingMode, "monthly_ziyadah",
  "Older monthly RPC payload remains identifiable for backward compatibility.");
assert.equal(monthlyPayload?.students[0]?.hafalanAyahs, null,
  "Monthly Ziyadah totals are never presented as lifetime hafalan.");
assert.equal(normalizeTahfidzLeaderboardResult({
  businessDate: "2026-11-21",
  students: [{ rank: 1, id: "d1800000-0000-4000-8000-000000000201", name: "Santri UAT", uniqueMemorizedAyahs: -1, ziyadahRecords: 1, ziyadahActiveDays: 1 }],
  hasMore: false,
  participants: 1,
}, 5), null, "Invalid negative hafalan totals are rejected.");

console.log(`Tahfidz leaderboard checks passed: tenant, role, halaqah, ranking, UI scope, and ${assertions} database assertions.`);
