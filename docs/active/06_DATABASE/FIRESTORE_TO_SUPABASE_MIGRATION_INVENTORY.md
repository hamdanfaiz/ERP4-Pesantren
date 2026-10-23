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

Inventaris baca-saja pada 23 Oktober 2026 menghitung dokumen tingkat atas dan nama field. Pemeriksaan `listCollectionIds` pada seluruh 561 dokumen root berhasil dan menemukan 0 subkoleksi. Karena itu, `tenants/{tenant}/settings/global` dan koleksi lain yang hanya dirujuk sebagai subkoleksi belum ada pada dokumen kanonis yang diperiksa. Konfigurasi app menunjuk bucket Firebase `graphite-ship-q5xj8.firebasestorage.app`; bucket itu menghasilkan HTTP 404 pada pemeriksaan metadata Cloud Storage dan tidak muncul pada daftar bucket project. Satu-satunya bucket yang terdaftar adalah bucket sumber Cloud Run dengan 0 objek. Tidak ada payload Storage yang dibaca; status bucket Firebase perlu dikonfirmasi dari Firebase Console jika memang dipakai. Struktur field bertingkat lengkap dan nilai dokumen juga belum dibaca.

## Pemetaan awal dan kesiapan importer

| Koleksi Firestore | Tujuan Supabase yang mungkin | Kesiapan jalur impor di source code |
|---|---|---|
| `candidates` | `candidates`, dan `candidate_documents` bila dokumen terpisah | Belum ditemukan importer snapshot PPDB. Alur penerimaan/onboarding bukan pengganti importer arsip. |
| `cbt_config` | `cbt_exams`, penugasan ujian, dan konfigurasi terkait | Belum ada pemetaan importer dari `cbt_config`. Importer bank soal yang ada mengharapkan `cbt_questions`, yang tidak tampak di database kanonis. |
| `cooperative_inventory` | `cooperative_products`, `cooperative_stock_movements` | Importer katalog preview-first tersedia: validasi SKU/harga/stok/tanggal, konflik, fingerprint, dan idempotency key. Stok awal serta pergerakannya dibuat atomik melalui RPC create produk. |
| `cooperative_suppliers` | `cooperative_suppliers` | Importer katalog tersedia. Migration `20261210000000_cooperative_supplier_import_status.sql` mempertahankan status aktif/nonaktif dan menolak status tak dikenal. |
| `cooperative_transactions` | `cooperative_sales`, `cooperative_sale_items`, `cooperative_wallet_ledger`, serta pergerakan stok terkait | Ditunda dari impor katalog sampai item dipetakan ke produk dan ledger direkonsiliasi secara kronologis. |
| `cooperative_wallets` | `cooperative_wallets` | Ditunda dari impor katalog; nama santri tidak cukup untuk pemetaan ID dan saldo harus direkonsiliasi dengan ledger. |
| `entityRecords` | `students`, `guardians`, `guardian_students`, dan data referensi | Importer santri/wali tersedia. Perlu pengelompokan tipe record, relasi wali, tenant, dan deduplikasi identitas sebelum dijalankan. Import Tahfidz juga memakai snapshot santri untuk keanggotaan. |
| `library_books` | `library_books` | Runtime Supabase tersedia; importer arsip Firestore belum ditemukan. |
| `library_circulations` | `library_circulations` | Runtime Supabase tersedia; importer arsip belum ditemukan. Relasi buku dan santri harus sudah dipetakan terlebih dahulu. |
| `library_digital_assets` | Metadata dan/atau objek Supabase Storage | Belum ditemukan importer. Bucket Firebase yang dikonfigurasi tidak ditemukan pada pemeriksaan Cloud Storage; perlu pastikan apakah record hanya menyimpan URL eksternal atau bucket perlu diprovisikan. URL lama tidak cukup untuk menyatakan file sudah berpindah. |
| `lms_assessments` | `lms_assignments` | Importer katalog LMS tersedia dan kini memakai snapshot tenant-scoped dengan audit ownership. Pengumpulan siswa/progress tidak otomatis ikut dari koleksi ini. |
| `lms_categories` | `lms_categories` | Importer katalog LMS tersedia dan kini menampilkan audit ownership untuk record tenantless. |
| `lms_courses` | `lms_courses`, `lms_course_modules`, `lms_materials` | Importer katalog LMS tersedia; modul/materi diambil dari struktur nested dan snapshot kini di-scope lewat registry tenant. Berkas/media eksternal memerlukan pemindahan terpisah. |
| `marketplace_orders` | `marketplace_orders`, `marketplace_order_items`, event/pergerakan terkait | Importer Marketplace tersedia dan kini membaca snapshot tenant-scoped. Arsip hanya menyimpan angka jumlah item, bukan detail baris; jangan membuat `marketplace_order_items` sintetis. Rekonsiliasi status dan total tetap diperlukan. |
| `marketplace_products` | `marketplace_products` | Importer Marketplace tersedia, memakai audit ownership dan pemeriksaan SKU unik. Field gambar berupa label/URL; tidak ada bucket Firebase yang dapat dibaca untuk memindahkan objek. |
| `master_data` | `master_data_records`; record halaqah juga dapat menjadi `tahfidz_halaqahs` | Importer struktur Master Data dan konfigurasi Tahfidz tersedia untuk jenis record tertentu. Kategori/ID dan hubungan harus diverifikasi; importer Tahfidz belum memindahkan riwayat setoran. |
| `tenants` | `tenants`, `tenant_settings` | Import pengaturan tenant tersedia. Provisioning tenant/UUID dan pemetaan `legacy_tenant_key` harus diselaraskan terlebih dahulu. Pemeriksaan subkoleksi tidak menemukan `tenants/{tenant}/settings/global`; sumber konfigurasi itu belum tersedia di database kanonis yang diperiksa. |
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

