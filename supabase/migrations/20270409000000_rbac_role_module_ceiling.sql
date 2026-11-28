-- Keep RLS module checks aligned with the application role ceiling.
-- A per-user `true` may no longer grant a module outside that role's baseline.
BEGIN;

CREATE OR REPLACE FUNCTION private.has_module_access(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_role_modules TEXT[];
BEGIN
  IF p_module IS NULL OR btrim(p_module) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT lower(btrim(p.role::TEXT)), p.module_permissions
    INTO v_role, v_permissions
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id
  WHERE p.user_id = auth.uid()
    AND p.status = 'active'
    AND t.status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  CASE v_role
    WHEN 'super_admin' THEN
      v_role_modules := ARRAY[
        'dashboard', 'master-data', 'users', 'settings', 'ppdb', 'tahfidz', 'boarding',
        'finance', 'communication', 'academic', 'healthcare', 'cooperative', 'hris',
        'document', 'library', 'donation', 'laundry', 'enterprise', 'erp', 'ga', 'alumni',
        'crm', 'lms', 'intelligence', 'marketplace', 'cbt'
      ]::TEXT[];
    WHEN 'admin' THEN
      v_role_modules := ARRAY[
        'dashboard', 'master-data', 'users', 'ppdb', 'tahfidz', 'boarding', 'finance',
        'communication', 'academic', 'healthcare', 'cooperative', 'hris', 'document',
        'library', 'donation', 'laundry', 'enterprise', 'erp', 'ga', 'alumni', 'crm',
        'lms', 'intelligence', 'marketplace', 'cbt'
      ]::TEXT[];
    WHEN 'ustadz' THEN
      v_role_modules := ARRAY[
        'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'lms', 'communication', 'library'
      ]::TEXT[];
    WHEN 'santri' THEN
      v_role_modules := ARRAY[
        'dashboard', 'academic', 'tahfidz', 'boarding', 'lms', 'cbt', 'library'
      ]::TEXT[];
    WHEN 'wali_santri' THEN
      v_role_modules := ARRAY[
        'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'communication'
      ]::TEXT[];
    ELSE
      RETURN FALSE;
  END CASE;

  -- Role permissions are a hard upper bound. A stale or manually edited
  -- module_permissions entry cannot add a module to another role.
  IF NOT (p_module = ANY(v_role_modules)) THEN
    RETURN FALSE;
  END IF;

  -- SuperAdmin is platform-wide and cannot be reduced by tenant-level flags,
  -- but is still limited to known modules above.
  IF v_role = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- Inside the role boundary, a per-user explicit deny is honored. Malformed
  -- values fail closed. Missing keys inherit the role's default access.
  IF v_permissions ? p_module THEN
    RETURN jsonb_typeof(v_permissions -> p_module) = 'boolean'
      AND (v_permissions ->> p_module) = 'true';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION private.has_module_access(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.has_module_access(TEXT) TO authenticated;

COMMENT ON FUNCTION private.has_module_access(TEXT) IS
  'Internal RLS helper. Enforces role module ceiling first, then optional per-user deny. Unknown roles and malformed permissions fail closed.';

COMMIT;
