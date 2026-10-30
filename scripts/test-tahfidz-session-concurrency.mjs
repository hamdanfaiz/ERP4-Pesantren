import { execFileSync, spawn } from 'node:child_process';

const tenantId = 'a1900000-0000-4000-8000-000000000009';
const tenantSlug = 'tahfidz-session-race-test';
const teacherId = 'a1900000-0000-4000-8000-000000000012';
const adminId = 'a1900000-0000-4000-8000-000000000011';
const holderName = 'tahfidz-session-lock-holder';
const actorNames = ['tahfidz-session-actor-a', 'tahfidz-session-actor-b'];
const students = [
  { id: 'a1900000-0000-4000-8000-000000000201', candidate: 'a1900000-0000-4000-8000-000000000101', nis: '9190000101', request: 'a1900000-0000-4000-8000-000000000501' },
  { id: 'a1900000-0000-4000-8000-000000000202', candidate: 'a1900000-0000-4000-8000-000000000102', nis: '9190000102', request: 'a1900000-0000-4000-8000-000000000502' },
];
const halaqahId = 'a1900000-0000-4000-8000-000000000301';
const lockKey = `tahfidz-session-slot:${tenantId}:${teacherId}`;
const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function psqlArgs(dbUrl) {
  return [dbUrl, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
}

function query(dbUrl, sql, applicationName = 'tahfidz-session-race-verifier') {
  return execFileSync('psql', psqlArgs(dbUrl), {
    encoding: 'utf8',
    input: sql,
    env: { ...process.env, PGAPPNAME: applicationName },
    maxBuffer: 1024 * 1024,
  }).trim();
}

function startQuery(dbUrl, sql, applicationName) {
  const child = spawn('psql', psqlArgs(dbUrl), {
    env: { ...process.env, PGAPPNAME: applicationName },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => {
    child.on('error', (error) => resolve({ code: null, signal: null, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  child.stdin.end(sql);
  return { child, done };
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(dbUrl, sql, predicate, description, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = '';
  while (Date.now() < deadline) {
    lastValue = query(dbUrl, sql);
    if (predicate(lastValue)) return lastValue;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}; last query result: ${lastValue || '<empty>'}`);
}

function localDbUrl() {
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  const line = output.split(/\r?\n/).find((item) => item.startsWith('DB_URL='));
  if (!line) throw new Error('Supabase CLI did not expose DB_URL for the local stack');
  const value = line.slice('DB_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    throw new Error('Supabase CLI returned an invalid local DB_URL');
  }
  return value;
}

function cleanup(dbUrl) {
  query(dbUrl, `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE application_name = '${holderName}' AND pid <> pg_backend_pid();
    DELETE FROM public.tahfidz_session_write_requests WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.tahfidz_sessions WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.tahfidz_memberships WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.tahfidz_halaqahs WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.cooperative_wallets
    WHERE tenant_id = '${tenantId}'::uuid
      AND student_id IN ('${students[0].id}'::uuid, '${students[1].id}'::uuid);
    DELETE FROM public.students WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.candidates WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.profiles WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM auth.users WHERE id IN ('${adminId}'::uuid, '${teacherId}'::uuid);
    DELETE FROM public.tenants WHERE id = '${tenantId}'::uuid;
  `);
}

function createSessionCall(student, focus) {
  return `
    SELECT public.mutate_tenant_tahfidz_session(
      '${tenantId}'::uuid, '${adminId}'::uuid, 'admin', NULL::uuid, 'talaqqi',
      '${student.id}'::uuid, '${halaqahId}'::uuid, '${teacherId}'::uuid,
      NULL::text, NULL::smallint, NULL::smallint, '${scheduledAt}'::timestamptz,
      30::smallint, '${focus}', 'scheduled', NULL::numeric, NULL::text, NULL::text,
      '${student.request}'::uuid
    );
  `;
}

async function main() {
  const dbUrl = localDbUrl();
  let holder;
  let actorA;
  let actorB;
  try {
    cleanup(dbUrl);
    query(dbUrl, `
      INSERT INTO public.tenants (id, slug, name, status, time_zone)
      VALUES ('${tenantId}'::uuid, '${tenantSlug}', 'Tahfidz session race test', 'active', 'UTC');
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES
        ('${adminId}'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-race-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
        ('${teacherId}'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-race-teacher@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
      INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
      VALUES
        ('${adminId}'::uuid, '${tenantId}'::uuid, 'session-race-admin@test.invalid', 'Admin Race', 'admin', 'active', '{"tahfidz":true}'),
        ('${teacherId}'::uuid, '${tenantId}'::uuid, 'session-race-teacher@test.invalid', 'Ustadz Race', 'ustadz', 'active', '{"tahfidz":true}');
      INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
      VALUES
        ('${students[0].candidate}'::uuid, '${tenantId}'::uuid, 'TSR-001', 'Santri Race A', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
        ('${students[1].candidate}'::uuid, '${tenantId}'::uuid, 'TSR-002', 'Santri Race B', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'));
      INSERT INTO public.students (
        id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status
      ) VALUES
        ('${students[0].id}'::uuid, '${tenantId}'::uuid, '${students[0].candidate}'::uuid, '${students[0].nis}', 'Santri Race A', 'L', 'VII', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'), 'active'),
        ('${students[1].id}'::uuid, '${tenantId}'::uuid, '${students[1].candidate}'::uuid, '${students[1].nis}', 'Santri Race B', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('90', 32), 'hex'), 'active');
      INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
      VALUES ('${halaqahId}'::uuid, '${tenantId}'::uuid, 'Halaqah Race', '${teacherId}'::uuid, 'Ustadz Race', 'active');
      INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
      VALUES
        ('${tenantId}'::uuid, '${halaqahId}'::uuid, '${students[0].id}'::uuid, CURRENT_DATE - 5, 'active'),
        ('${tenantId}'::uuid, '${halaqahId}'::uuid, '${students[1].id}'::uuid, CURRENT_DATE - 5, 'active');
    `);

    holder = startQuery(dbUrl, `
      BEGIN;
      SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${lockKey}', 0));
      SELECT pg_sleep(600);
      COMMIT;
    `, holderName);
    await waitFor(
      dbUrl,
      `SELECT count(*) FROM pg_stat_activity WHERE application_name = '${holderName}' AND wait_event = 'PgSleep';`,
      (value) => value === '1',
      'synthetic Tahfidz slot lock holder to acquire its lock',
    );

    actorA = startQuery(dbUrl, createSessionCall(students[0], 'Sesi serentak A'), actorNames[0]);
    actorB = startQuery(dbUrl, createSessionCall(students[1], 'Sesi serentak B'), actorNames[1]);
    try {
      await waitFor(
        dbUrl,
        `SELECT count(*) FROM pg_stat_activity
         WHERE application_name IN ('${actorNames[0]}', '${actorNames[1]}') AND wait_event_type = 'Lock';`,
        (value) => value === '2',
        'both concurrent session writes to wait on the teacher slot lock',
      );
    } catch (error) {
      query(dbUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${holderName}';`);
      const [a, b] = await Promise.all([actorA.done, actorB.done]);
      throw new Error(`${error.message}\nActor A: ${a.stderr || a.stdout}\nActor B: ${b.stderr || b.stdout}`);
    }

    query(dbUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${holderName}';`);
    const [a, b, holderResult] = await Promise.all([actorA.done, actorB.done, holder.done]);
    const results = [a, b];
    const winners = results.filter((result) => result.code === 0);
    const rejected = results.filter((result) => result.code !== 0);
    requireCondition(winners.length === 1, `Expected one session write to succeed; got ${winners.length}. Actor A: ${a.stderr || a.stdout}; Actor B: ${b.stderr || b.stdout}`);
    requireCondition(rejected.length === 1, `Expected one conflicting session write to be rejected; got ${rejected.length}.`);
    requireCondition(
      rejected[0].stderr.includes('Pengampu sudah memiliki sesi lain pada rentang waktu tersebut'),
      `The losing write did not return the deterministic slot conflict: ${rejected[0].stderr || rejected[0].stdout}`,
    );
    requireCondition(holderResult.code !== 0, 'The lock holder should have been terminated to release the concurrency barrier');

    const integrity = query(dbUrl, `
      SELECT
        (SELECT count(*) FROM public.tahfidz_sessions WHERE tenant_id = '${tenantId}'::uuid AND status = 'scheduled')::text
        || ':' ||
        (SELECT count(*) FROM public.tahfidz_session_write_requests WHERE tenant_id = '${tenantId}'::uuid AND action = 'create')::text;
    `);
    requireCondition(integrity === '1:1', `Expected one scheduled session and one create ledger entry after the race; got ${integrity}`);
    console.log('Tahfidz session concurrency test passed: one teacher-slot winner and one deterministic conflict rejection.');
  } finally {
    if (holder) {
      try { query(dbUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${holderName}';`); } catch {}
      await holder.done;
    }
    if (actorA) await actorA.done;
    if (actorB) await actorB.done;
    cleanup(dbUrl);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
