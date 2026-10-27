> **STATUS TERKINI — 27 Oktober 2026:** Dokumen ini memuat pemeriksaan historis dan telah disupersede untuk tindakan saat ini. Pemilik memutuskan data Firestore dummy **tidak perlu disalin**; jangan jalankan importer, rekonsiliasi jumlah, atau penghapusan data staging sebagai release gate. Ikuti [checkpoint schema dan logic tanpa salin data](./CHECKPOINT_NO_DATA_COPY_SCHEMA_READINESS_2026-10-27.md) untuk status PR/head, angka migration terbaru, kriteria relasi tenant, dan langkah berikutnya.

# Rekonsiliasi staging Supabase dan data legacy — 27 Oktober 2026

## Keputusan ruang lingkup produk — 27 Oktober 2026

Pemilik produk menegaskan bahwa data Firestore pada inventaris ini adalah data dummy dan **tidak perlu disalin**. Sasaran sekarang adalah memastikan skema, relasi, aturan tenant/role, transaksi, dan API Supabase benar. Data sintetis untuk pengujian boleh dibuat ulang; data contoh operasional dapat dimasukkan manual kemudian. Jangan menjalankan impor arsip hanya untuk mengejar hitungan dan jangan menghapus data staging yang sudah ada.

Bagian perbandingan jumlah dan preview di bawah merupakan bukti historis/teknis, bukan syarat kelengkapan produk atau rilis. Pemeriksaan migrasi schema tetap relevan: head PR #13 yang diperiksa (`540bf7d45e36b4f6cda09ef026c7bd4ae080f74e`) memiliki 92 file migration sampai `20270120000000`; ledger staging masih memuat 47 versi sampai `20261206000000`, sehingga 45 versi source belum tercatat. GitHub Actions run [40454742884](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40454742884) lulus pada kedua job dengan database lokal dan data sintetis; ini belum merupakan rehearsal terhadap staging.

## Cakupan dan batas pemeriksaan

Pemeriksaan ini menggunakan konektor Supabase staging dengan query baca-saja. Tidak ada migration, data, policy, bucket, atau feature flag yang diubah. Tidak ada isi PII atau nilai secret yang dicatat.

- Target staging: `ptsasgdvgrbdtgyqieie`.
- Tenant aktif: `pesantren-digital`.
- Source Firestore: inventaris terakhir yang tercatat pada 26 Oktober 2026, yaitu 18 koleksi root dan 561 dokumen. Hitungan source pada dokumen [inventaris migrasi Firestore](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) belum dihitung ulang dalam pemeriksaan ini.
- Checkout yang digunakan untuk pemeriksaan lokal: branch `codex/master-data-student-search-20261026`, commit `b71ee0c`, dengan perubahan lokal belum di-commit. Hasil lokalnya bukan bukti bahwa PR #13 pada head GitHub yang berbeda memiliki isi byte-identik.

## Rekonsiliasi migration

| Ukuran | Hasil baca-saja |
| --- | ---: |
| File migration pada checkout audit sebelumnya | 91 |
| Versi pada ledger staging | 47 |
| Versi terakhir pada ledger staging | `20261206000000` |
| Versi terakhir pada head PR #13 terbaru | `20270120000000` |
| Versi pada head PR terbaru yang belum tercatat di ledger | 45 |

Pada head PR terbaru, 45 versi yang belum tercatat berada setelah `20261206000000`, dimulai `20261207000000` dan berakhir `20270120000000`. Daftar ini **bukan instruksi untuk menerapkan migration**. Ledger tidak membuktikan keadaan lengkap schema, grant, policy, trigger, atau data. Rekonsiliasi schema dan rehearsal pada backup yang dapat dipulihkan tetap wajib sebelum apply.

### Dua versi terdaftar tanpa metadata SQL

Query ledger baca-saja menunjukkan `20261205000000` dan `20261206000000` tidak memiliki `name` maupun `statements`. Karena itu preflight pencocokan isi SQL harus berhenti pada dua versi tersebut sampai tim merekonsiliasi efek dan provenance-nya secara manual. Jangan mengisi ledger atau menandai ulang migration hanya berdasarkan nomor versi.

Pemeriksaan efek schema yang relevan menemukan:

