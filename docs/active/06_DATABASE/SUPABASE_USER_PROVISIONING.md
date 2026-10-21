# Provisi Akun Tenant di Supabase

Status: implementasi backend awal pada branch `backend/tenant-user-provisioning`; belum dideploy dan belum dihubungkan ke UI.

## Endpoint

- `POST /functions/v1/provision-tenant-user` memerlukan Supabase user JWT.
- Pemanggil harus memiliki profil `active`, tenant `active`, role `admin` atau `super_admin`, dan akses `users`.
- Tenant selalu diambil dari profil pemanggil. API menolak field tenant dari klien.
- Admin tenant dapat membuat role `ustadz`, `santri`, atau `wali_santri`. Hanya SuperAdmin tenant yang dapat membuat Admin. Endpoint tidak dapat membuat SuperAdmin.
- Modul yang diminta harus dikenal; permission bernilai true oleh Admin tidak boleh melebihi akses Admin tersebut.
- Password sementara 12–128 karakter masuk melalui HTTPS ke Supabase Auth, tidak disimpan pada tabel profil dan tidak ditulis ke log. Supabase Auth mengelola penyimpanan credential. Admin harus menyampaikan password sementara melalui kanal yang aman.
- `profiles.must_change_password` memblokir konteks tenant dan akses modul sampai pengguna mengganti password. Endpoint `change-temporary-password` mengganti password untuk sesi pemilik akun dan menghapus flag tersebut.
- Akun dikonfirmasi saat provisioning. Admin bertanggung jawab memeriksa kepemilikan alamat email sebelum menerbitkan kredensial.

## Batas dan dependensi

- Perubahan skema `must_change_password` dan pembaruan helper RLS berada di migrasi `20260604000000_temporary_password_gate.sql`.
- Kedua Edge Function menggunakan `withSupabase({ auth: "user" })`; konfigurasi `verify_jwt = true` dicatat secara eksplisit.
- Secret key hanya tersedia pada runtime Supabase melalui `ctx.supabaseAdmin`; tidak ada service-role secret di browser atau kode.
- Provisioning Auth dan penulisan profil tidak dapat berada dalam satu transaksi PostgreSQL. Jika penulisan profil gagal, fungsi menghapus user Auth sebagai kompensasi dan mencatat hanya ID/kode error tanpa password atau email.
- Bootstrap tenant dan Admin pertama tetap memerlukan proses operator terkontrol; endpoint ini hanya dapat dipakai Admin yang sudah ada.
- Perubahan ini belum mengubah frontend Firebase, belum memiliki UI provisioning, dan belum dideploy. Jangan gunakan pada pelanggan sebelum integrasi UI, email/password flow, serta uji keamanan lengkap.

## Pengujian sebelum dipakai

Jalankan unit test validator dan Edge Function dengan Supabase CLI lokal. Uji Admin lintas tenant, role escalation, permissions escalation, tenant suspended, JWT invalid, pembuatan akun duplikat, kegagalan insert profil/kompensasi, penggantian password, serta pembatasan RLS saat `must_change_password` aktif.
