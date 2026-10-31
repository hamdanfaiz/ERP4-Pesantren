# Checkpoint Staging: Akses Wali ke Tagihan PPDB

- Tanggal: 31 Oktober 2026.
- Target uji manual: Supabase VQE, project ref `vqemuyzveuirlkvdggjd`, sesuai keputusan pengguna.
- Source: PR #38, branch `codex/continue-erp-hardening-20261031`.
- PTSAS, project ref `ptsasgdvgrbdtgyqieie`, tidak disentuh.
- Dashboard Supabase masih menandai VQE sebagai `main / PRODUCTION`. Integrasi GitHub VQE telah diputus atas instruksi pengguna; label/status project tidak berubah karena tindakan itu.

## Perubahan aplikasi

- Wali dengan email Auth terverifikasi dapat melihat dan mengirim bukti untuk tagihan calon santri PPDB sebelum onboarding, terbatas pada tenant dan email yang cocok.
- Kandidat yang ditolak atau sudah menjadi santri tidak lagi dapat diakses melalui relasi pra-onboarding.
- Setelah onboarding, tagihan dipautkan ke santri dan akses Wali berpindah ke relasi Wali–santri kanonis.
- Tabel `guardian_candidate_accounts` hanya dipakai backend; RLS dan FORCE RLS aktif, tanpa akses langsung anon/authenticated.
- Tidak ada data Firestore atau data operasional yang disalin.

## Rekonsiliasi ledger sebelum migrasi hardening

- VQE semula memiliki 111 baris migrasi sampai `20270208000000`.
- Row sementara untuk `20270208000000_guardian_pre_onboarding_candidate_finance.sql` telah direkonsiliasi secara terjaga menjadi versi kanonis setelah nama dan SQL cocok. SQL skema tidak dijalankan ulang.
- Verifikasi saat itu menunjukkan satu row kanonis, tanpa row sementara, dan skema PPDB pra-onboarding tersedia.

## Migrasi hardening dan verifikasi terbaru

- Migration PR `20270209000000_harden_ppdb_trigger_search_path.sql` mematok `search_path=pg_catalog` pada helper trigger PPDB lama.
- GitHub Actions run [41161800795](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41161800795) lulus: frontend build dan bundle guard, rehearsal upgrade lokal, pgTAP, API tenant/auth, Storage, serta backup/restore.
- Setelah tes lulus, migrasi diterapkan hanya pada VQE. Supabase memberi timestamp sementara `20261031025634`; transaksi dengan guard nama+SQL dan versi tujuan kosong mengganti row ledger itu menjadi `20270209000000`. Tidak ada migrasi skema yang dijalankan ulang.
- Verifikasi akhir VQE: 112 migrasi; `20270209000000` tercatat satu kali; row sementara `20261031025634` tidak ada; versi terbaru `20270209000000`; SQL ledger cocok persis dengan file repo.
- Fungsi memiliki `search_path=pg_catalog` dan dua trigger tetap terpasang. Security Advisor tidak lagi melaporkan `function_search_path_mutable`.
- Advisor masih menampilkan 156 temuan INFO untuk tabel RLS tanpa policy (tabel server-only) dan 4 helper `SECURITY DEFINER` yang memang dipakai policy. Keduanya belum diubah karena membutuhkan pemeriksaan grants/RLS per fungsi dan tabel, bukan penghapusan massal.

## Validasi dan batas

- Supabase Preview berstatus skipped; workflow tidak menerapkan migrasi remote.
- UAT login Wali dan unggah bukti belum dapat dilakukan: VQE masih kosong dari tenant, akun Auth, profil, kandidat, dan tagihan. Tidak ada akun/data sintetis yang dibuat.
- Lanjutkan dengan membuat tenant dan akun Wali uji yang memang disposable pada VQE, lalu uji login, tagihan PPDB, unggah/verifikasi bukti, onboarding, dan batas antar-tenant.
- PR #38 tetap Draft sampai UAT staging selesai. CI tidak menggantikan UAT dan tidak membuktikan kesiapan produksi.
- Tidak ada perubahan pada PTSAS Production, Auth, Storage, atau data Firestore.

## Rujukan

- Supabase database migration history: https://supabase.com/docs/guides/deployment/database-migrations#step-3-if-the-migration-history-table-is-wrong
- Supabase CLI migration repair: https://supabase.com/docs/reference/cli/supabase-migration-repair


## Addendum status terkini — 31 Oktober 2026

- Pada head `main` yang menjadi base PR #38 (`e9e65e3e8b9d05d126a6150ce726f720722839c5`), source memiliki 110 migrasi sampai `20270207000000`. VQE memiliki 112 migrasi sampai `20270209000000`; dua versi tambahan (`20270208000000` dan `20270209000000`) berasal dari PR #38 yang masih Draft. Jadi VQE saat ini lebih maju dua migrasi daripada `main`, bukan 110/110 setara.
- Pemeriksaan baca-saja terbaru ke PTSAS (`ptsasgdvgrbdtgyqieie`) lewat `get_project`, `list_migrations`, dan `list_tables` ditolak karena izin konektor. Tidak ada perubahan Production. Snapshot PTSAS terdahulu di bawah ini bersifat historis dan tidak membuktikan keadaan skema atau ledger saat ini.
- Integrasi GitHub VQE telah diputus. Dashboard masih menampilkan label `main / PRODUCTION`; label tersebut bukan bukti bahwa VQE/PTSAS telah diselaraskan atau bahwa Production aman menerima migrasi.
- UAT tetap menunggu provisioning fixture disposable yang disetujui: tenant, akun Wali/Auth, kandidat, dan tagihan. Tidak ada akun atau data sintetis baru yang dibuat.
- CI PR #38 run [41162313076](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41162313076) lulus pada kedua job; Supabase Preview dilewati dan tidak menerapkan migrasi remote.


