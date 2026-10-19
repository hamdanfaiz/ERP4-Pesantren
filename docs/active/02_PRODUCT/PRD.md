# Product Requirements Document (PRD) - PesantrenOS Enterprise

## 1. Product Vision

Mewujudkan ekosistem digital cerdas terpadu untuk lingkungan pesantren, sekolah berasrama, dan yayasan Islam di Indonesia (dan global), di mana orang tua, guru, musyrif/musyrifah, asatidz, dan manajemen saling terkoneksi dalam sebuah arsitektur SaaS (Software as a Service) yang transparan, modern, terintegrasi AI, dan scalable.

## 2. Fitur Utama & Modul (Berdasarkan Rilis Terakhir)

Kami telah sukses bertransisi dari fase fundamental menuju Enterprise Architecture dengan lebih dari 30+ modul aktif.

### 2.1 Core Academic & EdTech System
- **PPDB (Digital Admissions)**: Alur penerimaan siswa/santri baru (pipeline tracking), evaluasi kandidat, dan dashboard analitik.
- **Digital LMS & Learning**: Modul ekstensif untuk _hybrid learning_. Menyediakan Dashboard Analytics (Engagement & Scores), Course Manager, Enterprise Video Library (simulasi Adaptive Bitrate Streaming / ABS), dan sistem evaluasi (Assessments).
- **CBT System (Computer Based Test)**: Ujian jarak jauh dengan live supervision (CBT Manager) dan interface akses siswa yang aman.
- **Tahfidz System**: Sistem manajemen hafalan Quran. Melacak progres hafalan harian, tajwid, dan kelancaran.
- **Library & E-References**: Manajemen sirkulasi buku cerdas, pengelolaan denda otomatis, scanner RFID/QR-code, dan portal perpustakaan digital dengan Dashboard Trends (Fisik vs Digital).

### 2.2 Human Resources (HRIS)
- **Attendance Kiosk & Geofencing**: Absensi real-time menggunakan `navigator.geolocation`.
- **Live Maps Tracking**: Peta visual (menggunakan _leaflet_) untuk melacak posisi kehadiran pegawai.
- **Leave Request & Time Off**: Alur pengajuan dan persetujuan pengajuan cuti secara digital.
- **Performance Scorecard**: Evaluasi pegawai berbasis data dengan komponen Radar Chart Visual.
- **Shift Planner**: Manajemen jadwal dan _shift_ kerja otomatis serta manual.

### 2.3 Administration & AI-Powered Document Management
- **E-Document Manager**: Menangani alur surat menyurat digital (Surat Masuk, Surat Keluar), E-Approval dengan tanda tangan elektronik / QR Code, dan Arsip Digital.
- **AI Document OCR**: OCR ditenagai oleh Gemini API untuk ekstraksi metadata secara cerdas dari berkas pendaftaran maupun tagihan/invoice via _drag-and-drop_.

### 2.4 Operations & Boarding (Asrama)
- **Boarding Manager**: Tracking kedisiplinan dan mutabaah yaumiyah (aktivitas ibadah/harian) untuk asrama, serta feedback parents to musyrif.
- **Asset Manager**: Pencatatan siklus hidup aset, pelabelan menggunakan cetak dinamis QR code barcode, status serah terima, log perbaikan, dan manajemen pemeliharaan (LogMaintenanceModal).
- **Laundry & Cooperative (Koperasi)**: Sistem kontrol tagihan _laundry_, batasan beban, inventori koperasi (POS System).
- **Healthcare Manager (UKS)**: Pencatatan rekam medis harian, pemeriksaan fasilitas dan rawat jalan/inap bagi santri.
- **Procurement Manager**: Siklus penuh pengadaan barang. Mencakup pembuatan _Purchase Requests_ (PR), Approval menjadi _Purchase Orders_ (PO), melacak direktori Vendor dengan sistem penilaian bintang _(rating)_, auto-generasi draft PO.

### 2.5 Finance, CRM & Extended Enterprise
- **Finance Manager**: Buku besar (general ledger), laporan arus kas, pembukuan komprehensif, dan pengaturan tagihan SPP santri.
- **Ecosystem & PPOB**: Pengelolaan ekosistem seperti transaksi tabungan masa depan, tagihan pulsa/listrik (PPOB), dan penyaluran donasi ZISWAF.
- **Marketplace**: Fitur *E-commerce Storefront* untuk seragam dan wirausaha pesantren, mengelola order dengan status, dan modul analitik pendapatan (Revenue/AOV Dashboard).
- **Parent CRM & Alumni Directory**: Manajemen siklus pelanggan komprehensif, pendaftaran direktori silaturahmi alumni, Tracer Study, dan alat interaksi kampanye (Broadcast Engine).
- **Executive Intelligence Center**:
  - Pemanfaatan dashboard "Level C" untuk *Anomaly Detection*.
  - **AI Tahfidz Engine**: Simulasi penilaian berbasis biometrik-suara untuk Makhraj dan kelancaran membaca secara _real-time_.
  - **Predictive Analytics**: Ramalan tren pendaftar dan risiko keterlambatan SPP.
  - **Knowledge Hub**: AI pencari SOP internal menggunakan paradigma _Retrieval-Augmented Generation_ (RAG).

## 3. User Personas

1. **Executive (Ketua Yayasan/Mudir)**: Membutuhkan laporan intelijen holistik level korporasi, pendeteksi anomali (Executive Center).
2. **Admin/Operator Pusat**: Mengendalikan pendaftaran (PPDB), keuangan, arsip dokumen, dan procurement logistik.
3. **Musyrif/Musyrifah (Pembina Asrama)**: Mengontrol asrama, kegiatan harian, catatan setoran hafalan, kedisiplinan, dan interaksi wali santri.
4. **Guru (Teacher)**: Membuat course LMS, menguji via CBT, menilai tugas.
5. **Wali Santri (Parents)**: Mengecek mutabaah ibadah, akademik anak, serta memberikan feedback secara real-time via aplikasi HP.
6. **Santri/Siswa**: Meminjam buku, mengambil materi video, mengikuti CBT, berinteraksi di library, Koperasi & Laundry.

## 4. Keunggulan Kompetitif
- **All-in-one Platform**: Menggabungkan fitur pendidikan murni (CBT, Tahfidz), Operasional Asrama (Laundry, Boarding), serta Bisnis & Enterprise (Finance, E-Commerce, PPOB).
- **Smart AI Integration**: OCR untuk form, Executive AI untuk forecasting, Semantic Hub, & Tahfidz voice simulator.
- **Premium User Experience**: UI minimalis berkelas enterprise, kaya akan visual chart interaktif (Recharts).
