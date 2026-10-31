# Checkpoint UAT Wali PPDB di Supabase Staging

- Terakhir diperbarui: 31 Oktober 2026.
- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#38 — Enable guardian access to PPDB finance before onboarding](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/38).
- Branch: `codex/continue-erp-hardening-20261031`; source UI UAT diambil dari head `88e7e7438c91b1fa79d765ebf77ed8efc16ea8a7`.
- Target UAT: Supabase VQE, project ref `vqemuyzveuirlkvdggjd`, yang pengguna tetapkan sebagai staging.
- PTSAS `ptsasgdvgrbdtgyqieie` adalah Production dan tidak disentuh.

## Batas lingkungan

- Dashboard VQE menampilkan `main / PRODUCTION`. Repo tidak lagi terhubung otomatis ke VQE; integrasi GitHub telah diputus atas instruksi pengguna. Pastikan proyek tetap disposable sebelum UAT lebih lanjut.
- Supabase MCP menolak pembacaan PTSAS; tidak ada perubahan yang diterapkan ke PTSAS.
- Worktree PR tidak memuat `.env` VQE. File `.env` pada worktree lain menunjuk ke proyek berbeda dan tidak dipakai. Backend aplikasi memerlukan konfigurasi server khusus VQE, termasuk `SUPABASE_SECRET_KEY` dan `PUBLIC_PPDB_TENANT_ID`; pasang melalui secret manager, jangan kirim secret lewat chat atau masukkan ke bundle klien.
- Preview lokal saat ini dibuka pada `http://127.0.0.1:4179`, menggunakan source PR dan hanya URL plus publishable key VQE. Pemeriksaan `/runtime-config.json` memastikan target VQE dan tidak mengandung key server; `/health/live` mengembalikan 200. `/health/ready` masih unavailable karena secret server VQE belum disiapkan.
- Form login aplikasi sudah tampil. Pengguna perlu memasukkan email dan kata sandi sendiri di tab preview; kredensial tidak dibagikan di chat.
- Source worktree PR sudah bersih setelah pengaturan bind loopback khusus lokal dipulihkan. Tidak ada patch host lokal yang di-commit.

## Keadaan fixture VQE sementara

Fixture sintetis dibuat khusus untuk UAT ini; tidak ada data operasional Firestore yang disalin dan tidak ada email undangan yang dikirim.

| Data | Referensi |
|---|---|
| Tenant `uat-wali-erp4-20261031` | `80f406de-aa77-4efa-b36b-232ceb160178` |
| Akun Auth Wali (dibuat dan dikonfirmasi oleh pengguna) | `wali-uat-erp4-20261031@example.invalid`, UUID `07fdbe72-60f1-4b27-b090-919a952d32ad` |
| Kandidat | `980e32df-9177-4bf1-8a5b-b9f1bbe82a0d`, registrasi `UAT-WALI-20261031-001` |
| Tagihan | `1a699bf4-76ba-45fb-a61e-7ae82986d087` |
| Idempotency key bukti | `e1344262-ad4c-4472-868e-55a090e6c3ac` |
| Objek bukti | `financeProofs/80f406de-aa77-4efa-b36b-232ceb160178/1a699bf4-76ba-45fb-a61e-7ae82986d087/dummy-payment-proof.png` |

Profil Wali aktif terhubung ke tenant. Tagihan bernilai sintetis Rp10.000, relasi Wali-kandidat ada satu, dan tagihan saat ini berstatus `verification`. Objek PNG dummy 68 byte berada di bucket privat `erp4-private-finance-proofs`.

Fixture sementara masih ada sambil menunggu konfirmasi aksi terakhir untuk penghapusan. Cleanup mencakup objek Storage, `finance_write_requests`, tagihan, relasi, kandidat, `finance_controls`, akun Auth/profil, dan tenant. PTSAS Production tidak disentuh.

## Hasil verifikasi

