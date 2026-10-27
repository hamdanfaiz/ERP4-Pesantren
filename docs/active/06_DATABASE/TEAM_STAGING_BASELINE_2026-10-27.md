# Baseline Baca-Saja Supabase Staging — ERP4 Pesantren

**Tanggal pemeriksaan:** 27 Oktober 2026 (WIB)
**Project ref:** `ptsasgdvgrbdtgyqieie` — **staging**, bukan production
**Sumber arsip:** Firestore `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`
**Head kode yang diaudit:** `b80b31098468a957bfe5a48d8b31c22dede4ef99` ([PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13))

## Ringkasan

Pemeriksaan ini memakai Supabase MCP staging yang dibatasi untuk baca-saja dan Firestore ADC. SQL hanya membaca katalog, grant, policy, serta hitungan/agregasi hash. Firestore dibaca untuk nama koleksi, jumlah dokumen, keberadaan field tenant, dan ID kandidat yang langsung diubah menjadi hash sementara untuk pencocokan. Nilai field, isi dokumen, email, ID mentah, hash, objek Storage, serta bukti pembayaran tidak disimpan atau dicantumkan di sini. **Tidak ada migration, data, file, atau konfigurasi remote yang diubah.**

- PR #13 masih **Open/Draft**. GitHub Actions [run 40413401535](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40413401535) pada head di atas selesai sukses pada dua job wajib: build/frontend/Firebase guard dan migration/API auth/tenant/pgTAP. Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch.
- Ledger staging mempunyai **47 versi** sampai `20261206000000`; source PR mempunyai **91 migration**, sehingga **44 versi** (`20261207000000`–`20270119000000`) belum tercatat pada staging. Ini status ledger saja, bukan persetujuan untuk menerapkan migration.
- Jam database saat pemeriksaan adalah `2026-10-26 22:21 UTC` atau `2026-10-27 05:21 WIB`. Jadi tanggal `20261206000000` adalah penanda versi migration, bukan bukti jam database salah.
- Staging memiliki 119 tabel aplikasi di schema `public`; semua mengaktifkan dan memaksa RLS. `tenants` adalah satu-satunya tabel tanpa kolom `tenant_id`, sesuai perannya sebagai tabel root tenant.
- Tidak ada grant tabel `public` kepada `anon`. Role `authenticated` hanya memiliki akses SELECT pada lima tabel yang dipagari policy; tidak memiliki akses tulis langsung. Pola ini sesuai dengan arsitektur server-mediated, tetapi tetap perlu dibuktikan lewat login dan UAT.
- Tenant sumber terpetakan ke satu tenant staging aktif. Verifikasi membandingkan fingerprint hash registry Firestore dengan `legacy_tenant_key` staging dan hanya menghasilkan jumlah kecocokan, bukan nilai aslinya.
- Firestore mempunyai 18 koleksi root dengan 561 dokumen. Semua 453 dokumen `master_data` dan 50 `candidates` tidak memiliki `tenantId` maupun `tenant_id` top-level. Seluruh 559 dokumen pada 16 koleksi operasional lain juga tidak memiliki kedua field itu; satu dokumen `users` memiliki `tenantId`. Dokumen root `tenants` memang tidak memerlukan `tenantId` sendiri.
- Hitungan staging: satu tenant aktif, satu profil Admin aktif, 50 kandidat, 50 santri, 50 wali, 95 struktur Master Data, dan 40 halaqah. Rekonsiliasi hash ID membuktikan semua 50 kandidat, 50 santri, 50 wali, 40 halaqah, serta 95 struktur Gedung/Kamar/Kelas cocok satu per satu dengan sumber. Angka 453 dokumen `master_data` tidak dapat dibandingkan langsung dengan 95 record struktur karena koleksi sumber juga memuat data yang dipetakan ke tabel domain lain atau belum diimpor.

## Inventaris koleksi Firestore

| Koleksi root | Dokumen |
|---|---:|
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
| **Total** | **561** |

Daftar ini hanya mencakup koleksi root. Subkoleksi dan berkas eksternal belum diinventarisasi. Semua hitungan bersifat read-only; tidak ada isi dokumen yang dimuat ke laporan.

## Kontrol akses Supabase yang terlihat

### Database dan RLS

