# Panduan UAT Antarmuka dan Alur Lintas Modul ERP4 Pesantren

Tanggal: 8 November 2026  
Status: **UAT browser sedang berjalan. Login Admin staging, navigasi awal, dan pemulihan antrean Akademik selesai; UAT lintas role dan transaksi UI masih terbuka.**
Baseline kode utama: `main` commit `ef8ce28e9541137e2154d025211db574dc2eef94`; perbaikan UAT saat ini disiapkan pada branch PR #90.
Bukti otomatis baseline: [GitHub Actions run 42445243553](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42445243553).

Dokumen ini menjadi panduan eksekusi untuk tim backend/operator. CI yang lulus membuktikan build, migrasi lokal, tes database/API sintetis, instalasi paket, dan uji image pelanggan. Itu belum menggantikan UAT melalui browser dengan akun dan tenant uji.

## 1. Batas dan keamanan pengujian

- Jalankan UAT pada **staging VQE** atau environment staging khusus dengan tenant sintetis. Jangan membuat fixture atau transaksi uji di PTSAS Production.
- Catat commit yang sedang diuji. Build yang diuji harus berasal dari commit yang sama dengan build yang akan diserahkan untuk deploy.
- Siapkan dua tenant sintetis terpisah (Tenant A dan Tenant B) serta akun uji Admin, Ustadz, Santri, Wali, dan petugas keuangan sesuai role yang didukung.
- Pastikan feature flag modul yang diuji aktif di staging. Gunakan Supabase Auth dan Storage staging yang sama dengan backend staging.
- Jangan masukkan secret key, token, password, NIK, bukti bayar nyata, atau data pribadi ke laporan dan tangkapan layar.
- Setelah UAT, hapus seluruh fixture sintetis dan pastikan penghapusan terverifikasi. Jangan menghapus akun/data pelanggan.

## 2. Login, tenant, dan izin

- [ ] Admin Tenant A dapat login, memuat profil dan tenant yang benar, lalu keluar dan login kembali.
- [ ] Akun dengan izin modul dicabut tidak dapat membuka modul melalui menu maupun endpoint.
- [ ] Ustadz, Santri, Wali, dan petugas keuangan hanya melihat menu dan tindakan yang diberikan.
- [ ] Wali hanya melihat santri yang terhubung ke akun/relasi Wali tersebut.
- [ ] Admin Tenant A tidak dapat melihat atau mengubah record Tenant B, termasuk melalui URL langsung, pencarian, ekspor, dan filter.
- [ ] Status loading, kosong, validasi, error jaringan, akses ditolak, dan sesi kedaluwarsa tampil jelas serta dapat dipulihkan.
- [ ] Tombol aksi utama dan sekunder merespons satu kali; pengiriman ulang tidak membuat data ganda.

**Bukti:** akun/role (gunakan alias uji, tanpa password), tenant, halaman yang diuji, hasil izin, dan screenshot tanpa data sensitif.

## 3. Data induk, ID otomatis, dan PPDB

- [ ] Buat dan baca ulang data referensi tenant yang dibutuhkan: unit, kelas/jenjang, gedung, kamar, kurikulum, dan kategori terkait.
- [ ] Buat santri dari antarmuka; pastikan ID/NIS mengikuti Naming Series aktif dan relasi kelas/unit tersimpan.
- [ ] Impor CSV melalui pratinjau; validasi baris salah, duplikat, referensi tidak dikenal, dan ringkasan hasil sebelum komit.
- [ ] Ekspor data tenant menggunakan template yang sesuai; pastikan tenant lain dan PII yang tidak diizinkan tidak ikut.
- [ ] Kirim pendaftaran PPDB publik, unggah dokumen, lalu proses tahap admin sampai keputusan akhir.
- [ ] Terima kandidat dan periksa hubungan kandidat → santri → wali → kelas → gedung/kamar → tagihan.
- [ ] Muat ulang halaman dan login kembali; semua record dan relasi tetap terbaca dari Supabase.
- [ ] Coba pengiriman ulang pada operasi yang mendukung retry; pastikan tidak menggandakan kandidat, NIS, tagihan, atau okupansi.

**Catatan:** tes duplikasi NIS serentak, validasi database, PPDB API, dan onboarding sintetis sudah dijalankan di CI/staging sebelumnya. UAT ini membuktikan alur antarmuka pada environment target.

## 4. Keuangan, berkas, dan integrasi Storage

- [ ] Buat tagihan untuk kandidat/santri dan baca ulang relasinya setelah refresh.
- [ ] Unggah bukti pembayaran sintetis dengan tipe dan ukuran valid; uji penolakan file invalid/terlalu besar.
- [ ] Buka/unduh bukti memakai akun yang berhak; pastikan URL objek privat tidak dapat dibuka oleh tenant/role lain.
- [ ] Verifikasi pembayaran melalui alur role yang ditetapkan; cek status tagihan, audit trail, dan saldo/laporan yang terkait.
- [ ] Ulangi submit dengan request yang sama; pastikan posting keuangan idempoten.
- [ ] Pastikan kegagalan upload atau verifikasi tidak meninggalkan transaksi setengah jadi.

