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


## Tindak lanjut baca-saja PTSAS Production — 13 November 2026

Pemeriksaan metadata terbaru dilakukan terpisah dari audit staging, melalui konektor Supabase Production. Pemeriksaan ini hanya membaca ledger migrasi, metadata jumlah tabel/RLS, dan Security Advisor; tidak membaca nilai record aplikasi, menjalankan SQL perubahan, melakukan migration repair, atau mengubah Production.

- Ref Production: `ptsasgdvgrbdtgyqieie`; source pembanding: `main` pada commit `ebea706ef4ac4724fa9c0e2a5a580f949d941228`.
- Source memiliki **148 file migrasi**, sampai `20270315000000_lms_dashboard_operational_fill`.
- Ledger Production memiliki **100 versi**, dari `20260603000000` sampai `20270316000000`.
- **99 versi** memiliki nomor yang sama pada source. Ada **49 versi source yang belum tercatat** dan satu versi Production-only, `20270316000000 communication_ops_runtime`, yang tidak memiliki file bernomor sama di source.
- Selisih versi bukan bukti bahwa DDL tertentu hilang atau aman untuk diterapkan. Fungsi, constraint, indeks, policy/grant, isi dua migration berpayload kosong, dan urutan replay belum dibandingkan.
- Katalog mengembalikan **162 tabel public**, semuanya melaporkan RLS aktif. Security Advisor memberi 157 temuan INFO untuk tabel yang RLS-nya aktif tanpa policy. Hasil ini bukan audit grant atau bukti keamanan API; tim harus memastikan akses langsung memang tertutup dan server API tetap menegakkan tenant/role.
- Advisor juga menandai satu fungsi dengan `search_path` mutable: `public.erp4_ppdb_update_updated_at_column`; empat helper `SECURITY DEFINER` dapat dijalankan role `authenticated` (`current_app_role`, `current_tenant_id`, `has_module_access`, `is_tenant_admin`). Source memberi hak eksekusi tersebut untuk helper RLS, tetapi definisi/grant live perlu ditinjau tim sebelum menyimpulkan aman.
- Auth Advisor melaporkan perlindungan kata sandi bocor dinonaktifkan. Health Advisor tidak mengembalikan temuan.

### Tindak lanjut tim backend

1. Jalankan rekonsiliasi source-versus-Production yang meninjau definisi objek dan provenance `20270316000000`; jangan menerapkan atau menandai migration hanya untuk menyamakan hitungan.
2. Verifikasi table grants, policy, function definitions/search path, serta alasan helper RLS harus dapat dieksekusi oleh `authenticated`.
3. Putuskan dan dokumentasikan pengaktifan perlindungan kata sandi bocor sesuai paket/konfigurasi Auth.
4. Simpan backup yang dapat dipulihkan dan buktikan restore; lalu rehearsal urutan migration pada salinan sebelum persetujuan deploy.
5. Jangan menjalankan `db push`, migration repair, reset, atau perubahan Auth/DDL Production berdasarkan snapshot ini.

Status ini adalah inventaris metadata baca-saja; bukan validasi DDL Production, uji RLS end-to-end, backup/restore, atau persetujuan deploy.