- `20261205000000_data_api_default_privilege_hardening.sql`: default privilege objek `public` untuk role `postgres` hanya memberi hak ke `postgres`; empat helper trigger yang disebut dalam migration tidak bisa dieksekusi oleh `anon`, `authenticated`, atau `service_role`.
- `20261206000000_ppdb_legacy_candidate_import.sql`: tabel `ppdb_legacy_import_batches` ada, RLS dan `FORCE RLS` aktif, serta hak tabel hanya tersedia untuk `service_role`; fungsi impor PPDB legacy ada dengan `SECURITY INVOKER`, `search_path` terbatas, dan hak `EXECUTE` hanya untuk `service_role`. Satu batch impor tercatat.

Temuan tersebut konsisten dengan efek utama kedua migration, tetapi tidak membuktikan bahwa setiap statement pada ledger sama dengan source file. PR preflight sekarang memang membandingkan nama dan statement migration; hasilnya perlu menampilkan dua baris ini sebagai selisih metadata untuk diselesaikan secara eksplisit.

## Baseline keamanan staging

- Ada 119 tabel `public`; seluruh 119 mengaktifkan RLS dan `FORCE ROW LEVEL SECURITY`.
- Ada lima policy `SELECT`: `candidate_documents` dan `candidates` dibatasi tenant aktif, Admin, serta izin PPDB; `profiles` membatasi profil sendiri atau Admin tenant dengan izin pengguna; `tenants` membatasi tenant aktif; `user_profiles` membatasi UID sendiri.
- Pemeriksaan privilege pada empat tabel perwakilan menunjukkan `anon` tidak punya hak baca/tulis; `authenticated` hanya punya hak `SELECT` pada tabel yang dipakai policy dan tidak punya hak tulis; `service_role` punya CRUD. Karena backend memakai role istimewa, setiap endpoint tetap harus memverifikasi token, status profil, tenant, role, dan permission sebelum query.
- Default ACL untuk objek aplikasi yang dibuat sebagai `postgres` sudah dibatasi. Ada ACL terpisah untuk role platform `supabase_admin` yang masih memberi hak default kepada role API; semua tabel dan fungsi aplikasi saat ini dimiliki `postgres`. Tim harus memastikan migrasi pada setiap jenis deployment selalu berjalan sebagai `postgres`, lalu meninjau kebijakan role platform tersebut tanpa mengubah ACL bawaan managed service secara membabi buta.
- Ada dua bucket Storage (`ppdb-documents`, `erp4-private-finance-proofs`); keduanya privat dan saat diperiksa belum memiliki policy pada `storage.objects`. Akses file harus melalui route backend yang terotorisasi sampai policy Storage teruji.

## Data legacy yang terverifikasi pada staging

Hitungan berikut berasal dari tabel tenant `pesantren-digital`; query hanya mengembalikan agregat.

| Domain | Target saat diperiksa |
| --- | ---: |
| Gedung / Kamar / Kelas | 15 / 50 / 30 |
| Santri legacy | 50 |
| Santri dengan NIK dan NISN terenkripsi serta fingerprint | 50 / 50 |
| Santri dengan NIS | 0 |
| Wali legacy dengan NIK terlindungi | 50 |
| Relasi wali–santri | 50 |
| Halaqah legacy | 40 |
| Keanggotaan halaqah hasil impor legacy | 0 |
| Kandidat PPDB dengan ID sumber | 50 |

### Rekonsiliasi dan preview struktur Master Data — 27 Oktober 2026

Pembacaan baca-saja mengambil field `id`, `category`, `tenantId`, dan `tenant_id` dari 453 dokumen `master_data`; ownership cocok pada 453/453 record tanpa tenant invalid, unresolved, atau tenant lain. Registry Firestore berisi satu tenant yang ID dokumennya sama dengan `legacy_tenant_key` target. Normalisasi ID mengikuti route importer: gunakan `raw.id` bila string non-kosong, jika tidak hapus prefiks kategori dari document ID, lalu gunakan document ID utuh sebagai fallback.

