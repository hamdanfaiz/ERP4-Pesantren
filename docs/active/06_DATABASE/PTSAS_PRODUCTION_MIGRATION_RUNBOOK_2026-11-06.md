# Runbook migrasi PTSAS Production — 6 November 2026

## Status dan bukti

- Target: PTSAS Production `ptsasgdvgrbdtgyqieie`. VQE `vqemuyzveuirlkvdggjd` tetap sebagai staging.
- CI pada PR #40 commit `6b853c421c04ef8189f778a7b3cadb87910f5d3b` lulus 3/3 job pada run [#1168](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42213196954). Job database membentuk baseline ledger Production tiruan, menerapkan migration yang hilang dengan `--include-all`, memverifikasi 135 versi serta objek audit/RPC, dan menjalankan suite database.
- VQE live memiliki 135 versi migration sampai `20270303000000`. Production belum berubah.
- Ekspor baca-saja Production yang disediakan pemilik menunjukkan 47 versi ledger, 88 versi source tidak tercatat, dua versi lebih lama yang hilang (`20261031104213`, `20261031225438`), serta dua baris ledger tanpa metadata (`20261205000000`, `20261206000000`).
- GitHub PR #40 masih Draft/Open. Jalankan dari source yang sudah ditinjau dan disetujui tim backend; jangan mengambil source dari worktree yang belum disinkronkan.
- Pemilik telah meminta agar hasil staging yang lulus dilanjutkan ke Production tanpa menunggu pengingat. Konektor Codex saat ini ditolak oleh PTSAS Production dan workstation tidak dapat mengambil Supabase CLI dari jaringan, sehingga operator yang memiliki akses Production perlu menjalankan langkah di bawah.

## Prasyarat sebelum dry-run

1. Checkout commit yang sudah ditinjau pada PR #40 atau commit `main` yang memuatnya.
2. Pastikan Supabase CLI versi `2.84.2` tersedia. Jangan menjalankan `db reset` pada Production.
3. Masukkan URL database Production ke environment/secret manager lokal sebagai `SUPABASE_DB_URL`. Jangan menaruh nilainya pada kode, log, chat, atau Git.
4. Ambil backup Production dan pastikan prosedur restore dapat digunakan. Jangan mulai perubahan skema tanpa backup yang dapat dipulihkan.
5. Pastikan project ref yang dipilih adalah `ptsasgdvgrbdtgyqieie` dan koneksi mengarah ke database Production yang benar.

### Jika instalasi npm CLI gagal di Windows

- Pada percobaan Codex, Node.js `v24.11.0` sudah memenuhi syarat minimum CLI (Node.js 20+). `npm exec --package supabase@2.84.2` keluar dengan status gagal; log yang terlihat hanya memuat `EPERM` saat npm membersihkan cache. Itu sendiri belum membuktikan penyebab awal.
- Unduhan langsung aset release CLI dari GitHub juga timeout. Alur instalasi npm CLI v2 menjalankan `postinstall` untuk mengambil binary platform dari GitHub Releases; karena itu penyebab paling kuat adalah koneksi/proxy/firewall ke GitHub Releases atau host aset release, sementara `EPERM` kemungkinan efek pembersihan cache di Windows setelah proses gagal.
- Minta tim menjalankan instalasi dari mesin yang dapat mengakses npm registry dan GitHub Releases, lalu verifikasi `npx supabase --version`. Jangan melewati `postinstall` dengan `--ignore-scripts`; binary CLI akan tidak tersedia. Bila akses GitHub sudah pulih tetapi `EPERM` tetap muncul, tutup proses npm lain dan gunakan cache npm baru untuk percobaan.

## Dry-run dan keputusan

Di PowerShell pada root repository:

```powershell
supabase --version
supabase db push --db-url "$env:SUPABASE_DB_URL" --include-all --dry-run
```

Dry-run ini hanya menampilkan migration yang akan dijalankan. Ledger snapshot memperkirakan 88 migration pending, termasuk dua versi out-of-order. Simpan daftar versi yang dicetak, tanpa menyimpan URL koneksi atau password.

**Hentikan proses** bila ref salah, dry-run tidak menunjukkan daftar yang dapat direkonsiliasi dengan 88 versi source pending, ada migration Production-only/unknown, atau backup belum dapat dipulihkan. Pastikan juga efek DDL untuk dua baris ledger tanpa metadata sudah dicocokkan dengan source. Karena versi tersebut sudah tercatat di ledger, CLI akan melewatinya; `--include-all` tidak memperbaiki DDL yang mungkin hilang dari dua migration itu.

Jangan jalankan `migration repair` atau mengubah ledger manual hanya untuk membuat nama/angka tampak cocok. Dua migration lama yang belum tercatat harus dijalankan sebagai migration source; jangan menandainya applied tanpa bukti DDL.

## Penerapan setelah dry-run dan backup disetujui

Setelah tim meninjau daftar dry-run dan memastikan backup tersedia, perintah penerapan menggunakan source dan URL yang sama:

```powershell
supabase db push --db-url "$env:SUPABASE_DB_URL" --include-all
```

Jalankan satu kali dari checkout yang ditinjau. Jangan membuka project/link lain dalam sesi yang sama. Jika perintah gagal di tengah jalan, hentikan dan simpan output error; jangan mengulang secara buta atau mengubah ledger untuk menutup kegagalan.

## Verifikasi setelah penerapan

1. Jalankan `supabase migration list --db-url "$env:SUPABASE_DB_URL"` dan pastikan seluruh 135 versi source tercatat. Dua baris metadata yang sebelumnya kosong perlu dicatat; verifikasi bahwa efek migration-nya memang ada sebelum memutuskan perbaikan metadata.
2. Jalankan skrip [inventaris baca-saja satu hasil](./PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION_SINGLE_EXPORT.sql) di PTSAS Production dan simpan CSV metadata. Jangan ekspor baris operasional.
3. Bandingkan relasi, kolom, constraint, indeks, RLS/FORCE RLS, policy, fungsi, pemicu, ACL, dan bucket terhadap source/VQE. Semua 119 relasi Production sebelumnya memiliki RLS dan FORCE RLS; jangan melonggarkan aturan untuk membuat modul terlihat.
4. Verifikasi smoke test aplikasi dan role/tenant pada jadwal UAT tim backend. Jika ada regresi, hentikan penggunaan fitur terdampak dan ikuti prosedur restore yang telah diuji.

Rujukan resmi: [Supabase CLI `db push`](https://supabase.com/docs/reference/cli/supabase-db-push) mendukung dry-run dan menjelaskan bahwa migration yang versinya sudah ada pada history akan dilewati; [CLI reference](https://supabase.com/docs/reference/cli/introduction) mencantumkan `--include-all` untuk migration yang tidak ada pada remote history.

