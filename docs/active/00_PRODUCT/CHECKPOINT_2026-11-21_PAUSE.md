# Checkpoint — ERP4 Pesantren

**Tanggal:** 21 November 2026  
**Tujuan aktif:** menyelesaikan ERP4 Pesantren dari Firebase-first ke Supabase dengan migrasi aman, pengujian yang cukup, dan kesiapan handoff rilis.  
**Status:** dijeda atas permintaan pemilik. Pekerjaan belum selesai dan aplikasi belum dinyatakan siap Production.

## Source dan PR aktif

- PR: [#182 — Tahfidz: rank santri by unique memorized ayat](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/182)
- Branch: `codex/tahfidz-unique-memorization-leaderboard-20261121`
- Feature-code head terakhir dengan CI lengkap lulus: `ad0e0248379b340e0fd52aeb36d40d783da31848`.
- Commit dokumentasi preflight: `bb5a223f46f253a48f0cb2db41d7529b5cdac39f`.
- Commit checkpoint awal: `da1e6b37793b0c154bcafda13922a24eff35b77b`. Setelah checkpoint disimpan, koreksi metadata dokumen dapat mengubah head tanpa mengubah source aplikasi; saat resume, periksa head PR terbaru.
- PR tetap open; belum di-merge.
- Perubahan kode: leaderboard memakai jumlah ayat Ziyadah unik sepanjang masa, menghindari hitung ganda pada ayat/rentang tumpang-tindih, menjaga scope Admin per tenant dan Ustadz per halaqah, serta menghapus panel peringkat bulanan duplikat.
- CI pada feature-code head `ad0e024` lulus 3/3 job pada run #44844443747. Run #44847673250 memvalidasi commit preflight; run #44847919576 dimulai untuk checkpoint awal. Kedua perubahan terakhir hanya dokumentasi. Periksa run untuk head terbaru setelah perangkat dinyalakan kembali.

## Bukti staging VQE (baca-saja)

Project `vqemuyzveuirlkvdggjd`:

- Dua migrasi PR #182 sudah diterapkan di VQE; ledger sebelum commit dokumentasi tepat terhadap 165 file migrasi PR.
- Agregat terbaru: 1 setoran Ziyadah, 0 setoran tanpa nomor Surah, 0 rentang ayat tidak valid; proyeksi berisi 5 ayat unik.
- Tenant Admin aktif yang sedang dipakai memiliki 1 santri aktif tetapi belum memiliki setoran Ziyadah, halaqah aktif, atau keanggotaan. Leaderboard akun tersebut wajar kosong. Setoran di tenant lain tidak boleh tampil.
- Catatan fixture UAT menerangkan bahwa tenant ini belum memiliki profil Ustadz aktif; jangan mengaktifkan halaqah UAT atau membuat catatan setoran dengan cara yang melewati alur aplikasi.

## Bukti Production PTSAS (baca-saja)

Project `ptsasgdvgrbdtgyqieie` tidak diubah:

- 100 versi ledger, terbaru `20270316000000`; belum ada versi sesudah `20270316000000`.
- `public.quran_surahs`, kolom `tahfidz_records.surah_number`, dan RPC `list_tahfidz_leaderboard(uuid,uuid,text,date,integer)` belum ada.
- Source `main` memiliki 163 file migrasi; 63 versi belum tercatat di ledger. Perbedaan hitungan ledger bukan instruksi menjalankan semua migrasi.
- Referensi: [preflight Production leaderboard Tahfidz](../06_DATABASE/TAHFIDZ_LEADERBOARD_PRODUCTION_PREFLIGHT_2026-11-21.md). Dokumen ini read-only; mencakup inventaris Production dan audit agregat setelah rehearsal katalog Surah.
- DDL Production lengkap, urutan seluruh migrasi, dan bukti backup/restore masih belum dipastikan. Jangan menerapkan dua migrasi PR #182 langsung, jangan mengubah ledger manual, dan jangan deploy aplikasi sebelum jalur migrasi disetujui tim backend.

## Lanjutkan dari sini

1. Periksa hasil CI terbaru pada head PR #182; run #44847919576 adalah run checkpoint awal, bukan run untuk koreksi metadata setelahnya.
2. Pastikan dokumen preflight dan checkpoint tampil pada PR #182 dan tidak mengandung data pribadi atau secret.
3. Setelah operator aktif, untuk UAT leaderboard yang terlihat perlu profil Ustadz staging yang sah, halaqah aktif, keanggotaan santri, lalu beberapa setoran Ziyadah sintetis melalui alur aplikasi. Jangan mengambil setoran tenant lain.
4. Pertahankan PR #182 tetap open sampai backend menyelesaikan rekonsiliasi migrasi Production dan urutan promosi; Production tetap read-only sampai prasyarat, rehearsal, dan pemulihan telah dibuktikan.
5. Lanjutkan audit produk/UAT dari `COMMERCIAL_READINESS.md` dan `AGENT_START_HERE.md`; tujuan keseluruhan ERP tetap aktif.

Checkpoint ini tidak menjalankan tes, migrasi, perubahan data, atau deploy.


## Resume pemeriksaan — 21 November 2026, 09.30 WIB

- PR #182 masih terbuka dan mergeable pada head `c3daeeb8520cd2835b23ce82d9eca2a00cc31358`. GitHub Actions untuk head itu selesai dengan hasil sukses pada run #44848039684. Tidak ada tinjauan reviewer yang tercatat.
- Preview staging Hostinger `lightgreen-jay-425688.hostingersite.com` terbuka dengan sesi Admin UAT. Build yang tampil **belum memuat PR #182**: ringkasan Tahfidz masih menampilkan judul “Peringkat Setoran Ziyadah” berbasis bulanan. Memuat ulang menghasilkan pesan bahwa layanan peringkat bermasalah. Karena sumber yang tampil bukan head PR, ini belum menjadi UAT UI atas implementasi leaderboard baru.
- Di akun/tenant staging yang sama, ringkasan menunjukkan 1 santri aktif, 0 halaqah aktif, dan 0 setoran. Tab Pencapaian menampilkan nilai 0 untuk santri tersebut; leaderboard yang kosong sesuai data tenant. Tab Manajemen Halaqah menyatakan belum ada halaqah dan mensyaratkan daftar Ustadz aktif.
- Tab Riwayat Setoran menyediakan pilihan Surah dari katalog; pilihan ayat tetap nonaktif sampai Surah dipilih. Tab Al-Qur'an menampilkan 114 Surah beserta jumlah ayat. Ini bukti UI referensi Surah bukan free-text, tetapi belum membuktikan simpan-baca setoran.
- Tab Jadwal Talaqqi dan Munaqasyah menampilkan keadaan kosong tanpa contoh otomatis; Portal Wali membatasi tampilan ke peran Santri/Wali; Penilaian Antar-Santri menjelaskan moderasi Ustadz dan batasan teks.
- Pada layar Asrama yang diperiksa, permukaan/kartu berwarna gelap dan tab/tabel memiliki kontrol gulir horizontal. Masalah panel putih sebelumnya tidak terulang pada halaman yang sedang dilihat; modul lain belum diaudit visual.
- PTSAS Production tidak disentuh. Urutan migrasi, kesetaraan DDL, backup/restore, dan izin rilis Production tetap menjadi gerbang tim backend. PR #182 jangan digabung jika pemetaan deployment `main` ke domain Production belum dipastikan.

### Lanjutkan

1. Terbitkan **head PR #182 ke preview staging saja**, atau gunakan preview branch setara, tanpa mengubah `main`/Production; pastikan halaman berjalan dengan konfigurasi VQE.
2. Ulangi UAT leaderboard pada build itu. Setelah terverifikasi, siapkan profil Ustadz aktif, halaqah, keanggotaan, dan beberapa setoran sintetis melalui alur aplikasi yang sah; jangan membuatnya lewat SQL atau melewati pemeriksaan peran.
3. Periksa error leaderboard di build PR, lalu retest riwayat setoran dan pemilihan ayat sampai simpan-baca berhasil.
4. Pertahankan batas rilis Production di atas sampai tim backend membuktikan rekonsiliasi/rehearsal migrasi dan pemulihan.

