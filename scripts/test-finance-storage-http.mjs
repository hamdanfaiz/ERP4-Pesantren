import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseTestEnvironment } from './supabase-test-environment.mjs';
import { isolateSyntheticTenantFixture } from './synthetic-tenant-fixture.mjs';

const BUCKET = 'erp4-private-finance-proofs';
const PPDB_BUCKET = 'ppdb-documents';
const TEST_PII_ENCRYPTION_KEY = Buffer.alloc(32, 0x6b).toString('hex');
const TEST_PII_FINGERPRINT_KEY = Buffer.alloc(32, 0x5a).toString('hex');
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

async function cleanupStep(errors, label, operation) {
  try {
    const result = await operation();
    if (result?.error) throw result.error;
  } catch (error) {
    const rawCode = typeof error?.code === 'string'
      ? error.code
      : typeof error?.name === 'string'
        ? error.name
        : typeof error?.status === 'number'
          ? `HTTP_${error.status}`
          : 'unknown';
    const safeCode = rawCode.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'unknown';
    errors.push(`${label} (${safeCode})`);
  }
}

function safeCode(error) {
  const rawCode = typeof error?.code === 'string'
    ? error.code
    : typeof error?.name === 'string'
      ? error.name
      : typeof error?.status === 'number'
        ? `HTTP_${error.status}`
        : 'unknown';
  return rawCode.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'unknown';
}

