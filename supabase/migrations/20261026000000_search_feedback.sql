-- Tenant-scoped, minimal feedback for the AI search response controls.
BEGIN;

CREATE TABLE public.search_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL,
  request_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_user_id, request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.record_search_feedback(
  p_tenant_identifier TEXT,
  p_actor_user_id UUID,
  p_request_id UUID,
  p_rating SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_ids UUID[];
  v_tenant_id UUID;
  v_inserted INTEGER;
BEGIN
  IF p_tenant_identifier IS NULL OR length(trim(p_tenant_identifier)) = 0
    OR p_actor_user_id IS NULL OR p_request_id IS NULL
    OR p_rating IS NULL OR p_rating NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Feedback pencarian tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT t.id) INTO v_tenant_ids
  FROM public.tenants AS t
  WHERE t.status = 'active'
    AND (t.id::text = trim(p_tenant_identifier)
      OR t.legacy_tenant_key = trim(p_tenant_identifier)
      OR t.slug = lower(trim(p_tenant_identifier)));
  IF COALESCE(array_length(v_tenant_ids, 1), 0) <> 1 THEN
    RAISE EXCEPTION 'Tenant aktif tidak ditemukan' USING ERRCODE = '42501';
  END IF;
  v_tenant_id := v_tenant_ids[1];

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = v_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Akun aktif tidak cocok dengan tenant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.search_feedback (tenant_id, actor_user_id, request_id, rating)
  VALUES (v_tenant_id, p_actor_user_id, p_request_id, p_rating)
  ON CONFLICT (tenant_id, actor_user_id, request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'alreadyRecorded', v_inserted = 0);
END;
$$;

ALTER TABLE public.search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_feedback FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.search_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.search_feedback TO service_role;
REVOKE ALL ON FUNCTION public.record_search_feedback(TEXT, UUID, UUID, SMALLINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_search_feedback(TEXT, UUID, UUID, SMALLINT)
  TO service_role;

COMMENT ON TABLE public.search_feedback IS
  'Tenant-scoped search ratings only; raw user queries and search text are deliberately not stored.';
COMMENT ON FUNCTION public.record_search_feedback(TEXT, UUID, UUID, SMALLINT) IS
  'Idempotently records one minimal search rating for an active user in an active tenant.';

COMMIT;
