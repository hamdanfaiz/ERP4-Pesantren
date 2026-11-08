import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { auditServerApiAuthRoutes } from './api-route-auth-policy.mjs';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const encryptTestIdentity = (value, keyHex) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return String.fromCharCode(92) + 'x' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('hex');
};
const fingerprintTestIdentity = (kind, value, keyHex) => createHmac('sha256', Buffer.from(keyHex, 'hex'))
  .update(kind + ':' + value, 'utf8').digest('hex');
const fetch = async (input, init) => {
  try {
    return await globalThis.fetch(input, init);
  } catch (error) {
    const url = typeof input === 'string' ? input : String(input?.url || input);
    throw new Error(`HTTP fetch failed for ${url}`, { cause: error });
  }
};

async function verifyAllPrivateApiRoutesRejectAnonymousRequests(apiBase) {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const policy = auditServerApiAuthRoutes(source);

  const cases = policy.privateRoutes.map((route) => {
    const path = route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, () => randomUUID());
    const method = route.method === 'ALL' ? 'GET' : route.method;
    const init = { method };
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = '{}';
    }
    return { key: `${route.method} ${route.path}`, url: `${apiBase}${path}`, init };
  });

  for (let offset = 0; offset < cases.length; offset += 12) {
    const batch = cases.slice(offset, offset + 12);
    const responses = await Promise.all(batch.map(({ url, init }) => fetch(url, init)));
    for (let index = 0; index < batch.length; index++) {
      assert.equal(responses[index].status, 401, `${batch[index].key} must reject anonymous requests before evaluating module state.`);
      await responses[index].body?.cancel();
    }
  }

  const closedResponses = await Promise.all(policy.closedRoutes.map(async (route) => {
    const path = route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, () => randomUUID());
    const response = await fetch(`${apiBase}${path}`, {
      method: route.method,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json();
    return { key: `${route.method} ${route.path}`, response, payload };
  }));
  for (const { key, response, payload } of closedResponses) {
    assert.equal(response.status, 503, `${key} must remain unavailable until authenticated AI/OCR access is implemented.`);
    assert.equal(payload.code, 'AI_ENDPOINTS_UNAVAILABLE', `${key} must return the explicit deny-only response.`);
  }

  return { privateCount: policy.privateRoutes.length, publicCount: policy.publicCount, closedCount: policy.closedRoutes.length };
}

function localSupabaseEnvironment() {
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }

  const url = values.API_URL || values.SUPABASE_URL;
  const anonKey = values.ANON_KEY || values.SUPABASE_ANON_KEY;
  const serviceKey = values.SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = values.DB_URL || values.DATABASE_URL;
  if (!url || !anonKey || !serviceKey || !databaseUrl) {
    throw new Error('Supabase local status did not expose the local API URL, database URL, and test keys.');
  }
  const databaseHost = new URL(databaseUrl).hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseHost)) {
    throw new Error('Synthetic API fixture cleanup is restricted to the local Supabase database.');
  }
  return { url, anonKey, serviceKey, databaseUrl };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function createUserFixture(admin, tenantId, role, status, label, modulePermissions = { users: true }) {
  const id = randomUUID();
  const email = `api-${label}-${id.slice(0, 8)}@example.test`;
  const password = `Api-Test-${id}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `API test ${label}` },
  });
  if (error || !data.user) throw new Error(`Unable to create synthetic auth user (${label}).`);

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    tenant_id: tenantId,
    email,
    display_name: `API test ${label}`,
    username: `api-${label}-${id.slice(0, 8)}`,
    role,
    status,
    module_permissions: modulePermissions,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Unable to create synthetic profile (${label}).`);
  }

  return { uid: data.user.id, email, password, tenantId };
}

async function signIn(anon, user) {
  const { data, error } = await anon.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session?.access_token) throw new Error('Unable to obtain a local test access token.');
  return data.session.access_token;
}

