# Checkpoint Konfigurasi Redirect Auth Production — 31 Oktober 2026

## Temuan

Pada dashboard Supabase project `ptsasgdvgrbdtgyqieie` (berlabel `main / PRODUCTION`), halaman **Authentication → URL Configuration** menunjukkan:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** belum ada URL yang diizinkan

Pada halaman Auth Users, akun Admin Production menunjukkan status **Confirmed** dan **Last signed in** pada 31 Oktober 2026 pukul 12.19. Karena itu, kegagalan membuka localhost adalah kegagalan halaman tujuan setelah verifikasi, bukan bukti bahwa konfirmasi email gagal.

Browser yang mencoba membuka `http://localhost:3000` melaporkan `ERR_CONNECTION_REFUSED`. Site URL itu hanya berfungsi bila aplikasi berjalan di port 3000 pada komputer yang membuka tautan. Preview yang sebelumnya digunakan berada di port 4179, sehingga alamatnya tidak cocok.

## Dampak

- Konfirmasi Admin yang dikirim pada checkpoint ini berhasil; tidak perlu mengirim ulang konfirmasi.
- Email Auth berikutnya dapat mengarahkan pengguna ke localhost dan gagal dibuka jika server lokal tidak berjalan.
- Ini adalah blocker konfigurasi untuk UAT login dan go-live. Keadaan ini tidak mengubah schema atau data operasional Supabase.

## Tindakan untuk tim backend/operator

1. Sebelum membuka pendaftaran atau mengirim email Auth kepada pengguna produksi, ubah **Site URL** menjadi origin HTTPS aplikasi yang benar setelah domain hosting tersedia.
2. Tambahkan hanya URL redirect aplikasi yang memang dipakai ke **Redirect URLs**. Cocokkan origin, port, dan callback path dengan konfigurasi aplikasi; hindari wildcard luas.
3. Untuk pengembangan lokal, gunakan URL localhost yang port-nya sama dengan server dev yang benar-benar sedang berjalan. Lakukan UAT Auth pada project staging VQE, bukan akun atau data pengguna Production.
4. Uji undangan/konfirmasi, login, recovery/reset kata sandi, dan logout dari browser nyata setelah konfigurasi disimpan. Pastikan tiap alur kembali ke halaman aplikasi yang benar.
5. Catat URL final yang disetujui, project ref, tanggal perubahan, dan hasil uji di runbook deployment. Jangan menyimpan token email atau secret dalam dokumen, log, bundle klien, atau repository.

Perubahan URL Auth Production **belum dilakukan** dalam checkpoint ini. Perlu domain hosting final dan persetujuan change window dari operator sebelum konfigurasi Production diubah.

## Batas verifikasi lokal

Server aplikasi sempat dijalankan dari worktree PR #38 dengan URL dan publishable key Supabase saja; secret server tidak dimuat. Namun browser Codex tetap gagal menjangkau listener localhost, sehingga pemulihan callback end-to-end belum terverifikasi. UAT UI PR #38 tetap tertunda.

## Koreksi alur reset kata sandi

- Source ERP kini mengirimkan `PUBLIC_APP_URL` sebagai redirect eksplisit saat server membuat tautan recovery Admin melalui Supabase Auth. Ini menghindari fallback diam-diam ke Site URL proyek untuk alur recovery yang dibuat ERP.
- Uji regresi sintetis `npm run test:auth-recovery-redirect` lulus: request recovery memakai nilai `redirect_to` dari `PUBLIC_APP_URL`, tanpa koneksi eksternal. `npm run lint` juga lulus pada worktree lokal.
- CI terbaru [run 41175059930](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41175059930) lulus 2/2 job pada source head `ed8d536ba3c7f638be357db9c2f7164435af88c3`, termasuk uji regression redirect recovery.
- Perubahan ini hanya memengaruhi tautan reset yang dibuat ERP. Email konfirmasi yang dikirim langsung dari Dashboard Supabase tetap bergantung pada Site URL dan Redirect URLs proyek. Site URL Production masih `http://localhost:3000`; domain hosting final dan allowlist yang tepat tetap harus disetel operator. Perubahan dashboard Production belum dilakukan.

## Hubungan dengan rilis

Temuan ini melengkapi [kesiapan komersial](../00_PRODUCT/COMMERCIAL_READINESS.md) dan [titik mulai tim backend](../00_PRODUCT/BACKEND_TEAM_START_HERE.md). PR #38 tetap Draft/Open pada 75% untuk cakupan PR tersebut; catatan ini tidak mengubah status UAT, persentase keseluruhan ERP, atau kesiapan deploy.
