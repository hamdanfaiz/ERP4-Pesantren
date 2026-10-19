# Procurement Management Module

> Modul yang mengatur proses permintaan barang, order pembelian (PO), hingga pengelolaan data vendor dan rekanan operasional Pesantren.

## Fitur Utama

1. **Dashboard Overview**
   - Menampilkan agregat data penting seperti `Pending Requests`, `Active POs`, dan `Total YTD Spend`.
   - Visualisasi grafis tren pembelanjaan (Line Chart) dan sebaran anggaran berdasarkan departemen (Pie Chart) menggunakan `recharts`.

2. **Purchase Requests (PR)**
   - Daftar pengajuan permintaan barang/layanan.
   - Status tracking yang jelas: *Pending Approval*, *Approved*, atau *Rejected*.
   - Filter parameter dan search bar (by PR ID, departemen, maupun requestor).
   - **Auto-Generate PO**: Tombol "Review" pada PR yang berstatus pending akan memunculkan detail modal, di mana manajer dapat menetapkan vendor operasional lalu mengklik "Approve & Generate PO", yang secara otomatis me-resolve PR dan membuat entri *Draft* di direktori PO terkait.

3. **Purchase Orders (PO)**
   - Direktori log dokumen pesanan final yang dikirimkan ke vendor.
   - Pendaftaran entri baru ("Create PO") dengan pemilihan entitas target yang di-link langsung dari basis data vendor, dengan besaran nominal dan tanggal estimasi kedatangan (ETA).
   - Tampilan status real-time: *Draft*, *Issued*, atau otomatis ditandai *Fulfilled*. Tindakan aksi cepat memungkinkan manager untuk mengeksekusi ("Approve & Issue") serta merekonsiliasi barang ("Mark Fulfilled").
   - **Visual Step Indicator**: Menampilkan modal dengan progres tracker visual secara real-time yang memetakan status berjalan agar manager bisa memantau dan memanajemen perpindahan milestone ("Draft" > "Issued" > "Fulfilled").

4. **Vendor Directory**
   - Pengelolaan daftar mitra/pemasok barang dan jasa ke pesantren.
   - Menampilkan Rating/Reliability (bintang) guna mengevaluasi vendor, beserta informasi kontak dan kategori suplai.
   - **Vendor Profile Modal**: Panel detail komprehensif yang menampilkan riwayat kontrak/Purchase Orders (PO) terkait, mempermudah evaluasi kinerja (kontak, performa rating) sebelum menyetujui pemesanan baru.

## Arsitektur & State
- Saat ini modul memiliki mock-data hardcoded (`MOCK_PRS`, `MOCK_POS`, `MOCK_VENDORS`) untuk simulasi environment.
- Tab Management internal yang terisolasi di fungsi `ProcurementManager()` memungkinkan navigasi views antar-submodul cepat tanpa reload (client-side state).
- Komponen menggunakan UI library *Tailwind CSS* untuk styling, *Lucide* untuk visualisasi icon bersih, dan *Recharts* dalam rendering infografis finansial.
