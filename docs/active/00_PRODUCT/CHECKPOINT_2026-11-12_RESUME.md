# Checkpoint pengembangan — 12 November 2026

## Status aman

Perubahan aplikasi tersedia untuk review di PR GitHub. Tidak ada migrasi, pembaruan data, aturan, billing, atau deployment ke Supabase PTSAS Production. VQE staging juga tidak diubah pada sesi ini.

| PR | Isi | Base | CI terakhir |
|---|---|---|---|
| [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91) | Basis migrasi runtime dan aplikasi | `main` | #1493, 3/3 lulus |
| [#92](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/92) | 13 indeks foreign key tenant | PR #91 | #1497, 3/3 lulus |
| [#93](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/93) | Kalender CBT tenant | PR #91 | #1500, 3/3 lulus |
| [#94](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/94) | Dasbor CBT dan ringkasan paket soal | PR #93 | #1502, 3/3 lulus |
| [#95](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/95) | Pemantauan sesi CBT | PR #94 | #1504, 3/3 lulus |
| [#96](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/96) | Pengaturan CBT tenant | PR #95 | #1511, 3/3 lulus |

Semua PR di atas masih **Open dan belum merged**. Run PR #96 #1511 lulus pada head kode `1fab3914659d18a1033b032624a5899e5ee1c834`; perubahan setelahnya hanya memperbarui dokumentasi handoff.

## Risiko merge yang sudah terdeteksi

PR #92 dan #96 saat ini sama-sama membawa migration path `20270313000000_add_core_composite_fk_indexes.sql` beserta test indeksnya. SQL dan assertion setara, kecuali baris kosong di akhir. Catatan overlap sudah dimasukkan ke kedua PR dan laporan rekonsiliasi. Tim backend perlu memilih satu salinan kanonis dan memastikan preflight serta urutan branch diselaraskan sebelum merge.

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
