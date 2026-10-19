# Modul HRIS & Kepegawaian (HRIS Manager)

## Tujuan
Mengelola data kepegawaian (asatidz, guru, musyrif, staf operasional) pesantren secara terpusat, mulai dari direktori karyawan, absensi geofencing, penjadwalan shift, hingga rekapitulasi penilaian kinerja (KPI) dan payroll.

## Fitur Utama

1. **Employee Directory (Direktori Karyawan)**
   - Sentralisasi data identitas, jabatan, dan riwayat kontak staf sekolah.
   - Filtering berdasarkan departemen (misal: Akademik, Kepengasuhan/Boarding, IT).

2. **Attendance & Live Tracking (Kehadiran & Pelacakan)**
   - **Kiosk Kehadiran:** Kiosk self-service untuk check-in/out dengan dukungan kamera untuk (mockup) rekam wajah.
   - **Gefencing & Geolocation:** Deteksi koordinat (`lat`, `lng`) saat absensi, serta pemetaan lokasi (`react-leaflet`) untuk visualisasi Check-In Locations Map.
   - **Weekly Trends:** Visualisasi dashboard (Bar Chart) mengenai tren keterlambatan dan ketidakhadiran harian.

3. **Leave Request & Time Off (Manajemen Cuti)**
   - Sistem pengajuan cuti berbayar, cuti sakit, dan cuti melahirkan dengan workflow (Pending, Approved, Rejected).
   - Pengingat kuota cuti sisa per karyawan secara otomatis sesuai Company Policy Limits.

4. **Shift Planner (Manajemen Jadwal & Shift)**
   - Penyusunan kalender shift karyawan untuk staf asrama, sekuriti, dan tim medis / UKS (Morning, Evening, Night, Off).
   - Mockup algoritma Auto-Schedule berbasis peran kerja (AI scheduling placeholder).

5. **Performance & Scorecard (Penilaian Kinerja)**
   - Visualisasi pencapaian Key Performance Indicators (KPI) untuk setiap departemen dan performa individu.
   - Penggunaan `RadarChart` (dari lib `recharts`) untuk memetakan aspek kualitatif (Kedisiplinan, Kualitas Mengajar, Attitude, Teamwork) per staf dengan nilai akhir grading (A, B, C, dll).

## Rencana Pengembangan Lanjutan (Firebase Migration)
- Memindahkan state mock data dari `HRISManager.tsx` (misalnya daftar kehadiran, absensi, daftar karyawan) dan mengintegrasikannya dengan Firestore.
- Implementasi RBAC agar staff individual bisa login untuk mem-booking cuti secara mandiri untuk di-approve HR di panel manager.
