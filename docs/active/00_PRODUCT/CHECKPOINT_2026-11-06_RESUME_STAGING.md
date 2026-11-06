# Checkpoint Pengembangan — 6 November 2026, 22.20 WIB

## Status saat dilanjutkan — 6 November 2026, 23.43 WIB

- PR #40 tetap **Open, belum merged**. Source aplikasi terakhir diuji `c61825935c49b642d8bed08b16e7c428a73add15`; head dokumentasi/CI saat ini `fd2ccb5ff1c83842a57c19d455a6f00171d1b2d6` menambahkan retry jaringan untuk unduhan kunci PostgreSQL.
- CI [#1196](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42254448795) lulus **3/3 job** pada head tersebut. Frontend build/Firebase bundle guard, instalasi NPM pelanggan, replay Production-baseline sintetis, migrasi/API Auth/isolasi tenant, pgTAP, Finance, Storage, konkurensi, backup/restore lokal CI, dan Docker smoke test lulus. Ini bukan UAT browser atau pengujian database Production.
- CI #1195 sebelumnya berhenti saat unduhan kunci apt PostgreSQL terputus; retry di #1196 menyelesaikan masalah lingkungan itu.
- Snapshot CSV Production pukul 17.38 WIB: ledger 47 versi dibanding 136 file source (89 belum tercatat); dua migration lama memiliki efek DDL yang belum ada. Production tidak disentuh.
- VQE: 136 ledger rows, yakni 135 versi canonical plus alias `20261106151606` untuk DDL source `20270304000000`. Jangan ulang DDL; rekonsiliasi satu baris metadata tetap menunggu operator.
- Belum ada bukti UAT browser Admin/Wali yang selesai. Beberapa submenu di audit paritas masih belum mempunyai backend (mis. E-Rapor, OCR, payroll, dan sejumlah alur CBT/LMS/multi-unit); UI statusnya tidak berarti fiturnya selesai. Jangan merge/cutover sebelum UAT, inventaris baca-saja terbaru Production, backup/restore terbukti, dan rehearsal/dry-run ditinjau. Manual operator ditunda sampai pengguna aktif sekitar 05.00 WIB.


## Pembaruan checkpoint — 6 November 2026, 22.28 WIB

- CI #1184 `42242584323` selesai **3/3 job lulus** pada head `2845d025ae5b96617e6544141263f0a9ad4d63ae` (perubahan dokumentasi). Job database menjalankan replay Production-baseline sintetis; NPM install; frontend typecheck/build, Firebase runtime guard, dan Docker smoke tests. Source aplikasi di dalamnya sama dengan `c61825935c49b642d8bed08b16e7c428a73add15`, yang juga lulus 3/3 pada #1182.
- Organisasi Supabase VQE diverifikasi berpaket Free. Leaked-password protection memerlukan Pro menurut dokumentasi Supabase; tidak ada upgrade atau perubahan billing dilakukan.
- Tes konkurensi penempatan kamar dan penguncian konfigurasi referensi selesai lulus. Status ini hanya membuktikan pipeline pada source PR; UAT browser belum dilakukan.
- Security/Performance/Health Advisor VQE dibaca ulang pukul 15:25 UTC: 162 temuan RLS tanpa policy (fail-closed, tanpa grants table ke role API), satu WARN perlindungan kata sandi bocor, 258 FK tanpa indeks pendukung, 95 peringatan unused-index, dan 0 temuan health.
- PR #40 masih terbuka dan siap ditinjau. Production tetap tidak berubah; VQE tetap memiliki satu baris migration alias `20261106151606` untuk source `20270304000000`. Tidak ada DDL yang dijalankan ulang.
- Tindakan operator ditunda hingga pemilik aktif sekitar pukul 05.00 WIB: persetujuan rekonsiliasi **satu baris ledger VQE** dan aktivasi perlindungan kata sandi bocor pada Auth VQE. Jangan lakukan tindakan tersebut terhadap Production.


Dokumen ini menjadi status terbaru untuk melanjutkan pekerjaan. Catatan historis yang lebih lama di PR #40 harus dibaca sebagai snapshot pada tanggalnya; checkpoint ini menggantikannya untuk status CI, staging, dan migration.

## Sumber dan CI

- Sumber review adalah PR #40 pada branch `codex/menu-owner-placement-20261101`; Production `main` tidak berubah.
- Head kode yang sudah diuji: `c61825935c49b642d8bed08b16e7c428a73add15`.
- GitHub Actions [run #1182](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42240030473) lulus **3/3 job** pada head tersebut: uji database/API, instalasi dependency, serta build/frontend dan smoke test.
- Cakupan job database mencakup replay migration pada baseline sintetis, 67 berkas pgTAP/1.643 assertions, tes race NIS/Tahfidz/kapasitas kamar, tenant dan status gedung, API Auth/isolasi tenant, Finance, Storage, dan backup/restore lokal CI. Ini bukan pengganti UAT aplikasi di browser atau rehearsal Production.
- PR #40 masih terbuka dan siap ditinjau; belum di-merge. Riwayat PR #38/#39 tetap terkonsolidasi di PR #40.

## Perubahan dan verifikasi VQE staging

- Migration source `20270304000000_student_room_assignment_reference_locks.sql` telah diterapkan ke VQE `vqemuyzveuirlkvdggjd`; Production `ptsasgdvgrbdtgyqieie` tidak disentuh.
- Fungsi yang diperbarui menahan perubahan status tenant selama transaksi dan memakai row lock pada referensi gedung/kelas sehingga validasi relasi tidak berlomba dengan perubahan konfigurasi.
- Verifikasi katalog baca-saja: `assign_student_to_room` dapat dieksekusi hanya oleh `service_role`; core `onboard_accepted_ppdb_candidate` tidak diekspos ke role API; wrapper Admin tepercaya dapat dipanggil hanya oleh `service_role`; tidak ada izin eksekusi untuk `anon` atau `authenticated`.
- **Rekonsiliasi ledger belum selesai.** Supabase MCP mencatat SQL migration baru dengan alias versi waktu `20261106151606`, sedangkan versi source adalah `20270304000000`. Daftar VQE kini memiliki 136 baris: 135 versi source sampai `20270303000000`, ditambah satu alias tersebut. SQL/fungsi sudah diterapkan, tetapi ledger belum canonical. Jangan menjalankan ulang DDL; perbaiki hanya metadata versi alias setelah ada konfirmasi pengguna saat ia aktif pukul 05.00 WIB.
- Hasil uji GitHub #1182 berasal dari source migration canonical pada commit `c618...`; status ledger staging yang beralias perlu dibereskan terpisah.

## Temuan security dan performa VQE

- 162 tabel memiliki RLS aktif tetapi tanpa policy. Pemeriksaan grant membuktikan tabel-tabel tersebut tidak memberi akses table kepada `anon` maupun `authenticated`; keadaan ini fail-closed. Jangan menambah policy secara massal hanya untuk menghilangkan temuan INFO.
- Advisor memberi peringatan bahwa perlindungan kata sandi bocor belum aktif. Organisasi VQE terverifikasi memakai paket **Free**; dokumentasi Supabase menyatakan pemeriksaan kata sandi bocor tersedia mulai paket Pro. Jangan upgrade atau menimbulkan biaya tanpa keputusan pemilik. Pada paket Free, gunakan kebijakan password kuat yang tersedia; evaluasi paket/mitigasi untuk Production sebelum pengguna nyata. [Dokumentasi resmi](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Advisor performance menandai 258 foreign key tanpa indeks B-tree pendukung dan 95 indeks yang belum dipakai. Angka indeks tidak boleh diperbaiki massal: ukur workload skala pesantren besar, periksa duplikasi/fungsi indeks dan dampak lock, lalu usulkan batch yang terukur. Peringatan indeks belum terpakai berisiko rendah pada staging berisi sedikit data.
- Health advisor tidak melaporkan lint aktif pada pemeriksaan sebelumnya.

## Status Production dan batas migrasi

- Inventaris baca-saja Production yang diberikan pemilik sebelumnya mencatat 47 baris ledger dibanding 136 file migration source; selisih 89 versi ledger **bukan** bukti bahwa semua DDL belum diterapkan.
- Dua migration `20261031104213` dan `20261031225438` terbukti memiliki objek DDL yang belum ada di Production. Efek inti dua migration lain yang tercatat tanpa nama/payload sudah ditemukan.
- Pemeriksaan belum merupakan perbandingan katalog lengkap. Backup/restore Production dan `db push --dry-run` langsung terhadap Production belum diverifikasi. Jangan menjalankan DDL, `db push`, atau perbaikan ledger di Production.
- Tim backend yang punya akses Production harus meninjau PR #40, melakukan inventaris katalog lengkap, membuktikan backup/restore, lalu menjalankan rehearsal/dry-run pada commit yang sama sebelum membuat rencana cutover.

## Langkah lanjut berurutan

1. Saat pemilik aktif pukul 05.00 WIB, minta persetujuan terbatas untuk merekonsiliasi **satu baris VQE saja** dari `20261106151606` ke `20270304000000`; tidak menjalankan ulang DDL dan tidak menyentuh Production. Jika persetujuan tidak diberikan, biarkan alias dan minta operator backend yang menanganinya.
2. Jangan meminta operator menyalakan leaked-password protection pada VQE Free. Catat sebagai batasan paket; pemilik/tim backend memutuskan upgrade Pro atau mitigasi password policy sebelum Production.
3. Tim backend meninjau source PR #40 dan advisor index; utamakan validasi serta rencana indeks berbasis workload.
4. Jalankan UAT browser Admin/Wali, seluruh navigasi, import/export, relasi Master Data, PPDB, onboarding/NIS, penempatan kamar, Tahfidz, finance, Storage, isolasi tenant, dan responsif. Bersihkan fixture uji setelah selesai.
5. Lengkapi rehearsal Production (inventaris penuh, backup yang dapat dipulihkan, dry-run pada head review, daftar migration yang akan dijalankan). Cutover Production tetap menunggu gate dan operator backend.

## Persentase kemajuan yang dapat dibuktikan

- Validasi otomatis pada head `c618...`: **3/3 job CI (100% dari job pada run #1182)**.
- Penuntasan ledger versi migration terbaru di VQE: **belum selesai (1 alias menunggu rekonsiliasi)**.
- Kesiapan Production/UAT komersial: **belum dinyatakan siap**; UAT browser, audit skema penuh, backup/restore Production, dry-run Production, dan review backend masih terbuka. Persentase keseluruhan produk tidak dihitung dari satu run CI agar tidak memberi angka kesiapan yang menyesatkan.

## Batas perubahan lokal

Worktree `erp4-pr38-40-integration-20261106` berisi perubahan tracked/untracked dan basisnya berbeda dari head PR #40. Jangan push seluruh worktree. Untuk source aplikasi, gunakan branch PR #40; perubahan lokal perlu ditinjau dan direkonsiliasi satu per satu sebelum diambil.

## Checkpoint terbaru — 6 November 2026, 22.50 WIB

- PR #40 masih **Open**, belum di-merge. Head dokumentasi saat mulai checkpoint `58553c2e493d10cf35e0268a2d1e40a7bed064c8`; source aplikasi yang diuji tetap `c61825935c49b642d8bed08b16e7c428a73add15`.
- GitHub Actions **#1187** (`42245703954`) lulus **3/3 job** pada head `58553c2e...`: build/frontend dan Firebase bundle guard, replay migration + API auth + pgTAP, serta instalasi NPM dari lockfile untuk environment pelanggan. Job database juga memverifikasi baseline migration sintetis, isolation/auth, Finance, Storage, backup/restore lokal CI, dan konkurensi NIS/Tahfidz/penempatan kamar.
- Kelulusan tersebut adalah bukti CI pada database lokal sintetis, bukan UAT browser atau verifikasi database Production. Source aplikasi tidak berubah dalam pembaruan ini.
- Sidebar memiliki 25 item di grup modul utama serta item terpisah `Pusat Data Analitik` pada grup Analitik; semuanya terpetakan ke 26 route dan katalog RBAC pada pemeriksaan statis. Tidak ada route tanpa navigasi yang ditemukan. Pemetaan statis tidak membuktikan seluruh aksi UI/runtime sudah lulus UAT.
- Preview lokal pada port 4179/3000 sebelumnya tidak aktif. UAT login Admin/Wali, navigasi pasca-login, dan alur modul di browser masih terbuka.
- VQE `vqemuyzveuirlkvdggjd`: migration kamar `20270304000000` sudah aktif dengan alias ledger `20261106151606`. Jangan jalankan DDL ulang. Rekonsiliasi satu baris ledger dan pengaturan Auth ditunda sampai pemilik aktif setelah pukul 05.00 WIB.
- PTSAS Production `ptsasgdvgrbdtgyqieie` tidak disentuh. Inventaris skema lengkap, backup/restore yang terbukti, rehearsal, serta dry-run Production tetap menjadi gerbang wajib.

## Checkpoint terbaru — 6 November 2026, 22.58 WIB

- CI GitHub Actions **#1188** (`42247038181`) selesai **3/3 job lulus** pada head `dfff6bbd13c10f115cf17b845f087b6ebcf84421`. Tiga job: frontend build/Firebase bundle guard, instalasi NPM untuk environment pelanggan, dan migration replay/API auth/pgTAP.
- Read-only Supabase MCP memastikan ledger VQE berisi **136 baris**; nama migration kamar tersimpan di versi alias `20261106151606`, sedangkan source version adalah `20270304000000`. Versi canonical belum ada di ledger. DDL sudah aktif; jangan jalankan ulang. PTSAS Production tetap tidak diubah.
- Pembacaan metadata migration PTSAS Production ditolak connector dengan `INVALID_ARGUMENT`/permission. Inventaris yang tersedia masih snapshot sebelumnya; tim backend/operator harus menyediakan hasil baca-saja terbaru. Tidak ada akses tulis atau perubahan Production.
- Uji lokal tambahan pada integration worktree yang berbeda dan memiliki perubahan belum commit: TypeScript lint, production build, migration preflight, RBAC, Supabase-only runtime graph, deployment flags, transfer CSV, Naming Series, PPDB CSV, callback registrasi Wali StrictMode, dan konflik jadwal Akademik lulus. Hasil lokal ini bukan pengganti CI pada head PR. Build lulus dengan peringatan chunk PDF besar (~1,46 MB).
- Supabase CLI tidak tersedia sebagai command di workspace, sehingga tes konkurensi kamar lokal tidak dijalankan. CI #1188 mencakup tes konkurensi tersebut pada database Supabase lokal terisolasi.
- UAT browser pasca-login Admin/Wali masih terbuka; localhost:4179/3000 sebelumnya tidak aktif. Sidebar memiliki 25 item modul utama serta item terpisah `Pusat Data Analitik` pada grup Analitik, jadi semua 26 route memiliki navigasi.
- Manual setting dan persetujuan operator ditahan sampai pemilik aktif setelah pukul 05.00 WIB. Jangan menulis ke Production.

## Checkpoint pengembangan terbaru — 6 November 2026, 23.08 WIB

- GitHub Actions **#1191** (`42248646612`) lulus **3/3 job** pada head `602926c548410e2f6af2d0001701d5cf23fd0ece`. Source aplikasi yang diuji tetap `c61825935c49b642d8bed08b16e7c428a73add15`; commit setelahnya hanya dokumentasi.
- Source Sidebar statis memiliki 25 menu modul utama dan item `Pusat Data Analitik` terpisah; total 26 navigasi sesuai 26 route dan RBAC. Semua tombol/form belum dapat disebut teruji sebelum UAT browser.
- VQE masih memiliki 136 ledger rows; migration `student_room_assignment_reference_locks` aktif dengan alias `20261106151606` (source `20270304000000`). **Tidak ada DDL yang diulang.**
- MCP masih menolak baca ledger PTSAS Production. Production tidak berubah; gunakan skrip inventaris baca-saja satu CSV dan minta operator/tim backend menjalankannya saat aktif.
- Integration worktree lokal tetap berbeda dari PR, ada 9 commit lebih depan serta perubahan tracked/untracked. Jangan push seluruh worktree. Lint, build, migration-preflight, dan tes lokal terpilih lulus di sana; itu bukan bukti build source release. Build lokal mencatat chunk PDF besar.
- Supabase CLI tidak ada di PATH maupun `node_modules` lokal; tes konkurensi lokal tidak dijalankan. CI #1191 menguji konkurensi di Supabase lokal terisolasi.
- **Tindakan tertunda setelah pukul 05.00 WIB:** rekonsiliasi satu baris ledger VQE setelah konfirmasi aktif; sediakan inventaris Production baca-saja; nyalakan preview dan jalankan UAT Admin/Wali. Jangan menyentuh Production sebelum inventaris, backup/restore dan rehearsal/dry-run ditinjau.

## Rekonsiliasi terbaru ekspor Production — 6 November 2026, 23.19 WIB

- Saya menganalisis CSV metadata yang Anda lampirkan, diekspor pukul **17.38 WIB** (`2026-11-06T17:38:45+07:00`), PostgreSQL 17.11, sesi read-only. Tidak ada baris operasional di dalam ekspor. Konektor MCP tetap menolak pembacaan Production; jadi ini snapshot, bukan pemeriksaan live setelah waktu ekspor.
- Dibandingkan dengan 136 file migration source pada commit aplikasi `c61825935c49b642d8bed08b16e7c428a73add15`, ledger Production berisi 47 versi sampai `20261206000000`; **89 versi source belum tercatat**: dua out-of-order (`20261031104213`, `20261031225438`) dan 87 versi setelah high-water mark. Tidak ada versi ledger asing dan semua nama yang tersedia cocok dengan source. `20261205000000` serta `20261206000000` tidak memiliki payload `statements`.
- Ekspor katalog mengonfirmasi seluruh efek dua migration out-of-order belum ada: RPC `create_master_data_structure_if_absent`; tabel audit `master_data_audit_events`, dua indeks, fungsi audit/actor, dan empat trigger audit. Ini memerlukan migration plan yang direview; jangan sekadar menambahkan baris ledger.
- Batas akses yang terlihat: 119 relasi publik semuanya RLS/FORCE RLS; `anon`/`PUBLIC` tidak memiliki grant tabel, dan `authenticated` hanya memiliki 5 grant `SELECT` yang dibatasi policy. Empat helper `SECURITY DEFINER` dapat dipanggil authenticated tetapi tidak anon. Definisi badan helper di Production tidak ikut ekspor; migration sumber untuk memindahkannya ke schema `private` masih pending.
- Bucket Storage yang terlihat hanya dua dan keduanya privat. Referensi bucket baru lain dari source belum ada di Production.
- Run CI **#1192** lulus 3/3 pada head dokumen sebelumnya dan menguji replay dari baseline Production sintetis. Itu membuktikan replay source, bukan perubahan skema/record Production.
- Lihat [laporan rekonsiliasi Production](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-06.md). Jangan menjalankan `db push`, repair ledger, atau menulis ke Production tanpa inventaris terkini, backup/restore yang terbukti, rehearsal, dan persetujuan operator.
