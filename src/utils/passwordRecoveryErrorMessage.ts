type PasswordRecoveryErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
} | null | undefined;

export function passwordRecoveryErrorMessage(error: PasswordRecoveryErrorLike): string {
  const message = error?.message || '';

  if (/redirect|url/i.test(message)) {
    return 'Alamat aplikasi belum diizinkan untuk pemulihan akun. Hubungi administrator pesantren.';
  }

  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
    return 'Batas email pemulihan proyek sedang tercapai. Periksa kotak masuk dan folder spam untuk tautan terbaru, lalu coba lagi setelah batas kirim pulih. Jangan kirim permintaan berulang.';
  }

  return 'Permintaan pemulihan belum dapat diproses. Coba kembali beberapa saat lagi.';
}
