# Audit Kesesuaian Menu dan Fitur terhadap AI Studio

**Tanggal pemeriksaan:** 31 Oktober 2026
**Referensi antarmuka:** `https://erp4-pesantren.ai.studio/` (dibuka pada sesi Super Admin)
**Sumber implementasi yang dibandingkan:** branch `codex/menu-parity-import-export-20261031` dan komponen runtime Supabase.
**Status:** audit dan perbaikan visibilitas sedang berjalan; belum menyatakan semua fitur setara atau lulus UAT.

## Cara membaca hasil

Referensi AI Studio menjadi acuan nama menu dan cakupan yang pernah dirancang. Sebagian tombol/layar referensi berisi data contoh atau simulasi. Karena runtime ERP beralih ke Supabase, data dan transaksi contoh tersebut tidak boleh dipulihkan sebagai seolah-olah tersimpan. Status “tersedia” di bawah hanya berarti jalur UI/API Supabase ditemukan pada source; itu tidak membuktikan flag backend aktif, migrasi sudah diterapkan, atau alur sudah lulus UAT.

Status submenu:

- **Tersedia di Supabase:** ada layar dan kontrak API Supabase pada source; masih perlu prasyarat migration, tenant, izin, flag, dan UAT.
- **Tersedia di halaman lain:** fungsi dasar sudah tercakup pada layar yang disebut, tetapi belum mempunyai halaman terpisah seperti referensi.
- **Belum tersedia:** harus tetap tampak dengan keterangan yang jelas; jangan tampilkan data contoh atau aksi yang tampak berhasil.
- **Dikeluarkan dari rilis awal:** keputusan pemilik produk; jangan aktifkan otomatis.

## Peta modul

