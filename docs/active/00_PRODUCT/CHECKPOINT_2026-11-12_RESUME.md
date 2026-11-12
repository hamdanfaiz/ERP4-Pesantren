# Checkpoint pengembangan — 12 November 2026

## Posisi aman

- Sumber perubahan dan review: branch `codex/product-copy-cleanup-20261108`, PR [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91).
- PR berstatus **Open, Ready for review**; belum merged dan belum dideploy.
- Saat checkpoint diperbarui, PR head `f6a3942e9789dfd6c39be60050a10de834486b48` sudah lulus [Actions #1488](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43214773666), 3/3 job. Perubahan setelah run tersebut hanya memperbarui dokumen checkpoint; cek Actions sebelum menganggap commit dokumentasi terakhir selesai.
- CI source aplikasi sebelumnya: [run #1481](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42939819678), 3/3 job lulus. CI head dokumentasi sebelumnya: [run #1484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43211275536), 3/3 job lulus.
- Tahfidz API telah lulus UAT terbatas di VQE staging. Cakupan dan batas bukti ada di [laporan UAT VQE](VQE_STAGING_API_UAT_2026-11-10.md).

## Progress estimasi

- Implementasi dan handoff kode: **sekitar 73%**.
- Kesiapan operasional yang telah dibuktikan: **sekitar 55%**.
- Ini estimasi berbobot, bukan metrik otomatis. Deployment dan UAT hosting oleh tim lain tidak dihitung.

## Perubahan checkpoint

- Diperbarui [dokumen kesiapan komersial](COMMERCIAL_READINESS.md) agar status PR, bukti CI/UAT, migrasi, batas keamanan, paket Supabase, dan urutan handoff tidak memakai snapshot lama.
- Pemeriksaan database Production tetap baca-saja. Tidak ada migrasi, perubahan data, aturan, konfigurasi billing, atau deploy Production.

## Penghambat utama

1. Cocokkan 144 migrasi source dengan 48 versi ledger PTSAS Production dan bandingkan DDL aktual. Versi `20270309000000` bertabrakan nama; dua versi tidak mempunyai nama ledger.
2. Rekonsiliasi VQE secara terpisah. Tiga versi Tahfidz memakai alias dan versi source `20270312000000` belum tercatat persis.
3. Tim backend harus membuktikan backup serta restore ke lingkungan terisolasi sebelum merencanakan perubahan Production.
4. Selesaikan UAT browser semua modul, wali, Finance, Storage, role/tenant, perangkat mobile, dan simulasi clean install/upgrade/restore di VPS/on-premise.
5. Tinjau PR #91; setelah review dan CI terbaru, tim menentukan merge. Deployment/UAT hosting tetap dikerjakan tim backend.

## Saat melanjutkan

1. Periksa Actions untuk commit checkpoint terbaru.
2. Baca komentar/review tim pada PR #91 dan tangani setiap temuan.
3. Kerjakan UAT staging atau code fix berikutnya tanpa mengubah PTSAS Production.
4. Ulangi persentase hanya jika ada gerbang yang dapat dibuktikan selesai.