- Sumber kanonis tetap database Firestore bernama ERP4 pada project `graphite-ship-q5xj8`.
- Pemilik proyek menyatakan dataset Firestore adalah data dummy. Pembacaan di bawah hanya menghasilkan hitungan dan nama field; nilai dokumen tidak dicetak, disimpan, atau disalin ke repository.
- Pada 23 Oktober 2026, ADC berhasil dipakai untuk inventaris baca-saja REST Firestore. Ditemukan 18 koleksi root dan 561 dokumen:

| Koleksi | Dokumen | Memiliki `tenantId` |
|---|---:|---:|
| `candidates` | 50 | 0 |
| `cbt_config` | 1 | 0 |
| `cooperative_inventory` | 6 | 0 |
| `cooperative_suppliers` | 3 | 0 |
| `cooperative_transactions` | 3 | 0 |
| `cooperative_wallets` | 3 | 0 |
| `entityRecords` | 14 | 0 |
| `library_books` | 4 | 0 |
| `library_circulations` | 1 | 0 |
| `library_digital_assets` | 4 | 0 |
| `lms_assessments` | 1 | 0 |
| `lms_categories` | 1 | 0 |
| `lms_courses` | 2 | 0 |
| `marketplace_orders` | 5 | 0 |
| `marketplace_products` | 8 | 0 |
| `master_data` | 453 | 0 |
| `tenants` | 1 | — |
| `users` | 1 | 1 |

  Totalnya 560 dokumen di luar registry tenant; 559 dokumen operasional tidak mempunyai `tenantId`. Satu dokumen `tenants` adalah registry tenant sehingga tidak diharapkan memiliki `tenantId` yang menunjuk dirinya sendiri. Satu profil pada `users` memiliki `tenantId=pesantren-digital`, sesuai kunci dokumen tenant sumber.

### Struktur data yang diamati (tanpa nilai dokumen)

Pemeriksaan skema membaca nama field dan tipe Firestore, tanpa mencetak atau menyimpan nilai pribadi:

