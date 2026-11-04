import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  compareMigrationVersions,
  canonicalizeMigrationStatements,
  canonicalizeSqlStatement,
  databaseUrlFromSupabaseStatus,
  databaseUrlFromEnvironment,
  formatReport,
  listLocalMigrations,
  parseAppliedMigrationsOutput,
  psqlEnvironmentFromDatabaseUrl,
  READ_ONLY_LEDGER_QUERY,
  splitSqlStatements,
} from './preflight-supabase-migrations.mjs';

assert.equal(databaseUrlFromEnvironment({
  SUPABASE_DB_URL: 'postgresql://direct.example.invalid/postgres',
  SUPABASE_DB_POOLER_URL: 'postgresql://pooler.example.invalid/postgres',
}), 'postgresql://pooler.example.invalid/postgres');
assert.equal(
  databaseUrlFromEnvironment({ SUPABASE_DB_URL: 'postgresql://direct.example.invalid/postgres' }),
  'postgresql://direct.example.invalid/postgres'
);
assert.equal(databaseUrlFromEnvironment({}), '');

const local = listLocalMigrations([
  '20270102000000_guardians.sql',
  '20270101000000_profiles.sql',
  'README.md',
]);
assert.deepEqual(local.map(({ version }) => version), ['20270101000000', '20270102000000']);

assert.throws(
  () => listLocalMigrations(['20270101000000_first.sql', '20270101000000_second.sql']),
  /duplikat/
);
assert.throws(() => listLocalMigrations(['bad-name.sql']), /format Supabase/);

const sqlWithQuotedSemicolons = [
  '-- migration comment',
  'CREATE FUNCTION example() RETURNS text AS $body$',
  "BEGIN RETURN 'semicolon; and  spaces'; END;",
  '$body$ LANGUAGE plpgsql;',
  "INSERT INTO example_table(value) VALUES ('inside; a literal');",
].join('\n');
assert.equal(splitSqlStatements(sqlWithQuotedSemicolons).length, 2);
assert.equal(canonicalizeMigrationStatements(sqlWithQuotedSemicolons).length, 2);
assert.equal(
  canonicalizeSqlStatement('SELECT value /* old comment */ FROM records'),
  canonicalizeSqlStatement('SELECT value /* changed comment */ FROM records')
);
assert.notEqual(
  canonicalizeSqlStatement("SELECT 'two  spaces'"),
  canonicalizeSqlStatement("SELECT 'two spaces'")
);
assert.equal(
  canonicalizeSqlStatement('SELECT /* old */\n value FROM records'),
  canonicalizeSqlStatement('SELECT value FROM records')
);
assert.equal(
  canonicalizeSqlStatement('SELECT $body$-- still text;\n$body$'),
  'SELECT $body$-- still text;\n$body$'
);

const sourceMigrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const sourceMigrationsWithSql = listLocalMigrations(
  readdirSync(sourceMigrationsUrl),
  (fileName) => readFileSync(new URL(fileName, sourceMigrationsUrl), 'utf8')
);
assert.equal(sourceMigrationsWithSql.length, 132);
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270203000000_boarding_unit_scope.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270204000000_tahfidz_achievement_summary.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270205000000_guardian_self_registration.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270207000000_public_schema_migration_ownership.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270209000000_harden_ppdb_trigger_search_path.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270210000000_internalize_tenant_rls_helpers.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270211000000_optimize_profile_rls_initplans.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270212000000_optimize_core_tenant_query_indexes.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20261031225438_master_data_audit_feed.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270214120000_tenant_reference_relationships.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270215000000_harden_reference_relationship_contract.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270216000000_tenant_operational_choice_relationships.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270217000000_index_tenant_choice_foreign_keys.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270218000000_operational_relationships_and_naming_series.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270225000000_restore_idempotency_for_generated_identifiers.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270219000000_naming_series_master_data_ids.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270220000000_student_nis_source_idempotency.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270221000000_enforce_auto_business_identifiers.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270222000000_extend_naming_series_business_identifiers.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270223000000_additional_operational_naming_series.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270224000000_ga_business_identifier_update_guard.sql'));
assert(sourceMigrationsWithSql.some(({ fileName }) => fileName === '20270228000000_academic_record_cursor_indexes.sql'));
assert(sourceMigrationsWithSql.every(({ statements }) => Array.isArray(statements) && statements.length > 0));

