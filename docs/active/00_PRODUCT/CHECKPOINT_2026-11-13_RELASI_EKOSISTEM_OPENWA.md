# Checkpoint Relasi & Ekosistem + Analitik + OpenWA — 13 November 2026

Baca ini sebelum menyentuh menu **Relasi & Ekosistem**, **Pusat Data Analitik**, gateway WhatsApp, atau file terkait di bawah. Ringkasan untuk multi-agent; jangan mengulang pekerjaan yang sudah diverifikasi tanpa alasan.

## Ruang lingkup menu

| Menu sidebar | Module id | Halaman runtime |
| --- | --- | --- |
| Data Alumni | `alumni` | `src/pages/SupabaseAlumniManager.tsx` |
| Relasi Wali & Donatur | `crm` | `src/pages/SupabaseCrmManager.tsx` |
| Donasi & Wakaf | `donation` | `src/pages/SupabaseDonationManager.tsx` |
| Marketplace | `marketplace` | `src/pages/SupabaseMarketplaceManager.tsx` |
| Pusat Data Analitik | `intelligence` | `src/pages/SupabaseDashboardOverview.tsx` (`surface="intelligence"`) |

## Flag runtime (Production checkout)

Sudah `true` di `.env` / `fromoutside/.env` untuk batch ini:

- `SUPABASE_ALUMNI_RUNTIME_ENABLED` (+ `VITE_` bila ada)
- `SUPABASE_CRM_RUNTIME_ENABLED` (tidak ada gate `VITE_` di frontend; digate di server)
- `SUPABASE_DONATION_RUNTIME_ENABLED` (+ `VITE_`)
- `SUPABASE_MARKETPLACE_RUNTIME_ENABLED` (+ `VITE_`)

OpenWA (server only):

- `WA_GATEWAY_ENDPOINT` — base URL Easy API (contoh `http://127.0.0.1:8080`); boleh dikosongkan jika endpoint diisi di Pengaturan tenant `integrations.waGatewayEndpoint`
- `WA_GATEWAY_API_KEY` — sama dengan `--api-key` proses OpenWA; **jangan** simpan di browser / Firestore / commit

## Perubahan yang sudah diterapkan

### A. Hubungkan stub → data nyata

- Alumni: tab Tracer = agregat angkatan dari direktori; Komunitas = daftar alumni; Donasi Alumni = feed `/api/donation/snapshot`
- CRM: tab Siaran & Analitik memakai data kontak/agregat (bukan `ERPFeatureStatus` mati)
- Intelligence (tab non-eksekutif): metrik + sinyal dari `/api/dashboard/snapshot` (agregat operasional, **bukan** model AI)

### B. Master data & CRUD (verifikasi live tenant demo)

Bukti sebelumnya: `RELASI_OPS_OK` (16/16) dan seed operasional. Ringkas status data saat verifikasi:

- Alumni: profil kelulusan + eligible students
- CRM: kontak + interaksi create/update
- Donasi: kampanye/donatur/transaksi/void/wakaf create/update
- Marketplace: kategori `tenant_reference_items` domain `marketplace_product_category`; produk create/update/arsip; stok; pesanan + transisi status
- Analitik: snapshot master/PPDB/keuangan terbaca

### C. OpenWA — siaran CRM

| Item | Lokasi |
| --- | --- |
| Client HTTP OpenWA | `src/server/openWaGateway.ts` |
| Broadcast + dry-run | `sendSupabaseCrmOpenWaBroadcast` di `src/server/supabaseCrm.ts` |
| API | `GET /api/crm/broadcast/status`, `POST /api/crm/broadcasts` |
| UI | tab Siaran di `SupabaseCrmManager.tsx` |
| Teks pengaturan | `SettingsManager.tsx` (placeholder OpenWA) |

Kontrak pengiriman:

- Hanya kontak `marketingConsent === granted` **dan** nomor telepon yang bisa dinormalisasi ke `…@c.us`
- Maksimal 50 penerima per batch
- Setiap kirim sukses dicatat sebagai interaksi CRM `message` / `outbound`
- Dry-run tidak memanggil OpenWA; kirim nyata gagal jelas jika endpoint/key belum dikonfigurasi
- Jalur utama: `POST {base}/api/messages/sendText` body `{ to, content, options }`; fallback `POST {base}/api/sendText`

Contoh proses OpenWA (di mesin terpisah, bukan di `server.ts`):

```bash
npx @open-wa/wa-automate --session-id erp4 --host 127.0.0.1 --port 8080 --api-key "…"
```

