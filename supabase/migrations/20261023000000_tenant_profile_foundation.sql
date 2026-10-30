-- Forward-only tenant/profile foundation for the live Supabase project.
-- The live project already applied a different 20260603000000 migration, so
-- this must remain a new version. It intentionally refuses to drop existing
-- candidate data; non-empty PII needs an encrypted, reviewed migration first.
BEGIN;

ALTER TYPE public.registration_stage ADD VALUE IF NOT EXISTS 'Withdrawn';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidates LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.candidate_documents LIMIT 1) THEN
    RAISE EXCEPTION
      'Candidate tables are not empty. Export and migrate candidate PII through the encrypted migration flow before applying this foundation.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE tenant_id IS NULL OR length(btrim(tenant_id)) = 0
       OR role NOT IN ('SuperAdmin', 'Admin', 'Ustadz', 'Santri', 'Walisantri')
  ) THEN
    RAISE EXCEPTION
      'A user profile has an invalid tenant or role. Reconcile profiles before applying the tenant foundation.';
  END IF;
END;
$$;

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'),
  legacy_tenant_key TEXT UNIQUE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  tenant_type TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Jakarta' CHECK (length(btrim(time_zone)) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  email TEXT NOT NULL CHECK (email = lower(email)),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  username TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'ustadz', 'santri', 'wali_santri')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  unit_id TEXT,
  module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(module_permissions) = 'object'),
  linked_santri_id TEXT,
  linked_santri_name TEXT,
  linked_santri_nis TEXT,
  linked_santri_class TEXT,
  linked_santri_room TEXT,
  created_by_uid UUID,
  updated_by_uid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX profiles_tenant_status_role_idx
  ON public.profiles (tenant_id, status, role);
CREATE INDEX tenants_status_slug_idx
  ON public.tenants (status, slug);

-- Preserve the existing text tenant identifiers while assigning canonical UUIDs.
-- A safe slug is derived for URL use; the original value remains an exact lookup key.
WITH tenant_source AS (
  SELECT
    tenant_id AS legacy_key,
    max(NULLIF(btrim(tenant_name), '')) AS tenant_name,
    max(NULLIF(btrim(tenant_type), '')) AS tenant_type,
    trim(BOTH '-' FROM regexp_replace(lower(btrim(tenant_id)), '[^a-z0-9]+', '-', 'g')) AS base_slug
  FROM public.user_profiles
  GROUP BY tenant_id
), tenant_slug AS (
  SELECT
    legacy_key,
    tenant_name,
    tenant_type,
    COALESCE(NULLIF(base_slug, ''), 'tenant') AS base_slug,
    count(*) OVER (PARTITION BY COALESCE(NULLIF(base_slug, ''), 'tenant')) AS slug_collisions
  FROM tenant_source
)
INSERT INTO public.tenants (slug, legacy_tenant_key, name, tenant_type)
SELECT
  CASE
    WHEN slug_collisions = 1 AND length(base_slug) <= 63 THEN base_slug
    ELSE left(base_slug, 52) || '-' || substr(md5(legacy_key), 1, 10)
  END,
  legacy_key,
  COALESCE(tenant_name, legacy_key),
  tenant_type
FROM tenant_slug;

-- Copy the current RBAC profile rows into the normalized tenant/profile model.
INSERT INTO public.profiles (
  user_id, tenant_id, email, display_name, username, role, status,
  must_change_password, unit_id, module_permissions,
  linked_santri_id, linked_santri_name, linked_santri_nis,
  linked_santri_class, linked_santri_room,
  created_by_uid, updated_by_uid, created_at, updated_at
)
SELECT
  source.id,
  tenant.id,
  lower(source.email),
  source.name,
  source.username,
  CASE source.role
    WHEN 'SuperAdmin' THEN 'super_admin'
    WHEN 'Admin' THEN 'admin'
    WHEN 'Ustadz' THEN 'ustadz'
    WHEN 'Santri' THEN 'santri'
    WHEN 'Walisantri' THEN 'wali_santri'
  END,
  CASE WHEN source.status = 'active' THEN 'active' ELSE 'suspended' END,
  source.must_change_password,
  source.unit_id,
  source.module_permissions,
  source.linked_santri_id,
  source.linked_santri_name,
  source.linked_santri_nis,
  source.linked_santri_class,
  source.linked_santri_room,
  source.created_by_uid,
  source.updated_by_uid,
  source.created_at,
  source.updated_at
