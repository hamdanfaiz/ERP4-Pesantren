# Panduan pemicu CI PR #40 — 5 November 2026

## Kondisi

- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40).
- Branch PR: `codex/menu-owner-placement-20261101`.
- Head source saat pembaruan panduan: `d9b3be7a6f8ae021360008e02b1dba738d2eab5e`.
- GitHub Actions belum membuat workflow run untuk head terbaru ini. Pembaruan file melalui konektor GitHub tidak memicu Actions; tim perlu membuat fast-forward push native dari clone yang terautentikasi. Pemeriksaan Supabase Preview terpisah berstatus `skipped` karena branch tidak terhubung ke Supabase Branch.
- Source dan guard runtime terbaru sudah berada di branch PR. Guard menelusuri graph impor frontend dan server (152 modul) serta memastikan Firebase tidak menjadi dependency produksi. Pembaruan ref melalui konektor GitHub tidak memulai Actions; perlu native Git push dari clone yang terautentikasi.

Workflow kini mendaftarkan semua 46 script `test:*` di `package.json`; audit ini hanya memeriksa cakupan perintah, bukan hasil lulus tes. Enam pemeriksaan yang baru ditambahkan mencakup Master Data CSV, katalog Naming Series, pencarian/paginasi kelas, paginasi roster/Ustadz, konflik jadwal, dan validasi aset Library.

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

Git harus terautentikasi ke repo GitHub sebelum perintah `push`. Setelah push berhasil, tunggu sampai job `npm-install`, `frontend`, dan `database` selesai di tab **Checks** PR #40. Job database mencakup replay seluruh migration Supabase lokal (termasuk `20270302000000_academic_class_reference_pagination.sql`), pgTAP roster/kelas (termasuk tenant sintetis 501 kelas), race NIS/Tahfidz, API Auth/tenant, Storage, serta backup/restore pada lingkungan terisolasi CI.

Setelah workflow selesai, worktree sementara dapat dibuang:

```powershell
git -C $repo worktree remove $worktree
```

- Pemeriksaan baca-saja Supabase MCP pada 5 November 2026: VQE memiliki 133 migration sampai `20270301000000_academic_student_roster_pagination`; source PR memiliki 134 migration. Versi kelas `20270302000000_academic_class_reference_pagination` belum diterapkan, dan ledger VQE masih mencatat alias lama `20261101015832_tenant_reference_relationships`. Tidak ada perubahan database yang dilakukan.

## Batasan

- Langkah ini hanya memicu CI di GitHub; tidak menjalankan deployment atau migrasi ke Supabase Production.
- Jangan mengaktifkan Deploy to Production. VQE staging tetap terpisah dari PTSAS Production.
- Jika push ditolak karena branch sudah bergerak, jalankan `git -C $repo fetch origin` lagi, buat ulang worktree pada head terbaru, lalu ulangi commit kosong dan push.
- PR tetap Draft/Open sampai CI, pgTAP, UAT Admin VQE, rekonsiliasi ledger staging, dan penerimaan tim backend selesai.

## Gate tambahan — picker kelas Akademik

Perubahan terbaru menambah migration `20270302000000_academic_class_reference_pagination.sql`, memperluas `supabase/tests/academic_student_roster_pagination.test.sql` menjadi 48 assertion, dan memperluas guard runtime agar mencakup frontend serta server (152 modul). Pastikan CI head terbaru mereplay migration ini dan menyelesaikan pgTAP, termasuk paging tenant sintetis 501 kelas serta indeks prefix/keyset, sebelum UAT staging atau merge.


## Hasil verifikasi head PR — 5 November 2026

- Pada source tree PR `d1669ff392a37a7e4a6d93d0ce72ad517eb73e0a`, lulus `npm ci --no-audit --no-fund`, `npm run lint`, `npm run build`, `npm run test:migration-preflight`, dan 39/39 skrip tes non-database/API. Head `2ae7bfff00f7b819fe188f75ce016d24add2cf2d` hanya commit kosong; tree-nya sama.
- Run Actions #1135 sukses, tetapi commit yang diuji `79d516880fb0c957d672cc4db8d9725f7f294ba3` berjarak 17 commit dari source tree PR terkini. Run tersebut bukan bukti CI untuk perubahan setelahnya.
- Tujuh tes integrasi `test:db`, race NIS/Tahfidz, API Auth/tenant, Storage, dan backup/restore belum dijalankan pada head terkini. Jalankan di runner GitHub yang memakai Supabase lokal terisolasi.
- Pemeriksaan source lokal tidak mengubah staging/Production. Build masih memperingatkan chunk PDF sekitar 1,46 MB dan anotasi Rollup dari Zod.
