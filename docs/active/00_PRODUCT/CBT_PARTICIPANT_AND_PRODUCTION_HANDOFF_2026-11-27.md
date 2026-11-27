# Handoff UAT CBT peserta dan gerbang Production — 27 November 2026

## Sumber dan deployment

- Repositori resmi: `hamdanfaiz/ERP4-Pesantren`, branch `main`.
- Head GitHub yang diverifikasi: `8af522e821783867a341e07d4d2b22bf2c951e6b`. Commit ini hanya memperbarui dokumentasi; kode aplikasi terakhir berubah pada `42d3d32ebd19ca07151e3b478382834574afb0b6` (PR #305), lalu PR #306 dan #307 menambahkan catatan.
- Sebelum PR handoff ini dibuat, pencarian GitHub menemukan nol PR terbuka.
- hPanel staging `lightgreen-jay-425688.hostingersite.com` menampilkan branch `main`, commit `8af522e`, deployment terakhir **Completed**, dan auto-deployment aktif. Ini membuktikan build staging mengikuti head repositori yang diperiksa. Tidak ada setting hosting yang diubah.

## CBT dari sisi peserta

Pemeriksaan Supabase staging VQE `vqemuyzveuirlkvdggjd` hanya mengambil agregat:

| Data CBT | Jumlah |
| --- | ---: |
| Ujian | 1 |
| Soal yang tertaut | 3 |
| Penugasan peserta | 0 |
| Percobaan ujian | 0 |

Halaman peserta `Ujian Saya` hanya menampilkan ujian yang ditugaskan kepada santri tertaut. Karena belum ada penugasan, daftar peserta kosong. Tidak tersedia pratinjau pertanyaan tanpa memulai percobaan: tombol **Mulai ujian** membuat percobaan dan memulai batas waktu. Untuk UAT sisi peserta, Admin perlu menugaskan ujian staging kepada santri sintetis yang tertaut ke tenant, kemudian masuk memakai akun Santri tersebut dan membuka **CBT → Ujian Saya**. Jangan memakai Production. Tidak ada penugasan atau percobaan yang dibuat dalam pemeriksaan ini.

## Kondisi skema yang dibaca

- VQE: 170 entri ledger migrasi; 188 tabel `public`, semuanya mengaktifkan RLS dan FORCE RLS.
- PTSAS Production `ptsasgdvgrbdtgyqieie`: 100 entri ledger; 70 versi source belum tercatat; tiga entri memiliki nama kosong. Ada 162 tabel `public`, semuanya mengaktifkan RLS dan FORCE RLS.
- Perbandingan ledger tidak membuktikan bahwa DDL, kebijakan, grant, atau perilaku aplikasi identik. RLS/FORCE RLS aktif juga bukan bukti bahwa semua API mengotorisasi pengguna dan tenant dengan benar.

## Status dan batas

Semua pemeriksaan pada dokumen ini bersifat baca-saja. Kueri CBT hanya menghasilkan jumlah record, tanpa membaca isi baris atau identitas. Tidak ada penugasan/percobaan dibuat dan Production tidak diubah.

ERP4 **belum dinyatakan siap Production/komersial**. Sebelum migrasi Production, tim backend masih perlu merekonsiliasi DDL aktual terhadap 170 file source, mengklasifikasikan 70 versi yang belum tercatat dan tiga nama kosong, meninjau urutan/dependensi migrasi, serta membuktikan backup dapat dipulihkan. UAT baca-simpan-baca lintas modul/role/tenant juga belum lengkap.
