-- Pin the search path used by the legacy PPDB timestamp trigger.
-- The trigger only needs built-in time functions from pg_catalog.
BEGIN;

ALTER FUNCTION public.erp4_ppdb_update_updated_at_column()
  SET search_path = pg_catalog;

COMMIT;
