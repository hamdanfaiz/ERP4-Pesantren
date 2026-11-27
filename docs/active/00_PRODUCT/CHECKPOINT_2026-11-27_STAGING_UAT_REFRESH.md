# Checkpoint UAT staging — 27 November 2026, setelah PR #287

## Source dan pemeriksaan CI
- Source resmi: `main`, commit `9e1b688aaeb8a95b4a63cdae8ef3277e91419691`.
- PR #287 merged dan closed; diff final tiga file, 21 penambahan, 7 penghapusan. CI run [#45951479988](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/45951479988) lulus pada build, paket instalasi npm, replay migrasi lokal, tes API/otorisasi tenant, dan pgTAP.
- Pencarian pull request repository menghasilkan 0 PR terbuka.
- hPanel mengonfirmasi deployment staging Hostinger berstatus **Completed / Current** pada branch `main`, commit `9e1b688`. Build log mencatat chunk `SupabasePpdbManager-BtsOS9-d.js`. Tab preview yang sudah lama terbuka masih memuat `index-CVW1-7wn.js` dan gagal mengimpor chunk PPDB dari build sebelumnya; setelah halaman dimuat ulang, browser memuat `index-QDGIiid8.js`, membuka PPDB, lalu menampilkan keadaan kosong tanpa galat baru. Tidak ada redeploy atau perubahan Production.

## UAT staging setelah Admin login
- Modul UKS terbuka tanpa pesan gagal; ringkasan dan navigasi tab tampil. Formulir kunjungan memuat pilihan santri dari tenant aktif.
- Log browser tidak mencatat galat baru pada pemeriksaan tersebut. Formulir tidak dikirim dan tidak ada data yang ditambah atau diubah.
- Bukti ini terbatas pada pembukaan layar UKS. Simpan-baca, relasi klinis, validasi, role/tenant lain, unggah, dan alur UKS menyeluruh belum dibuktikan.

## Migrasi Supabase: metadata saja
- Source repository: 170 migration files. VQE staging: 170 versi; seluruh versi cocok dengan source.
- PTSAS Production: 100 entri ledger, 70 versi source tidak tercatat, 3 entri bernama kosong, tanpa versi Production-only.
- Pemeriksaan hanya membaca versi/nama migration ledger; tidak membuktikan definisi DDL, trigger, policy, function, atau data Production sesuai source. PTSAS tidak diubah.
- Gerbang backend Production tetap mencakup rekonsiliasi DDL/ledger, rencana urutan migrasi, dan latihan backup/restore yang dapat dibuktikan. Jangan menerapkan seluruh selisih secara massal.

## Langkah berikut
1. Lanjutkan UAT per modul, role, dan tenant; catat alur baca serta simpan yang memang disetujui memakai data sintetis.
3. Tahan klaim siap Production sampai rekonsiliasi DDL, urutan promosi, dan bukti pemulihan Production tersedia.

---

## Snapshot sebelumnya — 27 November 2026, sebelum PR #287

## Source dan deployment

- Source resmi tetap `main` pada `hamdanfaiz/ERP4-Pesantren`, HEAD `d5554f00600d1609042e7cd24585009837044c54`.
- PR #283, #284, dan #285 sudah merged. CI PR #285 lulus tiga job; PR #285 menambahkan rincian exception ke console pengembang, tanpa menampilkan detail teknis kepada pengguna.
- Hostinger staging `lightgreen-jay-425688.hostingersite.com` berstatus **Completed / Current** pada commit `d5554f0`. Log build menunjukkan Node 22, `npm run build`, dan publikasi berhasil.
- Daftar 100 PR terbaru akun tidak menemukan PR berstatus open. PR #202 berstatus closed tanpa merge karena superseded oleh PR #203; tidak ada tindakan merge tertunda untuk PR tersebut.

## Hasil pemeriksaan antarmuka setelah reload dan login ulang

