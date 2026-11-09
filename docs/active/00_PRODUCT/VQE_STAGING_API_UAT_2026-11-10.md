# UAT API Integrasi VQE — 10 November 2026

## Cakupan dan sumber

- Target: Supabase VQE staging `vqemuyzveuirlkvdggjd`.
- Kode server dari source PR #91; bagian aplikasi pada commit `18659947e54a9cb25f57f2625070b3fc5ce3677f`. Commit berikutnya menambahkan harness API Tahfidz dan guard CI, tanpa mengubah runtime aplikasi.
- Pengujian memakai akun, tenant, dokumen, transaksi, dan berkas sintetis. Kunci server tetap berasal dari `.env` lokal yang diabaikan Git; nilainya tidak dicatat di dokumen.
- Ketiga test harness memulai server sementara, memaksa flag runtime hanya untuk proses pengujian, dan menolak target selain VQE staging.
- Production PTSAS tidak diakses atau diubah.

## Hasil

| Test harness | Hasil | Alur yang berhasil |
|---|---|---|
| `npm run test:api:document-center` | Lulus | CRUD dokumen, nomor otomatis, role/tenant, persetujuan, audit workflow, upload/download PDF privat bertanda tangan, hash, dan retry idempoten. |
| `npm run test:api:finance-storage` | Lulus | Bukti pembayaran privat, PPDB publik, enkripsi identitas, dokumen kandidat, tagihan, penerimaan workflow, onboarding atomik, NIS, wali/kelas/kamar, invoice terkait, retry, konflik, batas role/tenant, dan rate limit. |
| `npm run test:api:library-storage` | Lulus | Upload/download bertanda tangan, bucket privat, isolasi role/tenant, finalisasi dan pemulihan idempoten, verifikasi hash/tanda tangan berkas, penolakan objek tak valid, dan kerahasiaan path. |
| `npm run test:api:tahfidz-runtime` | Perlu dijalankan ulang | Harness mencakup katalog Surah, halaqah, membership, setoran kanonis, idempotensi, leaderboard, cakupan Santri, penolakan tulis, dan isolasi tenant. CI #1472 gagal saat menyiapkan kelas karena fixture belum membuat referensi jenjang tenant (`23503`), sebelum API Tahfidz dijalankan. Cleanup CI berhasil menangguhkan 2 tenant, 4 profil, dan 4 akun uji. Fixture kini menyiapkan referensi jenjang lebih dulu dan menautkannya ke kelas/calon/santri; retry CI berikutnya menjadi bukti penentu. |

## Pemeriksaan pembersihan

Sesudah setiap suite, query baca-saja pada VQE memastikan tenant sintetis tidak aktif, profil disuspensi, akun Auth diblokir, dan objek Storage dihapus:

- Dokumen Digital: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage. Satu record dokumen dan satu baris lampiran tetap ada sebagai referensi audit.
- PPDB/Keuangan: 2 tenant disuspensi, 5 profil/akun diisolasi, 0 objek Storage.
- Perpustakaan: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage.

Pengujian mempertahankan referensi audit append-only. Tenant uji tidak dapat login atau melihat data operasional. Jangan mengaktifkan kembali tenant sintetis tersebut.

Kegagalan koneksi VQE pada uji Tahfidz terjadi saat permintaan pembuatan tenant pertama, tanpa respons dari Supabase; harness tidak melanjutkan ke pembuatan akun atau record. Kueri baca-saja VQE pada 10 November setelah percobaan terbaru menemukan **0** tenant dengan slug awalan `tahfidz-http-` dalam satu jam terakhir. Jadi tidak ada fixture Tahfidz yang tertinggal di VQE. Percobaan CI #1472 berlangsung pada Supabase lokal yang terisolasi, bukan VQE, dan cleanup-nya berhasil.

## Batas bukti

Hasil ini membuktikan API server yang diuji dapat membaca dan menulis data VQE untuk tiga domain tersebut. Tahfidz masih belum terkonfirmasi sampai harness dapat menyelesaikan alur simpan-baca setelah fixture diperbaiki. Ini belum menjadi UAT browser, belum mencakup semua menu dan role, serta belum membuktikan kecocokan seluruh DDL Production, backup/restore Production, atau instalasi pelanggan VPS/on-premise. UAT UI, Akademik, Asrama, CBT, SDM, Koperasi, Laundry, dan modul lain tetap perlu dibuktikan terpisah.

## Lanjutan

1. Cocokkan preview browser dengan commit source PR yang sama dan jalankan UAT visual/interaksi untuk ketiga domain di atas.
2. Uji Tahfidz dan relasi Master Data/Asrama pada tenant sintetis tanpa menggunakan akun pengguna nyata.
3. Tim backend melanjutkan rekonsiliasi DDL, urutan migration, dan drill backup/restore Production secara baca-saja/terisolasi.

