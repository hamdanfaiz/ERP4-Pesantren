# Kesiapan Komersial dan Handoff Backend — ERP4 Pesantren

**Diperbarui:** 12 November 2026  
**Tujuan:** status kerja untuk tim backend; bukan persetujuan deploy atau pernyataan bahwa produk siap dijual.

## Status otoritatif — 12 November 2026

- PR [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91) adalah basis source utama dan masih **Open, Ready for review**. PR [#92](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/92) menambahkan indeks FK; PR [#93](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/93) kalender CBT, [#94](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/94) ringkasan CBT/paket soal, [#95](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/95) pemantauan sesi, dan [#96](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/96) pengaturan CBT tenant. Semua masih **Open, belum merged dan belum dideploy**.
- CI terkini lulus 3/3 job pada PR #92 (Actions #1497), #93 (#1500), #94 (#1502), #95 (#1504), dan #96 (#1511). PR #91 juga lulus 3/3 pada run #1493. Run #1511 pada head #96 `1fab3914659d18a1033b032624a5899e5ee1c834` mencakup build/paket, migrasi replay lokal, API auth, dan pgTAP. Supabase Preview dilewati karena branch preview tidak diaktifkan.
- **Tumpang tindih merge yang harus diselesaikan:** PR #92 dan #96 memuat migration path `20270313000000_add_core_composite_fk_indexes.sql` dan test indeks yang sama. Isi SQL/test sama kecuali baris kosong akhir. PR #92/#96 dan dokumen handoff telah diberi catatan; tim backend perlu mengunci satu salinan kanonis serta menyelaraskan preflight/urutan branch sebelum merge.
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
| Source, build, dan paket | PR #91/#92/#93/#94/#95/#96 memiliki bukti CI 3/3; run #1511 adalah head terbaru #96 | Tersedia untuk review backend; PR belum merged |
| Tahfidz API | UAT VQE: setoran, katalog, leaderboard, retry, role/tenant | Lulus untuk cakupan yang dilaporkan |
| Modul API lain | UAT terbatas Dokumen Digital, PPDB/Keuangan, dan Storage Perpustakaan | Bukan UAT seluruh modul |
| Tampilan dan seluruh alur UI | Belum ada bukti menyeluruh semua tab, form, tombol, peran, ponsel, dan unggah Storage | Terbuka |
| DDL dan ledger Production | Snapshot source 146 file pada branch #96; ledger PTSAS 48 entri, konflik nama/versi, dan tumpang tindih migration #13 pada PR #92/#96 | Penghambat migrasi Production |
| Backup/restore Production | Belum ada bukti restore nyata yang diverifikasi tim backend | Terbuka |
| VPS/on-premise | CI paket bukan simulasi clean install, upgrade, pindah host, dan restore pelanggan | Terbuka |
| Persiapan komersial | Harga, lisensi, dukungan, SLA, tanggung jawab operasi, dan pilot belum diputuskan | Keputusan bisnis/operasi |

### Rekonsiliasi migrasi

Lihat [rekonsiliasi ledger PTSAS dan VQE](../06_DATABASE/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-11.md) untuk detail dan daftar versi.

- PTSAS Production mencatat 48 entri. Pada inventaris gabungan PR #91–#96, 98 source versions belum cocok persis pada pasangan versi/nama; dua baris ledger tidak memiliki nama. Angka ini bukan instruksi untuk menjalankan seluruh migrasi.
- Versi `20270309000000` bernama `academic_report_card` pada ledger Production, tetapi source memakainya untuk `tahfidz_quran_surah_catalog`. Ini konflik nyata; jangan menjalankan migrasi itu melalui `db push` sebelum tim backend membandingkan DDL aktual dan menetapkan prosedur pemulihan yang benar.
- VQE staging mencatat 143 entri. Tiga migrasi Tahfidz memakai timestamp alias; source `20270312000000` sampai `20270314000000` belum tercatat persis. PR #92 dan #96 berbagi migration #13; rekonsiliasi file dan preflight harus mendahului merge. Audit DDL staging sebelum rekonsiliasi ledger.
- Perbedaan hitungan tidak membuktikan objek database hilang atau boleh dibuat ulang. Cocokkan function, table, constraint, index, trigger, policy, grant, dan Storage policy dengan source, lalu lakukan rehearsal pada salinan yang dapat dipulihkan.

### Snapshot keamanan Production — baca-saja

Pada snapshot 12 November, 124 tabel schema `public` memiliki RLS dan FORCE RLS. Sebanyak 119 belum memiliki policy sehingga akses langsung lewat RLS tertutup; lima tabel memiliki policy SELECT terbatas. `anon` tidak memiliki grant SELECT/INSERT dan `authenticated` tidak memiliki grant tulis langsung pada tabel yang diperiksa. Ini bukan bukti keamanan seluruh API server, RPC, atau Storage.

Supabase Advisors mencatat helper `SECURITY DEFINER` di schema `public`, satu fungsi trigger dengan search path yang belum dipatok, perlindungan kata sandi bocor nonaktif, serta saran performa untuk indeks FK dan policy RLS. Source mempunyai migrasi untuk beberapa temuan, tetapi migrasi tersebut belum seluruhnya tercatat di ledger Production. Pastikan schema `private` tidak diekspos oleh Data API sebelum memindahkan helper. Jangan menambah atau menghapus indeks secara massal tanpa memeriksa pola beban.

### Batas paket Supabase saat ini

Pemeriksaan organisasi menunjukkan PTSAS dan VQE masih memakai paket Free. Menurut [dokumentasi Supabase, perlindungan kata sandi bocor tersedia pada Pro atau lebih tinggi](https://supabase.com/docs/guides/auth/password-security), sementara [backup otomatis dan retensinya bergantung pada paket](https://supabase.com/docs/guides/platform/backups). Jangan mengasumsikan fitur tersebut tersedia di proyek Free; tim operasional perlu memutuskan upgrade yang disetujui atau prosedur dump/backup off-site dan restore drill. Tidak ada perubahan billing yang dilakukan.

## Urutan kerja yang disarankan untuk handoff

1. **Review PR #91–#96.** Pertahankan dependensi #91 → #93 → #94 → #95 → #96; PR #92 adalah cabang paralel. Selesaikan overlap migration #13 antara #92/#96 dan cek preflight akhir sebelum merge.
2. **Pulihkan bukti Production.** Tim backend membandingkan inventaris 146 migrasi dengan DDL aktual dan 48 entri ledger, menyelesaikan konflik `20270309000000`, dua nama kosong, serta seluruh perbedaan tanpa menjalankan perubahan.
3. **Buktikan pemulihan.** Buat backup sesuai kebijakan yang disetujui; pulihkan ke lingkungan terisolasi dan dokumentasikan hasil, durasi, konfigurasi, serta validasi file Storage.
4. **Rehearsal staging.** Perbaiki urutan source secara versioned, terapkan hanya ke VQE setelah dry-run dan backup staging, lalu jalankan ulang pemeriksaan role/tenant dan alur kritis.
5. **UAT produk.** Lengkapi modul yang belum memiliki layanan, relasi lintas modul, UAT Wali, transaksi Finance, browser Storage, matriks peran/tenant, dan perangkat mobile. Jangan menandai modul lulus hanya karena menu tampil.
6. **Portabilitas pelanggan.** Tim menjalankan clean install, upgrade, pemindahan host, backup dan restore pada VPS Linux dan VM on-premise representatif memakai konfigurasi sintetis.
7. **Keputusan rilis.** Tetapkan lisensi, harga, update, support, SLA, kepemilikan data, dan tanggung jawab operasi. Tim deployment menjalankan penerapan Production dan UAT hosting setelah semua gerbang yang menjadi tanggung jawab mereka disetujui.

## Keputusan saat ini

PR #91–#96 tersedia untuk review backend; semua CI yang disebutkan lulus, tetapi belum ada PR yang merged. Sebelum merge, koordinasikan duplicate migration #13 antara #92/#96. Belum tepat menyebut sistem siap deploy/komersial penuh karena rekonsiliasi Production, backup/restore, UAT lintas modul, dan simulasi lingkungan pelanggan belum dibuktikan. **Tidak ada perubahan skema atau data Production.**

## Riwayat

Snapshot lama sebelum 12 November tersimpan pada riwayat Git dokumen ini. Gunakan bagian otoritatif di atas untuk status terbaru; laporan UAT dan rekonsiliasi tertaut tetap menjadi bukti rinci.
