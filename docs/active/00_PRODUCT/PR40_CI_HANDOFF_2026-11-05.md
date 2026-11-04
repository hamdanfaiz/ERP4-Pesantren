# Panduan pemicu CI PR #40 — 5 November 2026

## Kondisi

- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40).
- Branch PR: `codex/menu-owner-placement-20261101`.
- Head source saat panduan dibuat: `442ccdecaa97ce05b84bd353077c0074df4d2e39`.
- GitHub Actions belum membuat workflow run untuk head tersebut. Hanya pemeriksaan Supabase Preview yang berstatus `skipped` karena branch tidak terhubung ke Supabase Branch.
- Source sudah berada di branch PR. Pembaruan ref melalui konektor GitHub tidak memulai Actions; perlu native Git push dari clone yang terautentikasi.

## Cara aman memicu CI dari Windows PowerShell

Jalankan dari clone repo tim. Perintah berikut membuat worktree sementara yang terpisah, mengambil branch PR terbaru, membuat commit kosong untuk memicu pemeriksaan, lalu mengirimkannya sebagai fast-forward. Tidak ada perubahan file kerja tim.

```powershell
$repo = 'C:\path\ke\ERP4-Pesantren'
$worktree = Join-Path (Split-Path $repo -Parent) 'erp4-pr40-ci-20261105'

git -C $repo fetch origin
git -C $repo worktree add --detach $worktree origin/codex/menu-owner-placement-20261101
git -C $worktree commit --allow-empty -m 'ci: run PR 40 checks'
git -C $worktree push origin HEAD:refs/heads/codex/menu-owner-placement-20261101
```

Git harus terautentikasi ke repo GitHub sebelum perintah `push`. Setelah push berhasil, tunggu sampai job `npm-install`, `frontend`, dan `database` selesai di tab **Checks** PR #40. Job database mencakup replay migration Supabase lokal, pgTAP, race NIS/Tahfidz, API Auth/tenant, Storage, serta backup/restore pada lingkungan terisolasi CI.

Setelah workflow selesai, worktree sementara dapat dibuang:

```powershell
git -C $repo worktree remove $worktree
```

## Batasan

- Langkah ini hanya memicu CI di GitHub; tidak menjalankan deployment atau migrasi ke Supabase Production.
- Jangan mengaktifkan Deploy to Production. VQE staging tetap terpisah dari PTSAS Production.
- Jika push ditolak karena branch sudah bergerak, jalankan `git -C $repo fetch origin` lagi, buat ulang worktree pada head terbaru, lalu ulangi commit kosong dan push.
- PR tetap Draft/Open sampai CI, pgTAP, UAT Admin VQE, rekonsiliasi ledger staging, dan penerimaan tim backend selesai.
