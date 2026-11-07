import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, quiet: true });

const VERIFIED_STAGING_REF = 'vqemuyzveuirlkvdggjd';
const KNOWN_PRODUCTION_REF = 'ptsasgdvgrbdtgyqieie';

function readSupabaseCliEnvironment() {
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
  return values;
}

function assertLocalUrl(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('Local test mode only accepts a loopback Supabase URL.');
  }
}

export function getSupabaseTestEnvironment({ allowStagingWrites = false } = {}) {
  const target = process.env.ERP4_SUPABASE_TEST_TARGET || 'local';

  if (target === 'staging') {
    if (!allowStagingWrites) {
      throw new Error('This test is not approved to create staging fixtures.');
    }
    if (process.env.ERP4_ALLOW_STAGING_MUTATIONS !== 'true') {
      throw new Error('Set ERP4_ALLOW_STAGING_MUTATIONS=true to explicitly opt into synthetic staging fixtures.');
    }

    const projectRef = process.env.SUPABASE_PROJECT_REF || '';
    if (!projectRef || projectRef === KNOWN_PRODUCTION_REF || projectRef !== VERIFIED_STAGING_REF) {
      throw new Error('Staging tests are restricted to the verified VQE project ref.');
    }

    const url = process.env.SUPABASE_URL || '';
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Staging tests require a valid SUPABASE_URL.');
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== `${VERIFIED_STAGING_REF}.supabase.co`) {
      throw new Error('Staging tests require the exact verified VQE HTTPS project URL.');
    }

    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || process.env.ANON_KEY
      || '';
    const serviceKey = process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SERVICE_ROLE_KEY
      || '';
    if (!anonKey || !serviceKey || serviceKey.startsWith('sb_publishable_')) {
      throw new Error('Staging tests require both a publishable key and a server-only secret key.');
    }
    return { url, anonKey, serviceKey, target };
  }

  if (target !== 'local') {
    throw new Error('ERP4_SUPABASE_TEST_TARGET must be either local or staging.');
  }

  const values = readSupabaseCliEnvironment();
  const url = values.API_URL || values.SUPABASE_URL;
  const anonKey = values.ANON_KEY || values.SUPABASE_ANON_KEY;
  const serviceKey = values.SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase local status did not expose the local API URL and test keys.');
  }
  assertLocalUrl(url);
  return { url, anonKey, serviceKey, target };
}
