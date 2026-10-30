# Audit paritas sumber PR #1–#11 dengan PR #13

Tanggal audit: 30 Oktober 2026  
Repository: `hamdanfaiz/ERP4-Pesantren`  
Checkpoint audit paritas awal: `430929f15f36ba3b238c5809d6252d60c0055c41`. **Status setelah integrasi source — 30 Oktober 2026:** PR #13 head `e449c234c253eb7a65795af18c5794fa45e6e9cb` merged ke `main` pada `cea0ed481950c4e40a1035ff9d971cf3a43929bc`; GitHub Actions [run 41051400486](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41051400486) lulus 2/2 job. PR #1–#11 ditutup sebagai superseded dan tidak merged. CI menguji pengecualian permission PPOB, typecheck/build, guard runtime, rehearsal migration sintetis, pgTAP, API/tenant, transaksi serentak, Storage, serta backup/restore. Tidak ada migration live yang diterapkan.

## Tujuan dan batas bukti

Audit ini membandingkan tujuan tiap PR lama dengan sumber kode, migration, dokumentasi, dan tes yang ditemukan pada PR #13. Status **Ada pengganti di source** hanya berarti ada implementasi kandidat dengan tujuan yang sama. Itu tidak membuktikan kesetaraan perilaku secara menyeluruh, bahwa migration sudah diterapkan pada Supabase target, atau bahwa alur berhasil pada akun nyata.

PR #1–#11 bercabang bertingkat dan divergen dari PR #13. Membandingkan jumlah commit atau nama berkas saja tidak membuktikan paritas. Keputusan merge/close harus mengikuti cakupan produk dan bukti di matriks ini.

## Matriks pengganti

| PR lama | Cakupan pada PR lama | Pengganti yang ditemukan di PR #13 | Status source | Verifikasi lanjutan oleh tim penerapan |
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
| #11 | Master Data, Asrama, Tahfidz dan UI Supabase | Master Data/Onboarding, API dan UI Asrama, `src/server/supabaseTahfidz.ts`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseTahfidzSessions.tsx`, `src/components/SupabaseTahfidzPeerReview.tsx`, migration dan tes tiap alur | Alur inti dan capaian/badges memakai Supabase; peer review teks pada halaqah aktif memakai backend dan moderasi Ustadz, 33 pgTAP checks lulus di CI. Audio dan akses Wali tidak termasuk cakupan yang dipilih | Audit perilaku modul lain dan periksa matriks Tahfidz; uji login/role tenant pada environment UAT oleh tim penerapan |

## Kontrol runtime Firebase yang sudah diverifikasi

Pada checkpoint kode PR #13 `430929f15f36ba3b238c5809d6252d60c0055c41`, GitHub Actions [run 41029985020](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41029985020) lulus 2/2 job. Job frontend membuktikan graph runtime tanpa paket Firebase, build, Docker/Compose, dan smoke test image; job database menjalankan Supabase lokal sintetis, rehearsal migrasi, pgTAP, API/tenant termasuk izin Analitik, transaksi bersamaan, Storage, serta backup/restore. Guard runtime Firebase termasuk dalam suite yang lulus. Kode import legacy masih tersimpan sebagai source nonaktif; tidak ada data Firestore yang perlu disalin. Tidak ada query maupun perubahan migration/data pada Supabase live dalam run ini.

## Batas produk dan rilis yang masih tersisa

