# BPMN Level 1 - Event Business Flows (Core)

Dokumen ini mendeskripsikan secara High-Level (BPMN Level 1) interaksi alur kerja (workflow) lintas entitas pada operasional utama PesantrenOS.

## 1. PPDB (Penerimaan Peserta Didik Baru) Flow

**Actors:** PPDB Admin, Calon Santri (Public), Sistem Evaluasi

1. **Start:** Panitia PPDB membuka gelombang pendaftaran (Campaign).
2. **Task:** Calon Santri mengakses portal registrasi (Public Portal).
3. **Task:** Calon Santri mengisi Biodata, Data Sekolah, Data Orang Tua.
4. **Task:** Calon Santri Mengunggah (Upload) berkas persyaratan (Upload Checklist: KK, Akta, dll).
5. **Event Trigger:** `CandidateRegistered` -> Status = "Registered".
6. **Task:** PPDB Admin memeriksa kelengkapan dokumen.
7. **Gateway:** Jika Tidak Lengkap -> Kirim notif (WA/Email) untuk revisi. Jika Lengkap -> Pindah status "Entry Exam".
8. **Task:** Ujian Seleksi / Test Masuk (CBT atau form wawancara).
9. **Task:** PPDB Admin menginput skor/keputusan final.
10. **End:** Status = "Accepted" atau "Rejected". Trigging pembuatan `Student` ID dan Tagihan Awal.

## 2. Tahfidz Daily Setoran Flow

**Actors:** Santri, Musyrif/Guru Tahfidz, Tahfidz Coordinator

1. **Start:** Halaqah hafalan dimulai di waktu pagi/shubuh.
2. **Task:** Santri membaca setoran zidayah (tambahan baru) atau muraja'ah (setoran ulang/lancar).
3. **Task:** Musyrif membuka aplikasi portal khusus Musyrif.
4. **Task:** Musyrif menginput data setoran (Surah, Ayat dari-hingga, Kualitas Bacaan: Mumtaz/Jayyid/Maqbul, dan Catatan Tajwid).
5. **Gateway Validation:** Sistem mengecek jika setoran ini memenuhi milestone pencapaian target bulanan/juz.
6. **Event Trigger:** `SetoranSubmitted`. Data terkirim ke Database.
7. **Parallel Gateway:**
   - Notifikasi Real-time dirutekan ke `Parent App` agar orang tua tahu progres via mobile.
   - Analitik Tahfidz Dashboard Guru di-update untuk perbandingan grafik.
8. **End.**

## 3. Asrama Pelanggaran & Perizinan (Boarding) Flow

**Actors:** Satpam/Musyrif, Santri, Orang Tua, Head of Boarding

**(A) Alur Perizinan Keluar (Permit)**

1. **Start:** Orang tua/Santri request izin keluar/pulang via App/Portal Asrama.
2. **Task:** Musyrif Asrama menyetujui (Approve level 1).
3. **Task:** Head of Boarding menyetujui (Approve level 2) - _Generate Barcode Gate Pass_.
4. **Task:** Santri men-tap Barcode ke pos Satpam saat keluar (Status = `On Leave`).
5. **Task:** Santri kembali dan men-tap Barcode di Satpam (Status = `Returned`).
6. **End:** Jika melewati batas waktu (overdue), sistem otomatis men-trigger "Violation" keterlambatan.

**(B) Alur Pencatatan Pelanggaran (Violation)**

1. **Start:** Musyrif menemukan kasus pelanggaran (misal: telat ke masjid, hp terlarang).
2. **Task:** Musyrif mencatat di aplikasi Boarding (Jenis Pelanggaran, Poin, Keterangan).
3. **Event Trigger:** Sistem mengakumulasi total Poin pelanggaran.
4. **Gateway:** Jika Poin > 100 -> Trigger Alert ke SP (Surat Peringatan) & Panggilan Wali (Otomatis send notif Parent).
5. **End.**
