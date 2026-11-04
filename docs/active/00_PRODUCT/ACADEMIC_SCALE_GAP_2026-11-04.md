# Tinjauan Skalabilitas Akademik — 4 November 2026

## Temuan source

- Konflik jadwal bukan lagi submenu kosong. `SupabaseAcademicManager` menampilkan konflik pengajar, ruang, atau kelas dari jadwal tenant yang termuat dan memberi tindakan untuk membuka record terkait.
- Fungsi transaksi `upsert_academic_record` menolak jadwal yang tumpang tindih, sehingga perubahan manual diperiksa lagi di server. Layar tidak melakukan penjadwalan ulang otomatis.
- Snapshot jadwal hanya memindai jenis `schedule`, bukan lagi seluruh jenis catatan. Batasnya tetap 5.000 jadwal per tenant/filter; hasil di atas batas ditolak dengan error 503 agar tidak menyajikan daftar parsial sebagai lengkap.
- Jurnal dan penilaian kini memakai halaman cursor tenant-scoped sebanyak 50 record. Cursor berurutan stabil berdasarkan `created_at DESC, id DESC`; filter tenant, jenis, unit, dan pengajar diterapkan sebelum pagination. Endpoint memeriksa profil aktif, role, izin modul, serta batas unit Ustadz.
- Indeks parsial untuk urutan cursor jurnal/penilaian sudah ditambahkan sebagai migrasi sumber dan pemeriksaan pgTAP. Migrasi tersebut belum diterapkan ke staging.
- Roster santri Akademik juga dibatasi 5.000. Daftar pengajar, kelas, unit, serta pilihan referensi memiliki batas yang lebih kecil.

## Dampak untuk pesantren besar

Riwayat jurnal dan penilaian tidak lagi gagal hanya karena gabungan arsip melewati 5.000 record. Namun, daftar jadwal di atas 5.000 record dan roster santri di atas 5.000 masih memerlukan perubahan lanjutan sebelum modul ini dapat disertifikasi untuk tenant besar.

## Rekomendasi implementasi sebelum rilis skala besar

1. Terapkan pagination cursor yang sama untuk daftar jadwal dan roster santri; terapkan filter periode/kelas/unit di server.
2. Pindahkan pemeriksaan konflik seluruh jadwal ke endpoint agregasi atau pemindaian server yang tidak mengklaim “tidak ada konflik” sebelum cakupan lengkap selesai.
3. Pertahankan validasi transaksi yang menolak bentrok saat simpan; pemeriksaan UI tidak boleh menjadi satu-satunya kontrol.
4. Tambahkan uji sintetis tenant besar yang melebihi 5.000 record, termasuk pembuktian tidak ada data silang tenant/unit, cursor tanpa duplikasi/record terlewat, dan respons konflik yang menyatakan kelengkapan cakupan.

## Kriteria penerimaan

- Snapshot tidak memuat seluruh riwayat tanpa batas; jadwal dan roster tetap harus dipaginasi agar batas total tidak menghalangi tenant besar.
- Navigasi antarhalaman jurnal/penilaian stabil saat record baru masuk; filter tenant/jenis/unit/pengajar diterapkan sebelum pagination.
- Hasil konflik hanya menyatakan lengkap setelah seluruh jadwal yang masuk cakupan berhasil dipindai.
- Upaya simpan yang menghasilkan konflik tetap ditolak secara transaksional.
- Pengujian beban dan UAT tenant besar lulus pada staging sebelum gerbang ini ditutup.

## Status

Pagination cursor jurnal/penilaian dan indeksnya sudah diimplementasikan di source; pengujian lokal dan CI akan memvalidasi kontrak query. Migrasi belum diterapkan ke staging. Batas 5.000 pada jadwal dan roster, uji tenant besar, pemeriksaan konflik lengkap, serta UAT preview masih terbuka. Production tidak disentuh.

