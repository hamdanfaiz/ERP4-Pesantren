# Petunjuk Teknis Akses dan Rehearsal Migrasi

**Tanggal:** 26 Oktober 2026  
**Project Supabase target:** `ptsasgdvgrbdtgyqieie` — ERP4-Pesantren  
**Project Firestore sumber:** `graphite-ship-q5xj8`  
**Database Firestore kanonis:** `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`  
**Batas:** panduan ini memulihkan akses dan menyiapkan verifikasi/rehearsal. Panduan ini tidak mengizinkan perubahan production.

## Ringkasan yang perlu diketahui tim

- PR cutover utama #13 masih Open/Draft. PR #12 sudah merged. PR #11 tetap Open/Draft dan divergen dari #13; jangan merge seluruh branch #11.
- Head kode PR #13 sebelum dokumen ini berisi **91 migration**. Check GitHub Actions [run 40308481444](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40308481444) lulus pada 2/2 job dengan database CI lokal sintetis. CI bukan bukti status database target atau hasil import.
- Inventaris Firestore mencatat 18 koleksi root dan 561 dokumen. Pemeriksaan metadata terbaru memastikan **453/453** `master_data` dan **50/50** `candidates` tidak memiliki field tingkat atas `tenantId`. Satu dokumen pengguna memiliki tenant key yang cocok dengan satu dokumen tenant; ini calon pemetaan, bukan persetujuan otomatis atas seluruh record.
- Status migration dan data terkini project Supabase target belum dapat diperiksa dari konektor Codex yang aktif. Snapshot ledger lama tidak boleh dipakai sebagai status terkini. Tidak ada migration atau data production yang diterapkan oleh checkpoint ini.
- Sebelum production, credential Supabase/database yang pernah dibagikan harus dirotasi dan ditaruh di secret manager. Jangan salin credential, token, atau isi `.env` ke chat, GitHub, log, atau kode browser.

## 1. Sambungkan akses ke project Supabase yang benar

### A. Konektor Supabase di Codex

Jika tim ingin Codex membaca status target:

1. Buka pengaturan konektor/aplikasi Supabase di Codex dan sambungkan ulang dengan akun organisasi yang memiliki project **ERP4-Pesantren**.
2. Pastikan daftar project menampilkan ref tepat `ptsasgdvgrbdtgyqieie`. Konektor yang hanya menampilkan `vqemuyzveuirlkvdggjd` masih menunjuk ke project lama dan tidak boleh dipakai sebagai pengganti.
3. Uji operasi baca: detail project, daftar migration, dan daftar tabel harus berhasil untuk ref target.
4. Jika akses tetap ditolak, pemilik organisasi perlu memberikan akses baca yang sesuai pada project target atau menjalankan perintah baca-saja di bagian 4 lalu mengirim keluaran yang disanitasi ke tim.

### B. Hubungkan GitHub tanpa mengaktifkan deploy production secara tak sengaja

Saat ini check Supabase Preview pada PR dilewati karena branch belum terhubung ke project target. Untuk menyiapkannya:

1. Di project target, tinjau **Project Settings → Integrations → GitHub Integration** dan pastikan repository `hamdanfaiz/ERP4-Pesantren` serta working directory `.` (folder yang berisi direktori `supabase/`).
2. Tentukan target integrasi secara tertulis sebelum menekan **Enable integration**: branch dasar production atau environment staging.
3. Jangan hubungkan PR branch ke project `main / PRODUCTION` dengan deployment otomatis sebelum tim menyetujui ledger, backup, dan rehearsal. Integrasi GitHub Supabase dapat menjalankan workflow migration pada project; merge branch ke base dapat memicu deployment.
4. Project organisasi saat ini terlihat pada paket Free. Supabase Branching/preview branch memerlukan plan yang mendukung branching. Jika tidak tersedia, gunakan project Supabase staging terpisah atau Supabase lokal dengan data sintetis; jangan menganggap PR preview berjalan hanya karena repo terhubung.

