# Checkpoint pengembangan RKAT per unit — 30 Oktober 2026

## Progres

**Penyelesaian pengembangan proyek: sekitar 73% (rentang kerja 70–75%).** Persentase ini tidak memasukkan deployment hosting atau UAT. Implementasi RKAT per unit merupakan satu bagian dari pekerjaan; integrasi lintas modul dan isolasi unit lain masih terbuka.

## Perubahan pada branch PR #13

- Menambahkan rencana dan alokasi RKAT tenant-scoped dengan status rancangan, disetujui, dan ditutup; audit pembuat/pemeriksa serta kunci permintaan idempoten.
- Setiap rencana baru memerlukan unit aktif milik tenant yang sama. Periode anggaran boleh sama pada unit berbeda, tetapi tumpang tindih ditolak dalam satu unit.
- Rencana lama tanpa unit tetap dapat dibaca dan tidak dipetakan otomatis. Admin dapat memetakan secara eksplisit ke unit yang sama tenant, dengan validasi periode dan pencatatan audit; rencana harus dipetakan sebelum disetujui.
- Realisasi hanya menghitung pengeluaran disetujui yang memiliki posting ledger dengan tenant dan unit yang sama, dalam periode serta dimensi anggaran yang sama. Realisasi rencana lama yang belum dipetakan ditampilkan kosong.
- Halaman Keuangan & Anggaran memilih unit, membatasi daftar dan ringkasan ke unit tersebut, dan menyediakan alur pemetaan rencana lama.
- Feature flag Finance/RKAT tetap mati secara bawaan. Migration belum diterapkan ke Supabase live.

## Migration dan pengujian

- 20270125000000_finance_budget_plans.sql menyediakan lifecycle dasar RKAT.
- 20270129000000_finance_budget_unit_scope.sql menambah relasi unit, constraint untuk record baru, keunikan periode per unit, dan pemetaan eksplisit untuk record lama.
- supabase/tests/finance_budget_plans.test.sql mencakup 53 assertion: role/tenant, unit aktif/nonaktif, periode lintas-unit, realisasi yang tidak bocor antarunit, pemetaan legacy, idempotensi, dan lifecycle.
- GitHub Actions run 40994025913 lulus **2/2 job** pada commit 6ba1fdb8bfcfcd5834c9063c4cd7d37953c08c56. Hasil database: **51 file uji, 1.130 assertion, PASS**; job frontend juga lulus typecheck, build, smoke test runtime tanpa Firebase, Docker/Compose, dan konfigurasi deployment.
- Semua uji menggunakan Supabase lokal dan data sintetis. Tidak ada migration/data Supabase live yang ditulis.

## Pekerjaan lanjutan

RKAT baru kini memiliki batas unit pada source dan CI; feature flag sengaja tetap tertutup sampai deployment menjalankan migration pada environment yang sesuai. Unit scoping tagihan, Akademik, Asrama, dan rekonsiliasi record lama masih menjadi pekerjaan pengembangan. PR #13 masih **Open / Draft** dan belum siap merge; skor proyek tetap 73%.
