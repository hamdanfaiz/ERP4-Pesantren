import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  compareMigrationVersions,
  databaseUrlFromSupabaseStatus,
  formatReport,
  listLocalMigrations,
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

const normal = compareMigrationVersions(local, ['20270101000000']);
assert.equal(normal.appliedCount, 1);
assert.equal(normal.pending.length, 1);
assert.equal(normal.pending[0].version, '20270102000000');
assert.equal(normal.canContinueToStagingReview, true);
assert.match(formatReport(normal), /Migration yang belum tercatat \(1\)/);

const unknownRemote = compareMigrationVersions(local, ['20261231000000']);
assert.deepEqual(unknownRemote.unknownApplied, ['20261231000000']);
assert.equal(unknownRemote.canContinueToStagingReview, false);
assert.match(formatReport(unknownRemote), /HENTIKAN/);
assert.doesNotMatch(formatReport(unknownRemote), /selaras/);

const outOfOrder = compareMigrationVersions(local, ['20270102000000']);
assert.deepEqual(outOfOrder.outOfOrderPending.map(({ version }) => version), ['20270101000000']);
assert.equal(outOfOrder.canContinueToStagingReview, false);

// Regression fixture from the read-only Production ledger observed on 2026-10-26.
// This validates planning output only; it does not connect to or change Production.
const repositoryMigrations = listLocalMigrations(
  readdirSync(new URL('../supabase/migrations/', import.meta.url))
);
const observedProductionVersions = repositoryMigrations
  .filter(({ version }) => version <= '20261206000000')
  .map(({ version }) => version);
assert.equal(observedProductionVersions.length, 47);
assert.equal(repositoryMigrations.length, 90);
const productionBaseline = compareMigrationVersions(repositoryMigrations, observedProductionVersions);
assert.equal(productionBaseline.appliedCount, 47);
assert.equal(productionBaseline.latestAppliedVersion, '20261206000000');
assert.equal(productionBaseline.pending.length, 43);
assert.equal(productionBaseline.pending[0].version, '20261207000000');
assert.equal(productionBaseline.pending.at(-1).version, '20270118000000');
assert.equal(productionBaseline.outOfOrderPending.length, 0);
assert.equal(productionBaseline.unknownApplied.length, 0);
assert.equal(productionBaseline.canContinueToStagingReview, true);

assert.throws(() => compareMigrationVersions(local, ['invalid-version']), /tidak valid/);
assert.throws(() => compareMigrationVersions(local, ['20270101000000', '20270101000000']), /duplikat/);

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
assert.match(READ_ONLY_LEDGER_QUERY, /SELECT version::text/);
assert.match(READ_ONLY_LEDGER_QUERY, /COMMIT/);
assert.doesNotMatch(READ_ONLY_LEDGER_QUERY, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);

console.log('Supabase migration preflight logic passed: lineage comparison, duplicate/unknown versions, TLS enforcement, and read-only SQL.');
