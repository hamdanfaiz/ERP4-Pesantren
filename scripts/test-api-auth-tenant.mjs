import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createClient } from '@supabase/supabase-js';

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
  const { url, anonKey, serviceKey } = localSupabaseEnvironment();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const fixtureSuffix = randomUUID().slice(0, 12);
  const tenantIds = [randomUUID(), randomUUID(), randomUUID()];
  const users = [];
  let serverProcess;

  try {
    const tenantRows = tenantIds.map((id, index) => ({
      id,
      slug: `api-auth-${fixtureSuffix}-${index}`,
      name: `API auth test ${fixtureSuffix} ${index}`,
      status: index === 2 ? 'suspended' : 'active',
    }));
    const { error: tenantError } = await admin.from('tenants').insert(tenantRows);
    if (tenantError) throw new Error('Unable to create synthetic tenant fixtures.');

    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-a'));
    users.push(await createUserFixture(admin, tenantIds[0], 'santri', 'active', 'member-a'));
    users.push(await createUserFixture(admin, tenantIds[1], 'santri', 'active', 'member-b'));
    users.push(await createUserFixture(admin, tenantIds[0], 'ustadz', 'active', 'ustadz-a'));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'suspended', 'inactive-admin'));
    users.push(await createUserFixture(admin, tenantIds[2], 'admin', 'active', 'suspended-tenant-admin'));
    users.push(await createUserFixture(admin, tenantIds[0], 'wali_santri', 'active', 'wali-a'));
    users.push(await createUserFixture(admin, tenantIds[0], 'super_admin', 'active', 'superadmin-a', { users: false }));
    users.push(await createUserFixture(admin, tenantIds[0], 'admin', 'active', 'admin-no-users', { users: false }));

    const adminToken = await signIn(anon, users[0]);
    const santriToken = await signIn(anon, users[1]);
    const ustadzToken = await signIn(anon, users[3]);
    const waliToken = await signIn(anon, users[6]);
    const superAdminToken = await signIn(anon, users[7]);
    const limitedAdminToken = await signIn(anon, users[8]);
    const inactiveAdminToken = await signIn(anon, users[4]);
    const suspendedTenantAdminToken = await signIn(anon, users[5]);
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
        SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED: 'false',
        SUPABASE_FINANCE_RUNTIME_ENABLED: 'true',
        SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED: 'true',
        SUPABASE_MASTER_DATA_RUNTIME_ENABLED: 'false',
        SUPABASE_MASTER_DATA_IMPORT_ENABLED: 'false',
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

    const liveResponse = await fetch(`${apiBase}/health/live`);
    assert.equal(liveResponse.status, 200, 'Liveness must report a running API without exposing diagnostics.');
    assert.equal((await liveResponse.json()).status, 'live');
    assert.equal(liveResponse.headers.get('cache-control'), 'no-store');

    const readyResponse = await fetch(`${apiBase}/health/ready`);
    assert.equal(readyResponse.status, 200, 'Readiness must verify the local Supabase profile store.');
    assert.equal((await readyResponse.json()).status, 'ready');
    assert.equal(readyResponse.headers.get('cache-control'), 'no-store');

    const anonymousRoomHistory = await fetch(apiBase + "/api/master-data/students/" + randomUUID() + "/room-history");
    assert.equal(anonymousRoomHistory.status, 401, "Room history must reject anonymous callers.");
    const gatedRoomHistory = await fetch(apiBase + "/api/master-data/students/" + randomUUID() + "/room-history", {
      headers: { Authorization: "Bearer " + adminToken },
    });
    assert.equal(gatedRoomHistory.status, 503, "Room history must remain closed while the Master Data runtime is disabled.");

    for (const path of ["/api/master-data/structures/migrate", "/api/master-data/students/migrate"]) {
      const anonymousImport = await fetch(apiBase + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      assert.equal(anonymousImport.status, 401, path + " must reject anonymous callers.");
      const gatedImport = await fetch(apiBase + path, {
        method: "POST",
        headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      assert.equal(gatedImport.status, 503, path + " must remain closed until the operator enables migration.");
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
    const authDirectory = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.equal(authDirectory.error, null, "The synthetic Auth directory must remain readable for the assertion.");
    assert.ok(!authDirectory.data.users.some((user) => [missingWaliLinkEmail, unrecognizedWaliEmail].includes(user.email)), "Rejected Wali registrations must not leave Auth accounts behind.");
    const unauthenticated = await fetch(`${apiBase}/api/users`);
    assert.equal(unauthenticated.status, 401, 'Requests without a session must be rejected.');

    const invalidSession = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: 'Bearer definitely-not-a-supabase-session' },
    });
    assert.equal(invalidSession.status, 401, 'Invalid Supabase sessions must be rejected.');

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

    const tenantResponse = await fetch(`${apiBase}/api/users?tenantId=${tenantIds[1]}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(tenantResponse.status, 200, 'An active tenant admin should read their own tenant users.');
    const tenantPayload = await tenantResponse.json();
    assert.equal(tenantPayload.total, 7, 'The tenant admin should only see the seven profiles in tenant A.');
    assert.ok(tenantPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'The response must remain scoped to the actor tenant even when a foreign tenantId is requested.');
    assert.ok(!tenantPayload.users.some((profile) => profile.email === users[2].email), 'A profile from another tenant must never appear in the response.');

    const pageResponses = await Promise.all([0, 3, 6].map((offset) => fetch(`${apiBase}/api/users?limit=3&offset=${offset}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })));
    for (const response of pageResponses) assert.equal(response.status, 200, 'Tenant user pages must be readable.');
    const pagePayloads = await Promise.all(pageResponses.map((response) => response.json()));
    assert.deepEqual(pagePayloads.map((payload) => payload.users.length), [3, 3, 1], 'Pagination must return bounded, non-overlapping page sizes.');
    assert.ok(pagePayloads.every((payload) => payload.total === 7), 'Every page must report the filtered tenant total.');
    const pagedIds = pagePayloads.flatMap((payload) => payload.users.map((profile) => profile.uid));
    assert.equal(new Set(pagedIds).size, 7, 'Stable ordering must not duplicate profiles between pages.');

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
    assert.equal(superAdminPayload.total, 7, 'SuperAdmin remains scoped to the profile tenant when a foreign tenantId is requested.');
    assert.ok(superAdminPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'SuperAdmin results must remain tenant-scoped.');
    assert.ok(!superAdminPayload.users.some((profile) => profile.email === users[2].email), 'SuperAdmin must not receive a foreign-tenant profile through query spoofing.');

    console.log('API auth and tenant isolation passed: role/tenant denial, module denial, suspended accounts, cross-tenant query spoofing, and Wali link validation.');
  } finally {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        sleep(5000),
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }

    for (const user of users) {
      try { await admin.auth.admin.deleteUser(user.uid); } catch {}
    }
    try {
      await admin.from('tenants').delete().in('id', tenantIds);
    } catch {}
  }
}

main().catch((error) => {
  const detail = error instanceof assert.AssertionError
    ? error.message
    : error?.code || error?.name || 'unknown error';
  console.error(`API auth and tenant integration test failed (${detail}). Check the local Supabase stack and migration state.`);
  process.exitCode = 1;
});
