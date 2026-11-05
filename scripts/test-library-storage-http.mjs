import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseTestEnvironment } from './supabase-test-environment.mjs';
import { isolateSyntheticTenantFixture } from './synthetic-tenant-fixture.mjs';

const BUCKET = 'erp4-private-library-assets';
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

async function createTenant(admin, id, slug, name) {
  const { error } = await admin.from('tenants').insert({ id, slug, name, status: 'active' });
  if (error) throw new Error(`Unable to create synthetic tenant (${slug}).`);
}

async function createUser(admin, tenantId, role, label, modulePermissions) {
  const id = randomUUID();
  const email = `library-storage-${label}-${id.slice(0, 8)}@example.test`;
  const password = `Library-Test-${id}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Library storage test ${label}` },
  });
  if (error || !data.user) throw new Error(`Unable to create synthetic auth user (${label}).`);

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: data.user.id,
    tenant_id: tenantId,
    email,
    display_name: `Library storage test ${label}`,
    username: `lib-${label}-${id.slice(0, 8)}`,
    role,
    status: 'active',
    module_permissions: modulePermissions,
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

async function expectStatus(response, expected, label) {
  const body = await response.clone().json().catch(() => null);
  assert.equal(response.status, expected, `${label} (HTTP ${response.status}: ${body?.error || 'no response body'})`);
  return body;
}

