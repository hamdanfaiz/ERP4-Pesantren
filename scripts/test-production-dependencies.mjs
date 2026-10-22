import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const runtimeDependencies = Object.keys(manifest.dependencies || {});
const devDependencies = Object.keys(manifest.devDependencies || {});
const firebaseRuntimePackages = runtimeDependencies.filter((name) =>
  name === 'firebase' || name === 'firebase-admin' || name.startsWith('@firebase/'),
);

assert.deepEqual(
  firebaseRuntimePackages,
  [],
  `Firebase packages must not be installed in production: ${firebaseRuntimePackages.join(', ')}`,
);
assert.ok(runtimeDependencies.includes('@supabase/supabase-js'), 'Supabase client must remain available at runtime.');
assert.ok(devDependencies.includes('firebase'), 'Legacy Firebase client types remain available only for development builds.');
assert.ok(devDependencies.includes('firebase-admin'), 'The archived Firebase importer remains available only in local development.');

console.log('Production dependency boundary passed: Firebase packages are development-only and Supabase remains a runtime dependency.');
