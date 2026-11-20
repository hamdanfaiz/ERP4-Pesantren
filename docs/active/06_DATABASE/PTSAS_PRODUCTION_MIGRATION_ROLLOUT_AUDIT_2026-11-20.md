# PTSAS Production — audit kesenjangan migrasi dan runbook promosi

Tanggal pemeriksaan: 20 November 2026

## Ringkasan eksekutif

Dokumen ini menjadi panduan kerja tim backend untuk merekonsiliasi source migrasi Supabase dengan PTSAS Production. Pemeriksaan pada tanggal di atas hanya membaca metadata migrasi dan katalog PostgreSQL. Tidak ada DDL atau data Production yang diubah.

| Fakta | Nilai |
| --- | --- |
| Commit source yang diaudit | `a138895783f7118a657a0d5bd94e5872f60f2cba` |
| File migrasi source | 163, berakhir pada `20270402000000` |
| Ledger PTSAS Production | 100 entri, terakhir `20270316000000` |
| Migrasi source yang belum tercatat di Production | 63; daftar lengkap ada di [laporan paritas](ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md) |
| Entri Production dengan nama kosong | 3: `20261205000000`, `20261206000000`, `20270118000000` |
| Ledger VQE staging | 163 entri; seluruh versi source tercatat sampai `20270402000000` |

Ledger membuktikan versi yang pernah direkam, bukan bahwa DDL saat ini identik dengan source. Status RLS aktif pada tabel Production juga tidak membuktikan isi policy, grant, fungsi, trigger, constraint, indeks, atau perilaku aplikasi sudah cocok. DDL Production belum dibandingkan secara menyeluruh dengan source, dan backup/restore Production belum dibuktikan.

### Pemeriksaan katalog terarah setelah snapshot ledger

Pemeriksaan baca-saja lanjutan menemukan 13/13 indeks target valid/ready di VQE, sementara PTSAS tidak memiliki indeks B-tree tak bersyarat yang mendukung urutan key dari satu pun dari 13 FK terkait. Seluruh 13 FK itu sendiri ada dan tervalidasi di kedua project. Ini kesenjangan indeks pendukung nyata pada constraint inti yang tercakup, bukan audit seluruh schema atau izin menerapkan migration. Ukuran tabel PTSAS yang tercatat di laporan hanya statistik snapshot. Katalog Surah, validator, dan dua RPC Tahfidz terpilih juga ada di VQE tetapi tidak di PTSAS. Lihat [catatan pemeriksaan katalog terarah](VQE_PTSAS_TARGETED_CATALOG_CHECK_2026-11-20.md). Production tidak diubah.

### Perbandingan katalog publik tambahan — 20 November 2026

Perbandingan baca-saja nama tabel dan metadata kolom/constraint menemukan 179 tabel di VQE dan 162 di PTSAS. Tidak ditemukan tabel yang hanya ada di PTSAS; 17 tabel source yang ada di VQE belum ada di PTSAS:

`library_book_import_batches`, `hris_employee_import_batches`, `library_circulation_import_batches`, `marketplace_mutation_requests`, `donation_mutation_requests`, `lms_submission_requests`, `lms_submission_grade_events`, `lms_learning_record_requests`, `cooperative_financial_import_batches`, `cooperative_financial_import_records`, `ppdb_document_access_events`, `ppdb_document_upload_requests`, `ppdb_document_upload_events`, `finance_legacy_unit_assignment_requests`, `guardian_candidate_accounts`, `quran_surahs`, dan `tahfidz_target_bulk_write_requests`.

Pada tujuh tabel yang sama, sepuluh kolom berikut ada di VQE tetapi tidak di PTSAS: `candidates.public_submission_fingerprint`; `tahfidz_records.surah_number`; `library_books.source_fingerprint`; `library_circulations.source_fingerprint`; `hris_employees.source_system`, `source_record_id`, `source_fingerprint`, `legacy_details`; `cooperative_sale_items.cost_snapshot_known`; serta `cooperative_wallet_ledger.entry_sequence`.

Empat perbedaan kontrak kolom/constraint yang diperiksa:

