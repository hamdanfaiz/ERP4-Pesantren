# Audit menu dan tab staging — 27 November 2026

## Koreksi pemeriksaan UKS terbaru — 27 November 2026

Pada pemeriksaan lanjutan terhadap staging yang sama, sesi Admin UAT dan Ringkasan berhasil dimuat, tetapi memilih **Kesehatan (UKS)** menampilkan batas galat aplikasi: “Modul Kesehatan belum dapat ditampilkan”. Ini bertentangan dengan hasil penelusuran menu yang dicatat di bawah; status terbaru UKS adalah **gagal dimuat dan belum lulus UAT**. Tidak ada formulir yang dikirim atau data yang diubah.

Penyebab belum dapat dipastikan. `ModuleErrorBoundary` mencatat nama error, pesan, stack, dan component stack di konsol browser; rincian itulah yang diperlukan untuk membedakan kegagalan chunk, render React, atau sumber lainnya. Upaya menekan **Coba lagi** terhenti karena input manual terdeteksi di browser, jadi tombol tersebut belum diuji ulang. Perlu tangkap log browser saat UKS dibuka kembali sebelum mengubah kode secara spekulatif.

Pemeriksaan `npm run lint` dan `npm run build` pada source lokal `main` commit `c48a46318c372c29829971cf623866584ee59936` lulus. Build hanya menunjukkan peringatan ukuran chunk PDF dan anotasi komentar dependency `zod`. Kelulusan build tidak menjelaskan kegagalan runtime staging ini. Production PTSAS tidak disentuh.

## Lingkungan dan cara pemeriksaan

Pemeriksaan dilakukan pada preview Hostinger staging `lightgreen-jay-425688.hostingersite.com` dengan sesi Admin UAT yang sudah terbuka. Saya membuka menu dan tab melalui antarmuka, menunggu indikator pemuatan selesai, lalu memeriksa konten layar dan pesan error. Tidak ada formulir disimpan, transaksi dibuat, atau data yang diubah. Production PTSAS tidak disentuh.

Pemeriksaan ini berjenis **UAT pemuatan layar dan navigasi**. Ia tidak membuktikan semua tombol, proses simpan-baca, kebijakan role/tenant, atau kelayakan deployment.

## Verifikasi pasca-merge PR #294

hPanel menampilkan deployment staging branch `main`, commit `d2d1b8c7cf14b4ce36b19d467c0d3e095cce3c25`, berstatus **Completed / Current**. Tab aplikasi yang terbuka masih menampilkan bundle lama sampai dimuat ulang. Setelah reload, sesi Admin UAT tetap aktif. Pada Tahfidz → Manajemen Halaqah → Tambah Halaqah, teks “Isi nama, pembimbing, jadwal, lokasi, dan target harian.” tampil sesuai konteks; formulir ditutup dengan **Batal** tanpa menyimpan. Ini memverifikasi satu perbaikan UI pasca-deploy, bukan simpan-baca halaqah.

## Hasil menu utama

Semua 25 menu berikut dapat dibuka dan menampilkan halaman modul, tanpa pesan “Fitur ini belum tersedia saat ini” atau pesan gagal pada saat observasi:

| Kelompok | Menu yang dibuka |
| --- | --- |
| Sistem inti | Ringkasan; Data Induk; Manajemen Pengguna |
| Pendidikan dan asrama | Penerimaan Santri (PPDB, sisi Admin); CBT; Tahfidz; Asrama; Akademik Formal; LMS; Perpustakaan |
| Operasional santri | Keuangan & Tagihan; Pusat Komunikasi; Kesehatan (UKS); Koperasi & Kantin; Laundry |
| Manajemen dan sumber daya | Manajemen Multi-Unit; Keuangan & Anggaran; Sumber Daya Manusia (HCM); Sarana & Prasarana; Dokumen Digital |
| Relasi dan ekosistem | Data Alumni; Relasi Wali & Donatur; Donasi & Wakaf; Marketplace |
| Analitik | Pusat Data Analitik |

Beberapa panel sempat menampilkan status memuat ketika baru dibuka. Akademik, LMS, Koperasi, UKS, Ringkasan, dan Tahfidz berhasil menampilkan kontennya setelah pemuatan selesai. UKS menampilkan ringkasan, pilihan santri, dan formulir kunjungan. Ringkasan menampilkan indikator dari data staging. Kondisi data kosong pada bagian tertentu ditampilkan sebagai keadaan kosong, bukan pesan error. Konsol browser menunjukkan **0 galat** setelah penelusuran menu.

## Tab yang diperiksa

### Tahfidz

Sepuluh tab berikut dapat dipilih tanpa pesan gagal atau fallback:

1. Ringkasan Halaqah
2. Riwayat Setoran
3. Target & Rapor
4. Jadwal Talaqqi
5. Munaqasyah
6. Portal Wali Santri
7. Penilaian Antar-Santri
8. Al-Qur'an
9. Pencapaian Tahfidz
10. Manajemen Halaqah

Ringkasan menampilkan peringkat hafalan berdasarkan jumlah ayat unik yang tersimpan, aktivitas setoran, target, dan halaqah. Pada data sintetis yang tersedia ketika diuji, peringkat memiliki satu peserta. Tidak ada setoran yang ditambahkan selama audit.

### Asrama

Enam tab berikut dapat dipilih tanpa pesan gagal atau fallback:

1. Penempatan Kamar
2. Perizinan
3. Kedisiplinan
4. Kehadiran
5. Penugasan
6. Fasilitas

Tab Perizinan menampilkan daftar permohonan, termasuk status. Tab Fasilitas menampilkan audit kebersihan dan riwayat sintetis. Tidak ada keputusan atau audit baru yang disimpan.

## Hal yang belum terbukti atau terlihat nonaktif

- Tombol **Penilaian Audio AI** bertanda belum tersedia dan nonaktif pada layar Tahfidz.
- Tombol **Aktifkan Pengingat** pada Tahfidz dan **Notifikasi** umum terlihat nonaktif dalam sesi ini. Penyebabnya belum ditelusuri.
- Pemeriksaan ini belum menguji aksi tambah, edit, persetujuan, unggah/unduh, ekspor/impor, perhitungan transaksi, atau simpan-baca setelah pemuatan ulang.
- Pendaftaran PPDB publik tidak diuji; yang diperiksa hanya menu administrasi PPDB.
- Tidak ada pengujian role selain Admin UAT, akses lintas tenant, atau penolakan akses.
- Tidak dilakukan pembandingan visual penuh terhadap referensi AI Studio.

## Langkah UAT berikutnya

Lanjutkan dengan skenario simpan-baca menggunakan data sintetis yang disetujui di staging, periksa relasi antarmodul dan hak akses berdasarkan role/tenant, kemudian dokumentasikan hasil per alur. Tim database masih perlu menyelesaikan review DDL aktual, urutan promosi, serta bukti backup dan restore PTSAS Production sebelum cutover.

**Kesimpulan:** navigasi dan pemuatan halaman utama staging terverifikasi untuk 25 menu; ini belum berarti seluruh fungsi modul sudah teruji atau ERP siap Production/komersial.
