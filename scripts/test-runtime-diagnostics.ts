import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeUnavailableDiagnostic } from "../src/server/runtimeDiagnostics";
import { logRuntimeFeatureUnavailable } from "../src/server/runtimeDiagnostics";

assert.deepEqual(buildRuntimeUnavailableDiagnostic("GET", "/api/hris/roles"), {
  code: "FEATURE_UNAVAILABLE",
  method: "GET",
  route: "/api/hris/roles",
});

assert.deepEqual(buildRuntimeUnavailableDiagnostic("POST", "/api/cbt/exams/:examId"), {
  code: "FEATURE_UNAVAILABLE",
  method: "POST",
  route: "/api/cbt/exams/:examId",
});

assert.deepEqual(buildRuntimeUnavailableDiagnostic("GET", "/api/students/2026910001"), {
  code: "FEATURE_UNAVAILABLE",
  method: "GET",
});

assert.deepEqual(buildRuntimeUnavailableDiagnostic("GET", "/api/health?email=user@example.invalid"), {
  code: "FEATURE_UNAVAILABLE",
  method: "GET",
});

assert.deepEqual(buildRuntimeUnavailableDiagnostic("TRACE", "/api/runtime"), {
  code: "FEATURE_UNAVAILABLE",
  route: "/api/runtime",
});

const warningCalls: unknown[][] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => warningCalls.push(args);
try {
  logRuntimeFeatureUnavailable("GET", "/api/runtime-diagnostic-test");
  logRuntimeFeatureUnavailable("GET", "/api/runtime-diagnostic-test");
} finally {
  console.warn = originalWarn;
}
assert.equal(warningCalls.length, 1, "Each static unavailable route must be logged once per process");
assert.deepEqual(warningCalls[0][1], {
  code: "FEATURE_UNAVAILABLE",
  method: "GET",
  route: "/api/runtime-diagnostic-test",
});

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
assert.match(serverSource, /res\.statusCode === 503[\s\S]{0,180}payload\.code === "FEATURE_UNAVAILABLE"[\s\S]{0,120}logRuntimeFeatureUnavailable\(_req\.method, _req\.route\?\.path\)/,
  "The central API response wrapper must emit only safe feature-unavailable route diagnostics");

console.log("Runtime diagnostics: static route metadata only; request values omitted.");
