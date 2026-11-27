# Audit menu dan tab staging — 27 November 2026

## Pemeriksaan flag staging dan modul operasional — 27 November 2026, setelah PR #297

Pemeriksaan baca-saja pada hPanel situs staging lightgreen-jay-425688.hostingersite.com memastikan SUPABASE_PROJECT_REF mengarah ke VQE (vqemuyzveuirlkvdggjd). Sebelas flag server yang diperiksa berstatus true: PPDB, Keuangan, Anggaran, UKS, Koperasi, Multi-Unit, HRIS, Pemesanan Fasilitas, Aset GA, Donasi/Wakaf, dan Marketplace. Nilai variabel hanya dibuka satu per satu untuk pemeriksaan, lalu dimask kembali; secret dan nilai koneksi tidak dibaca atau dicatat. Tidak ada konfigurasi yang diubah.

Dengan sesi Admin UAT yang sudah ada, menu PPDB, Keuangan & Tagihan, UKS, Koperasi & Kantin, Manajemen Multi-Unit, Keuangan & Anggaran, SDM, Sarana & Prasarana, Relasi Wali & Donatur (CRM), Donasi & Wakaf, dan Marketplace dibuka. Halaman masing-masing menampilkan konten utama; pada pemeriksaan layar ini tidak terlihat pesan “Fitur ini belum tersedia saat ini”, batas galat modul, atau pesan layanan tidak tersedia. Pemeriksaan ini hanya membuktikan navigasi dan render, bukan penyimpanan atau seluruh tindakan pada setiap modul.

Tahfidz menampilkan **Peringkat Hafalan Santri**, dengan urutan berdasarkan jumlah ayat hafalan unik tersimpan. Ringkasan staging menunjukkan satu peserta dengan 20 ayat unik, dua setoran Ziyadah, dan dua hari aktif. Tidak ada data yang dibuat atau diubah. Asrama dikembalikan ke layar Penempatan Kamar setelah pemeriksaan.

Seluruh pemeriksaan ini terbatas pada VQE staging dan data sintetis. Tidak ada perubahan atau pembacaan data aplikasi di Production PTSAS.

## Koreksi pemeriksaan UKS terbaru — 27 November 2026

Pada pemeriksaan pertama, memilih **Kesehatan (UKS)** sempat menampilkan batas galat aplikasi: “Modul Kesehatan belum dapat ditampilkan”. Setelah navigasi ulang, UKS berhasil dimuat pada staging yang sama: ringkasan, tab, daftar pilihan santri, data sintetis, dan formulir kunjungan terlihat. Jadi kegagalan render **tidak terulang** dan saat ini UKS lulus pemeriksaan pemuatan layar dasar, tetapi penyebab gangguan awal masih belum diketahui. Tidak ada formulir yang dikirim atau data yang diubah.

`ModuleErrorBoundary` mencatat nama error, pesan, stack, dan component stack di konsol browser. Perlu menangkap rincian itu jika kegagalan muncul kembali; tanpa log tersebut akar masalah belum bisa dibuktikan. Pemeriksaan ini hanya memastikan pemuatan ulang berhasil, bukan alur simpan-baca UKS.

Pemeriksaan `npm run lint` dan `npm run build` pada source lokal `main` commit `c48a46318c372c29829971cf623866584ee59936` lulus. Build hanya menunjukkan peringatan ukuran chunk PDF dan anotasi komentar dependency `zod`. Production PTSAS tidak disentuh.

Pemeriksaan staging berikutnya pada sesi Admin UAT:

- UKS → Inventaris Obat terbuka dan menampilkan satu item sintetis, kategori serta satuan referensi, dan riwayat stok awal. Formulir tersedia; tidak ada stok yang dimutasi.
- PPDB terbuka tanpa pesan gagal, tetapi belum ada calon santri di tenant uji. Tidak ada pendaftar yang dibuat.
- Keuangan menampilkan satu tagihan sintetis Rp250.000. Tab Pengeluaran terbuka; formulir menampilkan pilihan unit organisasi dan kategori. Formulir ditutup dengan **Batal**, tanpa pengajuan atau transaksi baru.
- SDM menampilkan tiga pegawai sintetis dan dua jabatan aktif. Tombol **Tambah** membuka formulir jabatan, dan pilihan jabatan/unit tersedia pada formulir pegawai. Kedua formulir ditutup dengan **Batal**; tidak ada pegawai atau jabatan baru yang disimpan.
- Asrama menampilkan tiga santri pada dua kamar aktif beserta jumlah hunian. Tampilan container pada preview saat ini gelap dan konsisten dengan panel lain. Navigasi serta screenshot diperiksa; tidak ada penempatan yang diubah.

Pemeriksaan ini menambah bukti navigasi dan render dasar saja. Alur submit simpan-baca, persetujuan, dan isolasi lintas role/tenant tetap belum dibuktikan oleh sesi ini.

## Konfigurasi UI staging — 27 November 2026

Pembacaan langsung endpoint publik `/runtime-config.json` pada staging mengonfirmasi **18 flag UI** bernilai `true`: Data Induk; PPDB admin, dokumen, tagihan kandidat, dan onboarding; Tahfidz umum dan target massal; Asrama beserta izin, kedisiplinan, kehadiran, penugasan, dan operasional fasilitas; pengumuman; kegiatan dan tracer alumni; jadwal shift SDM; serta pengaturan pesantren. Hanya nama dan status flag yang dicatat; nilai URL dan publishable key tidak disalin ke dokumen.

Endpoint ini sengaja hanya menerbitkan allowlist konfigurasi browser. Ia **tidak** mengungkap atau membuktikan status flag `SUPABASE_*` sisi server. Catatan baca hPanel tanggal 25 November mencatat 13 flag server aktif, tetapi perlu pemeriksaan terbaru pada environment staging sebelum menyimpulkan status hari ini. Jangan mengaktifkan flag yang belum diverifikasi melalui endpoint publik ini.

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

