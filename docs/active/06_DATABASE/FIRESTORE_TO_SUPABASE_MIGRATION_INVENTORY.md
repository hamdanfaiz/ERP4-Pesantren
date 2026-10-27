# Inventaris Migrasi Firestore ke Supabase

**Tanggal pemeriksaan:** 23 Oktober 2026  
**Status:** inventaris sumber; belum ada ekspor, dry-run terhadap data live, atau penulisan ke Supabase.

> **Keputusan pemilik produk — 27 Oktober 2026:** data Firestore yang tercantum di sini adalah data dummy dan tidak perlu disalin ke Supabase. Inventaris dan importer di bawah disimpan untuk referensi historis serta uji sintetis; keduanya bukan gerbang kelengkapan maupun deploy. Prioritas pengembangan adalah logika aplikasi, relasi/constraint database, transaksi, serta isolasi tenant dan role. Data contoh boleh dibuat ulang manual setelah fungsi stabil. Jangan mengimpor arsip hanya untuk menyamakan jumlah atau menghapus baris staging.

> Catatan pembaruan: hitungan dan struktur sumber di bawah adalah snapshot 23 Oktober. Status source code pada tabel pemetaan diperbarui mengikuti implementasi terbaru; rekonsiliasi dan syarat data per jalur dicatat pada bagian **Rekonsiliasi status importer — 26 Oktober 2026** di bagian akhir dokumen. Ketersediaan importer tidak berarti data sudah diterapkan.

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
| `candidates` | `candidates`, dan `candidate_documents` bila dokumen terpisah | Importer PPDB preview/apply tersedia di `POST /api/ppdb/legacy/import`; penerapan tetap dibatasi flag, pemeriksaan tenant, fingerprint, dan rekonsiliasi hasil preview. |
| `cbt_config` | `cbt_tenant_settings` | Importer konfigurasi kini memiliki pratinjau/apply dengan pemetaan document ID ke `legacy_tenant_key`, fingerprint HMAC, validasi ketat, retry aman, dan penolakan overwrite. `autoGrading=false` ditahan karena runtime Supabase belum mendukung penilaian manual. Koleksi `cbt_questions` tidak tampak pada database kanonis, jadi bank soal tidak ikut terimpor. |
| `cooperative_inventory` | `cooperative_products`, `cooperative_stock_movements` | Importer katalog preview-first tersedia: validasi SKU/harga/stok/tanggal, konflik, fingerprint, dan idempotency key. Stok awal serta pergerakannya dibuat atomik melalui RPC create produk. |
| `cooperative_suppliers` | `cooperative_suppliers` | Importer katalog tersedia. Migration `20261210000000_cooperative_supplier_import_status.sql` mempertahankan status aktif/nonaktif dan menolak status tak dikenal. |
| `cooperative_transactions` | `cooperative_sales`, `cooperative_sale_items`, `cooperative_wallet_ledger`, serta pergerakan stok terkait | Ditunda dari impor katalog sampai item dipetakan ke produk dan ledger direkonsiliasi secara kronologis. |
| `cooperative_wallets` | `cooperative_wallets` | Ditunda dari impor katalog; nama santri tidak cukup untuk pemetaan ID dan saldo harus direkonsiliasi dengan ledger. |
| `entityRecords` | `students`, `guardians`, `guardian_students`, dan data referensi | Importer santri/wali tersedia. Perlu pengelompokan tipe record, relasi wali, tenant, dan deduplikasi identitas sebelum dijalankan. Import Tahfidz juga memakai snapshot santri untuk keanggotaan. |
| `library_books` | `library_books` | Importer preview/apply Admin tersedia; pemetaan tenant, konflik ISBN, backup, dan staging wajib diperiksa sebelum apply. |
| `library_circulations` | `library_circulations` | Importer preview/apply Admin tersedia; relasi buku dan santri harus dipetakan eksplisit dan kapasitas eksemplar diverifikasi. |
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
- Konfigurasi `cbt_config` dipetakan ke tabel tenant `cbt_tenant_settings` lewat migration `20270114000000_cbt_tenant_settings_import.sql`. Jalur impor hanya menerima satu dokumen yang ID-nya sama persis dengan `legacy_tenant_key`; preview tidak mengungkap isi konfigurasi. Nilai dengan penilaian manual, field tak dikenal, daftar duplikat, atau skor di luar batas diblokir. Hasil impor menjadi default subjek, jenjang, paket, dan poin pada form CBT; runtime tetap menghitung nilai otomatis.
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

