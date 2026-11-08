/** Keep implementation and provider errors out of customer-facing messages. */
export function toERPUserMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;

  if (/failed to fetch|fetch failed|networkerror|network request failed/i.test(message)) {
    return "Koneksi sedang bermasalah. Periksa jaringan lalu coba kembali.";
  }
  if (/sesi.*berakhir|session.*expired|token.*expired|\b401\b/i.test(message)) {
    return "Sesi Anda telah berakhir. Silakan masuk kembali.";
  }
  if (/tidak memiliki akses|akses.*ditolak|unauthorized|forbidden|permission denied|\b403\b/i.test(message)) {
    return "Anda tidak memiliki akses untuk melakukan tindakan ini.";
  }
  if (/berubah sejak.*pratinjau|berubah sejak.*preview|pratinjau.*kedaluwarsa|\b409\b/i.test(message)) {
    return "Data berubah sejak terakhir diperiksa. Muat ulang pratinjau sebelum melanjutkan.";
  }

  const technicalDetail = /supabase|postgres(?:ql)?|sqlstate|firebase|firestore|rest\/v\d|\/api\/|\brpc\b|\bjwt\b|\bbearer\b|\btoken\b|\brls\b|\btenant\b|stack trace|traceback|exception|syntax error|invalid input syntax|constraint|column .* does not exist|relation .* does not exist|http\s?\d{3}|\bPGRST\d+\b|(?:^|\b)(?:type|reference|syntax|range|network|abort)error\b/i;
  if (message.length > 220 || technicalDetail.test(message) || /https?:\/\//i.test(message)) return fallback;
  return message;
}
