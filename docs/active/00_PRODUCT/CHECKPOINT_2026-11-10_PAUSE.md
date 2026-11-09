# Checkpoint jeda pengembangan — 10 November 2026

Checkpoint ini dibuat atas permintaan pemilik proyek untuk menghentikan pengembangan sementara. Tidak ada migrasi database atau perubahan pada Supabase Production.

## Sumber dan posisi kode

- Repositori: `hamdanfaiz/ERP4-Pesantren`.
- PR aktif: [#91](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/91), status **Open/Draft**, belum merge.
- Branch remote: `codex/product-copy-cleanup-20261108`.
- Head remote saat checkpoint: `47defc082f3e90b6cdfb4752600cb9b4b8f3961f`.
- Worktree: `C:\Users\VICTUS\Documents\Codex\2026-10-18\sa\erp4-pr91-source-20261109`.
- Commit lokal terbaru: `322f4a5` (`test: fix Tahfidz structure fixture defaults`). Worktree sudah di-commit. Saat melanjutkan, cocokkan isi dan head remote PR #91 sebelum membuat commit baru.

## Pekerjaan terakhir

- Ditambahkan `npm run test:api:tahfidz-runtime` untuk katalog Qur’an, halaqah, penempatan anggota, pencatatan setoran, retry idempoten, leaderboard, portal Santri, role, dan isolasi tenant.
- Fixture membuat referensi jenjang tenant sebelum Kelas serta memberikan nilai `occupied` pada setiap baris batch.
- Guard katalog mengecek Surah/Ayat dari referensi Supabase dan relasi fixture tenant.
- Pengujian lokal yang lulus setelah koreksi: `npm run test:tahfidz-quran-catalog`, `npm run test:ci-coverage` (61/61 skrip terjadwal), `npm run lint`, `node --check scripts/test-tahfidz-runtime-http.mjs`, dan `git diff --check`.
- Build frontend sebelumnya lulus pada source runtime yang sama; tidak ada kode frontend/runtime aplikasi yang diubah dalam rangkaian koreksi fixture ini.

## Temuan CI terakhir

- CI #1472 gagal karena fixture belum menyiapkan referensi jenjang tenant.
- CI #1474 gagal karena `occupied` menjadi null pada dua baris batch struktur.
- CI #1475 lulus pada job build/Firebase guard dan instalasi paket NPM, tetapi job database gagal pada penempatan anggota halaqah: API memberi HTTP 400. Gagal pada tahap yang sama dengan uji staging.
- Penyebab yang paling mungkin adalah selisih tanggal: test menghasilkan tanggal `Asia/Jakarta`, sedangkan migration membandingkan `starts_on` dengan `CURRENT_DATE` database. Pada pukul 22:51 UTC tanggal Jakarta sudah berganti ke 10 November, sementara tanggal database dapat masih 9 November. Body error belum dicatat, jadi konfirmasi dengan mengeluarkan hanya pesan error API yang aman/sudah disanitasi.
- Run #1475: [GitHub Actions](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42715069588).

## Status fixture VQE

Uji VQE mencapai pembuatan tenant, pengguna sintetis, referensi jenjang, struktur, kandidat, santri, katalog, dan halaqah. Assignment anggota mendapat HTTP 400; membership dan setoran tidak dibuat. Cleanup harness berhasil:

- Dua tenant Tahfidz uji berstatus `suspended`.
- Empat profil berstatus `suspended`; harness melaporkan empat akun Auth diblokir.
- Tenant utama menyimpan tiga baris struktur, satu kandidat, satu santri, dan satu halaqah.
- Tenant kedua tidak memiliki struktur atau data operasional Tahfidz.
- Kedua tenant tidak memiliki membership atau setoran.

Kueri cleanup dilakukan baca-saja melalui konektor Supabase **VQE staging**. Jangan aktifkan kembali fixture ini. Tidak ada perubahan atau migrasi ke PTSAS Production.

## Urutan saat proyek dilanjutkan

1. Buka PR #91 dan cocokkan head remote dengan worktree sebelum mengedit.
2. Perbaiki tanggal fixture membership agar tidak berada di masa depan menurut `CURRENT_DATE` database; tambahkan pesan API aman pada kegagalan assertion.
3. Jalankan suite Tahfidz di CI lokal sampai katalog, halaqah, membership, setoran, retry, leaderboard, pembatasan Santri, dan tenant asing lulus.
4. Ulangi suite pada VQE staging dengan fixture sintetis. Pastikan tenant/profile dinonaktifkan, akun Auth diblokir, dan membership/setoran fixture dibersihkan atau tetap tidak dapat diakses; verifikasi dengan kueri baca-saja.
5. Baru lanjutkan UAT antarmuka Tahfidz dan relasi Master Data/Asrama. PR #91 tetap Draft/Open sampai semua gate yang dicatat di [kesiapan komersial](COMMERCIAL_READINESS.md) ditutup.

## Status proyek pada jeda

- Perkiraan sebelumnya tetap sekitar **73% untuk produk/kode/handoff** dan **55% untuk bukti kesiapan operasional**. Tidak dinaikkan karena suite Tahfidz masih gagal dan belum seluruh modul/UAT terbukti.
- Belum siap dinyatakan selesai, siap merge, atau siap deploy.
- Tim backend masih perlu menyelesaikan perbandingan DDL Production, urutan migrasi, serta bukti backup/restore Production; UAT seluruh role/modul dan uji deployment VPS/on-premise juga masih terbuka.

