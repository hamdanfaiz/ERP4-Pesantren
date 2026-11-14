# UAT API Integrasi VQE — 10–11 November 2026

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
| `npm run test:api:tahfidz-runtime` | Lulus di VQE pada 11 Nov | Sebelumnya CI #1472 menemukan referensi jenjang tenant belum dibuat; #1474 menemukan `occupied` null pada dua baris; keduanya sudah diperbaiki. CI #1475 dan staging kemudian gagal saat membership. Pemeriksaan source mengonfirmasi fungsi menolak `starts_on > CURRENT_DATE`; helper lama memakai tanggal Jakarta yang dapat mendahului tanggal database UTC. Fixture kini memakai tanggal UTC sehari sebelumnya dan menampilkan pesan API aman jika assertion gagal. Uji ulang staging melewati setup tenant/kelas/santri, katalog, halaqah, membership, setoran, retry idempoten, leaderboard, portal Santri, penolakan tulis, dan isolasi tenant. Build/lint/coverage lokal lulus; CI baru untuk revisi ini masih menunggu. |

## Pemeriksaan pembersihan

Sesudah setiap suite, query baca-saja pada VQE memastikan tenant sintetis tidak aktif, profil disuspensi, akun Auth diblokir, dan objek Storage dihapus:

- Dokumen Digital: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage. Satu record dokumen dan satu baris lampiran tetap ada sebagai referensi audit.
- PPDB/Keuangan: 2 tenant disuspensi, 5 profil/akun diisolasi, 0 objek Storage.
- Perpustakaan: 2 tenant disuspensi, 3 profil/akun diisolasi, 0 objek Storage.
- Tahfidz (uji ulang 11 Nov): dua tenant disuspensi, empat profil disuspensi, dan empat akun Auth diblokir. Tenant utama masih menyimpan tiga baris struktur, satu kandidat, satu santri, satu halaqah, satu membership, dan satu setoran sintetis; tenant lintas-tenant tidak memiliki data Tahfidz. Data ini tidak aktif karena tenant/profil disuspensi; jangan aktifkan kembali.

Pengujian mempertahankan referensi audit append-only. Tenant uji tidak dapat login atau melihat data operasional. Jangan mengaktifkan kembali tenant sintetis tersebut.

Percobaan pertama VQE sempat gagal resolusi DNS sebelum tenant dibuat. Setelah koneksi tersedia, uji ulang lulus. Kueri baca-saja sesudahnya menemukan empat fixture Tahfidz terakhir (dua percobaan) berstatus suspended; profil terkait suspended. Tenant terbaru utama memiliki tiga struktur, satu kandidat, satu santri, satu halaqah, satu membership, dan satu setoran; fixture lintas-tenant tidak memiliki data operasional. Harness melaporkan akun Auth sintetis diblokir. Fixture sintetis tetap tersimpan untuk audit append-only, tetapi tidak aktif; jangan aktifkan kembali. Tidak ada perubahan pada PTSAS Production.

## Batas bukti

Hasil ini membuktikan API server yang diuji dapat membaca dan menulis data VQE untuk empat domain tersebut, termasuk round-trip Tahfidz. Ini belum menjadi UAT browser menyeluruh, belum mencakup semua menu dan role, serta belum membuktikan kecocokan seluruh DDL Production, backup/restore Production, atau instalasi pelanggan VPS/on-premise. UAT UI, Akademik, Asrama, CBT, SDM, Koperasi, Laundry, dan modul lain tetap perlu dibuktikan terpisah.

## Lanjutan

1. Cocokkan preview browser dengan commit source PR yang sama dan jalankan UAT visual/interaksi untuk empat domain di atas.
2. Lanjutkan UAT Tahfidz dari fixture baru, termasuk pemeriksaan UI, lalu hapus atau isolasi fixture sesuai retensi audit.
3. Tim backend melanjutkan rekonsiliasi DDL, urutan migration, dan drill backup/restore Production secara baca-saja/terisolasi.

## Verifikasi ulang Tahfidz — 11 November 2026

- Kode fixture menetapkan `startsOn` ke tanggal UTC satu hari sebelumnya. Ini menghindari tanggal Jakarta menjadi lebih maju dari `CURRENT_DATE` PostgreSQL di sekitar pergantian hari.
- `npm run test:api:tahfidz-runtime` lulus langsung terhadap VQE staging. Cakupan yang lulus: katalog 114 Surah, halaqah, membership, simpan-baca setoran kanonis, retry idempoten, leaderboard, data Santri tertaut, larangan akses/tulis, dan isolasi tenant.
- Pemeriksaan lokal lulus: `npm run test:tahfidz-quran-catalog`, `npm run test:ci-coverage` (61/61 skrip terjadwal), `npm run lint`, `node --check`, dan `npm run build`. CI remote untuk revisi tanggal/diagnostik masih harus dijalankan.
- PTSAS Production tidak diakses dan tidak menerima perubahan.