- 119/119 tabel aplikasi `public` memiliki RLS aktif dan `FORCE ROW LEVEL SECURITY` aktif.
- 118/119 tabel memiliki `tenant_id`; pengecualian hanya `tenants`.
- Grant tabel `anon`: 0 SELECT, 0 INSERT, 0 UPDATE, 0 DELETE.
- Grant tabel `authenticated`: lima tabel SELECT, tanpa INSERT/UPDATE/DELETE. Lima policy SELECT adalah:
  - `profiles_select_self_or_tenant_admin`
  - `user_profiles_select_own`
  - `tenants_select_current_tenant`
  - `candidates_select_ppdb_admin`
  - `candidate_documents_select_ppdb_admin`
- 42 fungsi `SECURITY DEFINER` di `public` yang diperiksa semuanya menetapkan `search_path`; tidak ada yang dapat dieksekusi oleh `anon`. Empat helper yang dapat dieksekusi role `authenticated` adalah `current_app_role`, `current_tenant_id`, `is_tenant_admin`, dan `has_module_access`. Implementasi yang terbaca mengikat hasil pada `auth.uid()`, profil aktif, dan tenant aktif.
- Grant langsung `service_role` berbeda per tabel: 115 SELECT, 112 INSERT, 109 UPDATE, dan 109 DELETE dari 119 tabel. Beberapa tabel event/ledger sengaja tidak menerima tulis langsung; source memakai fungsi database/RPC terlindungi untuk transaksi. Jangan meratakan grant ini menjadi akses CRUD global.

### Storage

- Bucket `ppdb-documents` dan `erp4-private-finance-proofs` bersifat privat; batas ukuran masing-masing 2 MiB dan 3 MiB.
- `storage.objects` memakai RLS tetapi tidak mempunyai policy. Grant relasi dasar `anon`/`authenticated` tidak memberikan akses objek tanpa policy. Akses harus melalui endpoint server dan URL bertanda tangan yang dibatasi.
- Bucket `erp4-private-document-attachments` belum ada pada staging karena migration Document Center `20270117000000` belum tercatat. Endpoint/fitur yang bergantung pada bucket ini harus tetap tertahan sampai migration direhearsal dan bucket privat diverifikasi.
- Audit ini tidak membuka, mengunduh, atau memeriksa objek Storage.

### Default grant dan perubahan Data API

Default privilege role `postgres` pada schema `public` tidak memberi akses tabel, sequence, atau fungsi kepada role Data API. Ini sejalan dengan migration `20261205000000_data_api_default_privilege_hardening.sql` dan konfigurasi least privilege saat ini. Semua migration baru yang dibutuhkan backend harus menyertakan grant eksplisit minimum kepada role server yang memang perlu; jangan menambahkan akses `anon` atau `authenticated` untuk mengatasi error secara umum.

