# Audit penutupan dan penggabungan PR — 30 Oktober 2026

## Keputusan saat audit

PR #13 masih **Open / Draft** dan belum memenuhi syarat untuk digabung. PR #1–#11 juga masih **Open / Draft**; PR #12 sudah **Merged**. Tidak ada PR yang saya tutup pada audit ini. Menutup PR hanya mengubah status; perubahan baru masuk ke main setelah merge.

Jalur kerja saat ini adalah PR #13, head ecccee36359d79ea748e7fbaa461672518de227d. GitHub Actions [run 40999619996](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40999619996) lulus 2/2 job: 53 berkas pgTAP dengan 1.195 assertion, typecheck/build, pemeriksaan API/tenant, alur serentak, Storage, backup/restore sintetis, Docker/Compose, dan smoke test image. CI hijau memverifikasi commit tersebut; CI tidak menyatakan semua cakupan produk selesai.

## Status PR yang diperiksa di GitHub

| PR | Status | Base | Head | Catatan |
|---|---|---|---|---|
| #1 | Open / Draft | main | backend/supabase-tenant-foundation (736ec92) | Fondasi tenant; perlu cek kontrak dokumen yang unik. |
| #2 | Open / Draft | main | product/commercial-readiness (98e98a4) | Dokumen produk/distribusi; konten harus dibandingkan dengan kontrak self-hosted terbaru. |
| #3 | Open / Draft | #1 | backend/tenant-user-provisioning (515def6) | Stack provisioning lama; jangan menggabungkan Edge Function dan migration lama tanpa perbandingan. |
| #4 | Open / Draft | main | deployment/self-hosted-app-container (b4cd1b8) | Container lama mensyaratkan Firebase; PR #13 memakai Supabase. |
| #5 | Open / Draft | #1 | backend/supabase-public-ppdb-runtime (57b5ec7) | Stack PPDB publik lama. |
| #6 | Open / Draft | main | docs/supabase-complete-migration-roadmap (3732db4) | Roadmap migrasi lama; keputusan terbaru tidak menyalin data dummy. |
| #7 | Open / Draft | #5 | backend/supabase-ppdb-admin-runtime (0b8bc4e) | Stack PPDB Admin lama. |
| #8 | Open / Draft | #7 | backend/supabase-masterdata-onboarding (a9fc880) | Stack onboarding lama. |
| #9 | Open / Draft | #8 | backend/supabase-finance-foundation (c27bace) | Stack Finance lama. |
| #10 | Open / Draft | #9 | backend/supabase-finance-ui (127c67e) | UI Finance/PPDB lama. |
| #11 | Open / Draft | #10 | backend/supabase-masterdata-structures-ui (88f2686) | Master Data, asrama, dan Tahfidz; matriks perilaku ada pada dokumen paritas #11 → #13. |
| #12 | Closed / Merged | — | — | Sudah menjadi bagian main. |
| #13 | Open / Draft | main pasca-#12 | codex/supabase-runtime-cutover-20261022 (ecccee3) | Kandidat jalur cutover, belum siap merge. |

## Hasil perbandingan awal #1–#11 terhadap #13

Perbandingan GitHub menemukan 430 berkas berubah pada PR #13. Daftar berkas yang sama atau berbeda hanya menunjukkan lokasi perubahan, bukan bukti bahwa alur bisnis setara. Ringkasan di bawah menandai tempat verifikasi yang diperlukan sebelum PR lama boleh ditutup.

