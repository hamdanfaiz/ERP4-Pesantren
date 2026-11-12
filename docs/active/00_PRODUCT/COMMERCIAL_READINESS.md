# Kesiapan Komersial dan Handoff Backend — ERP4 Pesantren

**Diperbarui:** 12 November 2026  
**Tujuan:** status kerja untuk tim backend; bukan persetujuan deploy atau pernyataan bahwa produk siap dijual.

## Status otoritatif — 12 November 2026

- PR [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91) berstatus **Open, Ready for review**, belum merged dan belum dideploy. Head saat pembaruan: `a799fb1fef6a2795bc7b84bc5fa0e69bb861a5a6`.
- Source aplikasi pada PR diuji di [Actions #1481](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42939819678), **3/3 job lulus**. Head dokumentasi terbaru diuji di [Actions #1484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43211275536), **3/3 job lulus**. Run dokumentasi tidak menggantikan bukti bahwa source kode aplikasi telah lulus.
- UAT API Tahfidz di VQE staging lulus untuk katalog Al-Qur’an, halaqah/anggota, simpan dan retry setoran, leaderboard, validasi, penolakan akses, dan isolasi tenant. UAT API terbatas untuk Dokumen Digital, PPDB/Keuangan, dan Storage Perpustakaan juga memiliki hasil lulus yang terdokumentasi. Fixture sintetis dinonaktifkan atau dibersihkan sesuai laporan.
- Bukti tersebut belum menunjukkan UAT lengkap semua menu, tombol, peran, relasi, unggahan dari browser, dan skenario ponsel. Instalasi/upgrade/restore di VPS dan on-premise pelanggan belum dibuktikan.
- **PTSAS Production tidak diubah.** Semua temuan database di dokumen ini berasal dari pemeriksaan baca-saja. Jangan menjalankan `db push`, memperbaiki ledger, atau menerapkan migrasi Production hanya untuk menyamakan angka.

### Estimasi progres

- **Sekitar 73% pekerjaan implementasi dan handoff kode** telah tercakup di source/PR dan bukti CI.
- **Sekitar 55% kesiapan operasional yang sudah dibuktikan**: UAT, rekonsiliasi Production, backup/restore, dan simulasi environment pelanggan masih menjadi pekerjaan besar.
- Persentase ini estimasi berbobot untuk pelaporan, bukan hasil metrik otomatis. Angka tidak termasuk deployment dan UAT hosting yang akan dikerjakan tim lain; perubahan persentase hanya dilakukan jika ada bukti baru yang menutup gerbang.

## Batas produk rilis awal

ERP4 Pesantren ditujukan sebagai instalasi mandiri yang dikelola untuk satu pesantren. Backend, Supabase, domain, secret, Storage, dan backup berada pada lingkungan yang dipilih pelanggan atau tim operasional. `tenant_id` tetap dipakai untuk membatasi akses data dalam instalasi.

PPOB, layanan ekosistem, dan integrasi payment gateway dikecualikan dari rilis awal. Finance tetap mendukung pencatatan dan verifikasi pembayaran manual. Peer Review Tahfidz dibatasi pada teks dan moderasi Ustadz. Paket Docker aplikasi menggunakan layanan Supabase yang dikonfigurasi operator; paket tersebut tidak membundel seluruh layanan Supabase.

## Bukti dan pekerjaan tersisa

| Area | Bukti saat ini | Status |
|---|---|---|
| Source, build, dan paket | CI PR #91 lulus 3/3; ada replay migrasi dan pemeriksaan aplikasi di CI terisolasi | Tersedia untuk review backend |
| Tahfidz API | UAT VQE: setoran, katalog, leaderboard, retry, role/tenant | Lulus untuk cakupan yang dilaporkan |
| Modul API lain | UAT terbatas Dokumen Digital, PPDB/Keuangan, dan Storage Perpustakaan | Bukan UAT seluruh modul |
| Tampilan dan seluruh alur UI | Belum ada bukti menyeluruh semua tab, form, tombol, peran, ponsel, dan unggah Storage | Terbuka |
| DDL dan ledger Production | 144 file migrasi pada source; ledger PTSAS 48 entri; ada versi/nama yang bertabrakan | Penghambat migrasi Production |
| Backup/restore Production | Belum ada bukti restore nyata yang diverifikasi tim backend | Terbuka |
| VPS/on-premise | CI paket bukan simulasi clean install, upgrade, pindah host, dan restore pelanggan | Terbuka |
| Persiapan komersial | Harga, lisensi, dukungan, SLA, tanggung jawab operasi, dan pilot belum diputuskan | Keputusan bisnis/operasi |

### Rekonsiliasi migrasi

Lihat [rekonsiliasi ledger PTSAS dan VQE](../06_DATABASE/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-11.md) untuk detail dan daftar versi.

- PTSAS Production mencatat 48 versi; 96 dari 144 versi source tidak ada pada ledger. Dua baris ledger tidak memiliki nama.
- Versi `20270309000000` bernama `academic_report_card` pada ledger Production, tetapi source memakainya untuk `tahfidz_quran_surah_catalog`. Ini konflik nyata; jangan menjalankan migrasi itu melalui `db push` sebelum tim backend membandingkan DDL aktual dan menetapkan prosedur pemulihan yang benar.
- VQE staging mencatat 143 versi. Tiga migrasi Tahfidz memakai timestamp alias dan `20270312000000_tahfidz_target_decimal_precision` belum tercatat dengan versi source. Audit DDL staging sebelum rekonsiliasi ledger.
- Perbedaan hitungan tidak membuktikan objek database hilang atau boleh dibuat ulang. Cocokkan function, table, constraint, index, trigger, policy, grant, dan Storage policy dengan source, lalu lakukan rehearsal pada salinan yang dapat dipulihkan.

### Snapshot keamanan Production — baca-saja

Pada snapshot 12 November, 124 tabel schema `public` memiliki RLS dan FORCE RLS. Sebanyak 119 belum memiliki policy sehingga akses langsung lewat RLS tertutup; lima tabel memiliki policy SELECT terbatas. `anon` tidak memiliki grant SELECT/INSERT dan `authenticated` tidak memiliki grant tulis langsung pada tabel yang diperiksa. Ini bukan bukti keamanan seluruh API server, RPC, atau Storage.

Supabase Advisors mencatat helper `SECURITY DEFINER` di schema `public`, satu fungsi trigger dengan search path yang belum dipatok, perlindungan kata sandi bocor nonaktif, serta saran performa untuk indeks FK dan policy RLS. Source mempunyai migrasi untuk beberapa temuan, tetapi migrasi tersebut belum seluruhnya tercatat di ledger Production. Pastikan schema `private` tidak diekspos oleh Data API sebelum memindahkan helper. Jangan menambah atau menghapus indeks secara massal tanpa memeriksa pola beban.

### Batas paket Supabase saat ini

Pemeriksaan organisasi menunjukkan PTSAS dan VQE masih memakai paket Free. Menurut [dokumentasi Supabase, perlindungan kata sandi bocor tersedia pada Pro atau lebih tinggi](https://supabase.com/docs/guides/auth/password-security), sementara [backup otomatis dan retensinya bergantung pada paket](https://supabase.com/docs/guides/platform/backups). Jangan mengasumsikan fitur tersebut tersedia di proyek Free; tim operasional perlu memutuskan upgrade yang disetujui atau prosedur dump/backup off-site dan restore drill. Tidak ada perubahan billing yang dilakukan.

## Urutan kerja yang disarankan untuk handoff

1. **Review source PR #91.** Verifikasi kode, migrasi dan laporan CI; catat komentar atau perubahan yang diminta sebelum merge.
2. **Pulihkan bukti Production.** Tim backend membandingkan 144 file migrasi dengan DDL aktual dan 48 versi ledger, menyelesaikan konflik `20270309000000`, dua nama kosong, serta seluruh perbedaan tanpa menjalankan perubahan.
3. **Buktikan pemulihan.** Buat backup sesuai kebijakan yang disetujui; pulihkan ke lingkungan terisolasi dan dokumentasikan hasil, durasi, konfigurasi, serta validasi file Storage.
4. **Rehearsal staging.** Perbaiki urutan source secara versioned, terapkan hanya ke VQE setelah dry-run dan backup staging, lalu jalankan ulang pemeriksaan role/tenant dan alur kritis.
5. **UAT produk.** Lengkapi modul yang belum memiliki layanan, relasi lintas modul, UAT Wali, transaksi Finance, browser Storage, matriks peran/tenant, dan perangkat mobile. Jangan menandai modul lulus hanya karena menu tampil.
6. **Portabilitas pelanggan.** Tim menjalankan clean install, upgrade, pemindahan host, backup dan restore pada VPS Linux dan VM on-premise representatif memakai konfigurasi sintetis.
7. **Keputusan rilis.** Tetapkan lisensi, harga, update, support, SLA, kepemilikan data, dan tanggung jawab operasi. Tim deployment menjalankan penerapan Production dan UAT hosting setelah semua gerbang yang menjadi tanggung jawab mereka disetujui.

## Keputusan saat ini

PR #91 dapat ditinjau oleh tim backend sekarang. Belum tepat menyebut sistem siap deploy/komersial penuh karena rekonsiliasi Production, backup/restore, UAT lintas modul, dan simulasi lingkungan pelanggan belum dibuktikan. **Tidak ada perubahan skema atau data Production dalam checkpoint ini.**

## Riwayat

Snapshot lama sebelum 12 November tersimpan pada riwayat Git dokumen ini. Gunakan bagian otoritatif di atas untuk status terbaru; laporan UAT dan rekonsiliasi tertaut tetap menjadi bukti rinci.
