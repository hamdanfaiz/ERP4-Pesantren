import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await availablePort();
const secret = "sb_secret_runtime_config_test_only";
const child = spawn(process.execPath, ["dist/server.cjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    SUPABASE_URL: "https://server-side.supabase.invalid",
    SUPABASE_SECRET_KEY: secret,
    SUPABASE_TAHFIDZ_RUNTIME_ENABLED: "false",
    VITE_SUPABASE_URL: "https://browser.supabase.invalid",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_runtime_config_test",
    VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  let response;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      response = await fetch(`${baseUrl}/runtime-config.json`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    await sleep(200);
  }

  assert.equal(child.exitCode, null, `Production server exited before serving runtime config. ${output.slice(-1500)}`);
  assert.equal(response?.status, 200, `Runtime config endpoint did not respond. ${output.slice(-1500)}`);
  assert.match(response.headers.get("content-type") || "", /application\/json/i);
  assert.match(response.headers.get("cache-control") || "", /no-store/i);

  const bodyText = await response.text();
  const config = JSON.parse(bodyText);
  assert.equal(config.VITE_SUPABASE_URL, "https://browser.supabase.invalid");
  assert.equal(config.VITE_SUPABASE_PUBLISHABLE_KEY, "sb_publishable_runtime_config_test");
  assert.equal(config.VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED, "true");
  assert.equal(config.SUPABASE_TAHFIDZ_RUNTIME_ENABLED, undefined, "Server-only gates must not be exposed to browser config.");
  assert.ok(!bodyText.includes(secret), "Server secret must not appear in browser runtime config.");
  console.log("Runtime config HTTP smoke passed: current browser values are served uncached and server secrets remain private.");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
