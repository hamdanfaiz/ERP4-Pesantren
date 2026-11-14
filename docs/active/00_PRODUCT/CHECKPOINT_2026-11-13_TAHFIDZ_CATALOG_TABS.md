
# Checkpoint Tahfidz: Katalog Surah dan Tab Responsif — 13 November 2026

## Perubahan source

PR [#114](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/114), branch `codex/tahfidz-catalog-quality-20261113`, memuat:

- Pemilih Surah dan ayat hanya aktif setelah katalog lengkap berhasil dimuat; kegagalan menyediakan pesan dan aksi coba ulang.
- Ayat akhir dibersihkan ketika ayat awal dikosongkan. Perubahan ayat awal mempertahankan urutan yang benar dan membatasi pilihan pada rentang Juz yang terpilih.
- Placeholder Juz tidak menghasilkan nilai `NaN`.
- Tab Tahfidz dapat digulir horizontal pada layar sempit.
- Riwayat setoran tetap ditampilkan dari API/backend Supabase; nama Surah disimpan sebagai nilai kanonis yang divalidasi terhadap katalog database.

Tidak ada migration, perubahan feature flag, operasi Supabase, atau perubahan Production dalam batch ini.

## Bukti verifikasi source

- `npm run test:supabase-quran-catalog` — lulus.
- `npm run test:api-route-auth-policy` — lulus; 212 route privat mewajibkan autentikasi.
- `npm run test:migration-preflight` — lulus.
- `npm run test:supabase-runtime-no-firebase` — lulus.
- `npm run lint` — lulus.
- `npm run build` — lulus. Peringatan anotasi komentar Zod dan ukuran bundle PDF sekitar 1,46 MB masih tercatat.
- GitHub Actions run [#1626](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43446223192), `Supabase database tests` — lulus.

## Yang masih harus dibuktikan di browser

UAT visual/interaksi belum dilakukan. Setelah operator aktif, jalankan preview dari source branch PR #114 dan periksa:

1. Lebar viewport desktop, tablet, dan ponsel: semua tab dapat dicapai dengan scroll/geser dan tidak memotong frame.
2. Form setoran: daftar 114 Surah tampil dari endpoint katalog; pilihan ayat awal/akhir mengikuti jumlah ayat dan Juz.
3. Kondisi katalog gagal dan pemulihan melalui tombol coba ulang; simpan harus tetap tertutup ketika referensi tidak siap.
4. Simpan satu record sintetis lewat API tenant dan pastikan riwayat membaca ulang nama Surah/ayat dari backend.

Jangan memakai data operasional nyata sebagai fixture. Gunakan lingkungan dan akun uji yang telah disetujui. Jangan mengubah Production untuk UAT.

## Urutan berikutnya

- Selesaikan pemeriksaan browser staging dan catat hasilnya pada PR #114.
- Jika UAT lulus, minta review tim dan gabungkan source sesuai kebijakan repo.
- Deployment database, rekonsiliasi DDL/ledger Production, serta backup/restore tetap menjadi gerbang tim backend sebelum go-live.

