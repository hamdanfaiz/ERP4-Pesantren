# Akses baca-saja Supabase staging — 30 Oktober 2026

## Tujuan

Mencatat prasyarat untuk memeriksa ledger migrasi dan struktur staging sebelum PR cutover Supabase dinyatakan siap digabung. Dokumen ini tidak meminta perubahan database dan tidak memuat kredensial.

## Temuan

- Target staging yang ditetapkan pemilik proyek: `ptsasgdvgrbdtgyqieie`.
- Konektor Supabase pada sesi Codex hanya mengembalikan project `vqemuyzveuirlkvdggjd` pada `list_projects`.
- Permintaan baca `list_migrations` dan `list_tables` ke `ptsasgdvgrbdtgyqieie` ditolak dengan `You do not have permission to perform this action` (`INVALID_ARGUMENT`).
- Belum dapat diverifikasi apakah ledger, tabel, atau skema staging sesuai dengan source migration. Tidak ada operasi tulis, perubahan skema, atau perubahan data yang dijalankan pada project mana pun.

## Tindakan yang diperlukan dari pemilik project / tim backend

Pilih salah satu jalur berikut:

1. Berikan akses baca database untuk akun/konektor Supabase Codex yang ditautkan ke organisasi dan project `ptsasgdvgrbdtgyqieie`. Pastikan target yang diizinkan adalah ref tersebut, bukan `vqemuyzveuirlkvdggjd`. Setelah akses diperbarui, konektor dapat membaca daftar migrasi dan tabel tanpa menerapkan perubahan.
2. Jika akses konektor tidak dapat diberikan, jalankan query baca-saja berikut di SQL Editor project staging dan kirim hasilnya sebagai CSV atau teks. Jangan sertakan API key, access token, atau password.

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

```sql
select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'storage')
  and table_type = 'BASE TABLE'
order by table_schema, table_name;
```

Jika query pertama menyatakan skema atau tabel tidak ditemukan, kirim pesan error persisnya; jangan membuat atau mengubah tabel migration ledger secara manual.

## Langkah setelah akses tersedia

1. Cocokkan daftar versi staging dengan `supabase/migrations` pada head PR #13.
2. Bedakan migration yang sudah diterapkan dari yang hanya ada pada source; jangan menandai migration applied secara manual.
3. Jalankan preflight dan rehearsal pada branch staging/lingkungan yang dapat dipulihkan. Jangan mengubah Production sebagai bagian dari pemeriksaan ini.
4. Simpan hasil pemeriksaan di PR #13 dan ulangi CI pada head final sebelum menandai PR siap digabung.

**Gerbang saat ini:** pemeriksaan ledger staging belum dapat dilakukan karena izin baca project belum tersedia. PR #13 tetap Open/Draft.

## Pemeriksaan koneksi TLS lokal — 30 Oktober 2026

- Uji koneksi menggunakan driver PostgreSQL dengan transaksi `READ ONLY` dan verifikasi sertifikat aktif. Ref project serta hostname pooler lebih dulu dicocokkan dengan target.
- Uji berhenti sebelum query ledger dengan galat `SELF_SIGNED_CERT_IN_CHAIN`, termasuk setelah Node diminta menggunakan CA yang dipercaya Windows. **Tidak ada query ledger yang berhasil, dan tidak ada data atau skema yang diubah.**
- Jangan mematikan validasi sertifikat (`rejectUnauthorized: false` atau `NODE_TLS_REJECT_UNAUTHORIZED=0`). Itu akan menghilangkan pemeriksaan identitas server.
- Jalur yang disarankan: unduh root certificate dari **Database Settings → SSL Configuration** pada project target, lalu gunakan mode `verify-full` agar CA dan hostname diperiksa. Panduan resmi Supabase menjelaskan pengaturan sertifikat ini di [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).
- Alternatif tanpa kredensial lokal: jalankan dua query baca-saja pada bagian “Tindakan yang diperlukan” melalui SQL Editor project target, lalu berikan hanya hasil versi migrasi dan nama tabel. Jangan kirim secret, password, access token, atau data santri.
- Setelah CA/akses baca diperbaiki, ulangi preflight dan rekonsiliasi seluruh versi terhadap file `supabase/migrations`. Sampai bukti ini tersedia, ledger staging tetap belum terverifikasi dan PR #13 harus tetap Draft.
