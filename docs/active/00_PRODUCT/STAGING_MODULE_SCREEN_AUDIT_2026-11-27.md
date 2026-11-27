# Audit menu dan tab staging — 27 November 2026

## Lingkungan dan cara pemeriksaan

Pemeriksaan dilakukan pada preview Hostinger staging `lightgreen-jay-425688.hostingersite.com` dengan sesi Admin UAT yang sudah terbuka. Saya membuka menu dan tab melalui antarmuka, menunggu indikator pemuatan selesai, lalu memeriksa konten layar dan pesan error. Tidak ada formulir disimpan, transaksi dibuat, atau data yang diubah. Production PTSAS tidak disentuh.

Pemeriksaan ini berjenis **UAT pemuatan layar dan navigasi**. Ia tidak membuktikan semua tombol, proses simpan-baca, kebijakan role/tenant, atau kelayakan deployment.

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
