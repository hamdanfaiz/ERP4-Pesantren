-- The normalized unique index added for document numbers enforces the same
-- tenant-scoped key as the older index. Keep one copy to reduce write overhead.
DROP INDEX IF EXISTS public.document_records_tenant_document_number_uq;
