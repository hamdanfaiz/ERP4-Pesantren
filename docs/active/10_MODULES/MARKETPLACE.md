# Modul Marketplace ERP4 Pesantren

## Tujuan
Menyediakan portal e-commerce mutakhir yang menghubungkan entitas wali santri, jejaring alumni, maupun masyarakat publik (Public) menuju produk-produk kewirausahaan santri (Student Biz), penjualan seragam, hingga merchandise resmi institusi asrama. Modul ini bertujuan menanamkan kemandirian ekonomi pesantren lewat otomatisasi pemesanan (Order Tracking).

## Fitur Utama

1. **E-Commerce Storefront (Katalog)**
   - View e-commerce interaktif yang dibekali placeholder gambar dinamis (mengadaptasi emoji/icon) untuk setiap komoditas: **Uniforms, Books, Student Biz, dan Merchandise**.
   - Sistem *Rating* produk dan identifikasi label "Seller" (contoh: Koperasi, Kantin Kls 12, Pustaka As-Salam).
   - Fitur Filter cerdas berbasis kategori.

2. **Order Management Board**
   - Tab khusus manajerial berisi perincian `Recent Orders` dari para pembeli dengan rujukan identifikasi lengkap (Order ID).
   - Label metrik customer ter-ekstraksi (contoh: Parent, Public, Alumni).
   - Indikator status pesanan reaktif (*Pending*, *Processing*, *Ready to Ship*, *Delivered*) untuk menjamin pemenuhan standar (fulfilment).

3. **Analytics & Performance Tracking**
   - Rangkuman `Total Revenue`, performansi komparasi harian (*Orders Today*), dan kalkulasi `Avg. Order Value / Conversion Rate`.
   - Modul ini mengunggah grafik visual **Area Chart** ber-ekstensi **Recharts** untuk memetakan Weekly Sales Category Trend dengan format bertumpuk (*stacked areas*) membedakan kontribusi omzet antara buku, seragam, dan kewirausahaan santri.

4. **Inventory dan pencatatan stok**
   - Admin dengan izin Marketplace mendaftarkan produk dan mencatat penyesuaian stok. Setiap perubahan dicatat ke ledger stok tenant melalui transaksi server.


## Runtime dan kondisi awal

- Runtime Marketplace membaca dan menulis data dari Supabase per tenant. Tenant baru boleh memulai dengan katalog kosong; ketiadaan batch impor arsip tidak memblokir tampilan maupun transaksi.
- Admin mengisi produk pertama secara manual melalui tab Persediaan. Pesanan dan perubahan stok menggunakan RPC tenant-scoped dengan idempotensi dan transaksi stok.
- Impor katalog/riwayat lama merupakan jalur opsional yang terpisah, berada di balik feature flag khusus, dan tidak wajib untuk mengaktifkan runtime.
- Data Firestore tidak disalin. Pengujian memakai tenant dan produk sintetis, lalu membersihkan fixture setelah pengujian.
