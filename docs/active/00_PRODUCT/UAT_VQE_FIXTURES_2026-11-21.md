# Data UAT VQE — 21 November 2026

## Lingkungan dan batas

- Lingkungan staging: Supabase VQE `vqemuyzveuirlkvdggjd` dan preview Hostinger.
- Tenant dan seluruh record bertanda UAT adalah data sintetis.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh.
- Tidak ada kata sandi, key, token, data identitas asli, atau isi `.env` yang dicatat di dokumen ini.

## Fixture yang tersedia

| Modul | Data UAT yang tersedia | Status baca/relasi |
|---|---|---|
| Data Induk | 1 gedung, 2 kamar, 1 kelas, 2 santri | Struktur kamar → gedung, kelas → jenjang, dan relasi santri ke kelas/asrama terhubung. NIS berasal dari Naming Series. |
| Asrama | 2 penempatan; 2 permohonan izin; 2 catatan kedisiplinan; 2 catatan kehadiran; 2 tiket fasilitas; 2 audit kebersihan | Data tampil pada cakupan tenant UAT. Tiket dan audit dapat dipakai untuk membandingkan prioritas/status dan skor. |
| Tahfidz | 1 halaqah aktif, 2 santri anggota, 2 target aktif, 1 akun Ustadz sintetis berizin Tahfidz, 2 setoran Ziyadah | Setoran yang disimpan: Al-Baqarah ayat 1–10 dan Al-Kahf ayat 1–15. Pilihan surah memakai katalog 114 surah; ayat dipilih dari opsi sesuai surah, bukan teks bebas. Catatan kemajuan tersimpan sebagai 10 dan 15 ayat unik; peringkat yang diharapkan adalah Santri 02 lalu Santri 01. |
| Dokumen Digital | 3 dokumen internal bertanda UAT, tanpa lampiran | Daftar dokumen terbaca; tidak ada file Storage yang diunggah. |

Nama dan catatan record diberi penanda UAT. Tidak dibuat pembayaran, tagihan, transaksi PPDB, kiriman pesan, bukti pembayaran, atau lampiran yang menyerupai data nyata.

## Role dan pemeriksaan yang masih terbuka

- Admin staging sudah dapat membaca dua santri, halaqah, target, dua setoran, serta ringkasan Asrama.
- Baca-saja pada tabel kemajuan staging mengonfirmasi Santri 02 memiliki 15 ayat hafalan unik dan Santri 01 memiliki 10; jumlah setoran masing-masing 1. Ini membuktikan pemicu pencatatan hafalan ikut terisi, tetapi UI leaderboard masih menunggu frontend baru diterbitkan.
- Akun Ustadz sintetis telah dibuat dan dibatasi ke modul Tahfidz pada tenant UAT. Login sebagai Ustadz dan pembatasan daftar ke halaqah tugasnya masih menunggu verifikasi dari sesi pengguna; tidak ada password di repositori.
- Leaderboard pada preview sebelumnya gagal karena kontrak API UI mengharuskan payload bulanan, sementara RPC VQE mengirim `uniqueMemorizedAyahs` seumur pencatatan tanpa `periodStart`. Frontend kini menampilkan peringkat hafalan unik dan tetap dapat membaca payload bulanan lama tanpa menyebutnya sebagai total hafalan.
- Migrasi baru `20270402000000_tahfidz_lifetime_hafalan_leaderboard.sql` membawa tabel kemajuan ayat unik, backfill dari setoran lama, sinkronisasi transaksional untuk setoran baru, dan RPC berperingkat hafalan. Pemeriksaan katalog VQE menunjukkan bentuk tabel, indeks, trigger, dan payload RPC yang sudah ada sejalan dengan desain ini. Migrasi source belum diterapkan ulang ke VQE.
- Perubahan kode sudah dipindahkan ke branch lokal berbasis `main` terbaru (`0d810eb4cd1b3430210698fdd1854df3ef3d9207`), tetapi belum di-commit, dipush, atau diterbitkan ke preview.

## Modul yang tidak diisi

Data dummy hanya dibuat pada modul yang runtime-nya tersedia dan dapat diuji lewat antarmuka staging. Flag PPDB dan sejumlah runtime lain belum aktif atau belum memiliki jalur UAT terverifikasi pada preview yang digunakan. Akademik, Keuangan, CBT, LMS, HRIS, Kesehatan, Perpustakaan, Koperasi, Laundry, Donasi, Marketplace, dan modul lainnya tidak diisi di tahap ini agar tidak membuat record yang tidak dapat diperiksa melalui UI.

## Hasil verifikasi build

- `npm run test:tahfidz-leaderboard`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus; muncul peringatan dependensi tentang anotasi komentar Zod serta ukuran chunk vendor besar, bukan error build.
- `git diff --check`: lulus.
- Pengujian pgTAP lokal belum dijalankan karena Docker, Supabase CLI, dan `psql` tidak tersedia pada workspace.
- Login Ustadz sintetis serta pembatasan daftar ke halaqah tugasnya masih menunggu verifikasi pada sesi pengguna.
- Belum ada perubahan ke Supabase Production.