- `cooperative_sale_items.cost_price`: nullable di VQE, tetapi NOT NULL di PTSAS.
- `cooperative_wallet_ledger.entry_type_check`: VQE menerima `opening_balance`, PTSAS belum.
- `student_room_assignment_history.event_type_check`: VQE menerima `baseline_snapshot`, PTSAS belum.
- `student_room_assignment_history.change_source_check`: VQE menerima `migration_baseline`, PTSAS belum.

Flag RLS cocok pada 162 tabel yang namanya sama; pemeriksaan ini tidak membandingkan isi policy, grant, definisi fungsi/trigger, semua constraint/index, atau perilaku endpoint. Dampak yang perlu diuji: jalur katalog Surah dan target massal Tahfidz merujuk ke objek yang belum ada; import finansial koperasi source memakai `cost_snapshot_known` dan dapat mengirim `cost_price = NULL`, berlawanan dengan kontrak PTSAS; fitur impor legacy lain merujuk ke tabel/kolom yang hilang. Ini pemetaan source ke katalog, bukan bukti bahwa semua UI tersebut aktif atau kegagalan live sudah terjadi.

Temuan membuktikan selisih skema terpilih dan menguatkan perlunya diff DDL menyeluruh sebelum promosi. Tidak ada migration, ledger repair, atau perubahan data yang dilakukan pada PTSAS atau VQE dalam pemeriksaan ini.

### Perbandingan foreign key baca-saja — 20 November 2026

Perbandingan metadata katalog dari `list_tables(verbose=true)` pada VQE dan PTSAS menemukan 559 definisi foreign key di VQE dan 515 di PTSAS. Ada 44 definisi yang tercatat di VQE tetapi tidak di PTSAS; tidak ditemukan definisi Production-only atau definisi bernama sama dengan target/kolom berbeda pada snapshot ini.

- 43 dari 44 foreign key yang hanya tampak di VQE berasal dari tabel sumber yang belum ada di PTSAS; perbedaan ini terkait tabel-tabel baru dalam inventaris 17 tabel di atas.
- Satu foreign key berasal dari tabel yang sudah ada pada kedua project: `tahfidz_records_surah_number_fk`, dari `public.tahfidz_records.surah_number` ke `public.quran_surahs.surah_number`. Katalog `public.quran_surahs` belum ada di PTSAS.
- Metadata yang sama menunjukkan tidak ada perbedaan primary key pada tabel bersama. Ini bukan diff DDL penuh: daftar indeks, definisi semua check constraint, fungsi, trigger, policy, grant, dan validitas setiap constraint belum dibandingkan menyeluruh.

Temuan ini memperkuat bahwa ledger saja tidak cukup untuk promosi. Jangan menambahkan foreign key secara manual atau mendorong semua migrasi sampai urutan migrasi, dependensi, preflight data, dan rehearsal backup/restore ditinjau. Ini hanya pembacaan katalog; tidak ada perubahan database Production.

### Perbandingan katalog diperluas baca-saja — 21 November 2026

Snapshot ini membandingkan metadata katalog `public` antara staging VQE dan PTSAS Production melalui kueri `SELECT` pada katalog PostgreSQL/information_schema. Tidak ada baris aplikasi atau isi fungsi yang diambil; untuk fungsi, yang dicatat hanya signature, konfigurasi, hak eksekusi terpilih, dan fingerprint definisi. Tidak ada migration, DDL, data, atau setting Production yang diubah. VQE adalah pembanding yang ledger-nya cocok dengan source; snapshot ini tetap bukan diff langsung terhadap replay source SQL dan bukan persetujuan promosi.

