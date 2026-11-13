# Checkpoint — CBT skala tenant besar

**Tanggal:** 13 November 2026
**Branch:** `codex/cbt-scale-main-20261113`
**Basis:** `main` / `ae9633ec13bfb7fabb3f5d2ae9ae77e6a149e0a7` (PR #111 sudah merged)
**Target database:** VQE `vqemuyzveuirlkvdggjd` sebagai staging; PTSAS `ptsasgdvgrbdtgyqieie` sebagai Production.
**Status database:** Tidak ada migrasi atau data yang diterapkan pada staging maupun Production dalam batch ini. Pembacaan ledger VQE dan PTSAS dilakukan read-only.

## Progres yang dapat dibuktikan

- Implementasi source CBT untuk batch ini: **100%**.
- Verifikasi otomatis dan penyerahan untuk tinjauan: **100%**; PR #112 terbuka sebagai draft dan tiga job required CI lulus.
- Kesiapan migrasi live untuk batch ini: **belum dapat dinyatakan**. VQE dan PTSAS memiliki ledger yang berbeda dari source; CBT objects ada di VQE tetapi kesetaraan definisi belum dibuktikan.
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

Lulus lokal: lint, build, test CBT, test pemetaan pesan, preflight sumber migrasi, cakupan workflow CI, API-route auth policy, flags, dan konfigurasi deployment pelanggan. CI pada head `d55df95066b025883fc99d29e1961778da4b00a4` lulus pada ketiga job required: frontend/build guard, migrations/API/pgTAP, dan instalasi pelanggan. Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB. Supabase Preview dilewati karena preview branch dinonaktifkan.

Belum lulus/terbukti:

- UAT browser masih belum dijalankan pada batch ini.
- Pemeriksaan baseline CI masih memakai inventaris Production historis 6 November 2026 (47 versi sampai `20261206000000`); hasil CI tidak membuktikan replay terhadap ledger Production terkini.
- `test:trusted-proxy-hops` terhalang sandbox lokal (`EACCES` ketika membuka socket loopback); workflow CI tetap menjalankan tes ini.

## Gerbang rilis database

Inventaris read-only terkini menunjukkan:

- **PTSAS Production:** 100 versi sampai `20270316000000`; 56 versi source belum tercatat, dan tiga versi (`20261205000000`, `20261206000000`, `20270118000000`) tidak mengembalikan nama. Semua versi yang tercatat cocok dengan nomor versi source, tetapi kesetaraan DDL/isi belum diverifikasi.
- **VQE staging:** 150 versi; source saat ini berisi 156. Ada 12 versi source yang belum tercatat persis, enam versi VQE yang tidak ada pada source saat ini, dan empat nomor versi dengan nama yang berbeda (`20270312000000`, `20270314000000`, `20270315000000`, `20270316000000`). Enam migration CBT lama tercatat pada VQE sebagai `20270314000000`–`20270319000000`; source main memakai `20270321000000`–`20270326000000`. Katalog Quran juga tercatat di VQE pada `20261109145507`, sementara source memakai `20270320000000`.
- Kesembilan RPC CBT dan sepuluh indeks yang dibutuhkan terlihat pada katalog VQE; fungsi-fungsinya berstatus `SECURITY INVOKER`. Definisi fungsi aktual belum dibandingkan byte-per-byte/semantik dengan SQL branch.

Jangan menjalankan `db push` untuk menutup semua versi ledger yang hilang. CI saat ini menjalankan fixture historis dan bukan replay terhadap inventaris Production/VQE terkini. Tim backend perlu merekonsiliasi dependency, DDL, dan bukti backup/restore sebelum migrasi Production. Tidak ada migrasi/database yang diubah.

Urutan yang diutamakan: source → CI → VQE staging → PTSAS Production. Pemilik mengizinkan rilis langsung Production jika target, migrasi persis, dependensi/drift, seluruh CI, keamanan, dan backup/restore telah dibuktikan. Batch ini belum memenuhi gate live dan belum diterapkan.

## Langkah berikutnya

1. Tim meninjau PR #112 dan seluruh required checks pada head yang sama.
2. Samakan lineage migration VQE dengan source atau jalankan pemeriksaan API/UAT tanpa mengulang migration yang telah ada.
3. Tim backend merekonsiliasi 56 versi Production yang belum tercatat, tiga metadata nama kosong, DDL/dependency, serta backup/restore.
4. UATkan layar dan alur CBT dengan akun/data sintetis tenant; jangan menyalin atau mengubah data dummy yang disediakan tim.
5. Setelah satu target release lolos seluruh gate, terapkan hanya set migration yang disetujui dan aktifkan flag CBT setelah objek yang dipakai tersedia.

## Batas keselamatan

- Jangan mengubah/mereset checkout kanonis yang memiliki perubahan lokal lain.
- Jangan menampilkan atau mengirim `.env`, kata sandi, token, atau secret.
- Jangan menyalin, menghapus, atau menyemai data dummy tim.
- Jangan menyatakan batch ini siap deploy sebelum PR/CI dan gate database yang dipilih terbukti.
