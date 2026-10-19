# Business Requirement Document (BRD) - PesantrenOS Enterprise

## 1. Executive Summary

PesantrenOS (sebelumnya ERP4 Pesantren) adalah transformasi digital sistem informasi manajemen terpadu yang dirancang khusus untuk memenuhi kebutuhan pesantren modern, sekolah berasrama, dan yayasan Islam. PesantrenOS akan mengadopsi arsitektur microservices-oriented / modular monolith dan dirancang sebagai platform SaaS (Software as a Service) Multi-Tenant.

## 2. Business Objectives

- **Modernisasi Teknologi:** Migrasi dari arsitektur lama menjadi sistem berbasis Cloud yang scalable menggunakan layanan unggulan Google Cloud (Cloud Run, Firestore, BigQuery) dan ekosistem AI Google (Gemini, Vertex AI).
- **Multi-Tenant SaaS:** Mendukung berbagai institusi, yayasan, dan cabang dalam satu platform, dengan isolasi data (multi-tenancy) dan hierarki perizinan (RBAC) yang aman dan rapi.
- **Efisiensi Operasional:** Digitalisasi 100% proses akademik, tahfidz, keuangan, asrama, SDM, logistik, dan layanan penunjang lainnya.
- **Keterlibatan Wali Santri:** Menyediakan portal dan aplikasi (Mobile App dengan Flutter) agar orang tua bisa memantau perkembangan, hafalan (Tahfidz), perilaku, nilai, dan keuangan secara real-time.

## 3. Product Roadmap & Phases

Berdasarkan dokumen arsitektural PesantrenOS versi Enterprise:

- **Tahap 1: Business Design** (BRD, PRD, Roadmap, Business Model)
- **Tahap 2: Domain Design** (DDD, BPMN, Use Case, User Stories)
- **Tahap 3: Architecture Design** (Solution Arch, ERD, Firebase Schema, API)
- **Tahap 4: Module Specification** (Detail modul Tahfidz, Boarding, Akademik, dll)
- **Tahap 5: AI Design** (Modul AI Tahfidz Engine, AI Parent Assistant, dll)
- **Tahap 6: Sprint Planning** (Perencanaan eksekusi backlog)

## 4. Bounded Contexts (DDD)

Sistem ini membagi skala kompleksitas operasional pesantren menjadi 10 Bounded Contexts:

1. **Identity & Access Domain** (User, Role, Permission, Tenant, IAM, MFA)
2. **Student Lifecycle Domain** (PPDB, Santri, Wali Santri, Alumni)
3. **Tahfidz Domain** (Halaqah, Musyrif, Target Hafalan, Setoran, Munaqasyah, dsb)
4. **Academic Domain** (Kurikulum, Mata Pelajaran, Jadwal, Kelas, Nilai, Rapor)
5. **Boarding Domain** (Kamar, Gedung, Mutabaah, Perizinan, Pelanggaran/Kedisiplinan)
6. **Finance Domain** (Billing, Invoice, Payment, Wallet, Accounting, Budgeting)
7. **Commerce Domain** (Kopontren, POS, Inventory, Supplier)
8. **Healthcare Domain** (UKS, Medical Record, Medicine)
9. **Donation Domain** (Campaign, Donor, Donation, Wakaf)
10. **AI Intelligence Domain** (Tahfidz AI, Parent AI, Executive AI, RAG Knowledge Base)

## 5. Target Architecture

- **Web Admin Portal & Web App** dibangun dengan React + Vite + TypeScript & Tailwind (Framework Saat Ini).
- **Mobile Apps** dibangun dengan framework _Flutter_ untuk aplikasi Student, Parent, Teacher, dan Musyrif.
- **Backend & Integrasi** dihosting melalui layanan _Cloud Run Services_.
- **Database Utama**: _Firestore_ diposisikan sebagai pangkalan data utama, dikombinasikan dengan _Cloud Storage_ untuk aset, _Pub/Sub_ untuk message broker/event bus, dan _BigQuery_ sebagai Data Warehouse analytic.
- **AI Integration**: AI diunggulkan dan diberdayakan melalui framework _Gemini AI_ dan _Vertex AI_ (mis. RAG untuk pedoman institusi).
- **Authentication**: _Firebase Authentication_.
