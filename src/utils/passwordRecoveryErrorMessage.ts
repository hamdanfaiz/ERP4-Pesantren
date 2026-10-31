export function passwordRecoveryErrorMessage(error: unknown): string {
  const details = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : undefined;
  const message = typeof details?.message === 'string'
    ? details.message
    : error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const status = typeof details?.status === 'number' ? details.status : undefined;
  const code = typeof details?.code === 'string' ? details.code : undefined;

  if (/redirect|url/i.test(message)) {
    return 'Alamat aplikasi belum diizinkan untuk pemulihan akun. Hubungi administrator pesantren.';
  }

  if (
    status === 429 ||
    code === 'over_email_send_rate_limit' ||
    /(?:\b429\b|email rate limit exceeded|over_email_send_rate_limit)/i.test(message)
  ) {
    return 'Batas email pemulihan proyek sedang tercapai. Periksa kotak masuk dan folder spam untuk tautan terbaru, lalu coba lagi setelah batas kirim pulih. Jangan kirim permintaan berulang.';
  }

  return 'Permintaan pemulihan belum dapat diproses. Coba kembali beberapa saat lagi.';
}
