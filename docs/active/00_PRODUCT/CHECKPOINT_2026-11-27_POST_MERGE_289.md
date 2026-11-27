# Checkpoint ERP4 — pasca-merge PR #289 (27 November 2026)

## Sumber kode dan CI

- Sumber resmi adalah `main` pada commit `2da76d81f18ead87bba779ef3eb42fd60f6634e8`; PR #289 telah ditutup setelah squash-merge.
- Pemeriksaan GitHub Actions pasca-merge run [#45958810262](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45958810262) selesai sukses. Tiga pekerjaan lulus: build frontend dan penjagaan bundle Firebase, uji migrasi/API Auth/pgTAP, serta instalasi paket untuk lingkungan pelanggan. Pemeriksaan Supabase Preview juga sukses.
- Uji database berjalan pada Supabase lokal terisolasi. Replay migrasi, isolasi tenant, reservasi bersamaan, alur Storage, dan backup/restore lokal lulus. Ini bukan bukti backup/restore Production.
- Pemeriksaan daftar pull request GitHub setelah merge tidak menemukan PR terbuka.

## Verifikasi Hostinger staging VQE

- hPanel menandai deployment Hostinger staging `lightgreen-jay-425688.hostingersite.com` sebagai **Completed / Current** pada commit `2da76d8` di branch `main`.
- Setelah preview dimuat ulang, Admin UAT dapat membuka Ringkasan dan modul Asrama. Navigasi utama dan subbagian Asrama tampil; daftar Penempatan Kamar memuat 3 santri sintetis dan 2 kamar aktif.
- Bagian Audit Kebersihan menampilkan riwayat. Satu audit sintetis baru berhasil disimpan dan muncul kembali di riwayat: tanggal 27 November 2026, skor 90, catatan `[UAT] Verifikasi pesan audit otomatis hilang; data sintetis PR 289.`
- Source PR #289 menghapus pesan sukses setelah lima detik. UAT simpan-baca untuk audit berhasil; waktu tampil tepat 5 detik belum diukur secara terkontrol, sehingga klaim yang tepat adalah deployment dan alur simpan-baca terverifikasi, bukan pengukuran durasi visual.
- Fixture baru hanya berada di VQE staging untuk UAT. PTSAS Production tidak disentuh.

## Status dan batas kesiapan

- Estimasi keseluruhan terakhir sekitar **85%** adalah perkiraan kasar kemajuan rekayasa, bukan pengukuran cakupan fitur berbobot. Perubahan kecil PR #289 tidak cukup untuk mengubah angka itu secara material.
- Pemeriksaan ledger sebelumnya mencatat 100 entri pada PTSAS Production, 70 versi source belum tercatat di Production, dan 3 entri tanpa nama. Perbandingan ledger tidak membuktikan definisi DDL Production sama dengan source.
- DDL/ledger Production masih perlu direkonsiliasi per migrasi, urutan promosi perlu ditinjau, dan pemilik database perlu membuktikan backup serta restore Production. Jangan menutup selisih dengan `db push` massal.
- UAT lintas modul, peran, tenant, alur simpan-baca, dan skenario gagal belum lengkap. Build/CI hijau dan satu sesi staging tidak sama dengan verifikasi semua fitur atau kesiapan komersial.

## Tindak lanjut lokal

- Clone lokal `erp4-post-merge-handoff-20261127` belum tersinkron: HEAD masih `9e1b688` dan menyimpan perubahan lokal yang sama dengan patch PR #289 serta dokumen checkpoint yang belum ada di clone. `git fetch origin main` gagal dengan `getaddrinfo() thread failed to start`.
- Jangan membuat commit baru dari clone tersebut sebelum mengatasi fetch dan menyamakan basisnya ke `2da76d81f18ead87bba779ef3eb42fd60f6634e8`; pertahankan perubahan lokal sampai dibandingkan dengan `main`, jangan membuangnya secara otomatis.
- Setelah clone tersinkron, lanjutkan audit/UAT modul dan dokumentasikan tiap bukti staging secara terpisah dari gerbang Production.
