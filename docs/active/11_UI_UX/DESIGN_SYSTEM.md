# ERP4 Pesantren Design System

Dokumen ini menjadi acuan visual dan pola interaksi bersama untuk frontend ERP4 Pesantren. Tujuannya agar modul baru dan modul yang dirapikan memakai bahasa UI yang konsisten, mudah dipahami, responsif, dan dapat diakses.

> **Status implementasi:** acuan ini merangkum fondasi UI yang ada dan aturan penerapan ke depan. Beberapa modul lama masih memakai gaya lokal dan perlu dimigrasikan bertahap; dokumen ini tidak menyatakan seluruh layar sudah mematuhinya.

## 1. Prinsip

- **Jelas sebelum dekoratif:** hierarki halaman, label tindakan, status proses, dan hasil transaksi harus mudah dipindai.
- **Konsisten lintas modul:** gunakan token dan komponen bersama sebelum menambah gaya khusus.
- **Aman untuk data operasional:** konfirmasi tindakan destruktif, jelaskan status penyimpanan, dan tampilkan error yang dapat ditindaklanjuti.
- **Responsif dan aksesibel:** fungsi utama bisa dipakai dengan keyboard, fokus terlihat, teks terbaca, dan konten tidak hilang pada layar kecil.
- **Bahasa utama antarmuka adalah Bahasa Indonesia.** Jelaskan istilah teknis yang tidak umum pada konteksnya.

## 2. Tipografi

Font utama **Inter**, dengan fallback `ui-sans-serif, system-ui, sans-serif`. `Playfair Display` dan `JetBrains Mono` tersedia sebagai font serif dan monospace untuk konteks khusus. Font dan dasar tipografi ditetapkan di [`src/index.css`](../../../src/index.css).

| Peran | Ukuran | Berat / tinggi baris |
| --- | ---: | --- |
| Judul halaman (`h1`, `.erp-page-title`) | 24 px; 20 px pada layar ≤640 px | 700 / 1.25 |
| Judul bagian (`h2`, `.erp-section-title`) | 20 px; komponen section 16 px | 600 / 1.35–1.4 |
| Judul kecil (`h3`) | 18 px | 600 / 1.4 |
| Isi dan kontrol | 14–16 px | 400–600 / sekitar 1.5 |
| Label tabel | 12 px | 700, kapital, jarak huruf ringan |
| Petunjuk dan metadata | 12–14 px | 400–500 / 1.4–1.45 |

Pertahankan ukuran isi yang nyaman dibaca. Jangan mengecilkan teks hanya agar seluruh kolom tabel muat; gunakan gulir horizontal atau tata ulang konten.

## 3. Warna dan tema

Warna aplikasi berasal dari custom properties `--erp-*` di `src/index.css`. Gunakan token, bukan nilai warna berulang dalam komponen.

| Token | Terang | Gelap | Penggunaan |
| --- | --- | --- | --- |
| `--erp-brand` | `#059669` | `#34d399` | Aksen dan pilihan aktif |
| `--erp-brand-strong` | `#047857` | `#10b981` | Tombol utama dan aksen kontras |
| `--erp-brand-soft` | `#d1fae5` | `#064e3b` | Latar aksen ringan |
| `--erp-text` | `#0f172a` | `#e2e8f0` | Teks utama |
| `--erp-text-muted` | `#64748b` | `#94a3b8` | Teks pendukung |
| `--erp-surface` | `#ffffff` | `#0f172a` | Kartu, panel, kontrol |
| `--erp-surface-subtle` | `#f8fafc` | `#111827` | Permukaan sekunder |
| `--erp-border` | `#e2e8f0` | `#334155` | Border komponen |
| `--erp-focus` | `#10b981` | `#34d399` | Fokus keyboard |
| `--erp-error` | `#b91c1c` | `#fca5a5` | Error dan status gagal |

Status sukses, peringatan, dan informasi harus memiliki label atau ikon selain warna. Pastikan kontras teks dan kontrol memadai pada kedua tema.

## 4. Bentuk, jarak, dan container

- Gunakan skala jarak kelipatan 4 px (4, 8, 12, 16, 24, 32 px).
- Radius kartu/panel: `--erp-card-radius` (16 px); radius kontrol: `--erp-control-radius` (12 px). Tab dan pembungkus tabel memakai radius sekitar 14–16 px.
- Gunakan `.erp-card`, `ERPPanel`, atau `.erp-panel` untuk panel dengan permukaan, border, dan bayangan halus.
- Bungkus halaman utama dengan `ERPPageContainer` / `.erp-page-container`: padding 20 px, menjadi 12 px pada lebar ≤640 px.
- `.glass-card` dan `.glass-panel` ditujukan untuk konteks visual khusus, bukan pengganti semua container.

## 5. Komponen bersama

