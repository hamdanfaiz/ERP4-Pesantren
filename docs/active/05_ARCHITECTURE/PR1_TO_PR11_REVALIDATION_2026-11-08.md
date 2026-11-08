# Revalidasi Paritas PR #1–#11

Tanggal pemeriksaan: 8 November 2026  
Repository: `hamdanfaiz/ERP4-Pesantren`  
Baseline saat pemetaan fitur: `38f556e38bcb19c9dde6773da708bde24a8f6fd4`; setelah PR #70 merged, `main` memuat commit `b1a5d0211c4748eee4389cce4b8e92ace4534969`

## Kesimpulan

PR #1–#11 semuanya berstatus **Closed / Not merged** pada pemeriksaan GitHub. Kesebelas PR juga tidak memiliki submission review maupun inline review thread. Karena itu, penutupan PR lama tidak berarti perubahan branch-nya pernah masuk ke `main`.

Cakupan produk utama PR #1–#11 memiliki padanan pada source penerus di `main`, terutama baseline cutover [PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13) yang merged, dan perubahan lanjutannya. Tidak ditemukan fitur produk utama yang hanya tersedia di branch lama. Ini adalah audit paritas cakupan, bukan klaim bahwa setiap perilaku sama persis atau seluruh UI telah UAT.

**Jangan merge branch #1–#11 satu per satu.** Branch tersebut bertingkat dan memakai baseline/migrasi lama; source penerus mengganti beberapa jalur dengan API server, migrasi forward-only, dan Supabase Auth. Penggabungan ulang berisiko membawa arsitektur transisi atau migration lineage lama.

## Hasil per PR

