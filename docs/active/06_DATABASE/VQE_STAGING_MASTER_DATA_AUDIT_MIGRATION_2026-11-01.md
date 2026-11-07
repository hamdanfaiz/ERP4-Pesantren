# Tindak lanjut migration audit Data Induk di VQE — 1 November 2026

## Keputusan dan batas lingkungan

- Supabase `vqemuyzveuirlkvdggjd` adalah staging yang disetujui untuk validasi ERP. Tidak perlu membuat Supabase Branch berbayar.
- Supabase `ptsasgdvgrbdtgyqieie` adalah Production dan tidak boleh disentuh pada prosedur ini.
- Data contoh Firestore tidak perlu disalin. Tujuan tahap ini adalah memasang kontrak schema dan menguji logic audit pada staging.
- SQL migration audit feed sudah diterapkan ke VQE melalui Supabase MCP, tetapi MCP mencatat versi server `20261031225438`, bukan versi source `20270213000000`. Schema sudah ada; ledger belum selaras.

## Bukti live terbaru

- Ledger VQE dan source sama-sama berisi 117 entri/file. Perbandingan versi menemukan satu selisih: remote-only `20261031225438` (`master_data_audit_feed`) dan source-only `20270213000000` (`master_data_audit_feed`). Tidak ada selisih versi lain.
- Pemeriksaan pascamigrasi baca-saja menghasilkan **14 dari 15 check lulus**. Satu-satunya yang gagal adalah `migration_version_recorded`; audit table, RLS dan FORCE RLS, privilege, trigger sumber dan immutability, RPC dengan actor, serta pencabutan RPC actor-less semuanya lulus.
- Pemeriksaan privilege terpisah mengonfirmasi `anon` dan `authenticated` tidak dapat membaca audit table, sedangkan `service_role` dapat membacanya. RPC actor-aware ada di database dan hanya jalur server yang diberi akses.
- Source aplikasi PR #39 pada commit `13b913ef4e94e8cc2d2e6cd55cdf1ef46454e470` lulus GitHub Actions run #1084. PR #39 masih Draft/Open; pembaruan checkpoint ini hanya mengubah dokumentasi.
- Preview `localhost:4179` berhasil menampilkan sistem dan menu. Namun server UAT yang sedang berjalan berasal dari worktree lokal dengan HEAD `1ae7cff` dan perubahan belum di-commit; tampilan itu **belum menjadi bukti UAT untuk head PR #39**.
- Tidak ada perubahan ke Production `ptsasgdvgrbdtgyqieie` dan tidak ada data Firestore yang disalin.

## Perbaikan ledger yang diperlukan

MCP `apply_migration` hanya menerima nama dan SQL, sehingga menerapkan SQL tetapi tidak menjamin versi migration mengikuti nama file lokal. Dokumentasi resmi [Supabase CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) menyatakan perintah ini memang memperbaiki tabel history: status `reverted` menghapus satu entri history dan status `applied` memasukkan versi yang benar. Perintah ini **tidak menjalankan atau membatalkan SQL**. Gunakan CLI, bukan SQL manual pada tabel internal.

Karena schema audit feed sudah ada dan postcheck selain versi ledger sudah lulus, jangan menjalankan ulang migration SQL. Prosedur berikut hanya boleh menyentuh **staging VQE**. PTSAS Production tidak termasuk.

## Langkah tim backend

Jalankan satu operator dari checkout source PR #39 yang memuat migration dan postcheck di atas. Gunakan Supabase CLI `2.84.2` yang dipatok di CI.

1. Pastikan checkout bersih, source PR #39 benar, dan file migration serta postcheck tersedia. Periksa project ref sebelum menjalankan perintah.
2. Login dengan Supabase CLI dan link hanya ke `vqemuyzveuirlkvdggjd`. Masukkan token/password lewat prompt atau secret manager; jangan simpan di Git, command history, log, atau chat.
3. Jalankan `supabase migration list --linked`. Lanjut hanya jika selisihnya tepat seperti bukti di atas: versi remote `20261031225438` dan versi lokal `20270213000000`; berhenti jika ada selisih lain atau target bukan VQE.
4. Jalankan perintah history-only berikut satu per satu:

   ```powershell
   supabase migration repair 20261031225438 --status reverted
   supabase migration repair 20270213000000 --status applied
   ```

   Perintah pertama menghapus alias timestamp server yang salah dari ledger; perintah kedua mencatat versi source yang SQL-nya sudah ada di VQE. Jangan jalankan query DDL, `db push`, atau migration ulang.
5. Jalankan `supabase migration list --linked` kembali. Hasil harus cocok satu per satu dengan 117 versi file source, termasuk `20270213000000`, tanpa `20261031225438`.
6. Jalankan `supabase db push --linked --dry-run`. Hasil yang diharapkan: tidak ada migration tertunda. Jika ada perubahan SQL yang ditawarkan, berhenti dan audit sebelum melanjutkan.
7. Jalankan query baca-saja [`VQE_MASTER_DATA_AUDIT_POSTCHECK.sql`](./VQE_MASTER_DATA_AUDIT_POSTCHECK.sql). Semua 15 check harus `true`. Pastikan tes [`master_data_audit_feed.test.sql`](../../../supabase/tests/master_data_audit_feed.test.sql) lulus di database lokal/CI.
8. Simpan output yang telah disanitasi. Jangan melampirkan token, password, URL koneksi, PII, atau isi event audit.

## Stop/rollback gate

- Jangan menjalankan `supabase db reset`, mengubah tabel migration lewat SQL, mengulang DDL audit feed, atau menghubungkan CLI ke PTSAS Production.
- Jika versi, nama, jumlah, project ref, privilege, atau hasil postcheck tidak sesuai bukti, hentikan prosedur dan minta DBA meninjau keadaan VQE.
- Setelah perbaikan ledger, semua 15 postcheck dan verifikasi CLI harus lulus sebelum mengklaim migrasi staging rapi. PR #39 tetap Draft/Open sampai tinjauan source dan UAT pada head PR selesai.

## Status checkpoint

SQL audit feed sudah bekerja di staging VQE, tetapi metadata migration belum cocok dengan source. Tim backend hanya perlu melakukan repair ledger melalui Supabase CLI sesuai langkah di atas; tidak perlu mengulang migration SQL. UAT menu/CSV yang terlihat pada port 4179 berasal dari source lokal yang belum di-commit, sehingga UAT terhadap commit resmi PR #39 masih harus dilakukan. Tidak ada Supabase branch baru, fixture baru, atau perubahan Production.

