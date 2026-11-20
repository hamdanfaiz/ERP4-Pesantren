# Checkpoint Source Main dan Preview ERP4 — 20 November 2026

## Ringkasan

Checkpoint ini mencatat ulang status setelah audit PR dan UAT visual Asrama. Ini bukan pernyataan bahwa seluruh ERP siap produksi atau semua alur CRUD telah lulus.

## Source dan Pull Request

- Branch utama: main.
- Commit main yang diperiksa: 9cfb82b88d30e7e769b8612884976ca235b64740, hasil merge PR #128.
- Checkout lokal bersih dan menunjuk ke commit yang sama.
- Pencarian GitHub untuk PR terbuka menghasilkan 0 hasil; daftar PR milik akun pada status open juga kosong.
- PR #91, #112, #114, #115, #127, dan #128 berstatus merged.
- PR #92 dan #121 berstatus closed tanpa merge. Perbandingan commit dengan main menunjukkan ahead_by = 0 untuk kedua branch; tidak ada commit unik yang tertinggal. Perubahan branch tersebut tercakup di main lewat jalur integrasi.
- PR #1–#11 tetap closed sebagai jalur lama/superseded; jangan menggabungkan branch historis tanpa audit terpisah.

## Verifikasi source

Pada checkout main di atas:

- npm run lint: lulus.
- npm run build: lulus; menghasilkan bundle frontend dan server.
- npm run test:ci-coverage: lulus; guard memastikan seluruh 75 skrip test package dijadwalkan dalam workflow tes database Supabase.
- Build memberi peringatan dari anotasi komentar Zod yang diabaikan Rollup dan bundle react-pdf sekitar 1,46 MB. Build tetap berhasil.
- GitHub Actions PR #128 lulus 3/3 job pada source head sebelum merge: build/guard runtime tanpa Firebase, instalasi NPM, dan migrasi/API/pgTAP sintetis. Ini bukan hasil backup/restore Production atau UAT semua form.

## Preview Hostinger dan pemeriksaan antarmuka

Preview yang diperiksa: https://lightgreen-jay-425688.hostingersite.com/

- Halaman ringkasan terbuka menggunakan sesi Admin UAT.
- Permintaan untuk bundle main dan SupabaseBoardingManager mengembalikan HTTP 200 dengan tipe application/javascript.
- Isi kedua bundle yang disajikan Hostinger identik dengan hasil build lokal dari commit main ini: main 113.347 karakter; bundle Asrama 67.084 karakter.
- Modul Asrama tidak lagi menjadi layar kosong pada pemeriksaan ulang. Keenam subtab dapat dipilih; navigasi berada pada area gulir horizontal dan panel menggunakan permukaan gelap.
- Tenant staging saat pemeriksaan tidak memiliki santri, kamar, permohonan izin, atau catatan operasional. Layar kosong tersebut adalah kondisi tanpa data; pemeriksaan ini tidak membuktikan alur tulis-baca dengan record.
- Referensi https://erp4-pesantren.ai.studio/ menampilkan beranda publik dan portal login. Konten menu internal tidak dapat dibandingkan tanpa sesi uji pada referensi.

## Batas perubahan

- Tidak ada migrasi, perubahan Auth, Storage, atau penulisan data ke VQE maupun PTSAS Production.
- Tidak ada deploy yang dilakukan ke domain produksi erp4-pesantren.tlusur.com.
- Preview Hostinger sudah menyajikan bundle Asrama yang sama dengan build lokal main, tetapi bukti ini hanya memeriksa bundle main dan Asrama, bukan setiap berkas aset.

## Gerbang yang masih diperlukan sebelum rilis pelanggan

1. UAT simpan-baca modul inti memakai fixture sintetis staging untuk Admin, Ustadz, Santri, dan Wali, termasuk isolasi role/tenant. Catat fixture agar tidak tertukar dengan data pelanggan.
2. Rekonsiliasi DDL dan ledger VQE terhadap source saat ini; petakan alias dan benturan secara per berkas. Jangan menjalankan db push atau memperbaiki ledger berdasarkan selisih hitungan.
3. Tim backend mencocokkan DDL/ledger PTSAS Production, meninjau urutan migrasi, melakukan rehearsal pada salinan yang sesuai, dan membuktikan backup serta restore. Tidak ada langkah Production yang dilakukan di checkpoint ini.
4. Tim deploy mengonfirmasi commit dan paket build pada domain produksi beserta konfigurasi runtime/secret per environment.

Status PR yang bersih, build berhasil, dan preview yang menampilkan bundle terbaru tidak cukup untuk menyatakan produk siap go-live.
