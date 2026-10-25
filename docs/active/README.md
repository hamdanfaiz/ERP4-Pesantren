# Active Documentation

This folder is intended for documentation related to tasks, features, or architectural designs that are **currently in progress**.

Once a feature is fully implemented and merged, its documentation should be moved to the `completed` folder (or integrated into main guides if applicable).

## Active references
- [PR dependency audit — 25 Oct 2026](05_ARCHITECTURE/PR_DEPENDENCY_AUDIT_2026-10-25.md) — base, stack, CI, review, and merge-readiness findings for PRs #1–#13.

- [Design System](11_UI_UX/DESIGN_SYSTEM.md) — visual tokens, reusable UI patterns, accessibility, and responsive behavior.
- [PPDB legacy import checkpoint](06_DATABASE/PPDB_LEGACY_IMPORT_CHECKPOINT.md) — source preflight, date mapping, and gated tenant-safe import requirements.
- [Master Data legacy import checkpoint](06_DATABASE/MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md) — tenant mapping, imported structure/student/guardian records, and remaining reconciliation items.
- [Firestore to Supabase Migration Inventory](06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) — confirmed Firestore source database, top-level collection inventory, importer coverage, and migration gates.

- [ERD target Supabase](06_DATABASE/SUPABASE_ERD.md) — relasi tenant, domain utama, dan inventaris tabel berdasarkan migrasi pada checkout.
- [Checkpoint rilis dan progres — 25 Okt 2026](05_ARCHITECTURE/CHECKPOINT_2026-10-25.md) — persentase berbobot menuju go-live, bukti, dan release gate berikutnya.