## 5. Akademik, Tahfidz, asrama, dan portal

- [ ] Akademik: buat jadwal/asesmen dengan referensi kelas, guru, dan mata pelajaran; lihat dari portal role yang berhak.
- [ ] Tahfidz: tetapkan target/keanggotaan, catat sesi dan hasil, lalu pastikan tanggal bisnis tenant serta riwayat konsisten.
- [ ] Peer review Tahfidz: hanya teks; pastikan moderasi Ustadz dan batas halaqah diterapkan. Jangan menguji audio sebagai fitur rilis.
- [ ] Wali: buka roster dan pastikan hanya santri yang tertaut yang tampil.
- [ ] Asrama: tempatkan santri, cek kapasitas dan okupansi, lalu uji izin, absensi, disiplin, serta riwayat perubahan.
- [ ] CBT/LMS: buat/terbitkan materi atau ujian sintetis; mulai, simpan, submit, nilai, dan baca ulang hasil sesuai role.
- [ ] Pastikan benturan jadwal, kamar penuh, data lintas tenant, dan mutasi tanpa izin ditolak dengan pesan yang dapat dipahami.

## 6. Modul operasional lainnya

Untuk setiap modul, jalankan minimal satu alur create/read/update atau transisi yang didukung, muat ulang, dan pastikan relasi serta tenant tetap benar:

- [ ] Koperasi: katalog, stok, penjualan, dan posting dompet/keuangan.
- [ ] Marketplace: katalog, stok, pesanan, dan pembatalan. Pembayaran eksternal/PPOB tidak termasuk rilis awal.
- [ ] CRM dan komunikasi: kontak/interaksi, target pengumuman, penerima, dan pengakuan bila diaktifkan.
- [ ] Laundry: pesanan, perubahan status, dan riwayat.
- [ ] Donasi/wakaf: kampanye, transaksi, dan relasi donor.
- [ ] Perpustakaan: katalog, sirkulasi, pengembalian, serta aset privat.
- [ ] Dokumen digital: pendaftaran, nomor, filter, transisi, audit, dan konsistensi gaya tab dengan standar UI.
- [ ] Kesehatan: kunjungan, rekam, akses role, dan relasi santri.
- [ ] General Affairs/aset: katalog terkait, kode otomatis, opname, mutasi stok, dan audit.
- [ ] Pemesanan fasilitas: referensi lokasi/fasilitas, benturan jadwal, pembatalan, dan audit.
- [ ] HRIS: pegawai, unit/jabatan, absensi, cuti, dan persetujuan.
- [ ] Alumni: kelulusan, arsip, profil/permintaan, dan pembatasan akses.
- [ ] Pengaturan/multi-unit: konfigurasi tenant, unit organisasi, hak akses, dan kalender bisnis.

Jika suatu modul belum diaktifkan atau tidak tersedia di staging, catat sebagai **belum diuji**; jangan mengubahnya menjadi “lulus”.

## 7. Pemeriksaan tampilan dan konsistensi

Uji lebar layar sekitar 375 px, 768 px, dan 1366 px:

- [ ] Sidebar/navigasi tidak menumpuk atau menutupi konten; submenu tetap dapat ditemukan.
- [ ] Tab, tombol, formulir, tabel, tipografi, warna, wadah, jarak, dan status kosong/loading/error konsisten.
- [ ] Tab Dokumen Digital mengikuti komponen/pola tab standar.
- [ ] Tabel, formulir panjang, dialog, tombol ekspor/impor, dan pemilih relasi dapat digunakan dengan keyboard serta layar kecil.
- [ ] Pesan sukses/gagal menyebut hasil tindakan tanpa membocorkan data sensitif atau detail internal.

## 8. Format laporan hasil

Untuk setiap skenario, isi:

| Kolom | Isi |
|---|---|
| ID skenario | Contoh: `FIN-03`, `WALI-02`, `UI-05` |
| Commit dan environment | SHA build, nama staging, waktu |
| Tenant/role | Alias sintetis saja |
| Prasyarat dan langkah | Urutan tindakan yang dilakukan |
| Hasil yang diharapkan/aktual | Jelaskan record, relasi, dan status setelah refresh |
| Status | Lulus / Gagal / Belum diuji |
| Bukti | Screenshot/log tersanitasi; tidak berisi token, password, atau PII |
| Temuan | Dampak, prioritas, dan langkah reproduksi |

## 9. Kriteria selesai UAT

