# Matriks Cakupan Pengujian Modul ERP4 Pesantren

Tanggal audit awal: 7 November 2026
Status diperbarui: 8 November 2026
Baseline terbaru: `main` commit `5ead22585bc80691f255955c8b77d93e01d10a3c`, setelah PR #72 merged
Run CI terbaru: [GitHub Actions](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42431333842)

## Cara membaca status

- **API round-trip CI**: request melalui server aplikasi terhubung ke Supabase lokal sintetis, lalu data dibaca kembali dan relasi/izin diperiksa.
- **Database/unit CI**: prosedur, constraint, RLS, validasi, atau logika modul diuji, tetapi belum membuktikan alur antarmuka dan API penuh.
- **Belum end-to-end**: belum ditemukan bukti positif yang menuntaskan alur pengguna dari antarmuka sampai data tersimpan dan dibaca kembali.
- Bukti pada baseline terbaru mencakup PR #68 dan PR #72. Tes unit/logika tetap dibedakan dari round-trip API, Storage, dan UAT UI.

## Cakupan per modul

| Modul / alur | Bukti otomatis pada baseline | Status dan batas bukti |
|---|---|---|
| Identitas, tenant, dan direktori pengguna | API auth/tenant, role, isolasi tenant, perubahan password awal, penolakan eskalasi, kompensasi saat penulisan profil gagal; provisioning positif SuperAdmin → Admin | **API sebagian lulus.** Tes provisioning positif berada pada PR #68 yang sudah merged dan CI-nya lulus. UAT browser login dan pemetaan role pelanggan belum dilakukan. |
| Dashboard dan analitik | API snapshot; kalkulasi cash flow | **Baca API dan logika lulus.** Belum ada UAT visual seluruh kartu/filter dan verifikasi silang dengan transaksi produksi. |
| Data Induk, referensi, dan Naming Series | Tes katalog/referensi API, impor CSV, relasi impor santri, paginasi, PII browser, Naming Series, dan reservasi NIS bersamaan | **DB/logika dan sebagian API lulus.** UAT formulir CRUD serta impor data dari UI belum menyeluruh. |
| PPDB Admin | pgTAP pembuatan/pencarian kandidat, impor legacy; tes HTTP dokumen Admin dan Storage; workflow kandidat sintetis di VQE staging (8 Nov 2026) | **API staging dan CI PR #68 lulus** untuk transisi Registered → Document Review → Entry Exam → Interview → Accepted. UAT browser belum dilakukan. |
| PPDB publik | pgTAP RPC, idempotensi, batas identitas/tenant, aturan dokumen privat; validasi ukuran/format; round-trip HTTP sintetis pada VQE staging (8 Nov 2026) | **Database, API staging, dan CI PR #68 lulus.** Test memeriksa konfigurasi/daftar jenjang, penyimpanan kandidat, relasi jenjang, enkripsi/fingerprint NIK, empat upload dan baca ulang objek privat, retry, konflik, serta duplikasi NIK. Temuan test: route config sebelumnya tidak mengirim `gradeLevels`, sehingga formulir tidak dapat dibuka; route telah diperbaiki. Belum UAT browser. |
| Onboarding PPDB → santri/wali/asrama | pgTAP transaksi onboarding, relasi kandidat ke santri/wali, NIS, kamar, okupansi, dan retry; tes kelayakan kamar; HTTP round-trip sintetis VQE staging (8 Nov 2026) | **API/database staging dan CI PR #68 lulus:** kandidat diterima menjadi santri dan wali, relasi kelas/gedung/kamar tersimpan, NIS dan klaim identitas beralih, okupansi naik sekali, tagihan PPDB tertaut ke santri, retry idempoten, dan konflik penempatan ditolak. UAT browser belum dilakukan. |
| Keuangan dan bukti pembayaran | pgTAP Finance; tes HTTP upload/download bukti, pembatasan role/tenant, batas laju, bucket privat; tes kalkulasi dashboard; tagihan kandidat PPDB melalui API di VQE staging (8 Nov 2026) | **Cakupan API/DB sebagian lulus.** API berhasil membuat tagihan pendaftaran/tuition dan retry tidak menggandakan tagihan; onboarding menautkan tagihan kandidat ke santri. Rekonsiliasi Production dan UAT akuntansi tetap perlu tim backend. |
| Asrama | pgTAP izin, disiplin, kehadiran, unit, penempatan kamar, riwayat, kapasitas, dan konkurensi; API round-trip izin, disiplin, dan absensi pada PR #72 | **Database dan API round-trip lulus untuk alur yang dicakup.** CI memeriksa simpan-baca, relasi santri-kamar, transisi status, event audit, retry idempoten, role, dan isolasi tenant. API/UI seluruh alur penugasan kamar, fasilitas, dan UAT browser belum terbukti menyeluruh. |
| Akademik | API jurnal, jadwal, asesmen, portal, relasi kelas/guru/santri, retry dan tenant; tes paginasi/konflik/role | **API round-trip dan logika lulus di CI.** Belum UAT browser lintas role. |
| Tahfidz | API halaqah, keanggotaan, setoran, retry, tenant/role; pgTAP target, sesi, hasil, peer review dan tanggal bisnis | **API round-trip dan database lulus di CI.** Audio, perangkat nyata, dan keseluruhan alur UI belum diuji. |
| CBT | pgTAP tenggat server, validasi payload, impor pengaturan | **Database dan logika impor diuji.** Belum round-trip API/UI ujian lengkap dan simulasi beban peserta. |
| LMS | pgTAP integritas materi/rekaman/nilai dan validasi payload | **Database lulus.** Belum alur API/UI pengajar dan santri dari materi sampai penilaian. |
| Koperasi | API katalog, stok, penjualan, dompet/posting, retry dan isolasi tenant; pgTAP idempotensi | **API round-trip dan database lulus di CI.** Rekonsiliasi operasional nyata belum dilakukan. |
| Marketplace | API produk, stok, pesanan, pembatalan, relasi item, isolasi tenant | **API round-trip lulus di CI.** Pembayaran eksternal/PPOB tidak termasuk dan tetap di luar rilis awal. |
| CRM dan komunikasi | API kontak/interaksi dan pengumuman/audiens | **API round-trip lulus di CI.** Email, push, atau kanal eksternal memerlukan konfigurasi dan tes penyedia terpisah. |
| Laundry | API pesanan/status/isolasi tenant; pgTAP idempotensi | **API round-trip dan database lulus di CI.** Perangkat/operasi loket belum UAT. |
| Donasi dan wakaf | API transaksi serta relasi donor/kampanye; pgTAP idempotensi | **API round-trip dan database lulus di CI.** Penerbitan bukti/rekonsiliasi nyata perlu UAT. |
| Perpustakaan | API kategori, buku, sirkulasi/pengembalian; HTTP Storage aset digital privat; tes impor legacy | **API round-trip dan Storage lulus di CI.** Scanner/antarmuka perangkat belum UAT. |
| Dokumen digital | API pendaftaran, nomor, filter, workflow/audit; validasi dan Storage privat | **API/Storage sebagian besar lulus di CI.** Konsistensi gaya tab yang dilaporkan pengguna dan alur UI masih perlu pemeriksaan browser. |
| Kesehatan | API kunjungan/rekam dan relasi; pgTAP idempotensi | **API round-trip dan database lulus di CI.** Perangkat dan workflow petugas belum UAT. |
| General Affairs dan aset | API katalog terkait, kode otomatis, opname, mutasi stok; pgTAP idempotensi | **API round-trip dan database lulus di CI.** Inventaris fisik belum dicocokkan dengan data nyata. |
| Pemesanan fasilitas | API relasi katalog, pemesanan, overlap, pembatalan, retry dan isolasi tenant | **API round-trip lulus di CI.** Kalender multi-pengguna dan UAT browser belum dilakukan. |
| HRIS | API pegawai, nomor otomatis, referensi unit/jabatan, absensi, cuti, persetujuan, retry dan isolasi tenant | **API round-trip lulus di CI pada baseline.** Tes baru Admin provisioning belum termasuk baseline. |
| Alumni | Tes logika kelulusan dan impor legacy | **Logika diuji.** Belum ditemukan round-trip API/UI alumni lengkap. |
| Pengaturan sistem, multi-unit, pencarian/umpan balik | Tes schema/keamanan, tenant enterprise units, konfigurasi runtime, dan validasi beberapa logika | **Database/configuration sebagian diuji.** UAT API/UI dengan tenant multi-unit dan operator belum menyeluruh. |

