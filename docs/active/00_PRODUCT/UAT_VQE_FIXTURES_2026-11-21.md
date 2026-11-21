# Data UAT VQE — 21 November 2026

## Lingkungan dan batas

- Lingkungan staging: Supabase VQE `vqemuyzveuirlkvdggjd` dan preview Hostinger.
- Tenant dan seluruh record bertanda UAT adalah data sintetis.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh.
- Tidak ada kata sandi, key, token, data identitas asli, atau isi `.env` yang dicatat di dokumen ini.

## Fixture yang tersedia

| Modul | Data UAT yang tersedia | Status baca/relasi |
|---|---|---|
| Data Induk | 1 gedung, 2 kamar, 1 kelas, 2 santri | Struktur kamar → gedung, kelas → jenjang, dan relasi santri ke kelas/asrama terhubung. NIS berasal dari Naming Series. |
| Asrama | 2 penempatan; 2 permohonan izin; 2 catatan kedisiplinan; 2 catatan kehadiran; 2 tiket fasilitas; 2 audit kebersihan | Data tampil pada cakupan tenant UAT. Tiket dan audit dapat dipakai untuk membandingkan prioritas/status dan skor. |
| Tahfidz | 1 halaqah aktif, 2 santri anggota, 2 target aktif, 1 akun Ustadz sintetis berizin Tahfidz, 2 setoran Ziyadah, 1 setoran Muroja'ah, 1 jadwal Talaqqi, 1 jadwal ujian Tasmi' | Setoran Ziyadah: Al-Baqarah ayat 1–10 dan Al-Kahf ayat 1–15. Setoran Muroja'ah: Al-Baqarah ayat 1–5 untuk Santri 01. Pilihan surah memakai katalog 114 surah dan ayat bersumber dari opsi sesuai surah, bukan teks bebas. Catatan kemajuan tetap 10 dan 15 ayat unik; leaderboard mengurutkan Santri 02 lalu Santri 01 dan tidak menambahkan Muroja'ah ke skor Ziyadah. Sesi tambahan dibuat lewat UI Ustadz untuk menguji dua jenis penjadwalan. |
| Dokumen Digital | 3 dokumen internal bertanda UAT, tanpa lampiran | Daftar dokumen terbaca; tidak ada file Storage yang diunggah. |

Nama dan catatan record diberi penanda UAT. Tidak dibuat pembayaran, tagihan, transaksi PPDB, kiriman pesan, bukti pembayaran, atau lampiran yang menyerupai data nyata.

## Hasil role dan pemeriksaan antarmuka