- `master_data` (453 dokumen) memakai 13 kategori: Active Role 3, Active Unit 10, Alumni 50, Asatidz 50, Gedung 15, Guru 50, Halaqah 40, Kamar 50, Kampus 5, Kelas 30, Pegawai 50, Santri 50, dan Wali Santri 50.
- `entityRecords` (14 dokumen) terbagi menjadi 7 Santri dan 7 Wali Santri. `master_data` juga memiliki masing-masing 50 Santri dan Wali Santri. Kedua sumber berpotensi berisi identitas yang sama; jangan menggabungkannya berdasarkan nama saja. Rekonsiliasi memakai ID sumber, NIS/NISN/NIK yang telah diproses secara aman, dan relasi wali diperlukan.
- `candidates` (50 dokumen) memiliki tahap: Registered 9, Document Review 11, Entry Exam 6, Interview 7, Accepted 8, Rejected 9. `examSlot`, `interviewSlot`, dan `score` berisi null pada sebagian record; importer harus mempertahankan null secara eksplisit.
- Field bernama `nik`/`nisn` ditemukan di `candidates`, `entityRecords`, dan `master_data`. Jangan tulis nilainya ke log atau fingerprint yang dapat dibaca klien; transformasi ke kolom terenkripsi harus berlangsung di server.
- Field tanggal yang diamati, termasuk `dateApplied`, `dob`, `createdAt`, `updatedAt`, dan `date`, tersimpan sebagai string pada koleksi yang diperiksa, bukan sebagai Firestore timestamp. Parsing/normalisasi format harus eksplisit; jangan mengandalkan cast otomatis.
- `cooperative_transactions.items` adalah array berisi objek `name`, `price`, dan `qty` (4 item detail pada 3 transaksi). Saldo wallet dan total transaksi adalah angka; migrasi harus mencocokkan detail item, total, dan saldo.
- `marketplace_orders.items` adalah angka jumlah item pada kelima order, bukan array detail baris. Dengan sumber ini, `marketplace_order_items` tidak dapat direkonstruksi; jangan membuat baris order sintetis.
- `lms_courses.modules` menyimpan array modul dan materi bertingkat; hanya satu modul beserta satu materi teramati pada snapshot ini. Relasi course, module, dan material perlu mempertahankan ID sumber.
- `users` hanya memiliki field profil `email`, `role`, `status`, dan `tenantId`; field password tidak ditemukan pada dokumen profil ini. Ini tidak mencakup kredensial Firebase Auth.

