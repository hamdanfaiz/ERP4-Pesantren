const INTERNAL_ERROR_TERMS = /\b(?:supabase|firebase|firestore|backend|runtime|legacy|migration|migrasi|rls|sql|storage|operator|kebijakan|policy|api|cursor|kursor|uuid|record|database|schema|query)\b/i;
const GENERIC_PUBLIC_ERROR = "Permintaan belum dapat diproses. Silakan coba kembali atau hubungi administrator pesantren.";
const PUBLIC_ERROR_FIELDS = new Set(["error", "message", "details", "hint", "reason"]);

function toPublicErrorText(message) {
  const value = String(message || "").trim();
  if (!value || INTERNAL_ERROR_TERMS.test(value)) return GENERIC_PUBLIC_ERROR;
  return value
    .replace(/\btenants?\b/gi, "pesantren")
    .replace(/\brosters?\b/gi, "daftar santri");
}

export function sanitizePublicErrorPayload(payload) {
  if (Array.isArray(payload)) return payload.map(sanitizePublicErrorPayload);
  if (!payload || typeof payload !== "object" || Buffer.isBuffer(payload)) return payload;

  const sanitized = { ...payload };
  for (const [key, value] of Object.entries(sanitized)) {
    if (PUBLIC_ERROR_FIELDS.has(key.toLowerCase()) && typeof value === "string") {
      sanitized[key] = toPublicErrorText(value);
    } else if (Array.isArray(value) || (value && typeof value === "object")) {
      sanitized[key] = sanitizePublicErrorPayload(value);
    }
  }
  return sanitized;
}

export { GENERIC_PUBLIC_ERROR };