Jalur tersebut belum mencakup seluruh koleksi kanonis. Importer kandidat PPDB, katalog dan sirkulasi Perpustakaan, serta konfigurasi CBT tersedia, tetapi belum ada bukti apply ke target. Wallet/sales/ledger Koperasi masih menunggu rekonsiliasi identitas santri dan transaksi; aset digital belum memiliki migrasi byte ke Storage; `users` belum memiliki importer profil yang menyelesaikan tautan akun Supabase Auth. Ada mismatch sumber penting: rute CBT soal mengharapkan `cbt_questions`, sedangkan koleksi itu hanya terlihat di database Firestore terpisah yang tidak dikonfigurasi aplikasi. Endpoint Akademik, UKS, GA, peminjaman fasilitas, boarding, dan komunikasi merujuk koleksi yang tidak tampak di root kanonis; keberadaan pada subkoleksi atau sumber lain belum diverifikasi.

## Batas akses yang teramati dan gerbang migrasi

Halaman Import/Export Google Cloud untuk database kanonis masih menonaktifkan tombol Import dan Export pada sesi Starter Tier. Namun, ADC dengan scope `cloud-platform` kini berhasil mengambil token dan Firestore REST API berhasil dipakai untuk membaca ID koleksi, jumlah dokumen, serta nama field tingkat atas. Tidak ada ekspor atau operasi tulis yang dijalankan. ADC tersimpan di konfigurasi sementara di luar direktori repository; jangan menyalin file kredensial itu ke repository atau chat.

Pemeriksaan metadata seluruh 561 dokumen root pada 23 Oktober tidak menemukan subkoleksi pada database kanonis. Bucket Firebase yang dikonfigurasi mengembalikan HTTP 404; payload Storage belum diperiksa. Pemeriksaan awal saat itu menemukan audit ownership tenantless di Tahfidz, LMS, dan Marketplace. Setelahnya, sejumlah importer menerima hardening tenant dan jalur khusus; temuan 23 Oktober tersebut bukan status lengkap coverage saat ini. Terapkan pemeriksaan per endpoint—jangan menyimpulkan semua dari satu helper atau jumlah 559 record tanpa `tenantId`.

1. Tetapkan `legacy_tenant_key` pada tenant tujuan di environment non-produksi, lalu jalankan preview masing-masing importer. Periksa jumlah, konflik, pemetaan identitas, fingerprint, dan `canApply`; apply tetap menunggu rekonsiliasi serta persetujuan operator.
2. Pastikan setiap endpoint memvalidasi tenant sumber, target, dan record yang tenantless/malformed secara eksplisit. Jangan mengaktifkan flag produksi sebagai pengganti rehearsal staging.
3. Prioritaskan jalur yang masih belum lengkap: pemetaan profil ke akun Auth Supabase, migrasi byte aset digital, dan sumber operasional yang tidak ditemukan pada database kanonis. Untuk keuangan Koperasi, cocokkan wallet, produk, saldo, ledger, dan tanggal bisnis.
4. Konfirmasi provisioning bucket Firebase melalui Firebase Console. Jika tersedia, inventarisasi metadata dan akses objek; jangan anggap URL atau dokumen metadata sebagai bukti bahwa file dapat dipulihkan. Subkoleksi tetap tidak ditemukan dalam snapshot 23 Oktober.

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

Migration 20261211000000_library_circulation_legacy_import.sql menambahkan fingerprint sumber immutable, audit batch, serta RPC atomik yang memeriksa Admin aktif, foreign key tenant, benturan source ID, retry idempoten, dan jumlah peminjaman aktif terhadap jumlah eksemplar di bawah row lock. RPC hanya dapat dijalankan service role. Unit preview dan pgTAP mencakup pemetaan, konflik tenant, retry, data berubah, kapasitas eksemplar, dan status pengembalian. Lint dan build lokal lulus; 14 kasus preview lulus. Seluruh CI pada head 849809a6a9988734aadfb87236edb12bb973360a lulus ([run 39923084482](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/39923084482)), termasuk migration/pgTAP, NIS concurrency, auth/tenant, Finance Storage, Docker/Compose, dan backup/restore. Tidak ada migration atau data production yang diterapkan.

Data sumber yang terinventarisasi hanya satu record peminjaman dan field peminjam berupa teks; tidak ditemukan ID santri atau tanggal kembali pada bentuk dokumen. Karena itu apply tetap akan ditahan sampai pratinjau aktual menyelesaikan pemetaan/konflik tersebut. Runtime dan kedua flag impor tetap mati.


## Perkembangan jalur impor setelah inventaris awal — 25 Oktober 2026

Tabel kesiapan di atas adalah snapshot awal. Pembaruan berikut mencatat implementasi yang masuk ke branch setelah inventaris tersebut; ini tidak berarti data live sudah diimpor.

