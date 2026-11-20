# PTSAS Production — audit kesenjangan migrasi dan runbook promosi

Tanggal pemeriksaan: 20 November 2026

## Ringkasan eksekutif

Dokumen ini menjadi panduan kerja tim backend untuk merekonsiliasi source migrasi Supabase dengan PTSAS Production. Pemeriksaan pada tanggal di atas hanya membaca metadata migrasi dan katalog PostgreSQL. Tidak ada DDL atau data Production yang diubah.

| Fakta | Nilai |
| --- | --- |
| Commit source yang diaudit | `0459967c638ad02b89f6aaf25ebcee4c8b3a9326` |
| File migrasi source | 163, berakhir pada `20270402000000` |
| Ledger PTSAS Production | 100 entri, terakhir `20270316000000` |
| Migrasi source yang belum tercatat di Production | 63; daftar lengkap ada di [laporan paritas](ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md) |
| Entri Production dengan nama kosong | 3: `20261205000000`, `20261206000000`, `20270118000000` |
| Ledger VQE staging | 163 entri; seluruh versi source tercatat sampai `20270402000000` |

Ledger membuktikan versi yang pernah direkam, bukan bahwa DDL saat ini identik dengan source. Status RLS aktif pada tabel Production juga tidak membuktikan isi policy, grant, fungsi, trigger, constraint, indeks, atau perilaku aplikasi sudah cocok. DDL Production belum dibandingkan secara menyeluruh dengan source, dan backup/restore Production belum dibuktikan.

## Temuan statis pada 63 file yang belum tercatat

Pemindaian source migration tidak menemukan perintah migrasi `DELETE` atau `TRUNCATE`. Ini bukan jaminan bebas risiko: ada perubahan DDL, pengisian metadata/historis, penggantian fungsi dan trigger, perubahan constraint, serta indeks yang dapat mengunci penulisan.

### DML yang berjalan ketika file migrasi dieksekusi

- `20261213000000_marketplace_mutation_payload_guard`: membuat tanda terima idempotensi dari transaksi marketplace yang sudah tercatat. Insert memakai `ON CONFLICT DO NOTHING`; transaksi sumber tidak dihapus.
- `20261214000000_donation_mutation_payload_guard`: membuat tanda terima idempotensi dari audit donasi dan menghubungkan tanda terima dengan donasi yang masih ada. Karena audit lama tidak menyimpan payload lengkap, fingerprint historis bernilai `NULL`. Insert memakai `ON CONFLICT DO NOTHING`.
- `20270320000000_tahfidz_quran_surah_catalog`: memasukkan atau memperbarui 114 baris referensi surah, lalu mengisi nomor surah pada setoran Tahfidz yang nama surahnya cocok. Periksa nama yang tidak cocok dan duplikat nama sebelum promosi.

Di luar butir di atas, definisi fungsi dapat memuat operasi tulis yang baru berjalan saat RPC dipanggil; itu bukan DML saat migrasi. Tinjau izin EXECUTE dan skenario pemanggilan terpisah.

### Perubahan struktural yang perlu pemeriksaan khusus

- `20270122000000_lms_learning_record_tenant_fk`: menjalankan preflight dan membatalkan migrasi bila referensi LMS lintas tenant ditemukan; mengganti foreign key dengan kontrak tenant gabungan. Periksa seluruh pelanggaran preflight pada salinan data Production sebelum jadwal rilis.
- `20261207000000_library_legacy_catalog_import`: menghapus constraint unik ISBN lama. Pastikan constraint pengganti dan kebijakan ISBN yang diinginkan sesuai kondisi katalog Production.
- `20261230000000_cooperative_financial_legacy_import` dan `20270109000000_boarding_room_history_baseline`: mengubah constraint historis. Bandingkan definisi constraint serta validitas data yang ada.
- `20270205000000_guardian_self_registration`: menghapus constraint unik lama pada relasi akun wali. Pastikan constraint dan index baru melindungi relasi sesuai kebijakan satu akun untuk beberapa anak.
- `20261225000000`, `20261226000000`, dan `20270215000000`: mengganti fungsi LMS dan trigger relasi kategori biaya. Verifikasi signature, isi fungsi, `search_path`, pemilik, dan grant EXECUTE sebelum/sesudah.
- `20270210000000_internalize_tenant_rls_helpers` serta migrasi keamanan lainnya: tinjau pemilik fungsi, `SECURITY DEFINER`/`SECURITY INVOKER`, `search_path`, grant, RLS, dan FORCE RLS; jangan menyimpulkan keamanan hanya dari status RLS.