1. **Tahfidz memiliki padanan backend untuk cakupan rilis yang dipilih.** Tab `badges` menghitung enam capaian progres dari data Supabase dengan tes role/tenant/paginasi. Peer Review memakai teks, dibatasi pada halaqah aktif, dan menunggu moderasi Ustadz; 33 tes pgTAP lulus. Audio dan akses Wali sengaja tidak termasuk dalam cakupan ini. UAT login/role tetap belum dilakukan.
2. **Analitik Operasional kini memakai snapshot Supabase dan izin modul `intelligence` yang terpisah.** Indikatornya berupa aturan transparan atas antrian PPDB, verifikasi/tagihan, dan arus kas; tidak ada klaim prediksi AI. Model AI prediktif dikeluarkan dari cakupan rilis awal sampai ada data dan validasi yang memadai. Pemilik produk mengeluarkan modul PPOB/payment gateway dari rilis awal; menu dan pengaturan provider dihapus, dan permission lama ditolak oleh RBAC. Integrasi provider menjadi pekerjaan fase lanjutan.
3. **Bukti pembayaran mandiri Wali sebelum onboarding belum tersedia.** Admin dapat mencatat pelunasan tagihan kandidat secara manual; Wali baru dapat mengunggah bukti setelah relasi akun–santri aktif. Jika dibutuhkan, tambahkan pada roadmap berikutnya.
4. **Ledger proyek Supabase target `ptsasgdvgrbdtgyqieie` tidak dapat dibaca oleh konektor pada sesi ini.** Tidak ada migration live yang diterapkan. Tim perlu merekonsiliasi ledger dan melakukan rehearsal pada environment staging yang dapat dipulihkan sebelum cutover.
5. **Pengujian database lokal sintetis bukan pengganti staging/UAT.** Deployment hosting dan UAT tetap dilakukan tim penerapan; sebelum itu source, konfigurasi dan migration perlu direview terhadap environment tujuan.

## Keputusan PR

- PR #13 sudah merged sebagai baseline source yang teruji. Gap rilis yang masih tersisa telah didokumentasikan dan PPOB/provider tetap nonaktif.
- Jangan merge PR #1–#11 ke `main` satu per satu: PR tersebut adalah jalur historis bertingkat, sebagian memakai desain runtime lama, dan sebagian implementasinya sudah diganti pada PR #13.
- Setelah PR #13 benar-benar masuk ke `main`, verifikasi commit merge lalu tutup PR lama #1–#11 sebagai **superseded**. Jangan menandainya Merged bila tidak pernah digabung.
- PR #12 dan #13 sudah Merged. PR #1–#11 ditutup sebagai superseded, tanpa mengklaim branch tersebut merged.

## Verifikasi yang tersedia

### Revalidasi 30 Oktober 2026 — Peer Review Tahfidz

- Head PR #13 `04ab209f5fbd716fd8f78047eaac8d259be64934`; GitHub Actions [run 41047481907](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41047481907) lulus **2/2 job**.
- Tes pgTAP memverifikasi izin tabel/RPC, isolasi tenant, halaqah dan rentang tanggal keanggotaan, pengiriman idempoten, penolakan penilaian sendiri/lintas halaqah, serta moderasi final oleh Ustadz pengampu. Build, Docker/Compose, API tenant, Storage dan backup/restore juga lulus.
- Source PR #1–#11 sudah dipetakan ke implementasi pengganti PR #13 untuk tinjauan integrasi; CI terbaru lulus 2/2 job. PPOB/payment gateway telah diputuskan untuk dikeluarkan dari rilis awal. Rekonsiliasi ledger Supabase target tetap tugas sebelum deployment migration; tidak ada perubahan pada Supabase live.

- Run GitHub Actions 41041688664 pada head `0cf670ba9097b7002322173adb92568f9ed8a054` adalah hasil historis. Untuk head terkini, lihat revalidasi pada run 41047481907 di atas.
- Job mencakup typecheck/build, pemeriksaan runtime Supabase tanpa Firebase, Docker/Compose dan smoke test image, rehearsal migrasi sintetis, pgTAP, API/isolasi tenant, transaksi serentak, Storage, serta backup/restore.
- Pemeriksaan memakai Supabase lokal dan data sintetis. Supabase Preview tidak berjalan karena branch preview tidak terhubung. Tidak ada migration/data yang diterapkan ke Supabase live, login pelanggan, deployment, atau UAT yang diklaim.
- Tidak ada review submission atau inline review thread pada PR #13 saat diperiksa.
- `mergeable: true` hanya berarti GitHub tidak menemukan konflik merge; bukan persetujuan atau bukti kelengkapan fitur.

