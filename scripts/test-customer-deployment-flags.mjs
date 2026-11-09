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

function assertRuntimeDefault(block, name, value, location) {
  const line = new RegExp(`^\\s+${escapeRegExp(name)}:\\s+\\$\\{${escapeRegExp(name)}:-${escapeRegExp(value)}\\}\\s*$`, "m");
  assert.match(block, line, `${location} must pass ${name} with a ${value} default`);
}

const clientSource = sourceFiles("src").map(read).join("\n");
const serverSource = ["server.ts", ...sourceFiles("src/server")].map(read).join("\n");
const clientKeys = [...new Set(collectMatches(clientSource, /publicRuntimeConfigValue\(["'](VITE_[A-Z0-9_]+)["']\)/g))].sort();
const serverFlags = [...new Set(collectMatches(serverSource, /process\.env\.(SUPABASE_[A-Z0-9_]+)/g))]
  .filter((name) => /(RUNTIME_ENABLED|IMPORT_ENABLED|_ENABLED)$/.test(name))
  .sort();
const compose = read("docker-compose.yml");
const dockerfile = read("Dockerfile");
const envExample = read(".env.example");
const settingsService = read("src/services/systemSettingsService.ts");
const settingsUi = read("src/pages/SettingsManager.tsx");
const hrisUi = read("src/pages/SupabaseHrisManager.tsx");
const tahfidzUi = read("src/pages/TahfidzManager.tsx");
const documentUi = read("src/pages/SupabaseDocumentManager.tsx");
const gaAssetsUi = read("src/pages/SupabaseGeneralAffairsAssets.tsx");
const tabStyles = read("src/index.css");
const appUi = read("src/App.tsx");
const sidebarUi = read("src/components/Sidebar.tsx");
const indexHtml = read("index.html");
const runtimeKeys = read("src/publicRuntimeConfigKeys.ts");
const runtimeConfig = read("src/runtimeConfig.ts");
const server = read("server.ts");
const centralStructure = read("src/services/centralStructureService.ts");
assert.match(server, /const FEATURE_UNAVAILABLE_MESSAGE\s*=\s*"Layanan ini belum tersedia saat ini\./,
  "Disabled feature flags must use customer-facing copy without operator instructions");
assert.doesNotMatch(server, /error:\s*"[^"]*belum diaktifkan operator\./i,
  "API responses must not expose operator-only feature-flag guidance");
assert.doesNotMatch(serverSource, /Konfigurasi .*Supabase belum lengkap\.|Supabase belum dikonfigurasi di server\./i,
  "API errors must not expose internal Supabase configuration details");
assert.match(server, /const INTERNAL_API_ERROR_DETAILS[\s\S]{0,500}sqlstate/i,
  "Backend and database details must be recognized before returning error messages to customers");
assert.match(server, /invalid input syntax for type[\s\S]{0,220}syntax error at or near[\s\S]{0,220}operator does not exist[\s\S]{0,220}cached plan must not change result type/i,
  "Common PostgreSQL parser, type, operator, and cached-plan errors must be recognized as internal details");
assert.match(server, /if \(status >= 500 \|\| INTERNAL_API_ERROR_DETAILS\.test\(message\)\)\s*\{\s*return "Layanan ini sedang mengalami kendala\./,
  "Server-side and internal-detail errors must be translated into customer-facing copy");
assert.doesNotMatch(server, /return res\.status\(error\.status\)\.json\(\{\s*error:\s*error\.message\s*\}\)/,
  "Typed server failures must not return raw internal messages to clients");
assert.doesNotMatch(server, /error:\s*["'`][^"'`]*(?:Supabase|runtime|migration|konfigurasi|flag runtime|belum disiapkan|menunggu audit|diaktifkan oleh pengelola)/i,
  "Customer-facing API errors must not expose backend setup or operator instructions");
const publicProxyStart = server.indexOf("// WILAYAH & QURAN API PROXIES");
const developmentRoutesStart = server.indexOf('if (process.env.NODE_ENV !== "production")', publicProxyStart);
assert.ok(publicProxyStart >= 0 && developmentRoutesStart > publicProxyStart,
  "Public proxy routes must remain in a bounded section for error-copy checks");
assert.doesNotMatch(server.slice(publicProxyStart, developmentRoutesStart), /error:\s*e\.message/,
  "Public data proxy errors must not expose upstream implementation details");
assert.doesNotMatch(server, /code:\s*"INVITATION_(?:FAILED|VERIFY_FAILED|CLAIM_FAILED)"[\s\S]{0,180}error:\s*err\.message/i,
  "Guardian invitation errors must not expose raw identity-provider messages");
assert.doesNotMatch(server, /status === 500\s*\?[^\n]+:\s*err\.message/,
  "Public registration server failures must not return raw backend errors");
assert.doesNotMatch(read("src/server/supabasePublicPpdb.ts"), /SupabasePublicPpdbError\(400,\s*body\?\.message/,
  "Public registration database errors must not expose raw database messages");
assert.doesNotMatch(centralStructure, /(?:message|error):\s*["'`]Runtime .*Supabase|error\?\.message/,
  "Room-assignment errors must not expose runtime flags or raw backend messages");
const environmentBlock = compose.match(/^    environment:\r?\n([\s\S]*?)^    ports:/m)?.[1];
assert.ok(environmentBlock, "docker-compose.yml must define the application environment block");
assert.match(compose, /^      TRUST_PROXY_HOPS: \$\{TRUST_PROXY_HOPS:-0\}$/m, "Docker Compose must default to trusting no forwarded proxies");
assert.doesNotMatch(compose, /^    build:/m, "Customer Compose deployment must run the same prebuilt image in every environment");
assert.doesNotMatch(dockerfile, /^(?:ARG|ENV) VITE_/m, "Vite settings must not be frozen into the Docker image");
assert.doesNotMatch(runtimeConfig, /import\.meta\.env/, "Client runtime settings must not fall back to build-time Vite values");

const declaredRuntimeKeys = [...new Set(collectMatches(runtimeKeys, /"(VITE_[A-Z0-9_]+)"/g))].sort();
const composeClientKeys = [...new Set(collectMatches(environmentBlock, /^\s+(VITE_SUPABASE_[A-Z0-9_]+):/gm))].sort();
const envExampleClientKeys = [...new Set(collectMatches(envExample, /^(VITE_SUPABASE_[A-Z0-9_]+)=/gm))].sort();
assert.deepEqual(declaredRuntimeKeys, [...new Set([...clientKeys, "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL"])].sort(),
  "The browser runtime-config allowlist must match the client settings used by the source");
assert.deepEqual(composeClientKeys, declaredRuntimeKeys,
  "Docker Compose must pass only browser runtime settings declared in the public allowlist");
assert.deepEqual(envExampleClientKeys, declaredRuntimeKeys,
  ".env.example must document exactly the browser runtime settings declared in the public allowlist");
assert.ok(declaredRuntimeKeys.every((key) => !/(SECRET|SERVICE_ROLE|PII_|DB_PASSWORD)/.test(key)), "The public runtime allowlist must not contain secrets");

for (const name of declaredRuntimeKeys) {
  if (name === "VITE_SUPABASE_URL") {
    assert.match(environmentBlock, /^\s+VITE_SUPABASE_URL:\s+\$\{VITE_SUPABASE_URL:\?[^\r\n]+\}$/m, "Supabase URL must be required at container runtime");
    assert.match(envExample, /^VITE_SUPABASE_URL=$/m, ".env.example must document the public Supabase URL");
  } else if (name === "VITE_SUPABASE_PUBLISHABLE_KEY") {
    assert.match(environmentBlock, /^\s+VITE_SUPABASE_PUBLISHABLE_KEY:\s+\$\{VITE_SUPABASE_PUBLISHABLE_KEY:\?[^\r\n]+\}$/m, "Supabase publishable key must be required at container runtime");
    assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=$/m, ".env.example must document the public Supabase key");
  } else {
    assertRuntimeDefault(environmentBlock, name, "false", "docker-compose.yml runtime environment");
    assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
  }
}

for (const name of serverFlags) {
  assertRuntimeDefault(environmentBlock, name, "false", "docker-compose.yml server environment");
  assert.match(envExample, new RegExp(`^${escapeRegExp(name)}=false$`, "m"), `.env.example must keep ${name} off`);
}

assert.match(indexHtml, /src="\/src\/bootstrap\.ts"/, "index.html must load the runtime bootstrap");
const bootstrap = read("src/bootstrap.ts");
assert.ok(bootstrap.indexOf('fetch("/runtime-config.json"') < bootstrap.indexOf('import("./main")'), "Runtime settings must load before the browser app");
const blockBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Missing source block: ${startMarker}`);
  return source.slice(start, end);
};
const orgDefaults = blockBetween(settingsService, "export const DEFAULT_ORG_INFO", "export const DEFAULT_INTEGRATIONS");
const integrationDefaults = blockBetween(settingsService, "export const DEFAULT_INTEGRATIONS", "export const DEFAULT_MOBILE_CONFIG");
const mobileDefaults = blockBetween(settingsService, "export const DEFAULT_MOBILE_CONFIG", "export const SYSTEM_ROLES");
assert.ok(orgDefaults.includes('schoolName: "Pesantren"'), "Default organization name must be generic, not a fake customer identity");
assert.ok(orgDefaults.includes('pageTitleFormat: "ERP4 Pesantren | {schoolName}"'), "Default page title must use the product brand");
assert.ok(integrationDefaults.includes('waGatewayEndpoint: ""') && integrationDefaults.includes('smtpHost: ""') && integrationDefaults.includes('smtpUser: ""') && integrationDefaults.includes('smtpPort: ""'), "New tenant integrations must start unconfigured");
assert.ok(mobileDefaults.includes('supportWhatsapp: ""'), "New tenant support contact must start unconfigured");
for (const placeholder of ["AI Studio", "pesantrenaistudio.edu", "+62 812 3456 7890", "wagw.example.com"]) assert.ok(!settingsService.includes(placeholder), `Demo value remains in tenant defaults: ${placeholder}`);
assert.match(settingsService, /SYSTEM_SETTINGS_RUNTIME_ENABLED\s*=\s*\n?\s*publicRuntimeConfigValue\("VITE_SUPABASE_SYSTEM_SETTINGS"\) === "true"/, "Tenant settings sync must follow its explicit client runtime gate");
assert.match(settingsService, /if \(nextTenantId && SYSTEM_SETTINGS_RUNTIME_ENABLED\) this\.initRealtimeSync\(nextTenantId\)/, "Disabled tenant settings must not poll a failing API route");
assert.match(settingsService, /if \(!SYSTEM_SETTINGS_RUNTIME_ENABLED\)[\s\S]{0,120}Pengaturan pesantren belum tersedia saat ini/, "Tenant settings writes must fail closed when the runtime gate is disabled");
assert.match(settingsUi, /if \(!SUPABASE_SYSTEM_SETTINGS\)[\s\S]{0,260}<ERPFeatureStatus/, "Disabled system settings must show a customer-facing unavailable state");
for (const stale of ["AI Studio automatically", "Secrets panel in the AI Studio", "Cloud Run Secret Manager", "MY_GEMINI_API_KEY", "MY_APP_URL"]) assert.ok(!envExample.includes(stale), `.env.example still contains obsolete setup text: ${stale}`);
assert.ok(settingsUi.includes("Pengiriman pemberitahuan melalui email belum tersedia."), "Settings UI must not imply that an unimplemented email integration can send messages");
assert.doesNotMatch(settingsUi, /Host SMTP|Port SMTP|WA_GATEWAY_API_KEY|penyimpanan rahasia milik environment deployment/, "Settings UI must not expose inactive integration controls or operator-only secret instructions");
assert.doesNotMatch(hrisUi, /Fase Supabase|backend Supabase|payroll, rekrutmen, biometrik|belum tersambung/i,
  "HRIS UI must not expose implementation-phase or disconnected-feature operator copy");
assert.match(hrisUi, /Saldo cuti dan jadwal kehadiran belum diperbarui otomatis/,
  "HRIS UI must clearly state the user-visible leave balance and attendance limitation");
assert.match(hrisUi, /hindari mencantumkan rincian diagnosis kesehatan/,
  "HRIS UI must preserve the privacy reminder for leave reasons");
assert.match(tahfidzUi, /<ERPTabs[\s\S]*ariaLabel="Bagian Sistem Tahfidz"/,
  "Tahfidz sections must use the shared horizontally scrollable tab control");
assert.match(documentUi, /import\s*\{[^}]*\bERPTabs\b[^}]*\}\s*from\s*["']\.\.\/components\/ERPDesignSystem["']/,
  "Digital Documents must import the shared tab control");
assert.match(documentUi, /<ERPTabs[\s\S]*ariaLabel="Bagian Dokumen Digital"/,
  "Digital Documents sections must use the shared horizontally scrollable tab control");
assert.match(gaAssetsUi, /import\s*\{[^}]*\bERPTabs\b[^}]*\}\s*from\s*["']\.\.\/components\/ERPDesignSystem["']/,
  "General Affairs asset sections must import the shared tab control");
assert.match(gaAssetsUi, /<ERPTabs[\s\S]*ariaLabel="Bagian aset dan inventaris GA"/,
  "General Affairs asset sections must use the shared horizontally scrollable tab control");
assert.doesNotMatch(gaAssetsUi, /Navigasi dan sub-menu Data Induk tetap dipertahankan/i,
  "General Affairs asset screen must not expose internal migration guidance");
assert.match(tahfidzUi, /toERPUserMessage\(responseError, 'Layanan Tahfidz belum dapat diproses saat ini\./,
  "Tahfidz API gate errors must be converted to customer-facing copy");
assert.match(tabStyles, /\.erp-tab-scroll\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*thin;/,
  "Long legacy tab strips must have bounded horizontal scrolling and a visible scrollbar");
assert.match(tabStyles, /\.erp-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:/,
  "Shared tabs must expose a theme-aware horizontal scrollbar in Firefox and mobile browsers");
assert.doesNotMatch(tabStyles, /\.erp-(?:tabs|tab-scroll)\s*\{[^}]*touch-action:\s*pan-x/,
  "Horizontal tab strips must allow vertical page scrolling on touch screens");
assert.match(tabStyles, /\.erp-tab-scroll::-webkit-scrollbar-thumb[\s\S]*border-radius:\s*999px/,
  "Horizontal tab scrollbars must use the shared visible theme style in Chromium browsers");
for (const [module, file] of [
  ["Akademik", "src/pages/AcademicManagerLegacy.tsx"],
  ["Asrama", "src/pages/BoardingManagerLegacy.tsx"],
  ["Keuangan", "src/pages/FinanceManagerLegacy.tsx"],
  ["CBT", "src/pages/CBTManagerLegacy.tsx"],
  ["Komunikasi", "src/pages/CommunicationHubLegacy.tsx"],
  ["Koperasi", "src/pages/CooperativeManagerLegacy.tsx"],
  ["Enterprise", "src/pages/EnterpriseManager.tsx"],
  ["HRIS", "src/pages/HRISManager.tsx"],
  ["Kesehatan", "src/pages/HealthcareManagerLegacy.tsx"],
  ["Laundry", "src/pages/LaundryManager.tsx"],
]) {
  assert.match(read(file), /erp-tab-scroll/, `${module} long tab strip must stay within its frame and expose horizontal scrolling`);
}
assert.ok(settingsUi.includes('placeholder="ERP4 Pesantren | {schoolName}"'), "Settings UI page-title example must match the product brand");
assert.ok(appUi.includes("schoolName: 'ERP4 Pesantren'") && appUi.includes("orgInfo.schoolName || 'ERP4 Pesantren'") && appUi.includes("`ERP4 Pesantren | ${schoolName}`"), "App defaults and browser title must use ERP4 Pesantren");
assert.ok(sidebarUi.includes(": 'ERP4 Pesantren'}</h1>"), "Sidebar fallback must use ERP4 Pesantren");
assert.doesNotMatch(appUi + sidebarUi, /Pesantren OS/, "Active app shell must not show the retired Pesantren OS brand");
assert.ok(!settingsUi.includes('placeholder="Pesantren OS | {schoolName}"') && !settingsUi.includes('placeholder="e.g.'), "Settings UI must not show obsolete product naming or English examples");

const routeStart = server.indexOf('app.get("/runtime-config.json"');
assert.ok(routeStart >= 0, "Server must expose a runtime config endpoint");
const route = server.slice(routeStart, server.indexOf("\n  });", routeStart) + 6);
assert.match(route, /PUBLIC_CLIENT_RUNTIME_CONFIG_KEYS\.map/, "Endpoint must serialize only the explicit public allowlist");
assert.match(route, /Cache-Control.*no-store/, "Runtime config must not be cached across environment changes");
assert.match(route, /res\.json\(config\)/, "Runtime settings must be served as JSON rather than executable script");
assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|PII_ENCRYPTION_KEY|PII_FINGERPRINT_KEY/,
  "Server secrets must never be present in browser runtime config");

for (const secretName of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PII_ENCRYPTION_KEY", "PII_FINGERPRINT_KEY", "SUPABASE_LEGACY_FINGERPRINT_KEY", "SUPABASE_DB_PASSWORD"]) {
  assert.doesNotMatch(dockerfile, new RegExp(`^(?:ARG|ENV) ${escapeRegExp(secretName)}(?:=|\\s)`, "m"), `${secretName} must not be embedded in the image`);
}

console.log(`Customer deployment config verified: ${declaredRuntimeKeys.length} allowlisted public runtime values and ${serverFlags.length} fail-closed server gates.`);

