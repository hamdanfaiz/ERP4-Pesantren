import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseTestEnvironment } from './supabase-test-environment.mjs';
import { isolateSyntheticTenantFixture } from './synthetic-tenant-fixture.mjs';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function safeCode(error) {
  const value = typeof error?.code === 'string'
    ? error.code
    : typeof error?.name === 'string'
      ? error.name
      : typeof error?.status === 'number'
        ? `HTTP_${error.status}`
        : 'unknown';
  return value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'unknown';
}

async function readJson(response, expectedStatus, label) {
  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${label} returned a non-JSON response (HTTP ${response.status}).`);
  }
  assert.equal(response.status, expectedStatus, `${label} returned HTTP ${response.status}; expected ${expectedStatus}.`);
  return body;
}

async function createUser(admin, tenantId, role, suffix, modulePermissions = { tahfidz: true }) {
  const userId = randomUUID();
  const email = `tahfidz-${suffix}-${userId.slice(0, 8)}@example.test`;
  const password = `Tahfidz-Test-${userId}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Uji Tahfidz ${suffix}` },
  });
  if (error || !data.user) throw new Error(`Could not create synthetic ${role} account (${safeCode(error)}).`);
  const uid = data.user.id;
  const { error: profileError } = await admin.from('profiles').insert({
    user_id: uid,
    tenant_id: tenantId,
    email,
    display_name: `Uji Tahfidz ${suffix}`,
    role,
    status: 'active',
    module_permissions: modulePermissions,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(uid);
    throw new Error(`Could not create synthetic ${role} profile (${safeCode(profileError)}).`);
  }
  return { uid, email, password };
}

async function signIn(anon, user) {
  const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session?.access_token) throw new Error(`Could not authenticate synthetic user (${safeCode(error)}).`);
  return data.session.access_token;
}

function jakartaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function main() {
  const { url, anonKey, serviceKey } = getSupabaseTestEnvironment({ allowStagingWrites: true });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenantId = randomUUID();
  const foreignTenantId = randomUUID();
  const fixtureSuffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const users = [];
  const tenantIds = [];
  let serverProcess;
  let failure;

  try {
    const { error: tenantError } = await admin.from('tenants').insert([
      { id: tenantId, slug: `tahfidz-http-${fixtureSuffix}`, name: `Uji Tahfidz ${fixtureSuffix}`, status: 'active' },
      { id: foreignTenantId, slug: `tahfidz-foreign-${fixtureSuffix}`, name: `Tenant lain ${fixtureSuffix}`, status: 'active' },
    ]);
    if (tenantError) {
      const detail = String(tenantError?.message || 'no diagnostic message')
        .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, '[redacted-key]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
      throw new Error(`Could not create synthetic Tahfidz tenants (${safeCode(tenantError)}): ${detail}.`);
    }
    tenantIds.push(tenantId, foreignTenantId);

    const tenantAdmin = await createUser(admin, tenantId, 'admin', 'admin');
    users.push(tenantAdmin);
    const ustadz = await createUser(admin, tenantId, 'ustadz', 'ustadz');
    users.push(ustadz);
    const learner = await createUser(admin, tenantId, 'santri', 'santri');
    users.push(learner);
    const foreignAdmin = await createUser(admin, foreignTenantId, 'admin', 'foreign-admin');
    users.push(foreignAdmin);

    const candidateId = randomUUID();
    const studentId = randomUUID();
    const classId = `KLS-${fixtureSuffix}`;
    const buildingId = `GDR-${fixtureSuffix}`;
    const roomId = `KMR-${fixtureSuffix}`;
    const randomHex = (bytes) => randomBytes(bytes).toString('hex');
    const { error: structureError } = await admin.from('master_data_records').insert([
      { tenant_id: tenantId, category: 'Kelas', id: classId, name: `Kelas Uji ${fixtureSuffix}`, grade: 'VII', status: 'Active' },
      { tenant_id: tenantId, category: 'Gedung', id: buildingId, name: `Gedung Uji ${fixtureSuffix}`, status: 'Active' },
      { tenant_id: tenantId, category: 'Kamar', id: roomId, name: `Kamar Uji ${fixtureSuffix}`, parent_id: buildingId, capacity: 4, occupied: 0, gender_code: 'L', status: 'Active' },
    ]);
    if (structureError) throw new Error(`Could not create synthetic student structure (${safeCode(structureError)}).`);

    const { error: candidateError } = await admin.from('candidates').insert({
      id: candidateId,
      tenant_id: tenantId,
      registration_id: `TAHFIDZ-${fixtureSuffix}`,
      name: `Santri Uji ${fixtureSuffix}`,
      grade: 'VII',
      nik_ciphertext: `\\x${randomHex(44)}`,
      nik_fingerprint: `\\x${randomHex(32)}`,
    });
    if (candidateError) throw new Error(`Could not create synthetic Tahfidz candidate (${safeCode(candidateError)}).`);

    const nis = String(9000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000));
    const { error: studentError } = await admin.from('students').insert({
      id: studentId,
      tenant_id: tenantId,
      source_candidate_id: candidateId,
      nis,
      name: `Santri Uji ${fixtureSuffix}`,
      gender: 'L',
      grade: 'VII',
      nik_ciphertext: `\\x${randomHex(44)}`,
      nik_fingerprint: `\\x${randomHex(32)}`,
      class_id: classId,
      room_id: roomId,
      building_id: buildingId,
      status: 'Active',
    });
    if (studentError) throw new Error(`Could not create synthetic Tahfidz student (${safeCode(studentError)}).`);
    const { error: linkError } = await admin.from('profiles')
      .update({ linked_santri_id: studentId })
      .eq('user_id', learner.uid)
      .eq('tenant_id', tenantId);
    if (linkError) throw new Error(`Could not link the synthetic student profile (${safeCode(linkError)}).`);

    const [adminToken, ustadzToken, learnerToken, foreignToken] = await Promise.all([
      signIn(anon, tenantAdmin), signIn(anon, ustadz), signIn(anon, learner), signIn(anon, foreignAdmin),
    ]);

    const port = await availablePort();
    const apiBase = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        SUPABASE_URL: url,
        SUPABASE_SECRET_KEY: serviceKey,
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_TAHFIDZ_RUNTIME_ENABLED: 'true',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline && serverProcess.exitCode === null) {
      try {
        const response = await fetch(`${apiBase}/api/tahfidz/roster`);
        if (response.status === 401) {
          ready = true;
          break;
        }
        await response.body?.cancel();
      } catch {}
      await sleep(250);
    }
    assert.ok(ready, 'Tahfidz API server did not become ready on its isolated test port.');

    await readJson(await fetch(`${apiBase}/api/tahfidz/references/surahs`), 401, 'Unauthenticated Quran catalog request');
    const catalog = await readJson(await fetch(`${apiBase}/api/tahfidz/references/surahs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }), 200, 'Authenticated Quran catalog request');
    assert.equal(catalog.data?.length, 114, 'Setoran reference should load all 114 Surahs from Supabase.');
    const baqarah = catalog.data.find((surah) => surah.namaLatin === 'Al-Baqarah');
    assert.equal(baqarah?.jumlahAyat, 286, 'Quran reference should expose the canonical Al-Baqarah ayah count.');

    const halaqahInput = {
      name: `Halaqah Uji ${fixtureSuffix}`,
      ustadzUserId: ustadz.uid,
      schedule: 'Senin 08.00',
      room: `Ruang Uji ${fixtureSuffix}`,
      dailyTargetPages: 1,
      status: 'active',
      clientRequestId: randomUUID(),
    };
    const halaqah = await readJson(await fetch(`${apiBase}/api/tahfidz/halaqahs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ halaqah: halaqahInput }),
    }), 201, 'Create Tahfidz halaqah');
    assert.ok(halaqah.halaqahId);

    const membershipInput = {
      studentId,
      halaqahId: halaqah.halaqahId,
      startsOn: jakartaDate(),
      clientRequestId: randomUUID(),
    };
    const membership = await readJson(await fetch(`${apiBase}/api/tahfidz/memberships`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership: membershipInput }),
    }), 201, 'Assign student to Tahfidz halaqah');
    assert.ok(membership.membershipId);

    const setoranInput = {
      studentId,
      halaqahId: halaqah.halaqahId,
      activityType: 'Ziyadah',
      surahName: baqarah.namaLatin,
      ayahRange: '1-5',
      fluencyGrade: 'A',
      tajweedGrade: 'A',
      notes: 'Catatan uji integrasi sintetis.',
      performedAt: new Date().toISOString(),
      clientRequestId: randomUUID(),
    };
    const setoran = await readJson(await fetch(`${apiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: setoranInput }),
    }), 201, 'Record Tahfidz setoran');
    assert.equal(setoran.alreadyRecorded, false);

    const retry = await readJson(await fetch(`${apiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: setoranInput }),
    }), 200, 'Retry Tahfidz setoran');
    assert.equal(retry.alreadyRecorded, true, 'Identical setoran retries must be idempotent.');

    const { data: savedRows, error: savedError } = await admin.from('tahfidz_records')
      .select('tenant_id,student_id,halaqah_id,surah_name,surah_number,ayah_start,ayah_end,recorded_by_user_id,client_request_id')
      .eq('tenant_id', tenantId)
      .eq('client_request_id', setoranInput.clientRequestId);
    assert.equal(savedError, null);
    assert.equal(savedRows?.length, 1, 'Setoran must be persisted exactly once.');
    assert.equal(savedRows[0].student_id, studentId);
    assert.equal(savedRows[0].halaqah_id, halaqah.halaqahId);
    assert.equal(savedRows[0].surah_name, 'Al-Baqarah');
    assert.equal(savedRows[0].surah_number, 2);
    assert.equal(savedRows[0].ayah_start, 1);
    assert.equal(savedRows[0].ayah_end, 5);
    assert.equal(savedRows[0].recorded_by_user_id, ustadz.uid);

    const ustadzRecords = await readJson(await fetch(`${apiBase}/api/tahfidz/records`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    }), 200, 'Read Tahfidz setoran as assigned Ustadz');
    assert.ok(ustadzRecords.records.some((record) => record.studentId === studentId && record.halaqahId === halaqah.halaqahId));

    const leaderboard = await readJson(await fetch(`${apiBase}/api/tahfidz/leaderboard`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    }), 200, 'Read Tahfidz leaderboard as assigned Ustadz');
    const rankedStudent = leaderboard.students.find((student) => student.id === studentId);
    assert.equal(rankedStudent?.ziyadahRecords, 1, 'Leaderboard should count the persisted Ziyadah record.');
    assert.equal(rankedStudent?.ziyadahAyahs, 5, 'Leaderboard should count the persisted ayah range.');

    const learnerSnapshot = await readJson(await fetch(`${apiBase}/api/tahfidz/snapshot`, {
      headers: { Authorization: `Bearer ${learnerToken}` },
    }), 200, 'Read Tahfidz portal as linked Santri');
    assert.ok(learnerSnapshot.records.some((record) => record.studentId === studentId));
    assert.ok(learnerSnapshot.roster.every((student) => student.id === studentId), 'Santri snapshot must stay restricted to the linked learner.');

    const learnerWrite = await fetch(`${apiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${learnerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...setoranInput, clientRequestId: randomUUID() } }),
    });
    await readJson(learnerWrite, 403, 'Reject Santri setoran write');
    const learnerLeaderboard = await fetch(`${apiBase}/api/tahfidz/leaderboard`, {
      headers: { Authorization: `Bearer ${learnerToken}` },
    });
    await readJson(learnerLeaderboard, 403, 'Reject learner leaderboard access');

    const foreignRecords = await readJson(await fetch(`${apiBase}/api/tahfidz/records`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    }), 200, 'Read Tahfidz records from another tenant');
    assert.deepEqual(foreignRecords.records, [], 'A different tenant must not read Tahfidz records.');

    const invalidSurah = await fetch(`${apiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...setoranInput, surahName: 'Surah Bebas Uji', clientRequestId: randomUUID() } }),
    });
    await readJson(invalidSurah, 409, 'Reject a free-text Surah value');

    console.log('Tahfidz API integration passed: catalog, halaqah, membership, canonical setoran, idempotency, saved Surah/Ayah relation, leaderboard, linked Santri scope, write denial, and tenant isolation.');
  } catch (error) {
    failure = error;
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(3000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }
    if (tenantIds.length || users.length) {
      try {
        const isolated = await isolateSyntheticTenantFixture(admin, {
          tenantIds,
          userIds: users.map((user) => user.uid),
        });
        console.log(`Tahfidz synthetic fixture isolated: ${isolated.tenantsSuspended} tenants suspended; ${isolated.profilesSuspended} profiles suspended; ${isolated.authUsersBanned} Auth users banned.`);
      } catch (error) {
        failure ||= error;
      }
    }
  }

  if (failure) throw failure;
}

main().catch((error) => {
  const message = String(error?.message || 'Unknown error')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, '[redacted-key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  console.error(`Tahfidz staging API failed (${safeCode(error)}): ${message}`);
  process.exitCode = 1;
});
