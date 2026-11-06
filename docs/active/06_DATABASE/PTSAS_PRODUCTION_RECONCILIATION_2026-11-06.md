# Rekonsiliasi Skema PTSAS Production
> **Status terbaru — 6 November 2026, 22.20 WIB.** Tabel perbandingan di bawah adalah snapshot inventaris baca-saja terdahulu, bukan keadaan terkini VQE. Source sekarang berisi 136 file migration; VQE memiliki 135 versi canonical sampai `20270303000000` ditambah satu baris alias `20261106151606` untuk migration `20270304000000_student_room_assignment_reference_locks`. SQL telah diterapkan, tetapi alias ledger belum direkonsiliasi. PR #40 source `c618...` lulus CI #1182 (3/3); CI #1183 pada checkpoint dokumentasi baru masih berjalan. Production PTSAS tidak disentuh. Lihat [checkpoint terbaru](../00_PRODUCT/CHECKPOINT_2026-11-06_RESUME_STAGING.md).


**Status:** belum aman untuk menjalankan `db push` atau memperbaiki ledger.  
**Sumber:** CSV inventaris baca-saja yang dijalankan pada 6 November 2026 pukul 10:38 UTC; PostgreSQL 17.11, database `postgres`, sesi `postgres`. CSV berisi metadata skema, bukan baris operasional.  
**Target migrasi/source:** VQE staging `vqemuyzveuirlkvdggjd`; source saat pemeriksaan berisi 135 migration dan ledger VQE cocok dengan source.

Skrip satu-hasil untuk mengulang inventaris: [PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION_SINGLE_EXPORT.sql](./PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION_SINGLE_EXPORT.sql).

## Ringkasan perbandingan

| Inventaris | PTSAS Production | VQE staging | Selisih |
| --- | ---: | ---: | ---: |
| Versi migration di ledger | 47 | 135 | 88 versi source tidak tercatat di Production |
| Relasi publik | 119 | 167 | 48 relasi staging tidak ada di Production |
| Kolom publik | 1.381 | 1.928 | 547 lebih sedikit di Production |
| Constraint publik | 1.110 | 1.581 | 471 lebih sedikit di Production |
| Indeks publik | 402 | 638 | 236 lebih sedikit di Production |
| Policy RLS publik | 5 | 5 | jumlah sama; definisi masih perlu dibandingkan |
| Fungsi publik | 119 | 257 | 138 lebih sedikit di Production |
| Pemicu publik | 24 | 92 | 68 lebih sedikit di Production |
| Entri ACL publik | 886 | 1.001 | 115 lebih sedikit di Production |
| Bucket Storage | 2 | 4 | 2 bucket staging tidak ada di Production |
| Tipe enum/domain publik | 2 | 2 | jumlah sama |

Seluruh 119 relasi Production ditemukan di staging. Tidak ada relasi Production-only pada perbandingan nama. Namun, **23 tabel yang sama memiliki signature kolom berbeda**; perubahan itu mungkin berasal dari migration yang memang tertinggal, tetapi perlu dicocokkan terhadap DDL satu per satu sebelum penerapan.

Tabel dengan perbedaan signature kolom:

| Tabel | Kolom Production | Kolom VQE |
| --- | ---: | ---: |
| `academic_records` | 15 | 26 |
| `candidates` | 54 | 62 |
| `cbt_exams` | 19 | 23 |
| `cbt_questions` | 20 | 26 |
| `cooperative_products` | 16 | 18 |
| `cooperative_sale_items` | 11 | 12 |
| `cooperative_suppliers` | 12 | 14 |
| `cooperative_wallet_ledger` | 12 | 13 |
| `facility_bookings` | 17 | 19 |
| `finance_bills` | 24 | 30 |
| `finance_expenses` | 15 | 18 |
| `finance_ledger` | 11 | 12 |
| `ga_facilities` | 20 | 22 |
| `ga_inventory_items` | 19 | 23 |
| `healthcare_medicines` | 16 | 20 |
| `hris_employees` | 15 | 22 |
| `library_books` | 14 | 17 |
| `library_circulations` | 13 | 14 |
| `lms_courses` | 18 | 20 |
| `marketplace_products` | 18 | 20 |
| `master_data_records` | 15 | 18 |
| `profiles` | 19 | 20 |
| `students` | 23 | 26 |

