# Audit paritas sumber PR #1–#11 dengan PR #13

Tanggal audit: 30 Oktober 2026  
Repository: `hamdanfaiz/ERP4-Pesantren`  
Checkpoint kode PR #13 yang diperiksa: `430929f15f36ba3b238c5809d6252d60c0055c41`
CI untuk checkpoint kode tersebut: run `41029985020`, lulus 2/2 job; Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch.

## Tujuan dan batas bukti

Audit ini membandingkan tujuan tiap PR lama dengan sumber kode, migration, dokumentasi, dan tes yang ditemukan pada PR #13. Status **Ada pengganti di source** hanya berarti ada implementasi kandidat dengan tujuan yang sama. Itu tidak membuktikan kesetaraan perilaku secara menyeluruh, bahwa migration sudah diterapkan pada Supabase target, atau bahwa alur berhasil pada akun nyata.

PR #1–#11 bercabang bertingkat dan divergen dari PR #13. Membandingkan jumlah commit atau nama berkas saja tidak membuktikan paritas. Keputusan merge/close harus mengikuti cakupan produk dan bukti di matriks ini.

## Matriks pengganti

| PR lama | Cakupan pada PR lama | Pengganti yang ditemukan di PR #13 | Status source | Syarat sebelum PR lama ditutup |
|---|---|---|---|---|
| #1 | Fondasi tenant, profil, kandidat PPDB, klaim identitas, RLS | Migration tenant/profil dan fondasi PPDB, termasuk `20261023000000_tenant_profile_foundation.sql`, `20261028000000_public_ppdb_runtime.sql`, serta tes `tenant_isolation.test.sql` dan `public_ppdb_runtime.test.sql` | Ada pengganti; migration/ledger target belum direkonsiliasi | Rehearsal lineage pada staging yang berwenang, dapat dipulihkan; review batas perubahan schema |
| #2 | Model komersial self-hosted dan kriteria go-live | `docs/active/00_PRODUCT/COMMERCIAL_READINESS.md`, `docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md`, serta dokumentasi install/migrasi | Ada pengganti dokumentasi | Review tim atas asumsi lisensi, dukungan, dan tanggung jawab Supabase per pelanggan |
| #3 | Provisioning pengguna tenant lewat Edge Function | Endpoint `/api/users*` di `server.ts`, helper `src/server/identityStore.ts`, dan `src/pages/UserManagementView.tsx`; menggunakan Supabase Auth/profil dari server, bukan Edge Function lama | Diganti dengan arsitektur server API; bukan parity implementasi 1:1 | Tinjau ulang batas Admin/SuperAdmin, recovery link, kompensasi bila pembuatan profil gagal, dan tes Auth pada environment terisolasi |
| #4 | Container aplikasi untuk VPS/on-premise | `Dockerfile`, `docker-compose.yml`, `/health/live`, `/health/ready`, dan `docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md` | Ada pengganti source; Supabase tetap layanan terpisah | Reproduksi clean install, upgrade, backup/restore dan pindah host pada environment Linux tim penerapan |
| #5 | Pendaftaran PPDB publik melalui backend Supabase | `src/server/supabasePublicPpdb.ts`, migration `20261028000000_public_ppdb_runtime.sql`, endpoint publik, validasi identitas, idempotensi, rate limit, dan Storage privat | Ada pengganti source dan tes sintetis | Pastikan konfigurasi target, Storage privat dan alur gagal parsial dalam staging; uji pendaftaran publik oleh tim penerapan |
| #6 | Roadmap migrasi Firebase ke Supabase | `docs/active/05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md`, inventaris migrasi, runbook preflight/rehearsal, dan panduan pelanggan | Ada pengganti dokumentasi; data dummy Firestore tidak perlu disalin sesuai keputusan pemilik produk | Review instruksi final terhadap ledger Supabase yang benar dan lingkungan pelanggan |
| #7 | PPDB Admin dan unggah dokumen | `src/server/supabasePpdb.ts`, `src/pages/SupabasePpdbManager.tsx`, API Admin, migration unggah/audit, dan bucket privat | Ada pengganti source dan tes Storage/API | Uji login, izin Admin/Wali, unggah/unduh dan audit pada Supabase staging |
| #8 | Master Data, onboarding santri, reservasi NIS, penempatan kamar | `src/server/supabaseOnboarding.ts`, `supabase/migrations/20261030000000_master_data_onboarding.sql`, `20261101000000_student_room_assignment.sql`, migration runtime Master Data serta tes onboarding/NIS | Ada pengganti source dan tes transaksi sintetis | Rehearsal schema; uji kapasitas kamar, NIS dan relasi santri/wali pada target terisolasi |
| #9 | Fondasi Finance tenant-scoped dan RPC transaksi | `src/server/supabaseFinance.ts`, `20261117000000_finance_runtime.sql`, Finance budget/ledger migrations dan tes transaksi | Ada pengganti source; catatan Finance historis tetap memerlukan pemetaan eksplisit | Rehearsal ledger, idempotensi pembayaran, pembukuan dan pemulihan pada staging |
| #10 | UI Finance, bukti pembayaran dan Storage | `src/pages/SupabaseFinanceManager.tsx`, `src/server/financeProofStorage.ts`, API bukti, bucket privat dan tes upload/download | Ada pengganti source dan tes sintetis | Uji hak akses, batas unggahan dan bukti pembayaran pada staging dengan akun sintetis |
| #11 | Master Data, Asrama, Tahfidz dan UI Supabase | Master Data/Onboarding, API dan UI Asrama, `src/server/supabaseTahfidz.ts`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseTahfidzSessions.tsx`, migration dan tes tiap alur | Alur inti punya pengganti; **capaian/badges kini dihitung dari catatan Supabase dengan cakupan roster tenant**; peer review belum memakai Supabase | Lengkapi atau keluarkan secara eksplisit peer review dari cakupan rilis; tutup gap unit/integrasi; verifikasi fitur pada matriks Tahfidz |

