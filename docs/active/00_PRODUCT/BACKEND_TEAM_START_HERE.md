# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint 31 Oktober 2026, 09:32 UTC:** PR #38 head `8fecdedcfd52f50f6abb1390509cb93a4f5282ab` lulus pemeriksaan CI wajib **3/3** pada [run 41188553649](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41188553649): build frontend/guard Firebase, migrasi + API Auth/tenant + pgTAP, serta instalasi NPM bersih. Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch. Login Admin berhasil, tetapi browser `/health/ready` masih 503 dan dashboard belum memuat data; pemeriksaan identity store baca-saja dari worktree dengan konfigurasi VQE lulus. UAT data menunggu penyelarasan backend preview. PR tetap Draft/Open. PTSAS `ptsasgdvgrbdtgyqieie` adalah Production, tidak disentuh; auto-deploy tetap OFF.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Project berstatus `ACTIVE_HEALTHY`, 115 migration diterapkan sampai `20270212000000`. Tenant sintetis aktif dengan satu profil `admin:active`; kandidat, Wali, relasi, tagihan, dan permintaan Finance masih nol. Integrasi GitHub sudah terputus. Dashboard menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. Auth mengembalikan 429 untuk email recovery karena batas email bawaan. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE telah menerima lima migration dari PR #38 yang belum digabung. Jangan menyebut VQE setara dengan `main` sampai PR tersebut selesai atau migrasi staging direkonsiliasi. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Lanjutkan UAT sintetis di VQE:** tenant dan profil Admin uji sudah ada; jangan membuat tenant atau akun Admin duplikat. Login Admin melalui UI sudah berhasil, tetapi `/health/ready` pada backend yang melayani browser masih `unavailable`; selaraskan proses server dan env VQE terlebih dahulu. Pemeriksaan langsung dari worktree memakai env VQE lulus. Setelah readiness UI `ready`, buat profil Wali, kandidat, relasi, dan tagihan sintetis untuk skenario UAT. Jangan gunakan kredensial pelanggan atau PTSAS.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Query-query di dalamnya sudah divalidasi sebagai SELECT pada VQE staging; skrip belum dijalankan pada PTSAS. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Konfigurasi staging dan status Auth

Preview lokal Codex memakai `.env` yang diabaikan Git dan menunjuk ke VQE. Login Admin sudah berhasil, tetapi proses backend yang melayani browser masih mengembalikan `/health/ready: unavailable`; sementara pemeriksaan langsung dari worktree dengan URL/key VQE lulus. Pastikan process manager/server yang benar membaca `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` dari konfigurasi VQE sebelum UAT data. Jangan menampilkan atau menyalin secret, kunci PII, maupun nilai Production. Email Auth bawaan VQE pernah mencapai `over_email_send_rate_limit`; untuk beberapa putaran UAT, tim dapat mengonfigurasi SMTP khusus di Authentication → Emails → SMTP Settings. Simpan kredensial SMTP hanya di dashboard/secret manager, jangan di chat atau bundle klien. Panduan rinci ada di [runbook email Auth](SUPABASE_AUTH_EMAIL_DELIVERY_RUNBOOK.md).

