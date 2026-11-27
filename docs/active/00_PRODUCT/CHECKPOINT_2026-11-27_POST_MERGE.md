# Checkpoint proyek — 27 November 2026, pasca-penggabungan PR #269–#277

## Source kode dan PR

- Snapshot pada checkpoint ini: PR #277 (refresh handoff) baru saja merged ke `main` sebagai `ec290c0f86b42b39499d80be0f06827f97585adb`. Gunakan HEAD `main` untuk source saat ini. Perubahan aplikasi terbaru tetap ada pada PR #270; PR #271–#277 dokumentasi saja.
- PR #269, Kegiatan Komunitas Alumni, sudah digabung pada `bd5c9a95d21f87e3dea932c3a300cfbbdb2d9b8f`.
- PR #270, jadwal shift tenant-scoped HRIS, digabung sesudah #269 pada `9295420e26af0b462c42382ff96091fc59ca9817`. PR #271–#274 mencatat handoff dan UAT; PR #275 mencatat UAT Dokumen Digital; #276 membetulkan klaim OCR/tanda tangan dan menandai catatan prototipe; #277 memperbarui status kesiapan komersial. PR #271–#277 hanya mengubah dokumentasi.
- PR #275, #276, dan #277 telah merged pada saat checkpoint ini disusun. Tidak ada perubahan runtime, skema, atau data pada Production.
- Dokumentasi handoff: [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) dan [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md).

## Perubahan yang tergabung

- **Kegiatan Komunitas Alumni:** data kegiatan tersimpan di Supabase per tenant; daftar, kategori baku, pembuatan idempoten, dan perubahan status didukung oleh RPC transaksional. Route memerlukan autentikasi dan izin modul Alumni.
- **Jadwal shift HRIS:** pola mingguan dan penugasan rentang tanggal per pegawai; konflik ditolak dalam transaksi termasuk shift lintas tengah malam. Pembatalan mempertahankan riwayat audit dan operasi idempoten.
- Kedua fitur memakai feature flag tersendiri yang default-nya nonaktif. Tabel baru ber-RLS dan FORCE RLS; role browser tidak memperoleh akses tabel/RPC langsung.
- Migrasi berurutan: `20270406000000_alumni_community_events`, lalu `20270407000000_hris_shift_scheduling`.

## Bukti verifikasi