| Objek katalog | VQE | PTSAS | Perbedaan yang teramati |
| --- | ---: | ---: | --- |
| Tabel `public` | 179 | 162 | 17 tabel ada di VQE dan belum ada di PTSAS; tidak ada tabel PTSAS-only. |
| Kolom `public` | 2.039 | 1.896 | 143 kolom VQE-only: 133 ada pada 17 tabel yang belum ada dan 10 ada pada tabel bersama; satu kontrak berubah, `cooperative_sale_items.cost_price` nullable di VQE namun NOT NULL di PTSAS; tidak ada kolom PTSAS-only. |
| Constraint | 1.684 | 1.554 | 119 definisi VQE-only berasal dari tabel yang belum ada; 13 definisi VQE-only ada pada tabel bersama; tiga constraint bernama sama memiliki definisi berbeda; dua constraint PTSAS-only. |
| Indeks | 696 | 611 | Berdasarkan nama relasi/indeks, 89 VQE-only (34 pada tabel yang belum ada, 55 pada tabel bersama) dan empat PTSAS-only. Nama berbeda belum membuktikan fungsi indeks setara; audit 13 indeks composite FK inti yang dirujuk di atas tetap menunjukkan dukungan key-order yang belum ada di PTSAS. |
| Trigger non-internal `public` | 95 | 83 | 12 VQE-only: enam pada tabel yang belum ada dan enam pada tabel bersama; satu trigger bersama berbeda definisi. |
| Fungsi/prosedur `public` | 283 | 244 | 46 signature VQE-only, tujuh signature PTSAS-only, dan 69 signature bersama memiliki fingerprint definisi berbeda. Sepuluh dari 69 juga berbeda `proconfig/search_path`. |
| Policy RLS | 5 | 5 | Nama, target role, dan operasi sama; ekspresi policy berbeda secara tekstual karena helper berpindah dari `public` ke `private` pada VQE. |
| Hak CRUD tabel `anon`/`authenticated` | 0 perbedaan | 0 perbedaan | Perbandingan `has_table_privilege` pada SELECT/INSERT/UPDATE/DELETE tidak menemukan perbedaan untuk tabel bersama. Ini tidak membandingkan seluruh grant schema, sequence, Storage, atau perilaku API. |

Rincian yang penting untuk rekonsiliasi:

- Dari 13 constraint VQE-only pada tabel bersama, perubahan mencakup validasi fingerprint pendaftaran publik, kontrak import/provenance HRIS dan perpustakaan, kolom snapshot biaya koperasi, unique key gabungan pada tabel LMS, foreign key nomor Surah Tahfidz, hasil ujian Tahfidz, dan semantik deskripsi referensi tenant. Tiga constraint bernama sama yang definisinya berbeda adalah `cooperative_wallet_ledger_entry_type_check`, `student_room_assignment_history_change_source_check`, serta `student_room_assignment_history_event_type_check`.
- Enam trigger yang ada di source pembanding tetapi belum ada di PTSAS pada tabel yang sama: pengaitan akun Wali sesudah onboarding kandidat; pencegahan pemindahan unit pada Finance expenses dan ledger; pengisian email kontak Wali; serta validasi referensi Surah saat insert/update setoran Tahfidz. Trigger `finance_expenses_link_category` di VQE juga berjalan ketika `department` berubah, sedangkan definisi PTSAS tidak memasukkan kolom itu. Dampak runtime masing-masing perlu diuji pada salinan staging sebelum promosi.
- Tujuh signature yang hanya ada di PTSAS mencakup empat helper RLS `current_app_role`, `current_tenant_id`, `has_module_access`, `is_tenant_admin`, serta tiga signature lama LMS yang tidak menerima `p_request_id`. VQE mempunyai signature LMS baru dan helper internal di schema `private`.
- Untuk signature fungsi yang sama, snapshot tidak menemukan perbedaan flag `SECURITY DEFINER` atau hasil boolean `EXECUTE` untuk role `anon`, `authenticated`, dan `service_role`; namun fingerprint fungsi berbeda pada 69 signature dan `search_path` berbeda pada 10. Fingerprint bukan bukti semantik berbeda/sama. Periksa definisi sumber, signature, owner, `search_path`, hak `EXECUTE`, dan perilaku sebelum merencanakan migrasi.
- Seluruh 179 tabel VQE dan 162 tabel PTSAS melaporkan RLS serta FORCE RLS aktif pada snapshot ini. Ini tidak membuktikan predicate policy setara: lima ekspresi Production masih memanggil helper di `public`, sementara VQE memanggil helper internal `private`. Ketersediaan schema/Data API dan akses RPC Production belum disimpulkan dari hitungan ini.

