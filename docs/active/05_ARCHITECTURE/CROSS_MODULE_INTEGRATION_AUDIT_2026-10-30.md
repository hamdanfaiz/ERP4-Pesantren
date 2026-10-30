# Audit Integrasi Lintas-Modul — 30 Oktober 2026

## Batas audit

Audit ini mencocokkan relasi data dan jalur integrasi inti di source PR #13 dengan migration, API, serta tes otomatis yang dijalankan GitHub Actions. Bukti pada Supabase lokal sintetis tidak membuktikan keberhasilan login pelanggan, isi database target, deployment atau UAT.

Head kode yang menjadi dasar audit source: `430929f15f36ba3b238c5809d6252d60c0055c41`. Dua tes pgTAP Asrama ditambahkan pada commit `e33de842bdff555d229c6d314eb127c8f0e2bc08`; GitHub Actions [run 41033358731](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41033358731) lulus 2/2 job pada commit itu. Run sebelumnya 41030673093 dan 41031941492 juga lulus masing-masing 2/2.

## Bukti alur utama

| Alur | Relasi dan kontrol di source | Bukti otomatis yang ditemukan | Hasil audit source |
|---|---|---|---|
| PPDB publik → calon santri → dokumen | Endpoint server menyimpan pendaftaran ke Supabase; ID pendaftaran dan klaim identitas dibuat secara transaksional, permintaan berulang dibatasi idempotency key, berkas menggunakan bucket privat. | `public_ppdb_runtime.test.sql`, `public_ppdb_idempotency.test.sql`, `ppdb_document_storage.test.sql`, `scripts/test-public-ppdb-validation.ts`, uji Storage HTTP. | Source dan tes ada; keberhasilan situs publik pada domain pelanggan belum diuji.
| PPDB Admin → proses kandidat | Kandidat dibuat/dicari/diperbarui lewat API tenant; dokumen memeriksa izin dan tenant; pencarian menggunakan pagination stabil. | `ppdb_admin_candidate_create.test.sql`, `ppdb_admin_search_keyset.test.sql`, `ppdb_document_upload.test.sql`, `scripts/test-supabase-ppdb-import.ts`. | Source dan tes ada; login role Admin nyata belum diuji.
| Kandidat diterima → Santri + Wali + NIS + kamar + riwayat | RPC onboarding membuat/menautkan Student, Guardian, `guardian_students`, reservasi NIS, status kandidat, serta penempatan dan riwayat kamar dalam satu transaksi. Retry dengan request yang sama mengembalikan hasil tersimpan tanpa menggandakan relasi atau okupansi. | `boarding_room_assignment_history.test.sql` menguji wrapper onboarding, hubungan kanonis, reservasi NIS, penempatan awal, retry dan okupansi; `scripts/test-nis-concurrency.mjs` menguji reservasi NIS bersamaan. | Relasi inti dan transaksi memiliki bukti sintetis.
| Onboarding → Finance | Tagihan kandidat dapat tetap ditautkan ke calon santri sebelum onboarding lalu ke santri kanonis sesudahnya; wali tertaut dapat mengirim bukti bayar; ledger mencatat transaksi tanpa duplikasi. | `finance_runtime.test.sql`, `finance_proof_upload_rate_limit.test.sql`, `scripts/test-finance-storage-http.mjs`. | Alur database, role dan berkas memiliki tes lokal sintetis; provider pembayaran eksternal belum diaktifkan.
| Wali → data anak pada modul terkait | Akses diturunkan dari relasi tenant `guardian_students`, bukan nama kelas atau ID yang dikirim browser; akun dinonaktifkan atau hubungan usang tidak memperluas akses. | `guardian_accounts.test.sql`, `communication_announcement_audience.test.sql`, `tahfidz_roster_pagination.test.sql`, `scripts/test-guardian-invitation-verification.ts`, `scripts/test-guardian-student-selection.ts`. | Akses Finance, pengumuman, dan Tahfidz diuji memakai relasi kanonis; pengiriman email undangan pada provider pelanggan belum diuji.
| Akademik → kelas, santri dan pengajar | Catatan memakai tenant, relasi santri/pengajar, unit, dan kelas yang konsisten; Admin punya daftar/pemetaan kelas lama; Ustadz dibatasi menurut profil/unit. | `academic_unit_scope.test.sql`, `academic_class_unit_mapping.test.sql`, `academic_request_idempotency.test.sql`, `scripts/test-academic-portal.ts`. | Isolasi dan mutasi inti memiliki tes; sinkronisasi dengan sistem eksternal belum ada.
| Asrama → unit, lokasi, penugasan, kehadiran, izin, dan kedisiplinan | Penempatan transaksional memeriksa tenant/unit/kamar; roster petugas mengikuti penugasan aktif; lokasi lama yang belum dipetakan dibatasi untuk Admin. Izin dan kedisiplinan memakai fungsi server dengan pemeriksaan tenant/role, state transition, idempotency key, dan ledger audit. | `boarding_unit_scope.test.sql`, `boarding_room_assignment_history.test.sql`, `boarding_attendance_active_students.test.sql`, `boarding_permits_workflow.test.sql`, `boarding_discipline_workflow.test.sql`. Dua tes workflow izin/kedisiplinan lulus di seluruh suite pgTAP pada run 41033358731. | Alur inti memiliki source dan tes sintetis; cakupan operasi fasilitas tertentu, pemetaan pelanggan, serta uji role di pesantren pelanggan belum dibuktikan.
| Tahfidz → halaqah, setoran, target, sesi dan Peer Review | Operasi dibatasi pada tenant, anggota halaqah, role, tanggal lokal tenant, cursor halaman, dan kunci retry. Peer Review teks melibatkan santri di halaqah aktif yang sama dan menunggu moderasi Ustadz pengampu; Wali dan audio tidak disertakan. | `tahfidz_runtime_write_api.test.sql`, `tahfidz_session_write_api.test.sql`, `tahfidz_session_result_integrity.test.sql`, `tahfidz_tenant_business_day.test.sql`, `tahfidz_roster_pagination.test.sql`, `tahfidz_peer_review_moderation.test.sql`, uji race sesi. | Alur inti dan Peer Review teks memiliki source serta tes sintetis; UAT login/role oleh tim penerapan tetap diperlukan.

