# Checkpoint Penempatan Menu pada Modul Pemilik

**Tanggal:** 1 November 2026  
**Repository:** `hamdanfaiz/ERP4-Pesantren`  
**PR:** [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), head `26b4b97cceb5dff9708652d878eb95f1a543f7ad`  
**Status:** Draft/Open; belum merge.

## Perubahan

Master Data difokuskan pada:

- Santri.
- Struktur: Gedung, Kamar, Kelas, dan Peta Struktur.
- Jejak Audit tenant.

Strip **Data terkait**, panel pengalihan ke modul lain, dan tombol profil wali yang menuju kategori lama di Master Data sudah dihapus.

Fungsi ditempatkan di modul pemilik data:

| Data/fungsi | Modul pemilik | Status yang terlihat di source |
|---|---|---|
| Wali Santri | CRM / Relasi Wali & Donatur | Kontak tenant dikelola dari direktori CRM; Master Data hanya menampilkan data wali yang tertera pada profil santri. |
| Pengajar dan Asatidz | Akademik | Direktori ringkas dari roster tenant; baca-saja. |
| Mata Pelajaran | Akademik | Ringkasan nama dari jadwal, jurnal, dan penilaian tenant; baca-saja. |
| Kurikulum | Akademik | Ringkasan dari jadwal tenant; baca-saja. |
| Pegawai | SDM | Direktori Pegawai. |
| Alumni | Alumni | Direktori dan alur kelulusan. |
| Yayasan dan unit pesantren/sekolah | Manajemen Multi-Unit | Registri unit tenant. |
| Halaqah | Tahfidz | Pengelolaan halaqah tenant. |
| Pemesanan Fasilitas | Sarana & Prasarana | Tab pemesanan memakai komponen Supabase tenant. |

Referensi Pengajar/Mata Pelajaran/Kurikulum sengaja tidak memiliki tombol edit: API katalog Akademik belum tersedia. Jangan menganggap tampilan ringkasan ini sebagai CRUD katalog.

## Verifikasi

- Spot-check browser pada `http://localhost:4179/` menampilkan Data Induk dengan tab Data Entitas, Struktur, dan Jejak Audit; strip “Data terkait” serta kartu pengalihan tidak terlihat. Ini pemeriksaan visual terbatas, bukan UAT backend; source build dan target Supabase yang sedang dilayani browser belum dibuktikan terpisah.
- `npm run test:supabase-runtime-no-firebase` lulus pada source lokal: 98 modul frontend dan 26 rute Supabase diperiksa.
- `npm run lint` lulus.
- `npm run build` lulus; peringatan ukuran chunk renderer PDF sekitar 1,46 MB masih ada.
- `git diff --check` lulus.
- Commit lokal `cc4733e` dan head PR `26b4b97` memuat tree source yang sama. GitHub Actions run [#1091](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41259171340) lulus **3/3 job**: build/typecheck/guard Firebase dan Docker customer-managed, instalasi NPM pelanggan, serta migration/pgTAP/API/Storage/backup-restore sintetis.

## Gate yang masih terbuka

- Verifikasi bahwa source/build yang disajikan preview sama dengan head PR #39, lalu UAT alur login Admin dan baca-tulis tenant.
- Reconciliation metadata migration VQE sesuai runbook sebelum UAT database baru. Jangan menjalankan DDL ulang dan jangan mengubah PTSAS Production.
- Review backend dan tinjauan dependency/base branch PR #39.

**Progress keseluruhan tidak berubah:** estimasi terakhir adalah sekitar **73% kematangan fitur** dan **46% kesiapan release/go-live**. Perapihan penempatan menu memperbaiki struktur UI, tetapi tidak menutup gate login/UAT, rekonsiliasi staging/Production, rotasi secret, atau simulasi instalasi pelanggan. Persentase khusus PR #38 (75% pada dokumen handoff) adalah metrik gerbang PR, bukan persentase keseluruhan ERP.
