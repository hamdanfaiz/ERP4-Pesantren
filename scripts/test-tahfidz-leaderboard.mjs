import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20270310000000_tahfidz_persisted_leaderboard.sql"), "utf8");
const server = fs.readFileSync(path.join(root, "src/server/supabaseTahfidz.ts"), "utf8");
const routes = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/TahfidzManager.tsx"), "utf8");
const dbTests = fs.readFileSync(path.join(root, "supabase/tests/tahfidz_runtime_write_api.test.sql"), "utf8");

assert.match(migration, /public\.list_tahfidz_roster_page\([\s\S]*?p_business_date[\s\S]*?FALSE\)/,
  "Leaderboard must reuse the canonical active profile, role, tenant, and module guard.");
assert.match(migration, /record\.tenant_id = p_tenant_id/,
  "Leaderboard records must be tenant scoped.");
assert.match(migration, /halaqah\.ustadz_user_id = p_actor_user_id/,
  "Ustadz leaderboard results must be restricted to assigned halaqah.");
assert.match(migration, /record\.activity_type = 'Ziyadah'/,
  "Leaderboard score must count actual Ziyadah records.");
assert.match(migration, /CREATE INDEX IF NOT EXISTS tahfidz_records_ziyadah_leaderboard_idx[\s\S]*?ON public\.tahfidz_records \(tenant_id, performed_at\)[\s\S]*?INCLUDE \(halaqah_id, student_id, ayah_start, ayah_end\)[\s\S]*?WHERE activity_type = 'Ziyadah'/,
  "Leaderboard must have a narrow tenant/date index covering only Ziyadah data.");
assert.match(migration, /p_expected_role <> 'ustadz' OR record\.halaqah_id = student\.halaqah_id/,
  "Ustadz ranking must count only records recorded in the currently assigned halaqah.");
assert.match(migration, /record\.performed_at >=[\s\S]*?record\.performed_at </,
  "Leaderboard must use the tenant-local month window.");
assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?FROM PUBLIC, anon, authenticated/,
  "Leaderboard RPC must not be callable directly by browser roles.");
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.list_tahfidz_leaderboard[\s\S]*?TO service_role/,
  "Only the trusted server role should execute the leaderboard RPC.");

assert.match(server, /export async function listSupabaseTahfidzLeaderboard\(/,
  "Server must expose a validated leaderboard reader.");
assert.match(server, /\["Admin", "SuperAdmin", "Ustadz"\]\.includes\(role\)/,
  "Leaderboard must not reveal other learners to Santri or Walisantri accounts.");
assert.match(server, /\/rest\/v1\/rpc\/list_tahfidz_leaderboard/,
  "Server must read the persisted leaderboard RPC.");
assert.match(routes, /app\.get\("\/api\/tahfidz\/leaderboard", requireAuth/,
  "Leaderboard endpoint must require an authenticated session.");
assert.match(routes, /listSupabaseTahfidzLeaderboard\(\s*actor\.tenantId, actor\.uid, actor\.role/,
  "Endpoint must use the verified tenant and actor from the authenticated profile.");

assert.match(page, /\/api\/tahfidz\/leaderboard\?limit=\$\{limit\}/,
  "Tahfidz dashboard must load ranking data from the authenticated backend.");
const dashboardStart = page.indexOf("const renderSupabaseDashboard = () => {");
const dashboardEnd = page.indexOf("const renderSupabaseParentDashboard = () => {", dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart,
  "The Supabase dashboard renderer must remain independently identifiable from the legacy demo renderer.");
const supabaseDashboard = page.slice(dashboardStart, dashboardEnd);
assert.match(supabaseDashboard, /Peringkat Setoran Ziyadah/,
  "Supabase dashboard must retain the reference leaderboard feature.");
assert.match(supabaseDashboard, /\["Admin", "SuperAdmin", "Ustadz"\]\.includes\(role\)/,
  "Persisted leaderboard must render for staff roles in the Supabase dashboard, not only in the legacy demo.");
assert.match(supabaseDashboard, /student\.ziyadahRecords/,
  "Leaderboard UI must show the persisted setoran count, not fixed display values.");

assert.match(dbTests, /monthly leaderboard counts persisted Ziyadah records but excludes Murojaah/,
  "Database regression tests must distinguish Ziyadah from Murojaah.");
assert.match(dbTests, /Ustadz cannot see leaderboard students outside assigned halaqahs/,
  "Database regression tests must cover halaqah isolation.");
assert.match(dbTests, /Ustadz leaderboard excludes records from a prior halaqah assignment/,
  "Database regression tests must prevent historical halaqah records leaking into a new teacher scope.");
assert.match(dbTests, /learner role cannot read other students leaderboard data/,
  "Database regression tests must cover learner privacy.");
const plannedAssertions = Number(dbTests.match(/^SELECT\s+plan\((\d+)\);$/m)?.[1]);
const actualAssertions = dbTests.match(/^SELECT\s+(?:is|ok|throws_ok)\s*\(/gm)?.length ?? 0;
assert.equal(plannedAssertions, actualAssertions,
  "Tahfidz pgTAP plan must match the assertion statements so every database check runs.");

console.log(`Tahfidz leaderboard source checks passed: persisted tenant-month score, staff-only API, halaqah scope, UI parity, and ${actualAssertions} pgTAP assertions.`);
