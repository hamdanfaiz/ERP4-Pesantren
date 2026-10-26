# Checklist rehearsal migrasi Supabase Production — 26 Oktober 2026

## Tujuan dan batas

Pembacaan baca-saja pada halaman Database → Migrations dashboard project `ptsasgdvgrbdtgyqieie` (branch `main / PRODUCTION`, 26 Oktober 2026) menampilkan **47 versi migration terpasang**, dari `20260603000000` hingga `20261206000000`. Perbandingan set ID dengan 91 file source PR #13 hingga `20270119000000` cocok untuk seluruh 47 versi; 44 file source belum tercatat di ledger, dari `20261207000000_library_legacy_catalog_import.sql` sampai `20270119000000_master_data_student_search_indexes.sql`. Tidak ada versi terpasang yang tidak dikenal atau migration lama yang tertinggal. Angka 44 adalah kandidat belum tercatat, bukan izin atau bukti bahwa migration aman diterapkan. Kartu ringkasan dashboard masih menampilkan “Last Migration: Unknown”, sedangkan tabel migration terperinci menampilkan 47 versi tersebut.

Beberapa snapshot lama (85/86, lalu 87/88/90 file dan 40/41/43 migration) dipertahankan sebagai riwayat. Angka terkini untuk snapshot 26 Oktober adalah 91 file source, 47 versi terpasang, dan 44 file source yang belum tercatat; lakukan preflight dan rehearsal pada staging sebelum penerapan.

Dokumen ini adalah rencana pemeriksaan berbasis source. Query SQL baca-saja memeriksa metadata versi migration, nama tabel, flag RLS, grant, serta metadata dan definisi empat fungsi helper yang dapat dijalankan pengguna. Query tidak membaca baris data operasional. Daftar 119 tabel publik dan kontrol akses dasarnya telah tercatat di bawah, tetapi perbandingan seluruh kolom, constraint, indeks, trigger, dan fungsi dengan semua migration source belum dilakukan; kesesuaian schema Production dengan source tetap belum terverifikasi. Tidak ada migration atau data/schema Production yang diubah. CI pada database kosong tidak menggantikan rehearsal menggunakan salinan backup yang representatif.



## Inventaris akses database Production baca-saja — 26 Oktober 2026

Pemeriksaan SQL Editor pada branch `main / PRODUCTION` hanya membaca catalog dan privilege, tanpa mengambil baris data operasional.

- Ada **119 tabel/partisi publik**; seluruh 119 memiliki RLS aktif dan `FORCE ROW LEVEL SECURITY`. Satu tabel tanpa kolom `tenant_id` adalah `tenants`; policy-nya membatasi baca ke `id = current_tenant_id()`.
- Tidak ditemukan grant tabel kepada `PUBLIC` atau `anon`. `authenticated` memiliki grant tabel `SELECT` hanya pada `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`; tidak terlihat grant tabel `INSERT`, `UPDATE`, atau `DELETE` untuk role tersebut. Policy kandidat/kandidat-dokumen memeriksa tenant aktif, Admin, dan izin PPDB; profil memeriksa pemilik atau Admin tenant dengan izin Users; tenant hanya dapat dibaca melalui tenant aktif; user profile hanya oleh UID sendiri.
- Dari 119 fungsi publik, `anon` tidak memiliki hak `EXECUTE`; `authenticated` hanya dapat menjalankan empat helper `SECURITY DEFINER`: `current_app_role`, `current_tenant_id`, `has_module_access`, dan `is_tenant_admin`. Semuanya membatasi hasil pada profil dan tenant aktif, serta menetapkan `search_path` ke `pg_catalog, public`. Role `anon`, `authenticated`, dan `service_role` tidak memiliki privilege `CREATE` pada schema `public`.
- `service_role` berstatus `BYPASSRLS` dan memperoleh grant langsung pada sebagian besar tabel (SELECT 115, INSERT 112, UPDATE 109, DELETE 109). Ini menjadikan route server dan secret service-role sebagai batas kepercayaan utama; hasil ini **tidak** membuktikan pemeriksaan tenant/role pada endpoint berjalan benar. Jangan menaruh secret ini di klien.
- Metadata ini mengonfirmasi pembatasan akses langsung ke tabel, bukan perilaku API, RPC yang tidak termasuk empat helper di atas, kelengkapan data tenant, maupun kesamaan seluruh schema dengan 91 file migration source. Login, matriks izin live, dan uji endpoint di staging tetap diperlukan.

