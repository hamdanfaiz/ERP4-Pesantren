# Checkpoint pengembangan dan uji kapasitas — 27 Oktober 2026

## Posisi PR

- Repository: `hamdanfaiz/ERP4-Pesantren`
- PR #13: [Supabase-only runtime cutover and customer-managed baseline](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)
- Branch: `codex/supabase-runtime-cutover-20261022`
- Head dokumen awal sebelum pembaruan uji skala: `7d6c09e814b54ed8c10918abfaacc3dba1c2f8e3`
- Head source terakhir yang diverifikasi: `592cf43dbbc3e3c79ff64714581fe942bc5facc0`; PR head saat pembacaan staging: `2d0ae92b72b54ed9fb191c30bbde93d5b4d16053`
- Status tetap **Open/Draft**, belum merge.
- Estimasi proyek tetap **73% kematangan fitur / 46% kesiapan go-live**. Angka ini estimasi, bukan hasil metrik otomatis.

## Bukti CI terbaru

Head kode terbaru yang diverifikasi: `592cf43dbbc3e3c79ff64714581fe942bc5facc0`. GitHub Actions [run 40433848989](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40433848989) selesai sukses pada kedua job:

- **Frontend build dan Firebase bundle guard:** typecheck, pemeriksaan runtime Supabase tanpa Firebase, feature flag, minimisasi PII, pagination, build produksi, Docker dan Compose.
- **Migrations, API auth, dan pgTAP:** Supabase lokal terisolasi, ledger preflight, role/tenant, transaksi NIS dan Tahfidz serentak, importer sintetis, Storage HTTP, backup/restore, dan uji pagination volume Tahfidz.

CI memakai data sintetis dan Supabase lokal. Hasilnya tidak membuktikan login/UAT pada endpoint pelanggan, kesetaraan migrasi dengan database staging, atau latensi/throughput pada infrastruktur produksi.

## Perbaikan integritas audiens pengumuman

Migration baru `20270120000000_communication_import_canonical_audience.sql` menyelaraskan validasi tanda baca impor dengan resolver penerima kanonis yang sudah dipakai saat pengumuman dikirim. Validasi tidak lagi memakai `profiles.linked_santri_class` yang dapat kosong atau usang; keanggotaan kelas Wali diperiksa melalui relasi tenant, akun Wali aktif, wali, santri, dan kelas. Kontrak aplikasi tetap Wali-only untuk konfirmasi baca; guru/santri tetap dapat menerima pengumuman, tetapi tidak dapat menulis tanda baca.

Uji pgTAP baru memuat 29 assertion untuk akses tabel/RPC, kelas benar dan snapshot usang, akun Wali tersuspensi, penerimaan tanda baca Wali, batas role, retry/idempotensi, dan penghitung baca. Fixture di-rollback. Semuanya lulus dalam run CI di atas. Migration belum diterapkan ke Supabase staging/Production.

## Penguatan migration preflight

Commit `7d6c09e` memperbaiki fixture preflight agar merepresentasikan baseline staging yang dibaca saja:

- 47 versi tercatat dari 92 migration source.
- 45 migration berikutnya berstatus pending.
- Versi `20261205000000` dan `20261206000000` tidak memiliki `name` maupun `statements`.
- Preflight harus berhenti: `canContinueToStagingReview = false`.

Fixture ini sepenuhnya sintetis dan tidak terhubung ke database remote. Pembandingan sebelumnya menemukan 45/45 array statement yang tersedia cocok dengan source setelah normalisasi aman. Postcondition dua versi kosong konsisten dengan objek utama yang diperiksa, tetapi tidak membuktikan seluruh efek historis; jangan mengubah ledger, menjalankan repair, atau menerapkan migration remote untuk melewati gate ini.

## Kondisi Supabase staging — baca-saja, 27 Oktober 2026

- Ledger memuat 47 migration sampai `20261206000000`; `20261205000000` dan `20261206000000` tidak memiliki `name` maupun `statements`. Dibanding 92 migration source, 45 migration masih belum tercatat. Tidak ada migration/data yang diterapkan.
- Katalog schema `public` menampilkan 119 tabel; 119/119 RLS aktif dan FORCE. Tidak ada grant SELECT/INSERT/UPDATE/DELETE untuk `anon`; tidak ada grant tulis langsung untuk `authenticated`. Lima tabel memberikan SELECT ke `authenticated` dan masing-masing memiliki satu policy: `candidate_documents`, `candidates`, `profiles`, `tenants`, `user_profiles`. Sebanyak 114 tabel tidak memiliki policy dan tetap tidak memberikan SELECT ke `authenticated`; ini sesuai pola akses server-mediated yang harus tetap diverifikasi bersama API. Ringkasan grant/RLS tidak membuktikan sendiri isi setiap policy, konfigurasi Data API, atau perilaku token.
- Tabel komunikasi ada dan RLS aktif. RPC `import_communication_announcements` ada, tetapi RPC `communication_announcement_recipient_user_ids(uuid,text)` belum ada di staging. Migration source `20270105000000_communication_guardian_audience.sql` dan perbaikan `20270120000000_communication_import_canonical_audience.sql` termasuk migration pending. Jangan aktifkan fitur komunikasi Supabase atau menerapkan migration sebelum rekonsiliasi ledger dan rehearsal backup selesai.
- Semua pemeriksaan di atas SELECT/katalog baca-saja melalui connector staging. Tidak ada DDL, perubahan data, atau pengubahan policy.

## Kapasitas pesantren besar — pekerjaan backend yang masih terbuka

CI sekarang menambahkan volume-smoke pgTAP dengan 10.000 santri sintetis untuk tenant yang sama. Fungsi Tahfidz mengembalikan 10.008 santri aktif (termasuk delapan fixture awal) melalui 101 halaman berukuran paling banyak 100; assertion memeriksa jumlah/keunikan, jumlah halaman, urutan ketat tanpa overlap, dan batas ukuran. Seluruh insert berada dalam transaksi test yang di-rollback.

Uji ini membuktikan kebenaran keyset pagination pada volume 10.000, bukan benchmark latensi/throughput atau bukti kapasitas produksi. Staging yang terbaca hanya mempunyai sekitar 50 santri sehingga belum mewakili tenant besar.

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
3. Rehearsal seluruh 45 migration pending dan benchmark skala representatif.
4. Uji login Admin, matriks role/tenant, rekonsiliasi data, Storage, restore, serta VPS/on-premise.
5. Rotasi secret yang pernah dibagikan sebelum go-live.

Tidak ada perubahan migration, data, konfigurasi, atau flag pada Supabase staging/Production dalam checkpoint ini. PR #13 tetap Draft sampai bukti backend dan UAT tersedia.