## Masalah urutan migration

Versi ledger Production tertinggi adalah `20261206000000`, tetapi dua file source yang lebih lama belum tercatat:

- `20261031104213_master_data_import_create_only`
- `20261031225438_master_data_audit_feed`

Akibatnya, 88 versi source yang belum tercatat terbagi menjadi **2 versi out-of-order sebelum high-water mark** dan **86 versi setelahnya**. Migration preflight menolak kondisi out-of-order, mismatch nama, atau payload SQL yang hilang. Production juga memiliki dua baris ledger tanpa `name` dan tanpa payload `statements`: `20261205000000` dan `20261206000000`.

Inventaris Production menguatkan bahwa dua migration awal itu bukan sekadar entri ledger yang tertinggal:

- Tabel `public.master_data_audit_events` dan empat trigger audit terkait belum ada di Production; tabelnya ada di VQE. Migration `20261031225438_master_data_audit_feed` membuatnya.
- RPC `public.create_master_data_structure_if_absent` belum terlihat di Production; migration `20261031104213_master_data_import_create_only` membuatnya.

Jangan menambahkan baris ledger secara manual untuk membuat angka versi cocok. Itu akan menutupi DDL yang memang belum ada.

## CI dan batas bukti

Workflow CI terbaru untuk PR #40 (run #1167) lulus pada ketiga job: build/guard Firebase, instalasi NPM, serta migration/API Auth/pgTAP. Namun workflow melakukan:

```text
supabase db reset --local --version 20261206000000 --no-seed
```

Reset dari source tersebut **menerapkan kedua migration `20261031...`** sebelum melanjutkan. Jadi run itu menguji source yang lengkap sampai versi `20261206`, bukan keadaan Production yang kehilangan dua migration itu dan memiliki dua payload ledger kosong. Run tersebut memberi bukti kuat untuk rangkaian 86 migration sesudah batas itu pada baseline source, tetapi belum membuktikan jalur `include-all` dari ledger Production yang sebenarnya.

Perbaikan workflow diterapkan pada PR #40 commit `6b853c421c04ef8189f778a7b3cadb87910f5d3b`. GitHub Actions run [#1168](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42213196954) lulus 3/3 job. Pada database Supabase lokal yang terisolasi, workflow membentuk ulang ledger 47 versi, mengosongkan metadata dua baris yang sama, menghapus efek dua migration 20261031 yang memang tidak ada di Production, lalu menjalankan `supabase migration up --local --include-all`. Assertion pascareplay mengonfirmasi dua migration out-of-order tercatat kembali, tabel audit/RPC/pemicu terbentuk, semua 135 versi source diterapkan tepat, dan hanya dua metadata gap yang disimulasikan tetap kosong. Ini membuktikan rantai source dapat direplay dari baseline ledger Production tiruan; bukan bukti bahwa skema atau isi data Production telah berubah.

Konektor Supabase menolak pembacaan langsung PTSAS, sehingga isi fungsi, definisi lengkap policy, dan keadaan live selain metadata pada CSV belum diverifikasi lewat konektor.

## Temuan keamanan dan integritas Production

- Semua 119 relasi publik mengaktifkan **RLS dan FORCE RLS**.
- Tidak ada grant `anon` atau `PUBLIC`; `authenticated` hanya memiliki lima grant `SELECT`. Grant operasional yang terlihat diberikan kepada `service_role`.
- Ada 42 fungsi `SECURITY DEFINER`. Tidak ada yang dapat dieksekusi `anon`; empat helper yang dapat dieksekusi `authenticated` semuanya menetapkan `search_path=pg_catalog, public`. Isi fungsi Production belum tersedia dalam inventaris, jadi pemeriksaan otorisasi internalnya masih perlu dibandingkan dengan source.
- `public.tenants` adalah satu-satunya tabel yang tidak memiliki `tenant_id`, sesuai perannya sebagai registri tenant global; tabel itu tetap memakai RLS/FORCE RLS.
- Tidak ada constraint tidak tervalidasi, indeks tidak valid/tidak siap, atau trigger nonaktif dalam snapshot.
- Kedua bucket yang terlihat (`erp4-private-finance-proofs` dan `ppdb-documents`) berstatus privat. Source juga mengharapkan `erp4-private-library-assets` dan `erp4-private-document-attachments`.

