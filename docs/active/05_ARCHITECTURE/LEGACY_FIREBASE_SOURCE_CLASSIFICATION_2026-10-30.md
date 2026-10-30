# Klasifikasi Source Legacy Firebase — 30 Oktober 2026

## Kesimpulan

Firebase **bukan backend runtime** PR #13. Jalur aplikasi yang aktif menggunakan Supabase; source Firebase yang masih ada adalah kode layar lama, adapter pengganti yang menolak akses, serta helper impor arsip yang sengaja dinonaktifkan. Keberadaan nama atau paket Firebase di source tidak berarti aplikasi produksi tersambung ke Firebase.

## Klasifikasi berkas

| Kelompok | Lokasi | Perlakuan saat ini |
|---|---|---|
| Adapter/kontrak lama | `src/firebase.ts`, `src/firebaseFirestoreDisabled.ts`, `src/firebaseUtils.ts`, `src/tenantDataContracts.ts` | Tidak menjadi jalur runtime aktif. Adapter akses Firestore klien menolak operasi. Sebagian test kontrak lama masih memeriksa agar batasnya tidak dilonggarkan. |
| Layar dan komponen lama | `src/pages/*Legacy.tsx`, `src/components/*Legacy.tsx` | Arsip source untuk referensi/kompatibilitas historis; router Supabase tidak mengimpornya. Jangan aktifkan kembali untuk rilis Supabase. |
| Impor arsip server | `src/server/legacyFirestoreTenantScope.ts`, `src/server/supabase*Import.ts`, serta jalur terkait di `server.ts` | Tooling migrasi terkendali, bukan sinkronisasi runtime. Flag impor dibuat nonaktif; Firebase Admin access gate selalu menolak, dan endpoint migrasi harus tetap gagal tertutup. |
| Skrip pembuktian | `scripts/test-legacy-*`, `scripts/test-supabase-runtime-no-firebase.mjs`, `scripts/test-production-dependencies.mjs`, `scripts/test-production-runtime.mjs` | Guard/regression tests. Paket Firebase hanya dipertahankan pada dependency pengembangan untuk pemeriksaan source lama; tidak masuk instalasi dependency produksi. |
| Migration Supabase yang menyebut Firebase | `supabase/migrations/*legacy*` dan fungsi import terkait | Fungsi PostgreSQL hanya menerima snapshot yang dikirim melalui jalur impor berotorisasi. Migration tidak membuka koneksi Firebase dan tidak otomatis menyalin data. Firestore dummy tidak perlu disalin sesuai keputusan pemilik produk. |

## Bukti yang sudah dijalankan

- `scripts/test-supabase-runtime-no-firebase.mjs` memeriksa graph import aktual dari aplikasi aktif dan memastikan tidak mencapai Firebase SDK/adapter.
- `scripts/test-production-dependencies.mjs` memastikan Firebase bukan dependency produksi.
- `scripts/test-production-runtime.mjs` menjalankan smoke test image tanpa paket Firebase dan memastikan server/API tetap fail-closed.
- GitHub Actions [run 41035993207](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41035993207) lulus **2/2 job** pada head PR #13 `fd27e9a86db55e8813ad0ce1234e00392e267b2d`, termasuk guard tersebut.
- `src/runtimeBackend.ts` menetapkan `SUPABASE_ONLY_RUNTIME = true`; fitur yang punya data contoh legacy, termasuk Peer Review Tahfidz, tidak dirender dari sumber contoh ketika runtime Supabase aktif.

## Batas aman dan pekerjaan berikutnya

- Jangan menghapus source lama secara massal: beberapa test, importer arsip, dan adapter penolak masih merujuknya. Penghapusan memerlukan daftar dependensi yang terbarui serta pemeriksaan ulang graph, typecheck, build dan image.
- Jangan mengubah `legacyFirebaseGate` atau menambah cara mengaktifkan Firebase Admin pada production. Pemindahan arsip Firestore tidak diperlukan untuk data dummy ini.
- Pada pembaruan major berikutnya, source UI lama yang tidak lagi diperlukan dapat dihapus setelah pemilik produk menyetujui penghapusan dan seluruh referensi/non-runtime tests dipindah atau dihapus secara eksplisit.

## Status

Risiko “Firebase masih menjadi runtime” sudah ditutup oleh konfigurasi dan guard CI. Risiko “source lama belum diklasifikasikan” ditutup oleh dokumen ini. Ini **tidak** menutup gap paritas fitur lama, ketiadaan backend Tahfidz Peer Review, integrasi PPOB yang belum dipilih, atau rekonsiliasi ledger Supabase target.
