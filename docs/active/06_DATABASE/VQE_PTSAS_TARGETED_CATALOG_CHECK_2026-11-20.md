# Pemeriksaan katalog terarah VQE dan PTSAS — 20 November 2026

## Tujuan dan batas

Pemeriksaan baca-saja ini membandingkan sejumlah objek katalog yang dipilih dengan source migration `20270330000000_add_core_composite_fk_indexes.sql` dan objek Tahfidz yang ada di VQE. Pemeriksaan ini tidak membaca baris operasional, tidak mengubah database, dan bukan perbandingan DDL menyeluruh.

## Indeks komposit inti

Source menetapkan 13 nama indeks berikut:

- Akademik (7): `academic_records_tenant_assessment_type_reference_fk_idx`, `academic_records_tenant_class_reference_fk_idx`, `academic_records_tenant_curriculum_reference_fk_idx`, `academic_records_tenant_facility_reference_fk_idx`, `academic_records_tenant_created_by_fk_idx`, `academic_records_tenant_updated_by_fk_idx`, `academic_records_tenant_subject_reference_fk_idx`.
- Kehadiran asrama (3): `boarding_attendance_records_tenant_marked_by_fk_idx`, `boarding_attendance_records_tenant_room_fk_idx`, `boarding_attendance_records_tenant_student_fk_idx`.
- Santri (3): `students_tenant_building_fk_idx`, `students_tenant_class_fk_idx`, `students_tenant_room_fk_idx`.

Pemeriksaan katalog schema `public` memberikan hasil:

| Lingkungan | Nama persis ada | Valid dan siap |
| --- | ---: | ---: |
| VQE staging (`vqemuyzveuirlkvdggjd`) | 13/13 | 13/13 |
| PTSAS Production (`ptsasgdvgrbdtgyqieie`) | 0/13 | Tidak berlaku; nama persis tidak ditemukan |

Pemeriksaan definisi indeks lanjutan mencocokkan awalan kolom B-tree valid/ready yang tidak parsial untuk setiap urutan key foreign key. Hasilnya: VQE memiliki 13/13 indeks pendukung; PTSAS tidak memiliki nama indeks source maupun indeks B-tree tak bersyarat yang mendukung salah satu dari 13 urutan key tersebut. Pemeriksaan katalog foreign key terpisah menemukan seluruh 13 constraint target ada dan tervalidasi di kedua project. Jadi bukti menunjukkan kesenjangan indeks pendukung pada constraint yang sudah ada di Production—bukan ketiadaan atau invaliditas foreign key. Ini hanya cakupan 13 constraint target, bukan audit semua indeks Production.

Statistik katalog saat pemeriksaan PTSAS memperkirakan `academic_records` 13 baris / 272 kB, `boarding_attendance_records` 16 baris / 88 kB, dan `students` 51 baris / 368 kB. `n_live_tup` adalah estimasi statistik, bukan hitungan record yang presisi; ukuran mencakup heap dan indeks. Source memakai `CREATE INDEX` biasa, yang dapat menghambat penulisan. Tim backend perlu meninjau jadwal/lock dan mengukur ulang sebelum menerapkan indeks.

## Objek Tahfidz yang diperiksa

| Objek | VQE staging | PTSAS Production |
| --- | --- | --- |
| `public.quran_surahs` | Ada | Tidak ditemukan |
| `public.validate_tahfidz_quran_reference()` | Ada | Tidak ditemukan |
| `public.list_tahfidz_leaderboard` | Ada | Tidak ditemukan |
| `public.record_tahfidz_daily_targets_bulk` | Ada | Tidak ditemukan |

Ini adalah pemeriksaan keberadaan nama objek terpilih, bukan perbandingan isi fungsi, signature lengkap, grant, policy, atau hasil alur aplikasi. Ledger Production mencatat 100 versi dari 163 migration source; 63 versi source belum tercatat. Objek yang tidak ditemukan perlu dipetakan ke urutan migration dan ledger, bukan langsung diterapkan atau ditandai selesai.

## Tindak lanjut aman

1. Tim backend membandingkan definisi indeks Production berdasarkan tabel, urutan kolom, kondisi/predicate, metode, dan validitas—bukan hanya nama.
2. Bandingkan DDL lengkap untuk katalog Surah dan fungsi Tahfidz terhadap source, termasuk signature, body, `SECURITY INVOKER/DEFINER`, `search_path`, owner, serta hak `EXECUTE`.
3. Rekonsiliasi objek dan ledger per migration. Jangan menjalankan repair ledger untuk menutupi objek yang belum cocok.
4. Rehearsal seluruh urutan pada salinan yang dapat dipulihkan, lalu lakukan backup dan bukti restore sebelum perubahan Production.
5. Tidak ada perubahan Production yang dilakukan dalam pemeriksaan ini.

Hostname pooler tidak diperlukan untuk pemeriksaan MCP baca-saja ini. Jika validasi koneksi PostgreSQL langsung melalui CLI diperlukan, salin URI/hostname persis dari dialog **Connect** proyek target; jangan menebak nomor cluster.
