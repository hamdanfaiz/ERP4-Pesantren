# Progres Penyelesaian Pengembangan ERP4 Pesantren — 30 Oktober 2026

## Status singkat

**Perkiraan penyelesaian pengembangan: sekitar 73% (rentang 70–75%).** Ini angka kerja kasar tanpa WBS berbobot; deployment hosting dan UAT yang dikerjakan tim lain tidak dihitung. Saya belum menaikkan angka karena cakupan yang tersisa belum ditimbang dengan metode yang disepakati.

- Sumber yang sedang disiapkan untuk ditinjau: PR #13, branch `codex/supabase-runtime-cutover-20261022`.
- Commit PR #13 terbaru yang diverifikasi: `7613d3a2414ad40ab41d80001511be58e17886dd`. GitHub Actions [run 41035209749](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41035209749) lulus **2/2 job**.
- Run terbaru mencakup typecheck/build, guard runtime Firebase, Docker/Compose, rehearsal migration sintetis, seluruh pgTAP, reservasi NIS dan slot Tahfidz serentak, import-preview, otorisasi API/isolasi tenant, pemulihan provisioning Auth saat pembuatan profil gagal, alur Storage, serta backup/pemulihan lokal.
- Skor sekitar 73% tetap perkiraan kasar, bukan ukuran kontrak kerja atau klaim semua fitur lulus. Audit lintas-modul sudah didokumentasikan; paritas semua perilaku historis dan target Supabase masih belum terbukti.
- CI tidak menguji database Supabase target, login pelanggan, deployment hosting atau UAT.

## Cakupan yang sudah ada pada source PR #13

- Jalur runtime aktif menggunakan Supabase Auth, PostgreSQL/RLS, Storage dan API server. CI memeriksa graph frontend aktif tanpa Firebase dan image runtime production tanpa paket Firebase.
- Fondasi tenant, role/permission, pembuatan/pengelolaan akun, PPDB publik dan Admin, master data, onboarding, reservasi NIS, tagihan/pembayaran, bukti privat, serta transaksi Finance memiliki source dan pengujian sintetis.
- Source juga berisi API/halaman Supabase untuk Akademik, Asrama, Tahfidz, komunikasi dan beberapa modul operasional lain; tidak semua modul lama memiliki paritas fitur penuh. Matriks cakupan rinci berada pada [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md) dan [audit fitur PR #11 → #13](PR11_TO_PR13_FEATURE_PARITY.md).
- Cakupan multi-unit sudah tersedia untuk Finance, Akademik, dan Asrama pada alur yang dipetakan. Record lama yang belum diketahui unitnya tidak diisi dengan tebakan. Domain lain perlu diklasifikasikan berdasarkan kebutuhan.
- Dashboard Analitik Operasional memakai snapshot Supabase dan permission tersendiri. Indikatornya berbasis aturan transparan; tidak dipasarkan sebagai prediksi AI.
- Data dummy Firestore tidak perlu disalin sesuai keputusan pemilik proyek. Tidak ada import atau perubahan database live pada checkpoint ini.

## Pekerjaan pengembangan yang masih harus ditutup

1. **Lengkapi bukti paritas integrasi.** Audit source alur PPDB → Santri/Wali → Akademik/Asrama/Tahfidz/Finance tercatat di [audit integrasi lintas-modul](CROSS_MODULE_INTEGRATION_AUDIT_2026-10-30.md). Tes CI terbaru membuktikan izin/kedisiplinan Asrama, tenant/role, state transition, dan retry; perilaku historis unik PR #1–#11 serta setiap jalur kegagalan lintas-modul masih perlu dicocokkan sebelum PR lama ditutup.
2. **Tentukan cakupan Tahfidz Peer Review.** Belum memiliki backend tersimpan di Supabase. Jika masuk rilis awal, perlu rancangan izin wali/minor, berkas audio privat, moderasi, retensi, role dan tenant, lalu API/UI serta tes. Jika ditunda, label dan promosi fiturnya harus jelas.
3. **Tetapkan status PPOB/Layanan.** Saat ini fail-closed. Aktivasi memerlukan provider dan kontrak API nyata, pengelolaan kredensial server, idempotensi, rekonsiliasi pembayaran, serta penanganan kegagalan/refund.
4. **Rapikan source legacy Firebase.** Firebase tidak menjadi dependency jalur frontend/runtime yang diuji, namun sejumlah file archive/import masih berada di source. Audit referensi, tsconfig, script dan fungsi migrasi sebelum dibuang atau disimpan sebagai tooling yang jelas non-runtime.
5. **Rapikan dokumentasi rilis dan portabilitas.** Source sudah memiliki Docker/Compose dan smoke test CI. Instruksi install/upgrade/backup/pemulihan perlu tetap sesuai dengan satu image, skema migration dan konfigurasi Supabase pada profil VPS/on-premise sasaran.
6. **Rekonsiliasi migration target sebelum penerapan.** Konektor belum berhasil membaca project Supabase `ptsasgdvgrbdtgyqieie`; koneksi PostgreSQL baca-saja terhenti pada validasi TLS. Tidak ada ledger target yang dapat diverifikasi dan tidak ada perubahan live yang dijalankan. Panduan bagi tim backend ada di [checkpoint akses staging](../06_DATABASE/CHECKPOINT_SUPABASE_STAGING_ACCESS_2026-10-30.md).
7. **Source parity PR lama.** Audit awal tersedia, tetapi setiap perilaku unik PR #1–#11 perlu dipastikan tercakup di source baru atau dinyatakan di luar cakupan, sebelum PR lama ditutup.

## Yang dilakukan tim penerapan setelah source siap

- Meninjau dan merekonsiliasi migration target serta menguji konfigurasi environment pelanggan.
- Menjalankan deployment ke hosting/VPS/on-premise.
- Melaksanakan UAT dengan akun, role, unit dan data sintetis/yang disetujui.

Angka penyelesaian pengembangan di atas tidak mengklaim tiga pekerjaan ini telah dilakukan.

## Status PR GitHub saat diverifikasi

| PR | Status | Makna |
|---|---|---|
| #1–#11 | Open / Draft | Branch lama bertingkat; jangan merge terpisah karena sebagian bergantung pada PR lain atau membawa arsitektur transisi Firebase. |
| #12 | Closed / Merged | Sudah masuk ke `main`. |
| #13 | Open / Draft | Head `7613d3a2414ad40ab41d80001511be58e17886dd`; CI run `41035209749` lulus 2/2, tetapi source belum merged. Lulus CI tidak berarti seluruh cakupan produk sudah selesai. |

**Keputusan saat ini:** PR #13 masih **Open / Draft**; run terbaru lulus, tetapi jangan menandainya selesai, menutupnya, atau menggabungkannya sampai gerbang engineering di atas selesai atau cakupan rilis disetujui secara jelas. Setelah pengganti resmi masuk ke `main`, tutup PR lama yang benar-benar superseded; penutupan dan merge adalah status berbeda.

## Kriteria 100% penyelesaian pengembangan

Pekerjaan pengembangan dapat disebut 100% ketika seluruh fitur yang disepakati untuk rilis awal berjalan pada runtime Supabase atau sengaja ditunda dengan batas produk jelas; audit relasi dan hak akses lintas-modul selesai; Firebase tidak tersisa pada jalur runtime; CI dan instruksi build/migration/operasi konsisten pada head final. **100% pengembangan tidak berarti sudah deploy atau lulus UAT.**
