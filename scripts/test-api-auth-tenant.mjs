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

async function createUserFixture(admin, tenantId, role, status, label) {
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
    module_permissions: { users: true },
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

    const adminToken = await signIn(anon, users[0]);
    const ustadzToken = await signIn(anon, users[3]);
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

    const unauthenticated = await fetch(`${apiBase}/api/users`);
    assert.equal(unauthenticated.status, 401, 'Requests without a session must be rejected.');

    const invalidSession = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: 'Bearer definitely-not-a-supabase-session' },
    });
    assert.equal(invalidSession.status, 401, 'Invalid Supabase sessions must be rejected.');

    const nonAdmin = await fetch(`${apiBase}/api/users`, {
      headers: { Authorization: `Bearer ${ustadzToken}` },
    });
    assert.equal(nonAdmin.status, 403, 'Non-admin roles must not access user management.');
    assert.equal((await nonAdmin.json()).code, 'FORBIDDEN_ROLE');

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
    assert.equal(tenantPayload.total, 4, 'The tenant admin should only see the four profiles in tenant A.');
    assert.ok(tenantPayload.users.every((profile) => profile.tenantId === tenantIds[0]), 'The response must remain scoped to the actor tenant even when a foreign tenantId is requested.');
    assert.ok(!tenantPayload.users.some((profile) => profile.email === users[2].email), 'A profile from another tenant must never appear in the response.');

    console.log('API auth and tenant isolation passed: missing/invalid sessions, non-admin, inactive account/tenant, and cross-tenant query spoofing rejected.');
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
