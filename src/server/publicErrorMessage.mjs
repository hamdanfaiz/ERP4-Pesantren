const INTERNAL_ERROR_TERMS = /\b(?:supabase|firebase|firestore|backend|runtime|legacy|migration|migrasi|rls|sql|storage|operator|kebijakan|policy|api|cursor|kursor|uuid|record|database|schema|query)\b/i;
const INTERNAL_API_ERROR_DETAILS = /\bSQLSTATE\b|invalid input syntax for type|syntax error at or near|operator does not exist|cached plan must not change result type|\bduplicate key(?: value)?\b|\bviolates?\s+(?:a\s+)?(?:unique|foreign key|check|not[- ]null|exclusion)\s+constraint\b|\bpermission denied for (?:table|relation|schema|function)\b|\bmust be (?:owner|superuser) of\b|\bKey\s*\([^)]*\)\s*=|\bPGRST\d+\b/i;
const GENERIC_PUBLIC_ERROR = "Permintaan belum dapat diproses. Silakan coba kembali atau hubungi administrator pesantren.";
const GENERIC_SERVER_ERROR = "Layanan ini sedang mengalami kendala. Silakan coba kembali nanti.";
const PUBLIC_ERROR_FIELDS = new Set(["error", "message", "details", "hint", "reason"]);
const INTERNAL_DATABASE_ERROR_CODE = /^(?:[0-9A-Z]{5}|PGRST\d+)$/i;

function toPublicErrorText(message, status, code) {
  const value = String(message || "").trim();
  if (status >= 500 && code === "FEATURE_UNAVAILABLE") return "Fitur ini belum tersedia saat ini.";
  if (status >= 500) return GENERIC_SERVER_ERROR;
  if (!value || /^[0-9A-Z]{5}$/i.test(String(code || "")) || INTERNAL_ERROR_TERMS.test(value) || INTERNAL_API_ERROR_DETAILS.test(value)) return GENERIC_PUBLIC_ERROR;
  return value
    .replace(/\btenants?\s+akun ini\b/gi, "pesantren yang terhubung dengan akun ini")
    .replace(/\btenants?\b/gi, "pesantren")
    .replace(/\brosters?\b/gi, "daftar santri");
}

export function sanitizePublicErrorPayload(payload, status = 400) {
  if (Array.isArray(payload)) return payload.map((item) => sanitizePublicErrorPayload(item, status));
  if (!payload || typeof payload !== "object" || Buffer.isBuffer(payload)) return payload;

  const sanitized = { ...payload };
  const originalCode = sanitized.code;
  if (typeof originalCode === "string" && INTERNAL_DATABASE_ERROR_CODE.test(originalCode.trim())) {
    sanitized.code = "REQUEST_FAILED";
  }
  for (const [key, value] of Object.entries(sanitized)) {
    if (PUBLIC_ERROR_FIELDS.has(key.toLowerCase()) && typeof value === "string") {
      sanitized[key] = toPublicErrorText(value, status, originalCode);
    } else if (Array.isArray(value) || (value && typeof value === "object")) {
      sanitized[key] = sanitizePublicErrorPayload(value, status);
    }
  }
  return sanitized;
}

export { GENERIC_PUBLIC_ERROR };