## Kontrol runtime Firebase yang sudah diverifikasi

Pada checkpoint kode PR #13 `430929f15f36ba3b238c5809d6252d60c0055c41`, GitHub Actions [run 41029985020](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41029985020) lulus 2/2 job. Job frontend membuktikan graph runtime tanpa paket Firebase, build, Docker/Compose, dan smoke test image; job database menjalankan Supabase lokal sintetis, rehearsal migrasi, pgTAP, API/tenant termasuk izin Analitik, transaksi bersamaan, Storage, serta backup/restore. Guard runtime Firebase termasuk dalam suite yang lulus. Kode import legacy masih tersimpan sebagai source nonaktif; tidak ada data Firestore yang perlu disalin. Tidak ada query maupun perubahan migration/data pada Supabase live dalam run ini.

## Gap yang tetap menghalangi kesiapan pengembangan

1. **Tahfidz belum paritas penuh.** Tab `badges` kini menampilkan enam capaian progres yang dihitung dari data tersimpan Supabase dengan tes role/tenant/paginasi. Tab `peer-review` tetap placeholder saat runtime Supabase aktif; fitur itu belum boleh dilaporkan selesai.
2. **Analitik Operasional kini memakai snapshot Supabase dan izin modul `intelligence` yang terpisah.** Indikatornya berupa aturan transparan atas antrian PPDB, verifikasi/tagihan, dan arus kas; tidak ada klaim prediksi AI. Model AI prediktif dikeluarkan dari cakupan rilis awal sampai ada data dan validasi yang memadai. PPOB/Layanan masih fail-closed dan memerlukan keputusan cakupan serta integrasi provider yang nyata.
3. **Audit integrasi antar-modul belum menyeluruh.** Perlu bukti relasi ID, tenant, unit, status, transaksi/retry, audit dan kegagalan parsial pada alur lintas modul.
4. **Ledger proyek Supabase target `ptsasgdvgrbdtgyqieie` tidak dapat dibaca oleh konektor pada sesi ini.** Tidak ada migration live yang diterapkan. Tim perlu memberi akses baca terbatas atau memberikan ekspor ledger yang sudah disanitasi agar urutan dapat direkonsiliasi dan rehearsal dilakukan.
5. **Pengujian database lokal sintetis bukan pengganti staging/UAT.** Deployment hosting dan UAT tetap dilakukan tim penerapan; sebelum itu source, konfigurasi dan migration perlu direview terhadap environment tujuan.

## Keputusan PR

- PR #13 tetap Open/Draft sampai gap pengembangan di atas ditutup atau ada keputusan rilis yang eksplisit serta terdokumentasi.
- Jangan merge PR #1–#11 ke `main` satu per satu: PR tersebut adalah jalur historis bertingkat, sebagian memakai desain runtime lama, dan sebagian implementasinya sudah diganti pada PR #13.
- Setelah PR #13 disetujui dan benar-benar masuk ke `main`, audit ulang setiap baris tabel terhadap source hasil merge. Tutup PR lama yang seluruh cakupannya terbukti sudah digantikan dengan alasan **superseded**. Jangan menandainya Merged bila tidak pernah digabung.
- PR #12 sudah Merged. Pada pemeriksaan ini PR #1–#11 dan #13 masih Open/Draft; tidak ada perubahan status yang dilakukan oleh audit ini.

## Verifikasi yang tersedia

- GitHub Actions PR #13 [run 41029985020](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41029985020) lulus **2/2 job** pada checkpoint kode `430929f15f36ba3b238c5809d6252d60c0055c41`.
- Job mencakup typecheck/build, pemeriksaan runtime Supabase tanpa Firebase, Docker/Compose dan smoke test image, rehearsal migrasi sintetis, pgTAP, API/isolasi tenant, transaksi serentak, Storage, serta backup/restore.
- Pemeriksaan memakai Supabase lokal dan data sintetis. Supabase Preview tidak berjalan karena branch preview tidak terhubung. Tidak ada migration/data yang diterapkan ke Supabase live, login pelanggan, deployment, atau UAT yang diklaim.
- Tidak ada review submission atau inline review thread pada PR #13 saat diperiksa.
- `mergeable: true` hanya berarti GitHub tidak menemukan konflik merge; bukan persetujuan atau bukti kelengkapan fitur.

