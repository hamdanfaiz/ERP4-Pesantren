# Checkpoint — HRIS dan rekonsiliasi rilis — 24 November 2026

## Pembaruan setelah PR #255

- PR [#255](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/255) memperjelas panel pengaturan Jabatan Pegawai pada modul SDM: judulnya menyebut jabatan secara langsung, panel terbuka otomatis, dan pilihan formulir pegawai diperbarui setelah katalog disimpan.
- PR #255 sudah tergabung ke `main` pada commit `3d0eb0397f82d51e722fea269df7c64fdfdc2f6d`.
- Ketiga job CI lulus: pemeriksaan frontend/build/runtime, replay migrasi dan tes database/API/pgTAP pada Supabase lokal terisolasi, serta instalasi NPM untuk environment pelanggan.
- CI bukan bukti UAT browser atau deployment Hostinger. Preview staging belum diperiksa setelah merge ini; Production PTSAS tidak diubah.
- Pencarian GitHub setelah merge menemukan 0 PR terbuka.

## Snapshot awal sebelum PR #255

- `main` berada pada merge PR [#246](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/246), commit `268f46e122b2d68aae33ee2111a0ee01eeffe4a0`.
- PR #246 menambah 43 assertion pgTAP untuk HRIS: pegawai, perubahan unit, presensi, pengajuan/ulasan cuti, audit, idempotensi, validasi, izin, dan isolasi tenant. Semua fixture dibatalkan dalam transaksi tes.
- CI pada commit merge lulus 4/4: build + guard runtime, paket pelanggan, migrasi/API/pgTAP, dan Supabase Preview. Ini bukti tes otomatis pada lingkungan sintetis; bukan UAT hosting atau pemeriksaan DDL Production.
- Saat checkpoint ini dibuat, pencarian GitHub menemukan **0 PR terbuka**.

## Rekonsiliasi PR tertutup tanpa merge

Ada 26 PR tertutup yang memang tidak berstatus merged. Pemeriksaan deskripsi dan penggantinya menunjukkan perubahan ditutup sebagai superseded/konsolidasi, bukan backlog yang masih menunggu merge:

- [PR #1–#11](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13) adalah rangkaian bertumpuk dan secara eksplisit ditutup sebagai superseded setelah cutover #13 digabung.
- [PR #92 dan #121](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/122) tercakup pada integrasi #122.
- [PR #93–#95](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/109) digantikan implementasi CBT #109–#111. Stack CBT #96–#100 dan #102 dikonsolidasikan melalui #112, yang kemudian tercakup di #122.
- [PR #107](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/108) digantikan dan digabung melalui #108.
- PR #116 adalah alternatif leaderboard dengan benturan versi migrasi; jalur kanonis diteruskan melalui #91 dan peringkat ayat unik melalui [#185](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/185).
- PR #182 digantikan oleh #185; [PR #202](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/203) digantikan oleh #203.

Jadi status tertutup tanpa merge pada daftar tersebut tidak berarti perubahan penting hilang. Tidak perlu membuka ulang atau menggabungkan branch lama.

## Staging dan gerbang modul

- Source saat ini memiliki 167 file migrasi. Snapshot sebelumnya menunjukkan VQE `vqemuyzveuirlkvdggjd` mencatat 167/167 versi dan nama yang cocok. Ini membuktikan paritas ledger, bukan kesetaraan penuh DDL manual atau kelulusan UAT.
- Pemilik melaporkan key environment berikut belum ditemukan di hPanel situs staging. Nilai dan target situs belum diverifikasi dalam checkpoint ini:
  - `SUPABASE_PPDB_RUNTIME_ENABLED`
  - `SUPABASE_FINANCE_RUNTIME_ENABLED`
  - `SUPABASE_FINANCE_BUDGET_RUNTIME_ENABLED`
  - `SUPABASE_HEALTHCARE_RUNTIME_ENABLED`
  - `SUPABASE_COOPERATIVE_RUNTIME_ENABLED`
  - `SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED`
  - `SUPABASE_HRIS_RUNTIME_ENABLED`
  - `SUPABASE_FACILITY_BOOKINGS_RUNTIME_ENABLED`
  - `SUPABASE_GA_ASSETS_RUNTIME_ENABLED`
  - `SUPABASE_DONATION_RUNTIME_ENABLED`
  - `SUPABASE_MARKETPLACE_RUNTIME_ENABLED`
- Sebelum mengubah environment, pastikan `SUPABASE_PROJECT_REF` pada situs tersebut menunjuk VQE staging. Pasangkan `VITE_SUPABASE_PPDB_RUNTIME_ENABLED` bila PPDB Admin diaktifkan. Restart proses Node.js setelah perubahan dan uji satu modul pada satu waktu.
- Pendaftaran PPDB publik memiliki gerbang terpisah (`SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`, `PUBLIC_PPDB_ENABLED`, dan `PUBLIC_PPDB_TENANT_ID`). Biarkan tertutup kecuali pembukaan pendaftaran publik disetujui dan ditinjau terpisah. Jangan menaruh secret pada variabel `VITE_*`.

## Production dan pekerjaan tersisa

PTSAS Production `ptsasgdvgrbdtgyqieie` tetap **tidak disentuh**. Snapshot baca-saja terakhir mencatat 100 dari 167 versi migrasi; 67 versi source belum tercatat dan tiga baris ledger tidak memiliki nama. Ini bukan instruksi untuk menerapkan semua selisih.

Sebelum promosi Production, tim pemilik database masih perlu membandingkan DDL aktual dengan payload migrasi, memastikan urutan/dependensi dan baris ledger, serta membuktikan backup dapat dipulihkan. UAT browser lintas modul/role, upload/akses Storage, reset sandi/notifikasi, dan pemasangan bersih/upgrade/restore pada target VPS atau on-premise juga belum dibuktikan menyeluruh.

**Larangan untuk langkah berikutnya:** jangan menjalankan `db push` massal, menandai migrasi applied tanpa bukti, atau mengubah PTSAS Production sebelum rekonsiliasi DDL dan bukti pemulihan tersedia.

