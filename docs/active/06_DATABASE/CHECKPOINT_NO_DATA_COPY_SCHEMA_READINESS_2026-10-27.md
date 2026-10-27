# Checkpoint kesiapan schema dan logic — tanpa salin data legacy

**Tanggal pemeriksaan:** 27 Oktober 2026
**Repository:** `hamdanfaiz/ERP4-Pesantren` — PR #13
**Target database yang dibaca:** Supabase staging `ptsasgdvgrbdtgyqieie`

## Keputusan ruang lingkup

Pemilik produk menegaskan bahwa data Firestore yang tersedia adalah data dummy. **Data Firestore tidak perlu disalin atau direkonsiliasi ke Supabase.** Jangan menjalankan importer atau menghapus/mengosongkan isi staging untuk mengejar hitungan. Pemilik akan membuat data contoh secara manual setelah alur aplikasi stabil.

Yang harus dibuktikan adalah skema, relasi tenant, izin, dan logic transaksi di Supabase. Fixture uji boleh dibuat sintetis pada Supabase lokal/CI atau environment uji yang dapat dipulihkan.

## Status terverifikasi

- PR #13 masih **Open / Draft**. Commit kode yang telah divalidasi: `222d495606e49d6baaf54569df0b42453c0443f4`.
- Source PR #13 berisi **96 file migration**, sampai `20270124000000_finance_proof_upload_rate_limit.sql`.
- Pembacaan staging hanya menampilkan **47 versi ledger**, terakhir `20261206000000`. Sebanyak **49 versi source belum tercatat** pada ledger. Metadata `name` untuk versi `20261205000000` dan `20261206000000` kosong.
- GitHub Actions [run 40493469094](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40493469094) lulus pada commit kode sebelumnya `44d8e317873ee0da2fd25c338807d59d69915388`: build/typecheck, guard Firebase runtime, Supabase lokal/pgTAP/API tenant, transaksi NIS dan slot Tahfidz serentak, Storage, serta backup/restore sintetis.
- GitHub Actions [run 40496694011](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40496694011) lulus pada commit kode `222d495606e49d6baaf54569df0b42453c0443f4`: frontend build dan guard Firebase; upgrade schema-only dari batas ledger staging, migrations/pgTAP, API auth/tenant, transaksi serentak, Storage, dan backup/restore sintetis. Uji provisioning tambahan memastikan kata sandi sementara >128 karakter atau berisi karakter kontrol ditolak sebelum akun Auth dibuat. Tetap bukan rehearsal atau perubahan database staging.
- Pembandingan source 49 migration yang belum tercatat dengan katalog staging menemukan 30 tabel target belum ada serta 43 dari 78 nama fungsi belum ada. Nama fungsi yang sudah ada belum dibandingkan signature/body-nya. Runbook detail: [rekonsiliasi schema staging](STAGING_SCHEMA_RECONCILIATION_RUNBOOK_2026-10-27.md).
- Tidak ada data Firestore disalin dan tidak ada migration/data yang ditulis ke Supabase staging atau Production pada checkpoint ini.
- PR mengestimasi kematangan fitur **73%** dan kesiapan go-live **46%**. Itu estimasi, bukan hasil UAT/telemetri.

## Bukti baca-saja schema dan akses staging — 27 Oktober 2026

Audit katalog staging menunjukkan 119 tabel pada schema `public`; seluruh 119 mengaktifkan RLS dan FORCE RLS. Sebanyak 118 tabel memiliki `tenant_id NOT NULL`; satu pengecualian adalah tabel root `tenants`. Dari 335 foreign key di `public`, 243 relasi antartabel ber-tenant memasangkan `tenant_id` pada kedua sisi; query tidak menemukan FK tenant-ke-tenant yang melewatkan pasangan tenant.

Privilege efektif yang diperiksa: `anon` tidak punya akses tabel; `authenticated` hanya dapat membaca lima tabel dan tidak memiliki hak tulis. Ada 114 tabel tanpa policy, tetapi tidak diberikan akses langsung kepada dua role klien tersebut pada baseline yang diperiksa. Backend memakai `service_role` yang berprivilege tinggi; route server tetap wajib memverifikasi token, profil aktif, tenant, role, dan permission. Empat RPC onboarding/HRIS yang ditinjau hanya dapat dieksekusi `service_role`, bukan `anon` atau `authenticated`.

Bukti ini adalah snapshot katalog staging, bukan uji runtime lengkap, bukan audit setiap endpoint, dan bukan bukti bahwa migration yang belum tercatat aman diterapkan. Query bersifat baca-saja; tidak ada row, policy, schema, atau feature flag yang diubah.

Pada sesi ini, konektor Supabase penuh hanya menampilkan project `vqemuyzveuirlkvdggjd`, bukan target staging `ptsasgdvgrbdtgyqieie`; query ke ref target melalui konektor penuh gagal validasi project (`INVALID_ARGUMENT`). Konektor staging khusus masih dapat membaca katalog dan ledger, tetapi tidak menyediakan jalur tulis. Tim backend perlu menghubungkan akses yang benar ke staging atau menjalankan rehearsal dari runner mereka setelah mendapat kewenangan. Tidak ada kredensial yang dimasukkan ke repo, dan tidak ada perubahan database yang dilakukan.

