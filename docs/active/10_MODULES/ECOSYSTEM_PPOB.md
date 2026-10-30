# Modul Ecosystem Services & PPOB

> **Status rilis:** dikecualikan dari rilis awal atas keputusan pemilik produk. Menu, konfigurasi provider, dan izin modul tidak tersedia. Isi dokumen ini merupakan arah pengembangan fase berikutnya, bukan deskripsi kemampuan ERP yang aktif.

## Tujuan
Mengelola transaksi ekosistem pembayaran multipel (PPOB), kampanye donasi/amal terintegrasi (ZISWAF), serta tata kelola tabungan masa depan yang mencakup peruntukan khusus seperti (Umroh, Haji, dan Qurban) dalam portal keuangan terpadu.

## Fitur Utama

1. **Integrated Dashboard KPI**
   - Menampilkan total "PPOB Trx Vol (YTD)", indikator "ZISWAF Collected", serta agregasi "Savings / Tabungan AUM".
   - Dibekali instrumen *AreaChart* (Recharts) yang menginterpretasikan PPOB Monthly Volume, plus bagan visual Pie Chart untuk "ZISWAF Fund Distribution".

2. **PPOB Manager**
   - Panel eksekusi transaksi yang mengoordinir tagihan (Pulsa, Token PLN, PDAM, BPJS, E-Wallet Topup, dsb).
   - Menampilkan `Recent Transactions` pada tabel yang merangkum *Transaction ID, Service Type, Customer Target, Date/Time*, hingga besaran (Amount) lengkap dengan penanda keberhasilan *(Success, Pending, Failed)* berbalut micro-component cerdas.

3. **ZISWAF Gateway**
   - Katalog kampanye Zakat, Infaq, Shadaqah, dan Wakaf berbasis *progress tracking bar*.
   - Tiap item merepresentasikan klasifikasi jenis sumbangan dilengkapi info spesifik seputar jumlah partisipan ("Donors"), status pemenuhan target numerik, lengkap dengan indikator progress pengumpulan (%).

4. **Future-Savings Track (Umroh/Qurban)**
   - Modul direktori peruntukan tabungan peserta yang memproyeksikan target pembiayaan masa depan.
   - Kolom-kolom menginformasikan spesifikasi (Group/Student/Parent), nilai target (Goal), serta grafik linear berkesinambungan (Progress Track).
