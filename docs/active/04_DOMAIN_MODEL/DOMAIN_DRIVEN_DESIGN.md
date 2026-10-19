# Domain Driven Design (DDD) - PesantrenOS Enterprise

## 1. Overview

Sistem operasi PesantrenOS dibangun dengan prinsip Domain Driven Design (DDD) untuk mengatasi kompleksitas ekosistem pendidikan berasrama. Dengan DDD, logic bisnis dipisahkan secara tegas ke dalam **Bounded Contexts** independen. Hal ini selaras dengan tujuan arsitektur berbasis Microservices dan transisi ke SaaS Multi-Tenant.

## 2. Bounded Context Map

### 2.1 Identity & Access Domain

_Fokus:_ Manajemen autentikasi, otorisasi, dan struktur multi-tenant atau cabang yayasan.

- **Aggregates:** `Tenant` (Yayasan/Cabang), `User`, `Role`, `Session`
- **Domain Events:** `UserRegistered`, `LoginSuccessful`, `TenantCreated`, `RoleAssigned`

### 2.2 Student Lifecycle Domain

_Fokus:_ Siklus hidup santri dari awal pendaftaran (PPDB) hingga menjadi alumni.

- **Aggregates:** `Candidate` (Calon Santri PPDB), `Student` (Santri Aktif), `Parent` (Wali), `Alumni`
- **Domain Events:** `CandidateRegistered`, `AdmissionPassed`, `StudentEnrolled`, `StudentGraduated`

### 2.3 Tahfidz Domain

_Fokus:_ Inti dari pesantren, mengatur kelompok hafalan al-Qur'an, setor hafalan, target.

- **Aggregates:** `Halaqah` (Kelompok Tahfidz), `Musyrif` (Pengampu), `TargetHafalan`, `Setoran`
- **Domain Events:** `SetoranSubmitted`, `TargetAchieved`, `MunaqasyahPassed`

### 2.4 Academic Domain

_Fokus:_ Akademik reguler (Diknas/Kemenag), jadwal pelajaran kelas, dan nilai ujian.

- **Aggregates:** `ClassRoom`, `Subject` (Mata Pelajaran), `Curriculum`, `Schedule`, `GradeReport`
- **Domain Events:** `ClassAssigned`, `ExamGraded`, `ReportCardPublished`

### 2.5 Boarding Domain

_Fokus:_ Manajemen asrama harian, evaluasi akhlak (mutaba'ah), izin keluar, dan pelanggaran.

- **Aggregates:** `Dormitory` (Gedung Asrama), `Room` (Kamar), `Mutabaah` (Log harian ibadah/akhlak), `Violation`, `Permit`
- **Domain Events:** `PermitRequested`, `ViolationLogged`, `MutabaahEvaluated`, `RoomAssigned`

### 2.6 Finance Domain

_Fokus:_ Pengelolaan tagihan, kas, donasi, pembayaran santri, dan uang saku harian.

- **Aggregates:** `Billing`, `Invoice`, `Transaction`, `Wallet` (Tabungan jajan santri)
- **Domain Events:** `InvoiceCreated`, `PaymentReceived`, `WalletTopup`, `WalletDeducted`

### 2.7 Commerce & Healthcare Domain (Support)

_Fokus:_ Koperasi pondok (POS/Inventory) dan sistem rekam kesehatan (UKS).

- **Aggregates:** `Inventory`, `Sale`, `MedicalRecord`, `Treatment`
- **Domain Events:** `ItemSold`, `StockDepleted`, `MedicalCheckupLogged`

## 3. Communication Between Contexts

Untuk menghindari coupling erat antar context:

- Komunikasi Synchronous dilakukan melalui API Internal Middleware/Cloud Run Services.
- Komunikasi Asynchronous direkomendasikan melalui Event-Bus (Google Cloud Pub/Sub). Contoh: Ketika `PaymentReceived` terjadi di Finance Domain, Pub/Sub trigger event ke Student Domain untuk segera mengaktifkan status Admission.
