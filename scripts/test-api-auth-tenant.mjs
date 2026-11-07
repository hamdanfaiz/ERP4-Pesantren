import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { auditServerApiAuthRoutes } from './api-route-auth-policy.mjs';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const profileFailureEmail = `provision-failure-${fixtureSuffix}@example.test`;
  const users = [];
  const piiEncryptionKey = randomBytes(32).toString('hex');
  const piiFingerprintKey = randomBytes(32).toString('hex');
  let serverProcess;
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

    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-a', { users: true, marketplace: true, crm: true, communication: true, tahfidz: true, academic: true, cooperative: true, finance: true, laundry: true, donation: true, document: true, healthcare: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'member-a', { tahfidz: true, academic: true }));
    users.push(await createUserFixture(admin, tenantIds[1], 'santri', 'active', 'member-b'));
    users.push(await createUserFixture(admin, tenantIds[0], 'ustadz', 'active', 'ustadz-a', { communication: true, tahfidz: true, academic: true }));
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
    }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-ppdb', { ppdb: false, finance: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-finance', { ppdb: true, finance: false }));
    users.push(await createUserFixture(admin, tenantIds[1], 'admin', 'active', 'admin-b', { marketplace: true, crm: true, communication: true, tahfidz: true, academic: true, cooperative: true, finance: true, laundry: true, donation: true, document: true, healthcare: true }));
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
    const { error: gradeReferenceError } = await admin.from('tenant_reference_items').insert({
      tenant_id: tenantIds[0],
      domain: 'academic_grade_level',
      code: 'TEST_GRADE_VII',
      name: 'VII',
      description: 'Jenjang uji integrasi PPDB tenant.',
      status: 'active',
      nis_grade_code: '07',
      created_by_user_id: users[0].uid,
      updated_by_user_id: users[0].uid,
    });
    if (gradeReferenceError) throw new Error('Unable to configure the synthetic tenant grade catalog.');

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

    const { error: tahfidzStudentError } = await admin.from('students').insert({
      id: tahfidzStudentId,
      tenant_id: tenantIds[0],
      source_candidate_id: tahfidzCandidateId,
      nis: String(9000000000 + (randomBytes(4).readUInt32BE(0) % 1000000000)),
      name: 'Santri Uji Tahfidz API',
      gender: 'L',
      grade: 'VII',
      nik_ciphertext: `\\x${randomBytes(44).toString('hex')}`,
      nik_fingerprint: `\\x${randomBytes(32).toString('hex')}`,
      status: 'active',
    });
    if (tahfidzStudentError) throw new Error('Unable to create the synthetic Tahfidz student.');

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
    const { error: academicStudentLinkError } = await admin.from('profiles')
      .update({ linked_santri_id: tahfidzStudentId })
      .eq('tenant_id', tenantIds[0])
      .eq('user_id', users[1].uid);
    if (academicStudentLinkError) throw new Error('Unable to link the synthetic Santri portal profile.');
    const academicReferenceRows = [
      { domain: 'academic_subject', code: `API_SUBJECT_${fixtureSuffix}`, name: `Matematika API ${fixtureSuffix}` },
      { domain: 'academic_curriculum', code: `API_CURRICULUM_${fixtureSuffix}`, name: `Kurikulum API ${fixtureSuffix}` },
      { domain: 'academic_assessment_type', code: `API_ASSESSMENT_${fixtureSuffix}`, name: `Penilaian API ${fixtureSuffix}` },
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
    if (!academicSubjectId || !academicCurriculumId || !academicAssessmentTypeId) {
      throw new Error('The synthetic Academic choice reference IDs could not be resolved.');
    }

    const adminToken = await signIn(anon, users[0]);
    const santriToken = await signIn(anon, users[1]);
    const ustadzToken = await signIn(anon, users[3]);
    const donationNoPermissionToken = await signIn(anon, users[14]);
    const documentNoPermissionToken = await signIn(anon, users[15]);
    const healthcareNoPermissionToken = await signIn(anon, users[16]);
    const waliToken = await signIn(anon, users[6]);
    const superAdminToken = await signIn(anon, users[7]);
    const limitedAdminToken = await signIn(anon, users[8]);
    const inactiveAdminToken = await signIn(anon, users[4]);
    const suspendedTenantAdminToken = await signIn(anon, users[5]);
    const noPpdbAdminToken = await signIn(anon, users[9]);
    const noFinanceAdminToken = await signIn(anon, users[10]);
    const otherTenantMarketplaceAdminToken = await signIn(anon, users[11]);
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
        SUPABASE_CRM_RUNTIME_ENABLED: 'true',
        SUPABASE_DASHBOARD_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED: 'true',
        SUPABASE_MASTER_DATA_RUNTIME_ENABLED: 'false',
        SUPABASE_MASTER_DATA_IMPORT_ENABLED: 'false',
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
        SUPABASE_COMMUNICATION_RUNTIME_ENABLED: 'true',
        SUPABASE_TAHFIDZ_RUNTIME_ENABLED: 'true',
        SUPABASE_ACADEMIC_RUNTIME_ENABLED: 'true',
        SUPABASE_LAUNDRY_RUNTIME_ENABLED: 'true',
        SUPABASE_DONATION_RUNTIME_ENABLED: 'true',
        SUPABASE_DOCUMENT_RUNTIME_ENABLED: 'true',
        SUPABASE_HEALTHCARE_RUNTIME_ENABLED: 'true',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
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

    const noRecipientAnnouncement = await fetch(`${referenceApiBase}/api/communication/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
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
    console.log('API auth, tenant isolation, Academic, Cooperative, CRM, communication, Laundry, Donation & Waqf, Documents, Healthcare, Tahfidz, and reference catalog round-trips passed: persistence, relations, idempotency, tenant isolation, and role restrictions.');
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
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
        `DELETE FROM public.students WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.candidates WHERE tenant_id = ANY(${tenantArray});`,
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

        `DELETE FROM public.master_data_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_record_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_visits WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_stock_movements WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_medicines WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_records WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.healthcare_legacy_import_batches WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_attachment_upload_requests WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_attachments WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_workflow_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.document_records WHERE tenant_id = ANY(${tenantArray});`,
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
  const cause = error instanceof Error && error.cause instanceof Error
    ? `; cause=${error.cause.code || error.cause.message}`
    : '';
  console.error(`API auth and tenant integration test failed (${detail}${cause}). Check the local Supabase stack and migration state.`);
  process.exitCode = 1;
});

