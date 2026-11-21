# Modul Parent CRM & Donor Relations

> **Status source (22 Nov 2026):** Source menyediakan direktori kontak, pipeline tahap, interaksi, analitik, dan siaran WhatsApp via OpenWA. PR #205 menambahkan ledger permintaan dan status per penerima; migrasi `20270404010000_crm_broadcast_idempotency` harus sudah diterapkan pada setiap environment sebelum endpoint siaran aktif. Aktivasi flag, konfigurasi gateway, dan kesiapan Production tetap perlu diverifikasi per environment; dokumen ini bukan bukti bahwa pengiriman Production aktif. Baca [checkpoint relasi dan OpenWA](../00_PRODUCT/CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md) sebelum mengubah modul ini.

## Tujuan

Mengelola relasi wali, calon wali, alumni, donatur, dan mitra dalam ruang data tenant; mencatat interaksi; mengirim siaran WhatsApp hanya ke kontak yang menyetujui menerima informasi.

## Yang sudah tersedia

1. **Direktori kontak** — jenis `parent | prospect | alumni | donor | partner`, tahap lifecycle, consent pemasaran, pencarian, pagination.
2. **Alur prospek** — filter tahap (UI memakai daftar yang sama dengan direktori).
3. **Interaksi** — create catatan (`call | email | meeting | message | note`); immutable setelah tersimpan.
4. **Siaran OpenWA** — `GET /api/crm/broadcast/status`, `POST /api/crm/broadcasts` (dry-run + kirim); maksimal 50; consent dan nomor diperiksa; permintaan dengan ID yang sama tidak mengirim ulang penerima berstatus `sending`, `sent`, atau `unknown`. Penerima `pending` dapat dilanjutkan dengan ID dan payload yang sama.
5. **Analitik tab** — ringkasan jumlah kontak / open leads / interaksi 30 hari / consent; distribusi tahap dari halaman termuat.

## Yang belum (jangan diklaim selesai)

- Kanban visual LTV / open-rate / conversion rate seperti aspirasi produk lama
- Email atau SMS massal
- Hapus kontak (hanya create/update)
- Provider selain OpenWA Easy API untuk WhatsApp
- Pemulihan otomatis untuk penerima yang tertinggal pada status `sending` atau hasil `unknown`; status tersebut tidak dikirim ulang otomatis dan perlu rekonsiliasi operator/provider.
- Dukungan idempotensi dari provider OpenWA belum terbukti; ledger aplikasi mencegah pengiriman ulang dari permintaan yang sama, tetapi tidak dapat memastikan apakah provider menerima pesan ketika koneksi terputus.

## Konfigurasi OpenWA

- Endpoint: Pengaturan tenant `integrations.waGatewayEndpoint` atau env `WA_GATEWAY_ENDPOINT`
- Kunci: env server `WA_GATEWAY_API_KEY` saja
- Proses OpenWA dijalankan terpisah (`npx @open-wa/wa-automate …`); ERP hanya HTTP client
