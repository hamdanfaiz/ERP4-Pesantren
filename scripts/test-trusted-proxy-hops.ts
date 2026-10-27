import assert from "node:assert/strict";
import { resolveTrustedProxyHops } from "../src/server/trustedProxyHops";

assert.equal(resolveTrustedProxyHops({}), 0, "Direct/self-managed deployments must not trust forwarded headers by default.");
assert.equal(resolveTrustedProxyHops({ NODE_ENV: "production" }), 0);
assert.equal(resolveTrustedProxyHops({ K_SERVICE: "erp-service" }), 1, "Cloud Run defaults to its single proxy hop.");
assert.equal(resolveTrustedProxyHops({ K_SERVICE: "erp-service", TRUST_PROXY_HOPS: "" }), 1);
assert.equal(resolveTrustedProxyHops({ K_SERVICE: "erp-service", TRUST_PROXY_HOPS: "0" }), 0, "Explicit direct-client mode overrides Cloud Run detection.");
assert.equal(resolveTrustedProxyHops({ TRUST_PROXY_HOPS: "1" }), 1, "Self-managed proxy count is configurable.");
assert.equal(resolveTrustedProxyHops({ TRUST_PROXY_HOPS: "3" }), 3);
assert.equal(resolveTrustedProxyHops({ TRUST_PROXY_HOPS: "10" }), 10);

for (const value of ["true", "-1", "1.5", "01", "11", "one"]) {
  assert.throws(
    () => resolveTrustedProxyHops({ TRUST_PROXY_HOPS: value }),
    /TRUST_PROXY_HOPS harus berupa bilangan bulat 0–10/,
    `Invalid proxy hop setting ${value} must fail closed.`,
  );
}

console.log("Trusted proxy configuration verified for Cloud Run, direct, proxy, and invalid settings.");
