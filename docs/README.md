# PesantrenOS Documentation Repository

Struktur dokumentasi untuk PesantrenOS (SaaS Enterprise). Desain dan dokumentasi mengikuti Domain Driven Design (DDD).

## Struktur Direktori

```text
/docs
│
├── active
│   ├── 01_BUSINESS
│   ├── 02_PRODUCT
│   ├── 03_ANALYSIS
│   ├── 04_DOMAIN_MODEL
│   ├── 05_ARCHITECTURE
│   ├── 06_DATABASE
│   ├── 07_API
│   ├── 08_SECURITY
│   ├── 09_AI
│   ├── 10_MODULES
│   ├── 11_UI_UX (Design System)
│   ├── 12_DEVOPS
│   └── 13_TESTING
│
├── completed
│   ├── sprint-01
│   ├── sprint-02
│   ├── sprint-03
│   └── release-notes
│
└── guides
    ├── GOOGLE_AI_STUDIO_GUIDE.md
    ├── FIREBASE_GUIDE.md
    ├── FLUTTER_GUIDE.md
    ├── BIGQUERY_GUIDE.md
    └── DEPLOYMENT_GUIDE.md
```

## Bounded Contexts (DDD)

Sistem informasi PesantrenOS terbagi dari sub-domain / Bounded Contexts sebagai berikut:

1. Identity & Access Domain
2. Student Lifecycle Domain
3. Tahfidz Domain
4. Academic & LMS Domain
5. Boarding & Operations Domain (Asset, HRIS, Procurement)
6. Finance Domain
7. Commerce & Marketplace Domain
8. Healthcare Domain
9. CRM & Ecosystem Domain (Ziswaf, PPOB)
10. AI Intelligence & Executive Domain

Lihat dokumentasi utama sebelum menyelami sistem teknis:
- **[Product Requirements Document (PRD)](active/02_PRODUCT/PRD.md)** - Daftar produk, visi, dan fitur.
- **[Database ERD & Structure](active/06_DATABASE/ERD.md)** - Schema spesifik Firestore dan multi-tenancy.
- **[Firestore Legacy Index Info](active/06_DATABASE/FIRESTORE_STRUCTURE.md)** - Struktur Firestore lawas.
- **[Firestore to Supabase Migration Inventory](active/06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md)** - Sumber kanonis, koleksi legacy, cakupan importer, dan gerbang rekonsiliasi migrasi.
- **[Design System](active/11_UI_UX/DESIGN_SYSTEM.md)** - Token visual, komponen bersama, serta aturan konsistensi dan aksesibilitas UI.