const migrationIndex = (fileName) => sourceMigrationsWithSql.findIndex((migration) => migration.fileName === fileName);
const tenantReferencesIndex = migrationIndex('20270214120000_tenant_reference_relationships.sql');
const requiredPredecessors = [
  '20270126000000_tenant_enterprise_units.sql',
  '20270128000000_finance_expense_unit_scope.sql',
  '20270129000000_finance_budget_unit_scope.sql',
  '20270130000000_master_data_unit_assignment.sql',
  '20270201000000_academic_unit_scope.sql',
];
for (const fileName of requiredPredecessors) {
  const index = migrationIndex(fileName);
  assert(index >= 0, `Migration prasyarat tidak ditemukan: ${fileName}`);
  assert(tenantReferencesIndex > index, `${fileName} harus dijalankan sebelum migrasi katalog tenant`);
}
const referenceContractIndex = migrationIndex('20270215000000_harden_reference_relationship_contract.sql');
assert(referenceContractIndex >= 0);
assert(tenantReferencesIndex < referenceContractIndex);

const sqlLocal = listLocalMigrations(
  ['20270101000000_profiles.sql'],
  () => '-- local comment\nCREATE TABLE profiles (id uuid PRIMARY KEY);'
);
const sqlApplied = parseAppliedMigrationsOutput(JSON.stringify([{
  version: '20270101000000',
  name: 'profiles',
  statements: ['-- comment from the database\nCREATE TABLE profiles (id uuid PRIMARY KEY)'],
}]));
const matchingSql = compareMigrationVersions(sqlLocal, sqlApplied);
assert.equal(matchingSql.statementMismatches.length, 0);
assert.equal(matchingSql.canContinueToStagingReview, true);

// Supabase can store a migration file as one ledger element; split it safely
// before comparing it with the local statement list, including dollar-quoted bodies.
const bundledSql = [
  '-- a complete migration may arrive as one stored string',
  'CREATE TABLE profiles (id uuid PRIMARY KEY);',
  'CREATE FUNCTION profile_probe() RETURNS void LANGUAGE plpgsql AS $body$',
  'BEGIN PERFORM 1; RETURN; END;',
  '$body$;',
  'GRANT SELECT ON profiles TO authenticated;',
].join('\n');
const bundledLocal = listLocalMigrations(
  ['20270103000000_bundled.sql'],
  () => bundledSql
);
const bundledApplied = parseAppliedMigrationsOutput(JSON.stringify([{
  version: '20270103000000',
  name: 'bundled',
  statements: [bundledSql],
}]));
const bundledReport = compareMigrationVersions(bundledLocal, bundledApplied);
assert.equal(bundledLocal[0].statements.length, 3);
assert.equal(bundledApplied[0].statements.length, 3);
assert.equal(bundledReport.statementMismatches.length, 0);
assert.equal(bundledReport.canContinueToStagingReview, true);

const emptyAppliedStatement = compareMigrationVersions(sqlLocal, [{
  version: '20270101000000',
  name: 'profiles',
  statements: [';'],
}]);
assert.equal(emptyAppliedStatement.statementMismatches[0].reason, 'missing');

const changedSql = compareMigrationVersions(sqlLocal, [{
  version: '20270101000000',
  name: 'profiles',
  statements: ['CREATE TABLE profiles (id text PRIMARY KEY)'],
}]);
assert.equal(changedSql.statementMismatches.length, 1);
assert.equal(changedSql.canContinueToStagingReview, false);
assert.match(formatReport(changedSql), /statement SQL pada ledger/);

const absentSql = compareMigrationVersions(sqlLocal, [{ version: '20270101000000', name: 'profiles', statements: null }]);
assert.equal(absentSql.statementMismatches[0].reason, 'missing');
assert.equal(absentSql.canContinueToStagingReview, false);

const tenantReferenceMigration = sourceMigrationsWithSql.find(({ fileName }) =>
  fileName === '20270214120000_tenant_reference_relationships.sql'
);
const oldTenantReferenceAlias = compareMigrationVersions([tenantReferenceMigration], [{
  version: '20261101015832',
  name: 'tenant_reference_relationships',
  statements: tenantReferenceMigration.statements,
}]);
assert.deepEqual(oldTenantReferenceAlias.unknownApplied, []);
assert.equal(oldTenantReferenceAlias.pending.length, 0);
assert.equal(oldTenantReferenceAlias.statementMismatches.length, 0);
assert.deepEqual(oldTenantReferenceAlias.migrationAliasesPendingRepair, [{
  from: '20261101015832', to: '20270214120000', name: 'tenant_reference_relationships',
}]);
assert.deepEqual(oldTenantReferenceAlias.validatedMigrationAliases, [{
  from: '20261101015832', to: '20270214120000', name: 'tenant_reference_relationships',
}]);
assert.equal(oldTenantReferenceAlias.canContinueToStagingReview, false);
assert.match(formatReport(oldTenantReferenceAlias), /riwayat migrasi staging masih memakai versi lama/);
assert.match(formatReport(oldTenantReferenceAlias), /SQL cocok persis/);

