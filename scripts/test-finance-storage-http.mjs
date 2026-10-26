import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'erp4-private-finance-proofs';
const PPDB_BUCKET = 'ppdb-documents';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase local status did not expose the local API URL and test keys.');
  }
  return { url, anonKey, serviceKey };
}

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
    module_permissions: role === 'admin' ? { finance: true, ppdb: true } : { finance: true },
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

function assertNoError(result, message) {
  if (result?.error) throw new Error(message);
}

async function main() {
  const { url, anonKey, serviceKey } = localSupabaseEnvironment();
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
  const fixtureSuffix = randomUUID().slice(0, 10);
  const classId = `storage-class-${fixtureSuffix}`;
  const roomId = `storage-room-${fixtureSuffix}`;
  const users = [];
  let serverProcess;
  let uploadedPath = '';
  let ppdbDocumentPath = '';
  let foreignDocumentPath = '';

  try {
    const { error: tenantError } = await admin.from('tenants').insert({
      id: tenantId,
      slug: `storage-http-${fixtureSuffix}`,
      name: `Storage HTTP Test ${fixtureSuffix}`,
      status: 'active',
    });
    if (tenantError) throw new Error('Unable to create a synthetic finance tenant.');
    const { error: foreignTenantError } = await admin.from('tenants').insert({
      id: foreignTenantId,
      slug: `storage-foreign-${fixtureSuffix}`,
      name: `Foreign PPDB Storage Test ${fixtureSuffix}`,
      status: 'active',
    });
    if (foreignTenantError) throw new Error('Unable to create a foreign synthetic tenant.');

    const financeAdmin = await createUser(admin, tenantId, 'admin', 'finance-admin');
    users.push(financeAdmin);
    const { error: structuresError } = await admin.from('master_data_records').insert([
      { tenant_id: tenantId, category: 'Kelas', id: classId, name: 'Kelas storage test' },
      { tenant_id: tenantId, category: 'Kamar', id: roomId, name: 'Kamar storage test', capacity: 10 },
    ]);
    if (structuresError) throw new Error('Unable to create synthetic student structures.');

    const { error: candidateError } = await admin.from('candidates').insert({
      id: candidateId,
      tenant_id: tenantId,
      registration_id: `ST-${fixtureSuffix}`,
      name: 'Santri Storage Test',
    });
    if (candidateError) throw new Error('Unable to create a synthetic candidate.');

    const { error: foreignCandidateError } = await admin.from('candidates').insert({
      id: foreignCandidateId,
      tenant_id: foreignTenantId,
      registration_id: `FOREIGN-${fixtureSuffix}`,
      name: 'Foreign tenant candidate',
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

    const { error: studentError } = await admin.from('students').insert({
      id: studentId,
      tenant_id: tenantId,
      source_candidate_id: candidateId,
      nis: `98${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      name: 'Santri Storage Test',
      gender: 'L',
      grade: 'VII',
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

    const { error: otherCandidateError } = await admin.from('candidates').insert({
      id: otherCandidateId,
      tenant_id: tenantId,
      registration_id: `ST-${fixtureSuffix}-OTHER`,
      name: 'Santri Storage Test Other',
    });
    if (otherCandidateError) throw new Error('Unable to create the unrelated guardian candidate.');

    const { error: otherStudentError } = await admin.from('students').insert({
      id: otherStudentId,
      tenant_id: tenantId,
      source_candidate_id: otherCandidateId,
      nis: `97${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`,
      name: 'Santri Storage Test Other',
      gender: 'L',
      grade: 'VII',
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

    const { data: billResult, error: billError } = await admin.rpc('create_tenant_finance_bills', {
      p_tenant_id: tenantId,
      p_actor_user_id: financeAdmin.uid,
      p_expected_role: 'admin',
      p_items: [{ studentId, feeType: 'SPP', period: `storage-${fixtureSuffix}`, amount: 50000 }],
      p_client_request_id: billRequestId,
    });
    if (billError || billResult?.created !== 1) throw new Error('Unable to create a synthetic Finance bill.');

    const { data: bill, error: billLookupError } = await admin.from('finance_bills')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('student_id', studentId)
      .eq('fee_type', 'SPP')
      .eq('period', `storage-${fixtureSuffix}`)
      .single();
    if (billLookupError || !bill?.id) throw new Error('Unable to find the synthetic Finance bill.');

    const guardianToken = await signIn(anon, guardian);
    const otherGuardianToken = await signIn(anon, otherGuardian);
    const financeAdminToken = await signIn(anon, financeAdmin);
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
        SUPABASE_FINANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_FINANCE_PROOF_STORAGE_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_RUNTIME_ENABLED: 'true',
        SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED: 'true',
        LEGACY_FIREBASE_ADMIN_ENABLED: 'false',
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

    const ppdbDownload = await fetch(`${apiBase}/api/ppdb/candidates/${candidateId}/documents/kk`, {
      headers: { Authorization: `Bearer ${financeAdminToken}` },
    });
    assert.equal(ppdbDownload.status, 200, 'A tenant Admin with PPDB access should download a candidate document through the server.');
    assert.equal(ppdbDownload.headers.get('content-type'), 'application/pdf');
    assert.match(ppdbDownload.headers.get('content-disposition') || '', /attachment; filename="ppdb-kk-/);
    assert.equal(ppdbDownload.headers.get('cache-control'), 'private, no-store');
    assert.equal(ppdbDownload.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await ppdbDownload.arrayBuffer()), ppdbDocumentBytes, 'Authorized PPDB download must return the exact stored bytes.');

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
    assert.equal(accessEvents.length, 1, 'Only the successful Admin download must be audited.');
    assert.equal(accessEvents[0].actor_user_id, financeAdmin.uid);
    assert.equal(accessEvents[0].document_key, 'kk');
    assert.equal(accessEvents[0].content_sha256, '\\x' + createHash('sha256').update(ppdbDocumentBytes).digest('hex'));

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

    console.log('Storage HTTP tests passed: Finance proof upload/download and PPDB Admin document download, private-bucket isolation, tenant/RBAC boundaries, audit logging, idempotency, and cleanup.');
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(5000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }

    if (uploadedPath) {
      try { await admin.storage.from(BUCKET).remove([uploadedPath]); } catch {}
    }
    const ppdbObjects = [ppdbDocumentPath, foreignDocumentPath].filter(Boolean);
    if (ppdbObjects.length) {
      try { await admin.storage.from(PPDB_BUCKET).remove(ppdbObjects); } catch {}
    }
    for (const table of ['ppdb_document_access_events', 'finance_write_requests', 'finance_controls', 'finance_bills', 'nis_reservations', 'cooperative_wallets', 'guardian_user_accounts', 'guardian_students', 'guardians', 'students', 'candidate_documents', 'candidates', 'master_data_records']) {
      try { await admin.from(table).delete().eq('tenant_id', tenantId); } catch {}
    }
    for (const table of ['ppdb_document_access_events', 'candidate_documents', 'candidates']) {
      try { await admin.from(table).delete().eq('tenant_id', foreignTenantId); } catch {}
    }
    for (const user of users) {
      try { await admin.auth.admin.deleteUser(user.uid); } catch {}
    }
    try { await admin.from('tenants').delete().eq('id', foreignTenantId); } catch {}
    try { await admin.from('tenants').delete().eq('id', tenantId); } catch {}
  }
}

main().catch((error) => {
  const detail = error instanceof assert.AssertionError
    ? error.message
    : error?.code || error?.name || 'unknown error';
  console.error(`Finance Storage HTTP test failed (${detail}). Check the local Supabase stack and migration state.`);
  process.exitCode = 1;
});
