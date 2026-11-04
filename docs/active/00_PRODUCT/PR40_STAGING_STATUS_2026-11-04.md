# Status Staging PR #40 — 5 November 2026

PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40)  
Status PR: Draft/Open; belum siap merge.  
Staging: Supabase VQE `vqemuyzveuirlkvdggjd`.  
Production PTSAS: tidak disentuh.

## Bukti yang sudah dikonfirmasi

- Sebelum pagination Akademik diterapkan, ledger VQE berisi 131 migration sampai `20270227000000_remove_redundant_document_number_index`.
- Preflight baca-saja pada checkpoint sebelumnya mencocokkan versi/nama/SQL untuk 131 entri dan mengidentifikasi alias terdokumentasi `20261101015832_tenant_reference_relationships` → `20270214120000_tenant_reference_relationships`.
- Setelah pagination Akademik diterapkan pada staging, ledger VQE berisi 133 entri hingga `20270301000000_academic_student_roster_pagination`. Dua entri terbaru sudah diverifikasi memakai versi dan nama source. Alias tenant-reference sebelumnya masih tercatat dan harus diperlakukan sesuai runbook.
- Dengan persetujuan pemilik, satu baris versi sementara `20261101130634` diselaraskan ke versi source `20270227000000`. Nama migration dan statement ledger dipertahankan; jumlah entri tetap 131.
- Indeks lama `document_records_tenant_document_number_uq` sudah tidak ada. Indeks unik ternormalisasi `document_records_tenant_number_normalized_uq` tetap ada pada `(tenant_id, lower(btrim(document_number)))`. Jangan jalankan ulang DDL atau repair ledger untuk migration ini.
- Supabase JS dari proses server lokal berhasil menjalankan query tanpa baris pada tabel `tenants` (HTTP 200). Key rahasia tidak dimasukkan ke browser, dokumen, atau chat.
- Advisor Security mencatat 162 tabel RLS tanpa policy (INFO) dan Leaked Password Protection belum aktif (WARN). Query metadata privilege baca-saja menunjukkan:
  - 0 dari 162 tabel tanpa policy memiliki grant `SELECT`, `INSERT`, `UPDATE`, atau `DELETE` ke `anon`/ `authenticated`.
  - 0 tabel publik tanpa RLS memiliki grant operasi tersebut ke `anon`/ `authenticated`.
  Ini konsisten dengan akses operasional server-only/default-deny. Jangan membuka policy umum.
- Performance Advisor mencatat 258 foreign key tanpa indeks pendukung dan 96 indeks belum digunakan. Jangan melakukan perubahan massal sebelum ada workload representatif.
- Preview source PR dapat dijalankan pada port lokal `4184`, tetapi browser AI Studio tidak dapat mengakses loopback dan mengalami timeout. UAT tampilan belum terverifikasi; coba URL itu dari Chrome lokal pada komputer yang sama.
- Audit Akademik lanjutan memastikan deteksi konflik jadwal dan validasi transaksional saat simpan sudah ada; `npm run test:academic-schedule-conflicts` lulus. Jurnal/penilaian dan jadwal dipaginasi per 50 record. Roster kini juga dipaginasi per 50 record dengan pencarian nama/NIS dan pembatasan kelas Ustadz melalui ID referensi. Migration cursor Akademik sudah diterapkan ke VQE. Uji pgTAP dan UAT visual masih terbuka; batas kelas 500 serta scan konflik 5.000 perlu evaluasi kapasitas tenant besar. Rincian status dicatat di `ACADEMIC_SCALE_GAP_2026-11-04.md`.

## Batas bukti lokal dan CI head saat ini

Server preview dari commit kode `79d516880fb0c957d672cc4db8d9725f7f294ba3` mencatat `Server listening on 127.0.0.1:4184`, tetapi permintaan HTTP dari tool dan browser AI Studio timeout. Karena itu halaman dan API belum dapat diverifikasi pada sesi ini; login Admin dan seluruh alur modul belum diuji.