## Pemeriksaan batas API pada source terbaru

Pemeriksaan statis pada `server.ts` head kode `44d8e317873ee0da2fd25c338807d59d69915388` menemukan 181 deklarasi route: 167 menyertakan middleware `requireAuth`. Route tanpa middleware autentikasi adalah dua health check; tiga endpoint AI/OCR yang langsung menolak dengan `503`; dua endpoint PPDB publik yang dikunci oleh flag server dan memakai rate-limit; enam endpoint referensi wilayah/Al-Qur'an; dan fallback SPA. Tidak ditemukan route bisnis tenant lain tanpa autentikasi pada scan tersebut.

Hasil ini adalah inventaris kode statis, bukan pengujian penetrasi atau bukti bahwa setiap middleware/handler benar di runtime. Uji API auth/tenant pada CI tetap diperlukan dan sudah lulus pada run terakhir untuk head kode tersebut. Endpoint AI/OCR saat ini memang belum tersedia; sebelum dipakai, implementasikan autentikasi, tenant scope, batas penggunaan, dan uji, atau pertahankan dalam keadaan fail-closed.

## Kriteria penerimaan logic dan relasi

1. **Tenant terikat di database:** semua tabel operasional ber-`tenant_id NOT NULL` kecuali katalog global yang didokumentasikan; relasi antartabel memakai kunci komposit tenant agar child tidak dapat menunjuk parent tenant lain.
2. **Isolasi izin di server:** API memvalidasi access token, memuat profil aktif dari sumber tepercaya, menentukan tenant/role/permission dari profil server, dan menolak secara default. Jangan menerima tenant/role dari payload klien sebagai otoritas.
3. **RLS dan hak database konsisten:** setiap tabel di schema terekspos memiliki RLS serta policy sesuai role dan tenant. Tinjau grants, view, RPC, trigger, dan `SECURITY DEFINER`; `service_role` hanya boleh dipakai server di balik pemeriksaan otorisasi.
4. **Transaksi atomik dan idempoten:** nomor unik seperti NIS menggunakan constraint dan reservasi transaksional; retry PPDB tidak menggandakan pendaftaran; reservasi stok/booking dan pembatalan menghasilkan ledger/mutasi yang konsisten; penulisan keuangan tidak membuat saldo tanpa jejak jurnal.
5. **Relasi lintas modul teruji:** santri-wali, kelas/akademik, halaqah/sesi Tahfidz, asrama/kamar, tagihan/pembayaran, dan produk/pesanan mengarah ke record dalam tenant yang sama. Uji skenario sukses, retry, konflik, dan akses silang tenant dengan fixture sintetis.
6. **Tenant kosong dapat memulai operasi:** admin dapat membuat record awal lewat UI/API biasa. Import Firestore, ID lama, dan snapshot lama bukan prasyarat untuk membuka modul.
7. **UI dan API menangani keadaan kosong serta gagal:** daftar kosong, loading/error, validasi, retry, paginasi, dan respons server harus konsisten tanpa fallback diam-diam ke Firebase.

## Urutan kerja aman berikutnya

1. Tinjau 95 source migration dan cocokkan lineage, urutan dependency, efek DDL, seed sistem, serta migration yang hanya menyiapkan fungsi importer legacy. Pembuatan fungsi importer tidak berarti importer harus dipanggil.
2. Pada staging, lakukan pemeriksaan baca-saja terhadap versi ledger, schema, grants, RLS/policy, fungsi, dan Storage. Rekonsiliasi dahulu dua metadata ledger yang kosong; jangan menjalankan `migration repair` atau menerapkan batch hanya berdasarkan selisih versi.
3. Buktikan backup dan pemulihan pada environment yang bisa dibuang/dipulihkan. Lakukan rehearsal **schema-only** di Supabase lokal atau branch/database uji yang terpisah. Jangan mengubah atau menghapus row staging yang sudah ada.
4. Jalankan CI/pgTAP dan API test lintas tenant/role dengan data sintetis; tambahkan uji relasi FK komposit, ID unik, transaksi serentak, idempotensi, Storage privat, dan tenant kosong.
5. Setelah bukti schema-only dan restore lulus, minta tim backend menjalankan login/UAT pada staging: Admin, staf berizin terbatas, wali, penolakan tenant lain, dan semua modul inti.
6. Sebelum go-live, rotasi secret/password database yang pernah dibagikan, periksa konfigurasi environment customer-managed, backup terjadwal, observabilitas, rollback, serta uji responsive browser.

## Gerbang dan batas

- Beda jumlah dokumen Firestore dan baris Supabase **bukan** blocker dan tidak perlu dibuat sama.
- Yang masih menjadi blocker adalah provenance/lineage migration, rehearsal schema yang dapat dipulihkan, uji live Auth/RLS/Storage, UAT lintas modul/tenant, dan kesiapan operasi environment pelanggan.
- Jangan menerapkan migration ke Production, mengubah feature flag Production, mengimpor data, atau menghapus data staging berdasarkan checkpoint ini.