function storageObjectUrl(baseUrl, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`;
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
    await createTenant(admin, tenantId, `library-storage-${fixtureSuffix}`, `Library Storage Test ${fixtureSuffix}`);
    createdTenantIds.push(tenantId);
    await createTenant(admin, foreignTenantId, `library-foreign-${fixtureSuffix}`, `Foreign Library Test ${fixtureSuffix}`);
    createdTenantIds.push(foreignTenantId);
    const libraryAdmin = await createUser(admin, tenantId, 'admin', 'admin', { library: true });
    users.push(libraryAdmin);
    const noLibraryAccess = await createUser(admin, tenantId, 'admin', 'no-access', { library: false });
    users.push(noLibraryAccess);
    const foreignAdmin = await createUser(admin, foreignTenantId, 'admin', 'foreign-admin', { library: true });
    users.push(foreignAdmin);

    const adminToken = await signIn(anon, libraryAdmin);
    const noAccessToken = await signIn(anon, noLibraryAccess);
    const foreignAdminToken = await signIn(anon, foreignAdmin);
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
        SUPABASE_LIBRARY_RUNTIME_ENABLED: 'true',
        SUPABASE_LIBRARY_DIGITAL_ASSETS_ENABLED: 'true',
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

    const bucket = await admin.storage.getBucket(BUCKET);
    assert.equal(bucket.data?.public, false, 'Digital library bucket must remain private.');

    const listResponse = await fetch(`${apiBase}/api/library/assets`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const initialList = await expectStatus(listResponse, 200, 'Authorized tenant Admin should list digital assets');
    assert.equal(initialList.enabled, true);
    assert.deepEqual(initialList.assets, []);

    const deniedList = await fetch(`${apiBase}/api/library/assets`, {
      headers: { Authorization: `Bearer ${noAccessToken}` },
    });
    await expectStatus(deniedList, 403, 'A profile without Library permission must be denied');

    const pdfBytes = Buffer.from('%PDF-1.7\nERP4 synthetic digital library file\n%%EOF\n', 'utf8');
    const clientRequestId = randomUUID();
    const assetInput = {
      clientRequestId,
      title: 'Panduan Pesantren Uji',
      description: 'Berkas sintetis untuk pengujian lokal.',
      fileName: 'panduan-uji.pdf',
      contentType: 'application/pdf',
      fileSize: pdfBytes.length,
      contentSha256: createHash('sha256').update(pdfBytes).digest('hex'),
    };
    const reserveResponse = await fetch(`${apiBase}/api/library/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: assetInput }),
    });
    const reservation = await expectStatus(reserveResponse, 201, 'Authorized Admin should reserve a private digital asset upload');
    assert.ok(reservation.assetId);
    assert.ok(reservation.storagePath.startsWith(`${tenantId}/`), 'Asset object path must be scoped to its tenant.');
    assert.ok(reservation.signedUrl && reservation.uploadToken, 'Upload reservation should return a signed upload capability.');
    storagePaths.add(reservation.storagePath);

    const signedUpload = await anon.storage.from(BUCKET).uploadToSignedUrl(
      reservation.storagePath,
      reservation.uploadToken,
      pdfBytes,
      { contentType: assetInput.contentType },
    );
    if (signedUpload.error) throw new Error('Unable to upload the synthetic digital asset through its signed token.');

    const finalizeResponse = await fetch(`${apiBase}/api/library/assets/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId }),
    });
    const finalized = await expectStatus(finalizeResponse, 201, 'Valid uploaded bytes should finalize into tenant metadata');
    assert.equal(finalized.alreadyApplied, false);
    assert.equal(finalized.asset.id, reservation.assetId);
    assert.equal(finalized.asset.fileSize, pdfBytes.length);
    assert.equal(finalized.asset.contentType, 'application/pdf');
    assert.equal(Object.hasOwn(finalized.asset, 'storagePath'), false, 'Finalized metadata must not expose the internal Storage path.');

    const finalizeRetry = await fetch(`${apiBase}/api/library/assets/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId }),
    });
    const retried = await expectStatus(finalizeRetry, 200, 'Finalization retry should be idempotent');
    assert.equal(retried.alreadyApplied, true);

    const listedAfterUpload = await fetch(`${apiBase}/api/library/assets`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const assetsAfterUpload = await expectStatus(listedAfterUpload, 200, 'Tenant Admin should see the finalized asset');
    assert.equal(assetsAfterUpload.assets.length, 1);
    assert.equal(assetsAfterUpload.assets[0].id, reservation.assetId);
    assert.equal(Object.hasOwn(assetsAfterUpload.assets[0], 'storagePath'), false);

    const anonymousRead = await fetch(storageObjectUrl(url, reservation.storagePath), { headers: { apikey: anonKey } });
    assert.ok(!anonymousRead.ok, 'Anonymous direct Storage reads must remain denied.');
    const browserRead = await fetch(storageObjectUrl(url, reservation.storagePath), {
      headers: { apikey: anonKey, Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(!browserRead.ok, 'Authenticated browser reads must not bypass the server-only private Storage policy.');

    const downloadResponse = await fetch(`${apiBase}/api/library/assets/${reservation.assetId}/download-url`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const download = await expectStatus(downloadResponse, 200, 'Tenant Admin should receive a short-lived download URL');
    assert.equal(download.expiresInSeconds, 60);
    assert.equal(Object.hasOwn(download.asset, 'storagePath'), false);
    const downloadedBytes = await fetch(download.signedUrl);
    assert.equal(downloadedBytes.status, 200, 'A signed download URL should return the private file.');
    assert.deepEqual(Buffer.from(await downloadedBytes.arrayBuffer()), pdfBytes, 'Signed download must return the exact verified bytes.');

    const foreignDownload = await fetch(`${apiBase}/api/library/assets/${reservation.assetId}/download-url`, {
      headers: { Authorization: `Bearer ${foreignAdminToken}` },
    });
    await expectStatus(foreignDownload, 404, 'A different tenant Admin must not resolve this asset ID');

    const recoveryBytes = Buffer.from('%PDF-1.7\nERP4 upload response recovery\n%%EOF\n', 'utf8');
    const recoveryInput = {
      ...assetInput,
      clientRequestId: randomUUID(),
      title: 'Pemulihan Upload Uji',
      fileName: 'pemulihan-uji.pdf',
      fileSize: recoveryBytes.length,
      contentSha256: createHash('sha256').update(recoveryBytes).digest('hex'),
    };
    const recoveryReservation = await fetch(`${apiBase}/api/library/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: recoveryInput }),
    });
    const recovery = await expectStatus(recoveryReservation, 201, 'A retryable upload reservation should be created');
    storagePaths.add(recovery.storagePath);
    const recoveryUpload = await anon.storage.from(BUCKET).uploadToSignedUrl(
      recovery.storagePath,
      recovery.uploadToken,
      recoveryBytes,
      { contentType: recoveryInput.contentType },
    );
    if (recoveryUpload.error) throw new Error('Unable to seed the synthetic response-loss upload case.');
    const resumedResponse = await fetch(`${apiBase}/api/library/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: recoveryInput }),
    });
    const resumed = await expectStatus(resumedResponse, 201, 'Retry after a lost upload response should resume the existing object');
    assert.equal(resumed.objectAlreadyUploaded, true);
    assert.equal(Object.hasOwn(resumed, 'uploadToken'), false, 'Resume must not issue another token for an uploaded path.');
    const recoveryFinalize = await fetch(`${apiBase}/api/library/assets/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: recoveryInput.clientRequestId }),
    });
    await expectStatus(recoveryFinalize, 201, 'A recovered upload should finalize exactly once');

    const tamperedBytes = Buffer.from(pdfBytes);
    tamperedBytes[10] ^= 1;
    const tamperedInput = {
      ...assetInput,
      clientRequestId: randomUUID(),
      title: 'Berkas Tidak Cocok Uji',
      fileName: 'berkas-tidak-cocok.pdf',
      fileSize: pdfBytes.length,
      contentSha256: createHash('sha256').update(pdfBytes).digest('hex'),
    };
    const tamperedReserveResponse = await fetch(`${apiBase}/api/library/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: tamperedInput }),
    });
    const tamperedReservation = await expectStatus(tamperedReserveResponse, 201, 'A hash-mismatch fixture should reserve before verification');
    storagePaths.add(tamperedReservation.storagePath);
    const tamperedUpload = await anon.storage.from(BUCKET).uploadToSignedUrl(
      tamperedReservation.storagePath,
      tamperedReservation.uploadToken,
      tamperedBytes,
      { contentType: tamperedInput.contentType },
    );
    if (tamperedUpload.error) throw new Error('Unable to upload the synthetic hash-mismatch case.');
    const tamperedFinalize = await fetch(`${apiBase}/api/library/assets/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: tamperedInput.clientRequestId }),
    });
    await expectStatus(tamperedFinalize, 422, 'A content hash mismatch must be rejected');
    const tamperedObject = await admin.storage.from(BUCKET).list(tenantId, { limit: 100, search: tamperedReservation.assetId });
    assert.ok(!tamperedObject.error, 'Test should be able to inspect synthetic tenant Storage objects.');
    assert.equal(tamperedObject.data?.length, 0, 'Rejected tampered object should be removed from private Storage.');

    const invalidSignatureBytes = Buffer.from('<html>not a PDF document</html>', 'utf8');
    const invalidSignatureInput = {
      ...assetInput,
      clientRequestId: randomUUID(),
      title: 'Tanda Berkas Tidak Cocok Uji',
      fileName: 'bukan-pdf.pdf',
      fileSize: invalidSignatureBytes.length,
      contentSha256: createHash('sha256').update(invalidSignatureBytes).digest('hex'),
    };
    const invalidSignatureReserve = await fetch(`${apiBase}/api/library/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: invalidSignatureInput }),
    });
    const invalidSignatureReservation = await expectStatus(invalidSignatureReserve, 201, 'A file signature fixture should reserve before verification');
    storagePaths.add(invalidSignatureReservation.storagePath);
    const invalidSignatureUpload = await anon.storage.from(BUCKET).uploadToSignedUrl(
      invalidSignatureReservation.storagePath,
      invalidSignatureReservation.uploadToken,
      invalidSignatureBytes,
      { contentType: invalidSignatureInput.contentType },
    );
    if (invalidSignatureUpload.error) throw new Error('Unable to upload the synthetic signature-mismatch case.');
    const invalidSignatureFinalize = await fetch(`${apiBase}/api/library/assets/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: invalidSignatureInput.clientRequestId }),
    });
    await expectStatus(invalidSignatureFinalize, 415, 'A MIME declaration with a mismatched file signature must be rejected');
    const invalidSignatureObject = await admin.storage.from(BUCKET).list(tenantId, { limit: 100, search: invalidSignatureReservation.assetId });
    assert.ok(!invalidSignatureObject.error);
    assert.equal(invalidSignatureObject.data?.length, 0, 'Rejected invalid-signature object should be removed from private Storage.');

    const finalListResponse = await fetch(`${apiBase}/api/library/assets`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const finalList = await expectStatus(finalListResponse, 200, 'Tenant library list should remain available after rejected uploads');
    assert.equal(finalList.assets.length, 2, 'Only the two verified uploads should create visible tenant asset metadata.');
    assert.ok(finalList.assets.every((asset) => !Object.hasOwn(asset, 'storagePath')));

    console.log(`Library Storage HTTP tests passed (${target}): signed upload/download, private bucket, tenant and role isolation, idempotent finalization and recovery, content hash/signature verification, rejected-object cleanup, and metadata path privacy.`);
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
    if (storagePaths.size) await cleanupStep(cleanupErrors, 'library Storage objects', () => admin.storage.from(BUCKET).remove([...storagePaths]));
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
    : error?.code || error?.name || 'unknown error';
  console.error(`Library Storage HTTP test failed (${detail}). Check the selected Supabase test project and migration state.`);
  process.exitCode = 1;
});