- Admin staging dapat membaca dua santri, halaqah, target, tiga setoran (dua Ziyadah dan satu Muroja'ah), serta ringkasan Asrama.
- Login Ustadz sintetis berhasil pada preview PR #185. UI membatasi ringkasan ke 1 halaqah aktif dan 2 santri dalam halaqah yang ditugaskan.
- Dashboard Tahfidz pada preview PR #185 menampilkan 2 santri, 1 halaqah aktif, 3 setoran hari ini, dan cakupan target 2/2.
- UI leaderboard terverifikasi menempatkan Santri 02 di peringkat pertama dengan 15 ayat hafalan unik, lalu Santri 01 dengan 10 ayat. Setelah setoran Muroja'ah Santri 01 (Al-Baqarah 1–5) disimpan, peringkat tetap sama. Riwayat menampilkan tiga catatan UAT; surah dipilih dari katalog dan rentang ayat dari opsi sesuai surah.
- Pemeriksaan ulang pada preview PR #185 dengan akun Ustadz mengonfirmasi cakupan 2 santri pada 1 halaqah, 3 setoran hari ini, dan target 2/2. Peringkat Ustadz menampilkan Santri 02 (15 ayat unik) di atas Santri 01 (10 ayat unik), sesuai halaqah tugas. Namun panel peringkat tampil dua kali pada build yang diperiksa. Salinan panel lama telah dihapus pada working tree PR; perubahan ini harus dipush dan preview harus diuji ulang sebelum duplikasi dinyatakan selesai.
- Tab Target & Rapor memuat dua target aktif dengan periode dan kebijakan berbeda. Tab Manajemen Halaqah menampilkan dua anggota dan Ustadz pengampu.
- Tab Jadwal Talaqqi berhasil menyimpan sesi simulasi Santri 01 pada 25 November 2026 pukul 09.00 WIB, durasi 30 menit, fokus makharijul huruf dan ghunnah; status Terjadwal.
- Tab Munaqasyah berhasil menyimpan sesi simulasi Tasmi' juz 1–3 untuk Santri 02 pada 24 November 2026 pukul 09.00 WIB, durasi 45 menit; status Terjadwal.
- Pada sesi Ustadz, tombol Pengingat, Penilaian Audio AI, dan Notifikasi tampil nonaktif/belum tersedia. Ekspor Laporan memiliki alur CSV dengan filter tanggal, paginasi server, batas 10.000 catatan, dan pembatalan saat cakupan akun berubah; klik dan unduhan telah terverifikasi pada preview PR #185.
- Uji unduh CSV pada preview PR #185 berhasil untuk rentang 1–21 November 2026. Berkas berisi tiga setoran sintetis yang terlihat di cakupan halaqah Ustadz: dua Ziyadah dan satu Muroja'ah, dengan kolom identitas/relasi, surah-ayat, penilaian, catatan, dan pencatat. Data tetap berlabel UAT; tidak ada data Production yang dibaca atau diubah.
- Pemeriksaan kode menemukan teks statis yang keliru menyatakan jadwal tidak dapat disimpan karena benturan; teks diperbaiki menjadi keterangan bahwa benturan akan diperiksa.
- Tab Penilaian Antar-Santri belum memiliki fixture yang dapat diverifikasi; sesi baca di preview utama berhenti pada status memuat dan sesi tersebut kemudian berakhir. Tidak ada penilaian atau jadwal yang dibuat melalui UI pada sesi ini.
- PR #185 menggunakan preview `https://framed-slateblue-rail-79.hostingersite.com/`. UAT Ustadz berhasil pada preview tersebut: ringkasan Halaqah, riwayat, target, manajemen halaqah, dua jenis jadwal, leaderboard, dan katalog Al-Qur'an dapat diperiksa. Sesi pada preview staging utama berakhir saat pemeriksaan tab Jadwal; alur Admin modul lain masih memerlukan sesi Admin tersendiri.
- Leaderboard versi lama gagal karena kontrak UI mengharuskan payload bulanan, sementara RPC VQE mengirim `uniqueMemorizedAyahs` seumur pencatatan tanpa `periodStart`. Frontend kini menghitung dan menampilkan peringkat hafalan unik, serta tetap menerima payload bulanan lama tanpa menyebutnya sebagai total hafalan.
- Pembacaan ledger VQE terbaru melaporkan 165 versi dan mencakup `20270403000000 | tahfidz_unique_memorization_leaderboard` serta `20270404000000 | tahfidz_unique_ayah_projection_indexes`. Source PR #185 sebelumnya memakai nama lain untuk versi `20270403000000` dan tidak membawa versi `20270404000000`; source tersebut tidak cocok untuk migrasi dan preflight. Working tree kini memakai pasangan file bernama sama dengan PR #182/VQE. Ledger membuktikan versi dan nama, bukan checksum isi SQL; kesetaraan DDL Production masih belum diverifikasi.
- Perubahan leaderboard dan keterangan jadwal berada pada branch berbasis `main` terbaru (`0d810eb4cd1b3430210698fdd1854df3ef3d9207`) dan sudah dipush sebagai draft PR #185. Login Ustadz serta UAT Tahfidz pada preview PR #185 berhasil; Admin UAT masih diperlukan untuk melanjutkan pemeriksaan modul lain.

## Modul yang tidak diisi

Data dummy hanya dibuat pada modul yang runtime-nya tersedia dan dapat diuji lewat antarmuka staging. Flag PPDB dan sejumlah runtime lain belum aktif atau belum memiliki jalur UAT terverifikasi pada preview yang digunakan. Akademik, Keuangan, CBT, LMS, HRIS, Kesehatan, Perpustakaan, Koperasi, Laundry, Donasi, Marketplace, dan modul lainnya tidak diisi di tahap ini agar tidak membuat record yang tidak dapat diperiksa melalui UI.

## Hasil verifikasi build

- `npm run test:tahfidz-leaderboard`: lulus setelah koreksi panel duplikat dan penyelarasan migrasi; memeriksa role, tenant, halaqah, angka leaderboard, dan hanya satu panel UI.
- `npm run test:migration-preflight`: lulus dengan 165 file source dan pasangan versi/nama yang tercatat pada ledger VQE. Tes ini memeriksa jalur baca-saja serta mencegah versi migration lokal duplikat.
- `npm run test:tahfidz-record-pagination`: lulus; mencakup paginasi ekspor lengkap, kursor berulang, batas jumlah baris, dan tanggal kabisat. Unduhan CSV juga lulus pada UAT browser: tiga record dalam rentang yang dipilih, termasuk Muroja'ah dan dua Ziyadah.
- `npm run lint` dan `npm run build`: lulus setelah koreksi lokal; build memberi peringatan dependensi tentang anotasi komentar Zod dan ukuran chunk di atas 500 KB, bukan error build.
- `git diff --check`: lulus.
- GitHub Actions run `44893115713` pada commit `bde071b` lulus semua job: replay migrasi dari baseline Production historis pada database lokal terisolasi, pgTAP, pemeriksaan auth/isolasi tenant, alur Storage, cadangan-pemulihan, typecheck, seluruh uji frontend, build, dan instalasi NPM untuk lingkungan pelanggan.
- Tes pgTAP dijalankan di CI; tidak dijalankan ulang secara lokal.
- Source migration PR #185 telah diselaraskan di working tree dengan file versi 03 dan 04 pada PR #182/VQE; tes lokal lulus, tetapi perubahan belum dipush dan CI belum mengujinya. VQE objek tabel/index/trigger/RPC telah terlihat pada inspeksi katalog sebelumnya, tetapi checksum SQL yang diterapkan tidak tersedia dari ledger.
- PR #185 masih draft dan belum di-merge. Tidak ada perubahan pada PTSAS Production.
- Belum ada perubahan ke Supabase Production.
