import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  compareMigrationVersions,
  databaseUrlFromSupabaseStatus,
  formatReport,
  listLocalMigrations,
  parseAppliedMigrationsOutput,
  psqlEnvironmentFromDatabaseUrl,
  READ_ONLY_LEDGER_QUERY,
} from './preflight-supabase-migrations.mjs';

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

// Regression fixture from the read-only staging ledger observed on 2026-10-27.
// This validates planning output only; it does not connect to or change staging.
const repositoryMigrations = listLocalMigrations(
  readdirSync(new URL('../supabase/migrations/', import.meta.url))
);
const observedStagingMigrations = repositoryMigrations
  .filter(({ version }) => version <= '20261206000000')
  .map(({ version, fileName }) => ({
    version,
    name: fileName.replace(/^\d{14}_/, '').replace(/\.sql$/i, ''),
  }));
assert.equal(observedStagingMigrations.length, 47);
assert.equal(repositoryMigrations.length, 91);
const stagingBaseline = compareMigrationVersions(repositoryMigrations, observedStagingMigrations);
assert.equal(stagingBaseline.appliedCount, 47);
assert.equal(stagingBaseline.latestAppliedVersion, '20261206000000');
assert.equal(stagingBaseline.pending.length, 44);
assert.equal(stagingBaseline.pending[0].version, '20261207000000');
assert.equal(stagingBaseline.pending.at(-1).version, '20270119000000');
assert.equal(stagingBaseline.outOfOrderPending.length, 0);
assert.equal(stagingBaseline.unknownApplied.length, 0);
assert.equal(stagingBaseline.nameMismatches.length, 0);
assert.equal(stagingBaseline.canContinueToStagingReview, true);

const missingLedgerNames = compareMigrationVersions(repositoryMigrations, [
  { version: '20261205000000', name: null },
  { version: '20261206000000', name: null },
]);
assert.deepEqual(missingLedgerNames.nameMismatches.map(({ version }) => version), ['20261205000000', '20261206000000']);
assert.equal(missingLedgerNames.canContinueToStagingReview, false);
assert.match(formatReport(missingLedgerNames), /nama migration pada ledger kosong/);

const wrongLedgerName = compareMigrationVersions(local, [{ version: '20270101000000', name: 'different_name' }]);
assert.equal(wrongLedgerName.nameMismatches.length, 1);
assert.equal(wrongLedgerName.canContinueToStagingReview, false);

assert.throws(() => compareMigrationVersions(local, ['invalid-version']), /tidak valid/);
assert.throws(() => compareMigrationVersions(local, ['20270101000000', '20270101000000']), /duplikat/);
assert.deepEqual(parseAppliedMigrationsOutput('[{"version":"20270101000000","name":null}]'), [
  { version: '20270101000000', name: null },
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
assert.match(READ_ONLY_LEDGER_QUERY, /COMMIT/);
assert.doesNotMatch(READ_ONLY_LEDGER_QUERY, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);

console.log('Supabase migration preflight logic passed: lineage comparison, duplicate/unknown versions, TLS enforcement, and read-only SQL.');
