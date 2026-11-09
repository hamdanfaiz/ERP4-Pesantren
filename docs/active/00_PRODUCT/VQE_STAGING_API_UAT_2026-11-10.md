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
| `npm run test:api:tahfidz-runtime` | Gagal pada penempatan halaqah | CI #1472 lebih dulu menemukan referensi jenjang tenant belum dibuat; #1474 kemudian menemukan `occupied` null pada dua baris batch. Fixture memperbaiki keduanya. CI #1475 dan VQE sekarang melewati setup tenant, kelas, santri, katalog Surah, dan pembuatan halaqah, lalu menerima HTTP 400 saat menetapkan anggota. Run CI berhenti pada pemeriksaan yang sama. Waktu eksekusi pukul 22:51 UTC sementara helper memakai tanggal Asia/Jakarta yang sudah berganti hari; migration menolak tanggal penempatan yang lebih besar dari `CURRENT_DATE` database. Ini dugaan kuat dari source dan waktu, tetapi body error belum dicatat. Lanjutkan dengan tanggal yang aman bagi tanggal database dan catat pesan error API yang sudah disanitasi, lalu ulangi kedua pengujian. Cleanup lokal CI dan staging berhasil. |

## Pemeriksaan pembersihan

Sesudah setiap suite, query baca-saja pada VQE memastikan tenant sintetis tidak aktif, profil disuspensi, akun Auth diblokir, dan objek Storage dihapus:

- Dokumen Digital: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage. Satu record dokumen dan satu baris lampiran tetap ada sebagai referensi audit.
- PPDB/Keuangan: 2 tenant disuspensi, 5 profil/akun diisolasi, 0 objek Storage.
- Perpustakaan: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage.

Pengujian mempertahankan referensi audit append-only. Tenant uji tidak dapat login atau melihat data operasional. Jangan mengaktifkan kembali tenant sintetis tersebut.

Percobaan pertama VQE terhenti karena koneksi pada permintaan pembuatan tenant. Percobaan berikutnya mencapai endpoint setoran tetapi berhenti pada assignment halaqah. Kueri baca-saja sesudahnya mengonfirmasi kedua tenant uji berstatus suspended, empat profil suspended, dan seluruh akun Auth diblokir menurut hasil cleanup harness. Pada tenant utama fixture masih tersimpan: tiga baris struktur, satu kandidat, satu santri, dan satu halaqah; membership serta setoran berjumlah nol. Tenant kedua tidak memiliki struktur, santri, halaqah, membership, atau setoran. Tenant suspended dan akun diblokir membuat fixture tidak bisa dipakai untuk login atau operasional; jangan aktifkan kembali. Tidak ada perubahan pada PTSAS Production.

## Batas bukti

Hasil ini membuktikan API server yang diuji dapat membaca dan menulis data VQE untuk tiga domain tersebut. Tahfidz masih belum terkonfirmasi sampai harness dapat menyelesaikan alur simpan-baca setelah fixture diperbaiki. Ini belum menjadi UAT browser, belum mencakup semua menu dan role, serta belum membuktikan kecocokan seluruh DDL Production, backup/restore Production, atau instalasi pelanggan VPS/on-premise. UAT UI, Akademik, Asrama, CBT, SDM, Koperasi, Laundry, dan modul lain tetap perlu dibuktikan terpisah.

## Lanjutan

1. Cocokkan preview browser dengan commit source PR yang sama dan jalankan UAT visual/interaksi untuk ketiga domain di atas.
2. Uji Tahfidz dan relasi Master Data/Asrama pada tenant sintetis tanpa menggunakan akun pengguna nyata.
3. Tim backend melanjutkan rekonsiliasi DDL, urutan migration, dan drill backup/restore Production secara baca-saja/terisolasi.