| Modul referensi | Submenu/fitur yang terlihat di AI Studio | Cakupan Supabase saat ini | Kesenjangan yang perlu ditangani |
|---|---|---|---|
| Ringkasan | Hari/minggu/bulan, pertumbuhan pendaftaran, target Tahfidz, kecerdasan eksekutif, analitik PPDB dan risiko target | Ringkasan operasional tenant dan agregat aturan tersedia; beberapa kartu dibatasi role | Samakan filter periode dan kartu. Analitik prediktif/AI belum menjadi fitur Supabase yang terverifikasi. |
| Data Induk | Santri, struktur (Gedung/Kamar/Kelas/Peta Struktur), impor/ekspor, templat, QR, dan jejak audit | Santri dan struktur yang didukung memakai API tenant; audit memiliki endpoint tenant khusus. Wali, Pengajar, Pegawai, Alumni, Yayasan/unit, Halaqah, serta pemesanan fasilitas ditempatkan pada modul pemiliknya, tanpa tombol pengalihan dari Data Induk. | Referensi Pengajar, Mata Pelajaran, dan Kurikulum pada Akademik saat ini baca-saja; API katalog akademik belum tersedia. Impor/ekspor/templat/QR hanya berlaku untuk kategori yang memiliki jalur tenant. |
| Manajemen Pengguna | Daftar akun, role dan akses modul | Profil tenant, role, izin modul, dan alur Admin memakai Supabase | Bandingkan sub-menu/detail referensi dan jalankan matriks role; jangan membuka izin lintas tenant. |
| PPDB Digital | Portal publik, kandidat/tahapan, nilai CBT, jadwal ujian/wawancara, pembayaran, penempatan otomatis, onboarding | Portal publik, pendaftaran bertransaksi, kandidat, penilaian, dan onboarding ke Santri/Wali tersedia pada source | Pembayaran/tagihan PPDB, kalender, penjadwalan wawancara/ujian, sinkron CBT, dan pengalaman wali masih perlu dicocokkan. |
| Ujian (CBT) | Dashboard, kalender, sesi, paket, bank/builder soal, pemantauan langsung, hasil/analitik, pengaturan | Bank soal, sesi/penugasan, dan hasil punya API. Menu referensi yang belum tersambung kini ditampilkan dengan status. | Paket, kalender khusus, pemantauan langsung, dan konfigurasi tenant belum memiliki alur terpisah. |
| Tahfidz | Ringkasan, setoran, target/rapor, talaqqi, munaqasyah, portal wali, peer review, Al-Qur'an, capaian, halaqah, ekspor/pengingat/penilaian audio | Roster, halaqah, setoran, target, jadwal/sesi, portal tertaut, serta peer review teks termoderasi memiliki jalur Supabase | Pastikan semua tab tidak memakai state contoh saat runtime Supabase. Audio/AI, sebagian ekspor/pengingat, dan gamifikasi belum boleh dianggap aktif tanpa API dan UAT. |
| Asrama | Detail kamar, izin, kedisiplinan, kehadiran, audit kebersihan, tiket perbaikan, musyrif | Izin, kedisiplinan, kehadiran, penugasan petugas, audit kebersihan, dan tiket punya API/layar | Lima bagian saat ini mewadahi tujuh area referensi: kamar bersumber dari Data Induk; fasilitas memuat audit dan tiket; penugasan memuat musyrif. Beri penjelasan/pengarah yang eksplisit. |
| Akademik Formal | Jadwal/kalender, jurnal KBM, penilaian, E-Rapor, penyelesaian konflik jadwal | Jadwal, jurnal, dan penilaian memakai API tenant. Deteksi konflik pengajar/ruang/kelas tersedia pada layar Akademik; transaksi Supabase juga menolak jadwal yang bentrok. | E-Rapor semester belum tersedia. Resolusi konflik masih berupa pemeriksaan dan tindakan manual, bukan penjadwalan ulang otomatis. Daftar jadwal/jurnal/nilai dan roster memakai paginasi, tetapi daftar awal pengajar dan unit masing-masing dibatasi 500 serta referensi akademik 2.000. Pemindaian konflik jadwal dibatasi 5.000 record dan pemetaan nama unit 500; kelebihan batas ditolak aman, tetapi kapasitas ini harus ditingkatkan sebelum tenant besar. |
| LMS | Dashboard, kursus/kategori, pustaka video, asesmen, ulasan sebaya, pengajar | Kursus, kategori, materi, penugasan/pengumpulan, penilaian, dan instruktur sebagian dikelola melalui layar kursus; submenu terkait kini diperlihatkan | Dashboard agregat dan peer review LMS belum tersedia; katalog video/instruktur terpisah belum ada. |
| Perpustakaan | Ringkasan, katalog, sirkulasi, perpustakaan digital | Katalog, peminjaman/pengembalian, serta berkas digital privat pada source | Pastikan ringkasan dan tab digital mengikuti flag Storage; jangan tampilkan tombol unggah ketika API/Storage tertutup. |
| Keuangan & Tagihan | Tagihan/SPP, pengeluaran dan persetujuan, buku besar, penutupan buku, verifikasi bukti, cetak dan rilis massal | Tagihan, pengajuan/persetujuan pengeluaran, ledger, penguncian, dan bukti privat tersedia pada source | UAT maker-checker, audit, tutup buku, hak Wali, unduh/cetak, dan integrasi PPDB masih menjadi gate. |
| Pusat Komunikasi | Pengumuman, helpdesk, pesan langsung, izin, templat | Pengumuman tenant memiliki jalur Supabase; bagian komunikasi lain tidak boleh mengandalkan state lokal lama | Helpdesk, pesan langsung, templat, dan integrasi izin perlu inventaris API serta status UI. |
| Kesehatan (UKS) | Kunjungan, profil medis, riwayat, obat, statistik, ekspor | Jalur inti kunjungan/profil dan persediaan obat tersedia pada source | Verifikasi peran klinis, akses data sensitif, statistik, dan ekspor pada tenant staging. |
| Koperasi & Kantin | Petugas, POS, inventaris, pemasok, analitik, dompet santri, pantauan wali | Produk/stok, pemasok, kasir, dompet dan transaksi tercatat ke cashbook tersedia pada source | Direktori petugas, analitik, portal pantauan Wali, serta akuntansi double-entry belum lengkap. |
| Laundry | Pindai label, pesanan aktif, kuota, label/penandaan, riwayat, tarif | Pesanan/status, riwayat, kuota bulanan, dan estimasi tarif tersedia pada source | Pemindaian QR/label, cetak tanda terima, kuota khusus, dan posting biaya ke Finance belum tersedia. |
| Manajemen Multi-Unit | Ringkasan gabungan, registri unit, transfer, tagihan antar-unit, analitik | Seluruh lima tab kini terlihat. Registri, pemetaan data lama, jumlah unit, dan riwayat audit tenant memiliki jalur Supabase | Ringkasan yang tersedia hanya menghitung unit/audit, bukan agregat santri, SDM, saldo, atau pendapatan. Transfer dan tagihan antar-unit belum memiliki API; analitik finansial lintas unit belum tersedia. |
| Keuangan & Anggaran | RKAT, anggaran, proyeksi, pengeluaran, persetujuan, buku entitas, laporan, arus kas | Layar RKAT/anggaran dan sebagian agregat tersedia pada source; gerbang runtime tetap fail-closed | Cocokkan seluruh alur dan hak unit. Buku besar saat ini bukan akuntansi double-entry. |
| SDM (HCM) | Pegawai, kehadiran, cuti, pelacakan, shift, penggajian, kinerja, rekrutmen, analitik | Direktori, kehadiran manual, dan pencatatan/persetujuan cuti Admin tersedia. Semua submenu referensi kini tampak; yang belum punya API diberi status. | Pelacakan, shift, payroll, kinerja, rekrutmen, dan analitik belum tersedia. Hindari pengumpulan lokasi/PII tanpa kebijakan. |
| Sarana & Prasarana | Master data, tiket, aset/inventaris, pengadaan, armada/logistik, housekeeping, dapur | Semua tujuh tab tampak; aset/inventaris memiliki API Supabase | Tab lain adalah status belum tersedia; procurement, fleet, housekeeping, dapur dan ticketing perlu backend. |
| Dokumen Digital | Surat masuk/keluar, persetujuan elektronik, arsip, OCR, ekspor | Surat tenant, status telaah, penyimpanan/unduh privat pada source | Persetujuan berjenjang dan OCR belum tersedia; pastikan arsip mengikuti retensi dan Storage privat. |
| Alumni | Direktori, tracer study, komunitas, donasi | Direktori dan pencatatan kelulusan memiliki API | Tracer, komunitas, dan donasi alumni belum terhubung; donasi harus memakai modul Donasi. |
| Relasi Wali & Donatur | Direktori, alur prospek, siaran, analitik | Kontak tenant, tahapan relasi, persetujuan komunikasi, dan riwayat interaksi tersedia | Pipeline/siaran terjadwal dan analitik per segmen belum tersedia. Hormati persetujuan komunikasi. |
| Donasi & Wakaf | Ringkasan, kampanye, aset wakaf, direktori donatur, analitik | Kampanye, donor, penerimaan/kwitansi, pembatalan audit, dan aset wakaf tersedia pada source | Rekonsiliasi ke Finance, pembayaran publik/berulang, serta batas penerimaan aset perlu dituntaskan. |
| Marketplace | Etalase, pesanan, inventaris, analitik | Katalog, pesanan, stok, dan ringkasan dasar memiliki jalur Supabase | Uji alur penuh, hak unit, kebijakan pembatalan, dan integrasi Finance sebelum rilis. |
| PPOB & Services | PPOB, ZISWAF gateway, tabungan/layanan | **Dikeluarkan dari rilis awal sesuai keputusan pemilik produk.** | Tetap tidak aktif sampai provider, kontrak, rekonsiliasi, dan pengamanan transaksi dipilih. |
| Data Warehouse Hub | Dashboard eksekutif, analitik prediktif, mesin AI Tahfidz, warehouse, knowledge hub | Ringkasan tertentu berasal dari agregat Supabase; AI/prediksi tidak dibuktikan sebagai backend operasional | Inventarisasi kebutuhan data, izin, retensi, sumber agregat, dan fitur yang benar-benar akan dibangun. |

