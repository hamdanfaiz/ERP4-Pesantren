import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "utils", "userMessages.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { toERPUserMessage } = await import(moduleUrl);
const fallback = "Data belum dapat dimuat. Coba kembali.";

const cases = [
  [new Error("Invalid login credentials"), "Email atau kata sandi tidak sesuai. Periksa kembali lalu coba lagi."],
  [new Error("Failed to fetch"), "Koneksi sedang bermasalah. Periksa jaringan lalu coba kembali."],
  [{ message: "permission denied" }, "Anda tidak memiliki akses untuk melakukan tindakan ini."],
  [new Error("Session expired"), "Sesi Anda telah berakhir. Silakan masuk kembali."],
  [new Error("HTTP 409: data berubah sejak pratinjau"), "Data berubah sejak terakhir diperiksa. Muat ulang pratinjau sebelum melanjutkan."],
  [new Error("Email rate limit exceeded; 429"), "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba kembali."],
  [new Error("Weak password: password is too short"), "Kata sandi belum memenuhi ketentuan. Gunakan minimal 12 karakter."],
  [new Error("relation public.profiles does not exist"), fallback],
  [{ message: "column tenant_id does not exist at https://internal.example" }, fallback],
  [new Error("Backend belum mengonfirmasi pemetaan kelas."), fallback],
  [new Error("Runtime Dashboard Supabase belum diaktifkan operator."), fallback],
  [new Error("Kunci fingerprint migrasi server belum dikonfigurasi."), fallback],
  ["Database stack trace: secret detail", fallback],
  [new Error("Data berhasil disimpan."), "Data berhasil disimpan."],
];

for (const [error, expected] of cases) {
  assert.equal(toERPUserMessage(error, fallback), expected);
}

console.log(`User-facing error message safety passed: ${cases.length} scenarios.`);
