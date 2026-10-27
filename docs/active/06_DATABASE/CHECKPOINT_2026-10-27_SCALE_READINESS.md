# Checkpoint pengembangan dan uji kapasitas — 27 Oktober 2026

## Posisi PR

- Repository: `hamdanfaiz/ERP4-Pesantren`
- PR #13: [Supabase-only runtime cutover and customer-managed baseline](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)
- Branch: `codex/supabase-runtime-cutover-20261022`
- Head sebelum checkpoint: `7d6c09e814b54ed8c10918abfaacc3dba1c2f8e3`
- Status tetap **Open/Draft**, belum merge.
- Estimasi proyek tetap **73% kematangan fitur / 46% kesiapan go-live**. Angka ini estimasi, bukan hasil metrik otomatis.

## Bukti CI terbaru

GitHub Actions [run 40430205659](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40430205659) selesai sukses pada kedua job:

- **Frontend build dan Firebase bundle guard:** typecheck, pemeriksaan runtime Supabase tanpa Firebase, feature flag, minimisasi PII, pagination, build produksi, Docker dan Compose.
- **Migrations, API auth, dan pgTAP:** Supabase lokal terisolasi, ledger preflight, role/tenant, transaksi NIS dan Tahfidz serentak, importer sintetis, Storage HTTP, backup/restore.

Hasil tersebut membuktikan suite CI pada environment sintetis/lokal. Hasil ini tidak membuktikan kinerja pada database pesantren besar, login/UAT endpoint yang dipakai pelanggan, atau keberhasilan migrasi pada database staging.

## Penguatan migration preflight

Commit `7d6c09e` memperbaiki fixture preflight agar merepresentasikan baseline staging yang dibaca saja:

- 47 versi tercatat dari 91 migration source.
- 44 migration berikutnya berstatus pending.
- Versi `20261205000000` dan `20261206000000` tidak memiliki `name` maupun `statements`.
- Preflight harus berhenti: `canContinueToStagingReview = false`.

Fixture ini sepenuhnya sintetis dan tidak terhubung ke database remote. Pembandingan sebelumnya menemukan 45/45 array statement yang tersedia cocok dengan source setelah normalisasi aman. Postcondition dua versi kosong konsisten dengan objek utama yang diperiksa, tetapi tidak membuktikan seluruh efek historis; jangan mengubah ledger, menjalankan repair, atau menerapkan migration remote untuk melewati gate ini.

## Kapasitas pesantren besar — pekerjaan backend yang masih terbuka

Uji CI saat ini menekankan kebenaran, tenant isolation, pagination, dan konkurensi dengan fixture sintetis kecil. Ia belum menjadi benchmark kapasitas. Staging yang terbaca hanya mempunyai sekitar 50 santri sehingga belum mewakili tenant besar.

Lakukan pada **klon disposable yang dipulihkan dari backup**, bukan staging/Production:

1. Sepakati profil volume dengan pemilik pesantren. Sebagai titik awal benchmark, uji sekurangnya 10.000 santri per tenant serta 1.000.000 catatan Tahfidz; naikkan ke 3x profil untuk stress run. Angka ini skenario uji awal, bukan janji kapasitas atau batas produk.
2. Seed hanya data sintetis yang valid dan berdistribusi lintas tenant. Sertakan kelas, asrama/kamar, wali, halaqah, tagihan/ledger, pencarian nama/NIS, dan histori Tahfidz.
3. Jalankan halaman roster awal dan halaman dalam via cursor, pencarian terindeks, agregasi dashboard, riwayat santri, serta endpoint transaksi yang sering dipakai.
4. Jalankan beban bertahap dan burst; catat throughput, latensi P50/P95/P99, error/timeout, penggunaan CPU/memori, ukuran index, query plan, lock duration, serta deadlock. Ulangi dengan satu dan beberapa tenant aktif agar beban satu tenant tidak mengaburkan isolasi.
5. Tetapkan SLO bersama tim backend sebelum menyatakan kapasitas lulus. Simpan hasil agregat dan query plan tanpa credential, data pribadi, atau payload santri.
6. Ulangi backup/restore setelah stress run dan rekonsiliasi jumlah record. Hapus klon/data sintetis setelah persetujuan tim.

Jika benchmark menemukan sequential scan atau lock panjang pada indeks migration, perbaiki source migration/akses query lalu ulangi pada klon. Jangan mengubah migration yang sudah tercatat di staging/Production; perbaikan dilakukan melalui migration baru setelah rehearsal dan persetujuan DBA.

## Gerbang berikutnya

1. Tim backend/DBA menyediakan backup terverifikasi dan klon disposable.
2. Rekonsiliasi lineage dua row ledger kosong serta schema/grant/RLS pada klon; preflight saat ini sengaja fail-closed.
3. Rehearsal seluruh 44 migration pending dan benchmark skala representatif.
4. Uji login Admin, matriks role/tenant, rekonsiliasi data, Storage, restore, serta VPS/on-premise.
5. Rotasi secret yang pernah dibagikan sebelum go-live.

Tidak ada perubahan migration, data, konfigurasi, atau flag pada Supabase staging/Production dalam checkpoint ini. PR #13 tetap Draft sampai bukti backend dan UAT tersedia.
