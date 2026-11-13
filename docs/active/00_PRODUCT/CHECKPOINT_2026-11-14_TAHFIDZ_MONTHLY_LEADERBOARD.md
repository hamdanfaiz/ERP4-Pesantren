# Checkpoint Tahfidz — Papan Peringkat Bulanan

Tanggal: 14 November 2026
Status: implementasi lokal selesai; uji database dan UAT belum selesai.
Cakupan: papan peringkat Ziyadah bulanan pada dashboard Tahfidz.

## Perubahan

- Mengganti leaderboard lama yang mengurutkan ID dan menampilkan angka setoran tetap dengan peringkat dari catatan Ziyadah tersimpan.
- Perhitungan mengikuti bulan dan tanggal tenant. Urutan ditentukan jumlah setoran, hari aktif, nama, lalu ID agar hasil stabil.
- Admin dan SuperAdmin mendapat cakupan tenant aktif. Ustadz hanya mendapat santri dari halaqah aktifnya, dan skornya hanya menghitung setoran dari halaqah yang ditugaskan kepadanya.
- Santri dan Wali tidak mendapat daftar nama santri lain. Respons tidak menyertakan NIS dan endpoint memakai `Cache-Control: no-store`.
- Menghapus kartu leaderboard lama yang menampilkan nama berdasarkan urutan ID dan angka tetap.
- Menambahkan endpoint autentikasi `GET /api/tahfidz/leaderboard`, RPC service-role-only, indeks parsial Ziyadah, dan 21 pemeriksaan pgTAP pada suite roster Tahfidz.

## File utama

- `supabase/migrations/20270321000000_tahfidz_monthly_leaderboard.sql`
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
- `npm run test:supabase-quran-catalog` — lulus untuk kasus layanan tidak tersedia yang harus gagal-aman.
- Uji pgTAP belum dijalankan lokal karena Docker CLI/daemon dan Supabase CLI tidak tersedia di workspace ini. Suite pgTAP telah ditambah tetapi hasil CI belum ada.

## Yang belum terverifikasi

1. Jalankan `supabase test db` di CI atau lingkungan lokal yang memiliki Docker; pastikan 73 assertion pada `tahfidz_roster_pagination.test.sql` lulus.
2. Setelah pukul 05.00 WIB, UAT UI dengan Admin, Ustadz, Santri, dan Wali pada lingkungan yang disetujui. Pastikan Ustadz tidak mendapat catatan halaqah lain dan Santri/Wali tidak melihat peringkat teman.
3. Periksa empty state tenant tanpa setoran dan pembaruan leaderboard setelah setoran baru tersimpan.
4. Backend reviewer menilai DDL, index, dan urutan migrasi sebelum penerapan.

## Batas perubahan

- Migrasi hanya ditambahkan ke source; tidak diterapkan pada Supabase staging atau Production.
- Jangan jalankan `db push` otomatis atau menjalankan migrasi pada Production dari checkpoint ini. Rekonsiliasi ledger/DDL dan persetujuan backend tetap diperlukan.
- Jangan mengganti alur ranking dengan data contoh atau membocorkan nama santri kepada role Santri/Wali.
