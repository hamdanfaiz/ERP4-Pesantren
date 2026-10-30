# Audit penutupan dan penggabungan PR — 30 Oktober 2026

## Keputusan saat audit

PR #13 masih **Open / Draft** dan belum memenuhi syarat untuk digabung. PR #1–#11 juga masih **Open / Draft**; PR #12 sudah **Merged**. Tidak ada PR yang ditutup atau digabung selama checkpoint ini. Menutup PR hanya mengubah status; perubahan baru masuk ke `main` setelah merge.

Pemeriksaan GitHub pada 30 Oktober 2026 mengonfirmasi PR #1–#11 masih Open/Draft, #12 Closed/Merged, dan #13 Open/Draft. Commit kode PR #13 yang diperiksa adalah `15deecd9d16668b11109643ff6d65bfa642a2658`; GitHub Actions [run 41017481319](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41017481319) lulus **2/2 job**. Pembaruan dokumentasi checkpoint kemudian diperiksa pada head `06ad8d1e9c5ccc6889541147ff3b04b93f3fd060` dan lulus **2/2 job** pada [run 41017953175](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41017953175). Pemeriksaan mencakup typecheck/build, guard runtime, Docker/Compose, rehearsal migrasi sintetis, 1.268 assertion pgTAP, API/tenant, alur serentak, Storage, dan backup/restore. Uji database memakai Supabase lokal sintetis dan tidak membuktikan ledger staging/production atau perilaku dengan akun pelanggan nyata. Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch. CI hijau bukan bukti seluruh kelengkapan produk, migrasi live, deployment, atau UAT.

Perubahan tambahan pada head ini menghitung progres enam capaian Tahfidz dari catatan persisten, dengan paginasi roster dan cakupan role/tenant yang sama dengan halaman roster. Endpoint hanya dipanggil oleh sesi terautentikasi; RPC hanya dapat dieksekusi `service_role`, dan respons tidak memuat NIS. Tes mencakup Admin, Ustadz, Santri, Wali, tenant lain, cursor, izin, ukuran halaman, serta hitungan berbasis tanggal lokal tenant. Fitur ini menghitung progres dari data; Peer Review Tahfidz masih belum termasuk dan tetap tertutup.

Perubahan Asrama pada head ini membatasi Ustadz ke unit/lokasi penugasan dan santri operasional yang sesuai. Admin mendapat UI pemetaan historis Gedung/Kamar melalui transaksi tenant-scoped dan idempoten. Data belum dipetakan tetap Admin-only; pemetaan tenant nyata dan pengujian login/role oleh tim penerapan masih diperlukan. Estimasi pengembangan tetap sekitar **73%**.

## Kendala pemeriksaan database staging

Konektor Supabase hanya menampilkan project `vqemuyzveuirlkvdggjd`; pembacaan migrasi dan tabel untuk staging `ptsasgdvgrbdtgyqieie` ditolak karena izin. Langkah teknis baca-saja bagi tim backend tercatat di [checkpoint akses staging](docs/active/06_DATABASE/CHECKPOINT_SUPABASE_STAGING_ACCESS_2026-10-30.md). Tidak ada migrasi atau data yang ditulis ke Supabase. Pemeriksaan ledger staging tetap menjadi gerbang sebelum rehearsal.

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
| #13 | Open / Draft | main pasca-#12 | codex/supabase-runtime-cutover-20261022 (`0d2e6ac`) | Audit source-level PR lama ditambahkan dan CI 2/2 job lulus; perilaku fitur, beberapa gap produk, dan verifikasi ledger tetap terbuka, belum siap merge. |

## Hasil perbandingan awal #1–#11 terhadap #13

### Koreksi cakupan Finance

Migration `20270130000000_master_data_unit_assignment.sql` memberi `finance_bills.organization_unit_id`, mewariskan unit dari kandidat/santri terkait, serta menjaga konsistensi saat pengaitan. Karena itu, **kontrak unit pada tagihan baru sudah ada**. UI Admin sekarang dapat memfilter daftar tagihan, pengeluaran, buku besar, kartu total, dan ekspor CSV per unit, serta menampilkan unit lama yang tidak aktif dan record belum dipetakan. Tes filter baru dan seluruh workflow CI lulus pada head PR #13 `2b93f96`. Pemetaan historis tetap perlu dikerjakan. Akademik, asrama, dan domain operasional lainnya tetap perlu audit unit tersendiri.

Perubahan di atas diuji pada head tersebut melalui CI lokal sintetis; ini bukan UAT atau verifikasi staging. Tidak ada alasan untuk menutup PR lama sebelum perubahan utama digabung ke `main`.

Metadata GitHub saat ini melaporkan 443 berkas berubah pada PR #13. Endpoint perbandingan GitHub mengembalikan paling banyak 300 path; daftar berkas maupun jumlah commit hanya menunjukkan lokasi/riwayat perubahan, bukan bukti bahwa alur bisnis setara. Audit sumber per PR yang lebih terstruktur ada di [PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md](docs/active/05_ARCHITECTURE/PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md). Ringkasan di bawah menandai tempat verifikasi yang diperlukan sebelum PR lama boleh ditutup.

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
| #11 | Master Data, kamar/asrama, Tahfidz dan membership | Alur inti memiliki padanan source; tab Peer Review dan Badges Tahfidz belum memakai Supabase, dan cakupan multi-unit/integrasi belum tuntas. Rincian bukti ada di audit paritas. | Lengkapi gap fitur/isolasi dan jangan menggabungkan branch bertingkat lama secara utuh. |

