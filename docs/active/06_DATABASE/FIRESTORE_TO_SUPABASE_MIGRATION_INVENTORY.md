# Inventaris Migrasi Firestore ke Supabase

**Tanggal pemeriksaan:** 23 Oktober 2026  
**Status:** inventaris sumber; belum ada ekspor, dry-run terhadap data live, atau penulisan ke Supabase.

## Sumber yang ditetapkan

Konfigurasi aplikasi pada `firebase-applet-config.json` menunjuk project Firebase `graphite-ship-q5xj8` dan database Firestore:

`ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`

Database tersebut adalah sumber kanonis yang dipakai konfigurasi aplikasi saat ini. Dari tampilan daftar koleksi Firestore, terlihat 18 koleksi tingkat atas:

`candidates`, `cbt_config`, `cooperative_inventory`, `cooperative_suppliers`, `cooperative_transactions`, `cooperative_wallets`, `entityRecords`, `library_books`, `library_circulations`, `library_digital_assets`, `lms_assessments`, `lms_categories`, `lms_courses`, `marketplace_orders`, `marketplace_products`, `master_data`, `tenants`, dan `users`.

Pemilik proyek menyatakan seluruh data Firestore tersebut adalah data dummy. Inventaris ini hanya mencatat nama koleksi dan jalur pemetaan; isi dokumen tidak disalin ke repository atau dicantumkan di log.

### Database lain

Project yang sama memiliki database Firestore terpisah dengan ID app `ai-studio-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`. Database itu menampilkan lima koleksi tingkat atas, termasuk `cbt_questions`, sedangkan koleksi tersebut tidak tampak pada daftar database kanonis. Karena aplikasi menunjuk database bernama ERP4, database terpisah ini **tidak dimasukkan** ke sumber migrasi tanpa rekonsiliasi lebih lanjut. Kemunculan `cbt_questions` di sana tidak membuktikan bahwa itu bagian dari snapshot ERP kanonis.

Daftar tingkat atas belum menginventarisasi subkoleksi, file Firebase Storage, jumlah seluruh dokumen, atau bentuk skema lengkap. Nama koleksi yang tidak ditemukan pada daftar ini mungkin berada di subkoleksi, data lokal/browser, atau sumber lain.

## Pemetaan awal dan kesiapan importer

| Koleksi Firestore | Tujuan Supabase yang mungkin | Kesiapan jalur impor di source code |
|---|---|---|
| `candidates` | `candidates`, dan `candidate_documents` bila dokumen terpisah | Belum ditemukan importer snapshot PPDB. Alur penerimaan/onboarding bukan pengganti importer arsip. |
| `cbt_config` | `cbt_exams`, penugasan ujian, dan konfigurasi terkait | Belum ada pemetaan importer dari `cbt_config`. Importer bank soal yang ada mengharapkan `cbt_questions`, yang tidak tampak di database kanonis. |
| `cooperative_inventory` | `cooperative_products`, `cooperative_stock_movements` | Belum ditemukan importer batch; stok awal perlu direkonsiliasi dengan pergerakan stok. |
| `cooperative_suppliers` | `cooperative_suppliers` | Belum ditemukan importer batch. |
| `cooperative_transactions` | `cooperative_sales`, `cooperative_sale_items`, `cooperative_wallet_ledger`, serta pergerakan stok terkait | Belum ditemukan importer batch. Data transaksi perlu dipetakan urut waktu dan saldo harus cocok dengan ledger. |
| `cooperative_wallets` | `cooperative_wallets` | Belum ditemukan importer batch. Saldo tidak boleh dipindah tanpa rekonsiliasi transaksi dan ledger. |
| `entityRecords` | `students`, `guardians`, `guardian_students`, dan data referensi | Importer santri/wali tersedia. Perlu pengelompokan tipe record, relasi wali, tenant, dan deduplikasi identitas sebelum dijalankan. Import Tahfidz juga memakai snapshot santri untuk keanggotaan. |
| `library_books` | `library_books` | Runtime Supabase tersedia; importer arsip Firestore belum ditemukan. |
| `library_circulations` | `library_circulations` | Runtime Supabase tersedia; importer arsip belum ditemukan. Relasi buku dan santri harus sudah dipetakan terlebih dahulu. |
| `library_digital_assets` | Metadata dan/atau objek Supabase Storage | Belum ditemukan importer. Perlu inventarisasi isi dokumen dan objek Storage; URL lama tidak cukup untuk menyatakan file sudah berpindah. |
| `lms_assessments` | `lms_assignments` | Didukung importer katalog LMS yang ada, dengan pemeriksaan course dan pengajar. Pengumpulan siswa/progress tidak otomatis ikut dari koleksi ini. |
| `lms_categories` | `lms_categories` | Didukung importer katalog LMS. |
| `lms_courses` | `lms_courses`, `lms_course_modules`, `lms_materials` | Didukung importer katalog LMS; modul dan materi diambil dari struktur nested di data course. Berkas/media eksternal memerlukan pemindahan terpisah. |
| `marketplace_orders` | `marketplace_orders`, `marketplace_order_items`, event/pergerakan terkait | Didukung importer Marketplace yang ada, tetapi perlu pratinjau dan rekonsiliasi dependency produk, item, status, serta total. |
| `marketplace_products` | `marketplace_products` | Didukung importer Marketplace yang ada, termasuk pemeriksaan SKU unik. |
| `master_data` | `master_data_records`; record halaqah juga dapat menjadi `tahfidz_halaqahs` | Importer struktur Master Data dan konfigurasi Tahfidz tersedia untuk jenis record tertentu. Kategori/ID dan hubungan harus diverifikasi; importer Tahfidz belum memindahkan riwayat setoran. |
| `tenants` | `tenants`, `tenant_settings` | Import pengaturan tenant tersedia. Provisioning tenant/UUID dan pemetaan `legacy_tenant_key` harus diselaraskan terlebih dahulu; nested `settings/global` perlu ikut diekspor. |
| `users` | `profiles` dan undangan Supabase Auth | Tidak ada migrasi kata sandi. Profil dan role perlu rekonsiliasi; kredensial harus dibuat ulang lewat undangan/reset Supabase Auth. |

