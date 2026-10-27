# Runbook Rekonsiliasi Migration Ledger Supabase Staging

**Tanggal audit:** 27 Oktober 2026  
**Project staging:** `ptsasgdvgrbdtgyqieie`  
**Source PR:** [PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13), head `e3f4ebe119362ac638afa35171214cd583a67df2`

## Ruang lingkup

Firestore berisi data dummy dan tidak akan diimpor. Target pekerjaan adalah menjalankan migration serta memastikan relasi, transaksi, RLS, dan isolasi tenant Supabase benar. Fixture pengujian sintetis sudah dijalankan di Supabase lokal melalui CI; data contoh staging boleh dibuat manual setelah baseline schema aman.

Runbook ini menyelesaikan ketidakcocokan migration ledger sebelum migration baru diterapkan. Ini bukan instruksi untuk menghapus atau mereset database.

## Snapshot baca-saja

- Ledger staging memiliki 47 versi. Source PR memiliki 93 migration; ada 46 migration source setelah versi terakhir yang tercatat.
- Versi `20261205000000` dan `20261206000000` ada di ledger, tetapi kolom `name` dan `statements` keduanya kosong. Preflight sengaja berhenti karena tidak dapat membuktikan isi migration yang dianggap sudah diterapkan.
- Katalog staging memiliki 119 tabel publik; 118 memakai `tenant_id`, seluruhnya mengaktifkan RLS dan FORCE RLS. Foreign key antar-tabel tenant yang diperiksa memasangkan `tenant_id`. `user_profiles` adalah pengecualian berupa jembatan kompatibilitas.
- Snapshot agregat menemukan satu tenant dan satu profil Admin aktif; profil tersebut memiliki tenant dan akun Auth yang cocok. Pemeriksaan tidak menampilkan PII.
- Efek utama kedua migration yang metadata-nya kosong tampak pada katalog: default ACL migration `20261205` membatasi default privilege kepada pemilik; migration `20261206` memiliki kolom/constraint/index provenance kandidat PPDB, tabel batch ber-RLS/Force RLS, dan RPC import dengan akses `service_role` saja. Ini mengonfirmasi efek katalog utama, tetapi tidak membuktikan seluruh isi/urutan SQL persis sama dengan file source.
- Koneksi MCP staging saat audit memiliki `transaction_read_only=on` dan role `supabase_read_only_user`. Konektor Supabase berhak tulis hanya mencantumkan project `vqemuyzveuirlkvdggjd`; permintaan baca project target `ptsasgdvgrbdtgyqieie` ditolak.

## Tindakan yang diperlukan tim backend

1. Pastikan target adalah project staging `ptsasgdvgrbdtgyqieie`. Siapkan backup yang bisa dipulihkan sebelum mengubah schema atau migration history. Jangan menjalankan `db reset --linked`, menghapus tenant, menghapus tabel, atau menimpa data.
2. Gunakan source PR #13 pada head yang tercantum di atas. Di checkout bersih, pasang dependency sesuai lockfile dan jalankan pemeriksaan baca-saja dengan konfigurasi `.env` lokal:

   ```powershell
   bun install --frozen-lockfile
   bun run preflight:db-migrations
   ```

   Jangan tempelkan nilai `.env`, secret key, atau password database ke chat/log.

3. Rekonsiliasi versi `20261205000000` dan `20261206000000` terhadap schema aktual secara menyeluruh, termasuk function body, default privileges, constraint/index, RLS, dan grants. Efek katalog yang cocok sebagian saja belum cukup untuk mengubah ledger.
4. Gunakan prosedur pemulihan migration-history yang ditinjau DBA. `supabase migration repair` mengubah catatan applied/reverted; perintah itu tidak menjalankan SQL. Jangan menghapus/menandai ulang dua versi ini secara buta dan jangan menjalankan `db push` sebelum preflight membuktikan baseline aman.
5. Jika isi migration yang sudah tercatat tidak dapat dibuktikan cocok, gunakan project staging baru yang terpisah: terapkan rangkaian migration source dari awal, jalankan suite lokal/CI, lalu buat fixture sintetis secara manual. Pertahankan project staging saat ini sampai pemilik project menyetujui nasibnya.
6. Setelah ledger cocok, jalankan dry-run/preflight ulang, tinjau daftar migration yang akan diterapkan, dan catat hasilnya sebelum penerapan staging. Aktifkan feature flag hanya setelah smoke test login, role, relasi tenant, dan transaksi lulus.

## Bukti dan batas saat ini

GitHub Actions [run #40468682776](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40468682776) lulus pada kedua job, termasuk build/Docker, migration/pgTAP pada Supabase lokal, auth/isolasi tenant, transaksi NIS dan Tahfidz, Storage, serta backup/restore sintetis. CI tidak menulis ke Supabase staging.

Belum ada migration, data Firestore, atau fixture yang ditulis ke staging oleh Codex. Penerapan staging, login/UAT, rotasi credential, dan uji pemulihan pada target tetap menjadi release gate.