Perbedaan katalog tambahan memperjelas risiko kompatibilitas pada flow onboarding Wali, Finance per-unit, referensi Surah Tahfidz, import legacy, serta fungsi LMS. Ini bukan bukti bahwa setiap flow aktif pada UI hosting atau pasti gagal. Sebelum Production, petakan setiap objek terhadap migration source, tinjau fungsi/index/constraint yang berubah, hitung dampak preflight pada salinan, lalu jalankan urutan migration dalam rehearsal yang dapat dipulihkan. Jangan membuat trigger, constraint, indeks, atau helper secara manual hanya untuk menyamakan hitungan.

### Helper RLS tenant yang belum diinternalisasi

PTSAS masih memiliki empat helper `SECURITY DEFINER` pada schema `public`, dengan `EXECUTE` hanya untuk `authenticated` (tidak untuk `PUBLIC`/`anon`), sementara VQE sudah menempatkannya di `private` melalui source migration `20270210000000_internalize_tenant_rls_helpers` yang belum tercatat di ledger Production. Definisi Production yang diperiksa menggunakan `auth.uid()` dan profil/tenant aktif; ini tidak menunjukkan akses lintas tenant, tetapi tidak sesuai hardening source. Schema `public` otomatis exposed secara default menurut dokumentasi Supabase; actual setting exposed-schema Production belum diperiksa, jadi akses HTTP RPC belum dikonfirmasi. Promosikan migration melalui rehearsal/backup terkontrol, bukan revoke manual, karena RLS policies tetap memerlukan fungsi helper. Detail: [audit helper RLS](VQE_PTSAS_TARGETED_CATALOG_CHECK_2026-11-20.md).

## Temuan statis pada 63 file yang belum tercatat

Pemindaian source migration tidak menemukan perintah migrasi `DELETE` atau `TRUNCATE`. Ini bukan jaminan bebas risiko: ada perubahan DDL, pengisian metadata/historis, penggantian fungsi dan trigger, perubahan constraint, serta indeks yang dapat mengunci penulisan.

### DML yang berjalan ketika file migrasi dieksekusi

Pemindaian ulang atas 63 file source yang belum tercatat di PTSAS memisahkan perintah SQL langsung, pemanggilan fungsi tingkat migrasi, dan badan fungsi yang baru berjalan ketika RPC dipanggil. Tidak ditemukan `DELETE` atau `TRUNCATE` pada pemindaian ini. Lima migration tetap dapat menulis atau mengubah data saat diterapkan:

- `20261213000000_marketplace_mutation_payload_guard`: empat insert membentuk tanda terima idempotensi dari produk dan pergerakan stok runtime, pesanan runtime, serta event perubahan status. Targetnya tabel baru `marketplace_mutation_requests`; setiap insert memakai `ON CONFLICT DO NOTHING`. Data sumber tidak dihapus.
- `20261214000000_donation_mutation_payload_guard`: insert membentuk tanda terima dari event audit kampanye, donatur, aset wakaf, serta donasi dibuat/dibatalkan. Targetnya `donation_mutation_requests`; fingerprint historis `NULL` karena payload lama tidak tersedia. Insert memakai `ON CONFLICT DO NOTHING`.
- `20270109000000_boarding_room_history_baseline`: migration memanggil `SELECT public.backfill_student_room_assignment_history_baseline()`. Fungsi tersebut menambahkan snapshot pada `student_room_assignment_history` untuk santri yang saat ini memiliki `room_id` atau `building_id`; konflik unik diabaikan. Ini snapshot kondisi saat cutover, bukan rekonstruksi perpindahan historis.
- `20270205000000_guardian_self_registration`: satu `UPDATE` mengisi `guardians.details.email` hanya bila email wali masih kosong dan email kandidat PPDB yang terkait valid. Nilai kontak wali yang sudah ada dipertahankan.
- `20270320000000_tahfidz_quran_surah_catalog`: mengisi/memperbarui 114 baris katalog surah, lalu menetapkan `tahfidz_records.surah_number` untuk record dengan nama surah yang cocok setelah trim dan normalisasi huruf. Pembaruan tidak dibatasi pada nilai `NULL`, sehingga nilai lama yang cocok dapat ditimpa dengan nomor katalog.