- Semua skenario login, isolasi tenant, alur transaksi penting, dan unggah privat berstatus **Lulus**.
- Tidak ada bug prioritas tinggi/kritis, data hilang, duplikasi, salah tenant, atau akses role yang bocor.
- Modul yang tidak diaktifkan secara eksplisit tercatat sebagai belum diuji atau dikeluarkan dari ruang lingkup rilis.
- Tim menyimpan bukti backup dan rehearsal restore Production secara terpisah; smoke test backup/restore sintetis CI bukan bukti pemulihan Production.
- Hasil UAT ditandatangani pemilik produk dan tim backend sebelum deploy pelanggan.

## Revalidasi build dan integrasi staging — 8 November 2026

- Source yang diperiksa: `main` commit `ef8ce28e9541137e2154d025211db574dc2eef94`. Commit tersebut hanya memperbarui dokumentasi dibanding baseline runtime sebelumnya. Workflow pada `main`, [GitHub Actions run #42462549477](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42462549477), selesai sukses.
- `npm run lint` dan `npm run build` lulus pada checkout tersebut. Build memberi peringatan bahwa chunk `react-pdf.browser` sekitar 1,46 MB; build tidak gagal, tetapi pemecahan chunk masih disarankan.
- VQE staging (`vqemuyzveuirlkvdggjd`) merespons API. Ledger migrasi staging cocok dengan 139 file migrasi source (versi dan nama); ini tidak membuktikan kesetaraan DDL Production.
- Tiga suite simpan-baca API dijalankan langsung terhadap VQE dengan fixture sintetis: `test:api:finance-storage` lulus (Finance/PPDB, onboarding dan relasinya, Storage privat, transaksi/idempotensi, role/tenant); `test:api:library-storage` lulus (unggah/unduh bertanda tangan, integritas konten, role/tenant); `test:api:document-center` lulus (nomor, alur dokumen, audit, lampiran PDF privat, tenant/permission). Ketiganya melaporkan cleanup sukses; tenant fixture disuspensi dan akun Auth sintetis diblokir.
- Pada saat snapshot source tersebut dicatat, sesi login browser belum tersedia; seluruh skenario role, navigasi operasional, dan form UI tetap **belum diuji** pada snapshot itu.
- Untuk pratinjau UAT ini saja, runtime flags diaktifkan pada proses server sementara agar menu Supabase dapat dibuka; `.env.example`, Compose, staging, dan Production tidak diubah. Server preview yang masih aktif mengarah ke VQE staging dan dapat menulis data jika pengguna melakukan aksi. Gunakan hanya record sintetis dan hentikan server setelah UAT.
- Langkah berikutnya: pemilik akun login sendiri ke preview dan menjalankan skenario browser pada bagian 2–7. Tim backend tetap memegang verifikasi DDL/urutan migrasi Production, backup-restore Production, deployment, dan UAT hosting.

## UAT browser Admin staging — 8 November 2026

- Operator berhasil login pada preview lokal `http://localhost:4179/` sebagai Admin UAT untuk tenant sintetis VQE. Production tidak digunakan.
- Navigasi ke 25 modul utama berhasil dibuka; tidak ditemukan halaman kosong atau error aplikasi yang tampak di browser. Pemeriksaan ini hanya smoke test navigasi, bukan bukti semua tindakan pada setiap modul berfungsi.
- Unit organisasi sintetis `UAT01` dan referensi jenjang sintetis `Jenjang UAT` dengan kode NIS `91` berhasil disimpan dan ditampilkan kembali di UI.
- Saat Akademik memuat antrean kelas lama yang belum memiliki unit, backend menolak akses. Profil Admin staging memiliki `module_permissions = {}`; aplikasi menetapkan Admin mendapat semua modul tenant sebagai baseline, tetapi RPC `get_tenant_unmapped_academic_classes` dan `assign_tenant_academic_class_unit` pada migrasi lama menuntut nilai eksplisit `academic: true`.
- Perbaikan sumber pada `20270308000000_academic_class_unit_admin_role_baseline.sql` membuat kunci izin yang tidak ada mengikuti baseline role dan tetap menolak nilai eksplisit selain `true`. Replay migrasi dan regresi pgTAP lulus di [CI run #42468708677](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42468708677).
- Migrasi diterapkan ke VQE staging saja. Ledger staging cocok dengan source pada **140/140 versi dan nama**. Setelah refresh UI, antrean kelas berhasil dimuat dan menampilkan “Semua kelas tenant sudah memiliki unit”; karena tenant sintetis tidak memiliki kelas belum terpetakan, UAT UI belum menguji pemetaan kelas aktual. PgTAP mencakup simpan-pemetaan dan penolakan eksplisit `academic: false`.
- PTSAS Production tidak disentuh. Tidak ada migrasi ke Production.
- UAT lintas role, CRUD dan baca-ulang seluruh modul, responsivitas, serta seluruh skenario pada bagian 2–7 masih belum selesai.

