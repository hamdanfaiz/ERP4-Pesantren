export interface TrustedProxyEnvironment {
  TRUST_PROXY_HOPS?: string;
  K_SERVICE?: string;
  NODE_ENV?: string;
}

const MAX_TRUSTED_PROXY_HOPS = 10;

/**
 * Return the exact count of trusted proxies for Express.
 * Cloud Run supplies K_SERVICE and has one proxy hop; other environments
 * default to trusting no forwarded headers.
 */
export function resolveTrustedProxyHops(
  env: TrustedProxyEnvironment = process.env,
): number {
  const raw = typeof env.TRUST_PROXY_HOPS === "string"
    ? env.TRUST_PROXY_HOPS.trim()
    : "";

  if (!raw) {
    return typeof env.K_SERVICE === "string" && env.K_SERVICE.trim() ? 1 : 0;
  }

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error("TRUST_PROXY_HOPS harus berupa bilangan bulat 0–10.");
  }

  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error("TRUST_PROXY_HOPS harus berupa bilangan bulat 0–10.");
  }

  return hops;
}
