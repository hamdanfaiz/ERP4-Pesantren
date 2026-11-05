import assert from 'node:assert/strict';
import { getSupabaseTestEnvironment } from './supabase-test-environment.mjs';

const names = [
  'ERP4_SUPABASE_TEST_TARGET',
  'ERP4_ALLOW_STAGING_MUTATIONS',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

try {
  for (const name of names) delete process.env[name];
  process.env.ERP4_SUPABASE_TEST_TARGET = 'staging';
  process.env.SUPABASE_PROJECT_REF = 'vqemuyzveuirlkvdggjd';
  process.env.SUPABASE_URL = 'https://vqemuyzveuirlkvdggjd.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-only';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test-only';

  assert.throws(
    () => getSupabaseTestEnvironment({ allowStagingWrites: true }),
    /ERP4_ALLOW_STAGING_MUTATIONS=true/,
    'Staging fixtures require an explicit write opt-in.',
  );

  process.env.ERP4_ALLOW_STAGING_MUTATIONS = 'true';
  const staging = getSupabaseTestEnvironment({ allowStagingWrites: true });
  assert.equal(staging.target, 'staging');
  assert.equal(staging.url, 'https://vqemuyzveuirlkvdggjd.supabase.co');

  process.env.SUPABASE_PROJECT_REF = 'ptsasgdvgrbdtgyqieie';
  process.env.SUPABASE_URL = 'https://ptsasgdvgrbdtgyqieie.supabase.co';
  assert.throws(
    () => getSupabaseTestEnvironment({ allowStagingWrites: true }),
    /verified VQE project ref/,
    'Production must be rejected even with the staging write opt-in.',
  );

  process.env.SUPABASE_PROJECT_REF = 'vqemuyzveuirlkvdggjd';
  process.env.SUPABASE_URL = 'https://other-project.supabase.co';
  assert.throws(
    () => getSupabaseTestEnvironment({ allowStagingWrites: true }),
    /exact verified VQE HTTPS project URL/,
    'A mismatched URL must be rejected before fixtures are created.',
  );

  process.env.SUPABASE_URL = 'https://vqemuyzveuirlkvdggjd.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_publishable_wrong-key-type';
  assert.throws(
    () => getSupabaseTestEnvironment({ allowStagingWrites: true }),
    /server-only secret key/,
    'A publishable key cannot be used as the server key.',
  );

  console.log('Supabase test environment guards passed: staging requires explicit opt-in, exact VQE ref/URL, server-only key, and rejects Production.');
} finally {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}
