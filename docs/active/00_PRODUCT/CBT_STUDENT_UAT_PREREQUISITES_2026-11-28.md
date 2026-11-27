# Prasyarat UAT sisi Santri CBT — 28 November 2026

## Ringkasan pemeriksaan

Pemeriksaan baca-saja dilakukan pada Supabase VQE staging (`vqemuyzveuirlkvdggjd`) untuk memahami mengapa ujian tidak terlihat dari portal peserta. Tidak ada data aplikasi, Auth, Storage, konfigurasi, atau Production yang diubah.

- Ujian `Ujian Sampel Fiqih Semester Ganjil` berstatus `published`.
- Jendela ujian: 19 November 2026 pukul 13.40 sampai 20 Desember 2026 pukul 13.40 WIB. Dengan demikian, pada pemeriksaan 28 November, jendela tersebut masih terbuka.
- Belum ada penugasan pada `cbt_exam_assignments` dan belum ada percobaan pada `cbt_attempts`.
- Terdapat 43 baris siswa pada tabel `students`, tetapi 0 berstatus aktif.
- Terdapat 4 profil ber-role Santri dan semuanya berstatus `suspended`; tidak ada profil Santri aktif untuk UAT.
- Tidak ada identitas pengguna, email, atau data pribadi yang dicatat dalam laporan ini.

## Arti hasil

Admin dapat membuka pratinjau baca-saja lewat **CBT → Sesi Ujian → pilih ujian → Pratinjau sisi peserta**. Pratinjau ini menampilkan soal/pilihan tanpa kunci jawaban, tanpa menyimpan jawaban, tanpa timer, dan tanpa membuat percobaan.

Tampilan peserta sebenarnya tersedia lewat **CBT → Ujian Saya** pada akun Santri aktif yang ditautkan ke data santri dan mendapat penugasan. Tombol **Mulai ujian** pada portal tersebut membuat percobaan dan memulai timer. Karena belum ada penugasan maupun akun Santri aktif, UAT sisi peserta sebenarnya belum dapat dilakukan.

## Langkah UAT berikutnya

1. Buat akun Santri sintetis khusus VQE dan kaitkan dengan satu data siswa sintetis yang aktif. Jangan mengaktifkan kembali empat profil Santri yang saat pemeriksaan berstatus ditangguhkan tanpa konfirmasi identitas serta alasan aksesnya.
2. Tugaskan ujian sintetis kepada akun tersebut. Gunakan soal nonrahasia khusus UAT bila perlu memperlihatkan halaman sebelum ujian aktif.
3. Masuk melalui browser sebagai Santri, buka **CBT → Ujian Saya**, lalu verifikasi bahwa daftar ujian, status, waktu, dan soal tampil sesuai penugasan.
4. Jangan menekan **Mulai ujian** kecuali skenario memang menguji pembuatan percobaan, autosave, dan timer; tindakan itu mengubah data staging.
5. Catat hasil baca-simpan-baca dan bersihkan fixture sintetis setelah UAT sesuai otorisasi yang berlaku.

## Batas

Ini adalah bukti status data pada VQE saat pemeriksaan, bukan bukti UAT ujian nyata. PTSAS Production tidak diakses atau diubah. UAT sisi Santri tetap menunggu akun sintetis aktif dan penugasan yang sesuai.
