# Status Staging PR #40 — 4 November 2026

PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40)  
Status PR: Draft/Open; belum siap merge.  
Staging: Supabase VQE `vqemuyzveuirlkvdggjd`.  
Production PTSAS: tidak disentuh.

## Bukti yang sudah dikonfirmasi

- Ledger VQE berisi 131 migration sampai `20270227000000_remove_redundant_document_number_index`.
- Dengan persetujuan pemilik, satu baris versi sementara `20261101130634` diselaraskan ke versi source `20270227000000`. Nama migration dan statement ledger dipertahankan; jumlah entri tetap 131.
- Indeks lama `document_records_tenant_document_number_uq` sudah tidak ada. Indeks unik ternormalisasi `document_records_tenant_number_normalized_uq` tetap ada pada `(tenant_id, lower(btrim(document_number)))`. Jangan jalankan ulang DDL atau repair ledger untuk migration ini.
- Supabase JS dari proses server lokal berhasil menjalankan query tanpa baris pada tabel `tenants` (HTTP 200). Key rahasia tidak dimasukkan ke browser, dokumen, atau chat.
- Advisor Security mencatat 162 tabel RLS tanpa policy (INFO) dan Leaked Password Protection belum aktif (WARN). Query metadata privilege baca-saja menunjukkan:
  - 0 dari 162 tabel tanpa policy memiliki grant `SELECT`, `INSERT`, `UPDATE`, atau `DELETE` ke `anon`/ `authenticated`.
  - 0 tabel publik tanpa RLS memiliki grant operasi tersebut ke `anon`/ `authenticated`.
  Ini konsisten dengan akses operasional server-only/default-deny. Jangan membuka policy umum.
- Performance Advisor mencatat 258 foreign key tanpa indeks pendukung dan 96 indeks belum digunakan. Jangan melakukan perubahan massal sebelum ada workload representatif.
- Local preview pada `127.0.0.1:4181` lulus readiness dan menyajikan landing page (HTTP 200); `/api/users` menolak request anonim (HTTP 401).

## Batas bukti lokal

Preview tepat dari head PR #40 kini berjalan pada `127.0.0.1:4183` dari commit `79d516880fb0c957d672cc4db8d9725f7f294ba3`. Readiness dan landing page memberi HTTP 200; `/api/users` tanpa autentikasi memberi HTTP 401. Ini membuktikan startup dan penolakan akses anonim, tetapi **belum** membuktikan UAT Admin atau seluruh alur modul.

GitHub Actions pada head PR `79d5168` lulus 3/3 job pada [run #1135](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41813589719): build frontend/Firebase guard, instalasi NPM untuk lingkungan pelanggan, serta rehearsal migrasi/API Auth/tenant/pgTAP. Rangkaian database mencakup rehearsal dari batas ledger staging, data sintetis Laundry, race NIS/Tahfidz, API tenant, Storage, dan backup/restore di Supabase lokal terisolasi. Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB.

Audit dependency setelah perbaikan lockfile melaporkan **0 advisori dependency produksi** (`npm audit --omit=dev`). Audit semua dependency masih melaporkan 16 advisori pada tooling/dependency pengembangan (2 rendah, 9 sedang, 5 tinggi): jalur Firebase/Firestore transitive menyarankan downgrade besar yang tidak aman, `xlsx` belum memiliki perbaikan upstream, dan `minimatch` belum memiliki versi perbaikan dalam rentang dependency saat ini. Tidak menjalankan `npm audit fix --force`. Build, lint, guard Supabase runtime/kontrak lokal, dan smoke check production-only lulus. Lockfile dan dependency yang sama sudah melewati CI #1135.

## Gerbang yang masih harus diselesaikan

1. Sediakan `SUPABASE_DB_URL` atau `SUPABASE_DB_POOLER_URL` VQE melalui secret manager / environment lokal yang diabaikan Git. Jangan kirim password database lewat chat, PR, terminal log, atau browser.
2. CI run #1135 telah lulus migration rehearsal dan pgTAP pada Supabase lokal terisolasi. Preflight langsung terhadap database VQE masih terbuka karena environment lokal belum memiliki `SUPABASE_DB_URL`/pooler URL; jangan mengirim password database lewat chat atau menaruhnya di repo.
3. Jalankan UAT manual pada preview head PR #40 di `http://127.0.0.1:4183/`: login Admin, Data Induk, Naming Series, NIS per jenjang, PPDB, pegawai, struktur, impor/ekspor, serta pemeriksaan akses role/tenant. Server tidak mengisi kredensial; login dilakukan oleh pemilik akun.
4. Aktifkan dan verifikasi Leaked Password Protection pada Auth VQE.
5. Tinjau Advisor performa dengan data sintetis dan beban yang realistis. Jangan menambahkan/menghapus indeks secara massal.
6. Setelah staging lulus, lakukan audit baca-saja Production, siapkan backup/restore dan rencana cutover terpisah, lalu minta tim backend melakukan penerimaan dan deploy self-hosted.

Tidak ada data Firestore dummy yang disalin. Tidak ada perubahan pada Production. Jangan menutup atau merge PR #40 sebelum gerbang staging di atas lulus.
