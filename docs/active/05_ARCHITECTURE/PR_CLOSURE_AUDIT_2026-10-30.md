# Audit status PR ERP4 Pesantren — 30 Oktober 2026

## Hasil verifikasi GitHub

Pemeriksaan terbaru pada repository `hamdanfaiz/ERP4-Pesantren` menunjukkan:

| PR | Status GitHub | Tindakan yang benar |
|---|---|---|
| #1–#11 | Open / Draft | Jangan merge satu per satu. Branch lama bertingkat dan sebagian memuat runtime Firebase/transisi yang sudah diganti. Tutup sebagai superseded setelah pengganti masuk ke `main`. |
| #12 | Closed / Merged | Sudah menjadi bagian `main`. |
| #13 | Open / Draft | Belum merged dan belum siap ditutup. Tetap menjadi PR utama untuk sumber Supabase/self-hosted yang sedang diselesaikan. |

Commit PR #13 terbaru yang diverifikasi adalah `0cf670ba9097b7002322173adb92568f9ed8a054`. GitHub Actions [run 41041688664](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41041688664) lulus **2/2 job**, termasuk typecheck/build, runtime, Docker/Compose, rehearsal migration Supabase lokal sintetis, pgTAP, API/tenant, transaksi bersamaan, Storage dan backup/restore. Commit terbaru menambahkan pendaftaran mandiri Wali melalui email terverifikasi; tes database mencakup 19 pemeriksaan khusus alur tersebut.

PR #13 tetap Draft karena paritas perilaku historis lintas-modul belum dibuktikan penuh; Peer Review Tahfidz belum memiliki backend tersimpan; PPOB belum memiliki provider nyata; dan target Supabase belum dapat dibaca untuk rekonsiliasi migration. Source arsip Firebase sudah diklasifikasi sebagai non-runtime dengan guard CI. Tes lokal sintetis lulus, tetapi deployment hosting serta UAT dilakukan tim penerapan dan tidak termasuk bukti CI. Rincian serta daftar tindakan ada di [progres penyelesaian pengembangan](PROJECT_COMPLETION_PROGRESS_2026-10-30.md), [audit integrasi lintas-modul](CROSS_MODULE_INTEGRATION_AUDIT_2026-10-30.md), [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md), dan [klasifikasi source Firebase](LEGACY_FIREBASE_SOURCE_CLASSIFICATION_2026-10-30.md).

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

**Status keputusan:** PR #13 belum dinyatakan selesai, tetap Draft dan tidak digabung. PR #1–#11 juga masih Open/Draft dan tidak ditutup. PR #12 saja yang Closed/Merged. Run 41041688664 hijau pada head terbaru, tetapi itu belum menghilangkan gap paritas, fitur yang belum memiliki backend, atau akses target. Tidak ada PR yang ditutup atau digabung dalam checkpoint ini.