| Kategori | ID unik sumber | ID target | Cocok | Duplikat | ID hanya di satu sisi |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gedung | 15 | 15 | 15 | 0 | 0 |
| Kamar | 50 | 50 | 50 | 0 | 0 |
| Kelas | 30 | 30 | 30 | 0 | 0 |

Preview `migrateSupabaseMasterDataStructures(..., false)` pada head PR menghasilkan 95 sumber, 95 terencana, 0 error, 0 calon insert, dan 95 sudah ada. Tidak ada data yang ditulis. Ada 50 peringatan Kamar karena gender belum eksplisit pada Kamar maupun Gedung induk; tujuh Santri sumber juga belum dapat dipetakan ke kamar secara tidak ambigu. ID cocok tidak menjadikan penempatan asrama siap.

Pasangan `PII_ENCRYPTION_KEY` dan `PII_FINGERPRINT_KEY` pada `.env` lokal yang diabaikan Git telah diuji terhadap ciphertext dan fingerprint satu record staging tanpa menampilkan nilai identitas atau kunci. Kedua kunci sekarang tersedia pada `.env` checkout aktif. Simpan salinannya hanya pada secret manager backend untuk environment yang memakai data tersebut; jangan commit atau menaruhnya di variabel frontend.

## Status source-to-target berdasarkan inventaris terakhir

Inventaris source yang tercatat menghitung 453 dokumen `master_data`, 50 kandidat PPDB, dan 58 dokumen pada koleksi root lain. Catatan impor sebelumnya mengidentifikasi 235 dari 453 dokumen `master_data` dan 50 kandidat sebagai record yang telah diterapkan; total yang tercakup 285 dari 561 dokumen, sehingga 276 masih belum tercakup atau belum layak diterapkan. Hitungan target saat ini mengonfirmasi jumlah inti di tabel Supabase, tetapi tidak menggantikan fingerprint-per-record dan rekonsiliasi ulang terhadap snapshot Firestore terbaru.

Temuan yang memerlukan keputusan data, bukan tebakan importer:

1. Sumber Santri tidak menyediakan NIS. Jangan membuat NIS atau reservasi secara otomatis; tetapkan kebijakan penomoran lalu jalankan alur reservasi transaksional.
2. ID 15 Gedung, 50 Kamar, dan 30 Kelas cocok penuh dengan target. Namun preview memberi 50 peringatan gender Kamar dan 7 Santri belum memiliki pemetaan kamar yang tidak ambigu; penempatan asrama tetap ditahan sampai Admin memverifikasi gender, relasi induk, dan pemetaan kamar.
3. Halaqah belum memiliki ustadz, jadwal, target yang disahkan, atau keanggotaan santri; 40 data saat ini masih data legacy provisional.
4. Data Alumni tidak aman dipasangkan ke Santri melalui email saja. Minta pemetaan dan tanggal kelulusan yang diverifikasi.
5. Kandidat PPDB sudah memiliki 50 ID sumber dan PII terlindungi, tetapi pemeriksaan ini hanya mengonfirmasi agregat, bukan rekonsiliasi isi per baris.
6. Berkas Storage lama belum terbukti dapat dipulihkan; metadata koleksi bukan pengganti byte file.

Rincian kategori dan jalur impor lain tercatat pada [checkpoint Master Data](MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md) dan [inventaris migrasi](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md). Preview atau keberadaan importer tidak membuktikan data sudah diterapkan.

## Gerbang yang masih terbuka

1. Tim backend merekonsiliasi metadata kosong untuk migration `20261205000000` dan `20261206000000`, lalu membandingkan keseluruhan schema, indeks, constraint, fungsi, grant, RLS, Storage, dan ledger pada target dengan source migration.
2. Siapkan baseline staging yang dapat dipulihkan dari backup dan jalankan rehearsal upgrade di environment non-production. Project target berada pada paket Free; jangan menganggap backup terjadwal tersedia.
3. Hitung ulang seluruh Firestore, buat fingerprint snapshot, dan jalankan preview per domain. Preview struktur Master Data sudah selesai tanpa menulis; lanjutkan rekonsiliasi atribut/relasi dan domain lain. Cocokkan data sensitif; pertahankan seed/fixture, akun Auth, transaksi, dan byte file sebagai kategori terpisah.
4. Terapkan hanya domain yang lolos preview, dengan batch atomik dan hitungan sebelum/sesudah. Rekonsiliasi duplikasi, tenant, status, serta total keuangan.
5. Uji end-to-end Supabase Auth, matriks role/tenant, API server, PPDB publik, upload/download berkas, NIS serentak, laporan, backup/restore, dan responsif pada staging representatif.
6. Rotasi secret key/password database yang pernah dibagikan sebelum go-live. Siapkan secret manager, observabilitas, prosedur rollback, dan dokumentasi instalasi pelanggan.

