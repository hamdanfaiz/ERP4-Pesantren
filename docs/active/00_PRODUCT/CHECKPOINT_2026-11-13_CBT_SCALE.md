# Checkpoint — CBT skala tenant besar

**Tanggal:** 13 November 2026
**Branch:** `codex/cbt-scale-main-20261113`
**Basis:** `main` / `ae9633ec13bfb7fabb3f5d2ae9ae77e6a149e0a7` (PR #111 sudah merged)
**Target database:** VQE `vqemuyzveuirlkvdggjd` sebagai staging; PTSAS `ptsasgdvgrbdtgyqieie` sebagai Production.
**Status database:** Tidak ada migrasi atau data yang diterapkan pada staging maupun Production dalam batch ini.

## Progres yang dapat dibuktikan

- Implementasi source CBT untuk batch ini: **100%**.
- Penyerahan batch agar dapat ditinjau: **sekitar 70%**; PR dan CI untuk commit final belum dibuat/dijalankan.
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

Lulus: lint, build, test CBT, test pemetaan pesan, preflight sumber migrasi, cakupan workflow CI, API-route auth policy, flags, dan konfigurasi deployment pelanggan. Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB.

Belum lulus/terbukti:

- GitHub Actions untuk commit final belum berjalan.
- pgTAP dan API round-trip belum dijalankan lokal karena Docker tidak tersedia; harus lulus di CI.
- `test:trusted-proxy-hops` terhalang sandbox lokal (`EACCES` ketika membuka socket loopback); workflow CI tetap menjalankan tes ini.
- Tidak ada UAT browser baru pada batch ini.

## Gerbang rilis database

Jangan menjalankan `db push` untuk menutup semua versi ledger yang hilang. Snapshot baca-saja Production yang pernah diberikan sebelumnya menunjukkan 47 entri ledger; keadaan DDL Production, dependensi dari versi yang belum tercatat, dan bukti backup/restore harus dikonfirmasi tim backend terhadap keadaan terkini.

Urutan yang diutamakan: source → CI → VQE staging → PTSAS Production. Pemilik mengizinkan rilis langsung Production jika target, migrasi persis, dependensi/drift, seluruh CI, keamanan, dan backup/restore telah dibuktikan. Batch ini belum memenuhi gate tersebut dan belum diterapkan.

## Langkah berikutnya

1. Tinjau diff akhir dan kirim branch ini sebagai PR berbasis `main` agar tim backend dapat meninjau.
2. Tunggu semua required GitHub checks hijau pada head yang sama; selesaikan regresi jika ada.
3. Setelah CI hijau, lakukan rehearsal VQE. Jika memilih jalur langsung PTSAS, backend harus lebih dulu mengonfirmasi preflight Production dan backup/restore yang dapat dipulihkan.
4. UATkan layar dan alur CBT dengan akun/data sintetis tenant; jangan menyalin atau mengubah data dummy yang disediakan tim.
5. Aktifkan flag CBT hanya setelah seluruh objek yang dipakai tersedia pada target yang disetujui.

## Batas keselamatan

- Jangan mengubah/mereset checkout kanonis yang memiliki perubahan lokal lain.
- Jangan menampilkan atau mengirim `.env`, kata sandi, token, atau secret.
- Jangan menyalin, menghapus, atau menyemai data dummy tim.
- Jangan menyatakan batch ini siap deploy sebelum PR/CI dan gate database yang dipilih terbukti.
