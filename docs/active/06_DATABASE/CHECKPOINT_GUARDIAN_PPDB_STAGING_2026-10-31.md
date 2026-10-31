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
- Pemeriksaan baca-saja terbaru ke PTSAS (`ptsasgdvgrbdtgyqieie)) lewat `get_project`, `list_migrations`, dan `list_tables` ditolak karena izin konektor. Tidak ada perubahan Production. Snapshot PTSAS terdahulu di bawah ini bersifat historis dan tidak membuktikan keadaan skema atau ledger saat ini.
- Integrasi GitHub VQE telah diputus. Dashboard masih menampilkan label `main / PRODUCTION`; label tersebut bukan bukti bahwa VQE/PTSAS telah diselaraskan atau bahwa Production aman menerima migrasi.
- UAT tetap menunggu provisioning fixture disposable yang disetujui: tenant, akun Wali/Auth, kandidat, dan tagihan. Tidak ada akun atau data sintetis baru yang dibuat.
- CI PR #38 run [41162313076](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41162313076) lulus pada kedua job; Supabase Preview dilewati dan tidak menerapkan migrasi remote.
