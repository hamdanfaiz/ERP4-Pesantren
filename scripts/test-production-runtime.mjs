import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

for (const packageName of ['firebase', 'firebase-admin/app', 'firebase-admin/firestore']) {
  assert.throws(() => require.resolve(packageName), { code: 'MODULE_NOT_FOUND' }, `${packageName} must not be installed in production.`);
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

const inheritedRuntimeEnvironment = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'SystemRoot', 'WINDIR'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
const port = await availablePort();
const child = spawn(process.execPath, ['dist/server.cjs'], {
  cwd: process.cwd(),
  env: {
    ...inheritedRuntimeEnvironment,
    NODE_ENV: 'production',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  let pageResponse;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        pageResponse = response;
        break;
      }
    } catch {}
    await sleep(200);
  }
  assert.ok(child.exitCode === null, `Production server exited before becoming ready. ${output.slice(-1500)}`);
  assert.equal(pageResponse?.status, 200, `Production server did not serve its built frontend. ${output.slice(-1500)}`);
  assert.match(pageResponse.headers.get('content-type') || '', /text\/html/i);

  const protectedApi = await fetch(`${baseUrl}/api/users`);
  assert.equal(protectedApi.status, 401, 'Protected APIs must still reject requests without Supabase authentication.');

  console.log('Production runtime smoke passed: Firebase packages absent, server starts, frontend serves, and protected API remains closed.');
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
