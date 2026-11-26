# Checkpoint proyek — 27 November 2026, pasca-penggabungan PR #269–#270

## Source kode dan PR

- Source resmi pada GitHub `main`: `9295420e26af0b462c42382ff96091fc59ca9817`.
- PR #269, Kegiatan Komunitas Alumni, sudah digabung pada `bd5c9a95d21f87e3dea932c3a300cfbbdb2d9b8f`.
- PR #270, jadwal shift tenant-scoped HRIS, sudah digabung sesudah #269 pada `9295420e26af0b462c42382ff96091fc59ca9817`.
- Pemeriksaan GitHub menunjukkan tidak ada PR terbuka.
- Dokumentasi handoff: [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) dan [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md).

## Perubahan yang tergabung

- **Kegiatan Komunitas Alumni:** data kegiatan tersimpan di Supabase per tenant; daftar, kategori baku, pembuatan idempoten, dan perubahan status didukung oleh RPC transaksional. Route memerlukan autentikasi dan izin modul Alumni.
- **Jadwal shift HRIS:** pola mingguan dan penugasan rentang tanggal per pegawai; konflik ditolak dalam transaksi termasuk shift lintas tengah malam. Pembatalan mempertahankan riwayat audit dan operasi idempoten.
- Kedua fitur memakai feature flag tersendiri yang default-nya nonaktif. Tabel baru ber-RLS dan FORCE RLS; role browser tidak memperoleh akses tabel/RPC langsung.
- Migrasi berurutan: `20270406000000_alumni_community_events`, lalu `20270407000000_hris_shift_scheduling`.

## Bukti verifikasi

- CI PR #269 run [#2528](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45901949531) lulus seluruh tiga job.
- CI PR #270 run [#2530](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45904519325) lulus seluruh tiga job. Rangkaian database mencakup 2.053 pemeriksaan, replay migrasi historis terisolasi, HRIS/API, pgTAP, auth/tenant, Storage, dan backup/restore lokal.
- CI pasca-merge pada `main`, run [#2532](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45905618765), lulus seluruh tiga job.
- Lokal pada branch PR #270 lulus: lint/typecheck, build, tes adapter HRIS shift, migration preflight, konfigurasi feature flag dan Compose, runtime-config HTTP, serta kebijakan autentikasi route. Build memberi peringatan chunk PDF besar; build tetap lulus.
- **UAT Admin VQE:** kegiatan Alumni berhasil disimpan, dimuat ulang, lalu ditandai selesai. HRIS menguji pola malam, dini hari, dan siang; penugasan malam/siang tersimpan, konflik lintas tengah malam ditolak, dan pembatalan tetap tercatat setelah muat ulang. Data UAT sintetis masih ada di VQE.
- Uji ini tidak membuktikan UAT semua modul, seluruh role, isolasi lintas-tenant pada UI, maupun deployment Hostinger pasca-merge.

## Database dan deployment

- Migrasi PR #269 dan #270 diterapkan hanya pada VQE staging `vqemuyzveuirlkvdggjd`. Snapshot yang tercatat memuat 169 versi hingga `20270407000000`.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh oleh pekerjaan ini. Snapshot ledger baca-saja terakhir yang tersedia memuat 100 versi hingga `20270316000000`; angka itu tidak membuktikan definisi DDL aktual cocok dengan source.
- CI menjalankan backup/restore pada database sintetis terisolasi. Itu bukan bukti bahwa backup Production dapat dipulihkan.
- Merge kode ke `main` tidak sama dengan menjalankan migrasi Production atau mengaktifkan flag. Hostinger belum diperiksa untuk memastikan commit `9295420` sudah diterapkan.

## Langkah berikutnya untuk tim backend

1. Pastikan Hostinger menggunakan commit `9295420` dan tentukan apakah fitur baru tetap nonaktif pada deployment sampai migrasi dijadwalkan.
2. Rekonsiliasi DDL dan ledger PTSAS terhadap source untuk setiap migrasi yang diperlukan; tinjau dependensi serta urutan secara manual.
3. Buktikan backup Production dapat dipulihkan pada lingkungan yang aman, lalu siapkan change window dan prosedur rollback.
4. Terapkan hanya migrasi yang sudah disetujui melalui proses terkontrol. Jangan menerapkan selisih ledger secara massal atau menjalankan `db push` tanpa rekonsiliasi.
5. Setelah skema tersedia, aktifkan flag secara bertahap dan ulangi UAT role/tenant pada target hosting sebelum membuka fitur kepada pengguna.
6. Lanjutkan UAT menyeluruh seluruh modul: alur CRUD, relasi, validasi, role/tenant, transaksi, Storage, kondisi kosong/error, dan instalasi VPS/on-premise.

**Status:** pekerjaan kode #269–#270 selesai dan sudah berada di `main`; produk ERP secara keseluruhan belum terbukti siap Production atau siap komersial. Gate Production dan UAT lintas-modul tetap terbuka.