FROM public.user_profiles AS source
JOIN public.tenants AS tenant ON tenant.legacy_tenant_key = source.tenant_id;

-- Preserve a one-way bridge for historical/admin writes while the runtime moves
-- to the canonical profiles table. New application writes must target profiles.
CREATE OR REPLACE FUNCTION public.sync_user_profile_to_tenant_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE legacy_tenant_key = NEW.tenant_id OR id::TEXT = NEW.tenant_id
  ORDER BY CASE WHEN legacy_tenant_key = NEW.tenant_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant key is not provisioned in public.tenants' USING ERRCODE = '23503';
  END IF;

  v_role := CASE NEW.role
    WHEN 'SuperAdmin' THEN 'super_admin'
    WHEN 'Admin' THEN 'admin'
    WHEN 'Ustadz' THEN 'ustadz'
    WHEN 'Santri' THEN 'santri'
    WHEN 'Walisantri' THEN 'wali_santri'
    ELSE NULL
  END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile role is not supported' USING ERRCODE = '23514';
  END IF;
  v_status := CASE WHEN NEW.status = 'active' THEN 'active' ELSE 'suspended' END;

  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'A profile cannot be moved between tenants by updating user_profiles' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, email, display_name, username, role, status,
    must_change_password, unit_id, module_permissions,
    linked_santri_id, linked_santri_name, linked_santri_nis,
    linked_santri_class, linked_santri_room,
    created_by_uid, updated_by_uid, created_at, updated_at
  ) VALUES (
    NEW.id, v_tenant_id, lower(NEW.email), NEW.name, NEW.username, v_role, v_status,
    NEW.must_change_password, NEW.unit_id, NEW.module_permissions,
    NEW.linked_santri_id, NEW.linked_santri_name, NEW.linked_santri_nis,
    NEW.linked_santri_class, NEW.linked_santri_room,
    NEW.created_by_uid, NEW.updated_by_uid, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    must_change_password = EXCLUDED.must_change_password,
    unit_id = EXCLUDED.unit_id,
    module_permissions = EXCLUDED.module_permissions,
    linked_santri_id = EXCLUDED.linked_santri_id,
    linked_santri_name = EXCLUDED.linked_santri_name,
    linked_santri_nis = EXCLUDED.linked_santri_nis,
    linked_santri_class = EXCLUDED.linked_santri_class,
    linked_santri_room = EXCLUDED.linked_santri_room,
    updated_by_uid = EXCLUDED.updated_by_uid,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_sync_tenant_profile
  AFTER INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_to_tenant_profile();

-- The current PPDB tables are empty (checked by preflight above), so their
-- plaintext NIK/NISN columns can be replaced without discarding records.
ALTER TABLE public.candidate_documents
  DROP CONSTRAINT IF EXISTS candidate_documents_candidate_tenant_fkey,
  DROP CONSTRAINT IF EXISTS candidate_documents_candidate_id_key,
  DROP CONSTRAINT IF EXISTS candidate_documents_tenant_id_check;
ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_tenant_registration_id_key,
  DROP CONSTRAINT IF EXISTS candidates_id_tenant_id_key,
  DROP CONSTRAINT IF EXISTS candidates_tenant_id_check;

ALTER TABLE public.candidates
  DROP COLUMN nik,
  DROP COLUMN nisn,
  ALTER COLUMN tenant_id TYPE UUID USING tenant_id::UUID,
  ADD COLUMN nik_ciphertext BYTEA,
  ADD COLUMN nik_fingerprint BYTEA,
  ADD COLUMN nisn_ciphertext BYTEA,
  ADD COLUMN nisn_fingerprint BYTEA,
  ADD CONSTRAINT candidates_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT candidates_tenant_id_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT candidates_nik_ciphertext_pair_check
    CHECK ((nik_ciphertext IS NULL) = (nik_fingerprint IS NULL)),
  ADD CONSTRAINT candidates_nisn_ciphertext_pair_check
    CHECK ((nisn_ciphertext IS NULL) = (nisn_fingerprint IS NULL));

ALTER TABLE public.candidate_documents
  ALTER COLUMN tenant_id TYPE UUID USING tenant_id::UUID,
  ADD CONSTRAINT candidate_documents_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT candidate_documents_candidate_tenant_fkey
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT candidate_documents_tenant_candidate_key UNIQUE (tenant_id, candidate_id);

CREATE UNIQUE INDEX candidates_registration_tenant_uq
  ON public.candidates (tenant_id, upper(btrim(registration_id)));
CREATE UNIQUE INDEX candidates_nik_fingerprint_tenant_uq
  ON public.candidates (tenant_id, nik_fingerprint) WHERE nik_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX candidates_nisn_fingerprint_tenant_uq
  ON public.candidates (tenant_id, nisn_fingerprint) WHERE nisn_fingerprint IS NOT NULL;
CREATE INDEX candidates_tenant_onboarding_idx
  ON public.candidates (tenant_id, stage, created_at DESC);

CREATE TABLE public.registration_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  admission_year SMALLINT NOT NULL CHECK (admission_year BETWEEN 2000 AND 2200),
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, admission_year)
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  WHERE p.user_id = auth.uid() AND p.status = 'active' AND t.status = 'active'
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
  WHERE p.user_id = auth.uid() AND p.status = 'active' AND t.status = 'active'
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
      CASE WHEN jsonb_typeof(p.module_permissions -> p_module) = 'boolean'
        THEN (p.module_permissions ->> p_module)::boolean ELSE false END
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
  WHERE p.user_id = auth.uid() AND p.status = 'active' AND t.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_tenant_id() IS NOT NULL
    AND public.current_app_role() IN ('admin', 'super_admin')
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.registration_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_current_tenant ON public.tenants;
CREATE POLICY tenants_select_current_tenant
  ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());
