# Runbook Email Auth dan Pemulihan Akun Supabase

Tanggal bukti: 31 Oktober 2026. Target runbook ini adalah **VQE staging** (`vqemuyzveuirlkvdggjd`). Jangan menerapkan pengaturan ini ke PTSAS Production tanpa change window dan persetujuan deployment.

## Temuan yang sudah diverifikasi

- Auth VQE menolak permintaan pemulihan pada 31 Oktober 2026 pukul 08:10:58 UTC dengan HTTP `429` dan `over_email_send_rate_limit`.
- Tidak ada permintaan pemulihan berikutnya pada log VQE sampai pukul 09:07 UTC. Email sebelumnya dicatat Auth sebagai terkirim pukul 07:46 UTC, tetapi tautan yang dibuka pukul 08:00 UTC sudah tidak berlaku.
- Dokumentasi Supabase menyebut email bawaan saat ini dibatasi **2 email per jam per proyek**, ditujukan untuk pengujian, dan tidak memiliki jaminan SLA.
- Preview lokal dibuka di `http://localhost:4179/`; callback tersebut tercantum pada allowlist Auth VQE. File `.env` lokal diabaikan Git, menunjuk ke VQE, dan memakai `APP_URL`/`PUBLIC_APP_URL` port 4179.
- PR #38 memetakan error 429 ke pesan yang dapat ditindaklanjuti. Regression test pemetaan 429, `npm run lint`, dan `npm run build` lulus di worktree lokal. Build tetap memberi peringatan ukuran chunk dan anotasi Zod.

## Konfigurasi SMTP staging

1. Pilih penyedia email transaksi yang dikelola tim dan tentukan domain serta alamat pengirim yang akan dipakai.
2. Di dashboard **VQE**, buka **Authentication → Emails → SMTP Settings**, aktifkan SMTP kustom, lalu masukkan host, port/TLS sesuai provider, username, password SMTP, alamat pengirim, dan nama pengirim.
3. Simpan kredensial hanya di dashboard atau secret manager. Jangan masukkan password SMTP, token, atau API key ke repo, tiket, log, atau chat.
4. Verifikasi domain pengirim sesuai panduan provider, termasuk SPF dan DKIM; siapkan DMARC sesuai kebijakan domain. Pisahkan email Auth transaksional dari email pemasaran.
5. Pertahankan **Confirm email** tetap aktif. Jangan mengatasi limit dengan mematikan verifikasi email.
6. Pertahankan URL callback staging `http://localhost:4179/**` selama UAT lokal. Sebelum rilis, ganti ke domain aplikasi yang benar dan hapus URL localhost dari konfigurasi Production.
7. Setelah SMTP diuji, atur batas email Auth sesuai kapasitas provider dan kebutuhan UAT. Jangan menaikkan limit email bawaan tanpa SMTP kustom.

## UAT pemulihan

1. Periksa log Auth VQE untuk memastikan tidak ada penolakan 429 yang lebih baru dan batas kirim telah pulih.
2. Pemilik akun mengisi emailnya sendiri di preview dan mengirim **satu** permintaan pemulihan. Jangan kirim ulang jika email belum tiba.
3. Pastikan log Auth tidak menunjukkan 429, lalu periksa kotak masuk dan folder spam untuk email terbaru.
4. Pemilik membuka tautan terbaru, memastikan kembali ke `localhost:4179`, lalu menetapkan kata sandi sendiri. Pengembang tidak memasukkan atau melihat kata sandi.
5. Verifikasi login serta profil tenant di VQE. Catat hasil dan waktu; jangan menyalin akun/data uji ke Production.

Jika masih muncul `over_email_send_rate_limit` setelah SMTP diatur, hentikan permintaan berikutnya dan periksa dashboard Rate Limits serta log provider.

Sumber resmi: [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), dan [Test Auth Flows](https://supabase.com/docs/guides/auth/testing-auth-flows).
