# Modul Dokumen Digital (E-Office)

## Tujuan

Mengelola surat masuk, surat keluar, dan dokumen internal pesantren, termasuk pencatatan metadata, penelaahan, persetujuan, lampiran PDF, serta pengarsipan. Implementasi aktif menggunakan API backend tenant dan Supabase.

## Fungsi yang tersedia di implementasi saat ini

1. **Pencatatan dokumen**
   - Jenis dokumen: masuk, keluar, atau internal.
   - Informasi utama: perihal, pengirim, penerima, tanggal dokumen, dan ringkasan.
   - Nomor dokumen diterbitkan otomatis oleh backend sesuai aturan penomoran yang aktif.

2. **Daftar dan pencarian**
   - Daftar dokumen dapat dicari dan disaring menurut jenis serta kelompok status.
   - Daftar dimuat bertahap agar pencarian dan penelusuran tidak bergantung pada pemuatan seluruh catatan sekaligus.

3. **Alur status**
   - Status yang digunakan: Terdaftar, Dalam telaah, Disetujui, Perlu perbaikan, dan Diarsipkan.
   - Perubahan status dicatat sebagai peristiwa alur dokumen.

4. **Lampiran PDF**
   - Lampiran PDF disimpan pada bucket privat.
   - Aplikasi meminta tautan unggah/unduh melalui backend; tautan unduh bersifat sementara.
   - Batas berkas pada implementasi saat ini adalah 25 MB per lampiran.

5. **Arsip Digital**
   - Dokumen berstatus arsip dapat ditelusuri melalui tab Arsip Digital.

## Hasil UAT staging

Pada 27 November 2026, Admin UAT membuat satu dokumen internal sintetis dengan nomor otomatis `DOC/2026/00004`. Catatan tetap muncul setelah daftar dimuat ulang. Alur Terdaftar → Dalam telaah → Disetujui → Diarsipkan berhasil dijalankan dan dokumen terlihat pada tab Arsip Digital.

UAT tersebut membuktikan satu alur dokumen sintetis pada tenant staging. UAT ini tidak membuktikan semua role, seluruh kemungkinan status, pemulihan berkas, atau perilaku Production. Tidak ada perubahan Production dalam UAT ini.

## Batas fitur dan tindak lanjut

- Tab **Pemindai OCR** saat ini hanya menampilkan lampiran PDF untuk ditelaah dan diunduh secara manual. Ekstraksi teks atau metadata otomatis belum tersedia. Tidak ada layanan Gemini atau endpoint OCR aktif yang dibuktikan oleh implementasi ini.
- Alur persetujuan saat ini mencatat status workflow. Tanda tangan digital kriptografis dan stempel QR belum dibuktikan tersedia; status “Disetujui” tidak boleh dipasarkan sebagai tanda tangan digital.
- Jika OCR otomatis akan dibuat, tim backend perlu menyepakati layanan pemrosesan, metadata hasil, persetujuan koreksi oleh operator, perlindungan berkas berisi identitas, serta retensi dan penghapusan hasil.
- Jika tanda tangan digital/QR diperlukan, itu perlu menjadi fungsi tersendiri dengan identitas penanda tangan, bukti persetujuan, waktu, validasi, serta audit yang dapat diverifikasi.

Dokumen ini menjelaskan implementasi ERP4 saat ini. Hindari mengacu pada rencana migrasi Firebase atau klaim OCR AI lama; runtime aktif untuk modul ini adalah backend Supabase.