Untuk alur UAT yang mencakup login Wali, tagihan, bukti, dan onboarding, konfigurasi server/browser mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_PPDB_TENANT_ID`, `PII_ENCRYPTION_KEY`, dan `PII_FINGERPRINT_KEY`. Buat kedua kunci PII secara acak dan independen, masing-masing 32 byte/64 karakter hex. Atur flag server dan pasangannya yang berawalan `VITE_` sesuai skenario PPDB, dokumen, finance bill, serta onboarding; semuanya harus tetap mati di Production sampai ada rencana rilis yang disetujui. Pendaftaran Wali memakai `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`; `PUBLIC_PPDB_ENABLED` hanya diperlukan jika UAT juga menguji pendaftaran calon santri publik. Kunci PII dan `SUPABASE_SECRET_KEY` tidak boleh masuk bundle klien.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- CI lulus 3/3 pada head source `af9db8378e91c62b682e44e994302abd24f026c2` ([run `41184875367`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367)): instalasi NPM, frontend/build/Docker guard, migrasi, API Auth/tenant, pgTAP, dan backup/restore.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- Tenant sintetis dan profil Admin aktif sudah diverifikasi langsung di VQE dengan kueri baca-saja. Login Admin via UI berhasil, tetapi dashboard tidak dapat memuat ringkasan; `/health/ready` pada browser mengembalikan `unavailable`. Pengecekan readiness langsung dari worktree berhasil, jadi proses/backend preview yang melayani browser perlu disejajarkan dahulu. Profil Wali, kandidat, relasi, tagihan, upload, onboarding, dan isolasi tenant melalui UI belum diuji. Fixture baru dibuat setelah readiness pulih dan dihapus sesudah UAT.
- PTSAS belum dapat diaudit ulang melalui konektor; percobaan `get_project` terbaru ditolak akses. Snapshot Production di dokumen lama tetap historis. Tidak ada perubahan Production.
- PPOB/payment gateway dikeluarkan dari rilis awal.
- Persentase penyelesaian keseluruhan tidak dihitung dari kemajuan schema atau CI saja.

## Kepemilikan pekerjaan

| Pekerjaan | Pemilik |
| --- | --- |
| Source aplikasi, perbaikan, PR dan CI | Pengembang aplikasi |
| Provisioning sintetis, akses staging, inventaris, backup | Tim backend |
| UAT fungsi pesantren dan persetujuan hasil | Tim backend dan perwakilan pesantren |
| Instalasi VPS/on-premise, operasi, runbook | Tim backend/penerapan |
| Rekonsiliasi serta deployment PTSAS Production | Tim backend/penerapan setelah rencana disetujui |

Dokumen terkait: [temuan redirect Auth Production](PRODUCTION_AUTH_REDIRECT_CHECKPOINT_2026-10-31.md), [checkpoint staging PR #38](../06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md), [audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).

## Runbook singkat: preview login berhasil tetapi readiness 503

**Temuan browser 31 Oktober 2026:** login Admin UAT berhasil, tetapi `http://localhost:4179/health/ready` mengembalikan `{"status":"unavailable"}` dan dashboard belum dapat membaca data. Login Supabase dari browser tidak membuktikan API server memakai konfigurasi VQE. Worktree pengembangan memiliki konfigurasi VQE dan pemeriksaan identity store lulus; proses yang melayani port 4179 belum teridentifikasi, jadi jangan menyimpulkan bahwa variabelnya sudah masuk ke proses tersebut.

Untuk mengisolasi API server tanpa menghentikan proses lama:

1. Buka PowerShell baru pada **checkout bersih PR #38**, di root repository. Pastikan file lokal `.env` ada dan diabaikan Git:
   ```powershell
   Test-Path .env
   git check-ignore .env
   ```
   Jangan tampilkan isi `.env`, jangan commit, dan pastikan nilainya menunjuk ke staging VQE.
2. Pastikan dua variabel server terbaca tanpa mencetak nilainya:
   ```powershell
   node -r dotenv/config -e "for (const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY']) console.log(name + ': ' + (process.env[name] ? 'set' : 'missing'))"
   ```
   Bila dependensi belum terpasang, jalankan `npm ci` terlebih dahulu. Perintah ini hanya memasang paket dari lockfile.
3. Jalankan server API dari root repository pada port pemeriksaan yang terpisah:
   ```powershell
   $env:PORT = '4180'
   npm run dev
   ```
   Skrip `dev` menjalankan `tsx server.ts`; server memuat `.env` dari direktori kerja. Biarkan terminal ini terbuka agar log readiness terlihat.
4. Di PowerShell kedua, periksa endpoint:
   ```powershell
   curl.exe -i http://127.0.0.1:4180/health/ready
   ```
   Lulus jika respons `HTTP 200` dan `{"status":"ready"}`. Respons `503` berarti identity store masih gagal diperiksa.
5. Jika tetap 503, lihat terminal server untuk log `Supabase identity readiness check failed`. Log hanya memuat tipe error serta penanda apakah URL dan secret tersedia, bukan nilainya. Perbaiki konfigurasi/profil/akses staging berdasarkan error tersebut; jangan tempel secret atau isi lengkap log sensitif ke tiket.
6. Setelah health 200, buka `http://localhost:4180/` dan verifikasi lagi login serta dashboard. Jalur password-recovery tidak perlu diulang. Jika health 200 tetapi data modul tetap gagal, periksa flag runtime modul dan log API secara terpisah; readiness hanya membuktikan identity store merespons, bukan seluruh modul UAT.

Port `4180` dipilih untuk menghindari perubahan atau penghentian layanan lama di `4179`. Gunakan hanya konfigurasi staging VQE. Jangan memasukkan `SUPABASE_SECRET_KEY`, kunci PII, atau nilai Production ke klien Vite.
