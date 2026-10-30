# Audit status PR ERP4 Pesantren — 30 Oktober 2026

## Hasil verifikasi GitHub

Pemeriksaan terbaru pada repository `hamdanfaiz/ERP4-Pesantren` menunjukkan:

| PR | Status GitHub | Tindakan yang benar |
|---|---|---|
| #1–#11 | Open / Draft | Jangan merge satu per satu. Branch lama bertingkat dan sebagian memuat runtime Firebase/transisi yang sudah diganti. Tutup sebagai superseded setelah pengganti masuk ke `main`. |
| #12 | Closed / Merged | Sudah menjadi bagian `main`. |
| #13 | Open / Draft | Head `af9460e7fbdcbf788ee01c53d3bd31ae3089c5be`; CI run `41049963343` lulus 2/2. Siap digabung sebagai baseline source setelah metadata PR diperbarui. |

Head PR #13 `af9460e7fbdcbf788ee01c53d3bd31ae3089c5be` lulus GitHub Actions [run 41049963343](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41049963343), **2/2 job**. Run mencakup typecheck/build, guard RBAC yang mengunci PPOB dari permission, Docker/Compose, rehearsal migration lokal sintetis, pgTAP, API/tenant, transaksi serentak, Storage, serta backup/restore. Peer Review Tahfidz teks memiliki 33 pemeriksaan pgTAP pada run 41047481907.

Audit source PR #1–#11 memiliki matriks pengganti pada PR #13; tidak ada branch lama yang perlu digabung terpisah. Pemilik produk memutuskan PPOB/payment gateway dikeluarkan dari rilis awal; modul dan pengaturan provider dihapus, dan permission tersimpan lama tidak dapat membukanya kembali. PR #13 siap digabung sebagai baseline source yang diuji; ini bukan pernyataan bahwa ERP siap dijual. Rekonsiliasi ledger Supabase target tetap prasyarat penerapan migration. Peer Review teks lulus tes sintetis; audio dan akses Wali tidak termasuk. Bukti Wali sebelum onboarding belum tersedia; Admin dapat mencatat pelunasan manual pada tagihan kandidat. Tidak ada migration live yang diterapkan. Deployment hosting serta UAT dilakukan tim penerapan. Rincian ada di [progres penyelesaian pengembangan](PROJECT_COMPLETION_PROGRESS_2026-10-30.md), [audit integrasi lintas-modul](CROSS_MODULE_INTEGRATION_AUDIT_2026-10-30.md), [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md), dan [klasifikasi source Firebase](LEGACY_FIREBASE_SOURCE_CLASSIFICATION_2026-10-30.md).

## Mengapa PR lama tidak ditutup sekarang

Menutup PR tanpa merge hanya mengubah status PR; perubahan tidak masuk ke `main`. PR #1–#11 baru aman ditutup setelah semua perubahan yang masih dibutuhkan telah hadir pada PR #13 dan PR #13 benar-benar merged. Sebaliknya, merge PR lama bertingkat satu per satu berisiko membawa kode usang atau memerlukan cherry-pick yang menimbulkan konflik.

PR #11 melaporkan `state=open` dan `merged=false`. Nilai `merge_commit_sha` yang tidak kosong bukan bukti bahwa PR tersebut sudah merged: untuk PR yang masih terbuka GitHub memakai SHA commit uji-merge guna memeriksa apakah perubahan dapat digabung. GitHub menjelaskan perilaku tersebut pada [dokumentasi REST API Pull Requests](https://docs.github.com/en/rest/pulls/pulls).

## Kriteria penggabungan source

PR #13 hanya dapat ditandai siap review/merge setelah:

1. Cakupan rilis awal ditetapkan: PPOB/payment gateway dikecualikan dengan fail-closed; Peer Review Tahfidz dibatasi pada teks dan moderasi Ustadz.
2. Matriks audit source PR #1–#11 menunjukkan padanan perilaku pada PR #13, dan batas yang belum tersedia terdokumentasi.
3. CI lulus pada head final yang sama dengan source PR, termasuk typecheck/build, guard runtime Firebase, rehearsal sintetis, pgTAP, API/tenant, Storage, transaksi serentak, dan backup/restore.
4. Dokumen menjelaskan bahwa target Supabase belum direkonsiliasi, tidak ada migration live diterapkan, dan deployment/UAT menjadi tugas tim penerapan.

**Status keputusan pada checkpoint:** PR #13 Open/Draft dan siap ditandai siap review lalu digabung sebagai baseline source. Setelah merge diverifikasi di `main`, tutup PR #1–#11 sebagai superseded, bukan merged. PR #12 sudah Closed/Merged. Perkiraan kematangan fitur tetap sekitar 73%; rekonsiliasi ledger Supabase target, deployment, login, dan UAT belum dinyatakan selesai.
