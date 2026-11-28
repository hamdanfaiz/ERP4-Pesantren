# Audit Izin Role, Tab, Tindakan, dan Kolom

Tanggal: 28 November 2026  
Branch kerja: `codex/rbac-screen-field-20261128`

## Kesimpulan

RBAC tidak cukup membatasi modul. Menu/tab, tindakan, dan kolom/data yang ditampilkan perlu izin role tersendiri, sementara API, RPC, dan RLS tetap menjadi batas keamanan. Pemeriksaan menemukan tab LMS yang sama ditampilkan ke Santri, Ustadz, dan Admin walau sumber data serta kemampuan backend berbeda. Pemeriksaan juga menemukan snapshot Perpustakaan mengirim daftar santri dan riwayat sirkulasi tenant penuh ke akun Santri.

## Perubahan dalam branch

- `ROLE_PERMISSION_POLICIES` menjadi daftar izin kode terpusat untuk tab, tindakan, dan bidang sensitif. ID yang tidak terdaftar ditolak. Hak akun di bawah suatu role tidak dapat melampaui baseline role maupun izin modul yang dicabut.
- Tahfidz mempertahankan kebijakan per tab/tindakan/kolom, termasuk portal Wali, penilaian antar-santri, catatan internal, dan tindak lanjut staf.
- LMS kini menyaring tab: Santri tidak mendapat direktori Pengajar/Kategori Admin; Ustadz tidak mendapat tab diskusi peserta; tab dan tindakan lain mengikuti role. Roster pengumpulan tidak menampilkan identitas peserta kepada Santri.
- API LMS memeriksa role untuk pengelolaan kategori/kursus/materi/tugas/enrollment, progres belajar, catatan, komentar, pengumpulan, dan penilaian. Prosedur database tetap memeriksa role, tenant, penugasan kursus, serta relasi peserta.
- Akademik menggunakan izin tab/tindakan yang sama untuk memilih layar, mengirim pencatatan, membaca ruang rapor, dan memeriksa konflik jadwal. Santri/Wali tetap diarahkan ke portal akademik mereka.
- Keuangan memisahkan tab Tagihan, Pengeluaran, dan Buku Besar serta aksi penerbitan, pembayaran, persetujuan, penguncian, dan ekspor. Ustadz mendapat tab Pengeluaran untuk unit yang ditugaskan; Santri tidak mendapat modul Keuangan karena belum ada alur peserta; Wali hanya melihat tagihan milik relasinya.
- Wali tidak lagi mendapat modul Donasi & Wakaf internal: runtime Donasi yang tersedia mengelola kampanye, daftar donatur, transaksi tenant, dan aset wakaf, sedangkan API hanya mendukung Admin/SuperAdmin. Alur donasi mandiri Wali perlu dirancang sebagai layar/API terpisah sebelum modul diberikan kembali.
- Perpustakaan kini memberi Santri tab baca yang sesuai, sementara query server membatasi sirkulasi dan daftar identitas pada Santri yang tertaut. Jumlah stok tersedia tetap dihitung dari hitungan sirkulasi seluruh tenant, tanpa mengirim daftar peminjam tenant kepada Santri. Operasi katalog, peminjaman, pengembalian, dan unggah tetap khusus staf.
- Komunikasi kini menyaring tab Templat untuk Admin, membatasi aksi penerbitan/templat/konfirmasi baca sesuai role, dan menghilangkan statistik jangkauan pengumuman dari payload non-Admin. Tab Perizinan mengikuti izin modul Asrama karena data berasal dari API Asrama.
- Asrama kini menyaring tab Penempatan Kamar, Perizinan, Kedisiplinan, Kehadiran, Penugasan, dan Fasilitas mengikuti role. Pemeriksaan izin yang sama diterapkan di endpoint baca/tulis, bukan hanya pada navigasi. Perubahan akun/role memaksa layar Asrama dimuat ulang agar data roster role sebelumnya tidak tertinggal di memori.
- Asrama membatasi identitas santri ke layar petugas, membatasi tiket fasilitas Santri/Wali ke tiket milik akunnya dan kamarnya, serta tidak mengirim nama pelapor kepada Santri/Wali. Penempatan kamar dan penugasan staf hanya untuk Admin/SuperAdmin; Ustadz hanya melihat data operasional di lokasi yang ditugaskan.
- CBT mengikuti kemampuan API saat ini: Santri memakai halaman peserta khusus; tab pengelolaan hanya untuk Admin/SuperAdmin. Menu CBT Ustadz disembunyikan sampai endpoint guru yang dibatasi berdasarkan penugasan tersedia, agar menu tidak tampak aktif tetapi berakhir dengan penolakan API.
- Helper RLS `private.has_module_access` diperbarui agar izin modul eksplisit tidak dapat menaikkan role. Kebijakan SuperAdmin tetap mengikuti katalog modul yang dikenal.
- Matriks Pengaturan untuk modul ditampilkan sebagai baseline role, bukan editor izin palsu. Izin tab/aksi/kolom saat ini merupakan kebijakan tetap di source, belum dapat diubah per akun melalui UI.

