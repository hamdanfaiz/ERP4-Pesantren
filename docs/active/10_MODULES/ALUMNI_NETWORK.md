# Modul Alumni Directory & Network

> **Status source (27 Nov 2026):** direktori kelulusan memakai API tenant; kegiatan komunitas memiliki API terpisah; Tracer Study kini memiliki implementasi sumber berupa survei kategorikal dengan konfirmasi persetujuan. Tracer Study masih **terkunci secara default** sampai migrasi `20270408000000` diuji dan diterapkan pada staging. Ini belum membuktikan kesiapan rilis atau Production.

## Tujuan

Mencatat kelulusan santri menjadi profil alumni tenant dan menampilkan ringkasan angkatan / keanggotaan sederhana.

## Yang sudah tersedia

1. **Direktori** — daftar alumni + catat kelulusan (`GET /api/alumni`, `POST /api/alumni/graduations`)
2. **Tracer Study** — pilihan status kegiatan, jenjang pendidikan, dan bidang pekerjaan; satu jawaban per alumni dan tahun survei; konfirmasi persetujuan wajib; penyimpanan idempoten; tanpa kolom isian bebas.
3. **Komunitas (terbatas)** — daftar anggota = direktori alumni dan kegiatan melalui API tenant bila gerbang runtime aktif.
4. **Donasi Alumni** — feed transaksi dari `/api/donation/snapshot` (CRUD di menu Donasi & Wakaf)

## Gerbang rilis Tracer Study

- API: `GET/POST /api/alumni/tracer`, wajib autentikasi, izin Admin modul Alumni, tenant aktif, dan dua gerbang runtime terpisah.
- Data: kategori terbatas, consent timestamp, constraint relasi tenant, RLS + FORCE RLS, akses langsung `anon`/`authenticated` ditolak, tulis melalui RPC idempoten. Sidik jari permintaan menyimpan hash agar tabel retry tidak menggandakan jawaban atau ID alumni.
- Migrasi dan jawaban sintetis belum diterapkan pada staging pada checkpoint ini; jangan aktifkan feature flag sebelum migrasi dan pengujian staging lulus.
- Tidak mengisi jawaban tanpa persetujuan alumni. Tidak mengumpulkan nama perusahaan, alamat, gaji, nomor kontak, atau rincian bebas.

## Yang belum (backlog)

- Papan lowongan kerja, portal registrasi mandiri alumni
- Update/hapus profil alumni (API hanya create kelulusan)
- Payment gateway khusus endowment (di luar kontrak Relasi saat ini)
