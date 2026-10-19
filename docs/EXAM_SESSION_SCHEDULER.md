# Exam Session Scheduler Module

## Overview
Modul Exam Session Scheduler diimplementasikan sebagai bagian dari `CBTManager`, bertujuan untuk mengelola dan mendistribusikan kandidat (calon santri) ke dalam sesi-sesi ujian secara efisien. Kandidat yang dimasukkan ke dalam penjadwalan ini adalah kandidat yang telah lolos verifikasi dokumen dan berada dalam stage **Entry Exam**.

## Features Implemented
1. **Interactive Session Assignment (Drag and Drop):**
   - Daftar kandidat yang belum memiliki jadwal (Unassigned Candidates) diambil secara otomatis dari Firestore (`candidates` collection dengan kondisi `stage === "Entry Exam"` dan belum memiliki `examSlot`).
   - Kandidat ini bisa di-_drag and drop_ dari daftar "Unassigned" ke dalam sesi-sesi ujian yang tersedia.
   - Perubahan akan langsung tersimpan (real-time) ke Firebase Firestore via `updateDoc()`.

2. **Auto-Assign Functionality:**
   - Fitur distribusi cerdas (`Auto Assign All`) menggunakan Firebase Firestore Batch Write untuk mengalokasikan seluruh peserta secara kilat ke slot sesi ujian yang masih memiliki kapasitas sisa (berdasarkan data `capacity` di setiap `timeSlots`).
   - Memastikan tidak ada jadwal saling tindih (overlap) dan sesi yang sudah penuh (full) tidak terisi melebihi kapasitas (batas maksimal terpenuhi).

3. **Status Indicators & Overcapacity Guard:**
   - Indikator responsif untuk melihat apakah suatu kapasitas penuh atau tidak (indikator warna amber jika quota terpenuhi, emerald jika masih tersedia slot).
   - Tombol manual `Remove` digunakan untuk membatalkan assign candidate yang sudah terjadwal.

## Technical Data Flow
- **Data Source:** Collection `candidates` pada root Firestore. 
- **Filter:** `stage === 'Entry Exam'` 
- **Field Update:** Memperbarui key attribut `examSlot: string | null` untuk setiap update dari *scheduler*.

## Location
- Path file: `src/pages/CBTManager.tsx`
- Tab section: **Exam Sessions**

All actions have error handlers to ensure backend operations to Firebase reflect dynamically to UI without breaking state if an issue occurs.