## Addendum — internal tenant RLS helpers (31 Oktober 2026)

- PR #38 kini mencakup migration `20270210000000_internalize_tenant_rls_helpers.sql`. CI terbaru [run 41164376726](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41164376726) lulus pada kedua job, termasuk pgTAP. Supabase Preview dilewati dan tidak menerapkan migration.
- Migration diterapkan hanya pada VQE setelah CI lulus. Tool awalnya mencatat timestamp sementara `20261031033134`; row itu direkonsiliasi dengan guard nama+versi tujuan kosong menjadi `20270210000000`, tanpa menjalankan ulang SQL. Ledger kini berisi 113 migration dan versi terakhir cocok dengan source.
- Empat helper tenant dipindah dari `public` ke `private`; fungsi tetap SECURITY DEFINER dengan `search_path=pg_catalog, public`. Hanya `authenticated` memiliki USAGE/EXECUTE untuk evaluasi policy. `anon` dan `service_role` tidak mendapat USAGE/EXECUTE; tidak ada helper tersisa di `public`.
- Empat policy tenant tetap terdaftar. Tes isolasi tenant pada VQE mencapai assertion 44; tes privilege API mencapai assertion 46. Kedua tes memakai transaksi yang di-rollback. Verifikasi sesudahnya: tenant, profil, kandidat, dan pengguna Auth tetap 0; tabel probe tes tidak tersisa.
- Security Advisor tidak lagi melaporkan empat temuan WARN `authenticated_security_definer_function_executable`. Sebanyak 156 temuan INFO `rls_enabled_no_policy` masih tersisa pada tabel server-only dan tidak diubah dengan membuka policy massal.
- Tab Integrations VQE menunjukkan “Select the repository to connect”; integrasi GitHub sudah tidak tersambung. Label dashboard tetap `main / PRODUCTION`. Tidak ada perubahan pada PTSAS Production.

### Yang masih perlu dilakukan

- UAT aplikasi Wali PPDB tetap menunggu tenant, akun Auth Wali, kandidat, dan tagihan uji disposable. Tidak ada fixture persisten yang dibuat.
- PR #38 tetap Draft; CI dan migrasi staging belum menggantikan UAT login, unggah bukti, onboarding, serta isolasi tenant melalui aplikasi.

## Addendum — policy performance and core indexes (31 Oktober 2026)

- Checkpoint kecil hardening RLS dan indeks inti (migration `20270209000000`–`20270212000000`) selesai: **100% untuk cakupan ini**. Angka ini bukan persentase penyelesaian seluruh produk ERP.
- CI PR #38 run [41166356939](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41166356939) lulus pada kedua job: build frontend/bundle guard serta rehearsal migration, pgTAP, API tenant/auth, Storage, dan backup/restore.
- Migration `20270211000000_optimize_profile_rls_initplans` dan `20270212000000_optimize_core_tenant_query_indexes` diterapkan hanya pada VQE. Row sementara untuk migration terakhir (`20261031035845`) direkonsiliasi secara terjaga ke versi source `20270212000000`; SQL tidak dijalankan ulang. Ledger VQE berisi 115 migration dan versi terakhir cocok dengan repo.
- RLS policy yang memakai konteks stabil sekarang memakai scalar subquery/initplan. Performance Advisor tidak lagi melaporkan `auth_rls_initplan`.
- Indeks baru: `guardian_students(tenant_id, student_id, guardian_id)` untuk pencarian relasi dari sisi santri; `tahfidz_sessions(tenant_id, halaqah_id, kind, scheduled_at, id)` untuk halaman sesi Ustadz yang dibatasi halaqah dan jenis sesi.
- pgTAP API privilege mencapai assertion 53; isolasi tenant mencapai assertion 44. CI menjalankan seluruh assertion. Tes live memakai transaksi rollback; sesudahnya jumlah tenant, profil, kandidat, Auth user, dan tabel probe tetap 0.
- Security Advisor masih mencatat 156 INFO `rls_enabled_no_policy` pada tabel backend-only. Performance Advisor masih mencatat 238 INFO foreign key tanpa indeks penutup dan 168 INFO unused index. Tidak ada indeks yang dihapus massal: VQE kosong sehingga statistik pemakaian belum mewakili beban nyata; temuan FK sisanya perlu dipetakan terhadap pola query dan jadwal penghapusan data sebelum indeks tambahan dipilih.
- Integrasi GitHub VQE tetap tidak tersambung; PTSAS Production tidak disentuh.

### Status pekerjaan yang masih terbuka

- UAT aplikasi Wali PPDB tetap menunggu tenant, akun Auth Wali, kandidat, dan tagihan disposable. Tes live database tidak membuktikan alur UI login, unggah bukti, dan onboarding.
- PR #38 tetap Draft sampai UAT aplikasi dan tenant selesai, serta tinjauan backend selesai.