- **Sesi:** tampilan awal masih menunjukkan label Admin UAT, tetapi dashboard secara eksplisit menyatakan pengguna belum terautentikasi dan data gagal dimuat. Setelah halaman dimuat ulang dan login staging berhasil, dashboard menampilkan data VQE. Ini menunjukkan label profil sebelumnya tidak cukup untuk membuktikan sesi Supabase aktif.
- **UKS:** modul terbuka pada build terkini, menampilkan daftar kunjungan kosong, formulir kunjungan, dan opsi santri dari daftar tenant. Tidak ada kunjungan baru yang disimpan.
- **Data Alumni:** direktori terbuka dan menampilkan profil Alumni uji beserta tab Direktori, Tracer Study, Komunitas, dan Donasi Alumni. Tidak ada perubahan yang disimpan.
- **Asrama:** penempatan kamar terbuka dan memuat 3 santri serta 2 kamar aktif. Container tampil dengan latar gelap yang konsisten; navigasi submodul menyediakan tombol gulir horizontal. Tidak ada penempatan yang diubah.
- **Tahfidz:** leaderboard berjudul “Peringkat Hafalan Santri” mengurutkan jumlah ayat hafalan unik. Data saat ini menampilkan satu peserta dalam cakupan halaqah akun UAT: 20 ayat unik, 2 setoran, dan 2 hari aktif. Peringkat dibatasi pada halaqah yang dapat diakses akun.
- **HRIS:** tombol **Tambah** membuka formulir jabatan. Formulir **Tambah pegawai** menampilkan jabatan katalog “MUDIR” dan “UAT Pengelola Asrama 20261124”, serta unit kerja dari struktur organisasi. Tombol Simpan tetap nonaktif karena form kosong; tidak ada data baru yang dibuat.
- Pengecekan ini hanya membaca tampilan dan opsi. Tidak ada data operasional yang ditulis atau dihapus.

## Diagnosis error modul sebelumnya

Sebelum reload, browser menggunakan bundle lama `main-h2ND36GG.js` dan meminta chunk UKS lama `SupabaseHealthcareManager-Dr9Y4H6k.js`, yang tidak cocok dengan daftar aset dari build Hostinger saat ini. Log build commit `d5554f0` memuat chunk UKS `SupabaseHealthcareManager-vp65H0AP.js`; setelah reload dan login ulang, UKS serta Data Alumni berhasil dimuat. Jadi kegagalan yang terlihat pada sesi sebelumnya konsisten dengan tab/bundle lama dan sesi yang sudah tidak terautentikasi, bukan kegagalan modul yang berulang pada build saat ini. Console menyimpan log lama dari sebelum reload; tidak muncul kegagalan modul baru pada pemeriksaan ini.

## Catatan data dan batas UAT

- Ringkasan Tahfidz masih menampilkan beberapa setoran sintetis lama dengan nama “Santri tidak tersedia”, sedangkan catatan Al-Kahf terbaru menampilkan nama santri. Jangan menghapus atau mengubah catatan tersebut sebelum relasi dan penyebabnya diperiksa. Tindak lanjut: audit penanganan catatan yatim atau data di luar cakupan akses tanpa membuka identitas lintas-tenant.
- Pemeriksaan hanya mencakup pembukaan layar dan opsi yang dijelaskan di atas. Ini belum membuktikan seluruh CRUD, semua role/tenant, transaksi, upload, migrasi, atau pemulihan.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh. Rekonsiliasi DDL/urutan migrasi Production dan bukti backup-restore tetap menjadi pekerjaan tim backend.

## Langkah selanjutnya

1. Audit sumber tampilan “Santri tidak tersedia” pada ringkasan Tahfidz dan tentukan apakah itu relasi yatim atau penyaringan akses yang benar.
2. Lanjutkan UAT bertahap per modul di VQE: alur tambah-simpan-muat ulang yang aman, relasi, kondisi kosong/error, dan akses role/tenant.
3. Sebelum menyatakan rilis Production siap, tim backend tetap perlu menyelesaikan pemeriksaan DDL, urutan promosi migrasi, dan pemulihan backup Production.
