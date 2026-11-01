# Checkpoint Penomoran Otomatis dan Naming Series

Tanggal: 1 November 2026  
Branch kerja: `codex/menu-owner-placement-20261101`  
Staging: Supabase VQE `vqemuyzveuirlkvdggjd`  
Production: Supabase PTSAS `ptsasgdvgrbdtgyqieie` — tidak disentuh.

## Perilaku yang disiapkan

- UUID tetap menjadi ID teknis internal. Nomor yang terlihat pengguna unik pada jenis identitas terkait dalam tenant.
- Enam seri bawaan dibuat untuk setiap tenant aktif: NIS, nomor pendaftaran PPDB, nomor pegawai, kode gedung, kode kamar, dan kode kelas.
- NIS dialokasikan dalam transaksi onboarding santri yang diterima maupun saat santri baru dibuat dari Data Induk. Nomor dari klien diabaikan; retry onboarding mempertahankan NIS yang sudah terbit dan penyuntingan tidak mengubah NIS.
- Setiap jenjang aktif memiliki kode NIS dua digit yang dikelola Admin pada Data Induk → Kategori & Referensi. Kode per tenant harus unik dan terkunci setelah penerbitan NIS.
- Nomor PPDB dibuat oleh backend untuk pendaftaran publik dan entri Admin baru yang tidak membawa nomor historis. CSV impor tetap dapat mempertahankan nomor lama.
- Nomor pegawai dibuat backend saat pegawai baru disimpan. Nomor yang sudah ada tidak berubah saat record diperbarui atau data historis diimpor.
- Kode gedung, kamar, dan kelas dibuat otomatis per tenant saat record baru disimpan; impor struktur historis tetap mempertahankan kode sumber.
- Counter dikunci atomik per tenant, seri, periode, dan jenjang NIS; tabel alokasi mencegah nomor yang sudah pernah diterbitkan dipakai ulang. Constraint unik pada tabel operasional tetap menjadi lapisan perlindungan terakhir.
- Admin tenant dapat mengatur format, lebar urutan, nomor awal, periode reset, dan status seri di Data Induk → Naming Series. Database memvalidasi template dan otorisasi; browser tidak mendapat akses langsung ke tabel/counter.
- Seri memiliki event idempotensi untuk mencegah pengulangan permintaan konfigurasi dengan hasil yang berbeda.
- Referensi kamar/gedung pada riwayat penempatan dan hubungan reservation aset perpustakaan kini ditegakkan dengan foreign key tenant.

## Batas cakupan saat ini

UUID teknis tetap dibuat otomatis oleh database. Panel ini mengelola enam nomor bisnis inti: NIS, pendaftaran PPDB, pegawai, gedung, kamar, dan kelas. Nomor bukti transaksi keuangan/donasi, nomor dokumen, serta kode aset dan persediaan masih dibuat oleh aturan di modul masing-masing; semuanya belum dapat dikonfigurasi dari panel ini. Ekspansi ke nomor transaksi tersebut perlu menjadi tahap tersendiri setelah kontrak enam seri inti lolos staging.

## Format awal

| Seri | Template awal | Perilaku |
| --- | --- | --- |
| NIS | `{{YEAR}}{{GRADE}}{{SEQ}}` | 10 digit; tahun, kode jenjang 2 digit, urutan 4 digit; reset tahunan dan urut terpisah per kode jenjang |
| Pendaftaran PPDB | `PPDB-{{YEAR}}-{{SEQ}}` | Reset tahunan; nomor dibuat ketika pendaftaran diterima oleh sistem |
| Pegawai | `PEG-{{YEAR}}-{{SEQ}}` | Reset tahunan; nomor pegawai yang telah terbit tetap |
| Gedung | `GED-{{SEQ}}` | Tidak reset; dibuat transaksional per tenant |
| Kamar | `KMR-{{SEQ}}` | Tidak reset; dibuat transaksional per tenant |
| Kelas | `KLS-{{SEQ}}` | Tidak reset; dibuat transaksional per tenant |

Format NIS tetap sepuluh digit untuk menjaga kontrak yang sudah ada: tahun, kode jenjang dua digit, lalu urutan empat digit. Admin menetapkan kode jenjang dua digit yang berbeda pada setiap jenjang aktif. NIS tidak diterbitkan jika kodenya belum diatur; sistem tidak menebak kode dari nama jenjang.

## Bukti verifikasi

