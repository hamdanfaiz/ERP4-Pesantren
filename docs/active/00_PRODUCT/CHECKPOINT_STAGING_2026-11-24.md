# Checkpoint staging Hostinger — 24 November 2026

## Source dan deployment

- Branch `main` berada pada commit `811c867891509432d3387118d1636a6cfac56408`.
- PR #250 memperbaiki alur agar katalog Jabatan Pegawai yang baru disimpan dimuat ulang sebelum pilihan pegawai digunakan.
- PR #251 menambahkan pemeriksaan regresi untuk alur tersebut dan sudah merged. Tiga job CI lulus: build/guard runtime, instalasi NPM untuk lingkungan pelanggan, serta migrasi/API auth/pgTAP. Rehearsal backup-restore pada CI menggunakan database lokal terisolasi; ini bukan bukti pemulihan Production.
- Dashboard hPanel untuk `lightgreen-jay-425688.hostingersite.com` menunjukkan deployment **Completed** dari branch `main`, commit `811c8678`, dengan auto-deployment aktif pada 24 November 2026 sekitar 20.27 WIB.
- Situs publik staging berhasil dimuat. Sesi pada browser pemeriksaan menampilkan halaman publik, bukan dashboard Admin; UAT antarmuka terautentikasi belum dilakukan.

## Flag runtime staging

- Halaman Environment Variables hPanel menampilkan 43 key yang berakhiran `RUNTIME_ENABLED` di lima halaman. Nilai boolean yang dibaca untuk seluruh key itu adalah `true`.
- Pembacaan hanya mencakup flag runtime tersebut. Secret tidak ditampilkan atau disalin. Flag konfigurasi lain di luar pola nama itu, tenant default, kredensial server, serta tujuan database tidak dinilai ulang dalam checkpoint ini.
- Status `true` hanya membuktikan konfigurasi flag pada situs staging. Ini tidak membuktikan sesi API, isolasi role/tenant, atau alur simpan-baca modul.

## Batas pemeriksaan

- Tidak ada data operasional yang dibuat atau diubah.
- Tidak ada perubahan Supabase Production PTSAS.
- Perbaikan HRIS sudah masuk ke main dan diterapkan di staging, tetapi alur Admin **Tambah Jabatan → tambah Pegawai → pilih Jabatan baru → simpan dan muat ulang** masih harus diuji melalui sesi terautentikasi.
- UAT baca-simpan-baca dan isolasi role/tenant lintas modul juga belum terbukti.
- Rekonsiliasi DDL dan urutan migrasi PTSAS serta bukti backup-restore Production tetap merupakan gerbang terpisah bagi tim pemilik database. CI lokal tidak menggantikannya.

## Langkah selanjutnya

1. Jalankan UAT Admin pada staging untuk alur Jabatan Pegawai dan formulir Pegawai.
2. Catat per modul skenario baca-simpan-baca, validasi relasi, role, tenant, dan keadaan gagal.
3. Backend owner menyelesaikan gerbang Production: tinjauan DDL, ledger/urutan migrasi, dan rehearsal backup-restore. Jangan menjalankan migrasi massal ke PTSAS sebelum review tersebut.