Panduan resmi: [Supabase GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration), [branching dan deployment](https://supabase.com/docs/guides/deployment/branching), serta [deployment overview](https://supabase.com/docs/guides/deployment).

## 2. Siapkan konfigurasi lokal tanpa menaruh secret di Git

1. Ambil URL dan credential terbaru dari Supabase Dashboard/secret manager setelah credential lama dirotasi. Gunakan file lokal yang diabaikan Git atau secret manager. Pastikan `.env` tetap tercantum pada `.gitignore`.
2. Nilai yang boleh dipakai klien hanya `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`. Jangan pernah memakai `VITE_SUPABASE_SECRET_KEY`, mengirim `SUPABASE_SECRET_KEY` ke browser, atau menyimpan password database di frontend.
3. `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`, `SUPABASE_LEGACY_FINGERPRINT_KEY`, dan kredensial Firebase Admin hanya untuk proses server/migrasi lokal yang dipercaya.
4. Host database langsung pada jaringan IPv4-only dapat gagal karena endpoint langsung hanya tersedia melalui IPv6. Ambil connection string pooler dari Dashboard dan gunakan hanya jika mode koneksi yang dipilih cocok untuk perintah migrasi. Jangan memasukkan password mentah ke shell history; gunakan nilai URL yang telah percent-encoded.
5. Untuk go-live, rotasi ulang secret key Supabase dan password database yang pernah dibagikan, verifikasi nilai baru pada secret store tiap environment, lalu hapus kredensial lama.

## 3. Pulihkan akses baca Firestore dengan ADC

ADC dan autentikasi CLI Google adalah dua jalur berbeda. ADC dipakai library/API REST; perintah `gcloud` memerlukan autentikasi CLI sendiri. Dokumentasi Google menegaskan bahwa `gcloud` tidak otomatis menggunakan ADC untuk mengakses resource.

### Hak akses minimum

Minta administrator project memberi akun teknis yang menjalankan inventaris peran baca Firestore, misalnya **Cloud Datastore Viewer** (`roles/datastore.viewer`) pada project `graphite-ship-q5xj8`. Jangan memberi Owner/Editor bila hanya perlu membaca data. Jika quota project diperlukan, akun juga memerlukan izin menggunakan project quota. Rujukan: [Firestore IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore), [set up ADC](https://docs.cloud.google.com/docs/authentication/provide-credentials-adc), dan [set ADC quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project).

### Langkah Windows PowerShell

Jalankan di komputer/runner tim yang memiliki akses internet dan akun Google yang benar. Jangan menyalin file ADC ke repository atau mengirimnya ke tim melalui chat.

```powershell
gcloud auth login
gcloud config set project graphite-ship-q5xj8

gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform
gcloud auth application-default set-quota-project graphite-ship-q5xj8

gcloud auth application-default print-access-token | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'ADC belum dapat memperoleh token' }
```

Jika perintah refresh token gagal dengan `getaddrinfo` untuk `oauth2.googleapis.com`, pulihkan DNS/proxy/akses keluar HTTPS 443 ke `oauth2.googleapis.com` dan `firestore.googleapis.com` pada mesin runner, lalu ulangi login ADC. Jangan mengatasi masalah jaringan dengan menaruh token atau service-account key di Git.

Untuk daftar database melalui CLI, gunakan akun CLI yang sudah login:

```powershell
gcloud firestore databases list --project graphite-ship-q5xj8
```

Pastikan database yang dipilih adalah ID kanonis yang tercantum pada header dokumen ini. Jangan mencampur database Firestore lain pada project yang sama.

## 4. Baca ulang ledger Supabase secara aman

Lakukan pemeriksaan ini dari root repository pada mesin tim, setelah credential terbaru dimasukkan ke environment secara aman:

```powershell
supabase migration list --db-url $env:SUPABASE_DB_URL
```

Perintah ini membandingkan timestamp migration lokal dengan `supabase_migrations.schema_migrations` remote. Simpan hanya nomor versi, status lokal/remote, dan pesan error yang sudah disanitasi. Jangan jalankan `supabase migration up`, `supabase db push`, `supabase migration repair`, atau SQL DDL pada target saat langkah audit ini.

Rujukan sintaks: [Supabase CLI — migration list](https://supabase.com/docs/reference/cli/supabase-migration-list). Pastikan koneksi SSL dan host dari Dashboard benar. Jika jaringan IPv4 tidak dapat mencapai host langsung, gunakan connection string pooler yang sesuai; jangan mengganti target project.

## 5. Dry-run data sebelum rehearsal

1. Refresh inventaris sumber dan cocokkan jumlah dokumen, nama koleksi, field yang tersedia, relasi, serta object Storage. Hindari mencetak nilai identitas ke output.
2. Tetapkan `legacy_tenant_key` target secara eksplisit hanya setelah pemilik data menyetujui bahwa record memang milik tenant tersebut. Field `tenantId` hilang pada sebagian besar record; jangan mengisi tenant berdasarkan nama/email/telepon atau karena hanya ada satu profil pengguna.
3. Untuk tiap importer, jalankan **preview** terlebih dahulu dan rekam hitungan `ready`, `warning`, `conflict`, `skipped`, dan `error`. Preview harus diikat pada fingerprint snapshot. Jika sumber berubah, ulangi preview.
4. Jangan mengaktifkan flag `*_IMPORT_ENABLED` atau `*_APPLY_ENABLED` pada production. Gunakan konfigurasi migrasi lokal/staging dengan nilai sementara, persetujuan operator, dan database terisolasi.
5. Rekonsiliasi identitas NIK/NISN/NIS secara server-side dan fingerprint. NIS yang tidak tersedia dalam sumber harus dibuat melalui alur transaksi NIS normal setelah kebijakan nomor disetujui; jangan mengarang nomor saat import.
6. Keuangan Koperasi memerlukan pemetaan wallet, produk, transaksi, saldo awal, dan urutan tanggal bisnis; jangan menyalin saldo tanpa rekonsiliasi ledger. Baris detail marketplace yang tidak terdapat di sumber tidak boleh dibuat sintetis.
7. Empat record metadata aset digital tidak membuktikan byte file tersedia. Jangan membuat objek Storage baru dari URL/label lama tanpa berkas sumber yang dapat diverifikasi.
8. Hasil preview yang berisi konflik, pemetaan tenant ambigu, relasi yatim, atau field wajib yang hilang harus menghentikan apply sampai diperbaiki dan ditinjau.

Pemetaan koleksi, tabel tujuan, importer, dan gap tiap modul ada pada [inventaris Firestore ke Supabase](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md), [checkpoint Master Data](MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md), serta [checklist rehearsal Production](PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md).

## 6. Rehearsal dan test gate

1. Siapkan environment staging terpisah dan backup yang dapat dipulihkan. Jalankan restore drill terlebih dahulu; catat waktu, versi PostgreSQL, jumlah tabel, dan hitungan agregat tanpa PII.
2. Jalankan preflight ledger pada commit yang sama dengan migrasi yang diuji. Hentikan bila ditemukan versi remote asing, migration tertunda yang belum ditinjau, atau mismatch schema.
3. Rehearsal semua migration pada salinan staging yang dapat dipulihkan, bukan pada Production. Ukur lock, waktu indeks, disk, kegagalan constraint, serta jumlah per tenant sebelum/sesudah.
4. Dari root source jalankan suite yang relevan sesuai `package.json` dan versi Bun repository:

```powershell
bun install --frozen-lockfile
bun run lint
bun run build
bun run test:db
bun run test:api:auth-tenant
bun run test:api:finance-storage
bun run test:api:library-storage
bun run test:db:backup-restore
bun run test:legacy-firestore-tenant-scope
bun run test:ppdb-legacy-import
bun run test:library-legacy-import
bun run test:library-circulation-import
bun run test:cooperative-legacy-import
bun run test:hris-legacy-import
bun run test:cbt-settings-import
```

5. Jalankan API preview untuk setiap domain memakai akun dan tenant sintetis. Jangan menggunakan service key di browser. Verifikasi role, isolasi tenant, retry idempoten, konflik identitas, Storage privat, transaksi bersamaan, dan rollback.
6. Tim Admin/Wali melakukan UAT di staging. Uji login akhir, reset/undangan akun, matriks role/tenant, PPDB, keuangan, Tahfidz, asrama, responsif, serta backup/restore pada environment pelanggan.

## 7. Bukti yang perlu dikirim balik ke tim

Kirim ringkasan berikut tanpa secret atau PII:

- project ref yang muncul pada connector Supabase; konfirmasi bahwa target adalah `ptsasgdvgrbdtgyqieie`;
- output `supabase migration list` yang hanya berisi versi lokal/remote;
- jumlah record per koleksi dan jumlah `tenantId` yang hilang;
- keputusan pemetaan source tenant → target tenant dan siapa yang menyetujuinya;
- hitungan preview per importer beserta konflik/warning dan checksum/fingerprint non-rahasia;
- identitas backup/staging, bukti restore, durasi migration, dan hasil suite CI/UAT.

**Stop gate:** jangan merge PR #13, mengaktifkan flag import, menjalankan migration, atau men-deploy sebelum target dapat dibaca, mapping disetujui, backup dapat dipulihkan, rehearsal staging lulus, secrets dirotasi, dan UAT ditandatangani.

## Status sesudah langkah ini

Panduan ini hanya menyiapkan langkah tim teknis. CI lokal sintetis yang hijau dan dokumen ini tidak berarti data Firestore telah dipindah, Production telah diuji, Firebase telah dihentikan pada semua environment, atau produk sudah siap go-live.

## 8. Batas dukungan environment aplikasi

Repository saat ini menyediakan container untuk **aplikasi web dan API ERP**. Docker Compose tidak memasang atau mengoperasikan PostgreSQL, Supabase Auth, Supabase Storage, maupun API gateway. URL Supabase harus dapat diakses browser pengguna; endpoint server harus dapat dijangkau dari container aplikasi. Rincian konfigurasi terdapat di [panduan customer-managed deployment](../../guides/CUSTOMER_MANAGED_DEPLOYMENT.md).

| Bentuk pemasangan | Status bukti saat ini | Pemeriksaan sebelum disebut siap |
|---|---|---|
| Aplikasi pada VPS, Supabase endpoint dikelola pelanggan/penyedia | Build dan smoke test image/Compose lulus di CI; runtime terhadap database pelanggan belum diuji. | Uji instalasi bersih, TLS/reverse proxy, reachability browser dan server, Auth, Storage, upgrade/rollback, dan backup/restore. |
| Aplikasi di jaringan on-premise, Supabase dikelola terpisah | Dapat dikonfigurasi melalui URL; belum diuji pada topologi pelanggan. | Uji DNS, IPv4/IPv6, firewall, sertifikat, SMTP/Auth callback, Storage privat, dan restore pada jaringan tersebut. |
| Seluruh Supabase self-hosted on-premise | **Belum termasuk paket dan belum diverifikasi.** | Tim harus memilih versi Supabase/PostgreSQL yang didukung, mengoperasikan Auth/Storage/API/SMTP/backup/monitoring, kemudian merehearsal seluruh migration dan UAT pada stack itu. |
| Offline atau tanpa konektivitas ke Supabase | Tidak didukung oleh runtime saat ini. | Jangan menawarkan sebagai mode offline sebelum rancangan sinkronisasi, antrean transaksi, dan konflik multi-user dibuat serta diuji. |

Jangan memasarkan “full on-premise” atau “offline-ready” hanya berdasarkan keberhasilan Docker build. Supabase lokal CI menggunakan versi yang ditetapkan di `supabase/config.toml`; rehearsal pelanggan harus memakai versi major PostgreSQL/Supabase yang cocok dengan environment target. Uji fitur Auth dan Storage juga harus dilakukan pada stack yang benar-benar akan dipakai, bukan hanya pada mock atau container aplikasi.
