# Catatan UAT Browser Baca-Saja — 9 November 2026

## Cakupan

- Preview yang dibuka di Chrome: `http://localhost:4179/`.
- Sesi menampilkan peran `Admin UAT` pada tenant `Pesantren`.
- Pemeriksaan hanya navigasi, tampilan, dan pembukaan formulir. Tidak ada formulir yang dikirim dan tidak ada data yang ditulis.
- Catatan ini tidak membuktikan bahwa proses yang melayani port 4179 berasal dari commit atau checkout tertentu.

## Hasil yang teramati

- Sidebar menampilkan menu operasional utama, termasuk Data Induk, Pengguna, PPDB, CBT, Tahfidz, Asrama, Akademik, LMS, Perpustakaan, Keuangan, Komunikasi, Kesehatan, Koperasi, Laundry, Multi-Unit, HRIS, Sarana-Prasarana, Dokumen Digital, Alumni, Wali/Donatur, Wakaf, Marketplace, dan Analitik.
- Modul Tahfidz terbuka tanpa kesalahan pemuatan pada layar yang diperiksa. Tab yang panjang dapat digulir horizontal sampai `Manajemen Halaqah`; kontainer tetap berada di dalam bingkai.
- Al-Qur'an Digital menampilkan detail Surah Al-Fatihah.
- `Pencapaian Tahfidz` menampilkan keadaan kosong yang wajar: belum ada santri pada cakupan akun.
- `Manajemen Halaqah` menampilkan keadaan kosong yang wajar. Formulir tambah halaqah terbuka, tetapi daftar Ustadz hanya memiliki pilihan placeholder dan tombol simpan tetap nonaktif. Formulir dibatalkan tanpa menyimpan.
- Tombol `Aktifkan Pengingat`, `Ekspor Laporan`, dan `Penilaian Suara` tampak nonaktif pada sesi ini. Fungsinya belum terbukti tersedia di jalur Supabase yang diperiksa.

## Perubahan source setelah smoke test

- Ekspor laporan Tahfidz pada source sekarang aktif untuk runtime Supabase: Admin memilih rentang tanggal, lalu API terautentikasi mengambil halaman berukuran terbatas sesuai cakupan tenant dan role akun. CSV tidak diunduh sebagian bila batas 50.000 catatan terlampaui.
- `npm run test:tahfidz-record-pagination`, `npm run lint`, dan `npm run build` lulus setelah perubahan. Pengujian memeriksa pagination, filter rentang tanggal, batas ukuran halaman, serta batas halaqah/santri.
- Perubahan ini belum diuji melalui tombol browser karena proses pada port 4179 belum terbukti memakai checkout source ini. Catatan tombol nonaktif di atas tetap menggambarkan pengamatan browser saat smoke test dilakukan; verifikasi interaksi dan unduhan CSV masih diperlukan.

## Batas bukti dan tindak lanjut

- Karena staging tampak belum memiliki data Ustadz, santri, dan halaqah untuk akun ini, alur pembuatan halaqah, setoran, pencapaian berbasis data, dan relasi belum dapat diuji end-to-end. Lanjutkan setelah fixture sintetis staging tersedia dan target tenant terverifikasi.
- Pemeriksaan ini bukan bukti CRUD seluruh modul, isolasi tenant, atau kesesuaian semua role.
- Port 4179 sudah digunakan saat server kedua dicoba; percobaan kedua berhenti dengan `EADDRINUSE`, sehingga proses yang ada tidak dihentikan. Probe HTTP dari shell dibatasi izin socket lokal. Uji browser membuktikan halaman dapat dibuka, tetapi bukan health check API.
- File `.env` pada worktree ini menunjuk ke VQE staging. Hubungan antara worktree tersebut dan proses preview yang sedang berjalan belum diverifikasi.
- PTSAS Production tidak dibaca maupun diubah dalam pemeriksaan browser ini. Setelah konektor Supabase Apps dihubungkan ulang, pembacaan metadata Production berhasil; lihat [rekonsiliasi Production](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-09.md). Penolakan sebelumnya adalah masalah cakupan konektor/sesi, bukan temuan kerusakan RLS atau database.

## Pemeriksaan ulang konektivitas preview — 9 November 2026

