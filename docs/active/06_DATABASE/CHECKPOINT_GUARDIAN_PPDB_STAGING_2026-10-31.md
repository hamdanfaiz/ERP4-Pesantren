# Checkpoint Staging: Akses Wali ke Tagihan PPDB

- Tanggal: 31 Oktober 2026
- Target: Supabase VQE staging `vqemuyzveuirlkvdggjd`
- Produksi PTSAS `ptsasgdvgrbdtgyqieie`: tidak disentuh.

## Perubahan yang disiapkan

- Wali dapat melihat dan mengirim bukti untuk tagihan calon santri sebelum onboarding, hanya setelah email Auth terkonfirmasi dan cocok dengan email calon santri pada tenant yang sama.
- Akses kandidat terbatas pada kandidat yang belum ditolak, belum menjadi data santri, dan mempunyai tagihan Finance PPDB.
- Setelah onboarding, tagihan dipautkan ke santri dan hubungan akun Wali dipindahkan ke relasi Wali–santri kanonis.
- Tabel pemetaan baru `guardian_candidate_accounts` dipaksa memakai RLS dan tidak memberi akses tabel langsung kepada `anon` atau `authenticated`. RPC pemeriksaan dan klaim hanya dapat dipanggil `service_role`.
- Data operasional/Firestore tidak disalin.

## Keadaan VQE yang terverifikasi

- Riwayat VQE sebelum perubahan memiliki 110 migrasi dan cocok dengan versi lokal sampai `20270207000000`.
- Satu-satunya migrasi sumber yang tertunda adalah `20270208000000_guardian_pre_onboarding_candidate_finance.sql`.
- Migrasi berhasil diterapkan melalui Supabase MCP. Pemeriksaan sesudahnya memastikan tabel dan trigger tersedia, RLS aktif dan dipaksa, akses langsung dari `anon`/`authenticated` ditolak, dan fungsi pemeriksaan hanya dapat dijalankan `service_role`.
- Supabase MCP mencatat penerapan dengan timestamp saat ini `20261031015736` (nama `guardian_pre_onboarding_candidate_finance`). Schema sudah berubah, tetapi ledger VQE kini tidak cocok dengan timestamp file sumber. Jangan jalankan `db push` sebelum rekonsiliasi.
- PTSAS Production tidak disentuh.

## Rekonsiliasi ledger staging

Jalankan dari checkout repo yang memuat migrasi `20270208000000`, dengan Supabase CLI terbaru dan autentikasi anggota tim yang berwenang. Pastikan project ref tepat `vqemuyzveuirlkvdggjd`; jangan hubungkan ke PTSAS.

```powershell
supabase login
supabase link --project-ref vqemuyzveuirlkvdggjd
supabase migration list
```

Sebelum memperbaiki ledger, pastikan schema `guardian_candidate_accounts`, fungsi terkait, dan trigger onboarding memang sudah ada pada VQE. Setelah dipastikan, perintah berikut hanya memperbaiki catatan riwayat; perintah ini tidak menjalankan atau membatalkan SQL:

```powershell
supabase migration repair 20261031015736 --status reverted
supabase migration repair 20270208000000 --status applied
supabase migration list
```

Hasil yang diharapkan: semua timestamp lokal dan remote berpasangan, tidak ada versi remote asing `20261031015736`, dan `20270208000000` tercatat applied. Jika daftar masih berbeda, hentikan proses dan jangan jalankan `supabase db push`, `db reset`, atau migrasi produksi. Prosedur ini mengikuti [panduan resmi Supabase untuk rekonsiliasi riwayat migrasi](https://supabase.com/docs/guides/deployment/database-migrations#step-3-if-the-migration-history-table-is-wrong) dan [referensi `migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Validasi yang masih harus dilakukan

- GitHub Actions pada [revisi PR terbaru](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41159589244) lulus: pemeriksaan TypeScript, build aplikasi dan Docker, rehearsal seluruh migrasi pada Supabase lokal terisolasi, pgTAP, API tenant, Storage, serta uji backup/restore.
- Suite pgTAP berhasil dijalankan, termasuk 42 assertion pada `guardian_self_registration.test.sql` untuk isolasi tenant, status/email terverifikasi, bukti pembayaran, dan transfer relasi saat onboarding.
- CI Supabase Preview berstatus skipped. Tidak ada deploy aplikasi atau migrasi ke VQE/PTSAS yang dijalankan oleh workflow ini.
- Pemeriksaan manual login Wali dan unggah bukti pada lingkungan VQE tetap perlu dilakukan sebelum rilis. Data transaksi atau data Firestore tidak dimigrasikan.
- Supabase CLI tidak tersedia di workspace ini. Tim backend perlu melakukan rekonsiliasi ledger VQE mengikuti langkah di atas dan membagikan hasil `supabase migration list`. Jangan menandai implementasi ini selesai untuk deploy sebelum hasilnya konsisten.

## Temuan advisor setelah migrasi

- Tabel baru muncul pada advisor sebagai `RLS Enabled No Policy` tingkat INFO. Ini disengaja: tabel internal tidak dapat dibaca/ditulis oleh role klien dan hanya dipakai backend service-role.
- Tidak ada temuan advisor baru untuk fungsi `SECURITY DEFINER` pada migrasi ini. Advisor masih melaporkan fungsi keamanan lama dan optimasi policy RLS yang tidak diubah oleh checkpoint ini; tinjau terpisah sebelum rilis komersial.
