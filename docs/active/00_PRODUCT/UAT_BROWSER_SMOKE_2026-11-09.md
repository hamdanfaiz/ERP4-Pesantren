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

- Fetch PR #91 berhasil setelah izin jaringan workspace diberikan. Rekonsiliasi dimulai dari head `e745742` dalam worktree bersih; perubahan di checkout lama tidak dibuang atau ditimpa. Koreksi UI dan catatan rekonsiliasi kemudian diterbitkan pada commit PR `84545c5`.
- Checkout lama berada pada `8d2859a`, bertumpu pada `7b580ed`, dengan 67 file terlacak berubah dan 5 file baru. Dibanding head PR, ada 36 commit yang hanya ada di PR dan 1 commit lokal. Perbaikan redaksi PostgreSQL pada commit lokal sudah tercakup pada source PR, sehingga tidak disalin ulang.
- Perbandingan konten menunjukkan sebagian besar perubahan lokal telah ada di PR. Perubahan ukuran chart dashboard lokal justru membatalkan perbaikan `min-w-0` yang ada pada PR, sehingga tidak dibawa. Catatan UAT terbaru sudah disalin sebagai commit dokumentasi tersendiri ke PR dan menjelaskan batas source test.
- Banner status migrasi internal pada Sarana & Prasarana sudah dihapus pada source PR. Build produksi dan pemeriksaan TypeScript (`npm run build`, `npm run lint`) berhasil pada source yang sama. Audit dependensi produksi (`npm audit --omit=dev`) menemukan 0 kerentanan.
- `npm ci` tetap melaporkan kerentanan pada dependency development; belum dijalankan perbaikan otomatis karena dapat mengubah versi di luar lockfile.
- CI untuk commit `84545c5` lulus 3/3 job pada run [#1446](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42582321563). Koreksi dan catatan sudah terbit pada branch PR. CRUD melalui UI masih menunggu gerbang runtime dan data relasi sintetis staging.

## Pemeriksaan lanjutan setelah preview lokal aktif — 9 November 2026, 14.23 WIB

- Chrome menampilkan `http://localhost:3000/` dan sesi Admin UAT pada tenant Pesantren. Pemeriksaan ini hanya membaca layar dan berpindah tab; tidak ada data yang ditulis.
- CBT memuat halaman dan tabnya, tetapi layanan menunjukkan status belum tersedia. Bank soal, ujian, dan penugasan bernilai nol; tombol simpan soal nonaktif karena referensi mata pelajaran dan paket soal belum tersedia.
- LMS memuat halaman; tombol geser tab bekerja dan tab Pengajar dapat dibuka. Tidak ada kursus atau pengajar yang ditugaskan; layanan runtime belum tersedia. Penilaian antarsantri, sertifikat, dan statistik lanjutan juga belum tersedia.
- SDM memuat halaman dan navigasi bagiannya, tetapi layanan runtime belum tersedia. Tidak ada formulir pegawai yang disimpan.
- Sarana & Prasarana memuat halaman aset/inventaris, tetapi layanan runtime belum tersedia. Pada saat screenshot, halaman menampilkan banner internal tentang status pemindahan modul. Banner tersebut sudah dihapus pada worktree bersih berbasis head PR; hasil HMR belum dikonfirmasi kembali di browser.
- Pemeriksaan nama dan nilai gerbang runtime di `.env` menemukan 35 gerbang: 10 aktif dan 25 nonaktif. Nama gerbang yang relevan untuk CBT, LMS, SDM, dan aset GA masih nonaktif. Nilai rahasia tidak dibaca maupun dicatat.
- Build dari worktree bersih head PR berhasil setelah pembersihan teks. Peringatan chunk React PDF sekitar 1,46 MB sebelum gzip serta anotasi dependency Zod masih muncul; keduanya bukan kegagalan build.
- Pemeriksaan ini dilakukan pada worktree lokal `codex/product-copy-cleanup-20261108` yang memiliki perubahan belum di-commit dan berbeda dari head PR. Catatan ini bukan bukti bahwa perubahan source tersebut sudah ada di PR atau Production.

## UAT visual lanjutan Admin — 9 November 2026, 15.15 WIB

- Tab Chrome http://localhost:3000/ menampilkan aplikasi dalam sesi Admin UAT pada tenant Pesantren. Pemeriksaan dilakukan melalui navigasi dan pembacaan layar; kata sandi/token tidak dibaca dan tidak ada data disimpan.
- Sidebar menampilkan 25 menu utama, termasuk Data Induk, Pengguna, PPDB, CBT, Tahfidz, Asrama, Akademik, LMS, Perpustakaan, Keuangan, Komunikasi, UKS, Koperasi, Laundry, Multi-Unit, Anggaran, SDM, Sarana & Prasarana, Dokumen Digital, Alumni, Relasi Wali/Donatur, Wakaf, Marketplace, dan Analitik.
- Sarana & Prasarana menampilkan submenu Data Induk, Tiket & Pemeliharaan, Aset & Inventaris, Pemesanan Fasilitas, Pengadaan, Kendaraan & Logistik, Kebersihan, dan Dapur & Katering. Tombol gulir kiri/kanan tersedia. Halaman Aset & Inventaris menampilkan status layanan belum tersedia, data kosong, dan tombol simpan aset nonaktif karena kategori referensi belum ada. Banner internal migrasi tidak tampil.
- Dokumen Digital menampilkan keadaan kosong “Belum ada dokumen”, enam tab, dan tombol gulir kiri/kanan. Menekan tombol kanan memindahkan tab yang terlihat dari Semua Dokumen ke Surat Keluar, Persetujuan Elektronik, dan Arsip Digital; konten tetap dalam bingkai.
- UI yang terlihat memakai gaya gelap dan kontainer kartu; kedua modul mempertahankan navigasi tab horizontal. Pemeriksaan ini hanya memvalidasi keadaan visual dan interaksi gulir.
- Identitas source preview tidak terbukti cocok dengan head PR b20d4da. Aset browser menunjukkan Vite development client, tetapi tidak mengidentifikasi folder checkout yang melayani port 3000. Checkout lama lokal juga sudah tidak menampilkan banner yang sama. Karena itu ketiadaan banner dan hasil visual tidak boleh diklaim sebagai verifikasi HMR atau UAT atas commit PR terbaru.
- Tidak ada formulir dikirim, aset/dokumen dibuat, transaksi, atau perubahan Production. Alur CRUD, role/tenant end-to-end, Storage, dan responsif pada ukuran ponsel tetap belum diuji.

## Pemeriksaan baca-saja tambahan — 9 November 2026, 15.42 WIB

- Tab `http://localhost:3000/` menampilkan sesi Admin UAT dan 25 menu utama. Pemeriksaan hanya membuka halaman dan membaca daftar; tidak ada form atau aksi simpan yang dikirim.
- Data Induk menampilkan 0 Santri. Tab Aturan Penomoran berhasil memuat 15 seri, termasuk NIS dengan format 10 digit. Tidak ada perubahan pola yang disimpan.
- Tahfidz berhasil dibuka; roster dan halaqah berjumlah 0. `Aktifkan Pengingat` dan `Penilaian Suara` nonaktif. Tombol ekspor tampak tersedia, tetapi tidak dijalankan karena belum ada data yang dapat diuji.
- SDM menampilkan status layanan belum tersedia dan 0 pegawai. Karena itu alur tambah pegawai dan keterhubungan runtime belum teruji.
- Identitas checkout yang dilayani preview tetap belum cocok dengan head PR yang dibuktikan. Temuan ini adalah smoke test tampilan/navigasi, bukan UAT source-matched atau bukti CRUD, relasi, role/tenant, Storage, maupun responsif ponsel.
- Tidak ada data lokal/tenant yang ditulis dan Production tidak disentuh.

## Source match pada preview dan uji baca-saja — 9 November 2026, 15.50 WIB

- Head PR yang diperiksa: `50ab6669d35f248f581e4a198a2919e6e30d51f9`. Isi modul Vite yang sedang dilayani di `localhost:3000` dibandingkan baca-saja dengan source pada head tersebut. Setelah normalisasi newline, konten cocok untuk `src/App.tsx`, `src/pages/MasterDataManager.tsx`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseHrisManager.tsx`, `src/pages/SupabaseDocumentManager.tsx`, `src/pages/SupabaseGeneralAffairsAssets.tsx`, dan `src/components/ERPDesignSystem.tsx`.
- Ini mengonfirmasi source UI untuk halaman/komponen yang disebutkan, bukan seluruh 145 file PR atau `server.ts`/seluruh jalur API. Tidak ada form yang dikirim dan tidak ada data yang ditulis.
- Data Induk menampilkan 0 Santri; Aturan Penomoran memuat 15 seri termasuk NIS 10 digit. Tahfidz menampilkan roster/halaqah kosong; `Aktifkan Pengingat` dan `Penilaian Suara` nonaktif. SDM menunjukkan layanan belum tersedia.
- Konfigurasi `.env` yang diabaikan Git pada checkout PR menunjuk ke VQE staging. Snapshot memiliki 35 flag server: 10 aktif dan 25 nonaktif. Nonaktif meliputi Akademik, Alumni, CBT, Komunikasi, Koperasi, CRM, Donasi, Multi-Unit, Pemesanan Fasilitas, Anggaran, bukti Keuangan, Keuangan, Aset GA, UKS, SDM, Laundry, Perpustakaan, LMS, Marketplace, dokumen PPDB, onboarding PPDB, PPDB Admin, PPDB publik, umpan balik pencarian, dan setelan sistem. Snapshot ini tidak membuktikan nilai environment yang sedang dipakai proses server pada port 3000.
- Karena itu navigasi/sumber UI cocok untuk modul di atas, tetapi alur tulis-baca, seluruh API, matriks role/tenant, Storage, dan viewport ponsel masih harus diuji. Production tidak disentuh.


## UAT Admin setelah preview port 3000 tersedia — 9 November 2026

- Preview `http://localhost:3000/` terbuka dan sesi Admin UAT aktif pada staging VQE. Pemeriksaan hanya navigasi dan pembacaan tampilan. Tidak ada form yang disimpan, transaksi dibuat, atau perubahan Production.
- Sidebar menampilkan 25 menu. Data Induk memuat daftar santri kosong, submenu Struktur (Gedung, Kamar, Kelas, Peta Struktur), dan 15 aturan penomoran termasuk NIS 10 digit.
- Tahfidz memuat keadaan kosong: roster, halaqah, dan setoran 0. Pengingat serta penilaian suara nonaktif. Tab Asrama dan Dokumen Digital menampilkan kontrol gulir horizontal; halaman Asrama dan daftar Dokumen Digital memuat keadaan kosong dengan konsisten.
- Manajemen Pengguna menampilkan akun Admin UAT sintetis; tidak ada akun atau hak akses yang diubah.
- PPDB, Keuangan, Pusat Komunikasi, CBT, SDM, dan Aset & Inventaris Sarana-Prasarana menampilkan status layanan belum tersedia. Akademik menampilkan kegagalan memuat data/referensi. Tombol aksi simpan/transaksi tidak digunakan.
- Hasil ini adalah smoke test UI source-matched untuk berkas yang dirinci pada bagian sebelumnya. Ini belum membuktikan proses tulis-baca, relasi lintas modul, seluruh matriks role/tenant, Storage, seluruh server/API, atau tampilan ponsel. Gerbang runtime dan data relasi staging harus ditangani sebelum alur tersebut dapat diuji.


## UAT simpan-baca dan relasi Master Data — 9 November 2026

- Pada sesi Admin UAT staging VQE, struktur Gedung dan Kamar diuji melalui UI dengan label fixture sintetis. Kode otomatis masing-masing adalah `GED-00001` dan `KMR-00001`; Kamar berkapasitas 1 dipasangkan dengan Gedung uji.
- Setelah berpindah ke Ringkasan lalu kembali ke Data Induk, Gedung dan Kamar tetap tampil. Form edit Kamar memuat Gedung induk yang sama dan kapasitas 1. Ini membuktikan simpan-baca dan relasi untuk alur struktur tersebut pada tenant UAT.
- Kedua fixture dihapus melalui UI setelah pengujian. Daftar Kamar dan Gedung kembali menampilkan 0 data. Tidak ada fixture yang tertinggal.
- Form tambah Santri dibuka tanpa menyimpan. Jenjang aktif dan Wali terdaftar belum tersedia; referensi Kelas juga kosong. Tanpa prasyarat itu, alur tambah Santri dan relasi Akademik/Asrama/Wali tidak dapat diuji end-to-end.
- Pengujian ini hanya untuk staging. Production tidak dibuka atau diubah. Hasil ini tidak membuktikan seluruh CRUD modul, matriks role/tenant, Storage, atau transaksi Finance/PPDB.

## Revalidasi preview Admin melalui browser in-app — 9 November 2026

- Tab `http://localhost:3000/` menampilkan aplikasi dengan sesi `Admin UAT` aktif. Sidebar memuat 25 menu aplikasi. Dashboard dan Tahfidz berhasil dimuat.
- Ringkasan Tahfidz menunjukkan keadaan kosong: 0 santri dalam roster, 0 halaqah aktif, dan 0 setoran hari ini. Navigasi bagian Tahfidz menampilkan tombol gulir horizontal.
- Form Input Setoran dibuka. `Simpan Setoran` terbukti nonaktif sebelum santri/halaqah dan nilai wajib dipilih; formulir dibatalkan. Tidak ada setoran atau perubahan data.
- Console browser mencatat peringatan sinkronisasi setelan sistem dengan pesan layanan belum tersedia. Peringatan ini hanya tercatat di console pada pemeriksaan ini; alur setelan sistem belum tervalidasi.
- Pemeriksaan ini tidak membuktikan identitas commit yang melayani tab atau project Supabase yang dipakai oleh proses preview. Karena itu hasil visual ini tidak diklaim sebagai source-match atau bukti tulis-baca staging.
- Tidak ada transaksi atau perubahan Production.

## Tindak lanjut gerbang runtime — 9 November 2026

- Temuan console di atas ditelusuri ke layanan Pengaturan Sistem yang memulai polling `/api/system/settings` walau flag klien mati. Commit [`a6f622f`](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/a6f622ff45003aa07198b82158e3412f08bb13ac) membuat polling hanya berjalan saat `VITE_SUPABASE_SYSTEM_SETTINGS=true`, menolak simpan saat gerbang mati, dan menampilkan status fitur yang sesuai. CI #1461 lulus 3/3 job.
- Audit lanjutan menemukan tab Asrama menandai lima subfitur aktif karena memakai helper mode Supabase yang mengabaikan nilai gerbang. Commit [`322c337`](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/322c337f4d9020d15e389482d7c8fc4417ee494b) mengikat status tiap tab ke flag runtime publiknya. CI #1462 lulus 3/3 job.
- Perubahan ini belum diperiksa ulang secara visual pada preview yang menjalankan commit `322c337`. Jalankan ulang source terbaru untuk membuktikan tampilan status saat flag aktif/nonaktif; pengaturan backend dan UAT semua modul tetap terpisah.
- Tidak ada migrasi, penulisan data staging, atau perubahan Production dalam tindak lanjut kode ini.

## Perbaikan referensi Surah dan Ayat pada Entri Cepat Tahfidz — 9 November 2026

- Screenshot yang diberikan memperlihatkan kolom Surah dan Ayat pada Entri Cepat masih menerima teks bebas.
- Kode PR kini memuat pilihan Surah dari endpoint katalog `/api/quran/surat`; pilihan ayat mulai/akhir dibatasi sesuai jumlah ayat Surah terpilih. Entri cepat tidak lagi menerima teks bebas dan penyimpanan tetap nonaktif sampai rentang ayat lengkap dipilih.
- Endpoint katalog saat ini diproksi server dari `equran.id`; belum ada tabel referensi Surah di Supabase. Jadi perubahan ini memastikan pilihan terkontrol dari katalog, tetapi belum mengklaim referensi disimpan sebagai tabel Supabase.
- Regression check `npm run test:supabase-runtime-no-firebase`, `npm run lint`, dan `npm run build` lulus lokal. GitHub Actions [run #1466](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42615187569) lulus **3/3 job**.
- Pemeriksaan browser terakhir menunjukkan 25 menu dan keadaan Tahfidz kosong, tetapi tidak membuktikan preview menayangkan commit terbaru atau menguji pilihan baru secara visual. Preview source-match dan UAT interaksi formulir masih diperlukan.
- Tidak ada setoran, migrasi, atau perubahan data Supabase/Production.
