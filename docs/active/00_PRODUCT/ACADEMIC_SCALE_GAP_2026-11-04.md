# Tinjauan Skalabilitas Akademik — 4 November 2026

## Temuan source

- Konflik jadwal bukan lagi submenu kosong. `SupabaseAcademicManager` menampilkan konflik pengajar, ruang, atau kelas dari jadwal tenant yang termuat dan memberi tindakan untuk membuka record terkait.
- Fungsi transaksi `upsert_academic_record` menolak jadwal yang tumpang tindih, sehingga perubahan manual diperiksa lagi di server. Layar tidak melakukan penjadwalan ulang otomatis.
- Pemeriksaan source `getSupabaseAcademicSnapshot` memindai paling banyak 5.000 `academic_records` untuk satu tenant/filter. Jika hasil tidak lengkap atau melebihi batas, modul mengembalikan error 503 secara aman.
- Roster santri Akademik juga dibatasi 5.000. Daftar pengajar, kelas, unit, serta pilihan referensi memiliki batas yang lebih kecil.

## Dampak untuk pesantren besar

Saat jumlah gabungan jadwal, jurnal, dan penilaian melampaui 5.000 record, snapshot gagal dimuat. Batas fail-closed mencegah layar menyebut hasil parsial sebagai lengkap, tetapi pesantren besar dapat mencapai batas itu seiring waktu dan tidak dapat menggunakan seluruh modul Akademik.

## Rekomendasi implementasi sebelum rilis skala besar

1. Pisahkan sumber dan halaman Jadwal, Jurnal, dan Penilaian; jangan mengirim seluruh riwayat lewat satu snapshot.
2. Tambahkan pagination berbasis cursor yang stabil dan filter periode/kelas/unit di server. Pertahankan pembatasan role dan tenant di setiap halaman.
3. Pindahkan pemeriksaan konflik seluruh jadwal ke endpoint agregasi atau pemindaian halaman server yang tidak mengklaim “tidak ada konflik” sebelum cakupan lengkap selesai.
4. Pertahankan validasi transaksi yang menolak bentrok saat simpan; pemeriksaan UI tidak boleh menjadi satu-satunya kontrol.
5. Tambahkan uji sintetis tenant besar yang melebihi 5.000 record, termasuk pembuktian tidak ada data silang tenant/unit, cursor tanpa duplikasi/record terlewat, dan respons konflik yang menyatakan kelengkapan cakupan.

## Kriteria penerimaan

- Snapshot halaman tidak memuat seluruh riwayat tanpa batas dan tidak gagal hanya karena total histori bertambah.
- Navigasi antarhalaman stabil saat record baru masuk; filter unit/kelas/periode diterapkan sebelum pagination.
- Hasil konflik hanya menyatakan lengkap setelah seluruh jadwal yang masuk cakupan berhasil dipindai.
- Upaya simpan yang menghasilkan konflik tetap ditolak secara transaksional.
- Pengujian beban dan UAT tenant besar lulus pada staging sebelum gerbang ini ditutup.

## Status

Ini adalah temuan source dan rencana perbaikan; belum ada perubahan backend atau migrasi untuk masalah batas 5.000 ini. Production tidak disentuh. Pemeriksaan konflik unit diuji lokal dengan `npm run test:academic-schedule-conflicts`; pengujian UAT staging untuk modul ini masih menunggu akses preview Admin.

