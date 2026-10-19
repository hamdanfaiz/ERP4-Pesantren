# System Modules Index

The Serene School/HRIS Management System is highly modularized, utilizing a vast suite of internal tools (represented as "Managers" or "Views") governed by centralized Role-Based Access Control (RBAC). 

Below is the comprehensive index of all active application modules created during our continuous development lifecycle:

## Core Management
- **Dashboard Overview (`Dashboard.tsx`)**: High-level statistical summaries & quick actions.
- **Master Data Manager (`MasterDataManager.tsx`)**: Central repository for shared configurations and global metadata.
- **Settings Manager (`SettingsManager.tsx`)**: System administrative settings and user interface configurations.

## Academic & Student Affairs
- **Academic Manager (`AcademicManager.tsx`)**: Curriculum, schedules, teacher assignments, and grading.
- **LMS Manager (`LMSManager.tsx`)**: Learning Management System for e-learning content and assignment distribution.
- **Tahfidz Manager (`TahfidzManager.tsx`)**: Specialized module for tracking Quranic memorization progress.
- **CBT Manager / CBT Student Dashboard (`CBTManager.tsx`, `CBTStudentDashboard.tsx`)**: Computer-Based Testing platform for exams.
- **Library Manager (`LibraryManager.tsx`)**: Physical and digital book circulation, borrowing history.
- **PPDB Manager (`PPDBManager.tsx`)**: Penerimaan Peserta Didik Baru (New Student Admission) pipeline.

## Human Resources & Administration
- **HRIS Manager (`HRISManager.tsx`)**: Staff directory, geo-fenced attendance, interactive shift planner, performance scorecards, and leaves.
- **Document Manager (`DocumentManager.tsx`)**: E-Office system featuring AI-powered OCR metadata extraction.
- **Communication Hub (`CommunicationHub.tsx`)**: Unified messaging, notifications, and internal broadcasts.

## Finance & Operations
- **Finance Manager (`FinanceManager.tsx`)**: Billing, tuition fees, invoicing, and revenue tracking.
- **Asset Manager (`AssetManager.tsx`)**: Inventory, asset lifecycle, and maintenance scheduling.
- **Procurement Manager (`ProcurementManager.tsx`)**: Restocking protocols, purchase orders, and vendor management.
- **Donation Manager (`DonationManager.tsx`)**: Endowment, fund-raising, and alms tracking.
- **Cooperative Manager / Koperasi (`CooperativeManager.tsx`)**: Point of Sale (POS) and inventory for the school cooperative.
- **Laundry Manager (`LaundryManager.tsx`)**: Laundry tracking for boarding students.
- **Healthcare Manager (`HealthcareManager.tsx`)**: Clinic logs, student medical records, and health incidents.
- **Boarding Manager (`BoardingManager.tsx`)**: Dormitory room allocations, discipline tracking, and musyrif logs.

## Advanced & External
- **CRM Manager (`CRMManager.tsx`)**: Customer Relationship Management for parents and public relations.
- **Alumni Manager (`AlumniManager.tsx`)**: Alumni directory, event coordination, and networking.
- **Ecosystem / Marketplace Manager (`EcosystemManager.tsx`, `MarketplaceManager.tsx`)**: Integrations with 3rd party tooling and built-in micro-transactions.
- **Intelligence Manager (`IntelligenceManager.tsx`)**: Data analytics, advanced AI forecasting, and cross-module insights. 
- **Enterprise / ERP Manager (`EnterpriseManager.tsx`, `ERPManager.tsx`)**: Multi-branch management, grand ledger, and consolidated corporate metrics.

## Future Integration / Development Status
All modules currently contain highly polished UI/UX implementations powered by local React State (`useState`) and mock data factories. 
**Next global architectural objective:** Implement global state synchronization mirroring the Firestore Blueprint definition, enabling real-time multi-tenant data fetching for all components listed above.
