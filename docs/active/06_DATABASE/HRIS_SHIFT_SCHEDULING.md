# Jadwal Shift HRIS

Status implementasi: source tersedia pada PR #270. Migrasi `20270407000000_hris_shift_scheduling` sudah diterapkan hanya ke VQE staging dan ledger sudah direkonsiliasi ke 169 versi kanonis. UAT UI masih menunggu Admin masuk ke preview PR #270. Production PTSAS belum diubah.

## Model dan aturan jadwal

- `hris_shift_templates` menyimpan pola mingguan per tenant. Mask hari memakai bit: Senin `1`, Selasa `2`, Rabu `4`, Kamis `8`, Jumat `16`, Sabtu `32`, Minggu `64`; kombinasi dijumlahkan secara bitwise.
- Jam pola adalah jam lokal pesantren (`TIME` tanpa zona waktu). Jika jam akhir lebih kecil dari jam mulai, shift dianggap berakhir pada hari kalender berikutnya. Jam mulai dan selesai yang sama ditolak.
- `hris_shift_assignments` menghubungkan pegawai aktif, pola aktif, dan rentang tanggal. Rentang dibatasi maksimal 366 hari dan harus mencakup sedikitnya satu hari yang sesuai dengan pola.
- Pemeriksaan bentrok membandingkan waktu aktual, termasuk perpotongan tengah malam. Batas shift memakai interval setengah terbuka: shift yang berakhir tepat saat shift berikutnya dimulai tidak dianggap tumpang tindih. Waktu istirahat tetap dihitung sebagai bagian rentang penugasan agar pegawai tidak dijadwalkan di dua tempat sekaligus.
- Penonaktifan pola menghentikan penugasan baru tetapi tidak mengubah penugasan lama. Pembatalan mempertahankan record dan mencatat Admin serta waktu pembatalan. Pola dan penugasan tidak dihapus; buat penugasan baru setelah pembatalan bila jadwal perlu dikoreksi.
- Belum termasuk pertukaran shift, persetujuan pegawai, sinkronisasi otomatis ke presensi, payroll, atau analitik jam kerja.

## Keamanan dan API

- Endpoint dibatasi ke profil aktif Admin/SuperAdmin tenant yang memiliki izin HRIS.
- Operasi tulis melalui RPC server dengan transaksi, pemeriksaan tenant/role, dan kunci idempotensi. Pembuatan pola dan penugasan mengunci pegawai/tenant terkait saat pemeriksaan konflik.
- Tabel mengaktifkan dan memaksa RLS. `anon` dan `authenticated` tidak mendapat hak baca/tulis langsung. Service server hanya mendapat `SELECT` pada pola/penugasan; ledger kejadian tetap privat.
- Fungsi `SECURITY DEFINER` mengunci `search_path` dan hanya dapat dipanggil role server. Jangan memberikan secret key server ke browser.

## Gerbang runtime

- Server: `SUPABASE_HRIS_RUNTIME_ENABLED=true` dan `SUPABASE_HRIS_SHIFTS_RUNTIME_ENABLED=true`.
- Browser: `VITE_SUPABASE_HRIS_SHIFTS_RUNTIME_ENABLED=true`.
- Pada Production, semua flag tetap `false` sampai migrasi dan rencana rilis Production disetujui.
- Pada VQE, aktifkan dua flag server (`SUPABASE_HRIS_RUNTIME_ENABLED` dan `SUPABASE_HRIS_SHIFTS_RUNTIME_ENABLED`) serta flag browser hanya untuk UAT. Flag browser saja tidak membuka API.

## Pemeriksaan staging sebelum aktivasi

1. Migrasi VQE sudah diterapkan setelah preflight ledger cocok; tiga tabel diverifikasi kosong, RLS/FORCE RLS aktif, dan akses langsung browser tertutup.
2. CI pada head PR #270 menjalankan replay baseline Production historis, pgTAP `hris_shift_scheduling.test.sql`, rangkaian API-auth/tenant, dan pemeriksaan backup/restore lokal; semua job lulus.
3. UAT UI dengan Admin VQE masih harus memverifikasi pembuatan pola, permintaan idempoten, bentrok normal dan lintas tengah malam, batas shift berurutan, hari yang tidak cocok, penonaktifan, pembatalan, dan pengisian ulang slot setelah pembatalan.
4. Pastikan daftar pegawai dan pola berasal dari data tenant, serta tidak ada data contoh yang ditampilkan sebagai data tersimpan.
5. Setelah UAT staging, tim backend tetap perlu merekonsiliasi ledger dan bukti pemulihan Production sebelum migrasi Production. Jangan mengaktifkan flag pada Production sebelumnya.