async function main() {
  const { url, anonKey, serviceKey, databaseUrl } = localSupabaseEnvironment();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const fixtureSuffix = randomUUID().slice(0, 12);
  const tenantIds = [randomUUID(), randomUUID(), randomUUID()];
  const tahfidzCandidateId = randomUUID();
  const tahfidzStudentId = randomUUID();
  const guardianId = randomUUID();
  const alumniCandidateId = randomUUID();
  const alumniStudentId = randomUUID();
  const boardingBuildingId = `BLDG-${fixtureSuffix}`;
  const boardingRoomId = `ROOM-${fixtureSuffix}`;
  const otherTenantCbtCandidateId = randomUUID();
  const otherTenantCbtStudentId = randomUUID();
  const hrisOrganizationUnitId = randomUUID();
  const profileFailureEmail = `provision-failure-${fixtureSuffix}@example.test`;
  const users = [];
  const piiEncryptionKey = randomBytes(32).toString('hex');
  const piiFingerprintKey = randomBytes(32).toString('hex');
  let serverProcess;
  let serverDiagnostics = '';
  let serverShutdownRequested = false;
  let profileFailureTriggerInstalled = false;

  try {
    const tenantRows = tenantIds.map((id, index) => ({
      id,
      slug: `api-auth-${fixtureSuffix}-${index}`,
      name: `API auth test ${fixtureSuffix} ${index}`,
      status: index === 2 ? 'suspended' : 'active',
    }));
    const { error: tenantError } = await admin.from('tenants').insert(tenantRows);
    if (tenantError) throw new Error('Unable to create synthetic tenant fixtures.');

    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-a', { users: true, marketplace: true, crm: true, communication: true, tahfidz: true, academic: true, cbt: true, cooperative: true, finance: true, laundry: true, donation: true, document: true, healthcare: true, library: true, hris: true, lms: true, boarding: true, alumni: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'member-a', { tahfidz: true, academic: true, cbt: true, lms: true }));
    users.push(await createUserFixture(admin, tenantIds[1], 'santri', 'active', 'member-b', { cbt: true, lms: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'ustadz', 'active', 'ustadz-a', { communication: true, tahfidz: true, academic: true, cbt: true, library: true, lms: true, boarding: true, alumni: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'suspended', 'inactive-admin'));
    users.push(await createUserFixture(admin, tenantIds[2], 'admin', 'active', 'suspended-tenant-admin'));
    users.push(await createUserFixture(admin, tenantIds[0], 'wali_santri', 'active', 'wali-a', { ppdb: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'super_admin', 'active', 'superadmin-a', { users: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-users', {
      users: false,
      dashboard: false,
      intelligence: true,
      ppdb: false,
      'master-data': false,
      finance: false,
      cbt: false,
    }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-ppdb', { ppdb: false, finance: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-finance', { ppdb: true, finance: false }));
    users.push(await createUserFixture(admin, tenantIds[1], 'admin', 'active', 'admin-b', { marketplace: true, crm: true, communication: true, tahfidz: true, academic: true, cbt: true, cooperative: true, finance: true, laundry: true, donation: true, document: true, healthcare: true, library: true, hris: true, lms: true, boarding: true, alumni: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'initial-password-change'));
    const { error: forcePasswordError } = await admin.from('profiles')
      .update({ must_change_password: true })
      .eq('user_id', users[12].uid);
    if (forcePasswordError) throw new Error('Unable to configure the synthetic forced-password-change fixture.');
    const academicUnlinkedSantri = await createUserFixture(admin, tenantIds[1], 'santri', 'active', 'academic-unlinked-santri', { academic: true });
    users.push(academicUnlinkedSantri);
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-donation', { users: true, donation: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-document', { users: true, document: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-healthcare', { users: true, healthcare: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-facility', { users: true, ga: false, boarding: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-library', { users: true, library: false }));
    const hrisNoPermissionUser = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-hris', { users: true, hris: false });
    users.push(hrisNoPermissionUser);
    const alumniNoPermissionUser = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-alumni', { users: true, alumni: false });
    users.push(alumniNoPermissionUser);
    const { data: gradeReferenceRows, error: gradeReferenceError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantIds[0],
      domain: 'academic_grade_level',
      code: 'TEST_GRADE_VII',
      name: 'VII',
      description: 'Jenjang uji integrasi PPDB tenant.',
      status: 'active',
      nis_grade_code: '07',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    }).select('id');
    if (gradeReferenceError || gradeReferenceRows?.length !== 1) throw new Error('Unable to configure the synthetic tenant grade catalog.');
    const gradeLevelReferenceId = gradeReferenceRows[0].id;
    const { data: otherTenantGradeReferenceRows, error: otherTenantGradeReferenceError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantIds[1],
      domain: 'academic_grade_level',
      code: `TEST_GRADE_VII_B_${fixtureSuffix}`,
      name: 'VII',
      description: 'Jenjang uji integrasi CBT tenant kedua.',
      status: 'active',
      nis_grade_code: '07',
      created_by_user_id: users[11].uid,
      updated_by_user_id: users[11].uid,
    }).select('id');
    if (otherTenantGradeReferenceError || otherTenantGradeReferenceRows?.length !== 1) {
      throw new Error('Unable to configure the synthetic grade catalog in the second tenant.');
    }
    const otherTenantGradeLevelReferenceId = otherTenantGradeReferenceRows[0].id;

    const { error: hrisUnitError } = await admin.from('organization_units').insert({
      id: hrisOrganizationUnitId,
      tenant_id: tenantIds[0],
      code: `HRIS_${fixtureSuffix.toUpperCase()}`,
      name: `Unit HRIS Uji ${fixtureSuffix}`,
      unit_type: 'pesantren',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    });
    if (hrisUnitError) throw new Error('Unable to configure the synthetic HRIS organization unit.');

    const { data: hrisJobTitleRows, error: hrisJobTitleError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantIds[0],
      domain: 'hris_job_title',
      code: `HRIS_STAFF_${fixtureSuffix.toUpperCase()}`,
      name: `Staf HRIS Uji ${fixtureSuffix}`,
      description: 'Jabatan sintetis untuk pengujian API HRIS.',
      status: 'active',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    }).select('id');
    if (hrisJobTitleError || hrisJobTitleRows?.length !== 1) throw new Error('Unable to configure the synthetic HRIS job-title reference.');
    const hrisJobTitleReferenceId = hrisJobTitleRows[0].id;

    const facilityReferenceId = randomUUID();
    const { error: facilityReferenceError } = await admin.from('tenant_reference_items').insert({
      id: facilityReferenceId,
      tenant_id: tenantIds[0],
      domain: 'facility_resource',
      code: `TEST_FACILITY_${fixtureSuffix}`,
      name: `Aula Uji ${fixtureSuffix}`,
      description: 'Fasilitas sintetis untuk uji pemesanan.',
      status: 'active',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    });
    if (facilityReferenceError) throw new Error('Unable to configure the synthetic facility catalog.');

    const gaAssetCategoryId = randomUUID();
    const gaInventoryCategoryId = randomUUID();
    const gaInventoryUnitId = randomUUID();
    const { error: gaReferenceError } = await admin.from('tenant_reference_items').insert([
      { id: gaAssetCategoryId, tenant_id: tenantIds[0], domain: 'ga_asset_category', code: `TEST_ASSET_CAT_${fixtureSuffix}`, name: 'Elektronik Uji', description: 'Kategori aset sintetis.', status: 'active', created_by_user_id: users[0].uid, updated_by_user_id: users[0].uid },
      { id: gaInventoryCategoryId, tenant_id: tenantIds[0], domain: 'ga_inventory_category', code: `TEST_INV_CAT_${fixtureSuffix}`, name: 'Perlengkapan Uji', description: 'Kategori inventaris sintetis.', status: 'active', created_by_user_id: users[0].uid, updated_by_user_id: users[0].uid },
      { id: gaInventoryUnitId, tenant_id: tenantIds[0], domain: 'ga_inventory_unit', code: `TEST_INV_UNIT_${fixtureSuffix}`, name: 'Kotak Uji', description: 'Satuan inventaris sintetis.', status: 'active', created_by_user_id: users[0].uid, updated_by_user_id: users[0].uid },
    ]);
    if (gaReferenceError) throw new Error('Unable to configure the synthetic General Affairs catalog.');

    const { data: libraryReferenceRows, error: libraryReferenceError } = await admin.from('tenant_reference_items').insert([
      { tenant_id: tenantIds[0], domain: 'library_book_category', code: `TEST_LIBRARY_${fixtureSuffix}`, name: `Kategori Buku Uji ${fixtureSuffix}`, description: 'Kategori perpustakaan sintetis.', status: 'active', created_by_user_id: users[0].uid, updated_by_user_id: users[0].uid },
      { tenant_id: tenantIds[1], domain: 'library_book_category', code: `TEST_LIBRARY_OTHER_${fixtureSuffix}`, name: `Kategori Tenant Lain ${fixtureSuffix}`, description: 'Kategori tenant kedua untuk uji isolasi.', status: 'active', created_by_user_id: users[11].uid, updated_by_user_id: users[11].uid },
    ]).select('id,tenant_id');
    if (libraryReferenceError || libraryReferenceRows?.length !== 2) throw new Error('Unable to configure synthetic Library category references.');
    const libraryBookCategoryId = libraryReferenceRows.find((item) => item.tenant_id === tenantIds[0])?.id;
    const otherTenantLibraryCategoryId = libraryReferenceRows.find((item) => item.tenant_id === tenantIds[1])?.id;
    if (!libraryBookCategoryId || !otherTenantLibraryCategoryId) throw new Error('Synthetic Library category reference IDs could not be resolved.');

    const { error: tahfidzCandidateError } = await admin.from('candidates').insert({
      id: tahfidzCandidateId,
      tenant_id: tenantIds[0],
      registration_id: `TAHFIDZ-${fixtureSuffix}`,
      name: 'Santri Uji Tahfidz API',
      grade: 'VII',
      nik_ciphertext: `\\x${randomBytes(44).toString('hex')}`,
      nik_fingerprint: `\\x${randomBytes(32).toString('hex')}`,
    });
    if (tahfidzCandidateError) throw new Error('Unable to create the synthetic Tahfidz candidate.');

    const tahfidzStudentNis = String(9000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000));
    const tahfidzStudentNik = String(1000000000000000n + BigInt('0x' + randomBytes(7).toString('hex')) % 9000000000000000n);
    const { error: tahfidzStudentError } = await admin.from('students').insert({
      id: tahfidzStudentId,
      tenant_id: tenantIds[0],
      source_candidate_id: tahfidzCandidateId,
      nis: tahfidzStudentNis,
      name: 'Santri Uji Tahfidz API',
      gender: 'L',
      grade: 'VII',
      nik_ciphertext: encryptTestIdentity(tahfidzStudentNik, piiEncryptionKey),
      nik_fingerprint: String.fromCharCode(92) + 'x' + fingerprintTestIdentity('nik', tahfidzStudentNik, piiFingerprintKey),
      status: 'active',
    });
    if (tahfidzStudentError) throw new Error('Unable to create the synthetic Tahfidz student.');

    const { error: guardianError } = await admin.from('guardians').insert({
      id: guardianId,
      tenant_id: tenantIds[0],
      source_candidate_id: tahfidzCandidateId,
      name: `Wali Uji ${fixtureSuffix}`,
      phone: '081234567890',
      status: 'active',
    });
    if (guardianError) throw new Error('Unable to create the synthetic Guardian record.');
    const { error: guardianStudentError } = await admin.from('guardian_students').insert({
      tenant_id: tenantIds[0],
      guardian_id: guardianId,
      student_id: tahfidzStudentId,
      relationship: 'Orang Tua',
    });
    if (guardianStudentError) throw new Error('Unable to create the synthetic Guardian-to-student relationship.');

    const { error: alumniCandidateError } = await admin.from('candidates').insert({
      id: alumniCandidateId,
      tenant_id: tenantIds[0],
      registration_id: `ALUMNI-${fixtureSuffix}`,
      name: `Santri Uji Alumni API ${fixtureSuffix}`,
      grade: 'VII',
      nik_ciphertext: `\\x${randomBytes(44).toString('hex')}`,
      nik_fingerprint: `\\x${randomBytes(32).toString('hex')}`,
    });
    if (alumniCandidateError) throw new Error('Unable to create the synthetic Alumni candidate.');

    const alumniStudentNis = String(7000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000));
    const alumniStudentNik = String(1000000000000000n + BigInt('0x' + randomBytes(7).toString('hex')) % 9000000000000000n);
    const { error: alumniStudentError } = await admin.from('students').insert({
      id: alumniStudentId,
      tenant_id: tenantIds[0],
      source_candidate_id: alumniCandidateId,
      nis: alumniStudentNis,
      name: `Santri Uji Alumni API ${fixtureSuffix}`,
      gender: 'L',
      grade: 'VII',
      nik_ciphertext: encryptTestIdentity(alumniStudentNik, piiEncryptionKey),
      nik_fingerprint: String.fromCharCode(92) + 'x' + fingerprintTestIdentity('nik', alumniStudentNik, piiFingerprintKey),
      status: 'active',
    });
    if (alumniStudentError) throw new Error('Unable to create the synthetic Alumni student.');

    const { error: otherTenantCbtCandidateError } = await admin.from('candidates').insert({
      id: otherTenantCbtCandidateId,
      tenant_id: tenantIds[1],
      registration_id: `CBT-${fixtureSuffix}`,
      name: `Santri Tenant B CBT ${fixtureSuffix}`,
      grade: 'VII',
      grade_level_reference_id: otherTenantGradeLevelReferenceId,
      nik_ciphertext: `\\x${randomBytes(44).toString('hex')}`,
      nik_fingerprint: `\\x${randomBytes(32).toString('hex')}`,
    });
    if (otherTenantCbtCandidateError) throw new Error('Unable to create the synthetic CBT student in the second tenant.');
    const otherTenantCbtNis = String(8000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000));
    const { error: otherTenantCbtStudentError } = await admin.from('students').insert({
      id: otherTenantCbtStudentId,
      tenant_id: tenantIds[1],
      source_candidate_id: otherTenantCbtCandidateId,
      nis: otherTenantCbtNis,
      name: `Santri Tenant B CBT ${fixtureSuffix}`,
      gender: 'L',
      grade: 'VII',
      grade_level_reference_id: otherTenantGradeLevelReferenceId,
      nik_ciphertext: `\\x${randomBytes(44).toString('hex')}`,
      nik_fingerprint: `\\x${randomBytes(32).toString('hex')}`,
      status: 'active',
    });
    if (otherTenantCbtStudentError) throw new Error('Unable to create the synthetic CBT student roster in the second tenant.');

    const academicClassId = `CLASS-${fixtureSuffix}`;
    const { error: academicClassError } = await admin.from('master_data_records').insert({
      tenant_id: tenantIds[0],
      category: 'Kelas',
      id: academicClassId,
      name: `Kelas Akademik API ${fixtureSuffix}`,
      status: 'Active',
      grade: 'VII',
    });
    if (academicClassError) throw new Error('Unable to create the synthetic Academic class reference.');
    const { error: academicStudentClassError } = await admin.from('students')
      .update({ class_id: academicClassId })
      .eq('tenant_id', tenantIds[0])
      .eq('id', tahfidzStudentId);
    if (academicStudentClassError) throw new Error('Unable to link the synthetic Academic student to its class.');
    const { error: boardingBuildingError } = await admin.from('master_data_records').insert({
      tenant_id: tenantIds[0], category: 'Gedung', id: boardingBuildingId,
      name: `Gedung Asrama API ${fixtureSuffix}`, status: 'Active', gender_code: 'L',
    });
    if (boardingBuildingError) throw new Error('Unable to create the synthetic Boarding building.');
    const { error: boardingRoomError } = await admin.from('master_data_records').insert({
      tenant_id: tenantIds[0], category: 'Kamar', id: boardingRoomId,
      name: `Kamar Asrama API ${fixtureSuffix}`, status: 'Active', parent_id: boardingBuildingId,
      capacity: 2, occupied: 0, gender_code: 'L',
    });
    if (boardingRoomError) throw new Error('Unable to create the synthetic Boarding room.');
    const { data: boardingAssignment, error: boardingAssignmentError } = await admin.rpc('assign_student_to_room', {
      p_tenant_id: tenantIds[0], p_student_id: tahfidzStudentId,
      p_room_id: boardingRoomId, p_building_id: boardingBuildingId,
    });
    if (boardingAssignmentError || boardingAssignment?.success !== true) throw new Error('Unable to link the synthetic Boarding student, room, and building.');
    const { error: academicStudentLinkError } = await admin.from('profiles')
      .update({ linked_santri_id: tahfidzStudentId })
      .eq('tenant_id', tenantIds[0])
      .eq('user_id', users[1].uid);
    if (academicStudentLinkError) throw new Error('Unable to link the synthetic Santri portal profile.');
    const { error: otherTenantCbtStudentLinkError } = await admin.from('profiles')
      .update({ linked_santri_id: otherTenantCbtStudentId })
      .eq('tenant_id', tenantIds[1])
      .eq('user_id', users[2].uid);
    if (otherTenantCbtStudentLinkError) throw new Error('Unable to link the synthetic second-tenant Santri CBT profile.');
    const academicReferenceRows = [
      { domain: 'academic_subject', code: `API_SUBJECT_${fixtureSuffix}`, name: `Matematika API ${fixtureSuffix}` },
      { domain: 'academic_curriculum', code: `API_CURRICULUM_${fixtureSuffix}`, name: `Kurikulum API ${fixtureSuffix}` },
      { domain: 'academic_assessment_type', code: `API_ASSESSMENT_${fixtureSuffix}`, name: `Penilaian API ${fixtureSuffix}` },
      { domain: 'cbt_question_template', code: `API_CBT_TEMPLATE_${fixtureSuffix}`, name: `Paket Soal API ${fixtureSuffix}` },
    ].map((reference) => ({
      tenant_id: tenantIds[0],
      ...reference,
      description: 'Referensi tenant sintetis untuk pengujian integrasi Akademik.',
      status: 'active',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    }));
    const { data: academicReferences, error: academicReferenceError } = await admin.from('tenant_reference_items')
      .insert(academicReferenceRows)
      .select('id,domain,code,name');
    if (academicReferenceError || academicReferences?.length !== academicReferenceRows.length) {
      throw new Error('Unable to create the synthetic Academic choice references.');
    }
    const academicSubjectId = academicReferences.find((reference) => reference.domain === 'academic_subject')?.id;
    const academicCurriculumId = academicReferences.find((reference) => reference.domain === 'academic_curriculum')?.id;
    const academicAssessmentTypeId = academicReferences.find((reference) => reference.domain === 'academic_assessment_type')?.id;
    const cbtQuestionTemplateId = academicReferences.find((reference) => reference.domain === 'cbt_question_template')?.id;
    if (!academicSubjectId || !academicCurriculumId || !academicAssessmentTypeId || !cbtQuestionTemplateId || !gradeLevelReferenceId) {
      throw new Error('The synthetic Academic choice reference IDs could not be resolved.');
    }

    const adminToken = await signIn(anon, users[0]);
    const santriToken = await signIn(anon, users[1]);
    const ustadzToken = await signIn(anon, users[3]);
    const donationNoPermissionToken = await signIn(anon, users[14]);
    const documentNoPermissionToken = await signIn(anon, users[15]);
    const healthcareNoPermissionToken = await signIn(anon, users[16]);
    const facilityNoPermissionToken = await signIn(anon, users[17]);
    const libraryNoPermissionToken = await signIn(anon, users[18]);
    const waliToken = await signIn(anon, users[6]);
    const superAdminToken = await signIn(anon, users[7]);
    const limitedAdminToken = await signIn(anon, users[8]);
    const inactiveAdminToken = await signIn(anon, users[4]);
    const suspendedTenantAdminToken = await signIn(anon, users[5]);
    const noPpdbAdminToken = await signIn(anon, users[9]);
    const noFinanceAdminToken = await signIn(anon, users[10]);
    const otherTenantMarketplaceAdminToken = await signIn(anon, users[11]);
    const hrisNoPermissionToken = await signIn(anon, hrisNoPermissionUser);
    const forcedPasswordToken = await signIn(anon, users[12]);
    const port = await availablePort();
    const apiBase = `http://127.0.0.1:${port}`;

    serverProcess = spawn('bun', ['run', 'dev'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        SUPABASE_URL: url,
        SUPABASE_SECRET_KEY: serviceKey,
        SUPABASE_SERVICE_ROLE_KEY: '',
        PII_ENCRYPTION_KEY: piiEncryptionKey,
        PII_FINGERPRINT_KEY: piiFingerprintKey,
        SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED: 'false',
        SUPABASE_PPDB_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED: 'false',
        SUPABASE_PPDB_FINANCE_BILLS_ENABLED: 'false',
        SUPABASE_FINANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_MARKETPLACE_RUNTIME_ENABLED: 'true',
        SUPABASE_COOPERATIVE_RUNTIME_ENABLED: 'true',
        SUPABASE_LAUNDRY_RUNTIME_ENABLED: 'true',
        SUPABASE_DONATION_RUNTIME_ENABLED: 'true',
        SUPABASE_LIBRARY_RUNTIME_ENABLED: 'true',
        SUPABASE_CRM_RUNTIME_ENABLED: 'true',
        SUPABASE_DASHBOARD_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_MASTER_DATA_RUNTIME_ENABLED: 'false',
        SUPABASE_MASTER_DATA_IMPORT_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const captureServerOutput = (chunk) => {
      serverDiagnostics = `${serverDiagnostics}${chunk.toString()}`.slice(-8000);
    };
    serverProcess.stdout.on('data', captureServerOutput);
    serverProcess.stderr.on('data', captureServerOutput);
    serverProcess.on('exit', (code, signal) => {
      if (!serverShutdownRequested) console.error(`API test server exited unexpectedly (code=${code ?? 'none'}, signal=${signal ?? 'none'}).\r\n${serverDiagnostics}`);
    });

    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline && serverProcess.exitCode === null) {
      try {
        const response = await fetch(`${apiBase}/api/users`);
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert.ok(ready, 'API server did not become ready on its configured test port.');

    const routeAuthCoverage = await verifyAllPrivateApiRoutesRejectAnonymousRequests(apiBase);
    console.log(`Verified anonymous rejection for ${routeAuthCoverage.privateCount} private API routes; ${routeAuthCoverage.publicCount} explicit public and ${routeAuthCoverage.closedCount} deny-only routes are allowlisted.`);

    const liveResponse = await fetch(`${apiBase}/health/live`);
    assert.equal(liveResponse.status, 200, 'Liveness must report a running API without exposing diagnostics.');
    assert.equal((await liveResponse.json()).status, 'live');
    assert.equal(liveResponse.headers.get('cache-control'), 'no-store');

    const readyResponse = await fetch(`${apiBase}/health/ready`);
    assert.equal(readyResponse.status, 200, 'Readiness must verify the local Supabase profile store.');
    assert.equal((await readyResponse.json()).status, 'ready');
    const unauthenticatedProfile = await fetch(`${apiBase}/api/auth/profile`);
    assert.equal(unauthenticatedProfile.status, 401, 'The authenticated profile endpoint must reject requests without a bearer token.');

    const invalidTokenProfile = await fetch(`${apiBase}/api/auth/profile`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    assert.equal(invalidTokenProfile.status, 401, 'The profile endpoint must verify bearer tokens before reading a profile.');

    const ownProfileResponse = await fetch(`${apiBase}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(ownProfileResponse.status, 200, 'A valid user can load their own profile through the trusted server.');
    assert.equal(ownProfileResponse.headers.get('cache-control'), 'private, no-store');
    const ownProfilePayload = await ownProfileResponse.json();
    assert.equal(ownProfilePayload.profile.uid, users[0].uid);
    assert.equal(ownProfilePayload.profile.tenantId, tenantIds[0]);
    assert.equal(ownProfilePayload.profile.role, 'Admin');
    assert.equal(ownProfilePayload.profile.status, 'active');
    assert.equal(Object.hasOwn(ownProfilePayload.profile, 'createdByUid'), false, 'The profile endpoint must return only fields needed by the client.');

    const ignoredProfileSelector = await fetch(`${apiBase}/api/auth/profile?userId=${encodeURIComponent(users[2].uid)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(ignoredProfileSelector.status, 200);
    assert.equal((await ignoredProfileSelector.json()).profile.uid, users[0].uid, 'Profile selection must come from the verified token, not a caller-supplied user ID.');

    const inactiveProfileResponse = await fetch(`${apiBase}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${inactiveAdminToken}` },
    });
    assert.equal(inactiveProfileResponse.status, 200);
    assert.equal((await inactiveProfileResponse.json()).profile.status, 'disabled', 'Inactive profiles must be explicitly marked for client-side fail-closed validation.');

    assert.equal(readyResponse.headers.get('cache-control'), 'no-store');

    const dashboardSnapshot = await fetch(`${apiBase}/api/dashboard/snapshot?surface=dashboard&period=month`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(dashboardSnapshot.status, 200, 'Dashboard access must use the dashboard permission and tenant snapshot.');
    assert.equal(dashboardSnapshot.headers.get('cache-control'), 'no-store');
    const dashboardPayload = await dashboardSnapshot.json();
    assert.equal(dashboardPayload.ppdb.enabled, true, 'Dashboard submodule data must reflect the actor permission.');

    const dashboardDenied = await fetch(`${apiBase}/api/dashboard/snapshot?surface=dashboard`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(dashboardDenied.status, 403, 'An intelligence-only user must not inherit dashboard access.');

    const intelligenceSnapshot = await fetch(`${apiBase}/api/dashboard/snapshot?surface=intelligence&period=month`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(intelligenceSnapshot.status, 200, 'Intelligence access must be independently granted.');
    const intelligencePayload = await intelligenceSnapshot.json();
    assert.equal(intelligencePayload.ppdb.enabled, false, 'Analytic data must remain hidden when the PPDB permission is denied.');
    assert.equal(intelligencePayload.masterData.enabled, false, 'Analytic data must remain hidden when the Master Data permission is denied.');
    assert.equal(intelligencePayload.finance.enabled, false, 'Analytic data must remain hidden when the Finance permission is denied.');

    const intelligenceDenied = await fetch(`${apiBase}/api/dashboard/snapshot?surface=intelligence`, {
      headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(intelligenceDenied.status, 403, 'Non-administrator roles must not access tenant-wide analytic snapshots.');

    const invalidDashboardSurface = await fetch(`${apiBase}/api/dashboard/snapshot?surface=all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidDashboardSurface.status, 400, 'Dashboard surface must reject unknown permission scopes.');

    await fetch(`${apiBase}/api/users/clear-must-change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${forcedPasswordToken}` },
    });
    const { data: profileAfterLegacyClear, error: legacyClearReadError } = await admin.from('profiles')
      .select('must_change_password')
      .eq('user_id', users[12].uid)
      .maybeSingle();
    assert.equal(legacyClearReadError, null, 'The forced-password-change fixture must remain readable after the legacy request.');
    assert.equal(profileAfterLegacyClear?.must_change_password, true, 'The retired clear-only endpoint must not clear the forced-change flag.');

    const clearOnlyPasswordFlag = await fetch(`${apiBase}/api/users/change-initial-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${forcedPasswordToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(clearOnlyPasswordFlag.status, 400, 'An authenticated user cannot clear the forced-change flag without a new password.');

    const shortInitialPassword = await fetch(`${apiBase}/api/users/change-initial-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${forcedPasswordToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'short' }),
    });
    assert.equal(shortInitialPassword.status, 400, 'Initial password change must enforce the server-side minimum length.');

    const updatedPassword = `New-Password-${randomUUID()}-Aa1!`;
    const initialPasswordChange = await fetch(`${apiBase}/api/users/change-initial-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${forcedPasswordToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: updatedPassword }),
    });
    assert.equal(initialPasswordChange.status, 200, 'The authenticated user can update their temporary password through the server-owned flow.');
    const { data: changedProfile, error: changedProfileError } = await admin.from('profiles')
      .select('must_change_password')
      .eq('user_id', users[12].uid)
      .maybeSingle();
    assert.equal(changedProfileError, null, 'Forced-password-change profile state must remain readable in the local fixture.');
    assert.equal(changedProfile?.must_change_password, false, 'The forced-change flag clears only after Auth accepts the new password.');
    const oldPasswordSignIn = await anon.auth.signInWithPassword({ email: users[12].email, password: users[12].password });
    assert.ok(oldPasswordSignIn.error, 'The temporary password must stop authenticating after the change.');
    const newPasswordSignIn = await anon.auth.signInWithPassword({ email: users[12].email, password: updatedPassword });
    assert.equal(newPasswordSignIn.error, null, 'The changed password must authenticate successfully.');
    if (newPasswordSignIn.data.session) await anon.auth.signOut();

    const { data: marketplaceBatches, error: marketplaceBatchError } = await admin
      .from('marketplace_legacy_import_batches')
      .select('snapshot_fingerprint')
      .eq('tenant_id', tenantIds[0])
      .limit(1);
    assert.equal(marketplaceBatchError, null, 'A fresh tenant can inspect the optional Marketplace import ledger.');
    assert.equal(marketplaceBatches.length, 0, 'The Marketplace fixture starts without any imported Firestore snapshot.');

    const emptyMarketplaceResponse = await fetch(`${apiBase}/api/marketplace/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(emptyMarketplaceResponse.status, 200, 'Marketplace runtime must open for a tenant with no legacy import batch.');
    const emptyMarketplace = await emptyMarketplaceResponse.json();
    assert.deepEqual(emptyMarketplace.products, [], 'A new tenant starts with an empty product catalog.');
    assert.deepEqual(emptyMarketplace.orders, [], 'A new tenant starts with no orders.');
    assert.deepEqual(emptyMarketplace.movements, [], 'A new tenant starts with no stock movements.');

    const { data: marketplaceCategory, error: marketplaceCategoryError } = await admin.from('tenant_reference_items')
      .select('id,name')
      .eq('tenant_id', tenantIds[0])
      .eq('domain', 'marketplace_product_category')
      .eq('name', 'Perlengkapan Santri')
      .eq('status', 'active')
      .maybeSingle();
    assert.equal(marketplaceCategoryError, null, 'The product fixture must read the tenant-owned Marketplace category.');
    assert.ok(marketplaceCategory?.id, 'An Admin tenant starts with an active default product category.');

    const productResponse = await fetch(`${apiBase}/api/marketplace/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        sku: `MKT-${fixtureSuffix}`,
        name: 'Produk Uji Tanpa Impor',
        categoryReferenceId: marketplaceCategory.id,
        unitPrice: 12500,
        initialStock: 8,
        seller: 'Koperasi',
        imageLabel: '📦',
        clientRequestId: randomUUID(),
      }),
    });
    assert.equal(productResponse.status, 201, 'An authorized admin can create the first product without a legacy import batch.');
    const createdProduct = await productResponse.json();
    assert.ok(createdProduct?.id, 'The first tenant product is persisted by the Supabase transaction.');

    const marketplaceAfterCreateResponse = await fetch(`${apiBase}/api/marketplace/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(marketplaceAfterCreateResponse.status, 200, 'Marketplace continues to read after the first product is created.');
    const marketplaceAfterCreate = await marketplaceAfterCreateResponse.json();
    assert.equal(marketplaceAfterCreate.products.length, 1, 'The first manually created product appears in the tenant catalog.');
    assert.equal(marketplaceAfterCreate.products[0].stock, 8, 'Initial product stock is visible in the tenant snapshot.');

    const crossTenantOrderResponse = await fetch(`${apiBase}/api/marketplace/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Pelanggan Tenant Lain',
        customerType: 'Parent',
        items: [{ productId: createdProduct.id, quantity: 1 }],
        clientRequestId: randomUUID(),
      }),
    });
    assert.notEqual(crossTenantOrderResponse.status, 201, 'A tenant B Admin cannot create an order from a tenant A product.');

    const otherTenantMarketplaceResponse = await fetch(`${apiBase}/api/marketplace/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantMarketplaceResponse.status, 200, 'An authorized second-tenant Admin can read their own Marketplace snapshot.');
    const otherTenantMarketplace = await otherTenantMarketplaceResponse.json();
    assert.deepEqual(otherTenantMarketplace.products, [], 'Tenant B cannot see tenant A products.');
    assert.deepEqual(otherTenantMarketplace.orders, [], 'Tenant B cannot see tenant A orders.');
    assert.deepEqual(otherTenantMarketplace.movements, [], 'Tenant B cannot see tenant A stock movements.');

    const orderResponse = await fetch(`${apiBase}/api/marketplace/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Wali Uji Integrasi',
        customerType: 'Parent',
        items: [{ productId: createdProduct.id, quantity: 2 }],
        clientRequestId: randomUUID(),
      }),
    });
    assert.equal(orderResponse.status, 201, 'An authorized tenant Admin can place an order for a tenant product.');
    const createdOrder = await orderResponse.json();
    assert.ok(createdOrder?.id, 'The order is persisted through the transactional Supabase RPC.');

    const marketplaceAfterOrderResponse = await fetch(`${apiBase}/api/marketplace/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(marketplaceAfterOrderResponse.status, 200);
    const marketplaceAfterOrder = await marketplaceAfterOrderResponse.json();
    const linkedOrder = marketplaceAfterOrder.orders.find((order) => order.id === createdOrder.id);
    assert.ok(linkedOrder, 'The tenant snapshot returns the newly created order.');
    assert.equal(linkedOrder.lines.length, 1, 'The order snapshot includes its relational order item.');
    assert.equal(linkedOrder.lines[0].product_id, createdProduct.id, 'The order item references its same-tenant product.');
    assert.equal(linkedOrder.lines[0].product_name_snapshot, 'Produk Uji Tanpa Impor');
    assert.equal(linkedOrder.lines[0].quantity, 2);
    assert.equal(marketplaceAfterOrder.products[0].stock, 6, 'Transactional checkout reserves stock exactly once.');
    assert.ok(marketplaceAfterOrder.movements.some((movement) => movement.order_id === createdOrder.id && movement.product_id === createdProduct.id && movement.quantity_delta === -2), 'The stock ledger links its reservation to the order and product.');

    const cancelResponse = await fetch(`${apiBase}/api/marketplace/orders/${encodeURIComponent(createdOrder.id)}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled', clientRequestId: randomUUID() }),
    });
    assert.equal(cancelResponse.status, 200, 'An authorized tenant Admin can cancel an order.');
    const marketplaceAfterCancelResponse = await fetch(`${apiBase}/api/marketplace/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(marketplaceAfterCancelResponse.status, 200);
    const marketplaceAfterCancel = await marketplaceAfterCancelResponse.json();
    assert.equal(marketplaceAfterCancel.orders.find((order) => order.id === createdOrder.id)?.status, 'cancelled');
    assert.equal(marketplaceAfterCancel.products[0].stock, 8, 'Cancelling an order restores the reserved stock exactly once.');
    assert.ok(marketplaceAfterCancel.movements.some((movement) => movement.order_id === createdOrder.id && movement.product_id === createdProduct.id && movement.quantity_delta === 2), 'The stock ledger links the cancellation reversal to the order and product.');

    const cooperativeDeniedAdmin = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'cooperative-denied', { cooperative: false, finance: true });
    users.push(cooperativeDeniedAdmin);
    const cooperativeNoFinanceAdmin = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'cooperative-no-finance', { cooperative: true, finance: false });
    users.push(cooperativeNoFinanceAdmin);
    const cooperativeDeniedToken = await signIn(anon, cooperativeDeniedAdmin);
    const cooperativeNoFinanceToken = await signIn(anon, cooperativeNoFinanceAdmin);

    const cooperativeDeniedSnapshot = await fetch(`${apiBase}/api/cooperative/snapshot`, {
      headers: { Authorization: `Bearer ${cooperativeDeniedToken}` },
    });
    assert.equal(cooperativeDeniedSnapshot.status, 403, 'An Admin without Cooperative permission cannot read its API.');

    const cooperativeEmptySnapshot = await fetch(`${apiBase}/api/cooperative/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cooperativeEmptySnapshot.status, 200, 'An authorized Admin can read the initial Cooperative snapshot.');
    const cooperativeEmpty = await cooperativeEmptySnapshot.json();
    assert.deepEqual(cooperativeEmpty.products, [], 'A new tenant begins without Cooperative products.');
    assert.deepEqual(cooperativeEmpty.suppliers, [], 'A new tenant begins without Cooperative suppliers.');
    assert.deepEqual(cooperativeEmpty.sales, [], 'A new tenant begins without Cooperative sales.');

    const cooperativeCategoryResult = await admin.from('tenant_reference_items')
      .select('id,name')
      .eq('tenant_id', tenantIds[0])
      .eq('domain', 'cooperative_product_category')
      .eq('code', 'PERLENGKAPAN_SANTRI')
      .eq('status', 'active')
      .maybeSingle();
    assert.equal(cooperativeCategoryResult.error, null, 'The tenant owns an active Cooperative product category.');
    assert.ok(cooperativeCategoryResult.data?.id, 'The tenant category is available to the Cooperative API.');
    const foreignCooperativeCategoryResult = await admin.from('tenant_reference_items')
      .select('id')
      .eq('tenant_id', tenantIds[1])
      .eq('domain', 'cooperative_product_category')
      .eq('code', 'PERLENGKAPAN_SANTRI')
      .eq('status', 'active')
      .maybeSingle();
    assert.equal(foreignCooperativeCategoryResult.error, null);
    assert.ok(foreignCooperativeCategoryResult.data?.id, 'Tenant B has a separately owned category fixture.');

    const cooperativeProductInput = {
      action: 'create',
      sku: `KOP-${fixtureSuffix}`,
      name: 'Perlengkapan Uji Koperasi',
      categoryReferenceId: cooperativeCategoryResult.data.id,
      initialStock: 5,
      costPrice: 1000,
      unitPrice: 2000,
      reorderPoint: 1,
      clientRequestId: randomUUID(),
    };
    const cooperativeProductCreate = await fetch(`${apiBase}/api/cooperative/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeProductInput),
    });
    assert.equal(cooperativeProductCreate.status, 201, 'An authorized Admin can persist a Cooperative product through the API.');
    const createdCooperativeProduct = await cooperativeProductCreate.json();
    assert.ok(createdCooperativeProduct.id, 'The product API returns the saved ID.');
    const cooperativeProductRetry = await fetch(`${apiBase}/api/cooperative/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeProductInput),
    });
    assert.equal(cooperativeProductRetry.status, 201, 'A repeated product request returns the original success.');
    assert.equal((await cooperativeProductRetry.json()).id, createdCooperativeProduct.id, 'Product retries do not duplicate the row.');
    const savedCooperativeProduct = await admin.from('cooperative_products')
      .select('tenant_id,category_reference_id,stock_quantity')
      .eq('id', createdCooperativeProduct.id)
      .single();
    assert.equal(savedCooperativeProduct.error, null);
    assert.equal(savedCooperativeProduct.data?.tenant_id, tenantIds[0]);
    assert.equal(savedCooperativeProduct.data?.category_reference_id, cooperativeCategoryResult.data.id, 'The product persists its same-tenant category relation.');
    assert.equal(savedCooperativeProduct.data?.stock_quantity, 5);

    const foreignCategoryProduct = await fetch(`${apiBase}/api/cooperative/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...cooperativeProductInput,
        sku: `KOP-FOREIGN-${fixtureSuffix}`,
        categoryReferenceId: foreignCooperativeCategoryResult.data.id,
        clientRequestId: randomUUID(),
      }),
    });
    assert.equal(foreignCategoryProduct.status, 400, 'A product cannot reference a category owned by another tenant.');

    const supplierCategoryResult = await admin.from('tenant_reference_items')
      .select('id,name')
      .eq('tenant_id', tenantIds[0])
      .eq('domain', 'cooperative_supplier_category')
      .eq('code', 'BARANG_UMUM')
      .eq('status', 'active')
      .maybeSingle();
    assert.equal(supplierCategoryResult.error, null);
    assert.ok(supplierCategoryResult.data?.id, 'The tenant owns an active supplier category.');
    const cooperativeSupplierInput = {
      action: 'create',
      name: 'Pemasok Uji Koperasi',
      categoryReferenceId: supplierCategoryResult.data.id,
      contact: '081234567890',
      pic: 'Petugas Uji',
      clientRequestId: randomUUID(),
    };
    const cooperativeSupplierCreate = await fetch(`${apiBase}/api/cooperative/suppliers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeSupplierInput),
    });
    assert.equal(cooperativeSupplierCreate.status, 201, 'A tenant Admin can save a supplier with its reference relation.');
    const createdCooperativeSupplier = await cooperativeSupplierCreate.json();
    assert.ok(createdCooperativeSupplier.id);
    const cooperativeSupplierRetry = await fetch(`${apiBase}/api/cooperative/suppliers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeSupplierInput),
    });
    assert.equal(cooperativeSupplierRetry.status, 201, 'A repeated supplier request returns success.');
    assert.equal((await cooperativeSupplierRetry.json()).id, createdCooperativeSupplier.id, 'Supplier retries do not duplicate the row.');
    const savedCooperativeSupplier = await admin.from('cooperative_suppliers')
      .select('tenant_id,category_reference_id,name')
      .eq('id', createdCooperativeSupplier.id)
      .single();
    assert.equal(savedCooperativeSupplier.error, null);
    assert.equal(savedCooperativeSupplier.data?.tenant_id, tenantIds[0]);
    assert.equal(savedCooperativeSupplier.data?.category_reference_id, supplierCategoryResult.data.id, 'The supplier persists its same-tenant category relation.');
    assert.equal(savedCooperativeSupplier.data?.name, 'Pemasok Uji Koperasi');

    const cooperativeStockInput = {
      productId: createdCooperativeProduct.id,
      delta: 2,
      reason: 'Penambahan stok uji',
      clientRequestId: randomUUID(),
    };
    const cooperativeStockAdjust = await fetch(`${apiBase}/api/cooperative/stock-adjustments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeStockInput),
    });
    assert.equal(cooperativeStockAdjust.status, 201, 'An authorized Admin can adjust tenant product stock.');
    const createdStockMovement = await cooperativeStockAdjust.json();
    assert.equal(createdStockMovement.balanceAfter, 7);
    const cooperativeStockRetry = await fetch(`${apiBase}/api/cooperative/stock-adjustments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cooperativeStockInput),
    });
    assert.equal(cooperativeStockRetry.status, 201, 'A repeated stock adjustment returns success.');
    assert.equal((await cooperativeStockRetry.json()).id, createdStockMovement.id, 'A stock retry reuses its movement.');

    const cooperativeSnapshotTenantB = await fetch(`${apiBase}/api/cooperative/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(cooperativeSnapshotTenantB.status, 200, 'A Cooperative-enabled Admin can read its own tenant snapshot.');
    const cooperativeTenantB = await cooperativeSnapshotTenantB.json();
    assert.deepEqual(cooperativeTenantB.products, [], 'Tenant B cannot read Tenant A products.');
    assert.deepEqual(cooperativeTenantB.suppliers, [], 'Tenant B cannot read Tenant A suppliers.');
    assert.deepEqual(cooperativeTenantB.sales, [], 'Tenant B cannot read Tenant A sales.');
    const crossTenantCooperativeStock = await fetch(`${apiBase}/api/cooperative/stock-adjustments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cooperativeStockInput, delta: 1, clientRequestId: randomUUID() }),
    });
    assert.equal(crossTenantCooperativeStock.status, 404, 'Tenant B cannot mutate Tenant A stock by guessing a product ID.');

    const studentWallet = cooperativeEmpty.wallets.find((wallet) => wallet.studentId === tahfidzStudentId);
    assert.ok(studentWallet?.id, 'An active student has a tenant-owned cooperative wallet.');
    const walletPolicyInput = { dailyLimit: 20000, status: 'active', clientRequestId: randomUUID() };
    const walletPolicyUpdate = await fetch(`${apiBase}/api/cooperative/wallets/${encodeURIComponent(studentWallet.id)}/policy`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(walletPolicyInput),
    });
    assert.equal(walletPolicyUpdate.status, 200, 'A tenant Admin can save the student wallet policy.');
    const walletPolicyResult = await walletPolicyUpdate.json();
    assert.equal(walletPolicyResult.replayed, false);
    const walletPolicyRetry = await fetch(`${apiBase}/api/cooperative/wallets/${encodeURIComponent(studentWallet.id)}/policy`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(walletPolicyInput),
    });
    assert.equal(walletPolicyRetry.status, 200, 'A repeated wallet policy request returns success.');
    assert.equal((await walletPolicyRetry.json()).replayed, true, 'A repeated wallet policy request is recognized as an idempotent replay.');
    const topUpInput = {
      amount: 10000,
      reference: `Top-up API ${fixtureSuffix}`,
      clientRequestId: randomUUID(),
    };
    const deniedWalletTopUp = await fetch(`${apiBase}/api/cooperative/wallets/${encodeURIComponent(studentWallet.id)}/top-ups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cooperativeNoFinanceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...topUpInput, clientRequestId: randomUUID() }),
    });
    assert.equal(deniedWalletTopUp.status, 403, 'A Cooperative Admin without Finance permission cannot top up a wallet.');
    const cooperativeTopUp = await fetch(`${apiBase}/api/cooperative/wallets/${encodeURIComponent(studentWallet.id)}/top-ups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(topUpInput),
    });
    assert.equal(cooperativeTopUp.status, 201, 'A Finance-enabled Cooperative Admin can fund a student wallet.');
    const topUpResult = await cooperativeTopUp.json();
    assert.equal(topUpResult.balanceAfter, 10000);
    const cooperativeTopUpRetry = await fetch(`${apiBase}/api/cooperative/wallets/${encodeURIComponent(studentWallet.id)}/top-ups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(topUpInput),
    });
    assert.equal(cooperativeTopUpRetry.status, 201, 'A repeated wallet funding request returns success.');
    assert.equal((await cooperativeTopUpRetry.json()).id, topUpResult.id, 'Wallet top-up retries do not create a second ledger entry.');

    const saleInput = {
      walletId: studentWallet.id,
      items: [{ productId: createdCooperativeProduct.id, quantity: 2 }],
      clientRequestId: randomUUID(),
    };
    const cooperativeSale = await fetch(`${apiBase}/api/cooperative/sales`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(saleInput),
    });
    assert.equal(cooperativeSale.status, 201, 'A tenant Admin can complete a wallet-backed cooperative sale.');
    const createdCooperativeSale = await cooperativeSale.json();
    assert.equal(createdCooperativeSale.totalAmount, 4000);
    assert.equal(createdCooperativeSale.balanceAfter, 6000);
    const cooperativeSaleRetry = await fetch(`${apiBase}/api/cooperative/sales`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(saleInput),
    });
    assert.equal(cooperativeSaleRetry.status, 201, 'A repeated sale request returns success.');
    assert.equal((await cooperativeSaleRetry.json()).id, createdCooperativeSale.id, 'Sale retries do not debit funds or stock twice.');

    const cooperativeSnapshotAfterSale = await fetch(`${apiBase}/api/cooperative/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cooperativeSnapshotAfterSale.status, 200);
    const cooperativeAfterSale = await cooperativeSnapshotAfterSale.json();
    assert.equal(cooperativeAfterSale.products.length, 1);
    assert.equal(cooperativeAfterSale.products[0].stock, 5, 'The snapshot reflects initial stock, manual adjustment, and one sale.');
    assert.equal(cooperativeAfterSale.suppliers.length, 1);
    assert.equal(cooperativeAfterSale.suppliers[0].id, createdCooperativeSupplier.id);
    assert.equal(cooperativeAfterSale.wallets.find((wallet) => wallet.studentId === tahfidzStudentId)?.balance, 6000);
    assert.equal(cooperativeAfterSale.wallets.find((wallet) => wallet.studentId === tahfidzStudentId)?.limit, 20000);
    const savedCooperativeSale = cooperativeAfterSale.sales.find((sale) => sale.id === createdCooperativeSale.id);
    assert.ok(savedCooperativeSale, 'A persisted sale appears in the same tenant snapshot.');
    assert.equal(savedCooperativeSale.studentId, tahfidzStudentId, 'The sale retains its same-tenant student relationship.');
    assert.equal(savedCooperativeSale.items.length, 1, 'The snapshot includes the relational sale line.');
    assert.equal(savedCooperativeSale.items[0].productId, createdCooperativeProduct.id);
    assert.equal(savedCooperativeSale.items[0].quantity, 2);
    assert.ok(cooperativeAfterSale.walletLedger.some((entry) => entry.type === 'top_up' && entry.amount === 10000));
    assert.ok(cooperativeAfterSale.walletLedger.some((entry) => entry.type === 'purchase' && entry.amount === -4000));

    const cooperativeFinanceEntries = await admin.from('finance_ledger')
      .select('tenant_id,entry_type,source_type,amount,actor_user_id')
      .eq('tenant_id', tenantIds[0])
      .in('source_type', ['cooperative_wallet', 'cooperative_sale']);
    assert.equal(cooperativeFinanceEntries.error, null, 'Cooperative custodial activity must be linked to the tenant Finance ledger.');
    assert.equal(cooperativeFinanceEntries.data.filter((entry) => entry.source_type === 'cooperative_wallet').length, 1);
    assert.equal(cooperativeFinanceEntries.data.filter((entry) => entry.source_type === 'cooperative_sale').length, 1);
    assert.ok(cooperativeFinanceEntries.data.every((entry) => entry.tenant_id === tenantIds[0]));
    const walletPolicyEvents = await admin.from('cooperative_wallet_policy_events')
      .select('tenant_id,wallet_id,next_daily_limit,next_status,client_request_id')
      .eq('tenant_id', tenantIds[0])
      .eq('wallet_id', studentWallet.id);
    assert.equal(walletPolicyEvents.error, null);
    assert.equal(walletPolicyEvents.data.length, 1, 'The saved wallet policy has one immutable audit event.');
    assert.equal(walletPolicyEvents.data[0].next_daily_limit, 20000);

    const crmContactInput = {
      clientRequestId: randomUUID(),
      contactType: 'prospect',
      name: 'Kontak CRM Uji',
      organizationName: 'Pesantren Contoh',
      email: `crm-${fixtureSuffix}@example.test`,
      phone: '081234567890',
      lifecycleStage: 'lead',
      marketingConsent: 'unknown',
      consentSource: '',
    };
    const crmContactCreate = await fetch(`${apiBase}/api/crm/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: crmContactInput }),
    });
    assert.equal(crmContactCreate.status, 201, 'An Admin with CRM access can create a tenant contact through the application API.');
    const createdCrmContact = await crmContactCreate.json();
    assert.ok(createdCrmContact.contactId, 'The CRM create response returns the persisted contact ID.');

    const crmContactRetry = await fetch(`${apiBase}/api/crm/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: crmContactInput }),
    });
    assert.equal(crmContactRetry.status, 200, 'Retrying a CRM create with the same request ID is idempotent.');
    const retriedCrmContact = await crmContactRetry.json();
    assert.equal(retriedCrmContact.contactId, createdCrmContact.contactId);
    assert.equal(retriedCrmContact.alreadyApplied, true);

    const crmContactList = await fetch(`${apiBase}/api/crm/contacts?search=${encodeURIComponent('Kontak CRM Uji')}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(crmContactList.status, 200, 'The same tenant can read CRM contacts after saving.');
    const crmContactListPayload = await crmContactList.json();
    assert.equal(crmContactListPayload.contacts.length, 1);
    assert.equal(crmContactListPayload.contacts[0].id, createdCrmContact.contactId);

    const crmContactListTenantB = await fetch(`${apiBase}/api/crm/contacts?search=${encodeURIComponent('Kontak CRM Uji')}`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(crmContactListTenantB.status, 200);
    assert.deepEqual((await crmContactListTenantB.json()).contacts, [], 'A different tenant cannot see the saved CRM contact.');

    const crmUpdateInput = {
      ...crmContactInput,
      clientRequestId: randomUUID(),
      name: 'Kontak CRM Uji Diperbarui',
      lifecycleStage: 'qualified',
      marketingConsent: 'granted',
      consentSource: 'Formulir tertulis',
    };
    const crmContactUpdate = await fetch(`${apiBase}/api/crm/contacts/${encodeURIComponent(createdCrmContact.contactId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: crmUpdateInput }),
    });
    assert.equal(crmContactUpdate.status, 201, 'The same tenant can update a CRM contact and record consent evidence.');

    const crmCrossTenantUpdate = await fetch(`${apiBase}/api/crm/contacts/${encodeURIComponent(createdCrmContact.contactId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: { ...crmUpdateInput, clientRequestId: randomUUID(), name: 'Lintas Tenant' } }),
    });
    assert.equal(crmCrossTenantUpdate.status, 404, 'A different tenant cannot update the CRM contact by guessing its ID.');

    const { data: persistedCrmContact, error: crmContactReadError } = await admin.from('crm_contacts')
      .select('tenant_id,name,lifecycle_stage,marketing_consent,consent_source')
      .eq('id', createdCrmContact.contactId)
      .maybeSingle();
    assert.equal(crmContactReadError, null, 'The synthetic database can verify the CRM row persisted behind the API.');
    assert.equal(persistedCrmContact?.tenant_id, tenantIds[0]);
    assert.equal(persistedCrmContact?.name, 'Kontak CRM Uji Diperbarui');
    assert.equal(persistedCrmContact?.lifecycle_stage, 'qualified');
    assert.equal(persistedCrmContact?.marketing_consent, 'granted');
    assert.equal(persistedCrmContact?.consent_source, 'Formulir tertulis');

    const crmInteractionInput = {
      clientRequestId: randomUUID(),
      contactId: createdCrmContact.contactId,
      interactionType: 'meeting',
      direction: 'outbound',
      subject: 'Pertemuan tindak lanjut',
      summary: 'Membahas penerimaan santri baru.',
    };
    const crmInteractionCreate = await fetch(`${apiBase}/api/crm/interactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ interaction: crmInteractionInput }),
    });
    assert.equal(crmInteractionCreate.status, 201, 'An Admin can append a CRM interaction linked to their tenant contact.');
    const createdCrmInteraction = await crmInteractionCreate.json();

    const crmInteractions = await fetch(`${apiBase}/api/crm/contacts/${encodeURIComponent(createdCrmContact.contactId)}/interactions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(crmInteractions.status, 200, 'The saved CRM interaction can be read through its parent contact.');
    const crmInteractionsPayload = await crmInteractions.json();
    assert.equal(crmInteractionsPayload.interactions.length, 1);
    assert.equal(crmInteractionsPayload.interactions[0].id, createdCrmInteraction.interactionId);
    assert.equal(crmInteractionsPayload.interactions[0].contactId, createdCrmContact.contactId);

    const crmCrossTenantInteractions = await fetch(`${apiBase}/api/crm/contacts/${encodeURIComponent(createdCrmContact.contactId)}/interactions`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(crmCrossTenantInteractions.status, 404, 'A different tenant cannot read the contact interaction history.');

    const crmDeniedRole = await fetch(`${apiBase}/api/crm/contacts`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(crmDeniedRole.status, 403, 'A Ustadz without CRM permission cannot read the CRM directory.');



    const anonymousRoomHistory = await fetch(apiBase + "/api/master-data/students/" + randomUUID() + "/room-history");
    assert.equal(anonymousRoomHistory.status, 401, "Room history must reject anonymous callers.");
    const gatedRoomHistory = await fetch(apiBase + "/api/master-data/students/" + randomUUID() + "/room-history", {
      headers: { Authorization: "Bearer " + adminToken },
    });
    assert.equal(gatedRoomHistory.status, 503, "Room history must remain closed while the Master Data runtime is disabled.");

    for (const path of [
      "/api/enterprise/master-data/unit-assignment/unmapped",
      "/api/enterprise/master-data/unit-assignment",
      "/api/enterprise/finance/unit-assignment/unmapped",
      "/api/enterprise/finance/unit-assignment",
      "/api/academic/classes/unit-assignment/unmapped",
      "/api/academic/classes/unit-assignment",
    ]) {
      const method = path.endsWith("/unmapped") ? "GET" : "POST";
      const anonymous = await fetch(apiBase + path, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : {},
        body: method === "POST" ? JSON.stringify({}) : undefined,
      });
      assert.equal(anonymous.status, 401, path + " must reject anonymous callers.");
      const gated = await fetch(apiBase + path, {
        method,
        headers: { Authorization: "Bearer " + adminToken, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        body: method === "POST" ? JSON.stringify({}) : undefined,
      });
      assert.equal(gated.status, 503, path + " must remain closed until the operator enables the required runtimes.");
    }

    for (const path of ["/api/master-data/structures/migrate", "/api/master-data/students/migrate"]) {
      const anonymousImport = await fetch(apiBase + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      assert.equal(anonymousImport.status, 401, path + " must reject anonymous callers.");
      const retiredImport = await fetch(apiBase + path, {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      assert.equal(retiredImport.status, 410, path + " must remain retired after legacy archive import removal.");
      assert.equal((await retiredImport.json()).code, "LEGACY_ARCHIVE_IMPORT_REMOVED", path + " must return a stable retirement code.");
    }
    const missingWaliLinkEmail = "wali-missing-link-" + randomUUID() + "@example.test";
    const missingWaliLink = await fetch(apiBase + "/api/users", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: missingWaliLinkEmail,
        name: "Wali tanpa tautan",
        role: "Walisantri",
        tempPassword: "Wali-Test-" + randomUUID() + "-Aa1!",
        modulePermissions: {},
      }),
    });
    assert.equal(missingWaliLink.status, 400, "A Wali account without a tenant-scoped student link must be rejected.");
    assert.equal((await missingWaliLink.json()).code, "WALI_INVITATION_REQUIRED");

    const unrecognizedWaliEmail = "wali-unknown-nis-" + randomUUID() + "@example.test";
    const unrecognizedWaliNis = await fetch(apiBase + "/api/users", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: unrecognizedWaliEmail,
        name: "Wali dengan NIS tidak terdaftar",
        role: "Walisantri",
        tempPassword: "Wali-Test-" + randomUUID() + "-Aa1!",
        linkedSantriNis: "9999999999",
        modulePermissions: {},
      }),
    });
    assert.equal(unrecognizedWaliNis.status, 400, "A Wali account with an unknown NIS must be rejected.");
    assert.equal((await unrecognizedWaliNis.json()).code, "WALI_INVITATION_REQUIRED");
    const oversizedPasswordEmail = "oversized-password-" + randomUUID() + "@example.test";
    const controlCharacterPasswordEmail = "control-password-" + randomUUID() + "@example.test";
    const rejectInvalidProvisioningPassword = async (email, tempPassword) => fetch(apiBase + "/api/users", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: "Ustadz Validasi",
        role: "Ustadz",
        tempPassword,
        modulePermissions: {},
      }),
    });
    const oversizedPasswordResponse = await rejectInvalidProvisioningPassword(
      oversizedPasswordEmail,
      "P".repeat(129),
    );
    assert.equal(oversizedPasswordResponse.status, 400, "Provisioning must reject passwords longer than 128 characters.");
    const controlCharacterPasswordResponse = await rejectInvalidProvisioningPassword(
      controlCharacterPasswordEmail,
      "Valid-Password-1\n",
    );
    assert.equal(controlCharacterPasswordResponse.status, 400, "Provisioning must reject control characters in passwords.");

    const authDirectory = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.equal(authDirectory.error, null, "The synthetic Auth directory must remain readable for the assertion.");
    assert.ok(!authDirectory.data.users.some((user) => [
      missingWaliLinkEmail,
      unrecognizedWaliEmail,
      oversizedPasswordEmail,
      controlCharacterPasswordEmail,
    ].includes(user.email)), "Rejected registrations and invalid provisioning passwords must not leave Auth accounts behind.");
    const unauthenticated = await fetch(`${apiBase}/api/users`);
    assert.equal(unauthenticated.status, 401, 'Requests without a session must be rejected.');

    const invalidSession = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: 'Bearer definitely-not-a-supabase-session' },
    });
    assert.equal(invalidSession.status, 401, 'Invalid Supabase sessions must be rejected.');

    const disabledPpdbBill = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/bills`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill: { paymentType: 'registration', amount: 350000, clientRequestId: randomUUID() } }),
    });
    assert.equal(disabledPpdbBill.status, 503, 'PPDB billing must stay unavailable until its runtime and schema are enabled.');

    const noPpdbBill = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/bills`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPpdbAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill: { paymentType: 'registration', amount: 350000, clientRequestId: randomUUID() } }),
    });
    assert.equal(noPpdbBill.status, 403, 'PPDB invoice creation must require PPDB module access.');

    const noFinanceBill = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/bills`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noFinanceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill: { paymentType: 'registration', amount: 350000, clientRequestId: randomUUID() } }),
    });
    assert.equal(noFinanceBill.status, 403, 'PPDB invoice creation must require Finance module access.');

    const disabledPpdbDocument = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/documents/kk`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(disabledPpdbDocument.status, 503, 'Private PPDB documents must stay closed until their server runtime is enabled.');

    const noPpdbDocument = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/documents/kk`, {
      headers: { Authorization: `Bearer ${noPpdbAdminToken}` },
    });
    assert.equal(noPpdbDocument.status, 403, 'Private PPDB documents must require the PPDB module permission.');

    const ppdbUploadPayload = JSON.stringify({
      clientRequestId: randomUUID(),
      file: { mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64') },
    });
    const disabledPpdbDocumentUpload = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/documents/kk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: ppdbUploadPayload,
    });
    assert.equal(disabledPpdbDocumentUpload.status, 503, 'PPDB document uploads must stay unavailable until the storage runtime is enabled.');

    const noPpdbDocumentUpload = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/documents/kk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPpdbAdminToken}`, 'Content-Type': 'application/json' },
      body: ppdbUploadPayload,
    });
    assert.equal(noPpdbDocumentUpload.status, 403, 'PPDB document uploads must require the PPDB module permission.');

    const waliPpdbDocumentUpload = await fetch(`${apiBase}/api/ppdb/candidates/${randomUUID()}/documents/kk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waliToken}`, 'Content-Type': 'application/json' },
      body: ppdbUploadPayload,
    });
    assert.equal(waliPpdbDocumentUpload.status, 403, 'Wali accounts cannot upload Admin PPDB candidate documents.');

    const noPpdbCandidate = await fetch(`${apiBase}/api/ppdb/candidates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPpdbAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: randomUUID(), candidates: [{}] }),
    });
    assert.equal(noPpdbCandidate.status, 403, 'Candidate creation must require the PPDB module permission.');

    const waliPpdbCandidate = await fetch(`${apiBase}/api/ppdb/candidates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: randomUUID(), candidates: [{}] }),
    });
    assert.equal(waliPpdbCandidate.status, 403, 'Wali accounts cannot create PPDB candidates even with PPDB module flags.');

    const noPpdbCandidateSearch = await fetch(`${apiBase}/api/ppdb/candidates/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPpdbAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 250, search: '', stage: null }),
    });
    assert.equal(noPpdbCandidateSearch.status, 403, 'Candidate search must require the PPDB module permission.');

    const waliPpdbCandidateSearch = await fetch(`${apiBase}/api/ppdb/candidates/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 250, search: '', stage: null }),
    });
    assert.equal(waliPpdbCandidateSearch.status, 403, 'Wali accounts cannot search the Admin PPDB candidate directory.');

    const shortPpdbCandidateSearch = await fetch(`${apiBase}/api/ppdb/candidates/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 250, search: 'ab', stage: null }),
    });
    assert.equal(shortPpdbCandidateSearch.status, 400, 'Candidate directory search must enforce a three-character minimum.');

    const noPpdbPreview = await fetch(`${apiBase}/api/ppdb/candidates/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPpdbAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: [{}] }),
    });
    assert.equal(noPpdbPreview.status, 403, 'CSV preview must require the PPDB module permission.');

    const waliPpdbPreview = await fetch(`${apiBase}/api/ppdb/candidates/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: [{}] }),
    });
    assert.equal(waliPpdbPreview.status, 403, 'Wali accounts cannot preview PPDB imports.');

    const validCsvCandidate = {
      registrationId: `CSV-${fixtureSuffix}-001`,
      name: 'Calon Uji Pratinjau',
      gender: 'L',
      grade: 'VII',
      previousSchool: 'Sekolah Uji',
      phone: '081234567890',
      whatsappPhone: '081234567890',
      email: '',
      nik: '1234567890123456',
      nisn: '1234567890',
      pob: 'Jakarta',
      dob: '2012-01-02',
      address: 'Alamat sintetis untuk pengujian',
      fatherName: 'Ayah Uji',
      motherName: 'Ibu Uji',
      fatherJob: '',
      motherJob: '',
      fatherEducation: '',
      motherEducation: '',
      familyIncome: '',
    };
    const candidatesBeforePreview = await admin.from('candidates').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]);
    assert.equal(candidatesBeforePreview.error, null, 'Candidate row count must be readable before dry-run preview.');
    const claimsBeforePreview = await admin.from('identity_claims').select('tenant_id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]);
    assert.equal(claimsBeforePreview.error, null, 'Identity-claim row count must be readable before dry-run preview.');
    const csvPreviewResponse = await fetch(`${apiBase}/api/ppdb/candidates/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: [validCsvCandidate, { ...validCsvCandidate, registrationId: `csv-${fixtureSuffix}-001` }] }),
    });
    assert.equal(csvPreviewResponse.status, 200, 'Admin CSV preview must validate records against tenant data.');
    const csvPreviewText = await csvPreviewResponse.text();
    assert.ok(!csvPreviewText.includes(validCsvCandidate.nik) && !csvPreviewText.includes(validCsvCandidate.nisn), 'CSV preview must never return applicant NIK/NISN.');
    const csvPreview = JSON.parse(csvPreviewText);
    assert.deepEqual(csvPreview.rows.map((row) => row.status), ['conflict', 'conflict'], 'Repeated IDs in one CSV batch must be flagged before import.');
    assert.ok(csvPreview.rows.every((row) => row.issues.some((issue) => issue.includes('baris'))), 'CSV preview must identify the other repeated row.');
    const candidatesAfterPreview = await admin.from('candidates').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]);
    assert.equal(candidatesAfterPreview.error, null, 'Candidate row count must remain readable after dry-run preview.');
    assert.equal(candidatesAfterPreview.count, candidatesBeforePreview.count, 'CSV preview must not create candidate rows.');
    const claimsAfterPreview = await admin.from('identity_claims').select('tenant_id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]);
    assert.equal(claimsAfterPreview.error, null, 'Identity-claim row count must remain readable after dry-run preview.');
    assert.equal(claimsAfterPreview.count, claimsBeforePreview.count, 'CSV preview must not create identity claims.');

    const invalidCsvPreview = await fetch(`${apiBase}/api/ppdb/candidates/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: [{ ...validCsvCandidate, nik: '123' }] }),
    });
    assert.equal(invalidCsvPreview.status, 200, 'CSV preview should report row-level validation errors instead of aborting the batch.');
    assert.equal((await invalidCsvPreview.json()).rows[0].status, 'conflict');

    const updateWaliPermissions = async (modulePermissions) => {
      const { data, error } = await admin.from('profiles')
        .update({ module_permissions: modulePermissions })
        .eq('tenant_id', tenantIds[0])
        .eq('user_id', users[6].uid)
        .select('user_id');
      assert.equal(error, null, 'The synthetic Wali permissions must be updateable by the local service role.');
      assert.equal(data?.length, 1, 'Exactly one synthetic Wali profile must be updated.');
    };

    await updateWaliPermissions({ finance: false, boarding: false });
    const deniedWaliFinance = await fetch(`${apiBase}/api/finance/snapshot`, {
      headers: { Authorization: `Bearer ${waliToken}` },
    });
    assert.equal(deniedWaliFinance.status, 403, 'Wali access must be denied when the Finance module permission is off.');
    const deniedWaliBoarding = await fetch(`${apiBase}/api/boarding/permits`, {
      headers: { Authorization: `Bearer ${waliToken}` },
    });
    assert.equal(deniedWaliBoarding.status, 403, 'Wali access must be denied when the Boarding module permission is off.');

    await updateWaliPermissions({ finance: true, boarding: true });
    const unlinkedWaliFinance = await fetch(`${apiBase}/api/finance/snapshot`, {
      headers: { Authorization: `Bearer ${waliToken}` },
    });
    assert.equal(unlinkedWaliFinance.status, 403, 'Wali access must be denied without a canonical guardian-to-student link.');
    const unlinkedWaliBoarding = await fetch(`${apiBase}/api/boarding/permits`, {
      headers: { Authorization: `Bearer ${waliToken}` },
    });
    assert.equal(unlinkedWaliBoarding.status, 403, 'Boarding access must be denied without a canonical guardian-to-student link.');

    const boardingHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    const boardingAttendanceDate = new Date().toISOString().slice(0, 10);
    const addUtcDays = (day, count) => new Date(Date.parse(`${day}T00:00:00.000Z`) + count * 86400000).toISOString().slice(0, 10);
    const permitStartDate = addUtcDays(boardingAttendanceDate, 1);
    const permitEndDate = addUtcDays(boardingAttendanceDate, 2);
    const permitRequestId = randomUUID();
    const permitRequest = {
      studentId: tahfidzStudentId,
      clientRequestId: permitRequestId,
      type: 'Pulang',
      reason: `Uji integrasi izin ${fixtureSuffix}`,
      startDate: permitStartDate,
      endDate: permitEndDate,
    };
    const permitCreateResponse = await fetch(`${apiBase}/api/boarding/permits`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(permitRequest),
    });
    assert.equal(permitCreateResponse.status, 201, 'A permitted Admin must create a boarding permit through the API.');
    const createdPermit = await permitCreateResponse.json();
    assert.ok(createdPermit.permitId, 'The permit API must return the persisted permit identity.');
    const permitRetryResponse = await fetch(`${apiBase}/api/boarding/permits`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(permitRequest),
    });
    assert.equal(permitRetryResponse.status, 200, 'Retrying an identical permit request must be idempotent.');
    const retriedPermit = await permitRetryResponse.json();
    assert.equal(retriedPermit.permitId, createdPermit.permitId);
    assert.equal(retriedPermit.alreadyApplied, true);
    const conflictingPermitRetry = await fetch(`${apiBase}/api/boarding/permits`, {
      method: 'POST', headers: boardingHeaders,
      body: JSON.stringify({ ...permitRequest, reason: `${permitRequest.reason} diubah` }),
    });
    assert.equal(conflictingPermitRetry.status, 409, 'A permit idempotency key reused with changed data must be rejected.');

    const permitTransitionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const permitStatuses = ['Pending Keamanan', 'Approved', 'Active', 'Returned'];
    for (let index = 0; index < permitStatuses.length; index += 1) {
      const transition = { clientRequestId: permitTransitionIds[index], status: permitStatuses[index] };
      const response = await fetch(`${apiBase}/api/boarding/permits/${createdPermit.permitId}/status`, {
        method: 'POST', headers: boardingHeaders, body: JSON.stringify(transition),
      });
      assert.equal(response.status, 200, `The permit workflow must allow transition to ${permitStatuses[index]}.`);
      const result = await response.json();
      assert.equal(result.status, permitStatuses[index]);
      if (index === 0) {
        const retry = await fetch(`${apiBase}/api/boarding/permits/${createdPermit.permitId}/status`, {
          method: 'POST', headers: boardingHeaders, body: JSON.stringify(transition),
        });
        assert.equal(retry.status, 200, 'Retrying an identical permit transition must succeed without a duplicate event.');
        assert.equal((await retry.json()).alreadyApplied, true);
      }
    }
    const permitReadResponse = await fetch(`${apiBase}/api/boarding/permits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(permitReadResponse.status, 200, 'An Admin must read tenant boarding permits through the API.');
    const permitRead = await permitReadResponse.json();
    const permitReadback = permitRead.permits.find((item) => item.id === createdPermit.permitId);
    assert.ok(permitReadback, 'The permit created through the API must appear in the subsequent read.');
    assert.equal(permitReadback.studentId, tahfidzStudentId, 'The permit read model must preserve its same-tenant student relation.');
    assert.equal(permitReadback.type, permitRequest.type);
    assert.equal(permitReadback.roomId, boardingRoomId, 'The permit must retain its tenant-owned room relationship.');
    assert.equal(permitReadback.room, `Kamar Asrama API ${fixtureSuffix}`);
    assert.equal(permitReadback.status, 'Returned');
    const storedPermit = await admin.from('boarding_permits')
      .select('tenant_id,student_id,room_id,room_name_snapshot,requested_by_user_id,status,permit_type,start_date,end_date')
      .eq('tenant_id', tenantIds[0]).eq('id', createdPermit.permitId).single();
    assert.equal(storedPermit.error, null, 'The permit must be persisted in the local Supabase backend.');
    assert.equal(storedPermit.data.student_id, tahfidzStudentId);
    assert.equal(storedPermit.data.room_id, boardingRoomId);
    assert.equal(storedPermit.data.room_name_snapshot, `Kamar Asrama API ${fixtureSuffix}`);
    assert.equal(storedPermit.data.requested_by_user_id, users[0].uid);
    assert.equal(storedPermit.data.status, 'Returned');
    assert.equal(storedPermit.data.start_date, permitStartDate);
    const storedPermitEvents = await admin.from('boarding_permit_events')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]).eq('permit_id', createdPermit.permitId);
    assert.equal(storedPermitEvents.error, null);
    assert.equal(storedPermitEvents.count, 5, 'The permit request and four unique transitions must create five audit events.');

    const disciplineRequest = {
      studentId: tahfidzStudentId,
      clientRequestId: randomUUID(),
      offense: `Pelanggaran uji ${fixtureSuffix}`,
      category: 'Ringan',
      points: 3,
      incidentDate: boardingAttendanceDate,
    };
    const disciplineCreateResponse = await fetch(`${apiBase}/api/boarding/discipline`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(disciplineRequest),
    });
    assert.equal(disciplineCreateResponse.status, 201, 'A permitted Admin must create a discipline record through the API.');
    const createdIncident = await disciplineCreateResponse.json();
    assert.ok(createdIncident.incidentId);
    const disciplineRetry = await fetch(`${apiBase}/api/boarding/discipline`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(disciplineRequest),
    });
    assert.equal(disciplineRetry.status, 200, 'Retrying an identical discipline request must be idempotent.');
    assert.equal((await disciplineRetry.json()).incidentId, createdIncident.incidentId);
    const conflictingDisciplineRetry = await fetch(`${apiBase}/api/boarding/discipline`, {
      method: 'POST', headers: boardingHeaders,
      body: JSON.stringify({ ...disciplineRequest, points: disciplineRequest.points + 1 }),
    });
    assert.equal(conflictingDisciplineRetry.status, 409, 'A discipline idempotency key reused with changed data must be rejected.');
    const disciplineReadResponse = await fetch(`${apiBase}/api/boarding/discipline`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(disciplineReadResponse.status, 200, 'An Admin must read tenant discipline records through the API.');
    const disciplineRead = await disciplineReadResponse.json();
    const disciplineReadback = disciplineRead.incidents.find((item) => item.id === createdIncident.incidentId);
    assert.ok(disciplineReadback, 'The discipline record created through the API must appear in the subsequent read.');
    assert.equal(disciplineReadback.studentId, tahfidzStudentId, 'The discipline read model must preserve its same-tenant student relation.');
    assert.equal(disciplineReadback.santriName, 'Santri Uji Tahfidz API');
    assert.equal(disciplineReadback.roomId, boardingRoomId);
    assert.equal(disciplineReadback.room, `Kamar Asrama API ${fixtureSuffix}`);
    assert.equal(disciplineReadback.offense, disciplineRequest.offense);
    const storedIncident = await admin.from('boarding_discipline_incidents')
      .select('tenant_id,student_id,room_id,room_name_snapshot,created_by_user_id,offense,category,points,resolved')
      .eq('tenant_id', tenantIds[0]).eq('id', createdIncident.incidentId).single();
    assert.equal(storedIncident.error, null, 'The discipline record must be persisted in the local Supabase backend.');
    assert.equal(storedIncident.data.student_id, tahfidzStudentId);
    assert.equal(storedIncident.data.room_id, boardingRoomId);
    assert.equal(storedIncident.data.room_name_snapshot, `Kamar Asrama API ${fixtureSuffix}`);
    assert.equal(storedIncident.data.created_by_user_id, users[0].uid);
    assert.equal(storedIncident.data.points, disciplineRequest.points);
    assert.equal(storedIncident.data.resolved, false);
    const resolveIncidentRequest = { clientRequestId: randomUUID() };
    const resolveIncidentResponse = await fetch(`${apiBase}/api/boarding/discipline/${createdIncident.incidentId}/resolve`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(resolveIncidentRequest),
    });
    assert.equal(resolveIncidentResponse.status, 200, 'An Admin must be able to resolve a tenant discipline record.');
    assert.equal((await resolveIncidentResponse.json()).resolved, true);
    const resolveIncidentRetry = await fetch(`${apiBase}/api/boarding/discipline/${createdIncident.incidentId}/resolve`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(resolveIncidentRequest),
    });
    assert.equal(resolveIncidentRetry.status, 200, 'Retrying discipline resolution must be idempotent.');
    assert.equal((await resolveIncidentRetry.json()).alreadyApplied, true);
    const resolvedIncident = await admin.from('boarding_discipline_incidents')
      .select('resolved').eq('tenant_id', tenantIds[0]).eq('id', createdIncident.incidentId).single();
    assert.equal(resolvedIncident.data?.resolved, true, 'Discipline resolution must persist to Supabase.');
    const disciplineEvents = await admin.from('boarding_discipline_events')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]).eq('incident_id', createdIncident.incidentId);
    assert.equal(disciplineEvents.error, null);
    assert.equal(disciplineEvents.count, 2, 'The create and resolve actions must each create one audit event.');

    const attendanceMarkRequest = {
      studentId: tahfidzStudentId,
      attendanceDate: boardingAttendanceDate,
      status: 'Hadir',
      clientRequestId: randomUUID(),
    };
    const attendanceMarkResponse = await fetch(`${apiBase}/api/boarding/attendance`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(attendanceMarkRequest),
    });
    assert.equal(attendanceMarkResponse.status, 200, 'A permitted Admin must mark boarding attendance through the API.');
    const createdAttendance = await attendanceMarkResponse.json();
    assert.equal(createdAttendance.status, 'Hadir');
    assert.ok(createdAttendance.recordId);
    const attendanceRetry = await fetch(`${apiBase}/api/boarding/attendance`, {
      method: 'POST', headers: boardingHeaders, body: JSON.stringify(attendanceMarkRequest),
    });
    assert.equal(attendanceRetry.status, 200, 'Retrying the same attendance mutation must be idempotent.');
    assert.equal((await attendanceRetry.json()).alreadyApplied, true);
    const conflictingAttendanceRetry = await fetch(`${apiBase}/api/boarding/attendance`, {
      method: 'POST', headers: boardingHeaders,
      body: JSON.stringify({ ...attendanceMarkRequest, status: 'Ghaib' }),
    });
    assert.equal(conflictingAttendanceRetry.status, 409, 'An attendance idempotency key reused with changed status must be rejected.');
    const attendanceUpdateResponse = await fetch(`${apiBase}/api/boarding/attendance`, {
      method: 'POST', headers: boardingHeaders,
      body: JSON.stringify({ ...attendanceMarkRequest, status: 'Ghaib', clientRequestId: randomUUID() }),
    });
    assert.equal(attendanceUpdateResponse.status, 200, 'Attendance status can be changed through the API with a new request ID.');
    assert.equal((await attendanceUpdateResponse.json()).status, 'Ghaib');
    const attendanceReadResponse = await fetch(`${apiBase}/api/boarding/attendance?date=${boardingAttendanceDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(attendanceReadResponse.status, 200, 'An Admin must read attendance for a date through the API.');
    const attendanceRead = await attendanceReadResponse.json();
    const attendanceReadback = attendanceRead.records.find((item) => item.studentId === tahfidzStudentId);
    assert.ok(attendanceReadback, 'The attendance record created through the API must appear in the subsequent read.');
    assert.equal(attendanceReadback.status, 'Ghaib');
    assert.equal(attendanceReadback.roomId, boardingRoomId);
    assert.equal(attendanceReadback.room, `Kamar Asrama API ${fixtureSuffix}`);
    const attendanceSession = await admin.from('boarding_attendance_sessions')
      .select('id,tenant_id,attendance_date,session_type').eq('tenant_id', tenantIds[0])
      .eq('attendance_date', boardingAttendanceDate).eq('session_type', 'nightly_curfew').single();
    assert.equal(attendanceSession.error, null, 'The date-keyed attendance session must persist in Supabase.');
    const attendanceRecord = await admin.from('boarding_attendance_records')
      .select('id,tenant_id,session_id,student_id,room_id,room_name_snapshot,marked_by_user_id,status')
      .eq('tenant_id', tenantIds[0]).eq('session_id', attendanceSession.data.id).eq('student_id', tahfidzStudentId).single();
    assert.equal(attendanceRecord.error, null, 'Attendance must persist with its tenant, session, student, and actor relations.');
    assert.equal(attendanceRecord.data.id, createdAttendance.recordId);
    assert.equal(attendanceRecord.data.room_id, boardingRoomId);
    assert.equal(attendanceRecord.data.room_name_snapshot, `Kamar Asrama API ${fixtureSuffix}`);
    assert.equal(attendanceRecord.data.marked_by_user_id, users[0].uid);
    assert.equal(attendanceRecord.data.status, 'Ghaib');
    const attendanceEvents = await admin.from('boarding_attendance_events')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantIds[0]).eq('record_id', createdAttendance.recordId);
    assert.equal(attendanceEvents.error, null);
    assert.equal(attendanceEvents.count, 2, 'Initial marking and status change must create exactly two audit events.');

    const otherTenantBoardingHeaders = { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` };
    const otherTenantPermitsResponse = await fetch(`${apiBase}/api/boarding/permits`, { headers: otherTenantBoardingHeaders });
    assert.equal(otherTenantPermitsResponse.status, 200);
    assert.ok(!(await otherTenantPermitsResponse.json()).permits.some((item) => item.id === createdPermit.permitId),
      'A different tenant must not read the permit.');
    const otherTenantDisciplineResponse = await fetch(`${apiBase}/api/boarding/discipline`, { headers: otherTenantBoardingHeaders });
    assert.equal(otherTenantDisciplineResponse.status, 200);
    assert.ok(!(await otherTenantDisciplineResponse.json()).incidents.some((item) => item.id === createdIncident.incidentId),
      'A different tenant must not read the discipline record.');
    const otherTenantAttendanceResponse = await fetch(`${apiBase}/api/boarding/attendance?date=${boardingAttendanceDate}`, {
      headers: otherTenantBoardingHeaders,
    });
    assert.equal(otherTenantAttendanceResponse.status, 200);
    assert.ok(!(await otherTenantAttendanceResponse.json()).records.some((item) => item.studentId === tahfidzStudentId),
      'A different tenant must not read the attendance record.');
    const foreignStudentPermit = await fetch(`${apiBase}/api/boarding/permits`, {
      method: 'POST', headers: { ...otherTenantBoardingHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...permitRequest, clientRequestId: randomUUID() }),
    });
    assert.equal(foreignStudentPermit.status, 404, 'A tenant must not create a permit for another tenant’s student.');
    const foreignStudentIncident = await fetch(`${apiBase}/api/boarding/discipline`, {
      method: 'POST', headers: { ...otherTenantBoardingHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...disciplineRequest, clientRequestId: randomUUID() }),
    });
    assert.equal(foreignStudentIncident.status, 404, 'A tenant must not record discipline for another tenant’s student.');
    const foreignStudentAttendance = await fetch(`${apiBase}/api/boarding/attendance`, {
      method: 'POST', headers: { ...otherTenantBoardingHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...attendanceMarkRequest, clientRequestId: randomUUID() }),
    });
    assert.equal(foreignStudentAttendance.status, 404, 'A tenant must not mark attendance for another tenant’s student.');
    for (const path of ['/api/boarding/discipline', `/api/boarding/attendance?date=${boardingAttendanceDate}`]) {
      const denied = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${facilityNoPermissionToken}` } });
      assert.equal(denied.status, 403, `Boarding module permission must protect ${path}.`);
    }

    for (const [role, token] of [['Ustadz', ustadzToken], ['Santri', santriToken], ['Walisantri', waliToken]]) {
      const nonAdmin = await fetch(`${apiBase}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(nonAdmin.status, 403, `${role} must not access user management.`);
      assert.equal((await nonAdmin.json()).code, 'FORBIDDEN_ROLE');
    }

    const limitedAdmin = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(limitedAdmin.status, 403, 'An admin explicitly denied the users module must be rejected.');
    assert.equal((await limitedAdmin.json()).code, 'MODULE_ACCESS_DENIED');

    const inactiveAdmin = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: `Bearer ${inactiveAdminToken}` },
    });
    assert.equal(inactiveAdmin.status, 403, 'Suspended users must not access user management.');
    assert.equal((await inactiveAdmin.json()).code, 'ACCOUNT_INACTIVE');

    const suspendedTenantAdmin = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: `Bearer ${suspendedTenantAdminToken}` },
    });
    assert.equal(suspendedTenantAdmin.status, 403, 'Users in a suspended tenant must not access user management.');
    assert.equal((await suspendedTenantAdmin.json()).code, 'ACCOUNT_INACTIVE');

    const restrictedAdminHeaders = {
      Authorization: `Bearer ${noFinanceAdminToken}`,
      'Content-Type': 'application/json',
    };
    const defaultRoleEscalation = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: restrictedAdminHeaders,
      body: JSON.stringify({
        email: `restricted-default-${randomUUID()}@example.test`,
        name: 'Akun uji terbatas',
        role: 'Santri',
        tempPassword: `Test-Password-${randomUUID()}-Aa1!`,
      }),
    });
    assert.equal(defaultRoleEscalation.status, 403, 'A restricted Admin must not create an account whose role defaults exceed the Admin module scope.');
    assert.equal((await defaultRoleEscalation.json()).code, 'FORBIDDEN_MODULE_PERMISSION');

    const explicitModuleEscalation = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: restrictedAdminHeaders,
      body: JSON.stringify({
        email: `restricted-explicit-${randomUUID()}@example.test`,
        name: 'Akun uji terbatas',
        role: 'Santri',
        tempPassword: `Test-Password-${randomUUID()}-Aa1!`,
        modulePermissions: { finance: true },
      }),
    });
    assert.equal(explicitModuleEscalation.status, 403, 'A restricted Admin must not grant an explicitly forbidden module.');

    const restrictedGuardianInvitation = await fetch(`${apiBase}/api/users/guardian-invitations`, {
      method: 'POST',
      headers: restrictedAdminHeaders,
      body: JSON.stringify({
        email: `restricted-wali-${randomUUID()}@example.test`,
        guardianId: randomUUID(),
        modulePermissions: {},
      }),
    });
    assert.equal(restrictedGuardianInvitation.status, 403, 'A restricted Admin must not grant a Wali role default beyond the Admin module scope.');
    assert.equal((await restrictedGuardianInvitation.json()).code, 'FORBIDDEN_MODULE_PERMISSION');

    const selfModuleEscalation = await fetch(`${apiBase}/api/users/${users[10].uid}`, {
      method: 'PATCH',
      headers: restrictedAdminHeaders,
      body: JSON.stringify({ modulePermissions: { finance: true } }),
    });
    assert.equal(selfModuleEscalation.status, 403, 'A restricted Admin must not grant a module to their own account.');
    assert.equal((await selfModuleEscalation.json()).code, 'FORBIDDEN_MODULE_PERMISSION');
    const tenantResponse = await fetch(`${apiBase}/api/users?tenantId=${tenantIds[1]}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(tenantResponse.status, 200, 'An active tenant admin should read their own tenant users.');
    const tenantPayload = await tenantResponse.json();
    const expectedTenantProfileCount = users.filter((profile) => profile.tenantId === tenantIds[0]).length;
    assert.equal(tenantPayload.total, expectedTenantProfileCount, 'The tenant admin should only see profiles belonging to tenant A.');
    assert.ok(tenantPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'The response must remain scoped to the actor tenant even when a foreign tenantId is requested.');
    assert.ok(!tenantPayload.users.some((profile) => profile.email === users[2].email), 'A profile from another tenant must never appear in the response.');

    const pageOffsets = Array.from({ length: Math.ceil(expectedTenantProfileCount / 3) }, (_, index) => index * 3);
    const pageResponses = await Promise.all(pageOffsets.map((offset) => fetch(`${apiBase}/api/users?limit=3&offset=${offset}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })));
    for (const response of pageResponses) assert.equal(response.status, 200, 'Tenant user pages must be readable.');
    const pagePayloads = await Promise.all(pageResponses.map((response) => response.json()));
    assert.deepEqual(pagePayloads.map((payload) => payload.users.length), pageOffsets.map((_, index) => Math.min(3, expectedTenantProfileCount - index * 3)), 'Pagination must return bounded, non-overlapping page sizes across all tenant fixtures.');
    assert.ok(pagePayloads.every((payload) => payload.total === expectedTenantProfileCount), 'Every page must report the filtered tenant total.');
    const pagedIds = pagePayloads.flatMap((payload) => payload.users.map((profile) => profile.uid));
    assert.equal(new Set(pagedIds).size, expectedTenantProfileCount, 'Stable ordering must return every tenant profile exactly once across pages.');

    const searchResponse = await fetch(`${apiBase}/api/users?q=${encodeURIComponent(users[0].email)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(searchResponse.status, 200, 'Search by email containing reserved punctuation must be supported.');
    const searchPayload = await searchResponse.json();
    assert.equal(searchPayload.total, 1, 'Search must be applied before pagination and return exact counts.');
    assert.equal(searchPayload.users[0].uid, users[0].uid, 'Search must match within the acting tenant.');

    const shortSearchResponse = await fetch(`${apiBase}/api/users?q=ab`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(shortSearchResponse.status, 400, 'Search terms shorter than three characters must not trigger broad directory scans.');
    assert.equal((await shortSearchResponse.json()).code, 'QUERY_TOO_SHORT');

    const roleResponse = await fetch(`${apiBase}/api/users?role=Ustadz`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal((await roleResponse.json()).total, 1, 'Role filtering must happen in the database query.');

    const statusResponse = await fetch(`${apiBase}/api/users?status=disabled`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal((await statusResponse.json()).total, 1, 'Status filtering must map to suspended profiles.');

    const invalidPageResponse = await fetch(`${apiBase}/api/users?limit=101`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidPageResponse.status, 400, 'Page sizes above the server limit must be rejected.');

    const superAdminResponse = await fetch(`${apiBase}/api/users?tenantId=${tenantIds[1]}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(superAdminResponse.status, 200, 'An active SuperAdmin should pass the user-management role gate.');
    const superAdminPayload = await superAdminResponse.json();
    assert.equal(superAdminPayload.total, expectedTenantProfileCount, 'SuperAdmin remains scoped to the profile tenant when a foreign tenantId is requested.');
    assert.ok(superAdminPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'SuperAdmin results must remain tenant-scoped.');
    assert.ok(!superAdminPayload.users.some((profile) => profile.email === users[2].email), 'SuperAdmin must not receive a foreign-tenant profile through query spoofing.');

    const provisionedEmail = `provisioned-admin-${fixtureSuffix}@example.test`;
    const provisionedPassword = `Provisioned-${randomUUID()}-Aa1!`;
    const provisionedUsername = `provisioned-${fixtureSuffix}`;
    const provisionedResponse = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: provisionedEmail,
        name: 'Admin Uji Provisioning',
        username: provisionedUsername,
        role: 'Admin',
        tempPassword: provisionedPassword,
        modulePermissions: { users: true, academic: true, finance: true },
      }),
    });
    assert.equal(provisionedResponse.status, 201, 'A SuperAdmin can provision a tenant Admin account through the API.');
    const provisionedPayload = await provisionedResponse.json();
    assert.equal(provisionedPayload.success, true);
    assert.equal(provisionedPayload.user.email, provisionedEmail);
    assert.equal(provisionedPayload.user.name, 'Admin Uji Provisioning');
    assert.equal(provisionedPayload.user.username, provisionedUsername);
    assert.equal(provisionedPayload.user.role, 'Admin');
    assert.equal(provisionedPayload.user.tenantId, tenantIds[0], 'The server assigns the actor tenant rather than trusting request data.');
    assert.equal(provisionedPayload.user.mustChangePassword, true, 'Provisioned accounts must change the temporary password at first use.');
    assert.equal(provisionedPayload.user.modulePermissions.users, true);
    assert.equal(provisionedPayload.user.modulePermissions.academic, true);
    assert.equal(provisionedPayload.user.modulePermissions.settings, false, 'Tenant Admin provisioning cannot grant platform settings access.');

    const provisionedUser = {
      uid: provisionedPayload.user.uid,
      email: provisionedEmail,
      password: provisionedPassword,
      tenantId: tenantIds[0],
    };
    assert.ok(provisionedUser.uid, 'The successful provisioning response must return the new Auth identity.');
    users.push(provisionedUser);

    const provisionedToken = await signIn(anon, provisionedUser);
    const provisionedProfileResponse = await fetch(`${apiBase}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${provisionedToken}` },
    });
    assert.equal(provisionedProfileResponse.status, 200, 'The new Auth identity can establish a session and load its profile.');
    const provisionedProfilePayload = await provisionedProfileResponse.json();
    assert.equal(provisionedProfilePayload.profile.uid, provisionedUser.uid);
    assert.equal(provisionedProfilePayload.profile.tenantId, tenantIds[0]);
    assert.equal(provisionedProfilePayload.profile.role, 'Admin');
    assert.equal(provisionedProfilePayload.profile.mustChangePassword, true);

    const { data: persistedProvisionedProfile, error: provisionedProfileError } = await admin.from('profiles')
      .select('email,display_name,username,role,status,tenant_id,must_change_password,module_permissions,organization_unit_id,created_by_uid')
      .eq('user_id', provisionedUser.uid)
      .maybeSingle();
    assert.equal(provisionedProfileError, null, 'The provisioned profile must be readable from the local Supabase database.');
    assert.equal(persistedProvisionedProfile?.role, 'admin');
    assert.equal(persistedProvisionedProfile?.status, 'active');
    assert.equal(persistedProvisionedProfile?.tenant_id, tenantIds[0]);
    assert.equal(persistedProvisionedProfile?.must_change_password, true);
    assert.equal(persistedProvisionedProfile?.organization_unit_id, null);
    assert.equal(persistedProvisionedProfile?.created_by_uid, users[7].uid);
    assert.equal(persistedProvisionedProfile?.module_permissions?.users, true);
    assert.equal(persistedProvisionedProfile?.module_permissions?.academic, true);
    assert.equal(persistedProvisionedProfile?.module_permissions?.settings, false);

    // Simulate a database failure after Auth has accepted the account. The application must
    // remove that Auth user before reporting provisioning failure, avoiding an orphan login.
    const triggerSql = `
      CREATE OR REPLACE FUNCTION public.test_fail_provision_profile_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.email = '${profileFailureEmail}' THEN
          RAISE EXCEPTION 'synthetic profile insert failure' USING ERRCODE = '23505';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_fail_provision_profile_insert
      BEFORE INSERT ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_provision_profile_insert();
    `;
    profileFailureTriggerInstalled = true;
    execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', triggerSql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    });
    const failedProvisioning = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: profileFailureEmail,
        name: 'Uji Pemulihan Provisioning',
        role: 'Admin',
        tempPassword: `Temporary-${randomUUID()}-Aa1!`,
        username: `provision-failure-${fixtureSuffix}`,
      }),
    });
    assert.equal(failedProvisioning.status, 503, 'Profile write failure must be reported as a backend provisioning failure.');
    assert.equal((await failedProvisioning.json()).code, 'SUPABASE_IDENTITY_UNAVAILABLE');

    const { data: authUsersAfterFailure, error: authUsersReadError } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    assert.equal(authUsersReadError, null, 'Auth users must remain inspectable in the local fixture.');
    assert.ok(!authUsersAfterFailure.users.some((user) => user.email === profileFailureEmail),
      'Auth account must be compensated when the profile transaction fails.');
    const { data: profileAfterFailure, error: profileReadError } = await admin.from('profiles')
      .select('user_id').eq('email', profileFailureEmail).maybeSingle();
    assert.equal(profileReadError, null, 'Profile query for the failed synthetic account must succeed.');
    assert.equal(profileAfterFailure, null, 'A failed provisioning attempt must not leave a profile behind.');

    const referenceFinanceAdmin = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'reference-finance-only', {
      'master-data': false,
      finance: true,
    });
    users.push(referenceFinanceAdmin);
    const referenceFinanceToken = await signIn(anon, referenceFinanceAdmin);

    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(5000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }
    serverProcess = null;

    const referencePort = await availablePort();
    const referenceApiBase = `http://127.0.0.1:${referencePort}`;
    serverProcess = spawn('bun', ['run', 'dev'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(referencePort),
        NODE_ENV: 'production',
        SUPABASE_URL: url,
        SUPABASE_SECRET_KEY: serviceKey,
        SUPABASE_SERVICE_ROLE_KEY: '',
        PII_ENCRYPTION_KEY: piiEncryptionKey,
        PII_FINGERPRINT_KEY: piiFingerprintKey,
        SUPABASE_MASTER_DATA_RUNTIME_ENABLED: 'true',
        SUPABASE_MASTER_DATA_IMPORT_ENABLED: 'false',
        PUBLIC_APP_URL: 'http://localhost:3000',
        SUPABASE_COMMUNICATION_RUNTIME_ENABLED: 'true',
        SUPABASE_FINANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED: 'true',
        SUPABASE_TAHFIDZ_RUNTIME_ENABLED: 'true',
        SUPABASE_ACADEMIC_RUNTIME_ENABLED: 'true',
        SUPABASE_LAUNDRY_RUNTIME_ENABLED: 'true',
        SUPABASE_DONATION_RUNTIME_ENABLED: 'true',
        SUPABASE_DOCUMENT_RUNTIME_ENABLED: 'true',
        SUPABASE_HEALTHCARE_RUNTIME_ENABLED: 'true',
        SUPABASE_FACILITY_BOOKINGS_RUNTIME_ENABLED: 'true',
        SUPABASE_GA_ASSETS_RUNTIME_ENABLED: 'true',
        SUPABASE_LIBRARY_RUNTIME_ENABLED: 'true',
        SUPABASE_HRIS_RUNTIME_ENABLED: 'true',
        SUPABASE_CBT_RUNTIME_ENABLED: 'true',
        SUPABASE_LMS_RUNTIME_ENABLED: 'true',
        SUPABASE_ALUMNI_RUNTIME_ENABLED: 'true',
        SUPABASE_LMS_DIAGNOSTICS: 'true',
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const referenceDeadline = Date.now() + 45000;
    let referenceServerReady = false;
    while (Date.now() < referenceDeadline && serverProcess.exitCode === null) {
      try {
        const response = await fetch(`${referenceApiBase}/api/auth/profile`);
        if (response.status === 401) {
          referenceServerReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    assert.ok(referenceServerReady, 'The isolated server with Master Data enabled must start before catalog authorization tests.');

    const guardianAdminB = await createUserFixture(admin, tenantIds[1], 'admin', 'active', 'guardian-admin-b', {
      users: true,
      communication: true,
    });
    users.push(guardianAdminB);
    const guardianAdminBToken = await signIn(anon, guardianAdminB);
    const waliPassword = `Guardian-Invite-${randomUUID()}-Aa1!`;
    const waliEmail = `guardian-invite-${fixtureSuffix}@example.test`;
    const { data: waliAuthResult, error: waliAuthError } = await admin.auth.admin.createUser({
      email: waliEmail,
      password: waliPassword,
      email_confirm: true,
      user_metadata: { name: `Wali Uji ${fixtureSuffix}` },
    });
    if (waliAuthError || !waliAuthResult.user) throw new Error('Unable to create the synthetic confirmed Guardian Auth user.');
    const invitedWali = { uid: waliAuthResult.user.id, email: waliEmail, password: waliPassword, tenantId: tenantIds[0] };
    users.push(invitedWali);
    const invitedWaliToken = await signIn(anon, invitedWali);

    const guardianCandidatesResponse = await fetch(`${referenceApiBase}/api/users/guardian-candidates`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(guardianCandidatesResponse.status, 200, 'A tenant Admin can read the tenant-scoped Guardians eligible for account activation.');
    const guardianCandidates = await guardianCandidatesResponse.json();
    const guardianCandidate = guardianCandidates.guardians.find((item) => item.id === guardianId);
    assert.ok(guardianCandidate, 'An active Guardian with an active linked student appears in the invitation candidates.');
    assert.deepEqual(guardianCandidate.students.map((student) => student.id), [tahfidzStudentId], 'The invitation candidate preserves its tenant-scoped Guardian-to-student relationship.');

    const tenantBGuardianCandidatesResponse = await fetch(`${referenceApiBase}/api/users/guardian-candidates`, {
      headers: { Authorization: `Bearer ${guardianAdminBToken}` },
    });
    assert.equal(tenantBGuardianCandidatesResponse.status, 200);
    const tenantBGuardianCandidates = await tenantBGuardianCandidatesResponse.json();
    assert.ok(!tenantBGuardianCandidates.guardians.some((item) => item.id === guardianId), 'Another tenant cannot discover this Guardian or its linked student.');

    const guardianInvitationResponse = await fetch(`${referenceApiBase}/api/users/guardian-invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: waliEmail,
        guardianId,
        modulePermissions: { boarding: true, finance: true, tahfidz: true },
      }),
    });
    assert.equal(guardianInvitationResponse.status, 201, 'A tenant Admin can create an activation link for a confirmed Auth identity without an ERP profile.');
    const guardianInvitation = await guardianInvitationResponse.json();
    assert.equal(guardianInvitation.success, true);
    assert.equal(guardianInvitation.linkedExistingAccount, false);
    assert.ok(guardianInvitation.expiresAt, 'The invitation has an explicit expiry.');
    const actionLink = new URL(guardianInvitation.inviteUrl);
    const redirectTarget = actionLink.searchParams.get('redirect_to') || actionLink.searchParams.get('redirectTo');
    assert.ok(redirectTarget, 'The Auth action link returns the configured application redirect.');
    const redirectUrl = new URL(redirectTarget);
const guardianActivationToken = redirectUrl.searchParams.get('guardianInvite');
assert.match(guardianActivationToken || '', /^[A-Za-z0-9_-]{43}$/, 'The activation token is carried only in the recipient redirect and has the expected entropy-safe format (Auth query keys: ' + [...actionLink.searchParams.keys()].sort().join(',') + '; redirect query keys: ' + [...redirectUrl.searchParams.keys()].sort().join(',') + '; token length: ' + (guardianActivationToken?.length || 0) + ').');
    const wrongEmailVerification = await fetch(`${referenceApiBase}/api/guardian-invitations/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianAdminBToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guardianActivationToken }),
    });
    assert.equal(wrongEmailVerification.status, 400, 'A different confirmed email cannot verify the Guardian activation.');

    const guardianVerificationResponse = await fetch(`${referenceApiBase}/api/guardian-invitations/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${invitedWaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guardianActivationToken }),
    });
    assert.equal(guardianVerificationResponse.status, 200, 'The invited, email-confirmed user can verify the activation token.');
    assert.equal((await guardianVerificationResponse.json()).email, waliEmail);

    const wrongEmailClaim = await fetch(`${referenceApiBase}/api/guardian-invitations/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianAdminBToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guardianActivationToken }),
    });
    assert.equal(wrongEmailClaim.status, 400, 'A different confirmed email cannot claim the Guardian account.');

    const guardianClaimResponse = await fetch(`${referenceApiBase}/api/guardian-invitations/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${invitedWaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guardianActivationToken }),
    });
    assert.equal(guardianClaimResponse.status, 201, 'A verified invited user can atomically claim the Guardian identity.');
    assert.deepEqual(await guardianClaimResponse.json(), { success: true, linkedStudentCount: 1 });

    const [waliProfile, guardianAccount, claimedInvitation] = await Promise.all([
      admin.from('profiles').select('tenant_id,email,role,status,module_permissions').eq('user_id', invitedWali.uid).single(),
      admin.from('guardian_user_accounts').select('tenant_id,guardian_id,user_id,status').eq('tenant_id', tenantIds[0]).eq('guardian_id', guardianId).single(),
      admin.from('guardian_account_invitations').select('tenant_id,guardian_id,email,status,claimed_user_id').eq('tenant_id', tenantIds[0]).eq('guardian_id', guardianId).single(),
    ]);
    assert.equal(waliProfile.error, null);
    assert.equal(waliProfile.data?.tenant_id, tenantIds[0]);
    assert.equal(waliProfile.data?.email, waliEmail);
    assert.equal(waliProfile.data?.role, 'wali_santri');
    assert.equal(waliProfile.data?.status, 'active');
    assert.equal(waliProfile.data?.module_permissions?.boarding, true);
    assert.equal(waliProfile.data?.module_permissions?.finance, true);
    assert.equal(guardianAccount.error, null);
    assert.equal(guardianAccount.data?.user_id, invitedWali.uid);
    assert.equal(guardianAccount.data?.status, 'active');
    assert.equal(claimedInvitation.error, null);
    assert.equal(claimedInvitation.data?.status, 'claimed');
    assert.equal(claimedInvitation.data?.claimed_user_id, invitedWali.uid);

    const waliProfileResponse = await fetch(`${referenceApiBase}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${invitedWaliToken}` },
    });
    assert.equal(waliProfileResponse.status, 200, 'The newly claimed Guardian account can load its tenant-scoped ERP profile.');
    const waliProfilePayload = await waliProfileResponse.json();
    assert.equal(waliProfilePayload.profile.uid, invitedWali.uid);
    assert.equal(waliProfilePayload.profile.role, 'Walisantri');
    assert.equal(waliProfilePayload.profile.tenantId, tenantIds[0]);

    const waliTahfidzRosterResponse = await fetch(`${referenceApiBase}/api/tahfidz/roster`, {
      headers: { Authorization: `Bearer ${invitedWaliToken}` },
    });
    assert.equal(waliTahfidzRosterResponse.status, 200, 'A claimed Wali can read the roster through the tenant-scoped Tahfidz API.');
    const waliTahfidzRoster = await waliTahfidzRosterResponse.json();
    assert.deepEqual(waliTahfidzRoster.roster.map((student) => student.id), [tahfidzStudentId], 'The Wali only receives the student linked through the claimed Guardian record.');

    const repeatGuardianClaim = await fetch(`${referenceApiBase}/api/guardian-invitations/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${invitedWaliToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: guardianActivationToken }),
    });
    assert.equal(repeatGuardianClaim.status, 400, 'A claimed invitation cannot be replayed.');

    const claimedGuardianCandidatesResponse = await fetch(`${referenceApiBase}/api/users/guardian-candidates`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(claimedGuardianCandidatesResponse.status, 200);
    const claimedGuardianCandidates = await claimedGuardianCandidatesResponse.json();
    assert.ok(!claimedGuardianCandidates.guardians.some((item) => item.id === guardianId), 'A Guardian with an active login is no longer offered for a duplicate invitation.');

    const foreignGuardianInvitation = await fetch(`${referenceApiBase}/api/users/guardian-invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianAdminBToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `foreign-${fixtureSuffix}@example.test`, guardianId, modulePermissions: {} }),
    });
    assert.notEqual(foreignGuardianInvitation.status, 201, 'A tenant Admin cannot create an invitation for a Guardian owned by another tenant.');

    const masterDataAuthHeaders = { Authorization: `Bearer ${adminToken}` };
    const namingSeriesResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series`, {
      headers: masterDataAuthHeaders,
    });
    assert.equal(namingSeriesResponse.status, 200, 'A tenant Admin with Master Data access can read the tenant naming-series catalog.');
    const namingSeriesPayload = await namingSeriesResponse.json();
    assert.equal(namingSeriesPayload.records.length, 15, 'The tenant receives all configured business-number series.');
    const initialNisSeries = namingSeriesPayload.records.find((series) => series.seriesKey === 'nis');
    assert.ok(initialNisSeries, 'The NIS series is present in the tenant catalog.');
    assert.equal(initialNisSeries.formatTemplate, '{{YEAR}}{{GRADE}}{{SEQ}}');
    assert.equal(initialNisSeries.sequenceWidth, 4);
    assert.equal(initialNisSeries.resetPeriod, 'yearly');

    const namingSeriesTenantBResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(namingSeriesTenantBResponse.status, 200, 'An Admin in another tenant can read that tenant’s own naming-series settings.');
    const namingSeriesTenantB = await namingSeriesTenantBResponse.json();
    assert.equal(namingSeriesTenantB.records.find((series) => series.seriesKey === 'nis')?.startNumber, 1,
      'Tenant B starts from its own default NIS numbering settings.');

    const namingSeriesPermissionDenied = await fetch(`${referenceApiBase}/api/master-data/naming-series`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(namingSeriesPermissionDenied.status, 403, 'An Admin explicitly denied Master Data cannot read naming-series settings.');
    const namingSeriesRoleDenied = await fetch(`${referenceApiBase}/api/master-data/naming-series`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(namingSeriesRoleDenied.status, 403, 'A non-admin role cannot manage tenant naming-series settings.');

    const testNisGradeName = `Jenjang Uji NIS ${fixtureSuffix}`;
    const { data: testNisGradeRows, error: testNisGradeError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantIds[0],
      domain: 'academic_grade_level',
      code: `TEST_NIS_GRADE_${fixtureSuffix}`,
      name: testNisGradeName,
      description: 'Jenjang sintetis untuk menguji penomoran NIS otomatis.',
      status: 'active',
      nis_grade_code: '97',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    }).select('id');
    assert.equal(testNisGradeError, null, 'The synthetic grade used by the numbering test is tenant-owned and active.');
    assert.equal(testNisGradeRows?.length, 1);

    const namingSeriesRequestId = randomUUID();
    const namingSeriesUpdate = {
      seriesKey: 'nis',
      formatTemplate: '{{YEAR}}{{GRADE}}{{SEQ}}',
      sequenceWidth: 4,
      resetPeriod: 'yearly',
      startNumber: 7,
      isActive: true,
      clientRequestId: namingSeriesRequestId,
    };
    const namingSeriesSaveResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series/nis`, {
      method: 'PUT',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(namingSeriesUpdate),
    });
    assert.equal(namingSeriesSaveResponse.status, 200, 'The Admin can save the tenant NIS sequence configuration.');
    const namingSeriesSaved = await namingSeriesSaveResponse.json();
    assert.equal(namingSeriesSaved.record.seriesKey, 'nis');
    assert.equal(namingSeriesSaved.record.startNumber, 7);
    assert.equal(namingSeriesSaved.record.isActive, true);

    const namingSeriesTenantBAfterSaveResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(namingSeriesTenantBAfterSaveResponse.status, 200);
    const namingSeriesTenantBAfterSave = await namingSeriesTenantBAfterSaveResponse.json();
    assert.equal(namingSeriesTenantBAfterSave.records.find((series) => series.seriesKey === 'nis')?.startNumber, 1,
      'Changing Tenant A numbering settings does not alter Tenant B defaults.');

    const namingSeriesRetryResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series/nis`, {
      method: 'PUT',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(namingSeriesUpdate),
    });
    assert.equal(namingSeriesRetryResponse.status, 200, 'Retrying an identical series-setting request is idempotent.');
    assert.equal((await namingSeriesRetryResponse.json()).record.startNumber, 7);

    const namingSeriesConflictingRetryResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series/nis`, {
      method: 'PUT',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...namingSeriesUpdate, startNumber: 8 }),
    });
    assert.equal(namingSeriesConflictingRetryResponse.status, 409,
      'Reusing a naming-series request ID with a different payload is rejected.');

    const invalidNisSeriesResponse = await fetch(`${referenceApiBase}/api/master-data/naming-series/nis`, {
      method: 'PUT',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...namingSeriesUpdate, clientRequestId: randomUUID(), startNumber: 10000 }),
    });
    assert.equal(invalidNisSeriesResponse.status, 400, 'NIS rules that exceed the four-digit sequence limit are rejected.');

    const { data: namingSeriesEventRows, error: namingSeriesEventError } = await admin.from('tenant_naming_series_events')
      .select('tenant_id, client_request_id, series_key, actor_user_id, operation, payload')
      .eq('tenant_id', tenantIds[0])
      .eq('client_request_id', namingSeriesRequestId)
      .single();
    assert.equal(namingSeriesEventError, null, 'The naming-series update is recorded in the audit/event relation.');
    assert.equal(namingSeriesEventRows.actor_user_id, users[0].uid);
    assert.equal(namingSeriesEventRows.series_key, 'nis');
    assert.equal(namingSeriesEventRows.payload.startNumber, 7);

    const masterDataStudentInputs = [
      { sourceRecordId: `NIS-RACE-A-${fixtureSuffix}`, name: `Santri Uji NIS A ${fixtureSuffix}`, gender: 'L', grade: testNisGradeName, nis: '9999999999' },
      { sourceRecordId: `NIS-RACE-B-${fixtureSuffix}`, name: `Santri Uji NIS B ${fixtureSuffix}`, gender: 'P', grade: testNisGradeName, nis: '9999999998' },
    ];
    const concurrentMasterDataCreates = await Promise.all(masterDataStudentInputs.map((record) => fetch(`${referenceApiBase}/api/master-data/students`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    })));
    assert.deepEqual(concurrentMasterDataCreates.map((response) => response.status), [201, 201],
      'Two concurrent Admin requests can create students using the active tenant grade catalog.');
    const concurrentMasterDataRecords = await Promise.all(concurrentMasterDataCreates.map(async (response) => (await response.json()).record));
    const generatedNisValues = concurrentMasterDataRecords.map((record) => record.nis);
    assert.equal(new Set(generatedNisValues).size, 2, 'Concurrent student creation allocates unique NIS values.');
    assert.ok(generatedNisValues.every((nis) => /^\d{4}97000[78]$/.test(nis)),
      'NIS values follow the configured year + tenant grade code + sequence format and ignore client-supplied NIS values.');
    assert.deepEqual(generatedNisValues.map((nis) => nis.slice(-4)).sort(), ['0007', '0008'],
      'Concurrent allocations honor the configured start number without a lost or duplicated sequence.');
    assert.equal(new Set(concurrentMasterDataRecords.map((record) => record.supabaseId)).size, 2,
      'Each new student receives a unique persistent Supabase ID.');

    const masterDataReadbacks = await Promise.all(concurrentMasterDataRecords.map(async (createdRecord, index) => {
      const response = await fetch(`${referenceApiBase}/api/master-data/students/${encodeURIComponent(createdRecord.supabaseId)}`, {
        headers: masterDataAuthHeaders,
      });
      assert.equal(response.status, 200, 'A created student can be read back by its persistent Supabase ID.');
      const { record } = await response.json();
      assert.equal(record.supabaseId, createdRecord.supabaseId);
      assert.equal(record.sourceRecordId, masterDataStudentInputs[index].sourceRecordId);
      assert.equal(record.grade, testNisGradeName);
      assert.equal(record.nis, createdRecord.nis);
      return record;
    }));

    const { data: persistedNisStudentRows, error: persistedNisStudentError } = await admin.from('students')
      .select('id, tenant_id, source_record_id, nis, grade, status')
      .eq('tenant_id', tenantIds[0])
      .in('source_record_id', masterDataStudentInputs.map((record) => record.sourceRecordId));
    assert.equal(persistedNisStudentError, null, 'Both created student rows are persisted in the expected tenant.');
    assert.equal(persistedNisStudentRows?.length, 2);
    assert.ok(persistedNisStudentRows.every((row) => row.tenant_id === tenantIds[0] && row.status === 'Active'));
    assert.deepEqual(persistedNisStudentRows.map((row) => row.nis).sort(), [...generatedNisValues].sort());

    const { data: nisAllocationRows, error: nisAllocationError } = await admin.from('tenant_naming_series_allocations')
      .select('tenant_id, series_key, sequence_number, business_code')
      .eq('tenant_id', tenantIds[0])
      .eq('series_key', 'nis')
      .in('business_code', generatedNisValues);
    assert.equal(nisAllocationError, null, 'Each generated NIS has a corresponding transactional allocation record.');
    assert.equal(nisAllocationRows?.length, 2);
    assert.ok(nisAllocationRows.every((row) => row.tenant_id === tenantIds[0] && row.series_key === 'nis'));
    assert.deepEqual(nisAllocationRows.map((row) => Number(row.sequence_number)).sort((a, b) => a - b), [7, 8]);

    const masterDataStudentRetryResponse = await fetch(`${referenceApiBase}/api/master-data/students`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: masterDataStudentInputs[0] }),
    });
    assert.equal(masterDataStudentRetryResponse.status, 201);
    const masterDataStudentRetry = (await masterDataStudentRetryResponse.json()).record;
    assert.equal(masterDataStudentRetry.supabaseId, concurrentMasterDataRecords[0].supabaseId,
      'Retrying a student create with the same tenant source ID does not create a second Supabase student.');
    assert.equal(masterDataStudentRetry.nis, concurrentMasterDataRecords[0].nis,
      'A retry retains the previously issued NIS.');

    const immutableNisUpdateResponse = await fetch(`${referenceApiBase}/api/master-data/students/${encodeURIComponent(masterDataStudentRetry.supabaseId)}`, {
      method: 'PUT',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: {
        ...masterDataStudentInputs[0],
        supabaseId: masterDataStudentRetry.supabaseId,
        name: `Santri Uji NIS Diperbarui ${fixtureSuffix}`,
        nis: '0000000001',
      } }),
    });
    assert.equal(immutableNisUpdateResponse.status, 200, 'The Admin can update student details through the tenant API.');
    const immutableNisUpdate = (await immutableNisUpdateResponse.json()).record;
    assert.equal(immutableNisUpdate.name, `Santri Uji NIS Diperbarui ${fixtureSuffix}`);
    assert.equal(immutableNisUpdate.nis, masterDataStudentRetry.nis,
      'An issued NIS is immutable when student details are edited.');

    const masterDataSourceRetryRows = await admin.from('students')
      .select('id, nis')
      .eq('tenant_id', tenantIds[0])
      .eq('source_record_id', masterDataStudentInputs[0].sourceRecordId);
    assert.equal(masterDataSourceRetryRows.error, null);
    assert.equal(masterDataSourceRetryRows.data?.length, 1,
      'A retried source identifier continues to map to exactly one student row.');

    const foreignTenantMasterDataRead = await fetch(`${referenceApiBase}/api/master-data/students/${encodeURIComponent(concurrentMasterDataRecords[0].supabaseId)}`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(foreignTenantMasterDataRead.status, 404,
      'An Admin in another tenant cannot read a student by a known Supabase ID.');

    assert.equal(masterDataReadbacks.length, 2);

    const masterDataImportSourceId = `MASTER-DATA-CSV-${fixtureSuffix}`;
    const masterDataImportNis = String(9000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000));
    const masterDataImportNik = String(1000000000000000n + BigInt(`0x${randomBytes(7).toString('hex')}`) % 9000000000000000n);
    const masterDataImportNisn = String(1000000000 + (randomBytes(4).readUInt32BE(0) % 9000000000));
    const masterDataImportRow = {
      id: masterDataImportSourceId,
      name: `Santri Uji Impor ${fixtureSuffix}`,
      nis: masterDataImportNis,
      nik: masterDataImportNik,
      nisn: masterDataImportNisn,
      gender: 'P',
      grade: testNisGradeName,
      phone: '+6281234567890',
      email: `wali-${fixtureSuffix}@example.invalid`,
      parentName: `Wali Uji ${fixtureSuffix}`,
      parentPhone: '+6281234567891',
      address: `Alamat sintetis ${fixtureSuffix}`,
      status: 'Active',
    };
    const masterDataImportPreviewResponse = await fetch(`${referenceApiBase}/api/master-data/students/import/preview`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [masterDataImportRow] }),
    });
    assert.equal(masterDataImportPreviewResponse.status, 200,
      'An authorized Admin can preview a tenant Master Data import over the API.');
    const masterDataImportPreview = await masterDataImportPreviewResponse.json();
    assert.equal(masterDataImportPreview.rowCount, 1);
    assert.equal(masterDataImportPreview.readyCount, 1,
      `A valid import row with an active tenant grade reference passes preflight: ${JSON.stringify(masterDataImportPreview)}`);
    assert.equal(masterDataImportPreview.items[0].status, 'ready');
    const masterDataImportPreviewRows = await admin.from('students').select('id')
      .eq('tenant_id', tenantIds[0]).eq('source_system', 'legacy_import').eq('source_record_id', masterDataImportSourceId);
    assert.equal(masterDataImportPreviewRows.error, null);
    assert.equal(masterDataImportPreviewRows.data?.length, 0,
      'Preview does not write or partially import student rows.');

    const invalidMasterDataImportPreviewResponse = await fetch(`${referenceApiBase}/api/master-data/students/import/preview`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ ...masterDataImportRow, id: `${masterDataImportSourceId}-BAD`, grade: 'Jenjang Tidak Ada' }] }),
    });
    assert.equal(invalidMasterDataImportPreviewResponse.status, 200);
    const invalidMasterDataImportPreview = await invalidMasterDataImportPreviewResponse.json();
    assert.equal(invalidMasterDataImportPreview.errorCount, 1,
      'Preview rejects references outside the active tenant catalog before any write.');

    const masterDataImportApplyResponse = await fetch(`${referenceApiBase}/api/master-data/students/import/apply`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [masterDataImportRow] }),
    });
    assert.equal(masterDataImportApplyResponse.status, 200,
      'An authorized Admin can apply a fully preflighted import through the API.');
    const masterDataImportApplied = await masterDataImportApplyResponse.json();
    assert.equal(masterDataImportApplied.imported, 1);
    assert.equal(masterDataImportApplied.skipped, 0);
    assert.equal(masterDataImportApplied.errorCount, 0);

    const masterDataImportPersistedRows = await admin.from('students')
      .select('id, tenant_id, source_system, source_record_id, nis, grade, grade_level_reference_id, nik_ciphertext, nisn_ciphertext, details')
      .eq('tenant_id', tenantIds[0]).eq('source_system', 'legacy_import').eq('source_record_id', masterDataImportSourceId);
    assert.equal(masterDataImportPersistedRows.error, null);
    assert.equal(masterDataImportPersistedRows.data?.length, 1,
      'The import persists exactly one tenant-owned student row.');
    const masterDataImportedStudent = masterDataImportPersistedRows.data[0];
    assert.equal(masterDataImportedStudent.tenant_id, tenantIds[0]);
    assert.equal(masterDataImportedStudent.nis, masterDataImportNis);
    assert.equal(masterDataImportedStudent.grade_level_reference_id, testNisGradeRows[0].id,
      'The imported grade is stored as its tenant-owned relational reference.');
    assert.ok(masterDataImportedStudent.nik_ciphertext && masterDataImportedStudent.nisn_ciphertext,
      'Sensitive identity values are encrypted before database persistence.');
    assert.notEqual(masterDataImportedStudent.nik_ciphertext, masterDataImportNik);
    assert.notEqual(masterDataImportedStudent.nisn_ciphertext, masterDataImportNisn);

    const masterDataImportAuditRows = await admin.from('master_data_audit_events')
      .select('tenant_id, actor_user_id, entity_type, entity_id, action, changed_fields, change_source')
      .eq('tenant_id', tenantIds[0]).eq('entity_id', masterDataImportedStudent.id).eq('change_source', 'master_data_import');
    assert.equal(masterDataImportAuditRows.error, null);
    assert.equal(masterDataImportAuditRows.data?.length, 1,
      'The write creates an append-only metadata audit event.');
    assert.equal(masterDataImportAuditRows.data[0].actor_user_id, users[0].uid);
    assert.equal(masterDataImportAuditRows.data[0].action, 'created');

    const repeatedMasterDataImportResponse = await fetch(`${referenceApiBase}/api/master-data/students/import/apply`, {
      method: 'POST',
      headers: { ...masterDataAuthHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [masterDataImportRow] }),
    });
    assert.equal(repeatedMasterDataImportResponse.status, 200,
      'Retrying an applied import request remains a successful no-duplicate operation.');
    const repeatedMasterDataImport = await repeatedMasterDataImportResponse.json();
    assert.equal(repeatedMasterDataImport.imported, 0);
    assert.equal(repeatedMasterDataImport.skipped, 1);
    const masterDataImportRowsAfterRetry = await admin.from('students').select('id')
      .eq('tenant_id', tenantIds[0]).eq('source_system', 'legacy_import').eq('source_record_id', masterDataImportSourceId);
    assert.equal(masterDataImportRowsAfterRetry.error, null);
    assert.equal(masterDataImportRowsAfterRetry.data?.length, 1,
      'Retry does not create duplicate student rows.');

    const defaultMasterDataExportResponse = await fetch(`${referenceApiBase}/api/master-data/students/export`, {
      headers: masterDataAuthHeaders,
    });
    assert.equal(defaultMasterDataExportResponse.status, 200,
      'An authorized Admin can export the active tenant Master Data.');
    const defaultMasterDataExport = await defaultMasterDataExportResponse.json();
    const defaultExportedStudent = defaultMasterDataExport.records.find((record) => record.id === masterDataImportSourceId);
    assert.ok(defaultExportedStudent, 'The exported tenant dataset includes the newly imported student.');
    for (const field of ['nik', 'nisn', 'phone', 'email', 'parentName', 'parentPhone', 'address']) {
      assert.equal(Object.hasOwn(defaultExportedStudent, field), false,
        `Default export excludes sensitive field ${field}.`);
    }

    const sensitiveMasterDataExportResponse = await fetch(`${referenceApiBase}/api/master-data/students/export?includeSensitive=true`, {
      headers: masterDataAuthHeaders,
    });
    const sensitiveMasterDataExport = await sensitiveMasterDataExportResponse.json();
    assert.equal(sensitiveMasterDataExportResponse.status, 200,
      `Explicit sensitive export must be available to an authorized tenant Admin: ${JSON.stringify(sensitiveMasterDataExport)}`);
    const sensitiveExportedStudent = sensitiveMasterDataExport.records.find((record) => record.id === masterDataImportSourceId);
    assert.equal(sensitiveExportedStudent?.nik, masterDataImportNik,
      'An explicitly requested sensitive export decrypts NIK for authorized tenant migration.');
    assert.equal(sensitiveExportedStudent?.nisn, masterDataImportNisn);
    assert.equal(sensitiveExportedStudent?.phone, masterDataImportRow.phone);
    assert.equal(sensitiveExportedStudent?.email, masterDataImportRow.email);

    const otherTenantMasterDataExportResponse = await fetch(`${referenceApiBase}/api/master-data/students/export`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantMasterDataExportResponse.status, 200);
    const otherTenantMasterDataExport = await otherTenantMasterDataExportResponse.json();
    assert.equal(otherTenantMasterDataExport.records.some((record) => record.id === masterDataImportSourceId), false,
      'Tenant B exports only its own students, even when it knows a Tenant A source ID.');

    const masterDataExportPermissionDenied = await fetch(`${referenceApiBase}/api/master-data/students/export`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(masterDataExportPermissionDenied.status, 403,
      'An Admin without Master Data permission cannot export student records.');
    const masterDataImportRoleDenied = await fetch(`${referenceApiBase}/api/master-data/students/import/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [masterDataImportRow] }),
    });
    assert.equal(masterDataImportRoleDenied.status, 403,
      'A non-admin role cannot preview imports or extract tenant data.');

    const alumniInitialSnapshotResponse = await fetch(`${referenceApiBase}/api/alumni`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(alumniInitialSnapshotResponse.status, 200, 'An authorized tenant Admin can read the Alumni snapshot.');
    const alumniInitialSnapshot = await alumniInitialSnapshotResponse.json();
    const eligibleAlumniStudent = alumniInitialSnapshot.eligibleStudents.find((student) => student.id === alumniStudentId);
    assert.ok(eligibleAlumniStudent, 'An active, not-yet-graduated student appears in the eligible Alumni list.');
    assert.equal(eligibleAlumniStudent.nis, alumniStudentNis, 'Alumni eligibility preserves the student NIS relationship.');

    const alumniPermissionDenied = await fetch(`${referenceApiBase}/api/alumni`, {
      headers: { Authorization: `Bearer ${await signIn(anon, alumniNoPermissionUser)}` },
    });
    assert.equal(alumniPermissionDenied.status, 403, 'An Admin without Alumni module permission cannot read Alumni.');
    const alumniRoleDenied = await fetch(`${referenceApiBase}/api/alumni`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(alumniRoleDenied.status, 403, 'A non-admin cannot access Alumni even if its module flag is enabled.');
    const otherTenantAlumniSnapshotResponse = await fetch(`${referenceApiBase}/api/alumni`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantAlumniSnapshotResponse.status, 200, 'A separately authorized Admin can read the Alumni snapshot for their tenant.');
    const otherTenantAlumniSnapshot = await otherTenantAlumniSnapshotResponse.json();
    assert.equal(otherTenantAlumniSnapshot.alumni.some((item) => item.studentId === alumniStudentId), false,
      'Tenant B cannot read a Tenant A Alumni record.');

    const alumniGraduatedAt = new Date().toISOString().slice(0, 10);
    const alumniGraduationPayload = {
      studentId: alumniStudentId,
      graduationYear: Number(alumniGraduatedAt.slice(0, 4)),
      graduatedAt: alumniGraduatedAt,
      clientRequestId: randomUUID(),
    };
    const alumniGraduationCreate = await fetch(`${referenceApiBase}/api/alumni/graduations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(alumniGraduationPayload),
    });
    assert.equal(alumniGraduationCreate.status, 201, 'The Admin can persist a graduation and archive its student atomically.');
    const alumniGraduation = await alumniGraduationCreate.json();
    assert.equal(alumniGraduation.alreadyGraduated, false);
    assert.ok(alumniGraduation.alumniId, 'Graduation creates an Alumni profile ID.');

    const alumniGraduationRetry = await fetch(`${referenceApiBase}/api/alumni/graduations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(alumniGraduationPayload),
    });
    assert.equal(alumniGraduationRetry.status, 200, 'Retrying the same graduation request is idempotent.');
    assert.deepEqual(await alumniGraduationRetry.json(), {
      success: true,
      alreadyGraduated: true,
      alumniId: alumniGraduation.alumniId,
    });

    const priorGraduatedAtDate = new Date(`${alumniGraduationPayload.graduatedAt}T00:00:00.000Z`);
    priorGraduatedAtDate.setUTCFullYear(priorGraduatedAtDate.getUTCFullYear() - 1);
    const alumniRequestConflict = await fetch(`${referenceApiBase}/api/alumni/graduations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...alumniGraduationPayload,
        graduationYear: alumniGraduationPayload.graduationYear - 1,
        graduatedAt: priorGraduatedAtDate.toISOString().slice(0, 10),
      }),
    });
    assert.equal(alumniRequestConflict.status, 409, 'An idempotency key reused with different graduation data is rejected.');

    const alumniDuplicateStudentDenied = await fetch(`${referenceApiBase}/api/alumni/graduations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...alumniGraduationPayload, clientRequestId: randomUUID() }),
    });
    assert.equal(alumniDuplicateStudentDenied.status, 409, 'A student cannot be graduated twice under a new request ID.');

    const alumniForeignStudentDenied = await fetch(`${referenceApiBase}/api/alumni/graduations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...alumniGraduationPayload, studentId: otherTenantCbtStudentId, clientRequestId: randomUUID() }),
    });
    assert.equal(alumniForeignStudentDenied.status, 404, 'An Admin cannot graduate a student belonging to another tenant.');

    const alumniReadbackResponse = await fetch(`${referenceApiBase}/api/alumni`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(alumniReadbackResponse.status, 200, 'The Alumni record can be read back after persistence.');
    const alumniReadback = await alumniReadbackResponse.json();
    const persistedAlumnus = alumniReadback.alumni.find((item) => item.id === alumniGraduation.alumniId);
    assert.ok(persistedAlumnus, 'Persisted Alumni appears in the tenant snapshot.');
    assert.equal(persistedAlumnus.studentId, alumniStudentId);
    assert.equal(persistedAlumnus.nis, alumniStudentNis);
    assert.equal(persistedAlumnus.graduationYear, alumniGraduationPayload.graduationYear);
    assert.equal(alumniReadback.eligibleStudents.some((item) => item.id === alumniStudentId), false,
      'The graduated student is removed from the eligible-student list.');

    const { data: alumniProfileRow, error: alumniProfileReadError } = await admin.from('alumni_profiles')
      .select('id, tenant_id, student_id, graduation_year, graduated_at, created_by_user_id')
      .eq('id', alumniGraduation.alumniId)
      .single();
    assert.equal(alumniProfileReadError, null, 'The Alumni profile row can be verified in the local integration database.');
    assert.equal(alumniProfileRow.tenant_id, tenantIds[0]);
    assert.equal(alumniProfileRow.student_id, alumniStudentId);
    assert.equal(alumniProfileRow.created_by_user_id, users[0].uid);
    const { data: alumniRequestRow, error: alumniRequestReadError } = await admin.from('alumni_graduation_requests')
      .select('tenant_id, client_request_id, student_id, graduation_year, graduated_at, created_by_user_id, alumni_profile_id')
      .eq('tenant_id', tenantIds[0])
      .eq('client_request_id', alumniGraduationPayload.clientRequestId)
      .single();
    assert.equal(alumniRequestReadError, null, 'The graduation request audit row is stored with the result.');
    assert.equal(alumniRequestRow.student_id, alumniStudentId);
    assert.equal(alumniRequestRow.created_by_user_id, users[0].uid);
    assert.equal(alumniRequestRow.alumni_profile_id, alumniGraduation.alumniId);
    const { data: archivedAlumniStudent, error: archivedAlumniStudentError } = await admin.from('students')
      .select('id, status')
      .eq('tenant_id', tenantIds[0])
      .eq('id', alumniStudentId)
      .single();
    assert.equal(archivedAlumniStudentError, null, 'The graduated student row remains available for audit and history.');
    assert.equal(archivedAlumniStudent.status, 'Archived', 'Graduation archives the source student record.');

    const cbtSnapshotResponse = await fetch(`${referenceApiBase}/api/cbt/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cbtSnapshotResponse.status, 200, 'An authorized tenant Admin can load the CBT snapshot from Supabase.');
    const cbtInitialSnapshot = await cbtSnapshotResponse.json();
    assert.ok(cbtInitialSnapshot.references.subjects.some((item) => item.id === academicSubjectId),
      'CBT subject choices resolve from the tenant-owned Academic catalog.');
    assert.ok(cbtInitialSnapshot.references.gradeLevels.some((item) => item.id === gradeLevelReferenceId),
      'CBT grade choices resolve from the tenant-owned grade catalog.');
    assert.ok(cbtInitialSnapshot.references.templates.some((item) => item.id === cbtQuestionTemplateId),
      'CBT template choices resolve from the tenant-owned CBT catalog.');

    const cbtPermissionDenied = await fetch(`${referenceApiBase}/api/cbt/admin`, {
      headers: { Authorization: `Bearer ${limitedAdminToken}` },
    });
    assert.equal(cbtPermissionDenied.status, 403, 'An Admin without CBT permission cannot read the CBT module.');
    const cbtRoleDenied = await fetch(`${referenceApiBase}/api/cbt/admin`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(cbtRoleDenied.status, 403, 'A non-admin with CBT permission cannot manage the question bank or exam.');
    const otherTenantCbtSnapshotResponse = await fetch(`${referenceApiBase}/api/cbt/admin`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantCbtSnapshotResponse.status, 200, 'A separately authorized Admin can read only their own tenant CBT snapshot.');
    const otherTenantCbtSnapshot = await otherTenantCbtSnapshotResponse.json();
    assert.equal(otherTenantCbtSnapshot.questions.length, 0, 'Tenant B must not see Tenant A CBT questions.');
    assert.equal(otherTenantCbtSnapshot.exams.length, 0, 'Tenant B must not see Tenant A exams.');

    const cbtQuestionRequestId = randomUUID();
    const cbtQuestionPayload = {
      clientRequestId: cbtQuestionRequestId,
      question: {
        subjectReferenceId: academicSubjectId,
        gradeLevelReferenceId,
        templateReferenceId: cbtQuestionTemplateId,
        text: `Berapakah hasil 2 + 3? ${fixtureSuffix}`,
        options: ['4', '5', '6', '7'],
        correctAnswer: 1,
        explanation: 'Dua ditambah tiga sama dengan lima.',
        difficulty: 'Easy',
        tags: ['integrasi-api'],
      },
    };
    const cbtQuestionCreate = await fetch(`${referenceApiBase}/api/cbt/questions`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cbtQuestionPayload),
    });
    assert.equal(cbtQuestionCreate.status, 201, 'The Admin can persist a CBT question with tenant catalog relationships.');
    const cbtQuestion = await cbtQuestionCreate.json();
    const cbtQuestionRetry = await fetch(`${referenceApiBase}/api/cbt/questions`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cbtQuestionPayload),
    });
    assert.equal(cbtQuestionRetry.status, 200, 'Retrying the same CBT question request is idempotent.');
    assert.deepEqual(await cbtQuestionRetry.json(), { id: cbtQuestion.id, alreadyApplied: true });

    const foreignCbtReference = await fetch(`${referenceApiBase}/api/cbt/questions`, {
      method: 'POST', headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cbtQuestionPayload, clientRequestId: randomUUID() }),
    });
    assert.equal(foreignCbtReference.status, 400, 'CBT must reject a reference catalog ID owned by another tenant.');

    const examRequestId = randomUUID();
    const cbtExamPayload = {
      exam: {
        clientRequestId: examRequestId,
        title: `Ujian API CBT ${fixtureSuffix}`,
        subjectReferenceId: academicSubjectId,
        gradeLevelReferenceId,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        durationMinutes: 10,
        passingScore: 100,
        correctPoints: 1,
        wrongPoints: 0,
        blankPoints: 0,
        shuffleQuestions: false,
        status: 'published',
        questionIds: [cbtQuestion.id],
        studentIds: [tahfidzStudentId],
      },
    };
    const cbtExamCreate = await fetch(`${referenceApiBase}/api/cbt/exams`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cbtExamPayload),
    });
    assert.equal(cbtExamCreate.status, 201, 'The Admin can persist an exam and its question/student relationships.');
    const cbtExam = await cbtExamCreate.json();
    const cbtExamRetry = await fetch(`${referenceApiBase}/api/cbt/exams`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cbtExamPayload),
    });
    assert.equal(cbtExamRetry.status, 200, 'Retrying the same CBT exam request is idempotent.');
    assert.deepEqual(await cbtExamRetry.json(), { id: cbtExam.id, alreadyApplied: true });

    const tenantBStudentToken = await signIn(anon, users[2]);
    const tenantBStudentSnapshotResponse = await fetch(`${referenceApiBase}/api/cbt/student`, {
      headers: { Authorization: `Bearer ${tenantBStudentToken}` },
    });
    assert.equal(tenantBStudentSnapshotResponse.status, 200, 'A linked Santri from a second tenant can read their own CBT portal.');
    assert.deepEqual((await tenantBStudentSnapshotResponse.json()).exams, [], 'Tenant B Santri must not see the exam assigned to Tenant A.');
    const crossTenantCbtStart = await fetch(`${referenceApiBase}/api/cbt/exams/${encodeURIComponent(cbtExam.id)}/start`, {
      method: 'POST', headers: { Authorization: `Bearer ${tenantBStudentToken}` },
    });
    assert.equal(crossTenantCbtStart.status, 404, 'A Santri in another tenant cannot start the foreign tenant exam.');

    const studentCbtSnapshotResponse = await fetch(`${referenceApiBase}/api/cbt/student`, {
      headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(studentCbtSnapshotResponse.status, 200, 'The linked Santri can load their assigned CBT exams.');
    const studentCbtSnapshot = await studentCbtSnapshotResponse.json();
    assert.equal(studentCbtSnapshot.exams.length, 1, 'A Santri sees only their assigned exam.');
    assert.equal(studentCbtSnapshot.exams[0].id, cbtExam.id);

    const cbtStart = await fetch(`${referenceApiBase}/api/cbt/exams/${encodeURIComponent(cbtExam.id)}/start`, {
      method: 'POST', headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(cbtStart.status, 200, 'The assigned Santri can start a published exam.');
    const cbtAttempt = await cbtStart.json();
    assert.equal(cbtAttempt.questions.length, 1);
    assert.equal(Object.hasOwn(cbtAttempt.questions[0], 'correctAnswer'), false, 'The student start response must not expose the answer key.');
    assert.ok(cbtAttempt.serverNow, 'The attempt response includes the authoritative database clock.');
    const cbtStartRetry = await fetch(`${referenceApiBase}/api/cbt/exams/${encodeURIComponent(cbtExam.id)}/start`, {
      method: 'POST', headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(cbtStartRetry.status, 200, 'Starting an active exam again resumes the existing attempt.');
    assert.equal((await cbtStartRetry.json()).attemptId, cbtAttempt.attemptId);

    const cbtInvalidAnswer = await fetch(`${referenceApiBase}/api/cbt/attempts/${encodeURIComponent(cbtAttempt.attemptId)}/answers`, {
      method: 'PUT', headers: { Authorization: `Bearer ${santriToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { [cbtQuestion.id]: 99 } }),
    });
    assert.equal(cbtInvalidAnswer.status, 400, 'CBT rejects answers that reference an option outside the question.');
    const cbtAnswerSave = await fetch(`${referenceApiBase}/api/cbt/attempts/${encodeURIComponent(cbtAttempt.attemptId)}/answers`, {
      method: 'PUT', headers: { Authorization: `Bearer ${santriToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { [cbtQuestion.id]: 1 } }),
    });
    assert.equal(cbtAnswerSave.status, 200, 'A valid student answer persists through the server API.');
    assert.equal((await cbtAnswerSave.json()).saved, true);

    const cbtSubmit = await fetch(`${referenceApiBase}/api/cbt/attempts/${encodeURIComponent(cbtAttempt.attemptId)}/submit`, {
      method: 'POST', headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(cbtSubmit.status, 200, 'The student can submit an active attempt for server-side scoring.');
    const cbtResult = await cbtSubmit.json();
    assert.equal(cbtResult.score, 100);
    assert.equal(cbtResult.passed, true);
    assert.equal(cbtResult.correct, 1);
    const cbtSubmitRetry = await fetch(`${referenceApiBase}/api/cbt/attempts/${encodeURIComponent(cbtAttempt.attemptId)}/submit`, {
      method: 'POST', headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(cbtSubmitRetry.status, 200, 'Retrying submission returns the already persisted result.');
    assert.deepEqual(await cbtSubmitRetry.json(), cbtResult);

    const { data: persistedCbtAttempt, error: persistedCbtAttemptError } = await admin.from('cbt_attempts')
      .select('tenant_id,student_id,exam_id,answers,score,passed,correct_count,submitted_at')
      .eq('tenant_id', tenantIds[0]).eq('id', cbtAttempt.attemptId).single();
    assert.equal(persistedCbtAttemptError, null, 'The CBT result is readable from the test database after the API round trip.');
    assert.equal(persistedCbtAttempt.student_id, tahfidzStudentId, 'The attempt retains the same-tenant student relationship.');
    assert.equal(persistedCbtAttempt.exam_id, cbtExam.id, 'The attempt retains the exam relationship.');
    assert.equal(persistedCbtAttempt.answers[cbtQuestion.id], 1, 'The saved answer is persisted in the database.');
    assert.equal(Number(persistedCbtAttempt.score), 100, 'Scoring is persisted server-side.');
    assert.equal(persistedCbtAttempt.passed, true);

    const cbtStudentAfterSubmitResponse = await fetch(`${referenceApiBase}/api/cbt/student`, {
      headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(cbtStudentAfterSubmitResponse.status, 200);
    const cbtStudentAfterSubmit = await cbtStudentAfterSubmitResponse.json();
    assert.equal(cbtStudentAfterSubmit.exams[0].score, 100, 'The Santri snapshot reads the stored result after submission.');
    assert.equal(cbtStudentAfterSubmit.exams[0].passed, true);

    const cbtAdminAfterSubmitResponse = await fetch(`${referenceApiBase}/api/cbt/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cbtAdminAfterSubmitResponse.status, 200);
    const cbtAdminAfterSubmit = await cbtAdminAfterSubmitResponse.json();
    assert.equal(cbtAdminAfterSubmit.questions.find((item) => item.id === cbtQuestion.id)?.correctAnswer, 1,
      'The answer key remains available only in the authorized Admin snapshot.');
    assert.equal(cbtAdminAfterSubmit.exams.find((item) => item.id === cbtExam.id)?.completedCount, 1,
      'Admin analytics reflect the completed assignment.');
    assert.equal(cbtAdminAfterSubmit.results.find((item) => item.examTitle === cbtExamPayload.exam.title)?.score, 100,
      'Admin results include the persisted score.');

    const lmsNoPermissionUser = await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'lms-denied', { lms: false });
    users.push(lmsNoPermissionUser);
    const lmsNoPermissionToken = await signIn(anon, lmsNoPermissionUser);
    const lmsDeniedSnapshot = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${lmsNoPermissionToken}` },
    });
    assert.equal(lmsDeniedSnapshot.status, 403, 'An Admin without LMS permission cannot access the module.');
    const lmsWaliDenied = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${waliToken}` },
    });
    assert.equal(lmsWaliDenied.status, 403, 'The Wali role cannot access the internal LMS runtime.');

    const lmsAdminSnapshot = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const lmsAdminSnapshotPayload = await lmsAdminSnapshot.json();
    assert.equal(lmsAdminSnapshot.status, 200, `An authorized tenant Admin can open the LMS runtime: ${JSON.stringify(lmsAdminSnapshotPayload)}`);
    assert.deepEqual(lmsAdminSnapshotPayload.courses, [], 'A new tenant begins without LMS courses.');

    const lmsCategoryBResponse = await fetch(`${referenceApiBase}/api/lms/catalog/category`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { name: `Kategori Tenant B ${fixtureSuffix}`, description: 'Kategori kursus khusus tenant kedua.' } }),
    });
    assert.equal(lmsCategoryBResponse.status, 201, 'Tenant B can create its own LMS category.');
    const lmsCategoryB = await lmsCategoryBResponse.json();
    const lmsForeignCategoryCourse = await fetch(`${referenceApiBase}/api/lms/catalog/course`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: {
        clientRequestId: randomUUID(), categoryId: lmsCategoryB.id, title: `Kursus kategori asing ${fixtureSuffix}`,
        gradeLevelReferenceId, instructorUserId: users[3].uid, status: 'draft',
      } }),
    });
    assert.equal(lmsForeignCategoryCourse.status, 409, 'A course cannot reference an LMS category from another tenant.');

    const lmsCategoryResponse = await fetch(`${referenceApiBase}/api/lms/catalog/category`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { name: `Kategori Integrasi ${fixtureSuffix}`, description: 'Kategori untuk uji relasi dan persistensi LMS.' } }),
    });
    assert.equal(lmsCategoryResponse.status, 201);
    const lmsCategory = await lmsCategoryResponse.json();
    const lmsCourseInput = {
      clientRequestId: randomUUID(), categoryId: lmsCategory.id, title: `Kursus Integrasi ${fixtureSuffix}`,
      description: 'Kursus sintetis untuk membuktikan relasi tenant dan alur belajar.', gradeLevelReferenceId,
      instructorUserId: users[3].uid, status: 'published', color: 'emerald',
    };
    const lmsCourseResponse = await fetch(`${referenceApiBase}/api/lms/catalog/course`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsCourseInput }),
    });
    assert.equal(lmsCourseResponse.status, 201, 'Admin can create a published course with tenant category and grade references.');
    const lmsCourse = await lmsCourseResponse.json();
    const lmsCourseRetry = await fetch(`${referenceApiBase}/api/lms/catalog/course`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsCourseInput }),
    });
    assert.equal(lmsCourseRetry.status, 200);
    assert.equal((await lmsCourseRetry.json()).id, lmsCourse.id, 'Course retries reuse the original row.');

    const lmsModuleInput = { courseId: lmsCourse.id, clientRequestId: randomUUID(), title: `Bab Pertama ${fixtureSuffix}`, description: 'Modul pembelajaran uji.', displayOrder: 0 };
    const lmsModuleResponse = await fetch(`${referenceApiBase}/api/lms/catalog/module`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsModuleInput }),
    });
    assert.equal(lmsModuleResponse.status, 201);
    const lmsModule = await lmsModuleResponse.json();
    const lmsModuleRetry = await fetch(`${referenceApiBase}/api/lms/catalog/module`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsModuleInput }),
    });
    assert.equal(lmsModuleRetry.status, 200);
    assert.equal((await lmsModuleRetry.json()).id, lmsModule.id, 'Module retries reuse the original row.');

    const lmsMaterialInput = { courseId: lmsCourse.id, moduleId: lmsModule.id, clientRequestId: randomUUID(), title: `Materi Teks ${fixtureSuffix}`, type: 'text', body: 'Materi teks LMS sintetis untuk uji penyimpanan.', durationSeconds: 180, displayOrder: 0 };
    const lmsMaterialResponse = await fetch(`${referenceApiBase}/api/lms/catalog/material`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsMaterialInput }),
    });
    assert.equal(lmsMaterialResponse.status, 201);
    const lmsMaterial = await lmsMaterialResponse.json();
    const lmsAssignmentInput = {
      courseId: lmsCourse.id, moduleId: lmsModule.id, clientRequestId: randomUUID(),
      title: `Tugas Integrasi ${fixtureSuffix}`, instructions: 'Jelaskan kembali materi dengan singkat.',
      maxScore: 100, status: 'published', allowLate: true,
    };
    const lmsAssignmentResponse = await fetch(`${referenceApiBase}/api/lms/catalog/assignment`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: lmsAssignmentInput }),
    });
    assert.equal(lmsAssignmentResponse.status, 201);
    const lmsAssignment = await lmsAssignmentResponse.json();
    const lmsEnrollmentResponse = await fetch(`${referenceApiBase}/api/lms/catalog/enroll`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { courseId: lmsCourse.id, studentId: tahfidzStudentId } }),
    });
    assert.equal(lmsEnrollmentResponse.status, 201, 'Admin can enroll an active Santri in the tenant course.');
    const lmsEnrollment = await lmsEnrollmentResponse.json();

    const lmsUstadzCategoryDenied = await fetch(`${referenceApiBase}/api/lms/catalog/category`, {
      method: 'POST', headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { name: `Kategori ditolak ${fixtureSuffix}`, description: 'Kategori yang tidak boleh dibuat Ustadz.' } }),
    });
    assert.equal(lmsUstadzCategoryDenied.status, 403, 'Ustadz may teach but cannot administer tenant LMS categories.');
    const lmsTeacherSnapshotResponse = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    const lmsTeacherSnapshotPayload = await lmsTeacherSnapshotResponse.json();
    assert.equal(lmsTeacherSnapshotResponse.status, 200, `The assigned Ustadz can load the LMS snapshot: ${JSON.stringify(lmsTeacherSnapshotPayload)}`);
    const lmsTeacherSnapshot = lmsTeacherSnapshotPayload;
    assert.ok(lmsTeacherSnapshot.courses.some((course) => course.id === lmsCourse.id), 'The assigned Ustadz sees the course they teach.');
    assert.ok(lmsTeacherSnapshot.assignments.some((assignment) => assignment.id === lmsAssignment.id), 'The Ustadz snapshot includes the related assignment.');
    assert.ok(lmsTeacherSnapshot.students.some((student) => student.id === tahfidzStudentId), 'The Ustadz sees enrolled students for the course.');

    const lmsTenantBSnapshotResponse = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(lmsTenantBSnapshotResponse.status, 200);
    assert.deepEqual((await lmsTenantBSnapshotResponse.json()).courses, [], 'Tenant B cannot read Tenant A LMS courses.');
    const lmsStudentBeforeEnrollment = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${tenantBStudentToken}` },
    });
    assert.equal(lmsStudentBeforeEnrollment.status, 200);
    assert.deepEqual((await lmsStudentBeforeEnrollment.json()).courses, [], 'A student in another tenant cannot discover the course.');

    const lmsProgressHeaders = { Authorization: `Bearer ${santriToken}`, 'Content-Type': 'application/json' };
    const lmsProgressFirst = await fetch(`${referenceApiBase}/api/lms/progress`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ materialId: lmsMaterial.id, positionSeconds: 80, completed: false }),
    });
    assert.equal(lmsProgressFirst.status, 200);
    const lmsProgressRegression = await fetch(`${referenceApiBase}/api/lms/progress`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ materialId: lmsMaterial.id, positionSeconds: 30, completed: false }),
    });
    assert.equal(lmsProgressRegression.status, 200);
    const lmsProgressComplete = await fetch(`${referenceApiBase}/api/lms/progress`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ materialId: lmsMaterial.id, positionSeconds: 120, completed: true }),
    });
    assert.equal(lmsProgressComplete.status, 200);
    const lmsProgressAfterCompleteRegression = await fetch(`${referenceApiBase}/api/lms/progress`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ materialId: lmsMaterial.id, positionSeconds: 40, completed: false }),
    });
    assert.equal(lmsProgressAfterCompleteRegression.status, 200);
    const lmsProgressBeyondDuration = await fetch(`${referenceApiBase}/api/lms/progress`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ materialId: lmsMaterial.id, positionSeconds: 181, completed: false }),
    });
    assert.equal(lmsProgressBeyondDuration.status, 400, 'Progress cannot exceed material duration.');

    const lmsNoteInput = { requestId: randomUUID(), materialId: lmsMaterial.id, kind: 'note', timestampSeconds: 30, text: 'Catatan belajar yang tersimpan.' };
    const lmsNoteResponse = await fetch(`${referenceApiBase}/api/lms/learning-records`, {
      method: 'POST', headers: lmsProgressHeaders, body: JSON.stringify(lmsNoteInput),
    });
    assert.equal(lmsNoteResponse.status, 201);
    const lmsNote = await lmsNoteResponse.json();
    const lmsNoteRetry = await fetch(`${referenceApiBase}/api/lms/learning-records`, {
      method: 'POST', headers: lmsProgressHeaders, body: JSON.stringify(lmsNoteInput),
    });
    assert.equal(lmsNoteRetry.status, 200);
    assert.equal((await lmsNoteRetry.json()).id, lmsNote.id, 'Learning note retries are idempotent.');
    const lmsNotePayloadReuse = await fetch(`${referenceApiBase}/api/lms/learning-records`, {
      method: 'POST', headers: lmsProgressHeaders, body: JSON.stringify({ ...lmsNoteInput, text: 'Payload berbeda.' }),
    });
    assert.equal(lmsNotePayloadReuse.status, 409, 'A learning-record request ID cannot be replayed with altered content.');
    const lmsCommentResponse = await fetch(`${referenceApiBase}/api/lms/learning-records`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ requestId: randomUUID(), materialId: lmsMaterial.id, kind: 'comment', timestampSeconds: 45, text: 'Pertanyaan pada materi.' }),
    });
    assert.equal(lmsCommentResponse.status, 201);

    const lmsSubmissionInput = { requestId: randomUUID(), responseText: 'Jawaban tugas yang tersimpan.', resourceUrl: '' };
    const lmsSubmissionResponse = await fetch(`${referenceApiBase}/api/lms/assignments/${encodeURIComponent(lmsAssignment.id)}/submissions`, {
      method: 'POST', headers: lmsProgressHeaders, body: JSON.stringify(lmsSubmissionInput),
    });
    assert.equal(lmsSubmissionResponse.status, 201);
    const lmsSubmission = await lmsSubmissionResponse.json();
    const lmsSubmissionRetry = await fetch(`${referenceApiBase}/api/lms/assignments/${encodeURIComponent(lmsAssignment.id)}/submissions`, {
      method: 'POST', headers: lmsProgressHeaders, body: JSON.stringify(lmsSubmissionInput),
    });
    assert.equal(lmsSubmissionRetry.status, 201);
    assert.equal((await lmsSubmissionRetry.json()).id, lmsSubmission.id, 'Assignment submission retries reuse the original record.');
    const lmsCrossTenantSubmission = await fetch(`${referenceApiBase}/api/lms/assignments/${encodeURIComponent(lmsAssignment.id)}/submissions`, {
      method: 'POST', headers: { Authorization: `Bearer ${tenantBStudentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: randomUUID(), responseText: 'Jawaban dari tenant lain.', resourceUrl: '' }),
    });
    assert.equal(lmsCrossTenantSubmission.status, 403, 'A different tenant student cannot submit to this assignment.');

    const lmsGradeInput = { requestId: randomUUID(), score: 85, feedback: 'Jawaban baik, lanjutkan.' };
    const lmsGradeResponse = await fetch(`${referenceApiBase}/api/lms/submissions/${encodeURIComponent(lmsSubmission.id)}/grade`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(lmsGradeInput),
    });
    assert.equal(lmsGradeResponse.status, 200, 'The assigned Ustadz can grade the submitted work.');
    const lmsGrade = await lmsGradeResponse.json();
    const lmsGradeRetry = await fetch(`${referenceApiBase}/api/lms/submissions/${encodeURIComponent(lmsSubmission.id)}/grade`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(lmsGradeInput),
    });
    assert.equal(lmsGradeRetry.status, 200);
    assert.equal((await lmsGradeRetry.json()).id, lmsGrade.id, 'Grade retries do not create a second grade event.');
    const lmsInvalidGrade = await fetch(`${referenceApiBase}/api/lms/submissions/${encodeURIComponent(lmsSubmission.id)}/grade`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: randomUUID(), score: 101, feedback: 'Nilai di luar rentang.' }),
    });
    assert.equal(lmsInvalidGrade.status, 400, 'A grade cannot exceed the assignment maximum.');
    const lmsGradedResubmission = await fetch(`${referenceApiBase}/api/lms/assignments/${encodeURIComponent(lmsAssignment.id)}/submissions`, {
      method: 'POST', headers: lmsProgressHeaders,
      body: JSON.stringify({ requestId: randomUUID(), responseText: 'Tidak boleh mengganti tugas setelah dinilai.', resourceUrl: '' }),
    });
    assert.equal(lmsGradedResubmission.status, 409, 'A graded submission cannot be silently replaced.');

    const lmsStudentFinalResponse = await fetch(`${referenceApiBase}/api/lms/snapshot`, {
      headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(lmsStudentFinalResponse.status, 200);
    const lmsStudentFinal = await lmsStudentFinalResponse.json();
    const lmsStudentCourse = lmsStudentFinal.courses.find((course) => course.id === lmsCourse.id);
    assert.ok(lmsStudentCourse, 'Santri can read their published, enrolled course.');
    assert.equal(lmsStudentCourse.categoryId, lmsCategory.id, 'Course-to-category relation is restored in the snapshot.');
    assert.equal(lmsStudentCourse.gradeLevelReferenceId, gradeLevelReferenceId, 'Course-to-grade catalog relation is persisted.');
    assert.ok(lmsStudentCourse.modules.some((module) => module.id === lmsModule.id && module.materials.some((material) => material.id === lmsMaterial.id)),
      'Course, module, and material relationships are returned consistently.');
    assert.ok(lmsStudentFinal.assignments.some((assignment) => assignment.id === lmsAssignment.id && assignment.moduleId === lmsModule.id),
      'The published assignment remains linked to its course module.');
    const lmsStudentProgress = lmsStudentFinal.progress.find((item) => item.materialId === lmsMaterial.id);
    assert.equal(lmsStudentProgress?.positionSeconds, 120, 'Progress cannot move backwards after persistence.');
    assert.ok(lmsStudentProgress?.completedAt, 'Course completion remains persisted after a retry with completed=false.');
    assert.ok(lmsStudentFinal.notes.some((item) => item.id === lmsNote.id && item.materialId === lmsMaterial.id));
    assert.ok(lmsStudentFinal.comments.some((item) => item.materialId === lmsMaterial.id && item.comment === 'Pertanyaan pada materi.'));
    const lmsStudentGradedSubmission = lmsStudentFinal.submissions.find((item) => item.id === lmsSubmission.id);
    assert.equal(lmsStudentGradedSubmission?.assignmentId, lmsAssignment.id);
    assert.equal(Number(lmsStudentGradedSubmission?.score), 85, 'Santri reads the grade persisted by the Ustadz.');
    assert.equal(lmsStudentGradedSubmission?.feedback, lmsGradeInput.feedback);

    const [savedLmsCourse, savedLmsModule, savedLmsMaterial, savedLmsEnrollment, savedLmsSubmission, savedLmsProgress] = await Promise.all([
      admin.from('lms_courses').select('tenant_id,category_id,grade_level_reference_id,instructor_user_id').eq('id', lmsCourse.id).single(),
      admin.from('lms_course_modules').select('tenant_id,course_id').eq('id', lmsModule.id).single(),
      admin.from('lms_materials').select('tenant_id,module_id').eq('id', lmsMaterial.id).single(),
      admin.from('lms_enrollments').select('tenant_id,course_id,student_id,status').eq('id', lmsEnrollment.id).single(),
      admin.from('lms_submissions').select('tenant_id,assignment_id,student_id,score,graded_by').eq('id', lmsSubmission.id).single(),
      admin.from('lms_material_progress').select('tenant_id,student_id,material_id,position_seconds,completed_at').eq('tenant_id', tenantIds[0]).eq('student_id', tahfidzStudentId).eq('material_id', lmsMaterial.id).single(),
    ]);
    assert.equal(savedLmsCourse.data?.tenant_id, tenantIds[0]);
    assert.equal(savedLmsCourse.data?.category_id, lmsCategory.id);
    assert.equal(savedLmsCourse.data?.grade_level_reference_id, gradeLevelReferenceId);
    assert.equal(savedLmsCourse.data?.instructor_user_id, users[3].uid);
    assert.equal(savedLmsModule.data?.course_id, lmsCourse.id);
    assert.equal(savedLmsMaterial.data?.module_id, lmsModule.id);
    assert.equal(savedLmsEnrollment.data?.course_id, lmsCourse.id);
    assert.equal(savedLmsEnrollment.data?.student_id, tahfidzStudentId);
    assert.equal(savedLmsSubmission.data?.assignment_id, lmsAssignment.id);
    assert.equal(savedLmsSubmission.data?.student_id, tahfidzStudentId);
    assert.equal(Number(savedLmsSubmission.data?.score), 85);
    assert.equal(savedLmsSubmission.data?.graded_by, users[3].uid);
    assert.equal(savedLmsProgress.data?.position_seconds, 120);
    assert.ok(savedLmsProgress.data?.completed_at);

    console.log('LMS API round-trip passed: tenant catalog relations, enrollment, student progress/notes/comments, assignment submission, teacher grading, idempotency, payload validation, role restrictions, and tenant isolation.');

    const hrisHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    const hrisSnapshotResponse = await fetch(`${referenceApiBase}/api/hris/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(hrisSnapshotResponse.status, 200, 'A permitted Admin can load the tenant HRIS snapshot.');
    const hrisInitialSnapshot = await hrisSnapshotResponse.json();
    assert.ok(hrisInitialSnapshot.organizationUnits.some((unit) => unit.id === hrisOrganizationUnitId),
      'The HRIS snapshot exposes the tenant-owned organization unit used by employee forms.');
    assert.ok(hrisInitialSnapshot.jobTitleOptions.some((item) => item.id === hrisJobTitleReferenceId),
      'The HRIS snapshot exposes active tenant-owned job-title options.');

    const hrisDeniedSnapshot = await fetch(`${referenceApiBase}/api/hris/snapshot`, {
      headers: { Authorization: `Bearer ${hrisNoPermissionToken}` },
    });
    assert.equal(hrisDeniedSnapshot.status, 403, 'An Admin without HRIS permission cannot read HRIS records.');

    const hrisEmployeeId = randomUUID();
    const hrisEmployeeInput = {
      id: hrisEmployeeId,
      clientRequestId: randomUUID(),
      employeeNumber: '',
      fullName: `Pegawai HRIS Uji ${fixtureSuffix}`,
      jobTitleReferenceId: hrisJobTitleReferenceId,
      organizationUnitId: hrisOrganizationUnitId,
      email: `hris-${fixtureSuffix}@example.test`,
      phone: '081234567890',
      hireDate: '2026-11-01',
      employmentStatus: 'active',
    };
    const hrisEmployeeCreate = await fetch(`${referenceApiBase}/api/hris/employees`, {
      method: 'POST', headers: hrisHeaders,
      body: JSON.stringify({ employee: hrisEmployeeInput }),
    });
    assert.equal(hrisEmployeeCreate.status, 200, 'A permitted Admin can save an employee through the HRIS API.');
    const createdHrisEmployee = await hrisEmployeeCreate.json();
    assert.equal(createdHrisEmployee.id, hrisEmployeeId);
    assert.equal(createdHrisEmployee.employeeNumber, 'PEG-2026-00001', 'The backend assigns the configured tenant employee number.');
    assert.equal(createdHrisEmployee.replayed, false);

    const hrisEmployeeRetry = await fetch(`${referenceApiBase}/api/hris/employees`, {
      method: 'POST', headers: hrisHeaders,
      body: JSON.stringify({ employee: hrisEmployeeInput }),
    });
    assert.equal(hrisEmployeeRetry.status, 200, 'Retrying the same employee mutation succeeds.');
    const retriedHrisEmployee = await hrisEmployeeRetry.json();
    assert.equal(retriedHrisEmployee.id, hrisEmployeeId);
    assert.equal(retriedHrisEmployee.employeeNumber, createdHrisEmployee.employeeNumber);
    assert.equal(retriedHrisEmployee.replayed, true, 'The same client request ID is idempotent.');

    const otherTenantHrisSnapshotResponse = await fetch(`${referenceApiBase}/api/hris/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantHrisSnapshotResponse.status, 200, 'A second tenant with HRIS permission can load its own empty snapshot.');
    const otherTenantHrisSnapshot = await otherTenantHrisSnapshotResponse.json();
    assert.equal(otherTenantHrisSnapshot.employees.length, 0, 'An employee saved in tenant A is not visible in tenant B.');
    assert.equal(otherTenantHrisSnapshot.jobTitleOptions.length, 0, 'Tenant B cannot see tenant A job-title references.');

    const hrisAttendanceInput = {
      employeeId: hrisEmployeeId,
      workDate: '2026-11-06',
      status: 'present',
      checkInAt: '2026-11-06T08:00:00.000Z',
      checkOutAt: '2026-11-06T16:00:00.000Z',
      clientRequestId: randomUUID(),
    };
    const hrisAttendance = await fetch(`${referenceApiBase}/api/hris/attendance`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify(hrisAttendanceInput),
    });
    assert.equal(hrisAttendance.status, 200, 'A permitted Admin can persist employee attendance.');
    const createdHrisAttendance = await hrisAttendance.json();
    assert.equal(createdHrisAttendance.status, 'present');
    const hrisAttendanceRetry = await fetch(`${referenceApiBase}/api/hris/attendance`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify(hrisAttendanceInput),
    });
    assert.equal(hrisAttendanceRetry.status, 200);
    assert.equal((await hrisAttendanceRetry.json()).replayed, true, 'Attendance retries are idempotent.');

    const foreignHrisAttendance = await fetch(`${referenceApiBase}/api/hris/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...hrisAttendanceInput, clientRequestId: randomUUID() }),
    });
    assert.equal(foreignHrisAttendance.status, 404, 'An Admin cannot record attendance against another tenant employee.');

    const hrisLeaveInput = {
      employeeId: hrisEmployeeId,
      leaveType: 'annual',
      startsOn: '2026-11-20',
      endsOn: '2026-11-21',
      reason: 'Cuti sintetis untuk uji alur HRIS.',
      clientRequestId: randomUUID(),
    };
    const hrisLeaveRequest = await fetch(`${referenceApiBase}/api/hris/leave-requests`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify({ leaveRequest: hrisLeaveInput }),
    });
    assert.equal(hrisLeaveRequest.status, 201, 'A permitted Admin can submit an employee leave request.');
    const createdHrisLeave = await hrisLeaveRequest.json();
    assert.equal(createdHrisLeave.status, 'pending');
    const hrisLeaveRetry = await fetch(`${referenceApiBase}/api/hris/leave-requests`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify({ leaveRequest: hrisLeaveInput }),
    });
    assert.equal(hrisLeaveRetry.status, 201);
    assert.equal((await hrisLeaveRetry.json()).replayed, true, 'Leave request retries are idempotent.');

    const hrisLeaveReviewInput = {
      status: 'approved', reviewNote: 'Disetujui untuk uji sintetis.', clientRequestId: randomUUID(),
    };
    const hrisLeaveReview = await fetch(`${referenceApiBase}/api/hris/leave-requests/${encodeURIComponent(createdHrisLeave.id)}/review`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify(hrisLeaveReviewInput),
    });
    assert.equal(hrisLeaveReview.status, 200, 'A permitted Admin can approve a pending leave request.');
    assert.equal((await hrisLeaveReview.json()).status, 'approved');
    const hrisLeaveReviewRetry = await fetch(`${referenceApiBase}/api/hris/leave-requests/${encodeURIComponent(createdHrisLeave.id)}/review`, {
      method: 'POST', headers: hrisHeaders, body: JSON.stringify(hrisLeaveReviewInput),
    });
    assert.equal(hrisLeaveReviewRetry.status, 200);
    assert.equal((await hrisLeaveReviewRetry.json()).replayed, true, 'Leave review retries are idempotent.');

    const hrisFinalSnapshotResponse = await fetch(`${referenceApiBase}/api/hris/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(hrisFinalSnapshotResponse.status, 200);
    const hrisFinalSnapshot = await hrisFinalSnapshotResponse.json();
    const persistedHrisEmployee = hrisFinalSnapshot.employees.find((employee) => employee.id === hrisEmployeeId);
    assert.equal(persistedHrisEmployee?.employeeNumber, 'PEG-2026-00001');
    assert.equal(persistedHrisEmployee?.organizationUnitId, hrisOrganizationUnitId);
    assert.equal(persistedHrisEmployee?.jobTitleReferenceId, hrisJobTitleReferenceId);
    assert.equal(persistedHrisEmployee?.department, `Unit HRIS Uji ${fixtureSuffix}`);
    assert.equal(hrisFinalSnapshot.attendance.find((record) => record.id === createdHrisAttendance.id)?.employeeId, hrisEmployeeId);
    assert.equal(hrisFinalSnapshot.leaveRequests.find((request) => request.id === createdHrisLeave.id)?.status, 'approved');
    console.log('HRIS API round-trip passed: automatic employee number, tenant-owned references, employee persistence, attendance, leave review, idempotency, role permission, and tenant isolation.');

    const financeReferenceUrl = `${referenceApiBase}/api/master-data/references?domain=finance_fee_type`;
    const financeReferenceRead = await fetch(financeReferenceUrl, {
      headers: { Authorization: `Bearer ${referenceFinanceToken}` },
    });
    assert.equal(financeReferenceRead.status, 200,
      'An Admin with Finance access can use its catalog even when Master Data is explicitly denied.');
    assert.ok(Array.isArray((await financeReferenceRead.json()).records));

    const deniedFinanceReferenceRead = await fetch(financeReferenceUrl, {
      headers: { Authorization: `Bearer ${noFinanceAdminToken}` },
    });
    assert.equal(deniedFinanceReferenceRead.status, 403,
      'An Admin without Finance access cannot read the Finance catalog despite having Master Data access.');

    const financeReferenceInput = {
      code: 'FEE_UJI_PERMISSION',
      name: 'Biaya Uji Izin',
      description: 'Kategori sintetis untuk menguji hak kelola modul keuangan.',
      status: 'active',
    };
    const createFinanceReference = await fetch(`${referenceApiBase}/api/master-data/references/finance_fee_type`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${referenceFinanceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: financeReferenceInput }),
    });
    assert.equal(createFinanceReference.status, 201,
      'An Admin with Finance access can create a Finance reference without Master Data access.');
    const createdFinanceReference = (await createFinanceReference.json()).record;
    assert.ok(createdFinanceReference?.id, 'The Finance reference must be persisted and returned with its tenant-owned ID.');

    const deniedFinanceReferenceCreate = await fetch(`${referenceApiBase}/api/master-data/references/finance_fee_type`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noFinanceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...financeReferenceInput, code: 'FEE_UJI_DENIED' } }),
    });
    assert.equal(deniedFinanceReferenceCreate.status, 403,
      'Master Data permission must not let an Admin create a reference owned by a denied module.');

    const updatedFinanceReferenceInput = {
      ...financeReferenceInput,
      code: 'FEE_UJI_PERMISSION_EDIT',
      name: 'Biaya Uji Izin Diperbarui',
      description: 'Kategori sintetis yang diperbarui untuk uji hak modul keuangan.',
    };
    const updateFinanceReference = await fetch(`${referenceApiBase}/api/master-data/references/finance_fee_type/${encodeURIComponent(createdFinanceReference.id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${referenceFinanceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: updatedFinanceReferenceInput }),
    });
    assert.equal(updateFinanceReference.status, 200,
      'The owning Finance Admin can update a Finance reference without Master Data permission.');

    const deniedFinanceReferenceUpdate = await fetch(`${referenceApiBase}/api/master-data/references/finance_fee_type/${encodeURIComponent(createdFinanceReference.id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${noFinanceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: updatedFinanceReferenceInput }),
    });
    assert.equal(deniedFinanceReferenceUpdate.status, 403,
      'Master Data permission must not let an Admin update a reference owned by a denied module.');

    const ustadzReferenceCreate = await fetch(`${referenceApiBase}/api/master-data/references/academic_subject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record: {
          code: 'SUBJECT_UJI_USTADZ',
          name: 'Mata Pelajaran Uji',
          description: 'Kategori sintetis untuk memastikan akun pengajar hanya dapat membaca katalog.',
          status: 'active',
        },
      }),
    });
    assert.equal(ustadzReferenceCreate.status, 403,
      'A Ustadz may read permitted Academic references but cannot mutate tenant catalogs.');


    const communicationCreate = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Pengumuman Uji Integrasi API',
        content: 'Isi pengumuman sintetis untuk menguji penyimpanan dan relasi audiens.',
        target: 'Guru & Musyrif',
        isUrgent: false,
      }),
    });
    assert.equal(communicationCreate.status, 201, 'An authorized Admin can publish a tenant announcement through the application API.');
    const communicationPayload = await communicationCreate.json();
    const createdAnnouncement = communicationPayload.announcement;
    assert.ok(createdAnnouncement?.id, 'The communication API returns the persisted announcement ID.');
    assert.equal(createdAnnouncement.status, 'Sent');
    assert.equal(createdAnnouncement.totalTarget, 1, 'The audience count is resolved from active tenant Ustadz profiles.');

    const { data: communicationRow, error: communicationReadError } = await admin.from('communication_announcements')
      .select('tenant_id,title,target_audience,status,created_by_user_id')
      .eq('id', createdAnnouncement.id)
      .maybeSingle();
    assert.equal(communicationReadError, null, 'The saved communication row must be readable in the local database fixture.');
    assert.equal(communicationRow?.tenant_id, tenantIds[0], 'An announcement is persisted under the actor tenant.');
    assert.equal(communicationRow?.title, 'Pengumuman Uji Integrasi API');
    assert.equal(communicationRow?.target_audience, 'Guru & Musyrif');
    assert.equal(communicationRow?.status, 'sent');
    assert.equal(communicationRow?.created_by_user_id, users[0].uid);

    const ustadzAnnouncementList = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(ustadzAnnouncementList.status, 200, 'An active audience member can read sent announcements.');
    const ustadzAnnouncements = (await ustadzAnnouncementList.json()).announcements;
    const deliveredAnnouncement = ustadzAnnouncements.find((item) => item.id === createdAnnouncement.id);
    assert.ok(deliveredAnnouncement, 'The canonical Guru & Musyrif audience relationship makes the announcement visible to its Ustadz recipient.');
    assert.equal(deliveredAnnouncement.totalTarget, 1);

    const tenantBAnnouncementList = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(tenantBAnnouncementList.status, 200);
    assert.deepEqual((await tenantBAnnouncementList.json()).announcements, [], 'A different tenant cannot read another tenant announcement.');

    const ustadzAnnouncementCreate = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Pengumuman Ditolak',
        content: 'Akun pengajar tidak boleh menerbitkan pengumuman.',
        target: 'Guru & Musyrif',
        isUrgent: false,
      }),
    });
    assert.equal(ustadzAnnouncementCreate.status, 403, 'A Ustadz can receive announcements but cannot publish them.');

    const ustadzAcknowledgement = await fetch(`${referenceApiBase}/api/communication/announcements/${encodeURIComponent(createdAnnouncement.id)}/acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(ustadzAcknowledgement.status, 403, 'Only an eligible Wali account can acknowledge an announcement.');

    const tenantBGuardianAccounts = await admin.from('guardian_user_accounts')
      .select('id')
      .eq('tenant_id', tenantIds[1]);
    assert.equal(tenantBGuardianAccounts.error, null, 'The empty-audience tenant must be queryable in the synthetic fixture.');
    assert.equal(tenantBGuardianAccounts.data?.length, 0, 'Tenant B has no active Guardian account before testing fail-closed announcement delivery.');
    const noRecipientAnnouncement = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianAdminBToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Audiens Kosong',
        content: 'Pengumuman untuk audiens tanpa akun tertaut harus ditolak.',
        target: 'Semua Wali Santri',
        isUrgent: false,
      }),
    });
    assert.equal(noRecipientAnnouncement.status, 409, 'Announcements must fail closed when the selected audience has no active linked account.');

    const academicScheduleInput = {
      clientRequestId: randomUUID(),
      day: 'Senin',
      time: '09:30 - 10:15',
      teacherUserId: users[3].uid,
      classReferenceId: academicClassId,
      subjectReferenceId: academicSubjectId,
      curriculumReferenceId: academicCurriculumId,
    };
    const academicScheduleCreate = await fetch(`${referenceApiBase}/api/academic/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: academicScheduleInput }),
    });
    assert.equal(academicScheduleCreate.status, 201, 'An Academic Admin can create a tenant schedule through the application API.');
    const academicSchedule = await academicScheduleCreate.json();
    assert.ok(academicSchedule.id);
    assert.equal(academicSchedule.alreadyApplied, false);

    const academicScheduleRetry = await fetch(`${referenceApiBase}/api/academic/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: academicScheduleInput }),
    });
    assert.equal(academicScheduleRetry.status, 200, 'Retrying the same Academic schedule request is idempotent.');
    assert.deepEqual(await academicScheduleRetry.json(), { id: academicSchedule.id, alreadyApplied: true });

    const reusedAcademicScheduleKey = await fetch(`${referenceApiBase}/api/academic/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...academicScheduleInput, day: 'Selasa' } }),
    });
    assert.equal(reusedAcademicScheduleKey.status, 409, 'An Academic idempotency key cannot be reused with a different schedule payload.');

    const { data: academicScheduleRow, error: academicScheduleReadError } = await admin.from('academic_records')
      .select('tenant_id,kind,teacher_user_id,class_reference_id,subject_reference_id,curriculum_reference_id')
      .eq('id', academicSchedule.id)
      .maybeSingle();
    assert.equal(academicScheduleReadError, null, 'The Academic schedule row must persist in Supabase.');
    assert.equal(academicScheduleRow?.tenant_id, tenantIds[0]);
    assert.equal(academicScheduleRow?.kind, 'schedule');
    assert.equal(academicScheduleRow?.teacher_user_id, users[3].uid);
    assert.equal(academicScheduleRow?.class_reference_id, academicClassId);
    assert.equal(academicScheduleRow?.subject_reference_id, academicSubjectId);
    assert.equal(academicScheduleRow?.curriculum_reference_id, academicCurriculumId);

    const adminAcademicSchedules = await fetch(`${referenceApiBase}/api/academic/records?kind=schedule`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminAcademicSchedules.status, 200, 'The Admin can read the saved Academic schedule through the API.');
    const adminSchedulePage = await adminAcademicSchedules.json();
    assert.ok(adminSchedulePage.records.some((record) => record.id === academicSchedule.id
      && record.classReferenceId === academicClassId
      && record.subjectReferenceId === academicSubjectId
      && record.curriculumReferenceId === academicCurriculumId),
    'The read response preserves the saved class, subject, and curriculum relationships.');

    const ustadzAcademicSchedules = await fetch(`${referenceApiBase}/api/academic/records?kind=schedule`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(ustadzAcademicSchedules.status, 200, 'The assigned Ustadz can read their own schedule.');
    assert.ok((await ustadzAcademicSchedules.json()).records.some((record) => record.id === academicSchedule.id));

    const foreignAcademicSchedules = await fetch(`${referenceApiBase}/api/academic/records?kind=schedule`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(foreignAcademicSchedules.status, 200);
    assert.deepEqual((await foreignAcademicSchedules.json()).records, [], 'A different tenant cannot read Academic schedules.');

    const deniedUstadzSchedule = await fetch(`${referenceApiBase}/api/academic/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...academicScheduleInput, clientRequestId: randomUUID(), time: '10:30 - 11:15' } }),
    });
    assert.equal(deniedUstadzSchedule.status, 403, 'An Ustadz cannot create or reassign tenant schedules.');

    const academicJournalInput = {
      clientRequestId: randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      classReferenceId: academicClassId,
      subjectReferenceId: academicSubjectId,
      topic: 'Materi uji integrasi tersimpan.',
      competency: 'Santri memahami materi uji.',
      attendancePresent: 1,
      attendanceAbsent: 0,
      attendanceExcused: 0,
    };
    const academicJournalCreate = await fetch(`${referenceApiBase}/api/academic/journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: academicJournalInput }),
    });
    assert.equal(academicJournalCreate.status, 201, 'An Ustadz can save a teaching journal for an assigned class.');
    const academicJournal = await academicJournalCreate.json();
    const { data: academicJournalRow, error: academicJournalReadError } = await admin.from('academic_records')
      .select('tenant_id,kind,teacher_user_id,class_reference_id,subject_reference_id,record_data')
      .eq('id', academicJournal.id)
      .maybeSingle();
    assert.equal(academicJournalReadError, null);
    assert.equal(academicJournalRow?.tenant_id, tenantIds[0]);
    assert.equal(academicJournalRow?.kind, 'journal');
    assert.equal(academicJournalRow?.teacher_user_id, users[3].uid);
    assert.equal(academicJournalRow?.class_reference_id, academicClassId);
    assert.equal(academicJournalRow?.subject_reference_id, academicSubjectId);
    assert.deepEqual(academicJournalRow?.record_data?.attendance, { present: 1, absent: 0, excused: 0 });
    const ustadzAcademicJournals = await fetch(`${referenceApiBase}/api/academic/records?kind=journal`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(ustadzAcademicJournals.status, 200);
    assert.ok((await ustadzAcademicJournals.json()).records.some((record) => record.id === academicJournal.id));

    const academicAssessmentInput = {
      clientRequestId: randomUUID(),
      studentId: tahfidzStudentId,
      teacherUserId: users[3].uid,
      subjectReferenceId: academicSubjectId,
      assessmentTypeReferenceId: academicAssessmentTypeId,
      score: 88,
      category: 'Summative',
    };
    const academicAssessmentCreate = await fetch(`${referenceApiBase}/api/academic/assessment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: academicAssessmentInput }),
    });
    assert.equal(academicAssessmentCreate.status, 201, 'An Academic Admin can create a student assessment through the application API.');
    const academicAssessment = await academicAssessmentCreate.json();
    const academicAssessmentRetry = await fetch(`${referenceApiBase}/api/academic/assessment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: academicAssessmentInput }),
    });
    assert.equal(academicAssessmentRetry.status, 200, 'Retrying an identical assessment does not create a duplicate.');
    assert.deepEqual(await academicAssessmentRetry.json(), { id: academicAssessment.id, alreadyApplied: true });

    const { data: academicAssessmentRow, error: academicAssessmentReadError } = await admin.from('academic_records')
      .select('tenant_id,kind,student_id,teacher_user_id,class_reference_id,subject_reference_id,assessment_type_reference_id,record_data')
      .eq('id', academicAssessment.id)
      .maybeSingle();
    assert.equal(academicAssessmentReadError, null);
    assert.equal(academicAssessmentRow?.tenant_id, tenantIds[0]);
    assert.equal(academicAssessmentRow?.kind, 'assessment');
    assert.equal(academicAssessmentRow?.student_id, tahfidzStudentId);
    assert.equal(academicAssessmentRow?.teacher_user_id, users[3].uid);
    assert.equal(academicAssessmentRow?.class_reference_id, academicClassId);
    assert.equal(academicAssessmentRow?.subject_reference_id, academicSubjectId);
    assert.equal(academicAssessmentRow?.assessment_type_reference_id, academicAssessmentTypeId);

    const studentAcademicPortal = await fetch(`${referenceApiBase}/api/academic/portal`, {
      headers: { Authorization: `Bearer ${santriToken}` },
    });
    assert.equal(studentAcademicPortal.status, 200, 'A linked Santri can read their academic portal after the Admin saves an assessment.');
    const studentAcademicPortalPayload = await studentAcademicPortal.json();
    assert.equal(studentAcademicPortalPayload.selectedStudentId, tahfidzStudentId);
    assert.ok(studentAcademicPortalPayload.assessments.some((assessment) => assessment.id === academicAssessment.id
      && assessment.subject === academicReferenceRows.find((reference) => reference.domain === 'academic_subject').name
      && assessment.score === 88), 'The portal read-back resolves the saved score through the linked Santri relationship.');

    const unlinkedAcademicPortal = await fetch(`${referenceApiBase}/api/academic/portal`, {
      headers: { Authorization: `Bearer ${await signIn(anon, academicUnlinkedSantri)}` },
    });
    assert.equal(unlinkedAcademicPortal.status, 403, 'A Santri without a tenant student link cannot read another student assessment.');

    const foreignAcademicAssessment = await fetch(`${referenceApiBase}/api/academic/assessment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...academicAssessmentInput, clientRequestId: randomUUID() } }),
    });
    assert.equal(foreignAcademicAssessment.status, 400, 'A different tenant cannot create an assessment by supplying a foreign student or reference ID.');

    const santriAcademicWrite = await fetch(`${referenceApiBase}/api/academic/assessment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${santriToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: { ...academicAssessmentInput, clientRequestId: randomUUID() } }),
    });
    assert.equal(santriAcademicWrite.status, 403, 'A Santri cannot write academic assessments through the management API.');


    const halaqahPayload = {
      name: `Halaqah API ${fixtureSuffix}`,
      ustadzUserId: users[3].uid,
      schedule: 'Senin 08.00',
      room: 'Ruang Uji API',
      dailyTargetPages: 1,
      status: 'active',
      clientRequestId: randomUUID(),
    };
    const halaqahCreate = await fetch(`${referenceApiBase}/api/tahfidz/halaqahs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ halaqah: halaqahPayload }),
    });
    assert.equal(halaqahCreate.status, 201, 'An authorized Admin can create a halaqah through the application API.');
    const halaqah = await halaqahCreate.json();
    assert.equal(halaqah.success, true);
    assert.ok(halaqah.halaqahId);

    const halaqahRetry = await fetch(`${referenceApiBase}/api/tahfidz/halaqahs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ halaqah: halaqahPayload }),
    });
    assert.equal(halaqahRetry.status, 200, 'An identical halaqah request is idempotent.');
    assert.equal((await halaqahRetry.json()).halaqahId, halaqah.halaqahId);

    const { data: halaqahRow, error: halaqahReadError } = await admin.from('tahfidz_halaqahs')
      .select('tenant_id,ustadz_user_id,status')
      .eq('id', halaqah.halaqahId)
      .maybeSingle();
    assert.equal(halaqahReadError, null);
    assert.equal(halaqahRow?.tenant_id, tenantIds[0]);
    assert.equal(halaqahRow?.ustadz_user_id, users[3].uid, 'The assigned Ustadz relationship is persisted.');

    const membershipPayload = {
      studentId: tahfidzStudentId,
      halaqahId: halaqah.halaqahId,
      startsOn: new Date().toISOString().slice(0, 10),
      clientRequestId: randomUUID(),
    };
    const membershipCreate = await fetch(`${referenceApiBase}/api/tahfidz/memberships`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership: membershipPayload }),
    });
    assert.equal(membershipCreate.status, 201, 'An authorized Admin can assign a student to a halaqah through the API.');
    const membership = await membershipCreate.json();
    assert.equal(membership.success, true);
    assert.equal(membership.alreadyApplied, false);

    const membershipRetry = await fetch(`${referenceApiBase}/api/tahfidz/memberships`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership: membershipPayload }),
    });
    assert.equal(membershipRetry.status, 200, 'An identical membership request is idempotent.');
    assert.equal((await membershipRetry.json()).membershipId, membership.membershipId);

    const { data: membershipRow, error: membershipReadError } = await admin.from('tahfidz_memberships')
      .select('tenant_id,student_id,halaqah_id,status')
      .eq('id', membership.membershipId)
      .maybeSingle();
    assert.equal(membershipReadError, null);
    assert.equal(membershipRow?.tenant_id, tenantIds[0]);
    assert.equal(membershipRow?.student_id, tahfidzStudentId);
    assert.equal(membershipRow?.halaqah_id, halaqah.halaqahId);
    assert.equal(membershipRow?.status, 'active');

    const setoranPayload = {
      studentId: tahfidzStudentId,
      halaqahId: halaqah.halaqahId,
      activityType: 'Ziyadah',
      surahName: 'Al-Baqarah',
      ayahRange: '1-5',
      fluencyGrade: 'A',
      tajweedGrade: 'A',
      notes: 'Catatan sintetis uji integrasi API.',
      performedAt: new Date().toISOString(),
      clientRequestId: randomUUID(),
    };
    const setoranCreate = await fetch(`${referenceApiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: setoranPayload }),
    });
    assert.equal(setoranCreate.status, 201, 'The assigned Ustadz can record setoran through the application API.');
    assert.equal((await setoranCreate.json()).alreadyRecorded, false);

    const setoranRetry = await fetch(`${referenceApiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: setoranPayload }),
    });
    assert.equal(setoranRetry.status, 200, 'An identical setoran request does not create a duplicate.');
    assert.equal((await setoranRetry.json()).alreadyRecorded, true);

    const { data: setoranRows, error: setoranReadError } = await admin.from('tahfidz_records')
      .select('tenant_id,student_id,halaqah_id,recorded_by_user_id,client_request_id')
      .eq('tenant_id', tenantIds[0])
      .eq('client_request_id', setoranPayload.clientRequestId);
    assert.equal(setoranReadError, null);
    assert.equal(setoranRows?.length, 1, 'The idempotent setoran is stored exactly once.');
    assert.equal(setoranRows[0].student_id, tahfidzStudentId);
    assert.equal(setoranRows[0].halaqah_id, halaqah.halaqahId);
    assert.equal(setoranRows[0].recorded_by_user_id, users[3].uid);

    const ustadzRecordsResponse = await fetch(`${referenceApiBase}/api/tahfidz/records`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(ustadzRecordsResponse.status, 200, 'The assigned Ustadz can read halaqah setoran through the API.');
    const ustadzRecords = (await ustadzRecordsResponse.json()).records;
    assert.ok(ustadzRecords.some((record) => record.studentId === tahfidzStudentId && record.halaqahId === halaqah.halaqahId),
      'The read response includes the record linked to its student and halaqah.');

    const tenantBTahfidzResponse = await fetch(`${referenceApiBase}/api/tahfidz/records`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(tenantBTahfidzResponse.status, 200);
    assert.deepEqual((await tenantBTahfidzResponse.json()).records, [], 'A different tenant cannot read Tahfidz records.');

    const santriRecordWrite = await fetch(`${referenceApiBase}/api/tahfidz/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${santriToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: setoranPayload }),
    });
    assert.equal(santriRecordWrite.status, 403, 'A Santri cannot create setoran even when granted module read access.');

    const laundryDeniedRole = await fetch(`${referenceApiBase}/api/laundry/snapshot`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(laundryDeniedRole.status, 403, 'Laundry management is restricted to an authorized tenant Admin.');

    const laundryEmptyResponse = await fetch(`${referenceApiBase}/api/laundry/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(laundryEmptyResponse.status, 200, 'An authorized Admin can read the initial Laundry snapshot.');
    const laundryEmpty = await laundryEmptyResponse.json();
    assert.deepEqual(laundryEmpty.orders, [], 'A new tenant begins without Laundry orders.');
    assert.equal(laundryEmpty.settings.monthlyQuotaKg, 20, 'Laundry starts with the documented tenant default quota.');
    assert.ok(laundryEmpty.students.some((student) => student.id === tahfidzStudentId), 'Laundry resolves its roster from the same-tenant student records.');

    const laundrySettingsInput = {
      monthlyQuotaKg: 2,
      excessRatePerKg: 5000,
      clientRequestId: randomUUID(),
    };
    const laundrySettingsSave = await fetch(`${referenceApiBase}/api/laundry/settings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundrySettingsInput),
    });
    assert.equal(laundrySettingsSave.status, 200, 'An authorized Admin can save tenant Laundry quota settings.');
    assert.equal((await laundrySettingsSave.json()).replayed, false);
    const laundrySettingsRetry = await fetch(`${referenceApiBase}/api/laundry/settings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundrySettingsInput),
    });
    assert.equal(laundrySettingsRetry.status, 200);
    assert.equal((await laundrySettingsRetry.json()).replayed, true, 'A repeated settings request is idempotent.');

    const laundryOrderInput = {
      studentId: tahfidzStudentId,
      weightKg: 3.25,
      pieces: 4,
      clientRequestId: randomUUID(),
    };
    const laundryOrderCreate = await fetch(`${referenceApiBase}/api/laundry/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundryOrderInput),
    });
    assert.equal(laundryOrderCreate.status, 201, 'An authorized Admin can create a Laundry order linked to a student.');
    const createdLaundryOrder = await laundryOrderCreate.json();
    assert.ok(createdLaundryOrder.id && createdLaundryOrder.orderNumber);
    assert.equal(createdLaundryOrder.replayed, false);
    const laundryOrderRetry = await fetch(`${referenceApiBase}/api/laundry/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundryOrderInput),
    });
    assert.equal(laundryOrderRetry.status, 200, 'An identical Laundry order request replays the prior outcome.');
    assert.equal((await laundryOrderRetry.json()).id, createdLaundryOrder.id, 'Laundry order retry does not create a duplicate.');

    const savedLaundryOrder = await admin.from('laundry_orders')
      .select('tenant_id,student_id,order_number,weight_kg,pieces,status')
      .eq('id', createdLaundryOrder.id)
      .single();
    assert.equal(savedLaundryOrder.error, null);
    assert.equal(savedLaundryOrder.data?.tenant_id, tenantIds[0]);
    assert.equal(savedLaundryOrder.data?.student_id, tahfidzStudentId, 'The persisted order keeps its same-tenant student relation.');
    assert.equal(savedLaundryOrder.data?.order_number, createdLaundryOrder.orderNumber);

    const laundryAfterCreateResponse = await fetch(`${referenceApiBase}/api/laundry/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(laundryAfterCreateResponse.status, 200);
    const laundryAfterCreate = await laundryAfterCreateResponse.json();
    const laundryOrderInSnapshot = laundryAfterCreate.orders.find((order) => order.id === createdLaundryOrder.id);
    assert.ok(laundryOrderInSnapshot, 'The order is readable through the tenant API after it is saved.');
    assert.equal(laundryOrderInSnapshot.studentId, tahfidzStudentId);
    assert.equal(laundryOrderInSnapshot.student, 'Santri Uji Tahfidz API');
    const laundryQuota = laundryAfterCreate.quotas.find((quota) => quota.id === tahfidzStudentId);
    assert.equal(laundryQuota.usedKg, 3.25);
    assert.equal(laundryQuota.remainingKg, 0);
    assert.equal(laundryQuota.excessKg, 1.25);
    assert.equal(laundryQuota.estimatedCharge, 6250, 'Quota charge uses the saved rate and same-month order weight.');

    const invalidLaundryTransition = await fetch(`${referenceApiBase}/api/laundry/orders/${encodeURIComponent(createdLaundryOrder.id)}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'collected', clientRequestId: randomUUID() }),
    });
    assert.equal(invalidLaundryTransition.status, 409, 'Laundry rejects an invalid status jump.');

    const laundryTransitionInput = { status: 'washing', clientRequestId: randomUUID() };
    const laundryTransition = await fetch(`${referenceApiBase}/api/laundry/orders/${encodeURIComponent(createdLaundryOrder.id)}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundryTransitionInput),
    });
    assert.equal(laundryTransition.status, 200);
    assert.equal((await laundryTransition.json()).status, 'washing');
    const laundryTransitionRetry = await fetch(`${referenceApiBase}/api/laundry/orders/${encodeURIComponent(createdLaundryOrder.id)}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(laundryTransitionInput),
    });
    assert.equal(laundryTransitionRetry.status, 200);
    assert.equal((await laundryTransitionRetry.json()).replayed, true, 'A repeated status request does not append a second transition.');

    const laundryTenantBResponse = await fetch(`${referenceApiBase}/api/laundry/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(laundryTenantBResponse.status, 200);
    assert.deepEqual((await laundryTenantBResponse.json()).orders, [], 'Laundry snapshots do not expose another tenant\'s orders.');
    const laundryCrossTenantTransition = await fetch(`${referenceApiBase}/api/laundry/orders/${encodeURIComponent(createdLaundryOrder.id)}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready', clientRequestId: randomUUID() }),
    });
    assert.equal(laundryCrossTenantTransition.status, 404, 'A different tenant cannot transition an order by guessing its ID.');

    const donationSnapshotUrl = referenceApiBase + '/api/donation/snapshot';
    const donationUstadz = await fetch(donationSnapshotUrl, { headers: { Authorization: 'Bearer ' + ustadzToken } });
    assert.equal(donationUstadz.status, 403, 'Ustadz without Donation permission is denied.');
    const donationLimitedAdmin = await fetch(donationSnapshotUrl, { headers: { Authorization: 'Bearer ' + donationNoPermissionToken } });
    assert.equal(donationLimitedAdmin.status, 403, 'Admin without Donation permission is denied.');
    const donationInitialResponse = await fetch(donationSnapshotUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(donationInitialResponse.status, 200);
    const donationInitial = await donationInitialResponse.json();
    assert.deepEqual(donationInitial.campaigns, []);
    assert.deepEqual(donationInitial.donors, []);
    assert.deepEqual(donationInitial.donations, []);
    assert.deepEqual(donationInitial.waqfAssets, []);

    const donationCampaignInput = {
      action: 'create',
      title: 'Kampanye Uji ' + fixtureSuffix,
      fundType: 'infaq',
      description: 'Kampanye sintetis API.',
      targetAmount: 1000000,
      endDate: null,
      status: 'active',
      clientRequestId: randomUUID(),
    };
    const donationCampaignResponse = await fetch(referenceApiBase + '/api/donation/campaigns', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationCampaignInput),
    });
    assert.equal(donationCampaignResponse.status, 201);
    const donationCampaign = await donationCampaignResponse.json();
    assert.equal(donationCampaign.replayed, false);
    const donationCampaignRetry = await fetch(referenceApiBase + '/api/donation/campaigns', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationCampaignInput),
    });
    assert.equal(donationCampaignRetry.status, 201);
    assert.equal((await donationCampaignRetry.json()).id, donationCampaign.id);

    const donationDonorInput = {
      action: 'create',
      fullName: 'Donatur Uji ' + fixtureSuffix,
      donorType: 'community',
      email: 'donatur-' + fixtureSuffix + '@example.test',
      phone: '081234567890',
      notes: 'Fixture sintetis.',
      status: 'active',
      clientRequestId: randomUUID(),
    };
    const donationDonorResponse = await fetch(referenceApiBase + '/api/donation/donors', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationDonorInput),
    });
    assert.equal(donationDonorResponse.status, 201);
    const donationDonor = await donationDonorResponse.json();

    const waqfAssetInput = {
      action: 'create',
      assetCode: 'WAKAF-' + fixtureSuffix,
      name: 'Aset Wakaf Uji ' + fixtureSuffix,
      assetType: 'building',
      location: 'Komplek uji',
      estimatedValue: 50000000,
      conditionLabel: 'Baik',
      wakifName: 'Wakif Uji',
      acquiredOn: new Date().toISOString().slice(0, 10),
      status: 'active',
      notes: 'Fixture sintetis.',
      clientRequestId: randomUUID(),
    };
    const waqfAssetResponse = await fetch(referenceApiBase + '/api/donation/waqf-assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(waqfAssetInput),
    });
    assert.equal(waqfAssetResponse.status, 201);
    const waqfAsset = await waqfAssetResponse.json();

    const donationTransactionInput = {
      donorId: donationDonor.id,
      campaignId: donationCampaign.id,
      donorName: 'Nama harus berasal dari relasi donatur',
      amount: 250000,
      fundType: 'other',
      paymentMethod: 'bank_transfer',
      receivedAt: new Date().toISOString(),
      referenceNote: 'Uji relasi dan simpan-baca.',
      clientRequestId: randomUUID(),
    };
    const donationTransactionResponse = await fetch(referenceApiBase + '/api/donation/transactions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationTransactionInput),
    });
    assert.equal(donationTransactionResponse.status, 201);
    const donationTransaction = await donationTransactionResponse.json();
    assert.match(donationTransaction.receiptNumber, /^DON\/\d{4}\/\d{7}$/, 'The transaction receives a tenant-series donation receipt number.');
    const donationTransactionRetry = await fetch(referenceApiBase + '/api/donation/transactions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationTransactionInput),
    });
    assert.equal(donationTransactionRetry.status, 201);
    assert.equal((await donationTransactionRetry.json()).id, donationTransaction.id);

    const [savedDonation, savedWaqfAsset] = await Promise.all([
      admin.from('donations').select('tenant_id,donor_id,campaign_id,donor_name_snapshot,amount,fund_type,status').eq('id', donationTransaction.id).single(),
      admin.from('waqf_assets').select('tenant_id,name').eq('id', waqfAsset.id).single(),
    ]);
    assert.equal(savedDonation.error, null);
    assert.equal(savedDonation.data?.tenant_id, tenantIds[0]);
    assert.equal(savedDonation.data?.donor_id, donationDonor.id);
    assert.equal(savedDonation.data?.campaign_id, donationCampaign.id);
    assert.equal(savedDonation.data?.donor_name_snapshot, donationDonorInput.fullName);
    assert.equal(Number(savedDonation.data?.amount), 250000);
    assert.equal(savedDonation.data?.fund_type, 'infaq');
    assert.equal(savedDonation.data?.status, 'confirmed');
    assert.equal(savedWaqfAsset.error, null);
    assert.equal(savedWaqfAsset.data?.tenant_id, tenantIds[0]);

    const donationReadbackResponse = await fetch(donationSnapshotUrl, {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(donationReadbackResponse.status, 200);
    const donationReadback = await donationReadbackResponse.json();
    assert.equal(donationReadback.campaigns.find((item) => item.id === donationCampaign.id)?.current, 250000);
    assert.equal(donationReadback.donors.find((item) => item.id === donationDonor.id)?.lifetime, 250000);
    assert.equal(donationReadback.donations.find((item) => item.id === donationTransaction.id)?.campaignTitle, donationCampaignInput.title);
    assert.equal(donationReadback.summary.totalConfirmed, 250000);
    assert.equal(donationReadback.summary.waqfAssetValue, 50000000);

    const tenantBDonationResponse = await fetch(donationSnapshotUrl, {
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken },
    });
    assert.equal(tenantBDonationResponse.status, 200);
    const tenantBDonation = await tenantBDonationResponse.json();
    assert.deepEqual(tenantBDonation.campaigns, []);
    assert.deepEqual(tenantBDonation.donors, []);
    assert.deepEqual(tenantBDonation.donations, []);
    assert.deepEqual(tenantBDonation.waqfAssets, []);

    const donationVoidUrl = referenceApiBase + '/api/donation/transactions/' + encodeURIComponent(donationTransaction.id) + '/void';
    const donationVoidInput = { reason: 'Pembatalan uji sintetis.', clientRequestId: randomUUID() };
    const donationVoidResponse = await fetch(donationVoidUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationVoidInput),
    });
    assert.equal(donationVoidResponse.status, 200);
    const donationVoidRetry = await fetch(donationVoidUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(donationVoidInput),
    });
    assert.equal(donationVoidRetry.status, 200);
    assert.equal((await donationVoidRetry.json()).replayed, true);
    const crossTenantDonationVoid = await fetch(donationVoidUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Tenant berbeda uji.', clientRequestId: randomUUID() }),
    });
    assert.equal(crossTenantDonationVoid.status, 404);
    const documentListUrl = referenceApiBase + '/api/documents';
    const ustadzDocumentResponse = await fetch(documentListUrl, { headers: { Authorization: 'Bearer ' + ustadzToken } });
    assert.equal(ustadzDocumentResponse.status, 403, 'Ustadz without document role access is denied.');
    const limitedDocumentResponse = await fetch(documentListUrl, { headers: { Authorization: 'Bearer ' + documentNoPermissionToken } });
    assert.equal(limitedDocumentResponse.status, 403, 'Admin without Document permission is denied.');
    const documentInitialResponse = await fetch(documentListUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(documentInitialResponse.status, 200);
    const documentInitial = await documentInitialResponse.json();
    assert.deepEqual(documentInitial.documents, []);

    const documentDraft = {
      clientRequestId: randomUUID(),
      direction: 'outgoing',
      subject: 'Surat uji API ' + fixtureSuffix,
      senderName: 'Administrasi Pesantren',
      recipientName: 'Mitra Uji',
      documentDate: new Date().toISOString().slice(0, 10),
      summary: 'Dokumen sintetis untuk verifikasi API dan relasi tenant.',
    };
    const documentCreateResponse = await fetch(documentListUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: documentDraft }),
    });
    assert.equal(documentCreateResponse.status, 201);
    const createdDocument = await documentCreateResponse.json();
    assert.equal(createdDocument.alreadyApplied, false);
    assert.match(createdDocument.documentId, /^[0-9a-f-]{36}$/i);

    const documentCreateRetry = await fetch(documentListUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: documentDraft }),
    });
    assert.equal(documentCreateRetry.status, 200);
    const replayedDocument = await documentCreateRetry.json();
    assert.equal(replayedDocument.documentId, createdDocument.documentId);
    assert.equal(replayedDocument.alreadyApplied, true);

    const documentFilteredResponse = await fetch(
      documentListUrl + '?direction=outgoing&statusGroup=approval&search=' + encodeURIComponent(documentDraft.subject),
      { headers: { Authorization: 'Bearer ' + adminToken } },
    );
    assert.equal(documentFilteredResponse.status, 200);
    const documentFiltered = await documentFilteredResponse.json();
    const listedDocument = documentFiltered.documents.find((item) => item.id === createdDocument.documentId);
    assert.ok(listedDocument, 'Filtered read returns the saved document.');
    assert.match(listedDocument.documentNumber, /^DOC\/\d{4}\/\d{5}$/);
    assert.equal(listedDocument.subject, documentDraft.subject);
    assert.equal(listedDocument.direction, 'outgoing');
    assert.equal(listedDocument.status, 'registered');
    assert.deepEqual(listedDocument.attachments, []);

    const savedDocument = await admin.from('document_records')
      .select('tenant_id,created_by_user_id,document_number,direction,subject,status')
      .eq('id', createdDocument.documentId).single();
    assert.equal(savedDocument.error, null);
    assert.equal(savedDocument.data?.tenant_id, tenantIds[0]);
    assert.equal(savedDocument.data?.created_by_user_id, users[0].uid);
    assert.equal(savedDocument.data?.document_number, listedDocument.documentNumber);
    assert.equal(savedDocument.data?.subject, documentDraft.subject);

    const invalidDocumentFilter = await fetch(documentListUrl + '?direction=invalid', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(invalidDocumentFilter.status, 400, 'Invalid document filters are rejected.');

    const documentStatusUrl = documentListUrl + '/' + encodeURIComponent(createdDocument.documentId) + '/status';
    const invalidDocumentTransition = await fetch(documentStatusUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', note: 'Harus ditolak dari status terdaftar.' }),
    });
    assert.equal(invalidDocumentTransition.status, 409, 'An invalid document workflow transition is rejected.');

    const documentTransitionResponse = await fetch(documentStatusUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review', note: 'Pemeriksaan administrasi dimulai.' }),
    });
    assert.equal(documentTransitionResponse.status, 201);
    const transitionedDocument = await documentTransitionResponse.json();
    assert.equal(transitionedDocument.status, 'in_review');
    assert.equal(transitionedDocument.alreadyApplied, false);

    const documentTransitionRetry = await fetch(documentStatusUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review', note: 'Diabaikan pada retry status identik.' }),
    });
    assert.equal(documentTransitionRetry.status, 200);
    assert.equal((await documentTransitionRetry.json()).alreadyApplied, true);

    const savedDocumentAfterTransition = await admin.from('document_records')
      .select('tenant_id,status').eq('id', createdDocument.documentId).single();
    assert.equal(savedDocumentAfterTransition.error, null);
    assert.equal(savedDocumentAfterTransition.data?.status, 'in_review');
    const documentEvents = await admin.from('document_workflow_events')
      .select('event_type,previous_status,next_status').eq('document_id', createdDocument.documentId);
    assert.equal(documentEvents.error, null);
    assert.equal(documentEvents.data?.length, 2);
    assert.ok(documentEvents.data?.some((event) => event.event_type === 'registered' && event.next_status === 'registered'));
    assert.ok(documentEvents.data?.some((event) => event.event_type === 'status_changed' && event.previous_status === 'registered' && event.next_status === 'in_review'));

    const tenantBDocumentsResponse = await fetch(documentListUrl, {
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken },
    });
    assert.equal(tenantBDocumentsResponse.status, 200);
    assert.deepEqual((await tenantBDocumentsResponse.json()).documents, []);
    const crossTenantDocumentTransition = await fetch(documentStatusUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived', note: 'Percobaan tenant lain.' }),
    });
    assert.equal(crossTenantDocumentTransition.status, 404, 'A different tenant cannot transition a document by guessing its ID.');

    console.log('Document API round-trip passed: registration, generated number, filtered readback, workflow audit, idempotency, role denial, tenant isolation, and transition validation.');
    const healthcareSnapshotUrl = referenceApiBase + '/api/healthcare/snapshot';
    const ustadzHealthcareResponse = await fetch(healthcareSnapshotUrl, { headers: { Authorization: 'Bearer ' + ustadzToken } });
    assert.equal(ustadzHealthcareResponse.status, 403, 'Ustadz without healthcare role access is denied.');
    const limitedHealthcareResponse = await fetch(healthcareSnapshotUrl, { headers: { Authorization: 'Bearer ' + healthcareNoPermissionToken } });
    assert.equal(limitedHealthcareResponse.status, 403, 'Admin without Healthcare permission is denied.');
    const healthcareInitialResponse = await fetch(healthcareSnapshotUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(healthcareInitialResponse.status, 200);
    const healthcareInitial = await healthcareInitialResponse.json();
    assert.ok(healthcareInitial.students.some((student) => student.id === tahfidzStudentId), 'The UKS roster resolves the tenant student.');
    assert.deepEqual(healthcareInitial.records, []);
    assert.deepEqual(healthcareInitial.visits, []);
    assert.deepEqual(healthcareInitial.medicines, []);
    assert.deepEqual(healthcareInitial.movements, []);
    const medicineCategory = healthcareInitial.medicineCategories.find((item) => item.code === 'ANALGESIK_ANTIPIRETIK');
    const medicineUnit = healthcareInitial.medicineUnits.find((item) => item.code === 'TABLET');
    assert.ok(medicineCategory?.id, 'Tenant medicine category is available from the reference catalog.');
    assert.ok(medicineUnit?.id, 'Tenant medicine unit is available from the reference catalog.');
    const healthcareDate = new Date().toISOString().slice(0, 10);

    const healthcareRecordInput = {
      studentId: tahfidzStudentId,
      bloodType: 'O',
      heightCm: 143,
      weightKg: 38,
      allergies: 'Tidak ada',
      chronicConditions: '',
      lastCheck: healthcareDate,
    };
    const healthcareRecordResponse = await fetch(referenceApiBase + '/api/healthcare/records', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareRecordInput),
    });
    assert.equal(healthcareRecordResponse.status, 201);
    const healthcareRecord = await healthcareRecordResponse.json();
    assert.match(healthcareRecord.id, /^[0-9a-f-]{36}$/i);

    const healthcareVisitInput = {
      studentId: tahfidzStudentId,
      visitDate: healthcareDate,
      visitTime: '08:30',
      complaint: 'Demam ringan dalam pemeriksaan sintetis.',
      temperatureC: 37.7,
      diagnosis: 'Observasi kesehatan.',
      actionTaken: 'Istirahat dan pemantauan.',
      status: 'monitoring',
      clientRequestId: randomUUID(),
    };
    const healthcareVisitResponse = await fetch(referenceApiBase + '/api/healthcare/visits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareVisitInput),
    });
    assert.equal(healthcareVisitResponse.status, 201);
    const healthcareVisit = await healthcareVisitResponse.json();
    assert.equal(healthcareVisit.alreadyApplied, false);
    const healthcareVisitRetry = await fetch(referenceApiBase + '/api/healthcare/visits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareVisitInput),
    });
    assert.equal(healthcareVisitRetry.status, 201);
    const replayedHealthcareVisit = await healthcareVisitRetry.json();
    assert.equal(replayedHealthcareVisit.id, healthcareVisit.id);
    assert.equal(replayedHealthcareVisit.alreadyApplied, true);

    const healthcareMedicineInput = {
      name: 'Obat Uji ' + fixtureSuffix,
      categoryReferenceId: medicineCategory.id,
      unitReferenceId: medicineUnit.id,
      initialStock: 20,
      minStock: 5,
      expiresOn: healthcareDate,
      clientRequestId: randomUUID(),
    };
    const healthcareMedicineResponse = await fetch(referenceApiBase + '/api/healthcare/medicines', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareMedicineInput),
    });
    assert.equal(healthcareMedicineResponse.status, 201);
    const healthcareMedicine = await healthcareMedicineResponse.json();
    assert.equal(healthcareMedicine.alreadyApplied, false);
    const healthcareMedicineRetry = await fetch(referenceApiBase + '/api/healthcare/medicines', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareMedicineInput),
    });
    assert.equal(healthcareMedicineRetry.status, 201);
    const replayedHealthcareMedicine = await healthcareMedicineRetry.json();
    assert.equal(replayedHealthcareMedicine.id, healthcareMedicine.id);
    assert.equal(replayedHealthcareMedicine.alreadyApplied, true);

    const healthcareStockInput = {
      medicineId: healthcareMedicine.id,
      delta: -2,
      reason: 'Pengeluaran sintetis untuk uji pencatatan.',
      requestId: randomUUID(),
    };
    const healthcareStockResponse = await fetch(referenceApiBase + '/api/healthcare/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareStockInput),
    });
    assert.equal(healthcareStockResponse.status, 201);
    const healthcareStock = await healthcareStockResponse.json();
    assert.equal(healthcareStock.alreadyApplied, false);
    const healthcareStockRetry = await fetch(referenceApiBase + '/api/healthcare/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(healthcareStockInput),
    });
    assert.equal(healthcareStockRetry.status, 201);
    const replayedHealthcareStock = await healthcareStockRetry.json();
    assert.equal(replayedHealthcareStock.id, healthcareStock.id);
    assert.equal(replayedHealthcareStock.alreadyApplied, true);

    const [savedHealthcareRecord, savedHealthcareVisit, savedHealthcareMedicine, savedHealthcareMovements] = await Promise.all([
      admin.from('healthcare_records').select('tenant_id,student_id,blood_type,height_cm,weight_kg').eq('id', healthcareRecord.id).single(),
      admin.from('healthcare_visits').select('tenant_id,student_id,complaint,status').eq('id', healthcareVisit.id).single(),
      admin.from('healthcare_medicines').select('tenant_id,category_reference_id,unit_reference_id,stock_quantity,min_stock').eq('id', healthcareMedicine.id).single(),
      admin.from('healthcare_stock_movements').select('tenant_id,medicine_id,quantity_delta,reason').eq('medicine_id', healthcareMedicine.id),
    ]);
    assert.equal(savedHealthcareRecord.error, null);
    assert.equal(savedHealthcareRecord.data?.tenant_id, tenantIds[0]);
    assert.equal(savedHealthcareRecord.data?.student_id, tahfidzStudentId);
    assert.equal(savedHealthcareRecord.data?.blood_type, 'O');
    assert.equal(Number(savedHealthcareRecord.data?.height_cm), 143);
    assert.equal(Number(savedHealthcareRecord.data?.weight_kg), 38);
    assert.equal(savedHealthcareVisit.error, null);
    assert.equal(savedHealthcareVisit.data?.tenant_id, tenantIds[0]);
    assert.equal(savedHealthcareVisit.data?.student_id, tahfidzStudentId);
    assert.equal(savedHealthcareVisit.data?.status, 'monitoring');
    assert.equal(savedHealthcareMedicine.error, null);
    assert.equal(savedHealthcareMedicine.data?.tenant_id, tenantIds[0]);
    assert.equal(savedHealthcareMedicine.data?.category_reference_id, medicineCategory.id);
    assert.equal(savedHealthcareMedicine.data?.unit_reference_id, medicineUnit.id);
    assert.equal(Number(savedHealthcareMedicine.data?.stock_quantity), 18);
    assert.equal(savedHealthcareMedicine.data?.min_stock, 5);
    assert.equal(savedHealthcareMovements.error, null);
    assert.equal(savedHealthcareMovements.data?.length, 2);
    assert.deepEqual(savedHealthcareMovements.data?.map((movement) => movement.quantity_delta).sort((a, b) => a - b), [-2, 20]);

    const healthcareReadbackResponse = await fetch(healthcareSnapshotUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(healthcareReadbackResponse.status, 200);
    const healthcareReadback = await healthcareReadbackResponse.json();
    assert.equal(healthcareReadback.records.find((item) => item.id === healthcareRecord.id)?.student?.id, tahfidzStudentId);
    assert.equal(healthcareReadback.visits.find((item) => item.id === healthcareVisit.id)?.student?.id, tahfidzStudentId);
    const readbackMedicine = healthcareReadback.medicines.find((item) => item.id === healthcareMedicine.id);
    assert.equal(readbackMedicine?.category_reference_id, medicineCategory.id);
    assert.equal(readbackMedicine?.unit_reference_id, medicineUnit.id);
    assert.equal(readbackMedicine?.stock_quantity, 18);
    assert.equal(readbackMedicine?.stockStatus, 'Sufficient');
    assert.equal(healthcareReadback.movements.find((item) => item.quantity_delta === -2)?.medicineName, healthcareMedicineInput.name);

    const tenantBHealthcareResponse = await fetch(healthcareSnapshotUrl, { headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken } });
    assert.equal(tenantBHealthcareResponse.status, 200);
    const tenantBHealthcare = await tenantBHealthcareResponse.json();
    assert.deepEqual(tenantBHealthcare.records, []);
    assert.deepEqual(tenantBHealthcare.visits, []);
    assert.deepEqual(tenantBHealthcare.medicines, []);
    assert.deepEqual(tenantBHealthcare.movements, []);
    const crossTenantHealthcareVisit = await fetch(referenceApiBase + '/api/healthcare/visits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...healthcareVisitInput, clientRequestId: randomUUID() }),
    });
    assert.equal(crossTenantHealthcareVisit.status, 400, 'A different tenant cannot create a healthcare visit against a foreign student.');
    const facilityBookingsUrl = referenceApiBase + '/api/facility-bookings';
    const facilityNoPermissionResponse = await fetch(facilityBookingsUrl, { headers: { Authorization: 'Bearer ' + facilityNoPermissionToken } });
    assert.equal(facilityNoPermissionResponse.status, 403, 'An Admin denied both General Affairs and Boarding cannot read facility bookings.');

    const facilityInitialResponse = await fetch(facilityBookingsUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(facilityInitialResponse.status, 200);
    const facilityInitial = await facilityInitialResponse.json();
    assert.deepEqual(facilityInitial.bookings, []);
    assert.ok(facilityInitial.resources.some((item) => item.id === facilityReferenceId));

    const facilityBookingDraft = {
      action: 'create',
      clientRequestId: randomUUID(),
      facilityReferenceId,
      date: '2099-05-19',
      startTime: '08:00',
      endTime: '09:00',
      purpose: 'Rapat wali santri uji API',
      booker: 'Admin Uji',
    };
    const freeTypeFacilityResponse = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...facilityBookingDraft, facilityReferenceId: '' }),
    });
    assert.equal(freeTypeFacilityResponse.status, 400, 'Facility bookings must select a tenant catalog resource.');

    const facilityCreateResponse = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityBookingDraft),
    });
    assert.equal(facilityCreateResponse.status, 201);
    const createdFacilityBooking = await facilityCreateResponse.json();
    assert.equal(createdFacilityBooking.replayed, false);
    assert.ok(createdFacilityBooking.id);

    const facilityCreateRetry = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityBookingDraft),
    });
    assert.equal(facilityCreateRetry.status, 201);
    assert.deepEqual(await facilityCreateRetry.json(), { id: createdFacilityBooking.id, replayed: true });

    const facilityOverlapResponse = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...facilityBookingDraft, clientRequestId: randomUUID(), startTime: '08:30', endTime: '09:30' }),
    });
    assert.equal(facilityOverlapResponse.status, 409, 'A resource cannot have overlapping confirmed bookings.');

    const facilitySavedRow = await admin.from('facility_bookings')
      .select('tenant_id,facility_reference_id,room_name,booking_date,start_time,end_time,status')
      .eq('id', createdFacilityBooking.id).single();
    assert.equal(facilitySavedRow.error, null);
    assert.equal(facilitySavedRow.data?.tenant_id, tenantIds[0]);
    assert.equal(facilitySavedRow.data?.facility_reference_id, facilityReferenceId);
    assert.equal(facilitySavedRow.data?.room_name, `Aula Uji ${fixtureSuffix}`);
    assert.equal(facilitySavedRow.data?.booking_date, '2099-05-19');
    assert.equal(facilitySavedRow.data?.status, 'confirmed');

    const facilityTenantBResponse = await fetch(facilityBookingsUrl, { headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken } });
    assert.equal(facilityTenantBResponse.status, 200);
    assert.deepEqual((await facilityTenantBResponse.json()).bookings, []);
    const crossTenantFacilityCancel = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', id: createdFacilityBooking.id, clientRequestId: randomUUID(), reason: 'Uji isolasi tenant.' }),
    });
    assert.equal(crossTenantFacilityCancel.status, 404, 'A different tenant cannot cancel a booking by guessing its ID.');

    const facilityCancelPayload = { action: 'cancel', id: createdFacilityBooking.id, clientRequestId: randomUUID(), reason: 'Fixture selesai.' };
    const facilityCancelResponse = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityCancelPayload),
    });
    assert.equal(facilityCancelResponse.status, 201);
    assert.equal((await facilityCancelResponse.json()).replayed, false);
    const facilityCancelRetry = await fetch(facilityBookingsUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityCancelPayload),
    });
    assert.equal(facilityCancelRetry.status, 201);
    assert.equal((await facilityCancelRetry.json()).replayed, true);

    const facilityFinalSnapshotResponse = await fetch(facilityBookingsUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(facilityFinalSnapshotResponse.status, 200);
    const facilityFinalSnapshot = await facilityFinalSnapshotResponse.json();
    assert.equal(facilityFinalSnapshot.bookings.find((item) => item.id === createdFacilityBooking.id)?.status, 'Cancelled');
    const facilityEvents = await admin.from('facility_booking_events')
      .select('event_type').eq('booking_id', createdFacilityBooking.id);
    assert.equal(facilityEvents.error, null);
    assert.deepEqual(facilityEvents.data?.map((event) => event.event_type).sort(), ['cancelled', 'created']);
    console.log('Facility booking API round-trip passed: tenant catalog relation, persistence, overlap rejection, idempotency, cancellation audit, permission, and tenant isolation.');
    const gaSnapshotUrl = referenceApiBase + '/api/ga/assets-snapshot';
    const noPermissionGaResponse = await fetch(gaSnapshotUrl, { headers: { Authorization: 'Bearer ' + facilityNoPermissionToken } });
    assert.equal(noPermissionGaResponse.status, 403, 'An Admin without General Affairs permission cannot access its assets or inventory.');

    const gaInitialResponse = await fetch(gaSnapshotUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(gaInitialResponse.status, 200);
    const gaInitial = await gaInitialResponse.json();
    assert.deepEqual(gaInitial.facilities, []);
    assert.deepEqual(gaInitial.inventory, []);
    assert.deepEqual(gaInitial.movements, []);
    assert.ok(gaInitial.assetCategories.some((item) => item.id === gaAssetCategoryId));
    assert.ok(gaInitial.inventoryCategories.some((item) => item.id === gaInventoryCategoryId));
    assert.ok(gaInitial.inventoryUnits.some((item) => item.id === gaInventoryUnitId));

    const gaFreeTypeInventoryResponse = await fetch(referenceApiBase + '/api/ga/inventory', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        clientRequestId: randomUUID(),
        itemCode: 'FREE-TYPE',
        name: 'Barang dengan kategori bebas',
        category: 'Kategori buatan sendiri',
        unit: 'Satuan bebas',
        initialQuantity: 1,
        minimumQuantity: 0,
      }),
    });
    assert.equal(gaFreeTypeInventoryResponse.status, 400, 'Inventory requires tenant-owned category and unit references.');

    const gaAssetDraft = {
      action: 'create',
      clientRequestId: randomUUID(),
      categoryReferenceId: gaAssetCategoryId,
      assetCode: `REQUEST-ASSET-${fixtureSuffix}`,
      name: `Laptop Aset Uji ${fixtureSuffix}`,
      category: 'Kategori bebas yang harus diabaikan',
      location: 'Ruang Uji',
      custodian: 'Admin Uji',
      condition: 'Baik',
      acquisitionValue: 12500000,
      acquiredOn: '2026-01-01',
    };
    const gaAssetCreateResponse = await fetch(referenceApiBase + '/api/ga/assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaAssetDraft),
    });
    const gaAssetCreateBody = await gaAssetCreateResponse.json();
    assert.equal(gaAssetCreateResponse.status, 201, `GA asset create failed: ${JSON.stringify(gaAssetCreateBody)}`);
    const createdGaAsset = gaAssetCreateBody;
    assert.equal(createdGaAsset.replayed, false);
    assert.ok(createdGaAsset.id);
    const gaAssetCreateRetry = await fetch(referenceApiBase + '/api/ga/assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaAssetDraft),
    });
    assert.equal(gaAssetCreateRetry.status, 201);
    assert.deepEqual(await gaAssetCreateRetry.json(), { id: createdGaAsset.id, replayed: true });

    const savedGaAsset = await admin.from('ga_facilities')
      .select('tenant_id,asset_code,name,category,category_reference_id,status,condition,acquisition_value')
      .eq('id', createdGaAsset.id).single();
    assert.equal(savedGaAsset.error, null);
    assert.equal(savedGaAsset.data?.tenant_id, tenantIds[0]);
    assert.equal(savedGaAsset.data?.category_reference_id, gaAssetCategoryId);
    assert.equal(savedGaAsset.data?.category, 'Elektronik Uji');
    assert.match(savedGaAsset.data?.asset_code || '', /^AST-\d{5}$/);
    assert.equal(savedGaAsset.data?.name, gaAssetDraft.name);
    assert.equal(Number(savedGaAsset.data?.acquisition_value), 12500000);

    const gaOpnamePayload = { action: 'opname', id: createdGaAsset.id, clientRequestId: randomUUID(), condition: 'Perlu Servis' };
    const gaOpnameResponse = await fetch(referenceApiBase + '/api/ga/assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaOpnamePayload),
    });
    const gaOpnameBody = await gaOpnameResponse.json();
    assert.equal(gaOpnameResponse.status, 201, `GA asset opname failed: ${JSON.stringify(gaOpnameBody)}`);
    const gaDisposeResponse = await fetch(referenceApiBase + '/api/ga/assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dispose', id: createdGaAsset.id, clientRequestId: randomUUID() }),
    });
    const gaDisposeBody = await gaDisposeResponse.json();
    assert.equal(gaDisposeResponse.status, 201, `GA asset disposal failed: ${JSON.stringify(gaDisposeBody)}`);

    const gaAssetEvents = await admin.from('ga_facility_events').select('event_type').eq('facility_id', createdGaAsset.id);
    assert.equal(gaAssetEvents.error, null);
    assert.deepEqual(gaAssetEvents.data?.map((event) => event.event_type).sort(), ['created', 'disposed', 'opname']);

    const gaInventoryDraft = {
      action: 'create',
      clientRequestId: randomUUID(),
      categoryReferenceId: gaInventoryCategoryId,
      unitReferenceId: gaInventoryUnitId,
      itemCode: `REQUEST-INVENTORY-${fixtureSuffix}`,
      name: `Peralatan Inventaris Uji ${fixtureSuffix}`,
      category: 'Kategori bebas yang harus diabaikan',
      unit: 'Satuan bebas yang harus diabaikan',
      initialQuantity: 10,
      minimumQuantity: 3,
      unitCost: 25000,
      location: 'Gudang Uji',
    };
    const gaInventoryCreateResponse = await fetch(referenceApiBase + '/api/ga/inventory', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaInventoryDraft),
    });
    const gaInventoryCreateBody = await gaInventoryCreateResponse.json();
    assert.equal(gaInventoryCreateResponse.status, 201, `GA inventory create failed: ${JSON.stringify(gaInventoryCreateBody)}`);
    const createdGaInventory = gaInventoryCreateBody;
    assert.equal(createdGaInventory.replayed, false);
    assert.ok(createdGaInventory.id);
    const gaInventoryCreateRetry = await fetch(referenceApiBase + '/api/ga/inventory', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaInventoryDraft),
    });
    assert.equal(gaInventoryCreateRetry.status, 201);
    assert.deepEqual(await gaInventoryCreateRetry.json(), { id: createdGaInventory.id, replayed: true });

    const savedGaInventory = await admin.from('ga_inventory_items')
      .select('tenant_id,item_code,name,category,category_reference_id,unit,unit_reference_id,quantity,minimum_quantity,status')
      .eq('id', createdGaInventory.id).single();
    assert.equal(savedGaInventory.error, null);
    assert.equal(savedGaInventory.data?.tenant_id, tenantIds[0]);
    assert.equal(savedGaInventory.data?.category_reference_id, gaInventoryCategoryId);
    assert.equal(savedGaInventory.data?.unit_reference_id, gaInventoryUnitId);
    assert.equal(savedGaInventory.data?.category, 'Perlengkapan Uji');
    assert.equal(savedGaInventory.data?.unit, 'Kotak Uji');
    assert.match(savedGaInventory.data?.item_code || '', /^BRG-\d{5}$/);
    assert.equal(savedGaInventory.data?.quantity, 10);

    const gaStockAdjustmentPayload = {
      itemId: createdGaInventory.id,
      delta: 5,
      reason: 'Penerimaan barang uji.',
      clientRequestId: randomUUID(),
    };
    const gaStockAdjustmentResponse = await fetch(referenceApiBase + '/api/ga/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaStockAdjustmentPayload),
    });
    assert.equal(gaStockAdjustmentResponse.status, 201);
    const gaStockAdjustment = await gaStockAdjustmentResponse.json();
    assert.equal(gaStockAdjustment.balance, 15);
    assert.equal(gaStockAdjustment.replayed, false);

    const gaNegativeStockResponse = await fetch(referenceApiBase + '/api/ga/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: createdGaInventory.id, delta: -99, reason: 'Uji larangan stok negatif.', clientRequestId: randomUUID() }),
    });
    assert.equal(gaNegativeStockResponse.status, 409, 'Inventory stock cannot become negative.');

    const gaStockAdjustmentRetry = await fetch(referenceApiBase + '/api/ga/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(gaStockAdjustmentPayload),
    });
    assert.equal(gaStockAdjustmentRetry.status, 201);
    assert.equal((await gaStockAdjustmentRetry.json()).replayed, true);

    const tenantBGaSnapshotResponse = await fetch(gaSnapshotUrl, { headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken } });
    assert.equal(tenantBGaSnapshotResponse.status, 200);
    const tenantBGaSnapshot = await tenantBGaSnapshotResponse.json();
    assert.deepEqual(tenantBGaSnapshot.facilities, []);
    assert.deepEqual(tenantBGaSnapshot.inventory, []);
    assert.deepEqual(tenantBGaSnapshot.movements, []);
    const crossTenantGaStockResponse = await fetch(referenceApiBase + '/api/ga/stock-adjustments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + otherTenantMarketplaceAdminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: createdGaInventory.id, delta: 1, reason: 'Uji isolasi tenant.', clientRequestId: randomUUID() }),
    });
    assert.equal(crossTenantGaStockResponse.status, 404, 'A different tenant cannot change a guessed inventory item ID.');

    const gaFinalSnapshotResponse = await fetch(gaSnapshotUrl, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(gaFinalSnapshotResponse.status, 200);
    const gaFinalSnapshot = await gaFinalSnapshotResponse.json();
    const listedGaAsset = gaFinalSnapshot.facilities.find((item) => item.id === createdGaAsset.id);
    const listedGaInventory = gaFinalSnapshot.inventory.find((item) => item.id === createdGaInventory.id);
    assert.equal(listedGaAsset?.category_reference_id, gaAssetCategoryId);
    assert.equal(listedGaAsset?.condition, 'Perlu Servis');
    assert.equal(listedGaAsset?.status, 'disposed');
    assert.ok(listedGaAsset?.last_opname_on);
    assert.equal(listedGaInventory?.category_reference_id, gaInventoryCategoryId);
    assert.equal(listedGaInventory?.unit_reference_id, gaInventoryUnitId);
    assert.equal(listedGaInventory?.category, 'Perlengkapan Uji');
    assert.equal(listedGaInventory?.unit, 'Kotak Uji');
    assert.equal(listedGaInventory?.quantity, 15);
    assert.equal(listedGaInventory?.stockStatus, 'In Stock');
    const gaMovements = await admin.from('ga_inventory_movements')
      .select('quantity_delta,balance_after').eq('item_id', createdGaInventory.id);
    assert.equal(gaMovements.error, null);
    assert.equal(gaMovements.data?.length, 2);
    assert.deepEqual(gaMovements.data?.map((movement) => Number(movement.quantity_delta)).sort((a, b) => a - b), [5, 10]);
    assert.ok(gaMovements.data?.some((movement) => movement.balance_after === 15));
    console.log('General Affairs API round-trip passed: linked catalogs, server-issued codes, asset opname, stock ledger, idempotency, role and tenant isolation.');
    const libraryDenied = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${libraryNoPermissionToken}` },
    });
    assert.equal(libraryDenied.status, 403, 'An account without the Library module grant cannot read its snapshot.');

    const libraryEmptySnapshot = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(libraryEmptySnapshot.status, 200, 'A permitted Admin can read the tenant Library snapshot.');
    const emptyLibrary = await libraryEmptySnapshot.json();
    assert.deepEqual(emptyLibrary.books, []);
    assert.deepEqual(emptyLibrary.circulations, []);
    assert.ok(emptyLibrary.bookCategories.some((category) => category.id === libraryBookCategoryId));
    assert.ok(emptyLibrary.students.some((student) => student.id === tahfidzStudentId && student.nis === tahfidzStudentNis));

    const libraryBookInput = {
      title: `Buku Integrasi ${fixtureSuffix}`,
      author: 'Penulis Uji',
      categoryReferenceId: libraryBookCategoryId,
      isbn: '',
      totalCopies: 1,
      shelf: 'Rak Uji',
      clientRequestId: randomUUID(),
    };
    const libraryFreeType = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: { ...libraryBookInput, categoryReferenceId: '' } }),
    });
    assert.equal(libraryFreeType.status, 400, 'Library book categories must come from the tenant reference catalog.');

    const libraryWrongTenantCategory = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: { ...libraryBookInput, categoryReferenceId: otherTenantLibraryCategoryId, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryWrongTenantCategory.status, 400, 'A Library category from another tenant cannot be selected.');

    const libraryWrongDomainCategory = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: { ...libraryBookInput, categoryReferenceId: facilityReferenceId, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryWrongDomainCategory.status, 400, 'A non-Library reference cannot be used as a book category.');

    const libraryBookCreate = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: libraryBookInput }),
    });
    assert.equal(libraryBookCreate.status, 201, 'A permitted Admin can persist a book linked to a tenant category.');
    const createdLibraryBook = await libraryBookCreate.json();
    assert.ok(createdLibraryBook.bookId);

    const libraryBookRetry = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: libraryBookInput }),
    });
    assert.equal(libraryBookRetry.status, 200, 'Repeating a book request is idempotent.');
    assert.equal((await libraryBookRetry.json()).bookId, createdLibraryBook.bookId);

    const { data: persistedLibraryBook, error: libraryBookReadError } = await admin.from('library_books')
      .select('tenant_id,title,author,category,category_reference_id,total_copies,created_by_user_id')
      .eq('id', createdLibraryBook.bookId)
      .maybeSingle();
    assert.equal(libraryBookReadError, null);
    assert.equal(persistedLibraryBook?.tenant_id, tenantIds[0]);
    assert.equal(persistedLibraryBook?.category_reference_id, libraryBookCategoryId, 'The category relationship is persisted as a tenant-owned FK.');
    assert.equal(persistedLibraryBook?.category, `Kategori Buku Uji ${fixtureSuffix}`);
    assert.equal(persistedLibraryBook?.created_by_user_id, users[0].uid);

    const librarySnapshotAfterCreate = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(librarySnapshotAfterCreate.status, 200);
    const libraryAfterCreate = await librarySnapshotAfterCreate.json();
    assert.equal(libraryAfterCreate.books.length, 1);
    assert.equal(libraryAfterCreate.books[0].id, createdLibraryBook.bookId);
    assert.equal(libraryAfterCreate.books[0].categoryReferenceId, libraryBookCategoryId);
    assert.equal(libraryAfterCreate.books[0].availableCopies, 1);

    const otherTenantLibrarySnapshot = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}` },
    });
    assert.equal(otherTenantLibrarySnapshot.status, 200);
    const otherLibrary = await otherTenantLibrarySnapshot.json();
    assert.deepEqual(otherLibrary.books, [], 'Other tenants cannot see the persisted Library book.');
    assert.deepEqual(otherLibrary.circulations, []);
    assert.ok(!otherLibrary.bookCategories.some((category) => category.id === libraryBookCategoryId));

    const libraryBorrowedOn = new Date().toISOString().slice(0, 10);
    const libraryDueOn = new Date(Date.parse(`${libraryBorrowedOn}T00:00:00.000Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const libraryCheckoutInput = {
      bookId: createdLibraryBook.bookId,
      studentId: tahfidzStudentId,
      borrowedOn: libraryBorrowedOn,
      dueOn: libraryDueOn,
      clientRequestId: randomUUID(),
    };
    const libraryCheckout = await fetch(`${referenceApiBase}/api/library/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout: libraryCheckoutInput }),
    });
    assert.equal(libraryCheckout.status, 201, 'A permitted Ustadz can check out an available copy to a same-tenant student.');
    const createdLibraryCirculation = await libraryCheckout.json();
    assert.ok(createdLibraryCirculation.circulationId);

    const libraryCheckoutRetry = await fetch(`${referenceApiBase}/api/library/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout: libraryCheckoutInput }),
    });
    assert.equal(libraryCheckoutRetry.status, 200, 'Retrying a checkout does not create a second circulation.');
    assert.equal((await libraryCheckoutRetry.json()).circulationId, createdLibraryCirculation.circulationId);

    const libraryExhaustedCopy = await fetch(`${referenceApiBase}/api/library/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ustadzToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout: { ...libraryCheckoutInput, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryExhaustedCopy.status, 409, 'The backend rejects a checkout after the only copy is already loaned.');

    const libraryCrossTenantCheckout = await fetch(`${referenceApiBase}/api/library/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout: { ...libraryCheckoutInput, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryCrossTenantCheckout.status, 404, 'Another tenant cannot borrow a guessed foreign book ID.');

    const libraryCrossTenantReturn = await fetch(`${referenceApiBase}/api/library/returns`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherTenantMarketplaceAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ return: { circulationId: createdLibraryCirculation.circulationId, returnedOn: libraryBorrowedOn, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryCrossTenantReturn.status, 404, 'Another tenant cannot return a guessed foreign circulation ID.');

    const libraryActiveSnapshotResponse = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(libraryActiveSnapshotResponse.status, 200);
    const libraryActiveSnapshot = await libraryActiveSnapshotResponse.json();
    assert.equal(libraryActiveSnapshot.books[0].availableCopies, 0, 'A checkout decreases availability in the tenant snapshot.');
    const activeLibraryCirculation = libraryActiveSnapshot.circulations.find((row) => row.id === createdLibraryCirculation.circulationId);
    assert.equal(activeLibraryCirculation?.bookId, createdLibraryBook.bookId);
    assert.equal(activeLibraryCirculation?.studentId, tahfidzStudentId);
    assert.equal(activeLibraryCirculation?.student, 'Santri Uji Tahfidz API');
    assert.equal(activeLibraryCirculation?.nis, tahfidzStudentNis);
    assert.equal(activeLibraryCirculation?.status, 'Active');

    const invalidLibraryCapacityUpdate = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: { ...libraryBookInput, id: createdLibraryBook.bookId, totalCopies: 0, clientRequestId: randomUUID() } }),
    });
    assert.equal(invalidLibraryCapacityUpdate.status, 409, 'The book catalog cannot reduce copies below active loans.');

    const libraryReturnInput = {
      circulationId: createdLibraryCirculation.circulationId,
      returnedOn: libraryBorrowedOn,
      clientRequestId: randomUUID(),
    };
    const libraryReturn = await fetch(`${referenceApiBase}/api/library/returns`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ return: libraryReturnInput }),
    });
    assert.equal(libraryReturn.status, 201, 'A permitted Admin can record a book return.');
    assert.equal((await libraryReturn.json()).circulationId, createdLibraryCirculation.circulationId);

    const libraryReturnRetry = await fetch(`${referenceApiBase}/api/library/returns`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ return: libraryReturnInput }),
    });
    assert.equal(libraryReturnRetry.status, 200, 'Repeating the same return request is idempotent.');
    assert.equal((await libraryReturnRetry.json()).circulationId, createdLibraryCirculation.circulationId);

    const libraryDuplicateReturn = await fetch(`${referenceApiBase}/api/library/returns`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ return: { ...libraryReturnInput, clientRequestId: randomUUID() } }),
    });
    assert.equal(libraryDuplicateReturn.status, 409, 'A new request cannot record the same circulation as returned twice.');

    const libraryBookUpdateInput = {
      ...libraryBookInput,
      id: createdLibraryBook.bookId,
      title: `Buku Integrasi Diperbarui ${fixtureSuffix}`,
      totalCopies: 2,
      clientRequestId: randomUUID(),
    };
    const libraryBookUpdate = await fetch(`${referenceApiBase}/api/library/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: libraryBookUpdateInput }),
    });
    assert.equal(libraryBookUpdate.status, 201, 'The tenant can update the existing book after returning its copy.');
    assert.equal((await libraryBookUpdate.json()).bookId, createdLibraryBook.bookId);

    const libraryFinalSnapshotResponse = await fetch(`${referenceApiBase}/api/library/snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(libraryFinalSnapshotResponse.status, 200);
    const libraryFinalSnapshot = await libraryFinalSnapshotResponse.json();
    assert.equal(libraryFinalSnapshot.books[0].title, `Buku Integrasi Diperbarui ${fixtureSuffix}`);
    assert.equal(libraryFinalSnapshot.books[0].categoryReferenceId, libraryBookCategoryId);
    assert.equal(libraryFinalSnapshot.books[0].availableCopies, 2);
    const returnedLibraryCirculation = libraryFinalSnapshot.circulations.find((row) => row.id === createdLibraryCirculation.circulationId);
    assert.equal(returnedLibraryCirculation?.status, 'Returned');
    assert.equal(returnedLibraryCirculation?.returnedDate, libraryBorrowedOn);
    assert.equal(returnedLibraryCirculation?.bookTitle, `Buku Integrasi Diperbarui ${fixtureSuffix}`);

    console.log('Library API round-trip passed: tenant category relations, book CRUD, checkout/return persistence, idempotency, copy guard, role permissions, and tenant isolation.');
        console.log('API auth, tenant isolation, Academic, CBT, LMS, HRIS, Cooperative, CRM, communication, Laundry, Donation & Waqf, Documents, Healthcare, Tahfidz, Library, and reference catalog round-trips passed: persistence, relations, idempotency, tenant isolation, and role restrictions.');
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverShutdownRequested = true;
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(5000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }

    if (profileFailureTriggerInstalled) {
      try {
        execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', [
          'DROP TRIGGER IF EXISTS test_fail_provision_profile_insert ON public.profiles;',
          'DROP FUNCTION IF EXISTS public.test_fail_provision_profile_insert();',
        ].join(' ')], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 1024 * 1024,
        });
      } catch {
        console.error('Unable to clean the synthetic profile failure trigger.');
        process.exitCode = 1;
      }
    }

    // The mutation receipt ledger is intentionally not DELETE-granted to service_role.
    // Clean only generated UUID tenants through the local Supabase superuser connection.
    try {
      const tenantArray = `ARRAY[${tenantIds.map((id) => `'${id}'::uuid`).join(',')}]`;
      const cleanupSql = [
        'BEGIN;',
        `DELETE FROM public.boarding_permit_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_permits WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_permit_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_discipline_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_discipline_incidents WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_discipline_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_attendance_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_attendance_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_attendance_sessions WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.boarding_attendance_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.lms_submission_requests DISABLE TRIGGER lms_submission_requests_immutable;',
        'ALTER TABLE public.lms_submission_grade_events DISABLE TRIGGER lms_submission_grade_events_immutable;',
        'ALTER TABLE public.lms_learning_record_requests DISABLE TRIGGER lms_learning_record_requests_immutable;',
        `DELETE FROM public.lms_learning_record_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_submission_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_submission_grade_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_material_progress WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_student_notes WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_material_comments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_submissions WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_assignments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_enrollments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_materials WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_course_modules WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_courses WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_categories WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.lms_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.lms_submission_requests ENABLE TRIGGER lms_submission_requests_immutable;',
        'ALTER TABLE public.lms_submission_grade_events ENABLE TRIGGER lms_submission_grade_events_immutable;',
        'ALTER TABLE public.lms_learning_record_requests ENABLE TRIGGER lms_learning_record_requests_immutable;',
        `DELETE FROM public.tahfidz_membership_write_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tahfidz_halaqah_write_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tahfidz_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tahfidz_memberships WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tahfidz_targets WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.academic_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.finance_controls WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.finance_ledger WHERE tenant_id = ANY(${tenantArray}) AND source_type IN ('cooperative_wallet', 'cooperative_sale');`,
        `DELETE FROM public.laundry_mutation_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.laundry_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.laundry_orders WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.laundry_settings WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donation_mutation_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donation_audit_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donation_receipt_counters WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.waqf_assets WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donation_donors WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.donation_campaigns WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.cooperative_supplier_mutation_requests DISABLE TRIGGER cooperative_supplier_requests_immutable;',
        `DELETE FROM public.cooperative_supplier_mutation_requests WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.cooperative_supplier_mutation_requests ENABLE TRIGGER cooperative_supplier_requests_immutable;',
        'ALTER TABLE public.cooperative_sales DISABLE TRIGGER cooperative_sales_immutable;',
        'ALTER TABLE public.cooperative_sale_items DISABLE TRIGGER cooperative_sale_items_immutable;',
        'ALTER TABLE public.cooperative_wallet_ledger DISABLE TRIGGER cooperative_wallet_ledger_immutable;',
        'ALTER TABLE public.cooperative_stock_movements DISABLE TRIGGER cooperative_stock_movements_immutable;',
        'ALTER TABLE public.cooperative_wallet_policy_events DISABLE TRIGGER cooperative_wallet_policy_events_immutable;',
        `DELETE FROM public.cooperative_wallet_ledger WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_sale_items WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_stock_movements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_sales WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_wallet_policy_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_wallets WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_suppliers WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cooperative_products WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.cooperative_sales ENABLE TRIGGER cooperative_sales_immutable;',
        'ALTER TABLE public.cooperative_sale_items ENABLE TRIGGER cooperative_sale_items_immutable;',
        'ALTER TABLE public.cooperative_wallet_ledger ENABLE TRIGGER cooperative_wallet_ledger_immutable;',
        'ALTER TABLE public.cooperative_stock_movements ENABLE TRIGGER cooperative_stock_movements_immutable;',
        'ALTER TABLE public.cooperative_wallet_policy_events ENABLE TRIGGER cooperative_wallet_policy_events_immutable;',
        `DELETE FROM public.tahfidz_halaqahs WHERE tenant_id = ANY(${tenantArray});`,
        `UPDATE public.profiles SET linked_santri_id = NULL WHERE tenant_id = ANY(${tenantArray}) AND linked_santri_id = '${tahfidzStudentId}';`,
        `DELETE FROM public.healthcare_record_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_visits WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_stock_movements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_medicines WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.library_write_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.library_circulations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.library_books WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.alumni_graduation_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.alumni_profiles WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_attempts WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_exam_assignments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_exam_questions WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_exams WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_questions WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.cbt_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.student_room_assignment_history WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.nis_reservations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.guardian_account_invitations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.guardian_user_accounts WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.guardian_students WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.guardians WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.students WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.candidates WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.identity_claims WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.communication_announcement_reads WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.communication_announcements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_mutation_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_order_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_stock_movements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_order_items WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_orders WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.marketplace_products WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.crm_contact_audit_events DISABLE TRIGGER crm_contact_audit_immutable;',
        'ALTER TABLE public.crm_interactions DISABLE TRIGGER crm_interactions_immutable;',
        'ALTER TABLE public.crm_mutation_requests DISABLE TRIGGER crm_mutation_requests_immutable;',
        `DELETE FROM public.crm_contact_audit_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.crm_mutation_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.crm_interactions WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.crm_contacts WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.crm_contact_audit_events ENABLE TRIGGER crm_contact_audit_immutable;',
        'ALTER TABLE public.crm_interactions ENABLE TRIGGER crm_interactions_immutable;',
        'ALTER TABLE public.crm_mutation_requests ENABLE TRIGGER crm_mutation_requests_immutable;',

        `DELETE FROM public.master_data_records WHERE tenant_id = ANY(${tenantArray}) AND category = 'Kamar';`,
        `DELETE FROM public.master_data_records WHERE tenant_id = ANY(${tenantArray}) AND category = 'Gedung';`,
        `DELETE FROM public.master_data_records WHERE tenant_id = ANY(${tenantArray});`,

        `DELETE FROM public.document_attachment_upload_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_attachments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_workflow_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.facility_booking_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.facility_bookings WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.facility_booking_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_leave_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_leave_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_attendance_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_attendance WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_employee_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.hris_employees WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.organization_units WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_facility_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_inventory_movements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_inventory_item_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_facilities WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_inventory_items WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.ga_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_reference_items WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_allocations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_counters WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.master_data_audit_events DISABLE TRIGGER master_data_audit_events_immutable_rows;',
        `DELETE FROM public.master_data_audit_events WHERE tenant_id = ANY(${tenantArray});`,
        'ALTER TABLE public.master_data_audit_events ENABLE TRIGGER master_data_audit_events_immutable_rows;',
        'COMMIT;',
      ].join(' ');
      execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', cleanupSql], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      const detail = error?.stderr?.toString().trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 500) || 'No PostgreSQL diagnostic available.';
      console.error(`Unable to clean synthetic rows through local Supabase: ${detail}`);
      process.exitCode = 1;
    }
    for (const user of users) {
      let authDeleteError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await admin.auth.admin.deleteUser(user.uid);
        authDeleteError = error;
        if (!error) break;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (authDeleteError) console.warn(`Auth API cleanup will use the local synthetic-fixture fallback (${authDeleteError.code || authDeleteError.name || 'unknown'}).`);
    }
    try {
      const tenantArray = `ARRAY[${tenantIds.map((id) => `'${id}'::uuid`).join(',')}]`;
      const userArray = `ARRAY[${users.map((user) => `'${user.uid}'::uuid`).join(',')}]`;
      const cleanupSql = [
        'BEGIN;',
        `DELETE FROM auth.users WHERE id = ANY(${userArray});`,
        `DELETE FROM public.profiles WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenants WHERE id = ANY(${tenantArray});`,
        'COMMIT;',
      ].join(' ');
      execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', cleanupSql], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      const detail = error?.stderr?.toString().trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 500) || 'No PostgreSQL diagnostic available.';
      console.error(`Unable to clean synthetic Auth, profile, and tenant fixtures through local Supabase: ${detail}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const detail = error instanceof Error
    ? error.message
    : error?.code || 'unknown error';
  const stack = error instanceof Error && error.stack
    ? `\n${error.stack}`
    : '';
  const cause = error instanceof Error && error.cause instanceof Error
    ? `; cause=${error.cause.code || error.cause.message}`
    : '';
  console.error(`API auth and tenant integration test failed (${detail}${cause}). Check the local Supabase stack and migration state.${stack}`);
  process.exitCode = 1;
});