## Bukti dan dokumen

- [PR #13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)
- [GitHub Actions run 40480854534](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40480854534)
- Laporan hitungan dan preview lama dipertahankan sebagai arsip teknis; hasilnya bukan target import atau release gate.

**Pembaruan verifikasi baca-saja — 27 Oktober 2026:** pemeriksaan ulang mempertahankan hasil 119/119 tabel dengan RLS + FORCE, 118/118 tabel ber-tenant dengan `tenant_id NOT NULL`, dan 243/243 FK tenant-ke-tenant memasangkan `tenant_id`. Jumlah seluruh FK publik pada hasil query terbaru adalah 335. Tidak ada perubahan schema, row, policy, grant, atau feature flag yang dilakukan.

**Kesimpulan:** lanjutkan cutover dengan membuktikan logic dan relasi Supabase memakai schema dan fixture sintetis. Tidak ada pekerjaan penyalinan Firestore yang diperlukan.

## Pembaruan checkpoint — 27 Oktober 2026

- Pemilik produk menegaskan data Firestore adalah dummy dan akan membuat data contoh manual. Tidak ada hitungan atau kesamaan jumlah Firestore→Supabase yang menjadi release gate.
- Commit terbaru PR #13: `8a727916ac14c3f0d524b26ba6c657ea08b0a533`. GitHub Actions [run 40509563661](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40509563661) lulus pada dua job: frontend/typecheck/build/container dan database/API.
- Suite database memakai Supabase lokal dengan fixture sintetis sementara; menguji rehearsal migration, pgTAP, NIS/Tahfidz serentak, auth/tenant, Storage, dan backup/restore. Uji onboarding mencakup keterkaitan kandidat→santri/wali→jembatan wali-santri→reservasi NIS→klaim identitas, perubahan okupansi kamar, serta retry tanpa duplikasi.
- UI ringkasan, Keuangan, Akademik, Alumni, CBT, Asrama, dan Laundry kini memakai pesan kosong/cakupan yang sesuai tenant Supabase; pengguna tidak diarahkan ke tab impor yang dinonaktifkan.
- Ledger staging tetap terbaca 47 versi sampai `20261206000000` dari 96 migration source; 49 versi belum tercatat dan metadata dua versi terakhir kosong. Konektor yang tersedia masih baca-saja untuk target tersebut. Tidak ada schema, migration, flag, atau record staging yang diubah.
- PR #13 tetap **Open / Draft**. Estimasi belum berubah: **73% kematangan fitur / 46% kesiapan go-live**. CI lokal membuktikan kontrak source dengan fixture, bukan UAT atau penerapan pada staging.


## Checkpoint tanpa salin data: tutup akses impor arsip pada UI — 27 Oktober 2026

- Commit kode pembatasan: [b046106](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/b046106c56c17a1641e60e6442fddf0612b7fddd); pemeriksaan regresi: [c941289](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/c94128915fe1c9576e5c90a10139b26fa21fb479).
- Kebijakan global `legacyArchiveImportEnabled = false` membuat impor arsip Firestore tidak aktif walaupun flag build lama disetel. Tombol dan panel impor di Master Data, Akademik, Asrama, Komunikasi, UKS, LMS, Sarana & Prasarana, Marketplace, CBT, Koperasi, dan Perpustakaan mengikuti kebijakan tersebut. API legacy tetap fail-closed karena gerbang Firebase Admin server selalu `false`.
- GitHub Actions [run 40499494800](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40499494800) lulus pada kedua job untuk head PR #13 `c941289`: build/typecheck dan Docker, serta migrasi/upgrade rehearsal pada Supabase lokal, pgTAP, API auth/tenant, transaksi serentak, Storage, dan backup/restore sintetis. Tidak ada data Firestore yang digunakan sebagai fixture.
- Pembacaan staging terbaru mengonfirmasi 119/119 tabel `public` memakai RLS dan FORCE RLS; 118/118 tabel tenant mewajibkan `tenant_id`; 243/243 FK antar tabel tenant memasangkan `tenant_id`; grant SELECT untuk `anon` = 0 dan akses tulis tabel untuk `authenticated` = 0.
- Source tetap 96 migration, sedangkan ledger staging 47 versi sampai `20261206000000`; 49 migration belum tercatat. Karena konektor staging hanya baca-saja, tidak ada migrasi yang diterapkan. Konektor Supabase penuh yang tersedia hanya menampilkan project `vqemuyzveuirlkvdggjd`, bukan target staging `ptsasgdvgrbdtgyqieie`.
- Data operasional contoh akan dibuat manual. CI di atas membuktikan alur terhadap database lokal dan fixture sintetis, bukan UAT live atau penerapan skema staging.
- PR #13 masih **Open / Draft**. Estimasi checkpoint tetap **73% kematangan fitur / 46% kesiapan go-live**; angka ini adalah estimasi, bukan bukti UAT.

