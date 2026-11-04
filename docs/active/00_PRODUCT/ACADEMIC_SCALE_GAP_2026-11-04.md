# Tinjauan Skalabilitas Akademik — 4 November 2026

## Temuan source

- Konflik jadwal bukan lagi submenu kosong. `SupabaseAcademicManager` menampilkan konflik pengajar, ruang, atau kelas dan memberi tindakan untuk membuka record terkait.
- Fungsi transaksi `upsert_academic_record` menolak jadwal yang tumpang tindih, sehingga perubahan manual diperiksa lagi di server. Layar tidak melakukan penjadwalan ulang otomatis.
- Jadwal di tab Akademik kini memakai cursor tenant-scoped sebanyak 50 record dengan urutan stabil `created_at DESC, id DESC`; filter tenant, unit, dan pengajar diterapkan di server.
- Pemindai konflik hanya dijalankan saat Admin membuka tab konflik. Endpoint membaca seluruh jadwal tenant/filter secara bounded hingga 5.000 record; hasil di atas batas ditolak dengan error 503 sehingga UI tidak menyatakan “tidak ada konflik” dari hasil parsial.
- Jurnal dan penilaian kini memakai halaman cursor tenant-scoped sebanyak 50 record. Cursor berurutan stabil berdasarkan `created_at DESC, id DESC`; filter tenant, jenis, unit, dan pengajar diterapkan sebelum pagination. Endpoint memeriksa profil aktif, role, izin modul, serta batas unit Ustadz.
- Roster santri kini memakai halaman keyset tenant-scoped sebanyak 50 record, pencarian nama/NIS, serta cursor yang terikat pada tenant, aktor, role, pencarian, dan filter unit.
- Roster Ustadz ditentukan oleh `class_reference_id` yang sama persis dengan `students.class_id`; nama kelas yang kebetulan sama tidak memberi akses. Guard transaksi juga menolak penilaian Ustadz untuk kelas yang tidak dijadwalkan bagi Ustadz tersebut.
- Kelas tetap dibatasi maksimal 500 referensi per permintaan agar pilihan formulir terukur; jika melebihi batas, endpoint gagal tertutup. Pengajar, unit, dan katalog pilihan juga tetap memiliki batas tampilan tersendiri.
- Indeks untuk urutan cursor roster dan relasi kelas/pengajar ditambahkan dalam migration source `20270301000000_academic_student_roster_pagination.sql`. Kedua migration akademik sudah diterapkan pada VQE staging; uji pgTAP-nya masih menunggu CI.

## Dampak untuk pesantren besar

Daftar jadwal, jurnal, penilaian, dan santri kini dimuat per halaman; jumlah santri tenant tidak lagi dibatasi oleh satu snapshot 5.000 baris. Pemindaian konflik masih dibatasi 5.000 jadwal, sedangkan kelas dalam satu pilihan dibatasi 500 referensi. Karena itu skala tenant besar belum tersertifikasi sampai uji beban dan UAT mewakili jumlah kelas, jadwal, dan santri sebenarnya.

## Rekomendasi implementasi sebelum rilis skala besar

1. Evaluasi batas 500 kelas berdasarkan jumlah kelas tenant besar; bila dibutuhkan, sediakan pencarian/paginasi referensi kelas dengan filter Ustadz di server.
2. Untuk konflik lebih dari 5.000 jadwal, pindahkan pencarian konflik ke query atau fungsi Postgres yang efisien dan tetap menyatakan kelengkapan cakupan secara eksplisit.
3. Pertahankan validasi transaksi yang menolak bentrok saat simpan; pemeriksaan UI tidak boleh menjadi satu-satunya kontrol.
4. Tambahkan uji sintetis tenant besar untuk semua halaman, termasuk filter tenant/unit, cursor tanpa duplikasi atau record terlewat, penolakan respons konflik parsial, dan pengujian beban yang representatif.

## Kriteria penerimaan

- Snapshot tidak memuat seluruh riwayat atau roster tanpa batas; setiap daftar besar memakai halaman dan cursor.
- Navigasi antarhalaman seluruh jenis catatan dan roster stabil; filter tenant/jenis/unit/pengajar/kelas diterapkan sebelum pagination.
- Hasil konflik hanya menyatakan lengkap setelah seluruh jadwal dalam tenant/filter dipindai; jika melewati batas yang diizinkan, UI menampilkan error, bukan daftar parsial.
- Upaya simpan yang menghasilkan konflik tetap ditolak secara transaksional.
- Pengujian beban dan UAT tenant besar lulus pada staging sebelum gerbang ini ditutup.

## Status

Pagination cursor jadwal/jurnal/penilaian/roster dan guard kelas Ustadz sudah diimplementasikan di source dan dua migration terbaru sudah diterapkan ke VQE staging. Setelah diselaraskan dengan head PR #40 `90c17e8`, validasi lokal lulus: lint, build, pagination catatan/roster, konflik jadwal, portal Akademik, migration preflight, dan guard Supabase-only. pgTAP roster belum dijalankan; daftar kelas dibatasi 500 referensi dan scan konflik 5.000 jadwal masih memerlukan uji kapasitas tenant besar. UAT preview belum selesai. Production tidak disentuh.

## Perubahan kapasitas pilihan kelas — 5 November 2026

- Batas keras 500 kelas pada roster Akademik dihapus dari source. Roster tidak lagi membawa sampel kelas yang dapat terlihat lengkap padahal terpotong.
- Pilihan kelas jadwal dan jurnal kini memakai endpoint pencarian/pagination keyset berukuran 100. Kursor terikat pada tenant, aktor, role, pencarian, dan filter unit. Fungsi Postgres memeriksa profil/tenant aktif dan izin Akademik; kelas Ustadz dibatasi ke referensi kelas yang mempunyai jadwal untuk Ustadz tersebut.
- Migration source baru `20270302000000_academic_class_reference_pagination.sql` dan assertion pgTAP untuk tenant dengan 501 kelas sintetis sudah ditambahkan. Perubahan masih lokal; migration belum diterapkan ke VQE dan assertion belum dijalankan di Postgres.
- Lint, build, uji pagination kelas, uji pagination roster, dan `git diff --check` lulus. Build tetap memberi peringatan chunk PDF 1,46 MB.
- Gerbang skala tenant besar yang tersisa adalah pemindaian konflik jadwal 5.000 record dan uji beban/UAT representatif. Production PTSAS tidak disentuh.

