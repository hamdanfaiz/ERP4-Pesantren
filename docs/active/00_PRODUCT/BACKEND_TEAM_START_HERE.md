# Titik Mulai Tim Backend — ERP4 Pesantren

## Checkpoint terbaru — 7 November 2026

- **PR #40** masih Open, belum merged. CI run [#1206](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42311021365) lulus 3/3 pada head `345be53d1feb5af20682248e99dabab23e69ee42`; CI run [#1208](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42312516120) kemudian lulus 3/3 pada head `1dfe0debf2fe2a2aa96b3f28dfeb3ea6795dfec5`, yang memperbarui runbook dan handoff. CI tersebut memeriksa source/build, replay baseline Production sintetis, serta backup/restore lokal.
- Operator melaporkan hasil baca-saja Production via MCP Desktop: 119 tabel publik, seluruhnya RLS + FORCE RLS; 47 versi ledger; 136 file migrasi source; 89 versi source tidak tercatat. Hasil lengkap dan batas pembuktiannya ada di [rekonsiliasi Production 7 November](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-07.md). Konektor Supabase Apps pada sesi pengembang masih menolak akses, jadi snapshot itu belum dapat diulang secara independen dari sesi ini.
- Belum ada perubahan tulis pada Production. Jangan menganggap 89 selisih ledger sebagai daftar migrasi siap dijalankan.
- CI #1206 membuktikan replay terhadap **baseline sintetis** serta backup/restore lokal CI. Backup dan restore PTSAS, diff DDL langsung, UAT browser staging, dan persetujuan change window Production belum terbukti.
- Langkah tim berikutnya: tinjau [runbook Production terkini](../06_DATABASE/PTSAS_PRODUCTION_MIGRATION_RUNBOOK_2026-11-06.md), buat dump/diff baca-saja pada commit source yang sama, lakukan restore rehearsal ke target kosong terisolasi, dan laporkan hasil dry-run tanpa menjalankan migrasi. Pastikan secret database yang pernah dibagikan telah dirotasi sebelum dipakai.

Status ringkas: **source PR siap ditinjau tim; cutover Production belum siap**. Tim backend dapat mulai review source sekarang, sementara gerbang backup/restore, UAT, dan rencana migrasi Production berjalan terpisah.


## Checkpoint aktif — 7 November 2026, 06:17 WIB

### PR #40, source, dan CI

