# Progres Penyelesaian Pengembangan ERP4 Pesantren

## Checkpoint terbaru — 9 November 2026

**Perkiraan penyelesaian pengembangan: sekitar 72%.** Ini estimasi kerja kasar, bukan persentase WBS berbobot. Pekerjaan deploy hosting dan UAT oleh tim backend/penerapan tidak dihitung.

- Source PR #91 di GitHub masih **Draft/Open** pada head `7b29f12`. Worktree aktif bertumpu pada `b2f6213` dan berisi perubahan lokal yang belum di-commit; kelima commit remote PR belum disatukan dengan perubahan lokal. Karena itu kode lokal terbaru belum dapat direview melalui PR.
- Pemeriksaan lokal terbaru lulus: `test:tahfidz-leaderboard`, `test:tahfidz-bulk-targets`, `test:tahfidz-quran-catalog`, `test:migration-preflight`, `test:supabase-runtime-no-firebase`, `lint`, `build`, dan `git diff --check`. Build menampilkan peringatan anotasi Zod dan chunk PDF besar.
- Rehearsal SQL Tahfidz di VQE lulus **88/88** assertion runtime dan **21/21** assertion target massal. Migrasi koreksi precision dicoba hanya di dalam transaksi sementara; rollback diverifikasi dan tidak meninggalkan fixture atau mengganti definisi fungsi staging.
- Temuan logika yang diperbaiki: target halaman dengan lebih dari dua desimal dapat dibulatkan kolom `NUMERIC(6,2)`. Source kini menolak nilai seperti `0.123` sebelum tersimpan melalui migration `20270312000000_tahfidz_target_decimal_precision.sql`.
- VQE memiliki ketidaksesuaian ledger: tiga file source `20270309000000`–`20270311000000` sudah mengubah schema melalui MCP, tetapi tercatat di ledger dengan versi `20261109145507`, `20261109145522`, dan `20261109145534`. Ledger belum direkonsiliasi; jangan jalankan `db push` atau menganggap migration correction sudah menetap sebelum riwayat ini diselaraskan.
- Production PTSAS tidak diubah. Laporan UAT browser, source parity, status VQE dan Production ada di [catatan UAT terbaru](../00_PRODUCT/UAT_BROWSER_SMOKE_2026-11-09.md).

Sisa utama pengembangan: satukan source remote dan lokal tanpa kehilangan perubahan, rapikan lineage migration staging secara terkontrol, verifikasi ulang seluruh menu/submodul terhadap AI Studio, selesaikan integrasi dan tes lintas-modul yang belum terbukti, lalu push perubahan yang lulus ke PR agar tim backend dapat meninjaunya. **72% tidak berarti siap deploy atau bahwa seluruh fitur telah diuji.**

---

# Snapshot historis — 30 Oktober 2026

## Status singkat

**Perkiraan pada snapshot saat itu: sekitar 73% (rentang 70–75%).** Angka ini sudah digantikan oleh checkpoint terbaru di atas.

- Sumber PR #13: branch `codex/supabase-runtime-cutover-20261022`, head `af9460e7fbdcbf788ee01c53d3bd31ae3089c5be`.
- GitHub Actions [run 41049963343](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41049963343) lulus **2/2 job**, termasuk TypeScript/build, RBAC yang menolak permission PPOB, Docker/Compose, rehearsal migration, pgTAP, API/tenant, transaksi bersamaan, Storage, dan backup/restore lokal sintetis.
- CI mencakup typecheck/build, guard runtime Firebase, Docker/Compose, rehearsal migration sintetis, seluruh pgTAP, reservasi NIS dan slot Tahfidz serentak, import-preview, otorisasi API/isolasi tenant, pendaftaran mandiri Wali, alur Storage, serta backup/pemulihan lokal.
- Skor sekitar 73% tetap perkiraan kasar, bukan ukuran kontrak kerja atau klaim semua fitur lulus. Matriks source parity PR #1–#11 sudah dipetakan ke penggantinya di PR #13; hasil CI tidak membuktikan login nyata, migration target, deployment atau UAT.
- CI tidak menguji database Supabase target, login pelanggan, deployment hosting atau UAT.

## Status PR GitHub setelah integrasi source

- PR #13 merged ke `main` pada commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`; source head yang digabung adalah `e449c234c253eb7a65795af18c5794fa45e6e9cb`.
- PR #1–#11 ditutup sebagai superseded dan **tidak merged**. PR #12 dan #13 merged.
- Skor penyelesaian fitur tetap sekitar **73%**. Merge memasukkan baseline source ke `main`, tetapi tidak menuntaskan migration target, deployment, login, UAT atau persiapan penjualan.

## Cakupan yang sudah ada pada source PR #13