Daftar ini tidak menghitung DML di dalam definisi function/trigger sebagai efek migrasi langsung. Definisi itu perlu audit terpisah untuk hak EXECUTE dan perilaku saat dipanggil. Sebelum promosi, rehearsal perlu mencatat jumlah baris yang akan terpengaruh untuk setiap target dan jumlah setoran Tahfidz yang tidak cocok ke katalog. Jumlah Production belum dibaca dalam audit ini.

### Perubahan struktural yang perlu pemeriksaan khusus

- `20270122000000_lms_learning_record_tenant_fk`: menjalankan preflight dan membatalkan migrasi bila referensi LMS lintas tenant ditemukan; mengganti foreign key dengan kontrak tenant gabungan. Periksa seluruh pelanggaran preflight pada salinan data Production sebelum jadwal rilis.
- `20261207000000_library_legacy_catalog_import`: menghapus constraint unik ISBN lama. Pastikan constraint pengganti dan kebijakan ISBN yang diinginkan sesuai kondisi katalog Production.
- `20261230000000_cooperative_financial_legacy_import` dan `20270109000000_boarding_room_history_baseline`: mengubah constraint historis. Bandingkan definisi constraint serta validitas data yang ada.
- `20270205000000_guardian_self_registration`: menghapus constraint unik lama pada relasi akun wali. Pastikan constraint dan index baru melindungi relasi sesuai kebijakan satu akun untuk beberapa anak.
- `20261225000000`, `20261226000000`, dan `20270215000000`: mengganti fungsi LMS dan trigger relasi kategori biaya. Verifikasi signature, isi fungsi, `search_path`, pemilik, dan grant EXECUTE sebelum/sesudah.
- `20270210000000_internalize_tenant_rls_helpers` serta migrasi keamanan lainnya: tinjau pemilik fungsi, `SECURITY DEFINER`/`SECURITY INVOKER`, `search_path`, grant, RLS, dan FORCE RLS; jangan menyimpulkan keamanan hanya dari status RLS.

### Dampak indeks dan lock

Sejumlah migrasi memakai `CREATE INDEX` biasa. Source secara khusus memperingatkan bahwa indeks direktori profil (`20270101000000`) dan pencarian santri (`20270119000000`) dapat menghalangi penulisan saat proses build. Migrasi halaman CBT (`20270325000000`) dan indeks foreign key inti (`20270330000000`) juga perlu penilaian ukuran tabel dan jendela penulisan rendah. Catat durasi rehearsal, ukuran tabel, lock yang terlihat, dan ambang pembatalan sebelum menjadwalkan produksi.

## Urutan kerja yang diwajibkan

### 1. Kunci source dan target

- Gunakan source yang sama dengan commit audit atau commit `main` yang lebih baru dan disetujui.
- Periksa project ref secara eksplisit sebelum menjalankan perintah. Target yang dibahas dokumen ini adalah PTSAS Production `ptsasgdvgrbdtgyqieie`; VQE `vqemuyzveuirlkvdggjd` adalah staging.
- Gunakan autentikasi CLI/akses database milik tim melalui secret manager atau `.env` lokal yang tidak masuk Git. Jangan menempel kredensial di PR, log, SQL editor, atau chat.
- Tidak ada kebutuhan menyalin ulang hostname pooler VQE. Jika tim memerlukan URL Production, salin persis dari dialog Connect pada proyek Production; jangan menebak hostname/cluster.

### 2. Buat dan buktikan backup sebelum perubahan

- Ambil backup/snapshot Production melalui mekanisme yang didukung paket Supabase dan kebijakan organisasi.
- Pulihkan backup tersebut ke proyek disposable atau lingkungan terisolasi, bukan ke Production.
- Simpan bukti waktu snapshot, rentang data, versi source, hasil restore, pemeriksaan jumlah record per tabel penting, validasi relasi, dan smoke test baca/tulis pada lingkungan hasil restore.
- Jangan lanjut hanya karena backup berstatus sukses; restore yang dapat dibuka dan diperiksa adalah bukti yang dibutuhkan.

### 3. Bandingkan DDL aktual dengan source

