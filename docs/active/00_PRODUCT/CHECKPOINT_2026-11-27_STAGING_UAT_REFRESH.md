# Pembaruan checkpoint UAT staging — 27 November 2026

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
