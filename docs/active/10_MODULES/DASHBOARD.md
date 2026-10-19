# Modul Dashboard Utama (Executive Summary)

## Tujuan
Memberikan pandangan (*helicopter view*) yang komprehensif, real-time, dan mudah dipahami bagi pimpinan yayasan, kepala sekolah, maupun administrator terkait performa keseluruhan ekosistem pesantren (meliputi operasional, akademik, tahfidz, asrama, keuangan, dan rekrutmen).

## Fitur Utama

1. **Top-Level Metrics (Widget KPIs)**
   - **Demografi:** Total Santri Aktif, pembagian putra/putri, serta kapasitas ketersediaan asrama.
   - **PPDB (Admissions):** Total pendaftar (Leads) dan conversion rate (jumlah yang sudah lolos seleksi) pada gelombang aktif berjalan.
   - **Tahfidz:** Rata-rata progres tahfidz nasional (Persentase agregat ketercapaian target hafalan).
   - **Keuangan:** Saldo kas harian, metrik pembayaran SPP (Paid vs Unpaid ratio), dan total tunggakan.

2. **Visualisasi Analitik (Data Charts)**
   - **Grafik Tren PPDB:** *Area/Line chart* pendaftaran per minggu/bulan.
   - **Indeks Kedisiplinan Asrama (Boarding):** *Bar chart* perbandingan jenis-jenis pelanggaran dan kehadiran sholat jamaah/kegiatan mutaba'ah.
   - **Distribusi Hafalan (Tahfidz):** *Pie chart* sebaran kelompok santri berdasarkan juz untuk mendeteksi *bottleneck*.

3. **Alerts & Real-time Action Items**
   - Peringatan Santri telat kembali dari cuti / perizinan (Overdue Permits).
   - Highlight pelanggaran level berat yang membutuhkan Surat Peringatan (SP) atau panggilan orang tua segera.
   - Daftar invoice SPP yang telah jatuh tempo (Overdue Invoices).

4. **Global Filters**
   - Filter interaktif untuk **Tahun Ajaran**, **Semester**, dan **Cabang/Jenjang** yang secara otomatis melakukan *sync* seluruh visualisasi data yang ditampilkan di halaman Dashboard tanpa pindah halaman.

## Arsitektur UI/UX (Layout Structure)

- **Top Navigation Bar:** Berisi Global Search (memungkinkan pencarian instan untuk profil santri, tagihan, dll), *Tenant Switcher* (jika mode multi-cabang/yayasan), dan panel Notifikasi.
- **Hero Metrics Row:** Satu baris di bagian atas (*at the fold*) yang merangkum 4-5 *Key Performance Indicators* paling krusial melalui komponen Card kecil namun informatif, disertai persentase kenaikan/penurunan (trend indicator).
- **Main Analytical Section (Grid System):** Area tengah layar dengan pembagian kolom (misalnya pola grid 2 dan 1).
  - *Main Chart:* Menyajikan metrik prioritas sesuai hak akses (misal: Keuangan / Tren Pendaftar).
  - *Secondary Charts:* Grafik pelengkap seperti komposisi *boarding* atau peta tahfidz.
- **Actionable Right/Bottom Panel (Operational Feed):** *Activity stream*, notifikasi real-time dari seluruh modul (misal ada setoran hafalan baru atau pelunasan tagihan masuk), dan Action-Alerts yang perlu tindak lanjut supervisor/admin.

## Rencana Pengembangan Lanjutan

- **Executive AI Insight (powered by Gemini):** Sistem dapat secara otomatis menghasilkan 1 paragraf narasi analitik untuk pimpinan (misal: *"Tingkat keterlambatan pembayaran bulan ini turun 10%, namun terdapat lonjakan santri sakit di Asrama C. Disarankan mengecek unit UKS."*).
- **Customizable Dashboard Layout:** Pengguna level tinggi dapat mengatur widget mana yang tampil, men-sekalakan ulang (*resize*) chart, dan mengatur *drag-and-drop* preferensi tampilan dashboard.
