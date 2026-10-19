# Firebase & Cloud Run Solution Architecture

Sistem PesantrenOS Enterprise menggunakan pendekatan Serverless Cloud-Native dengan memanfaatkan ekosistem Google (Firebase dan Google Cloud) karena memiliki kelebihan pada skalabilitas, penghematan operasional, dan real-time synchronization.

## 1. Logical Architecture

### A. Frontend Layer (User Touchpoints)

1. **Web Admin Dashboard:** (React, Vite, Tailwind). Digunakan oleh Yayasan, Kepala Sekolah, Admin Pusat, Finance, PPDB Admin, Tenaga Pendidik.
2. **Mobile Apps:** (Flutter cross-platform iOS/Android).
   - _Parent App:_ Dashboard pantauan orang tua (Notif izin, tagihan SPP, progres hafalan, rapor).
   - _Musyrif App / Teacher App:_ Aplikasi khusus untuk input hafalan cepat secara mobile-friendly, presensi asrama, log pelanggaran.

### B. Access & API Gateway (Cloud Run & Proxy)

- **Firebase Hosting / Vercel:** Menyajikan static asset dan SPA (Single Page Application) frontend web.
- **Firebase Authentication:** Single Sign-On (SSO) untuk seluruh pengguna dengan provider Email/Password dan sinkronisasi Google IAM jika dibutuhkan internal. Role-based tokening / Custom Claims (`admin`, `musyrif`, `parent`).
- **Cloud Run (Backend Services):** Aplikasi backend Node.js (Express) atau Go untuk custom API logic yang tidak dapat dijalankan secara langsung dari client, seperti integrasi Payment Gateway pihak ketiga (Midtrans/Xendit), sinkronisasi event bus (Pub/Sub), atau generate file bulk laporan PDF tebal.

### C. Database Layer (The Core)

- **Cloud Firestore (Primary OTLP Database):**
  - Digunakan karena fitur Real-time listener. Saat Musyrif menginput hafalan, Parent App langsung mendapatkan push update secara realtime tanpa refresh.
  - Skema dokumen NoSQL fleksibel yang cocok untuk hierarki data multidimensi pesantren.
- **Cloud Storage:** Penyimpanan dokumen PPDB (KK, Akta, Rapor), Kuitansi/Bukti Transfer, dan foto profil/surat izin.
- **BigQuery (Data Warehouse untuk AI AI Analytics):**
  - Firestore di-mirror via _Firebase Extensions (Stream Collections to BigQuery)_.
  - Digunakan untuk analitik eksekutif tingkat lanjut: Trend pendaftar PPDB dari tahun ke tahun, tren perbandingan mutu hafalan antar cabang, dan machine learning training.

### D. AI Intelligence Layer

- **Gemini / Vertex AI RAG Integrations:**
  - AI Parent Assistant: Chatbot pada Parent App yang dilatih untuk bisa menjawab seputar kebijakan sekolah secara instan.
  - AI Tahfidz Engine: Menganalisa catatan muraja'ah musyrif dan memprediksi resiko keterlambatan pencapaian juz santri.

## 2. Infrastructure Diagram Summary

```text
[Users: Admin/Teacher/Parent] --> [ Web App / Flutter Mobile App ]
      |
      +--> [ Firebase Auth ] (Generates JWT with custom Claims)
      |
      +--> (Direct SDK) --> [ Cloud Firestore ]  <-- Realtime syncing
      |
      +--> (Direct SDK) --> [ Cloud Storage ]    <-- Photos/Docs
      |
      +--> (API Rest) ----> [ Cloud Run Services ] --> [ External (Payment Gateway / SMS) ]
                                |
                                +--> [ Cloud Pub/Sub ] --> [ BigQuery (Data Analytics) ]
                                                                 |
                                                                 +--> [ Gemini AI / Vertex AI ]
```

## 3. Multi-Tenant Strategy

Untuk mengakomodasi SaaS Multi-Tenant (Banyak Yayasan di satu platform):
Akan menggunakan skema **Tenant ID in Documents** (Shared Database, Isolated Documents).
Setiap root collection (seperti `students`, `teachers`, `transactions`) akan diwajibkan memiliki field `tenantId`. Firestore Security Rules divalidasi sangat ketat:
`allow read, write: if request.auth.token.tenantId == resource.data.tenantId;`
