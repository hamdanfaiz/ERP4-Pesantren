import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflowPath = path.join(root, '.github', 'workflows', 'supabase-db-tests.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const scheduledTests = new Set(
  [...workflow.matchAll(/(?:npm|bun) run (test:[a-z0-9:_-]+)/g)].map((match) => match[1]),
);
const packageTests = Object.keys(manifest.scripts || {}).filter((name) => name.startsWith('test:'));
const missing = packageTests.filter((name) => !scheduledTests.has(name));

assert.deepEqual(missing, [], `Package tests missing from CI workflow: ${missing.join(', ')}`);
console.log(`CI coverage guard passed: all ${packageTests.length} package test scripts are scheduled in Supabase database tests workflow.`);
