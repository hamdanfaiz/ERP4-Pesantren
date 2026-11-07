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


## CSV hasil SQL Editor PTSAS Production — 6 November 2026

- CSV yang diberikan berisi 47 baris ledger dan kolom `version,name`. Dua nama kosong pada versi `20261205000000` dan `20261206000000`.
- Perbandingan versi menunjukkan semua 47 versi Production ada pada source saat ini; tidak ada versi Production-only. Sebanyak 88 dari 135 versi source tidak tercatat di ledger Production. Ini adalah selisih ledger, bukan bukti bahwa seluruh DDL tersebut belum pernah diterapkan.
- Dua kolom nama yang kosong dan selisih 88 versi harus direkonsiliasi terhadap schema-only export/katalog Production. Jangan menjalankan `db push`, migration repair, atau menandai versi applied hanya berdasarkan CSV.
- Pemeriksaan akses langsung Production dari konektor Supabase tetap ditolak. Langkah berikut untuk tim backend: jalankan skrip baca-saja `docs/active/06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql` di SQL Editor pada ref Production yang tepat, simpan hasil metadata, lalu bandingkan dengan source dan VQE sebelum menyiapkan cutover.


## UAT live relasi kelas, gedung, dan kamar — 6 November 2026

- VQE diuji dalam transaksi tunggal dengan fixture jenjang, kelas, gedung, serta dua kamar sintetis. Query menjalankan validator relasi, lalu `ROLLBACK`.
- Hasil: relasi valid `planned`; jenjang salah, gender tidak cocok, gedung tidak cocok, dan okupansi tidak sinkron masing-masing `conflict`.
- Pemeriksaan setelah rollback memastikan 0 baris jenjang fixture, 0 record Master Data fixture, dan 0 audit event fixture tertinggal.
- Ini membuktikan validator live pada jalur relasi tersebut. Belum menguji RPC import dengan `p_apply=true`, penempatan kamar transaksional melalui API, kasus kamar penuh dengan santri existing, atau alur UI end-to-end.
- Production PTSAS tidak disentuh. SQL inventaris Production di source branch memakai urutan trigger yang sudah dikoreksi; salinan workspace lama juga diperbaiki lokal setelah pengguna menemukan error alias kolom.

## Handoff update — Production cutover and team access (6 November 2026)