## Perubahan antarmuka pada checkpoint ini

- Akademik kini menampilkan tab **E-Rapor** dan **Konflik Jadwal**; keduanya menjelaskan bahwa API dan alur belum tersedia.
- CBT kini menampilkan Dashboard, Kalender, Paket, Bank Soal, Sesi, Pemantauan, Hasil, dan Pengaturan. Menu yang belum punya API menampilkan batasan, tanpa aksi simulasi.
- LMS menampilkan Dashboard, Kursus, Kategori, Pustaka Video, Tugas/Penilaian, Pengumpulan, Ulasan Sebaya, dan Pengajar. Kategori, video, dan pengajar yang sudah dikelola dari halaman Kursus memberi tautan ke sana; Dashboard dan Peer Review memberi status belum tersedia.
- HCM menampilkan seluruh sembilan area referensi. Pelacakan lokasi, shift, penggajian, kinerja, rekrutmen, dan analitik menyampaikan bahwa API belum tersedia.
- Perpustakaan Digital kini tetap terlihat ketika gerbang Storage ditutup; halaman menjelaskan prasyarat bucket/API dan tidak menampilkan daftar atau unggah berkas sebagai fitur aktif.
- Data Induk berfokus pada Santri, Struktur, dan Jejak Audit. Kategori lain berada di modul pemiliknya, bukan sebagai tautan pengalihan.
- Manajemen Multi-Unit kini menampilkan semua lima submenu referensi. Ringkasan hanya menggunakan jumlah unit dan peristiwa audit yang termuat; transfer, penagihan antar-unit, dan analitik keuangan tetap diberi status belum tersedia.
- Tab pada layar yang diperbarui menggunakan `ERPTabs` dari Design System. Tab yang belum tersedia tetap aman: tidak membaca atau menulis data contoh.

