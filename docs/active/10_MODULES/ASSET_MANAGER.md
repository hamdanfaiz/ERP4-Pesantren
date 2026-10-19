# Modul Asset Management (Asset Manager)

## Tujuan
Sistem pencatatan terpadu untuk aset fisik sekolah dan pesantren. Modul ini difokuskan pada pemantauan siklus hidup aset, depresiasi, nilai aset, serta penjadwalan pemeliharaan rutin.

## Fitur Utama

1. **Dashboard Overview**
   - **Distribution Chart:** Visualisasi Recharts Pie Chart interaktif mengenai distribusi nilai/kategori dari berbagai aset (Elektronik, Furniture, Kendaraan, Fasilitas).
   - **Expenditure Tracking:** Visualisasi bar chart pengeluaran bulanan terkait "Acquisitions" (pembelian baru) dan "Maintenance Costs" (biaya pemeliharaan).

2. **Asset Registry**
   - Direktori daftar aset beserta status kelayakan (Excellent, Good, Fair) dan status operasional (Active, In Maintenance).
   - **Add Asset Feature:** Memiliki modal pendaftaran aset baru yang diintegrasikan agar langsung muncul pada registry state tanpa reload.
   - **QR Integration:** Setiap set data memiliki kode QR dynamis yang *ready-to-print*. Tombol "Scan QR" pada menu utama akan mengaktifkan kamera gawai (via library `react-qr-scanner`) dan otomatis memunculkan detail item jika ID cocok dengan metadata server.
   - **Check-in / Check-out:** Integrasi transfer perpindahan hak guna pada modal details. Ketika status asetya tersedia, tombol check-out dapat dipanggil untuk meregister nama peminjam secara dinamis.
   - **Print Labels View:** Tombol "Print Labels" membuka layout khusus (`isPrinting` mode) yang membersihkan seluruh UI yang tidak relevan (seperti navigasi dan tabel), kemudian memetakan seluruh QR aset dalam grid yang dioptimalkan untuk dicetak. Mode print ini menggunakan CSS media query khusus dan command native browser (`window.print()`).
   - **Detail Panel (Modal):** Ketika aset diklik, sistem membuka modal / side-panel yang menampilkan QR Code mockup (untuk pencatatan fisik life-cycle label) serta meta-data tambahan (lokasi spesifik gedung).

3. **Maintenance Logs**
   - Buku log khusus untuk riwayat *service* dan perbaikan peralatan/fasilitas, memuat tanggal, biaya, estimasi masalah, dan label kelengkapan (Completed / In Progress).
   - **Form Submission Modals:** Tombol "Log Maintenance" memanggil modal input khusus di mana pengguna dapat memilih ID log target (dengan integrasi master array MOCK_ASSETS), mendeskripsikan kendala, memasukkan estimasi budget perbaikan dan mengubah status secara real-time. Form ini langsung menambahkan data baru dalam log tabel secara stateful.

## Rencana Pengembangan Lanjutan (Firebase Migration)
- Memindahkan master asset data (`MOCK_ASSETS` dan `MAINTENANCE_LOGS`) dari state lokal menuju struktur document pada Cloud Firestore.
- Integrasi module dengan **Finance Manager** (sinkronisasi nilai depresiasi ke grand ledger bulanan) dan penggabungan dengan modul **Procurement Manager** (mengubah Purchase Order yang telah *Fulfilled* menjadi Entri Aset Baru otomatis di buku registrasi).
