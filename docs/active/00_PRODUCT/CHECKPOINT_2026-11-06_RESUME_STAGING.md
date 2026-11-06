# Checkpoint Pengembangan — 6 November 2026, 22.20 WIB

Dokumen ini menjadi status terbaru untuk melanjutkan pekerjaan. Catatan historis yang lebih lama di PR #40 harus dibaca sebagai snapshot pada tanggalnya; checkpoint ini menggantikannya untuk status CI, staging, dan migration.

## Sumber dan CI

- Sumber review adalah PR #40 pada branch `codex/menu-owner-placement-20261101`; Production `main` tidak berubah.
- Head kode yang sudah diuji: `c61825935c49b642d8bed08b16e7c428a73add15`.
- GitHub Actions [run #1182](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42240030473) lulus **3/3 job** pada head tersebut: uji database/API, instalasi dependency, serta build/frontend dan smoke test.
- Cakupan job database mencakup replay migration pada baseline sintetis, 67 berkas pgTAP/1.643 assertions, tes race NIS/Tahfidz/kapasitas kamar, tenant dan status gedung, API Auth/isolasi tenant, Finance, Storage, dan backup/restore lokal CI. Ini bukan pengganti UAT aplikasi di browser atau rehearsal Production.
- PR #40 masih terbuka dan siap ditinjau; belum di-merge. Riwayat PR #38/#39 tetap terkonsolidasi di PR #40.

## Perubahan dan verifikasi VQE staging

- Migration source `20270304000000_student_room_assignment_reference_locks.sql` telah diterapkan ke VQE `vqemuyzveuirlkvdggjd`; Production `ptsasgdvgrbdtgyqieie` tidak disentuh.
- Fungsi yang diperbarui menahan perubahan status tenant selama transaksi dan memakai row lock pada referensi gedung/kelas sehingga validasi relasi tidak berlomba dengan perubahan konfigurasi.
- Verifikasi katalog baca-saja: `assign_student_to_room` dapat dieksekusi hanya oleh `service_role`; core `onboard_accepted_ppdb_candidate` tidak diekspos ke role API; wrapper Admin tepercaya dapat dipanggil hanya oleh `service_role`; tidak ada izin eksekusi untuk `anon` atau `authenticated`.
- **Rekonsiliasi ledger belum selesai.** Supabase MCP mencatat SQL migration baru dengan alias versi waktu `20261106151606`, sedangkan versi source adalah `20270304000000`. Daftar VQE kini memiliki 136 baris: 135 versi source sampai `20270303000000`, ditambah satu alias tersebut. SQL/fungsi sudah diterapkan, tetapi ledger belum canonical. Jangan menjalankan ulang DDL; perbaiki hanya metadata versi alias setelah ada konfirmasi pengguna saat ia aktif pukul 05.00 WIB.
- Hasil uji GitHub #1182 berasal dari source migration canonical pada commit `c618...`; status ledger staging yang beralias perlu dibereskan terpisah.

## Temuan security dan performa VQE

- 162 tabel memiliki RLS aktif tetapi tanpa policy. Pemeriksaan grant membuktikan tabel-tabel tersebut tidak memberi akses table kepada `anon` maupun `authenticated`; keadaan ini fail-closed. Jangan menambah policy secara massal hanya untuk menghilangkan temuan INFO.
- Advisor memberi peringatan bahwa perlindungan kata sandi bocor belum aktif. Minta operator mengaktifkannya pada Auth VQE setelah konfirmasi pemilik; jangan mengubah Auth Production.
- Advisor performance menandai 258 foreign key tanpa indeks B-tree pendukung dan 95 indeks yang belum dipakai. Angka indeks tidak boleh diperbaiki massal: ukur workload skala pesantren besar, periksa duplikasi/fungsi indeks dan dampak lock, lalu usulkan batch yang terukur. Peringatan indeks belum terpakai berisiko rendah pada staging berisi sedikit data.
- Health advisor tidak melaporkan lint aktif pada pemeriksaan sebelumnya.

## Status Production dan batas migrasi

- Inventaris baca-saja Production yang diberikan pemilik sebelumnya mencatat 47 baris ledger dibanding 136 file migration source; selisih 89 versi ledger **bukan** bukti bahwa semua DDL belum diterapkan.
- Dua migration `20261031104213` dan `20261031225438` terbukti memiliki objek DDL yang belum ada di Production. Efek inti dua migration lain yang tercatat tanpa nama/payload sudah ditemukan.
- Pemeriksaan belum merupakan perbandingan katalog lengkap. Backup/restore Production dan `db push --dry-run` langsung terhadap Production belum diverifikasi. Jangan menjalankan DDL, `db push`, atau perbaikan ledger di Production.
- Tim backend yang punya akses Production harus meninjau PR #40, melakukan inventaris katalog lengkap, membuktikan backup/restore, lalu menjalankan rehearsal/dry-run pada commit yang sama sebelum membuat rencana cutover.

## Langkah lanjut berurutan

1. Saat pemilik aktif pukul 05.00 WIB, minta persetujuan terbatas untuk merekonsiliasi **satu baris VQE saja** dari `20261106151606` ke `20270304000000`; tidak menjalankan ulang DDL dan tidak menyentuh Production. Jika persetujuan tidak diberikan, biarkan alias dan minta operator backend yang menanganinya.
2. Minta pemilik/operator menyalakan leaked-password protection di Auth VQE; verifikasi status setelah perubahan.
3. Tim backend meninjau source PR #40 dan advisor index; utamakan validasi serta rencana indeks berbasis workload.
4. Jalankan UAT browser Admin/Wali, seluruh navigasi, import/export, relasi Master Data, PPDB, onboarding/NIS, penempatan kamar, Tahfidz, finance, Storage, isolasi tenant, dan responsif. Bersihkan fixture uji setelah selesai.
5. Lengkapi rehearsal Production (inventaris penuh, backup yang dapat dipulihkan, dry-run pada head review, daftar migration yang akan dijalankan). Cutover Production tetap menunggu gate dan operator backend.

## Persentase kemajuan yang dapat dibuktikan

- Validasi otomatis pada head `c618...`: **3/3 job CI (100% dari job pada run #1182)**.
- Penuntasan ledger versi migration terbaru di VQE: **belum selesai (1 alias menunggu rekonsiliasi)**.
- Kesiapan Production/UAT komersial: **belum dinyatakan siap**; UAT browser, audit skema penuh, backup/restore Production, dry-run Production, dan review backend masih terbuka. Persentase keseluruhan produk tidak dihitung dari satu run CI agar tidak memberi angka kesiapan yang menyesatkan.

## Batas perubahan lokal

Worktree `erp4-pr38-40-integration-20261106` berisi perubahan tracked/untracked dan basisnya berbeda dari head PR #40. Jangan push seluruh worktree. Untuk source aplikasi, gunakan branch PR #40; perubahan lokal perlu ditinjau dan direkonsiliasi satu per satu sebelum diambil.