- CI PR #269 run [#2528](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45901949531) lulus seluruh tiga job.
- CI PR #270 run [#2530](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45904519325) lulus seluruh tiga job. Rangkaian database mencakup 2.053 pemeriksaan, replay migrasi historis terisolasi, HRIS/API, pgTAP, auth/tenant, Storage, dan backup/restore lokal.
- CI pasca-merge `main`, run [#2532](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45905618765), lulus seluruh tiga job. CI dokumentasi PR #274, run [#2540](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45915558054), juga lulus tiga job. PR #275 [#2542](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45916885473), #276 [#2545](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45918500236), dan #277 [#2547](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45920215204) masing-masing lulus tiga job; post-merge #276 [run](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45919310407) dan #277 [run](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45920984833) lulus seluruh pemeriksaan. Ini tidak mengubah atau mengaudit Production.
- Lokal pada branch PR #270 lulus: lint/typecheck, build, tes adapter HRIS shift, migration preflight, konfigurasi feature flag dan Compose, runtime-config HTTP, serta kebijakan autentikasi route. Build memberi peringatan chunk PDF besar; build tetap lulus.
- **UAT Admin VQE:** kegiatan Alumni berhasil disimpan, dimuat ulang, lalu ditandai selesai. HRIS menguji pola malam, dini hari, dan siang; penugasan malam/siang tersimpan, konflik lintas tengah malam ditolak, dan pembatalan tetap tercatat setelah muat ulang. Data UAT sintetis masih ada di VQE.
- Pemeriksaan visual pasca-merge di Hostinger staging pada Admin UAT: modul SDM terbuka, katalog Jabatan Pegawai (MUDIR dan UAT Pengelola Asrama) tampil, dan formulir Tambah Pegawai menawarkan kedua pilihan tersebut. Ringkasan Tahfidz terbuka dan leaderboard mengurutkan jumlah ayat hafalan unik (15 sebelum 10 pada fixture sintetis). Asrama menampilkan container gelap dan navigasi tab yang dapat digulir. Pemeriksaan navigasi ini tidak menyimpan perubahan data.
- Pemeriksaan tersebut adalah spot check tiga layar; ini tidak membuktikan UAT semua modul, seluruh role, isolasi lintas-tenant pada UI, atau alur CRUD menyeluruh.
- **UAT Tahfidz lanjutan, 27 November:** sebagai Admin UAT di Hostinger staging/VQE, setoran sintetis Santri 02 (Al-Kahf 16–20, Hifzh A, Tajwid A) tersimpan dan muncul pada Riwayat Setoran dengan surah/rentang dari katalog. Leaderboard naik dari 15 menjadi 20 ayat unik dan tetap di atas Santri 01 dengan 10 ayat. Ini membuktikan satu alur simpan-baca dan pembaruan peringkat di tenant uji, bukan seluruh Tahfidz atau isolasi lintas tenant.
- **UAT Dokumen Digital, 27 November:** dokumen internal sintetis `DOC/2026/00004` tersimpan dan tetap tampil setelah muat ulang. Perubahan status Terdaftar → Dalam telaah → Disetujui → Diarsipkan berhasil; dokumen tampil di Arsip Digital. Tidak ada lampiran PDF atau pengiriman eksternal. Tab OCR menyatakan ekstraksi otomatis belum tersedia dan saat ini hanya menampilkan berkas untuk ditelaah/diunduh manual; fitur OCR menjadi gap rilis komersial bila tetap ditawarkan sebagai pemindai.


- **Smoke test antarmuka tambahan, 27 November:** pada Hostinger staging/VQE, halaman PPDB, Keuangan & Tagihan, UKS, Koperasi & Kantin, Manajemen Multi-Unit, Keuangan & Anggaran, SDM, Sarana & Prasarana, Relasi Wali & Donatur, Donasi & Wakaf, dan Marketplace berhasil dibuka sebagai Admin UAT. Halaman menampilkan daftar, form, atau empty state sesuai modul; tidak terlihat pesan “Fitur ini belum tersedia saat ini” pada layar yang diperiksa. Ini pemeriksaan pembukaan layar, bukan pembuktian seluruh fungsi modul.
- **Fixture UAT tambahan yang tersimpan di VQE, 27 November:** kontak CRM UAT Calon Wali 20261127-01; aset UAT Peralatan 20261127-01 (kode otomatis AST-00001, nilai Rp0); rancangan RKAT UAT RKAT November 2026 pada Unit UAT Pesantren (Rp100.000, status Rancangan, belum disetujui); kampanye UAT Kampanye Wakaf Perpustakaan 20261127 (target Rp5.000.000, status paused); dan profil UAT Donatur Masyarakat 20261127-01 (kontribusi Rp0). Semua terlihat kembali pada daftar/halaman detail sesudah penyimpanan. PTSAS Production tidak disentuh.
- Tidak dibuat pendaftar PPDB karena formulir Admin memuat kolom NIK; tidak dibuat catatan medis, transaksi, pembayaran, atau pengiriman pesan. Data tersebut memerlukan fixture terencana agar tidak menyerupai identitas atau kejadian nyata.

## Database dan deployment

- Migrasi PR #269 dan #270 diterapkan hanya pada VQE staging `vqemuyzveuirlkvdggjd`. Snapshot yang tercatat memuat 169 versi hingga `20270407000000`.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh oleh pekerjaan ini. Snapshot ledger baca-saja terakhir yang tersedia memuat 100 versi hingga `20270316000000`; angka itu tidak membuktikan definisi DDL aktual cocok dengan source.
- CI menjalankan backup/restore pada database sintetis terisolasi. Itu bukan bukti bahwa backup Production dapat dipulihkan.
- Hostinger staging `lightgreen-jay-425688.hostingersite.com` terakhir tercatat Current pada commit aplikasi `dca570c` setelah redeploy 27 November sekitar 06.09 WIB. Admin UAT membuka SDM, Tahfidz, dan Asrama sesudahnya. PR #271–#277 hanya dokumentasi; identitas runtime hosting terbaru belum dikonfirmasi.
- Merge kode ke `main` tidak sama dengan menjalankan migrasi Production atau mengaktifkan flag. PTSAS Production tidak disentuh.

## Catatan lanjutan staging — 27 November 2026

- Pada hPanel situs `lightgreen-jay-425688.hostingersite.com`, dua gerbang fitur Komunitas Alumni yang sebelumnya belum ada ditambahkan hanya untuk VQE: `SUPABASE_ALUMNI_EVENTS_RUNTIME_ENABLED=true` dan `VITE_SUPABASE_ALUMNI_EVENTS_RUNTIME_ENABLED=true`. Tidak ada secret yang diubah.
- Redeploy Hostinger selesai pada commit `1dbb556562c0bf77eec40850c5501e253a73d3a1`. `/runtime-config.json` mengonfirmasi flag UI aktif dan URL proyek staging mengarah ke VQE (`vqemuyzveuirlkvdggjd`). Setelah aplikasi dimuat ulang, tab Komunitas muncul dan kegiatan sintetis `[UAT] Reuni Alumni ERP4` terbaca. Ini membuktikan konfigurasi, visibilitas, dan baca daftar di staging; bukan bukti perubahan Production.
- Pemeriksaan sumber menemukan keterangan direktori Alumni yang menjelaskan bahwa beberapa tab memakai daftar yang sama. Teks tersebut diganti dengan panduan pengguna yang berfokus pada direktori dan tujuan tiap tab. Perubahan antarmuka ini masih lokal di branch `codex/uat-followup-20261127`, belum ada di deployment staging.
- Pemeriksaan lokal setelah perubahan: `npm run lint`, `npm run build`, dan `npm run test:alumni-workflow` lulus. Build menampilkan peringatan ukuran chunk PDF besar dan anotasi komentar dependensi yang diabaikan Rollup; tidak ada kegagalan build.

## Langkah berikutnya untuk tim backend

1. Lanjutkan smoke test serta alur tambah–simpan–muat ulang untuk seluruh modul di Hostinger staging/VQE, termasuk modul yang baru diaktifkan lewat feature flag. Pisahkan fitur yang memang belum tersedia dari kesalahan runtime.
2. Rekonsiliasi DDL dan ledger PTSAS terhadap source untuk setiap migrasi yang diperlukan; tinjau dependensi serta urutan secara manual.
3. Buktikan backup Production dapat dipulihkan pada lingkungan yang aman, lalu siapkan change window dan prosedur rollback.
4. Terapkan hanya migrasi yang sudah disetujui melalui proses terkontrol. Jangan menerapkan selisih ledger secara massal atau menjalankan `db push` tanpa rekonsiliasi.
5. Setelah skema tersedia, aktifkan flag secara bertahap dan ulangi UAT role/tenant pada target hosting sebelum membuka fitur kepada pengguna.
6. Lanjutkan UAT menyeluruh seluruh modul: alur CRUD, relasi, validasi, role/tenant, transaksi, Storage, kondisi kosong/error, dan instalasi VPS/on-premise.

**Status:** pekerjaan aplikasi #269–#270 dan dokumentasi #271 sudah berada di `main`; produk ERP secara keseluruhan belum terbukti siap Production atau siap komersial. Gate Production dan UAT lintas-modul tetap terbuka.