**Keputusan saat ini:** staging memiliki pondasi schema dengan RLS ketat dan sebagian data legacy sudah terimpor. ERP belum terbukti sepenuhnya lepas dari Firebase, belum seluruh 561 dokumen direkonsiliasi, dan belum siap go-live. Jangan menerapkan 44 migration hanya berdasarkan selisih ledger.

## Preflight lokal dan CI — 27 Oktober 2026

- Perbaikan PR #13 membuat `preflight:db-migrations` memuat `.env` dari akar repo dan memilih `SUPABASE_DB_POOLER_URL` sebelum `SUPABASE_DB_URL`, tanpa menampilkan kredensial. Uji unit meliputi pilihan pooler dan fallback URL langsung.
- GitHub Actions [run 40448719287](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40448719287) sukses pada kedua job untuk commit `0ea6ea8d8e49ab57f0f81c80e6241d8bc9137df3`. Ini mencakup preflight baca-saja, build, uji migrasi/API/pgTAP, runtime tanpa Firebase, Docker/Compose, Storage, dan backup/restore sintetis.
- Pada checkout Windows pemeriksaan ini, `psql` belum tersedia. Jalankan preflight langsung dari PC hanya setelah memasang PostgreSQL client; `.env` saja belum cukup untuk menjalankan query. CI telah memasang client tersebut.
- CI memakai Supabase lokal sintetis. Ia tidak memperbaiki atau mengisi metadata dua migration live dan tidak menerapkan migration apa pun ke Supabase target.

## Revalidasi read-only — 27 Oktober 2026

- Firestore REST dengan ADC menghitung ulang koleksi root memakai `listCollectionIds` dan agregasi `count()` saja. Hasil tetap **18 koleksi / 561 dokumen**, sama dengan tabel hitungan di inventaris ini. Payload dokumen tidak diambil; hasil ini mengonfirmasi jumlah, bukan kesamaan setiap record dengan target.
- Query baca-saja Supabase pada **05:00 UTC** mengonfirmasi ledger tetap memiliki **47 versi** hingga `20261206000000`; 119/119 tabel publik memakai RLS dan FORCE RLS dengan lima policy publik; dua bucket Storage privat dan nol policy pada `storage.objects`. Tidak ada migration, data, policy, bucket, atau feature flag yang diubah.
- GitHub Actions [run 40452393890](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40452393890) lulus pada kedua job di head dokumen `b48c2be238e7fbf313eea3f2227cccdc4106bb70`. Job database menjalankan migration/pgTAP dan pemeriksaan API pada Supabase lokal sintetis; ini tidak menerapkan migration ke staging atau Production dan tidak membuktikan rekonsiliasi data live.
- Selisih **44 migration source** dan metadata kosong pada dua versi terakhir tetap menunggu rekonsiliasi/provenance serta rehearsal backup staging yang dapat dipulihkan. Hasil ledger dan jumlah tabel sendiri bukan izin untuk menerapkan migration.

### Rekonsiliasi PPDB kandidat — preview baca-saja 27 Oktober 2026

Preview dijalankan terhadap 50 kandidat Firestore dan konteks tenant/data kandidat Supabase staging. Pemeriksaan hanya mencatat agregat; nilai identitas, ID registrasi, ciphertext, dan fingerprint tidak dicetak atau disimpan.

