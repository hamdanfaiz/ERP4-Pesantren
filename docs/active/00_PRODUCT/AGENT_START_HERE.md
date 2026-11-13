# Agent Start Here — ERP4 Pesantren

Baca dokumen ini **sebelum** mengubah kode, skema, flag, data Production, atau menulis PR. Berlaku untuk semua agent (Cursor, Claude, Codex, dll.).

## 1. Kontrak wajib (jangan dilanggar)

| Aturan | Sumber |
| --- | --- |
| Database hanya Production PTSAS `ptsasgdvgrbdtgyqieie` | `.cursor/rules/supabase-project.mdc` |
| Jangan pakai staging VQE `vqemuyzveuirlkvdggjd` | aturan yang sama + skill `erp4-pesantren` |
| Jangan ubah skema/data/proses kecuali diminta eksplisit | aturan Supabase + Karpathy lokal |
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
| Papan Peringkat Tahfidz bulanan (14 Nov 2026) | [CHECKPOINT_2026-11-14_TAHFIDZ_MONTHLY_LEADERBOARD.md](CHECKPOINT_2026-11-14_TAHFIDZ_MONTHLY_LEADERBOARD.md) |
| Akademik Production | `.cursor/rules/academic-production.mdc` + `academic-report-card.mdc` |
| Flag & visibilitas menu | [MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md) |
| Handoff backend umum | [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) |
| Kesiapan komersial | [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) |

## 4. Cara kerja yang konsisten

- **Sukses = terverifikasi.** Setelah mengubah API/UI, buktikan dengan status HTTP / dry-run / baca snapshot tenant; jangan klaim “selesai” tanpa bukti.
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
