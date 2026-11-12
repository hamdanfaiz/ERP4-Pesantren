# Kesiapan Komersial dan Handoff Backend — ERP4 Pesantren

**Diperbarui:** 12 November 2026  
**Tujuan:** status kerja untuk tim backend; bukan persetujuan deploy atau pernyataan bahwa produk siap dijual.

## Status otoritatif — 12 November 2026

- PR [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91) adalah basis source utama dan masih **Open, Ready for review**. PR [#92](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/92) menambahkan indeks FK; PR [#93](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/93) kalender CBT, [#94](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/94) ringkasan CBT/paket soal, [#95](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/95) pemantauan sesi, dan [#96](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/96) pengaturan CBT tenant. Semua masih **Open, belum merged dan belum dideploy**.
- CI PR #92 lulus 3/3 job pada Actions #1497; PR #93–#95 lulus 3/3 pada #1500/#1502/#1504; PR #96 lulus 3/3 pada #1516 setelah cleanup migrasi #13. PR #91 lulus 3/3 pada #1493. Supabase Preview dilewati karena branch preview tidak diaktifkan.
- Migration `20270313000000_add_core_composite_fk_indexes.sql` dan test indeks ditetapkan menjadi milik PR #92 saja. Cleanup branch PR #96 menghapus duplikat dan menjadikan PR #96 pemilik migration #14 untuk pengaturan CBT. Periksa head final PR #96 serta CI terbaru sebelum merge.
- UAT API Tahfidz VQE lulus untuk katalog Qur’an, halaqah/anggota, simpan dan retry setoran, leaderboard, validasi, penolakan akses, dan isolasi tenant. UAT API terbatas Dokumen Digital, PPDB/Keuangan, serta Storage Perpustakaan juga terdokumentasi.
- Belum terbukti UAT browser menyeluruh untuk semua menu, tombol, role, relasi, unggah, ponsel, maupun install/upgrade/restore VPS/on-premise.
- **PTSAS Production tidak diubah.** Tidak ada migrasi, perubahan data/aturan, billing, ataupun deploy yang dilakukan.

### Estimasi progres

- **Sekitar 76% implementasi dan handoff kode**: naik dari 74% setelah kalender CBT, ringkasan/paket CBT, pemantauan sesi, dan pengaturan CBT ditambahkan serta CI-nya lulus. PR masih terbuka dan menunggu review/penyelesaian stack.
- **Sekitar 55% kesiapan operasional yang telah dibuktikan**: rekonsiliasi DDL/ledger Production, restore Production, UAT lintas modul, serta simulasi environment pelanggan masih terbuka.
- Ini estimasi berbobot, bukan metrik otomatis. Deployment dan UAT hosting yang dikerjakan tim backend tidak dihitung.

## Batas produk rilis awal

ERP4 Pesantren ditujukan sebagai instalasi mandiri yang dikelola untuk satu pesantren. Backend, Supabase, domain, secret, Storage, dan backup berada pada lingkungan yang dipilih pelanggan atau tim operasional. `tenant_id` tetap dipakai untuk membatasi akses data dalam instalasi.

PPOB, layanan ekosistem, dan integrasi payment gateway dikecualikan dari rilis awal. Finance tetap mendukung pencatatan dan verifikasi pembayaran manual. Peer Review Tahfidz dibatasi pada teks dan moderasi Ustadz. Paket Docker aplikasi menggunakan layanan Supabase yang dikonfigurasi operator; paket tersebut tidak membundel seluruh layanan Supabase.

## Bukti dan pekerjaan tersisa

| Area | Bukti saat ini | Status |
|---|---|---|
| Source, build, dan paket | CI #1516 lulus 3/3 pada head cleanup kode PR #96; CI #1517 lulus 3/3 pada head dokumentasi | Tersedia untuk review backend; PR belum merged |
| Tahfidz API | UAT VQE: setoran, katalog, leaderboard, retry, role/tenant | Lulus untuk cakupan yang dilaporkan |
| Modul API lain | UAT terbatas Dokumen Digital, PPDB/Keuangan, dan Storage Perpustakaan | Bukan UAT seluruh modul |
| Tampilan dan seluruh alur UI | Belum ada bukti menyeluruh semua tab, form, tombol, peran, ponsel, dan unggah Storage | Terbuka |
| DDL dan ledger Production | Branch PR #96: 145 file migrasi; PR #92 menambahkan #13 terpisah; gabungan 146. Ledger PTSAS 48 entri dan konflik nama/versi | Penghambat migrasi Production |
| Backup/restore Production | Belum ada bukti restore nyata yang diverifikasi tim backend | Terbuka |
| VPS/on-premise | CI paket bukan simulasi clean install, upgrade, pindah host, dan restore pelanggan | Terbuka |
| Persiapan komersial | Harga, lisensi, dukungan, SLA, tanggung jawab operasi, dan pilot belum diputuskan | Keputusan bisnis/operasi |

### Rekonsiliasi migrasi

Lihat [rekonsiliasi ledger PTSAS dan VQE](../06_DATABASE/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-11.md) untuk detail dan daftar versi.

- PTSAS Production mencatat 48 entri. Pada inventaris gabungan PR #91–#96, 98 source versions belum cocok persis pada pasangan versi/nama; dua baris ledger tidak memiliki nama. Angka ini bukan instruksi untuk menjalankan seluruh migrasi.
- Versi `20270309000000` bernama `academic_report_card` pada ledger Production, tetapi source memakainya untuk `tahfidz_quran_surah_catalog`. Ini konflik nyata; jangan menjalankan migrasi itu melalui `db push` sebelum tim backend membandingkan DDL aktual dan menetapkan prosedur pemulihan yang benar.
- VQE staging mencatat 143 entri. Tiga migrasi Tahfidz memakai timestamp alias; branch PR #96 belum mencatat persis #12/#14 dan PR #92 secara terpisah membawa #13. Audit DDL staging dan jalankan preflight gabungan setelah stack digabung.
- Perbedaan hitungan tidak membuktikan objek database hilang atau boleh dibuat ulang. Cocokkan function, table, constraint, index, trigger, policy, grant, dan Storage policy dengan source, lalu lakukan rehearsal pada salinan yang dapat dipulihkan.

### Snapshot keamanan Production — baca-saja

Pada snapshot 12 November, 124 tabel schema `public` memiliki RLS dan FORCE RLS. Sebanyak 119 belum memiliki policy sehingga akses langsung lewat RLS tertutup; lima tabel memiliki policy SELECT terbatas. `anon` tidak memiliki grant SELECT/INSERT dan `authenticated` tidak memiliki grant tulis langsung pada tabel yang diperiksa. Ini bukan bukti keamanan seluruh API server, RPC, atau Storage.

Supabase Advisors mencatat helper `SECURITY DEFINER` di schema `public`, satu fungsi trigger dengan search path yang belum dipatok, perlindungan kata sandi bocor nonaktif, serta saran performa untuk indeks FK dan policy RLS. Source mempunyai migrasi untuk beberapa temuan, tetapi migrasi tersebut belum seluruhnya tercatat di ledger Production. Pastikan schema `private` tidak diekspos oleh Data API sebelum memindahkan helper. Jangan menambah atau menghapus indeks secara massal tanpa memeriksa pola beban.

### Batas paket Supabase saat ini

Pemeriksaan organisasi menunjukkan PTSAS dan VQE masih memakai paket Free. Menurut [dokumentasi Supabase, perlindungan kata sandi bocor tersedia pada Pro atau lebih tinggi](https://supabase.com/docs/guides/auth/password-security), sementara [backup otomatis dan retensinya bergantung pada paket](https://supabase.com/docs/guides/platform/backups). Jangan mengasumsikan fitur tersebut tersedia di proyek Free; tim operasional perlu memutuskan upgrade yang disetujui atau prosedur dump/backup off-site dan restore drill. Tidak ada perubahan billing yang dilakukan.

## Urutan kerja yang disarankan untuk handoff

1. **Review PR #91–#96.** Pertahankan dependensi #91 → #93 → #94 → #95 → #96; PR #92 adalah cabang paralel dan satu-satunya pemilik migration #13. Verifikasi preflight gabungan sebelum merge.
2. **Pulihkan bukti Production.** Tim backend membandingkan inventaris 146 migrasi dengan DDL aktual dan 48 entri ledger, menyelesaikan konflik `20270309000000`, dua nama kosong, serta seluruh perbedaan tanpa menjalankan perubahan.
3. **Buktikan pemulihan.** Buat backup sesuai kebijakan yang disetujui; pulihkan ke lingkungan terisolasi dan dokumentasikan hasil, durasi, konfigurasi, serta validasi file Storage.
4. **Rehearsal staging.** Perbaiki urutan source secara versioned, terapkan hanya ke VQE setelah dry-run dan backup staging, lalu jalankan ulang pemeriksaan role/tenant dan alur kritis.
5. **UAT produk.** Lengkapi modul yang belum memiliki layanan, relasi lintas modul, UAT Wali, transaksi Finance, browser Storage, matriks peran/tenant, dan perangkat mobile. Jangan menandai modul lulus hanya karena menu tampil.
6. **Portabilitas pelanggan.** Tim menjalankan clean install, upgrade, pemindahan host, backup dan restore pada VPS Linux dan VM on-premise representatif memakai konfigurasi sintetis.
7. **Keputusan rilis.** Tetapkan lisensi, harga, update, support, SLA, kepemilikan data, dan tanggung jawab operasi. Tim deployment menjalankan penerapan Production dan UAT hosting setelah semua gerbang yang menjadi tanggung jawab mereka disetujui.

## Keputusan saat ini

PR #91–#96 tersedia untuk review backend; belum ada yang merged. PR #96 telah dibersihkan agar migration #13 hanya dimiliki PR #92. CI #1516 untuk head cleanup kode dan #1517 untuk pembaruan dokumentasi sama-sama lulus 3/3; PR tetap menunggu review backend. Belum tepat menyebut sistem siap deploy/komersial penuh karena rekonsiliasi Production, backup/restore, UAT lintas modul, dan simulasi lingkungan pelanggan belum dibuktikan. **Tidak ada perubahan skema atau data Production.**

## Riwayat

Snapshot lama sebelum 12 November tersimpan pada riwayat Git dokumen ini. Gunakan bagian otoritatif di atas untuk status terbaru; laporan UAT dan rekonsiliasi tertaut tetap menjadi bukti rinci.
