-- Keep tenant authorization helpers available to RLS policies without exposing
-- SECURITY DEFINER functions through Supabase's Data API.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ALTER FUNCTION preserves each function OID, so existing RLS policies keep
-- their references while the helpers leave the exposed public schema.
ALTER FUNCTION public.current_tenant_id() SET SCHEMA private;
ALTER FUNCTION public.current_app_role() SET SCHEMA private;
ALTER FUNCTION public.has_module_access(TEXT) SET SCHEMA private;
ALTER FUNCTION public.is_tenant_admin() SET SCHEMA private;

-- SQL function bodies created from string literals do not track all referenced
-- function names, so refresh the admin helper with its new qualified names.
CREATE OR REPLACE FUNCTION private.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.current_tenant_id() IS NOT NULL
    AND private.current_app_role() IN ('admin', 'super_admin')
$$;

REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.current_app_role() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.has_module_access(TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.is_tenant_admin() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_module_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_admin() TO authenticated;

COMMENT ON SCHEMA private IS
  'Internal database objects. Keep this schema out of Supabase Data API exposed schemas.';
COMMENT ON FUNCTION private.current_tenant_id() IS
  'Internal RLS helper; returns the active tenant for auth.uid(). Not a Data API RPC.';
COMMENT ON FUNCTION private.current_app_role() IS
  'Internal RLS helper; returns the active application role for auth.uid(). Not a Data API RPC.';
COMMENT ON FUNCTION private.has_module_access(TEXT) IS
  'Internal RLS helper; checks the active profile module permission. Not a Data API RPC.';
COMMENT ON FUNCTION private.is_tenant_admin() IS
  'Internal RLS helper; checks the active tenant administrator role. Not a Data API RPC.';

COMMIT;

