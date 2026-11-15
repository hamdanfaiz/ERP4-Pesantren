# Checkpoint — CBT skala tenant besar

**Tanggal:** 13 November 2026
**Branch:** `codex/cbt-scale-main-20261113`
**Basis:** `main` / `ae9633ec13bfb7fabb3f5d2ae9ae77e6a149e0a7` (PR #111 sudah merged)
**Target database:** VQE `vqemuyzveuirlkvdggjd` sebagai staging; PTSAS `ptsasgdvgrbdtgyqieie` sebagai Production.
**Status database:** Tidak ada migrasi atau data yang diterapkan pada staging maupun Production dalam batch ini. Pembacaan ledger VQE dan PTSAS dilakukan read-only.

## Progres yang dapat dibuktikan

- Implementasi source CBT untuk batch ini: **100%**.
- Verifikasi otomatis untuk source dan penyerahan tinjauan: **100%**; PR #112 Open/Ready for review. Tiga job required CI lulus pada head `a6c5d26` (run #1618).
- Kesiapan migrasi live untuk batch ini: **belum dapat dinyatakan**. VQE sudah memiliki objek ekuivalen; PTSAS belum memiliki RPC/indeks CBT batch. Dependency kolom sudah dicek, tetapi DDL keseluruhan, backup/restore, beban indeks, dan UAT belum tuntas.
- Progres keseluruhan ERP tidak dihitung ulang dari satu batch ini. Nilai lama tidak dapat dianggap metrik akurat tanpa inventaris dan bobot fitur yang sama.

## Perubahan pada branch

- API CBT Admin sekarang mencakup halaman bank soal, daftar sesi ujian, roster santri, penugasan/hasil, ringkasan dashboard, dan penyimpanan pengaturan tenant.
- Snapshot browser tidak lagi memuat seluruh daftar operasional. RPC server menghitung agregat dan cursor keyset dibatasi tenant/filter.
- Pengecekan Auth, profil aktif, role Admin/SuperAdmin, izin CBT, dan tenant dari profil server dipertahankan pada route.
- Pesan layar untuk pengguna dipetakan menjadi bahasa Indonesia yang aman; instruksi operator tidak ditampilkan di UI.
- Enam migrasi dan enam tes pgTAP melengkapi API:
  `20270321000000` hingga `20270326000000`.
- Aturan proyek diperbarui untuk memakai VQE sebagai rehearsal yang diizinkan. Rilis langsung ke PTSAS juga diizinkan pemilik bila seluruh gate Production terbukti; langsung ke Production tidak berarti boleh melewati rekonsiliasi, CI, keamanan, dan backup/restore.

## Pemeriksaan lokal

Lulus lokal: lint, build, test CBT, test pemetaan pesan, preflight sumber migrasi, cakupan workflow CI, API-route auth policy, flags, dan konfigurasi deployment pelanggan. GitHub Actions run #1618 pada head `a6c5d265f662afa8f3f5334403c1cb3780905987` lulus pada ketiga job required: frontend/build guard, migrations/API/pgTAP, dan instalasi pelanggan. Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB. Supabase Preview dilewati karena preview branch dinonaktifkan.

Belum lulus/terbukti:

- UAT browser masih belum dijalankan pada batch ini.
- Pemeriksaan baseline CI masih memakai inventaris Production historis 6 November 2026 (47 versi sampai `20261206000000`); hasil CI tidak membuktikan replay terhadap ledger Production terkini.
- `test:trusted-proxy-hops` terhalang sandbox lokal (`EACCES` ketika membuka socket loopback); workflow CI tetap menjalankan tes ini.

## Gerbang rilis database

Inventaris read-only terkini menunjukkan:

- **PTSAS Production:** 100 versi sampai `20270316000000`; 56 versi source belum tercatat, dan tiga versi (`20261205000000`, `20261206000000`, `20270118000000`) tidak mengembalikan nama. Semua versi yang tercatat cocok dengan nomor versi source, tetapi kesetaraan DDL/isi belum diverifikasi.
- **VQE staging:** 150 versi; source saat ini berisi 156. Ada 12 versi source yang belum tercatat persis, enam versi VQE yang tidak ada pada source saat ini, dan empat nomor versi dengan nama yang berbeda (`20270312000000`, `20270314000000`, `20270315000000`, `20270316000000`). Enam migration CBT lama tercatat pada VQE sebagai `20270314000000`–`20270319000000`; source main memakai `20270321000000`–`20270326000000`. Katalog Quran juga tercatat di VQE pada `20261109145507`, sementara source memakai `20270320000000`.
- Sepuluh fungsi CBT/Tahfidz yang diperiksa ada di VQE; isi body setiap fungsi cocok dengan source setelah normalisasi whitespace, dan seluruhnya `SECURITY INVOKER`. Sembilan RPC Admin hanya dapat dieksekusi `service_role`; fungsi validasi katalog tidak dapat dieksekusi oleh `anon`, `authenticated`, atau `service_role`.
- Sepuluh indeks untuk ringkasan, pencarian, dan pagination CBT serta ekstensi `pg_trgm` di schema `extensions` juga ada di VQE; definisi katalog sesuai dengan key/condition yang diminta migration batch. Pada PTSAS Production, kesepuluh fungsi dan kesepuluh indeks itu belum ada.

### Pembaruan pembacaan target rilis — 13 November 2026

- Pemilik mengizinkan rilis langsung ke PTSAS bila aman; jalur staging tetap dipakai bila membantu verifikasi. Izin ini tidak menghilangkan pemeriksaan backup/pemulihan atau rekonsiliasi DDL.
- GitHub PR #112 saat ini **Open, Ready for review** (bukan Draft), berbasis `main` `ae9633ec13bfb7fabb3f5d2ae9ae77e6a149e0a7`. Head `a6c5d265f662afa8f3f5334403c1cb3780905987`, CI run #1618 lulus 3/3 job.
- Pembacaan ulang PTSAS menunjukkan 100 entri ledger sampai `20270316000000`; tiga entri lama tidak mengembalikan nama. Sembilan fungsi dan sepuluh indeks CBT yang dibutuhkan batch ini belum ada di Production. Pemeriksaan katalog read-only menemukan seluruh kolom dan tipe kolom yang langsung dirujuk keenam migrasi sudah tersedia pada tabel CBT, santri, profil, tenant, referensi, dan data induk. Ini pemeriksaan dependensi terbatas, bukan bukti DDL keseluruhan sama dengan source.
- VQE berisi 150 entri ledger sampai migrasi CBT `20270319000000`. Di sana fungsi/index ekuivalen dari rangkaian CBT lama sudah ada dan definisinya cocok dengan source batch setelah normalisasi whitespace. Karena itu, jangan menjalankan ulang migrasi yang sama hanya untuk menambah nomor versi baru. UAT terhadap VQE sebaiknya memakai objek yang telah ada.
- Temuan tersebut membuat rilis CBT terarah layak disiapkan tanpa menutup semua selisih ledger Production. Runbook kandidat dan daftar migrasi allowlist ada di [Rilis terarah CBT ke PTSAS](../06_DATABASE/CBT_BATCH_PRODUCTION_RELEASE_2026-11-13.md). Belum ada migrasi yang dijalankan: koneksi MCP Production di sesi ini read-only, sementara bukti restore Production serta penilaian beban pembuatan indeks masih harus diberikan tim backend.

Jangan menjalankan `db push` untuk menutup semua versi ledger yang hilang. Pemeriksaan fungsi/index ini menunjukkan objek CBT batch sudah tersedia di VQE, tetapi ledger staging tetap berbeda; di PTSAS objek batch belum tersedia. CI saat ini menjalankan fixture historis dan bukan replay terhadap inventaris Production/VQE terkini. Tim backend perlu meninjau DDL/dependensi, bukti backup/restore, dan beban indeks sebelum menerapkan allowlist Production. Tidak ada migrasi/database yang diubah.

Urutan yang diutamakan: source → CI → VQE staging → PTSAS Production. Pemilik mengizinkan rilis langsung Production jika target, migrasi persis, dependensi/drift, seluruh CI, keamanan, dan backup/restore telah dibuktikan. Batch ini belum memenuhi gate live dan belum diterapkan.

## Langkah berikutnya

1. Tim meninjau PR #112 dan seluruh required checks pada head yang sama.
2. UATkan CBT dengan tenant uji VQE memakai objek yang sudah tersedia; jangan menjalankan ulang migrasi ekuivalen.
3. Untuk Production, tim backend mengambil backup dan membuktikan restore ke clone, memeriksa ketergantungan DDL langsung, dan memperkirakan lock/durasi 10 indeks.
4. Setelah gate tersebut lulus, terapkan hanya allowlist enam migrasi di runbook, verifikasi fungsi/grant/index, lalu deploy kode aplikasi yang sesuai dan smoke test tenant. Jangan menjalankan `db push` massal atau menandai migrasi lain sebagai selesai.

## Batas keselamatan

- Jangan mengubah/mereset checkout kanonis yang memiliki perubahan lokal lain.
- Jangan menampilkan atau mengirim `.env`, kata sandi, token, atau secret.
- Jangan menyalin, menghapus, atau menyemai data dummy tim.
- Jangan menyatakan batch ini siap deploy sebelum PR/CI dan gate database yang dipilih terbukti.