- Dengan role database `authenticated`, RLS mengembalikan hanya profil sendiri dan tenant aktif akun uji.
- Role `authenticated` tidak memiliki akses Data API langsung ke tabel finansial; akses finansial harus melewati endpoint server. Bucket bukti bersifat privat dan tidak memiliki policy akses langsung.
- Helper relasi Wali-kandidat mengizinkan kandidat yang tertaut, serta menolak tenant/kandidat yang tidak terkait dan kandidat yang ditolak.
- Upload bukti memakai hak admin dashboard; ini bukan bukti upload melalui sesi Wali aplikasi.
- RPC `register_tenant_finance_payment_proof` berhasil mencatat tagihan menjadi `verification`. Pengulangan dengan idempotency key sama menghasilkan `alreadyApplied: true`.
- Uji negatif RPC menolak role yang tidak sesuai, path traversal, dan tenant berbeda.
- Login aplikasi, profil setelah login, endpoint upload Wali, onboarding, dan akses pasca-onboarding belum teruji sampai pengguna masuk dan backend VQE dikonfigurasi.

## Perubahan dan verifikasi kode

- Wali dengan email Auth terverifikasi dapat mengakses tagihan kandidat PPDB pra-onboarding hanya pada tenant yang sesuai, untuk kandidat yang belum ditolak/di-onboard, dengan tagihan aktif.
- Setelah onboarding, akses kandidat dicabut dan tagihan mengikuti relasi santri serta Wali kanonis.
- CI [run 41168200484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41168200484) lulus pada commit kode `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7`: frontend build/guard, migration rehearsal, pgTAP, API tenant/auth, Storage, backup/restore, import, idempotensi, dan build Docker pelanggan.
- Head PR setelah commit kode berisi pembaruan dokumentasi saja; workflow CI tidak berjalan pada commit docs.
- VQE memiliki 115 migration sampai `20270212000000_optimize_core_tenant_query_indexes`. pgTAP live sebelumnya: 53 assertion privilege API dan 44 assertion isolasi tenant; skrip memakai rollback.
- Security Advisor: 156 INFO untuk tabel backend-only tanpa policy; tidak ada WARN helper SECURITY DEFINER atau `auth_rls_initplan`. Performance Advisor memberi INFO indeks FK/unused-index. VQE tidak memiliki data operasional sehingga telemetry indeks belum mewakili beban nyata.
- `npm ci` pada worktree PR gagal karena `package-lock.json` tidak sinkron (paket opsional `@emnapi/wasi-threads@1.2.3` tidak ada di lockfile). Dockerfile memakai Bun dan `bun.lock`; isu kompatibilitas npm tetap perlu dibereskan bila tim menggunakan NPM untuk VPS/on-prem.

## Tindak lanjut

1. Pengguna masuk sendiri ke form di preview lokal tanpa membagikan kata sandi. Verifikasi halaman Wali dan profil.
2. Tim backend menyediakan environment VQE melalui secret manager, menyiapkan tenant ID dan runtime flags, lalu menyalakan backend server lokal/staging.
3. Uji daftar kandidat/tagihan, upload melalui endpoint Wali, penolakan akses tenant lain, onboarding, serta akses pasca-onboarding.
4. Hapus fixture sesuai tabel di atas dan verifikasi semua hitungan kembali nol.
5. Tinjau PR dan hasil UAT sebelum mengubah PR dari Draft/Open.

## Status PR dan progress checkpoint

PR #38 tetap Draft/Open sampai UAT UI Wali dan tinjauan backend selesai.

**Progress checkpoint PR #38: 75% (3 dari 4 gate).** Implementasi, CI pada commit kode, dan skema staging selesai. UAT database memberi bukti untuk validasi tenant, role, upload object, pencatatan transaksi, dan idempotensi. Form login aplikasi tampil, tetapi login hingga UAT alur Wali belum selesai. Angka ini hanya untuk checkpoint PR #38, bukan seluruh ERP atau kesiapan komersial.

## Riwayat rekonsiliasi migrasi

VQE sempat menerima timestamp migration sementara dari tool. Baris yang terdampak direkonsiliasi hanya setelah nama dan SQL diverifikasi, dengan guard bahwa versi kanonis belum ada; SQL skema tidak dijalankan ulang. Ledger akhir berisi 115 migrasi dengan versi terbaru cocok dengan source PR.