### Dampak indeks dan lock

Sejumlah migrasi memakai `CREATE INDEX` biasa. Source secara khusus memperingatkan bahwa indeks direktori profil (`20270101000000`) dan pencarian santri (`20270119000000`) dapat menghalangi penulisan saat proses build. Migrasi halaman CBT (`20270325000000`) dan indeks foreign key inti (`20270330000000`) juga perlu penilaian ukuran tabel dan jendela penulisan rendah. Catat durasi rehearsal, ukuran tabel, lock yang terlihat, dan ambang pembatalan sebelum menjadwalkan produksi.

## Urutan kerja yang diwajibkan

### 1. Kunci source dan target

- Gunakan source yang sama dengan commit audit atau commit `main` yang lebih baru dan disetujui.
- Periksa project ref secara eksplisit sebelum menjalankan perintah. Target yang dibahas dokumen ini adalah PTSAS Production `ptsasgdvgrbdtgyqieie`; VQE `vqemuyzveuirlkvdggjd` adalah staging.
- Gunakan autentikasi CLI/akses database milik tim melalui secret manager atau `.env` lokal yang tidak masuk Git. Jangan menempel kredensial di PR, log, SQL editor, atau chat.
- Tidak ada kebutuhan menyalin ulang hostname pooler VQE. Jika tim memerlukan URL Production, salin persis dari dialog Connect pada proyek Production; jangan menebak hostname/cluster.

### 2. Buat dan buktikan backup sebelum perubahan

- Ambil backup/snapshot Production melalui mekanisme yang didukung paket Supabase dan kebijakan organisasi.
- Pulihkan backup tersebut ke proyek disposable atau lingkungan terisolasi, bukan ke Production.
- Simpan bukti waktu snapshot, rentang data, versi source, hasil restore, pemeriksaan jumlah record per tabel penting, validasi relasi, dan smoke test baca/tulis pada lingkungan hasil restore.
- Jangan lanjut hanya karena backup berstatus sukses; restore yang dapat dibuka dan diperiksa adalah bukti yang dibutuhkan.

### 3. Bandingkan DDL aktual dengan source

- Ekspor schema-only Production secara baca-saja dengan alat Postgres yang disetujui tim; hilangkan owner/ACL dan abaikan nilai yang berubah otomatis seperti timestamp.
- Bandingkan objek berdasarkan nama dan definisi: tabel/kolom/default, constraint dan validasinya, foreign key tenant gabungan, index, trigger, function signature/body/security/search_path/owner/grant, policy RLS, FORCE RLS, schema privilege, dan table privilege.
- Cocokkan tiga versi ledger yang nama migrasinya `NULL` dengan file source dan bukti katalog. Jangan mengisi nama atau memperbaiki ledger hanya berdasarkan dugaan.
- Untuk setiap dari 63 versi yang tertinggal, catat: objek yang diharapkan, objek aktual, apakah sudah ada lewat perubahan manual/alias, DML yang akan terjadi, dependensi urutan, dan hasil keputusan. Bila objek sudah ada, buktikan kesetaraan sebelum mempertimbangkan repair ledger; repair tidak boleh digunakan untuk menyembunyikan ketidakcocokan.
- Arsipkan diff dan inventaris dalam artefak internal dengan akses terbatas. Jangan memasukkan data pribadi atau secret ke repository.

