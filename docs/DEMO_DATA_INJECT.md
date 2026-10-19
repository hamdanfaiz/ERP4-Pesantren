# Demo Data Injection (Smart Inject)

## Overview
Fungsionalitas "Inject Demo Data" telah direplikasi dan ditambahkan khusus pada dua modul krusial di jalur penerimaan, yaitu PPDB Digital (`PPDBManager.tsx`) dan CBT Seleksi Masuk (`CBTManager.tsx`).
Tombol ini memungkinkan pengujian alur data dengan meng-generate data-data dummy (Mock Data) secara seketika dan menuliskannya menggunakan `writeBatch` ke Firestore di collection `candidates`.

## Implementation Details
1. **Mock Data Source:** Keduanya mengacu pada utility file sentral `src/data/mockDataFactory.ts` dengan function `generateMockData()`. Data untuk seleksi ini menggunakan key `.candidates`.
2. **PPDB Manager Integration:** 
   - Button "Inject Demo" diletakkan berdampingan dengan fungsi "Smart Allocate" dan "Add Candidate".
   - Metode `handleInjectDemoData` memanggil `writeBatch` dan mengiterasi semua mock candidate dengan chunk size limit Firestore (maksimum 500 per batch).
3. **CBT Manager Integration:**
   - Button "Inject Demo" diletakkan di sebelah tombol "New Session".
   - Secara fungsional setara dengan PPDB Manager untuk memastikan konsistensi pengujian. Hal ini memastikan UI Calendar dan Session assignment otomatis terisi oleh pendaftar yang memiliki parameter stage `Entry Exam`.

## User Experience Highlight
Tombol menampilkan state `isInjecting` ketika sedang mengirimkan network request untuk mencegah duplikasi (double-click) dan menampilkan alert notifikasi native ketika dataset berhasil masuk atau gagal di-inject.
