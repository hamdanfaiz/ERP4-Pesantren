# Checkpoint kesiapan schema dan logic — tanpa salin data legacy

**Tanggal pemeriksaan:** 27 Oktober 2026
**Repository:** `hamdanfaiz/ERP4-Pesantren` — PR #13
**Target database yang dibaca:** Supabase staging `ptsasgdvgrbdtgyqieie`

## Keputusan ruang lingkup

Pemilik produk menegaskan bahwa data Firestore yang tersedia adalah data dummy. **Data Firestore tidak perlu disalin atau direkonsiliasi ke Supabase.** Jangan menjalankan importer atau menghapus/mengosongkan isi staging untuk mengejar hitungan. Pemilik akan membuat data contoh secara manual setelah alur aplikasi stabil.

Yang harus dibuktikan adalah skema, relasi tenant, izin, dan logic transaksi di Supabase. Fixture uji boleh dibuat sintetis pada Supabase lokal/CI atau environment uji yang dapat dipulihkan.

## Status terverifikasi

- PR #13 masih **Open / Draft**. Head kode yang dipakai CI terakhir: `d5467b52f129bf11b782845819586ff64634011f`.
- Source head tersebut berisi **95 file migration**, sampai `20270123000000_public_ppdb_idempotency.sql`.
- Pembacaan staging hanya menampilkan **47 versi ledger**, terakhir `20261206000000`. Sebanyak **48 versi source belum tercatat** pada ledger. Metadata `name` untuk versi `20261205000000` dan `20261206000000` kosong.
- GitHub Actions [run 40480854534](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40480854534) lulus pada commit kode tersebut dengan Supabase lokal dan fixture sintetis. Ini bukan rehearsal pada staging dan bukan persetujuan untuk menerapkan migration.
- Tidak ada data Firestore disalin dan tidak ada migration/data yang ditulis ke Supabase staging atau Production pada checkpoint ini.
- PR mengestimasi kematangan fitur **73%** dan kesiapan go-live **46%**. Itu estimasi, bukan hasil UAT/telemetri.

## Kriteria penerimaan logic dan relasi

1. **Tenant terikat di database:** semua tabel operasional ber-`tenant_id NOT NULL` kecuali katalog global yang didokumentasikan; relasi antartabel memakai kunci komposit tenant agar child tidak dapat menunjuk parent tenant lain.
2. **Isolasi izin di server:** API memvalidasi access token, memuat profil aktif dari sumber tepercaya, menentukan tenant/role/permission dari profil server, dan menolak secara default. Jangan menerima tenant/role dari payload klien sebagai otoritas.
3. **RLS dan hak database konsisten:** setiap tabel di schema terekspos memiliki RLS serta policy sesuai role dan tenant. Tinjau grants, view, RPC, trigger, dan `SECURITY DEFINER`; `service_role` hanya boleh dipakai server di balik pemeriksaan otorisasi.
4. **Transaksi atomik dan idempoten:** nomor unik seperti NIS menggunakan constraint dan reservasi transaksional; retry PPDB tidak menggandakan pendaftaran; reservasi stok/booking dan pembatalan menghasilkan ledger/mutasi yang konsisten; penulisan keuangan tidak membuat saldo tanpa jejak jurnal.
5. **Relasi lintas modul teruji:** santri-wali, kelas/akademik, halaqah/sesi Tahfidz, asrama/kamar, tagihan/pembayaran, dan produk/pesanan mengarah ke record dalam tenant yang sama. Uji skenario sukses, retry, konflik, dan akses silang tenant dengan fixture sintetis.
6. **Tenant kosong dapat memulai operasi:** admin dapat membuat record awal lewat UI/API biasa. Import Firestore, ID lama, dan snapshot lama bukan prasyarat untuk membuka modul.
7. **UI dan API menangani keadaan kosong serta gagal:** daftar kosong, loading/error, validasi, retry, paginasi, dan respons server harus konsisten tanpa fallback diam-diam ke Firebase.

## Urutan kerja aman berikutnya

1. Tinjau 95 source migration dan cocokkan lineage, urutan dependency, efek DDL, seed sistem, serta migration yang hanya menyiapkan fungsi importer legacy. Pembuatan fungsi importer tidak berarti importer harus dipanggil.
2. Pada staging, lakukan pemeriksaan baca-saja terhadap versi ledger, schema, grants, RLS/policy, fungsi, dan Storage. Rekonsiliasi dahulu dua metadata ledger yang kosong; jangan menjalankan `migration repair` atau menerapkan batch hanya berdasarkan selisih versi.
3. Buktikan backup dan pemulihan pada environment yang bisa dibuang/dipulihkan. Lakukan rehearsal **schema-only** di Supabase lokal atau branch/database uji yang terpisah. Jangan mengubah atau menghapus row staging yang sudah ada.
4. Jalankan CI/pgTAP dan API test lintas tenant/role dengan data sintetis; tambahkan uji relasi FK komposit, ID unik, transaksi serentak, idempotensi, Storage privat, dan tenant kosong.
5. Setelah bukti schema-only dan restore lulus, minta tim backend menjalankan login/UAT pada staging: Admin, staf berizin terbatas, wali, penolakan tenant lain, dan semua modul inti.
6. Sebelum go-live, rotasi secret/password database yang pernah dibagikan, periksa konfigurasi environment customer-managed, backup terjadwal, observabilitas, rollback, serta uji responsive browser.

## Gerbang dan batas

- Beda jumlah dokumen Firestore dan baris Supabase **bukan** blocker dan tidak perlu dibuat sama.
- Yang masih menjadi blocker adalah provenance/lineage migration, rehearsal schema yang dapat dipulihkan, uji live Auth/RLS/Storage, UAT lintas modul/tenant, dan kesiapan operasi environment pelanggan.
- Jangan menerapkan migration ke Production, mengubah feature flag Production, mengimpor data, atau menghapus data staging berdasarkan checkpoint ini.

## Bukti dan dokumen

- [PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)
- [GitHub Actions run 40480854534](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40480854534)
- Laporan hitungan dan preview lama dipertahankan sebagai arsip teknis; hasilnya bukan target import atau release gate.

**Kesimpulan:** lanjutkan cutover dengan membuktikan logic dan relasi Supabase memakai schema dan fixture sintetis. Tidak ada pekerjaan penyalinan Firestore yang diperlukan.