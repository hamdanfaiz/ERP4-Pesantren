# Notifications & Calendar Visualization

## Overview
Dua fitur telah terintegrasi dalam pipeline exam session, yaitu _Automated Notification Engine_ dan _Calendar Visualization_.

## Notification System (Student Dashboards)
Ketika seorang admin atau sistem (_auto-assign_) menempatkan seorang santri ke dalam sesi pendaftaran ujian, sebuah aksi `writeBatch` tidak hanya merubah `examSlot` santri di Firestore, tetapi juga menambahkan entry baru ke dalam koleksi `notifications`.
1. **Trigger:** `CBTManager.tsx` (saat *Drag drop* atau *Auto-assign*).
2. **Receptor:** `Dashboard.tsx -> StudentDashboard`. Menerima stream listener dari spesifik `userId` ke riwayat notifikasinya. 
3. **Features:** Unread marker (`isRead: boolean`), Timestamp tracking.
4. **Exam Progress:** Terdapat komponen Visual Path Progress di dalam dashboard santri yang menginformasikan state terkini (Registered &rarr; Doc Verified &rarr; Scheduled &rarr; Tested &rarr; Result).

## Calendar Visualization (Exam Module)
Di dalam `CBTManager`, kami telah meningkatkan Tab *"Calendar"* untuk merepresentasikan jadwal ujian dalam bentuk kalender bulanan penuh (Full Calendar View):
1. **Grid Layout:** Membangun format grid kalender bulanan klasik berbasis 7 hari seminggu. Menghitung dynamic offset (First Day of Month padding) dan menjabarkan slots harian yang berkaitan dengan tanggal tersebut.
2. **Interactive Drag-and-Drop (Session Rescheduling):** Terdapat sebuah mekanisme interaksi baru di mana sebuah **sesi ujian** (bukan sekadar peserta) bisa di-reschedule. Admin bisa melakukan ditarik (Drag & Drop) kotak sesi dari satu tanggal ke tanggal yang lain, dan aplikasi akan mengubah attribute date dari sesi bersangkutan melalui internal component state setTimeSlots.
3. **Capacity Badge & Metrics:** Masing-masing kotak sesi pada kalender menyajikan highlight jumlah kapasitas yang sedang terisi relatif dengan total slot-nya, mengkalkulasi dan menyampaikan warna berbeda (amber) saat status menunjukkan 'Full'.

All functions are operating reactively using Firebase sub/unsub patterns and React states.
