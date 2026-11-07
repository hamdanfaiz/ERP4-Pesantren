import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditServerApiAuthRoutes } from './api-route-auth-policy.mjs';

const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const policy = auditServerApiAuthRoutes(source);

// Mutation check proves the guard catches a private route that accidentally loses requireAuth.
const profileRoute = 'app.get("/api/auth/profile", requireAuth,';
assert.ok(source.includes(profileRoute), 'Expected profile route declaration was not found for mutation check.');
assert.throws(
  () => auditServerApiAuthRoutes(source.replace(profileRoute, 'app.get("/api/auth/profile",')),
  /GET \/api\/auth\/profile is not explicitly protected/,
  'The route-policy check must detect an accidentally unguarded private API route.',
);

console.log(`Passed: ${policy.privateRoutes.length} private API routes require authentication; ${policy.publicCount} explicit public routes and ${policy.closedCount} deny-only routes are allowlisted.`);