DROP POLICY IF EXISTS profiles_select_self_or_tenant_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_tenant_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (tenant_id = public.current_tenant_id()
        AND public.is_tenant_admin() AND public.has_module_access('users'))
  );
DROP POLICY IF EXISTS candidates_select_ppdb_admin ON public.candidates;
CREATE POLICY candidates_select_ppdb_admin
  ON public.candidates FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin() AND public.has_module_access('ppdb'));
DROP POLICY IF EXISTS candidate_documents_select_ppdb_admin ON public.candidate_documents;
CREATE POLICY candidate_documents_select_ppdb_admin
  ON public.candidate_documents FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin() AND public.has_module_access('ppdb'));

REVOKE ALL ON TABLE public.tenants, public.profiles, public.candidates,
  public.candidate_documents, public.registration_counters FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.tenants, public.profiles,
  public.candidates, public.candidate_documents TO authenticated;
GRANT ALL ON TABLE public.tenants, public.profiles, public.candidates,
  public.candidate_documents, public.registration_counters TO service_role;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_module_access(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_module_access(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated, service_role;

COMMENT ON TABLE public.tenants IS
  'Tenant directory. Browser users can read only their active tenant; trusted backend provisions tenants.';
COMMENT ON TABLE public.profiles IS
  'Canonical Supabase Auth profile and tenant role source; legacy user_profiles is retained only for backfill and compatibility.';
COMMENT ON TABLE public.candidates IS
  'Tenant-scoped PPDB records. NIK/NISN are backend-encrypted ciphertext with keyed fingerprints; browser writes are denied.';
COMMENT ON TABLE public.candidate_documents IS
  'Tenant-scoped PPDB document checklist; browser writes are denied.';

COMMIT;
