# Checkpoint terkini — rekonsiliasi target sebelum migrasi (30 Oktober 2026)

## Kondisi terverifikasi

- PR #13 masih **Open / Draft**. Head sebelum catatan ini: `2387fe8a4547595335e2c71c19f1f1b03c61401e`; base `main`: `c8738185ff6e5080ae427ef0021ee25681036c40`. Jangan anggap merge atau deploy sudah dilakukan.
- Ref Supabase `ptsasgdvgrbdtgyqieie` sebelumnya disebut staging, tetapi Dashboard yang ditinjau menampilkan branch `main / PRODUCTION`. Sampai pemilik dan tim mengonfirmasi sebaliknya, perlakukan ref ini sebagai Production. Project berada pada Free plan, halaman Backups menyatakan backup project tidak termasuk, dan tidak tersedia development branch untuk rehearsal.
- GitHub repo `hamdanfaiz/ERP4-Pesantren` terhubung ke project tersebut. Toggle auto-deploy ke Production saat diperiksa dalam keadaan **mati**. Jangan aktifkan sebelum lineage diselesaikan; merge PR tidak boleh menjadi pengganti persetujuan perubahan database.
- Snapshot ledger yang diperiksa sebelumnya memuat 47 versi sampai `20261206000000`; source PR #13 memuat 96 migration, jadi ada 49 versi source yang belum tercatat. Metadata `name` dan `statements` kosong pada dua versi terakhir ledger (`20261205000000`, `20261206000000`). Preflight ketat berhenti pada kondisi ini. Ini bukan alasan untuk mengubah ledger secara manual atau menjalankan `migration repair`.
- MCP/konektor Supabase di sesi ini masih menolak operasi baca untuk ref tersebut dengan `MCP -32600: You do not have permission to perform this action`. Tidak ada migration, data, atau perubahan konfigurasi database yang diterapkan.
- CI pada head dokumentasi `2387fe8a4547595335e2c71c19f1f1b03c61401e` sedang berjalan ketika catatan ini dibuat: job frontend/Firebase guard dan job migration/API/pgTAP berstatus `in_progress`; check Supabase Preview dilewati karena tidak ada Supabase Branch terkait. Kode pada commit `7eb3848e7ce8f560818db640959210da46491b6e` sebelumnya lulus suite sintetis; hasil lokal/CI sintetis bukan bukti target live.
- Runtime source PR #13 memakai Supabase-only gate; Firebase runtime dan importer arsip tetap tertutup, dengan empat route placeholder fail-closed. Belum ada bukti UAT autentikasi, role/tenant, atau alur operasional terhadap project target.
- Data Firestore adalah dummy dan tidak perlu dipindahkan. Fokus migrasi adalah membangun/menyelaraskan skema, relasi, kebijakan tenant, dan logic pada Supabase; data contoh dapat dibuat manual setelah alur stabil.
- Secret Supabase dan password database yang pernah ditempel di percakapan dianggap terekspos. Rotasi dan pembaruan melalui secret manager/environment deployment tetap menjadi syarat sebelum go-live.

## Review statis tambahan: empat migration terakhir

Empat migration yang ditambahkan sesudah snapshot statis sebelumnya (source saja, belum dijalankan terhadap staging/Production):

- `20270121000000_tenant_admin_bootstrap.sql`: RPC bootstrap tenant/Admin pertama dibuat idempoten dan hak EXECUTE hanya diberikan kepada `service_role`; pengulangan dengan konfigurasi atau profil yang berbeda ditolak.
- `20270122000000_lms_learning_record_tenant_fk.sql`: memakai `lock_timeout = '5s'`, memeriksa asosiasi tenant sebelum mengganti FK LMS menjadi FK komposit tenant, lalu membuat empat indeks. Rehearsal harus memeriksa hubungan existing dan dampak lock; migration akan berhenti bila mendeteksi pasangan lintas tenant.
- `20270123000000_public_ppdb_idempotency.sql`: menambah fingerprint HMAC untuk retry PPDB, menyerialkan submit kandidat yang sama dengan advisory transaction lock, hanya mengizinkan RPC bagi `service_role`, dan mengembalikan path dokumen lama untuk proses cleanup terpisah.
- `20270124000000_finance_proof_upload_rate_limit.sql`: mengganti constraint endpoint dengan pemeriksaan bahwa tepat satu constraint lama cocok, mengunci rate-limit table dari role klien, dan membatasi unggah bukti melalui counter Postgres bersama per tenant/pengguna dalam jendela 15 menit; RPC hanya untuk `service_role`.

Tidak ditemukan penghapusan tabel/kolom pada keempat file tersebut. Ini hanya review source statis: tidak membuktikan lock duration, kondisi data yang ada, urutan/aplikabilitas pada target, atau perilaku runtime. CI lokal sintetis tetap perlu selesai; rehearsal staging dan postcondition tetap wajib.

## Tindakan tim backend sebelum migrasi

1. Pastikan secara tertulis apakah `ptsasgdvgrbdtgyqieie` benar-benar staging atau Production. Jika Production, sediakan project staging terpisah dengan data sintetis. Jangan gunakan Production untuk rehearsal atau membuat branch jika project plan/backup tidak mendukung pemulihan.
2. Dari checkout persis PR #13, jalankan `node scripts/preflight-supabase-migrations.mjs` dengan akses metadata baca-saja, lalu arsipkan output versi saja. Bandingkan seluruh 96 file migration dengan ledger dan catat schema/grant/RLS/Storage baseline.
3. Tinjau dua versi ledger tanpa metadata terhadap file source dan bukti postcondition. Rekonsiliasi lineage harus melalui prosedur yang ditinjau pemilik database; jangan menyisipkan atau mengedit baris ledger manual dan jangan menandai versi berhasil hanya agar preflight lolos.
4. Pada staging yang dapat dibuang/dipulihkan, bangun baseline yang disetujui, rehearsal migration pending secara berurutan, ukur lock/waktu, periksa postcondition, RLS/grant, Storage privat, dan ulangi restore dari backup. Simpan log dan hasil versi; tidak perlu menyalin data dummy Firestore.
5. Setelah staging lulus, jalankan UAT login/matriks role-tenant, PPDB, transaksi NIS/Tahfidz/keuangan, komunikasi, unggah Storage, backup/restore, dan deployment customer-managed. Rotasi secret, siapkan rollback/monitoring, dan minta sign-off pemilik sebelum perubahan Production.

## Progress checkpoint

- **Kematangan fitur: sekitar 73% (estimasi sebelumnya, belum dihitung ulang dari UAT).**
- **Kesiapan go-live: sekitar 40% (estimasi, turun dari 46% checkpoint sebelumnya)** karena target yang terlihat berlabel Production, tidak ada backup project/branch untuk rehearsal, 49 migration belum tercatat, dan dua metadata ledger kosong. Ini bukan metrik otomatis; angka baru harus direvisi setelah bukti staging/restore dan UAT tersedia.

