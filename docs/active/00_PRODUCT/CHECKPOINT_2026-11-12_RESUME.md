# Checkpoint pengembangan — 13 November 2026

## Status aman

Perubahan aplikasi tersedia untuk review di PR GitHub. Tidak ada migrasi, pembaruan data, aturan, billing, atau deployment ke Supabase PTSAS Production. VQE staging juga tidak diubah pada sesi ini.

| PR | Isi | Base | CI terakhir |
|---|---|---|---|
| [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91) | Basis migrasi runtime dan aplikasi | `main` | #1495, 3/3 lulus |
| [#92](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/92) | 13 indeks foreign key tenant | PR #91 | #1497, 3/3 lulus |
| [#93](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/93) | Kalender CBT tenant | PR #91 | #1500, 3/3 lulus |
| [#94](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/94) | Dasbor CBT dan ringkasan paket soal | PR #93 | #1502, 3/3 lulus |
| [#95](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/95) | Pemantauan sesi CBT | PR #94 | #1504, 3/3 lulus |
| [#96](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/96) | Pengaturan CBT tenant; koreksi hitungan jadwal, guard env dan bind Docker loopback | PR #95 | Actions #43263389556, 3/3 lulus pada source-code commit `8e7db74` |

Semua PR di atas masih **Open dan belum merged**; belum ada review tim backend yang tercatat. Source-code commit PR #96 `8e7db74e6074d22093493bc6725106e3daed0d7c` lulus Actions #43263389556, 3/3 job. Commit setelahnya hanya memperbarui dokumen handoff/checkpoint dan tidak mengubah source atau migrasi. Run ini memeriksa migrasi, API, pgTAP, Storage, backup/restore lokal, build, image Docker, dan instalasi paket. Supabase Preview dilewati karena branch preview tidak terhubung. Tidak ada perubahan staging atau Production.

## Risiko merge yang sudah terdeteksi

PR #92 menjadi pemilik tunggal migration path `20270313000000_add_core_composite_fk_indexes.sql` dan test indeksnya. Cleanup PR #96 menghapus salinan duplikat, memperbarui preflight, dan hanya mempertahankan migrasi pengaturan CBT. Head terbaru PR #96 lulus Actions #43263389556, 3/3 job, termasuk replay migrasi terisolasi, API auth, pgTAP, alur Storage, backup/restore lokal, build frontend, image Docker, dan pemasangan paket. Supabase Preview dilewati karena branch preview tidak terhubung.

PR #93–#96 membentuk satu stack di atas #91. PR #92 berjalan paralel dari #91. Jangan menganggap status CI sebagai persetujuan merge atau bukti migrasi Production.

## Estimasi progres

- Implementasi dan handoff kode: **sekitar 76%**. Angka diperbarui dari 74% setelah kalender, ringkasan/paket, pemantauan, dan pengaturan CBT masuk ke PR dengan CI lulus.
- Kesiapan operasional yang sudah dibuktikan: **sekitar 55%**. Rekonsiliasi DDL/ledger Production, backup dan restore Production, UAT browser lintas modul, dan simulasi VPS/on-premise belum terbukti tuntas.
- Persentase adalah estimasi berbobot, bukan metrik otomatis. Deployment dan UAT hosting oleh tim backend tidak dihitung.

## Lanjutan kerja

1. Tim backend dapat mulai meninjau PR #91–#96 sekarang.
2. Sebelum merge, rapikan overlap migration #13 dan finalisasi urutan stack.
3. Tim backend tetap perlu mencocokkan DDL/ledger Production dan membuktikan backup/restore; jangan menjalankan `db push` hanya untuk menyamakan angka.
4. UAT browser semua role/modul serta simulasi clean install, upgrade, dan restore di environment pelanggan masih terbuka.
5. Bantuan manual dari operator belum dibutuhkan pada checkpoint ini. Jika muncul kebutuhan operasi komputer/dashboard, tunda sampai pukul 05.00 WIB sesuai arahan.

Dokumen status lengkap: [Kesiapan Komersial dan Handoff Backend](COMMERCIAL_READINESS.md). Bukti ledger: [Rekonsiliasi migrasi Production dan VQE](../06_DATABASE/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-11.md).
