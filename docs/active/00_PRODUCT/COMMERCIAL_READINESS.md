# Kesiapan Komersial dan Go-Live ERP4 Pesantren

Status: kriteria kerja untuk perencanaan; belum menjadi klaim bahwa produk siap dijual.

## Asumsi produk

Model kerja untuk tahap ini adalah SaaS multi-tenant: satu tenant mewakili satu pesantren. Langganan penggunaan ERP oleh pesantren adalah layanan produk dan harus dipisahkan dari modul Keuangan yang mengelola SPP, tagihan santri, dan transaksi internal pesantren.

Harga, isi paket, batas pengguna/penyimpanan, masa uji coba, kanal pembayaran langganan, serta kebijakan pembatalan harus divalidasi bersama pemilik produk dan calon pelanggan sebelum fitur penagihan SaaS ditetapkan.

## Baseline yang sudah diverifikasi

- Branch `main` masih memakai Firebase pada runtime autentikasi dan data; `package.json` memuat `firebase` dan `firebase-admin`, dan belum memuat SDK Supabase.
- PR #1 `feat(supabase): add tenant-safe PPDB foundation` masih draft. Skema tenant/RLS belum diterapkan ke database. Firebase tetap sumber operasional.
- `supabase/config.toml` di `main` masih berisi `your-project-id`; project reference yang benar sudah dicatat pada branch PR #1.
- Edge Function yang ditemukan pada `main` hanya `hello-world`; alur provisi tenant/user dan PPDB Supabase belum tersedia.
- Form PPDB publik mengirim JSON kandidat ke endpoint server Firebase. Pemilihan berkas saat ini hanya menyetel nama dan status checklist di UI; file tidak dikirim sebagai konten berkas. Server menyimpan NIK/NISN plaintext di Firestore.
- Dashboard Supabase menunjukkan GitHub integration tersambung dengan deploy produksi nonaktif. Paket proyek saat ini tidak menyediakan preview database branch per PR.

Baseline ini adalah bukti bahwa perpindahan dan kesiapan komersial masih dalam proses, bukan penilaian bahwa produk sudah layak ditawarkan.

## Gerbang kesiapan produk

### 1. Produk dan paket

Sebelum penawaran berbayar:

- Tetapkan segmen awal (jenis/ukuran pesantren), persona pembeli, dan alur utama yang akan dijual.
- Tetapkan paket, hak fitur, batas pemakaian, trial, kebijakan perpanjangan/pembatalan, dan proses suspend/aktifkan kembali tenant.
- Pisahkan entitlements paket dari permission pengguna: paket mengatur hak tenant, sedangkan role/permission mengatur tindakan tiap akun.
- Pisahkan invoice langganan SaaS dari seluruh invoice/tagihan operasional pesantren.
- Buat onboarding tenant, checklist setup awal, template impor data, dan panduan administrator.

Selesai jika calon pelanggan dapat memahami apa yang dibeli, admin pesantren dapat memulai tenant tanpa intervensi database manual, dan sistem menolak penggunaan di luar entitlement paket.

### 2. Keamanan, privasi, dan tata kelola

- Semua tabel dan berkas tenant memiliki batas tenant yang diuji; perubahan role tidak berasal dari metadata client.
- Seluruh jalur tulis kritis melalui backend tepercaya. Service-role secret tidak pernah dikirim ke browser, repository, atau log.
- RLS dan Storage policies diuji lintas tenant serta lintas role, termasuk pengguna nonaktif dan tenant tersuspend.
- Data identitas sensitif dienkripsi pada sisi server, kunci dikelola terpisah dan dapat dirotasi, dan pencarian duplikat memakai fingerprint berkunci.
- Catat perubahan admin dan transaksi sensitif pada audit log.
- Tentukan tujuan penggunaan, masa retensi, ekspor/penghapusan data, respons insiden, kontak privasi, dan dokumen kontrak/privasi dengan tinjauan profesional yang sesuai.

Selesai jika data satu pesantren tidak dapat dibaca atau diubah oleh tenant lain pada pengujian adversarial, dan operator dapat menjawab siapa mengakses/mengubah data penting.

### 3. Keandalan operasional

