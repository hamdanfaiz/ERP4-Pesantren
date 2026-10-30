import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function localDatabaseUrl() {
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  const line = output.split(/\r?\n/).find((item) => /^\s*(?:export\s+)?DB_URL=/.test(item));
  if (!line) throw new Error('Supabase CLI did not expose DB_URL for the local stack.');
  const url = line.replace(/^\s*(?:export\s+)?DB_URL=/, '').trim().replace(/^['"]|['"]$/g, '');
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error('Supabase CLI returned an invalid local DB_URL.');
  }
  return url;
}

function runPsql(dbUrl, sql) {
  return execFileSync('psql', [dbUrl, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PGAPPNAME: 'erp4-backup-restore-test' },
  }).trim();
}

function main() {
  const dbUrl = localDatabaseUrl();
  const table = `erp4_backup_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const recordId = randomUUID();
  const payload = `restore-check-${randomUUID()}`;
  const tempDir = mkdtempSync(path.join(tmpdir(), 'erp4-backup-restore-'));
  const dumpPath = path.join(tempDir, 'synthetic-tenant-record.dump');

  try {
    runPsql(dbUrl, `
      CREATE TABLE public.${table} (
        record_id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        payload TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO public.${table} (record_id, tenant_id, payload)
      VALUES ('${recordId}'::uuid, '${tenantId}'::uuid, '${payload}');
    `);
    execFileSync('pg_dump', [
      '--format=custom', '--no-owner', '--no-acl',
      '--table', `public.${table}`, '--file', dumpPath, dbUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 4 * 1024 * 1024 });

    runPsql(dbUrl, `DROP TABLE public.${table};`);
    execFileSync('pg_restore', [
      '--no-owner', '--no-acl', '--dbname', dbUrl, dumpPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
    const restored = runPsql(dbUrl, `
      SELECT count(*)::text || '|' || min(tenant_id::text) || '|' || min(payload)
      FROM public.${table}
      WHERE record_id = '${recordId}'::uuid;
    `);
    assert.equal(restored, `1|${tenantId}|${payload}`, 'The backup must restore the synthetic tenant row and its value exactly.');
    console.log('Local backup/restore smoke test passed: custom-format pg_dump and pg_restore recovered one synthetic tenant record.');
  } finally {
    try { runPsql(dbUrl, `DROP TABLE IF EXISTS public.${table};`); } catch {}
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

try {
  main();
} catch (error) {
  const detail = error instanceof assert.AssertionError
    ? error.message
    : error?.code || error?.name || 'unknown error';
  console.error(`Local backup/restore smoke test failed (${detail}). Check the local Supabase stack and PostgreSQL client tools.`);
  process.exitCode = 1;
}
