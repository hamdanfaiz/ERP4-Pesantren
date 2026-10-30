# Akses baca-saja Supabase target — 30 Oktober 2026

## Pembaruan setelah PR #13 merged — 30 Oktober 2026

- Source cutover PR #13 kini sudah merged ke `main` pada commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`; catatan PR Open/Draft di bawah adalah riwayat sebelum merge.
- Pemeriksaan konektor Supabase terbaru hanya mencantumkan project `vqemuyzveuirlkvdggjd`. Target `ptsasgdvgrbdtgyqieie` tidak muncul; pemanggilan `get_project`, `list_migrations`, `list_tables`, dan security/performance advisors ke ref itu menghasilkan `INVALID_ARGUMENT`. Query SQL read-only via konektor dan uji koneksi driver lokal tidak berhasil; ringkasan ledger kemudian berhasil dibaca melalui SQL Editor dashboard. Tidak ada operasi tulis.
- SQL Editor dashboard pada 30 Oktober menampilkan project `ERP4-Pesantren`, ref `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`. Ini bertentangan dengan jawaban sebelumnya yang menyebut staging; perlakukan target sebagai Production hingga tim backend mengonfirmasi staging terpisah.
- Konektor Supabase Codex masih tidak dapat membaca target, tetapi daftar ledger berhasil dibaca read-only melalui SQL Editor: 47 versi, seluruh prefix ditemukan di source. Ada 62 versi source yang tidak tercatat; metadata `name` dan `statements` untuk versi `20261205000000` dan `20261206000000` kosong. Source/target parity SQL belum terbukti; jangan jalankan 62 versi itu ke Production.
- Perkiraan penyelesaian fitur tetap sekitar **73%**. Tidak ada migration live yang diterapkan.

## Tujuan

Mencatat prasyarat untuk memeriksa ledger migrasi dan struktur target sebelum rilis. PR cutover Supabase sudah merged; pemeriksaan database, rehearsal, deployment, dan UAT tetap merupakan gerbang terpisah. Dokumen ini tidak meminta perubahan database dan tidak memuat kredensial.

## Temuan

- Ref Supabase target yang ditetapkan pemilik proyek: `ptsasgdvgrbdtgyqieie`. Dashboard saat ini menandainya `main / PRODUCTION`; meskipun sebelumnya disebut staging, gunakan sebagai Production sampai staging terpisah dikonfirmasi.
- Konektor Supabase pada sesi Codex hanya mengembalikan project `vqemuyzveuirlkvdggjd` pada `list_projects`.
- Permintaan baca `list_migrations` dan `list_tables` ke `ptsasgdvgrbdtgyqieie` ditolak dengan `You do not have permission to perform this action` (`INVALID_ARGUMENT`).
- Ringkasan ledger sudah terbaca melalui SQL Editor, tetapi kesetaraan SQL, katalog tabel, dan skema target belum diverifikasi terhadap source. Tidak ada operasi tulis, perubahan skema, atau perubahan data yang dijalankan pada project mana pun.

## Tindakan yang diperlukan dari pemilik project / tim backend

Pilih salah satu jalur berikut:

1. Berikan akses baca database untuk akun/konektor Supabase Codex yang ditautkan ke organisasi dan project `ptsasgdvgrbdtgyqieie`. Pastikan target yang diizinkan adalah ref tersebut, bukan `vqemuyzveuirlkvdggjd`. Setelah akses diperbarui, konektor dapat membaca daftar migrasi dan tabel tanpa menerapkan perubahan.
2. Jika akses konektor tidak dapat diberikan, jalankan query baca-saja berikut di SQL Editor project target dan kirim hasilnya sebagai CSV atau teks. Jangan sertakan API key, access token, atau password.

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

1. Cocokkan daftar versi target dengan `supabase/migrations` pada commit `main` yang akan dirilis.
2. Bedakan migration yang sudah diterapkan dari yang hanya ada pada source; jangan menandai migration applied secara manual.
3. Jalankan preflight dan rehearsal pada branch staging/lingkungan terisolasi yang dapat dipulihkan. Jangan mengubah Production sebagai bagian dari pemeriksaan ini.
4. Simpan hasil pemeriksaan pada checkpoint migrasi dan jalankan rehearsal serta CI terhadap commit `main` yang akan dirilis. PR #13 sudah merged; gerbang database tetap terbuka terpisah dari status merge source.

**Gerbang saat ini:** konektor Codex tetap tidak memiliki akses ke target. Dashboard memberi bukti ringkasan ledger terbatas dan menandai target Production; tim backend perlu merekonsiliasi metadata/statement serta menyediakan staging terisolasi yang dapat dipulihkan sebelum rehearsal.

## Pemeriksaan koneksi TLS lokal — 30 Oktober 2026

- Uji koneksi menggunakan driver PostgreSQL dengan transaksi `READ ONLY` dan verifikasi sertifikat aktif. Ref project serta hostname pooler lebih dulu dicocokkan dengan target.
- Uji koneksi driver berhenti sebelum query ledger dengan galat `SELF_SIGNED_CERT_IN_CHAIN`, termasuk setelah Node diminta menggunakan CA yang dipercaya Windows. Setelah itu, ringkasan ledger berhasil dibaca melalui SQL Editor dashboard dengan query read-only; tidak ada data operasional atau skema yang diubah.
- Jangan mematikan validasi sertifikat (`rejectUnauthorized: false` atau `NODE_TLS_REJECT_UNAUTHORIZED=0`). Itu akan menghilangkan pemeriksaan identitas server.
- Jalur yang disarankan: unduh root certificate dari **Database Settings → SSL Configuration** pada project target, lalu gunakan mode `verify-full` agar CA dan hostname diperiksa. Panduan resmi Supabase menjelaskan pengaturan sertifikat ini di [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).
- Alternatif tanpa kredensial lokal: jalankan dua query baca-saja pada bagian “Tindakan yang diperlukan” melalui SQL Editor project target, lalu berikan hanya hasil versi migrasi dan nama tabel. Jangan kirim secret, password, access token, atau data santri.
- Setelah CA/akses baca diperbaiki, ulangi preflight dan rekonsiliasi seluruh versi terhadap file `supabase/migrations`. Ringkasan versi sudah dibaca melalui dashboard, tetapi kesetaraan statement dan provenance dua baris tanpa metadata tetap belum terverifikasi. PR #13 sudah merged; gerbang migrasi tetap terbuka.
