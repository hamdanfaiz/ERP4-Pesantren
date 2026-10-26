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
