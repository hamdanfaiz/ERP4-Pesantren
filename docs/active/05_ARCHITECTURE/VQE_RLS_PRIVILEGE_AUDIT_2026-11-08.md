# Audit Katalog Akses Supabase Staging VQE

Tanggal pemeriksaan: 8 November 2026, 05:10 UTC  
Target: project staging `vqemuyzveuirlkvdggjd`  
Metode: kueri metadata PostgreSQL baca-saja melalui Supabase MCP. Tidak membaca baris data aplikasi dan tidak menjalankan perubahan.

## Hasil katalog

| Pemeriksaan | Hasil |
|---|---:|
| Tabel pada schema `public` | 167 |
| Tabel dengan RLS aktif | 167/167 |
| Tabel dengan `FORCE ROW LEVEL SECURITY` | 167/167 |
| Tabel tanpa policy | 162 |
| Policy yang ditemukan | 5 |
| View/materialized view pada `public` | 0 |
| Fungsi schema `public` yang dapat dipanggil `anon` atau `authenticated` | 0 |

Tidak ada grant tabel untuk `anon` atau `PUBLIC`. `authenticated` hanya memiliki grant `SELECT` pada lima tabel berikut; tidak ditemukan grant `INSERT`, `UPDATE`, atau `DELETE`:

| Tabel | Batas policy yang terlihat |
|---|---|
| `candidate_documents` | Tenant aktif, Admin, dan akses modul PPDB |
| `candidates` | Tenant aktif, Admin, dan akses modul PPDB |
| `profiles` | Profil sendiri, atau Admin tenant dengan akses modul pengguna |
| `tenants` | Hanya tenant pengguna saat ini |
| `user_profiles` | Hanya profil milik pengguna saat ini |

## Interpretasi

- 162 tabel tanpa policy tidak otomatis menunjukkan celah pada akses Data API: hasil katalog menunjukkan tabel-tabel tersebut tidak diberi grant baca/tulis langsung kepada `anon` atau `authenticated`. Dengan RLS dan FORCE RLS aktif, akses langsung tetap tertutup.
- Jalur operasional modul lain bergantung pada API server dengan kredensial backend berhak tinggi. Karena itu, autentikasi, role, izin modul, tenant, validasi payload, dan pembatasan Storage pada setiap route harus tetap diuji. Tes API/tenant di CI dan tes staging yang dicatat pada matriks cakupan memberi bukti untuk alur terpilih, bukan seluruh variasi UI.
- Lima policy yang ada hanya memberikan pembacaan terbatas; audit katalog ini tidak membuktikan seluruh logika tenant policy maupun seluruh endpoint aplikasi secara menyeluruh.

## Storage pada VQE staging

| Tabel | RLS | FORCE RLS | Policy | Grant `anon` / `authenticated` |
|---|---|---|---:|---|
| `storage.buckets` | aktif | tidak | 0 | SELECT, INSERT, UPDATE, DELETE |
| `storage.objects` | aktif | tidak | 0 | SELECT, INSERT, UPDATE, DELETE |

Tidak ditemukan grant role `PUBLIC` pada dua tabel tersebut. Karena role `anon` dan `authenticated` bukan pemilik tabel dan tidak memiliki policy yang mengizinkan operasi, akses langsungnya tetap ditolak oleh RLS. Ini fail-closed, tetapi menegaskan bahwa alur file harus melalui API tepercaya atau URL bertanda tangan yang telah divalidasi oleh backend.

Empat bucket yang terlihat semuanya privat:

| Bucket | Batas ukuran | MIME yang diizinkan |
|---|---:|---|
| `erp4-private-document-attachments` | 25 MiB | PDF |
| `erp4-private-finance-proofs` | 3 MiB | PNG, JPEG, PDF |
| `erp4-private-library-assets` | 25 MiB | PDF, EPUB, MP3, MP4 |
| `ppdb-documents` | 2 MiB | PDF, JPEG, PNG |

Alur upload/unduh bertanda tangan telah lulus pada suite API staging untuk Finance/PPDB dan Perpustakaan. Hasil itu hanya membuktikan jalur yang diuji, bukan operasi Storage langsung dari browser atau seluruh alur lampiran Dokumen Digital.

## Batas audit

1. Hasil ini hanya berlaku untuk VQE staging pada saat pemeriksaan. Ini bukan bukti bahwa PTSAS Production memiliki katalog, grant, atau policy yang sama.
2. Tidak ada query baris data aplikasi, perubahan schema, perubahan policy, atau penulisan ke database.
3. Audit ini hanya mencatat katalog policy/grant dan metadata bucket Storage di VQE; tidak memeriksa secret, URL bertanda tangan per route, atau keberhasilan UI end-to-end.
4. Ketersediaan tabel dan RLS bukan pengganti UAT lintas role maupun pemeriksaan aturan bisnis pada tiap modul.

## Tindak lanjut

- Tim backend memeriksa ulang grant, policy, trigger, fungsi, dan DDL pada Production melalui jalur baca-saja yang mereka miliki; tidak menyalin hasil staging sebagai bukti Production.
- Uji role/tenant lintas modul dan Storage tetap dijalankan pada staging dengan akun sintetis.
- Jika audit Production menemukan perbedaan, rekonsiliasi perubahan melalui migration source dan prosedur review, bukan mengubah database tanpa migration.

Audit ini mendukung pemeriksaan keamanan staging. Produk belum dinyatakan siap go-live hanya berdasarkan hasil katalog ini.