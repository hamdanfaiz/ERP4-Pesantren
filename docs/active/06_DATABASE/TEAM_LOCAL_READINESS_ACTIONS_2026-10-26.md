# Handoff Hambatan Teknis — Supabase Cutover ERP4 Pesantren

**Checkpoint:** 26 Oktober 2026  
**PR cutover:** [#13 — Supabase-only runtime cutover](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)  
**Target Supabase:** project ref `ptsasgdvgrbdtgyqieie`  
**Sumber arsip:** Firestore project `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`  
**Panduan detail terkait:** [Petunjuk Teknis Akses dan Rehearsal Migrasi](./TEAM_TECHNICAL_ACCESS_AND_REHEARSAL_RUNBOOK_2026-10-26.md)

Dokumen ini adalah daftar kerja untuk tim teknis yang memiliki akses lokal ke repository dan project. Semua pemeriksaan live di bawah dimulai dengan akses baca-saja. Jangan menerapkan migration atau mengimpor data ke Production sebelum gerbang rilis pada dokumen ini terpenuhi.

## Ringkasan kondisi dan hambatan

- PR #13 masih **Open/Draft**, belum siap merge atau deploy. Kode pada head terakhir yang tercatat lulus CI menggunakan uji sintetis dan Supabase lokal terisolasi; itu bukan bukti bahwa database, Auth, Storage, atau data Production sudah tervalidasi.
- Pada inspeksi Dashboard baca-saja tanggal 26 Oktober, ledger target menampilkan 47 versi yang cocok dengan source. Repository berisi 91 file migration; 44 versi source setelah `20261206000000` belum terlihat di ledger target. **Jangan menjalankan 44 migration sekaligus berdasarkan hitungan ini.** Verifikasi ledger ulang lewat CLI, cocokkan schema/RLS/grant, baca isi semua migration tertunda, lalu rehearsal pada staging.
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
| 5. Rekonsiliasi sumber | Data owner + backend | Ambil snapshot Firestore yang disetujui; tentukan pemetaan tenant dan identitas per domain. Jalankan importer dalam mode preview pada data sintetis/salinan staging. | Hitungan per koleksi, konflik/duplikasi, tenant tanpa pemetaan, checksum snapshot tanpa PII. |
| 6. Rehearsal | Backend/DBA | Buat staging terpisah atau branch database yang dapat dibuang; buat backup; buktikan restore; baru lakukan rehearsal migration dan import di staging. | Waktu backup/restore/migration, log yang disanitasi, perbandingan jumlah data dan hasil tes. |
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

## Hasil pemeriksaan statis 44 migration yang tertunda

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