Supabase menjadwalkan perubahan agar tabel baru `public` tidak otomatis terekspos ke Data API pada **30 Oktober 2026**. Tabel lama mempertahankan grant saat ini; tabel baru memerlukan grant eksplisit. Karena backend menggunakan PostgREST/Supabase client, tim harus memeriksa migration yang belum diterapkan dan memastikan grant sesuai endpoint. [Catatan resmi Supabase tentang perubahan ini](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Rekonsiliasi sumber dan staging

| Domain | Firestore | Supabase staging | Status pemeriksaan |
|---|---:|---:|---|
| PPDB kandidat | 50 | 50 | Hash ID cocok 50/50; 0 hilang dan 0 ekstra. Isi record dan kelengkapan field belum direkonsiliasi. |
| Struktur Master Data: Gedung/Kamar/Kelas | 15 / 50 / 30 | 15 / 50 / 30 | Hash business ID cocok 95/95; 0 hilang dan 0 ekstra. Keterkaitan Gedung↔Kamar dan batasan asrama tetap perlu verifikasi. |
| Santri | 50 dari `master_data` | 50 | Hash ID dokumen sumber cocok 50/50. Semua 50 belum memiliki NIS; tetapkan melalui alur NIS transaksional setelah kebijakan nomor disepakati. |
| Wali Santri | 50 dari `master_data` | 50 | Hash ID dokumen sumber cocok 50/50; 50 relasi wali→santri tersimpan dan mencakup 50 wali serta 50 santri. Isi dan validitas field belum direkonsiliasi. |
| Halaqah | 40 dari `master_data` | 40 | Hash ID dokumen sumber cocok 40/40. Sumber tidak memiliki field/daftar anggota pada semua 40 dokumen; target memiliki 0 keanggotaan, sehingga penempatan santri harus dikonfigurasi setelah data valid tersedia. |
| Kategori `master_data` yang belum diimpor | 218: Alumni 50, Asatidz 50, Guru 50, Kampus 5, Pegawai 50, Staff 2, System 1, Unit 10 | Belum dipetakan penuh | Perlu review dan rekonsiliasi per domain sebelum impor; kategori dengan importer/preview tersendiri tetap mengikuti gate pada inventory migrasi. |
| Koleksi root lain | 56 dokumen pada 14 koleksi selain `master_data`, kandidat, tenant, dan user | Beragam/tidak dipetakan di sini | Perlu preview per modul setelah migration prasyarat tersedia. |

### Modul operasional lain yang belum diterapkan

| Modul / sumber Firestore | Kondisi target staging | Kesimpulan dan tindakan |
|---|---|---|
| Koperasi: 6 inventory, 3 pemasok, 3 transaksi, 3 wallet | 0 produk, 0 pemasok, 0 penjualan, 0 pergerakan stok, 0 entri ledger. Ada 15 wallet untuk 15 santri aktif; semua bersaldo nol. | Wallet target dibuat otomatis dari santri aktif oleh migration, bukan hasil impor tiga wallet sumber. Jangan menyalin saldo/transaksi sebelum produk, identitas santri, saldo pembuka, dan urutan ledger direkonsiliasi pada rehearsal. |
| Perpustakaan: 4 buku, 1 sirkulasi, 4 metadata aset digital | 0 buku dan 0 sirkulasi; tabel metadata aset digital belum tersedia pada staging. | Preview buku lama pernah menemukan 4 calon record dengan 2 peringatan ISBN; belum ada apply. Sirkulasi belum dapat ditautkan ke santri terverifikasi. Metadata aset tidak membuktikan byte file tersedia. |
| LMS: 1 kategori, 2 kursus, 1 penilaian | 0 kategori, 0 kursus, 0 tugas. | Belum ada impor; pemetaan pengajar harus ke profil Ustadz aktif dan konten bertingkat perlu direkonsiliasi. |
| Marketplace: 8 produk, 5 pesanan | 0 produk dan 0 pesanan. | Snapshot sumber telah diklasifikasikan sebagai contoh browser yang perlu review Admin; jangan impor ke katalog operasional tanpa persetujuan data. |
| CBT: 1 konfigurasi | Tabel `cbt_tenant_settings` belum ada pada staging karena migration sumber `20270114000000` belum tercatat. | Konfigurasi masih menunggu migration serta preview/apply bertanda tenant. Bank soal `cbt_questions` tidak ada di database Firestore kanonis yang diperiksa. |
| `entityRecords`: 7 Santri dan 7 Wali | Data domain saat ini berasal dari kategori `master_data`; tidak ada bukti hasil merge record `entityRecords`. | Hindari duplikasi/join berdasarkan nama. Rekonsiliasi setiap ID, identitas, dan relasi secara terpisah bila sumber ini dipertimbangkan. |

### Pemeriksaan alur penerimaan PPDB ke data Santri — 27 Oktober 2026

- Status kandidat Firestore di staging: 8 `Accepted`, 11 `Document Review`, 6 `Entry Exam`, 7 `Interview`, 9 `Registered`, dan 9 `Rejected`. Semua 50 kandidat masih `Pending` onboarding.
- Delapan kandidat `Accepted` mempunyai fingerprint NIK/NISN, tetapi belum memiliki `master_student_id`, `master_guardian_id`, atau waktu onboarding. Tidak ditemukan kecocokan fingerprint mereka pada 50 santri hasil impor yang ada. Semua santri impor masih belum memiliki NIS.
- Struktur target memuat 15 Gedung, 50 Kamar, dan 30 Kelas. Semua kamar memiliki kapasitas positif, tetapi tidak satu pun terhubung ke Gedung atau menetapkan gender pada kamar/Gedung. Fungsi database onboarding tetap menolak gender yang belum dikonfigurasi.
- UI PPDB kini hanya menampilkan kelas aktif dan kamar aktif dengan kapasitas tersisa serta gender yang sesuai. Kamar yang memakai Gedung harus menunjuk Gedung aktif. Tombol onboarding dinonaktifkan bila belum ada kelas/kamar yang memenuhi syarat, dengan pesan untuk melengkapi Master Data. RPC database tetap menjadi pemeriksaan otoritatif dan mengunci transaksi kapasitas/NIS.
- Sebelum calon santri dapat di-onboard, Admin perlu menentukan relasi Gedung–Kamar dan gender operasional, memvalidasi data NIS/identitas pada tenant, lalu mengulang preview. Tidak ada Master Data, kandidat, NIS, atau relasi yang diubah dalam pemeriksaan ini.
- Tes guardrail lokal: `npm run test:ppdb-onboarding-rooms`; cakupan meliputi gender L/P, gender turunan dari Gedung, kapasitas penuh/tidak valid, Gedung tidak aktif/tidak ditemukan, relasi konflik, serta baseline staging tanpa konfigurasi gender.

Registry Firestore satu pengguna menyediakan kunci tenant sumber; hash kunci tersebut cocok dengan `legacy_tenant_key` milik satu tenant aktif slug `pesantren-digital` pada staging. **Kunci asli tidak dicatat.** Pencocokan ID memakai hash sementara di sisi klien dan agregasi hash pada query staging; nilai hash maupun ID mentah tidak disimpan dalam laporan. Field kategori Master Data dihitung lokal tanpa menyalin payload. Hasil pencocokan hanya memastikan keberadaan ID dan sebagian relasi, bukan validitas seluruh isi/field. Importer tetap harus menolak snapshot berubah, duplikasi NIS/identitas, foreign key lintas tenant, dan relasi yang tidak cocok.

## Gerbang pekerjaan berikutnya

1. Backend menyiapkan salinan staging yang dapat dibuang dan membuktikan backup/restore. Konektor yang digunakan sekarang hanya baca-saja, sehingga belum bisa menerapkan migration ke project ini.
2. Tinjau 44 migration pending satu per satu, cocokkan schema/RLS/grant, constraint, seed/backfill, urutan, indeks/lock, dan explicit grant service role. Rehearsal pada salinan dapat dipulihkan; jangan menjalankan batch ke target sekarang.
3. Jalankan preview per koleksi memakai fingerprint dan ID sumber; validasi isi/field kandidat, seluruh 218 kategori Master Data yang tersisa, transaksi/wallet, relasi asrama/kelas, dan lampiran. Tetapkan NIS lewat transaksi resmi; jangan mengarang anggota halaqah karena daftar sumber tidak tersedia.
4. Setelah hasil preview disetujui tim data, gunakan kredensial migrasi yang dikelola backend di environment lokal/staging. Jangan mengirim secret/password di chat dan jangan menaikkan akses MCP read-only secara diam-diam.
5. Uji autentikasi Admin, matriks role/tenant, route server, Storage bertanda tangan, transaksi, restore, dan instalasi VPS/on-premise. Project ref ini tetap staging dan bukan endpoint production.

## Progress checkpoint

- Kematangan fitur: sekitar **73%**.
- Kesiapan go-live: sekitar **46%**.

Angka tersebut estimasi proyek, bukan metrik otomatis. Audit staging dan inventaris Firestore meningkatkan bukti yang tersedia, tetapi tidak menambah fitur atau menggantikan rehearsal, rekonsiliasi data, rotasi secret, login/UAT, dan pengujian environment pelanggan. Tidak ada perubahan Production.




## Checkpoint pengembangan — 27 Oktober 2026

- Kode PR #13 diperbarui pada commit [`7ad1a37`](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/7ad1a3742b100887ed782c7aac449d0e0bd032d0): parser PPDB CSV yang ketat, pemuatan Vite hanya saat development, serta pemindahan paket Vite, XLSX, dan Quill dari dependency produksi ke dependency development.
- GitHub Actions [run 40421786630](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40421786630) lulus pada job frontend dan job migrasi/API/pgTAP. Job menguji instalasi Bun beku, build, smoke test runtime produksi tanpa Firebase, Docker/Compose, RLS/pgTAP, isolasi tenant, NIS dan Tahfidz serentak, Storage, serta backup/restore sintetis. Supabase Preview dilewati; database staging tidak ditulis.
- Tes lokal: typecheck, build frontend/server, parser CSV, kelayakan kamar PPDB, paginasi Master Data, guard runtime Supabase, pembatas Firebase lokal, dan audit dependency produksi (`npm audit --omit=dev`) lulus. Audit produksi melaporkan 0 kerentanan. Build masih memberi peringatan chunk PDF sekitar 1,46 MB; optimasi chunk tetap menjadi pekerjaan.
- Pembacaan ulang ledger staging: 47 versi tercatat sampai `20261206000000`; repo memuat 91 file migrasi. Ada 44 versi lokal setelah versi ledger tertinggi yang belum tercatat, dari `20261207000000` sampai `20270119000000`.
- Kolom `name` pada ledger bernilai `NULL` untuk versi `20261205000000` dan `20261206000000`, sedangkan nama file lokalnya masing-masing `data_api_default_privilege_hardening` dan `ppdb_legacy_candidate_import`. Versinya cocok, tetapi nama tidak tersedia sebagai bukti lineage; tim backend perlu membandingkan riwayat skema sebelum menyusun rencana apply.
- Perbedaan ledger hanya menunjukkan status pencatatan versi; belum membuktikan bahwa isi skema target sama dengan definisi SQL lokal. Jangan menganggap 44 migration sebagai batch yang siap dijalankan. Rehearsal pada database staging yang dapat dipulihkan tetap menjadi gerbang berikutnya.

Estimasi checkpoint tetap **73% kematangan fitur** dan **46% kesiapan go-live**. Angka tidak dinaikkan: hasil CI sintetis belum menggantikan rehearsal migrasi target, rekonsiliasi payload, login/UAT, rotasi secret, dan simulasi instalasi di VPS/on-premise.

### Guardrail lineage dan dependency — 27 Oktober 2026

- Migration preflight kini membandingkan nomor versi dan nama file migration terhadap kolom `name` pada ledger. Query metadata memakai transaksi `READ ONLY`; nama `NULL` atau berbeda menghentikan rencana staging. Tes `npm run test:migration-preflight` mencakup dua nama kosong yang terlihat pada ledger staging.
- Query baca-saja ulang mengonfirmasi 47 versi tercatat; `20261205000000` dan `20261206000000` masih bernama kosong. Belum ada migration atau data staging/Production yang diubah.
- Lockfile npm dan Bun diperbarui untuk temuan dependency **production**. `npm audit --omit=dev --audit-level=low` melaporkan 0 temuan, dan `bun install --frozen-lockfile --lockfile-only` lulus. Audit semua dependency masih memiliki temuan development/legacy, termasuk `xlsx` tanpa perbaikan upstream; importer tersebut hanya berada di halaman CBT legacy yang tidak dirutekan aplikasi aktif.
- `npm ci` belum lolos pada lockfile npm karena pemeriksaan paket bundled opsional Tailwind meminta `@emnapi/wasi-threads@1.2.3` yang tidak tercatat; archive Tailwind yang diperiksa membundel `1.2.1`. CI repository menggunakan Bun frozen-lockfile dan jalur itu lulus. Tim yang memilih npm untuk instalasi pelanggan perlu menyelesaikan ketidakcocokan ini sebelum memakai `npm ci`.
- Lint/typecheck, build frontend/server, tes parser CSV PPDB, tes preflight, audit dependency production, dan validasi frozen lockfile lokal lulus. Build masih memperingatkan chunk PDF sekitar 1,46 MB.
- Progress tidak berubah: **73% kematangan fitur / 46% kesiapan go-live**. PR tetap Draft sampai lineage ledger, rehearsal migrasi, UAT/login, dan environment pelanggan memenuhi gate.


### Pemeriksaan kolom statements — 27 Oktober 2026

Pemeriksaan katalog staging hanya-baca menemukan struktur ledger `supabase_migrations.schema_migrations`: `version text NOT NULL`, `name text NULL`, dan `statements text[] NULL`. Untuk versi `20261205000000` dan `20261206000000`, `name` serta `statements` bernilai `NULL`; jumlah elemen, ukuran, dan hash atas `statements` juga tidak tersedia. Dengan demikian, metadata target tidak menyediakan isi SQL atau fingerprint yang dapat dicocokkan ke dua file migrasi lokal.

**Kesimpulan lineage:** kesamaan nomor versi saja belum membuktikan file SQL mana yang diterapkan atau bahwa efeknya cocok dengan definisi lokal. Snapshot skema saat ini juga tidak cukup untuk membuktikan seluruh efek migrasi data historis. Preflight lokal sengaja berhenti pada nama `NULL`; jangan melonggarkan guard agar batch migrasi dapat lewat.

#### Tindakan aman untuk tim backend/DBA

1. Pertahankan staging tanpa perubahan skema/data sampai rekonsiliasi selesai. Jangan jalankan `db push`, migration repair, `UPDATE/DELETE/INSERT` pada ledger, atau mengulang SQL untuk kedua versi tersebut.
2. Buat backup yang dapat dipulihkan dan rehearsal pada database lokal/klon staging yang terisolasi. Simpan schema-only snapshot awal sebagai artefak kerja tim; jangan menaruh row aplikasi atau kredensial dalam laporan.
3. Pada database terisolasi, jalankan urutan file migrasi dari repo pada versi yang diketahui bersih. Bandingkan hasilnya dengan staging menggunakan schema diff dan pemeriksaan objek spesifik: tabel/kolom/constraint, function dan trigger, RLS/policy, grants/default privileges, serta efek data migrasi PPDB yang hanya dihitung atau dicocokkan dengan fingerprint sementara.
4. Untuk setiap versi kosong, dokumentasikan bukti apakah efek migrasi sudah ada dan lengkap. Minta DBA memilih jalur rekonsiliasi yang didukung Supabase setelah backup; CLI `migration repair` mengubah catatan riwayat, bukan menguji atau menjalankan ulang efek SQL. Jangan memakai status `applied`/ `reverted` secara membabi buta pada versi yang sudah memiliki row, dan jangan mengubah row dengan SQL manual sebelum mekanisme serta bukti disetujui.
5. Setelah riwayat dan skema staging selaras, jalankan ulang migration preflight dan rehearsal seluruh migrasi yang tertunda secara bertahap. Pertahankan pemisahan staging/Production dan UAT sebelum keputusan cutover.

Rujukan resmi: [Supabase CLI — repair migration history](https://supabase.com/docs/reference/cli/supabase-migration-repair) dan [Database migrations — diagnosing sync errors](https://supabase.com/docs/guides/deployment/database-migrations). Pemeriksaan ini hanya membaca metadata; tidak ada perubahan pada staging atau Production.


### Rekonsiliasi postcondition dua versi ledger kosong — 27 Oktober 2026

Distribusi seluruh ledger mengonfirmasi 47 baris: 45 baris memiliki `name` dan `statements`; tepat dua baris tanpa keduanya adalah `20261205000000` dan `20261206000000`. Ini membatasi investigasi pada dua versi tersebut, tetapi tidak mengungkap penyebab metadata kosong.

Pemeriksaan katalog read-only atas efek utama file lokal menemukan:

| Versi | Postcondition lokal yang diperiksa di staging | Hasil |
|---|---|---|
| `20261205000000_data_api_default_privilege_hardening` | Default ACL untuk tabel, sequence, dan fungsi global/schema `public` hanya mencantumkan owner `postgres`; empat helper trigger tidak dapat dieksekusi oleh `anon`, `authenticated`, atau `service_role`. | Cocok dengan postcondition yang diharapkan dari migration lokal. |
| `20261206000000_ppdb_legacy_candidate_import` | Tiga kolom dan dua constraint metadata sumber kandidat ada; indeks unik legacy ada; tabel batch ada dengan RLS dan FORCE RLS; fungsi import memakai `SECURITY INVOKER`, `search_path = pg_catalog, public`, tanpa EXECUTE bagi `anon`/`authenticated`, dan EXECUTE untuk `service_role`. | Cocok dengan objek dan kontrol utama yang didefinisikan migration lokal. |

Ini merupakan bukti postcondition yang lebih kuat daripada kecocokan versi saja, tetapi belum membuktikan bahwa setiap statement/efek historis identik dengan file lokal: dua row tidak menyimpan SQL statement untuk fingerprint, dan pemeriksaan katalog ini bukan perbandingan definisi semua objek atau audit saat migrasi dahulu dijalankan. Karena itu status lineage tetap **belum direkonsiliasi** dan preflight tetap wajib menolak kedua row bernama `NULL`.

**Langkah backend berikutnya:** DBA membandingkan definisi lengkap objek staging dengan hasil replay migration lokal pada database terisolasi, menyimpan bukti diff dan backup yang dapat dipulihkan, lalu menentukan mekanisme koreksi riwayat yang didukung. Jangan menambah, menghapus, atau memperbarui row ledger berdasarkan hasil postcondition parsial ini. Tidak ada perubahan staging/Production dalam pemeriksaan ini.


### Kelayakan data untuk rehearsal migration tertunda — 27 Oktober 2026

Pemeriksaan hanya-baca atas kondisi data saat ini menunjukkan bahwa staging masih terlalu kosong untuk menjadi bukti kompatibilitas pada skala besar:

| Pemeriksaan kondisi awal | Hasil staging | Arti untuk rehearsal |
|---|---:|---|
| `library_books` | 0 baris; 0 ISBN aktif nonkosong; 0 kelompok ISBN kanonis duplikat | Tidak menguji risiko pembangunan ulang indeks unik pada katalog berisi. Migration `20261207000000` menjatuhkan indeks ISBN lama lalu membuat indeks unik dengan ISBN dinormalisasi; perlu uji konflik dan durasi pada salinan berisi. |
| `tahfidz_sessions` | 0 ujian selesai; 0 pelanggaran constraint | Migration `20261216000000` menambahkan lalu memvalidasi constraint hasil ujian. Ketiadaan data melanggar di staging tidak membuktikan kebersihan data historis pada tenant berisi. |
| `finance_bills` | 0 baris; 0 tagihan kandidat; 0 grup kandidat/pembayaran duplikat | Tidak menguji pengaitan tagihan PPDB atau indeks unik tipe pembayaran pada migration `20270110000000`. |
| `cooperative_wallet_ledger` | 0 baris; 0 tipe tidak dikenal; 0 pelanggaran tanda nominal/jenis | Tidak menguji penggantian constraint dan indeks sequence pada `20261230000000`. |
| Penempatan santri | 50 santri; 0 mempunyai `room_id` atau `building_id`; 0 referensi kamar/gedung tak cocok | Pemanggilan backfill di `20270109000000` akan menghasilkan 0 snapshot baseline pada data saat ini. Uji migrasi pada salinan representatif perlu menghitung jumlah snapshot, integritas label, dan waktu/lock. |

#### Risiko operasional yang harus masuk rehearsal

- Migration `20270109000000_boarding_room_history_baseline.sql` menjalankan fungsi backfill langsung di dalam migration. Efek yang dimaksud adalah satu snapshot kondisi cutover per santri yang sudah memiliki penempatan, bukan rekonstruksi perpindahan historis. Pada lingkungan berisi, ukur jumlah baris yang ditambahkan dan durasinya sebelum Production.
- Migration `20270119000000_master_data_student_search_indexes.sql` secara eksplisit membangun indeks trigram dan mengganti indeks roster lama. Jadwalkan pada jendela tulis rendah; uji waktu, penggunaan disk, dan dampak lock di salinan dengan volume mendekati tenant terbesar.
- Migration katalog buku `20261207000000` menormalkan ISBN aktif sebelum indeks unik dibuat. Pastikan konflik duplikat ISBN kanonis dibersihkan melalui rencana data yang disetujui, bukan dengan menghapus record otomatis.
- Importer legacy yang didefinisikan sebagai fungsi database tidak semuanya berjalan otomatis saat migration. Untuk setiap impor, lakukan preview, rekonsiliasi jumlah/fingerprint, uji replay idempotent, dan validasi actor/tenant pada staging berisi sebelum mengaktifkan endpoint.

Hasil di atas adalah hitungan agregat tanpa nilai record. Tidak ada data atau migration yang ditulis. CI menguji skema dan data sintetis terisolasi; staging saat ini belum dapat membuktikan behavior pada volume atau variasi data pesantren besar. Rehearsal skala dan rekonsiliasi payload tetap menjadi gate go-live.

### Verifikasi source SQL ledger dan preflight lengkap — 27 Oktober 2026

Pembacaan ulang baca-saja pada staging mengonfirmasi **47 baris ledger**, dengan **45 baris berisi `statements`**. Hanya versi `20261205000000` dan `20261206000000` yang masih memiliki `name = NULL` sekaligus `statements = NULL`.

Semua 45 array SQL yang tersedia dibandingkan dengan file migration sumber pada urutan statement. Perbandingan mengabaikan perbedaan CRLF, komentar SQL di luar literal, dan spasi di luar literal; isi string serta body dollar-quoted dipertahankan. Hasilnya **45/45 cocok** setelah normalisasi tersebut. Ini membuktikan kesesuaian metadata SQL untuk 45 row, bukan kesetaraan schema/data secara menyeluruh. Dua row kosong tetap tidak dapat dibuktikan lewat ledger.

Commit `89a0773249f0ea918021b284f31d1f9c483f13cb` pada PR #13 menambahkan perbandingan SQL ini ke `scripts/preflight-supabase-migrations.mjs`. Preflight membaca `version`, `name`, dan `statements` di transaksi `READ ONLY`; ia menghentikan rencana staging bila ada versi tak dikenal/di luar urutan, nama tidak cocok, metadata SQL kosong, atau statement berbeda. Laporan hanya menampilkan versi, jumlah statement, dan posisi mismatch—tidak mencetak isi SQL. Tes lokal `node scripts/test-migration-preflight.mjs` lulus, termasuk parsing 91 file migration dan kasus metadata kosong.

GitHub Actions [run 40428532956](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40428532956) lulus pada kedua job: frontend/build/Firebase bundle guard serta migrasi, API auth/tenant, dan pgTAP. CI memakai Supabase lokal terisolasi; pemeriksaan ulang staging tetap hanya baca. Tidak ada migration atau data yang diterapkan.

**Status lineage:** 45 migration memiliki bukti metadata SQL yang cocok; dua versi tanpa metadata masih harus direkonsiliasi oleh tim backend/DBA lewat perbandingan objek lengkap pada klon disposable yang dipulihkan dari backup. Jangan mengubah row ledger atau membuka guard preflight berdasarkan postcondition parsial. Setelah rekonsiliasi dua versi itu, jalankan ulang preflight sebelum menyusun rehearsal batch pending.

Estimasi proyek tidak berubah: **73% kematangan fitur / 46% kesiapan go-live**. Rehearsal di clone berisi, rekonsiliasi payload lintas domain, login/UAT, rotasi secret, dan simulasi environment pelanggan tetap menjadi release gate.

### Rekonsiliasi postcondition katalog untuk dua versi tanpa metadata — 27 Oktober 2026

Pemeriksaan katalog baca-saja diperluas pada objek yang disentuh dua file migration. Ledger saat ini tetap 47 row, 45 memiliki `statements`; `20261205000000` dan `20261206000000` tetap `name = NULL` dan `statements = NULL`.

Untuk `20261205000000_data_api_default_privilege_hardening`, ACL default global dan schema `public` untuk tabel, sequence, dan fungsi hanya menunjukkan owner `postgres`; fungsi global dan schema `public` tidak memberi `EXECUTE` ke `PUBLIC`, `anon`, `authenticated`, atau `service_role`. Empat helper trigger yang ditargetkan migration juga tidak dapat dieksekusi langsung oleh ketiga role Data API/server tersebut.

Untuk `20261206000000_ppdb_legacy_candidate_import`, katalog menunjukkan kolom metadata sumber, constraint ter-validate, partial unique index, seluruh kolom/constraint/foreign key batch, dan RLS + FORCE RLS pada tabel batch. Role `anon` dan `authenticated` tidak memiliki CRUD pada tabel batch; `service_role` memiliki CRUD sesuai migration. Komentar tabel dan kolom fingerprint cocok dengan source. Definisi parameter, `SECURITY INVOKER`, `search_path`, owner, dan EXECUTE ACL fungsi cocok; body fungsi database sebanyak 5.165 karakter sama dengan body file repository setelah normalisasi line ending.

Agregat yang dibaca tanpa menampilkan record: terdapat 50 kandidat bertanda `legacy_firestore`, metadata kandidat invalid 0; satu batch mencatat source 50, imported 50, skipped 0 dan jumlahnya cocok dengan kandidat legacy. Tidak ada data atau isi identitas yang dicantumkan.

**Batas kesimpulan:** postcondition live yang diperiksa konsisten dengan kedua migration, termasuk body fungsi PPDB yang sama. Ini belum membuktikan kapan atau melalui jalur apa objek dibuat, bahwa tidak ada efek historis lain di luar daftar yang diperiksa, atau bahwa kedua row ledger memiliki lineage SQL yang benar. Karena itu preflight tetap berhenti dan status metadata tetap harus diselesaikan DBA setelah backup serta rehearsal/replay pada clone disposable. Jangan memperbarui ledger manual atau menerapkan ulang DDL ke staging berdasarkan bukti parsial ini. Semua query pada pemeriksaan ini memakai transaksi `READ ONLY`.
