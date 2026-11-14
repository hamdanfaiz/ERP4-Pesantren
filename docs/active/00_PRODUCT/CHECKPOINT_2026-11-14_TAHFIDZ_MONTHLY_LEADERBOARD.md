# Checkpoint Tahfidz — Leaderboard dan Target Massal

Tanggal: 14 November 2026
Status: fitur leaderboard dan target massal sudah ada di PR #116; validasi target pecahan diperbaiki. CI mengonfirmasi penolakan itu, lalu menemukan dua ekspektasi pesan test yang tidak cocok dan kini sudah diselaraskan; UAT akun belum selesai.
Cakupan: papan peringkat Ziyadah bulanan dan penetapan target harian ke banyak santri.

## Perubahan

- Mengganti leaderboard lama yang mengurutkan ID dan menampilkan angka setoran tetap dengan peringkat dari catatan Ziyadah tersimpan.
- Perhitungan mengikuti bulan dan tanggal tenant. Urutan ditentukan jumlah setoran, hari aktif, nama, lalu ID agar hasil stabil.
- Admin dan SuperAdmin mendapat cakupan tenant aktif. Ustadz hanya mendapat santri dari halaqah aktifnya, dan skornya hanya menghitung setoran dari halaqah yang ditugaskan kepadanya.
- Santri dan Wali tidak mendapat daftar nama santri lain. Respons tidak menyertakan NIS dan endpoint memakai `Cache-Control: no-store`.
- Menghapus kartu leaderboard lama yang menampilkan nama berdasarkan urutan ID dan angka tetap.
- Menambahkan endpoint autentikasi `GET /api/tahfidz/leaderboard`, RPC service-role-only, indeks parsial Ziyadah, dan 22 pemeriksaan pgTAP pada suite roster Tahfidz.
- Memulihkan pemilihan target untuk banyak santri (maksimal 250) pada tab Target. Setiap batch memakai satu RPC yang menerapkan validasi target satuan, tenant, peran, penugasan halaqah, serta batas periode secara atomik.
- Batch punya kunci idempotensi sendiri dan tanda terima server-only dengan RLS paksa. Jika satu baris gagal, seluruh batch dibatalkan; akses RPC ditolak untuk `anon` dan `authenticated`.
- Target Ziyadah dan Murojaah hanya menerima ketelitian sampai dua angka desimal; RPC menolak pecahan lebih kecil sebelum kolom membulatkan nilainya.
- Menambahkan 22 assertion pgTAP untuk batch, meliputi replay, payload berbeda, ID duplikat, batas 250, lintas tenant, batas halaqah Ustadz, rollback, privilege, dan pembulatan target.

## File utama

- `supabase/migrations/20270327000000_tahfidz_monthly_leaderboard.sql` (setelah batch CBT #112 pada versi 20270321000000–20270326000000)
- `supabase/migrations/20270328000000_tahfidz_bulk_daily_target_write_api.sql` (sesudah migration leaderboard)
- `supabase/tests/tahfidz_bulk_target_write_api.test.sql`
- `supabase/tests/tahfidz_roster_pagination.test.sql`
- `src/server/supabaseTahfidz.ts`
- `server.ts`
- `src/pages/TahfidzManager.tsx`
- `scripts/test-migration-preflight.mjs`

## Bukti lokal

- `npm run lint` — lulus.
- `npm run build` — lulus; Vite masih menampilkan peringatan ukuran chunk besar dan anotasi komentar dependency `zod` yang dihapus saat bundling.
- `npm run test:migration-preflight` — lulus setelah daftar migrasi source dan hitungan pending fixture diperbarui.
- `npm run test:api-route-auth-policy` — lulus; route baru masuk daftar API privat yang memerlukan autentikasi.
- `npm run test:private-api-schema`, `npm run test:ci-coverage`, `npm run test:tahfidz-membership-date`, dan `npm run test:tahfidz-achievements` — lulus.
- `npm run test:supabase-quran-catalog` — lulus untuk kasus layanan tidak tersedia yang harus gagal-aman.
- Uji pgTAP dan API/auth/tenant lokal belum berjalan karena Supabase lokal tidak tersedia di port `54322` dan Docker tidak terpasang. CI pada `47426f6` mengungkap target sub-cent dibulatkan. CI berikutnya membuktikan penolakan sudah bekerja tetapi mendeteksi dua ekspektasi teks pada pgTAP yang keliru; test diselaraskan dan menunggu CI ulang.

## Yang belum terverifikasi

1. UAT UI dengan Admin, Ustadz, Santri, dan Wali pada lingkungan yang disetujui. Pastikan cakupan halaqah, privasi leaderboard, dan akses target benar untuk tiap peran.
2. Periksa tenant tanpa setoran, perubahan leaderboard setelah setoran tersimpan, batch target sukses, dan batch yang dibatalkan karena satu santri tidak sah.
3. Backend reviewer menilai DDL, indeks, batas transaksi, dan urutan migrasi sebelum penerapan.

## Batas perubahan

- Migrasi hanya ditambahkan ke source; tidak diterapkan pada Supabase staging atau Production.
- Jangan jalankan `db push` otomatis atau menjalankan migrasi pada Production dari checkpoint ini. Rekonsiliasi ledger/DDL dan persetujuan backend tetap diperlukan.
- Jangan mengganti alur ranking dengan data contoh atau membocorkan nama santri kepada role Santri/Wali.
