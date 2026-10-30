# Runbook pemeriksaan ledger migrasi Supabase

## Tujuan

Skrip ini membandingkan file migration repository dengan `supabase_migrations.schema_migrations` pada database target. Skrip hanya menjalankan transaksi `BEGIN READ ONLY` berisi `SELECT`; skrip tidak menjalankan, memperbaiki, atau menerapkan migration.

## Prasyarat

- Checkout repository yang sama dengan source code yang akan direview.
- Node.js dan `psql` tersedia pada komputer operator.
- URL koneksi PostgreSQL khusus target sudah diperoleh dari secret manager. Pakai kredensial baca metadata saja bila tersedia. Jangan kirim URL/password lewat chat atau commit ke Git.
- Untuk koneksi jarak jauh, koneksi SSL wajib; mode non-SSL ditolak.

## Jalankan

Atur `SUPABASE_DB_URL` pada environment shell dari secret manager, kemudian jalankan:

```powershell
node scripts/preflight-supabase-migrations.mjs
```

Untuk memeriksa stack Supabase lokal yang sudah berjalan, gunakan `npm run preflight:db-migrations:local`. Perintah ini membaca `DB_URL` dari `supabase status -o env`, lalu membandingkan ledger lokal dengan folder migration yang sama.

```sh
node scripts/preflight-supabase-migrations.mjs
```

Output menampilkan jumlah versi lokal/tercatat, versi terakhir, dan daftar migration yang belum tercatat. Nilai URL koneksi tidak dicetak. Skrip gagal tertutup jika ada versi pada database yang tidak ada di source, versi duplikat, versi lokal tertinggal di bawah versi live, koneksi gagal, atau ledger tidak dapat dibaca.

## Tindakan sesudah laporan

- Bila ledger selaras, tetap jalankan staging rehearsal, restore backup, pemeriksaan postflight, serta UAT sebelum perubahan rilis.
- Bila migration pending, perlakukan daftar sebagai bahan rencana staging. Jangan menjalankan `supabase db push`, `migration repair`, atau SQL migration berdasarkan output ini saja.
- Bila lineage berbeda, hentikan proses dan rekonsiliasi histori source/database bersama pemilik backend sebelum menambah migration.
- Ulangi pemeriksaan tepat sebelum rehearsal dan rilis karena ledger dapat berubah setelah laporan dibuat.

CI menguji fungsi pembanding dan memastikan query hanya baca. CI memakai data sintetis; hasilnya tidak menguji koneksi atau mengubah Production.
