import { execFileSync, spawn } from 'node:child_process';

const tenantId = 'a2400000-0000-4000-8000-000000000001';
const tenantSlug = 'room-reference-lock-test';
const studentIds = [
  'a2400000-0000-4000-8000-000000000011',
  'a2400000-0000-4000-8000-000000000012',
];
const buildingId = 'ROOM-LOCK-BUILDING';
const roomId = 'ROOM-LOCK-ROOM';
const holderNames = [
  'room-capacity-lock-holder',
  'room-building-lock-holder',
  'room-tenant-lock-holder',
];
const actorNames = [
  'room-capacity-actor-a',
  'room-capacity-actor-b',
  'room-building-actor',
  'room-tenant-actor',
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function psqlArgs(dbUrl) {
  return [dbUrl, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
}

function query(dbUrl, sql, applicationName = 'room-assignment-lock-verifier') {
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
    child.on('error', (error) => resolve({ code: null, signal: null, stdout, stderr: stderr + error.message }));
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
  throw new Error('Timed out waiting for ' + description + '; last query result: ' + (lastValue || '<empty>'));
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
  const parsed = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || parsed.pathname !== '/postgres') {
    throw new Error('Room assignment concurrency tests only run against the local Supabase postgres database');
  }
  return value;
}

function cleanup(dbUrl) {
  query(dbUrl, [
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name IN ('" + holderNames.join("','") + "','" + actorNames.join("','") + "') AND pid <> pg_backend_pid();",
    'DROP TRIGGER IF EXISTS room_assignment_test_delay ON public.master_data_records;',
    'DROP FUNCTION IF EXISTS public.room_assignment_test_delay();',
    "DELETE FROM public.student_room_assignment_history WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.cooperative_wallet_ledger WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.cooperative_wallets WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.students WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.master_data_records WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Kamar';",
    "DELETE FROM public.master_data_records WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Gedung';",
    'ALTER TABLE public.master_data_audit_events DISABLE TRIGGER master_data_audit_events_immutable_rows;',
    "DELETE FROM public.master_data_audit_events WHERE tenant_id = '" + tenantId + "'::uuid;",
    'ALTER TABLE public.master_data_audit_events ENABLE TRIGGER master_data_audit_events_immutable_rows;',
    "DELETE FROM public.tenant_naming_series_events WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.tenant_naming_series_allocations WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.tenant_naming_series_counters WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.tenant_naming_series WHERE tenant_id = '" + tenantId + "'::uuid;",
    "DELETE FROM public.tenants WHERE id = '" + tenantId + "'::uuid;",
  ].join('\n'));
}

function assignmentCall(studentId) {
  return "SELECT public.assign_student_to_room('" + tenantId + "'::uuid, '"
    + studentId + "'::uuid, '" + roomId + "', '" + buildingId + "');";
}

async function assertBlockedThenRejected(dbUrl, holderName, actorName, holderSql, expectedMessage) {
  const holder = startQuery(dbUrl, holderSql, holderName);
  let actor;
  try {
    await waitFor(
      dbUrl,
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '" + holderName + "' AND wait_event = 'PgSleep';",
      (value) => value === '1',
      holderName + ' to hold its row update',
    );
    actor = startQuery(dbUrl, assignmentCall(studentIds[0]), actorName);
    await waitFor(
      dbUrl,
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '" + actorName + "' AND wait_event_type = 'Lock';",
      (value) => value === '1',
      actorName + ' to wait for the locked reference row',
    );
    const [actorResult, holderResult] = await Promise.all([actor.done, holder.done]);
    requireCondition(holderResult.code === 0, holderName + ' did not commit its synthetic update: ' + holderResult.stderr);
    requireCondition(actorResult.code !== 0, actorName + ' unexpectedly succeeded during the reference change');
    requireCondition(
      actorResult.stderr.includes(expectedMessage),
      actorName + ' returned an unexpected error: ' + actorResult.stderr,
    );
  } finally {
    query(dbUrl, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '" + holderName + "';");
    if (actor) await actor.done;
    await holder.done;
  }
}

async function main() {
  const dbUrl = localDbUrl();
  let actorA;
  let actorB;
  try {
    cleanup(dbUrl);
    query(dbUrl, [
      "INSERT INTO public.tenants (id, slug, name, status) VALUES ('" + tenantId + "'::uuid, '" + tenantSlug + "', 'Room assignment lock test', 'active');",
      "INSERT INTO public.master_data_records (tenant_id, category, id, name, status, gender_code) VALUES ('" + tenantId + "'::uuid, 'Gedung', '" + buildingId + "', 'Gedung Uji', 'Active', 'L');",
      "INSERT INTO public.master_data_records (tenant_id, category, id, name, status, parent_id, capacity, occupied) VALUES ('" + tenantId + "'::uuid, 'Kamar', '" + roomId + "', 'Kamar Uji', 'Active', '" + buildingId + "', 1, 0);",
      "INSERT INTO public.students (id, tenant_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status, source_system, source_record_id) VALUES",
      "('" + studentIds[0] + "'::uuid, '" + tenantId + "'::uuid, '9240000001', 'Santri Uji A', 'L', NULL, decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex'), 'Active', 'master_data', 'room-lock-student-a'),",
      "('" + studentIds[1] + "'::uuid, '" + tenantId + "'::uuid, '9240000002', 'Santri Uji B', 'L', NULL, decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'), 'Active', 'master_data', 'room-lock-student-b');",
      'CREATE OR REPLACE FUNCTION public.room_assignment_test_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.occupied > OLD.occupied THEN PERFORM pg_sleep(4); END IF; RETURN NEW; END; $$;',
      'CREATE TRIGGER room_assignment_test_delay BEFORE UPDATE OF occupied ON public.master_data_records FOR EACH ROW WHEN (NEW.tenant_id = \'' + tenantId + '\'::uuid AND NEW.category = \'Kamar\') EXECUTE FUNCTION public.room_assignment_test_delay();',
    ].join('\n'));

    actorA = startQuery(dbUrl, assignmentCall(studentIds[0]), actorNames[0]);
    await waitFor(
      dbUrl,
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '" + actorNames[0] + "' AND wait_event = 'PgSleep';",
      (value) => value === '1',
      'the first room assignment to hold the room row while occupancy is updated',
    );
    actorB = startQuery(dbUrl, assignmentCall(studentIds[1]), actorNames[1]);
    await waitFor(
      dbUrl,
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '" + actorNames[1] + "' AND wait_event_type = 'Lock';",
      (value) => value === '1',
      'the competing assignment to wait for the room row lock',
    );
    const [a, b] = await Promise.all([actorA.done, actorB.done]);
    const roomWinners = [a, b].filter((result) => result.code === 0);
    const roomLosers = [a, b].filter((result) => result.code !== 0);
    requireCondition(roomWinners.length === 1, 'Expected one capacity-1 room assignment to succeed; actor A: ' + a.stderr + '; actor B: ' + b.stderr);
    requireCondition(roomLosers.length === 1, 'Expected one competing room assignment to be rejected');
    requireCondition(roomLosers[0].stderr.includes('Kamar sudah penuh'), 'The losing assignment did not report a full room: ' + roomLosers[0].stderr);
    const roomIntegrity = query(dbUrl, [
      "SELECT (SELECT count(*) FROM public.students WHERE tenant_id = '" + tenantId + "'::uuid AND room_id = '" + roomId + "')::text",
      "|| ':' || (SELECT occupied FROM public.master_data_records WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Kamar' AND id = '" + roomId + "')::text;",
    ].join('\n'));
    requireCondition(roomIntegrity === '1:1', 'Expected one assigned student and occupied=1 after the race; got ' + roomIntegrity);
    console.log('Room capacity race passed: one winner, one full-room rejection, and occupancy matches assignment.');

    const winnerId = a.code === 0 ? studentIds[0] : studentIds[1];
    query(dbUrl, "SELECT public.assign_student_to_room('" + tenantId + "'::uuid, '" + winnerId + "'::uuid, NULL, NULL);");
    query(dbUrl, "UPDATE public.master_data_records SET status = 'Active' WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Gedung' AND id = '" + buildingId + "';");
    await assertBlockedThenRejected(
      dbUrl,
      holderNames[1],
      actorNames[2],
      "BEGIN; UPDATE public.master_data_records SET status = 'Inactive' WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Gedung' AND id = '" + buildingId + "'; SELECT pg_sleep(3); COMMIT;",
      'Gedung tidak aktif atau tidak ditemukan pada tenant ini',
    );
    query(dbUrl, "UPDATE public.master_data_records SET status = 'Active' WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Gedung' AND id = '" + buildingId + "';");
    console.log('Building configuration race passed: assignment waits, then rejects the inactive building.');

    await assertBlockedThenRejected(
      dbUrl,
      holderNames[2],
      actorNames[3],
      "BEGIN; UPDATE public.tenants SET status = 'suspended' WHERE id = '" + tenantId + "'::uuid; SELECT pg_sleep(3); COMMIT;",
      'Tenant tidak aktif',
    );
    query(dbUrl, "UPDATE public.tenants SET status = 'active' WHERE id = '" + tenantId + "'::uuid;");
    const finalIntegrity = query(dbUrl, [
      "SELECT (SELECT count(*) FROM public.students WHERE tenant_id = '" + tenantId + "'::uuid AND room_id = '" + roomId + "')::text",
      "|| ':' || (SELECT occupied FROM public.master_data_records WHERE tenant_id = '" + tenantId + "'::uuid AND category = 'Kamar' AND id = '" + roomId + "')::text;",
    ].join('\n'));
    requireCondition(finalIntegrity === '0:0', 'Expected rejected reference races to leave no assignment or occupancy; got ' + finalIntegrity);
    console.log('Tenant status race passed: assignment waits, then rejects the suspended tenant.');
  } finally {
    for (const name of holderNames) {
      try {
        query(dbUrl, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '" + name + "' AND pid <> pg_backend_pid();");
      } catch {}
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

