import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseTestEnvironment } from './supabase-test-environment.mjs';
import { isolateSyntheticTenantFixture } from './synthetic-tenant-fixture.mjs';

const BUCKET = 'erp4-private-document-attachments';
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

async function createUser(admin, tenantId, label, documentPermission) {
  const id = randomUUID();
  const email = `document-http-${label}-${id.slice(0, 8)}@example.test`;
  const password = `Document-Test-${id}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Document HTTP test ${label}` },
  });
  if (error || !data.user) throw new Error(`Unable to create synthetic Auth user (${label}).`);

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    tenant_id: tenantId,
    email,
    display_name: `Document HTTP test ${label}`,
    username: `doc-${label}-${id.slice(0, 8)}`,
    role: 'admin',
    status: 'active',
    module_permissions: { document: documentPermission },
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Unable to create synthetic profile (${label}).`);
  }
  return { uid: data.user.id, email, password };
}

async function signIn(anon, user) {
  const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session?.access_token) throw new Error('Unable to sign in a synthetic test user.');
  return data.session.access_token;
}

async function expectJson(response, expectedStatus, label) {
  const body = await response.clone().json().catch(() => null);
  assert.equal(response.status, expectedStatus, `${label} (HTTP ${response.status}: ${body?.error || 'no response body'})`);
  assert.ok(body && typeof body === 'object', `${label} must return JSON.`);
  return body;
}

async function requestJson(url, token, body, method = 'POST') {
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function storageObjectUrl(baseUrl, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`;
}

async function createTenant(admin, tenantId, slug, name) {
  const { error } = await admin.from('tenants').insert({ id: tenantId, slug, name, status: 'active' });
  if (error) throw new Error(`Unable to create synthetic tenant (${slug}).`);
}

