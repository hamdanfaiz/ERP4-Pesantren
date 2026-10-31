# Snapshot Keamanan Supabase Staging — 27 Oktober 2026

> **Status diperbarui 31 Oktober 2026:** Dokumen ini adalah snapshot historis; label “staging” pada dokumen ini sudah disupersede. Dashboard menunjukkan Supabase `ptsasgdvgrbdtgyqieie` berada pada branch `main / PRODUCTION`. Jangan jalankan migration, rehearsal, repair, atau reset pada project tersebut. Ref staging terpisah belum tersedia. Data dummy Firestore tidak perlu disalin. Ikuti [audit target terbaru](./SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md) untuk keputusan operasional.

**Target:** project staging `ptsasgdvgrbdtgyqieie`  
**Sifat pemeriksaan:** baca-saja; tidak ada SQL DDL, migration, perubahan policy, atau perubahan data yang dijalankan.

## Ringkasan RLS tabel

Katalog PostgreSQL menunjukkan **119 tabel pada schema `public`**. Seluruh 119 tabel mengaktifkan dan memaksa RLS; tidak ada tabel yang RLS-nya mati.

Hanya lima tabel yang memiliki policy langsung:

| Tabel | Policy baca |
|---|---|
| `candidate_documents` | SELECT kandidat oleh Admin tenant dengan akses modul PPDB |
| `candidates` | SELECT kandidat oleh Admin tenant dengan akses modul PPDB |
| `profiles` | SELECT profil sendiri atau Admin tenant dengan akses modul pengguna |
| `tenants` | SELECT tenant aktif saat ini |
| `user_profiles` | SELECT profil milik sendiri |

**114 tabel lain tidak mempunyai policy**, sehingga akses langsung melalui Data API untuk role pengguna biasa tertutup oleh RLS. Ini konsisten dengan arsitektur aplikasi yang memproses data operasional melalui API server. Karena server memakai kunci Supabase berhak tinggi, setiap endpoint tetap wajib memvalidasi token, memuat ulang profil aktif, dan menerapkan role, izin modul, serta tenant dari profil server. Jangan menambahkan policy umum untuk membuka akses seluruh tabel.

Pemeriksaan source pada checkout lokal menemukan pembacaan frontend langsung ke tabel `profiles` pada AuthContext. Policy profil sendiri mendukung jalur tersebut. Jalur data operasional memakai API backend; unggah berkas Dokumen Digital dan Perpustakaan memakai reservasi URL unggah bertanda tangan dari backend.

## Snapshot Storage

Katalog Storage menampilkan dua bucket, keduanya privat:

| Bucket | Batas berkas | Jenis berkas |
|---|---:|---|
| `erp4-private-finance-proofs` | 3 MiB | PNG, JPEG, PDF |
| `ppdb-documents` | 2 MiB | PDF, JPEG, PNG |

Tidak ada policy pada `storage.objects`. Bucket `erp4-private-document-attachments` dan `erp4-private-library-assets` belum ada pada target yang diperiksa, sedangkan source aplikasi menyiapkan unggah melalui URL bertanda tangan. Karena itu jangan mengaktifkan runtime Dokumen Digital maupun aset digital Perpustakaan sebelum migration bucket/policy yang sesuai diterapkan dan pengujian unggah, finalisasi, unduh, serta isolasi tenant lulus. Jangan mengganti ini dengan policy Storage publik.

## Batas migrasi dan deployment

- Ledger staging menampilkan 47 versi sampai `20261206000000`; source PR #13 mempunyai 91 file sampai `20270119000000`. **44 versi belum tercatat** pada ledger yang dibaca.
- Katalog yang terlihat tidak membuktikan seluruh definisi object target identik dengan source; lakukan preflight terhadap schema, grant, policy, fungsi, dan ledger sebelum rehearsal.
- Gunakan backup yang dapat dipulihkan dan environment staging terisolasi untuk rehearsal. Jangan menerapkan 44 migration secara massal hanya karena versi belum tercatat.
- Pertahankan feature flag runtime/import tetap mati sampai schema, tenant, Auth profile, data, dan Storage setiap modul direkonsiliasi serta diuji.
- Tidak ada migration, data, Storage object, atau feature flag yang diubah pada pemeriksaan ini.

## Tindakan berikutnya

1. Jalankan preflight lineage dan audit schema/grant/policy yang membandingkan seluruh object target dengan source.
2. Siapkan backup staging yang dapat dipulihkan dan buktikan restore.
3. Rehearsal migration tertinggal bertahap di staging, lalu periksa indeks, lock, constraints, RLS, dan hasil pgTAP.
4. Pastikan API backend memiliki cakupan uji tenant/role untuk semua tabel yang diakses memakai secret key.
5. Uji unggah dan unduh privat untuk setiap bucket setelah migration terkait tersedia; pastikan tenant lain tidak dapat membaca object.
6. Baru setelah itu jalankan UAT login, transaksi, Storage, dan modul sebelum cutover.

Status PR #13 dan kesiapan go-live harus diperbarui terpisah; snapshot ini tidak menyatakan database atau produk siap deploy.
