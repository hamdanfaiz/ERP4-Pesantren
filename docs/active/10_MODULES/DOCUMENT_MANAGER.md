# Modul Document Manager (Sistem Pengarsipan & E-Office)

## Tujuan
Sistem Persuratan Elektronik (E-Office) terpadu untuk digitalisasi dokumen resmi sekolah/pesantren. Memfasilitasi penyimpanan surat masuk, surat keluar, e-approval (tanda tangan digital), arsip, serta OCR scanning sertifikat dan dokumen santri dengan efisien dan berbasis artificial intelligence.

## Fitur Utama

1. **AI OCR Scanner**
   - Menggunakan model *Generative AI (Gemini)* dari Google untuk ekstrasi metadata secara cerdas dari gambar dokumen berbasis hard-copy.
   - Ekstraksi difokuskan untuk mengenali tipe dokumen (KTP, Ijazah, Invoice, Dokumen Santri), mengidentifikasi NIK/NIS, nama, dan tanggal penerbitan.
   - Diimplementasikan sepenuhnya memanfaatkan `server.ts` API Endpoint `/api/ocr` untuk proxy call sehingga key credential AI terlindungi dari runtime browser.

2. **Surat Masuk (Incoming Letters)**
   - Dashboard pengelolaan surat masuk dari institusi luar dengan sistem registrasi manual.
   - Kolom status tracking (misalnya: *Needs Disposition* atau *Disposed*) lengkap dengan fitur pencarian dan reka data real-time ke tabel dashboard.
   - Modul registrasi yang user-friendly dengan input pengirim, subjek, kategori, beserta attachment (upload form).

3. **Surat Keluar (Outgoing Letters)**
   - Terminal "Drafting" untuk membuat rancangan surat keluar secara sistematis.
   - Memonitor status operasional surat dari *Draft* > *Waiting Approval* > *Sent*.
   - Filter parameter (recipients & subjects) untuk mempermudah monitoring output administrasi.

4. **E-Approval & Digital Signature**
   - Workflow persetujuan bagi Kepala Sekolah / Pimpinan Pesantren untuk me-review surat-surat krusial yang bersifat *Waiting Approval*.
   - Memberikan pengalaman *preview layout* dengan validasi terintegrasi untuk "Reject" atau "Sign & Approve" di mana setiap entitas akan mendapatkan penempatan ID QR unik sebagai penanda stempel *Digital Signature*.

5. **Arsip Digital (Unified Repository)**
   - Repositori permanen untuk memelihara riwayat kontrak, MoU, SK (Surat Keputusan), Laporan Audit Keuangan, maupun direktori kebijakan lainnya secara aman dengan kapasitas file metrik yang terukur.

## Rencana Pengembangan Lanjutan (Firebase Migration)
- Mengintegrasikan hasil parsing AI OCR (JSON Extracted Metadata) agar bisa di-*save* ke Firebase Firestore (sebagai struktur E-Office).
- Integrasi ke Google Cloud Storage / Firebase Storage untuk menyimpan raw PDF / Image assets sebelum dan sesudah diproses AI OCR.