| PR | Perubahan lama yang diperiksa | Padanan atau catatan pada PR #13 | Tindakan sebelum penutupan |
|---|---|---|---|
| #1 | Tenant/profile foundation dan kontrak tenant | Migration foundation dengan nomor 20261023000000 ada pada jalur #13; dokumen SUPABASE_TENANT_FOUNDATION.md berpath unik. | Bandingkan aturan tenant/profil dalam dokumen lama dengan ERD, migration, RLS, dan runbook terkini; port kontrak yang masih diperlukan. |
| #2 | Commercial readiness, distribusi self-hosted, dan ERD Firestore | #13 memiliki COMMERCIAL_READINESS.md, CUSTOMER_MANAGED_DEPLOYMENT.md, SUPABASE_ERD.md, dan FIRESTORE_STRUCTURE.md. Dokumen distribusi lama ditulis sebelum cutover dan menyebut runtime Firebase. | Pastikan keputusan lisensi, dukungan, profil VPS/on-premise, batas layanan, dan ERD legacy yang masih relevan tercakup; pertahankan dokumen lama hanya bila menambah kontrak yang belum ada. |
| #3 | Supabase Edge Functions untuk provisioning dan kata sandi sementara | #13 menyediakan pengelolaan pengguna di server Supabase, undangan Admin pertama, dan jalur perubahan kata sandi awal. Path Edge Function/migration lama tidak dipakai oleh runtime aktif. | Cocokkan role hierarchy, permission, kompensasi bila Auth berhasil tetapi profil gagal, dan alur recovery. Jangan bawa implementasi password lama tanpa uji keamanan. |
| #4 | Docker Compose dan environment yang mewajibkan Firebase | #13 menyediakan Dockerfile, docker-compose.yml, konfigurasi runtime Supabase, health check, container tanpa hak istimewa, dan smoke test. Berkas contoh lama memuat Firebase credentials. | Kontrak konfigurasi Supabase dan penguatan container baru menjadi sumber acuan. Ambil hanya petunjuk operasi unik yang tetap relevan; jangan salin konfigurasi Firebase. |
| #5 | Registrasi PPDB publik pada stack dan migration lama | #13 memiliki formulir publik, endpoint server, migration runtime PPDB dan uji idempotensi/validasi dokumen. Migration lama mempunyai versi/path berbeda. | Verifikasi validasi identitas, pembatasan ukuran berkas, transaksi NIS, limit penyalahgunaan, dan penyimpanan privat dari tes #13; jangan gabungkan migration lama langsung. |
| #6 | Rencana migrasi penuh Firebase → Supabase | #13 memiliki inventaris, runbook preflight, ERD, dan keputusan pemilik bahwa data dummy Firestore tidak perlu disalin. | Pastikan keputusan tanpa salin data dan urutan persiapan database tersampaikan. Instruksi impor data lama bukan release gate. |
| #7 | Kandidat dan workflow PPDB Admin | #13 memiliki workflow kandidat Admin, API server, import CSV terpratinjau, dokumen privat, dan cakupan pgTAP/API terkait. Sebagian path implementasi lama tidak digunakan. | Cocokkan pembuatan/perubahan kandidat, pencarian, permission, audit dokumen, dan pembayaran terkait dengan matriks uji terkini. |
| #8 | Master Data serta onboarding PPDB atomik | #13 memiliki onboarding dan relasi kandidat–santri–wali–NIS pada migration/API Supabase yang lebih baru. | Pastikan kegagalan parsial, retry idempoten, kelayakan kamar, dan relasi lintas tenant tetap ditutup oleh uji #13. |
| #9 | Finance tenant runtime | #13 memiliki runtime Finance dan transaksi ledger pada path/migration baru; cakupan unit bertahap dan pemetaan eksplisit data lama baru ditambahkan pada head terbaru. | Verifikasi tagihan/pembayaran, bukti Storage, ledger, dan Finance unit-scope pada pgTAP serta HTTP checks; pertahankan hanya perilaku unik yang belum terwakili. |
| #10 | Form PPDB–Finance, peninjauan pembayaran, dan bukti transfer | #13 memiliki alur tagihan PPDB yang terhubung dengan Finance dan endpoint bukti pembayaran privat. | Cocokkan status pembayaran, penolakan, retry, dan hubungan kandidat/santri; tidak perlu menggabungkan UI/migration lama secara utuh. |
| #11 | Master Data, kamar/asrama, Tahfidz dan membership | Matriks PR #11 → #13 mencatat padanan runtime dan tes untuk alur inti; beberapa fitur Tahfidz lanjutan serta cakupan multi-unit tetap terbuka. | Selesaikan gap eksplisit pada matriks dan jangan menggabungkan branch bertingkat lama secara utuh. |

## Syarat penggabungan

1. Selesaikan pekerjaan pengembangan yang masih dicatat pada deskripsi PR #13: cakupan unit lintas modul/data lama, keputusan fitur yang masih fail-closed, audit integrasi, perapian kode legacy, serta dokumentasi operasi yang konsisten.
2. Lengkapi pemeriksaan fitur unik PR #1–#10. Tutup hanya setelah perubahan yang diperlukan masuk ke jalur #13 atau terbukti tidak lagi menjadi kontrak produk.
3. Revalidasi ledger Supabase staging dan lakukan rehearsal pada environment yang bisa dipulihkan. Konektor saat audit ini mengembalikan INVALID_ARGUMENT; data/migration live tidak diubah.
4. Jalankan CI kembali pada head final yang akan digabung dan tinjau hasilnya. Deployment hosting dan UAT tetap menjadi pekerjaan tim penerapan.
5. Setelah kriteria pengembangan terpenuhi, tandai PR #13 siap ditinjau dan gabungkan ke main. Sesudah merge, tutup PR lama yang telah terbukti superseded dengan tautan ke PR pengganti. Jangan menandai PR lama sebagai merged jika GitHub tidak menggabungkannya.

**Status audit:** PR #13 dapat ditinjau tim backend sebagai draft dengan CI hijau; belum merupakan kandidat deploy/merge. Tidak ada perubahan status PR, migrasi Supabase live, ataupun penulisan data pada audit ini.
