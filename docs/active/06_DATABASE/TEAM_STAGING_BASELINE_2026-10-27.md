# Baseline Baca-Saja Supabase Staging — ERP4 Pesantren

**Tanggal pemeriksaan:** 27 Oktober 2026 (WIB)
**Project ref:** `ptsasgdvgrbdtgyqieie` — **staging**, bukan production
**Sumber arsip:** Firestore `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`
**Head PR yang diperiksa:** `a20be46ef666e00f8ebf9a7ae13aeee3478c854a` ([PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13))

## Ringkasan

Pemeriksaan ini memakai Supabase MCP staging yang dibatasi untuk baca-saja dan Firestore ADC untuk inventaris agregat. SQL hanya membaca katalog, grant, policy, serta hitungan agregat. Firestore hanya dibaca untuk nama koleksi, jumlah dokumen, dan keberadaan field tenant; nilai field, isi dokumen, email, ID dokumen, objek Storage, serta bukti pembayaran tidak disimpan atau dicantumkan di sini. **Tidak ada migration, data, file, atau konfigurasi remote yang diubah.**

- PR #13 masih **Open/Draft**. GitHub Actions [run 40333408526](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40333408526) selesai sukses pada dua job wajib: build/frontend/Firebase guard dan migration/API auth/tenant/pgTAP. Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch.
- Ledger staging mempunyai **47 versi** sampai `20261206000000`; source PR mempunyai **91 migration**, sehingga **44 versi** (`20261207000000`–`20270119000000`) belum tercatat pada staging. Ini status ledger saja, bukan persetujuan untuk menerapkan migration.
- Jam database saat pemeriksaan adalah `2026-10-26 22:21 UTC` atau `2026-10-27 05:21 WIB`. Jadi tanggal `20261206000000` adalah penanda versi migration, bukan bukti jam database salah.
- Staging memiliki 119 tabel aplikasi di schema `public`; semua mengaktifkan dan memaksa RLS. `tenants` adalah satu-satunya tabel tanpa kolom `tenant_id`, sesuai perannya sebagai tabel root tenant.
- Tidak ada grant tabel `public` kepada `anon`. Role `authenticated` hanya memiliki akses SELECT pada lima tabel yang dipagari policy; tidak memiliki akses tulis langsung. Pola ini sesuai dengan arsitektur server-mediated, tetapi tetap perlu dibuktikan lewat login dan UAT.
- Tenant sumber terpetakan ke satu tenant staging aktif. Verifikasi membandingkan fingerprint hash registry Firestore dengan `legacy_tenant_key` staging dan hanya menghasilkan jumlah kecocokan, bukan nilai aslinya.
- Firestore mempunyai 18 koleksi root dengan 561 dokumen. Semua 453 dokumen `master_data` dan 50 `candidates` tidak memiliki `tenantId` maupun `tenant_id` top-level. Seluruh 559 dokumen pada 16 koleksi operasional lain juga tidak memiliki kedua field itu; satu dokumen `users` memiliki `tenantId`. Dokumen root `tenants` memang tidak memerlukan `tenantId` sendiri.
- Hitungan agregat staging: satu tenant aktif, satu profil Admin aktif, 50 kandidat (semuanya ditandai `legacy_firestore` dan memiliki `source_record_id`), 50 santri, serta 95 record Master Data. Angka kandidat cocok dengan sumber, tetapi hitungan tidak membuktikan kecocokan record satu per satu. Hitungan Master Data berbeda 358 record; selisih tersebut harus direkonsiliasi memakai ID sumber/fingerprint sebelum import lanjutan.

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
| PPDB kandidat | 50 | 50 kandidat bertanda sumber legacy | Jumlah cocok; rekonsiliasi ID/fingerprint tetap diperlukan. |
| Santri | Tidak dihitung terpisah pada koleksi root | 50 | Jumlah saja tidak memvalidasi relasi kandidat→santri. |
| Master Data | 453 | 95 | Belum lengkap; selisih agregat 358 perlu direkonsiliasi sebelum impor. |
| Koleksi lain | 56 dokumen pada 14 koleksi root selain Master Data/kandidat/tenant/user | Beragam/tidak dipetakan di sini | Perlu preview/import per modul setelah migration prasyarat tersedia. |

Registry Firestore satu pengguna menyediakan kunci tenant sumber; hash kunci tersebut cocok dengan `legacy_tenant_key` milik satu tenant aktif slug `pesantren-digital` pada staging. **Kunci asli tidak dicatat.** Kecocokan ini mengonfirmasi pemetaan sumber, tetapi tidak membuat semua record valid atau bebas konflik. Importer tetap harus menolak snapshot berubah, duplikasi NIS/identitas, foreign key lintas tenant, dan relasi yang tidak cocok.

## Gerbang pekerjaan berikutnya

1. Backend menyiapkan salinan staging yang dapat dibuang dan membuktikan backup/restore. Konektor yang digunakan sekarang hanya baca-saja, sehingga belum bisa menerapkan migration ke project ini.
2. Tinjau 44 migration pending satu per satu, cocokkan schema/RLS/grant, constraint, seed/backfill, urutan, indeks/lock, dan explicit grant service role. Rehearsal pada salinan dapat dipulihkan; jangan menjalankan batch ke target sekarang.
3. Jalankan preview per koleksi memakai fingerprint dan ID sumber; rekonsiliasi kandidat 50/50, Master Data 453/95, wallet/transaksi, relasi wali, dan lampiran tanpa menyalin data sebelum konflik diselesaikan.
4. Setelah hasil preview disetujui tim data, gunakan kredensial migrasi yang dikelola backend di environment lokal/staging. Jangan mengirim secret/password di chat dan jangan menaikkan akses MCP read-only secara diam-diam.
5. Uji autentikasi Admin, matriks role/tenant, route server, Storage bertanda tangan, transaksi, restore, dan instalasi VPS/on-premise. Project ref ini tetap staging dan bukan endpoint production.

## Progress checkpoint

- Kematangan fitur: sekitar **73%**.
- Kesiapan go-live: sekitar **46%**.

Angka tersebut estimasi proyek, bukan metrik otomatis. Audit staging dan inventaris Firestore meningkatkan bukti yang tersedia, tetapi tidak menambah fitur atau menggantikan rehearsal, rekonsiliasi data, rotasi secret, login/UAT, dan pengujian environment pelanggan. Tidak ada perubahan Production.