## Syarat penggabungan

1. Selesaikan pekerjaan pengembangan yang masih dicatat pada deskripsi PR #13: cakupan unit lintas modul/data lama, keputusan fitur yang masih fail-closed, audit integrasi, perapian kode legacy, serta dokumentasi operasi yang konsisten.
2. Audit source-level PR #1–#11 sudah dipetakan, tetapi kesetaraan perilaku belum seluruhnya terbukti. Selesaikan pemeriksaan fitur unik dan tutup hanya setelah perubahan yang diperlukan masuk ke jalur #13 atau terbukti tidak lagi menjadi kontrak produk.
3. Revalidasi ledger Supabase staging dan lakukan rehearsal pada environment yang bisa dipulihkan. Konektor saat audit ini mengembalikan INVALID_ARGUMENT; data/migration live tidak diubah.
4. Jalankan CI kembali pada head final yang akan digabung dan tinjau hasilnya. Deployment hosting dan UAT tetap menjadi pekerjaan tim penerapan.
5. Setelah kriteria pengembangan terpenuhi, tandai PR #13 siap ditinjau dan gabungkan ke main. Sesudah merge, tutup PR lama yang telah terbukti superseded dengan tautan ke PR pengganti. Jangan menandai PR lama sebagai merged jika GitHub tidak menggabungkannya.

**Status audit:** PR #13 dapat ditinjau tim backend sebagai draft dengan CI hijau; belum merupakan kandidat deploy/merge. Tidak ada perubahan status PR, migrasi Supabase live, ataupun penulisan data pada audit ini.


## Revalidasi langsung — 30 Oktober 2026, 11:34 WIB

- Status GitHub terverifikasi ulang: PR #1–#11 **Open / Draft**, PR #12 **Closed / Merged**, PR #13 **Open / Draft**. Tidak ada status PR yang diubah.
- Head PR #13: `82936497f12ff27e33964c3f25a73460f951b959`. GitHub Actions [run 41002893214](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41002893214) lulus **2/2 job** pada head ini: build/typecheck, guard runtime Firebase, Docker/Compose dan smoke test image, serta migration rehearsal, pgTAP, auth/tenant, Storage dan backup/restore lokal sintetis.
- Perubahan setelah head kode `2b93f96da3571a828fd63e70d0fe765ebaa154f8` hanya dokumentasi; tidak ada migration atau data yang diterapkan ke Supabase live. Supabase Preview tidak berjalan karena branch tidak terhubung ke Supabase Branch, dan pembacaan proyek staging `ptsasgdvgrbdtgyqieie` tetap ditolak konektor.
- **Keputusan:** PR #13 belum siap ditandai siap review/merge. Multi-unit Akademik/Asrama, analitik AI dan PPOB/Layanan yang fail-closed, audit integrasi penuh, audit sisa source legacy, paritas fitur #1–#11 dan rekonsiliasi ledger staging masih terbuka. Persentase pengembangan 73% tetap estimasi.

## Revalidasi setelah koreksi Akademik — 30 Oktober 2026

- Commit PR #13 `d20c378081fff9a46c2ccc9057b7e442e8844db4` menambahkan cakupan unit tenant-aware untuk jadwal, jurnal, dan penilaian Akademik, termasuk pemilih/filter unit pada UI Admin, pembatasan Ustadz, serta tes pgTAP 12 assertion. Kelas tenant-wide lama tetap diperlakukan sebagai kelas bersama; UI untuk memetakan kelas dan rekonsiliasi histori masih belum ada.
- GitHub Actions [run 41005427549](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41005427549) lulus **2/2 job** pada commit tersebut. Rehearsal seluruh migration dan seluruh suite pgTAP/API/Storage/backup-restore dijalankan terhadap Supabase lokal sintetis. Supabase Preview berstatus skipped karena branch belum terkait ke Supabase Branch.
- Pemeriksaan GitHub langsung: PR #1–#11 **Open/Draft**, PR #12 **Closed/Merged** (`c8738185ff6e5080ae427ef0021ee25681036c40`), PR #13 **Open/Draft** pada head `d20c378`. Tidak ada PR yang ditutup atau digabung pada checkpoint ini.
- Tidak ada migration atau data yang diterapkan ke staging/production. Akses baca ledger staging masih belum tersedia; jangan menganggap CI lokal sebagai bukti skema target Supabase sudah selaras.
- **Keputusan:** PR #13 belum lengkap dan belum boleh ditutup atau digabung. Multi-unit Asrama serta pemetaan kelas/histori Akademik, domain operasional lain, area AI/PPOB yang fail-closed, audit integrasi, paritas PR #1–#11, audit legacy, dan rekonsiliasi migration staging tetap terbuka. Estimasi pengembangan bertahan sekitar **73%**.
