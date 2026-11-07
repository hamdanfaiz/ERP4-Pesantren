import assert from 'node:assert/strict';

const intentionallyPublicRoutes = new Set([
  'GET /api/public/guardian-registration/config',
  'GET /api/public/ppdb/config',
  'POST /api/public/ppdb/registrations',
  'GET /api/wilayah/provinces',
  'GET /api/wilayah/regencies/:provinceId',
  'GET /api/wilayah/districts/:regencyId',
  'GET /api/wilayah/villages/:districtId',
  'GET /api/quran/surat',
  'GET /api/quran/surat/:nomor',
]);

const intentionallyClosedRoutes = new Set([
  'POST /api/ai-search',
  'POST /api/header-ai-search',
  'POST /api/ocr',
]);

function getRouteRegistrations(source) {
  const routes = [];
  const registration = /\bapp\.(get|post|put|patch|delete|all|head|options)\s*\(\s*(['"])(\/api(?:\/[^'"]*)?)\2\s*,[^\n]*/g;
  for (const match of source.matchAll(registration)) {
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const lineEnd = source.indexOf('\n', match.index);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    if (line.trimStart().startsWith('//')) continue;
    const arrowIndex = line.indexOf('=>');
    routes.push({
      method: match[1].toUpperCase(),
      path: match[3],
      middlewareHeader: arrowIndex < 0 ? line : line.slice(0, arrowIndex),
    });
  }
  return routes;
}

export function auditServerApiAuthRoutes(source) {
  assert.doesNotMatch(source, /\bapp\.use\s*\(\s*['"]\/api(?:\/|['"])/, 'Mounting a separate /api router requires adding it to this audit.');
  const routes = getRouteRegistrations(source);
  assert.ok(routes.length >= 100, `Expected at least 100 registered /api routes; found ${routes.length}.`);
  const foundPublic = new Set();
  const foundClosed = new Set();
  const privateRoutes = [];
  const closedRoutes = [];

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (intentionallyPublicRoutes.has(key)) {
      foundPublic.add(key);
      continue;
    }
    if (intentionallyClosedRoutes.has(key)) {
      assert.match(route.middlewareHeader, /\bunavailableUntilAuth\b/, `${key} must remain behind the deny-only handler.`);
      foundClosed.add(key);
      closedRoutes.push(route);
      continue;
    }
    assert.match(route.middlewareHeader, /\brequireAuth\b/, `${key} is not explicitly protected by requireAuth.`);
    privateRoutes.push(route);
  }

  for (const key of intentionallyPublicRoutes) assert.ok(foundPublic.has(key), `Public route allowlist is stale: ${key} was not found.`);
  for (const key of intentionallyClosedRoutes) assert.ok(foundClosed.has(key), `Closed route allowlist is stale: ${key} was not found.`);
  return { routes, privateRoutes, closedRoutes, publicCount: foundPublic.size, closedCount: foundClosed.size };
}