## Gerbang yang masih tersisa

1. PR #68 (provisioning positif, PPDB, onboarding) dan PR #72 (asrama) sudah merged ke `main`; CI untuk kedua perubahan lulus.
2. Jalankan UAT browser pada staging untuk role Admin, Ustadz, Santri, dan Wali, termasuk navigasi, validasi form, status loading/error/kosong, serta penyimpanan lintas modul.
3. Tim backend melakukan pembandingan DDL/urutan migrasi Production, backup-restore rehearsal, lalu deployment dan UAT hosting. Tes staging/CI tidak menggantikan bukti tersebut.

## Verifikasi tambahan worktree — 8 November 2026

- `scripts/test-finance-storage-http.mjs` lulus terhadap VQE (`vqemuyzveuirlkvdggjd`) dengan fixture sintetis. Pemeriksaan selesai tanpa error cleanup; fixture tenant dinonaktifkan, akun Auth diblokir, dan objek PPDB privat dihapus. Production tidak disentuh.
- Round-trip staging mencakup tagihan pendaftaran sebelum penerimaan, transisi workflow sampai diterima, tagihan tuition, onboarding atomik, relasi kandidat-santri-wali-kelas-gedung-kamar, reservasi NIS dan klaim NIK, kenaikan okupansi sekali, tautan ulang dua tagihan ke santri, retry identik, serta penolakan retry dengan kamar berbeda.
- Record wali/santri yang menjadi target `ppdb_onboarding_events` dipertahankan oleh FK audit; tenant uji disuspensi dan akun sintetis diblokir. Objek Storage sintetis dibersihkan. Tidak ada Production yang ditulis.
- `server.ts` sekarang mengirim `gradeLevels` tenant ke formulir publik. Sebelumnya fungsi konfigurasi sudah membacanya dari katalog Supabase, tetapi route membuang daftar tersebut.
- Pemeriksaan statis lulus: `node --check` pada dua skrip integration test dan `git diff --check`.
- Lima test murni lokal lulus: guard cakupan CI (54 skrip terjadwal), kebijakan autentikasi route, konfigurasi deployment, Naming Series, dan larangan draft PII di browser.
- Pemeriksaan tambahan lulus: kelayakan kamar onboarding, batas ukuran dokumen PPDB publik, parser/impor CSV PPDB, dan pilihan santri wali (6 assertion). Ini tes fungsi lokal, bukan UAT browser.
- Setelah dependensi dipasang dari lockfile, `npm run lint` (TypeScript) dan `npm run build` lulus pada branch lokal `4a4d0d8`. Build masih memberi peringatan chunk PDF `react-pdf.browser` sekitar 1,46 MB dan komentar PURE dari Zod yang diabaikan Rollup; optimasi bundle tetap disarankan.
- Validasi lokal tambahan lulus: guard cakupan 54 skrip CI, autentikasi 201 rute privat, konfigurasi deployment, Naming Series, larangan penyimpanan draft PII di browser, pemeriksaan Firebase runtime, kelayakan kamar PPDB, validasi dokumen publik, impor CSV PPDB/Master Data, pilihan santri wali, konfigurasi runtime HTTP, migration preflight, serta kontrak schema privat.
- Uji keamanan dependensi: `npm audit --omit=dev` melaporkan 0 kerentanan pada pohon dependensi produksi. Audit penuh menemukan 15 kerentanan hanya pada pohon dev (2 rendah, 8 sedang, 5 tinggi), termasuk Firebase/`@grpc/grpc-js` dan `xlsx` yang masih diperlukan oleh kode legacy tak aktif; Quill dan `minimatch` juga perlu ditinjau sebelum penghapusan dependensi legacy.
- CI Draft PR #68 lulus 3/3 job pada head `8c6ad6d33d5ed68f5e49aac6f6c23c94f118089e` di [run 42418159869](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42418159869): migrasi/API auth/pgTAP, build dan Firebase bundle guard, serta pemasangan NPM pelanggan. Database job menjalankan Supabase lokal terisolasi, tes API auth/tenant dan round-trip PPDB/Finance/Storage, konkurensi, serta backup-restore lokal. Run sebelumnya pada commit `fe6c4dad0a92d5c4ba31638f1ea18e98956f23a5` juga lulus 3/3 di [run 42417441209](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42417441209).
- Supabase Preview dilewati karena pembuatan preview branch VQE dinonaktifkan. Job CI membuat backend Supabase lokal sintetis dan berhasil; CLI/Docker tidak tersedia di worktree lokal untuk mengulang suite tersebut di mesin ini. CI PR #68 tetap memberi bukti eksekusi atas source yang dikirim.

