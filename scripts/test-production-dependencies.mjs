import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const runtimeDependencies = Object.keys(manifest.dependencies || {});
const devDependencies = Object.keys(manifest.devDependencies || {});
const firebasePackages = [...runtimeDependencies, ...devDependencies].filter((name) =>
  name === 'firebase' || name === 'firebase-admin' || name.startsWith('@firebase/'),
);
const lockedFirebasePackages = Object.keys(lockfile.packages || {}).filter((name) =>
  /^node_modules\/(?:firebase|firebase-admin|@firebase)(?:\/|$)/.test(name),
);

assert.deepEqual(
  firebasePackages,
  [],
  `Firebase packages must not be installed: ${firebasePackages.join(', ')}`,
);
assert.deepEqual(
  lockedFirebasePackages,
  [],
  `The lockfile must not install Firebase packages: ${lockedFirebasePackages.join(', ')}`,
);
assert.ok(runtimeDependencies.includes('@supabase/supabase-js'), 'Supabase client must remain available at runtime.');

console.log('Dependency boundary passed: Firebase is absent and Supabase remains a runtime dependency.');
