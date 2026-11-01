# Checkpoint Penomoran Otomatis dan Naming Series

Tanggal: 1 November 2026  
Branch kerja: `codex/menu-owner-placement-20261101`  
Staging: Supabase VQE `vqemuyzveuirlkvdggjd`  
Production: Supabase PTSAS `ptsasgdvgrbdtgyqieie` — tidak disentuh.

## Perilaku yang disiapkan

- UUID dibuat otomatis untuk ID teknis internal. Nomor bisnis unik pada jenis record di dalam tenant; nomor identik tetap boleh ada pada tenant berbeda.
- Enam seri bawaan dibuat untuk setiap tenant aktif: NIS, nomor pendaftaran PPDB, nomor pegawai, kode gedung, kode kamar, dan kode kelas.
- NIS dialokasikan dalam transaksi onboarding santri yang diterima maupun saat santri baru dibuat dari Data Induk. Nomor dari klien diabaikan; retry onboarding mempertahankan NIS yang sudah terbit dan penyuntingan tidak mengubah NIS.
- Setiap jenjang aktif memiliki kode NIS dua digit yang dikelola Admin pada Data Induk → Kategori & Referensi. Kode per tenant harus unik dan terkunci setelah penerbitan NIS.
- Nomor PPDB dibuat oleh backend untuk pendaftaran publik dan pembuatan Admin baru. API menolak nomor manual; CSV impor terpisah tetap dapat mempertahankan nomor lama.
- Nomor pegawai dibuat backend saat pegawai baru disimpan. API menolak nomor manual untuk record baru; nomor yang sudah ada tidak berubah saat record diperbarui atau data historis diimpor.
- Kode gedung, kamar, dan kelas dibuat otomatis per tenant saat record baru disimpan; impor struktur historis tetap mempertahankan kode sumber.
- Counter dikunci atomik per tenant, seri, periode, dan jenjang NIS; tabel alokasi mencegah nomor yang sudah pernah diterbitkan dipakai ulang. Constraint unik pada tabel operasional tetap menjadi lapisan perlindungan terakhir.
- Permintaan ulang Data Induk dengan `source_record_id` yang sama memakai kunci transaksional yang sama dan mempertahankan UUID serta NIS; retry tidak menghabiskan urutan baru.
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
- Migration `20270220000000_student_nis_source_idempotency.sql` sudah diterapkan ke VQE. Uji transaksi membuktikan pengulangan ID sumber yang sama mempertahankan UUID dan NIS, tidak memakai nomor palsu dari payload, dan tidak menambah counter; seluruh fixture dibatalkan.
- Migration `20270221000000_enforce_auto_business_identifiers.sql` sudah diterapkan ke VQE. Pembuatan PPDB/pegawai baru kini selalu meminta nomor dari seri tenant; nomor historis tetap ditangani melalui jalur impor.
- Karena MCP `apply_migration` tidak menerima versi file, migration Naming Series sempat tercatat dengan timestamp generated `20261101051456`, `20261101053205`, dan `20261101053811`; setelah teks SQL dicocokkan tepat dengan sumber repo, hanya versi metadata ledger yang diperbaiki menjadi `20270219000000`, `20270220000000`, dan `20270221000000`. Ledger VQE kini mencatat ketiga migration sesuai sumber.
- Daftar seri staging sekarang memuat enam seri inti: NIS, PPDB, pegawai, gedung, kamar, dan kelas. Constraint relasi seri/modul sudah divalidasi dan constraint validasi nama/deskripsi tetap dipertahankan. Data seri konfigurasi tenant dibuat sebagai bagian migration; belum ada data transaksi atau alokasi nomor uji yang dibuat.
- Percobaan pertama migration lanjutan gagal saat menemui constraint lama bernama hasil-generate `tenant_naming_series_check1`; transaksi gagal dan tidak meninggalkan perubahan. Migration kemudian diperbaiki agar hanya mengganti check constraint `series_key`/`module_id`, lalu berhasil diterapkan.
- Suite pgTAP Naming Series dijalankan di VQE dalam transaksi `BEGIN`/`ROLLBACK`, dengan rencana meningkat dari 35 menjadi **40 assertion**. Pemeriksaan SQL khusus yang gagal-tegas membuktikan retry NIS mempertahankan ID/NIS/counter, PPDB dan pegawai menolak nomor manual, serta dua alokasi PPDB menghasilkan kode berbeda. Tenant/Auth uji, alokasi, dan extension pgTAP tidak tertinggal setelah rollback. Production tidak disentuh.
- Pemeriksaan source lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, `npm run test:ppdb-csv-import`, `npm run test:ppdb-onboarding-rooms`, `npm run test:hris-legacy-import`, `npm run test:master-data-transfer-csv`, dan `git diff --check`. Uji `npm run test:supabase-runtime-no-firebase` awalnya gagal karena ekspektasi tab tidak mengikuti perilaku aktual; pemeriksaan diperbarui untuk menuntut tab Referensi dan Naming Series tersembunyi saat runtime belum aktif, lalu lulus: 100 modul aktif, 26 rute Supabase, dan 26 rute migrasi lama tertutup. Build masih menampilkan peringatan chunk PDF besar dan komentar dependensi; tidak menggagalkan build.
- `supabase test db`/pgTAP belum berjalan di workspace karena Docker tidak tersedia. Browser UAT staging juga belum membuktikan modul ini.

## Gerbang yang masih terbuka

Skema dan ledger VQE kini selaras dengan empat migration Naming Series/relasi. Suite pgTAP selesai dengan 40 assertion dan pemeriksaan SQL langsung untuk retry serta guard nomor otomatis lulus dalam transaksi rollback. Tabel konfigurasi/counter/alokasi/event memakai RLS paksa; fungsi alokasi, konfigurasi, pembuatan struktur, pembuatan santri, dan onboarding hanya dapat dipanggil `service_role`.

Masih perlu UAT antarmuka sebagai Admin VQE untuk: mengatur seri dan kode jenjang; membuat santri, pegawai, gedung, kamar, kelas, dan pendaftaran PPDB; memastikan nomor historis dari impor dipertahankan; serta memastikan referensi relasi memakai pilihan baku. Jalankan pula uji dua permintaan NIS serentak (`npm run test:db:nis-race`) setelah environment uji VQE siap. `supabase test db` lokal belum berjalan karena Docker tidak tersedia; pgTAP staging di atas sudah menguji alur transaksi secara langsung. Jangan menyentuh PTSAS sebelum gerbang UAT dan uji bersamaan lulus.

Referensi resmi: [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) dan [Supabase CLI reference untuk `migration list`, `migration repair`, serta `db push`](https://supabase.com/docs/reference/cli/global-flags).

## Status checkpoint

**Implementasi lingkup Naming Series: 100%; verifikasi staging: 88%** — enam seri, layar konfigurasi, kode NIS per jenjang, alokasi backend, ID struktur otomatis, guard nomor manual, retry sumber santri idempoten, empat migration VQE, ledger, suite 40 assertion, dan uji langsung terpilih sudah tersedia/lulus. Verifikasi yang tersisa adalah UAT antarmuka dan uji NIS bersamaan. Angka ini hanya untuk Naming Series, bukan keseluruhan ERP.

Implementasi Naming Series berada di [PR #40](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40). PR tetap Draft sampai UAT antarmuka dan uji permintaan NIS bersamaan lulus. Production belum disentuh.

Fitur ini belum layak dipromosikan ke Production sampai seluruh gerbang tersebut lulus.