Pada head PR sebelumnya `79d5168`, GitHub Actions lulus 3/3 job pada [run #1135](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41813589719). Hasil itu adalah baseline historis dan tidak mencakup pagination roster terbaru. Untuk head PR saat ini `816dd97a07665d7d489a2105244c8fa004341734`, GitHub Actions belum mencatat workflow run maupun status check. Build sebelumnya memberi peringatan ukuran chunk PDF sekitar 1,46 MB.

Audit dependency setelah perbaikan lockfile melaporkan **0 advisori dependency produksi** (`npm audit --omit=dev`). Audit semua dependency masih melaporkan 16 advisori pada tooling/dependency pengembangan (2 rendah, 9 sedang, 5 tinggi): jalur Firebase/Firestore transitive menyarankan downgrade besar yang tidak aman, `xlsx` belum memiliki perbaikan upstream, dan `minimatch` belum memiliki versi perbaikan dalam rentang dependency saat ini. Tidak menjalankan `npm audit fix --force`. Build, lint, guard Supabase runtime/kontrak lokal, dan smoke check production-only lulus. Lockfile dan dependency yang sama sudah melewati CI #1135.

## Gerbang yang masih harus diselesaikan

1. Picu dan selesaikan seluruh job CI pada head terbaru, termasuk replay migration lokal dan pgTAP roster.
2. Jalankan UAT Admin VQE untuk login, Data Induk, Naming Series, NIS, PPDB, pegawai, struktur, impor/ekspor, pagination, serta isolasi role/tenant. Preview port `4184` pernah timeout di browser Codex; gunakan Chrome lokal atau preview checkout tim bila masih terjadi.
3. Rekonsiliasi alias ledger VQE sesuai `MIGRATION_ORDERING_TENANT_REFERENCE.md`, lalu ulangi preflight baca-saja. Langkah `migration repair` hanya memperbaiki ledger dan **tidak menjalankan ulang DDL**.
4. Evaluasi batas 500 kelas dan scan konflik 5.000 jadwal dengan data sintetis realistis.
5. Aktifkan dan verifikasi Leaked Password Protection pada Auth VQE; tinjau Advisor performa dengan beban realistis. Jangan mengubah indeks secara massal.
6. Setelah staging lulus, lakukan audit baca-saja Production, siapkan backup/restore dan rencana cutover terpisah, lalu minta tim backend menerima dan deploy self-hosted.

Tidak ada data Firestore dummy yang disalin. Tidak ada perubahan pada Production. Jangan menutup atau merge PR #40 sebelum gerbang staging di atas lulus.

## Pembaruan source Akademik — 4 November 2026

- Daftar Jadwal, Jurnal, dan Penilaian kini memakai halaman cursor berukuran 50; filter tenant, jenis, unit, dan pengajar dijalankan pada query backend.
- Pemeriksaan konflik pindah ke endpoint Admin-only yang memindai jadwal tenant/filter hingga 5.000 record. Bila jumlahnya melampaui batas atau halaman sumber tidak stabil, endpoint mengembalikan error dan UI tidak menampilkan hasil seolah lengkap.
- Uji aplikasi lokal lulus: `npm run lint`, `npm run build`, `npm run test:academic-record-pagination`, `npm run test:academic-roster-pagination`, `npm run test:academic-schedule-conflicts`, `npm run test:academic-portal`, `npm run test:migration-preflight`, `npm run test:supabase-runtime-no-firebase`, dan `git diff --check`.
- Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB. UAT visual Admin belum dilakukan. Migration sudah diterapkan ke VQE; test pgTAP roster 27 assertion belum berjalan dan menunggu CI.
- Roster santri sudah berpaginasi; pemetaan kelas dibatasi maksimal 500 referensi per permintaan dan scan konflik maksimal 5.000 jadwal. Skala tenant besar belum tersertifikasi. Production PTSAS tidak disentuh.

## Checkpoint pengembangan roster Akademik — 4 November 2026

- Migration `20270228000000_academic_record_cursor_indexes.sql` dan `20270301000000_academic_student_roster_pagination.sql` sudah diterapkan ke VQE. Indeks urutan roster dan jadwal guru/kelas tersedia; RPC memvalidasi tenant, profil aktif, role, izin Akademik, unit, pencarian, dan cursor.
- Kelas Ustadz dibatasi lewat ID kelas yang sama dengan relasi santri. Trigger mencegah Ustadz menyimpan nilai untuk kelas lain meski nama kelasnya sama.
- Test pgTAP berisi 27 pemeriksaan sintetis untuk pagination, pencarian, tenant/unit/role, privasi RPC, dan penolakan nilai lintas kelas. `pgtap` tersedia pada VQE tetapi belum terpasang. Percobaan melalui konektor SQL gagal saat mem-parsing fungsi helper ber-dollar-quote; tidak ada fixture tertinggal dan ekstensi tetap tidak terpasang. Docker, `psql`, dan Supabase CLI tidak tersedia di workstation, sehingga jalur yang benar adalah menjalankannya lewat CI/lingkungan lokal Supabase terisolasi.
- Verifikasi baca-saja VQE memastikan kedua migration source tercatat tepat di versi target, RPC tersedia, `service_role` dapat memanggilnya, `anon`/`authenticated` tidak dapat memanggilnya, trigger aktif, dan enam indeks Akademik tersedia. Jumlah santri, catatan Akademik, dan tenant fixture tetap nol.
- Ledger VQE sekarang berisi 133 migration; alias tenant-reference lama masih ada. Rekonsiliasi alias itu perlu mengikuti runbook secara terpisah.
- `npm run preflight:db-migrations:local` tidak dapat dijalankan karena `psql` tidak ditemukan. `supabase test db` tidak dapat dijalankan karena Docker tidak tersedia.
- Verifikasi source terbaru: lint, build, uji roster, uji pagination catatan, uji konflik jadwal, uji portal Akademik, uji logika migration preflight, serta guard Supabase-only lulus. Build tetap memperingatkan chunk PDF 1,46 MB.
- Source roster disimpan pada branch lokal `codex/pr40-roster-pagination-20261105`, dan head GitHub PR `816dd97` memiliki tree yang sama. CI belum berjalan pada head ini. UAT Admin belum selesai. Production PTSAS tidak disentuh.

## Pembaruan sinkronisasi — 5 November 2026

- Git fetch mengonfirmasi head PR #40 `816dd97a07665d7d489a2105244c8fa004341734`; tree-nya sama dengan commit lokal `3d0bff0` (`cbab1c0`). Source roster sudah tersedia pada branch PR melalui konektor GitHub.
- Validasi lokal sesudah rebase lulus: lint, build, uji pagination roster/catatan, konflik jadwal, portal Akademik, migration preflight, guard Supabase-only, dan pemeriksaan whitespace. Pada head terbaru, GitHub API mengembalikan nol workflow run dan nol status check; pemicu CI masih perlu dibereskan.
- VQE staging memiliki 133 migration, termasuk `20270228000000` dan `20270301000000`; pgTAP roster 27 assertion belum berhasil dijalankan. Docker, `psql`, dan Supabase CLI tidak tersedia. Percobaan SQL konektor berhenti pada parse error dan pemeriksaan baca-saja sesudahnya memastikan tenant, user, profil, kandidat, santri, catatan Akademik, serta ekstensi pgTAP sintetis tetap tidak berubah.
- Tidak ada review submission atau inline review thread pada PR #40. PR tetap Draft/Open. Production tetap tidak disentuh.

