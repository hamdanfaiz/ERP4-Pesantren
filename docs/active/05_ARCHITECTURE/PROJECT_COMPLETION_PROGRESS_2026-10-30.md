# Progres penyelesaian pengembangan ERP4 Pesantren — 30 Oktober 2026

> **Estimasi penyelesaian pengembangan: sekitar 73%** (rentang kerja 70–75%). Angka ini **tidak memasukkan pelaksanaan deployment dan UAT**, yang akan dilakukan tim backend/penerapan Anda. Angka ini bukan bukti produk sudah siap produksi.

## Verifikasi terbaru — 30 Oktober 2026

- Commit kode PR #13 yang terakhir diuji `c6e48e22fb6caedae6e6b1e7a8ac53b3e0ebae4f`; GitHub Actions [run 41010491068](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41010491068) lulus **2/2 job**. Pembaruan dokumen audit/progres juga lulus **2/2 job** pada [run 41011380066](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41011380066).
- Build/typecheck, guard runtime Supabase-only, Docker/Compose, rehearsal migrasi sintetis, pgTAP, API/tenant, NIS/Tahfidz serentak, Storage, dan backup/restore sintetis lulus. Tidak ada migrasi atau data yang diterapkan ke Supabase live.
- UI Admin untuk memetakan kelas lama ke unit kini tersedia. RPC menolak pemetaan dan daftar kelas bila izin Akademik tidak bernilai `true`; pgTAP menguji izin kosong, tenant, role, replay idempoten, unit nonaktif, pemetaan ulang, dan benturan nama. CI sebelumnya menemukan kegagalan izin dan tes; perbaikannya diuji ulang hingga lulus pada run terbaru.
- Finance memiliki unit pada pengeluaran/ledger baru, RKAT baru, dan tagihan yang mewarisi unit kandidat/santri tertaut; pemetaan historis tetap eksplisit. Catatan inti Akademik memiliki cakupan tenant-aware dan UI Admin untuk pemetaan kelas lama. Asrama kini membatasi Ustadz pada unit serta lokasi yang ditugaskan dan menyediakan pemetaan historis Gedung/Kamar untuk Admin; data yang belum dipetakan tetap tersembunyi dari Ustadz. Data unit operasional lain dan rekonsiliasi tenant nyata masih perlu ditinjau. Integrasi lintas modul, Analitik AI/PPOB yang fail-closed, dan audit paritas PR #1–#11 masih perlu diselesaikan atau ditetapkan batas rilisnya.
- PR #1–#11 masih Open/Draft, PR #12 Merged, PR #13 Open/Draft. Hanya PR #12 yang sudah masuk ke `main`. Tidak ada migration atau data yang ditulis ke Supabase live. Supabase Preview dilewati karena branch tidak ditautkan ke Supabase Branch. Estimasi pengembangan tetap sekitar **73%** dan belum memakai WBS berbobot.

## Perubahan definisi progres

Sebelumnya ada dua angka: kematangan fitur sekitar 73% dan kesiapan go-live sekitar 46%. Angka go-live menggabungkan pekerjaan pengembangan dengan gerbang rilis eksternal seperti rehearsal database, deployment, validasi environment pelanggan, dan UAT. Karena deployment dan UAT dikerjakan tim lain, **46% tidak lagi dipakai untuk melaporkan progres penyelesaian project**. Angka tersebut hanya dipertahankan sebagai catatan historis kesiapan rilis.

Untuk pelaporan project, angka kerja sekarang adalah **sekitar 73% penyelesaian pengembangan**. Ini meneruskan estimasi kematangan fitur sebelumnya; bukan hasil penghitung otomatis dan belum memakai WBS berbobot yang disepakati tim. Angka bisa berubah setelah cakupan fitur dinilai bersama tim backend.

## Cakupan metrik

**Dihitung sebagai pekerjaan pengembangan:**

- Implementasi fitur, skema, API Supabase, validasi transaksi, dan integrasi antarmodul.
- Isolasi tenant, role/permission, dan pengamanan jalur runtime.
- Pengujian otomatis/sintetis, perbaikan hasilnya, serta kesiapan paket aplikasi untuk pemasangan mandiri.
- Dokumentasi teknis yang diperlukan agar tim backend dapat meninjau dan menjalankan aplikasi.

**Tidak dihitung di metrik ini:**

- Pelaksanaan deployment ke hosting, VPS, atau server pelanggan.
- Penerapan migration dan konfigurasi database live oleh tim penerapan.
- UAT dan penerimaan pengguna akhir.

Skrip migration, konfigurasi yang portabel, dan dokumentasi deployment tetap bagian pekerjaan pengembangan; menjalankannya pada environment pelanggan adalah pekerjaan tim penerapan.

## Pekerjaan pengembangan yang masih terbuka

