# Prasyarat Production untuk Leaderboard Tahfidz

Tanggal pemeriksaan: 21 November 2026. Dokumen ini memberi tim backend inventaris **baca-saja** untuk menilai prasyarat leaderboard PR #182. Dokumen ini bukan persetujuan penerapan migrasi dan tidak memuat operasi tulis.

## Bukti baca-saja PTSAS Production

Project `ptsasgdvgrbdtgyqieie` saat diperiksa memiliki:

- ledger terbaru `20270316000000`; tidak ada versi ledger sejak `20270317000000`;
- `public.quran_surahs` belum ada;
- kolom `public.tahfidz_records.surah_number` belum ada;
- RPC `public.list_tahfidz_leaderboard(uuid,uuid,text,date,integer)` belum ada.

PR #182 memerlukan `quran_surahs` dan `surah_number` untuk membentuk proyeksi ayat, lalu membuat RPC leaderboard. Karena itu dua migrasi PR #182 **tidak dapat diterapkan langsung** pada keadaan Production saat ini. Source utama memiliki 163 file migrasi, sedangkan Production memiliki 100 versi ledger; selisih ledger bukan bukti bahwa setiap DDL source belum ada dan bukan instruksi menjalankan semua migrasi.

## Tahap A — inventaris aman

Jalankan di SQL Editor PTSAS. Semua pernyataan pada bagian ini hanya membaca katalog dan ledger.

```sql
select
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
  (select count(*) from supabase_migrations.schema_migrations) as ledger_entries,
  to_regclass('public.quran_surahs')::text as quran_catalog,
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'tahfidz_records'
     and column_name = 'surah_number') as surah_number_column_count,
  to_regprocedure(
    'public.list_tahfidz_leaderboard(uuid,uuid,text,date,integer)'
  )::text as leaderboard_rpc;
```

Jika katalog, kolom, atau fungsi belum tersedia, **berhenti** sebelum menguji migrasi leaderboard. Jangan membuat objek lewat SQL manual dan jangan menandai versi sebagai sudah diterapkan.

## Tahap B — audit data di rehearsal

Migrasi source `20270320000000_tahfidz_quran_surah_catalog.sql` membuat katalog 114 Surah, menambahkan `surah_number`, lalu mencocokkan nama lama dengan katalog memakai `lower(btrim(surah_name)) = lower(name_latin)`. Jalankan audit berikut hanya pada salinan/rehearsal setelah migrasi itu selesai dan sukses:

```sql
select
  count(*) filter (where r.activity_type = 'Ziyadah') as ziyadah_records,
  count(*) filter (
    where r.activity_type = 'Ziyadah'
      and r.surah_number is null
  ) as unmapped_surah_records,
  count(*) filter (
    where r.activity_type = 'Ziyadah'
      and (
        q.surah_number is null
        or r.ayah_start < 1
        or r.ayah_end < r.ayah_start
        or r.ayah_end > q.ayah_count
      )
  ) as invalid_surah_or_ayah_ranges
from public.tahfidz_records as r
left join public.quran_surahs as q
  on q.surah_number = r.surah_number;
```

Migrasi `20270403000000_tahfidz_unique_memorization_leaderboard.sql` menghentikan backfill jika ada setoran Ziyadah yang tidak memiliki relasi Surah dan rentang ayat valid. Jika salah satu angka audit bermasalah bukan nol, telusuri variasi nama/rentang melalui prosedur rekonsiliasi yang disetujui; jangan mengubah setoran lama otomatis hanya untuk melewati migrasi.

## Tahap C — urutan dan bukti rilis

1. Cocokkan seluruh 63 versi source yang belum tercatat dengan DDL Production aktual; jelaskan tiga baris Production tanpa nama sebelum menyusun urutan. Jangan melompati versi berdasarkan hitungan ledger saja.
2. Rehearsalkan rangkaian migrasi pada salinan dengan DDL yang telah diverifikasi, termasuk `20270320000000` dan dependensi lain yang ditemukan. Pastikan audit Tahap B lulus sebelum menjalankan migrasi leaderboard.
3. Terapkan `20270403000000` dan `20270404000000` hanya jika dependensinya cocok dengan source dan rehearsal lulus; simpan backup yang dapat dipulihkan sebelum tindakan Production.
4. Setelah rilis, verifikasi definisi RPC, tabel proyeksi, RLS + FORCE RLS, grant, dan pemanggilan endpoint dengan role/tenant yang disetujui. Jangan membaca atau mengekspor isi data santri ke laporan.

Tidak ada migrasi, perubahan ledger, baris data, atau Storage Production yang diubah dalam pemeriksaan ini.
