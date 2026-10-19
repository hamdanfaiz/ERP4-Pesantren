# Rancangan Migrasi Keamanan dan Data — Phase 0

**Status:** rancangan untuk ditinjau; belum diterapkan ke Firebase atau lingkungan produksi.  
**Tujuan:** menyiapkan autentikasi, isolasi data antar-pesantren, dan aturan akses sebelum fitur ERP dikembangkan lebih jauh.

## Temuan audit awal

Berdasarkan source dan dokumen arsitektur yang terlihat di AI Studio:

- `firestore.rules` saat audit mengizinkan baca dan tulis untuk semua dokumen.
- Dokumen `ERD.md` dan `FIRESTORE_STRUCTURE.md` menetapkan pola root collection dengan field `tenantId`; dokumen struktur juga menyebut custom claim `tenantId` pada Firebase Auth.
- `RBAC_ARCHITECTURE.md` menyebut autentikasi saat ini sebagai simulasi. `AuthContext` memulihkan profil/peran dari `localStorage`; pencarian awal belum menemukan pemulihan sesi `onAuthStateChanged` maupun pemanggilan login Firebase Auth.
- Alur onboarding menulis kredensial awal ke dokumen `users`; kredensial harus dihapus dari alur Firestore dan tidak disimpan di log.
- Folder `supabase/` memiliki `migrations/20260603000000_initial_schema.sql` dan `config.toml`. Pencarian source belum menemukan pemanggilan `createClient` atau import paket Supabase; penggunaan aktifnya belum dipastikan.
- Preview aplikasi berhasil dimuat ulang dan build log menyatakan `Build successful`. Panel runtime menunjukkan empat warning ukuran container chart; dua error koneksi Vite yang terlihat sebelumnya hilang setelah reload.

Temuan source perlu diverifikasi lagi terhadap seluruh alur, Firebase project, dan konfigurasi deployment sebelum perubahan keamanan dirilis.

## Model target

1. Firebase Auth menjadi sumber identitas dan status sesi pengguna.
2. Dokumen profil `users/{uid}` memakai `uid` sebagai document ID dan menyimpan `tenantId`, `role`, status aktif, serta `unitId` bila diperlukan. Hak tenant/peran ditetapkan melalui proses tepercaya; klien tidak dapat menaikkan haknya sendiri.
3. Ikuti pola arsitektur yang sudah didokumentasikan: root collection operasional memakai field `tenantId`; custom claim `tenantId` diterbitkan oleh proses tepercaya. Rules membandingkan klaim pengguna dengan tenant pada dokumen dan membatasi operasi sesuai peran.
4. Tetapkan satu backend operasional. Jika Firebase dipilih seperti alur source saat ini, migrasi Supabase tidak dijalankan paralel tanpa keputusan produk dan rencana sinkronisasi yang jelas.
5. Akun dibuat melalui alur tepercaya dengan Firebase Auth Admin SDK atau undangan/reset kata sandi. Kata sandi tidak disimpan di Firestore maupun log.
6. Firestore memakai prinsip default-deny: akses hanya diberikan per collection dan operasi setelah identitas, status aktif, peran, dan tenant divalidasi.

## Urutan migrasi

1. **Inventarisasi:** petakan root collection, operasi baca/tulis, peran, tenant, data demo, dan pemanggil setiap service. Catat query yang belum membatasi data berdasarkan `tenantId`.
2. **Keputusan backend:** pastikan apakah Supabase masih digunakan. Tentukan sumber data utama dan perlakuan migrasi SQL sebelum mengubah skema atau membuang konfigurasi.
3. **Autentikasi:** sambungkan pemulihan sesi ke Firebase Auth; ubah login/logout dan guard halaman agar bergantung pada sesi Auth, bukan peran dari `localStorage`.
4. **Keanggotaan:** tetapkan kontrak `uid`/`tenantId`/`unitId`/`role`; terbitkan custom claims dan pindahkan pembuatan akun serta perubahan hak ke backend tepercaya. Profil lokal hanya cache tampilan.
5. **Data tenant:** siapkan migrasi yang dapat diulang dan mode dry-run untuk mengisi atau memperbaiki `tenantId`. Buat cadangan, hitung dokumen sebelum/sesudah, cek data tanpa tenant, dan verifikasi sampel tiap tenant sebelum cutover.
6. **Aturan akses:** ganti aturan terbuka dengan rules default-deny yang membatasi operasi berdasarkan klaim tenant dan peran. Audit semua query agar sesuai dengan batas yang diwajibkan rules Firestore.
7. **Rilis bertahap:** validasi di Firebase Emulator atau proyek staging, jalankan skenario setiap peran, pantau kegagalan akses, lalu jadwalkan cutover produksi dan rencana rollback.

## Kriteria penerimaan

- Pengguna tanpa sesi tidak dapat membaca atau menulis data ERP.
- Pengguna tenant A tidak dapat membaca atau mengubah data tenant B, termasuk melalui ID dokumen langsung.
- Peran atau `tenantId` tidak dapat diubah oleh klien untuk memperoleh akses tambahan.
- Login, pemulihan sesi, logout, onboarding, dan penonaktifan akun memiliki alur yang jelas.
- Tidak ada kredensial yang disimpan di Firestore atau log.
- Rules dan query lulus skenario allow/deny di Emulator; data lama memiliki laporan migrasi dan cadangan yang dapat dipulihkan.

## Gerbang sebelum implementasi

Jangan terapkan rules baru ke produksi sebelum inventaris collection selesai, backend utama dipastikan, data tenant tanpa nilai diperbaiki dengan cadangan, dan skenario allow/deny lulus di Emulator atau staging. Dokumen ini belum mengubah rules Firebase.