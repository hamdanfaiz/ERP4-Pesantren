import assert from 'node:assert/strict';
import { isolateSyntheticTenantFixture } from './synthetic-tenant-fixture.mjs';

function createAdmin({ profileError, tenantError, banError, omitProfile = false } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      return {
        update(values) {
          const call = { table, values };
          calls.push(call);
          return {
            in(column, ids) {
              call.column = column;
              call.ids = ids;
              return {
                async select() {
                  if (table === 'tenants' && tenantError) return { data: null, error: tenantError };
                  if (table === 'profiles' && profileError) return { data: null, error: profileError };
                  if (table === 'profiles' && omitProfile) return { data: [], error: null };
                  const status = values.status;
                  return { data: ids.map((id) => table === 'tenants' ? { id, status } : { user_id: id, status }), error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: { admin: { async updateUserById(id, payload) {
      calls.push({ table: 'auth.users', id, payload });
      return { error: banError || null };
    } } },
  };
  return { admin, calls };
}

const fixture = { tenantIds: ['tenant-a', 'tenant-b', 'tenant-a'], userIds: ['user-a', 'user-b', 'user-a'] };
const { admin, calls } = createAdmin();
const result = await isolateSyntheticTenantFixture(admin, fixture);
assert.deepEqual(result, { tenantsSuspended: 2, profilesSuspended: 2, authUsersBanned: 2 });
assert.deepEqual(calls.find((call) => call.table === 'tenants').values, { status: 'suspended' });
assert.deepEqual(calls.find((call) => call.table === 'profiles').values, { status: 'suspended' });
assert.equal(calls.filter((call) => call.table === 'auth.users').length, 2);
assert.ok(calls.filter((call) => call.table === 'auth.users').every((call) => call.payload.ban_duration === '876600h'));

const blocked = createAdmin({ profileError: { code: '42501', message: 'sensitive database detail' } });
await assert.rejects(
  () => isolateSyntheticTenantFixture(blocked.admin, fixture),
  (error) => error.message.includes('profile_suspension_42501') && !error.message.includes('sensitive database detail'),
);

const missing = createAdmin({ omitProfile: true });
await assert.rejects(
  () => isolateSyntheticTenantFixture(missing.admin, fixture),
  /profile_suspension_incomplete/,
);

console.log('Synthetic staging fixture cleanup contract passed: tombstone tenants/profiles are suspended, Auth users are banned, and failures are fail-closed without exposing database details.');
