import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, targetMigration, precisionGuardMigration, databaseTest, server, store, ui, manifest, publicKeys, envExample, compose] = await Promise.all([
  read("supabase/migrations/20270328000000_tahfidz_bulk_daily_target_write_api.sql"),
  read("supabase/migrations/20270329000000_tahfidz_target_decimal_precision.sql"),
  read("supabase/migrations/20270402000000_tahfidz_bulk_target_precision_guard.sql"),
  read("supabase/tests/tahfidz_bulk_target_write_api.test.sql"),
  read("server.ts"),
  read("src/server/supabaseTahfidz.ts"),
  read("src/pages/TahfidzManager.tsx"),
  read("package.json"),
  read("src/publicRuntimeConfigKeys.ts"),
  read(".env.example"),
  read("docker-compose.yml"),
]);

assert.match(migration, /cardinality\(p_student_ids\) > 250/);
assert.match(migration, /Santri target massal tidak boleh duplikat/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /public\.record_tahfidz_daily_target\(/);
assert.match(targetMigration, /p_ziyadah_pages_per_day <> trunc\(p_ziyadah_pages_per_day, 2\)/);
assert.match(targetMigration, /p_murojaah_pages_per_day <> trunc\(p_murojaah_pages_per_day, 2\)/);
assert.match(migration, /p_ziyadah_pages_per_day <> trunc\(p_ziyadah_pages_per_day, 2\)/);
assert.match(migration, /p_murojaah_pages_per_day <> trunc\(p_murojaah_pages_per_day, 2\)/);
assert.match(precisionGuardMigration, /p_ziyadah_pages_per_day <> trunc\(p_ziyadah_pages_per_day, 2\)/);
assert.match(precisionGuardMigration, /p_murojaah_pages_per_day <> trunc\(p_murojaah_pages_per_day, 2\)/);
assert.match(precisionGuardMigration, /SECURITY INVOKER/);
assert.match(precisionGuardMigration, /REVOKE ALL ON FUNCTION public\.record_tahfidz_daily_targets_bulk[\s\S]*?FROM PUBLIC, anon, authenticated/);
assert.match(precisionGuardMigration, /GRANT EXECUTE ON FUNCTION public\.record_tahfidz_daily_targets_bulk[\s\S]*?TO service_role/);
assert.doesNotMatch(precisionGuardMigration, /CREATE TABLE|DROP TABLE|DELETE FROM/);
assert.match(targetMigration, /Data target harian Tahfidz tidak valid/);
assert.match(migration, /FOREACH v_student_id IN ARRAY v_student_ids LOOP/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY[\s\S]*?FORCE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_tahfidz_daily_targets_bulk[\s\S]*?FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_tahfidz_daily_targets_bulk[\s\S]*?TO service_role/);
assert.match(databaseTest, /SELECT plan\(22\)/);
assert.equal([...databaseTest.matchAll(/^\s*SELECT\s+(?:is|ok|throws_ok)\(/gm)].length, 22, "the pgTAP plan must match the declared assertion count");
assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.tahfidz_target_bulk_write_requests TO service_role/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.doesNotMatch(migration, /WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id\s+FOR UPDATE/);
assert.match(databaseTest, /a rejected row rolls back all earlier rows in that batch/);
assert.match(databaseTest, /students from another tenant are rejected/);
assert.match(databaseTest, /same bulk request replays idempotently independent of input order/);
assert.match(databaseTest, /sub-cent page target is rejected rather than rounded/);
assert.match(databaseTest, /sub-cent murojaah target is rejected rather than rounded/);
assert.match(server, /app\.post\("\/api\/tahfidz\/targets\/bulk", requireAuth/);
assert.match(server, /tahfidzBulkTargetsEnabled[\s\S]*?if \(!tahfidzBulkTargetsEnabled\) return res\.status\(503\)/);
assert.match(server, /recordSupabaseTahfidzTargetsBulk\(actor\.tenantId, actor\.uid, actor\.role/);
assert.match(store, /export async function recordSupabaseTahfidzTargetsBulk\(/);
assert.match(store, /payload\.studentIds\.length > 250/);
assert.match(store, /new Set\(canonicalStudentIds\)\.size !== canonicalStudentIds\.length/);
assert.match(store, /record_tahfidz_daily_targets_bulk/);
assert.match(ui, /Atur Target Terpilih/);
assert.match(ui, /SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED[\s\S]*VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED/);
assert.match(ui, /SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED && <button/);
assert.match(ui, /colSpan=\{canManageTargets && SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED \? 8 : 7\}/);
assert.ok(ui.includes('isBulk ? "/api/tahfidz/targets/bulk" : "/api/tahfidz/targets"'));
assert.match(ui, /setSelectedTargetStudentIds\(\[\]\)/);
assert.equal(JSON.parse(manifest).scripts["test:tahfidz-bulk-targets"], "node scripts/test-tahfidz-bulk-targets.mjs");
assert.match(publicKeys, /"VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED"/);
assert.match(envExample, /^SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED=false$/m);
assert.match(envExample, /^VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED=false$/m);
assert.match(compose, /^\s+SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED: \$\{SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED:-false\}$/m);
assert.match(compose, /^\s+VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED: \$\{VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED:-false\}$/m);

console.log("Tahfidz bulk-target source checks passed: atomic RPC wiring, capped tenant batch, idempotency and authorization test coverage.");

