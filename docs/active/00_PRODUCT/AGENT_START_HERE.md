# Agent Start Here — ERP4 Pesantren

Baca dokumen ini **sebelum** mengubah kode, skema, flag, data Production, atau menulis PR. Berlaku untuk semua agent (Cursor, Claude, Codex, dll.).

## 1. Kontrak wajib (jangan dilanggar)

| Aturan | Sumber |
| --- | --- |
| PTSAS `ptsasgdvgrbdtgyqieie` adalah Production kanonis; VQE `vqemuyzveuirlkvdggjd` adalah staging rehearsal untuk urutan rilis yang diminta pemilik | `.cursor/rules/supabase-project.mdc` |
| Jangan salin data dummy atau mengubah database live sebelum CI, preflight target, dan dependensi migrasi ditinjau | aturan Supabase + checkpoint modul |
| Perubahan skema/runtime hanya dalam cakupan tugas eksplisit; rilis Production memerlukan set migrasi terverifikasi, dependensi cocok, dan bukti backup/restore | aturan Supabase + `COMMERCIAL_READINESS.md` |
| Jangan `db push` seluruh selisih ledger hanya agar jumlah versi sama | `academic-production.mdc` |
| Secrets hanya di `.env` / secret manager; jangan commit / chat | skill `erp4-pesantren` |
| Flag runtime fail-closed; jangan nyalakan flag sebelum objek yang dipanggil ada | `MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md` |
| UI: skeleton loading + banner status/alert | `.cursor/rules/ui-*.mdc` |
| Perubahan bedah; jangan redesign spekulatif | `.cursor/skills/karpathy-guidelines` |

## 2. Urutan baca sebelum kerja

1. Dokumen ini.
2. Checkpoint modul yang relevan (lihat indeks di bawah).
3. Aturan `.cursor/rules/*` yang `alwaysApply` atau cocok dengan file yang disentuh.
4. Skill `.cursor/skills/erp4-pesantren/SKILL.md` bila menyentuh runtime/env/Supabase.
5. Panduan modul di `docs/active/10_MODULES/` **setelah** dibaca checkpoint terkini — beberapa file modul masih berisi aspirasi produk lama.

## 3. Checkpoint terkini (baca dulu)

| Area | Dokumen |
| --- | --- |
| Relasi & Ekosistem + Analitik + OpenWA (13 Nov 2026) | [CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md](CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md) |
| Akademik Production | `.cursor/rules/academic-production.mdc` + `academic-report-card.mdc` |
| Flag & visibilitas menu | [MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md) |
| CBT skala besar & paginasi | [CBT_LARGE_TENANT_PAGINATION_DESIGN.md](CBT_LARGE_TENANT_PAGINATION_DESIGN.md) |
| Checkpoint CBT skala besar (13 Nov 2026) | [CHECKPOINT_2026-11-13_CBT_SCALE.md](CHECKPOINT_2026-11-13_CBT_SCALE.md) |
| Handoff backend umum | [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) |
| Kesiapan komersial | [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) |

## 4. Cara kerja yang konsisten

- **Sukses = terverifikasi.** Setelah mengubah API/UI, buktikan dengan test/CI. Utamakan urutan lokal → CI → VQE staging → PTSAS Production; rilis langsung ke Production boleh bila set migrasi, drift/dependensi, backup/restore, dan pemeriksaan keamanan Production terbukti. Jangan klaim “selesai” tanpa bukti.
- **Stub vs kontrak.** Jika UI bilang “belum punya API”, jangan pura-pura menyambungkan ke data contoh. Buat API/migrasi hanya jika diminta dan sesuai dependensi.
- **OpenWA.** Jangan embed `@open-wa/wa-automate` di proses ERP. ERP memanggil Easy API HTTP; kunci di `WA_GATEWAY_API_KEY`; endpoint di pengaturan tenant atau `WA_GATEWAY_ENDPOINT`.
- **Commit.** Hanya jika user meminta. Jangan commit `.env`.
- **Bahasa UI & pesan error ke pengguna:** Indonesia.

## 5. Setelah selesai satu batch kerja

Perbarui checkpoint terkait (atau buat checkpoint bertanggal baru) dengan:

- apa yang berubah (file/API/flag),
- bukti verifikasi,
- backlog tersisa (prioritas + blocker),
- apa yang **tidak** boleh dilakukan agent berikutnya.