- Pemeriksaan agregat khusus Tahfidz menemukan 40 record kategori Halaqah pada `master_data` dan 7 record tipe Santri pada `entityRecords`; semua record yang relevan itu tidak memiliki `tenantId`.
- Importer Tahfidz, Marketplace, dan LMS kini membaca snapshot terbatas, lalu memakai registry Firestore dan `scopeLegacyTenantRecords` untuk mengaudit tenant explicit/tenantless. Preview LMS/Marketplace dapat memakai satu-satunya tenant sumber ketika mapping target belum tersedia, tetapi `canApply=false`; apply memerlukan mapping target dan konfirmasi kunci tenant sumber. Importer Akademik, CBT, UKS, GA, peminjaman fasilitas, Boarding, dan Komunikasi masih menggunakan filter `tenantId` langsung; koleksi sumbernya tidak terlihat di root kanonis dan beberapa memang belum tersedia. Jangan apply modul tersebut sebelum loader/ownership-nya diperbaiki serta sumbernya dibuktikan.
- Route migrasi Tahfidz pada PR ini sekarang membaca snapshot terbatas, hanya memilih record Halaqah/Santri, dan mengaudit `tenantId`. Record tanpa tenant dapat dipetakan **dalam memori untuk preview** hanya jika registry Firestore berisi tepat satu tenant yang cocok dengan kunci sumber. Jika `legacy_tenant_key` Supabase kosong, preview dapat memakai satu-satunya kunci sumber tetapi memberi `canApply=false`. Apply memerlukan mapping tersimpan, fingerprint terbaru, dan konfirmasi tenantless ownership yang sama dengan kunci sumber. Jika registry ambigu atau ada tenant field yang invalid, apply diblokir.
- Pemeriksaan Supabase baca-saja sebelumnya melihat tenant dengan slug `pesantren-digital`, tetapi `legacy_tenant_key` masih `NULL`. Belum ada preview Tahfidz terhadap target Supabase live/non-produksi dan belum ada apply.
- Ref Supabase pada `supabase/config.toml` adalah `ptsasgdvgrbdtgyqieie`, tetapi check Supabase Preview PR masih terhubung ke project lama `vqemuyzveuirlkvdggjd` dan dilewati karena branch PR belum terkait dengan Supabase Branch. Belum ada validasi preview dari project yang dituju; integrasi branch harus diarahkan ke ref `ptsasgdvgrbdtgyqieie` sebelum menganggap deployment/preview terhubung.
- Belum ada ekspor Firestore, pembacaan isi subkoleksi (metadata seluruh 561 dokumen sudah diperiksa dan tidak ditemukan), pembacaan payload Firebase Storage, dry-run seluruh importer terhadap dataset, maupun penulisan ke Supabase. Bucket Firebase yang dikonfigurasi tidak terlihat/terbentuk pada listing Cloud Storage; bucket Cloud Run yang terlihat berisi 0 objek.
- Database alternatif yang memuat `cbt_questions` belum direkonsiliasi dengan sumber kanonis.
- PR cutover tetap draft; perubahan ini tidak menerapkan migrasi database atau mengubah runtime produksi.

## Jalur migrasi server-side yang sudah tersedia

Source PR #13 memiliki endpoint per modul di `server.ts` yang membaca Firestore melalui Firebase Admin. Tahfidz, Marketplace, dan LMS memakai snapshot terbatas dan audit ownership berbasis registry tenant; importer lain yang didukung masih memfilter `tenantId` secara langsung. Ekspor GCS tidak wajib untuk koleksi yang didukung, tetapi source collections yang tidak ditemukan tetap memerlukan rekonsiliasi.

| Domain | Endpoint | Koleksi sumber yang dibaca |
|---|---|---|
| Akademik | `POST /api/academic/legacy/import` | `academic_schedules`, `academic_journals`, `academic_assessments` |
| CBT | `POST /api/cbt/legacy/import` | `cbt_questions` |
| UKS | `POST /api/healthcare/legacy/import` | `healthcare_records`, `healthcare_visits`, `healthcare_inventory` |
| GA | `POST /api/ga/legacy/import` | `ga_facilities`, `ga_inventory` |
| Marketplace | `POST /api/marketplace/legacy/import` | `marketplace_products`, `marketplace_orders` |
| Peminjaman fasilitas | `POST /api/facility-bookings/legacy/import` | `facility_bookings` |
| LMS | `POST /api/lms/legacy/import` | `lms_categories`, `lms_courses`, `lms_assessments` |
| Boarding | `POST /api/boarding/permits/migrate` | `boarding_permits` |
| Boarding | `POST /api/boarding/discipline/migrate` | `boarding_discipline` |
| Boarding | `POST /api/boarding/attendance/migrate` | `boarding_attendance` |
| Boarding | `POST /api/boarding/facility-ops/migrate` | `boarding_audits`, `boarding_tickets` |
| Tahfidz | `POST /api/tahfidz/migration` | `master_data` kategori Halaqah dan `entityRecords` tipe Santri |
| Koperasi | `POST /api/cooperative/legacy/catalog-import` | empat koleksi Koperasi; hanya katalog diterapkan, wallet/transaksi ditandai deferred |
| Komunikasi | `POST /api/communication/announcements/migrate` | `communication_announcements` |
| Pengaturan tenant | `POST /api/system/settings/migrate` | `tenants/{tenant}/settings/global` |