Tidak ada privilege, policy, fungsi, migration, data, atau konfigurasi Production yang diubah.

## Gerbang sebelum rehearsal

1. Pastikan source dan target benar: commit yang akan diuji, project ref, branch, versi PostgreSQL, extension, serta ledger migration.
2. Ambil backup dengan metode yang dapat dipulihkan. Pulihkan ke proyek/instance terpisah dan verifikasi akses serta kelengkapan tabel sebelum menjalankan migration.
3. Lakukan pemeriksaan ulang ledger memakai [runbook preflight](MIGRATION_PREFLIGHT_RUNBOOK.md). Hentikan bila versi asing, duplikat, atau urutan migration berbeda ditemukan.
4. Rekam hitungan agregat per tenant/tabel dan pemeriksaan integritas berikut tanpa menyalin PII ke log. Catat waktu eksekusi, ukuran tabel, lock, penggunaan disk, dan pesan gagal.
5. Jalankan seluruh migration dalam urutan source pada salinan terisolasi. Jangan menjalankan satu migration yang gagal berulang-ulang tanpa memulihkan baseline rehearsal atau memahami alasan kegagalannya.

## Pemeriksaan data khusus

Pemeriksaan di bawah harus dijalankan pada salinan staging sebelum migration terkait. Hasil yang tidak kosong perlu ditinjau dan direkonsiliasi; jangan menghapus atau mengubah data otomatis untuk membuat migration lolos.

### Indeks pencarian roster Master Data — `20270119000000`

- Migration membangun B-tree `(tenant_id, name, id)` untuk urutan halaman roster dan tiga indeks GIN trigram untuk pencarian substring nama, NIS, dan ID sumber. Indeks `(tenant_id, name)` lama dihapus karena tercakup oleh indeks komposit baru.
- Cari roster dengan minimal 3 karakter agar setiap pencarian substring memiliki trigram yang bisa dipakai. Endpoint menolak input lebih pendek; antarmuka menampilkan petunjuk tanpa menjalankan query.
- `CREATE INDEX` biasa memblokir penulisan saat indeks dibangun. Pada salinan staging berukuran representatif, ukur durasi, disk, lock, dan query p95 untuk daftar tenant, pencarian substring 3+ karakter, serta filter status/jenis kelamin/kelas/asrama. Periksa `EXPLAIN (ANALYZE, BUFFERS)`; jangan menganggap indeks dipakai hanya karena sudah dibuat.
- Jalankan pgTAP `master_data_student_search_indexes.test.sql` dan tes API `test:master-data-pagination`. Rehearsal Production tetap wajib menilai maintenance window dan rollback sebelum menerapkan migration.

### ISBN katalog Perpustakaan — `20261207000000`

Migration membuang indeks unik lama dan membangun indeks unik atas ISBN yang dinormalisasi untuk buku aktif. Duplikat yang sebelumnya berbeda hanya karena kapitalisasi, spasi, atau tanda hubung dapat menggagalkan indeks baru.

```sql
SELECT tenant_id,
       regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g') AS isbn_normalized,
       count(*) AS row_count
FROM public.library_books
WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND status = 'active'
GROUP BY tenant_id, regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g')
HAVING count(*) > 1;
```

### Hasil ujian Tahfidz — `20261216000000`

Constraint baru mensyaratkan ujian selesai mempunyai nilai 0–100 dan hasil `pass` atau `retest`. Query ini harus mengembalikan nol baris:

```sql
SELECT tenant_id, id
FROM public.tahfidz_sessions
WHERE kind = 'exam' AND status = 'completed'
  AND (score IS NULL OR score NOT BETWEEN 0 AND 100
       OR outcome IS NULL OR outcome NOT IN ('pass', 'retest'));
```

### Koperasi — `20261230000000`

Migration mengubah makna `cost_price` yang tidak diketahui menjadi `NULL`, memberi identity sequence pada ledger saldo, dan memperketat jenis serta tanda transaksi. Periksa baris yang tidak akan memenuhi aturan sebelum menerapkan:

```sql
SELECT tenant_id, id, entry_type, amount_delta, sale_id
FROM public.cooperative_wallet_ledger
WHERE entry_type NOT IN ('top_up', 'purchase', 'adjustment', 'opening_balance')
   OR (entry_type IN ('top_up', 'opening_balance') AND (amount_delta <= 0 OR sale_id IS NOT NULL))
   OR (entry_type = 'purchase' AND (amount_delta >= 0 OR sale_id IS NULL))
   OR (entry_type = 'adjustment' AND sale_id IS NOT NULL);
```

