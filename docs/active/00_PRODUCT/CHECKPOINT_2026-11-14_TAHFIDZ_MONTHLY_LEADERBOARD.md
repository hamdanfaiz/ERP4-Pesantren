# Checkpoint Tahfidz — Leaderboard dan Target Massal

Tanggal: 14 November 2026
Status: fitur PR #116 dan perbaikan katalog/tab PR #114 telah disatukan dan dipush ke branch PR #116 pada commit `3ca5f444daed76814df56da7c21155e126c906fd`. Build dan pemeriksaan lokal lulus; CI pascapush serta UAT browser masih menunggu.
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
- GitHub Actions lulus: replay migrasi dari batas Production, 69 file suite pgTAP (1.739 assertion), pemeriksaan konkurensi NIS/slot Ustadz/penempatan kamar, API/auth/isolasi tenant, Storage, backup/restore lokal, frontend/container, serta instalasi NPM. Runner membuktikan target di bawah presisi dua desimal ditolak.
- PC lokal tidak memiliki Docker dan Supabase lokal di port `54322`; uji database dijalankan di runner GitHub terisolasi.

### Verifikasi lanjutan (14 November 2026)

- `npm run build` — lulus pada preview worktree yang memakai file UI Tahfidz dari branch ini. Ada peringatan ukuran chunk dan anotasi `zod`, tetapi tidak menghentikan build.
- `npm run lint` — lulus.
- `npm run test:supabase-quran-catalog`, `npm run test:tahfidz-achievements`, `npm run test:tahfidz-record-pagination`, `npm run test:tahfidz-session-pagination`, `npm run test:tahfidz-membership-date`, `npm run test:migration-preflight`, dan `npm run test:supabase-runtime-no-firebase` — lulus.
- Tes katalog menampilkan log `503` sebagai skenario negatif yang memang disimulasikan untuk memastikan sistem gagal-aman; itu bukan hasil pembacaan live.
- Baca-saja langsung ke katalog `quran_surahs` VQE mengembalikan HTTP `200`, 114 Surah, nomor berurutan 1–114. Tidak membaca data santri dan tidak menulis ke database.
- Server preview lokal di `127.0.0.1:3000` merespons `/health/live` dan `/health/ready` dengan `200`. Runtime config menunjukkan Tahfidz dan Data Induk aktif; flag PPDB, onboarding PPDB, dan lampiran PPDB masih nonaktif pada konfigurasi VQE yang digunakan.
- Belum menjalankan UAT visual dengan Admin/Ustadz/Santri/Wali pada sesi browser, serta belum menguji perubahan data karena memerlukan sesi login dan skenario sintetis yang disepakati.

## Integrasi katalog dan tab dari PR #114

- Branch ini kini mempertahankan leaderboard dan API target massal PR #116 sekaligus pemilih Surah/ayat dari katalog Supabase, validasi nama/rentang ayat di server, penanganan katalog gagal-aman, dan tab Tahfidz yang dapat digulir dari PR #114.
- Uji katalog memeriksa skenario katalog lengkap, tidak lengkap, urutan tidak valid, layanan gagal, pilihan Surah berbasis referensi, batas jumlah ayat, serta penolakan rentang yang tidak valid.
- `npm run lint`, `npm run build`, dan paket tes lokal yang tercantum pada bagian verifikasi 14 November lulus setelah penggabungan source ini.
- Integrasi sudah dipush ke branch PR #116 pada commit `3ca5f444daed76814df56da7c21155e126c906fd`. GitHub Actions baru sedang menjalankan job `Supabase database tests` (run `43602114221`); tunggu seluruh job selesai sebelum status PR diperbarui.
- UAT interaksi dengan akun staging dan roster sintetis belum dibuktikan. Jangan menyatakan PR siap merge hanya berdasarkan build/test lokal.

## Audit VQE staging (baca-saja, 14 November 2026)

- Ledger VQE memuat 150 versi; source branch memuat 152 file migrasi. VQE melewatkan delapan versi source: `20270215500000`, `20270309000000`, `20270310000000`, `20270311000000`, `20270313000000`, `20270320000000`, `20270327000000`, dan `20270328000000`.
- VQE juga menyimpan enam versi yang tidak ada pada source saat ini: `20261109145507`, `20261109145522`, `20261109145534`, `20270317000000`, `20270318000000`, dan `20270319000000`. Tiga versi lama itu bernama katalog surah, leaderboard, dan target massal Tahfidz; source memakai versi `20270320`, `20270327`, dan `20270328`.
- Katalog leaderboard dan batch target memang sudah ada di VQE. Metadata tabel batch cocok dengan kolom, kunci, FK, dan checks yang diharapkan; RLS dipaksa, akses baca klien tertutup, dan akses service role sesuai. RPC batch VQE berstatus `SECURITY INVOKER`, tetapi belum memiliki validasi presisi dua desimal yang baru ditambahkan.
- Migrasi batch source saat ini memakai `CREATE TABLE` tanpa `IF NOT EXISTS`; karena tabel tersebut sudah ada di VQE, migrasi tidak boleh didorong langsung ke sana. Selisih ledger umum di atas perlu direkonsiliasi sebelum `db push`/UAT berbasis branch. Pemeriksaan ini hanya membaca metadata; tidak ada perubahan cloud.