async function main() {
  const { url, anonKey, serviceKey, target } = getSupabaseTestEnvironment({ allowStagingWrites: true });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenantId = randomUUID();
  const foreignTenantId = randomUUID();
  const fixtureSuffix = randomUUID().slice(0, 10);
  const users = [];
  const createdTenantIds = [];
  const storagePaths = new Set();
  let serverProcess;

  try {
    await createTenant(admin, tenantId, `document-http-${fixtureSuffix}`, `Document HTTP Test ${fixtureSuffix}`);
    createdTenantIds.push(tenantId);
    await createTenant(admin, foreignTenantId, `document-foreign-${fixtureSuffix}`, `Foreign Document Test ${fixtureSuffix}`);
    createdTenantIds.push(foreignTenantId);

    const documentAdmin = await createUser(admin, tenantId, 'admin', true);
    const noDocumentAccess = await createUser(admin, tenantId, 'denied', false);
    const foreignAdmin = await createUser(admin, foreignTenantId, 'foreign', true);
    users.push(documentAdmin, noDocumentAccess, foreignAdmin);
    const [adminToken, deniedToken, foreignToken] = await Promise.all([
      signIn(anon, documentAdmin), signIn(anon, noDocumentAccess), signIn(anon, foreignAdmin),
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
        SUPABASE_DOCUMENT_RUNTIME_ENABLED: 'true',
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

    const unauthenticated = await fetch(`${apiBase}/api/documents`);
    await expectJson(unauthenticated, 401, 'Unauthenticated users must not list documents');

    const initialList = await fetch(`${apiBase}/api/documents`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const initial = await expectJson(initialList, 200, 'Tenant Admin should list documents');
    assert.deepEqual(initial.documents, []);

    const deniedList = await fetch(`${apiBase}/api/documents`, { headers: { Authorization: `Bearer ${deniedToken}` } });
    await expectJson(deniedList, 403, 'Admin without Document permission must be denied');

    const clientRequestId = randomUUID();
    const documentInput = {
      clientRequestId,
      direction: 'incoming',
      subject: 'Undangan rapat koordinasi uji',
      senderName: 'Kantor Kecamatan Sintetis',
      recipientName: 'Pimpinan Pesantren Uji',
      documentDate: '2027-02-10',
      summary: 'Data sintetis untuk memastikan pencatatan dan pembacaan ulang.',
    };
    const createdResponse = await requestJson(`${apiBase}/api/documents`, adminToken, { document: documentInput });
    const created = await expectJson(createdResponse, 201, 'Authorized Admin should register a document');
    assert.equal(created.alreadyApplied, false);
    assert.ok(created.documentId);

    const retryResponse = await requestJson(`${apiBase}/api/documents`, adminToken, { document: documentInput });
    const retried = await expectJson(retryResponse, 200, 'Identical document retry should be idempotent');
    assert.equal(retried.alreadyApplied, true);
    assert.equal(retried.documentId, created.documentId);

    const conflictingRetry = await requestJson(`${apiBase}/api/documents`, adminToken, {
      document: { ...documentInput, subject: 'Permintaan sama dengan isi berbeda' },
    });
    await expectJson(conflictingRetry, 409, 'A reused request ID with changed document content must be rejected');

    const deniedCreate = await requestJson(`${apiBase}/api/documents`, deniedToken, { document: { ...documentInput, clientRequestId: randomUUID() } });
    await expectJson(deniedCreate, 403, 'Admin without Document permission must not create documents');

    const foreignInitial = await fetch(`${apiBase}/api/documents`, { headers: { Authorization: `Bearer ${foreignToken}` } });
    const foreignList = await expectJson(foreignInitial, 200, 'Another tenant Admin should see only its own documents');
    assert.deepEqual(foreignList.documents, []);

    const reviewResponse = await requestJson(`${apiBase}/api/documents/${created.documentId}/status`, adminToken, { status: 'in_review' }, 'PATCH');
    const review = await expectJson(reviewResponse, 201, 'Registered document should enter review');
    assert.equal(review.status, 'in_review');
    const reviewRetryResponse = await requestJson(`${apiBase}/api/documents/${created.documentId}/status`, adminToken, { status: 'in_review' }, 'PATCH');
    const reviewRetry = await expectJson(reviewRetryResponse, 200, 'Repeated review transition should be idempotent');
    assert.equal(reviewRetry.alreadyApplied, true);
    const approvalResponse = await requestJson(`${apiBase}/api/documents/${created.documentId}/status`, adminToken, { status: 'approved', note: 'Uji alur persetujuan.' }, 'PATCH');
    const approval = await expectJson(approvalResponse, 201, 'Reviewed document should be approved');
    assert.equal(approval.status, 'approved');

    const invalidMime = await requestJson(`${apiBase}/api/documents/${created.documentId}/attachments/upload-url`, adminToken, {
      attachment: {
        clientRequestId: randomUUID(), fileName: 'bukan-pdf.txt', contentType: 'text/plain', fileSize: 4,
        contentSha256: createHash('sha256').update('test').digest('hex'),
      },
    });
    await expectJson(invalidMime, 415, 'Document attachment API must reject a non-PDF upload');

    const pdfBytes = Buffer.from('%PDF-1.7\nERP4 synthetic document center file\n%%EOF\n', 'utf8');
    const uploadRequestId = randomUUID();
    const attachmentInput = {
      clientRequestId: uploadRequestId,
      fileName: 'undangan-sintetis.pdf',
      contentType: 'application/pdf',
      fileSize: pdfBytes.length,
      contentSha256: createHash('sha256').update(pdfBytes).digest('hex'),
    };
    const reserveResponse = await requestJson(
      `${apiBase}/api/documents/${created.documentId}/attachments/upload-url`, adminToken, { attachment: attachmentInput },
    );
    const reservation = await expectJson(reserveResponse, 201, 'Authorized Admin should reserve a private PDF upload');
    assert.ok(reservation.storagePath.startsWith(`${tenantId}/${created.documentId}/`), 'Attachment object path must bind tenant and document IDs.');
    assert.ok(reservation.uploadToken && reservation.signedUrl, 'Reservation should return a signed upload capability.');
    storagePaths.add(reservation.storagePath);

    const uploaded = await anon.storage.from(BUCKET).uploadToSignedUrl(
      reservation.storagePath, reservation.uploadToken, pdfBytes, { contentType: 'application/pdf' },
    );
    if (uploaded.error) throw new Error('Unable to upload the synthetic PDF with its signed token.');

    const finalizeResponse = await requestJson(`${apiBase}/api/documents/attachments/finalize`, adminToken, { clientRequestId: uploadRequestId });
    const finalized = await expectJson(finalizeResponse, 201, 'Verified PDF should finalize into document attachment metadata');
    assert.equal(finalized.alreadyApplied, false);
    assert.equal(finalized.documentId, created.documentId);
    assert.equal(finalized.attachmentId, reservation.attachmentId);

    const finalizeRetryResponse = await requestJson(`${apiBase}/api/documents/attachments/finalize`, adminToken, { clientRequestId: uploadRequestId });
    const finalizeRetry = await expectJson(finalizeRetryResponse, 200, 'Attachment finalization retry should be idempotent');
    assert.equal(finalizeRetry.alreadyApplied, true);

    const listResponse = await fetch(`${apiBase}/api/documents?direction=incoming&statusGroup=approval&search=${encodeURIComponent('koordinasi')}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listed = await expectJson(listResponse, 200, 'Tenant Admin should read the saved document and attachment');
    assert.equal(listed.documents.length, 1);
    const saved = listed.documents[0];
    assert.equal(saved.id, created.documentId);
    assert.ok(saved.documentNumber, 'Document number must be generated and read back.');
    assert.equal(saved.direction, 'incoming');
    assert.equal(saved.subject, documentInput.subject);
    assert.equal(saved.status, 'approved');
    assert.equal(saved.attachments.length, 1);
    assert.equal(saved.attachments[0].id, reservation.attachmentId);
    assert.equal(saved.attachments[0].fileName, attachmentInput.fileName);
    assert.equal(Object.hasOwn(saved.attachments[0], 'storagePath'), false, 'List response must not expose private object paths.');

    const anonymousStorageRead = await fetch(storageObjectUrl(url, reservation.storagePath), { headers: { apikey: anonKey } });
    assert.ok(!anonymousStorageRead.ok, 'Anonymous direct Storage read must remain denied.');
    const authenticatedStorageRead = await fetch(storageObjectUrl(url, reservation.storagePath), {
      headers: { apikey: anonKey, Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(!authenticatedStorageRead.ok, 'Browser-authenticated direct Storage read must not bypass the private server route.');

    const downloadResponse = await fetch(`${apiBase}/api/documents/attachments/${reservation.attachmentId}/download-url`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const download = await expectJson(downloadResponse, 200, 'Tenant Admin should receive a short-lived private download URL');
    assert.equal(download.expiresInSeconds, 60);
    assert.equal(download.attachment.id, reservation.attachmentId);
    assert.equal(download.attachment.documentId, created.documentId);
    assert.equal(Object.hasOwn(download.attachment, 'storagePath'), false);
    const downloaded = await fetch(download.signedUrl);
    assert.equal(downloaded.status, 200, 'Signed private download should return the file bytes.');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdfBytes, 'Downloaded PDF bytes must match the uploaded file.');

    const foreignDownload = await fetch(`${apiBase}/api/documents/attachments/${reservation.attachmentId}/download-url`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    await expectJson(foreignDownload, 404, 'Another tenant Admin must not resolve a foreign attachment');

    const { data: storedDocument, error: documentError } = await admin.from('document_records')
      .select('tenant_id,document_number,direction,subject,status')
      .eq('tenant_id', tenantId).eq('id', created.documentId).single();
    if (documentError) throw new Error('Unable to verify persisted document tenant and fields.');
    assert.equal(storedDocument.tenant_id, tenantId);
    assert.equal(storedDocument.subject, documentInput.subject);
    assert.equal(storedDocument.status, 'approved');

    const { data: storedAttachments, error: attachmentError } = await admin.from('document_attachments')
      .select('tenant_id,document_id,original_file_name,file_size,storage_path')
      .eq('tenant_id', tenantId).eq('id', reservation.attachmentId).single();
    if (attachmentError) throw new Error('Unable to verify persisted attachment relationships.');
    assert.equal(storedAttachments.tenant_id, tenantId);
    assert.equal(storedAttachments.document_id, created.documentId);
    assert.equal(storedAttachments.original_file_name, attachmentInput.fileName);
    assert.equal(storedAttachments.file_size, pdfBytes.length);
    assert.equal(storedAttachments.storage_path, reservation.storagePath);

    const { data: events, error: eventsError } = await admin.from('document_workflow_events')
      .select('event_type,previous_status,next_status')
      .eq('tenant_id', tenantId).eq('document_id', created.documentId);
    if (eventsError) throw new Error('Unable to verify Document Center audit events.');
    assert.equal(events.length, 4, 'Registration, review, approval, and attachment actions must leave audit events.');
    assert.deepEqual(events.map((event) => event.event_type).sort(), ['attachment_added', 'registered', 'status_changed', 'status_changed']);

    const { count: foreignRows, error: foreignRowsError } = await admin.from('document_records')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', foreignTenantId);
    if (foreignRowsError) throw new Error('Unable to verify foreign tenant isolation.');
    assert.equal(foreignRows, 0, 'Document rows must remain scoped to the tenant that created them.');

    console.log(`Document Center HTTP tests passed (${target}): document create/read, generated numbering, tenant/permission isolation, workflow audit, signed private PDF upload/download, hash validation, and idempotent retries.`);
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
    if (storagePaths.size) {
      await cleanupStep(cleanupErrors, 'Document Center Storage objects', () => admin.storage.from(BUCKET).remove([...storagePaths]));
    }
    if (cleanupErrors.length) {
      console.error(`Synthetic fixture cleanup incomplete: ${cleanupErrors.join(', ')}.`);
      process.exitCode = 1;
    } else if (createdTenantIds.length) {
      console.log(`Synthetic ${target} tenants are suspended; Auth users are banned and audit references remain available.`);
    }
  }
}

main().catch((error) => {
  const detail = error instanceof assert.AssertionError
    ? error.message
    : error?.code || error?.name || 'unknown error';
  console.error(`Document Center HTTP test failed (${detail}). Check the selected Supabase test project and migration state.`);
  process.exitCode = 1;
});

