# Rekonsiliasi urutan migrasi katalog tenant

## Temuan

CI gagal saat `supabase start` membangun database kosong. Migrasi `tenant_reference_relationships` sebelumnya bertimestamp `20261101015832`, padahal SQL-nya membutuhkan `organization_units`, `finance_expenses.unit_id`, unit pada rencana anggaran, serta penugasan unit untuk Master Data dan Akademik. Dependensi itu baru tersedia pada rangkaian migrasi `20270126` sampai `20270201`.

Migrasi katalog dipindahkan ke `20270214120000_tenant_reference_relationships.sql`: sesudah seluruh dependensi unit/anggaran dan sebelum migrasi yang menguatkan relasi katalog. Isi SQL dipertahankan tanpa perubahan. Replay lokal yang bersih akan menjalankan seluruh rantai sesuai urutan timestamp.

## Dampak pada VQE staging

VQE saat ini masih mencatat versi lama `20261101015832_tenant_reference_relationships`. Pemeriksaan baca-saja juga memastikan `tenant_reference_items`, `organization_units`, `finance_budget_plans`, dan `finance_budget_lines` sudah ada. Production PTSAS belum diperiksa atau diubah.

Karena timestamp versi berubah, jangan menjalankan `supabase db push` sebelum riwayat staging direkonsiliasi. `scripts/preflight-supabase-migrations.mjs` mengenali alias ini secara khusus:

- Sebelum repair, preflight membandingkan SQL lama di ledger dengan SQL file baru secara persis. Perintah berhenti dengan status bukan nol sampai alias ledger direkonsiliasi; output harus menyatakan `SQL cocok persis` dan tidak boleh ada mismatch lain.
- Setelah repair, versi target boleh tidak memiliki metadata SQL karena `supabase migration repair` hanya memperbarui tabel riwayat, bukan menjalankan atau membatalkan SQL. Pengecualian ini hanya berlaku untuk pasangan versi yang disebut di preflight.

## Prosedur staging yang aman

Jalankan dari checkout branch PR #40 dan pastikan target CLI adalah VQE staging, bukan Production:

```powershell
supabase link --project-ref vqemuyzveuirlkvdggjd
supabase migration list
npm run preflight:db-migrations
```

Lanjutkan hanya jika output preflight menyatakan SQL lama cocok persis untuk `20261101015832 → 20270214120000` dan tidak menemukan versi asing, SQL/name mismatch lain, atau urutan tertinggal. Lalu rekonsiliasi ledger saja:

```powershell
supabase migration repair 20261101015832 --status reverted
supabase migration repair 20270214120000 --status applied
supabase migration list
npm run preflight:db-migrations
```

Hasil yang diharapkan: versi lama tidak tercatat, versi `20270214120000` tercatat, preflight tidak menemukan mismatch, dan menampilkan catatan bahwa alias telah direkonsiliasi. Perintah `migration repair` tidak mengeksekusi ulang SQL; petunjuk ini sesuai [panduan migrasi Supabase](https://supabase.com/docs/guides/deployment/database-migrations).

Jika SQL lama tidak cocok, salah satu tabel/relasi tidak ada, versi tambahan muncul, atau preflight masih menolak, hentikan proses. Jangan tandai versi target sebagai `applied` sebelum kondisi schema aktual staging dibuktikan. Jalankan ulang seluruh workflow CI database setelah rekonsiliasi dan selesaikan UAT antarmuka staging sebelum merge atau penerapan ke Production.

## Status

- Clean migration replay: lulus pada GitHub Actions run #1135 (3/3 job) untuk head kode PR #40.
- Pemeriksaan baca-saja Supabase MCP (4 November 2026): 131 versi/nama ledger cocok dengan source kecuali alias yang dijelaskan di atas; canonicalizer preflight membandingkan SQL lama dan file source dengan hasil cocok 90/90 statement.
- Rekonsiliasi ledger alias VQE: belum dijalankan. Prosedur `migration repair` di atas tetap diperlukan sebelum `db push`; ini hanya memperbarui ledger, bukan menjalankan SQL migration.
- Production: tidak disentuh.
- PR #40: tetap Draft sampai preflight penuh, rekonsiliasi ledger alias, dan UAT staging lulus.
