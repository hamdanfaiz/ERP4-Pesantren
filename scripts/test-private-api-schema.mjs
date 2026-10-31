import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const exposedSchemas = config.match(/^\s*schemas\s*=\s*\[([^\]]*)\]\s*$/m)?.[1]
  ?.split(',')
  .map((schema) => schema.trim().replace(/^['"]|['"]$/g, ''));

assert.ok(exposedSchemas, 'Supabase API schema list must be explicit');
assert.ok(!exposedSchemas.includes('private'), 'Internal RLS helper schema must not be exposed by the Data API');

console.log('Supabase internal schema remains excluded from the Data API.');