1. **Selesaikan cakupan area produk yang masih memiliki gap:** Manajemen Multi-Unit memiliki registri tenant; unit tersedia untuk pengeluaran/ledger dan RKAT baru, tagihan terkait kandidat/santri, catatan inti Akademik, serta UI Admin untuk memetakan kelas lama. Tagihan/transaksi lama dan arsip Akademik tetap memerlukan pemetaan eksplisit. Cakupan unit Asrama dan data operasional lain belum lengkap. Analitik AI dan PPOB/Layanan masih fail-closed. Rincian ada di [checkpoint Multi-Unit 30 Oktober](CHECKPOINT_2026-10-30_ENTERPRISE_UNITS.md).
2. **Bersihkan sisa source legacy Firebase.** Cutover runtime Supabase-only sudah terverifikasi di CI run 40973057285: grafik frontend aktif tidak mengimpor Firebase, paket Firebase dikecualikan dari runtime production, dan smoke test production lulus tanpa paket tersebut. Kode legacy/import Firebase masih ada dalam source tree tetapi gate-nya selalu tertutup; hapus atau arsipkan jalur ini setelah memeriksa dependensi/tsconfig. Tidak ada data Firestore yang perlu disalin.
3. **Tutup integrasi lintas modul.** Verifikasi referensi data, aturan tenant dan permission, transaksi idempoten, validasi status, serta jejak audit pada alur yang saling terhubung.
4. **Lengkapi verifikasi pengembangan untuk paket self-hosted.** Pastikan konfigurasi, startup, health check, upgrade schema, pencadangan/pemulihan, dan panduan VPS/on-premise konsisten dan dapat direproduksi.
5. **Pertahankan CI hijau untuk perubahan berikutnya.** Head PR #13 saat checkpoint ini lulus typecheck/build, rehearsal migrasi lokal, pgTAP, API/tenant, Storage, dan backup/restore sintetis. CI tersebut tidak menggantikan UAT atau verifikasi database pelanggan.


### Status cutover Firebase → Supabase

CI run [40973057285](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40973057285) pada commit `20ce0fbe262e5ba6b76944544ef5dab06599865f` lulus 2/2 job. Pemeriksaan mencakup Supabase-only active frontend import graph, eksklusi Firebase dari production dependencies, gate Firebase Admin, dan production smoke test tanpa paket Firebase. Karena itu runtime production telah dibuktikan Supabase-only pada source tersebut. Referensi/komponen legacy masih tersimpan sebagai kode nonaktif di repository; audit dan penghapusannya tetap pekerjaan kebersihan source, bukan bukti bahwa production masih terhubung ke Firestore. Tidak ada data atau migration yang ditulis ke Supabase live.

## Finance unit-scope checkpoint — 30 Oktober 2026

- Pengeluaran Finance baru wajib terhubung ke organisasi aktif milik tenant. Akun Ustadz menggunakan unit pada profil tepercaya; Admin memilih unit aktif. Persetujuan menyalin unit ke ledger dan RPC lama tanpa unit dicabut.
- Baris pengeluaran/ledger Finance lama tidak diisi otomatis; `unit_id` tetap `NULL` sampai rekonsiliasi eksplisit. RKAT baru sudah dibatasi per unit, sementara tagihan, Akademik, Asrama, dan modul lain belum mendapat isolasi unit.
- GitHub Actions [run 40990151916](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40990151916) lulus 2/2 job di commit `7e9149283c8c1b843880b4b9db7bd56ef41636b1`; cakupannya termasuk typecheck/build, rehearsal migrasi lokal, pgTAP, API tenant, Storage, dan backup/restore sintetis.
- Tidak ada data/migration yang ditulis ke Supabase live. Feature flag Finance tetap mati secara bawaan; PR #13 tetap Open/Draft menunggu review dan tindak lanjut cakupan multi-unit.

## Kriteria penyelesaian pengembangan (100%)

Pengembangan dapat dilaporkan 100% setelah seluruh fitur dalam cakupan produk berjalan pada runtime Supabase atau secara eksplisit disepakati untuk ditunda; integrasi tenant/role dan transaksi memiliki tes; jalur runtime Firebase tidak tersisa; dan build/CI serta paket self-hosted lulus pada sumber kode yang sama.

Angka 100% **tidak menyatakan deployment produksi atau UAT telah dilakukan**. Tim backend tetap menjalankan deployment dan UAT sesuai rencana.

## Checkpoint dan handoff

- Basis kode yang diverifikasi: PR #13, branch `codex/supabase-runtime-cutover-20261022`, commit Finance `7e9149283c8c1b843880b4b9db7bd56ef41636b1`; GitHub Actions run `40990151916` lulus 2/2 job.
- PR #13 masih Open/Draft saat pemeriksaan. Dokumen ini tidak mengubah kode runtime, database Supabase, status PR, deployment, ataupun data.
- Tim backend dapat meninjau daftar pekerjaan di atas pada branch PR #13. Persentase diperbarui pada checkpoint berikutnya hanya jika ada bukti implementasi atau tes baru; deployment/UAT dicatat terpisah oleh tim penerapan.

## Implementasi registri unit — 30 Oktober 2026

