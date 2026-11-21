# Checkpoint — ERP4 Pesantren

**Tanggal:** 21 November 2026  
**Tujuan aktif:** menyelesaikan ERP4 Pesantren dari Firebase-first ke Supabase dengan migrasi aman, pengujian yang cukup, dan kesiapan handoff rilis.  
**Status:** dijeda atas permintaan pemilik. Pekerjaan belum selesai dan aplikasi belum dinyatakan siap Production.

## Source dan PR aktif

- PR: [#182 — Tahfidz: rank santri by unique memorized ayat](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/182)
- Branch: `codex/tahfidz-unique-memorization-leaderboard-20261121`
- Head saat checkpoint: `bb5a223f46f253a48f0cb2db41d7529b5cdac39f`
- PR tetap open; belum di-merge.
- Perubahan kode: leaderboard memakai jumlah ayat Ziyadah unik sepanjang masa, menghindari hitung ganda pada ayat/rentang tumpang-tindih, menjaga scope Admin per tenant dan Ustadz per halaqah, serta menghapus panel peringkat bulanan duplikat.
- Bukti code CI pada head sebelum dokumen preflight ditambahkan: run #44844443747 lulus 3/3 job. Dokumen preflight pada head `bb5a223` memicu run #44847673250; hasilnya masih berjalan saat checkpoint dibuat.

## Bukti staging VQE (baca-saja)

Project `vqemuyzveuirlkvdggjd`:

- Dua migrasi PR #182 sudah diterapkan di VQE; ledger sebelum commit dokumen tepat terhadap 165 file migrasi PR.
- Agregat terbaru: 1 setoran Ziyadah, 0 setoran tanpa nomor Surah, 0 rentang ayat tidak valid; proyeksi berisi 5 ayat unik.
- Tenant Admin aktif yang sedang dipakai memiliki 1 santri aktif tetapi belum memiliki setoran Ziyadah, halaqah aktif, atau keanggotaan. Leaderboard akun tersebut wajar kosong. Setoran di tenant lain tidak boleh tampil.
- Catatan fixture UAT menerangkan bahwa tenant ini belum memiliki profil Ustadz aktif; jangan mengaktifkan halaqah UAT atau membuat catatan setoran dengan cara yang melewati alur aplikasi.

## Bukti Production PTSAS (baca-saja)

Project `ptsasgdvgrbdtgyqieie` tidak diubah:

- 100 versi ledger, terbaru `20270316000000`; belum ada versi sesudah `20270316000000`.
- `public.quran_surahs`, kolom `tahfidz_records.surah_number`, dan RPC `list_tahfidz_leaderboard(uuid,uuid,text,date,integer)` belum ada.
- Source `main` memiliki 163 file migrasi; 63 versi belum tercatat di ledger. Perbedaan hitungan ledger bukan instruksi menjalankan semua migrasi.
- Referensi yang baru ditambahkan: [preflight Production leaderboard Tahfidz](../06_DATABASE/TAHFIDZ_LEADERBOARD_PRODUCTION_PREFLIGHT_2026-11-21.md). Dokumen ini read-only; mencakup inventaris Production dan audit agregat setelah rehearsing katalog Surah.
- DDL Production lengkap, urutan seluruh migrasi, dan bukti backup/restore masih belum dipastikan. Jangan menerapkan dua migrasi PR #182 langsung, jangan mengubah ledger manual, dan jangan deploy aplikasi sebelum jalur migrasi disetujui tim backend.

## Lanjutkan dari sini

1. Periksa hasil CI terbaru pada head PR #182 (mulai dari run #44847673250; jika ada commit baru, gunakan run untuk head terbaru).
2. Pastikan dokumen preflight tampil dalam PR #182 dan tidak mengandung data pribadi atau secret.
3. Setelah operator aktif, untuk UAT leaderboard yang terlihat perlu profil Ustadz staging yang sah, halaqah aktif, keanggotaan santri, lalu beberapa setoran Ziyadah sintetis melalui alur aplikasi. Jangan mengambil setoran tenant lain.
4. Pertahankan PR #182 tetap open sampai backend menyelesaikan rekonsiliasi migrasi Production dan urutan promosi; Production tetap read-only sampai prasyarat, rehearsal, dan pemulihan telah dibuktikan.
5. Lanjutkan audit produk/UAT dari `COMMERCIAL_READINESS.md` dan `AGENT_START_HERE.md`; tujuan keseluruhan ERP tetap aktif.

Checkpoint ini tidak menjalankan tes, migrasi, perubahan data, atau deploy.
