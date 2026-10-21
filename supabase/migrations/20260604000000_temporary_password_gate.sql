-- Temporary passwords are set only by trusted provisioning code and must be changed before tenant access.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.tenant_id
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id
  WHERE p.user_id = auth.uid()
    AND p.status = 'active'
    AND p.must_change_password IS FALSE
    AND t.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id
  WHERE p.user_id = auth.uid()
    AND p.status = 'active'
    AND p.must_change_password IS FALSE
    AND t.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.has_module_access(p_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p.role = 'super_admin' THEN true
    WHEN p.module_permissions ? p_module THEN
      CASE
        WHEN jsonb_typeof(p.module_permissions -> p_module) = 'boolean'
          THEN (p.module_permissions ->> p_module)::boolean
        ELSE false
      END
    WHEN p.role = 'admin' THEN p_module = ANY (ARRAY[
      'dashboard', 'master-data', 'users', 'ppdb', 'tahfidz', 'boarding', 'finance',
      'communication', 'academic', 'healthcare', 'cooperative', 'hris', 'document',
      'library', 'donation', 'laundry', 'enterprise', 'erp', 'ga', 'alumni', 'crm',
      'lms', 'intelligence', 'marketplace', 'ecosystem', 'cbt'
    ]::TEXT[])
    WHEN p.role = 'ustadz' THEN p_module = ANY (ARRAY[
      'dashboard', 'academic', 'tahfidz', 'boarding', 'lms', 'cbt', 'communication', 'library'
    ]::TEXT[])
    WHEN p.role = 'santri' THEN p_module = ANY (ARRAY[
      'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'lms', 'cbt', 'library'
    ]::TEXT[])
    WHEN p.role = 'wali_santri' THEN p_module = ANY (ARRAY[
      'dashboard', 'academic', 'tahfidz', 'boarding', 'finance', 'communication', 'donation'
    ]::TEXT[])
    ELSE false
  END
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id
  WHERE p.user_id = auth.uid()
    AND p.status = 'active'
    AND p.must_change_password IS FALSE
    AND t.status = 'active'
$$;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'When true, RLS helpers deny tenant/module access until the authenticated user changes the temporary password through the trusted password-change function.';

COMMIT;