| Sumber | Status kode terbaru | Status data |
| --- | --- | --- |
| `cooperative_inventory`, `cooperative_suppliers` | Preview dan apply katalog tersedia dengan validasi, fingerprint, konflik, dan RPC atomik. | Feature flag tetap mati; data contoh belum diterapkan. |
| `cooperative_wallets`, `cooperative_transactions` | Preview/apply finansial tersedia. Setiap dompet harus dipetakan eksplisit ke dompet tenant, setiap baris transaksi ke produk, serta saldo pembuka harus direkonsiliasi. HPP yang tidak ada tetap unknown; penjualan arsip tidak mengurangi stok saat ini. | Apply belum dijalankan; diperlukan pemeriksaan ulang arsip dan persetujuan operator. |
| `library_books` | Importer preview/apply untuk katalog tersedia; peringatan ISBN ditampilkan dan snapshot diikat ke fingerprint. | Perlu cek status migration pada target sebelum apply; belum ada apply yang dibuktikan pada catatan ini. |
| `library_circulations` | Importer preview/apply tersedia melalui migration `20261211000000_library_circulation_legacy_import.sql`, dengan pemetaan eksplisit santri/buku dan pemeriksaan kapasitas. | Peminjam dari arsip ini belum memiliki relasi santri yang terverifikasi; belum layak diterapkan. |
| `library_digital_assets` | Belum ada pemindahan objek Storage. | Empat dokumen metadata tidak membuktikan keberadaan byte file. Bucket Firebase yang dikonfigurasi belum ditemukan; perlu pulihkan/verifikasi sumber file sebelum migrasi aset. |
| `users` | Tidak mengimpor kata sandi atau sesi Firebase. Profil hanya dapat diprovisikan terhadap akun Auth Supabase yang dibuat melalui alur undangan/administrasi tepercaya. | Hubungan profil, role, tenant, dan akun Auth perlu rekonsiliasi; tidak ada credential yang dapat dipulihkan dari dokumen profil Firestore. |

Koreksi tersebut dicakup CI pada head `e1a83c84f39f9b6e0dee3d54be36dbb60bf9ef64`, [run 40149247360](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40149247360): migrasi/pgTAP lokal, preview import, API tenant isolation, Firebase production guard, Docker, Storage, dan backup/restore lulus.

Hitungan arsip tetap snapshot 23 Oktober: 561 dokumen root pada sumber. Implementasi importer atau CI tidak mengubahnya dan bukan bukti bahwa data sudah ditulis ke Supabase. Tidak ada importer Storage yang lengkap, akun Auth yang dibuat, atau apply Koperasi/sirkulasi yang dijalankan pada pembaruan ini.


## Rekonsiliasi status importer — 26 Oktober 2026

Bagian ini memperbarui status **source code** setelah pemeriksaan endpoint pada head kode PR #13 `94daa10850d67dea54935bbeafd4083791926306`. Koreksi dokumentasi terbaru tercatat pada commit `9754b9cb2f4c4771ee126b7752fe07f9b8c4c808`. Ini tidak mengubah hasil inventaris sumber 23 Oktober dan tidak membuktikan ada data yang sudah dipindahkan.