const changedTenantReferenceAlias = compareMigrationVersions([tenantReferenceMigration], [{
  version: '20261101015832',
  name: 'tenant_reference_relationships',
  statements: ['CREATE TABLE public.tenant_reference_items (id text PRIMARY KEY)'],
}]);
assert.equal(changedTenantReferenceAlias.statementMismatches.length, 1);
assert.equal(changedTenantReferenceAlias.canContinueToStagingReview, false);

const repairedTenantReferenceAlias = compareMigrationVersions([tenantReferenceMigration], [{
  version: '20270214120000',
  name: null,
  statements: null,
}]);
assert.equal(repairedTenantReferenceAlias.unknownApplied.length, 0);
assert.equal(repairedTenantReferenceAlias.nameMismatches.length, 0);
assert.equal(repairedTenantReferenceAlias.statementMismatches.length, 0);
assert.deepEqual(repairedTenantReferenceAlias.repairedMigrationAliases, [{
  version: '20270214120000', name: 'tenant_reference_relationships',
}]);
assert.equal(repairedTenantReferenceAlias.canContinueToStagingReview, true);
assert.match(formatReport(repairedTenantReferenceAlias), /telah direkonsiliasi dengan migration repair/);

const changedRepairedTenantReferenceAlias = compareMigrationVersions([tenantReferenceMigration], [{
  version: '20270214120000',
  name: 'tenant_reference_relationships',
  statements: ['CREATE TABLE public.tenant_reference_items (id text PRIMARY KEY)'],
}]);
assert.equal(changedRepairedTenantReferenceAlias.statementMismatches.length, 1);
assert.equal(changedRepairedTenantReferenceAlias.canContinueToStagingReview, false);
assert.throws(() => compareMigrationVersions([tenantReferenceMigration], [
  { version: '20261101015832', name: 'tenant_reference_relationships', statements: tenantReferenceMigration.statements },
  { version: '20270214120000', name: 'tenant_reference_relationships', statements: tenantReferenceMigration.statements },
]), /duplikat/);

const normal = compareMigrationVersions(local, [{ version: '20270101000000', name: 'profiles' }]);
assert.equal(normal.appliedCount, 1);
assert.equal(normal.pending.length, 1);
assert.equal(normal.pending[0].version, '20270102000000');
assert.equal(normal.canContinueToStagingReview, true);
assert.match(formatReport(normal), /Migration yang belum tercatat \(1\)/);

const unknownRemote = compareMigrationVersions(local, [{ version: '20261231000000', name: 'not_in_repository' }]);
assert.deepEqual(unknownRemote.unknownApplied, ['20261231000000']);
assert.equal(unknownRemote.canContinueToStagingReview, false);
assert.match(formatReport(unknownRemote), /HENTIKAN/);
assert.doesNotMatch(formatReport(unknownRemote), /selaras/);

const outOfOrder = compareMigrationVersions(local, [{ version: '20270102000000', name: 'guardians' }]);
assert.deepEqual(outOfOrder.outOfOrderPending.map(({ version }) => version), ['20270101000000']);
assert.equal(outOfOrder.canContinueToStagingReview, false);

// Regression fixture for the local upgrade-rehearsal boundary through
// 20261206000000, including the migration Supabase recorded as 20261031104213.
// The already-applied staging alias is covered separately below.
const missingStagingMetadataVersions = new Set(['20261205000000', '20261206000000']);
const observedStagingMigrations = sourceMigrationsWithSql
  .filter(({ version }) => version <= '20261206000000')
  .map(({ version, fileName, statements }) => ({
    version,
    name: missingStagingMetadataVersions.has(version)
      ? null
      : fileName.replace(/^\d{14}_/, '').replace(/\.sql$/i, ''),
    // Mirror the observed gap without embedding staging SQL in this fixture.
    statements: missingStagingMetadataVersions.has(version) ? null : statements,
  }));
