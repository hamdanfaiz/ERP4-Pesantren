import type { PublicClientRuntimeConfigKey } from "./publicRuntimeConfigKeys";

type PublicRuntimeConfig = Partial<Record<PublicClientRuntimeConfigKey, string>>;

declare global {
  interface Window {
    __ERP4_RUNTIME_CONFIG__?: PublicRuntimeConfig;
  }
}

/** Browser settings are sourced only from the server's explicit runtime allowlist. */
export function publicRuntimeConfigValue(key: PublicClientRuntimeConfigKey): string {
  if (typeof window !== "undefined") {
    const runtimeConfig = window.__ERP4_RUNTIME_CONFIG__;
    if (runtimeConfig && Object.prototype.hasOwnProperty.call(runtimeConfig, key)) {
      return runtimeConfig[key] || "";
    }
  }
  return "";
}
