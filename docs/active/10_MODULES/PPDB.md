# Modul PPDB Digital

## Tujuan

Memudahkan calon pendaftaran santri/siswa baru untuk melakukan pendaftaran secara mandiri melalui portal publik yang terintegrasi langsung dengan dashboard manajemen pendaftaran di sisi admin institusi.

## Fitur Utama

1. **Formulir Pendaftaran Publik**
   - Pengisian biodata calon siswa.
   - Pengisian data asal sekolah.
   - Pengisian data orang tua/wali.
   - Pilihan jenjang pendidikan.

2. **Upload Dokumen Otomatis Terhubung Checklist**
   - Kartu Keluarga (KK)
   - Akta Kelahiran
   - Rapor
   - Ijazah (Opsional tergantung jenjang)
   - SKHUN (Opsional)
   - Pas Foto
   - _Logic_: Begitu dokumen diunggah di form publik, status checklist pada candidate terkait langsung menjadi `true` secara otomatis tanpa memerlukan pengecekan/verifikasi manual dasar (Admin tetap bisa mereview dari sistem).

## Cara Penggunaan

1. Tim sekolah menyediakan tautan Portal PPDB Publik (contoh: simulasi dari menu PPDB Manager > "Open Public Portal").
2. Calon pendaftar membuka tautan, lalu mengisi data dengan lengkap.
3. Calon pendaftar mengunggah soft file dokumen yang disyaratkan.
4. Klik "Submit". Pendaftar akan masuk ke tahap `Registered` atau `Document Review` dan semua dokumen yang telah diunggah akan tercentang pada checklist pendaftar.

## Rencana Pengembangan Lanjutan

- Integrasi Payment Gateway untuk pembayaran biaya pendaftaran awal.
- Notifikasi WhatsApp/Email saat berhasil mendaftar awal.
- Upload susulan jika terdapat dokumen belum lengkap (melalui panel cek status pendaftar).
