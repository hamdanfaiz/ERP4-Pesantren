# Rilis terarah CBT ke PTSAS Production

**Tanggal pemeriksaan:** 13 November 2026  
**Target:** `ptsasgdvgrbdtgyqieie` (PTSAS Production)  
**Source:** PR #112, head `a6c5d265f662afa8f3f5334403c1cb3780905987`  
**Status:** Kandidat rilis untuk tinjauan backend; belum diterapkan.

## Keputusan dan batas

Pemilik mengizinkan rilis langsung ke Production jika terbukti aman. Pemeriksaan menunjukkan kandidat ini dapat ditinjau sebagai migrasi maju yang terarah. Persetujuan tersebut tidak berarti menjalankan semua migration yang hilang atau melewati backup, restore, pengecekan DDL, dan urutan deploy aplikasi.

Jangan menjalankan `supabase db push` terhadap seluruh repo. Production memiliki 100 entri ledger dan banyak versi source yang belum tercatat; sebagian perubahan source mungkin sudah ada atau memakai versi yang bentrok. Selisih ledger bukan daftar SQL yang aman untuk dieksekusi.

## Allowlist migrasi kandidat

Semua file berikut berada di `supabase/migrations` pada source PR #112 dan berurutan:

| Versi | Nama source | Perubahan |
|---|---|---|
| `20270321000000` | `cbt_tenant_settings_write_api` | RPC penyimpanan pengaturan CBT dan grant khusus `service_role` |
| `20270322000000` | `cbt_admin_dashboard_summary` | Dua indeks serta RPC ringkasan CBT tenant |
| `20270323000000` | `cbt_admin_question_keyset_pages` | Ekstensi `pg_trgm`, empat indeks, dan dua RPC soal/paket |
| `20270324000000` | `cbt_admin_student_roster_pages` | Dua RPC pencarian roster dan label santri |
| `20270325000000` | `cbt_admin_assignment_pages` | Tiga indeks dan dua RPC daftar penugasan/hasil |
| `20270326000000` | `cbt_admin_exam_pages` | Satu indeks dan RPC daftar ujian |

Nama lengkap file adalah versi di atas diikuti `_` dan nama source dengan ekstensi `.sql`. Terapkan hanya file yang sudah disetujui pada source commit yang sama; catat versi dan nama persis di ledger.

## Bukti baca-saja

- PTSAS memiliki tabel operasional CBT yang dibutuhkan. Pemeriksaan katalog memastikan seluruh kolom dan tipe yang langsung dirujuk keenam migration tersedia, termasuk `cbt_tenant_settings`, `cbt_questions`, `cbt_exams`, `cbt_exam_assignments`, `cbt_attempts`, `students`, `master_data_records`, `profiles`, `tenants`, dan `tenant_reference_items`.
- Kesembilan RPC pada batch dan kesepuluh indeks terkait belum ada di PTSAS.
- Ekstensi `pg_trgm` sudah tersedia pada schema `extensions` di PTSAS.
- VQE sudah memiliki fungsi/index ekuivalen dari rangkaian migration lama. Pemeriksaan sebelumnya mencocokkan body fungsi setelah normalisasi whitespace dan definisi indeks pada katalog. VQE ledger mencatat rangkaian itu dengan versi `20270314000000`–`20270319000000`; jangan menerapkan ulang source migration hanya untuk mengganti nomornya.
- PTSAS ledger terkini memiliki 100 entri sampai `20270316000000`; tiga nama migrasi lama kosong. Kesetaraan DDL keseluruhan antara Production dan source belum dibuktikan.

Pemeriksaan kolom menunjukkan prasyarat langsung tersedia, tetapi tidak mencakup setiap constraint, trigger, ukuran tabel, rencana query, beban tulis, ataupun kesetaraan penuh DDL. CI PR #112 memakai Supabase lokal terisolasi dan baseline historis, bukan replay live Production.

## Gerbang wajib sebelum eksekusi

1. Tim backend mengidentifikasi source commit dan file migration yang akan dirilis; periksa checksum/versi persis terhadap PR #112.
2. Ambil backup Production dan pulihkan ke clone terisolasi. Buktikan aplikasi/DB dapat dipulihkan sebelum change window.
3. Bandingkan struktur tabel/constraint yang digunakan migration dengan source. Tinjau dampak `CREATE INDEX` non-concurrent pada sepuluh indeks, ukuran tabel, lock, durasi, dan jadwal rendah aktivitas.
4. Pilih mekanisme migrasi yang dapat menerapkan hanya enam versi allowlist tanpa mengeksekusi gap versi lain. Setelah selesai, ledger harus merekam enam nama/version yang benar; jangan mengubah ledger sebagai pengganti DDL.
5. Verifikasi 9 RPC, signature, `SECURITY INVOKER`, `search_path`, dan `EXECUTE` hanya untuk `service_role`; verifikasi 10 definisi indeks serta extension.
6. Setelah schema tersedia, deploy versi aplikasi PR #112 yang sama. Jalankan smoke test Admin/tenant, pagination/cursor, pengaturan CBT, ringkasan, dan role/tenant isolation. Pastikan jalur rollback aplikasi dan restore database tersedia.

Jika mekanisme tim tidak mendukung eksekusi migration allowlist tanpa memproses gap, jangan memaksa `db push`. Tim perlu menyiapkan runner release terkontrol yang mempertahankan audit trail migration.

## Hasil sesi ini

Tidak ada query yang membaca baris operasional dan tidak ada perubahan pada PTSAS atau VQE. MCP Production pada sesi ini dikonfigurasi read-only. PR #112 tetap Open/Ready for review dan CI run #1618 lulus 3/3 job pada source head di atas. Runbook ini tidak menyatakan produk siap Production sebelum gerbang wajib ditutup.