- Source scope menyertakan 50/50 kandidat tenantless karena registry Firestore hanya memiliki satu tenant dengan key yang sama dengan mapping target. Tidak ada tenant invalid, unresolved, atau record yang dikeluarkan.
- Target memiliki 50 record dengan `source_record_id` yang cocok satu-per-satu. Fingerprint NIK dan NISN cocok 50/50, dan preview tidak menemukan duplikasi registrasi, NIK, atau NISN pada source.
- Perbandingan payload ternormalisasi menunjukkan semua kolom kandidat yang dipetakan cocok 50/50 kecuali `registration_id` (0/50 cocok). `source_fingerprint` berbeda pada 50/50 record; preview melaporkan 50 `changedImportedSource`. Ini konsisten dengan perubahan atau provenance berbeda pada ID registrasi; penyebab historis tepatnya belum dibuktikan.
- `canApply` tetap `false`: fingerprint sumber berubah dan konfirmasi operator untuk tenant/format tanggal tidak diberikan. **Tidak ada apply atau penulisan data.** Jangan mengubah ID target atau melewati pemeriksaan fingerprint otomatis. Tim harus memutuskan berdasarkan snapshot/provenance apakah ID Supabase saat ini dipertahankan dan dibuatkan alias audit, atau sumber dipulihkan ke snapshot saat import.

## Matriks jumlah data source-to-target — baca-saja 27 Oktober 2026

Hitungan sumber diambil dari agregasi Firestore root; hitungan target dari agregasi per tenant Supabase. Tidak ada payload PII atau data transaksi yang dicetak. Keduanya hanya menunjukkan jumlah, bukan kesetaraan isi atau relasi.

| Domain / koleksi sumber | Source | Target staging saat dibaca | Kesimpulan |
| --- | ---: | ---: | --- |
| candidates | 50 | 50 kandidat | Padanan source ID 50/50, tetapi registration_id dan fingerprint sumber berubah; tahan apply sampai kebijakan alias/ID diputuskan. |
| master_data | 453 | 95 master_data_records, 50 santri, 50 wali, 40 halaqah | Hanya sebagian domain terwakili. 218 record kategori lain masih belum direkonsiliasi atau diterapkan; cocok jumlah bukan bukti isi. |
| entityRecords | 14 | Tidak ada padanan source ID yang terverifikasi | 7 santri/7 wali berpotensi duplikat dengan master_data; jangan gabungkan berdasarkan nama. |
| Data koperasi | 6 katalog, 3 pemasok, 3 transaksi, 3 dompet | 0 produk, 0 pemasok, 0 penjualan, 0 ledger; 15 dompet tanpa ID sumber | Katalog/transaksi belum direkonsiliasi; 15 dompet target tidak boleh dianggap cocok dengan 3 sumber. |
| Marketplace | 8 produk, 5 order | 0 produk, 0 order | Belum diterapkan; detail baris order sumber memang tidak tersedia. |
| Perpustakaan | 4 buku, 1 sirkulasi, 4 metadata aset digital | 0 buku, 0 sirkulasi, tidak ada tabel aset digital | Belum diterapkan; keberadaan metadata tidak membuktikan byte file tersedia. |
| LMS | 1 kategori, 2 kursus, 1 asesmen | 0 kategori, 0 kursus, 0 penugasan | Belum diterapkan; modul/materi bertingkat perlu preview relasi. |
| CBT | 1 cbt_config | cbt_tenant_settings belum ada | Migration sumber terkait belum tercatat di ledger target; jangan memasukkan konfigurasi sebelum schema dan preview tersedia. |
| Tahfidz | 40 halaqah pada master_data; tidak ada koleksi root setoran | 40 halaqah, 0 keanggotaan, 0 setoran | Halaqah saja belum membuat modul operasional siap; riwayat setoran tidak tersedia pada snapshot root. |

Target tenant juga memiliki **50 santri tanpa NIS**, **0 reservasi NIS**, serta **0 baris finance ledger, tagihan, dan biaya**. Firestore tidak menyediakan NIS pada snapshot yang direkonsiliasi, sehingga NIS harus dibuat melalui kebijakan penomoran dan transaksi reservasi, bukan diimpor dengan tebakan. Dua bucket Storage tetap privat dan belum memiliki policy storage.objects; akses runtime masih harus melalui backend yang tervalidasi.

Hasil ini menegaskan bahwa staging berisi sebagian Master Data, PPDB, dan halaqah, bukan migrasi operasional lengkap. Semua angka adalah read-only dan tidak mengubah staging maupun Production.
