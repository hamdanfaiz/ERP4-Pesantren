# Firestore Database Schema (Model Legacy)

Dokumen ini mencatat model data Firebase/Firestore yang masih dipakai runtime pada branch `main`; dokumen ini bukan rancangan schema Supabase target. ERP4 Pesantren diarahkan sebagai software self-hosted yang dipasang di infrastruktur pelanggan, bukan SaaS vendor. Asumsi rilis awal adalah satu installation per pesantren.

## Kontrak tenant pada data legacy dan migrasi

Hampir seluruh root collection legacy harus memiliki field `tenantId` untuk menjaga batas data per institusi dan memudahkan pemetaan saat migrasi. `uid` dan Firebase custom claims hanya bagian dari implementasi lama. Target Supabase menggunakan `profiles.user_id` dan validasi tenant melalui RLS; jangan menyalin custom claims Firebase ke desain target.

## Root Collections

### 1. `tenants`

Digunakan memanage data organisasi institusi pesantren / yayasan bersangkutan.

- `id` (Document ID) -> ID unik tenant.
- `name` (String) -> Nama Yayasan / Pesantren
- `domain` (String) -> Domain (opsional)
- `settings` (Map) -> Logo, brand UI, jam operasional, setting semester aktif, dsb.

### 2. `users`

Sync profil pengguna di sistem yang terhubung langsung dengan Firebase Auth.

- `uid` (Document ID) -> Sama dengan auth.uid
- `tenantId` (String)
- `email` (String)
- `displayName` (String)
- `role` (String) -> 'ADMIN', 'TEACHER', 'MUSYRIF', 'PARENT'
- `profileData` (Map) -> Field opsional foto dll

### 3. `candidates` (Domain PPDB)

Calon santri yang sedang berproses pada Admission.

- `id` (Document ID)
- `tenantId` (String)
- `registrationId` (String)
- `name` (String)
- `nik` (String), `pob`, `dob`, `address`
- `targetGrade` (String)
- `parents` (Map) -> Nama Ibu, Nama Bapak, WhatsApp
- `documents` (Map) -> Status checklist boolean (`kk`, `birthCertificate`, dll)
- `stage` (String) -> 'Registered', 'Entry Exam', 'Interview', 'Accepted'
- `score` (Number) -> Nilai tes
- `notes` (String) -> Komentar review admin

### 4. `students` (Domain Student & Academic)

Data pokok peserta didik (Santri Aktif).

- `id` (Document ID)
- `tenantId` (String)
- `nis` / `nisn` (String)
- `name` (String)
- `currentDormRoomId` (String) -> Pointer ke id ruang asrama
- `currentClassId` (String) -> Pointer ke id kelas akademik
- `parentId` (String) -> Pointer ke UID `users` wali santri (untuk relasi aplikasi Parent App)

### 5. `halaqahs` (Domain Tahfidz)

Kelompok penghapal al-Qur'an (biasanya per murabbi/musyrif).

- `id` (Document ID)
- `tenantId` (String)
- `name` (String) -> Misal: "Group Abu Bakar"
- `musyrifId` (String) -> Pointer ke users
- `members` (Array of Strings) -> ID students

### 5.1 Sub-collection di bawah `halaqahs/{id}/setorans`

(Opsional menggunakan Root Collection per `setorans` dengan index untuk ke Query besar, direkomendasikan Root Collection `setorans`).

### 6. `tahfidz_records` (Domain Tahfidz - Root Collection)

Perekaman harian setor Al-Quran. Skala query akan sangat besar.

- `id` (Document ID)
- `tenantId` (String)
- `studentId` (String)
- `musyrifId` (String)
- `date` (Timestamp)
- `type` (String) -> 'Ziyadah' (Hapalan Baru), 'Murajaah' (Ulang)
- `surahStart` (String), `ayatStart` (Number)
- `surahEnd` (String), `ayatEnd` (Number)
- `grade` (String) -> 'Mumtaz', 'Jayyid', 'Maqbul'
- `notes` (String)

### 7. `violations` (Domain Boarding)

Pelanggaran yang dilakukan santri di lingkungan asrama/sekolah.

- `id` (Document ID)
- `tenantId` (String)
- `studentId` (String)
- `reporterId` (String, Pointer to musyrif/satpam)
- `date` (Timestamp)
- `category` (String) -> 'Keterlambatan', 'Adab', 'Kebersihan', 'Barang Terlarang'
- `description` (String)
- `deductionPoints` (Number) -> Berapa poin yang dipotong
- `consequenceEngaged` (Boolean) -> Apakah hukuman sudah dieksekusi

### 8. `invoices` (Domain Finance)

Kartu tagihan (Tanggungan, SPP bulanan).

- `id` (Document ID)
- `tenantId` (String)
- `studentId` (String)
- `title` (String) -> 'SPP Agustus 2024'
- `amount` (Number)
- `dueDate` (Timestamp)
- `status` (String) -> 'UNPAID', 'PARTIAL', 'PAID'
- `paymentUrl` (String) -> Payment gateway link opsional

**Kunci Desain Indexed**: Sangat bergantung pada gabungan kombinasi _Composite Indexes_ Firestore seperti `[tenantId + studentId + date(desc)]` pada record pelanggaran, tagihan, dan rekaman tahfidz.
