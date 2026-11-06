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



## Addendum inventaris Production baca-saja — 6 November 2026, 13:31 UTC

Addendum ini memperbarui kesimpulan yang lebih lama pada runbook ini. Pemeriksaan dilakukan lewat SQL Editor dashboard pada project ptsasgdvgrbdtgyqieie, cabang main PRODUCTION; query hanya membaca katalog dan ledger, tanpa membaca data operasional atau menjalankan DDL/DML.

### Hasil yang diverifikasi

- Ledger mencatat 47 versi sampai 20261206000000; repository source memuat 135 versi, sehingga 88 versi belum tercatat. Dua versi awal yang hilang dari ledger ialah 20261031104213 dan 20261031225438; 86 versi lain lebih baru.
- Baris 20261205000000 dan 20261206000000 tidak memiliki nama/payload migration di ledger. Pemeriksaan katalog pada 13:29:55 dan 13:31:13 UTC mengonfirmasi efek inti dari source migration 20261205000000_data_api_default_privilege_hardening.sql dan 20261206000000_ppdb_legacy_candidate_import.sql sudah ada. Jangan menjalankan ulang DDL atau melakukan migration repair hanya karena metadata kedua baris kosong.
- Hardening ACL terlihat pada default ACL Production; empat helper trigger yang diperiksa tidak memiliki hak EXECUTE langsung untuk anon, authenticated, atau service_role.
- Struktur impor PPDB legacy terlihat: kolom metadata sumber kandidat dan indeks unik parsial tersedia; ppdb_legacy_import_batches memiliki sepuluh kolom wajib, RLS/FORCE RLS aktif, constraint/FK tervalidasi; RPC import_legacy_ppdb_candidates adalah SECURITY INVOKER, memakai search_path tetap, dan hanya dapat dieksekusi service_role.
- Dari 119 tabel publik, semuanya mengaktifkan RLS dan FORCE RLS; hanya tabel root tenants tanpa tenant_id. Katalog memiliki 5 policy publik, 402 indeks, 119 fungsi, 24 pemicu non-internal, dan 2 bucket Storage.
- Akses SQL Editor dashboard berhasil untuk pembacaan tersebut, tetapi konektor MCP Codex tetap hanya menampilkan VQE dan permintaan daftar migration PTSAS masih ditolak. Panel Read-only di dashboard tidak otomatis memberi otorisasi ke sesi MCP yang berbeda.

### Gerbang sebelum migrasi Production

1. Ambil backup penuh dan buktikan jalur pemulihan pada prosedur yang sesuai; jangan melakukan cutover tanpa backup yang bisa dipulihkan.
2. Gunakan checkout commit PR #40 yang sama dan sudah direview. Simpan inventaris baca-saja penuh terbaru serta daftarkan selisih migration 88 versi sebagai daftar kerja; jangan menafsirkan selisih ledger sebagai bukti bahwa seluruh objeknya hilang.
3. Jalankan supabase db push --dry-run --include-all pada URL Production yang disimpan aman di mesin operator. Cocokkan setiap versi yang direncanakan dengan inventaris dan rehearsal CI. Hentikan bila target, versi, atau urutan tidak cocok; dry-run bukan pemeriksaan kesetaraan schema penuh.
4. Jangan menandai migration applied, mengedit ledger, atau mengulang dua DDL yang efek intinya sudah terbukti hanya untuk menyamakan metadata. Jika CLI mengusulkan migration yang merusak objek yang telah ada, jangan jalankan; buat rencana rekonsiliasi idempoten dan review terpisah.
5. Setelah review operator/backend dan persetujuan cutover, terapkan perubahan satu kali, lalu ulangi inventaris katalog/ledger dan UAT role-tenant. Catat commit source, backup ID, dry-run, hasil apply, dan verifikasi pasca-apply.

Sampai semua gerbang ini lulus, status Production adalah belum dimigrasikan penuh dan belum siap cutover. Tidak ada perubahan tulis Production yang dilakukan dalam pemeriksaan ini.