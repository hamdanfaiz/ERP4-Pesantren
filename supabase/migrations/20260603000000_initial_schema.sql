-- Tenant-aware Supabase foundation for the first backend migration slice.
-- Public PPDB submissions must go through a trusted Edge Function; anon has no table access.
BEGIN;

CREATE TYPE public.registration_stage AS ENUM (
  'Registered',
  'Document Review',
  'Entry Exam',
  'Interview',
  'Accepted',
  'Rejected',
  'Withdrawn'
);

CREATE TYPE public.gender_type AS ENUM ('L', 'P');

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
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
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'ustadz', 'santri', 'wali_santri')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(module_permissions) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX profiles_tenant_status_role_idx
  ON public.profiles (tenant_id, status, role);

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  registration_id VARCHAR(50) NOT NULL CHECK (length(btrim(registration_id)) > 0),
  name VARCHAR(150) NOT NULL CHECK (length(btrim(name)) > 0),
  previous_school VARCHAR(150),
  grade VARCHAR(50),
  phone VARCHAR(20),
  nik VARCHAR(20),
  nisn VARCHAR(20),
  pob VARCHAR(100),
  dob DATE,
  email VARCHAR(150),
  address TEXT,
  gender public.gender_type NOT NULL DEFAULT 'L',
  father_name VARCHAR(150),
  mother_name VARCHAR(150),
  father_job VARCHAR(100),
  mother_job VARCHAR(100),
  whatsapp_phone VARCHAR(20),
  stage public.registration_stage NOT NULL DEFAULT 'Registered',
  score INTEGER,
  date_applied DATE NOT NULL DEFAULT CURRENT_DATE,
  exam_slot VARCHAR(100),
  interviewer VARCHAR(150),
  interview_slot VARCHAR(100),
  interview_notified BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (nik IS NULL OR nik ~ '^[0-9]{16}$'),
  CHECK (nisn IS NULL OR nisn ~ '^[0-9]{10}$')
);

CREATE UNIQUE INDEX candidates_registration_tenant_uq
  ON public.candidates (tenant_id, upper(btrim(registration_id)));
CREATE UNIQUE INDEX candidates_nik_tenant_uq
  ON public.candidates (tenant_id, nik) WHERE nik IS NOT NULL;
CREATE UNIQUE INDEX candidates_nisn_tenant_uq
  ON public.candidates (tenant_id, nisn) WHERE nisn IS NOT NULL;
CREATE INDEX candidates_tenant_stage_created_idx
  ON public.candidates (tenant_id, stage, created_at DESC);

CREATE TABLE public.candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  kk BOOLEAN NOT NULL DEFAULT false,
  birth_certificate BOOLEAN NOT NULL DEFAULT false,
  report_cards BOOLEAN NOT NULL DEFAULT false,
  ijazah BOOLEAN NOT NULL DEFAULT false,
  skhun BOOLEAN NOT NULL DEFAULT false,
  pas_photo BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT candidate_documents_candidate_tenant_fk
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id)
    ON DELETE CASCADE,
  UNIQUE (tenant_id, candidate_id)
);

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

CREATE TRIGGER candidates_set_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER candidate_documents_set_updated_at
  BEFORE UPDATE ON public.candidate_documents
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
  WHERE p.user_id = auth.uid()
    AND p.status = 'active'
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
    AND t.status = 'active'
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

CREATE POLICY tenants_select_current_tenant
  ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());

CREATE POLICY profiles_select_self_or_tenant_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      tenant_id = public.current_tenant_id()
      AND public.is_tenant_admin()
      AND public.has_module_access('users')
    )
  );

CREATE POLICY candidates_select_ppdb_admin
  ON public.candidates FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin()
    AND public.has_module_access('ppdb')
  );

CREATE POLICY candidate_documents_select_ppdb_admin
  ON public.candidate_documents FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.is_tenant_admin()
    AND public.has_module_access('ppdb')
  );

-- The browser cannot create accounts, assign roles, submit public PPDB, or mutate admissions
-- directly. Trusted backend functions will own writes after their authorization checks exist.
REVOKE ALL ON TABLE
  public.tenants,
  public.profiles,
  public.candidates,
  public.candidate_documents,
  public.registration_counters
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.tenants, public.profiles TO authenticated;
GRANT SELECT ON TABLE public.candidates, public.candidate_documents TO authenticated;

GRANT ALL ON TABLE
  public.tenants,
  public.profiles,
  public.candidates,
  public.candidate_documents,
  public.registration_counters
TO service_role;

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
  'Auth profile and tenant role source of truth. Browser writes are denied; trusted backend provisions roles and permissions.';
COMMENT ON TABLE public.candidates IS
  'Tenant-scoped PPDB records. Anonymous reads/writes are denied; public submission must use a rate-limited trusted Edge Function.';
COMMENT ON TABLE public.registration_counters IS
  'Per-tenant/year counter. Only trusted backend code may allocate values transactionally.';

COMMIT;
