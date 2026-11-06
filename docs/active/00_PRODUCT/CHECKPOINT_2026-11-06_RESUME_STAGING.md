# Checkpoint Pengembangan — 6 November 2026, 22.20 WIB

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
- UAT browser pasca-login Admin/Wali masih terbuka; localhost:4179/3000 sebelumnya tidak aktif. Route `intelligence` di luar 25 menu sidebar masih perlu ditetapkan apakah perlu navigasi atau memang internal.
- Manual setting dan persetujuan operator ditahan sampai pemilik aktif setelah pukul 05.00 WIB. Jangan menulis ke Production.
