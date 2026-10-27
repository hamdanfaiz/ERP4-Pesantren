import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const READ_ONLY_LEDGER_QUERY = `
BEGIN READ ONLY;
SELECT COALESCE(
  json_agg(json_build_object('version', version::text, 'name', name, 'statements', statements) ORDER BY version),
  '[]'::json
)::text
FROM supabase_migrations.schema_migrations;
COMMIT;
`;

const SUPABASE_STATUS_DB_URL_PATTERN = /^\s*(?:export\s+)?DB_URL=/;

const VERSION_PATTERN = /^\d{14}$/;
const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

function hasEscapeStringPrefix(value) {
  return /(?:^|[^A-Za-z0-9_$])[Ee]$/.test(value);
}

export function splitSqlStatements(sql) {
  const source = String(sql ?? '').replace(/\r\n/g, '\n');
  const statements = [];
  let buffer = '';
  let index = 0;
  let state = 'normal';
  let blockDepth = 0;
  let dollarDelimiter = '';
  let escapeString = false;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'normal') {
      if (character === "'") {
        escapeString = hasEscapeStringPrefix(buffer);
        state = 'single-quoted';
        buffer += character;
        index += 1;
        continue;
      }
      if (character === '"') {
        state = 'double-quoted';
        buffer += character;
        index += 1;
        continue;
      }
      if (character === '-' && next === '-') {
        state = 'line-comment';
        buffer += character + next;
        index += 2;
        continue;
      }
      if (character === '/' && next === '*') {
        state = 'block-comment';
        blockDepth = 1;
        buffer += character + next;
        index += 2;
        continue;
      }
      if (character === '$') {
        const match = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (match) {
          dollarDelimiter = match[0];
          state = 'dollar-quoted';
          buffer += dollarDelimiter;
          index += dollarDelimiter.length;
          continue;
        }
      }
      if (character === ';') {
        if (buffer.trim()) statements.push(buffer.trim());
        buffer = '';
        index += 1;
        continue;
      }
      buffer += character;
      index += 1;
      continue;
    }
    if (state === 'single-quoted') {
      buffer += character;
      index += 1;
      if (escapeString && character === '\\' && index < source.length) {
        buffer += source[index];
        index += 1;
      } else if (character === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (character === "'") {
        state = 'normal';
      }
      continue;
    }
    if (state === 'double-quoted') {
      buffer += character;
      index += 1;
      if (character === '"' && next === '"') {
        buffer += next;
        index += 1;
      } else if (character === '"') {
        state = 'normal';
      }
      continue;
    }
    if (state === 'line-comment') {
      buffer += character;
      index += 1;
      if (character === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '/' && next === '*') {
        blockDepth += 1;
        buffer += character + next;
        index += 2;
      } else if (character === '*' && next === '/') {
        blockDepth -= 1;
        buffer += character + next;
        index += 2;
        if (blockDepth === 0) state = 'normal';
      } else {
        buffer += character;
        index += 1;
      }
      continue;
    }
    if (state === 'dollar-quoted') {
      if (source.startsWith(dollarDelimiter, index)) {
        buffer += dollarDelimiter;
        index += dollarDelimiter.length;
        state = 'normal';
      } else {
        buffer += character;
        index += 1;
      }
    }
  }

  if (['single-quoted', 'double-quoted', 'block-comment', 'dollar-quoted'].includes(state)) {
    throw new Error('SQL migration memiliki quote atau komentar yang tidak ditutup.');
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

export function canonicalizeSqlStatement(sql) {
  const source = String(sql ?? '').replace(/\r\n/g, '\n');
  let output = '';
  let index = 0;
  let state = 'normal';
  let pendingSpace = false;
  let blockDepth = 0;
  let escapeString = false;

  const append = (value) => {
    if (pendingSpace && output && !output.endsWith(' ')) output += ' ';
    output += value;
    pendingSpace = false;
  };

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'normal') {
      if (/\s/.test(character)) {
        pendingSpace = true;
        index += 1;
        continue;
      }
      if (character === '-' && next === '-') {
        state = 'line-comment';
        pendingSpace = true;
        index += 2;
        continue;
      }
      if (character === '/' && next === '*') {
        state = 'block-comment';
        blockDepth = 1;
        pendingSpace = true;
        index += 2;
        continue;
      }
      if (character === '$') {
        const match = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (match) {
          const delimiter = match[0];
          const closingIndex = source.indexOf(delimiter, index + delimiter.length);
          if (closingIndex < 0) throw new Error('SQL migration memiliki dollar-quote yang tidak ditutup.');
          append(source.slice(index, closingIndex + delimiter.length));
          index = closingIndex + delimiter.length;
          continue;
        }
      }
      if (character === "'") {
        escapeString = hasEscapeStringPrefix(output);
        state = 'single-quoted';
        append(character);
        index += 1;
        continue;
      }
      if (character === '"') {
        state = 'double-quoted';
        append(character);
        index += 1;
        continue;
      }
      append(character);
      index += 1;
      continue;
    }
    if (state === 'single-quoted') {
      output += character;
      index += 1;
      if (escapeString && character === '\\' && index < source.length) {
        output += source[index];
        index += 1;
      } else if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = 'normal';
      }
      continue;
    }
    if (state === 'double-quoted') {
      output += character;
      index += 1;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = 'normal';
      }
      continue;
    }
    if (state === 'line-comment') {
      index += 1;
      if (character === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
      } else if (character === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = 'normal';
      } else {
        index += 1;
      }
    }
  }

  if (['single-quoted', 'double-quoted', 'block-comment'].includes(state)) {
    throw new Error('SQL migration memiliki quote atau komentar yang tidak ditutup.');
  }
  return output.trim();
}

