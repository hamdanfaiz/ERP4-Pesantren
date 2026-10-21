# Supabase untuk login dan RBAC

Catatan ini menjelaskan perubahan yang sudah diterapkan pada repo ERP4-Pesantren. Aturan peran, tampilan, proses pembuatan akun, dan data operasional Firestore tidak diubah.

## Kredensial tidak ikut Git

File `.env` di root repo berisi URL project, publishable key, secret key, dan password database. File itu diabaikan `.gitignore` lewat pola `.env*`. Jangan menghapus pola itu dan jangan menyalin isi `.env` ke file yang di-commit.

Partner yang menarik repo ini tidak otomatis menerima kunci tersebut. Salin file `.env` lewat saluran pribadi, lalu letakkan di root repo dengan nama yang sama. Nama variabel yang diperlukan ada di `.env.example`.

Project Supabase yang dipakai:

- Ref: `ptsasgdvgrbdtgyqieie`
- URL: `https://ptsasgdvgrbdtgyqieie.supabase.co`

Host database langsung (`db.ptsasgdvgrbdtgyqieie.supabase.co`) hanya punya alamat IPv6. Dari jaringan IPv4, pakai pooler yang tercatat di `.env` sebagai `SUPABASE_DB_POOLER_URL` (region `aws-0-ap-southeast-2`).

`SUPABASE_SECRET_KEY` dan `SUPABASE_DB_PASSWORD` hanya untuk server. Jangan memberi awalan `VITE_` pada secret key.

Konektor Supabase di Cursor bisa tertaut ke project lain. Sebelum query, cocokkan URL-nya dengan URL di atas. Jika berbeda, baca kredensial dari `.env` project ini.

## Yang sudah dipindah

Login, sesi, peran, dan setup akun memakai Supabase. Data modul operasional tetap di Firestore.

- Paket `@supabase/supabase-js` ditambahkan.
- Tabel `public.user_profiles` sudah dibuat di project Supabase lewat `supabase/migrations/20261022000000_user_profiles.sql`.
- Row Level Security aktif. Pengguna yang sudah masuk hanya boleh membaca profilnya sendiri. Pembuatan dan perubahan akun tetap lewat server dengan secret key.
- Tabel profil saat ini masih kosong. Belum ada akun yang bisa masuk sampai administrator membuat akun pertama.

Peran yang dipakai login tetap: `SuperAdmin`, `Admin`, `Ustadz`, `Santri`, `Walisantri`, dan `Public` untuk pengunjung. Batas modul di `src/rbac.ts` tidak diubah.

Alur akun tetap sama:

1. Halaman masuk meminta email dan kata sandi.
2. Sesi diterima hanya jika profil aktif, perannya valid, dan punya `tenantId`.
3. Administrator membuat akun lewat modul pengguna, dengan kata sandi sementara minimal 12 karakter.
4. Pengguna baru wajib mengganti kata sandi sebelum memakai sistem.
5. Admin tidak dapat mengangkat Admin atau SuperAdmin, dan tidak dapat membuka modul pengaturan platform.

## File yang berubah

| File | Peran |
|---|---|
| `src/utils/supabase.ts` | Klien Supabase di browser. Sesi disimpan di `sessionStorage`. |
| `src/authSession.ts` | Identitas sesi untuk modul yang masih menyimpan data ke Firestore. |
| `src/contexts/AuthContext.tsx` | Login, logout, dan pemuatan profil dari `user_profiles`. |
| `src/components/ForcePasswordChangeModal.tsx` | Ganti kata sandi lewat Supabase Auth. |
| `src/server/identityStore.ts` | Verifikasi token dan penulisan profil di server. |
| `server.ts` | Endpoint pengguna, bukti bayar, dan pemeriksaan admin membaca profil Supabase. |
| `src/pages/UserManagementView.tsx` | Token sesi Supabase untuk API pengguna. |
| `src/pages/FinanceManager.tsx` | Token sesi Supabase untuk bukti pembayaran. |
| `src/firebaseUtils.ts` | Penulisan data tenant tetap ke Firestore, dengan uid dari sesi Supabase. |
| `src/services/systemSettingsService.ts` | Pembersihan pengaturan tetap memakai token sesi yang baru. |
| `src/services/ppdbIntegrationService.ts` | Pencatat pembayaran memakai uid sesi yang baru. |
| `src/components/Header.tsx` | Log pencarian memakai uid sesi yang baru. |

`.cursor/rules/supabase-project.mdc` mengingatkan agent agar membaca `.env` dan tidak memakai project Supabase yang lain. Aturan itu tidak berisi nilai kunci.

## Yang sengaja belum dipindah

Modul PPDB, keuangan, akademik, asrama, LMS, master data, donasi, marketplace, pengaturan tenant, dan berkas Firebase Storage masih membaca serta menulis Firestore. Data itu tidak disalin dan tidak dihapus.

Firebase Authentication tidak lagi dipakai untuk masuk ke aplikasi. Dokumen pengguna yang mungkin masih ada di Firestore tidak dihapus, tetapi login baru tidak membaca koleksi itu.

## Menjalankan setelah pull

1. Letakkan `.env` di root repo.
2. Pasang dependensi dengan `npm install`.
3. Jalankan ulang server. Server yang sudah menyala sebelum perubahan ini masih memakai alur login yang lama sampai dimulai kembali.
