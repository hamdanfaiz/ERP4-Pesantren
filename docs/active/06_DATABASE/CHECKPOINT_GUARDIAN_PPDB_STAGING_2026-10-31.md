# Checkpoint Staging: Akses Wali ke Tagihan PPDB

- Tanggal: 31 Oktober 2026
- Target: Supabase VQE staging, project ref vqemuyzveuirlkvdggjd.
- Source: PR #38, branch codex/continue-erp-hardening-20261031.
- PTSAS, project ref ptsasgdvgrbdtgyqieie, tetap Production dan tidak disentuh.

## Perubahan aplikasi

- Wali dengan email Auth terverifikasi dapat melihat dan mengirim bukti untuk tagihan calon santri sebelum onboarding, terbatas pada tenant dan email yang cocok.
- Kandidat yang ditolak atau sudah menjadi santri tidak lagi dapat diakses melalui relasi pra-onboarding.
- Setelah onboarding, tagihan dipautkan ke santri dan akses Wali berpindah ke relasi Wali–santri kanonis.
- Tabel guardian_candidate_accounts hanya dipakai backend; RLS dan FORCE RLS aktif, tanpa akses langsung anon/authenticated.
- Tidak ada data Firestore atau data operasional yang disalin.

## Keadaan VQE setelah rekonsiliasi

- Source sebelumnya memiliki 110 migrasi sampai 20270207000000. Migrasi PR ini adalah 20270208000000_guardian_pre_onboarding_candidate_finance.sql.
- VQE sudah memiliki efek skema migrasi tersebut. SQL yang tersimpan pada row sementara cocok dengan file source; perbedaan hanya CRLF tambahan di akhir.
- Sebelum koreksi, row bertimestamp sementara 20261031015736 memiliki nama dan isi SQL yang tepat, sedangkan versi kanonis belum tercatat.
- Dengan transaksi yang memeriksa nama, isi SQL, dan ketiadaan versi tujuan, ledger VQE dikoreksi dengan mengganti versi row tersebut menjadi 20270208000000. SQL skema tidak dijalankan ulang dan tidak ada data operasional yang diubah.
- Verifikasi sesudah koreksi: 111 row migrasi; 20270208000000 tercatat tepat satu kali; 20261031015736 tidak ada; versi terbaru 20270208000000.
- Verifikasi katalog: tabel baru memiliki dua indeks, RLS dan FORCE RLS aktif; trigger onboarding tersedia; empat fungsi terkait tersedia; tidak ada hak EXECUTE untuk anon/authenticated; finance_bills.candidate_id tersedia.
- Supabase CLI tidak tersedia di workspace. Tim backend dapat mengonfirmasi daftar lokal/remote dengan supabase migration list setelah link ke VQE. Jangan jalankan db push, db reset, atau migration repair lagi sebelum membandingkan daftar.

## Validasi dan batas

- GitHub Actions run 41160017884 lulus untuk source PR: frontend/typecheck/build/Docker, rehearsal migrasi lokal, pgTAP, API tenant/auth, Storage, serta backup/restore.
- Supabase Preview berstatus skipped; workflow CI tidak menerapkan migration remote.
- Uji penerimaan manual login Wali dan unggah bukti pada VQE masih diperlukan. Setelah itu, lakukan regression smoke test PPDB → onboarding → tagihan dan konfirmasi tidak ada kebocoran tenant.
- PR #38 tetap draft sampai pemeriksaan staging/UAT selesai. Bukti CI saja belum menyelesaikan UAT atau membuktikan kesiapan produksi.
- Tidak ada perubahan pada PTSAS Production, Auth, Storage, atau data Firestore.

## Rujukan

- Supabase: https://supabase.com/docs/guides/deployment/database-migrations#step-3-if-the-migration-history-table-is-wrong
- Supabase CLI migration repair: https://supabase.com/docs/reference/cli/supabase-migration-repair