Tinjau juga apakah ada item penjualan dengan biaya historis tidak tersedia. Migration menyimpan ketidakpastian itu secara eksplisit; biaya historis tidak boleh direka.

### Pemetaan akun Wali — `20270102000000`

Migration hanya membuat tautan akun bagi profil Wali aktif yang terhubung ke tepat satu Wali aktif melalui relasi Santri yang aktif. Pemetaan ambigu dibiarkan belum tertaut. Setelah rehearsal, hitung jumlah tautan dan jumlah profil Wali yang belum dapat dipetakan per tenant; jangan mencocokkan hanya dari nama.

### Indeks direktori pengguna — `20270101000000`

Migration membangun indeks B-tree dan trigram biasa pada `profiles`; file migration sendiri memperingatkan bahwa `CREATE INDEX` biasa mengizinkan baca tetapi memblokir tulis pada tabel selama build. Untuk instalasi berskala besar, jadwalkan maintenance window dan ukur durasi/lock pada salinan berukuran representatif. Periksa ketersediaan `pg_trgm` dan schema extension. Jangan memindahkan perintah `CREATE INDEX CONCURRENTLY` ke dalam transaksi tanpa mendesain ulang cara migration dijalankan.

Selain direktori pengguna, beberapa migration lain membuat indeks pada tabel operasional dan ledger. Ukur waktu serta dampak lock setiap build indeks terhadap ukuran data realistis, termasuk indeks unik ISBN, ledger Koperasi, akun Wali, audit nilai LMS, dan riwayat kamar.

### Snapshot penempatan kamar saat cutover — `20270109000000`

Migration memasukkan satu snapshot bagi setiap Santri yang kini mempunyai `room_id` atau `building_id`. Ia tidak membuat riwayat perpindahan lama dan tidak mengarang aktor. Sebelum dan sesudah migration, bandingkan jumlah Santri yang memiliki penempatan dengan jumlah event `baseline_snapshot` per tenant; tinjau jumlah penempatan tanpa nama ruang/gedung yang cocok. Uji pemanggilan ulang pada salinan terisolasi untuk memastikan tidak menggandakan snapshot.

### Tagihan dan berkas kandidat PPDB Admin — `20270110000000`–`20270113000000`

- `20270110000000`: pastikan kandidat yang diterima tetap mengarah ke tagihan kandidat yang sama setelah `master_student_id` terisi; tagihan tidak boleh terduplikasi untuk pasangan kandidat/jenis pembayaran. Uji penerbitan dan penyelesaian tagihan pada tenant sintetis.
- `20270111000000` dan `20270113000000`: pastikan tabel audit akses/unggah memakai RLS `FORCE`, tidak memiliki grant browser, dan hanya menerima operasi service role yang dirutekan oleh backend. Bucket `ppdb-documents` harus tetap privat; uji bahwa pengguna `anon` dan `authenticated` tidak dapat membaca objek secara langsung.
- `20270112000000`: uji batch Admin 1–100 calon, atribusi actor/tenant, retry identik, konflik request ID, NIK/NISN/nomor pendaftaran yang bentrok, serta rollback seluruh batch bila satu baris gagal.
- Snapshot Firestore kanonis pada pemeriksaan 26 Oktober berisi 0 dokumen `financeBillings`. Jangan membuat tagihan atau ledger historis sintetis; bila sumber berubah, lakukan preview dan rekonsiliasi baru sebelum import.

### Konfigurasi CBT legacy — `20270114000000`

- Pastikan satu dokumen konfigurasi saja dipetakan ke tenant melalui `legacy_tenant_key`; jangan mengimpor konfigurasi ke tenant yang tidak cocok atau menyimpulkan pemetaan dari nama.
- Uji preview tanpa membocorkan nilai konfigurasi, retry dengan fingerprint identik, penolakan perubahan setelah impor, field asing, duplikasi label tanpa peka kapitalisasi, skor bukan angka, skor di luar rentang, dan presisi di atas dua angka desimal.
- Verifikasi nilai `autoGrading=false` ditahan sampai runtime Supabase mendukung penilaian manual. Konfigurasi yang berhasil diimpor hanya mengisi nilai bawaan form; soal CBT belum dapat diimpor karena koleksi `cbt_questions` tidak ditemukan dalam snapshot sumber.
- Pastikan tabel pengaturan memakai RLS `FORCE`, tidak memberi akses `anon`/`authenticated`, dan RPC hanya dapat dieksekusi `service_role`. Jalankan pgTAP pada Supabase lokal terisolasi; jangan menerapkan migration ke Production.
- CI run [40259337791](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40259337791) pada commit `bae87128cd3d04aa367b1f7f9ba967773858cd87` telah berhasil pada kedua job, termasuk migration dan pgTAP CBT di Supabase lokal. Rehearsal menggunakan salinan backup Production tetap belum dilakukan.

