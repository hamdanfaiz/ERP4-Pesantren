# Audit status PR ERP4 Pesantren — 30 Oktober 2026

## Hasil verifikasi GitHub

Pemeriksaan terbaru pada repository `hamdanfaiz/ERP4-Pesantren` menunjukkan:

| PR | Status GitHub | Tindakan yang benar |
|---|---|---|
| #1–#11 | Closed / tidak merged | Ditutup sebagai superseded setelah pengganti masuk ke `main`; perubahan branch lama tidak diklaim merged. |
| #12 | Closed / Merged | Sudah menjadi bagian `main`. |
| #13 | Closed / Merged | Head `e449c234c253eb7a65795af18c5794fa45e6e9cb`; CI run `41051400486` lulus 2/2; merge commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`. |

Head PR #13 `af9460e7fbdcbf788ee01c53d3bd31ae3089c5be` lulus GitHub Actions [run 41049963343](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41049963343), **2/2 job**. Run mencakup typecheck/build, guard RBAC yang mengunci PPOB dari permission, Docker/Compose, rehearsal migration lokal sintetis, pgTAP, API/tenant, transaksi serentak, Storage, serta backup/restore. Peer Review Tahfidz teks memiliki 33 pemeriksaan pgTAP pada run 41047481907.

Audit source PR #1–#11 memiliki matriks pengganti pada PR #13; tidak ada branch lama yang perlu digabung terpisah. Pemilik produk memutuskan PPOB/payment gateway dikeluarkan dari rilis awal; modul dan pengaturan provider dihapus, dan permission tersimpan lama tidak dapat membukanya kembali. PR #13 telah masuk ke `main` sebagai baseline source yang diuji; ini bukan pernyataan bahwa ERP siap dijual. Rekonsiliasi ledger Supabase target tetap prasyarat penerapan migration. Peer Review teks lulus tes sintetis; audio dan akses Wali tidak termasuk. Bukti Wali sebelum onboarding belum tersedia; Admin dapat mencatat pelunasan manual pada tagihan kandidat. Tidak ada migration live yang diterapkan. Deployment hosting serta UAT dilakukan tim penerapan. Rincian ada di [progres penyelesaian pengembangan](PROJECT_COMPLETION_PROGRESS_2026-10-30.md), [audit integrasi lintas-modul](CROSS_MODULE_INTEGRATION_AUDIT_2026-10-30.md), [audit paritas PR #1–#11](PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md), dan [klasifikasi source Firebase](LEGACY_FIREBASE_SOURCE_CLASSIFICATION_2026-10-30.md).

## Penutupan branch lama

PR #13 sudah merged sebelum PR #1–#11 ditutup. Branch lama bertingkat dan sebagian memuat runtime Firebase/transisi yang telah diganti; menggabungkannya satu per satu berisiko membawa ulang implementasi lama. Penutupan tidak mengubah fakta bahwa PR #1–#11 tidak merged.

Sebelum ditutup, PR #11 melaporkan `state=open` dan `merged=false`. Nilai `merge_commit_sha` yang tidak kosong bukan bukti bahwa PR tersebut sudah merged: untuk PR yang masih terbuka GitHub memakai SHA commit uji-merge guna memeriksa apakah perubahan dapat digabung. GitHub menjelaskan perilaku tersebut pada [dokumentasi REST API Pull Requests](https://docs.github.com/en/rest/pulls/pulls).

## Kriteria penggabungan source

PR #13 hanya dapat ditandai siap review/merge setelah:

1. Cakupan rilis awal ditetapkan: PPOB/payment gateway dikecualikan dengan fail-closed; Peer Review Tahfidz dibatasi pada teks dan moderasi Ustadz.
2. Matriks audit source PR #1–#11 menunjukkan padanan perilaku pada PR #13, dan batas yang belum tersedia terdokumentasi.
3. CI lulus pada head final yang sama dengan source PR, termasuk typecheck/build, guard runtime Firebase, rehearsal sintetis, pgTAP, API/tenant, Storage, transaksi serentak, dan backup/restore.
4. Dokumen menjelaskan bahwa target Supabase belum direkonsiliasi, tidak ada migration live diterapkan, dan deployment/UAT menjadi tugas tim penerapan.

**Status setelah integrasi source:** PR #13 dan #12 Closed/Merged. PR #1–#11 Closed, tidak merged, dan superseded oleh PR #13. Perkiraan kematangan fitur tetap sekitar 73%; rekonsiliasi ledger Supabase target, deployment, login, dan UAT belum dinyatakan selesai.
