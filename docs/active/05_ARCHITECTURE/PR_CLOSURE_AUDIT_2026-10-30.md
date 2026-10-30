# Audit status PR ERP4 Pesantren — 30 Oktober 2026

## Hasil verifikasi GitHub

Pemeriksaan terbaru pada repository `hamdanfaiz/ERP4-Pesantren` menunjukkan:

| PR | Status GitHub | Tindakan yang benar |
|---|---|---|
| #1–#11 | Open / Draft | Jangan merge satu per satu. Branch lama bertingkat dan sebagian memuat runtime Firebase/transisi yang sudah diganti. Tutup sebagai superseded setelah pengganti masuk ke `main`. |
| #12 | Closed / Merged | Sudah menjadi bagian `main`. |
| #13 | Open / Draft | Belum merged dan belum siap ditutup. Tetap menjadi PR utama untuk sumber Supabase/self-hosted yang sedang diselesaikan. |

Kode Peer Review Tahfidz pada `04ab209f5fbd716fd8f78047eaac8d259be64934` lulus GitHub Actions [run 41047481907](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41047481907), 2/2 job, termasuk 33 pemeriksaan pgTAP. Tip dokumentasi PR #13 saat audit dimulai adalah `7dea9918195c81894f96ee37ba1a64cb0e57ad5a`; [run 41048190155](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41048190155) sedang memverifikasi tip itu. Perubahan checkpoint ini juga menutup akses modul PPOB dari navigasi dan pemberian izin rilis awal; CI pada head final menjadi bukti untuk perubahan tersebut.

PR #13 tetap Draft selama audit paritas perilaku PR historis belum ditutup. Pemilik produk memutuskan PPOB/payment gateway dikeluarkan dari rilis awal; modul tetap dinonaktifkan dan izin tersimpan lama tidak dapat membukanya kembali. Rekonsiliasi ledger Supabase target tetap prasyarat penerapan migration, bukan bukti yang dapat digantikan oleh CI lokal. Peer Review teks lulus tes sintetis sesuai cakupan yang dipilih; audio dan akses Wali tidak termasuk. Tidak ada migration live yang diterapkan. Deployment hosting serta UAT dilakukan tim penerapan dan tidak termasuk bukti CI. Rincian ada di [progres penyelesaian pengembangan](PROJECT_COMPLETION_PROGRESS_2026-10-30.md), [audit integrasi lintas-modul](CROSS_MODULE_INTEGRATION_AUDIT_2026-10-30.md), [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md), dan [klasifikasi source Firebase](LEGACY_FIREBASE_SOURCE_CLASSIFICATION_2026-10-30.md).

## Mengapa PR lama tidak ditutup sekarang

Menutup PR tanpa merge hanya mengubah status PR; perubahan tidak masuk ke `main`. PR #1–#11 baru aman ditutup setelah semua perubahan yang masih dibutuhkan telah hadir pada PR #13 dan PR #13 benar-benar merged. Sebaliknya, merge PR lama bertingkat satu per satu berisiko membawa kode usang atau memerlukan cherry-pick yang menimbulkan konflik.

PR #11 melaporkan `state=open` dan `merged=false`. Nilai `merge_commit_sha` yang tidak kosong bukan bukti bahwa PR tersebut sudah merged: untuk PR yang masih terbuka GitHub memakai SHA commit uji-merge guna memeriksa apakah perubahan dapat digabung. GitHub menjelaskan perilaku tersebut pada [dokumentasi REST API Pull Requests](https://docs.github.com/en/rest/pulls/pulls).

## Kriteria status siap

PR #13 hanya dapat ditandai siap review/merge setelah:

1. Cakupan rilis awal ditetapkan: fitur tersedia atau jelas ditunda, dengan fail-closed untuk integrasi yang belum siap.
2. Audit source dan tes memastikan alur penting, tenant/role, relasi lintas-modul, retry, audit dan kegagalan parsial.
3. Firebase tidak menjadi runtime; file lama yang tersisa diklasifikasi sebagai tooling/arsip yang tidak ikut bundle atau dihapus dengan aman.
4. Migration diuji pada lingkungan sintetis yang bisa dibangun ulang. Ledger Supabase target harus direkonsiliasi sebelum penerapan pada database tersebut; tidak ada migration live yang dijalankan oleh audit ini.
5. CI hijau pada head final yang sama dengan source PR.
6. Dokumentasi tim backend menyebut batas migrasi, environment dan cara deploy secara konsisten.

**Status keputusan:** PR #13 belum dinyatakan selesai, tetap Draft dan tidak digabung. PR #1–#11 juga masih Open/Draft dan tidak ditutup. PR #12 saja yang Closed/Merged. Peer Review teks lulus CI sintetis dan PPOB/payment gateway telah dikecualikan secara eksplisit dari rilis awal. Audit paritas masih berlangsung; rekonsiliasi ledger target harus selesai sebelum migration diterapkan. Tidak ada PR yang ditutup atau digabung dalam checkpoint ini.