Endpoint migrasi memerlukan sesi Supabase yang terautentikasi dan otorisasi Admin sesuai domain. Setiap jalur apply dikendalikan feature flag `SUPABASE_*_IMPORT_ENABLED`; Firebase Admin hanya diizinkan saat `NODE_ENV=development` dan `LEGACY_FIREBASE_ADMIN_ENABLED=true`. SDK memakai Application Default Credentials, bukan private key yang disimpan di source code. Importer yang sudah ada menerapkan batas ukuran, pratinjau/fingerprint, dan penolakan konflik untuk domain tertentu.

Jalur tersebut belum mencakup seluruh koleksi kanonis. Katalog inventory/pemasok Koperasi kini memiliki tahap impor bertahap; wallet/sales/ledger tetap deferred sampai rekonsiliasi identitas santri dan transaksi selesai. Sirkulasi/aset digital perpustakaan, root `candidates`, dan `users` masih memerlukan importer penuh. Ada mismatch sumber penting: rute CBT mengharapkan `cbt_questions`, sedangkan koleksi itu hanya terlihat di database Firestore terpisah yang tidak dikonfigurasi aplikasi. Endpoint Akademik, UKS, GA, peminjaman fasilitas, boarding, dan komunikasi merujuk koleksi yang tidak tampak di root kanonis; keberadaan pada subkoleksi atau sumber lain belum diverifikasi.

## Batas akses yang teramati dan langkah pembuka

Halaman Import/Export Google Cloud untuk database kanonis masih menonaktifkan tombol Import dan Export pada sesi Starter Tier. Namun, ADC dengan scope `cloud-platform` kini berhasil mengambil token dan Firestore REST API berhasil dipakai untuk membaca ID koleksi, jumlah dokumen, serta nama field tingkat atas. Tidak ada ekspor atau operasi tulis yang dijalankan. ADC tersimpan di konfigurasi sementara di luar direktori repository; jangan menyalin file kredensial itu ke repository atau chat.

Pemeriksaan metadata seluruh 561 dokumen root tidak menemukan subkoleksi pada database kanonis. Bucket Firebase yang dikonfigurasi mengembalikan HTTP 404; payload Storage belum diperiksa. Route Tahfidz, LMS, dan Marketplace mempunyai pemeriksaan ownership tenantless untuk preview; importer domain lain belum menangani 559 record tenantless. Langkah berikutnya:

1. Tetapkan `legacy_tenant_key=pesantren-digital` pada tenant tujuan di environment non-produksi, lalu jalankan preview Tahfidz dan periksa hitungan, konflik santri/halaqah, serta fingerprint. Apply tetap memerlukan konfirmasi eksplisit dan tidak dijalankan di production.
2. Terapkan loader dan audit ownership yang setara ke importer Akademik, CBT, UKS, GA, peminjaman fasilitas, Boarding, dan Komunikasi; preview harus menghitung record tenantless/mismatch dan memblokir apply jika ownership tidak lengkap. Marketplace dan LMS sudah memakai pola ini.
3. Bangun importer untuk koleksi root yang belum didukung (PPDB kandidat, koperasi, perpustakaan, serta profil pengguna) dengan validasi relasi dan rekonsiliasi transaksi.
4. Konfirmasi provisioning bucket Firebase melalui Firebase Console; bucket konfigurasi saat ini mengembalikan 404. Jika tersedia, inventarisasi object metadata/bytes tanpa menyalin isi sebelum merencanakan migrasi. Subkoleksi telah diperiksa pada seluruh dokumen root dan tidak ditemukan.

Sampai preview per domain dan mapping Supabase diverifikasi, tidak ada perubahan data produksi.

Jangan mengaktifkan feature flag import di production, jangan mengirim service-account key atau token lewat chat, dan jangan menghapus Firebase sebelum backup serta proses restore Supabase diuji.