## Matriks role yang diperiksa

| Area | Admin / SuperAdmin | Ustadz | Santri | Wali Santri |
| --- | --- | --- | --- | --- |
| LMS — direktori Pengajar dan Kategori | Kelola/lihat | Tidak | Tidak | Tidak |
| LMS — kursus/materi | Kelola dalam tenant | Kursus yang ditugaskan sesuai API | Kursus terdaftar milik sendiri | Tidak |
| LMS — pengumpulan | Lihat roster dan menilai | Roster kursus yang diampu dan menilai | Kirim dan lihat pengumpulan sendiri | Tidak |
| Akademik — jadwal/konflik/referensi | Ya | Tidak | Portal | Portal |
| Akademik — jurnal/penilaian/rapor | Ya | Sesuai cakupan pengajar | Portal | Portal |
| Keuangan — tagihan | Kelola/verifikasi | Tidak | Tidak tersedia | Tagihan santri tertaut |
| Keuangan — pengeluaran | Kelola/persetujuan | Ajukan sesuai unit dan layanan | Tidak | Tidak |
| Keuangan — buku besar | Ya | Tidak | Tidak | Tidak |
| Donasi & Wakaf internal | Ya | Tidak | Tidak | Tidak |
| Perpustakaan — sirkulasi | Roster tenant | Roster staf | Peminjaman santri tertaut saja | Tidak tersedia |
| Komunikasi — templat/statistik | Kelola dan lihat statistik | Tanpa kelola/statistik | Tidak tersedia | Tanpa kelola/statistik |
| Tahfidz — fitur peserta | Sesuai izin operasi | Sesuai halaqah yang diampu | Data dan tindakan milik sendiri | Data santri yang tertaut |
| Asrama — penempatan, disiplin, kehadiran | Kelola tenant | Data lokasi tugas; tanpa penempatan kamar | Tab tidak tersedia | Tab tidak tersedia |
| Asrama — perizinan | Kelola sesuai alur persetujuan | Proses sesuai penugasan | Permintaan dan data sendiri | Permintaan dan data anak tertaut |
| Asrama — fasilitas | Audit, tiket, penyelesaian | Lokasi tugas | Tiket milik sendiri | Tiket milik sendiri |
| CBT — manajemen ujian | Kelola | Belum tersedia; modul disembunyikan | Halaman peserta terpisah | Tidak tersedia |

SuperAdmin tetap tunduk pada daftar izin fitur eksplisit untuk tab/aksi tertentu; status platform tidak otomatis membuat semua operasi bisnis tersedia.

## Batas cakupan

- Ini bukan audit lengkap semua modul. Asrama dan permukaan CBT yang disebut di atas sudah dicakup pada level source, tetapi belum UAT lintas-role. PPDB, HRIS, UKS, Koperasi, Dokumen, Donasi, Alumni, Marketplace, dan modul lainnya masih memerlukan inventaris tab → aksi → kolom → cakupan baris yang sama. Perpustakaan dan sebagian Komunikasi telah diperiksa pada area yang disebut di atas; modul lain di dalamnya belum dianggap lulus seluruhnya.
- Izin tab/kolom yang tercatat di registry belum berarti seluruh kolom seluruh modul sudah diberi izin satu per satu. Di sisi database, akses per baris tenant/relasi tetap perlu pemeriksaan terpisah.
- UI menyembunyikan elemen yang tidak diizinkan, tetapi keamanan bergantung pada penolakan API/RPC dan RLS; pengujian jaringan terhadap semua endpoint belum selesai.
- Belum ada UI untuk konfigurasi izin tab/aksi/kolom per individu. Penyesuaian sekarang memerlukan perubahan source yang ditinjau dan diuji.
- Migrasi `20270409000000_rbac_role_module_ceiling.sql` belum diterapkan ke staging atau Production. Production tidak diubah.

## Status verifikasi

- `npm run test:rbac-permissions` lulus. Pemeriksaan memastikan tab/tindakan/bidang dalam matriks menolak role yang tidak sesuai, per-user module grant tidak dapat menaikkan role, serta daftar modul SQL RLS sama dengan baseline aplikasi.
- `npm run lint` lulus.
- `npm run build` lulus. Vite masih memberi peringatan chunk PDF berukuran besar dan annotation dependency yang diabaikan; build tetap berhasil.
- `git diff --check` lulus.
- Migrasi role ceiling masih berupa file lokal; belum diterapkan ke VQE atau Production. Belum ada UAT antarmuka lintas-role untuk perubahan branch ini.

## Verifikasi lanjutan

1. Jalankan `supabase test db` setelah migrasi diterapkan pada database uji lokal, termasuk tes tenant isolation dan role ceiling.
2. UAT dengan akun Admin, Ustadz, Santri, dan Wali: pastikan tab salah-role tidak muncul, URL/tab lama tidak membuka konten, dan API menolak request langsung.
3. Lanjutkan audit terstruktur untuk modul yang belum tercakup sebelum menyatakan seluruh produk selesai.