- Ekspor schema-only Production secara baca-saja dengan alat Postgres yang disetujui tim; hilangkan owner/ACL dan abaikan nilai yang berubah otomatis seperti timestamp.
- Bandingkan objek berdasarkan nama dan definisi: tabel/kolom/default, constraint dan validasinya, foreign key tenant gabungan, index, trigger, function signature/body/security/search_path/owner/grant, policy RLS, FORCE RLS, schema privilege, dan table privilege.
- Cocokkan tiga versi ledger yang nama migrasinya `NULL` dengan file source dan bukti katalog. Jangan mengisi nama atau memperbaiki ledger hanya berdasarkan dugaan.
- Untuk setiap dari 63 versi yang tertinggal, catat: objek yang diharapkan, objek aktual, apakah sudah ada lewat perubahan manual/alias, DML yang akan terjadi, dependensi urutan, dan hasil keputusan. Bila objek sudah ada, buktikan kesetaraan sebelum mempertimbangkan repair ledger; repair tidak boleh digunakan untuk menyembunyikan ketidakcocokan.
- Arsipkan diff dan inventaris dalam artefak internal dengan akses terbatas. Jangan memasukkan data pribadi atau secret ke repository.

### 4. Rehearsal migrasi pada hasil restore

- Terapkan urutan migrasi pada salinan hasil restore dengan versi source yang sama. Jangan menguji hanya terhadap database kosong.
- Source memiliki migrasi yang hilang sebelum dan setelah high-watermark ledger Production. Karena itu rencana akan out-of-order; `--include-all` dapat mengikutsertakan seluruh migrasi tertunda, bukan sekadar beberapa migrasi terakhir.
- Jalankan dry-run terlebih dahulu dan bandingkan daftar versi/nama terhadap inventaris 63 migrasi. Dry-run hanya rencana; ia tidak membuktikan SQL berhasil atau aman.
- Tinjau DML historis, perubahan constraint, indeks, function grants, dan dependensi setiap file. Ukur lock dan durasi. Validasi row counts dan relasi sebelum/sesudah; khusus untuk migrasi Quran, hitung record Tahfidz yang cocok/tidak cocok.
- Jika CLI menunjukkan versi remote-only, migrasi yang telah diterapkan di luar ledger, benturan versi, atau perubahan tak terduga, hentikan proses. Jangan menjalankan repair massal atau `db push` berulang untuk mencoba melewati preflight.

### 5. Persetujuan dan penerapan terkontrol

- Backend owner menyetujui diff DDL, hasil restore, urutan migrasi, daftar DML/seed, dampak lock, jendela rilis, rencana observasi, dan rencana pemulihan.
- Terapkan satu release plan yang direhearsal oleh operator Production yang berwenang. Jangan jalankan seluruh 63 migrasi hanya karena dry-run menampilkannya.
- Hentikan rilis saat migrasi pertama gagal atau waktu lock melewati ambang yang telah disepakati. Simpan log versi yang berhasil dan error tanpa secret.
- Hindari mengedit migrasi yang sudah pernah diterapkan; koreksi skema dilakukan dengan migrasi forward-only yang sudah direhearsal.

### 6. Verifikasi setelah rilis

- Pastikan versi ledger sesuai release plan dan setiap objek DDL penting cocok dengan source.
- Verifikasi RLS dan FORCE RLS, policy per role/tenant, grants, function security/grants, trigger, foreign key, dan indeks yang dirilis.
- Jalankan smoke test tenant-terpisah dan alur baca/tulis pada modul terdampak, terutama Wali/akun, LMS, Perpustakaan, koperasi/keuangan, Tahfidz, CBT, PPDB, serta asrama.
- Periksa log/error, antrean/retry, latensi, waktu lock, dan hasil DML/rekonsiliasi; dokumentasikan hasil serta tindakan pemulihan.
- Production dianggap selesai pada tahap ini hanya setelah tim backend menerima bukti uji restore dan UAT pascarilis. Ini terpisah dari pemeriksaan CI pada database sementara.

## Revalidasi Advisor Production (baca-saja, 20 November 2026)

Snapshot Advisor Production sekitar 15.36–15.37 WIB melaporkan:

| Area | Temuan | Interpretasi operasional |
| --- | --- | --- |
| Security | 157 tabel mengaktifkan RLS tanpa policy (INFO) | Query katalog tambahan tidak menemukan grant tabel kepada `PUBLIC`, `anon`, atau `authenticated` pada tabel tanpa policy. Temuan ini tidak membuktikan endpoint backend yang memakai `service_role` menerapkan isolasi tenant; otorisasi endpoint tetap perlu diuji. |
| Security | `public.erp4_ppdb_update_updated_at_column()` memiliki search path yang tidak dipatok (WARN) | Fungsi adalah SECURITY INVOKER, owner `postgres`, ACL hanya owner, dan terpasang pada dua trigger. Migration source `20270209000000_harden_ppdb_trigger_search_path` menetapkan `search_path = pg_catalog`; versi ini belum tercatat di ledger Production. |
| Security | Empat helper tenant SECURITY DEFINER dapat dipanggil oleh `authenticated` (WARN) | Katalog mengonfirmasi semuanya masih di `public`, `search_path=pg_catalog, public`, dan EXECUTE hanya untuk `authenticated`, `service_role`, serta owner—tanpa `PUBLIC`/`anon`. Source `20270210000000_internalize_tenant_rls_helpers` memindahkan helper ke schema `private`; versi ini belum tercatat di Production. Definisi yang diperiksa menggunakan `auth.uid()`; belum ada bukti eksploit lintas-tenant. Keterjangkauan RPC melalui HTTP belum diuji karena exposed-schema setting belum dibaca. |
| Auth | Perlindungan kata sandi bocor nonaktif (WARN) | Ini pengaturan Auth proyek, bukan migration SQL. Advisor VQE juga melaporkan hal yang sama. |
| Performance | 269 foreign key tanpa covering index (INFO); 89 index belum terlihat dipakai (INFO) | Indeks perlu dipilih berdasarkan query dan beban representatif. Jangan menambah atau menghapus indeks massal hanya dari lint Advisor. |
| Performance | Dua policy mengulang evaluasi auth per baris (WARN) | Policy `user_profiles_select_own` dan `profiles_select_self_or_tenant_admin`; source `20270211000000_optimize_profile_rls_initplans` belum tercatat di ledger Production. |
| Performance | Satu pasangan index unik duplikat (WARN) | `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq` adalah index B-tree unik valid/ready dengan definisi key yang identik; tidak ada yang menjadi backing constraint. VQE hanya memiliki index ternormalisasi. Source `20270227000000_remove_redundant_document_number_index` menghapus index lama. Jangan jalankan DDL terpisah atau `db push` massal sebelum urutan migrasi, backup/restore, dan rehearsal disetujui. |
| Health | Tidak ada temuan | Ini hanya hasil Health Advisor, bukan bukti kesiapan rilis. |

Production dan VQE tidak diubah. Advisor memakai metadata/katalog, bukan isi data operasional; statistik index yang belum dipakai bergantung pada periode dan beban yang teramati. Snapshot ini menambah daftar tindakan rekonsiliasi, bukan persetujuan untuk mengubah Production.

## Hal yang belum dibuktikan

- Kesetaraan seluruh DDL Production dengan commit source.
- Dampak aktual migrasi pada baris data tenant Production.
- Pemulihan backup Production ke lingkungan terisolasi.
- Jalannya semua 63 migrasi tertunda dan fungsinya terhadap database Production.
- UAT Production lengkap dan penerimaan deploy oleh tim backend.

## Bukti dari pekerjaan Codex

- Pemeriksaan MCP Supabase Production hanya membaca metadata migration dan katalog PostgreSQL; konektor Production pada sesi audit ini bersifat baca-saja.
- VQE memiliki seluruh 163 versi source pada ledger. Ini bukan bukti bahwa Production sudah tersinkron.
- CI/pgTAP/replay pada database terisolasi tidak menggantikan DDL diff Production, restore Production, atau UAT Production.
- Tidak ada migration, repair ledger, atau perubahan data yang dilakukan ke PTSAS Production dalam audit ini.

Referensi status dan daftar lengkap migrasi tertinggal: [ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md](ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md).
