-- Make Data API exposure opt-in for application objects created by postgres.
-- This migration runs after the current schema migrations so every existing
-- trigger helper it restricts is present. Default privileges affect only
-- future objects; existing table grants remain unchanged.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC globally by
-- default. This global revoke is required; a schema-scoped revoke cannot remove
-- the built-in global default. Functions used by RLS or RPC must be granted
-- explicitly in their owning migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

-- These are trigger-only helpers, not callable Data API endpoints. Removing
-- direct EXECUTE does not remove the triggers attached to their source tables.
REVOKE ALL ON FUNCTION public.erp4_ppdb_update_updated_at_column()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_user_profile_to_tenant_profile()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_master_data_record()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