## Batas pemeriksaan

Run CI di atas menjalankan backend Supabase lokal terisolasi dengan fixture sintetis; uji HTTP terbaru juga berhasil ke VQE staging dan membersihkan objek Storage serta menonaktifkan tenant/memblokir akun uji. Keduanya tidak menulis ke Production dan tidak membuktikan service hosting Production tersedia. Metadata katalog Production yang sebelumnya dibaca juga bukan bukti semua endpoint, policy, atau alur aplikasi berfungsi.

## Pembaruan cakupan CI — PR #72, 8 November 2026

- PR #72 merged ke `main` pada commit `5ead22585bc80691f255955c8b77d93e01d10a3c`. Perubahannya hanya menambah pengujian integrasi pada `scripts/test-api-auth-tenant.mjs`; tidak mengubah skema, runtime, atau data Production.
- Workflow [run 42431333842](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42431333842) selesai `success`. Job migrasi/API/pgTAP, build/Firebase bundle guard, dan pemasangan NPM pelanggan semuanya lulus; Supabase Preview dilewati karena branch Preview tidak diaktifkan.
- Job database menyalakan Supabase lokal terisolasi, mereplay migrasi dari batas versi Production yang disimulasikan, menjalankan `supabase test db`, uji reservasi NIS/Tahfidz/kamar bersamaan, API auth/tenant, Finance dan Library Storage, serta backup-restore lokal sintetis.
- Pengujian asrama baru membuktikan round-trip API untuk izin, disiplin, dan absensi beserta relasi tenant-santri-kamar, transisi/status, event audit, idempotensi, penolakan perubahan payload, role tanpa izin, dan isolasi tenant.
- Workflow juga menjalankan pemeriksaan cakupan yang memastikan 54 skrip test pada `package.json` dijadwalkan di CI. Ini bukan bukti bahwa setiap fitur UI atau setiap variasi bisnis dari tiap modul telah diuji manual.
- Build lokal terbaru lulus. Uji integrasi API penuh tidak dapat dijalankan pada workstation karena Supabase CLI lokal tidak tersedia; CI menjalankan suite tersebut pada backend Supabase ephemeral.

**Kesimpulan status:** cakupan otomatis backend makin kuat dan PR #72 telah masuk ke `main`, tetapi seluruh produk belum dapat disebut lulus pengujian menyeluruh. UAT browser lintas role, pemeriksaan lingkungan hosting pelanggan, dan pembuktian Production tetap menjadi gerbang tersendiri.
