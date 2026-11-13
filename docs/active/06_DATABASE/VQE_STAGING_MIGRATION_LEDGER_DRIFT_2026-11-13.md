# Snapshot rekonsiliasi ledger migrasi VQE — 13 November 2026

## Ringkasan

Pemeriksaan baca-saja menemukan perbedaan antara ledger migrasi Supabase staging VQE dan direktori migrasi pada `main`.

- Project staging: `vqemuyzveuirlkvdggjd`
- Project Production PTSAS: `ptsasgdvgrbdtgyqieie` — tidak diperiksa atau diubah pada audit ini.
- Commit `main` saat snapshot: `ebea706ef4ac4724fa9c0e2a5a580f949d941228`
- Migrasi VQE: **150 versi**
- File migrasi pada `main`: **148**
- Versi di ledger VQE tanpa file bernomor sama di `main`: **7**
- File migrasi `main` yang belum tercatat di VQE: **5**

GitHub Actions run [43373324073](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43373324073) lulus untuk build frontend, instalasi NPM, migrasi lokal, API/Auth/tenant, Storage, dan backup/restore. Namun check dari Supabase GitHub App pada commit yang sama gagal dengan pesan: `Remote migration versions not found in local migrations directory.` Ini adalah kegagalan rekonsiliasi sumber migrasi pada VQE, bukan bukti bahwa migrasi Production sudah cocok.

## Ledger VQE yang tidak ditemukan pada `main`

| Versi VQE | Nama di ledger | Catatan |
| --- | --- | --- |
| `20261109145507` | `tahfidz_quran_surah_catalog` | Versi ledger memakai timestamp alias |
| `20261109145522` | `tahfidz_persisted_leaderboard` | Versi ledger memakai timestamp alias |
| `20261109145534` | `tahfidz_bulk_daily_target_write_api` | Versi ledger memakai timestamp alias |
| `20270316000000` | `cbt_admin_question_keyset_pages` | Terkait stack PR CBT #98–#102; verifikasi sumber SQL |
| `20270317000000` | `cbt_admin_student_roster_pages` | Terkait stack PR CBT #98–#102; verifikasi sumber SQL |
| `20270318000000` | `cbt_admin_assignment_pages` | Terkait stack PR CBT #98–#102; verifikasi sumber SQL |
| `20270319000000` | `cbt_admin_exam_pages` | Terkait stack PR CBT #98–#102; verifikasi sumber SQL |

Hubungan dengan stack PR hanya petunjuk berdasarkan nama/versi. Isi SQL dan commit asal belum dibuktikan dalam pemeriksaan ini.

## File `main` yang belum tercatat di VQE

| Versi source | File |
| --- | --- |
| `20270215500000` | `sample_class_grade_labels` |
| `20270309000000` | `academic_report_card` |
| `20270310000000` | `academic_sample_catalog` |
| `20270311000000` | `academic_sample_term` |
| `20270313000000` | `education_boarding_operational_seed` |

Beberapa nama menunjukkan data katalog/contoh. Tinjau isi SQL sebelum menerapkannya ke VQE karena migrasi dapat membuat atau mengubah data.

## Dampak dan batas bukti

Pemeriksaan menggunakan daftar migrasi Supabase dan inventaris file `main`; tidak membaca baris data aplikasi. Tidak ada `db push`, `migration repair`, `apply_migration`, reset database, atau perubahan Production yang dilakukan dalam audit ini. Check Supabase berhenti pada rekonsiliasi karena ada versi ledger yang tidak memiliki file source dengan nomor yang sama.

CI lokal yang lulus membuktikan replay pada database lokal terisolasi. CI tersebut tidak membuktikan ledger VQE cocok, DDL VQE identik dengan source, atau Production siap menerima migrasi.

## Tindakan untuk tim backend

1. Tentukan apakah VQE harus mengikuti `main` atau masih menjadi environment untuk stack PR CBT #98–#102.
2. Telusuri commit/source SQL asli bagi tiga migrasi Tahfidz alias dan empat migrasi CBT. Jangan membuat file no-op hanya untuk meloloskan pemeriksaan tanpa membuktikan isi DDL yang sudah diterapkan.
3. Tinjau lima migrasi yang belum ada di VQE, terutama seed/katalog, dan tentukan apakah data yang dibuat memang diinginkan pada staging.
4. Pilih baseline dengan sadar:
   - **Pertahankan VQE:** pulihkan source migrasi historis yang terbukti cocok, lalu tinjau dan dry-run migrasi yang belum tercatat; atau
   - **Bangun ulang VQE dari source `main`:** lakukan hanya setelah tim mengamankan backup dan menyetujui hilangnya schema/data staging yang tidak tercatat.
5. Setelah keputusan, jalankan preflight dan replay terisolasi. Pastikan Supabase check pada commit baru berhasil sebelum mengaktifkan penerapan otomatis.
6. Rekonsiliasi PTSAS Production secara terpisah. Jangan memakai VQE ledger sebagai bukti keadaan Production dan jangan menjalankan repair/push Production dari dokumen ini.

Status integrasi/riwayat ini belum menjadi persetujuan untuk mengubah VQE atau Production.
