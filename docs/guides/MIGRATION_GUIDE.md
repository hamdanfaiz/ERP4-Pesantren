# Migration and Continuous Development Guide

## Overview
This document outlines the macro-level architecture of the system-wide updates regarding the 30+ internal school management modules, AI integration, and the general frontend state. Follow this guide when deploying updates from testing to staging/production or when synchronizing the local database schema.

## Complete Ecosystem Synchronization

Because this system has expanded into an interconnected ERP (holding domains like PPDB, Finance, CBT, Boarding, Asset tracking, and more), continuous development must now focus on **Global State Synchronization**.

Currently, the 30+ managers (found in `src/pages/*`) operate using local mocking and `useState` isolation.
The next major update phase dictates mapping these localized structures into our central `firebase-blueprint.json` schemas.

## Recent Architectural Additions

### 1. Geolocation Access (HRIS)
The application now requires the standard Browser Geolocation API (`navigator.geolocation`).
- **Where**: `AttendanceKiosk`.
- **Constraint**: The `AttendanceKiosk` will halt operations and request the user to allow location access if it's missing.

### 2. Map Integrations (Global)
The application uses `react-leaflet` to display check-in maps and logistics. 
- **Dependencies**: 
  - `react-leaflet` and `leaflet` are configured.
  - Make sure leaflet CSS (`leaflet/dist/leaflet.css`) is always imported ahead of rendering the maps inside Manager views.

### 3. Server-Side AI Endpoints
The application now hosts functional AI OCR logic through the backend Express server.
- **Where**: `server.ts` -> `/api/ocr`
- **Dependencies**: The system requires the `@google/genai` package and `gemini-3.5-pro`.
- **Environment Handling**: Make sure `GEMINI_API_KEY` is properly provisioned on the host runtime container environment prior to launch, or the `/api/ocr` endpoint will throw a 500 status.

### 4. Advanced Frontend Visuals
The performance module utilizes `recharts` radar components. Extensive chart adoption is expected across the Data Intelligence and ERP instances.

## Continuous Development Process

1. **Developing new AI Endpoints**:
   - Always map external dependencies (like AI calls) inside the `server.ts` directly as an express proxy to prevent leaking the Gemini API Key into the browser runtime (Vite).
2. **Adding New Interconnected Modules**:
   - Create isolated components mimicking `LeaveRequestView` or `PerformanceView`.
   - Update `src/App.tsx` router, and ensure `Sidebar.tsx` navigation correctly points to the new Manager IDs.
3. **Persisting Mock States**:
   - The active state inside `OcrScannerView` successfully leverages the backend logic, but saving the JSON to the Document Repository still needs integration with `setDoc()` or `addDoc()` from Firebase.
   - You must review `docs/active/10_MODULES/INDEX.md` to see the complete list of 30+ managers undergoing this Firebase migration.

## Reference Documentation
- Review the `/CHANGELOG.md` for feature additions.
- Consult `/docs/active/10_MODULES/INDEX.md` for the entire ecosystem mapping.