export function canonicalizeMigrationStatements(sql) {
  return splitSqlStatements(sql).map(canonicalizeSqlStatement).filter(Boolean);
}

export function listLocalMigrations(fileNames, readMigrationSql = null) {
  const sqlFiles = fileNames.filter((fileName) => fileName.toLowerCase().endsWith('.sql'));
  const migrations = sqlFiles.map((fileName) => {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match) throw new Error(`Nama migration tidak mengikuti format Supabase: ${fileName}`);
    const migration = { version: match[1], fileName };
    if (typeof readMigrationSql === 'function') {
      migration.statements = canonicalizeMigrationStatements(readMigrationSql(fileName));
    }
    return migration;
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

export function parseAppliedMigrationsOutput(output) {
  let rows;
  try {
    rows = JSON.parse(String(output || '').trim());
  } catch {
    throw new Error('Respons ledger migrasi Supabase bukan JSON yang valid.');
  }
  if (!Array.isArray(rows)) throw new Error('Respons ledger migrasi Supabase harus berupa daftar.');
  return rows.map((row) => ({
    version: typeof row?.version === 'string' ? row.version.trim() : '',
    name: typeof row?.name === 'string' ? row.name.trim() : null,
    statements: Array.isArray(row?.statements)
      ? row.statements.map((statement) => typeof statement === 'string' ? canonicalizeSqlStatement(statement) : null)
      : null,
  }));
}

export function compareMigrationVersions(migrations, appliedMigrations) {
  const applied = appliedMigrations.map((row) => typeof row === 'string'
    ? { version: row.trim(), name: null, statements: null }
    : {
      version: typeof row?.version === 'string' ? row.version.trim() : '',
      name: typeof row?.name === 'string' ? row.name.trim() : null,
      statements: Array.isArray(row?.statements)
        ? row.statements.map((statement) => typeof statement === 'string' ? canonicalizeSqlStatement(statement) : null)
        : null,
    });
  const appliedVersions = applied.map(({ version }) => version);
  const invalidApplied = appliedVersions.filter((version) => !VERSION_PATTERN.test(version));
  if (invalidApplied.length > 0) {
    throw new Error(`Ledger berisi versi migration yang tidak valid: ${invalidApplied.join(', ')}`);
  }

  const appliedSet = new Set(appliedVersions);
  if (appliedSet.size !== appliedVersions.length) throw new Error('Ledger berisi versi migration duplikat.');

  const localByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const unknownApplied = appliedVersions.filter((version) => !localByVersion.has(version)).sort();
  const nameMismatches = applied.flatMap((row) => {
    const local = localByVersion.get(row.version);
    if (!local) return [];
    const expectedName = local.fileName.replace(/^\d{14}_/, '').replace(/\.sql$/i, '');
    if (row.name === expectedName) return [];
    return [{ version: row.version, appliedName: row.name, expectedName, fileName: local.fileName }];
  });
  const statementMismatches = applied.flatMap((row) => {
    const local = localByVersion.get(row.version);
    if (!local || !Array.isArray(local.statements)) return [];
    const actual = row.statements;
    if (!Array.isArray(actual) || actual.some((statement) => typeof statement !== 'string' || statement.length === 0)) {
      return [{ version: row.version, reason: 'missing', expectedCount: local.statements.length }];
    }
    const firstMismatch = local.statements.findIndex((statement, index) => statement !== actual[index]);
    if (firstMismatch < 0 && local.statements.length === actual.length) return [];
    return [{
      version: row.version,
      reason: 'different',
      expectedCount: local.statements.length,
      appliedCount: actual.length,
      firstMismatch: firstMismatch >= 0 ? firstMismatch + 1 : null,
    }];
  });
  const latestAppliedVersion = [...appliedVersions].sort().at(-1) || null;
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
    nameMismatches,
    statementMismatches,
    canContinueToStagingReview: unknownApplied.length === 0
      && outOfOrderPending.length === 0
      && nameMismatches.length === 0
      && statementMismatches.length === 0,
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

export function databaseUrlFromEnvironment(env = process.env) {
  // Prefer the configured pooler for local IPv4 networks; direct database hosts may be IPv6-only.
  return env.SUPABASE_DB_POOLER_URL || env.SUPABASE_DB_URL || '';
}

function readAppliedMigrations(databaseUrl) {
  const result = execFileSync('psql', [
    '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', READ_ONLY_LEDGER_QUERY,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...psqlEnvironmentFromDatabaseUrl(databaseUrl) },
  });
  return parseAppliedMigrationsOutput(result);
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
  if (report.nameMismatches.length > 0) {
    lines.push('HENTIKAN: nama migration pada ledger kosong atau berbeda dari nama file repository:');
    for (const mismatch of report.nameMismatches) {
      lines.push(`  ${mismatch.version}  ledger=${mismatch.appliedName ?? '(kosong)'}  repository=${mismatch.expectedName}`);
    }
  }
  if (report.statementMismatches.length > 0) {
    lines.push('HENTIKAN: statement SQL pada ledger kosong atau berbeda dari file migration repository:');
    for (const mismatch of report.statementMismatches) {
      if (mismatch.reason === 'missing') {
        lines.push(`  ${mismatch.version}  ledger=(metadata statements kosong)  repository=${mismatch.expectedCount} statements`);
      } else {
        lines.push(`  ${mismatch.version}  repository=${mismatch.expectedCount} statements  ledger=${mismatch.appliedCount} statements  statement pertama berbeda=${mismatch.firstMismatch ?? '(jumlah berbeda)'}`);
      }
    }
  }

  if (!report.canContinueToStagingReview) {
    lines.push('Rekonsiliasi versi, nama, dan isi SQL migration sebelum membuat rencana staging.');
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
    const databaseUrl = useLocalStack ? localDatabaseUrl() : databaseUrlFromEnvironment(env);
    if (!databaseUrl) {
      console.error('Atur SUPABASE_DB_POOLER_URL atau SUPABASE_DB_URL pada environment untuk database target. Nilainya tidak akan dicetak.');
      return 2;
    }

    const migrationDirectory = path.join(repoRoot, 'supabase', 'migrations');
    const migrations = listLocalMigrations(
      readdirSync(migrationDirectory),
      (fileName) => readFileSync(path.join(migrationDirectory, fileName), 'utf8'),
    );
    const appliedMigrations = readAppliedMigrations(databaseUrl);
    const report = compareMigrationVersions(migrations, appliedMigrations);
    printReport(report);
    return report.canContinueToStagingReview ? 0 : 2;
  } catch (error) {
    console.error('Preflight gagal. Pastikan psql tersedia, URL benar, dan akun hanya diberi akses baca metadata migration. Kredensial tidak ditampilkan.');
    if (error?.code) console.error(`Kode kegagalan: ${error.code}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: path.join(getRepoRoot(), '.env') });
  process.exitCode = main();
}
