# Checkpoint 6 November 2026 — PR #38–#40 dan migrasi staging

## Status pull request

- PR #38 (`0bc56b435aaf8d25a138bc28ef4d36d85d75f57b`) dan PR #39 (`28cbb95c3f42bef5e6483055be738924ce893059`) masih Draft/Open.
- PR #40 (`8d54f689b9b781f80028cbc9dc0e101bb3d3696b`) masih Draft/Open dan menjadi branch konsolidasi untuk peninjauan.
- Perbandingan GitHub membuktikan head PR #40 berada di depan head PR #38 dan #39 tanpa commit tertinggal dari keduanya (`behind_by: 0`). Karena itu perubahan #38 dan #39 sudah terkandung dalam riwayat source #40, bukan diabaikan.
- PR #38 dan #39 belum digabung ke `main`; keduanya tetap terbuka sampai PR konsolidasi diterima dan digabung. Status Draft/Open tidak sama dengan merged.

## Bukti pemeriksaan source

- Commit `8d54f689b9b781f80028cbc9dc0e101bb3d3696b` memperbaiki impor santri agar `grade_level_reference_id` tenant disimpan bersama label jenjang. Sebelumnya validasi menemukan ID referensi tetapi fungsi penyimpanan tidak menuliskannya.
- Tes pgTAP `master_data_student_import_relationships.test.sql` kini memiliki 22 assertion, termasuk pemeriksaan ID referensi yang tersimpan pada santri hasil impor.
- GitHub Actions run [#1156](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42166727627) lulus 3/3 job: pemasangan NPM untuk lingkungan pelanggan; build, tipe, guard runtime Firebase, dan smoke Docker; serta rehearsal migration, pgTAP, API/tenant, race NIS/Tahfidz, Storage, dan backup/restore pada Supabase lokal terisolasi.
- CI tidak menjalankan migrasi pada VQE atau Production dan tidak menggantikan UAT live.

## Status database

- Source repository memiliki 135 file migrasi. Ledger VQE `vqemuyzveuirlkvdggjd` memiliki 134 versi dan berakhir pada `20270302000000_academic_class_reference_pagination`.
- Migrasi source `20270303000000_master_data_student_import_relationships` adalah migrasi berikutnya yang menunggu penerapan ke VQE.
- File `.env` staging yang ditentukan berada di `erp4-pr40-uat-20261104/.env`. Pemeriksaan konfigurasi hanya memastikan `SUPABASE_PROJECT_REF` menunjuk ke VQE; `SUPABASE_DB_POOLER_URL` dan `SUPABASE_DB_URL` belum tersedia di file tersebut.
- Tidak ada migrasi yang diterapkan ke VQE pada checkpoint ini. Production PTSAS `ptsasgdvgrbdtgyqieie` tidak disentuh.

## Langkah berikutnya

1. Tambahkan URL Session Pooler khusus VQE ke variabel `SUPABASE_DB_POOLER_URL` di `.env` staging. Jangan menyalin nilai dari file `.env` dengan project ref berbeda dan jangan mengirim nilai kredensial lewat chat.
2. Jalankan preflight, periksa target VQE, kemudian `supabase db push --dry-run`. Hentikan bila target atau rencana DDL tidak sesuai.
3. Terapkan migrasi yang tertunda ke VQE saja; verifikasi ledger, fungsi, hak akses, dan relasi jenjang hasil impor.
4. Selesaikan UAT live dengan data sintetis untuk role/tenant, impor-ekspor, PPDB/NIS, Akademik, Tahfidz, Finance, Storage, dan tampilan responsif.
5. Rekonsiliasi schema dan ledger Production secara terpisah sebelum mempertimbangkan cutover. Merge dan deploy hosting tetap menunggu review backend serta gerbang staging.

## Temuan Auth dan advisor terbaru

- Organisasi Supabase VQE saat diperiksa menggunakan paket Free. Advisor Security melaporkan `Leaked Password Protection Disabled` pada tingkat WARN. Dokumentasi Supabase menyatakan pemeriksaan kata sandi bocor tersedia pada Pro ke atas: https://supabase.com/docs/guides/auth/password-security.
- Antarmuka aplikasi dan endpoint server yang diperiksa membatasi kata sandi baru menjadi minimal 12 karakter. Setiap environment Supabase yang akan dipakai pelanggan tetap perlu mengatur batas minimum yang sama pada kebijakan Auth server-side; validasi UI saja tidak cukup untuk melindungi endpoint Auth yang bisa dipanggil langsung.
- Temuan tambahan VQE: 162 tabel `public` dengan RLS tanpa policy (INFO), 258 foreign key tanpa indeks penutup dan 96 indeks yang belum terlihat dipakai (INFO). Temuan RLS tanpa policy bersifat fail-closed untuk akses tabel langsung; jangan menambah policy hanya untuk menghilangkan peringatan. Indeks perlu dipilih setelah menilai pola query dan rencana skala, bukan dibuat massal hanya berdasarkan hitungan advisor.
- Health advisor tidak menampilkan lint aktif pada snapshot ini. Belum ada perubahan pengaturan Auth, DDL, atau indeks pada VQE; Production tidak disentuh.

## Batas runtime Firebase

- Audit source menemukan 23 file legacy yang masih memiliki import atau referensi Firestore/Firebase, terutama halaman lama dan service onboarding lama. `src/App.tsx` dan `src/main.tsx` tidak memuat halaman legacy tersebut pada graph aktif.
- CI pada head `8d54f689b9b781f80028cbc9dc0e101bb3d3696b` lulus untuk guard graph runtime tanpa Firebase dan image produksi tanpa paket Firebase. `src/firebase.ts` menolak pemakaian lama, dan alias Vite `firebase/firestore` mengarah ke shim yang melempar error.
- Dengan bukti itu, runtime yang diuji tidak bergantung pada Firestore; namun berkas legacy dan Firebase devDependency masih berada di source untuk kebutuhan kompatibilitas/type-check. Bila kebijakan repositori menuntut source bersih tanpa referensi Firebase sama sekali, pengarsipan/penghapusan berkas legacy menjadi pekerjaan source-cleanup terpisah sebelum klaim tersebut dibuat.


## Pembaruan 6 November 2026 — pemeriksaan PR dan Production

### Status PR #38–#40

- Head GitHub yang diverifikasi: #38 `0bc56b435aaf8d25a138bc28ef4d36d85d75f57b`, #39 `28cbb95c3f42bef5e6483055be738924ce893059`, #40 `157f867674ec26a07a7e5805c4fb8056aecaaef0`.
- Head PR #40 berada 203 commit di atas #38 dan 150 commit di atas #39, tanpa commit yang tertinggal. PR #40 menjadi jalur integrasi untuk meninjau stack tersebut bersama.
- CI terbaru di ketiga head lulus 3/3 job: run #1150 (#38), #1152 (#39), #1162 (#40). Ketiga PR tetap Draft/Open dan belum memiliki review; UAT live dan penerimaan backend masih menunggu.
- Isi migrasi `20270303000000_master_data_student_import_relationships.sql`, tes pgTAP terkait, dan panduan deployment pada worktree integrasi dibandingkan dengan head #40 dan sama persis. Perubahan itu telah dipush dan diuji oleh CI #1162; tidak ada source code tambahan yang perlu didorong ulang.

### Pemeriksaan source lokal

- Lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, `npm run test:master-data-student-import-plan`, `npm run test:master-data-transfer-csv`, dan `git diff --check`.
- Build berhasil dengan peringatan anotasi pihak ketiga Zod dan chunk PDF sekitar 1,46 MB. Docker, `psql`, dan Supabase CLI tidak tersedia di workstation; pgTAP pada migrasi yang sama sudah tercakup di job CI #1162.

### Inventaris PTSAS Production baca-saja

- SQL Editor memastikan ref terpilih adalah PTSAS Production `ptsasgdvgrbdtgyqieie`. Query hanya membaca metadata katalog dan ledger; tidak membaca record operasional atau menjalankan DDL/DML.
- Ledger Production berisi 47 versi migrasi unik, terbaru `20261206000000`. Source memiliki 135 file sampai `20270303000000_master_data_student_import_relationships.sql`; jangan lakukan cutover sebelum ledger dan struktur direkonsiliasi.
- Dari 119 tabel publik, seluruhnya mengaktifkan RLS dan 118 memiliki kolom `tenant_id`. Satu pengecualian adalah tabel root `tenants`: RLS dan FORCE RLS aktif, dengan kebijakan SELECT authenticated `id = current_tenant_id()`. Tidak ditemukan tabel operasional yang kehilangan kolom tenant.
- Katalog mencatat lima kebijakan RLS publik dan dua bucket Storage privat. Tidak ada perubahan pada Production.

### Prasyarat VQE yang belum selesai

- VQE staging `vqemuyzveuirlkvdggjd` memiliki 134 versi ledger sampai `20270302000000_academic_class_reference_pagination`; migrasi `20270303000000` masih menunggu.
- File `erp4-pr40-uat-20261104/.env` belum memiliki `SUPABASE_DB_POOLER_URL`; URL itu tidak dikirim lewat chat. Dry-run dan penerapan ke VQE belum terjadi.
- Setelah URL Session Pooler khusus VQE disimpan, jalankan preflight dan `db push --dry-run` dengan verifikasi ref, lalu terapkan migrasi ke VQE dan ulangi UAT. Production tetap tidak boleh menerima migrasi sebelum tahap rekonsiliasi terpisah.


## Pembaruan 6 November 2026 — penerapan migrasi VQE 20270303000000

- Source di PR #40 pada saat penerapan: `25f1873426f1fbae46dc9f7eb94d8e0c70dd4e79`. Migrasi `20270303000000_master_data_student_import_relationships.sql` diterapkan ke VQE staging `vqemuyzveuirlkvdggjd` melalui konektor Supabase setelah fungsi audit, impor santri, penempatan kamar, dan kolom rujukan jenjang diverifikasi tersedia.
- Konektor mencatat migrasi dengan versi waktu `20261106094752`. Satu baris metadata ledger itu kemudian direkonsiliasi ke versi sumber `20270303000000`; isi statements/rollback dipertahankan dan DDL tidak dijalankan ulang.
- Verifikasi pasca-penerapan: ledger VQE berisi 135 migrasi dan memiliki versi canonical `20270303000000`; fungsi validasi/impor tersedia; `anon` dan `authenticated` tidak dapat mengeksekusi RPC impor, `service_role` dapat; `search_path` validator terkunci.
- GitHub Actions run #1163 lulus: frontend/build guard, migrations/API auth/pgTAP, dan instalasi NPM. Ini bukti suite CI terisolasi, bukan pengganti seluruh UAT live.
- `SUPABASE_DB_POOLER_URL` kini ada di `erp4-pr40-uat-20261104/.env`, cocok dengan VQE region `ap-northeast-1`, dan `.env*` diabaikan Git. Nilai rahasia tidak dicatat atau dikirim.
- Supabase CLI belum tersedia pada workstation; perintah `db push --dry-run` belum dijalankan. Migrasi ini diterapkan langsung melalui konektor Supabase.
- UAT live impor sintetik, Auth/isolasi tenant menyeluruh, Storage, dan UAT antarmuka/responsif masih terbuka. PR #40 tetap Draft/Open; Production PTSAS `ptsasgdvgrbdtgyqieie` tidak diubah. Ledger Production tetap perlu rekonsiliasi sebelum cutover.


## UAT baca-saja validator impor master data — 6 November 2026

- Pada tenant aktif VQE, validator mengembalikan `planned` untuk jenjang aktif tenant, `conflict` untuk jenjang bebas yang tidak dikenal, dan `conflict` untuk ID kelas dari tenant lain. Pengujian hanya memanggil fungsi validasi; tidak membuat atau mengubah record.
- Inventaris agregat staging menunjukkan sembilan tenant (satu aktif, delapan ditangguhkan). Tenant aktif belum memiliki record Master Data kelas/gedung/kamar; katalog tersebut hanya ada pada tenant yang ditangguhkan. Karena itu pengujian live positif untuk hubungan kelas↔jenjang, gedung↔kamar, gender, kapasitas, dan sinkronisasi okupansi belum lengkap.
- Jangan mengaktifkan tenant lama atau memindahkan record demi tes. Lengkapi jalur tersebut dengan fixture sintetis terisolasi yang dibersihkan setelah pengujian, atau lewat pgTAP/CI yang sudah lulus.
- Preview lokal `localhost:4179` sedang tidak berjalan. Worktree `erp4-pr40-uat-20261104` berada pada commit `b2d7acc` dan memiliki perubahan lokal; jangan gunakan sebagai representasi head PR terkini tanpa sinkronisasi terpisah.
- PR #38 (run #1150), PR #39 (run #1152), dan PR #40 (run #1164) lulus CI pada head masing-masing. Ketiganya tetap Draft/Open; PR #40 masih menunggu UAT antarmuka dan verifikasi staging operasional.
