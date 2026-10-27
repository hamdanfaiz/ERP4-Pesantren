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
- Audit katalog baca-saja terbaru menemukan 119 tabel publik: seluruhnya mengaktifkan RLS dan FORCE RLS; 118 memiliki kolom `tenant_id`, dan `tenants` adalah satu-satunya tabel root tanpa kolom itu. Dari 335 foreign key publik, 243 menghubungkan dua tabel ber-tenant; seluruh 243 memasangkan `tenant_id` pada foreign key komposit dan tidak ditemukan relasi tenant yang tidak berpasangan. Query hanya membaca katalog, bukan isi record.
- Snapshot agregat menemukan satu tenant dan satu profil Admin aktif; profil tersebut memiliki tenant dan akun Auth yang cocok. Pemeriksaan tidak menampilkan PII.
- Rekonsiliasi katalog untuk migration tersebut cocok dengan source: `20261205` meninggalkan default privilege tabel/sekuens/fungsi hanya pada pemilik dan mencabut EXECUTE empat helper dari PUBLIC/anon/authenticated/service_role; trigger yang memakai helper tetap terpasang. Untuk `20261206`, kolom, check tervalidasi, indeks unik valid, struktur batch, dua FK tenant, RLS+FORCE RLS, tanpa policy, akses tabel hanya untuk `service_role`, grant RPC, `SECURITY INVOKER`, `search_path`, komentar, serta body RPC 5.165 karakter cocok; body fungsi staging sama persis dengan source. Ini membuktikan keadaan katalog yang diperiksa saat ini, bukan histori urutan/pernyataan SQL yang tidak tersimpan di ledger.
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

GitHub Actions [run #40469695672](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40469695672) lulus pada kedua job. Run merehearsal upgrade dari ledger staging pada Supabase lokal terisolasi, lalu menjalankan migration/pgTAP, transaksi NIS/Tahfidz, import preview sintetis, auth/isolasi tenant, Storage, backup/restore, Firebase runtime guard, build, dan Docker/Compose. CI tidak menulis ke Supabase staging.

Belum ada migration, data Firestore, atau fixture yang ditulis ke staging oleh Codex. Penerapan staging, login/UAT, rotasi credential, dan uji pemulihan pada target tetap menjadi release gate.

