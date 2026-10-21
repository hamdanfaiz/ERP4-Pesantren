-- Temporary identity bridge for staged Firebase-to-Supabase migration.
-- Supabase Auth remains the canonical identity; this maps verified legacy Firebase
-- subjects to their provisioned Supabase profile while old screens still use Firebase.
BEGIN;

CREATE TABLE public.legacy_auth_links (
  legacy_provider TEXT NOT NULL CHECK (legacy_provider = 'firebase'),
  legacy_subject TEXT NOT NULL CHECK (length(btrim(legacy_subject)) BETWEEN 1 AND 160),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (legacy_provider, legacy_subject),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.legacy_auth_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_auth_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legacy_auth_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.legacy_auth_links TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_legacy_auth_profile(
  p_legacy_provider TEXT,
  p_legacy_subject TEXT,
  p_tenant_id UUID
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT l.user_id
  FROM public.legacy_auth_links AS l
  JOIN public.profiles AS p
    ON p.tenant_id = l.tenant_id AND p.user_id = l.user_id
  JOIN public.tenants AS t ON t.id = l.tenant_id
  WHERE l.legacy_provider = p_legacy_provider
    AND l.legacy_subject = p_legacy_subject
    AND l.tenant_id = p_tenant_id
    AND p.status = 'active'
    AND t.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.resolve_legacy_auth_profile(TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_auth_profile(TEXT, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.legacy_auth_links IS
  'Temporary server-only bridge from a verified Firebase UID to its canonical Supabase Auth profile. Drop after all Firebase runtime and sessions are retired.';

COMMIT;
