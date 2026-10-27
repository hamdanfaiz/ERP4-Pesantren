import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

function sourceFiles(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relativePath);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [relativePath] : [];
  });
}

function collectMatches(contents, expression) {
  return [...contents.matchAll(expression)].map((match) => match[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertRuntimeDefault(block, name, value, location) {
  const line = new RegExp(`^\\s+${escapeRegExp(name)}:\\s+\\$\\{${escapeRegExp(name)}:-${escapeRegExp(value)}\\}\\s*$`, "m");
  assert.match(block, line, `${location} must pass ${name} with a ${value} default`);
}

const clientSource = sourceFiles("src").map(read).join("\n");
const serverSource = ["server.ts", ...sourceFiles("src/server")].map(read).join("\n");
const clientKeys = [...new Set(collectMatches(clientSource, /publicRuntimeConfigValue\(["'](VITE_[A-Z0-9_]+)["']\)/g))].sort();
const serverFlags = [...new Set(collectMatches(serverSource, /process\.env\.(SUPABASE_[A-Z0-9_]+)/g))]
  .filter((name) => /(RUNTIME_ENABLED|IMPORT_ENABLED|_ENABLED)$/.test(name))
  .sort();
const compose = read("docker-compose.yml");
const dockerfile = read("Dockerfile");
const envExample = read(".env.example");
const indexHtml = read("index.html");
const runtimeKeys = read("src/publicRuntimeConfigKeys.ts");
const runtimeConfig = read("src/runtimeConfig.ts");
const server = read("server.ts");
const environmentBlock = compose.match(/^    environment:\r?\n([\s\S]*?)^    ports:/m)?.[1];
assert.ok(environmentBlock, "docker-compose.yml must define the application environment block");
assert.match(compose, /^      TRUST_PROXY_HOPS: \$\{TRUST_PROXY_HOPS:-0\}$/m, "Docker Compose must default to trusting no forwarded proxies");
assert.doesNotMatch(compose, /^    build:/m, "Customer Compose deployment must run the same prebuilt image in every environment");
assert.doesNotMatch(dockerfile, /^(?:ARG|ENV) VITE_/m, "Vite settings must not be frozen into the Docker image");
assert.doesNotMatch(runtimeConfig, /import\.meta\.env/, "Client runtime settings must not fall back to build-time Vite values");

const declaredRuntimeKeys = [...new Set(collectMatches(runtimeKeys, /"(VITE_[A-Z0-9_]+)"/g))].sort();
assert.deepEqual(declaredRuntimeKeys, [...new Set([...clientKeys, "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL"])].sort(),
  "The browser runtime-config allowlist must match the client settings used by the source");
assert.ok(declaredRuntimeKeys.every((key) => !/(SECRET|SERVICE_ROLE|PII_|DB_PASSWORD)/.test(key)), "The public runtime allowlist must not contain secrets");

for (const name of declaredRuntimeKeys) {
  if (name === "VITE_SUPABASE_URL") {
    assert.match(environmentBlock, /^\s+VITE_SUPABASE_URL:\s+\$\{VITE_SUPABASE_URL:\?[^\r\n]+\}$/m, "Supabase URL must be required at container runtime");
    assert.match(envExample, /^VITE_SUPABASE_URL=$/m, ".env.example must document the public Supabase URL");
  } else if (name === "VITE_SUPABASE_PUBLISHABLE_KEY") {
    assert.match(environmentBlock, /^\s+VITE_SUPABASE_PUBLISHABLE_KEY:\s+\$\{VITE_SUPABASE_PUBLISHABLE_KEY:\?[^\r\n]+\}$/m, "Supabase publishable key must be required at container runtime");
    assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=$/m, ".env.example must document the public Supabase key");
  } else {
    assertRuntimeDefault(environmentBlock, name, "false", "docker-compose.yml runtime environment");
    assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
  }
}

for (const name of serverFlags) {
  assertRuntimeDefault(environmentBlock, name, "false", "docker-compose.yml server environment");
  assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
}

assert.match(indexHtml, /src="\/src\/bootstrap\.ts"/, "index.html must load the runtime bootstrap");
const bootstrap = read("src/bootstrap.ts");
assert.ok(bootstrap.indexOf('fetch("/runtime-config.json"') < bootstrap.indexOf('import("./main")'), "Runtime settings must load before the browser app");
const routeStart = server.indexOf('app.get("/runtime-config.json"');
assert.ok(routeStart >= 0, "Server must expose a runtime config endpoint");
const route = server.slice(routeStart, server.indexOf("\n  });", routeStart) + 6);
assert.match(route, /PUBLIC_CLIENT_RUNTIME_CONFIG_KEYS\.map/, "Endpoint must serialize only the explicit public allowlist");
assert.match(route, /Cache-Control.*no-store/, "Runtime config must not be cached across environment changes");
assert.match(route, /res\.json\(config\)/, "Runtime settings must be served as JSON rather than executable script");
assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|PII_ENCRYPTION_KEY|PII_FINGERPRINT_KEY/,
  "Server secrets must never be present in browser runtime config");

for (const secretName of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PII_ENCRYPTION_KEY", "PII_FINGERPRINT_KEY", "SUPABASE_LEGACY_FINGERPRINT_KEY", "SUPABASE_DB_PASSWORD"]) {
  assert.doesNotMatch(dockerfile, new RegExp(`^(?:ARG|ENV) ${escapeRegExp(secretName)}(?:=|\\s)`, "m"), `${secretName} must not be embedded in the image`);
}

console.log(`Customer deployment config verified: ${declaredRuntimeKeys.length} allowlisted public runtime values and ${serverFlags.length} fail-closed server gates.`);
