# Data Fixture UAT Staging VQE — 20 November 2026

## Lingkungan

- Project staging: `vqemuyzveuirlkvdggjd`
- Tenant sintetis: `uat-wali-erp4-20261031`
- Penanda record: `UAT ERP4 2026-11-20`
- Preview staging: <https://lightgreen-jay-425688.hostingersite.com/>
- Tidak ada perubahan, migrasi, atau data uji yang ditulis ke PTSAS Production.

## Data yang sudah dibuat dan diverifikasi

Semua record dibuat melalui fungsi server/RPC tenant dengan profil Admin staging. Pemeriksaan baca-ulang dilakukan melalui fungsi daftar/detail aplikasi dan mengembalikan record yang sama.

| Area | Fixture | Status UAT |
|---|---|---|
| Data Induk | Gedung, kamar, kelas dengan jenjang tenant `Jenjang UAT` | 3 record terbaca kembali; relasi kamar → gedung dan kelas → jenjang tersedia |
| Santri | `UAT ERP4 2026-11-20 Santri 01`, NIS `2026910001` | 1 record terbaca kembali; NIS dibuat oleh Naming Series; relasi kelas, kamar, gedung terpasang |
| Izin Asrama | Izin Pulang, 20–21 November 2026 | 1 permintaan terbaca; status menunggu keputusan Admin |
| Kedisiplinan | Catatan simulasi kategori Ringan, 1 poin | 1 catatan terbaca; belum diselesaikan |
| Kehadiran | Status Hadir pada 20 November 2026 | 1 record terbaca kembali |
| Operasional Asrama | Audit kebersihan skor 88 dan tiket fasilitas prioritas rendah | Masing-masing 1 record terbaca kembali |
| Tahfidz | Halaqah berlabel UAT berstatus nonaktif dan satu target harian | Keduanya terbaca kembali; belum ada setoran |
| Dokumen Digital | Satu dokumen internal bertanda UAT tanpa lampiran | 1 dokumen terbaca kembali melalui daftar dokumen |

Tidak ada NIK/NISN, kontak pribadi, akun Auth tambahan, pembayaran, tagihan, transaksi PPDB, kiriman pesan, atau berkas nyata yang dibuat. Tidak ada lampiran Storage yang diunggah.

## Modul dan role yang belum tercakup

Pembacaan publik `/runtime-config.json` pada preview staging menunjukkan Data Induk, Asrama beserta submodul izin/kedisiplinan/kehadiran/penugasan/operasional fasilitas, dan Tahfidz terbuka. Flag frontend untuk PPDB, impor, dan beberapa fitur lain belum aktif/tersedia pada preview ini. Konfigurasi server lokal juga menutup banyak runtime lain, termasuk Akademik, Keuangan, CBT, LMS, HRIS, Kesehatan, Perpustakaan, Koperasi, Laundry, Donasi, Marketplace, dan lainnya. Fixture tidak dibuat pada modul tertutup agar data tidak tersimpan tanpa jalur UI yang bisa diuji.

Tenant hanya memiliki satu profil Admin aktif. Karena belum ada profil Ustadz, halaqah UAT dibuat nonaktif dan tidak dapat dipakai untuk mencatat setoran. Alur UAT role Ustadz, Santri, dan Wali belum terbukti. Target Tahfidz hanya menguji pengaturan target oleh Admin; leaderboard dan alur setoran belum diuji. Dokumen Digital memiliki fixture yang terbaca melalui backend, tetapi flag server pada hosting tidak dapat dipastikan dari konfigurasi publik; alur UI dokumen belum dianggap lulus UAT.

## Cara menjalankan UAT

1. Masuk sendiri ke preview staging dengan akun Admin VQE yang sudah ada; jangan gunakan akun atau URL PTSAS Production.
2. Di **Data Induk**, cari NIS `2026910001`, lalu periksa tab kelas/jenjang serta relasi kamar dan gedung.
3. Di **Asrama**, periksa permohonan izin, catatan kedisiplinan, kehadiran bertanggal 20 November 2026, audit kebersihan, dan tiket fasilitas bertanda UAT.
4. Di **Tahfidz**, periksa target santri. Halaqah UAT berstatus nonaktif; jangan mengubahnya menjadi aktif tanpa profil Ustadz yang sah.
5. Di **Dokumen Digital**, hanya lanjut jika halaman berhasil memuat data pada preview VQE. Cari perihal `UAT ERP4 — dokumen internal simulasi`; dokumen ini tanpa lampiran. Jika halaman menunjukkan layanan belum tersedia atau error, catat UI sebagai belum teruji. Jangan menganggap nilai `.env` lokal sebagai konfigurasi Hostinger, dan jangan mengaktifkan flag server tanpa memastikan proyeknya VQE.
6. Gunakan record UAT yang tersedia untuk menguji perubahan status yang didukung. Catat hasil dan jangan menyalin fixture ke Production.

Fixture dibiarkan di VQE agar tersedia untuk UAT mandiri. Setelah UAT selesai, hapus/arsipkan fixture melalui alur aplikasi atau cleanup terkontrol dan verifikasi setiap relasi; jangan menghapus data lain di tenant.

## Batas kesiapan Production

Pengisian fixture VQE bukan persetujuan cutover. Status rekonsiliasi Production pada dokumen kesiapan komersial masih menunjukkan 63 dari 163 migrasi source belum tercatat dan tiga entri ledger Production tanpa nama. Kesetaraan DDL Production secara menyeluruh serta bukti backup/restore Production belum tersedia. Tidak ada migrasi atau deploy Production dalam pekerjaan ini.