- The owner confirmed that the backend team can access PTSAS Production `ptsasgdvgrbdtgyqieie`, while VQE staging `vqemuyzveuirlkvdggjd` is visible only to the owner. This handoff records staging evidence in GitHub; it does not include credentials or operational rows.
- The complete read-only Production export supplied by the owner contains 4,098 metadata rows at 2026-11-06 10:38:45 UTC (17:38:45 WIB): 47 migration entries, 119 public relations, 1,381 columns, 1,110 constraints, 402 indexes, 5 RLS policies, 119 functions, 24 triggers, 886 ACL entries, and 2 Storage buckets. It contains no operational row data. The corrected one-query SQL and reconciliation report are added to this PR for backend review.
- VQE currently reports 135 migrations through `20270303000000`. GitHub Actions run [#1167](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42202906454) passed all three jobs on head `17974717d9ff69ef4602ae38083bf14c6005fcb7`. Run #1168 passed all 3 jobs at commit `6b853c421c04ef8189f778a7b3cadb87910f5d3b`, including the isolated Production-baseline replay (`migration up --include-all`) with exact migration version-set verification. Production itself was not changed.
- The owner's standing instruction is to move the verified change to Production once all agreed staging checks pass, without waiting for another reminder. Production has not been changed. The exact Production-baseline replay and remaining operational/UI UAT are still open gates; the older green CI run is not recorded as proof of those gates.
- Local checks on the prepared source passed: migration-preflight regression, TypeScript lint, production build, and `git diff --check`. Full PostgreSQL replay must be verified by the new GitHub Actions run.


## Pembaruan 6 November 2026 — status handoff setelah run #1169

- PR #40 branch head saat pembaruan ini: `c10f84d398977281ee099c5873111db640101e4b`. PR #40 masih Draft/Open. Run CI #1169 lulus 3/3 pada head ini; run #1168 pada commit `6b853c421c04ef8189f778a7b3cadb87910f5d3b` juga lulus 3/3, termasuk rehearsal baseline Production tiruan.
- PR #38 dan #39 masih Draft/Open. Perbandingan GitHub menunjukkan head #40 berada di depan keduanya dan tidak ada commit #38/#39 yang tertinggal. PR #41 digabung ke branch #40; isi PR #42 terserap melalui #41. Perubahan itu belum masuk `main`.
- VQE staging masih mencatat 135 migration sampai `20270303000000`. PTSAS Production belum berubah; inventaris baca-saja yang diberikan pemilik menunjukkan 47 versi ledger dan 88 versi source belum tercatat.
- CLI lokal belum terpasang. Node `v24.11.0` memenuhi syarat versi; unduhan langsung GitHub Releases timeout. Instalasi npm CLI v2 mengambil binary melalui `postinstall`, sehingga akses ke GitHub Releases kemungkinan menjadi penyebab utama; `EPERM` tampak saat pembersihan cache Windows. Runbook di direktori database memberi langkah pemasangan, dry-run, dan penerapan bagi operator Production.
- Worktree Codex `codex/pr38-40-integration-20261106` memakai basis commit berbeda dan masih memiliki perubahan tracked/untracked; jangan dorong seluruh worktree tanpa rekonsiliasi. Pemeriksaan file menunjukkan migration `supabase/migrations/20270303000000_master_data_student_import_relationships.sql` cocok dengan file pada PR #40 setelah normalisasi CRLF (blob remote `7a64100381fae7f34ef8731279483591b16cd25e`). Definisi fungsi live di VQE juga memuat assignment `grade_level_reference_id` yang sama. Pada worktree, `npm run lint`, `npm run build`, `node scripts/test-migration-preflight.mjs`, dan `git diff --check` lulus; pengujian PostgreSQL lokal tidak berjalan karena Supabase CLI, Docker, dan psql tidak tersedia. CI remote memvalidasi hanya commit head yang disebut, bukan seluruh perubahan worktree.
- Gate tersisa: jalankan CI atas perubahan kode yang akan dikirim; selesaikan UAT browser dan operasional VQE; minta review backend; lalu operator dengan akses Production meninjau backup, inventory, dan dry-run sebelum cutover. Belum ada migrasi Production yang dijalankan.

Runbook operator: [PTSAS_PRODUCTION_MIGRATION_RUNBOOK_2026-11-06.md](../06_DATABASE/PTSAS_PRODUCTION_MIGRATION_RUNBOOK_2026-11-06.md).


## Pembaruan 6 November 2026 — hasil CI #1170 dan status worktree

- CI [run #1170](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42216550627) selesai dengan 3/3 job lulus pada head PR #40 `d240a5528d8f0f0f610c34b98ecc8212e1131ee6`: instalasi NPM, build/frontend dan guard Firebase, serta replay migrasi baseline sintetis, pgTAP, API/isolasi tenant, transaksi bersamaan, import, Storage HTTP, dan backup/restore lokal.
- Run tersebut tidak menghubungkan atau mengubah Production PTSAS dan bukan UAT browser/live. Runbook operator Production tetap memerlukan verifikasi backup, rekonsiliasi inventory, dan dry-run oleh operator yang memiliki akses ke PTSAS.
- Koreksi status worktree: migrasi `20270303000000_master_data_student_import_relationships.sql` yang disebut di atas memang cocok dengan PR #40; worktree secara keseluruhan masih belum direkonsiliasi. Lint/build/preflight/diff check lokal lulus, sedangkan PostgreSQL lokal tidak dijalankan karena alatnya tidak tersedia.
- PR #38–#40 tetap Draft/Open dan belum masuk `main`. Gate tersisa: UAT UI dan operasional VQE, tinjauan backend, serta prosedur Production pada runbook. Tidak ada migrasi Production yang dijalankan.

## Pemeriksaan ulang 6 November 2026 — PR, CI, dan akses Production

- Status terkini PR #38, #39, dan #40: semuanya masih Draft/Open dan belum merged. Tidak ada review submission pada ketiganya.
- Git comparison membuktikan head PR #40 `56575dcf4725a1d09c6fd3a52ab51aaeca818f9a` berada di depan head PR #38 `0bc56b435aaf8d25a138bc28ef4d36d85d75f57b` sebanyak 213 commit dan PR #39 `28cbb95c3f42bef5e6483055be738924ce893059` sebanyak 160 commit; keduanya memiliki `behind_by=0`. Riwayat commit PR #38 dan #39 sudah tercakup di PR #40, tetapi belum ada yang masuk `main`.
- GitHub Actions terbaru pada masing-masing head lulus 3/3 job: #38 run [#1150](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42154508525), #39 run [#1152](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42155797447), dan #40 run [#1171](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42217366259). Job mencakup instalasi NPM, build/guard runtime Firebase, migrasi/API Auth/tenant, dan pgTAP.
- Pembacaan ulang PTSAS lewat konektor Codex tetap ditolak (`get_project` dan `list_migrations`); konektor masih dapat membaca VQE. Mode read-only yang terlihat di Supabase belum memberi konektor akses ke Production. Tidak ada operasi tulis atau migrasi Production.
- Pemeriksaan lokal pada cabang integrasi lulus: rencana impor relasional Santri, migration preflight, runtime Supabase tanpa Firebase, TypeScript, build, dan `git diff --check`. Build masih memberi peringatan chunk PDF sekitar 1,46 MB dan anotasi Zod pihak ketiga.
- Workstation saat pemeriksaan tidak memiliki Docker, `psql`, `pg_dump`, atau `pg_restore`, sehingga rehearsal database lokal tidak dapat dijalankan di sana. CI #1171 tetap menjadi bukti replay migrasi terisolasi pada source PR #40.
- Endpoint lokal `127.0.0.1:4179/health/ready` dan `127.0.0.1:3000/health/ready` tidak memiliki server aktif; UAT visual/live browser belum dibuktikan.

**Langkah berikut:** tim backend dapat meninjau source dari PR #40 yang sudah lulus CI. Sebelum cutover Production, pulihkan akses baca MCP PTSAS atau minta operator Production menjalankan inventaris baca-saja dan dry-run pada runbook. Jangan menjalankan `db push` sampai backup, rekonsiliasi ledger/DDL, dan keputusan operator selesai.

## Pemeriksaan ulang VQE dan handoff — 6 November 2026, 13:15 UTC

- Konektor Supabase Codex yang tersedia saat pemeriksaan hanya mencantumkan VQE. Permintaan baca list_migrations untuk PTSAS ptsasgdvgrbdtgyqieie masih ditolak dengan "You do not have permission to perform this action". Pengaturan Read-only pada panel MCP belum memperbarui akses konektor ini; Production tidak diubah.
- Ledger VQE staging saat ini memuat 135 versions through 20270303000000. Advisor Health tidak melaporkan lint aktif.
- Pemeriksaan katalog baca-saja: 167/167 tabel publik mengaktifkan RLS dan FORCE RLS. Satu-satunya relasi publik tanpa kolom tenant_id adalah tabel root tenants. Terdapat 162 tabel RLS tanpa policy, yang bersifat fail-closed; anon tidak memiliki grant tabel dan authenticated hanya memiliki lima grant SELECT, tanpa grant tulis.
- Advisor Security masih memberi WARN untuk auth_leaked_password_protection. Advisor Performance mencatat 258 FK tanpa indeks penutup dan 95 indeks belum terpakai. Jangan menambah atau menghapus indeks massal dari angka advisor: cocokkan constraint dan indeks, pola query, serta beban sintetis skala realistis. Jangan menambahkan policy ke tabel server-only hanya untuk menghilangkan INFO.
- Pemeriksaan lokal pada worktree integrasi ef824c3 dengan perubahan lokal yang belum dikomit: test:master-data-student-import-plan, test:migration-preflight, test:supabase-runtime-no-firebase, lint, dan build lulus. Build tetap memberi peringatan chunk PDF 1,46 MB dan anotasi Zod pihak ketiga. Worktree ini belum identik dengan head PR #40, jadi hasil lokal ini bukan pengganti CI head remote.
- PR #40 head remote sebelumnya tetap lulus 3/3 job pada run #1172. PR #40 sudah berstatus Ready for review, tetapi belum memiliki review submission dan belum digabung ke main; PR #38/#39 masih Draft/Open. UAT visual dan gate rekonsiliasi Production masih terbuka.


## Inventaris ulang baca-saja PTSAS Production — 6 November 2026, 13:31 UTC

Bagian ini memperbarui angka inventaris lama di atas. Pemeriksaan dilakukan pada SQL Editor Supabase dengan project ptsasgdvgrbdtgyqieie, cabang main PRODUCTION. Semua query hanya membaca metadata katalog/ledger; tidak membaca record operasional dan tidak menjalankan DDL atau DML.

- Snapshot pukul 13:28:32 UTC: ledger memiliki 47 versi sampai 20261206000000; 88 dari 135 versi source tidak tercatat di ledger. Dua versi tertua yang hilang adalah 20261031104213 dan 20261031225438; 86 versi lain lebih baru. Ini selisih ledger, bukan bukti bahwa semua DDL terkait belum diterapkan.
- Ledger tidak menyimpan nama maupun payload SQL untuk versi 20261205000000 dan 20261206000000. Pemeriksaan katalog lanjutan pukul 13:29:55–13:31:13 UTC membuktikan efek inti kedua source migration tersebut sudah ada. Karena itu jangan menjalankan ulang DDL atau mengubah ledger hanya berdasarkan metadata kosong.
- Bukti untuk 20261205000000_data_api_default_privilege_hardening.sql: default ACL katalog tercatat; empat fungsi helper pemicu yang diperiksa tidak dapat dieksekusi oleh anon, authenticated, maupun service_role secara langsung.
- Bukti untuk 20261206000000_ppdb_legacy_candidate_import.sql: kandidat memiliki kolom sumber/record/fingerprint dan indeks unik parsial sumber legacy; tabel ppdb_legacy_import_batches memiliki sepuluh kolom wajib, RLS dan FORCE RLS, constraint serta FK tervalidasi; RPC impor berjalan sebagai SECURITY INVOKER dengan search_path tetap dan hanya service_role yang boleh mengeksekusinya.
- Katalog mencatat 119 tabel publik, semuanya dengan RLS dan FORCE RLS; hanya root tenants yang tidak memiliki tenant_id. Inventaris juga mencatat 5 policy publik, 402 indeks, 119 fungsi, 24 pemicu non-internal, dan 2 bucket Storage. Tidak ada baris data operasional yang dibaca.
- UI dashboard memberi akses baca SQL Editor, tetapi konektor MCP Codex masih hanya menampilkan VQE; list_migrations untuk PTSAS tetap ditolak. Mengubah toggle Read-only saja belum membuktikan sesi MCP mendapat hak baca Production.

Batas keputusan: verifikasi efek dua migration menghapus alasan untuk mengulang DDL-nya, tetapi belum membuktikan kesetaraan penuh seluruh 135 migration dengan Production. Tetap perlu inventaris struktur lengkap, backup/restore yang dapat dipulihkan, dan dry-run CLI pada source yang sama sebelum cutover. Production belum ditulis. PR #40 tetap Ready for review; CI dan perubahan dokumen di branch belum menggantikan tinjauan tim backend atau UAT aplikasi.

## Verifikasi DDL dua migration out-of-order — 6 November 2026, 13:47 UTC

Pemeriksaan baca-saja tambahan pada SQL Editor cabang Production mengonfirmasi objek yang dibuat dua migration 20261031 yang belum tercatat memang belum ada:

- to_regclass(public.master_data_audit_events) menghasilkan NULL; query katalog tidak menemukan fungsi create_master_data_structure_if_absent maupun fungsi audit/wrapper yang didefinisikan oleh migration terkait.
- Query trigger pada empat nama trigger audit yang diharapkan menghasilkan daftar kosong.
- Tidak ada baris operasional dibaca dan tidak ada perubahan database.

Ini membedakan dua kelas gap: efek inti migration ledger 20261205000000 dan 20261206000000 ditemukan pada katalog; tetapi DDL migration 20261031104213_master_data_import_create_only.sql dan 20261031225438_master_data_audit_feed.sql benar-benar belum ada di Production. Dua migration lama perlu diterapkan dari source melalui rencana --include-all, bukan ditandai applied. CI #1174 telah lulus replay baseline sintetis 47 versi dengan 88 gap source dan menguji penerapan out-of-order; replay itu tidak mengubah Production.

Rencana cutover tetap memerlukan backup/restore yang terbukti, dry-run Production pada commit yang direview, inspeksi setiap versi yang akan diterapkan, dan persetujuan UAT/backend. Jangan menutup gap melalui perubahan ledger manual.


## Pembaruan staging VQE dan CI — 7 November 2026

- Head PR #40 saat pembaruan: `2164f78e83bc80d8f110d49ec7e64e740cd86c5b`. Perbaikan preflight mengenali alias migrasi penempatan kamar dan menambahkan uji regresi.
- CI run [#1214](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42318538667) lulus 3/3 job. Job database menjalankan 67 berkas pgTAP (1.643 assertion), uji konkurensi NIS/Tahfidz/penempatan kamar, uji Auth/tenant dan Storage, serta smoke test backup/restore lokal.
- VQE staging memiliki 136 entri ledger. Satu alias lama `20261106151606` (`student_room_assignment_reference_locks`) dibandingkan dengan file source `20270304000000`; SQL-nya sama persis. Versi metadata ledger direkonsiliasi ke versi source tanpa menjalankan ulang DDL.
- Setelah rekonsiliasi, 136/136 versi ledger VQE cocok dengan 136 file migrasi pada source PR #40; tidak ada versi source yang tertinggal atau versi ledger tambahan. Ini membuktikan kesesuaian ledger, bukan perbandingan penuh DDL semua objek.
- Tidak ada perubahan ke PTSAS Production. Bukti CI backup/restore hanya berasal dari database Supabase lokal sintetis; pemulihan backup Production tetap tugas tim backend.
- Status PR: #40 Open/Ready for review; #38 dan #39 Open/Draft dan riwayatnya tercakup pada PR #40. UAT UI Wali serta UAT visual bertarget VQE masih belum dibuktikan. Jangan menganggap CI atau rekonsiliasi ledger sebagai pengganti UAT UI.

