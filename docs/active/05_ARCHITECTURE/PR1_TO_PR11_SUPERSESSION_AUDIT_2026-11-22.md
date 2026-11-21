# Audit supersession PR #1–#11 — 22 November 2026

**Snapshot GitHub:** 22 November 2026, 02.12 WIB  
**main:** e64049ce7467e75b8f55ff884777b7416b8388b5  
**Referensi integrasi:** PR #13 merged pada cea0ed481950c4e40a1035ff9d971cf3a43929bc; commit tersebut adalah merge-base main saat pemeriksaan.

## Kesimpulan status

- PR #1 sampai #11 berstatus **closed dan tidak merged** di GitHub.
- PR #12 berstatus **closed/merged**; merge commit c8738185ff6e5080ae427ef0021ee25681036c40.
- PR #13 berstatus **closed/merged**; merge commit cea0ed481950c4e40a1035ff9d971cf3a43929bc.
- Perbandingan GitHub menunjukkan main berada 907 commit di depan merge commit PR #13 dan tidak tertinggal darinya. Jadi source PR #13 adalah leluhur dari main saat ini.
- Pada pemeriksaan ini tidak ada pull request yang berstatus open.
- PR #1–#11 tidak perlu digabung terpisah. Branch tersebut merupakan rangkaian implementasi awal yang digantikan atau direstrukturisasi oleh baseline cutover PR #13 dan perubahan lanjutan di main. Merge ulang branch bertingkat akan membawa risiko menghidupkan kembali file, API, dan migration versi lama.
- Nilai merge_commit_sha yang kadang masih terisi pada PR tertutup tidak mengubah status GitHub merged=false. Status merged adalah bukti penentu.

## Peta fitur lama ke source main

Daftar ini menghubungkan tujuan PR awal dengan contoh source aktif saat ini. Ini adalah pemetaan source, bukan klaim bahwa UI, Auth live, seluruh tenant, dan Production telah lulus UAT.

