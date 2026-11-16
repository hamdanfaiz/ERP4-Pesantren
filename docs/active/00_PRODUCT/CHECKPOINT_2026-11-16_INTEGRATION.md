# Checkpoint Integrasi ERP4 — 16 November 2026

## Posisi source

- **Perkiraan penyelesaian pengembangan source: sekitar 80%.** Ini estimasi kasar berdasarkan integrasi fitur rilis awal, verifikasi lokal, dan handoff; bukan hitungan bobot WBS. Deployment dan UAT tim penerapan tidak dihitung. Sisa pengembangan terutama UAT simpan-baca lintas modul/role di staging, kecocokan migration dengan VQE, dan penutupan temuan review backend.
- Basis lokal mengikuti `main` pada `37455550f0a78147f2b7447fe75c06558d990603`.
- Kandidat mengintegrasikan source PR draft #122 (`32f44b65fb2ce06ec1d575a929129f4e7b1cf46d`) dengan `main` terkini dan perbaikan lokal yang tercatat di bawah.
- PR #122 tetap Draft sampai pemeriksaan backend dan pengujian simpan-baca staging diselesaikan. Source ini belum dinyatakan rilis Production.
- Tidak ada migrasi, perubahan Auth, atau perubahan data pada VQE maupun PTSAS yang dijalankan dalam checkpoint ini.

## Koreksi dan hasil kerja

- Mengganti pesan API yang mengungkap flag/runtime/operator atau rincian layanan internal dengan pesan layanan yang aman. Pesan error dari server `5xx` dan SQLSTATE juga disamarkan.
- Status layanan WhatsApp pada CRM hanya mengembalikan dan menampilkan status kesiapan; endpoint dan rincian konfigurasi tidak dikirim ke browser.
- Menghapus kontrol email SMTP yang belum berfungsi dari Pengaturan serta menjelaskan batas fitur dengan bahasa pengguna.
- Menyamakan tab Tahfidz dengan komponen `ERPTabs` bersama agar gaya, aksesibilitas, dan kontrol gulir konsisten.
- Merapikan pesan batasan HRIS/Asrama dan mempertahankan peringatan privasi alasan cuti.
- Kandidat integrasi juga memuat pembaruan CBT skala besar, leaderboard Tahfidz persisten, indeks relasi tenant, tren keuangan dashboard, katalog Al-Qur’an berbasis database, dan koreksi integrasi modul lintas PR yang tercatat pada PR #122.

## Verifikasi lokal

- `npm run lint` — lulus.
- `npm run build` — lulus untuk frontend dan server. Build masih memberi peringatan komentar anotasi dependensi Zod dan chunk PDF besar; tidak ada error build.
- 65 dari 65 skrip uji yang tidak menulis data cloud atau membutuhkan Supabase CLI lulus, termasuk auth/RBAC, API route policy, runtime Supabase tanpa Firebase, flag deployment pelanggan, pagination CBT/Akademik/Tahfidz, dashboard, PPDB, katalog Al-Qur’an, master data, serta salin pesan.
- Dua smoke test loopback, `test:trusted-proxy-hops` dan `test:runtime-config-http`, lulus setelah izin jaringan lokal diberikan.
- `test:ci-coverage` memastikan semua 75 skrip tes paket tercakup CI. Angka ini menunjukkan cakupan workflow; bukan berarti semua 75 test dijalankan di mesin ini.
- GitHub Actions run #1813 pada commit `2f10633` meluluskan instalasi NPM dan build frontend/Firebase guard. Job migrasi menjalankan migration replay, 1.911 assertion pgTAP, dan tes transaksi bersamaan, lalu gagal pada integrasi API karena route pagination ujian CBT belum terdaftar (`404`). Route ringkasan, pagination, dan pengaturan CBT kini didaftarkan dengan autentikasi dan izin Admin.
- Run #1815 pada `2271450` meluluskan migration replay, 1.911 assertion pgTAP, tes transaksi bersamaan, serta pemeriksaan API hingga operasi pengaturan CBT. Tes API kemudian gagal dengan `400` karena payload tes tidak menyertakan `autoGrading: true`, yang diwajibkan kontrak API dan sudah dikirim oleh UI. Payload tes telah diselaraskan dan diagnostik kegagalan akan menyertakan respons endpoint. CI setelah koreksi ini masih menunggu.

- Run #1817 pada `b419170` meluluskan migration replay, backfill sintetis, seluruh 1.911 assertion pgTAP, tes race condition, serta round-trip API lintas modul termasuk CBT settings. Job berhenti pada cleanup fixture karena baris `cbt_tenant_settings` masih memiliki foreign key ke profil Admin sintetis; Tahfidz/Storage/backup-restore setelah step itu belum dijalankan. Cleanup kini menghapus pengaturan CBT tenant sebelum menghapus profil. CI untuk koreksi cleanup ini masih menunggu.

## UAT browser staging

- Login Admin pada preview Hostinger/VQE berhasil.
- Halaman Tahfidz memuat katalog referensi 114 Surah dan pilihan ayat yang dibatasi jumlah ayat Surah. VQE tidak memiliki santri atau halaqah untuk fixture UAT yang dipakai, sehingga pencatatan setoran tidak disimpan.
- Pemeriksaan browser ini tidak membuktikan transaksi tulis-baca pada modul lain, seluruh matriks role, atau perangkat seluler.

## Pemeriksaan yang belum dilakukan

- Tidak menjalankan tes yang membuat tenant/akun/berkas baru di Supabase staging: API Auth/tenant, Storage Keuangan, Storage Perpustakaan, Dokumen Digital, dan API Tahfidz.
- Tidak menjalankan tes Supabase CLI/pgTAP, race condition database, atau backup-restore lokal karena Docker dan Supabase CLI tidak tersedia di lingkungan ini.
- Inventaris ledger staging VQE yang dibaca tanpa menulis data: **150 entri**, sedangkan source memiliki **162** file migrasi. Ada 6 versi ledger yang tidak mempunyai file bernomor sama, 4 benturan nama pada versi yang sama, dan 18 file source belum tercatat. Rehearsal/`db push` staging ditahan sampai empat benturan dan enam alias lama dicocokkan dengan DDL aktual serta prosedur repair yang aman.
- UAT simpan-baca setiap modul serta rekonsiliasi migration ledger/DDL staging tetap membutuhkan fixture staging yang cocok dan pemeriksaan tim backend.
- Pemeriksaan DDL aktual, bukti backup/restore, urutan migrasi, serta penerapan migrasi Production tetap menjadi tugas tim backend. Tidak ada secret atau kredensial yang dimasukkan ke source.

## Gerbang rilis

Kandidat ini dapat dipakai tim backend untuk review source dan menjalankan CI pada commit terbaru. Jangan menganggapnya sudah menyelesaikan migrasi database atau UAT Production. Setelah pengujian staging dan review source lulus, backend dapat menentukan penerapan migrasi dan deploy berdasarkan ledger database aktual.
