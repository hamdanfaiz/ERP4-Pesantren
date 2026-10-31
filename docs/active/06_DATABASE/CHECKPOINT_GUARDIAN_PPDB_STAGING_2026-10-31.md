# Checkpoint UAT Wali PPDB di Supabase Staging

- Terakhir diperbarui: 31 Oktober 2026.
- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#38 — Enable guardian access to PPDB finance before onboarding](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/38).
- Branch: `codex/continue-erp-hardening-20261031`.
- Target UAT: Supabase VQE, project ref `vqemuyzveuirlkvdggjd`, yang pengguna tetapkan sebagai staging.
- PTSAS `ptsasgdvgrbdtgyqieie` adalah Production dan tidak disentuh.

## Batas lingkungan

- Dashboard VQE menampilkan cabang `main / PRODUCTION`. Repo tidak lagi terhubung otomatis ke VQE; integrasi GitHub telah diputus atas instruksi pengguna.
- Supabase MCP saat ini menolak pembacaan PTSAS. Status dan skema Production belum dapat direkonsiliasi dengan bukti langsung; tidak ada perubahan yang diterapkan ke PTSAS.
- Worktree terpilih tidak memiliki `.env` atau `.env.local`; variabel `SUPABASE_SECRET_KEY` dan `PUBLIC_PPDB_TENANT_ID` juga tidak tersedia. Jangan memakai konfigurasi usang yang menunjuk ke PTSAS. UAT API/UI memerlukan konfigurasi staging VQE yang dipasang sendiri secara aman oleh tim; secret jangan dikirim lewat chat atau dimasukkan ke kode klien.

## Keadaan VQE saat ini

- Ledger berisi 115 migrasi, terakhir `20270212000000_optimize_core_tenant_query_indexes`. Base PR #38 (`main`) berisi 110 migrasi sampai `20270207000000`; lima migrasi berikutnya pada VQE berasal dari PR yang masih Draft.
- Skema Wali pra-onboarding tersedia; tabel `guardian_candidate_accounts` dibatasi untuk backend. Bucket `erp4-private-finance-proofs` bersifat privat, maksimum 3 MB, MIME `image/png`, `image/jpeg`, dan `application/pdf`.
- Fixture UAT yang sudah ada: satu tenant sintetis `Pesantren UAT Wali`, slug `uat-wali-erp4-20261031`, UUID `80f406de-aa77-4efa-b36b-232ceb160178`.
- Belum ada akun Auth uji, profil, kandidat, tagihan, relasi akun Wali, atau objek bukti di VQE. Tidak ada email yang dikirim dan tidak ada data operasional Firestore yang disalin.
- Dialog Auth VQE telah disiapkan dengan email `wali-uat-erp4-20261031@example.invalid` dan `Auto confirm user` aktif. Pembuatan akun menunggu pengguna memasukkan password sementara dan menekan `Create user` sendiri. Password tidak boleh dikirim ke chat.

## Perubahan dan verifikasi kode

- Wali dengan email Auth terverifikasi dapat mengakses tagihan kandidat PPDB pra-onboarding hanya di tenant yang sesuai, untuk kandidat yang belum ditolak/di-onboard, dengan tagihan aktif.
- Setelah onboarding, akses kandidat dicabut dan tagihan mengikuti relasi santri serta Wali kanonis.
- CI head PR saat checkpoint diperiksa: [run 41168200484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41168200484). Kedua job sukses: build dan guard frontend, migration rehearsal, pgTAP, API auth/tenant, Storage, backup/restore, import, idempotensi, serta build konfigurasi Docker pelanggan.
- Tes live VQE sebelumnya menghasilkan 53 assertion privilege API dan 44 assertion isolasi tenant; skrip memakai rollback. Tes otomatis itu tidak menggantikan UAT aplikasi Wali.
- Advisor VQE: 156 temuan INFO RLS pada tabel backend-only tanpa policy, 238 INFO indeks FK, dan 168 INFO unused index. Karena VQE kosong dari data operasional, telemetry indeks belum mewakili beban nyata; tidak ada indeks massal yang dihapus.

## UAT yang masih harus dijalankan

Setelah akun Auth uji dibuat dan backend lokal dikonfigurasi dengan kredensial VQE:

1. Buat kandidat sintetis dengan email kontak yang sama dan satu tagihan registrasi.
2. Daftarkan/claim Wali melalui alur aplikasi, lalu pastikan profil serta tautan kandidat dibuat server-side.
3. Pastikan Wali hanya melihat kandidat/tagihan yang tertaut dalam tenantnya; tenant lain dan kandidat tak tertaut harus ditolak.
4. Unggah PNG dummy ke bucket privat, verifikasi metadata/path dan kegagalan akses langsung tanpa otorisasi.
5. Uji transisi onboarding: akses pra-onboarding dicabut, tagihan terhubung ke santri, dan Wali hanya melihat santri yang berelasi.
6. Hapus objek Storage, tagihan, kandidat, relasi, profil, akun Auth, dan tenant sintetis. Akun Auth dihapus melalui Supabase Auth dashboard/API tepercaya, bukan SQL langsung.
7. Verifikasi seluruh hitungan fixture kembali nol dan VQE tidak menyisakan objek `uat/`.

## Status PR

PR #38 tetap Draft/Open sampai UAT aplikasi dan tinjauan tim backend selesai. CI terbaru lulus, tetapi login aplikasi, unggah bukti melalui UI, onboarding, isolasi tenant pada runtime, dan pembersihan fixture belum terverifikasi. Jangan merge PR atas dasar CI saja.

## Riwayat rekonsiliasi migrasi

VQE sempat menerima timestamp migration sementara dari tool. Setiap row yang terdampak direkonsiliasi hanya setelah nama dan SQL diverifikasi, dengan guard bahwa versi kanonis belum ada; SQL skema tidak dijalankan ulang. Ledger akhir sekarang berisi 115 migrasi dengan versi terbaru cocok dengan source PR.