async function createUser(admin, tenantId, role, label) {
  const id = randomUUID();
  const email = `storage-${label}-${id.slice(0, 8)}@example.test`;
  const password = `Storage-Test-${id}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Storage test ${label}` },
  });
  if (error || !data.user) throw new Error(`Unable to create synthetic auth user (${label}).`);

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    tenant_id: tenantId,
    email,
    display_name: `Storage test ${label}`,
    role,
    status: 'active',
    module_permissions: role === 'admin'
      ? { finance: true, ppdb: true, 'master-data': true, boarding: true }
      : { finance: true },
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Unable to create synthetic profile (${label}).`);
  }
  return { uid: data.user.id, email, password };
}

async function signIn(anon, user) {
  const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session?.access_token) throw new Error('Unable to sign in a synthetic local user.');
  return data.session.access_token;
}

function jakartaBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function allocateSeries(admin, tenantId, seriesKey, context = {}) {
  const { data, error } = await admin.rpc('allocate_tenant_naming_series', {
    p_tenant_id: tenantId,
    p_series_key: seriesKey,
    p_effective_date: jakartaBusinessDate(),
    p_context: context,
  });
  if (error || typeof data !== 'string' || !data) {
    throw new Error(`Unable to allocate synthetic ${seriesKey} identifier${error?.code ? ` (${error.code})` : ''}.`);
  }
  return data;
}

async function allocateStructureCode(admin, tenantId, seriesKey) {
  const { data, error } = await admin.rpc('allocate_tenant_structure_naming_series', {
    p_tenant_id: tenantId,
    p_series_key: seriesKey,
    p_effective_date: jakartaBusinessDate(),
  });
  if (error || typeof data !== 'string' || !data) {
    throw new Error(`Unable to allocate synthetic ${seriesKey} identifier${error?.code ? ` (${error.code})` : ''}.`);
  }
  return data;
}

function assertNoError(result, message) {
  if (result?.error) throw new Error(message);
}

async function authorizedJson(url, token, body, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  try {
    return { response, body: raw ? JSON.parse(raw) : {} };
  } catch {
    throw new Error(`Expected JSON from ${new URL(url).pathname} (HTTP ${response.status}; ${response.headers.get('content-type') || 'unknown content type'}).`);
  }
}

async function main() {
  const { url, anonKey, serviceKey, target } = getSupabaseTestEnvironment({ allowStagingWrites: true });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenantId = randomUUID();
  const foreignTenantId = randomUUID();
  const studentId = randomUUID();
  const candidateId = randomUUID();
  const foreignCandidateId = randomUUID();
  const otherCandidateId = randomUUID();
  const otherStudentId = randomUUID();
  const billRequestId = randomUUID();
  const ppdbRegistrationBillRequestId = randomUUID();
  const ppdbTuitionBillRequestId = randomUUID();
  const ppdbOnboardingRequestId = randomUUID();
  const fixtureSuffix = randomUUID().slice(0, 10);
  let classId = '';
  let roomId = '';
  let alternateRoomId = '';
  let buildingId = '';
  const users = [];
  const createdTenantIds = [];
  let serverProcess;
  let uploadedPath = '';
  let ppdbDocumentPath = '';
  let ppdbUploadPath = '';
  let foreignDocumentPath = '';
  let publicPpdbCandidateId = '';

  try {
    const { error: tenantError } = await admin.from('tenants').insert({
      id: tenantId,
      slug: `storage-http-${fixtureSuffix}`,
      name: `Storage HTTP Test ${fixtureSuffix}`,
      status: 'active',
    });
    if (tenantError) throw new Error(`Unable to create a synthetic finance tenant (${safeCode(tenantError)}${tenantError.status ? `, HTTP ${tenantError.status}` : ''}).`);
    createdTenantIds.push(tenantId);
    const { error: foreignTenantError } = await admin.from('tenants').insert({
      id: foreignTenantId,
      slug: `storage-foreign-${fixtureSuffix}`,
      name: `Foreign PPDB Storage Test ${fixtureSuffix}`,
      status: 'active',
    });
    if (foreignTenantError) throw new Error('Unable to create a foreign synthetic tenant.');
    createdTenantIds.push(foreignTenantId);

    const financeAdmin = await createUser(admin, tenantId, 'admin', 'finance-admin');
    users.push(financeAdmin);
    const rateLimitAdmin = await createUser(admin, tenantId, 'admin', 'finance-rate-limit');
    users.push(rateLimitAdmin);
    const foreignAdmin = await createUser(admin, foreignTenantId, 'admin', 'foreign-tenant-admin');
    users.push(foreignAdmin);
    const { data: gradeReference, error: gradeReferenceError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantId,
      domain: 'academic_grade_level',
      code: `STORAGE_GRADE_${fixtureSuffix}`,
      name: 'VII',
      description: 'Jenjang untuk fixture pengujian Storage.',
      status: 'active',
      nis_grade_code: '07',
      created_by_user_id: financeAdmin.uid,
      updated_by_user_id: financeAdmin.uid,
    }).select('id').single();
    if (gradeReferenceError || !gradeReference?.id) throw new Error('Unable to seed the tenant grade reference for Storage tests.');
    const { error: tenantSettingsError } = await admin.from('tenant_settings').insert({
      tenant_id: tenantId,
      settings: {
        generalSettings: { academicYear: '2027/2028' },
        orgInfo: { schoolName: `Pesantren PPDB Uji ${fixtureSuffix}`, address: 'Alamat sintetis untuk test.' },
      },
      updated_by_user_id: financeAdmin.uid,
    });
    if (tenantSettingsError) throw new Error('Unable to seed synthetic public PPDB tenant settings.');
    const { data: foreignGradeReference, error: foreignGradeReferenceError } = await admin.from('tenant_reference_items').insert({
      tenant_id: foreignTenantId,
      domain: 'academic_grade_level',
      code: `FOREIGN_STORAGE_GRADE_${fixtureSuffix}`,
      name: 'VII',
      description: 'Jenjang tenant asing untuk fixture pengujian Storage.',
      status: 'active',
      nis_grade_code: '07',
      created_by_user_id: foreignAdmin.uid,
      updated_by_user_id: foreignAdmin.uid,
    }).select('id').single();
    if (foreignGradeReferenceError || !foreignGradeReference?.id) throw new Error('Unable to seed the foreign tenant grade reference for Storage tests.');
    [buildingId, roomId, alternateRoomId, classId] = await Promise.all([
      allocateStructureCode(admin, tenantId, 'building_code'),
      allocateStructureCode(admin, tenantId, 'room_code'),
      allocateStructureCode(admin, tenantId, 'room_code'),
      allocateStructureCode(admin, tenantId, 'class_code'),
    ]);
    const { error: structuresError } = await admin.from('master_data_records').insert([
      { tenant_id: tenantId, category: 'Gedung', id: buildingId, name: 'Gedung storage test', status: 'active' },
      { tenant_id: tenantId, category: 'Kamar', id: roomId, name: 'Kamar storage test', parent_id: buildingId, gender_code: 'L', capacity: 10, status: 'active' },
      { tenant_id: tenantId, category: 'Kamar', id: alternateRoomId, name: 'Kamar alternatif storage test', parent_id: buildingId, gender_code: 'L', capacity: 5, status: 'active' },
      { tenant_id: tenantId, category: 'Kelas', id: classId, name: 'Kelas storage test', grade: 'VII', grade_level_reference_id: gradeReference.id, status: 'active' },
    ]);
    if (structuresError) throw new Error('Unable to create synthetic student structures.');

    const candidateRegistrationId = await allocateSeries(admin, tenantId, 'ppdb_registration');
    const { error: candidateError } = await admin.from('candidates').insert({
      id: candidateId,
      tenant_id: tenantId,
      registration_id: candidateRegistrationId,
      name: 'Santri Storage Test',
      grade: 'VII',
      grade_level_reference_id: gradeReference.id,
    });
    if (candidateError) throw new Error('Unable to create a synthetic candidate.');

    const foreignRegistrationId = await allocateSeries(admin, foreignTenantId, 'ppdb_registration');
    const { error: foreignCandidateError } = await admin.from('candidates').insert({
      id: foreignCandidateId,
      tenant_id: foreignTenantId,
      registration_id: foreignRegistrationId,
      name: 'Foreign tenant candidate',
      grade: 'VII',
      grade_level_reference_id: foreignGradeReference.id,
    });
    if (foreignCandidateError) throw new Error('Unable to create a foreign tenant candidate.');
    const ppdbDocumentBytes = Buffer.from('%PDF-1.7\n% ERP4 synthetic PPDB candidate document\n%%EOF\n', 'utf8');
    ppdbDocumentPath = `${tenantId}/${candidateId}/kk-${randomUUID()}.pdf`;
    foreignDocumentPath = `${foreignTenantId}/${foreignCandidateId}/kk-${randomUUID()}.pdf`;
    for (const [path, bytes] of [[ppdbDocumentPath, ppdbDocumentBytes], [foreignDocumentPath, ppdbDocumentBytes]]) {
      const { error } = await admin.storage.from(PPDB_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (error) throw new Error('Unable to seed a synthetic private PPDB document.');
    }
    const { error: candidateDocumentsError } = await admin.from('candidate_documents').insert({
      tenant_id: tenantId,
      candidate_id: candidateId,
      kk: true,
      kk_path: ppdbDocumentPath,
    });
    if (candidateDocumentsError) throw new Error('Unable to link the synthetic PPDB document.');
    const { error: foreignCandidateDocumentsError } = await admin.from('candidate_documents').insert({
      tenant_id: foreignTenantId,
      candidate_id: foreignCandidateId,
      kk: true,
      kk_path: foreignDocumentPath,
    });
    if (foreignCandidateDocumentsError) throw new Error('Unable to link the foreign synthetic PPDB document.');

    const studentNis = await allocateSeries(admin, tenantId, 'nis', { grade: '07' });
    const { error: studentError } = await admin.from('students').insert({
      id: studentId,
      tenant_id: tenantId,
      source_candidate_id: candidateId,
      nis: studentNis,
      name: 'Santri Storage Test',
      gender: 'L',
      grade: 'VII',
      grade_level_reference_id: gradeReference.id,
      nik_ciphertext: `\\x${'ab'.repeat(44)}`,
      nik_fingerprint: `\\x${'cd'.repeat(32)}`,
      class_id: classId,
      room_id: roomId,
    });
    if (studentError) throw new Error('Unable to create a synthetic student.');

    const guardian = await createUser(admin, tenantId, 'wali_santri', 'guardian');
    users.push(guardian);
    const otherGuardian = await createUser(admin, tenantId, 'wali_santri', 'other-guardian');
    users.push(otherGuardian);

    const otherCandidateRegistrationId = await allocateSeries(admin, tenantId, 'ppdb_registration');
    const { error: otherCandidateError } = await admin.from('candidates').insert({
      id: otherCandidateId,
      tenant_id: tenantId,
      registration_id: otherCandidateRegistrationId,
      name: 'Santri Storage Test Other',
      grade: 'VII',
      grade_level_reference_id: gradeReference.id,
    });
    if (otherCandidateError) throw new Error('Unable to create the unrelated guardian candidate.');

    const otherStudentNis = await allocateSeries(admin, tenantId, 'nis', { grade: '07' });
    const { error: otherStudentError } = await admin.from('students').insert({
      id: otherStudentId,
      tenant_id: tenantId,
      source_candidate_id: otherCandidateId,
      nis: otherStudentNis,
      name: 'Santri Storage Test Other',
      gender: 'L',
      grade: 'VII',
      grade_level_reference_id: gradeReference.id,
      nik_ciphertext: `\\x${'ef'.repeat(44)}`,
      nik_fingerprint: `\\x${'12'.repeat(32)}`,
      class_id: classId,
      room_id: roomId,
    });
    if (otherStudentError) throw new Error('Unable to create the unrelated synthetic student.');

    const guardianRecordId = randomUUID();
    const otherGuardianRecordId = randomUUID();
    const { error: guardianRecordsError } = await admin.from('guardians').insert([
      { id: guardianRecordId, tenant_id: tenantId, source_candidate_id: candidateId, name: 'Wali Santri Uji', phone: '081234567801' },
      { id: otherGuardianRecordId, tenant_id: tenantId, source_candidate_id: otherCandidateId, name: 'Wali Santri Lain', phone: '081234567802' },
    ]);
    if (guardianRecordsError) throw new Error('Unable to create canonical guardian records.');

    const { error: guardianLinksError } = await admin.from('guardian_students').insert([
      { tenant_id: tenantId, guardian_id: guardianRecordId, student_id: studentId },
      { tenant_id: tenantId, guardian_id: otherGuardianRecordId, student_id: otherStudentId },
    ]);
    if (guardianLinksError) throw new Error('Unable to create canonical guardian-to-student links.');

    const { error: guardianAccountsError } = await admin.from('guardian_user_accounts').insert([
      { tenant_id: tenantId, guardian_id: guardianRecordId, user_id: guardian.uid },
      { tenant_id: tenantId, guardian_id: otherGuardianRecordId, user_id: otherGuardian.uid },
    ]);
    if (guardianAccountsError) throw new Error('Unable to create canonical guardian account links.');

    const { data: feeTypeReference, error: feeTypeReferenceError } = await admin.from('tenant_reference_items')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('domain', 'finance_fee_type')
      .eq('code', 'SPP_BULANAN')
      .eq('status', 'active')
      .single();
    if (feeTypeReferenceError || !feeTypeReference?.name) throw new Error('Unable to find the tenant SPP fee type reference.');

    const { data: billResult, error: billError } = await admin.rpc('create_tenant_finance_bills', {
      p_tenant_id: tenantId,
      p_actor_user_id: financeAdmin.uid,
      p_expected_role: 'admin',
      p_items: [{ studentId, feeType: feeTypeReference.name, period: `storage-${fixtureSuffix}`, amount: 50000 }],
      p_client_request_id: billRequestId,
    });
    if (billError || billResult?.created !== 1) throw new Error('Unable to create a synthetic Finance bill.');

    const { data: bill, error: billLookupError } = await admin.from('finance_bills')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('student_id', studentId)
      .eq('fee_type', feeTypeReference.name)
      .eq('period', `storage-${fixtureSuffix}`)
      .single();
    if (billLookupError || !bill?.id) throw new Error('Unable to find the synthetic Finance bill.');

    const guardianToken = await signIn(anon, guardian);
    const otherGuardianToken = await signIn(anon, otherGuardian);
    const financeAdminToken = await signIn(anon, financeAdmin);
    const rateLimitToken = await signIn(anon, rateLimitAdmin);
    const port = await availablePort();
    const apiBase = `http://127.0.0.1:${port}`;
    const tsxCliPath = process.env.ERP4_TSX_CLI_PATH || 'node_modules/tsx/dist/cli.mjs';
    serverProcess = spawn(process.execPath, [tsxCliPath, 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        SUPABASE_URL: url,
        SUPABASE_SECRET_KEY: serviceKey,
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_FINANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_FINANCE_PROOF_STORAGE_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_FINANCE_BILLS_ENABLED: 'true',
        SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED: 'true',
        SUPABASE_MASTER_DATA_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_RUNTIME_ENABLED: 'true',
        SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED: 'true',
        PUBLIC_PPDB_ENABLED: 'true',
        PUBLIC_PPDB_TENANT_ID: tenantId,
        PII_ENCRYPTION_KEY: TEST_PII_ENCRYPTION_KEY,
        PII_FINGERPRINT_KEY: TEST_PII_FINGERPRINT_KEY,
      },
      stdio: ['ignore', 'ignore', 'ignore'],
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

    const publicPpdbConfigResponse = await fetch(`${apiBase}/api/public/ppdb/config`);
    assert.equal(publicPpdbConfigResponse.status, 200, 'An active tenant with a grade catalog and academic year should expose public PPDB configuration.');
    assert.equal(publicPpdbConfigResponse.headers.get('cache-control'), 'no-store');
    const publicPpdbConfig = await publicPpdbConfigResponse.json();
    assert.equal(publicPpdbConfig.academicYear, '2027/2028');
    assert.equal(publicPpdbConfig.orgInfo.schoolName, `Pesantren PPDB Uji ${fixtureSuffix}`);
    assert.deepEqual(publicPpdbConfig.gradeLevels, [{ id: gradeReference.id, name: 'VII' }], 'The public form must receive the tenant grade choices from its runtime configuration.');
    assert.equal(publicPpdbConfig.documentUploadEnabled, true);

    const publicPpdbNik = (1_000_000_000_000_000n
      + BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 16)}`) % 9_000_000_000_000_000n).toString();
    publicPpdbCandidateId = randomUUID();
    const publicPpdbFiles = {
      kk: { name: 'kk.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.7\n% synthetic KK\n%%EOF\n').toString('base64') },
      birthCertificate: { name: 'akta.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.7\n% synthetic birth certificate\n%%EOF\n').toString('base64') },
      reportCards: { name: 'rapor.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.7\n% synthetic report cards\n%%EOF\n').toString('base64') },
      pasPhoto: { name: 'pas-foto.png', mimeType: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') },
    };
    const publicPpdbPayload = {
      clientRequestId: publicPpdbCandidateId,
      candidate: {
        name: 'Calon Santri PPDB HTTP Uji', gender: 'L', grade: 'VII', gradeLevelReferenceId: gradeReference.id,
        previousSchool: 'Sekolah Sintetis', phone: '081234567810', whatsappPhone: '081234567810',
        email: `ppdb-${fixtureSuffix}@example.test`, nik: publicPpdbNik, nisn: '', pob: 'Jakarta',
        dob: '2012-05-06', address: 'Alamat sintetis untuk pengujian.', province: 'DKI Jakarta',
        regency: 'Jakarta Selatan', district: 'Tebet', village: 'Tebet Barat', fatherName: 'Ayah Sintetis',
        motherName: 'Ibu Sintetis', fatherJob: 'Wiraswasta', motherJob: 'Guru', fatherEducation: 'SMA',
        motherEducation: 'SMA', familyIncome: 'Tidak dicatat',
      },
      files: publicPpdbFiles,
    };
    const publicPpdbHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const publicPpdbSubmit = await fetch(`${apiBase}/api/public/ppdb/registrations`, {
      method: 'POST', headers: publicPpdbHeaders, body: JSON.stringify(publicPpdbPayload),
    });
    const publicPpdbSubmitBody = await publicPpdbSubmit.json();
    assert.equal(publicPpdbSubmit.status, 201, `A valid public PPDB request should be saved (${publicPpdbSubmit.status}: ${publicPpdbSubmitBody.error || 'unknown response'}).`);
    assert.equal(publicPpdbSubmit.headers.get('cache-control'), 'no-store');
    assert.equal(publicPpdbSubmitBody.candidate.id, publicPpdbCandidateId);
    assert.match(publicPpdbSubmitBody.candidate.registrationId, /^PPDB-2027-\d{6}$/);
    assert.equal(publicPpdbSubmitBody.candidate.stage, 'Registered');
    assert.equal(publicPpdbSubmitBody.candidate.documents.kk, true);
    assert.equal(publicPpdbSubmitBody.candidate.documents.birthCertificate, true);
    assert.equal(publicPpdbSubmitBody.candidate.documents.reportCards, true);
    assert.equal(publicPpdbSubmitBody.candidate.documents.pasPhoto, true);
    assert.equal(Object.hasOwn(publicPpdbSubmitBody.candidate, 'nikCiphertext'), false, 'The API response must not expose encrypted identity internals.');
    assert.equal(Object.hasOwn(publicPpdbSubmitBody.candidate, 'nikFingerprint'), false, 'The API response must not expose identity fingerprints.');

    const { data: savedPublicCandidate, error: savedPublicCandidateError } = await admin.from('candidates')
      .select('id,tenant_id,registration_id,name,grade,grade_level_reference_id,nik_ciphertext,nik_fingerprint,nisn_ciphertext,nisn_fingerprint')
      .eq('tenant_id', tenantId)
      .eq('id', publicPpdbCandidateId)
      .single();
    assertNoError({ error: savedPublicCandidateError }, 'Unable to verify the persisted public PPDB candidate.');
    assert.equal(savedPublicCandidate.registration_id, publicPpdbSubmitBody.candidate.registrationId);
    assert.equal(savedPublicCandidate.name, 'Calon Santri PPDB HTTP Uji');
    assert.equal(savedPublicCandidate.grade, 'VII');
    assert.equal(savedPublicCandidate.grade_level_reference_id, gradeReference.id, 'The public grade selection must persist as a tenant reference relationship.');
    assert.match(savedPublicCandidate.nik_ciphertext, /^\\x[0-9a-f]{88}$/i, 'NIK must be encrypted before it reaches the candidate row.');
    assert.equal(savedPublicCandidate.nik_ciphertext.includes(publicPpdbNik), false, 'NIK plaintext must not be persisted as ciphertext.');
    const expectedNikFingerprint = createHmac('sha256', Buffer.from(TEST_PII_FINGERPRINT_KEY, 'hex'))
      .update(`nik:${publicPpdbNik}`)
      .digest('hex');
    assert.equal(savedPublicCandidate.nik_fingerprint, `\\x${expectedNikFingerprint}`, 'NIK uniqueness must use the keyed fingerprint, not plaintext.');

    const { data: publicIdentityClaim, error: publicIdentityClaimError } = await admin.from('identity_claims')
      .select('tenant_id,identity_type,entity_type,entity_id,fingerprint')
      .eq('tenant_id', tenantId)
      .eq('identity_type', 'nik')
      .eq('entity_id', publicPpdbCandidateId)
      .single();
    assertNoError({ error: publicIdentityClaimError }, 'Unable to verify the public PPDB NIK uniqueness relation.');
    assert.equal(publicIdentityClaim.entity_type, 'candidate');
    assert.equal(publicIdentityClaim.fingerprint, `\\x${expectedNikFingerprint}`);

    const { data: savedPublicDocuments, error: savedPublicDocumentsError } = await admin.from('candidate_documents')
      .select('tenant_id,candidate_id,kk,kk_path,birth_certificate,birth_certificate_path,report_cards,report_cards_path,pas_photo,pas_photo_path')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', publicPpdbCandidateId)
      .single();
    assertNoError({ error: savedPublicDocumentsError }, 'Unable to verify the public PPDB document relation.');
    assert.equal(savedPublicDocuments.tenant_id, tenantId);
    assert.equal(savedPublicDocuments.kk, true);
    assert.equal(savedPublicDocuments.birth_certificate, true);
    assert.equal(savedPublicDocuments.report_cards, true);
    assert.equal(savedPublicDocuments.pas_photo, true);
    const publicDocumentPathByKey = {
      kk: savedPublicDocuments.kk_path,
      birthCertificate: savedPublicDocuments.birth_certificate_path,
      reportCards: savedPublicDocuments.report_cards_path,
      pasPhoto: savedPublicDocuments.pas_photo_path,
    };
    for (const [documentKey, document] of Object.entries(publicPpdbFiles)) {
      const path = publicDocumentPathByKey[documentKey];
      assert.ok(path.startsWith(`${tenantId}/${publicPpdbCandidateId}/${documentKey}-`), `The ${documentKey} relation must point into its tenant/candidate folder.`);
      const { data: storedDocument, error: storedDocumentError } = await admin.storage.from(PPDB_BUCKET).download(path);
      assertNoError({ error: storedDocumentError }, `Unable to read back the synthetic ${documentKey} from private Storage.`);
      assert.deepEqual(Buffer.from(await storedDocument.arrayBuffer()), Buffer.from(document.base64, 'base64'), `The ${documentKey} upload must persist exact bytes.`);
    }

    const publicPpdbReplay = await fetch(`${apiBase}/api/public/ppdb/registrations`, {
      method: 'POST', headers: publicPpdbHeaders, body: JSON.stringify(publicPpdbPayload),
    });
    const publicPpdbReplayBody = await publicPpdbReplay.json();
    assert.equal(publicPpdbReplay.status, 201, 'A same-payload public PPDB retry should resolve to the existing registration.');
    assert.equal(publicPpdbReplayBody.candidate.id, publicPpdbCandidateId);
    assert.equal(publicPpdbReplayBody.candidate.registrationId, publicPpdbSubmitBody.candidate.registrationId);
    const { data: publicCandidatesAfterReplay, error: publicCandidatesAfterReplayError } = await admin.from('candidates')
      .select('id,registration_id')
      .eq('tenant_id', tenantId)
      .eq('id', publicPpdbCandidateId);
    assertNoError({ error: publicCandidatesAfterReplayError }, 'Unable to verify the public PPDB idempotent retry.');
    assert.equal(publicCandidatesAfterReplay.length, 1, 'A retry must not create a duplicate candidate.');
    assert.equal(publicCandidatesAfterReplay[0].registration_id, publicPpdbSubmitBody.candidate.registrationId);
    const { data: publicObjectsAfterReplay, error: publicObjectsAfterReplayError } = await admin.storage.from(PPDB_BUCKET)
      .list(`${tenantId}/${publicPpdbCandidateId}`, { limit: 20 });
    assertNoError({ error: publicObjectsAfterReplayError }, 'Unable to inspect public PPDB retry cleanup in private Storage.');
    assert.equal(publicObjectsAfterReplay.length, 4, 'A retry must remove the replaced objects and keep only the four current documents.');

    const changedPublicPpdbRetryPayload = structuredClone(publicPpdbPayload);
    changedPublicPpdbRetryPayload.candidate.name = 'Nama yang Berbeda';
    const changedPublicPpdbRetry = await fetch(`${apiBase}/api/public/ppdb/registrations`, {
      method: 'POST', headers: publicPpdbHeaders, body: JSON.stringify(changedPublicPpdbRetryPayload),
    });
    assert.equal(changedPublicPpdbRetry.status, 409, 'The public request ID must not be reused for a different payload.');
    const { data: publicCandidateAfterConflict, error: publicCandidateAfterConflictError } = await admin.from('candidates')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('id', publicPpdbCandidateId)
      .single();
    assertNoError({ error: publicCandidateAfterConflictError }, 'Unable to verify public PPDB conflict did not overwrite the saved candidate.');
    assert.equal(publicCandidateAfterConflict.name, 'Calon Santri PPDB HTTP Uji');
    const { data: publicObjectsAfterConflict, error: publicObjectsAfterConflictError } = await admin.storage.from(PPDB_BUCKET)
      .list(`${tenantId}/${publicPpdbCandidateId}`, { limit: 20 });
    assertNoError({ error: publicObjectsAfterConflictError }, 'Unable to inspect public PPDB conflict cleanup in private Storage.');
    assert.equal(publicObjectsAfterConflict.length, 4, 'A conflicting retry must remove its uncommitted document objects.');

    const duplicateIdentityPayload = structuredClone(publicPpdbPayload);
    duplicateIdentityPayload.clientRequestId = randomUUID();
    duplicateIdentityPayload.candidate.name = 'Kandidat dengan NIK duplikat';
    const duplicateIdentityResponse = await fetch(`${apiBase}/api/public/ppdb/registrations`, {
      method: 'POST', headers: publicPpdbHeaders, body: JSON.stringify(duplicateIdentityPayload),
    });
    assert.equal(duplicateIdentityResponse.status, 409, 'A different public submission cannot claim the same tenant NIK.');
    const { data: publicCandidatesAfterDuplicate, error: publicCandidatesAfterDuplicateError } = await admin.from('candidates')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', duplicateIdentityPayload.clientRequestId);
    assertNoError({ error: publicCandidatesAfterDuplicateError }, 'Unable to verify duplicate public identity rejection.');
    assert.equal(publicCandidatesAfterDuplicate.length, 0, 'A rejected duplicate NIK must not persist a second candidate.');
    const { data: publicObjectsAfterDuplicate, error: publicObjectsAfterDuplicateError } = await admin.storage.from(PPDB_BUCKET)
      .list(`${tenantId}/${publicPpdbCandidateId}`, { limit: 20 });
    assertNoError({ error: publicObjectsAfterDuplicateError }, 'Unable to inspect duplicate identity cleanup in private Storage.');
    assert.equal(publicObjectsAfterDuplicate.length, 4, 'A duplicate-identity rejection must remove uncommitted document objects.');

    const registrationBillRequest = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/bills`,
      financeAdminToken,
      { bill: { paymentType: 'registration', amount: 150000, clientRequestId: ppdbRegistrationBillRequestId } },
    );
    assert.equal(registrationBillRequest.response.status, 201, `An authorized Admin should issue a registration bill (${registrationBillRequest.response.status}: ${registrationBillRequest.body.error || 'unknown response'}).`);
    assert.equal(registrationBillRequest.body.success, true);
    assert.equal(registrationBillRequest.body.created, 1);
    const registrationBillId = registrationBillRequest.body.billId;
    assert.ok(registrationBillId, 'The registration bill response must include its persisted identifier.');
    const registrationBillRetry = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/bills`,
      financeAdminToken,
      { bill: { paymentType: 'registration', amount: 150000, clientRequestId: ppdbRegistrationBillRequestId } },
    );
    assert.equal(registrationBillRetry.response.status, 201, 'An identical PPDB bill retry must resolve to the original idempotent result.');
    assert.equal(registrationBillRetry.body.billId, registrationBillId);
    const { data: registrationBillsAfterRetry, error: registrationBillsAfterRetryError } = await admin.from('finance_bills')
      .select('id,tenant_id,candidate_id,student_id,payment_type,amount')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', publicPpdbCandidateId)
      .eq('payment_type', 'registration');
    assertNoError({ error: registrationBillsAfterRetryError }, 'Unable to verify the PPDB registration bill relationship.');
    assert.equal(registrationBillsAfterRetry.length, 1, 'An identical bill retry must not create a duplicate candidate invoice.');
    assert.equal(registrationBillsAfterRetry[0].id, registrationBillId);
    assert.equal(registrationBillsAfterRetry[0].student_id, null, 'A candidate bill remains linked to the PPDB candidate until onboarding.');

    const ppdbWorkflow = [
      { core: { stage: 'Document Review' } },
      { core: { stage: 'Entry Exam' } },
      {
        core: { stage: 'Interview' },
        workflow: { examScores: { math: 80, science: 82, english: 78, tpa: 84, quran: 88 } },
      },
      {
        core: { stage: 'Accepted' },
        workflow: { interviewScores: { academicPotential: 4, personality: 5, communication: 4 } },
      },
    ];
    for (const patch of ppdbWorkflow) {
      const result = await authorizedJson(
        `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}`,
        financeAdminToken,
        patch,
        'PATCH',
      );
      assert.equal(result.response.status, 200, `A valid PPDB workflow transition to ${patch.core.stage} should persist (${result.response.status}: ${result.body.error || 'unknown response'}).`);
      assert.equal(result.body.success, true);
    }

    const tuitionBillRequest = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/bills`,
      financeAdminToken,
      { bill: { paymentType: 'tuition', amount: 2500000, clientRequestId: ppdbTuitionBillRequestId } },
    );
    assert.equal(tuitionBillRequest.response.status, 201, `An accepted candidate should receive a tuition bill (${tuitionBillRequest.response.status}: ${tuitionBillRequest.body.error || 'unknown response'}).`);
    assert.equal(tuitionBillRequest.body.success, true);
    assert.equal(tuitionBillRequest.body.created, 1);

    const onboardingAssignment = {
      nis: '',
      classId,
      roomId,
      buildingId,
      waliName: 'Wali Sintetis PPDB Uji',
      waliPhone: '081234567891',
    };
    const onboarding = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/onboard`,
      financeAdminToken,
      { clientRequestId: ppdbOnboardingRequestId, assignment: onboardingAssignment },
    );
    assert.equal(onboarding.response.status, 201, `An accepted candidate should be onboarded atomically (${onboarding.response.status}: ${onboarding.body.error || 'unknown response'}).`);
    assert.equal(onboarding.body.success, true);
    assert.equal(onboarding.body.alreadyOnboarded, false);
    assert.equal(onboarding.body.replayed, false);
    assert.match(onboarding.body.nis, /^\d{10}$/);
    const onboardedStudentId = onboarding.body.santriId;
    const onboardedGuardianId = onboarding.body.waliId;
    assert.ok(onboardedStudentId && onboardedGuardianId, 'Onboarding must return the persisted student and guardian identifiers.');

    const { data: onboardedStudent, error: onboardedStudentError } = await admin.from('students')
      .select('id,tenant_id,source_candidate_id,nis,class_id,room_id,building_id')
      .eq('tenant_id', tenantId)
      .eq('id', onboardedStudentId)
      .single();
    assertNoError({ error: onboardedStudentError }, 'Unable to verify the PPDB onboarding student relation.');
    assert.equal(onboardedStudent.source_candidate_id, publicPpdbCandidateId);
    assert.equal(onboardedStudent.class_id, classId);
    assert.equal(onboardedStudent.room_id, roomId);
    assert.equal(onboardedStudent.building_id, buildingId);
    assert.equal(onboardedStudent.nis, onboarding.body.nis);

    const { data: onboardedGuardianLink, error: onboardedGuardianLinkError } = await admin.from('guardian_students')
      .select('tenant_id,guardian_id,student_id')
      .eq('tenant_id', tenantId)
      .eq('guardian_id', onboardedGuardianId)
      .eq('student_id', onboardedStudentId)
      .single();
    assertNoError({ error: onboardedGuardianLinkError }, 'Unable to verify the PPDB guardian-to-student relationship.');
    assert.equal(onboardedGuardianLink.tenant_id, tenantId);
    const { data: onboardedGuardian, error: onboardedGuardianError } = await admin.from('guardians')
      .select('id,tenant_id,source_candidate_id,name,phone')
      .eq('tenant_id', tenantId)
      .eq('id', onboardedGuardianId)
      .single();
    assertNoError({ error: onboardedGuardianError }, 'Unable to verify the PPDB guardian record.');
    assert.equal(onboardedGuardian.source_candidate_id, publicPpdbCandidateId);
    assert.equal(onboardedGuardian.name, onboardingAssignment.waliName);

    const { data: completedCandidate, error: completedCandidateError } = await admin.from('candidates')
      .select('stage,onboarding_status,master_student_id,master_guardian_id,nis')
      .eq('tenant_id', tenantId)
      .eq('id', publicPpdbCandidateId)
      .single();
    assertNoError({ error: completedCandidateError }, 'Unable to verify the PPDB candidate onboarding state.');
    assert.equal(completedCandidate.stage, 'Accepted');
    assert.equal(completedCandidate.onboarding_status, 'Completed');
    assert.equal(completedCandidate.master_student_id, onboardedStudentId);
    assert.equal(completedCandidate.master_guardian_id, onboardedGuardianId);
    assert.equal(completedCandidate.nis, onboarding.body.nis);

    const { data: onboardingReservation, error: onboardingReservationError } = await admin.from('nis_reservations')
      .select('tenant_id,nis,candidate_id,student_id,source')
      .eq('tenant_id', tenantId)
      .eq('nis', onboarding.body.nis)
      .single();
    assertNoError({ error: onboardingReservationError }, 'Unable to verify the onboarding NIS reservation.');
    assert.equal(onboardingReservation.candidate_id, publicPpdbCandidateId);
    assert.equal(onboardingReservation.student_id, onboardedStudentId);
    assert.equal(onboardingReservation.source, 'ppdb_onboarding');

    const { data: transitionedIdentityClaim, error: transitionedIdentityClaimError } = await admin.from('identity_claims')
      .select('entity_type,entity_id')
      .eq('tenant_id', tenantId)
      .eq('identity_type', 'nik')
      .eq('entity_id', onboardedStudentId)
      .single();
    assertNoError({ error: transitionedIdentityClaimError }, 'Unable to verify the identity claim moved to the onboarded student.');
    assert.equal(transitionedIdentityClaim.entity_type, 'santri');

    const { data: occupiedOnboardingRoom, error: occupiedOnboardingRoomError } = await admin.from('master_data_records')
      .select('occupied')
      .eq('tenant_id', tenantId)
      .eq('category', 'Kamar')
      .eq('id', roomId)
      .single();
    assertNoError({ error: occupiedOnboardingRoomError }, 'Unable to verify room occupancy after onboarding.');
    assert.equal(occupiedOnboardingRoom.occupied, 1, 'Onboarding must increase room occupancy exactly once.');

    const { data: linkedCandidateBills, error: linkedCandidateBillsError } = await admin.from('finance_bills')
      .select('id,candidate_id,student_id,payment_type,amount')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', publicPpdbCandidateId)
      .order('payment_type');
    assertNoError({ error: linkedCandidateBillsError }, 'Unable to verify PPDB bills after student onboarding.');
    assert.equal(linkedCandidateBills.length, 2, 'Registration and tuition bills should both remain linked to the candidate.');
    assert.ok(linkedCandidateBills.every((bill) => bill.student_id === onboardedStudentId), 'Onboarding must link all candidate bills to the new student.');

    const onboardingRetry = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/onboard`,
      financeAdminToken,
      { clientRequestId: ppdbOnboardingRequestId, assignment: onboardingAssignment },
    );
    assert.equal(onboardingRetry.response.status, 200, 'An identical onboarding retry should return the existing student and guardian.');
    assert.equal(onboardingRetry.body.alreadyOnboarded, true);
    assert.equal(onboardingRetry.body.replayed, true);
    assert.equal(onboardingRetry.body.santriId, onboardedStudentId);
    assert.equal(onboardingRetry.body.waliId, onboardedGuardianId);
    const changedOnboardingRetry = await authorizedJson(
      `${apiBase}/api/ppdb/candidates/${publicPpdbCandidateId}/onboard`,
      financeAdminToken,
      { clientRequestId: ppdbOnboardingRequestId, assignment: { ...onboardingAssignment, roomId: alternateRoomId } },
    );
    assert.equal(changedOnboardingRetry.response.status, 409, 'An onboarding request ID cannot be reused for a different room assignment.');
    const { data: alternateRoomAfterConflict, error: alternateRoomAfterConflictError } = await admin.from('master_data_records')
      .select('occupied')
      .eq('tenant_id', tenantId)
      .eq('category', 'Kamar')
      .eq('id', alternateRoomId)
      .single();
    assertNoError({ error: alternateRoomAfterConflictError }, 'Unable to verify changed onboarding retry did not affect another room.');
    assert.equal(alternateRoomAfterConflict.occupied, 0, 'A conflicting onboarding retry must not change room occupancy.');

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const limitedAttempt = await fetch(`${apiBase}/api/finance/payment-proofs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rateLimitToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(limitedAttempt.status, 400, `Rate limit should allow attempt ${attempt} before payload validation.`);
    }
    const blockedAttempt = await fetch(`${apiBase}/api/finance/payment-proofs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rateLimitToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(blockedAttempt.status, 429, 'Finance proof upload limit must reject the 13th request across API calls.');
    assert.equal(blockedAttempt.headers.get('retry-after'), '900');

    const ppdbDownload = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/kk`, {
      headers: { Authorization: `Bearer ${financeAdminToken}` },
    });
    assert.equal(ppdbDownload.status, 200, 'A tenant Admin with PPDB access should download a candidate document through the server.');
    assert.equal(ppdbDownload.headers.get('content-type'), 'application/pdf');
    assert.match(ppdbDownload.headers.get('content-disposition') || '', /attachment; filename="ppdb-kk-/);
    assert.equal(ppdbDownload.headers.get('cache-control'), 'private, no-store');
    assert.equal(ppdbDownload.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await ppdbDownload.arrayBuffer()), ppdbDocumentBytes, 'Authorized PPDB download must return the exact stored bytes.');

    const offlineDocumentBytes = Buffer.from('%PDF-1.7\n% ERP4 synthetic Admin PPDB attachment\n%%EOF\n', 'utf8');
    const ppdbUploadRequestId = randomUUID();
    const adminPpdbUpload = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/birthCertificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: ppdbUploadRequestId,
        file: { mimeType: 'application/pdf', base64: offlineDocumentBytes.toString('base64') },
      }),
    });
    const adminPpdbUploadBody = await adminPpdbUpload.json();
    assert.equal(adminPpdbUpload.status, 201, 'A tenant Admin with PPDB permission should attach an offline candidate document (HTTP ' + adminPpdbUpload.status + ': ' + (adminPpdbUploadBody.error || 'unknown response') + ').');
    assert.equal(adminPpdbUploadBody.documentKey, 'birthCertificate');
    assert.equal(Object.hasOwn(adminPpdbUploadBody, 'storagePath'), false, 'The upload response must not expose internal object paths.');

    const { data: uploadedCandidateDocument, error: uploadedCandidateDocumentError } = await admin.from('candidate_documents')
      .select('birth_certificate,birth_certificate_path')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', candidateId)
      .single();
    assertNoError({ error: uploadedCandidateDocumentError }, 'Unable to inspect the synthetic Admin PPDB attachment metadata.');
    assert.equal(uploadedCandidateDocument.birth_certificate, true, 'A successful attachment must update document completeness.');
    ppdbUploadPath = uploadedCandidateDocument.birth_certificate_path;
    assert.ok(ppdbUploadPath.startsWith(`${tenantId}/${candidateId}/birthCertificate-`), 'The uploaded object path must be scoped to the tenant, candidate, and document type.');

    const { data: uploadEvents, error: uploadEventsError } = await admin.from('ppdb_document_upload_events')
      .select('tenant_id,candidate_id,actor_user_id,document_key,content_sha256')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', candidateId);
    assertNoError({ error: uploadEventsError }, 'Unable to inspect the synthetic PPDB upload audit record.');
    assert.equal(uploadEvents.length, 1, 'A successful document upload must be audited exactly once.');
    assert.equal(uploadEvents[0].actor_user_id, financeAdmin.uid);
    assert.equal(uploadEvents[0].document_key, 'birthCertificate');
    assert.equal(uploadEvents[0].content_sha256, '\\x' + createHash('sha256').update(offlineDocumentBytes).digest('hex'));

    const repeatedPpdbUpload = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/birthCertificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: ppdbUploadRequestId,
        file: { mimeType: 'application/pdf', base64: offlineDocumentBytes.toString('base64') },
      }),
    });
    assert.equal(repeatedPpdbUpload.status, 200, 'A retry after a lost response must return the original committed upload.');
    assert.equal((await repeatedPpdbUpload.json()).alreadyApplied, true);

    const changedRetry = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/birthCertificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: ppdbUploadRequestId,
        file: { mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.7\n% changed file\n%%EOF\n').toString('base64') },
      }),
    });
    assert.equal(changedRetry.status, 409, 'An idempotency key cannot be reused for different document bytes.');

    const duplicatePpdbDocument = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/birthCertificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: randomUUID(),
        file: { mimeType: 'application/pdf', base64: offlineDocumentBytes.toString('base64') },
      }),
    });
    assert.equal(duplicatePpdbDocument.status, 409, 'A separate upload request cannot silently replace an existing document.');

    const invalidPpdbSignature = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/reportCards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: randomUUID(), file: { mimeType: 'image/png', base64: offlineDocumentBytes.toString('base64') } }),
    });
    assert.equal(invalidPpdbSignature.status, 400, 'The server must reject a declared MIME type that does not match file bytes.');

    const oversizedPpdbDocument = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/reportCards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: randomUUID(),
        file: { mimeType: 'application/pdf', base64: Buffer.alloc(1024 * 1024 + 1, 65).toString('base64') },
      }),
    });
    assert.equal(oversizedPpdbDocument.status, 400, 'The server must reject documents larger than 1 MB before Storage upload.');

    const foreignCandidateUpload = await fetch(`${apiBase}/api/ppdb/candidates/${foreignCandidateId}/documents/kk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${financeAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: randomUUID(), file: { mimeType: 'application/pdf', base64: offlineDocumentBytes.toString('base64') } }),
    });
    assert.equal(foreignCandidateUpload.status, 404, 'A tenant Admin cannot attach a file to a candidate in another tenant.');

    const ppdbCandidateDirectory = `${tenantId}/${candidateId}`;
    const { data: candidateObjects, error: candidateObjectsError } = await admin.storage.from(PPDB_BUCKET).list(ppdbCandidateDirectory, { limit: 20 });
    assertNoError({ error: candidateObjectsError }, 'Unable to inspect synthetic private PPDB candidate objects.');
    assert.equal(candidateObjects.filter(({ name }) => name.startsWith('birthCertificate-')).length, 1, 'Retries and rejected uploads must not leave duplicate private objects.');
    const directPpdbUploadRead = await fetch(`${url}/storage/v1/object/${PPDB_BUCKET}/${ppdbUploadPath.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: anonKey },
    });
    assert.ok(!directPpdbUploadRead.ok, 'The newly uploaded Admin attachment must remain private to browser clients.');
    const downloadedAdminAttachment = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/birthCertificate`, {
      headers: { Authorization: `Bearer ${financeAdminToken}` },
    });
    assert.equal(downloadedAdminAttachment.status, 200, 'The Admin can download the attachment through the authorized API.');
    assert.deepEqual(Buffer.from(await downloadedAdminAttachment.arrayBuffer()), offlineDocumentBytes, 'The authorized API must return the exact uploaded bytes.');

    const anonymousPpdbStorageRead = await fetch(`${url}/storage/v1/object/${PPDB_BUCKET}/${ppdbDocumentPath.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: anonKey },
    });
    assert.ok(!anonymousPpdbStorageRead.ok, 'Anonymous browser access must not read private PPDB documents.');
    const authenticatedPpdbStorageRead = await fetch(`${url}/storage/v1/object/${PPDB_BUCKET}/${ppdbDocumentPath.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${financeAdminToken}` },
    });
    assert.ok(!authenticatedPpdbStorageRead.ok, 'Authenticated browser access must not bypass server-only PPDB Storage.');

    const waliPpdbDownload = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/kk`, {
      headers: { Authorization: `Bearer ${guardianToken}` },
    });
    assert.equal(waliPpdbDownload.status, 403, 'Wali accounts must not download PPDB candidate records as an Admin.');
    const foreignTenantPpdbDownload = await fetch(`${apiBase}/api/ppdb/candidates/${foreignCandidateId}/documents/kk`, {
      headers: { Authorization: `Bearer ${financeAdminToken}` },
    });
    assert.equal(foreignTenantPpdbDownload.status, 404, 'An Admin must not read a candidate document from another tenant.');
    const { data: accessEvents, error: accessEventsError } = await admin.from('ppdb_document_access_events')
      .select('tenant_id,candidate_id,actor_user_id,document_key,content_sha256')
      .eq('tenant_id', tenantId)
      .eq('candidate_id', candidateId);
    assertNoError({ error: accessEventsError }, 'Unable to read synthetic PPDB document audit events.');
    assert.equal(accessEvents.length, 2, 'Only the two successful Admin downloads must be audited.');
    assert.ok(accessEvents.every((event) => event.actor_user_id === financeAdmin.uid));
    assert.deepEqual(accessEvents.map((event) => event.document_key).sort(), ['birthCertificate', 'kk']);
    const originalDownloadEvent = accessEvents.find((event) => event.document_key === 'kk');
    assert.equal(originalDownloadEvent.content_sha256, '\\x' + createHash('sha256').update(ppdbDocumentBytes).digest('hex'));

    const pdfBytes = Buffer.from('%PDF-1.7\n% ERP4 synthetic test payment proof\n%%EOF\n', 'utf8');
    const proofRequestId = randomUUID();
    const uploadResponse = await fetch(`${apiBase}/api/finance/payment-proofs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingId: bill.id,
        mimeType: 'application/pdf',
        base64: pdfBytes.toString('base64'),
        payChannel: 'BSI',
        clientRequestId: proofRequestId,
        fileName: 'synthetic-proof.pdf',
      }),
    });
    const uploadPayload = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201, 'A linked guardian should be able to submit a valid payment proof (HTTP ' + uploadResponse.status + ': ' + (uploadPayload.error || uploadPayload.code || 'unknown response') + ').');
    assert.equal(uploadPayload.proofStorageProvider, 'supabase');
    uploadedPath = uploadPayload.proofStoragePath;
    assert.ok(uploadedPath.startsWith(`financeProofs/${tenantId}/${studentId}/${bill.id}/`), 'The object path must be scoped to its tenant, student, and bill.');

    const encodedPath = uploadedPath.split('/').map(encodeURIComponent).join('/');
    const anonymousStorageRead = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      headers: { apikey: anonKey },
    });
    assert.ok(!anonymousStorageRead.ok, 'Anonymous browser access must not read a private proof object.');

    const authenticatedBrowserStorageRead = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${guardianToken}` },
    });
    assert.ok(!authenticatedBrowserStorageRead.ok, 'Authenticated browser access must not bypass the server-only Storage policy.');

    const downloaded = await fetch(`${apiBase}/api/finance/payment-proofs/${bill.id}`, {
      headers: { Authorization: `Bearer ${guardianToken}` },
    });
    assert.equal(downloaded.status, 200, 'The linked guardian should read the proof through the authorized API.');
    assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdfBytes, 'The authorized API must return the exact uploaded bytes.');

    const wrongGuardianDownload = await fetch(`${apiBase}/api/finance/payment-proofs/${bill.id}`, {
      headers: { Authorization: `Bearer ${otherGuardianToken}` },
    });
    assert.equal(wrongGuardianDownload.status, 404, 'An unrelated guardian must not read another student’s proof.');

    const retry = await fetch(`${apiBase}/api/finance/payment-proofs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guardianToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingId: bill.id,
        mimeType: 'application/pdf',
        base64: pdfBytes.toString('base64'),
        payChannel: 'BSI',
        clientRequestId: proofRequestId,
        fileName: 'synthetic-proof.pdf',
      }),
    });
    assert.equal(retry.status, 200, 'An idempotent upload retry should return the original proof result.');
    const retryPayload = await retry.json();
    assert.equal(retryPayload.alreadyApplied, true);
    assert.equal(retryPayload.proofStoragePath, uploadedPath);

    const { data: storedBill, error: storedBillError } = await admin.from('finance_bills')
      .select('status,proof_storage_path,proof_storage_provider')
      .eq('tenant_id', tenantId)
      .eq('id', bill.id)
      .single();
    assertNoError({ error: storedBillError }, 'Unable to verify the committed Finance proof metadata.');
    assert.equal(storedBill.status, 'verification');
    assert.equal(storedBill.proof_storage_provider, 'supabase');
    assert.equal(storedBill.proof_storage_path, uploadedPath);

    const proofDirectory = uploadedPath.split('/').slice(0, 4).join('/');
    const { data: storedObjects, error: listError } = await admin.storage.from(BUCKET).list(proofDirectory, { limit: 10 });
    assertNoError({ error: listError }, 'Unable to inspect the synthetic private proof directory.');
    assert.equal(storedObjects.length, 1, 'The idempotent retry must not leave an orphan duplicate object.');

    console.log(`Storage/PPDB HTTP tests passed (${target}): Finance proof upload/download, public PPDB configuration and registration persistence, encrypted identity, private document upload/read-back, candidate billing, PPDB workflow acceptance, atomic onboarding with NIS/guardian/class/room relationships, linked invoices, idempotent retries, conflict rejection, tenant/RBAC boundaries, and rate limits.`);
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(5000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }

    const cleanupErrors = [];
    await cleanupStep(cleanupErrors, 'synthetic fixture isolation', () => isolateSyntheticTenantFixture(admin, {
      tenantIds: createdTenantIds,
      userIds: users.map((user) => user.uid),
    }));
    if (uploadedPath) await cleanupStep(cleanupErrors, 'Finance proof object', () => admin.storage.from(BUCKET).remove([uploadedPath]));
    if (publicPpdbCandidateId) {
      await cleanupStep(cleanupErrors, 'public PPDB document objects', async () => {
        const directory = `${tenantId}/${publicPpdbCandidateId}`;
        const { data, error } = await admin.storage.from(PPDB_BUCKET).list(directory, { limit: 100 });
        if (error) throw error;
        const paths = (data || []).map((item) => `${directory}/${item.name}`);
        if (paths.length) {
          const { error: removeError } = await admin.storage.from(PPDB_BUCKET).remove(paths);
          if (removeError) throw removeError;
        }
      });
    }
    const ppdbObjects = [ppdbDocumentPath, ppdbUploadPath, foreignDocumentPath].filter(Boolean);
    if (ppdbObjects.length) await cleanupStep(cleanupErrors, 'PPDB document objects', () => admin.storage.from(PPDB_BUCKET).remove(ppdbObjects));
    if (createdTenantIds.includes(tenantId)) {
      for (const table of ['finance_write_requests', 'finance_controls', 'finance_bills', 'nis_reservations', 'cooperative_wallets', 'guardian_user_accounts', 'guardian_students', 'candidate_documents']) {
        await cleanupStep(cleanupErrors, `${table} tenant rows`, () => admin.from(table).delete().eq('tenant_id', tenantId));
      }
      // Onboarded guardian/student rows are referenced by immutable PPDB onboarding events;
      // the suspended tenant and banned synthetic accounts are the isolation boundary.
    }
    if (createdTenantIds.includes(foreignTenantId)) {
      for (const table of ['candidate_documents']) {
        await cleanupStep(cleanupErrors, `${table} foreign tenant rows`, () => admin.from(table).delete().eq('tenant_id', foreignTenantId));
      }
    }
    if (cleanupErrors.length) {
      console.error(`Staging/local fixture cleanup incomplete: ${cleanupErrors.join(', ')}.`);
      process.exitCode = 1;
    } else {
      console.log(`Synthetic ${target} tenant fixtures are suspended; Auth users are banned and append-only references remain available for audit.`);
    }
  }
}

main().catch((error) => {
  const detail = error instanceof assert.AssertionError
    ? error.message
    : error?.message || error?.code || error?.name || 'unknown error';
  console.error(`Finance Storage HTTP test failed (${detail}). Check the selected Supabase test project and migration state.`);
  process.exitCode = 1;
});

