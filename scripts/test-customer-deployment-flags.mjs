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

function assertFalseDefault(block, name, indent, location) {
  const line = new RegExp(`^\\s{${indent}}${escapeRegExp(name)}:\\s+\\$\\{${escapeRegExp(name)}:-false\\}\\s*$`, "m");
  assert.match(block, line, `${location} must pass ${name} with a false default`);
}

const clientSource = sourceFiles("src").map(read).join("\n");
const serverSource = ["server.ts", ...sourceFiles("src/server")].map(read).join("\n");
const clientFlags = [...new Set(collectMatches(clientSource, /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g))].sort();
const serverFlags = [...new Set(collectMatches(serverSource, /process\.env\.(SUPABASE_[A-Z0-9_]+)/g))]
  .filter((name) => /(RUNTIME_ENABLED|IMPORT_ENABLED|_ENABLED)$/.test(name))
  .sort();

const compose = read("docker-compose.yml");
const dockerfile = read("Dockerfile");
const envExample = read(".env.example");
assert.match(
  read("docker-compose.yml"),
  /^      TRUST_PROXY_HOPS: \$\{TRUST_PROXY_HOPS:-0\}$/m,
  "Docker Compose must default to trusting no forwarded proxies",
);
const buildBlock = compose.match(/^    build:\r?\n([\s\S]*?)^    image:/m)?.[1];
const environmentBlock = compose.match(/^    environment:\r?\n([\s\S]*?)^    ports:/m)?.[1];
assert.ok(buildBlock, "docker-compose.yml must define the application build block");
assert.ok(environmentBlock, "docker-compose.yml must define the application environment block");

for (const name of clientFlags) {
  assertFalseDefault(buildBlock, name, 8, "docker-compose.yml build.args");
  assert.match(dockerfile, new RegExp(`^ARG ${escapeRegExp(name)}$`, "m"), `Dockerfile must declare ${name}`);
  assert.match(dockerfile, new RegExp(`^ENV ${escapeRegExp(name)}=`, "m"), `Dockerfile must expose ${name} to the Vite build`);
  assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
}

for (const name of serverFlags) {
  assertFalseDefault(environmentBlock, name, 6, "docker-compose.yml environment");
  assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
}

for (const secretName of [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PII_ENCRYPTION_KEY",
  "PII_FINGERPRINT_KEY",
  "SUPABASE_LEGACY_FINGERPRINT_KEY",
  "SUPABASE_DB_PASSWORD",
]) {
  assert.doesNotMatch(buildBlock, new RegExp(`^\\s+${escapeRegExp(secretName)}:`, "m"), `${secretName} must not be passed as a Docker build argument`);
}

console.log(`Customer deployment flags verified: ${clientFlags.length} browser flags and ${serverFlags.length} server gates; all remain off by default.`);