### Audit logic kalender bisnis — 23 Oktober 2026

Checkout Koperasi kini memvalidasi dan memakai `tenants.time_zone` untuk menentukan transaksi yang masuk ke batas belanja harian; dashboard dan waktu riwayat juga memakai kalender tenant. Migration `20261209000000_cooperative_tenant_business_day.sql` dan tes pgTAP transaksional tersedia pada branch pengembangan. Helper tanggal bisnis juga dipakai pada checkout/pengembalian Library agar hasil antarperangkat konsisten.

Validasi lokal: 12 kasus helper tanggal bisnis, lint, dan build lulus. pgTAP harus lulus di CI/test stack terisolasi sebelum migration diterapkan. Perubahan ini tidak mengimpor atau mengubah data Supabase live dan tidak menyelesaikan rekonsiliasi 4 buku/1 sirkulasi Library maupun 6 inventory/3 pemasok/3 transaksi/3 wallet Koperasi dari arsip Firebase.


### Tahap katalog Koperasi — 23 Oktober 2026

Endpoint Admin `POST /api/cooperative/legacy/catalog-import` menyediakan preview dan apply dengan feature flag server yang default-nya mati. Snapshot fingerprint mencakup koleksi produk, pemasok, wallet, dan transaksi; apply memvalidasi ulang fingerprint dan menolak konflik atau record malformed. Request ID deterministik memungkinkan pemulihan impor parsial tanpa menggandakan catatan. Tahap ini hanya mengimpor produk, stok awal atomik, serta pemasok; wallet, transaksi, dan ledger tetap ditunda agar tidak membuat saldo atau relasi santri semu. Tes unit preview lulus lokal. Migration `20261210000000` dan pgTAP untuk mempertahankan status pemasok perlu lulus CI sebelum dianggap tervalidasi; production tidak disentuh.

### Riwayat sirkulasi Perpustakaan: importer bertahap

Importer Admin-only POST /api/library/circulations/legacy/import menyediakan pratinjau dan apply untuk library_circulations, dengan feature flag terpisah SUPABASE_LIBRARY_CIRCULATIONS_IMPORT_ENABLED=false. Pembacaan arsip dibatasi oleh tenant registry Firestore; seluruh pemetaan dan validasi dilakukan ulang saat apply dan fingerprint snapshot harus sama dengan pratinjau.

Setiap pinjaman harus terhubung ke buku yang diimpor melalui HMAC document ID dan ke santri yang dipilih secara eksplisit dari roster tenant. Nama santri atau judul buku tidak pernah menjadi kunci pencocokan otomatis. Tanggal hanya menerima ISO calendar date; status harus didukung; peminjaman aktif tidak boleh memiliki tanggal kembali; transaksi dikembalikan wajib memiliki tanggal kembali; denda selain nol atau field denda yang hilang ditahan untuk rekonsiliasi Finance. Perbedaan nama juga memblokir apply untuk pemeriksaan identitas.

Migration 20261211000000_library_circulation_legacy_import.sql menambahkan fingerprint sumber immutable, audit batch, serta RPC atomik yang memeriksa Admin aktif, foreign key tenant, benturan source ID, retry idempoten, dan jumlah peminjaman aktif terhadap jumlah eksemplar di bawah row lock. RPC hanya dapat dijalankan service role. Unit preview dan pgTAP mencakup pemetaan, konflik tenant, retry, data berubah, kapasitas eksemplar, dan status pengembalian. Lint, build, dan 14 kasus preview lulus lokal; pgTAP dan CI menunggu run branch. Tidak ada migration atau data production yang diterapkan.

Data sumber yang terinventarisasi hanya satu record peminjaman dan field peminjam berupa teks; tidak ditemukan ID santri atau tanggal kembali pada bentuk dokumen. Karena itu apply tetap akan ditahan sampai pratinjau aktual menyelesaikan pemetaan/konflik tersebut. Runtime dan kedua flag impor tetap mati.