Implementasi React ada di [`src/components/ERPDesignSystem.tsx`](../../../src/components/ERPDesignSystem.tsx); token dan CSS-nya di `src/index.css`.

| Kebutuhan | Komponen atau pola |
| --- | --- |
| Tab | `ERPTabs`; gunakan ID stabil, label aksesibel, keadaan aktif jelas, dan callback perubahan. |
| Halaman dan panel | `ERPPageContainer`, `ERPPanel`, `.erp-page-title`, `.erp-section-title`. |
| Form | `ERPFormField` untuk label, tanda wajib, hint, dan error; hubungkan label ke input. Kontrol standar minimal 40 px tinggi. |
| Tombol | `.erp-button-primary` untuk aksi utama, `.erp-button-secondary` untuk aksi pendamping. Tentukan `type` eksplisit. Tombol harus punya handler nyata atau dinonaktifkan dengan alasan jelas. |
| Tabel | `ERPTable` bila sesuai; gunakan header bermakna, key baris stabil, caption aksesibel bila dibutuhkan, dan pembungkus yang dapat digulir. |
| Kosong / gagal / memuat | `ERPEmptyState`, `ERPErrorState`, `ERPLoadingState`; jelaskan status dan langkah berikutnya. |

### Aturan tombol

- Gunakan label tindakan spesifik, misalnya **Simpan perubahan**, bukan **OK**.
- Konfirmasi penghapusan, pembatalan transaksi, dan tindakan yang sulit dipulihkan; sebutkan objek yang terdampak.
- Cegah pengiriman berulang ketika proses berjalan, tampilkan status, lalu beri hasil sukses atau error.
- Area sentuh minimal 40 px. Ikon tanpa teks harus punya accessible name.

### Aturan form dan validasi

- Placeholder bukan pengganti label. Tampilkan field wajib, format, dan batasan input.
- Letakkan pesan error dekat field terkait dan jangan menghapus input valid saat server menolak data.
- Gunakan teks/semantik untuk menandai error; jangan mengandalkan warna saja.

### Tab, tabel, dan status

- Jangan mencampur navigasi halaman dengan filter seolah-olah keduanya tab yang sama.
- Tab aktif harus terlihat dan terbaca teknologi bantu; pada layar sempit boleh digulir tanpa memotong label.
- Format tanggal, mata uang Rupiah, angka, dan status secara konsisten.
- Bedakan status kosong, loading, error, dan hasil pencarian kosong. Error tidak boleh menampilkan secret, stack trace, atau data sensitif.

## 6. Responsif

Breakpoint dasar bersama adalah 640 px (`max-width: 640px`). Uji pada lebar telepon, tablet, dan desktop.

- Pada telepon: gunakan padding halaman 12 px, izinkan tab horizontal scroll, susun tindakan agar tidak meluber, dan hindari lebar tetap yang memotong isi.
- Bungkus tabel dengan area horizontal scroll atau sediakan tampilan kartu yang setara; jangan memotong kolom diam-diam.
- Periksa portrait, landscape, zoom browser 200%, serta data panjang seperti nama, alamat, angka, dan error.

## 7. Aksesibilitas dan gerak

- Gunakan elemen semantik (`button`, `nav`, `main`, `section`, tabel dengan header) dan nama aksesibel untuk kontrol ikon.
- Fokus keyboard terlihat lewat `:focus-visible`; jangan menghapus outline tanpa pengganti setara. Semua fungsi harus dapat digunakan tanpa mouse.
- Gunakan `role="status"` / `aria-live` untuk pembaruan non-kritis dan `role="alert"` untuk error yang perlu segera diketahui.
- Hormati `prefers-reduced-motion`. Animasi tidak boleh menjadi syarat untuk memahami informasi.

## 8. Aturan penerapan

1. Periksa komponen bersama sebelum menambah pola lokal.
2. Jika pola dipakai di beberapa modul, pindahkan ke token atau komponen bersama dan dokumentasikan variasi yang memang diperlukan.
3. Hindari selector global yang mengubah elemen di luar konteks. Pilih class komponen yang eksplisit.
4. Periksa tema terang/gelap serta lebar layar kecil saat mengubah token atau komponen.
5. Untuk perubahan lintas modul, periksa keadaan normal, aktif, hover, fokus, disabled, loading, kosong, dan error.
6. Jika kode berbeda dari acuan ini, selaraskan kode atau dokumentasikan pengecualian beserta alasannya.

## 9. Sumber implementasi

- Token warna, font, ukuran dasar, responsive behavior, dan CSS primitives: [`src/index.css`](../../../src/index.css)
- Tab, container, panel, form, tabel, dan feedback states: [`src/components/ERPDesignSystem.tsx`](../../../src/components/ERPDesignSystem.tsx)
- Indeks UI/UX: folder `docs/active/11_UI_UX/`

