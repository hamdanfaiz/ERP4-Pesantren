import { execFileSync, spawn } from 'node:child_process';

const tenantId = 'a1600000-0000-4000-8000-000000000071';
const tenantSlug = 'nis-race-concurrency-test';
const nis = '9876543210';
const lockKey = `master-data-student-nis:${tenantId}:${nis}`;
const holderName = 'nis-race-lock-holder';
const actorNames = ['nis-race-actor-a', 'nis-race-actor-b'];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function psqlArgs(dbUrl) {
  return [dbUrl, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
}

function query(dbUrl, sql, applicationName = 'nis-race-verifier') {
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
    DELETE FROM public.nis_reservations WHERE tenant_id = '${tenantId}'::uuid;
    DELETE FROM public.cooperative_wallets
    WHERE tenant_id = '${tenantId}'::uuid
      AND student_id IN (
        SELECT id FROM public.students
        WHERE tenant_id = '${tenantId}'::uuid AND source_record_id IN ('race-a', 'race-b')
      );
    DELETE FROM public.students
    WHERE tenant_id = '${tenantId}'::uuid AND source_record_id IN ('race-a', 'race-b');
    DELETE FROM public.tenants WHERE id = '${tenantId}'::uuid;
  `);
}

async function main() {
  const dbUrl = localDbUrl();
  let holder;
  let actorA;
  let actorB;

  try {
    cleanup(dbUrl);
    query(dbUrl, `
      INSERT INTO public.tenants (id, slug, name, status)
      VALUES ('${tenantId}'::uuid, '${tenantSlug}', 'NIS concurrency test', 'active');
    `);

    holder = startQuery(dbUrl, `
      BEGIN;
      SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('${lockKey}', 0)
      );
      SELECT pg_sleep(600);
      COMMIT;
    `, holderName);

    await waitFor(
      dbUrl,
      `SELECT count(*) FROM pg_stat_activity
       WHERE application_name = '${holderName}' AND wait_event = 'PgSleep';`,
      (value) => value === '1',
      'the synthetic NIS lock holder to acquire its lock',
    );

    const call = (sourceRecordId, name) => `
      SELECT public.upsert_master_data_student(
        '${tenantId}'::uuid,
        NULL::uuid,
        '${sourceRecordId}',
        jsonb_build_object('name', '${name}', 'nis', '${nis}')
      );
    `;
    actorA = startQuery(dbUrl, call('race-a', 'NIS Race Santri A'), actorNames[0]);
    actorB = startQuery(dbUrl, call('race-b', 'NIS Race Santri B'), actorNames[1]);

    try {
      await waitFor(
        dbUrl,
        `SELECT count(*) FROM pg_stat_activity
         WHERE application_name IN ('${actorNames[0]}', '${actorNames[1]}')
           AND wait_event_type = 'Lock';`,
        (value) => value === '2',
        'both concurrent RPC calls to wait on the same NIS lock',
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

    requireCondition(winners.length === 1, `Expected exactly one NIS RPC to succeed; got ${winners.length}. Actor A: ${a.stderr || a.stdout}; Actor B: ${b.stderr || b.stdout}`);
    requireCondition(rejected.length === 1, `Expected exactly one NIS RPC to be rejected; got ${rejected.length}.`);
    requireCondition(
      rejected[0].stderr.includes('NIS sudah digunakan pada tenant ini'),
      `The losing NIS RPC did not return the tenant duplicate error: ${rejected[0].stderr || rejected[0].stdout}`,
    );
    requireCondition(holderResult.code !== 0, 'The lock holder should have been terminated to release the concurrent test barrier');

    const integrity = query(dbUrl, `
      SELECT
        (SELECT count(*) FROM public.students
         WHERE tenant_id = '${tenantId}'::uuid AND nis = '${nis}')::text
        || ':' ||
        (SELECT count(*) FROM public.nis_reservations
         WHERE tenant_id = '${tenantId}'::uuid AND nis = '${nis}')::text;
    `);
    requireCondition(integrity === '1:1', `Expected one student and one NIS reservation after the race; got ${integrity}`);
    console.log('NIS concurrency test passed: one winner, one deterministic duplicate rejection, one student, one reservation.');
  } finally {
    if (holder) {
      try {
        query(dbUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${holderName}';`);
      } catch {}
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
