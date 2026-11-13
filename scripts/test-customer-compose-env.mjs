import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [compose, example] = await Promise.all([
  readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
]);

const composeVariables = [...new Set(
  [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?=[:}])/g)].map((match) => match[1]),
)].sort();
assert.match(compose, /^\s+-\s+"127\.0\.0\.1:\$\{ERP4_HTTP_PORT:-3000\}:3000"\s*$/m, "default app port must bind to loopback");

const exampleVariables = new Set(
  [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
);
const missingVariables = composeVariables.filter((name) => !exampleVariables.has(name));
assert.deepEqual(
  missingVariables,
  [],
  `docker-compose.yml variables missing from .env.example: ${missingVariables.join(", ")}`,
);

const requiredSetupVariables = [
  "ERP4_IMAGE_TAG",
  "ERP4_HTTP_PORT",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];
for (const name of requiredSetupVariables) {
  assert.ok(exampleVariables.has(name), `.env.example must document ${name}`);
}

const serverSecrets = new Set([
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
  "SUPABASE_DB_POOLER_URL",
  "PII_ENCRYPTION_KEY",
  "PII_FINGERPRINT_KEY",
  "SUPABASE_LEGACY_FINGERPRINT_KEY",
]);
for (const line of example.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match || !serverSecrets.has(match[1])) continue;
  const value = match[2].replace(/^(['"])(.*)\1$/, "$2").trim();
  assert.equal(value, "", `.env.example must not contain a value for ${match[1]}`);
}

console.log(`Customer environment example: ${composeVariables.length} Compose variables documented; secret placeholders are empty.`);
