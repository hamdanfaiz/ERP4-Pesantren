# Prasyarat UAT sisi Santri CBT — 28 November 2026

## Ringkasan pemeriksaan

Pemeriksaan baca-saja dilakukan pada Supabase VQE staging (`vqemuyzveuirlkvdggjd`) untuk memahami mengapa ujian tidak terlihat dari portal peserta. Tidak ada data aplikasi, Auth, Storage, konfigurasi, atau Production yang diubah.

- Ujian `Ujian Sampel Fiqih Semester Ganjil` berstatus `published`.
- Jendela ujian: 19 November 2026 pukul 13.40 sampai 20 Desember 2026 pukul 13.40 WIB. Dengan demikian, pada pemeriksaan 28 November, jendela tersebut masih terbuka.
- Belum ada penugasan pada `cbt_exam_assignments` dan belum ada percobaan pada `cbt_attempts`.
- Terdapat 43 baris siswa pada tabel `students`, tetapi 0 berstatus aktif.
- Terdapat 4 profil ber-role Santri dan semuanya berstatus `suspended`; tidak ada profil Santri aktif untuk UAT.
- Tidak ada identitas pengguna, email, atau data pribadi yang dicatat dalam laporan ini.

## Arti hasil

Admin dapat membuka pratinjau baca-saja lewat **CBT → Sesi Ujian → pilih ujian → Pratinjau sisi peserta**. Pratinjau ini menampilkan soal/pilihan tanpa kunci jawaban, tanpa menyimpan jawaban, tanpa timer, dan tanpa membuat percobaan.

Tampilan peserta sebenarnya tersedia lewat **CBT → Ujian Saya** pada akun Santri aktif yang ditautkan ke data santri dan mendapat penugasan. Tombol **Mulai ujian** pada portal tersebut membuat percobaan dan memulai timer. Karena belum ada penugasan maupun akun Santri aktif, UAT sisi peserta sebenarnya belum dapat dilakukan.

## Langkah UAT berikutnya

1. Buat akun Santri sintetis khusus VQE dan kaitkan dengan satu data siswa sintetis yang aktif. Jangan mengaktifkan kembali empat profil Santri yang saat pemeriksaan berstatus ditangguhkan tanpa konfirmasi identitas serta alasan aksesnya.
2. Tugaskan ujian sintetis kepada akun tersebut. Gunakan soal nonrahasia khusus UAT bila perlu memperlihatkan halaman sebelum ujian aktif.
3. Masuk melalui browser sebagai Santri, buka **CBT → Ujian Saya**, lalu verifikasi bahwa daftar ujian, status, waktu, dan soal tampil sesuai penugasan.
4. Jangan menekan **Mulai ujian** kecuali skenario memang menguji pembuatan percobaan, autosave, dan timer; tindakan itu mengubah data staging.
5. Catat hasil baca-simpan-baca dan bersihkan fixture sintetis setelah UAT sesuai otorisasi yang berlaku.

## Batas

Ini adalah bukti status data pada VQE saat pemeriksaan, bukan bukti UAT ujian nyata. PTSAS Production tidak diakses atau diubah. UAT sisi Santri tetap menunggu akun sintetis aktif dan penugasan yang sesuai.

## Perbaikan sinkronisasi jawaban peserta — 28 November 2026

Source lokal menambahkan antrean simpan berurutan agar snapshot jawaban lama tidak dapat menimpa pilihan terbaru. Status jawaban baru disebut tersimpan setelah permintaan API berhasil. Saat pengumpulan, antrean ditunggu terlebih dahulu, snapshot yang sama tidak ditulis ulang, dan tidak ada simpan baru yang dimulai setelah tenggat ujian. Pilihan jawaban dikunci selama pengumpulan berlangsung. Jika perubahan terakhir tidak tersinkron, hasil pengumpulan memberi peringatan. Permintaan CBT memiliki batas waktu 15 detik agar jaringan yang macet tidak menahan antrean tanpa batas.

Verifikasi source lokal pada `erp4-main-clean-20261128` (HEAD `45d9c0d`, plus perubahan lokal): `npm run build` berhasil, `npm run lint` berhasil, 14 uji CBT lulus (autosave, tenggat, timeout jaringan, preview peserta, teks soal, paginasi, kalender, dashboard, paket, monitoring, dan validasi pengaturan), guard CI mengonfirmasi 83 dari 83 skrip test paket masuk workflow, dan `git diff --check` lulus. Build menghasilkan peringatan ukuran chunk untuk PDF (`react-pdf` sekitar 1,46 MB) dan komentar anotasi dependency Zod yang dilepas Rollup; keduanya tidak menghentikan build. `npm ci --offline` gagal karena Windows mengembalikan `EPERM` saat membuat direktori dependency. Agar build tetap dapat diperiksa, pohon dependency disalin dari checkout lokal lain setelah SHA-256 `package-lock.json` kedua checkout terbukti identik; manifest dan lockfile source tidak diubah.

## Pratinjau sisi peserta di staging — 28 November 2026

Pada situs staging Hostinger VQE, Admin UAT membuka **CBT → Sesi Ujian → Ujian Sampel Fiqih Semester Ganjil → Pratinjau sisi peserta**. Pratinjau menampilkan soal dan pilihan peserta (soal 1 dari 3); pilihan jawaban dinonaktifkan, timer tidak berjalan, dan tidak ada jawaban/percobaan yang disimpan. Dialog pratinjau dibiarkan terbuka untuk ditinjau.

Ini membuktikan tampilan pratinjau peserta dari sisi Admin, bukan alur ujian aktif dengan akun Santri. UI menampilkan 0 peserta ditugaskan dan 0 selesai. Untuk menguji portal peserta sebenarnya, masih dibutuhkan akun Santri UAT yang aktif serta penugasan ujian; alur mulai–simpan–kumpul dan timer belum diuji.

**Batas perubahan:** patch berada di checkout lokal `erp4-main-clean-20261128`, belum dikomit atau dipush, belum diterapkan ke VQE maupun Production, dan belum diuji melalui sesi ujian nyata. Belum ada akun/penugasan/percobaan sintetis yang dibuat. UAT peserta tetap memerlukan akun Santri aktif VQE, penugasan ujian, lalu uji mulai–simpan–kumpul dan pembersihan fixture.

## Pemeriksaan lintas-sistem — 28 November 2026

- GitHub mengonfirmasi `main` pada `45d9c0d670de0715e57154b043465e2a970c796e`; tidak ada PR terbuka. Perubahan CBT dalam checkout lokal belum dikomit/push.
- Pemeriksaan source global lulus: Supabase-only runtime (172 modul, 26 route Supabase, tanpa paket Firebase dalam graph runtime), kebijakan persistensi browser, pesan error pengguna (16 assertion + 14 skenario keamanan), UI copy, dan contoh environment Compose (73 variabel).
- Aset pada preview staging Hostinger berhasil diperiksa secara GET baca-saja: 105 aset JavaScript same-origin. Domain `erp4-pesantren.tlusur.com` juga lulus dengan 107 aset JavaScript same-origin. Pemeriksaan ini tidak membandingkan commit deployment dan tidak membuktikan semua interaksi modul.
- Tidak ada permintaan/penulisan database, perubahan setting hosting, atau deployment pada pemeriksaan ini.