### D. Perbaikan kecil terkait

- Marketplace UI: tombol **Ubah** / **Arsipkan** produk (API sudah ada sebelumnya)
- Donasi: `recurringDonorCount` dihitung dari donatur dengan lebih dari satu transaksi `confirmed`

### E. Migrasi CRM

- Objek CRM dari `20270118000000_crm_contact_management.sql` sudah diterapkan ke Production PTSAS pada batch Relasi (pastikan ledger/version tercatat sebelum apply ulang).

## File inti yang disentuh (orientasi agent)

- `src/server/openWaGateway.ts` *(baru)*
- `src/server/supabaseCrm.ts`, `supabaseDonation.ts`
- `server.ts` (rute CRM broadcast + import OpenWA)
- `src/pages/SupabaseAlumniManager.tsx`, `SupabaseCrmManager.tsx`, `SupabaseDonationManager.tsx`, `SupabaseMarketplaceManager.tsx`, `SupabaseDashboardOverview.tsx`, `SettingsManager.tsx`
- `.env` / `fromoutside/.env` (flag Relasi + `WA_GATEWAY_*`)

## Yang sengaja belum dikerjakan (backlog)

Prioritas untuk penyempurnaan. Kerjakan hanya yang diminta user; jangan mengarang AI/warehouse palsu.

### P1 — Operasional Relasi

1. **Nyalakan OpenWA di lingkungan target** — isi endpoint + API key, scan QR, uji kirim 1 nomor non-produksi, lalu UAT tab Siaran.
2. **UAT UI Admin** — Alumni/CRM/Donasi/Marketplace/Intelligence di browser dengan role Admin tenant; pastikan izin `modulePermissions` tidak mematikan menu.
3. **Kepadatan master data produksi** — seed/verifikasi hanya data demo; tenant nyata perlu kategori marketplace, kampanye, dan kontak berpersetujuan yang sah.

### P2 — Kontrak API yang masih kosong

4. **Alumni Tracer Study** — form & penyimpanan jawaban (pekerjaan/kuliah); butuh migrasi + RPC; saat ini hanya agregat angkatan.
5. **Alumni Komunitas** — kegiatan/reuni/job board; belum ada API; daftar anggota = direktori kelulusan.
6. **Alumni update/hapus profil** — API saat ini hanya catat kelulusan (`POST /api/alumni/graduations`).
7. **CRM hapus/arsip kontak** — hanya create/update + interaksi immutable.
8. **Email/SMS massal** — tidak ada; OpenWA hanya WhatsApp. Jangan klaim channel lain tanpa provider.

### P3 — Analitik “lanjutan”

9. Tab Prediktif / AI Tahfidz / Gudang Data / Knowledge di Intelligence = **agregat operasional** dari dashboard. Model prediksi, warehouse ETL, dan indeks dokumen **belum** ada. Jangan menampilkan data contoh sebagai AI.

### P4 — Dokumentasi modul aspiratif

10. Perbarui isi aspiratif di `docs/active/10_MODULES/PARENT_CRM.md` dan `ALUMNI_NETWORK.md` agar tidak dibaca agent sebagai status sudah jadi (lihat bagian pembaruan di file tersebut / pointer ke checkpoint ini).

## Larangan untuk agent berikutnya

- Jangan apply ulang migrasi CRM/alumni/donation/marketplace yang sudah terpasang tanpa bukti ledger.
- Jangan menghubungkan agent Supabase MCP ke project selain PTSAS.
- Jangan menyimpan `WA_GATEWAY_API_KEY` di settings JSON yang dikirim ke browser.
- Jangan meng-embed browser WhatsApp / Puppeteer OpenWA di dalam proses Express ERP.
- Jangan mengaktifkan `SUPABASE_ACADEMIC_RUNTIME_ENABLED` dari pekerjaan Relasi ini.
- Jangan commit `.env`.

## Verifikasi cepat (setelah ubah broadcast/OpenWA)

```text
GET  /api/crm/broadcast/status     → configured true/false + endpoint
POST /api/crm/broadcasts           → dryRun:true dulu (recipientCount, chatId)
GET  /api/alumni | /api/crm/contacts | /api/donation/snapshot | /api/marketplace/snapshot | /api/dashboard/snapshot
```

Sukses dry-run dengan `configured: false` adalah normal jika gateway belum diisi; tombol kirim nyata harus tetap gagal sampai OpenWA hidup.