| Data sumber | Status implementasi terbaru | Syarat dan bukti yang masih diperlukan |
| --- | --- | --- |
| `candidates` (PPDB) | Endpoint `POST /api/ppdb/legacy/import` mendukung preview/apply. Preview mengikat snapshot dengan fingerprint, memeriksa registry tenant dari dokumen `users`, dan meminta konfirmasi tenant sumber serta format tanggal. | Feature flag `SUPABASE_PPDB_IMPORT_ENABLED` tetap harus diaktifkan secara sadar di environment migrasi. Belum ada apply yang dibuktikan; rekonsiliasi hasil preview dan pemeriksaan target tetap wajib. |
| `library_books` | Endpoint Admin `POST /api/library/legacy/import` mendukung preview/apply dengan fingerprint sumber. | Flag `SUPABASE_LIBRARY_IMPORT_ENABLED` harus tetap mati sampai backup, staging, migrasi skema, konflik ISBN, dan pemetaan tenant tervalidasi. Belum ada apply yang dibuktikan. |
| `library_circulations` | Endpoint Admin `POST /api/library/circulations/legacy/import` mendukung preview/apply. Relasi buku dan santri harus dipetakan eksplisit; RPC migration `20261211000000_library_circulation_legacy_import.sql` memeriksa idempotensi, tenant, dan kapasitas eksemplar. | Flag `SUPABASE_LIBRARY_CIRCULATIONS_IMPORT_ENABLED` harus tetap mati sampai preview aktual dan pemetaan peminjam direkonsiliasi. Belum ada apply yang dibuktikan. |
| Katalog `cooperative_inventory` dan `cooperative_suppliers` | Endpoint `POST /api/cooperative/legacy/catalog-import` menyediakan preview/apply dan mengikat penerapan ke fingerprint; produk, pemasok, dan stok awal diterapkan melalui alur atomik. | `SUPABASE_COOPERATIVE_IMPORT_ENABLED` tetap mati. Sebelum apply, periksa duplikasi, harga/stok, status pemasok, tenant, dan hasil rekonsiliasi pada staging. |
| Riwayat finansial `cooperative_wallets` dan `cooperative_transactions` | Endpoint `.../financial-import/preview` tersedia; endpoint `.../financial-import/apply` terpisah dan memerlukan `SUPABASE_COOPERATIVE_IMPORT_ENABLED=true`, `SUPABASE_COOPERATIVE_FINANCIAL_IMPORT_APPLY_ENABLED=true`, pemetaan eksplisit, fingerprint, pemindaian riwayat lengkap, serta konfirmasi rekonsiliasi. | Jangan aktifkan flag apply sebelum saldo pembuka, transaksi, wallet, produk, dan tanggal bisnis cocok pada backup staging. HPP yang hilang tidak direka. Belum ada apply yang dibuktikan. |
| `users` → `profiles` / Supabase Auth | Belum ada importer profil/tautan akun yang menyelesaikan pemetaan Auth secara penuh. | Buat atau undang akun lewat alur Auth tepercaya; cocokkan UID, tenant, role, status, dan relasi secara eksplisit. Jangan memindahkan kata sandi, session, atau mencocokkan hanya berdasarkan nama/email. |
| `library_digital_assets` | Belum ada pemindahan byte file ke Supabase Storage. | Bucket Firebase yang dikonfigurasi tidak ditemukan pada pemeriksaan metadata. Empat dokumen metadata bukan bukti bahwa file dapat diunduh. Verifikasi sumber file dan aksesnya terlebih dahulu. |
| `cbt_config` / `cbt_questions` | Importer pengaturan `cbt_config` tersedia melalui `POST /api/cbt/legacy/settings-import` dengan preview/apply, pemetaan document ID ke `legacy_tenant_key`, fingerprint HMAC, validasi ketat, retry aman, dan penolakan overwrite. Importer bank soal mengharapkan `cbt_questions`, yang tidak tampak pada database Firestore kanonis aplikasi. | Apply pengaturan tetap memerlukan flag migrasi dan pemeriksaan target; rekonsiliasi database sumber diperlukan sebelum menganggap bank soal tersedia. `autoGrading=false` ditahan karena runtime belum mendukung penilaian manual. |

Untuk endpoint yang memakai `readLegacyFirestoreTenantRows`, helper memverifikasi registry `tenants` dan menerima record tanpa tenant hanya bila registry berisi tepat satu tenant dengan document ID yang sama dengan `legacyTenantKey` yang dikonfigurasi. `tenantId` dan `tenant_id` yang bertentangan, nilai tenant malformed, tenantless yang ambigu, serta record dari tenant lain tidak boleh diterapkan. Ini adalah aturan per jalur importer; jangan menganggapnya sebagai bukti bahwa semua importer legacy telah memakai helper tersebut.

Hardening pada 26 Oktober memperluas `scopeLegacyTenantRecords` agar jalur Marketplace, LMS, dan Tahfidz yang memanggil fungsi scope langsung juga mengkanonisasi `tenantId`/`tenant_id`. Alias yang bertentangan, malformed, atau hanya berisi spasi kini dihitung invalid dan memblokir apply; record tenant asing pada `tenant_id` tidak lagi berisiko dianggap tenantless. Regresi tes mencakup alias valid/asing, nilai ganda yang bertentangan, nilai malformed/kosong, dan memastikan snapshot Firestore asli tidak dimutasi. Perubahan ada pada commit `edd9f08b794f08fa55ef38467a9826ff1d3a9bf6`; tes terarah dan CI dua job lulus. Tidak ada data yang ditulis ke Supabase.

Pada commit `5fa94d13f0739c364bb946d21ebf321013d2b4af`, endpoint migrasi dan pembersihan pengaturan nested `tenants/{legacyTenantKey}/settings/global` juga menolak metadata `tenantId`/`tenant_id` yang malformed, bertentangan, atau bukan tenant sumber/tujuan. Kepemilikan path tetap sah jika field duplikat tidak ada. Tes terarah mencakup kasus itu; CI run `40244584892` lulus pada kedua job. Tidak ada perubahan Production.