### Konfirmasi katalog RPC dan hak akses baca-saja (14 November 2026)

- Pemeriksaan `pg_catalog`/`information_schema` mengonfirmasi tabel tanda terima batch VQE sudah ada dengan 12 kolom, primary key tenant/request, foreign key tenant dan profil pembuat, serta check constraints; RLS dan FORCE RLS aktif.
- `anon` dan `authenticated` tidak memiliki SELECT/INSERT pada tabel tanda terima. `service_role` memiliki SELECT/INSERT. Tabel tidak memiliki policy klien; aksesnya tetap melalui RPC server.
- `record_tahfidz_daily_target` adalah `SECURITY INVOKER`, `search_path=pg_catalog, public`, dan memvalidasi presisi dua desimal. `record_tahfidz_daily_targets_bulk` juga `SECURITY INVOKER` dengan search path tetap; RPC hanya dapat dijalankan `service_role`, tetapi definisi VQE saat ini belum memvalidasi presisi dua desimal. Source PR #116 menambahkan validasi tersebut.
- Hasil ini menguatkan batas akses staging, tetapi bukan uji simpan-baca API, transaksi batch, role/tenant lintas akun, atau bukti bahwa DDL VQE sama dengan source. Karena tabel batch sudah ada dan file source dimulai dengan `CREATE TABLE` tanpa kondisi, jangan menjalankan source migration secara langsung pada VQE.

## Yang belum terverifikasi

1. UAT UI dengan Admin, Ustadz, Santri, dan Wali memakai roster sintetis pada lingkungan yang disetujui. Pastikan cakupan halaqah, privasi leaderboard, dan akses target benar untuk tiap peran.
2. Periksa tenant tanpa setoran, perubahan leaderboard setelah setoran tersimpan, batch target sukses, dan batch yang dibatalkan karena satu santri tidak sah.
3. Backend reviewer menilai DDL, indeks, batas transaksi, dan urutan migrasi sebelum penerapan.
4. Rekonsiliasi ledger VQE terhadap source sebelum menjalankan migrasi #116; jangan memakai `db push` langsung pada ledger yang berbeda ini.

## Verifikasi lanjutan setelah checkpoint (14 November 2026)

- Audit menemukan API server sebelumnya meneruskan target halaman dengan presisi lebih dari dua angka ke RPC. Validasi server kini menolak nilai itu sebelum operasi tulis, sejalan dengan batas presisi migrasi.
- Ditambahkan `test:tahfidz-target-precision` untuk memastikan target tunggal dan batch dengan presisi berlebih ditolak sebelum RPC, serta batch valid dinormalisasi dan dikirim dengan konteks actor server. Tes ini dimasukkan ke workflow CI.
- `npm run test:tahfidz-target-precision`, `npm run lint`, `npm run test:ci-coverage`, seluruh tes Tahfidz/katalog/preflight/route-auth yang tercantum pada checkpoint, dan `npm run build` lulus pada worktree ini. Coverage guard memastikan semua 61 skrip tes package dijadwalkan dalam workflow database CI.
- Build masih memberi peringatan ukuran chunk `react-pdf.browser` sekitar 1,46 MB serta anotasi komentar Zod dari dependency; build tetap sukses.
- Pemeriksaan GitHub Actions run `43602270610` lulus 3/3 job pada head sebelum perbaikan presisi. Setelah commit perbaikan dipush, CI baru perlu lulus lagi sebelum status PR berubah.
- Preview pada port 3000 tidak dapat dimulai karena port ditolak sebagai sudah terpakai; tidak terlihat proses yang memilikinya. Server berhasil dinyalakan pada `127.0.0.1:3002`, tetapi pemeriksaan HTTP dari sesi ini dibatasi izin socket sehingga UAT browser belum terbukti. Jangan hentikan proses port 3000 yang tidak dikenal.
- Docker tidak diperlukan untuk build atau tes aplikasi ini. Tes database penuh memakai Supabase lokal terisolasi di CI; Docker lokal hanya diperlukan bila operator memilih menjalankan stack Supabase di PC.

## Batas perubahan

- Migrasi hanya ditambahkan ke source; tidak diterapkan pada Supabase staging atau Production.
- Jangan jalankan `db push` otomatis atau menjalankan migrasi pada Production dari checkpoint ini. Rekonsiliasi ledger/DDL dan persetujuan backend tetap diperlukan.
- Jangan mengganti alur ranking dengan data contoh atau membocorkan nama santri kepada role Santri/Wali.


