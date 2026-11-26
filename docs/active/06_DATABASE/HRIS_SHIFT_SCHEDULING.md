# Jadwal Shift HRIS

Status implementasi: source dan migrasi tersedia di branch fitur, belum diterapkan ke staging atau Production. Runtime tetap nonaktif sampai migrasi dan pemeriksaan staging selesai.

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
- Semua nilai tetap `false` sampai migrasi `20270407000000_hris_shift_scheduling.sql` diterapkan dan uji staging lulus. Flag browser saja tidak membuka API.

## Pemeriksaan staging sebelum aktivasi

1. Terapkan migrasi hanya ke VQE setelah migration preflight memastikan urutan ledger cocok.
2. Jalankan pgTAP `hris_shift_scheduling.test.sql` dan rangkaian API-auth/tenant.
3. Verifikasi pembuatan pola, pengulangan permintaan idempoten, bentrok normal dan lintas tengah malam, batas shift yang berurutan, hari yang tidak cocok, penonaktifan, pembatalan, serta pengisian ulang slot setelah pembatalan.
4. Lakukan UI UAT dengan akun Admin VQE. Pastikan daftar pegawai/pola berasal dari data tenant dan tidak ada contoh lokal.
5. Baru setelah staging dan rekonsiliasi migrasi Production selesai, rencanakan rilis Production. Jangan mengaktifkan flag pada Production sebelumnya.