| PR | Ruang lingkup awal | Padanan pada source penerus | Status bukti dan catatan |
|---|---|---|---|
| [#1](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/1) | Fondasi tenant/profil, kandidat PPDB, keunikan identitas, RLS | Skema tenant/profil, identitas, PPDB publik dan Admin | Padanan schema/API dan tes tenant/PPDB ada. Nama migrasi lama tidak boleh diterapkan ulang. |
| [#2](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/2) | Model komersial customer-managed/self-hosted | Dokumen kesiapan komersial, arsitektur, deployment customer-managed | Padanan dokumentasi ada. Clean install, upgrade, restore, dan perpindahan host tetap harus diuji tim deployment pada target mereka. |
| [#3](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/3) | Provisioning akun dan permission tenant melalui Edge Function | API server dan UI manajemen pengguna dengan Supabase Auth/profil | Arsitektur berubah, tidak dipertahankan 1:1. Audit menemukan risiko batas grant Admin; perbaikannya masuk PR #43 dan dicatat lulus CI. Auth UAT nyata tetap terpisah. |
| [#4](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/4) | Container aplikasi untuk VPS/on-premise | Dockerfile, Compose, konfigurasi runtime, health checks, panduan customer-managed | Build/smoke CI tersedia. Supabase adalah layanan terpisah dan environment pelanggan belum seluruhnya disimulasikan. |
| [#5](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/5) | Pendaftaran PPDB publik melalui Supabase | API publik, validasi identitas, transaksi/idempotensi, rate limit, Storage privat | Source/tes tersedia; alur HTTP PPDB dan berkas juga diuji dengan fixture sintetis di VQE staging dan CI PR #68. Belum UAT browser produksi. |
| [#6](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/6) | Roadmap penuh Firebase ke Supabase | Dokumen cutover, inventaris runtime/migration, runbook | Tujuan dokumentasi dipertahankan dalam versi yang lebih baru; ini bukan bukti database Production sudah cutover. |
| [#7](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/7) | Workflow PPDB Admin dan dokumen kandidat | UI/API PPDB Admin, workflow kandidat, CSV, dokumen privat | Tes workflow API/Storage sintetis tersedia; konfigurasi/Auth dan UAT antarmuka target tetap harus dijalankan. |
| [#8](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/8) | Data induk, onboarding, NIS, relasi kamar | API dan transaksi onboarding santri/wali, reservasi NIS, struktur/asrama | Transaksi, relasi, konkurensi, dan onboarding diuji pada CI/staging sintetis. Data dummy Firestore tidak disalin sesuai keputusan pemilik; transfer manual menggunakan template tetap tersedia. |
| [#9](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/9) | Fondasi Finance tenant-scoped | API/skema tagihan, ledger, pengeluaran, kontrol buku | Tes database/API tersedia. Rekonsiliasi akuntansi dengan data operasional pelanggan belum termasuk bukti CI. |
| [#10](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/10) | Alur pembayaran PPDB dan bukti pembayaran | Alur Finance/PPDB dan Storage privat | Tes sintetis upload/download dan isolasi tersedia. Wali baru dapat mengirim bukti setelah akun terhubung dengan santri aktif; Admin dapat mencatat pembayaran manual sebelum onboarding. Payment gateway/PPOB dikeluarkan dari rilis awal. |
| [#11](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/11) | Master Data, Asrama, Tahfidz, dan bridge identitas | API/UI Supabase untuk data induk, asrama, Tahfidz dan autentikasi Supabase | Alur inti punya padanan source/test. Bridge identitas Firebase sengaja tidak dibawa. Peer review Tahfidz untuk rilis awal dibatasi ke teks, halaqah yang sama, dan moderasi Ustadz; audio serta akses Wali tidak termasuk. UAT UI lintas role tetap terbuka. |

## Status PR penerus yang memengaruhi audit ini

- PR #13 berstatus merged dan menjadi baseline cutover Supabase/customer-managed.
- PR #68 (koreksi PPDB/onboarding dan bukti pengujiannya) serta PR #69 (tes round-trip CBT) tercatat merged pada pemeriksaan.
- PR #70 kemudian ditandai siap dan merged ke `main` pada commit `b1a5d0211c4748eee4389cce4b8e92ace4534969`; tiga job CI wajib lulus pada head PR, sedangkan Supabase Preview dilewati. Perubahan LMS tersebut tidak mengubah status historis PR #1–#11.
- PR lama #1–#11 tetap closed dan tidak merged. Tidak ada alasan untuk membuka kembali atau menggabungkan branch lamanya hanya demi mengubah label status.

## Yang dibuktikan dan yang belum

Bukti source dan CI/staging menunjukkan bahwa fungsi utama yang menjadi cakupan PR lama memiliki implementasi penerus dan pengujian terpilih, termasuk tenant/RLS, PPDB, onboarding/NIS/asrama, Finance/Storage, dan sebagian besar alur Tahfidz. Detail cakupan per modul ada di [Matriks Cakupan Pengujian Modul](./MODULE_TEST_COVERAGE_2026-11-07.md).

Audit ini **tidak** membuktikan:

1. UAT browser untuk setiap menu, form, tombol, dan kombinasi role pada hosting pelanggan.
2. DDL aktual dan urutan semua migration pada PTSAS Production telah cocok dengan source.
3. Backup Production dapat dipulihkan; restore smoke CI memakai database lokal sintetis.
4. Instalasi, upgrade, backup/restore, dan pindah host berhasil di setiap distro VPS/on-premise yang akan didukung.
5. Semua operasi tulis seluruh modul telah diuji end-to-end.

Tim backend/deployment masih perlu menyelesaikan pemeriksaan Production dan UAT host mereka sebelum go-live. Tidak ada database Production yang dibaca atau diubah dalam revalidasi PR ini.

## Catatan dokumentasi

Dokumen historis [PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md](./PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md) menyimpan beberapa snapshot lama secara berurutan. Bagian teratasnya menyebut baseline `main` yang lebih lama dan menyatakan PR #68 masih Draft, padahal PR #68 telah merged. Gunakan dokumen revalidasi ini sebagai snapshot status PR per baseline di atas; bagian historis di dokumen lama tetap berguna untuk konteks dan catatan sebelumnya.
