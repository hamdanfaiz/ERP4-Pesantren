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
| [#96](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/96) | Pengaturan CBT tenant; koreksi hitungan jadwal dan guard konfigurasi Docker | PR #95 | #43260057572, 3/3 lulus pada source head `b1d5054` |

Semua PR di atas masih **Open dan belum merged**; belum ada review tim backend yang tercatat. PR #96 source head `b1d5054eba2e8e1d8c647a41c5f433acd07b499c` lulus Actions #43260057572, 3/3 job. Perubahan dokumentasi setelah source head tersebut tidak mengubah kode.

## Risiko merge yang sudah terdeteksi

PR #92 menjadi pemilik tunggal migration path `20270313000000_add_core_composite_fk_indexes.sql` dan test indeksnya. Cleanup PR #96 menghapus salinan duplikat, memperbarui preflight, dan hanya mempertahankan migrasi pengaturan CBT. CI #1516 mencakup preflight cleanup, replay migrasi, API auth, pgTAP, build, dan paket; preview Supabase tetap dilewati.

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