- `.env` pada checkout ini menunjuk ke VQE staging `vqemuyzveuirlkvdggjd`; flag server yang diperiksa untuk Dokumen Digital, Tahfidz, Asrama, dan izin Asrama bernilai aktif. Nilai rahasia tidak dibaca atau dicatat.
- Server pengembangan dari checkout ini melaporkan `127.0.0.1:3000` siap, tetapi tab Chrome desktop dan browser in-app gagal menjangkau `localhost:3000`/`127.0.0.1:3000` dan berakhir timeout. Probe loopback dari proses shell juga dibatasi izin socket lokal. Server uji tersebut sudah dihentikan.
- URL Cloud Run preview yang sebelumnya dipakai tetap menampilkan “Please wait while your application starts”; source atau build yang dilayaninya belum dapat dipastikan.
- Referensi `erp4-pesantren.ai.studio` membuka landing dan layar login, tetapi tidak ada kredensial yang dimasukkan dan tidak ada sesi modul yang diuji.
- Karena itu UAT tombol ekspor Tahfidz, alur tulis-baca, dan pemeriksaan visual source-matched belum dilakukan pada source terbaru. Hambatan saat ini adalah jalur preview dari browser ke proses lokal/Cloud Run, bukan hasil kegagalan fitur yang teruji.

## Status smoke test awal (sebelum UAT Admin lanjutan)

**Lulus terbatas:** navigasi visual dan keadaan kosong Tahfidz yang diperiksa. **Belum lulus:** alur tulis-baca Supabase melalui UI, role/tenant end-to-end, serta fungsi tombol yang masih nonaktif.

## UAT lanjutan dengan sesi Admin — 9 November 2026

### Cakupan sesi

- Preview lokal: `http://127.0.0.1:3000/`, checkout `erp4-product-copy-cleanup-20261108`, backend yang dikonfigurasi di `.env` adalah VQE staging `vqemuyzveuirlkvdggjd`.
- Pengguna menyelesaikan login sendiri sebagai Admin UAT. Kata sandi maupun token tidak dibaca atau dicatat.
- Pemeriksaan mencakup navigasi, keadaan kosong, filter/tab, serta membuka dan membatalkan formulir. **Tidak ada formulir yang disimpan, tidak ada transaksi yang dibuat, dan Production tidak diubah.**
- Worktree memiliki perubahan lokal; bukti ini bukan hasil build dari commit bersih yang siap deploy.

### Hasil yang berhasil dimuat

- Sidebar menampilkan seluruh 25 menu aplikasi, termasuk modul yang tidak aktif di runtime.
- Dashboard memuat tanpa error dan menampilkan nilai nol yang konsisten untuk PPDB, santri, tagihan, titipan, dan arus kas; keadaan kosong menyebut bahwa arus kas bukan saldo bank.
- Data Induk menampilkan daftar santri kosong, kategori Struktur (`Gedung`, `Kamar`, `Kelas`, `Peta Struktur`), serta aturan penomoran. Aturan NIS pada UI mempertahankan format 10 digit. Tombol impor, template, ekspor, dan tambah data terlihat.
- Dokumen Digital memuat daftar kosong; filter jenis dokumen mengubah keadaan hasil menjadi “Dokumen tidak ditemukan”. Formulir catat dokumen terbuka dan dapat dibatalkan. Tab dokumen dapat digulir horizontal.
- Asrama memuat keadaan kosong untuk izin santri; navigasi bagiannya memiliki tombol gulir horizontal.
- Tahfidz memuat ringkasan tenant kosong, data halaqah/setoran kosong, dan formulir setoran. Formulir halaqah dan setoran dapat dibuka lalu dibatalkan. Formulir halaqah menonaktifkan simpan saat daftar ustadz masih kosong; handler setoran memeriksa santri yang sudah terdaftar di halaqah aktif dan nilai penilaian. Tab Tahfidz dapat digulir horizontal dan tetap di dalam bingkai.
- Manajemen Pengguna memuat satu akun Admin UAT dan hak modul yang ditampilkan sebagai `25 / 26`; tidak ada perubahan akun atau izin.
- CBT diuji sebelumnya setelah `SUPABASE_CBT_RUNTIME_ENABLED=true` diberikan hanya pada proses dev lokal. Halaman memuat daftar kosong; pembuatan soal belum bisa diselesaikan karena referensi mata pelajaran/paket belum tersedia. Nilai `.env` tetap `false` dan tidak diubah.

### Hambatan runtime yang teramati

- `.env` staging saat sesi ini memuat 35 gerbang runtime: 10 `true` dan 25 `false`. File `.env` tidak disalin atau dimasukkan ke dokumentasi.
- PPDB menampilkan “Layanan ini belum tersedia saat ini”; gerbang PPDB, pendaftaran publik, onboarding, dan dokumen PPDB bernilai `false`.
- Keuangan menampilkan “Layanan ini belum tersedia saat ini”; `SUPABASE_FINANCE_RUNTIME_ENABLED=false`.
- Akademik menampilkan jumlah termuat nol sekaligus “Data akademik belum dapat dimuat”; `SUPABASE_ACADEMIC_RUNTIME_ENABLED=false`. Form jadwal tampak, tetapi referensi mata pelajaran, kelas, pengajar, dan kurikulum belum tersedia untuk alur simpan yang sah.
- Pengingat dan penilaian suara Tahfidz masih nonaktif.

