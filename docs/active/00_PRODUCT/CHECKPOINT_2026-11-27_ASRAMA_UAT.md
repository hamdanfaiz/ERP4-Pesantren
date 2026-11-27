# Checkpoint UAT Asrama — 27 November 2026

## Lingkungan dan cakupan

- Pengujian dilakukan pada Hostinger staging `lightgreen-jay-425688.hostingersite.com`, proyek Supabase VQE, dengan akun Admin UAT.
- Pemeriksaan tidak menyentuh PTSAS Production.
- Navigasi Asrama diuji pada enam bagian: Penempatan Kamar, Perizinan, Kedisiplinan, Kehadiran, Penugasan, dan Fasilitas. Semua layar memuat data atau form tanpa menampilkan kegagalan modul. Navigasi horizontal dapat digulir sampai bagian yang tersembunyi.

## Bukti UAT

- **Penempatan Kamar:** daftar menampilkan 3 santri sintetis dan 2 kamar aktif; pilihan kamar dan batas kapasitas tampil. Tidak ada penempatan yang diubah.
- **Perizinan:** daftar menampilkan 2 permohonan sintetis; satu menunggu persetujuan dan satu sudah kembali. Tidak ada keputusan yang diubah.
- **Kedisiplinan:** dua catatan sintetis memuat tingkat, poin, tanggal, dan tindakan; tidak ada catatan yang diselesaikan atau diubah.
- **Kehadiran:** daftar menampilkan 2 santri aktif untuk 27 November 2026, masing-masing belum ditandai. Status hadir/ghaib tidak diubah.
- **Penugasan:** satu akun Ustadz sintetis dan satu lokasi gedung tersedia pada formulir; belum ada penugasan, dan tidak ada akses baru yang diberikan.
- **Fasilitas:** audit kebersihan dan tiket perbaikan sama-sama dapat dibuka; dua tiket latihan tampil.
- Satu audit kebersihan staging berhasil disimpan dan muncul pada riwayat setelah respons berhasil. Fixture bertanggal 27 November 2026 memakai skor 90 dan catatan `[UAT] Simulasi audit kebersihan baik; bukan hasil inspeksi nyata.`

## Perbaikan antarmuka

Saat berpindah dari Audit kebersihan ke Tiket fasilitas, pesan sukses audit sebelumnya masih tertinggal. Perubahan source pada branch ini menghapus pesan sukses otomatis setelah lima detik. Belum diverifikasi pada deployment Hostinger karena perubahan belum dipromosikan.

## Verifikasi source

- `npm run lint` lulus.
- `npm run test:ui-copy` lulus, termasuk pemeriksaan istilah teknis pada salinan antarmuka.
- `npm run build` lulus. Build masih mengeluarkan peringatan chunk PDF besar dan anotasi komentar dependensi `zod` yang diabaikan Rollup.

## Batas bukti dan tindak lanjut

- UAT ini mencakup pemuatan enam bagian dan satu alur simpan-baca audit kebersihan. Ini belum membuktikan semua CRUD Asrama, batas akses lintas role/tenant, atau keseluruhan ERP.
- Fixture audit sintetis tetap berada di VQE untuk UAT berikutnya.
- PTSAS Production tetap tidak berubah. Rekonsiliasi DDL dan urutan migrasi serta bukti pemulihan backup Production masih perlu dituntaskan pemilik database/backend sebelum cutover.
