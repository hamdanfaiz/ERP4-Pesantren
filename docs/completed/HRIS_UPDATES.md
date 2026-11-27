# Catatan Arsip HRIS dan Fitur Prototipe

> Catatan di halaman ini merekam implementasi awal dan tidak membuktikan bahwa setiap fungsi masih tersedia atau telah terhubung pada runtime Supabase saat ini. Untuk status yang berlaku, lihat [Kesiapan Komersial](../active/00_PRODUCT/COMMERCIAL_READINESS.md) dan dokumentasi modul aktif.


## 1. Geolocation for Attendance Kiosk
- **Feature**: Detect and record employee location (`lat`, `lng`) during attendance check-in/out.
- **Implementation**: Utilized `navigator.geolocation.getCurrentPosition` within `AttendanceKiosk`.
- **Status**: Completed. Kiosk requires location permission to scan and displays captured coordinates on success.

## 2. OCR Dokumen — status runtime saat ini
- Catatan awal di bagian arsip ini pernah menyebut Gemini OCR sebagai selesai. Klaim tersebut tidak sesuai dengan implementasi Supabase aktif dan tidak boleh dipakai sebagai bukti bahwa ekstraksi otomatis tersedia.
- Tab Pemindai OCR saat ini menampilkan lampiran PDF yang sudah diunggah untuk pemeriksaan dan unduhan manual. Ekstraksi teks/metadata otomatis belum tersedia.
- Rincian alur Dokumen Digital yang berlaku ada di [panduan modul](../active/10_MODULES/DOCUMENT_MANAGER.md).

## 3. Leave Request & Time Off System
- **Feature**: Track pending approvals, overall leave counts, unplanned absences, and view company policy.
- **Implementation**: Added `LeaveRequestView` module displaying leave logs and pending requests with Approve/Decline actions.
- **Status**: Completed.

## 4. Employee Performance Scorecard
- **Feature**: Comprehensive evaluation tool showcasing Employee Scorecards, Overall grades, and individual metrics mapped across a Radar Chart.
- **Implementation**: Utilizing Recharts `RadarChart` for performance visualizations within `PerformanceView`.
- **Status**: Completed.

## 5. Shift Planner
- **Feature**: Weekly shift scheduling interface.
- **Implementation**: `ShiftPlannerView` with editable tabular options for morning, evening, night shifts, and an auto-schedule algorithm.
- **Status**: Completed.

## 6. Check-In Locations Map
- **Feature**: Visualize the locations where employees have performed check-ins visually on a map, with detailed metadata contextualization.
- **Implementation**: Integrated `react-leaflet` into the `AttendanceView`. Clicking map markers triggers an interactive enhanced sidebar displaying the full specific timestamp, formatted address, sub-location parameters, staff name, and utilized checking method.
- **Status**: Completed.