### Kesimpulan UAT lanjutan

- **Lulus smoke test UI terbatas:** login Admin, dashboard, navigasi, keadaan kosong, filter dokumen, slider tab, pembukaan/pembatalan form, dan pemuatan aturan penomoran.
- **Belum terbukti:** simpan-baca lintas modul, relasi dengan data referensi nyata, transaksi PPDB/keuangan, unggah Storage, isolasi role/tenant melalui UI, serta seluruh alur negatif.
- Tenant staging belum memiliki data operasional untuk membuktikan relasi atau persistensi end-to-end. Pengaktifan gerbang saja tidak menggantikan data master/prasyarat yang valid.
- UAT Production, backup/restore Production, dan persetujuan deploy tetap menjadi pekerjaan tim backend. Temuan ini tidak menjadi persetujuan untuk migrasi atau deploy Production.

## Pemeriksaan menu lanjutan setelah login — 9 November 2026, 12.58 WIB

- Sesi preview `http://127.0.0.1:3000/` terbukti login sebagai Admin UAT pada VQE staging. Pemeriksaan hanya membuka halaman dan membaca status; tidak ada formulir disimpan, transaksi dibuat, atau Production diubah.
- Menu berikut menampilkan halaman/data kosong atau fungsi yang dapat dibaca: Ringkasan, Data Induk, Tahfidz, Asrama, Dokumen Digital, LMS, Perpustakaan, SDM, CBT, dan Pusat Data Analitik. Kosongnya data staging tidak membuktikan alur tulis-baca.
- CBT menampilkan bank soal kosong dan formulir soal; tombol simpan nonaktif karena mata pelajaran/paket soal belum tersedia. Akademik menampilkan kegagalan muat data/referensi dan jumlah jadwal, jurnal, penilaian nol.
- Pesan “layanan belum tersedia” terlihat di PPDB, Keuangan & Tagihan, Pusat Komunikasi, UKS, Koperasi, Laundry, Manajemen Multi-Unit, Keuangan & Anggaran, Sarana & Prasarana, Alumni, CRM Wali/Donatur, Donasi/Wakaf, dan Marketplace. Untuk PPDB, Keuangan, dan Akademik, gerbang runtime lokal yang diperiksa masih `false`; nilai rahasia `.env` tidak dibaca atau disalin.
- LMS menyatakan peer review, sertifikat, dan statistik lanjutan belum tersedia. Perpustakaan menyatakan unduh arsip lama dan pencatatan denda belum tersedia. Ringkasan Multi-Unit menyatakan rekap gabungan lintas unit belum tersedia. Sarana & Prasarana secara eksplisit menyatakan pengadaan, kendaraan, housekeeping, dapur, dan tiket pemeliharaan masih pada jalur lama dan tab tersebut belum dialihkan.
- Tombol notifikasi global nonaktif. Halaman menu yang terbuka bukan bukti bahwa semua fitur backend tersedia; implementasi di atas perlu dipilah menjadi aktivasi backend, penyelesaian migrasi modul lama, atau penonaktifan UI yang belum menjadi cakupan rilis.

## Verifikasi source lokal — 9 November 2026

- `npm run lint` lulus.
- `npm run build` lulus. Build memberi peringatan ukuran chunk JavaScript besar (termasuk React PDF) dan anotasi komentar dependency Zod; peringatan tidak menggagalkan build dan tetap menjadi optimasi sebelum rilis.
- `npm run test:user-messages` lulus: 14 skenario.
- `npm run test:tahfidz-record-pagination` lulus.
- `npm run test:master-data-student-import-plan` lulus: pemeriksaan referensi tenant, kapasitas kamar, alias status Indonesia, dan pemetaan status kanonis.
- `npm run test:supabase-runtime-no-firebase` lulus: 156 modul pada graph frontend/server, 26 route Supabase, 26 route migrasi lama tertutup, dan kebijakan persistensi browser diperiksa tanpa menemukan penulisan `localStorage` aktif.
- `npm run test:customer-deployment-flags` lulus: 30 nilai runtime publik allowlist dan 37 gerbang server fail-closed.
- `npm run test:api-route-auth-policy` lulus: 201 route privat wajib autentikasi, 9 route publik eksplisit, dan 3 route deny-only.
- `npm run test:rbac-permissions` lulus: 20 pemeriksaan role, batas pemberian izin modul, dan katalog modul bahasa Indonesia.
- `npm run test:private-api-schema` lulus: schema internal tidak diekspos melalui Data API.
- Semua hasil ini berasal dari worktree lokal `codex/product-copy-cleanup-20261108` pada HEAD `8d2859a` **dengan perubahan lokal yang belum di-commit**. Ini bukan bukti bahwa head PR #91 menjalankan build atau pengujian yang sama.

