# Modul Parent CRM & Donor Relations

> **Status runtime (13 Nov 2026):** jalur Supabase aktif di Production PTSAS untuk direktori kontak, pipeline tahap, interaksi, analitik agregat, dan **siaran WhatsApp via OpenWA**. Detail kontrak, flag, API, dan backlog: [CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md](../00_PRODUCT/CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md). Agent wajib baca checkpoint itu sebelum mengubah modul ini.

## Tujuan

Mengelola relasi wali, calon wali, alumni, donatur, dan mitra dalam ruang data tenant; mencatat interaksi; mengirim siaran WhatsApp hanya ke kontak yang menyetujui menerima informasi.

## Yang sudah tersedia

1. **Direktori kontak** — jenis `parent | prospect | alumni | donor | partner`, tahap lifecycle, consent pemasaran, pencarian, pagination.
2. **Alur prospek** — filter tahap (UI memakai daftar yang sama dengan direktori).
3. **Interaksi** — create catatan (`call | email | meeting | message | note`); immutable setelah tersimpan.
4. **Siaran OpenWA** — `GET /api/crm/broadcast/status`, `POST /api/crm/broadcasts` (dry-run + kirim); max 50; consent + nomor wajib.
5. **Analitik tab** — ringkasan jumlah kontak / open leads / interaksi 30 hari / consent; distribusi tahap dari halaman termuat.

## Yang belum (jangan diklaim selesai)

- Kanban visual LTV / open-rate / conversion rate seperti aspirasi produk lama
- Email atau SMS massal
- Hapus kontak (hanya create/update)
- Provider selain OpenWA Easy API untuk WhatsApp

## Konfigurasi OpenWA

- Endpoint: Pengaturan tenant `integrations.waGatewayEndpoint` atau env `WA_GATEWAY_ENDPOINT`
- Kunci: env server `WA_GATEWAY_API_KEY` saja
- Proses OpenWA dijalankan terpisah (`npx @open-wa/wa-automate …`); ERP hanya HTTP client
