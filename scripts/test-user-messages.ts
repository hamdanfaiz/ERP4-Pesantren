import assert from "node:assert/strict";
import { toERPUserMessage } from "../src/utils/userMessages";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardedModuleFiles = [
  "src/pages/SupabaseAcademicReportPanel.tsx",
  "src/pages/SupabaseGeneralAffairManager.tsx",
  "src/components/SupabaseMasterDataAuditPanel.tsx",
  "src/pages/SupabaseEnterpriseUnitsManager.tsx",
  "src/pages/SupabaseHrisManager.tsx",
  "src/pages/SupabaseTahfidzSessions.tsx",
  "src/pages/SupabaseAlumniManager.tsx",
  "src/pages/SupabaseDocumentManager.tsx",
  "src/pages/SupabaseFinanceManager.tsx",
  "src/pages/SupabasePpdbManager.tsx",
  "src/pages/SupabaseFinanceBudgetManager.tsx",
  "src/pages/SupabaseAcademicManager.tsx",
  "src/pages/SupabaseLaundryManager.tsx",
  "src/pages/SupabaseHealthcareManager.tsx",
  "src/pages/SupabaseDonationManager.tsx",
  "src/pages/SupabaseCooperativeManager.tsx",
  "src/pages/SupabaseLibraryManager.tsx",
  "src/pages/SupabaseMarketplaceManager.tsx",
  "src/pages/SupabaseLMSManager.tsx",
  "src/pages/SupabaseCBTManager.tsx",
  "src/pages/SupabaseDashboardOverview.tsx",
  "src/components/SupabaseNamingSeriesManager.tsx",
  "src/pages/SupabaseCommunicationHub.tsx",
  "src/pages/SupabaseGeneralAffairsAssets.tsx",
];
const rawServiceErrorSetter = /set[A-Za-z0-9_]+\(\s*[A-Za-z_$][\w$]*\s*(?:\?\.message|instanceof\s+Error)/;
for (const relativePath of guardedModuleFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.match(source, /import\s+\{\s*toERPUserMessage\s*\}\s+from\s+["\'][^"\']*userMessages["\']/, `${relativePath} imports the shared customer-safe error mapper`);
  assert.match(source, /toERPUserMessage\(/, `${relativePath} maps service errors to customer-safe copy`);
  assert.doesNotMatch(source, rawServiceErrorSetter, `${relativePath} does not expose raw service error text`);
}


const fallback = "Tindakan belum dapat diproses. Silakan coba kembali.";
assert.equal(toERPUserMessage(new TypeError("Failed to fetch"), fallback), "Koneksi sedang bermasalah. Periksa jaringan lalu coba kembali.");
assert.equal(toERPUserMessage("Invalid login credentials", fallback), "Email atau kata sandi tidak sesuai. Periksa kembali lalu coba lagi.");
assert.equal(toERPUserMessage(new Error("Session expired"), fallback), "Sesi Anda telah berakhir. Silakan masuk kembali.");
assert.equal(toERPUserMessage(new Error("403 permission denied"), fallback), "Anda tidak memiliki akses untuk melakukan tindakan ini.");
assert.equal(toERPUserMessage(new Error("Data changed since preview. 409"), fallback), "Data berubah sejak terakhir diperiksa. Muat ulang pratinjau sebelum melanjutkan.");
assert.equal(toERPUserMessage(new Error("Supabase RPC cbt_admin failed with PGRST202"), fallback), fallback, "provider diagnostics stay out of customer-facing messages");
assert.equal(toERPUserMessage(new Error("Hasil roster belum dapat dimuat."), fallback), fallback, "roster terminology stays out of customer-facing messages");
assert.equal(toERPUserMessage(new Error("https://service.example.invalid/api/private"), fallback), fallback, "service URLs stay out of customer-facing messages");
assert.equal(toERPUserMessage(new Error("Silakan pilih tanggal ujian."), fallback), "Silakan pilih tanggal ujian.", "safe Indonesian validation copy remains actionable");
assert.equal(toERPUserMessage({ message: "Stack trace: server failed" }, fallback), fallback, "unknown provider objects use a safe fallback");
assert.equal(toERPUserMessage(null, fallback), fallback, "empty errors use a safe fallback");

console.log("Customer-facing error copy: 11 assertions passed");