- Jalur runtime aktif menggunakan Supabase Auth, PostgreSQL/RLS, Storage dan API server. CI memeriksa graph frontend aktif tanpa Firebase dan image runtime production tanpa paket Firebase.
- Fondasi tenant, role/permission, pembuatan/pengelolaan akun, PPDB publik dan Admin, master data, onboarding, reservasi NIS, tagihan/pembayaran, bukti privat, serta transaksi Finance memiliki source dan pengujian sintetis.
- Pendaftaran mandiri Wali kini tersedia pada branch PR: aktivasi mensyaratkan email yang sudah dikonfirmasi dan cocok dengan kontak Wali tenant. Klien tidak mengirim tenant, role, atau ID santri; akses ditetapkan oleh fungsi tepercaya di backend.
- Source juga berisi API/halaman Supabase untuk Akademik, Asrama, Tahfidz, komunikasi dan beberapa modul operasional lain; tidak semua modul lama memiliki paritas fitur penuh. Matriks cakupan rinci berada pada [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md) dan [audit fitur PR #11 → #13](PR11_TO_PR13_FEATURE_PARITY.md).
- Cakupan multi-unit sudah tersedia untuk Finance, Akademik, dan Asrama pada alur yang dipetakan. Record lama yang belum diketahui unitnya tidak diisi dengan tebakan. Domain lain perlu diklasifikasikan berdasarkan kebutuhan.
- Dashboard Analitik Operasional memakai snapshot Supabase dan permission tersendiri. Indikatornya berbasis aturan transparan; tidak dipasarkan sebagai prediksi AI.
- Peer Review Tahfidz mencakup teks antaranggota halaqah yang sama dengan moderasi Ustadz. Audio dan akses Wali tidak disertakan. PPOB/payment gateway dikeluarkan dari rilis awal: menu dan izin modul dimatikan, termasuk jika ada permission lama yang tersimpan.
- Data dummy Firestore tidak perlu disalin sesuai keputusan pemilik proyek. Tidak ada import atau perubahan database live pada checkpoint ini.

## Sisa pekerjaan sebelum rilis komersial

1. **Merekonsiliasi migration Supabase target sebelum penerapan.** Konektor belum berhasil membaca project `ptsasgdvgrbdtgyqieie`; snapshot terdahulu mencatat 47 migration, sementara source terbaru memiliki 109. Tim harus memeriksa ledger dan schema aktual, menyiapkan backup yang dapat dipulihkan, lalu rehearsalkan migration pada target staging yang disetujui. Tidak ada migration live yang diterapkan.
2. **Menjalankan login dan UAT.** Uji Auth, role/tenant, modul penting, Storage, pemulihan kegagalan, dan pengalaman responsif pada environment uji milik tim penerapan.
3. **Membuktikan portabilitas di host pelanggan.** Lakukan clean install, upgrade, backup, dan restore pada VPS Linux serta on-premise yang mewakili sasaran.
4. **Menutup operasi dan komersialisasi.** Tetapkan secret/kunci enkripsi per instalasi, SMTP/notifikasi, backup/retensi, lisensi, SLA/support, pilot, dan sizing beban sebelum penawaran.
5. **Menetapkan roadmap fase berikutnya.** PPOB/payment gateway dikecualikan dari rilis awal; Peer Review Tahfidz hanya teks dengan moderasi Ustadz. Fitur di luar batas ini perlu spesifikasi dan validasi sebelum diiklankan.

## Yang dilakukan tim penerapan setelah source siap

- Meninjau dan merekonsiliasi migration target serta menguji konfigurasi environment pelanggan.
- Menjalankan deployment ke hosting/VPS/on-premise.
- Melaksanakan UAT dengan akun, role, unit dan data sintetis/yang disetujui.

Angka penyelesaian pengembangan di atas tidak mengklaim tiga pekerjaan ini telah dilakukan.

## Snapshot status PR sebelum integrasi source

| PR | Status | Makna |
|---|---|---|
| #1–#11 | Open / Draft | Branch lama bertingkat; jangan merge terpisah karena sebagian bergantung pada PR lain atau membawa arsitektur transisi Firebase. |
| #12 | Closed / Merged | Sudah masuk ke `main`. |
| #13 | Open / Draft | Head `af9460e7fbdcbf788ee01c53d3bd31ae3089c5be`; CI run `41049963343` lulus 2/2. PR siap menjadi baseline source, bukan bukti produk siap komersial. |

Catatan pada tabel ini menggambarkan status sebelum integrasi. Status terbaru setelah merge tercatat di bagian atas dokumen. Perkiraan kematangan fitur tetap 73% dan deployment/UAT belum dinyatakan selesai.

## Kriteria 100% penyelesaian pengembangan

Pekerjaan pengembangan dapat disebut 100% ketika seluruh fitur yang disepakati untuk rilis awal berjalan pada runtime Supabase atau sengaja ditunda dengan batas produk jelas; audit relasi dan hak akses lintas-modul selesai; Firebase tidak tersisa pada jalur runtime; CI dan instruksi build/migration/operasi konsisten pada head final. **100% pengembangan tidak berarti sudah deploy atau lulus UAT.**
