# Progres penyelesaian pengembangan ERP4 Pesantren — 30 Oktober 2026

> **Estimasi penyelesaian pengembangan: sekitar 73%** (rentang kerja 70–75%). Angka ini **tidak memasukkan pelaksanaan deployment dan UAT**, yang akan dilakukan tim backend/penerapan Anda. Angka ini bukan bukti produk sudah siap produksi.

## Perubahan definisi progres

Sebelumnya ada dua angka: kematangan fitur sekitar 73% dan kesiapan go-live sekitar 46%. Angka go-live menggabungkan pekerjaan pengembangan dengan gerbang rilis eksternal seperti rehearsal database, deployment, validasi environment pelanggan, dan UAT. Karena deployment dan UAT dikerjakan tim lain, **46% tidak lagi dipakai untuk melaporkan progres penyelesaian project**. Angka tersebut hanya dipertahankan sebagai catatan historis kesiapan rilis.

Untuk pelaporan project, angka kerja sekarang adalah **sekitar 73% penyelesaian pengembangan**. Ini meneruskan estimasi kematangan fitur sebelumnya; bukan hasil penghitung otomatis dan belum memakai WBS berbobot yang disepakati tim. Angka bisa berubah setelah cakupan fitur dinilai bersama tim backend.

## Cakupan metrik

**Dihitung sebagai pekerjaan pengembangan:**

- Implementasi fitur, skema, API Supabase, validasi transaksi, dan integrasi antarmodul.
- Isolasi tenant, role/permission, dan pengamanan jalur runtime.
- Pengujian otomatis/sintetis, perbaikan hasilnya, serta kesiapan paket aplikasi untuk pemasangan mandiri.
- Dokumentasi teknis yang diperlukan agar tim backend dapat meninjau dan menjalankan aplikasi.

**Tidak dihitung di metrik ini:**

- Pelaksanaan deployment ke hosting, VPS, atau server pelanggan.
- Penerapan migration dan konfigurasi database live oleh tim penerapan.
- UAT dan penerimaan pengguna akhir.

Skrip migration, konfigurasi yang portabel, dan dokumentasi deployment tetap bagian pekerjaan pengembangan; menjalankannya pada environment pelanggan adalah pekerjaan tim penerapan.

## Pekerjaan pengembangan yang masih terbuka

1. **Lengkapi atau sepakati penurunan cakupan empat modul yang masih ditahan (fail-closed):** Manajemen Multi-Unit, Keuangan dan Anggaran, Analitik AI, serta PPOB dan Layanan. Masing-masing memerlukan keputusan cakupan, alur Supabase, pemeriksaan tenant/role, UI operasional, dan tes sebelum dapat dibuka.
2. **Tuntaskan cutover runtime Firebase ke Supabase.** Audit semua dependency dan jalur Firebase yang masih ada; hapus jalur runtime lama yang tidak dibutuhkan setelah memastikan tidak dipakai, lalu buktikan build aplikasi berjalan tanpa Firebase. Data Firestore yang telah dinyatakan dummy tidak perlu disalin.
3. **Tutup integrasi lintas modul.** Verifikasi referensi data, aturan tenant dan permission, transaksi idempoten, validasi status, serta jejak audit pada alur yang saling terhubung.
4. **Lengkapi verifikasi pengembangan untuk paket self-hosted.** Pastikan konfigurasi, startup, health check, upgrade schema, pencadangan/pemulihan, dan panduan VPS/on-premise konsisten dan dapat direproduksi.
5. **Selesaikan suite kode/CI atas perubahan terakhir.** Hasil CI sintetis adalah bukti untuk source dan fixture uji; hasilnya tidak dianggap sebagai UAT atau verifikasi database pelanggan.

## Kriteria penyelesaian pengembangan (100%)

Pengembangan dapat dilaporkan 100% setelah seluruh fitur dalam cakupan produk berjalan pada runtime Supabase atau secara eksplisit disepakati untuk ditunda; integrasi tenant/role dan transaksi memiliki tes; jalur runtime Firebase tidak tersisa; dan build/CI serta paket self-hosted lulus pada sumber kode yang sama.

Angka 100% **tidak menyatakan deployment produksi atau UAT telah dilakukan**. Tim backend tetap menjalankan deployment dan UAT sesuai rencana.

## Checkpoint dan handoff

- Basis kode yang ditinjau untuk checkpoint ini: PR #13, branch `codex/supabase-runtime-cutover-20261022`, head sebelum commit dokumen ini `6169668230b9afb0e11c9db6d37847bc1fd55a7f`.
- PR #13 masih Open/Draft saat pemeriksaan. Dokumen ini tidak mengubah kode runtime, database Supabase, status PR, deployment, ataupun data.
- Tim backend dapat meninjau daftar pekerjaan di atas pada branch PR #13. Persentase diperbarui pada checkpoint berikutnya hanya jika ada bukti implementasi atau tes baru; deployment/UAT dicatat terpisah oleh tim penerapan.


## Verifikasi CI untuk checkpoint — 30 Oktober 2026

- GitHub Actions [run 40973057285](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40973057285) selesai **sukses, 2/2 job**, pada commit dokumentasi `20ce0fbe262e5ba6b76944544ef5dab06599865f`.
- Job frontend lulus typecheck, guard import Firebase pada frontend aktif, smoke test runtime production tanpa paket Firebase, konfigurasi runtime pelanggan, serta build dan smoke test Docker/Compose.
- Job database lulus rehearsal migration pada Supabase lokal sintetis, pgTAP/database tests, reservasi NIS/Tahfidz serentak, preview importer sintetis, API auth/isolasi tenant, unggah Storage Finance/PPDB/Perpustakaan, serta backup/restore lokal.
- Ini bukti source dan fixture sintetis pada CI saja. Tidak ada migration/data yang diterapkan ke Supabase live; hasil ini bukan deployment atau UAT pelanggan. Estimasi penyelesaian pengembangan tetap sekitar **73%** karena commit ini hanya memperbarui dokumentasi.
