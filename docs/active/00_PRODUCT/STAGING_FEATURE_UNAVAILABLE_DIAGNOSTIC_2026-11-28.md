# Diagnosis Pesan Fitur Tidak Tersedia — 28 November 2026

## Temuan staging

- Situs `lightgreen-jay-425688.hostingersite.com` terhubung ke repositori `hamdanfaiz/ERP4-Pesantren`, branch `main`. hPanel menandai deployment aktif **Completed / Current** pada commit `45d9c0d6`.
- Environment variables memuat nama `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, dan `SUPABASE_PROJECT_REF`. Nilainya tidak dibuka. Pemilik sebelumnya mengonfirmasi project ref cocok dengan VQE `vqemuyzveuirlkvdggjd`.
- Flag server yang dibaca satu per satu aktif (`true`): PPDB, Keuangan, Anggaran, UKS, Koperasi, Multi-Unit, HRIS, Pemesanan Fasilitas, Aset GA, Donasi/Wakaf, Marketplace, dan CRM. Tidak ada flag yang diubah.
- Runtime Logs Hostinger untuk deployment aktif hanya menunjukkan startup (`Server listening on 0.0.0.0:3000`), dengan 0 error pada periode yang dipilih. Log tersebut belum memuat bukti permintaan API dari halaman modul.
- Source `src/App.tsx` memetakan ID menu untuk modul-modul itu ke halaman Supabase khusus. `FEATURE_UNAVAILABLE` adalah pesan umum yang dapat dikirim API ketika backend tidak siap. Pesan tersebut tidak membuktikan bahwa halaman modul hilang atau flag server tidak aktif.
- Saat pemeriksaan browser, sesi Admin tidak tersedia lagi setelah halaman kembali ke beranda publik. UAT authenticated pada modul yang dilaporkan dan pemeriksaan status HTTP endpoint belum dapat diulang tanpa login Admin.

## Perubahan diagnostik source

`src/server/identityStore.ts` mengubah kegagalan baca profil menjadi pesan umum sehingga layar pengguna tidak memuat detail internal. Sebelum perubahan ini, kode tersebut tidak mencatat kode error Supabase atau status HTTP yang aman untuk backend. Perubahan ini menambahkan log server terstruktur hanya untuk konfigurasi Supabase identity yang hilang, pembacaan profil, dan health check.

Respons API HTTP 503 berkode `FEATURE_UNAVAILABLE` juga dicatat satu kali per rute statis pada setiap proses server. Log hanya memuat metode HTTP, pola rute Express tanpa nilai parameter pengguna, dan kode status fitur. Nilai path, query, body, header, akun, tenant, dan konfigurasi tidak dicatat. Tim dapat mencocokkan pola endpoint dengan flag runtime yang diperiksa pada route di `server.ts`.

Diagnostik API ini tidak akan muncul jika teks tersebut berasal dari placeholder/tab yang dinonaktifkan langsung di antarmuka, misalnya `ModulePlaceholder` atau `UnavailableSection`. Jika pesan tetap tampil tanpa log rute yang cocok setelah build ini diterapkan, sumbernya perlu ditelusuri pada komponen UI atau flag tampilan klien.

Log hanya boleh berisi nama operasi, kode error yang dibatasi format, status HTTP, jenis error, serta nama variabel konfigurasi yang hilang. Log tidak berisi pesan mentah, URL/secret, email, UID, isi record, atau parameter query. Pesan produk di frontend tetap generik.

## Langkah verifikasi berikutnya

Setelah build diagnostik diterapkan ke staging:

1. Login Admin UAT secara manual, buka satu modul yang sebelumnya menampilkan pesan tersebut, lalu muat ulang.
2. Catat endpoint dan status respons tanpa menyalin token, header Authorization, payload, atau data santri.
3. Cocokkan timestamp dengan Runtime Logs Hostinger. Jika ada `profile.read`, kode/status server akan membantu tim backend membedakan konfigurasi, schema/permission, dan gangguan koneksi tanpa membuka data pribadi.
4. Jika endpoint tidak mengeluarkan `FEATURE_UNAVAILABLE` dan layar tetap menampilkan pesan, audit state/menu atau modul tersebut secara khusus.

Belum ada perubahan pada database VQE, PTSAS Production, environment hosting, maupun data UAT. Pemeriksaan ini bukan bukti bahwa fungsi baca/tulis seluruh modul sudah lulus.