## Rekonsiliasi Git sebelum mengirim hasil ke tim

- Fetch PR #91 berhasil setelah izin jaringan workspace diberikan. Head PR yang diperiksa adalah `e745742`; worktree rekonsiliasi bersih dibuat tepat dari commit itu. Perubahan di checkout lama tidak dibuang atau ditimpa.
- Checkout lama berada pada `8d2859a`, bertumpu pada `7b580ed`, dengan 67 file terlacak berubah dan 5 file baru. Dibanding head PR, ada 36 commit yang hanya ada di PR dan 1 commit lokal. Perbaikan redaksi PostgreSQL pada commit lokal sudah tercakup pada source PR, sehingga tidak disalin ulang.
- Perbandingan konten menunjukkan sebagian besar perubahan lokal telah ada di PR. Perubahan ukuran chart dashboard lokal justru membatalkan perbaikan `min-w-0` yang ada pada PR, sehingga tidak dibawa. Catatan UAT terbaru sudah disalin sebagai commit dokumentasi tersendiri ke PR dan menjelaskan batas source test.
- Banner status migrasi internal pada Sarana & Prasarana belum ada di PR. Banner sudah dihapus pada worktree bersih berbasis head PR. Build produksi dan pemeriksaan TypeScript (`npm run build`, `npm run lint`) berhasil pada source ini.
- Audit dependensi produksi (`npm audit --omit=dev`) menemukan 0 kerentanan. `npm ci` tetap melaporkan beberapa kerentanan pada dependency development; belum dijalankan perbaikan otomatis karena dapat mengubah versi di luar lockfile.
- Berikutnya, kirim koreksi UI dan catatan audit ini pada branch PR, lalu verifikasi CI pada head yang sama. CRUD melalui UI masih menunggu gerbang runtime dan data relasi sintetis staging.

## Pemeriksaan lanjutan setelah preview lokal aktif — 9 November 2026, 14.23 WIB

- Chrome menampilkan `http://localhost:3000/` dan sesi Admin UAT pada tenant Pesantren. Pemeriksaan ini hanya membaca layar dan berpindah tab; tidak ada data yang ditulis.
- CBT memuat halaman dan tabnya, tetapi layanan menunjukkan status belum tersedia. Bank soal, ujian, dan penugasan bernilai nol; tombol simpan soal nonaktif karena referensi mata pelajaran dan paket soal belum tersedia.
- LMS memuat halaman; tombol geser tab bekerja dan tab Pengajar dapat dibuka. Tidak ada kursus atau pengajar yang ditugaskan; layanan runtime belum tersedia. Penilaian antarsantri, sertifikat, dan statistik lanjutan juga belum tersedia.
- SDM memuat halaman dan navigasi bagiannya, tetapi layanan runtime belum tersedia. Tidak ada formulir pegawai yang disimpan.
- Sarana & Prasarana memuat halaman aset/inventaris, tetapi layanan runtime belum tersedia. Pada saat screenshot, halaman menampilkan banner internal tentang status pemindahan modul. Banner tersebut sudah dihapus pada worktree bersih berbasis head PR; hasil HMR belum dikonfirmasi kembali di browser.
- Pemeriksaan nama dan nilai gerbang runtime di `.env` menemukan 35 gerbang: 10 aktif dan 25 nonaktif. Nama gerbang yang relevan untuk CBT, LMS, SDM, dan aset GA masih nonaktif. Nilai rahasia tidak dibaca maupun dicatat.
- Build dari worktree bersih head PR berhasil setelah pembersihan teks. Peringatan chunk React PDF sekitar 1,46 MB sebelum gzip serta anotasi dependency Zod masih muncul; keduanya bukan kegagalan build.
- Pemeriksaan ini dilakukan pada worktree lokal `codex/product-copy-cleanup-20261108` yang memiliki perubahan belum di-commit dan berbeda dari head PR. Catatan ini bukan bukti bahwa perubahan source tersebut sudah ada di PR atau Production.