- [PR #40](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40) masih **Open, belum merged**. Head dokumentasi `ec20b66a6697550d86c7bc9ff091fb9417cabcd8`; source aplikasi terakhir diuji `c61825935c49b642d8bed08b16e7c428a73add15`. Commit terbaru hanya dokumentasi.
- GitHub Actions [run #1204](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42309828935) lulus **3/3 job** pada head ec20. Cakupan termasuk build/guard Firebase, pemasangan NPM pelanggan, migration replay pada baseline Production sintetis, API/Auth dan isolasi tenant, pgTAP, Storage, konkurensi, backup/restore lokal, dan Docker smoke test. Ini bukan UAT browser, backup Production, atau rehearsal live.
- Belum ada submission review maupun review thread pada PR #40. Perubahan PR #38/#39 terkonsolidasi di #40.
- Build lokal salinan source bersih juga lulus lint, build, dan 19 pemeriksaan logika terpilih. Build memberi peringatan chunk JavaScript di atas 500 kB. Laporan Production terbaru ada di [rekonsiliasi baca-saja 7 November](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-07.md).

### VQE staging — inspeksi baca-saja terbaru

- Project `vqemuyzveuirlkvdggjd`: 136 baris ledger; satu alias `20261106151606_student_room_assignment_reference_locks` mewakili source `20270304000000_student_room_assignment_reference_locks`. SQL migrasi sudah aktif. **Jangan jalankan ulang DDL.** Metadata alias masih perlu direkonsiliasi dengan prosedur staging yang sesuai.
- Advisor terakhir: 167 tabel `public` mengaktifkan RLS; 162 tabel tidak memiliki policy dan tidak memiliki grant langsung bagi browser roles, sehingga akses langsung default-deny. Perlindungan password bocor belum aktif; 258 FK tanpa indeks penutup dan 95 indeks belum digunakan adalah INFO yang perlu diuji dengan beban representatif, bukan diubah massal.
- UAT browser Admin/Wali, termasuk alur login dan semua modul, belum selesai.

### PTSAS Production — metadata terbaca; belum ada perubahan

- Operator melaporkan bahwa MCP Desktop `supabase` berhasil membaca metadata Production pada 7 November. Tidak perlu meminta OAuth tambahan; konektor Supabase Apps dalam sesi agen masih terpisah dan tetap menolak.
- Katalog `public`: 119/119 tabel mengaktifkan RLS dan FORCE RLS. Operator melaporkan 5 policy, semuanya `PERMISSIVE SELECT` untuk `authenticated`, serta tidak ada grant langsung ke `PUBLIC`, `anon`, atau `authenticated`. Route server, RPC, fungsi istimewa, dan login belum dibuktikan oleh pemeriksaan katalog ini.
- Ledger: 47 versi; semua versi ditemukan pada 136 file source PR #40. 45 nama cocok; dua nama tidak dikembalikan MCP tetapi dipetakan berdasarkan versi. Ada 89 versi source yang belum tercatat dan 29 nomor versi setelah tanggal laporan. Daftar selisih rinci ada di laporan rekonsiliasi; **jangan terapkan 89 migrasi secara massal**.
- Tidak ada baris data aplikasi yang dibaca dan tidak ada query tulis atau perubahan Production. Ledger bukan bukti efek DDL, dan Production memerlukan diff schema aktual.

### Gerbang berikutnya

1. Tim backend tinjau report rekonsiliasi, ambil schema-only snapshot Production, bandingkan efek DDL, dan buktikan backup serta restore pada target terisolasi.
2. Selesaikan rehearsal migration plan pada baseline yang cocok; urutkan migrasi dan tangani efek DDL yang hilang dengan migrasi korektif baru, bukan rerun buta.
3. Selesaikan UAT Admin/Wali di staging untuk menu/submenu, role/tenant, PPDB, NIS/Naming Series, impor/ekspor, asrama, Tahfidz, Finance, Storage, dan layar responsif; hapus fixture setelah bukti tersimpan.
4. Rekonsiliasi alias ledger VQE setelah memastikan versi source dan status DDL yang aktif; jangan mengulang DDL.
5. Merge/cutover hanya setelah review backend, UAT, backup/restore, schema diff, dan rehearsal lulus. Deploy hosting serta UAT hosting tetap dilakukan tim backend.

Status ini memisahkan bukti CI/sintetis dari Production live. **ERP belum siap migrasi Production atau go-live.**
---

## Arsip checkpoint 6 November 2026 dan sebelumnya


### PR dan CI

- [PR #38](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/38) — head `0bc56b435aaf8d25a138bc28ef4d36d85d75f57b`, Draft/Open; Actions [run #1150](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42154508525) lulus 3/3 job.
- [PR #39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39) — head `28cbb95c3f42bef5e6483055be738924ce893059`, berbasis pada head PR #38; Actions [run #1152](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42155797447) lulus 3/3 job.
- [PR #40](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40) — head `0b4e84b7298237f80e5ef103baa901f542fb7ad9`, berbasis `main`; Actions [run #1151](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42155347657) lulus 3/3 job.
- Ketiganya masih Draft/Open dan belum memiliki review. CI membuktikan build, lint/typecheck, migrasi lokal, pgTAP, isolasi tenant, Storage HTTP, backup/restore sintetis, dan image Docker customer-managed; CI bukan bukti UAT antarmuka terhadap akun serta proyek staging live.

### VQE staging dan gerbang Production

- Ledger VQE saat pemeriksaan memiliki 134 migrasi dan berakhir di `20270302000000_academic_class_reference_pagination`. Source PR #40 memiliki 135 file migrasi; `20270303000000_master_data_student_import_relationships` masih pending di VQE. CI PR #40 sudah merehearsal migrasi dan pgTAP secara lokal/terisolasi, tetapi migrasi live VQE belum diterapkan.
- `.env` staging yang diperiksa hanya memuat API key; tidak ada `SUPABASE_DB_URL` atau `SUPABASE_DB_POOLER_URL`. Gunakan Supabase CLI dengan URL database VQE yang diperoleh secara aman untuk `db push --dry-run`, tinjau bahwa hanya migrasi di atas yang pending, lalu terapkan dan verifikasi ledger serta smoke test. Jangan memperbaiki ledger manual atau memakai MCP `apply_migration` untuk migration ber-versi yang harus cocok dengan source.
- Advisor VQE terbaru: 162 tabel dengan RLS tanpa policy (INFO), 258 foreign key tanpa indeks penutup (INFO), 96 indeks belum terpakai (INFO), dan perlindungan kata sandi bocor Auth belum aktif (WARN). Jangan menambahkan policy massal atau menghapus indeks tanpa memeriksa kontrak akses dan workload.
- Konektor Supabase yang tersedia hanya menampilkan VQE. Pembacaan project dan ledger Production PTSAS (`ptsasgdvgrbdtgyqieie`) saat ini ditolak, sehingga keadaan ledger/schema Production belum terverifikasi. Catatan lama tentang 47 versi ledger adalah snapshot terdahulu, bukan hasil pemeriksaan saat ini.
### Temuan log Auth VQE — 5–6 November 2026

- Query baca-saja 24 jam menemukan 9 operasi DELETE Auth berstatus 500 (`unexpected_failure`), bukan penghapusan berhasil. Pesan database yang disanitasi menunjukkan penghapusan profil ditolak oleh FK `ON DELETE RESTRICT` dari `ppdb_document_access_events` dan `tenant_reference_items`.
- Ini selaras dengan kontrak retensi audit/katalog. Source aplikasi saat ini tidak menyediakan endpoint DELETE pengguna; perubahan status memakai `PATCH /api/users/:uid`, mem-ban/unban akun Auth, lalu memperbarui status profil dengan kompensasi bila update profil gagal. Jangan mengubah FK ini menjadi `CASCADE` untuk menghilangkan 500.
- Operasional: gunakan **Nonaktifkan Akun** di modul Pengguna. Untuk fixture uji yang memiliki jejak audit, pertahankan akun dalam status nonaktif atau bersihkan hanya fixture tenant uji setelah relasi dan jejaknya ditinjau. Log `user_deleted` saja tidak membuktikan akun berhasil dihapus.
- Koreksi hitungan log: field HTTP yang benar adalah `status`; agregasi awal pada `status_code` tidak menangkap respons 500 tersebut. Tidak ada data profil/email yang dimasukkan ke catatan ini.
- Tidak ada migrasi atau perubahan data Production pada checkpoint ini. Jangan cutover sebelum staging live diverifikasi, struktur dan ledger Production direkonsiliasi terhadap source yang sama, serta tim menyelesaikan UAT dan review.

### UAT yang tersisa

1. Setelah migrasi pending VQE diterapkan, uji login Admin dan Wali, isolasi tenant, impor CSV Santri beserta relasi jenjang/kelas/gedung/kamar, batas kapasitas kamar, dan ekspor yang mengandung PII.
2. Uji antarmuka responsif, unggah/unduh Storage, pemulihan backup, serta alur finance pada staging dengan data sintetis.
3. Minta tim backend meninjau ketiga PR. PR #39 bertumpuk di atas PR #38; pertahankan urutan integrasi tersebut. PR #40 berdiri di atas `main`.
4. Setelah seluruh gerbang staging dan rekonsiliasi Production lulus, tim backend dapat menjalankan cutover/deploy dan UAT hosting.


> **Checkpoint source yang diaudit — 31 Oktober 2026:** PR #39 memulihkan visibilitas menu dan menambahkan transfer CSV tenant; PPOB tetap dikeluarkan dari rilis awal. Pemecahan bundle terbaru lulus lint dan build; bundle utama berukuran 105.07 kB (31.32 kB gzip). Build masih memberi peringatan untuk chunk renderer PDF 1.46 MB (488.38 kB gzip), yang diunduh saat kartu PDF diminta. Setelah perubahan ini, guard runtime Supabase tanpa Firebase lulus (96 modul/26 rute), pemeriksaan redirect pemulihan kata sandi lulus, dan undangan Wali lulus tujuh skenario. UAT browser belum lulus: `localhost:4179` menampilkan UI lama dan port tersebut menolak peluncuran source terbaru dengan `EADDRINUSE`. `.env` VQE ada di checkout UAT terpisah tetapi tidak di worktree PR; nilainya tidak disalin atau ditampilkan. Server source PR yang sempat berjalan pada `127.0.0.1:3000` tidak lagi memiliki listener saat diperiksa ulang; `/health/ready` gagal tersambung. Upaya menjalankan source terbaru di port 4179 gagal dengan `EADDRINUSE`; proses pemilik port tidak dihentikan. Server uji di port 4181 hanya dapat diikat dari lingkungan Codex dan tidak dapat dijangkau browser in-app, lalu dihentikan. UAT visual source PR terbaru masih belum dilakukan dan harus dijalankan dari workstation yang sama dengan server. Source menambahkan opsi `HOST` agar server lokal dapat dibatasi ke loopback; default deployment tetap `0.0.0.0`. Uji CSV/paginasi Master Data, skrip logika/kontrak, migration preflight, dan guard schema API privat tercatat lulus pada source sebelumnya di PR. `npm run test:db` belum menjalankan pgTAP karena Docker/Podman dan database lokal `127.0.0.1:54322` tidak tersedia. Audit baca-saja VQE mengonfirmasi 116 versi/nama migration serta SQL statement yang cocok dengan 116 file lokal setelah normalisasi komentar/whitespace; enam entri ledger yang menyimpan satu string penuh dipecah kembali sebelum dibandingkan. Status RLS, grant, advisor, dan batas akses Production dirinci di bawah. Tidak ada perubahan database Production dan auto-deploy tetap OFF.

> **Pembaruan verifikasi — 1 November 2026, head PR #39 `1ae7cff`:** GitHub Actions run [#41214665504](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41214665504) lulus 3/3 job. Validasi lokal pada checkout yang sama juga lulus: `npm run lint`, `npm run build`, `npm run test:master-data-transfer-csv`, `npm run test:master-data-pagination`, dan `npm run test:supabase-runtime-no-firebase` (97 modul frontend, 26 rute Supabase). Build mempertahankan peringatan chunk renderer PDF 1.46 MB. Instalasi npm lokal gagal karena registry tidak dapat di-resolve; validasi dilakukan dengan dependensi dari checkout ber-lockfile identik. Audit SQL baca-saja terbaru pada VQE: 161/161 tabel mengaktifkan RLS; 156 tidak memiliki policy; hanya lima tabel memberi `SELECT` kepada `authenticated` (`candidate_documents`, `candidates`, `profiles`, `tenants`, `user_profiles`), semuanya dibatasi policy RLS; tidak ada grant tabel `anon`, grant `INSERT` `authenticated`, atau fungsi yang dapat dieksekusi `anon`/`authenticated`. Kandidat dan dokumen PPDB hanya terbaca oleh Admin tenant dengan izin modul PPDB. Security Advisor tetap memperingatkan perlindungan kata sandi bocor belum aktif. Percobaan source PR pada `127.0.0.1:4182` sebelumnya tidak dapat dijangkau browser. Pada 1 November source PR #39 berhasil dimulai pada `127.0.0.1:4179` (log server menyatakan listening), tetapi probe `/health/ready` dari lingkungan Codex gagal tersambung. Server uji dihentikan setelah pemeriksaan; UAT visual/login tetap belum terverifikasi karena batas jaringan antara server dan browser. Tidak ada perubahan database Production.
>
> **Rekaman verifikasi historis — 1 November 2026 (head lokal `1ae7cff`):** PR #39 masih Draft/Open. Source aplikasi commit `13b913ef4e94e8cc2d2e6cd55cdf1ef46454e470` lulus GitHub Actions run [#41248316409](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41248316409); pembaruan checkpoint itu hanya mengubah dokumentasi. Chrome saat itu menampilkan sidebar modul serta lima tab Data Induk. Templat CSV dan ekspor CSV tanpa PII sudah diunduh; alur impor belum diverifikasi di UI. Preview memakai worktree lokal dengan perubahan belum di-commit, sehingga tidak membuktikan source PR resmi. Di VQE, 117 versi remote dibandingkan dengan 117 file source; satu mismatch: remote-only `20261031225438`, source-only `20270213000000`. SQL audit feed sudah terpasang dan 14/15 postcheck lulus; hanya pemeriksaan metadata versi yang gagal. Ikuti langkah repair CLI history-only di [runbook VQE](../06_DATABASE/VQE_STAGING_MASTER_DATA_AUDIT_MIGRATION_2026-11-01.md). PTSAS Production tidak disentuh.
>
> Bagian di bawah yang merujuk head, jumlah migrasi, atau hasil pemeriksaan sebelumnya adalah riwayat checkpoint. Gunakan status terbaru di atas jika ada perbedaan.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Pembaruan 31 Oktober 2026 — menu dan konfigurasi runtime

Perbaikan menu Data Induk, daftar izin Admin, dan visibilitas submenu Asrama berada di PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), branch `codex/menu-parity-import-export-20261031`, Draft/Open di atas PR #38. Lima tab Data Induk dan kategori terkait kembali terlihat di mode Supabase; kategori yang dikelola modul lain mengarah ke modul tersebut. Lima bagian Asrama tetap terlihat saat gerbang runtime ditutup dan menampilkan alasan/flag yang perlu disiapkan, bukan layar kosong. `Jejak Audit` tetap ditandai belum tersedia karena API audit tenant Supabase belum ada. Pengaturan platform tetap Superadmin-only, dan modul tenant yang ditolak secara eksplisit pada profil Admin ditampilkan dalam daftar pembatasan.

Audit langsung terhadap referensi AI Studio menemukan submenu yang belum terlihat di Akademik, CBT, LMS, HCM, Alumni, dan Perpustakaan Digital. PR #39 sekarang menambahkan submenu/status untuk area tersebut: API yang sudah ada tetap memakai jalur Supabase; area tanpa API menampilkan batasan dan tidak menyajikan simulasi. Lihat [audit paritas referensi AI Studio](AI_STUDIO_REFERENCE_PARITY_AUDIT_2026-10-31.md) untuk peta seluruh modul, pengarah submenu, dan pekerjaan backend yang masih diperlukan. Audit itu juga mencatat PPOB sebagai pengecualian rilis awal sesuai keputusan pemilik produk.

Pemeriksaan browser pembanding tanggal 31 Oktober adalah snapshot historis: referensi AI Studio terbuka dengan peran Super Admin, sedangkan `localhost:4179` menggunakan Admin UAT. Admin melihat 25 menu; Settings memang dibatasi untuk Superadmin dan PPOB sengaja dikeluarkan dari rilis awal. Preview ketika itu masih memakai banner lama, toggle Entities/Structure, dan kategori Santri. Source branch yang dibandingkan ketika itu memuat lima tab Data Induk dan transfer CSV; penempatan menu diubah pada checkpoint 1 November di bawah. Preview lama tidak membuktikan paritas/UAT. Koneksi shell ke `localhost:4179` ditolak; `.env` VQE juga tidak tersedia. `npm run preview` hanya menjalankan Vite static preview; `npm run dev` menjalankan Express/API sekaligus Vite. Untuk uji integrasi, jalankan server penuh dari branch PR #39 pada port terpisah dengan `.env` staging VQE, tunggu `/health/ready` berstatus `ready`, lalu ulangi UAT. Jangan gunakan port `4179` sebagai bukti backend siap.

Guard frontend mencocokkan 26 tujuan menu/rute Supabase. Perapihan konfigurasi juga menghapus flag browser `VITE_SUPABASE_*_RUNTIME_ENABLED` inert dari `.env.example`; hanya flag pada allowlist runtime publik yang boleh dikonfigurasi browser. Semua sakelar server tetap fail-closed. Lihat [panduan visibilitas menu dan flag runtime](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md).

Pada source PR #39, `npm run test:customer-deployment-flags` lulus (30 nilai browser allowlist dan 37 gerbang server fail-closed); `npm run test:supabase-runtime-no-firebase` lulus (96 modul, 26 rute Supabase, 26 rute impor lama yang ditutup); `npm run lint`, `npm run build`, dua uji Master Data, 33 skrip uji logika/kontrak, `npm run test:migration-preflight`, `npm run test:private-api-schema`, dan `git diff --check` juga lulus. Parser preflight kini membagi setiap elemen SQL ledger yang berisi satu file penuh sebelum perbandingan dan mempertahankan elemen kosong sebagai mismatch. Konfigurasi workflow pada branch dasar PR #38 kini mencakup PR yang menargetkan branch apa pun; periksa status Actions pada head terbaru sebelum merge. Pemeriksaan pgTAP belum berjalan karena Docker/Podman dan database lokal tidak tersedia. Audit baca-saja VQE kini membandingkan SQL migration secara penuh setelah normalisasi; hasilnya dijelaskan pada bagian staging. Tidak ada perubahan Production.

## Pemeriksaan tambahan staging — keamanan dan kinerja

Pemeriksaan ini memakai konektor dan SQL `SELECT` baca-saja pada VQE staging (`vqemuyzveuirlkvdggjd`) tanggal 31 Oktober 2026; tidak ada data operasional, kebijakan, atau konfigurasi yang diubah.

- Katalog PostgreSQL menunjukkan **161 tabel `public`; semua mengaktifkan RLS**. Hanya lima kebijakan tersedia dan semuanya untuk `authenticated`: baca sendiri/tenant pada profil dan tenant, serta baca kandidat/dokumen PPDB oleh Admin berizin. Tidak ditemukan kebijakan `anon` atau ekspresi `true` pada kebijakan tersebut.
- Grant Data API baca-saja setelah kebijakan exposure Supabase berubah: **156 relasi publik** memiliki grant untuk `service_role`; lima tabel tenant/profil/kandidat yang dipakai browser hanya memberi `SELECT` kepada `authenticated`; tidak ada grant tabel untuk `anon`. Tidak ada fungsi publik yang dapat dieksekusi oleh `anon` atau `authenticated`, sementara jalur server `service_role` memiliki grant eksplisit. Temuan ini selaras dengan migrasi `20261205000000_data_api_default_privilege_hardening.sql` dan tidak membuka akses publik. Semua migration baru tetap harus memberi grant minimal secara eksplisit, karena tabel baru tidak lagi otomatis mendapat grant Data API. Lihat [changelog Supabase](https://supabase.com/changelog?types=breaking-change) dan [panduan pengamanan Data API](https://supabase.com/docs/guides/api/securing-your-api).
- **Jangan menambah kebijakan umum untuk menghilangkan temuan linter.** RLS tanpa kebijakan menolak akses langsung secara default; runtime harus terus melayani tabel operasional melalui endpoint server yang memverifikasi bearer token, profil aktif, role, izin modul, dan tenant. Karena server memakai kunci istimewa yang melewati RLS, setiap endpoint dan mutasinya tetap harus diaudit/UAT. Akses langsung `authenticated` dibatasi ke lima tabel yang disebut pada pembaruan 1 November, dengan RLS dan policy per pengguna/tenant/role; operasi tulis dan jalur aplikasi lain tetap melalui endpoint server. Unggah berkas memakai URL bertanda tangan.
- Security Advisor memberi peringatan **Leaked Password Protection Disabled**. Aktifkan pemeriksaan kata sandi bocor di Authentication → Settings → Password Security pada lingkungan staging dan Production sebelum pilot, lalu catat hasilnya. Pengaturan Production belum dapat diperiksa oleh konektor.
- Performance Advisor menandai **238 foreign key tanpa indeks penutup**. Tim backend perlu menilai indeks untuk foreign key jalur kueri/penghapusan yang sering dipakai dengan `EXPLAIN (ANALYZE, BUFFERS)` dan data sintetis berukuran realistis. Hindari membuat seluruh indeks tanpa tinjauan karena biaya tulis/ruang dan pola gabungan dapat berbeda.
- **81 indeks tampak belum digunakan.** Staging belum menerima beban operasional sehingga temuan ini belum cukup untuk menghapus indeks. Pertahankan sampai workload representatif dan statistik produksi/benchmark tersedia; kemudian evaluasi indeks satu per satu.

Gate khusus: sebelum menyatakan kontrol akses matang, jalankan tes endpoint untuk semua role/tenant serta uji penolakan lintas tenant pada server API. Temuan RLS tanpa kebijakan bukan kegagalan akses bila jalur broker benar-benar tunggal; itu juga bukan bukti bahwa API aman dengan sendirinya.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Status project `ACTIVE_HEALTHY`. Pemeriksaan terbaru menemukan 117 versi remote dan 117 file source; hanya metadata migration audit feed yang tidak selaras (`20261031225438` vs `20270213000000`). SQL audit feed sudah terpasang; 14/15 postcheck lulus, hanya cek versi ledger gagal. Perbaiki metadata melalui Supabase CLI sesuai [runbook VQE](../06_DATABASE/VQE_STAGING_MASTER_DATA_AUDIT_MIGRATION_2026-11-01.md). Fixture UAT sebelumnya sudah dibersihkan. Integrasi GitHub VQE sudah terputus. Dashboard menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE mencatat lima migration PR #38 dan satu migration PR #39 yang belum digabung. Jangan menyebut VQE setara dengan `main`; kecocokan SQL yang dibuktikan di atas hanya membandingkan ledger VQE dengan source lokal PR, bukan dengan keadaan `main` atau Production PTSAS. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Lanjutkan UAT sintetis di VQE:** tenant dan profil Admin uji pernah diverifikasi; jangan membuat tenant atau akun Admin duplikat. Worktree PR #39 saat checkpoint tidak memiliki `.env` staging dan tidak menjalankan server di 4179. Siapkan konfigurasi VQE yang terisolasi pada secret manager atau `.env` diabaikan Git, mulai server di port pemeriksaan, dan tunggu `/health/ready` menunjukkan `ready` sebelum UAT. Jangan menggunakan `.env` checkout kanonis yang menunjuk ke PTSAS Production, kredensial pelanggan, atau data Production.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Query-query di dalamnya sudah divalidasi sebagai SELECT pada VQE staging; skrip belum dijalankan pada PTSAS. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Konfigurasi staging dan status Auth

Di checkout lokal kanonis yang diperiksa, file `.env` yang diabaikan Git menunjuk ke PTSAS Production (`ptsasgdvgrbdtgyqieie`), bukan VQE. Target Supabase yang dipakai halaman `localhost:4179` belum dapat dipastikan; login sukses tidak membuktikan targetnya. Jangan gunakan halaman/checkout itu untuk UAT atau memasukkan data. Jalankan UAT hanya dari checkout terpisah yang dikonfigurasi khusus ke VQE; jangan menampilkan atau menyalin secret, kunci PII, maupun nilai Production. Email Auth bawaan VQE pernah mencapai `over_email_send_rate_limit`; untuk beberapa putaran UAT, tim dapat mengonfigurasi SMTP khusus di Authentication → Emails → SMTP Settings. Simpan kredensial SMTP hanya di dashboard/secret manager, jangan di chat atau bundle klien. Panduan rinci ada di [runbook email Auth](SUPABASE_AUTH_EMAIL_DELIVERY_RUNBOOK.md).

Untuk alur UAT yang mencakup login Wali, tagihan, bukti, dan onboarding, konfigurasi server/browser mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_PPDB_TENANT_ID`, `PII_ENCRYPTION_KEY`, dan `PII_FINGERPRINT_KEY`. Buat kedua kunci PII secara acak dan independen, masing-masing 32 byte/64 karakter hex. Atur flag server dan pasangannya yang berawalan `VITE_` sesuai skenario PPDB, dokumen, finance bill, serta onboarding; semuanya harus tetap mati di Production sampai ada rencana rilis yang disetujui. Pendaftaran Wali memakai `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`; `PUBLIC_PPDB_ENABLED` hanya diperlukan jika UAT juga menguji pendaftaran calon santri publik. Kunci PII dan `SUPABASE_SECRET_KEY` tidak boleh masuk bundle klien.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- CI lulus 3/3 pada head source `af9db8378e91c62b682e44e994302abd24f026c2` ([run `41184875367`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367)): instalasi NPM, frontend/build/Docker guard, migrasi, API Auth/tenant, pgTAP, dan backup/restore.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- Tenant sintetis dan profil Admin aktif pernah diverifikasi langsung di VQE dengan kueri baca-saja. Login Admin melalui UI berhasil, tetapi target Supabase browser belum terverifikasi; `/health/ready` mengembalikan `unavailable`. File `.env` checkout lokal kanonis yang diperiksa sekarang menunjuk ke PTSAS Production, sehingga checkout dan preview tersebut tidak aman untuk UAT. Profil Wali, kandidat, relasi, tagihan, upload, onboarding, dan isolasi tenant melalui UI belum diuji. Fixture baru dibuat setelah readiness pulih dan dihapus sesudah UAT.
- PTSAS belum dapat diaudit ulang melalui konektor; percobaan `get_project` terbaru ditolak akses. Snapshot Production di dokumen lama tetap historis. Tidak ada perubahan Production.
- PPOB/payment gateway dikeluarkan dari rilis awal.
- Persentase penyelesaian keseluruhan tidak dihitung dari kemajuan schema atau CI saja.

## Kepemilikan pekerjaan

| Pekerjaan | Pemilik |
| --- | --- |
| Source aplikasi, perbaikan, PR dan CI | Pengembang aplikasi |
| Provisioning sintetis, akses staging, inventaris, backup | Tim backend |
| UAT fungsi pesantren dan persetujuan hasil | Tim backend dan perwakilan pesantren |
| Instalasi VPS/on-premise, operasi, runbook | Tim backend/penerapan |
| Rekonsiliasi serta deployment PTSAS Production | Tim backend/penerapan setelah rencana disetujui |

Dokumen terkait: [temuan redirect Auth Production](PRODUCTION_AUTH_REDIRECT_CHECKPOINT_2026-10-31.md), [checkpoint staging PR #38](../06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md), [audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).

## Runbook singkat: preview login berhasil tetapi readiness 503

**Temuan browser 31 Oktober 2026:** login Admin UAT pernah berhasil, tetapi `http://localhost:4179/health/ready` mengembalikan `{"status":"unavailable"}` dan dashboard belum dapat membaca data. Tampilan yang kini masih terbuka pada port 4179 juga berasal dari UI lama. Percobaan memulai source PR terbaru pada port itu gagal `EADDRINUSE`; proses lama tidak dihentikan. Target backend/client pada browser belum terbukti staging. Jangan gunakan port 4179 atau memasukkan data hingga target diverifikasi.

Untuk mengisolasi API server tanpa menghentikan proses lama:

1. Buka PowerShell baru pada **checkout terpisah dan bersih PR #38 khusus staging**, bukan checkout kanonis yang file `.env`-nya menunjuk ke Production. Di root repository, pastikan file lokal `.env` ada dan diabaikan Git:
   ```powershell
   Test-Path .env
   git check-ignore .env
   ```
   Jangan tampilkan isi `.env`, jangan commit, dan pastikan `SUPABASE_URL` serta `VITE_SUPABASE_URL` menghasilkan host `vqemuyzveuirlkvdggjd.supabase.co`. Jangan gunakan URL/key PTSAS Production.
2. Pastikan dua variabel server terbaca tanpa mencetak nilainya:
   ```powershell
   node -r dotenv/config -e "for (const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']) { const value = process.env[name]; console.log(name + ': ' + (name.endsWith('_URL') && value ? new URL(value).host : value ? 'set' : 'missing')); }"
   ```
   Bila dependensi belum terpasang, jalankan `npm ci` terlebih dahulu. Perintah ini hanya memasang paket dari lockfile.
3. Jalankan server API dari root repository pada port default VQE. Ikat server ke loopback agar endpoint dengan secret VQE tidak terbuka ke jaringan lokal:
   ```powershell
   $env:PORT = '3000'
   $env:HOST = '127.0.0.1'
   npm run dev
   ```
   Skrip `dev` menjalankan `tsx server.ts`; server memuat `.env` dari direktori kerja. Pastikan `APP_URL` dan `PUBLIC_APP_URL` mengarah ke `http://localhost:3000`, sesuai Site URL/redirect VQE. Biarkan terminal ini terbuka agar log readiness terlihat.
4. Di PowerShell kedua, periksa endpoint:
   ```powershell
   curl.exe -i http://127.0.0.1:3000/health/ready
   ```
   Lulus jika respons `HTTP 200` dan `{"status":"ready"}`. Respons `503` berarti identity store masih gagal diperiksa.
5. Jika tetap 503, lihat terminal server untuk log `Supabase identity readiness check failed`. Log hanya memuat tipe error serta penanda apakah URL dan secret tersedia, bukan nilainya. Perbaiki konfigurasi/profil/akses staging berdasarkan error tersebut; jangan tempel secret atau isi lengkap log sensitif ke tiket.
6. Setelah health 200, buka `http://localhost:3000/` dan verifikasi login serta dashboard. Jalur password-recovery tidak perlu diulang. Jika health 200 tetapi data modul tetap gagal, periksa flag runtime modul dan log API secara terpisah; readiness hanya membuktikan identity store merespons, bukan seluruh modul UAT.

Server menghormati `HOST`; jika tidak diatur, default tetap `0.0.0.0` untuk deployment/container. Untuk UAT lokal, gunakan `HOST=127.0.0.1`. Port `3000` cocok dengan Site URL VQE pada konfigurasi saat ini. Gunakan hanya konfigurasi staging VQE. Jangan memasukkan `SUPABASE_SECRET_KEY`, kunci PII, atau nilai Production ke klien Vite.





## Checkpoint browser, CI, dan urutan PR — 1 November 2026

- Browser lokal `http://localhost:4179/` kini berhasil menampilkan aplikasi pada sesi **Admin UAT**. Sidebar memuat Data Induk dan modul lain; halaman yang terlihat adalah Akademik dengan status `Runtime Akademik Supabase belum diaktifkan operator`. Ini membuktikan halaman UI dapat dibuka, tetapi belum membuktikan koneksi API/tenant Supabase sehat atau modul operasional aktif. Belum ada write database atau perubahan Production.
- CI PR #39 terakhir lulus pada head `7d24d7d` (run #1087). Setelah itu commit `d99b299` menyelaraskan satu perubahan workflow: pemicu `pull_request` tidak lagi dibatasi hanya target `main`. Pada saat checkpoint ini belum ada status/run CI untuk `d99b299`; jangan menyebut commit terbaru lulus CI sampai run baru selesai.
- PR #38 masih Draft/Open dengan head `a05ea63`; PR #39 masih Draft/Open dengan head `d99b299`, base `codex/continue-erp-hardening-20261031`. PR #39 dibangun di atas base lama `0648b96`; perbandingan commit masih menunjukkan PR #39 tertinggal satu commit induk. Konten aturan workflow sudah diselaraskan, tetapi ancestry branch belum tersinkron. Jangan merge atau menutup keduanya sebelum review dependency, UAT staging, dan pemeriksaan source terbaru.
- Untuk pertanyaan pemilik tentang “sudah terbuka namun bila masuk”: dari browser, sesi sudah berada di dashboard Admin UAT, bukan form login. Minta nama menu/alur dan pesan yang muncul bila masalah terjadi setelah membuka fitur tertentu. Jangan minta atau mencatat kata sandi.
- **Checkpoint terukur:** PR #38 tetap **75% (3 dari 4 gerbang internal)** sesuai metodologi dokumen ini; UAT wali/tenant dan pemeriksaan yang bergantung padanya masih tersisa. Tidak ada persentase keseluruhan ERP yang dapat dibuktikan dari CI atau satu sesi browser.


## Pembaruan CI dan postcheck VQE — 1 November 2026

- Head PR #39 `6365ce9a30fa67079f3968ebbd667e0734d6e10d` lulus GitHub Actions run [#1089](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41252653652), **3/3 job**: build frontend dan guard Firebase, instalasi NPM, serta migration/API auth/pgTAP. Ini berarti gerbang CI otomatis pada checkpoint itu 100%; ini bukan UAT atau persetujuan merge.
- PR #38 head `a05ea63` dan PR #39 head `6365ce9` masih Draft/Open. PR #39 masih tertinggal satu commit induk terhadap PR #38; aturan workflow sudah tersalin ke branch anak, tetapi commit graph belum menyatu. Jangan merge sebelum dependency ini ditinjau dan UAT selesai.
- Pemeriksaan baca-saja Supabase VQE saat ini menunjukkan 117 versi migration. Satu selisih tetap ada: remote `20261031225438` bernama `master_data_audit_feed`, sedangkan file source bernama `20270213000000_master_data_audit_feed.sql`. Postcheck SQL baca-saja di VQE lulus **14/15**; satu-satunya gagal adalah `migration_version_recorded`. Semua check tabel, RLS/FORCE RLS, privilege, trigger, immutability, dan RPC actor-aware lulus. Ikuti prosedur `supabase migration repair` history-only pada runbook VQE; jangan menjalankan ulang DDL dan jangan mengubah Production.
- Supabase CLI tidak tersedia pada checkout `erp4-pr38-uat`; checkout itu juga memiliki perubahan lokal, tidak memiliki file migration audit feed, dan belum terhubung ke project ref. Jangan menjalankan repair dari checkout tersebut. Gunakan checkout source PR yang bersih, pastikan ref VQE `vqemuyzveuirlkvdggjd`, lalu ikuti runbook. Jangan menaruh token/password di Git, command history, log, atau chat.
- Browser menampilkan dashboard Admin UAT pada `localhost:4179`; halaman Akademik masih menyatakan runtime Supabase belum diaktifkan. Probe `/health/ready` dan `/runtime-config.json` dari shell Codex diblokir oleh izin socket lokal, sehingga health endpoint dan target project browser belum terverifikasi. Jangan menganggap sesi Admin UAT saja sebagai bukti UAT backend.
- Inventaris konfigurasi lokal hanya mencatat host, keberadaan nilai, dan flag—tidak membaca atau menampilkan nilai secret. Checkout UAT lama menunjuk ke VQE dan memiliki secret/PII key; flag Akademik dan Master Data tidak aktif. Checkout kanonis menunjuk ke Production. Konfigurasi checkout tersebut tidak membuktikan proses preview yang sedang terbuka memakai target yang sama.
- **Checkpoint:** CI PR #39 pada commit `6365ce9` 100% (3/3 job). UAT UI/API, sinkronisasi commit induk, dan rekonsiliasi ledger VQE masih terbuka; persentase keseluruhan ERP tidak dihitung dari CI saja.

## Pembaruan penempatan menu — 1 November 2026

- Head PR #39 sekarang `26b4b97cceb5dff9708652d878eb95f1a543f7ad`. Master Data hanya memuat Santri, Struktur, dan Jejak Audit; strip dan tombol pengalihan ke modul lain dihapus.
- Wali berada di CRM; Pengajar/Mata Pelajaran/Kurikulum di Akademik; Pegawai di SDM; Alumni di modul Alumni; Yayasan/unit pesantren di Manajemen Multi-Unit; Halaqah di Tahfidz; Pemesanan Fasilitas di Sarana & Prasarana.
- Referensi Pengajar/Mata Pelajaran/Kurikulum baca-saja karena API katalog belum tersedia. Jangan menganggapnya sebagai CRUD.
- Pemeriksaan lokal pada source yang sama lulus: `npm run test:supabase-runtime-no-firebase` (98 modul), `npm run lint`, `npm run build`, dan `git diff --check`. Peringatan chunk PDF 1,46 MB masih ada.
- GitHub Actions run [#1091](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41259171340) lulus **3/3 job**: build/typecheck/guard Firebase dan Docker customer-managed, instalasi NPM pelanggan, serta migration/pgTAP/API/Storage/backup-restore sintetis. Ini bukan pengganti UAT UI atau staging.
- Pemeriksaan visual pada preview `localhost:4179` kini memperlihatkan Data Induk tanpa strip “Data terkait”; panel/tautan pengalihan tidak terlihat. Ini hanya spot-check tampilan, bukan bukti source preview, login, atau backend tenant sudah tervalidasi. Postcheck VQE sebelumnya masih memiliki satu mismatch metadata migration. Tidak ada perubahan database Production.
- PR #39 tetap Draft/Open. UAT login Admin dan baca-tulis tenant masih perlu dijalankan pada environment staging yang source serta target backend-nya dapat diverifikasi.
- **Persentase keseluruhan tetap:** sekitar **73% kematangan fitur** dan **46% kesiapan release/go-live**, menurut checkpoint produk terakhir. Ini bukan metrik per-job CI.


## Status Advisor staging VQE terbaru — 1 November 2026

Performance Advisor saat ini mencatat 258 foreign key tanpa indeks penutup penuh, 98 indeks yang belum terpakai, dan satu indeks duplikat pada `document_records`. Pemeriksaan katalog menemukan 522 FK pada 148 tabel; 27 dari 285 FK tanpa indeks penuh hanya memiliki partial index yang cocok. Temuan ini belum menjadi alasan untuk menambah ratusan indeks atau menghapus indeks, karena workload staging belum representatif. Lihat [tinjauan Performance Advisor VQE](../06_DATABASE/VQE_PERFORMANCE_ADVISOR_REVIEW_2026-11-01.md) untuk metodologi, migration duplikat yang belum diterapkan, gate benchmark, serta tindak lanjut keamanan. PR #40 masih Draft; CI terakhir lulus 3/3 job, sementara UAT antarmuka Admin staging menunggu konfigurasi secret VQE lokal. PTSAS Production tidak disentuh.
