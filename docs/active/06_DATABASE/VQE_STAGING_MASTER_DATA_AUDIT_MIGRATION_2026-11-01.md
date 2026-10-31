# Tindak lanjut migration audit Data Induk di VQE — 1 November 2026

## Keputusan dan batas lingkungan

- Supabase `vqemuyzveuirlkvdggjd` adalah staging yang disetujui untuk validasi ERP. Tidak perlu membuat Supabase Branch berbayar.
- Supabase `ptsasgdvgrbdtgyqieie` adalah Production dan tidak boleh disentuh pada prosedur ini.
- Data contoh Firestore tidak perlu disalin. Tujuan tahap ini adalah memasang kontrak schema dan menguji logic audit pada staging.
- Migration `20270213000000_master_data_audit_feed.sql` **belum diterapkan** ke VQE. Pemeriksaan terakhir hanya baca.

## Bukti sebelum tindakan

- Ledger VQE menampilkan 116 migration, terakhir `20270212000000_optimize_core_tenant_query_indexes`.
- Source repo menyediakan migration berikutnya `supabase/migrations/20270213000000_master_data_audit_feed.sql` beserta pgTAP `supabase/tests/master_data_audit_feed.test.sql`.
- Pada pemeriksaan baca-saja, `public.master_data_audit_events` belum ada; objek terkait yang diperlukan migration sudah ada. Source migration membatasi pembacaan event ke `service_role`, mengaktifkan RLS dan FORCE RLS, mencegah perubahan/penghapusan event, mencatat metadata tanpa nilai PII, serta memvalidasi aktor pada jalur RPC.
- GitHub Actions pada source commit `9fb818f` sebelumnya lulus untuk build dan suite DB sintetis. Ini bukan bukti bahwa migration telah berjalan di VQE.
- Workstation pada checkpoint tidak memiliki Supabase CLI maupun token akses CLI. Tidak ada SQL atau data yang ditulis ke VQE.

## Mengapa tidak memakai MCP `apply_migration`

Tool MCP `apply_migration` yang tersedia hanya menerima `project_id`, `name`, dan `query`; tidak menyediakan argumen untuk migration version. Dokumentasi/source Supabase menyebut MCP membuat timestamp migration dari sisi server. Issue upstream [supabase/mcp #241](https://github.com/supabase/mcp/issues/241) mendokumentasikan risiko timestamp server berbeda dari timestamp file lokal dan menghasilkan riwayat remote-only. Karena itu, jangan memakai tool tersebut untuk migration yang sudah memiliki nomor versi di repo, dan jangan mencoba menutup selisihnya dengan `migration repair` manual.

Gunakan Supabase CLI terhadap **project staging VQE yang tepat**. CLI mengambil timestamp dari nama file migration dan `db push --dry-run` dapat memperlihatkan perubahan tanpa menerapkannya. Ikuti [panduan resmi Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) dan [referensi resmi CLI](https://supabase.com/docs/reference/cli/global-flags).

## Langkah tim backend

Jalankan satu operator pada checkout commit source PR #39 yang berisi file migration di atas. Versi CLI CI yang dipatok repo adalah `2.84.2`.

1. Pastikan checkout bersih dan memuat file migration serta tesnya. Jangan menyalin SQL ke Dashboard dan jangan mengubah Production.
2. Ambil backup VQE yang dapat dipulihkan atau pastikan mekanisme snapshot proyek tersedia. Jangan lanjut bila pemulihan belum dapat dibuktikan.
3. Login dengan Supabase CLI dan link **hanya** ke ref staging `vqemuyzveuirlkvdggjd`. Masukkan token/password melalui prompt atau secret manager; jangan simpan di Git, command history, log, atau chat.
4. Jalankan `supabase migration list --linked`. Berhenti jika ledger tidak cocok dengan source sampai `20270212000000`, ada versi tidak dikenal, atau ada migration lain yang belum ditinjau.
5. Jalankan `supabase db push --linked --dry-run`. Hasil yang diharapkan hanya satu file: `20270213000000_master_data_audit_feed.sql`. Jika ada migration tambahan, versi di luar urutan, atau target project tidak jelas, **jangan** lanjutkan push.
6. Setelah dry-run tepat dan backup terverifikasi, jalankan `supabase db push --linked` satu kali. Pastikan output menyebut file migration tersebut dan tidak melaporkan migration lain.
7. Jalankan kembali `supabase migration list --linked`; pastikan versi `20270213000000` tercatat. Periksa tabel, RLS + FORCE RLS, grants, trigger, dan hak EXECUTE RPC terhadap source serta tes `supabase/tests/master_data_audit_feed.test.sql`.
8. Simpan output yang sudah disanitasi dan hasil pemeriksaan sebagai bukti staging. Jangan melampirkan token, password, URL koneksi, PII, atau isi event audit.

## Stop/rollback gate

- Jangan menjalankan `supabase db reset`, `migration repair`, SQL manual ke schema ledger, atau menyalin query migration ke SQL Editor sebagai jalan pintas.
- Jika preflight menampilkan lebih dari migration yang ditargetkan, backup gagal, koneksi menunjuk bukan VQE, migration error, atau postcondition tidak cocok, hentikan tindakan dan laporkan output yang sudah disanitasi kepada DBA.
- Jangan menandai PR sebagai selesai atau mengklaim audit feed staging aktif sebelum langkah verifikasi pasca-push berhasil. PTSAS Production tidak termasuk tahap ini.

## Status checkpoint

Migration audit feed siap di source dan lulus suite lokal/CI yang tersedia, tetapi **belum diterapkan ke staging**. Langkah remote menunggu tim backend memasang/menyediakan Supabase CLI 2.84.2 serta mengautentikasi CLI secara lokal. Tidak ada Supabase branch baru, fixture baru, atau perubahan Production.
