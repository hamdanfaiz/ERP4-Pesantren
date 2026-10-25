import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const READ_ONLY_LEDGER_QUERY = `
BEGIN READ ONLY;
SELECT version::text
FROM supabase_migrations.schema_migrations
ORDER BY version;
COMMIT;
`;

const SUPABASE_STATUS_DB_URL_PATTERN = /^\s*(?:export\s+)?DB_URL=/;

const VERSION_PATTERN = /^\d{14}$/;
const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

export function listLocalMigrations(fileNames) {
  const sqlFiles = fileNames.filter((fileName) => fileName.toLowerCase().endsWith('.sql'));
  const migrations = sqlFiles.map((fileName) => {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match) throw new Error(`Nama migration tidak mengikuti format Supabase: ${fileName}`);
    return { version: match[1], fileName };
  }).sort((left, right) => left.version.localeCompare(right.version));

  const seen = new Set();
  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new Error(`Versi migration lokal duplikat: ${migration.version}`);
    }
    seen.add(migration.version);
  }

  if (migrations.length === 0) throw new Error('Tidak ada file migration SQL di supabase/migrations.');
  return migrations;
}

export function compareMigrationVersions(migrations, appliedVersions) {
  const applied = appliedVersions.map((version) => String(version).trim()).filter(Boolean);
  const invalidApplied = applied.filter((version) => !VERSION_PATTERN.test(version));
  if (invalidApplied.length > 0) {
    throw new Error(`Ledger berisi versi migration yang tidak valid: ${invalidApplied.join(', ')}`);
  }

  const appliedSet = new Set(applied);
  if (appliedSet.size !== applied.length) throw new Error('Ledger berisi versi migration duplikat.');

  const localSet = new Set(migrations.map((migration) => migration.version));
  const unknownApplied = applied.filter((version) => !localSet.has(version)).sort();
  const latestAppliedVersion = [...applied].sort().at(-1) || null;
  const pending = migrations.filter((migration) => !appliedSet.has(migration.version));
  const outOfOrderPending = latestAppliedVersion
    ? pending.filter((migration) => migration.version < latestAppliedVersion)
    : [];

  return {
    localCount: migrations.length,
    appliedCount: applied.length,
    latestLocalVersion: migrations.at(-1)?.version || null,
    latestAppliedVersion,
    pending,
    unknownApplied,
    outOfOrderPending,
    canContinueToStagingReview: unknownApplied.length === 0 && outOfOrderPending.length === 0,
  };
}

export function psqlEnvironmentFromDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('SUPABASE_DB_URL bukan URL PostgreSQL yang valid.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('SUPABASE_DB_URL harus menggunakan protokol postgres atau postgresql.');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(host);
  const requestedSslMode = parsed.searchParams.get('sslmode');
  const sslMode = requestedSslMode || (isLocalHost ? 'disable' : 'require');
  const allowedSslModes = isLocalHost
    ? ['disable', 'require', 'verify-ca', 'verify-full']
    : ['require', 'verify-ca', 'verify-full'];

  if (!allowedSslModes.includes(sslMode)) {
    throw new Error('Koneksi Supabase jarak jauh harus memakai SSL mode require, verify-ca, atau verify-full.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!host || !database || !username || !password) {
    throw new Error('SUPABASE_DB_URL harus memuat host, database, username, dan password.');
  }

  return {
    PGHOST: host,
    PGPORT: parsed.port || '5432',
    PGDATABASE: database,
    PGUSER: username,
    PGPASSWORD: password,
    PGSSLMODE: sslMode,
    PGOPTIONS: '-c default_transaction_read_only=on',
    PGAPPNAME: 'erp4-readonly-migration-preflight',
  };
}

export function databaseUrlFromSupabaseStatus(statusOutput) {
  const line = statusOutput.split(/\r?\n/).find((item) => SUPABASE_STATUS_DB_URL_PATTERN.test(item));
  if (!line) throw new Error('Supabase CLI tidak memberikan DB_URL pada status lokal.');
  const databaseUrl = line
    .replace(/^\s*(?:export\s+)?DB_URL=/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('Supabase CLI memberikan DB_URL lokal yang tidak valid.');
  }
  return databaseUrl;
}

function localDatabaseUrl() {
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  return databaseUrlFromSupabaseStatus(output);
}

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readAppliedVersions(databaseUrl) {
  const result = execFileSync('psql', [
    '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', READ_ONLY_LEDGER_QUERY,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...psqlEnvironmentFromDatabaseUrl(databaseUrl) },
  });
  return result.split(/\r?\n/).map((version) => version.trim()).filter(Boolean);
}

export function formatReport(report) {
  const lines = [
    'Preflight ledger Supabase — hanya baca; tidak menerapkan migration.',
    `File migration lokal: ${report.localCount}`,
    `Versi tercatat di database: ${report.appliedCount}`,
    `Versi terakhir lokal: ${report.latestLocalVersion}`,
    `Versi terakhir database: ${report.latestAppliedVersion || '(belum ada)'}`,
  ];

  if (report.unknownApplied.length > 0) {
    lines.push(`HENTIKAN: versi database tidak ditemukan di repository: ${report.unknownApplied.join(', ')}`);
  }
  if (report.outOfOrderPending.length > 0) {
    lines.push('HENTIKAN: ada migration lokal yang lebih lama dari versi terakhir database dan belum tercatat:');
    for (const migration of report.outOfOrderPending) {
      lines.push(`  ${migration.version}  ${migration.fileName}`);
    }
  }

  if (!report.canContinueToStagingReview) {
    lines.push('Rekonsiliasi lineage sebelum membuat rencana staging.');
  } else if (report.pending.length === 0) {
    lines.push('Ledger dan repository selaras; tetap lakukan staging/backup review sebelum rilis.');
  } else {
    lines.push(`Migration yang belum tercatat (${report.pending.length}):`);
    for (const migration of report.pending) {
      lines.push(`  ${migration.version}  ${migration.fileName}`);
    }
    lines.push('Daftar ini hanya laporan; belum ada perubahan database.');
  }
  return lines.join('\n');
}

function printReport(report) {
  console.log(formatReport(report));
}

export function main({ env = process.env, repoRoot = getRepoRoot(), useLocalStack = process.argv.includes('--local') } = {}) {
  try {
    const databaseUrl = useLocalStack ? localDatabaseUrl() : env.SUPABASE_DB_URL;
    if (!databaseUrl) {
      console.error('Atur SUPABASE_DB_URL pada environment untuk database target. Nilainya tidak akan dicetak.');
      return 2;
    }

    const migrations = listLocalMigrations(readdirSync(path.join(repoRoot, 'supabase', 'migrations')));
    const appliedVersions = readAppliedVersions(databaseUrl);
    const report = compareMigrationVersions(migrations, appliedVersions);
    printReport(report);
    return report.canContinueToStagingReview ? 0 : 2;
  } catch (error) {
    console.error('Preflight gagal. Pastikan psql tersedia, URL benar, dan akun hanya diberi akses baca metadata migration. Kredensial tidak ditampilkan.');
    if (error?.code) console.error(`Kode kegagalan: ${error.code}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