### 4. Rehearsal migrasi pada hasil restore

- Terapkan urutan migrasi pada salinan hasil restore dengan versi source yang sama. Jangan menguji hanya terhadap database kosong.
- Source memiliki migrasi yang hilang sebelum dan setelah high-watermark ledger Production. Karena itu rencana akan out-of-order; `--include-all` dapat mengikutsertakan seluruh migrasi tertunda, bukan sekadar beberapa migrasi terakhir.
- Jalankan dry-run terlebih dahulu dan bandingkan daftar versi/nama terhadap inventaris 63 migrasi. Dry-run hanya rencana; ia tidak membuktikan SQL berhasil atau aman.
- Tinjau DML historis, perubahan constraint, indeks, function grants, dan dependensi setiap file. Ukur lock dan durasi. Validasi row counts dan relasi sebelum/sesudah; khusus untuk migrasi Quran, hitung record Tahfidz yang cocok/tidak cocok.
- Jika CLI menunjukkan versi remote-only, migrasi yang telah diterapkan di luar ledger, benturan versi, atau perubahan tak terduga, hentikan proses. Jangan menjalankan repair massal atau `db push` berulang untuk mencoba melewati preflight.

### 5. Persetujuan dan penerapan terkontrol

- Backend owner menyetujui diff DDL, hasil restore, urutan migrasi, daftar DML/seed, dampak lock, jendela rilis, rencana observasi, dan rencana pemulihan.
- Terapkan satu release plan yang direhearsal oleh operator Production yang berwenang. Jangan jalankan seluruh 63 migrasi hanya karena dry-run menampilkannya.
- Hentikan rilis saat migrasi pertama gagal atau waktu lock melewati ambang yang telah disepakati. Simpan log versi yang berhasil dan error tanpa secret.
- Hindari mengedit migrasi yang sudah pernah diterapkan; koreksi skema dilakukan dengan migrasi forward-only yang sudah direhearsal.

### 6. Verifikasi setelah rilis

- Pastikan versi ledger sesuai release plan dan setiap objek DDL penting cocok dengan source.
- Verifikasi RLS dan FORCE RLS, policy per role/tenant, grants, function security/grants, trigger, foreign key, dan indeks yang dirilis.
- Jalankan smoke test tenant-terpisah dan alur baca/tulis pada modul terdampak, terutama Wali/akun, LMS, Perpustakaan, koperasi/keuangan, Tahfidz, CBT, PPDB, serta asrama.
- Periksa log/error, antrean/retry, latensi, waktu lock, dan hasil DML/rekonsiliasi; dokumentasikan hasil serta tindakan pemulihan.
- Production dianggap selesai pada tahap ini hanya setelah tim backend menerima bukti uji restore dan UAT pascarilis. Ini terpisah dari pemeriksaan CI pada database sementara.

## Hal yang belum dibuktikan

- Kesetaraan seluruh DDL Production dengan commit source.
- Dampak aktual migrasi pada baris data tenant Production.
- Pemulihan backup Production ke lingkungan terisolasi.
- Jalannya semua 63 migrasi tertunda dan fungsinya terhadap database Production.
- UAT Production lengkap dan penerimaan deploy oleh tim backend.

## Bukti dari pekerjaan Codex

- Pemeriksaan MCP Supabase Production hanya membaca metadata migration dan katalog PostgreSQL; konektor Production pada sesi audit ini bersifat baca-saja.
- VQE memiliki seluruh 163 versi source pada ledger. Ini bukan bukti bahwa Production sudah tersinkron.
- CI/pgTAP/replay pada database terisolasi tidak menggantikan DDL diff Production, restore Production, atau UAT Production.
- Tidak ada migration, repair ledger, atau perubahan data yang dilakukan ke PTSAS Production dalam audit ini.

Referensi status dan daftar lengkap migrasi tertinggal: [ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md](ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md).