---

> **STATUS TERKINI — 27 Oktober 2026:** Dokumen ini memuat pemeriksaan historis dan telah disupersede untuk tindakan saat ini. Pemilik memutuskan data Firestore dummy **tidak perlu disalin**; jangan jalankan importer, rekonsiliasi jumlah, atau penghapusan data staging sebagai release gate. Ikuti [checkpoint schema dan logic tanpa salin data](./CHECKPOINT_NO_DATA_COPY_SCHEMA_READINESS_2026-10-27.md) untuk status PR/head, angka migration terbaru, kriteria relasi tenant, dan langkah berikutnya.

# Handoff Hambatan Teknis — Supabase Cutover ERP4 Pesantren

**Checkpoint:** 27 Oktober 2026  
**PR cutover:** [#13 — Supabase-only runtime cutover](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)  
**Target Supabase:** project ref `ptsasgdvgrbdtgyqieie`  
**Sumber arsip:** Firestore project `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`  
**Panduan detail terkait:** [Petunjuk Teknis Akses dan Rehearsal Migrasi](./TEAM_TECHNICAL_ACCESS_AND_REHEARSAL_RUNBOOK_2026-10-26.md)

> **Pembaruan 27 Oktober 2026:** project ref `ptsasgdvgrbdtgyqieie` adalah **staging**, bukan Production. Revalidasi baca-saja saat head PR #13 `6badbd7f2f9a1e228a2124dbc75b010f626f1ce7` menunjukkan 47 versi ledger sampai `20261206000000`, sedangkan source berisi 92 migration; 45 versi `20261207000000`–`20270120000000` belum tercatat. Katalog `public` menunjukkan 119/119 tabel dengan RLS aktif dan FORCE, akses SELECT efektif `anon` pada 0 tabel dan `authenticated` pada 5 tabel, serta tidak ada hak tulis efektif bagi kedua role tersebut. RPC audiens komunikasi kanonis belum ada di staging. Detail hasil dan batas pemeriksaan ada di [TEAM_STAGING_BASELINE_2026-10-27.md](./TEAM_STAGING_BASELINE_2026-10-27.md). Jangan menerapkan batch migration sebelum lineage, backup/restore, dan rehearsal pada staging yang dapat dipulihkan selesai.

> **Keputusan ruang lingkup 27 Oktober 2026:** pemilik produk tidak memerlukan penyalinan data Firestore karena isinya dummy. Langkah 5 (rekonsiliasi/impor arsip) dan bagian import rehearsal di dokumen historis ini tidak wajib dijalankan. Untuk memvalidasi logika, relasi, isolasi tenant/role, dan transaksi, gunakan fixture sintetis melalui CI/Supabase lokal; data contoh operasional dapat dibuat manual kemudian. Jangan menghapus data staging. Gerbang migrasi **schema** tetap berlaku: head PR #13 `540bf7d` memiliki 92 file, 45 versi belum tercatat pada ledger staging, dan rehearsal upgrade harus dilakukan setelah lineage serta backup/restore direkonsiliasi.

Dokumen ini adalah daftar kerja untuk tim teknis yang memiliki akses lokal ke repository dan project. Semua pemeriksaan live di bawah dimulai dengan akses baca-saja. Jangan menerapkan migration atau mengimpor data ke Production sebelum gerbang rilis pada dokumen ini terpenuhi.

## Ringkasan kondisi dan hambatan

- PR #13 masih **Open/Draft**, belum siap merge atau deploy. Kode pada head terakhir yang tercatat lulus CI menggunakan uji sintetis dan Supabase lokal terisolasi; itu bukan bukti bahwa database, Auth, Storage, atau data Production sudah tervalidasi.
- Pada inspeksi staging baca-saja terbaru, ledger menampilkan 47 versi. Head PR #13 `540bf7d` berisi 92 file migration sampai `20270120000000`; 45 versi setelah `20261206000000` belum terlihat di ledger. **Jangan menjalankan 45 migration sekaligus berdasarkan hitungan ini.** Verifikasi ledger, cocokkan schema/RLS/grant, tinjau migration tertunda, dan rehearsal pada staging yang dapat dipulihkan. Data Firestore dummy tidak perlu diimpor.
- Tanggal versi terakhir di Dashboard terlihat lebih maju dari tanggal checkpoint. Tim harus memastikan jam database, asal metadata, dan apakah ledger target yang dilihat memang project yang benar.
- Halaman Schema Visualizer dan daftar Policies di Dashboard tidak berhasil dimuat saat pemeriksaan. Hitungan policy 0 pada daftar bucket Storage juga tidak membuktikan bahwa seluruh konfigurasi RLS aman atau tidak aman.
- Inventaris Firestore sebelumnya mencatat 453/453 dokumen `master_data` dan 50/50 dokumen `candidates` tidak mempunyai `tenantId` tingkat atas. Data tenant tidak boleh ditebak atau diisi otomatis tanpa keputusan pemilik data.
- Dua bucket terlihat di Dashboard: `ppdb-documents` dan `erp4-private-finance-proofs`. Status private live, policy `storage.objects`, dan daftar bucket lain tetap perlu diverifikasi lewat katalog.
- Workspace kerja sebelumnya tidak mempunyai Supabase CLI, `psql`, atau Bun di PATH. CI repository menggunakan Supabase CLI 2.84.2 dan Bun 1.4.4.
- Secret key Supabase dan password database pernah dibagikan melalui chat. Rotasi keduanya adalah gerbang sebelum Production. Nilai baru harus dibuat dan disimpan oleh tim/pemilik project; jangan mengirim nilai rahasia kepada Codex atau menaruhnya pada GitHub.

Tidak ada migration atau data Production yang diterapkan pada checkpoint ini.

## Pekerjaan yang diminta dari tim

| Urutan | Pemilik | Tindakan | Bukti yang dikembalikan |
|---|---|---|---|
| 1. Akses & alat | Pemilik project / backend | Beri akses minimum ke target Supabase dan Firestore; siapkan runner lokal; pasang CLI dan driver sesuai bagian berikut. Pastikan ref target tepat. | Versi alat, project ref, hasil autentikasi tanpa token/secret. |
| 2. Rotasi secret | Pemilik Supabase | Rotasi secret key server dan password database yang pernah terekspos; simpan nilai baru di secret manager atau file lokal yang diabaikan Git. Perbarui semua environment yang sah dan cabut nilai lama. | Konfirmasi rotasi per environment; jangan kirim nilai rahasia. |
| 3. Baseline target | Backend/DBA | Jalankan perbandingan ledger, inventaris schema/RLS/grant/Storage baca-saja di target. Rekonsiliasi hasil dengan migration source PR #13 dan jelaskan anomali tanggal. | Laporan versi lokal/remote, diff schema, daftar policy/grant/bucket, error yang sudah disanitasi. |
| 4. Tinjau migration tertunda | Backend/DBA | Klasifikasikan setiap migration yang belum diterapkan: operasi destruktif, backfill, constraint, indeks, lock/downtime, kebutuhan extension, dan urutan dependensi. | Matriks migration, urutan apply yang direkomendasikan, rollback/restore plan. |
| 5. Fixture fungsional | Backend | Siapkan fixture sintetis yang dapat diulang pada Supabase lokal/CI untuk uji relasi, otorisasi tenant/role, transaksi, idempotensi, dan validasi domain. Tidak perlu mengambil atau mengimpor dokumen Firestore. | Test/pgTAP/API lulus dengan data sintetis; konflik lintas tenant dan duplikasi transaksi ditolak. |
| 6. Rehearsal schema | Backend/DBA | Buat staging terpisah atau branch database yang dapat dipulihkan; buktikan backup/restore; lalu rehearsal migration schema tanpa impor data Firestore. | Waktu backup/restore/migration, log yang disanitasi, hasil CI/pgTAP dan perbandingan schema. |
| 7. UAT & operasi | QA + pemilik pesantren | Uji login, hak role/tenant, PPDB, Master Data/NIS, keuangan, Tahfidz, asrama, Storage privat, responsif, kapasitas, serta backup/restore di environment pemasangan representatif. | Checklist UAT ditandatangani, daftar masalah, kapasitas terukur, dan runbook operasional. |

## Setup lokal dan pemisahan secret

Checkout head PR #13 yang sedang ditinjau dan jalankan dari root repository. Jangan bekerja dari folder kerja orang lain yang memiliki perubahan lokal.

Gunakan versi yang sama dengan pipeline:

- Supabase CLI **2.84.2** — panduan pemasangan resmi: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
- Bun **1.4.4** untuk suite aplikasi yang menggunakan Bun.
- `psql` dari PostgreSQL untuk koneksi/verifikasi database bila diperlukan.

Pastikan perintah berikut berhasil sebelum melanjutkan:

```powershell
supabase --version
psql --version
bun --version
```

Buat file environment lokal yang sudah dipastikan diabaikan Git atau gunakan secret manager. Jangan menaruh file ini dalam commit, artefak CI publik, issue, log, atau chat. Contoh nama variabel, tanpa nilai rahasia:

```dotenv
# Server/runtime saja
SUPABASE_PROJECT_REF=ptsasgdvgrbdtgyqieie
SUPABASE_URL=https://ptsasgdvgrbdtgyqieie.supabase.co
SUPABASE_SECRET_KEY=<SECRET_BARU_SERVER_SAJA>
SUPABASE_JWKS_URL=https://ptsasgdvgrbdtgyqieie.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_DB_POOLER_URL=<SESSION_POOLER_URL_BARU_DARI_DASHBOARD>

# Build browser saja — hanya dua nilai ini yang boleh berawalan VITE_
VITE_SUPABASE_URL=https://ptsasgdvgrbdtgyqieie.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY_DARI_DASHBOARD>
```

Aturan konfigurasi:

- Jangan pernah membuat `VITE_SUPABASE_SECRET_KEY`; publishable key bukan pengganti kontrol RLS.
- Secret key, connection string database, service role, dan kredensial Firebase Admin hanya boleh dipakai proses server/runner yang dipercaya.
- Gunakan session pooler yang disediakan Dashboard bila jaringan runner tidak dapat mencapai host database IPv6 langsung. Jangan memasukkan password mentah ke argumen command yang tersimpan di shell history.
- Biarkan semua flag `SUPABASE_*_RUNTIME_ENABLED`, `*_IMPORT_ENABLED`, `*_APPLY_ENABLED`, serta `LEGACY_FIREBASE_ADMIN_ENABLED` mati sampai gerbang staging terkait lulus. Flag bukan pengganti verifikasi RLS atau hak tenant.

## Pemeriksaan database baca-saja

### 1. Cocokkan ledger migration

Dari root repository, gunakan URL pooler yang hanya tersedia di environment lokal:

```powershell
supabase migration list --db-url "$env:SUPABASE_DB_POOLER_URL"
```

Simpan hanya nomor versi/status lokal dan remote. Perintah ini membandingkan catatan migration, bukan membuktikan schema target sama dengan source. Jangan menjalankan `supabase db push`, `supabase migration up`, `supabase migration repair`, atau SQL DDL pada target sebagai bagian audit.

### 2. Baca katalog schema, RLS, dan Storage

Di SQL Editor pilih **New query**; jangan menimpa query lama yang mungkin belum tersimpan. Jalankan SELECT katalog dari bagian 4 di [runbook akses dan rehearsal](./TEAM_TECHNICAL_ACCESS_AND_REHEARSAL_RUNBOOK_2026-10-26.md). Minimal verifikasi:

- jam database dan zona waktu;
- seluruh tabel/view di schema yang diekspos Data API, status `relrowsecurity` dan `relforcerowsecurity`;
- isi `pg_policies` untuk schema yang diekspos dan `storage.objects`;
- grant role `anon`, `authenticated`, `service_role`, dan `PUBLIC`;
- `storage.buckets.public`, batas ukuran, MIME, serta policy Storage;
- fungsi `SECURITY DEFINER`, view, dan hak eksekusinya.

Tambahkan pemeriksaan ACL schema/default. Migration pada source mengatur default privileges untuk role `postgres`; pastikan hasil target memang efektif pada role migration yang dipakai. Output hanya metadata hak akses.

```sql
SELECT current_user AS migration_role, session_user AS login_role,
       current_setting('search_path') AS session_search_path;

SELECT nspname AS schema_name, nspowner::regrole AS owner, nspacl AS acl
FROM pg_namespace
WHERE nspname IN ('public', 'storage', 'extensions')
ORDER BY nspname;

SELECT COALESCE(n.nspname, '<global>') AS schema_name,
       r.rolname AS default_privilege_owner,
       d.defaclobjtype AS object_type,
       d.defaclacl AS default_acl
FROM pg_default_acl AS d
JOIN pg_roles AS r ON r.oid = d.defaclrole
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0
ORDER BY schema_name, default_privilege_owner, object_type;

SELECT p.oid::regprocedure::text AS function_signature,
       p.prosecdef AS security_definer,
       p.proacl AS function_acl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY function_signature;
```

Ambil metadata konfigurasi saja. Jangan query atau ekspor baris pengguna, password, token, bukti pembayaran, atau isi berkas untuk audit baseline.

### 3. Review setiap migration yang tertunda

Untuk tiap file tertunda catat:

1. tabel/kolom/index/function/policy yang ditambah atau diubah;
2. `DROP`, perubahan tipe, `NOT NULL`, backfill, atau data rewrite;
3. indeks non-concurrent dan perkiraan lock/downtime;
4. asumsi data dan urutan migration yang diperlukan;
5. dampak pada API aktif, RLS/tenant, Storage, serta versi PostgreSQL;
6. cara memulihkan dari backup yang sudah diuji.

Kalau migration bergantung pada bentuk schema/data yang berbeda dari target, hentikan rehearsal dan kirimkan diff yang disanitasi. Jangan “memperbaiki” ledger menggunakan repair agar daftar terlihat cocok.

## Hasil pemeriksaan statis awal 44 migration yang tertunda (baseline terdahulu)

**Source diperiksa:** head PR #13 `59578f7fd2a7f95cd39335b74bbc4b1695e233fc`, 44 file dengan versi setelah `20261206000000`. Pemeriksaan ini membaca SQL source saja; tidak terkoneksi ke database target dan tidak mengubah data.

- Pencarian statis tidak menemukan `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, atau `TRUNCATE` pada 44 file. Ada perubahan `DROP INDEX`, `DROP CONSTRAINT`, dan pergantian fungsi; perubahan itu tetap harus ditinjau.
- Audit lintas 91 migration menemukan 74 definisi/kemunculan `SECURITY DEFINER`; setiap kemunculan yang diperiksa memiliki `SET search_path`. Source migration `20261205000000_data_api_default_privilege_hardening.sql` mencabut default `EXECUTE` dari `PUBLIC` dan membatasi default object grants untuk role Data API. Versi itu muncul pada ledger Dashboard, tetapi itu hanya bukti versi source tercatat, bukan bukti ACL efektif target. Tim harus memverifikasi ACL schema/default dan role yang dipakai saat migration dijalankan.
- Ditemukan **40 pernyataan `CREATE INDEX` biasa** (bukan `CONCURRENTLY`). Ukuran tabel, durasi, lock, ruang disk, dan dampaknya terhadap penulisan aplikasi belum diketahui. Ukur melalui rehearsal dari backup; jadwalkan maintenance window bila perlu.
- Sebagian migration mengisi tabel baru saat migration berjalan. `ON CONFLICT DO NOTHING` mempertahankan idempotensi, tetapi dapat menyembunyikan konflik sumber. Hitung konflik sebelum rehearsal dan cocokkan jumlah baris yang diharapkan dengan yang benar-benar dibuat.

| Migration | Efek yang terjadi saat migration | Pemeriksaan wajib sebelum rehearsal |
|---|---|---|
| `20261207000000_library_legacy_catalog_import.sql` | Mengganti indeks ISBN dengan indeks unik berdasarkan ISBN aktif yang dinormalisasi; menambahkan RPC import katalog yang hanya dapat dijalankan `service_role`. | Cari ISBN canonical duplikat per tenant; jangan menghapus atau menggabungkan katalog otomatis. |
| `20261213000000_marketplace_mutation_payload_guard.sql` | Menyalin kunci permintaan lama dari produk, pergerakan stok, pesanan, dan event status ke ledger idempotensi. | Pastikan satu pasangan tenant/kunci permintaan tidak muncul di lebih dari satu operasi sumber. `ON CONFLICT DO NOTHING` bisa menyisakan satu replay saja. |
| `20261214000000_donation_mutation_payload_guard.sql`, `20261215000000_laundry_mutation_payload_guard.sql`, `20261231000000_cooperative_supplier_payload_idempotency.sql` | Menyalin kunci idempotensi historis ke ledger baru; payload lama yang tidak tersedia disimpan sebagai `NULL`, bukan direkonstruksi. | Hitung kunci tenant/request yang berulang dan konflik aktor/operasi; bandingkan jumlah event eligible dengan baris ledger hasil seed. |
| `20261216000000_tahfidz_session_result_integrity.sql` | Memvalidasi constraint bahwa ujian Tahfidz berstatus selesai memiliki nilai dan hasil lulus/ulang. | Hitung ujian selesai dengan nilai/hasil kosong atau di luar rentang; bereskan data secara terverifikasi sebelum validasi. |
| `20261230000000_cooperative_financial_legacy_import.sql` | Mengubah constraint ledger koperasi dan menambah RPC impor saldo/transaksi historis. Fungsi impor tidak menjalankan impor arsip sendiri; pemanggilan apply tetap tindakan terpisah. | Periksa tipe transaksi dan tanda nominal terhadap constraint baru. Cocokkan saldo awal, transaksi, penjualan, saldo akhir, urutan ledger, serta batas kunci idempotensi. Uji hanya dengan snapshot finance yang direkonsiliasi di staging. |
| `20270102000000_guardian_accounts_and_invitations.sql` | Membuat relasi akun Wali untuk profil aktif yang dapat ditautkan ke tepat satu Wali aktif; profil ambigu dibiarkan tanpa akses. Konflik unique diabaikan oleh `ON CONFLICT DO NOTHING`. | Hitung profil yang tidak tertaut/ambigu dan Wali yang memiliki lebih dari satu profil calon. Tinjau konflik manual; jangan menganggap setiap profil Wali berhasil terhubung. |
| `20270109000000_boarding_room_history_baseline.sql` | Menambahkan satu `baseline_snapshot` untuk penempatan kamar/gedung saat cutover. Ini bukan rekonstruksi histori sebelum cutover. | Hitung siswa dengan penempatan sekarang, pastikan referensi kamar/gedung cocok dalam tenant, dan pastikan tidak ada baseline ganda sebelum indeks unik. |
| `20270110000000_ppdb_candidate_finance_bills.sql` | Menambahkan hubungan tagihan calon santri, indeks unik jenis tagihan per calon, serta memperluas daftar aksi permintaan keuangan. | Cari tagihan duplikat kandidat/jenis dan aksi lama yang tidak termasuk daftar constraint baru. Uji linkage calon→santri dan laporan keuangan setelah onboarding. |
| `20270116000000_private_library_digital_assets.sql`, `20270117000000_document_center_core.sql` | Membuat bucket Storage dengan `public=false`; saat bucket sudah ada, konfigurasi bucket diubah menjadi private dan batas/MIME diperbarui. | Cocokkan bucket lama, metadata objek, jalur signed upload/download, ukuran dan MIME. Pastikan tidak ada modul lama yang mengandalkan bucket yang sama sebagai publik. Jangan membuka isi file. |
| `20270119000000_master_data_student_search_indexes.sql` | Menambah indeks pencarian/keyset dan menghapus indeks pencarian lama. | Periksa ukuran tabel, rencana query dan lock; pastikan jalur pencarian baru tetap memenuhi kontrak tenant/paginasi sebelum flag runtime diaktifkan. |

### Query preflight agregat

Jalankan pada **salinan staging/hasil restore** setelah migration pendahulu tersedia, atau pada target dengan izin baca-saja jika tabelnya sudah ada. Bila nama tabel/kolom berbeda dari source, hentikan dan rekonsiliasi drift; jangan mengubah query lama yang belum tersimpan. Hasil yang dibagikan cukup hitungan agregat.

ISBN aktif yang akan bentrok setelah normalisasi:

```sql
SELECT tenant_id,
       regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g') AS isbn_canonical,
       count(*) AS row_count
FROM public.library_books
WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND status = 'active'
GROUP BY tenant_id, regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g')
HAVING count(*) > 1;
```

Ujian Tahfidz selesai yang tidak memenuhi hasil wajib:

```sql
SELECT tenant_id, count(*) AS invalid_completed_exams
FROM public.tahfidz_sessions
WHERE kind = 'exam' AND status = 'completed'
  AND (score IS NULL OR score NOT BETWEEN 0 AND 100
       OR outcome IS NULL OR outcome NOT IN ('pass', 'retest'))
GROUP BY tenant_id;
```

Nilai/jenis ledger koperasi yang tidak sesuai constraint baru:

```sql
SELECT entry_type, count(*) AS invalid_rows
FROM public.cooperative_wallet_ledger
WHERE entry_type NOT IN ('top_up', 'purchase', 'adjustment', 'opening_balance')
   OR NOT (
     (entry_type IN ('top_up', 'opening_balance') AND amount_delta > 0 AND sale_id IS NULL)
     OR (entry_type = 'purchase' AND amount_delta < 0 AND sale_id IS NOT NULL)
     OR (entry_type = 'adjustment' AND sale_id IS NULL)
   )
GROUP BY entry_type;
```

Aksi finance lama yang akan ditolak constraint (jalankan sebelum migration):

```sql
SELECT action, count(*) AS row_count
FROM public.finance_write_requests
WHERE action NOT IN (
  'create_bills', 'create_ppdb_bill', 'create_expense', 'approve_expense',
  'reject_expense', 'settle_bill', 'reject_bill', 'set_lock', 'payment_proof'
)
GROUP BY action;
```

Query kandidat duplikat hanya dapat dijalankan bila kolom `finance_bills.candidate_id` sudah ada sebelum migration karena perubahan schema terdahulu atau drift. Pada urutan bersih, migration menambahkan kolom itu dan record lama dimulai dengan nilai `NULL`; catat kondisi tersebut, jangan menganggap query yang kolomnya belum ada sebagai kegagalan migration.

```sql
SELECT tenant_id, candidate_id, payment_type, count(*) AS row_count
FROM public.finance_bills
WHERE candidate_id IS NOT NULL
GROUP BY tenant_id, candidate_id, payment_type
HAVING count(*) > 1;
```

Kunci request historis harus dihitung dengan query yang sama persis dengan `INSERT … SELECT` tiap migration. Untuk marketplace, gabungkan pasangan `tenant_id/client_request_id` eligible dari empat sumber yang disebut di tabel; untuk Donation, Laundry, dan pemasok koperasi gunakan sumber masing-masing. Laporkan hanya total pasangan unik, kunci berulang lintas operasi, konflik aktor, dan selisih jumlah seed—tanpa payload atau identitas. Untuk Wali, gunakan CTE sumber `unique_legacy_guardian` dalam migration, kemudian hitung profil ambigu dan beberapa profil calon per Wali. Untuk baseline asrama, hitung `students` yang memiliki `room_id` atau `building_id` per tenant dan cocokkan dengan jumlah baseline yang akan ditambahkan.

### Pemeriksaan kunci idempotensi yang akan di-seed

Marketplace menggabungkan empat jenis request lama ke satu primary key `(tenant_id, client_request_id)`. Jalankan query berikut sebelum migration `20261213000000`; hasil hanya agregat per tenant, tanpa payload/ID request:

```sql
WITH source_keys AS (
  SELECT tenant_id, client_request_id, 'manage_product'::text AS operation, created_by AS actor_user_id
  FROM public.marketplace_products WHERE source_system = 'supabase_runtime'
  UNION ALL
  SELECT tenant_id, client_request_id, 'adjust_stock', created_by
  FROM public.marketplace_stock_movements
  WHERE order_id IS NULL AND reason <> 'Stok awal produk'
  UNION ALL
  SELECT tenant_id, client_request_id, 'create_order', created_by
  FROM public.marketplace_orders WHERE source_system = 'supabase_runtime'
  UNION ALL
  SELECT tenant_id, client_request_id, 'transition_order', created_by
  FROM public.marketplace_order_events WHERE event_type = 'status_changed'
),
key_groups AS (
  SELECT tenant_id, client_request_id,
         count(*) AS source_rows,
         count(DISTINCT operation) AS operation_count,
         count(*) FILTER (WHERE actor_user_id IS NULL) AS null_actor_rows
  FROM source_keys
  WHERE client_request_id IS NOT NULL
  GROUP BY tenant_id, client_request_id
)
SELECT tenant_id,
       count(*) FILTER (WHERE source_rows > 1) AS repeated_keys,
       count(*) FILTER (WHERE operation_count > 1) AS cross_operation_keys,
       sum(greatest(source_rows - 1, 0)) AS extra_source_rows,
       sum(null_actor_rows) AS null_actor_rows
FROM key_groups
GROUP BY tenant_id;
```

Hitung juga row tanpa kunci, serta pastikan setiap aktor sumber memiliki profil pada tenant yang sama. Periksa apakah satu produk mempunyai lebih dari satu pergerakan stok awal yang akan ikut pada `LEFT JOIN`; kalau ya, satu produk dapat menghasilkan beberapa calon receipt.

Untuk Donation, Laundry, dan pemasok koperasi jalankan hitungan agregat dengan kondisi persis pada source migration:

- Donation: `donation_audit_events` dengan kombinasi entity/action yang dipilih migration; hitung `tenant_id/client_request_id` berulang dan aktor yang tidak ada pada profil tenant.
- Laundry: hitung kunci berulang pada `laundry_events`, aktor yang tidak ada pada profil tenant, serta event type selain `order_received`, `status_changed`, dan `settings_updated`. Migration memetakan event type lewat `CASE`; tipe yang tidak dikenal menghasilkan operation kosong dan dapat menggagalkan constraint insert.
- Pemasok koperasi: hitung `cooperative_suppliers.client_request_id` berulang serta baris dengan `COALESCE(updated_by, created_by)` kosong/tidak ditemukan pada profil tenant.

Jangan melanjutkan bila konflik atau baris tanpa aktor/kunci ditemukan sebelum penyebab dan penanganan setiap record disetujui. `ON CONFLICT DO NOTHING` bukan rekonsiliasi: ia bisa membuat migration berhasil tetapi hanya menyimpan sebagian receipt.

Hasil source review ini memperjelas prasyarat rehearsal; ia **belum** membuktikan migration berhasil pada schema target. Tetap jalankan seluruh urutan pada staging yang dapat dipulihkan dan periksa log sebelum keputusan Production.

## Migrasi data Firestore dan tenant

Data yang sebelumnya terlihat mengandung record tanpa tenant. Tim data harus membuat pemetaan eksplisit dari tenant sumber ke UUID tenant Supabase, lalu meninjau record yang tidak dapat dipastikan pemiliknya. Jangan menggunakan satu-satunya tenant yang terlihat sebagai alasan otomatis untuk mengklaim semua record.

Untuk tiap domain/importer:

1. Buat snapshot sumber dan catat ID/checksum non-rahasia.
2. Jalankan preview/dry-run tanpa apply.
3. Laporkan `ready`, `warning`, `conflict`, `skipped`, dan `error`; sertakan duplikasi NIS dan relasi wali-santri yang ambigu.
4. Minta pemilik data menyetujui tenant mapping dan daftar pengecualian.
5. Ulangi preview bila snapshot berubah.
6. Terapkan hanya ke staging yang dapat direset, lalu bandingkan jumlah dan relasi hasil.

Jangan mengimpor password atau kredensial lama dalam plaintext. Autentikasi pengguna harus diprovisikan melalui Supabase Auth, dengan password dibuat/reset oleh pemilik akun melalui alur aman.

## Rehearsal aman dan gerbang Production

1. **Staging terpisah:** gunakan project Supabase non-production/branch berfitur yang tersedia; bila paket tidak mendukung branching, gunakan project staging terpisah atau stack lokal. Jangan jadikan project target Production sebagai staging.
2. **Backup dan restore:** buat backup sebelum rehearsal, pulihkan ke staging, dan buktikan aplikasi dapat membaca hasil restore. Backup yang belum pernah dipulihkan belum dianggap bukti.
3. **Migration rehearsal:** terapkan urutan yang telah ditinjau hanya ke staging, ukur durasi/lock, periksa logs, jalankan suite CI dan SQL/pgTAP.
4. **Import rehearsal:** gunakan salinan/snapshot yang disetujui; verifikasi tenant, jumlah record, relasi, dan audit trail.
5. **API/UAT:** uji role dan tenant berbeda, akses lintas tenant yang harus ditolak, upload/download privat, duplikasi NIS serentak, transaksi keuangan, alur PPDB, Tahfidz, dan alur restore.
6. **Rilis:** rotasi secrets, siapkan monitoring/backup/rollback, tetapkan change window dan penanggung jawab. Baru setelah pemilik data dan tim backend menyetujui bukti, PR #13 dapat diputuskan untuk siap merge.

### Berhenti sebelum Production jika salah satu kondisi berikut terjadi

- Ledger atau schema target masih berbeda/tidak bisa dibaca.
- Ada migration yang dampak dan urutannya belum ditinjau.
- Backup belum berhasil dipulihkan.
- Record tidak memiliki tenant mapping yang disetujui.
- RLS, grant, Storage privacy, Auth, atau uji lintas tenant belum diverifikasi.
- Secret lama belum dicabut, atau flag runtime/import menyala tanpa sign-off.
- UAT/rollback owner belum menandatangani checklist.

## Format laporan balik ke pemilik produk

Kirim hasil dengan format berikut, tanpa secret, token, email/nomor telepon, maupun isi dokumen:

```text
Target project ref:
Commit PR #13 yang diuji:
Versi Supabase CLI / Bun / psql:
Migration lokal vs remote (versi saja):
Schema/RLS/grant: lulus / gagal + ringkasan:
Bucket private dan Storage policy: lulus / gagal + ringkasan:
Snapshot Firestore: jumlah per koleksi + jumlah tenant belum pasti:
Dry-run importer: ready / warning / conflict / skipped / error:
Backup dan restore staging: lulus / gagal; durasi:
CI/UAT: link run dan ringkasan:
Masalah yang menghambat:
Keputusan atau akses yang dibutuhkan:
```

**Persentase checkpoint proyek (estimasi, bukan metrik otomatis):** kematangan fitur sekitar **73%**; kesiapan go-live sekitar **46%**. Kesiapan belum dapat dinaikkan hanya dengan CI sintetis; bukti target/staging, rekonsiliasi data, backup/restore, rotasi secret, dan UAT masih diperlukan.

## Revalidasi source PR #13 bersih — 26 Oktober 2026

### Source yang diperiksa

- Mengambil `refs/pull/13/head` dari GitHub dan membuat checkout terpisah pada SHA **`f00ab599b3c41fb06d6997cb779d692c708489d2`**. Branch lokal `codex/readiness-checkpoint-20261026` dimulai tepat dari SHA tersebut; worktree lain yang memiliki perubahan lokal tidak disentuh.
- Pemilik proyek mengonfirmasi integrasi GitHub saat ini menunjuk ke `hamdanfaiz/ERP4-Pesantren`.
- Audit 22 file perubahan/untracked dari worktree lama menunjukkan file implementasi, migration, dan tes penting sudah ada di head PR #13. Empat migration koperasi/perpustakaan `20261209000000`–`20261212000000`, tes terkait, serta beberapa utilitas identik dengan source PR #13; beberapa file importer/UI lama berbeda dan versi PR #13 lebih lengkap. Jangan cherry-pick worktree lama secara massal.

### Pemeriksaan lokal pada SHA tersebut

- `npm ci --no-audit --no-fund` berhasil memasang 930 paket dari lockfile.
- `npm run lint` dan `npm run build` lulus.
- 24 pemeriksaan logika/source lulus: migration preflight, import graph tanpa Firebase, 28 flag browser/56 gate server default mati, gate dan tenant scope Firestore legacy, parser/importer PPDB/CBT/HRIS/Alumni/Koperasi/Perpustakaan, RBAC, undangan Wali, ID retry, paginasi Master Data/Tahfidz, pemilihan anak Wali, tanggal bisnis, serta portal Akademik.
- Build mengeluarkan peringatan chunk `react-pdf.browser` sekitar **1,46 MB**. Source menunda komponen unduhan kartu hingga pendaftaran berhasil dan mengimpor renderer PDF hanya setelah tombol unduh ditekan, sehingga chunk tersebut tidak termasuk bundle awal. Tetap uji waktu unduh PDF pada jaringan pelanggan yang lambat.
- Pemeriksaan database/API dan Docker lokal tidak dapat dijalankan: `supabase`, `docker`, `psql`, `bun`, dan `gcloud` tidak tersedia di `PATH`. Jangan mengartikan suite logika lokal sebagai uji database, Storage, atau Production.
- GitHub Actions [run 40320053360](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40320053360) tercatat sukses pada 2/2 job di SHA yang sama dan mencakup Supabase lokal/pgTAP, Docker/Compose, API tenant, Storage, race NIS/Tahfidz, serta backup/restore sintetis. Ini tidak mencakup target Supabase Production.

### Akses Supabase dan keputusan keamanan

- Supabase MCP tetap menolak project `ptsasgdvgrbdtgyqieie` dengan `MCP -32600: You do not have permission to perform this action`. Halaman Dashboard project bisa dibuka; halaman Migrations tidak menampilkan ledger pada observasi ini dan Table Editor menandai schema `supabase_migrations` terlindungi/read-only. Tidak ada SQL yang dijalankan dan tidak ada perubahan database.
- [Dokumentasi resmi Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp) menyarankan MCP untuk development/testing dan melarang menghubungkannya ke data Production. URL MCP luas tanpa `project_ref` mencakup account-level access; daftar feature yang menyertakan `functions`, `account`, atau `branching` memberi kemampuan yang tidak diperlukan untuk audit baca-saja. **Jangan pasang konfigurasi MCP tersebut pada project Production.**
- Setelah project staging berisi data sintetis tersedia, gunakan konfigurasi MCP yang dibatasi ke `project_ref` staging, `read_only=true`, dan feature minimum `docs,database`. Bentuk perintah Codex CLI yang telah diverifikasi:

  ```powershell
  codex mcp add supabase-staging --url "https://mcp.supabase.com/mcp?project_ref=<STAGING_PROJECT_REF>&read_only=true&features=docs%2Cdatabase"
  ```

  Ganti placeholder hanya dengan ref project staging; URL memakai `https://` tanpa backslash. Project staging Free terpisah dapat dipakai bila branching tidak tersedia. Production diperiksa tim pemilik melalui prosedur baca-saja yang disetujui, bukan lewat MCP.

### Status dan tindak lanjut

**Tidak ada perubahan pada Supabase Production, status PR, atau branch remote.** PR #13 tetap Open/Draft. Skor tetap **73% kematangan fitur / 46% kesiapan go-live**; local test dan CI sintetis tidak memenuhi gerbang Production.

Berikutnya: minta tim menyiapkan project staging berisi data sintetis dan `project_ref`-nya, lalu mengotorisasi MCP scoped read-only. Setelah itu jalankan suite Supabase/Docker lokal atau CI dari SHA terpilih, rekonsiliasi ledger/schema/RLS/Storage di staging, rehearsal restore+migration, baru UAT dan keputusan rilis. Rotasi credential yang pernah terekspos tetap wajib sebelum go-live.

## Checkpoint bantuan konfigurasi MCP Codex — 26 Oktober 2026

- PowerShell pemilik proyek melaporkan `codex` tidak dikenali. Pemeriksaan pada komputer Codex menemukan executable di `%LOCALAPPDATA%\OpenAI\Codex\bin\<versi>\codex.exe`; pemanggilan `codex.exe mcp add --help` berhasil. Ini masalah PATH shell, bukan error URL Supabase.
- Untuk menemukan executable tanpa menebak nama folder versi, gunakan PowerShell berikut. Perintah pertama hanya menampilkan bantuan dan tidak mendaftarkan server:

  ```powershell
  $codex = Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin" -Recurse -Filter codex.exe |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

  if (-not $codex) { throw 'codex.exe tidak ditemukan di instalasi Codex.' }
  & $codex mcp add --help
  ```

- Setelah `project_ref` staging nyata tersedia, gunakan:

  ```powershell
  $stagingRef = 'GANTI_DENGAN_REF_STAGING_SEBENARNYA'
  if ($stagingRef -eq 'GANTI_DENGAN_REF_STAGING_SEBENARNYA') { throw 'Isi ref staging lebih dahulu.' }
  & $codex mcp add supabase-staging --url "https://mcp.supabase.com/mcp?project_ref=$stagingRef&read_only=true&features=docs%2Cdatabase"
  & $codex mcp list
  ```

  Perintah ini menyimpan konfigurasi pada profil Codex lokal. Jangan gunakan project Production sebagai pengganti staging. URL yang diberikan sebelumnya masih berisi placeholder sehingga belum valid; tidak ada server MCP yang didaftarkan.
- Konektor Supabase saat ini hanya menampilkan `vqemuyzveuirlkvdggjd`; pembacaan daftar tabel `public` pada project itu mengembalikan kosong. Statusnya belum dikonfirmasi sebagai staging dan tidak ada skema yang diubah. Target `ptsasgdvgrbdtgyqieie` tetap tidak muncul pada daftar project konektor.
- Dokumentasi: [Codex MCP](https://developers.openai.com/learn/docs-mcp) dan [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp). Supabase MCP mendukung `project_ref`, `read_only=true`, serta pembatasan grup fitur.
- PR #13 tetap Open/Draft pada head `f00ab599b3c41fb06d6997cb779d692c708489d2`; PR #11 juga Open/Draft dan tetap tidak digabung utuh ke cutover. Estimasi PR #13 masih **73% kematangan fitur / 46% kesiapan go-live**; angka itu estimasi, bukan metrik tes.

## Koreksi penyimpanan draf Master Data — 26 Oktober 2026

- Audit source menemukan formulir Master Data masih memiliki kode autosave `formData` ke `localStorage`. Kode tersebut tidak berjalan pada runtime Supabase-only saat ini, tetapi berisi data pribadi Santri/Wali dan dapat kembali aktif bila jalur runtime lama dihidupkan.
- Kode autosave, pemulihan, dan modal draf lokal dihapus. Halaman Master Data tidak lagi membaca atau menulis `localStorage`/`sessionStorage`; endpoint impor `local-storage` di server tetap menolak jalur lama dengan HTTP 410.
- Tes regresi `test:master-data-no-browser-drafts` ditambahkan ke GitHub Actions untuk memastikan halaman tidak menyimpan form ke browser dan endpoint arsip tetap fail-closed.
- Verifikasi lokal pada perubahan: `npm run lint`, `npm run build`, `npm run test:master-data-no-browser-drafts`, `npm run test:supabase-runtime-no-firebase` (82 modul dan seluruh rute), `npm run test:master-data-pagination`, serta `git diff --check` lulus. Build masih menghasilkan peringatan chunk PDF `react-pdf.browser` sekitar 1,46 MB.
- Formulir yang belum disimpan tidak lagi pulih otomatis setelah browser ditutup. Jika kebutuhan autosave lintas sesi muncul, implementasikan sebagai draf backend berizin tenant/aktor dan masa retensi terbatas, bukan penyimpanan PII di browser.
- Koreksi ini tidak mengubah migration, data, flag, atau konfigurasi Supabase. Estimasi tetap **73% kematangan fitur / 46% kesiapan go-live**; UAT dan rehearsal staging tetap belum dibuktikan.


## Penghapusan importer operasional localStorage — 26 Oktober 2026

- Audit menemukan helper migrasi data operasional `localStorage` di `src/firebaseUtils.ts` tidak memiliki pemanggil, sedangkan endpoint tujuannya sudah ditutup permanen dengan HTTP 410.
- Helper pembaca ringkasan dan pengirim batch lokal beserta import token yang hanya dipakai helper itu dihapus. Tes regresi memastikan helper dan referensi storage tidak kembali ke file ini, serta endpoint lama tetap fail-closed.
- Verifikasi lokal: `npm run lint`, `npm run build`, `npm run test:master-data-no-browser-drafts`, `npm run test:supabase-runtime-no-firebase`, `npm run test:master-data-pagination`, dan `git diff --check` lulus. Build masih memberi peringatan chunk PDF sekitar 1,46 MB.
- Ref `ptsasgdvgrbdtgyqieie` dikonfirmasi sebagai project staging. Konektor Supabase yang aktif tetap menolak akses project ini (`MCP -32600: You do not have permission to perform this action`), sehingga tidak ada pembacaan schema atau perubahan database.
- MCP `supabase-staging` sudah terdaftar dengan ref staging, `read_only=true`, dan fitur `docs,database`. Pemilik menyetujui grant OAuth secara manual; CLI berhasil login dan `codex mcp list` menunjukkan status `OAuth`. Tool MCP belum muncul di sesi chat ini, jadi query staging harus diverifikasi setelah sesi memuat ulang koneksi.
- Anggap secret server dan password database yang ditempel di percakapan sebagai terekspos; rotasi keduanya sebelum go-live. Jangan kirim nilai penggantinya melalui chat atau simpan dalam source control.


## Checkpoint jeda aman — 26 Oktober 2026

- PR #13 tetap Open/Draft; head saat checkpoint awal `310659d7a3054e2b7fca5ad30f85c0f67bcd2818`. Tidak ada merge atau deployment.
- GitHub Actions [run 40332777455](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40332777455) lulus pada dua job wajib: frontend build/Firebase bundle guard dan migrasi/API auth/pgTAP. Check `Supabase Preview` dilewati karena branch belum terhubung ke Supabase Branch. Hasil ini tidak memverifikasi database staging atau Production.
- Koreksi kode terakhir menghapus importer operasional `localStorage` yang tidak terpakai; tes regresi, lint, build, runtime Supabase-only, dan paginasi Master Data lulus lokal. Build masih memberi peringatan chunk PDF sekitar 1,46 MB.
- MCP `supabase-staging` tersimpan di konfigurasi Codex dengan ref staging, `read_only=true`, dan fitur `docs,database`. CLI sempat melaporkan login OAuth berhasil, tetapi pemeriksaan terbaru `codex mcp list --json` menunjukkan `auth_status: unknown`; tool Supabase staging belum muncul pada sesi ini. Konektor Supabase bawaan juga tetap menolak project dengan `MCP -32600: You do not have permission to perform this action`.
- Tidak ada query schema, SQL, migration, impor data, atau perubahan pada Supabase staging/Production selama checkpoint ini. Kredensial yang pernah ditempel tidak disimpan ke repo; rotasi secret server dan password database tetap wajib sebelum go-live.
- Estimasi checkpoint proyek tetap **73% kematangan fitur / 46% kesiapan go-live**. Angka ini bukan hasil UAT atau bukti kesiapan deployment.

### Langkah saat melanjutkan

1. Muat ulang Codex atau buka sesi baru agar MCP staging terbaca, lalu verifikasi status OAuth dan daftar tools.
2. Jalankan pemeriksaan baca-saja pada ledger migration, schema, grants/RLS, Storage, dan profil tenant staging; simpan hasil rekonsiliasi tanpa mengubah database.
3. Rehearsal migration dan pemulihan backup hanya setelah snapshot staging dapat dipulihkan dan selisih source/ledger telah dikaji.
4. Lanjutkan uji login/matriks role-tenant, UAT lintas modul, dan pemeriksaan deployment mandiri. Jangan menerapkan perubahan Production sebelum gate tersebut disetujui.

## Revalidasi staging dan source PR #13 — 27 Oktober 2026

- **Target:** staging `ptsasgdvgrbdtgyqieie`. Pembacaan ledger mencantumkan 47 versi sampai `20261206000000`; source pada head PR #13 `6badbd7f2f9a1e228a2124dbc75b010f626f1ce7` memuat 92 file migration. Jadi ada 45 versi source setelah batas ledger, dari `20261207000000` sampai `20270120000000`, yang belum tercatat. Perhitungan versi bukan persetujuan apply dan bukan bukti kesetaraan schema.
- **Katalog keamanan yang dibaca ulang:** 119/119 tabel `public` mengaktifkan RLS dan FORCE RLS. Pemeriksaan hak efektif `has_table_privilege` menunjukkan `anon` SELECT pada 0 tabel dan hak tulis pada 0 tabel; `authenticated` SELECT pada 5 tabel dan hak tulis pada 0 tabel. Katalog memuat 5 policy pada 5 tabel. Ini pemeriksaan hak database, bukan uji perilaku login atau seluruh jalur server.
- **Integrasi Komunikasi:** RPC `public.communication_announcement_recipient_user_ids(uuid,text)` belum ada pada staging. Migration `20270105000000_communication_guardian_audience.sql` dan `20270120000000_communication_import_canonical_audience.sql` belum tercatat; import bukti baca harus tetap ditahan sampai keduanya direhearsal dan dipastikan sesuai dengan audience canonical. Migration terbaru mengganti fungsi import secara transaksional, memakai resolver yang sama dengan pengiriman, dan menolak receipt historis yang bukan milik Wali aktif dalam audience tersebut.
- **Review statis terarah atas 45 migration tertunda:** 40 pernyataan `CREATE INDEX` biasa, 0 `CREATE INDEX CONCURRENTLY`, tidak ditemukan `DROP TABLE/COLUMN/SCHEMA` atau `TRUNCATE`, dan ada 7 `DROP INDEX/CONSTRAINT` yang perlu ditinjau dalam konteks per file. Migration komunikasi terbaru tidak menambah index atau operasi destruktif. Hitungan statis tidak memprediksi durasi lock, kompatibilitas data, atau keberhasilan pada target.
- GitHub Actions [run 40435015043](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40435015043) lulus 2/2 job pada head di atas. Ini CI dengan database/test sintetis terisolasi; bukan rehearsal pada staging. PR #13 tetap **Open/Draft**.
- Pemeriksaan database yang dirujuk di atas hanya SELECT katalog/metadata. **Tidak ada migration, data, flag, atau konfigurasi staging/Production yang ditulis.** Dua row ledger `20261205000000` dan `20261206000000` dengan metadata kosong tetap menjadi isu lineage dari checkpoint terdahulu; hasil postcondition parsial tidak mengesahkan metadata tersebut.
- Data inventaris Firestore pada baseline merupakan bukti checkpoint sebelumnya; pemeriksaan kali ini tidak membaca ulang payload Firestore. Tetap perlakukan pemetaan tenant dan rekonsiliasi domain sebagai gate sebelum import. Progress proyek tidak berubah: sekitar **73% kematangan fitur / 46% kesiapan go-live**.

