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

## Inventaris tenant UAT — pemeriksaan baca-saja 21 November 2026

Tenant staging `uat-wali-erp4-20261031` masih aktif di VQE. Pemeriksaan hanya menghitung record per tenant pada 177 tabel yang memiliki kolom `tenant_id`; tidak membaca isi/nilai record dan tidak menulis apa pun. Ada record pada 43 tabel, jadi cakupan UI dan fixture yang tersedia lebih luas dari ringkasan fixture awal, tetapi angka ini sendiri bukan bukti alur UAT lulus.

| Area | Record yang ada pada tenant | Belum tercatat pada tenant ini |
|---|---|---|
| Data Induk | 3 record master, 1 santri, 2 unit, 1 riwayat penempatan, 68 referensi, 15 aturan penomoran | — |
| Akademik | 1 pengaturan, 1 periode | Catatan akademik, rapor, dan penugasan wali kelas |
| Asrama | 1 izin, 1 insiden disiplin, 1 sesi/rekaman kehadiran, 1 audit kebersihan, 1 tiket fasilitas; masing-masing memiliki jejak peristiwa | Penugasan staf Asrama |
| Tahfidz | 1 halaqah, 1 target, 1 permintaan penulisan target | Keanggotaan halaqah, setoran, dan sesi |
| PPDB | — | Kandidat dan dokumen kandidat |
| Keuangan | — | Tagihan, pengeluaran, anggaran, dan buku transaksi |
| Perpustakaan | 5 buku | Peminjaman dan aset digital |
| CBT | 5 soal, 1 ujian, 3 relasi soal ujian, 1 pengaturan | Penugasan dan percobaan ujian |
| LMS | 1 kategori, 1 kursus, 1 modul, 1 materi, 1 tugas | Pendaftaran kursus, progres, pengumpulan, dan penilaian |
| Koperasi | 1 dompet | Produk, penjualan, pergerakan stok, dan entri buku transaksi |
| Dokumen Digital | 1 dokumen, 1 peristiwa alur kerja | Lampiran |
| Modul operasional lain | — | Alumni, Komunikasi, Kesehatan, Aset Umum, Laundry, Marketplace, Donasi/Wakaf, dan Pemesanan Fasilitas |

**Implikasi:** gunakan tenant dan record yang sudah ada untuk UAT. Jangan membuat salinan data untuk area yang sudah terisi. Untuk area kosong, pastikan gerbang runtime, referensi, izin, serta prasyarat relasi siap sebelum menambahkan fixture melalui alur aplikasi. PTSAS Production tidak digunakan untuk fixture.

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