## Gerbang lingkungan backup dan rehearsal — 26 Oktober 2026

Dashboard Supabase untuk project target `ptsasgdvgrbdtgyqieie` menampilkan paket **Free** dan menyatakan bahwa backup project terjadwal tidak disertakan pada paket tersebut. Karena itu, saat ini belum ada backup terkelola yang dapat dipulihkan untuk rehearsal Production. Suite CI memakai database dan data sintetis lokal; hasil itu tidak menggantikan pemulihan backup target.

Sebelum satu pun migration Production dijalankan, tim backend perlu menyediakan staging terisolasi dan baseline yang dipulihkan dari backup melalui jalur yang disetujui (misalnya project staging terpisah dengan backup memadai atau lingkungan Postgres/Supabase customer-managed). Catat asal backup, versi PostgreSQL/extension, hasil restore, dan pemeriksaan agregat; simpan dump serta credential di tempat terbatas, bukan di repository atau chat. Jalankan checklist rehearsal hanya pada staging tersebut. Tidak ada upgrade atau perubahan Production pada pemeriksaan 26 Oktober.

## Verifikasi ulang koleksi tagihan PPDB — 26 Oktober 2026

Pembacaan Firestore REST dengan ADC dilakukan pada database kanonis yang tercantum di atas, hanya untuk menghitung dokumen pada jalur `financeBillings`. Hasilnya **0 dokumen**. Tidak ada payload dokumen yang dicatat, dan tidak ada perubahan ke Firebase maupun Supabase. Karena Firestore tidak menyimpan koleksi kosong sebagai objek tersendiri, hasil ini berarti jalur koleksi tidak memiliki dokumen yang dapat diimpor saat pemeriksaan; ini bukan bukti bahwa aplikasi lama tidak pernah mendukung koleksi tersebut.

Keputusan cutover: tidak ada arsip tagihan PPDB yang perlu dipindahkan dari snapshot Firebase saat ini, sehingga importer arsip tagihan tidak diperlukan untuk menyelesaikan migrasi data snapshot ini. Jangan membuat tagihan atau ledger sintetis. Pembayaran keluarga sebelum onboarding tetap merupakan gap alur produk yang terpisah dan belum diimplementasikan; invoice PPDB yang ada tetap dikelola Admin melalui `finance_bills` dan baru terkait ke akun wali setelah onboarding serta relasi santri terbentuk.


## Revalidasi jumlah sumber dan bucket — 26 Oktober 2026

Jumlah koleksi root dihitung ulang melalui Firestore REST dengan ADC. Permintaan hanya meminta ID koleksi dan agregat `count`; payload record tidak diambil atau disimpan. Snapshot kembali menghasilkan **18 koleksi dan 561 dokumen**, sama dengan inventaris sebelumnya:

| Koleksi | Jumlah | Koleksi | Jumlah |
| --- | ---: | --- | ---: |
| `candidates` | 50 | `cbt_config` | 1 |
| `cooperative_inventory` | 6 | `cooperative_suppliers` | 3 |
| `cooperative_transactions` | 3 | `cooperative_wallets` | 3 |
| `entityRecords` | 14 | `library_books` | 4 |
| `library_circulations` | 1 | `library_digital_assets` | 4 |
| `lms_assessments` | 1 | `lms_categories` | 1 |
| `lms_courses` | 2 | `marketplace_orders` | 5 |
| `marketplace_products` | 8 | `master_data` | 453 |
| `tenants` | 1 | `users` | 1 |
| **Total** | **561** | **Koleksi** | **18** |

Bucket yang tercantum pada konfigurasi aplikasi (`graphite-ship-q5xj8.firebasestorage.app`) mengembalikan HTTP 404 melalui Cloud Storage API. Listing bucket project menampilkan satu bucket Cloud Run `run-sources-955585477176-ift-asia-southeast1` dengan satu objek. Hanya nama bucket dan jumlah objek yang dihitung; nama/isi objek tidak dibaca. Ini tidak menunjukkan adanya byte berkas Firebase yang dapat dipindahkan. Status empat dokumen metadata `library_digital_assets` tetap tidak menyatakan berkas fisiknya tersedia.

Inventaris count ini tidak mengubah status penerapan. Catatan target terakhir yang terdokumentasi menyebut 50 kandidat PPDB dan 235 dari 453 record `master_data` sudah diimpor; hitungan sisa 276 bersifat historis dan belum diverifikasi ulang pada target Supabase. Importer, preview lama, serta CI sintetis tidak membuktikan import apply. Supabase Production tidak diubah.