## Urutan untuk menyelesaikan paritas

1. Pastikan menu role tersedia dan setiap fungsi ditempatkan langsung di modul pemilik data; jangan menambahkan tombol yang hanya mengalihkan pengguna dari Data Induk.
2. Tandai setiap submenu sebagai **tersedia**, **tercakup di halaman lain**, atau **belum tersedia**; jangan mengandalkan keberadaan tombol sebagai bukti fitur.
3. Untuk fitur belum tersedia, tambahkan tabel/kontrak tenant Supabase, API berizin, migrasi/RLS, audit transaksi, serta UAT sebelum mengubah label status.
4. Jalankan matriks role dan tenant pada staging untuk semua rute dan tindakan tulis. Production PTSAS tidak menjadi lingkungan uji.
5. Gunakan [status cutover runtime](../05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md) untuk memastikan flag tetap tertutup sampai migrasi dan pemeriksaan siap.

## Batas bukti

Audit ini membandingkan label/menu referensi yang terlihat dan source branch saat pemeriksaan. Audit ini tidak membuktikan bahwa seluruh runtime Supabase telah aktif, bahwa setiap peran menjalani UAT, atau bahwa semua fungsi referensi layak dijadikan fitur rilis. Data demo dan perilaku simulasi AI Studio tidak dianggap sebagai bukti penyimpanan permanen.

## Pembandingan langsung lanjutan — 1 November 2026

Referensi AI Studio berhasil dibuka dalam sesi **Super Admin**. Sidebar referensi menampilkan 26 menu: Overview Dashboard, Master Data, User Management, PPDB Digital, CBT, Tahfidz, Asrama, Akademik, LMS, Perpustakaan, Finance, Communication, Healthcare, Koperasi, Laundry, Multi-Unit, ERP Budget, HCM, General Affair, E-Document, Alumni, CRM, Donasi, Marketplace, PPOB, dan Data Warehouse. Layar seperti PPDB, CBT, Tahfidz, Keuangan, serta Dashboard juga menampilkan angka dan rekaman contoh; itu bukan bukti data tersebut tersimpan atau alurnya sudah siap produksi.

Perbandingan menu berdasarkan source branch PR #39:

- **Admin pesantren** seharusnya melihat seluruh menu tenant yang diizinkan oleh profilnya. **Pengaturan platform** hanya untuk Super Admin. Jika ada menu tenant lain yang hilang, periksa role efektif dan `module_permissions` profil: izin eksplisit `false` memang menyembunyikan menu dan Sidebar menampilkan jumlah modul yang dibatasi.
- **PPOB & Services** ada di referensi, tetapi sengaja tidak masuk rilis awal sesuai keputusan pemilik produk. Jangan mengaktifkan kembali alur transaksi atau permission lama sebelum provider serta kontrol pembayaran dipilih.
- Source rilis awal menampilkan Pengaturan bagi Super Admin dan tidak menampilkan PPOB. Karena itu, perbandingan Super Admin ke Super Admin tetap memiliki satu perbedaan yang disengaja pada menu teratas; perbandingan Admin ke Admin mengecualikan Pengaturan dan PPOB.
- Menu serta tab yang tersedia pada source tidak serta-merta berarti semua fungsi referensi sudah beroperasi. Tabel pada peta modul tetap menjadi daftar gap, dan bagian tanpa API Supabase harus tetap dinyatakan belum tersedia.

### Batas pemeriksaan preview lokal

