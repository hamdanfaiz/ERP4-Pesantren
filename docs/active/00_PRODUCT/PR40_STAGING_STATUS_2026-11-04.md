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

Preview `4181` berjalan dari checkout audit lokal `codex/policyless-table-guard-20261101` (commit source `224c5c8`), bukan dari head PR #40 `d3aba1e`. Kesamaan source belum dibuktikan. Smoke check tersebut **bukan** UAT Admin dan tidak boleh dipakai sebagai bukti semua menu/transaksi pada head PR bekerja.

Lint, build, pemeriksaan schema API privat, guard import graph tanpa Firebase, serta kontrak Naming Series tercatat lulus di checkout audit. GitHub Actions sebelumnya lulus pada head PR yang tercantum dalam deskripsi PR. Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB.

Audit dependensi sebelumnya menemukan 25 advisori (3 rendah, 10 sedang, 11 tinggi, 1 kritis). Pemindaian ulang gagal mencapai registry npm karena resolusi DNS. Belum ada pembaruan dependensi yang diterapkan; jangan gunakan `npm audit fix --force`.

## Gerbang yang masih harus diselesaikan

1. Sediakan `SUPABASE_DB_URL` atau `SUPABASE_DB_POOLER_URL` VQE melalui secret manager / environment lokal yang diabaikan Git. Jangan kirim password database lewat chat, PR, terminal log, atau browser.
2. Jalankan migration preflight dan pgTAP pada source PR #40 terbaru. Environment sekarang tidak memiliki URL Postgres; Docker, Podman, dan `psql` juga tidak tersedia. Supabase CLI berada di cache lokal tetapi tidak ada di `PATH`.
3. Jalankan UAT pada head PR #40: login Admin, Data Induk, Naming Series, NIS per jenjang, PPDB, pegawai, struktur, impor/ekspor, dan pemeriksaan akses role/tenant.
4. Aktifkan dan verifikasi Leaked Password Protection pada Auth VQE.
5. Tinjau Advisor performa dengan data sintetis dan beban yang realistis. Jangan menambahkan/menghapus indeks secara massal.
6. Setelah staging lulus, lakukan audit baca-saja Production, siapkan backup/restore dan rencana cutover terpisah, lalu minta tim backend melakukan penerimaan dan deploy self-hosted.

Tidak ada data Firestore dummy yang disalin. Tidak ada perubahan pada Production. Jangan menutup atau merge PR #40 sebelum gerbang staging di atas lulus.