- Ada backup yang mencakup database dan berkas, serta restore drill dengan hasil terukur.
- Monitoring menangkap error backend, kegagalan job, latensi, kuota, dan penggunaan per tenant; alert memiliki pemilik dan prosedur tindak lanjut.
- Definisikan target pemulihan (RPO/RTO), jam dukungan, tingkat keparahan insiden, eskalasi, dan komunikasi pelanggan.
- Setiap rilis memiliki environment staging, migrasi database terlacak, pemeriksaan sebelum rilis, rollback/forward-fix plan, dan catatan rilis.
- Sediakan status layanan, prosedur pemeliharaan, dan proses ekspor data saat tenant keluar.

Selesai jika tim pernah memulihkan backup, dapat menemukan penyebab error, dan dapat memberi tahu tenant terdampak melalui proses yang sudah ditetapkan.

### 4. Migrasi dan cutover

- Inventarisasi koleksi Firebase, jumlah dokumen, field PII, file, relasi, dan tenant yang valid.
- Buat mapping tenant dan ID sumber ke UUID Supabase; jangan mengasumsikan ID Firebase sama dengan UUID baru.
- Import dapat dijalankan ulang dengan aman, memiliki dry-run, validasi, rekonsiliasi jumlah dan saldo, serta laporan item gagal.
- Migrasikan satu irisan modul, uji read/write dan isolasi, lalu lanjutkan irisan berikutnya. Hindari dual-write yang tidak memiliki rekonsiliasi.
- Tentukan jendela cutover, pembekuan tulis, verifikasi, dan rollback sebelum mengganti sumber baca/tulis.
- Firebase baru dapat dihentikan setelah seluruh modul aktif, bukti rekonsiliasi disetujui, dan masa observasi cutover selesai.

Selesai jika hasil sumber dan tujuan direkonsiliasi dan ada prosedur rollback yang sudah diuji.

### 5. Validasi pasar dan kesiapan penawaran

- Jalankan pilot dengan pesantren yang mewakili variasi ukuran dan proses.
- Ukur penyelesaian alur utama, waktu kerja admin, kesalahan data, kebutuhan bantuan, dan keberhasilan onboarding.
- Validasi kesediaan membayar dan kesesuaian paket; hitung biaya layanan, penyimpanan, dukungan, dan biaya pembayaran terhadap pendapatan tiap tenant.
- Perbaiki masalah yang menghalangi onboarding atau penggunaan berulang sebelum membuka penawaran umum.
- Siapkan demo dengan data sintetis, materi penawaran yang tidak menjanjikan fitur yang belum tersedia, dokumentasi pengguna, dan kanal support.

Selesai jika pilot menunjukkan pesantren dapat menyelesaikan alur utama secara mandiri, masalah kritis sudah ditutup, dan harga/paket didukung bukti percakapan atau pembelian nyata.

## Urutan rilis

1. Review dan validasi PR #1; verifikasi database kosong atau data yang ada sudah dipetakan.
2. Uji migrasi tenant/RLS di environment non-produksi atau Supabase lokal; terapkan ke produksi hanya setelah persetujuan dan backup yang sesuai.
3. Implementasikan bootstrap tenant/Admin, manajemen user tepercaya, dan endpoint PPDB dengan validasi, rate limit, idempotensi, enkripsi PII, dan unggah Storage privat.
4. Tambahkan adapter Supabase dan migrasi data per modul dengan rekonsiliasi; Firebase tetap aktif sampai cutover.
5. Selesaikan paket/entitlements serta lifecycle langganan setelah aturan bisnis dan harga disetujui.
6. Jalankan matriks keamanan, transaksi, pemulihan, dan UAT dengan tenant pilot.
7. Go-live terbatas, pantau indikator layanan dan support, lalu buka penawaran lebih luas setelah gerbang pilot terpenuhi.

## Batas keputusan

Migrasi produksi, perubahan sumber data aktif, pembukaan akses publik, aktivasi penagihan, dan pengumuman ketersediaan umum memerlukan persetujuan pemilik produk pada saat tindakan tersebut siap dilakukan. Dokumen ini tidak mengaktifkan deploy atau menerapkan migrasi.