- Kode Manajemen Multi-Unit kini disiapkan pada branch PR #13; checkpoint rinci: [CHECKPOINT_2026-10-30_ENTERPRISE_UNITS.md](CHECKPOINT_2026-10-30_ENTERPRISE_UNITS.md).
- Source berisi 104 migration setelah penambahan Finance expense unit-scope `20270128000000`, RKAT unit-scope `20270129000000`, pemetaan pengeluaran Finance lama `20270131000000`, dan Akademik `20270201000000`. CI merehearsal migration dan pgTAP di Supabase lokal sintetis. Migration belum diterapkan ke Supabase live; flag runtime tetap mati secara bawaan.
- Estimasi pengembangan tetap **73%**. Catatan Akademik baru memiliki isolasi unit; pemetaan kelas/histori, Asrama, dan domain operasional lain belum lengkap.

## Checkpoint cakupan unit Akademik — 30 Oktober 2026

- Commit `d20c378081fff9a46c2ccc9057b7e442e8844db4` pada PR #13 menambah `academic_records.organization_unit_id`, relasi tenant-unit untuk catatan Akademik dan metadata kelas, indeks pencarian, serta aturan transaksi untuk jadwal, jurnal, dan penilaian.
- Admin dapat menyaring catatan menurut unit atau meninjau catatan lama yang belum dipetakan. Unit untuk jadwal/jurnal wajib aktif; pilihan pengajar mengikuti unit. Penilaian mengambil unit santri dari database. Ustadz dibatasi ke unit profilnya. Kelas lama tanpa unit tetap dapat dipakai sebagai kelas bersama tenant; antarmuka pemetaan kelas ke unit dan rekonsiliasi histori belum tersedia.
- Tes pgTAP baru memiliki 12 assertion untuk konflik jadwal dalam/antar-unit, pengajar lintas unit, penilaian terhadap unit santri, jurnal Ustadz, serta marker internal. Supabase Preview dilewati karena branch tidak ditautkan ke Supabase Branch.
- GitHub Actions [run 41005427549](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41005427549) lulus **2/2 job** pada commit tersebut. Job frontend/typecheck/build/Docker dan job database/rehearsal/pgTAP/API/Storage/backup-restore sintetis seluruhnya lulus.
- Migration ini belum diterapkan ke staging atau production. Estimasi penyelesaian pengembangan tetap **sekitar 73%**; Asrama, pemetaan kelas dan histori Akademik, domain operasional lain, paritas PR lama, dan pilihan fitur yang fail-closed masih terbuka. PR #13 tetap Open/Draft dan belum siap merge.


## Verifikasi CI untuk checkpoint — 30 Oktober 2026

- GitHub Actions [run 40973057285](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40973057285) selesai **sukses, 2/2 job**, pada commit dokumentasi `20ce0fbe262e5ba6b76944544ef5dab06599865f`.
- Job frontend lulus typecheck, guard import Firebase pada frontend aktif, smoke test runtime production tanpa paket Firebase, konfigurasi runtime pelanggan, serta build dan smoke test Docker/Compose.
- Job database lulus rehearsal migration pada Supabase lokal sintetis, pgTAP/database tests, reservasi NIS/Tahfidz serentak, preview importer sintetis, API auth/isolasi tenant, unggah Storage Finance/PPDB/Perpustakaan, serta backup/restore lokal.
- Ini bukti source dan fixture sintetis pada CI saja. Tidak ada migration/data yang diterapkan ke Supabase live; hasil ini bukan deployment atau UAT pelanggan. Estimasi penyelesaian pengembangan tetap sekitar **73%** karena commit ini hanya memperbarui dokumentasi.

## Koreksi batas jawaban CBT — 30 Oktober 2026

- Migration `20270127000000_fix_cbt_answer_object_limit.sql` memperbaiki `save_cbt_attempt_answers`: penghitungan jumlah jawaban kini memakai `jsonb_object_keys`, sementara pemeriksaan tenant/santri aktif, batas maksimum 500, `SECURITY INVOKER`, `search_path`, dan hak eksekusi server tetap dijaga.
- pgTAP menambahkan regresi untuk 500 jawaban (melewati batas dan mencapai validasi percobaan) serta 501 jawaban (ditolak dengan SQLSTATE validasi).
- GitHub Actions [run 40983747307](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40983747307) lulus **2/2 job** pada commit kode `4a366723fd0fd9b17d93593c501e603fd181fb24`: build/typecheck frontend serta rehearsal migration Supabase lokal, pgTAP, API/tenant, Storage, dan backup/restore sintetis. Supabase Preview dilewati karena branch tidak terhubung ke Supabase Branch.
- Estimasi penyelesaian pengembangan tetap sekitar **73%**; koreksi ini menutup satu cacat pada CBT, tetapi tidak menyelesaikan empat area produk yang masih bergate atau release gate lainnya. Tidak ada migration yang diterapkan ke Supabase live. PR #13 tetap Open/Draft.