| PR lama | Tujuan utama | Bukti padanan/source saat ini | Perubahan atau batas |
| --- | --- | --- | --- |
| #1 | Fondasi tenant dan profil | supabase/migrations/20261023000000_tenant_profile_foundation.sql; supabase/tests/tenant_isolation.test.sql | Migration fondasi tetap ada; aturan di-hardening melalui migration lanjutan dan diuji dalam CI sintetis. |
| #2 | Kesiapan produk, ERD, struktur Firestore, distribusi mandiri | docs/active/00_PRODUCT/COMMERCIAL_READINESS.md; docs/active/06_DATABASE/ERD.md; docs/active/06_DATABASE/FIRESTORE_STRUCTURE.md; docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md | Dokumen distribusi awal digantikan panduan customer-managed yang lebih baru. |
| #3 | Provisioning akun tenant melalui Edge Functions | src/pages/UserManagementView.tsx; server.ts (/api/users); scripts/provision-tenant-admin.mjs; supabase/migrations/20270121000000_tenant_admin_bootstrap.sql; supabase/tests/tenant_admin_bootstrap.test.sql | Edge Functions lama tidak dipertahankan sebagai jalur aplikasi; provisioning dipindahkan ke API server terautentikasi dan skrip bootstrap operator. |
| #4 | Container mandiri dan cutover dari Firebase | Dockerfile; docker-compose.yml; docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md; scripts/test-supabase-runtime-no-firebase.mjs | compose.yaml berganti nama/struktur. src/firebase.ts masih berupa guard yang langsung menolak; adapter lama tidak berada di graph runtime aktif dan paket Firebase tidak dipasang. |
| #5 | Pendaftaran PPDB publik | src/components/PublicRegistrationForm.tsx; src/server/supabasePublicPpdb.ts; supabase/migrations/20261028000000_public_ppdb_runtime.sql; supabase/tests/public_ppdb_runtime.test.sql | Endpoint dan kontrak berkembang sejak PR awal; jalur saat ini tenant-scoped dan memakai backend Supabase. |
| #6 | Roadmap migrasi penuh | docs/active/05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md; docs/active/06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md; docs/active/06_DATABASE/ENVIRONMENT_MIGRATION_PARITY_2026-11-22.md | Rencana tunggal awal diganti inventaris, status cutover, dan rekonsiliasi environment bertanggal. |
| #7 | Alur kerja PPDB Admin | src/pages/SupabasePpdbManager.tsx; src/server/supabasePpdb.ts; supabase/migrations/20261029000000_ppdb_admin_workflows.sql; supabase/tests/ppdb_admin_candidate_create.test.sql | Implementasi awal digabung ke modul PPDB Supabase yang lebih baru. |
| #8 | Onboarding santri dan data induk | src/server/supabaseOnboarding.ts; src/pages/MasterDataManager.tsx; supabase/migrations/20261030000000_master_data_onboarding.sql; supabase/migrations/20261102000000_master_data_student_runtime.sql | Kontrak terus dikembangkan dengan relasi pilihan, kapasitas kamar, dan pencegahan duplikasi ID. |
| #9 | Runtime Keuangan tenant | src/server/supabaseFinance.ts; src/pages/SupabaseFinanceManager.tsx; supabase/migrations/20261117000000_finance_runtime.sql; supabase/tests/finance_runtime.test.sql | Migration PR awal digantikan versi tenant-runtime yang lebih baru. |
| #10 | Pembayaran PPDB dan bukti pembayaran | src/components/PPDBFinanceModal.tsx; src/server/supabaseFinance.ts; supabase/migrations/20270110000000_ppdb_candidate_finance_bills.sql; supabase/migrations/20261027000000_private_finance_proof_storage.sql | Provider gateway/PPOB tidak termasuk rilis awal; alur yang tersedia adalah tagihan dan pencatatan/pemeriksaan bukti melalui Storage privat sesuai flag. |
| #11 | Struktur Master Data, Asrama, dan Tahfidz | src/pages/MasterDataManager.tsx; src/pages/TahfidzManager.tsx; src/server/supabaseTahfidz.ts; migration 20261102000000–20261107000000; supabase/tests/tahfidz_runtime_write_api.test.sql; supabase/tests/master_data_student_import_relationships.test.sql | Migration bertimestamp PR lama tidak disalin apa adanya; main memakai versi yang direkonsiliasi dan ditambah migration relasi/ID berikutnya. |

## Verifikasi tambahan

- PR #1–#11 masing-masing diperiksa di GitHub dan seluruhnya mengembalikan state closed, merged=false.
- PR #12 dan #13 diperiksa di GitHub; keduanya merged.
- Daftar file perubahan PR #1–#11 dibandingkan dengan tree main. Sejumlah file lama sudah tidak ada, tetapi kemampuan terkait direpresentasikan oleh jalur baru di atas; beberapa dokumen dan migration awal memang diganti atau diarsipkan.
- Main saat ini memiliki tes API/tenant, pgTAP, finance, PPDB, master data, Tahfidz, runtime tanpa Firebase, instalasi pelanggan, dan build container. CI pada PR dokumentasi #208 untuk source main yang sama lulus 3/3 job.
- Source dan CI tidak membuktikan login nyata, UAT seluruh modul, commit hosting yang aktif, kecocokan DDL Production, atau backup-restore Production.

## Langkah yang masih terbuka

1. UAT preview staging lintas role dan tenant, termasuk uji tulis-baca modul dan verifikasi tampilan setelah autentikasi.
2. Backend owner mencocokkan DDL Production dengan source migration dan meninjau urutan yang aman. Ledger PTSAS yang tidak lengkap tidak boleh ditangani dengan db push massal.
3. Tim membuktikan backup dan pemulihan Production, lalu mencatat commit hosting yang benar-benar tersaji.
4. Setelah bukti di atas lengkap, nilai kesiapan dapat dihitung ulang. Audit PR ini sendiri tidak mengubah status produk menjadi siap go-live.

Tidak ada perubahan database atau data live dalam audit ini.