### Pencarian PPDB Admin — `20270115000000`

- Migration menambahkan indeks B-tree dan empat indeks trigram untuk pencarian nama, nomor pendaftaran, sekolah asal, dan telepon. Jadwalkan pembangunan indeks saat aktivitas tulis rendah dan ukur lock/durasi pada salinan berukuran representatif.
- Pastikan `pg_trgm` tersedia pada schema `extensions`; SQL memilih schema extension yang sebenarnya untuk operator class.
- Uji batas halaman maksimum 250, cursor keyset `(created_at, id)`, pencarian minimum 3 dan maksimum 100 karakter, escape `%`, `_`, dan `\`, filter tahap yang valid, serta isolasi tenant.
- RPC `list_admin_ppdb_candidates_page` berstatus `SECURITY INVOKER` dan hanya diberi grant ke `service_role`; pastikan endpoint server memverifikasi Admin aktif, tenant, serta izin PPDB sebelum memanggilnya.
- Migration menambahkan indeks biasa, bukan `CONCURRENTLY`; jangan jalankan pada Production sebelum dampak lock terhadap pendaftaran aktif diperkirakan dari rehearsal.

### Aset digital Perpustakaan privat — `20270116000000`

- Pastikan bucket `erp4-private-library-assets` tetap privat, pembatasan ukuran/MIME cocok dengan kontrak migration, metadata dan reservasi upload memakai RLS `FORCE`, dan browser tidak mendapat grant langsung ke tabel atau RPC.
- Sebelum mengaktifkan `SUPABASE_LIBRARY_DIGITAL_ASSETS_ENABLED`, uji pada salinan non-produksi: unggah PDF/EPUB/MP3/M4A yang valid; tolak ekstensi, MIME, tanda tangan berkas, ukuran, dan SHA-256 yang tidak cocok; pastikan berkas invalid dibuang dari Storage dan tidak menghasilkan metadata.
- Uji Admin/Ustadz yang memiliki izin, role tanpa izin, profil nonaktif, tenant berbeda, retry reservasi/finalisasi, serta konflik saat request ID yang sama dipakai untuk isi berkas berbeda. Pastikan API hanya mengeluarkan tautan unduh singkat dan tautan kedaluwarsa ditolak.
- Dengan flag mati, katalog dan peminjaman tetap harus bekerja tanpa membaca tabel aset yang belum dipasang. Aktifkan flag hanya setelah migration, pgTAP, serta uji Storage bertanda tangan di non-produksi lulus.
- CI run [40277948722](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40277948722) pada head kode `e13943ea77e79375e848d297150e95c9ce1ec8f5` lulus pada job frontend dan migrasi/pgTAP Supabase lokal. Check Supabase Preview dilewati; tidak ada bukti upgrade pada backup Production atau pengujian Storage lewat proyek pelanggan.
- Audit sumber tidak menemukan byte berkas Perpustakaan lama yang dapat dipulihkan. Migration ini tidak mengimpor metadata lama atau mengarang isi berkas.

## Pemeriksaan setelah migration

- Ledger staging cocok persis dengan semua file source pada commit yang direhearsal dan `preflight:db-migrations` menyatakan tidak ada migration tertunda.
- Tidak ada constraint gagal, foreign key yatim, perubahan jumlah yang tidak dijelaskan, atau tenant lintas batas.
- pgTAP dan suite integrasi lulus pada schema hasil upgrade, bukan hanya pada database kosong.
- API utama, login Admin/Wali, penyimpanan berkas, transaksi Koperasi/Keuangan, Tahfidz, dan riwayat asrama diuji dengan data sintetis tenant-scoped.
- Backup sebelum rehearsal berhasil dipulihkan lagi; ukur durasi restore dan simpan hasil agregat serta log yang sudah disanitasi.
- Rekam setiap penyimpangan dan koreksi dalam migration baru. Jangan mengedit migration yang sudah tercatat di environment mana pun.

## Keputusan rilis

Rehearsal sukses hanya membuktikan upgrade pada snapshot dan ukuran data yang diuji. Sebelum Production, pemilik operasi tetap harus menyetujui jendela pemeliharaan, backup/restore, rencana pemulihan, rekonsiliasi data, versi source, serta hasil UAT. Dokumen ini tidak mengotorisasi penerapan Production.


## Inventaris metadata Firestore — 26 Oktober 2026

Pemeriksaan baca-saja pada project Firestore `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8` (ID yang tercantum pada URL konsol yang diberikan). Database ini dipilih secara eksplisit; project memiliki beberapa database Firestore lain dan tidak dicampur dalam hitungan ini.

Jumlah dokumen tingkat atas dihitung dengan agregasi `COUNT(*)`; query tidak mengembalikan isi dokumen.

| Koleksi | Dokumen |
| --- | ---: |
| `candidates` | 50 |
| `cbt_config` | 1 |
| `cooperative_inventory` | 6 |
| `cooperative_suppliers` | 3 |
| `cooperative_transactions` | 3 |
| `cooperative_wallets` | 3 |
| `entityRecords` | 14 |
| `library_books` | 4 |
| `library_circulations` | 1 |
| `library_digital_assets` | 4 |
| `lms_assessments` | 1 |
| `lms_categories` | 1 |
| `lms_courses` | 2 |
| `marketplace_orders` | 5 |
| `marketplace_products` | 8 |
| `master_data` | 453 |
| `tenants` | 1 |
| `users` | 1 |
| **Jumlah** | **561** |

Batas inventaris: hitungan ini mencakup 18 koleksi tingkat atas; subkoleksi dan objek Firebase Storage belum dihitung. Pemeriksaan skema metadata pada satu-satunya dokumen `users` menemukan field `email`, `role`, `status`, dan `tenantId`; tidak ada field `password` pada dokumen tersebut. Ini tidak memeriksa kredensial Firebase Authentication. Jangan migrasikan password atau hash autentikasi; buat akun Supabase melalui undangan/reset yang tepercaya.

Hitungan bukan persetujuan untuk import. Belum ada dokumen atau objek yang dipindahkan ke Supabase, dan tidak ada perubahan pada Firebase maupun Supabase Production. Tim backend tetap perlu memetakan setiap koleksi ke tenant dan tabel target, menjalankan preview/dry-run, merekonsiliasi selisih, serta memeriksa subkoleksi dan berkas sebelum import staging. Ulangi inventaris bila sumber berubah.

### Cakupan tenant pada data Firestore legacy — pemeriksaan 26 Oktober 2026

Pemeriksaan baca-saja berikut melengkapi inventaris jumlah dokumen di atas. Hanya keberadaan field dan label jenis record dihitung; nilai identitas pribadi tidak dicetak.

- Seluruh **453/453** dokumen `master_data` tidak memiliki field tingkat atas `tenantId`.
- Seluruh **50/50** dokumen `candidates` tidak memiliki field tingkat atas `tenantId`.
- Satu dokumen `users` memiliki `tenantId` yang cocok dengan ID dokumen atau field `id` pada satu-satunya dokumen `tenants`. Ini memberi calon tenant untuk verifikasi, tetapi bukan bukti bahwa semua record legacy pasti milik tenant itu.
- Distribusi `master_data.type` yang teramati: Alumni 50, Asatidz 50, Gedung 15, Guru 50, Halaqah 40, Kamar 50, Kampus 5, Kelas 30, Pegawai 50, Santri 50, Staff 2, System 1, Unit 10, dan Wali Santri 50.

**Gerbang migrasi:** jangan menulis `tenant_id` saat import hanya karena dokumen tidak memilikinya. Tim backend harus menyetujui pemetaan eksplisit sumber-ke-tenant, memeriksa apakah database sumber memang khusus satu pesantren, lalu menjalankan preview/dry-run yang menunjukkan hitungan per tipe, record yatim/duplikat, dan total yang akan ditulis. Tolak import bila ada record tanpa pemetaan atau tenant yang tidak dikenal. Jangan menyimpulkan kepemilikan dari nama, email, telepon, atau ID santri. Simpan hitungan dan checksum untuk rekonsiliasi tanpa menaruh PII di log. Rekam pemetaan yang disetujui sebagai konfigurasi migrasi berversi dan dapat diulang dengan aman.

Belum ada data yang diimpor atau diubah. Hasil ini tidak memeriksa subkoleksi maupun Firebase Storage.
