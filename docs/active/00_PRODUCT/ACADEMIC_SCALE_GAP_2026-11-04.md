# Tinjauan Skalabilitas Akademik — 4 November 2026

## Temuan source

- Konflik jadwal bukan lagi submenu kosong. `SupabaseAcademicManager` menampilkan konflik pengajar, ruang, atau kelas dan memberi tindakan untuk membuka record terkait.
- Fungsi transaksi `upsert_academic_record` menolak jadwal yang tumpang tindih, sehingga perubahan manual diperiksa lagi di server. Layar tidak melakukan penjadwalan ulang otomatis.
- Jadwal di tab Akademik kini memakai cursor tenant-scoped sebanyak 50 record dengan urutan stabil `created_at DESC, id DESC`; filter tenant, unit, dan pengajar diterapkan di server.
- Pemindai konflik hanya dijalankan saat Admin membuka tab konflik. Endpoint membaca seluruh jadwal tenant/filter secara bounded hingga 5.000 record; hasil di atas batas ditolak dengan error 503 sehingga UI tidak menyatakan “tidak ada konflik” dari hasil parsial.
- Jurnal dan penilaian kini memakai halaman cursor tenant-scoped sebanyak 50 record. Cursor berurutan stabil berdasarkan `created_at DESC, id DESC`; filter tenant, jenis, unit, dan pengajar diterapkan sebelum pagination. Endpoint memeriksa profil aktif, role, izin modul, serta batas unit Ustadz.
- Indeks parsial untuk urutan cursor jurnal/penilaian sudah ditambahkan sebagai migrasi sumber dan pemeriksaan pgTAP. Migrasi tersebut belum diterapkan ke staging.
- Roster santri Akademik dan pemetaan kelas yang dipakai untuk membatasi data Ustadz masih memiliki batas 5.000; karena itu sertifikasi tenant besar belum selesai. Daftar pengajar, kelas, unit, serta pilihan referensi memiliki batas yang lebih kecil.

## Dampak untuk pesantren besar

Daftar jadwal, jurnal, dan penilaian kini dapat dimuat per halaman; jumlah histori gabungan tidak lagi menjadi batas snapshot. Sementara itu, pemindaian konflik dan roster/Ustadz tetap fail-closed pada 5.000 record. Tenant yang melewati ambang tersebut belum dapat menggunakan semua alur Akademik sampai roster/pemetaan kelas dipaginasi dan pemeriksaan konflik dipindah ke query yang berskala lebih besar.

## Rekomendasi implementasi sebelum rilis skala besar

1. Paginasikan roster santri/pemetaan kelas serta terapkan filter kelas/unit di server sebelum pagination.
2. Untuk konflik lebih dari 5.000 jadwal, pindahkan pencarian konflik ke query atau fungsi Postgres yang efisien dan tetap menyatakan kelengkapan cakupan secara eksplisit.
3. Pertahankan validasi transaksi yang menolak bentrok saat simpan; pemeriksaan UI tidak boleh menjadi satu-satunya kontrol.
4. Tambahkan uji sintetis tenant besar untuk semua halaman, termasuk filter tenant/unit, cursor tanpa duplikasi atau record terlewat, penolakan respons konflik parsial, dan pengujian beban yang representatif.

## Kriteria penerimaan

- Snapshot tidak memuat seluruh riwayat tanpa batas; jadwal/jurnal/penilaian dimuat per halaman dan roster tidak berhenti pada batas total tenant.
- Navigasi antarhalaman seluruh jenis catatan dan roster stabil; filter tenant/jenis/unit/pengajar/kelas diterapkan sebelum pagination.
- Hasil konflik hanya menyatakan lengkap setelah seluruh jadwal dalam tenant/filter dipindai; jika melewati batas yang diizinkan, UI menampilkan error, bukan daftar parsial.
- Upaya simpan yang menghasilkan konflik tetap ditolak secara transaksional.
- Pengujian beban dan UAT tenant besar lulus pada staging sebelum gerbang ini ditutup.

## Status

Pagination cursor jadwal/jurnal/penilaian, pemindai konflik bounded, dan indeks histori sudah diimplementasikan di source. Pengujian lokal mencakup scope tenant, role, cursor, kelengkapan scan, serta penolakan lebih dari 5.000 jadwal. Migrasi indeks belum diterapkan ke staging. Batas 5.000 pada roster/pemetaan kelas, uji tenant besar, verifikasi UAT preview, serta skalabilitas konflik di atas ambang masih terbuka. Production tidak disentuh.

