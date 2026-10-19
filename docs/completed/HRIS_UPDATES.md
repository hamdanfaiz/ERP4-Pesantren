# HRIS Update Progress & New Features

## 1. Geolocation for Attendance Kiosk
- **Feature**: Detect and record employee location (`lat`, `lng`) during attendance check-in/out.
- **Implementation**: Utilized `navigator.geolocation.getCurrentPosition` within `AttendanceKiosk`.
- **Status**: Completed. Kiosk requires location permission to scan and displays captured coordinates on success.

## 2. AI Document OCR (Document Manager)
- **Feature**: AI-powered Optical Character Recognition (OCR) Scanner to extract structured metadata from document uploads (e.g., student IDs, invoices).
- **Implementation**: Implemented server-side using Gemini API (`generateContent` with `gemini-3.5-pro` model). The frontend features a drag-and-drop zone and results visualization.
- **Status**: Completed and fully integrated in DocumentManager.

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