## Langkah yang masih diperlukan sebelum Production

1. Rehearsal migration pada salinan database dengan **ledger 47 baris persis seperti CSV**, termasuk dua versi out-of-order dan dua payload kosong. Uji metode penerapan yang akan dipakai tim, termasuk bagaimana dua migration lama dijalankan setelah migration yang lebih baru.
2. Bandingkan DDL aktual untuk 23 tabel berbeda dengan setiap migration terkait; verifikasi objek dari dua migration 20261031 dan seluruh perubahan berurutan, bukan hanya jumlah tabel.
3. Jalankan preflight terhadap ledger aktual setelah strategi repair/`include-all` ditetapkan. Simpan hasil sebelum/sesudah dan catat checksum sumber.
4. Ambil serta verifikasi backup Production yang dapat dipulihkan sebelum window migrasi. Migrasikan dahulu di target non-production yang mereproduksi keadaan Production.
5. Setelah rehearsal lulus, lakukan persetujuan operasional dan deploy bertahap. Jangan menerapkan SQL atau mengubah ledger Production berdasarkan CSV saja.

## Catatan staging

Advisor VQE mencatat 258 foreign key tanpa indeks penutup dan 95 indeks belum terpakai. Karena staging berisi sedikit data, temuan indeks harus diprioritaskan berdasarkan query nyata dan diuji pada beban realistis; jangan menghapus indeks hanya karena belum terpakai di staging. Advisor juga menandai perlindungan kata sandi bocor Auth nonaktif. Organisasi VQE saat ini menggunakan Free plan; Supabase mendokumentasikan fitur itu sebagai tersedia pada Pro dan lebih tinggi: [Password security](https://supabase.com/docs/guides/auth/password-security).

**Kesimpulan:** code dan CI memiliki bukti yang baik, tetapi Production belum berada pada baseline migration yang diuji CI. Rekonsiliasi ini menemukan perbedaan skema nyata; migrasi Production belum siap dijalankan.

## Handoff terbaru dan akses tim

- Tim backend saat ini dapat melihat PTSAS Production `ptsasgdvgrbdtgyqieie`, tetapi belum dapat melihat VQE staging `vqemuyzveuirlkvdggjd`. Karena itu, bukti live staging untuk tim harus disertakan sebagai laporan/CI yang dapat dibaca di GitHub; jangan memasukkan kredensial atau baris data ke dokumen.
- CSV inventaris lengkap yang diberikan pemilik pada 6 November 2026 pukul 17:38 WIB berhasil diekspor: 4.098 baris metadata, termasuk 47 entri ledger, 119 relasi, 1.381 kolom, 1.110 constraint, 402 indeks, 5 policy, 119 fungsi, 24 trigger, 886 entri ACL, dan 2 bucket. CSV tidak berisi baris operasional.
- GitHub Actions run #1167 lulus 3/3 pada head PR #40 sebelumnya. Run #1168 lulus 3/3 pada commit `6b853c421c04ef8189f778a7b3cadb87910f5d3b`, termasuk rehearsal baseline Production tiruan yang dijelaskan di atas.
- Instruksi pemilik tetap: setelah seluruh pemeriksaan staging yang disepakati lulus, lanjutkan ke Production tanpa menunggu pengingat baru. VQE live migration sudah 135/135 dan rehearsal migration baseline kini lulus; UAT operasional/UI serta pemeriksaan sebelum penerapan Production masih perlu dituntaskan.
- Production tetap tidak berubah. Sesudah rehearsal CI dan UAT tersisa lulus, lakukan preflight/dry-run terhadap koneksi Production yang benar dan backup yang dapat dipulihkan; lalu jalankan migrasi ke Production sesuai instruksi pemilik dan simpan hasil verifikasi sebelum/sesudah untuk tim backend.