Pada sesi pemeriksaan ini, tab referensi dapat dibaca dan dinavigasi. `http://localhost:4179/` menolak koneksi, sehingga UI branch PR #39 tidak dapat dibandingkan secara visual dengan referensi. Instalasi online tidak selesai dalam batas waktu pemeriksaan; instalasi offline juga berhenti karena paket `zxing-wasm@3.0.3` tidak ada di cache npm (`ENOTCACHED`). Karena itu, tidak ada klaim bahwa UAT browser atau seluruh interaksi visual sudah lulus. GitHub Actions terakhir pada head `9fb818f` lulus build dan pemeriksaan source, tetapi pekerjaan tersebut tidak menggantikan UAT browser maupun pengujian backend staging.

Untuk pemeriksaan berikutnya, jalankan server penuh dari head PR #39 dengan dependensi lengkap, tunggu health endpoint siap, lalu bandingkan referensi dan aplikasi memakai role yang sama. Jika menu Admin masih hilang setelah role dipastikan `Admin`, periksa nilai izin eksplisit profil dan tampilkan modul yang dibatasi; jangan menaikkan role atau membuka permission secara massal untuk mengatasi perbedaan tampilan.

Pemeriksaan visual lanjutan pada 1 November di `http://localhost:4179/` menampilkan Data Induk tanpa strip **Data terkait**; yang terlihat hanya tab Data Entitas, Struktur, dan Jejak Audit. Ini memverifikasi perubahan penempatan secara visual pada preview yang tersedia, tetapi bukan UAT lengkap: versi/target backend preview dan alur baca-tulis tenant tidak diverifikasi dalam pemeriksaan ini.

## Koreksi penempatan menu Data Induk — 1 November 2026

Pada source PR #39 head `26b4b97`, tab Data Induk dibatasi pada **Data Entitas (Santri)**, **Struktur (Gedung/Kamar/Kelas/Peta Struktur)**, dan **Jejak Audit**. Strip “Data terkait”, panel/tombol pengalihan, serta tombol profil wali yang menuju kategori lama dihapus.

- Wali dikelola di CRM; Pengajar, Mata Pelajaran, dan Kurikulum berada di Akademik; Pegawai di SDM; Alumni di modul Alumni; Yayasan/unit pesantren di Manajemen Multi-Unit; Halaqah di Tahfidz; Pemesanan Fasilitas di Sarana & Prasarana.
- Referensi Pengajar/Mata Pelajaran/Kurikulum pada Akademik hanya baca-saja dari sumber tenant yang tersedia. API katalog penuh masih belum tersedia.
- Uji source lulus: `npm run test:supabase-runtime-no-firebase` (98 modul), `npm run lint`, `npm run build`, dan `git diff --check`. Build masih memberi peringatan chunk renderer PDF 1,46 MB.
- GitHub Actions run [#1091](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41259171340) lulus 3/3 job pada head tersebut; ini mencakup migrasi/pgTAP, API/tenant, Storage, dan backup/restore sintetis, bukan UAT browser Admin VQE.
- UAT visual Admin VQE belum dilakukan. PR tetap Draft/Open dan belum merge.



## Verifikasi batas skala Akademik — 7 November 2026

Pemeriksaan source PR #40 pada head `455f25d486ad54266895db5a2a4647fab58a3ce5` mengoreksi batas yang disebut di tabel:

- Roster santri dan catatan jadwal, jurnal, serta penilaian memakai endpoint dengan paginasi keyset. Batas 5.000 bukan batas snapshot umum.
- Snapshot awal tetap membatasi pengajar dan unit masing-masing 500, serta referensi akademik 2.000; sistem menolak snapshot ketika batas itu terlampaui.
- Endpoint konflik memindai maksimal 5.000 jadwal dan memuat maksimal 500 unit untuk nama unit. Jika terlampaui, endpoint gagal-tertutup dan UI tidak menampilkan hasil parsial.
- Untuk kesiapan pesantren besar, batas konflik dan katalog pengajar/unit perlu dirancang ulang serta diuji pada volume representatif. Sampai itu dilakukan, jangan menyatakan seluruh alur Akademik siap untuk volume tak terbatas.

Bukti source: `src/server/supabaseAcademic.ts` (`tenantRows`, `getSupabaseAcademicConflictSchedules`, `getSupabaseAcademicSnapshot`) dan `src/pages/SupabaseAcademicManager.tsx` (status pemeriksaan konflik). Verifikasi source tidak menggantikan UAT staging.
