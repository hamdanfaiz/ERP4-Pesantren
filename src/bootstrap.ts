import type { PublicClientRuntimeConfigKey } from "./publicRuntimeConfigKeys";

async function loadApplication() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Root element is missing.");

  const response = await fetch("/runtime-config.json", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Runtime configuration request failed (${response.status}).`);

  const configuration = await response.json() as Partial<Record<PublicClientRuntimeConfigKey, string>>;
  window.__ERP4_RUNTIME_CONFIG__ = Object.freeze(configuration);
  await import("./main");
}

void loadApplication().catch((error: unknown) => {
  if (import.meta.env.DEV) console.error("Application runtime configuration could not be loaded.", error);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<main role="alert" style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 12vh auto; padding: 2rem; color: #334155"><h1 style="font-size: 1.25rem">Aplikasi belum dapat dimuat</h1><p>Konfigurasi layanan gagal dibaca. Muat ulang halaman atau hubungi administrator sistem.</p></main>';
  }
});