- Migration SQL `20270218000000_operational_relationships_and_naming_series.sql` sudah diterapkan ke schema VQE melalui MCP. Pemeriksaan pascamigrasi baca-saja sebelumnya menemukan tiga seri default, enam foreign key baru tervalidasi, empat tabel naming mengaktifkan RLS+FORCE, hak baca browser dicabut, dan fungsi alokasi hanya dapat dipanggil oleh `service_role`.
- Migration lanjutan `20270219000000_naming_series_master_data_ids.sql` sudah diterapkan ke VQE. Ia menambahkan tiga seri kode gedung/kamar/kelas, kolom kode NIS dua digit pada katalog jenjang, validasi bahwa jenjang aktif memiliki kode, serta pembuatan NIS langsung dari Data Induk dan PPDB. Kode NIS tidak ditebak dari teks jenjang.
- Karena MCP `apply_migration` tidak menerima versi file, migration lanjutan tercatat sebagai `20261101051456 naming_series_master_data_ids`, bukan `20270219000000`. SQL yang tersimpan di ledger telah dibandingkan karakter demi karakter dengan file sumber lokal. Ledger perlu dikoreksi dengan pembaruan metadata terjaga setelah perubahan migration diperbarui di PR.
- Daftar seri staging sekarang memuat enam seri inti: NIS, PPDB, pegawai, gedung, kamar, dan kelas. Constraint relasi seri/modul sudah divalidasi dan constraint validasi nama/deskripsi tetap dipertahankan. Data seri konfigurasi tenant dibuat sebagai bagian migration; belum ada data transaksi atau alokasi nomor uji yang dibuat.
- Percobaan pertama migration lanjutan gagal saat menemui constraint lama bernama hasil-generate `tenant_naming_series_check1`; transaksi gagal dan tidak meninggalkan perubahan. Migration kemudian diperbaiki agar hanya mengganti check constraint `series_key`/`module_id`, lalu berhasil diterapkan.
- Tidak ada record transaksi uji yang dibuat di VQE. Production tidak disentuh.
- Pemeriksaan source lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, `npm run test:ppdb-csv-import`, `npm run test:ppdb-onboarding-rooms`, `npm run test:hris-legacy-import`, `npm run test:master-data-transfer-csv`, dan `git diff --check`. Uji `npm run test:supabase-runtime-no-firebase` awalnya gagal karena ekspektasi tab tidak mengikuti perilaku aktual; pemeriksaan diperbarui untuk menuntut tab Referensi dan Naming Series tersembunyi saat runtime belum aktif, lalu lulus: 100 modul aktif, 26 rute Supabase, dan 26 rute migrasi lama tertutup. Build masih menampilkan peringatan chunk PDF besar dan komentar dependensi; tidak menggagalkan build.
- `supabase test db`/pgTAP belum berjalan di workspace karena Docker tidak tersedia. Browser UAT staging juga belum membuktikan modul ini.

## Gerbang yang masih terbuka

DDL migration pertama dan kedua sudah ada di VQE; migration pertama sudah tercatat dengan versi source `20270218000000`. Migration kedua berhasil, tetapi ledger mencatat versi waktu MCP `20261101051456`. Jangan menjalankan ulang DDL. Sinkronkan hanya metadata versi migration kedua setelah SQL final sudah dipush ke PR.

Perbaikan yang benar adalah `supabase migration repair` CLI, yang hanya memperbaiki status pada migration history dan tidak menjalankan SQL. Di workspace saat checkpoint ini dibuat, Supabase CLI belum terpasang dan URL database VQE belum tersedia di env lokal. Selain itu, `supabase/config.toml` pada checkout ini menunjuk ke Production PTSAS. Karena itu, **jangan gunakan `--linked` dari checkout ini**. Tim backend harus mengisi URL koneksi VQE ke variabel sesi `SUPABASE_DB_URL_VQE` dari penyimpanan rahasia lokal, lalu memakai `--db-url` eksplisit. Jangan menyalin URL berpassword ke Git, chat, atau riwayat perintah.

```powershell
$u = [Uri]$env:SUPABASE_DB_URL_VQE
$dbUser = [Uri]::UnescapeDataString($u.UserInfo.Split(':')[0])
$isVqeDirect = $u.DnsSafeHost -eq 'db.vqemuyzveuirlkvdggjd.supabase.co'
$isVqePooler = $u.DnsSafeHost.EndsWith('.pooler.supabase.com') -and $dbUser -eq 'postgres.vqemuyzveuirlkvdggjd'
if (-not ($isVqeDirect -or $isVqePooler)) { throw 'URL tidak terverifikasi sebagai VQE staging; hentikan.' }

supabase migration list --db-url $env:SUPABASE_DB_URL_VQE
supabase migration repair 20261101041832 --status reverted --db-url $env:SUPABASE_DB_URL_VQE
supabase migration repair 20270218000000 --status applied --db-url $env:SUPABASE_DB_URL_VQE
supabase migration list --db-url $env:SUPABASE_DB_URL_VQE
supabase db push --db-url $env:SUPABASE_DB_URL_VQE --dry-run
```

Untuk menyelaraskan ledger yang sekarang, gunakan pembaruan metadata terjaga berikut hanya setelah commit berisi SQL final tersedia di PR. Guard mencocokkan versi hasil MCP, nama, jumlah statement, panjang, dan hash dari statement yang diperiksa; pembaruan tidak menjalankan ulang SQL. Jika guard menghasilkan nol baris, hentikan dan periksa ledger.

```sql
UPDATE supabase_migrations.schema_migrations
SET version = '20270219000000'
WHERE version = '20261101051456'
  AND name = 'naming_series_master_data_ids'
  AND array_length(statements, 1) = 1
  AND length(statements[1]) = 22734
  AND md5(statements[1]) = '08ea5fdee949c7014860c9798a76133b'
  AND NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20270219000000'
  );
```

Sesudahnya, pastikan daftar migration berakhir pada versi source `20270219000000` dan dry-run kosong. Jangan gunakan PTSAS. Setelah ledger selaras, jalankan pgTAP dan UAT penuh di VQE; baru evaluasi promosi Production.

Referensi resmi: [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) dan [Supabase CLI reference untuk `migration list`, `migration repair`, serta `db push`](https://supabase.com/docs/reference/cli/global-flags).

## Status checkpoint

**Implementasi lingkup Naming Series: 95%** — enam seri, layar konfigurasi, kode NIS per jenjang, alokasi backend, ID struktur otomatis, dan skema VQE tersedia. Sisa 5% mencakup sinkronisasi metadata ledger, menjalankan pgTAP, dan UAT UI/alur impor staging. Angka ini hanya untuk Naming Series, bukan keseluruhan ERP.

Implementasi Naming Series sudah dipush pada commit `59dda6e` di [PR #40](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40). PR tetap Draft karena migration history VQE belum selaras dan pgTAP/UAT belum lulus. Production belum disentuh. Periksa status remote PR untuk commit terbaru sebelum menjalankan langkah migrasi.

Fitur ini belum layak dipromosikan ke Production sampai seluruh gerbang tersebut lulus.
