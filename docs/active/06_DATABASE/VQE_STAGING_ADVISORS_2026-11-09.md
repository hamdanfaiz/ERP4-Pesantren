# Pemeriksaan advisory Supabase VQE — 9 November 2026

## Cakupan dan hasil

Proyek yang dibaca: VQE staging `vqemuyzveuirlkvdggjd`. Pemeriksaan memakai Supabase Advisors dan hanya membaca advisory; tidak ada migrasi, perubahan konfigurasi, atau akses ke baris data aplikasi.

| Jenis | Temuan | Tingkat | Jumlah |
| --- | --- | --- | ---: |
| Keamanan | RLS aktif tanpa policy | INFO | 162 tabel |
| Keamanan | Perlindungan kata sandi bocor nonaktif | WARN | 1 pengaturan Auth |
| Performa | Foreign key tanpa indeks penutup | INFO | 258 constraint |
| Performa | Indeks belum terpakai | INFO | 80 indeks |
| Kesehatan | Advisory | — | Tidak ada |

Snapshot advisor diamati sekitar `2026-11-08 21:01 UTC`. Kondisi dapat berubah setelah migrasi atau perubahan konfigurasi.

Pembacaan katalog role/table grants setelah advisor hanya menemukan hak tabel efektif `SELECT` untuk role `authenticated` pada 5 relasi. Tidak ada hak tabel efektif untuk `anon` dan tidak ditemukan hak `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, atau `TRIGGER` untuk role `anon` maupun `authenticated` pada relasi `public` yang diperiksa. Lima relasi tersebut semuanya memiliki RLS dan FORCE RLS:

| Tabel | Policy `SELECT` |
| --- | --- |
| `candidate_documents` | Tenant saat ini, Admin tenant, akses modul `ppdb` |
| `candidates` | Tenant saat ini, Admin tenant, akses modul `ppdb` |
| `profiles` | Profil sendiri, atau Admin tenant dengan akses modul `users` |
| `tenants` | Hanya tenant saat ini |
| `user_profiles` | Hanya profil milik `auth.uid()` |

Query ini membaca metadata katalog, bukan isi tabel. Pemeriksaan tidak membaca Storage atau secret server.

### Katalog fungsi istimewa

Pembacaan katalog tambahan mencatat 258 fungsi pada schema `public`, termasuk 93 fungsi `SECURITY DEFINER`. Seluruh 93 fungsi tersebut menetapkan `search_path`; tidak ada satu pun yang efektif dapat dieksekusi oleh role browser `anon` atau `authenticated`; 57 dapat dieksekusi oleh `service_role`.

Ini merupakan pemeriksaan hak eksekusi dan konfigurasi katalog, bukan review isi 93 fungsi. Tim backend tetap perlu meninjau definisi fungsi yang dipanggil route API, validasi `auth.uid()`/tenant/role, serta jalur pemanggilannya. Jumlah 57 fungsi yang tersedia ke `service_role` juga perlu dibatasi pada penggunaan server yang tepercaya.

## Interpretasi untuk arsitektur aplikasi

### RLS aktif tanpa policy

Advisor menandai 162 tabel `public` yang RLS-nya aktif tetapi tidak memiliki policy. Tanpa policy yang mengizinkan akses, role klien yang tunduk pada RLS mendapat akses default-deny. Ini dapat menjadi konfigurasi yang disengaja untuk tabel internal yang hanya diakses melalui API server tepercaya. Temuan INFO ini **bukan bukti kebocoran** dan juga bukan bukti bahwa API server aman.

Tim backend perlu memastikan bahwa:

- Tabel tersebut tidak diberi grant browser yang tidak diperlukan.
- Kunci Supabase secret/service tidak pernah masuk bundle browser.
- Endpoint server memvalidasi sesi, role, tenant, dan izin modul sebelum memakai kredensial istimewa.
- Tidak ada fungsi `SECURITY DEFINER` atau jalur lain yang membuka data melampaui kontrol tenant.

Jangan menambahkan policy seragam ke 162 tabel hanya untuk menghilangkan advisory. Policy harus mengikuti pemilik data dan matriks akses tiap modul.

### Perlindungan kata sandi bocor nonaktif

Advisor memberi WARN karena pemeriksaan kata sandi terhadap daftar kebocoran belum aktif. Dokumentasi Supabase saat ini menyatakan fitur ini tersedia pada paket Pro ke atas ([panduan keamanan kata sandi](https://supabase.com/docs/guides/auth/password-security)). Untuk proyek hosted Free, tim harus memasukkan pilihan paket atau kontrol pengganti yang telah dinilai ke keputusan deployment. Jangan menganggap pemeriksaan front-end atau aturan panjang kata sandi setara dengan pemeriksaan kata sandi bocor.

Belum ada perubahan paket atau pengaturan Auth. Pemilik akun dan tim deployment perlu menentukan pengaturan yang berlaku untuk setiap target pelanggan, termasuk bila target menggunakan Supabase yang dikelola sendiri.

### Foreign key tanpa indeks dan indeks belum terpakai

Temuan 258 foreign key tanpa covering index menunjukkan area yang perlu dievaluasi pada beban representatif, terutama join dan penghapusan/ubah parent pada tabel besar. Temuan 80 indeks belum terpakai dapat muncul karena staging belum menerima beban produksi atau umur statistik masih singkat.

Jangan membuat 258 indeks atau menghapus 80 indeks secara massal. Tim backend sebaiknya:

1. Cocokkan temuan dengan query aktif, jumlah baris, pola filter `tenant_id`, dan constraint relasi.
2. Gunakan `EXPLAIN (ANALYZE, BUFFERS)` pada fixture berskala dan pola beban yang representatif.
3. Tambahkan indeks yang terbukti melayani query penting melalui migrasi bertinjau; periksa biaya tulis, ukuran, dan waktu pembangunan.
4. Ulangi pengukuran setelah simulasi beban sebelum menilai indeks sebagai tidak diperlukan.

## Gate rilis yang dicatat

- Pastikan tidak ada grant langsung ke browser pada tabel internal tanpa policy.
- Audit route/RPC istimewa secara terpisah dari RLS tabel.
- Tetapkan baseline kebijakan kata sandi dan paket/konfigurasi deployment.
- Jalankan uji beban multi-tenant dan prioritaskan indeks dari query yang terbukti lambat.
- Simpan hasil advisors baru pada kandidat rilis setelah migrasi staging terakhir.

Pemeriksaan ini tidak mengakses PTSAS Production, tidak mengubah VQE, dan tidak membuktikan UAT atau kesamaan DDL Production.