Pemetaan ini bersifat awal, bukan persetujuan untuk mengimpor setiap baris apa adanya. Importer yang ada adalah fungsi per domain dan sebagian memerlukan pratinjau bertanda fingerprint; belum ada satu exporter/importer lengkap yang membaca seluruh Firestore.

## Sumber yang dirujuk importer tetapi belum tampak sebagai koleksi tingkat atas kanonis

Pencarian source code menemukan importer atau jalur migrasi yang mengharapkan sumber seperti `academic_schedules`, `academic_journals`, `academic_assessments`, `cbt_questions`, data UKS (profil, kunjungan, dan obat), data fasilitas/GA, pemesanan fasilitas, data boarding, serta pengumuman komunikasi. Koleksi tersebut belum tampak pada daftar root database kanonis yang diperiksa. Sebelum modul-modul ini dipindahkan, tentukan apakah datanya berada di subkoleksi, browser, database terpisah, atau belum memiliki data sumber.

## Urutan kerja migrasi

1. **Snapshot sumber:** gunakan ekspor Firestore yang mempertahankan document ID, tipe timestamp/bytes, dan subkoleksi; simpan di lokasi sementara yang aksesnya dibatasi. Inventarisasi Storage secara terpisah. Metode ekspor yang tersedia untuk tier proyek ini belum diverifikasi.
2. **Hitung dan klasifikasikan:** buat jumlah dokumen per koleksi, tipe entity, subkoleksi, tenant, referensi, dokumen duplikat, dan record tanpa tenant. Simpan hasil agregat saja; jangan masukkan payload identitas ke log.
3. **Pastikan target Supabase:** verifikasi migrasi skema yang terpasang, data tenant, profil admin, serta satu pemetaan legacy tenant ke UUID tujuan. Jangan menebak UUID dari slug.
4. **Transformasi deterministik:** gunakan allowlist koleksi, migrasi per tenant, pemetaan ID eksplisit, enkripsi NIK/NISN melalui importer server, idempotency key/fingerprint, serta mode dry-run. Jangan membawa kata sandi atau session dari Firebase.
5. **Impor berdasarkan dependency:** tenant/profil dan referensi; Master Data santri/wali; PPDB dan modul operasional; transaksi/ledger; lalu file Storage. Batalkan batch yang mengalami konflik atau data yang tidak dapat dipetakan.
6. **Rekonsiliasi:** bandingkan jumlah sumber, siap, ditolak, duplikat, dan hasil tujuan; validasi foreign key, tenant ID wajib, total finansial, saldo/ledger, nomor unik, serta hash agregat. Jalankan uji akses tenant setelah impor.
7. **Cutover:** pertahankan snapshot sumber untuk rollback dan jangan menghapus Firebase sampai hasil Supabase disetujui serta backup restore teruji.

## Status saat ini

- Sumber kanonis ditetapkan dari konfigurasi aplikasi dan inventaris nama koleksi tingkat atas.
- Pengguna mengonfirmasi dataset Firestore adalah dummy.
- Belum ada ekspor atau penyalinan record/file ke lokal maupun Supabase.
- Belum ada hitungan lengkap, inspeksi subkoleksi/Storage, dry-run importer terhadap dataset, atau rekonsiliasi target Supabase.
- Database alternatif yang memuat `cbt_questions` belum digabungkan ke snapshot kanonis.
- PR cutover tetap draft; dokumentasi ini tidak menerapkan migrasi database atau mengubah runtime.
