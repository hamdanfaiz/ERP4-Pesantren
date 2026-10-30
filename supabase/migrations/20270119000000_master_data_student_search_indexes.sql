-- Bound tenant roster ordering and substring search as pesantren datasets grow.
-- Plan this blocking index build in a low-write maintenance window and rehearse
-- it on a representative database copy before production.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- This composite index replaces the earlier two-column roster index and keeps
-- the stable (name, id) order available to tenant-scoped pages.
CREATE INDEX IF NOT EXISTS students_tenant_name_page_idx
  ON public.students (tenant_id, name, id);

DROP INDEX IF EXISTS public.students_tenant_name_idx;

DO $migration$
DECLARE
  v_extension_schema name;
BEGIN
  SELECT namespace.nspname
  INTO v_extension_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is required for Master Data substring search indexes';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS students_name_trgm_idx
       ON public.students USING gin (name %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS students_nis_trgm_idx
       ON public.students USING gin (nis %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS students_source_record_id_trgm_idx
       ON public.students USING gin (source_record_id %I.gin_trgm_ops)
       WHERE source_record_id IS NOT NULL',
    v_extension_schema
  );
END;
$migration$;

COMMIT;
