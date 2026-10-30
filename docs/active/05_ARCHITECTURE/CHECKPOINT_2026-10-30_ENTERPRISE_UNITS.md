# Checkpoint Manajemen Multi-Unit — 30 Oktober 2026

## Status terbaru setelah merge PR #13

- PR #13 sudah merged ke `main` pada merge commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`; source head `e449c234c253eb7a65795af18c5794fa45e6e9cb` lulus CI 2/2 pada run `41051400486`.
- PR #1–#11 ditutup sebagai superseded dan tidak merged; PR #12 dan #13 merged. Rincian dan audit paritas ada di [progres penyelesaian](PROJECT_COMPLETION_PROGRESS_2026-10-30.md) dan [audit paritas](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md).
- Estimasi penyelesaian pengembangan tetap sekitar **73%**; deployment hosting dan UAT oleh tim penerapan tidak termasuk.
- Keputusan rilis awal: PPOB/payment gateway tidak disertakan. Peer Review Tahfidz memakai teks pada halaqah yang sama dan dimoderasi Ustadz pengampu; audio serta akses Wali tidak termasuk.
- Rekonsiliasi migration, backup/restore target, login dan UAT, serta uji instalasi customer-hosted masih terbuka. Ledger read-only via SQL Editor menunjukkan 47 prefix cocok dengan source, 62 versi source tidak tercatat, dan metadata untuk `20261205000000`/`20261206000000` kosong. Dashboard menandai target `ptsasgdvgrbdtgyqieie` sebagai `main / PRODUCTION`, jadi jangan gunakan untuk rehearsal.

Catatan status dan checklist PR di bawah ini berasal dari snapshot sebelum merge. Gunakan pembaruan ini untuk status terkini; status database dan lingkungan pelanggan belum berubah.

## Status saat ini

Pada source PR #13, cakupan unit organisasi sudah ada untuk beberapa alur penting: pengeluaran dan ledger Finance, rencana anggaran, tagihan terkait kandidat/santri, catatan dan kelas Akademik, serta lokasi, penempatan dan akses operasional Asrama. Registri organisasi/unit, pemetaan historis secara eksplisit, API, UI, dan tes database sintetis juga tersedia.

**Estimasi penyelesaian pengembangan proyek tetap sekitar 73%** (rentang kerja 70–75%; perkiraan kasar, belum dihitung dari WBS berbobot). Deployment hosting dan UAT tidak masuk angka ini.

- Branch PR: `codex/supabase-runtime-cutover-20261022`
- Head PR #13: `0fb46e41351b2d8486e0d5802dc475a285b103dd`
- Head kode terakhir: `430929f15f36ba3b238c5809d6252d60c0055c41`
- GitHub Actions [run 41030673093](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41030673093): **2/2 job lulus**. Job database mencakup rehearsal migrasi lokal sintetis, pgTAP, API/tenant, transaksi serentak, Storage dan backup/pemulihan; job frontend mencakup typecheck/build, guard Firebase dan Docker.

## Cakupan unit yang sudah tersedia di source

- **Registri unit:** tenant-scoped, kode unik per tenant, status aktif/nonaktif, mutasi idempoten, audit, RLS/FORCE RLS, API dan UI Admin.
- **Finance:** unit pada pengeluaran/ledger dan RKAT baru; tagihan terkait kandidat/santri mewarisi unit; laporan Admin dapat difilter per unit dan record lama tanpa unit tetap terlihat.
- **Akademik:** jadwal, jurnal dan penilaian membawa cakupan unit; pilihan kelas lama yang belum dipetakan ditangani melalui daftar dan alur pemetaan Admin. Ustadz dibatasi menurut unit tepercaya.
- **Asrama:** lokasi dan santri operasional difilter menurut unit serta penugasan Ustadz; Admin memiliki alur pemetaan lokasi lama. Data yang belum dipetakan tetap Admin-only.

Migrations dan tes yang menjadi bukti antara lain `20270128000000_finance_expense_unit_scope.sql`, `20270129000000_finance_budget_unit_scope.sql`, `20270130000000_master_data_unit_assignment.sql`, `20270201000000_academic_unit_scope.sql`, `20270202000000_academic_class_unit_mapping.sql`, dan `20270203000000_boarding_unit_scope.sql`, beserta tes pgTAP terkait.

Cakupan di atas **bukan** pernyataan bahwa semua tabel operasional memakai unit organisasi. Setiap domain lain masih perlu diklasifikasikan: apakah cukup tenant-scoped atau memang perlu unit-scoped. Perubahan pada data historis hanya boleh melalui pemetaan yang diketahui; sistem tidak menebak unit dari nama, departemen, atau isi yang ambigu.

## Batas dan rollout

- Feature flag runtime unit tetap nonaktif secara bawaan sampai migration dan identitas unit disiapkan pada environment sasaran.
- Sesuai keputusan pemilik proyek, data dummy Firestore tidak perlu disalin. Sistem dapat dimulai dengan data baru; migrasi arsip hanya diperlukan jika pemilik pesantren kemudian menghendakinya.
- Tidak ada migration atau data yang diterapkan ke Supabase live pada checkpoint ini. Ringkasan ledger project `ptsasgdvgrbdtgyqieie` berhasil dibaca via SQL Editor dalam mode read-only, tetapi metadata dua baris dan parity skema belum tuntas; run CI memakai Supabase lokal sintetis dan tidak membuktikan seluruh keadaan project tersebut.
- Penerapan migration ke database, konfigurasi server pelanggan, deployment dan UAT dilakukan oleh tim penerapan. Source PR harus tetap menyertakan migration, uji, serta instruksi yang dapat direproduksi.

## Pekerjaan pengembangan yang masih terbuka

1. Audit akhir integrasi lintas-modul: tenant/permission, relasi ID, transisi status, retry, audit dan kegagalan parsial pada alur PPDB → Santri/Wali → Akademik/Asrama/Tahfidz/Finance.
2. Audit sisa paritas modul lama. Peer Review Tahfidz sudah memiliki backend Supabase untuk teks dengan moderasi Ustadz dalam halaqah yang sama; audio dan akses Wali dikeluarkan dari rilis awal.
3. PPOB/payment gateway dikeluarkan dari rilis awal; menu dan permission dinonaktifkan. Analitik yang tersedia berbasis aturan; prediksi AI bukan klaim rilis awal.
4. Tinjau dan rapikan source legacy Firebase yang sudah tidak masuk jalur runtime aktif. CI membuktikan graph frontend aktif dan image runtime tidak memakai Firebase, tetapi file legacy/import tetap ada di source.
5. Lengkapi verifikasi pengembangan instalasi/upgrade/pemulihan yang dapat dijalankan ulang oleh tim backend. CI sudah menguji Docker/Compose dan smoke test; simulasi hosting/VPS/on-premise serta UAT tetap dilakukan tim penerapan.
6. Tim penerapan harus merekonsiliasi ledger 47 versi dengan dua metadata kosong dan 62 versi source yang tidak tercatat; lakukan rehearsal pada staging terisolasi. Tidak ada migration yang diterapkan ke target Production.

## Status Pull Request (snapshot sebelum merge; sudah superseded)

- Pada snapshot sebelum merge, PR #1–#11 dan #13 masih Open/Draft, sementara PR #12 telah merged.
- Status terbaru: PR #1–#11 Closed / tidak merged sebagai superseded; PR #12 dan #13 Closed / Merged.

PR lama #1–#11 bertingkat dan sebagian memakai arsitektur Firebase/transisi lama. Jangan merge ulang satu per satu. Audit paritas pada source `main` mencatat fitur pengganti serta pekerjaan yang masih tertunda.
