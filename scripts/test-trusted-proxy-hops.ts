import assert from "node:assert/strict";
import express from "express";
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


async function requestClientIp(trustedProxyHops: number): Promise<string> {
  const app = express();
  app.set("trust proxy", trustedProxyHops);
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test server did not bind to a TCP port.");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/ip`, {
      headers: { "x-forwarded-for": "198.51.100.22", connection: "close" },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { ip: string };
    return body.ip;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const forwardedIp = "198.51.100.22";
const directConnectionIp = await requestClientIp(resolveTrustedProxyHops({}));
assert.notEqual(directConnectionIp, forwardedIp, "Direct mode must ignore a spoofed X-Forwarded-For header.");
assert.equal(
  await requestClientIp(resolveTrustedProxyHops({ TRUST_PROXY_HOPS: "1" })),
  forwardedIp,
  "A configured single trusted proxy must expose its forwarded client IP to the rate limiter.",
);

console.log("Trusted proxy configuration and spoofed forwarding-header handling verified.");