## Modul lain

LMS/CBT, Perpustakaan, Koperasi, CRM, Donasi, Inventaris, Laundry, layanan kesehatan, fasilitas, dan Alumni memiliki migration serta tes spesifik tenant, transaksi, idempotensi, status atau Storage di `supabase/tests` dan `scripts`. Kehadiran tes per modul tidak dianggap sebagai bukti seluruh kemungkinan integrasi antarsemua modul; hubungan konsumen dan ekspor antar-domain tetap perlu ditinjau bersama pemilik proses.

## Batas yang masih perlu ditutup

1. **Pembayaran wali sebelum onboarding** belum tersedia; akun wali baru dapat memakai data anak setelah relasi kanonis dibuat. Putuskan apakah proses ini diperlukan pada rilis awal.
2. **PPOB/payment gateway** dikeluarkan dari rilis awal sesuai keputusan pemilik produk. Modul disembunyikan dan permission tidak dapat mengaktifkannya; provider, settlement/reversal, dan rekonsiliasi menjadi pekerjaan fase berikutnya.
4. **Notifikasi keluar** (email/WhatsApp/SMS) memerlukan konfigurasi dan uji provider masing-masing environment. CI tidak mengirim ke provider nyata.
5. **Pemakaian data lama** tidak diperlukan untuk dummy Firestore sesuai keputusan pemilik. Jika suatu pelanggan kelak memerlukan arsip riil, itu menjadi proyek migrasi terpisah dengan pemetaan dan persetujuan pelanggan.
6. **Database Supabase target** `ptsasgdvgrbdtgyqieie` belum dapat dibaca untuk rekonsiliasi ledger. Migration belum diterapkan ke target; backend harus merekonsiliasi dan melakukan rehearsal sebelum menyalakan flag runtime.

## Kesimpulan

Hubungan terpenting PPDB → onboarding → Santri/Wali/NIS/kamar dan Finance memiliki implementasi transaksional serta coverage CI sintetis. Beberapa dependensi eksternal dan fitur sekunder belum tersedia. Audit ini menutup pemeriksaan source terhadap alur utama, tetapi tidak menyatakan seluruh ERP siap deploy atau sudah UAT. Status PR #13 tetap Open/Draft hingga gap rilis diputuskan dan pekerjaan pengembangan yang disepakati dituntaskan.
