import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { auditServerApiAuthRoutes } from './api-route-auth-policy.mjs';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

  return { uid: data.user.id, email, password };
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

    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-a', { users: true, marketplace: true, crm: true, communication: true, tahfidz: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'member-a', { tahfidz: true }));
    users.push(await createUserFixture(admin, tenantIds[1], 'santri', 'active', 'member-b'));
    users.push(await createUserFixture(admin, tenantIds[0], 'ustadz', 'active', 'ustadz-a', { communication: true, tahfidz: true }));
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
    users.push(await createUserFixture(admin, tenantIds[1], 'admin', 'active', 'admin-b', { marketplace: true, crm: true, communication: true, tahfidz: true }));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'initial-password-change'));
    const { error: forcePasswordError } = await admin.from('profiles')
      .update({ must_change_password: true })
      .eq('user_id', users[12].uid);
    if (forcePasswordError) throw new Error('Unable to configure the synthetic forced-password-change fixture.');
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

    const adminToken = await signIn(anon, users[0]);
    const santriToken = await signIn(anon, users[1]);
    const ustadzToken = await signIn(anon, users[3]);
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
    assert.equal(tenantPayload.total, 10, 'The tenant admin should only see the ten profiles in tenant A.');
    assert.ok(tenantPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'The response must remain scoped to the actor tenant even when a foreign tenantId is requested.');
    assert.ok(!tenantPayload.users.some((profile) => profile.email === users[2].email), 'A profile from another tenant must never appear in the response.');

    const pageResponses = await Promise.all([0, 3, 6, 9].map((offset) => fetch(`${apiBase}/api/users?limit=3&offset=${offset}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })));
    for (const response of pageResponses) assert.equal(response.status, 200, 'Tenant user pages must be readable.');
    const pagePayloads = await Promise.all(pageResponses.map((response) => response.json()));
    assert.deepEqual(pagePayloads.map((payload) => payload.users.length), [3, 3, 3, 1], 'Pagination must return bounded, non-overlapping page sizes, including the final partial page.');
    assert.ok(pagePayloads.every((payload) => payload.total === 10), 'Every page must report the filtered tenant total.');
    const pagedIds = pagePayloads.flatMap((payload) => payload.users.map((profile) => profile.uid));
    assert.equal(new Set(pagedIds).size, 10, 'Stable ordering must return every tenant profile exactly once across pages.');

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
    assert.equal(superAdminPayload.total, 10, 'SuperAdmin remains scoped to the profile tenant when a foreign tenantId is requested.');
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

    console.log('API auth, tenant isolation, CRM, communication, Tahfidz, and reference catalog round-trips passed: persistence, relations, idempotency, tenant isolation, and role restrictions.');
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
        `DELETE FROM public.tahfidz_halaqahs WHERE tenant_id = ANY(${tenantArray});`,
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

        `DELETE FROM public.tenant_reference_items WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_allocations WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_counters WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series_events WHERE tenant_id = ANY(${tenantArray});`,
        `DELETE FROM public.tenant_naming_series WHERE tenant_id = ANY(${tenantArray});`,
        'COMMIT;',
      ].join(' ');
      execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', cleanupSql], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    } catch {
      console.error('Unable to clean synthetic Marketplace rows through local Supabase.');
      process.exitCode = 1;
    }
    for (const user of users) {
      const { error } = await admin.auth.admin.deleteUser(user.uid);
      if (error) {
        console.error('Unable to clean a synthetic Auth/profile fixture.');
        process.exitCode = 1;
      }
    }
    try {
      const tenantArray = `ARRAY[${tenantIds.map((id) => `'${id}'::uuid`).join(',')}]`;
      execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DELETE FROM public.tenants WHERE id = ANY(${tenantArray})`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
      });
    } catch {
      console.error('Unable to clean synthetic tenant fixtures.');
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const detail = error instanceof Error
    ? error.message
    : error?.code || 'unknown error';
  console.error(`API auth and tenant integration test failed (${detail}). Check the local Supabase stack and migration state.`);
  process.exitCode = 1;
});