assert.equal(observedStagingMigrations.length, 49);
assert.equal(sourceMigrationsWithSql.length, 132);
const stagingBaseline = compareMigrationVersions(sourceMigrationsWithSql, observedStagingMigrations);
assert.equal(stagingBaseline.appliedCount, 49);
assert.equal(stagingBaseline.latestAppliedVersion, '20261206000000');
assert.equal(stagingBaseline.pending.length, 83);
assert.equal(stagingBaseline.pending[0].version, '20261207000000');
assert.equal(stagingBaseline.pending.at(-1).version, '20270228000000');
assert.equal(stagingBaseline.outOfOrderPending.length, 0);
assert.equal(stagingBaseline.unknownApplied.length, 0);
assert.deepEqual(stagingBaseline.nameMismatches.map(({ version }) => version), [...missingStagingMetadataVersions]);
assert.deepEqual(stagingBaseline.statementMismatches.map(({ version, reason }) => ({ version, reason })), [
  { version: '20261205000000', reason: 'missing' },
  { version: '20261206000000', reason: 'missing' },
]);
assert.equal(stagingBaseline.canContinueToStagingReview, false);
assert.match(formatReport(stagingBaseline), /HENTIKAN/);

const twoMetadataMissingMigrations = sourceMigrationsWithSql.filter(({ version }) =>
  ['20261205000000', '20261206000000'].includes(version)
);
const missingLedgerNames = compareMigrationVersions(twoMetadataMissingMigrations, [
  { version: '20261205000000', name: null },
  { version: '20261206000000', name: null },
]);
assert.deepEqual(missingLedgerNames.nameMismatches.map(({ version }) => version), ['20261205000000', '20261206000000']);
assert.deepEqual(missingLedgerNames.statementMismatches.map(({ version, reason }) => ({ version, reason })), [
  { version: '20261205000000', reason: 'missing' },
  { version: '20261206000000', reason: 'missing' },
]);
assert.equal(missingLedgerNames.canContinueToStagingReview, false);
assert.match(formatReport(missingLedgerNames), /nama migration pada ledger kosong/);
assert.match(formatReport(missingLedgerNames), /statement SQL pada ledger kosong/);

const wrongLedgerName = compareMigrationVersions(local, [{ version: '20270101000000', name: 'different_name' }]);
assert.equal(wrongLedgerName.nameMismatches.length, 1);
assert.equal(wrongLedgerName.canContinueToStagingReview, false);

assert.throws(() => compareMigrationVersions(local, ['invalid-version']), /tidak valid/);
assert.throws(() => compareMigrationVersions(local, ['20270101000000', '20270101000000']), /duplikat/);
assert.deepEqual(parseAppliedMigrationsOutput('[{"version":"20270101000000","name":null}]'), [
  { version: '20270101000000', name: null, statements: null },
]);
assert.throws(() => parseAppliedMigrationsOutput('not-json'), /bukan JSON/);

const localPsqlEnv = psqlEnvironmentFromDatabaseUrl('postgresql://postgres:p%40ss@localhost:54322/postgres');
assert.equal(localPsqlEnv.PGPASSWORD, 'p@ss');
assert.equal(localPsqlEnv.PGSSLMODE, 'disable');
assert.equal(localPsqlEnv.PGPORT, '54322');
assert.equal(localPsqlEnv.PGOPTIONS, '-c default_transaction_read_only=on');

const remotePsqlEnv = psqlEnvironmentFromDatabaseUrl('postgresql://postgres:p%40ss@db.example.invalid:5432/postgres');
assert.equal(remotePsqlEnv.PGSSLMODE, 'require');
assert.throws(
  () => psqlEnvironmentFromDatabaseUrl('postgresql://postgres:p%40ss@db.example.invalid/postgres?sslmode=disable'),
  /SSL mode/
);
assert.throws(() => psqlEnvironmentFromDatabaseUrl('https://db.example.invalid'), /protokol/);
assert.equal(
  psqlEnvironmentFromDatabaseUrl('postgresql://postgres:pw@[::1]:5432/postgres').PGHOST,
  '::1'
);
assert.equal(
  databaseUrlFromSupabaseStatus('API_URL=http://127.0.0.1:54321\nDB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"'),
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
);
assert.equal(
  databaseUrlFromSupabaseStatus('export DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
);
assert.throws(() => databaseUrlFromSupabaseStatus('API_URL=http://127.0.0.1:54321'), /DB_URL/);

assert.match(READ_ONLY_LEDGER_QUERY, /BEGIN READ ONLY/);
assert.match(READ_ONLY_LEDGER_QUERY, /SELECT COALESCE/);
assert.match(READ_ONLY_LEDGER_QUERY, /version::text/);
assert.match(READ_ONLY_LEDGER_QUERY, /'name', name/);
assert.match(READ_ONLY_LEDGER_QUERY, /'statements', statements/);
assert.match(READ_ONLY_LEDGER_QUERY, /COMMIT/);
assert.doesNotMatch(READ_ONLY_LEDGER_QUERY, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);

console.log('Supabase migration preflight logic passed: version/name/SQL lineage comparison, safe SQL parsing, duplicate/unknown versions, TLS enforcement, and read-only SQL.');
