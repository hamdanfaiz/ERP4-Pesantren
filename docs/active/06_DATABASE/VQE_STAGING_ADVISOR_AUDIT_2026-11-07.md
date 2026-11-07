# Audit baca-saja staging VQE — 7 November 2026

## Ruang lingkup dan batas

Audit dilakukan pada proyek Supabase staging VQE `vqemuyzveuirlkvdggjd` melalui konektor baca-saja dan kueri katalog PostgreSQL yang hanya membaca metadata. Tidak ada data, skema, akun, Storage, atau ledger yang diubah. PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh.

## Kontrol akses database

Pemeriksaan katalog pada staging menemukan:

- 167 tabel di schema `public`; seluruhnya mengaktifkan RLS.
- 162 tabel belum memiliki policy. Pemeriksaan grant tabel dan kolom menunjukkan tidak ada akses langsung `anon` atau `authenticated` pada 162 tabel tersebut. Dengan konfigurasi ini, akses API langsung tertutup secara default.
- Lima tabel memberi role `authenticated` hak baca saja, dan semuanya memiliki policy RLS:
  - `tenants`: hanya tenant aktif yang terikat ke profil pengguna.
  - `profiles`: profil sendiri; Admin dapat membaca dalam tenant bila memiliki izin modul pengguna.
  - `candidates` dan `candidate_documents`: hanya Admin tenant dengan izin modul PPDB.
  - `user_profiles`: hanya profil sendiri.
- Tidak ada grant tulis tabel langsung untuk `anon` atau `authenticated`.
- Ada 93 fungsi `SECURITY DEFINER` di schema publik; pemeriksaan hak eksekusi menemukan role `anon` dan `authenticated` tidak dapat menjalankannya. Operasi tetap harus melewati route server tepercaya yang memvalidasi autentikasi, role, tenant, dan payload.

Temuan Advisor “RLS enabled, no policy” pada 162 tabel konsisten dengan desain server-only/default-deny, bukan bukti akses publik. Guard API server tetap perlu dipertahankan dan diuji pada setiap modul.

## Ledger migrasi staging

- Konektor membaca 136 baris ledger.
- Versi kanonis terakhir yang terlihat adalah `20270303000000_master_data_student_import_relationships`.
- Ada satu alias lama `20261106151606_student_room_assignment_reference_locks`. Baris ini menyimpan SQL penguncian referensi yang telah aktif, termasuk validasi status tenant/gedung/kamar. Versi sumbernya adalah `20270304000000_student_room_assignment_reference_locks`.
- SQL pada versi `20270303000000` dan alias tersebut sama-sama memuat relasi jenjang `grade_level_reference_id`; SQL sumber alias juga memuat penguncian `FOR SHARE`.
- Jangan menjalankan ulang DDL. Rekonsiliasi satu baris metadata ke versi sumber telah disetujui sebelumnya, tetapi konektor saat ini hanya baca-saja sehingga belum dilaksanakan.

## Temuan keamanan dan performa

- Advisor Security memberi peringatan bahwa **Leaked Password Protection** Supabase Auth belum aktif. Dokumentasi Supabase menyatakan pemeriksaan kata sandi bocor tersedia pada paket Pro ke atas. Operator perlu memeriksa kemampuan paket staging, lalu mengaktifkan perlindungan ini bila tersedia. Bila tidak tersedia, tetapkan kebijakan panjang/kekuatan password dan MFA sesuai kemampuan paket; jangan menyimpan password aplikasi sendiri.
- Advisor Performance mencatat 258 foreign key tanpa indeks penutup dan 95 indeks belum digunakan. Staging belum memiliki beban dan volume representatif, sehingga temuan ini tidak membenarkan penambahan/penghapusan indeks secara massal.
- Sebelum rilis besar, lakukan uji beban dengan data sintetis yang menyerupai volume pesantren, ukur query modul utama dengan `EXPLAIN (ANALYZE, BUFFERS)`, lalu tambahkan indeks untuk foreign key yang terbukti panas dan tinjau indeks yang tidak terpakai setelah periode observasi produksi.

## Bukti pengujian dan batas bukti

- GitHub PR #40 masih **Open**, belum merged. Head yang diperiksa `4e67d5f8568b82fb1de24090826d39c3b1bb40ee`; GitHub Actions run [#1198](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42256216299) lulus 3/3 job.
- Tidak ada review submission atau inline review thread pada PR #40 saat audit.
- Validasi lokal pada worktree integrasi terpisah: lint, build, migration preflight, serta 42 dari 44 pemeriksaan logika non-database lulus. Dua pemeriksaan yang membuka loopback server ditolak sandbox dengan `EACCES`; pemeriksaan migrasi race lokal tidak dapat dijalankan karena Supabase CLI lokal tidak tersedia. Hasil ini **bukan** bukti tambahan pada head PR #40; CI #1198 adalah bukti pada head PR.
- UAT browser Admin/Wali belum selesai. UAT harus menguji navigasi dan sub-menu, hak akses, isolasi tenant, PPDB, NIS/Naming Series, asrama, Tahfidz, Finance, impor/ekspor, Storage, dan ukuran layar.
- Operator melaporkan bahwa MCP Desktop `supabase` berhasil membaca metadata PTSAS Production pada 7 November: 119 tabel `public` dengan RLS/FORCE RLS, 5 policy SELECT, dan 47 versi ledger. Konektor Supabase Apps pada sesi agen masih menolak pembacaan; ini jalur terpisah dan tidak membatalkan hasil Desktop yang dilaporkan. Rekonsiliasi versi serta batas bukti ada di [laporan Production 7 November](PTSAS_PRODUCTION_RECONCILIATION_2026-11-07.md). Tidak ada perubahan Production.

## Urutan tindak lanjut

1. Saat operator aktif, selesaikan konfigurasi keamanan Auth staging dan verifikasi hasilnya.
2. Lakukan UAT browser Admin/Wali pada VQE; hapus fixture sintetis setelah bukti UAT tersimpan.
3. Rekonsiliasi hanya baris alias VQE setelah memeriksa versi/nama/payload yang tepat. Jangan menerapkan ulang DDL.
4. Tim backend sediakan inventaris baca-saja Production terkini, backup beserta bukti pemulihan, dan rehearsal migration plan terhadap baseline Production.
5. Tinjau indeks melalui data sintetis representatif dan rencana beban.
6. Jangan merge/cutover ke Production sampai UAT, review backend, inventaris, backup/restore, dan rehearsal migration lulus. Deploy hosting dan UAT akhir tetap dilakukan tim backend.

