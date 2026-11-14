# Modul Alumni Directory & Network

> **Status runtime (13 Nov 2026):** direktori kelulusan Supabase aktif; Tracer/Komunitas memakai data direktori; tab Donasi Alumni membaca modul Donasi & Wakaf. Survei tracer, event komunitas, dan job board **belum** punya API. Lihat [CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md](../00_PRODUCT/CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md).

## Tujuan

Mencatat kelulusan santri menjadi profil alumni tenant dan menampilkan ringkasan angkatan / keanggotaan sederhana.

## Yang sudah tersedia

1. **Direktori** — daftar alumni + catat kelulusan (`GET /api/alumni`, `POST /api/alumni/graduations`)
2. **Tracer (terbatas)** — agregat jumlah per tahun angkatan dari profil kelulusan
3. **Komunitas (terbatas)** — daftar anggota = direktori alumni
4. **Donasi Alumni** — feed transaksi dari `/api/donation/snapshot` (CRUD di menu Donasi & Wakaf)

## Yang belum (backlog)

- Form & penyimpanan Tracer Study (pekerjaan/kuliah/wirausaha)
- Agenda reuni, job board, portal registrasi mandiri alumni
- Update/hapus profil alumni (API hanya create kelulusan)
- Payment gateway khusus endowment (di luar kontrak Relasi saat ini)
