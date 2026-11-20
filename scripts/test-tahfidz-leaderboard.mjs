import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTahfidzLeaderboardParticipantCount } from "../src/lib/tahfidzLeaderboardResponse.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20270403000000_tahfidz_unique_memorization_leaderboard.sql"), "utf8");
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
assert.match(migration, /record\.tenant_id = p_tenant_id[\s\S]*?record\.student_id = student\.id/,
  "Persisted setoran queries are tenant and student scoped.");
assert.match(migration, /halaqah\.ustadz_user_id = p_actor_user_id[\s\S]*?record\.halaqah_id = student\.halaqah_id/,
  "Ustadz results and counts stay inside currently assigned halaqah.");
assert.match(migration, /count\(DISTINCT \(progress\.surah_number, progress\.ayah_number\)\)/i,
  "Lifetime memorization counts distinct Surah/Ayah pairs.");
assert.match(migration, /ORDER BY unique_memorized_ayahs DESC, ziyadah_records DESC,[\s\S]*?ziyadah_active_days DESC, student_name, id/,
  "Ranking prioritizes unique memorized ayat with stable tie-breakers.");
assert.match(migration, /first_performed_at < v_business_cutoff/,
  "Future-dated records are excluded from the business-date snapshot.");
assert.match(migration, /tahfidz_student_ayah_progress_owner_all[\s\S]*?FOR ALL TO %I[\s\S]*?tenant_id = NULLIF\(pg_catalog\.current_setting\(%L, true\), %L\)/,
  "Projection RLS requires the trusted routine to set the matching tenant scope.");
assert.doesNotMatch(migration, /USING\s*\(true\)|WITH CHECK\s*\(true\)/i,
  "Projection RLS never allows unconditional row access.");
assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?FROM PUBLIC, anon, authenticated/,
  "Browser roles cannot invoke the privileged SQL function directly.");
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?TO service_role/,
  "Only the trusted server role can invoke the ranking SQL function.");
assert.match(service, /export async function listSupabaseTahfidzLeaderboard\(/,
  "Server validates the leaderboard response before sending it to the browser.");
assert.match(service, /readTahfidzLeaderboardParticipantCount\(result\)/,
  "Server normalizes participant counts for empty and current leaderboard payloads.");
assert.match(service, /\["Admin", "SuperAdmin", "Ustadz"\]\.includes\(role\)/,
  "Only staff roles receive cross-student leaderboard data.");
assert.match(service, /student\.uniqueMemorizedAyahs > 6236/,
  "Server rejects impossible Quran-wide unique-ayah totals.");
assert.match(service, /student\.ziyadahActiveDays > student\.ziyadahRecords/,
  "Server rejects impossible activity-day metrics.");
assert.match(server, /app\.get\("\/api\/tahfidz\/leaderboard", requireAuth/,
  "Leaderboard route requires an authenticated session.");
assert.match(server, /listSupabaseTahfidzLeaderboard\(\s*actor\.tenantId, actor\.uid, actor\.role/,
  "Route derives tenant and role from the verified profile.");
assert.equal((dashboard.match(/Peringkat Hafalan Terbanyak/g) || []).length, 1,
  "The dashboard contains one lifetime memorization leaderboard.");
assert.match(dashboard, /student\.uniqueMemorizedAyahs[\s\S]*?student\.ziyadahRecords[\s\S]*?student\.ziyadahActiveDays/,
  "Dashboard emphasizes unique ayat before activity metrics.");
assert.match(dashboard, /Ayat yang sama hanya dihitung sekali/,
  "Dashboard explains duplicate-ayah handling.");
assert.match(dashboard, /isTahfidzViewScopeCurrent\(leaderboardScope, currentLeaderboardScopeKey\)/,
  "Leaderboard results fail closed when the active tenant, user, role, or module access changes.");
assert.match(page, /\/api\/tahfidz\/leaderboard\?limit=\$\{limit\}/,
  "Dashboard fetches ranking data from the authenticated API.");
assert.match(dbTests, /ranking prioritizes the student with the most unique Ziyadah ayat/,
  "pgTAP checks unique-ayah ranking.");
assert.match(dbTests, /overlapping ayah ranges and prior setoran count once/,
  "pgTAP checks lifetime deduplication.");
assert.match(dbTests, /Ustadz cannot see students outside assigned halaqahs/,
  "pgTAP checks teacher isolation.");
assert.match(dbTests, /ranking response excludes student NIS/,
  "pgTAP checks that the ranking never returns student NIS.");
assert.match(dbTests, /Ustadz totals include only unique ayat from their assigned halaqah/,
  "pgTAP checks instructor-specific ayah scope.");
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

console.log(`Tahfidz leaderboard checks passed: tenant, role, halaqah, ranking, UI scope, and ${assertions} database assertions.`);
