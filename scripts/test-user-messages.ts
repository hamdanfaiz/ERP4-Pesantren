import assert from "node:assert/strict";
import { toERPUserMessage } from "../src/utils/userMessages";

const fallback = "Tindakan belum dapat diproses. Silakan coba kembali.";
assert.equal(toERPUserMessage(new TypeError("Failed to fetch"), fallback), "Koneksi sedang bermasalah. Periksa jaringan lalu coba kembali.");
assert.equal(toERPUserMessage("Invalid login credentials", fallback), "Email atau kata sandi tidak sesuai. Periksa kembali lalu coba lagi.");
assert.equal(toERPUserMessage(new Error("Session expired"), fallback), "Sesi Anda telah berakhir. Silakan masuk kembali.");
assert.equal(toERPUserMessage(new Error("403 permission denied"), fallback), "Anda tidak memiliki akses untuk melakukan tindakan ini.");
assert.equal(toERPUserMessage(new Error("Data changed since preview. 409"), fallback), "Data berubah sejak terakhir diperiksa. Muat ulang pratinjau sebelum melanjutkan.");
assert.equal(toERPUserMessage(new Error("Supabase RPC cbt_admin failed with PGRST202"), fallback), fallback, "provider diagnostics stay out of customer-facing messages");
assert.equal(toERPUserMessage(new Error("https://service.example.invalid/api/private"), fallback), fallback, "service URLs stay out of customer-facing messages");
assert.equal(toERPUserMessage(new Error("Silakan pilih tanggal ujian."), fallback), "Silakan pilih tanggal ujian.", "safe Indonesian validation copy remains actionable");
assert.equal(toERPUserMessage({ message: "Stack trace: server failed" }, fallback), fallback, "unknown provider objects use a safe fallback");
assert.equal(toERPUserMessage(null, fallback), fallback, "empty errors use a safe fallback");

console.log("Customer-facing error copy: 10 assertions passed");
