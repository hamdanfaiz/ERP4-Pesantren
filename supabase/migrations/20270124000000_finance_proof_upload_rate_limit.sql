-- Finance upload limits must be shared by all API instances and survive restarts.
-- Fingerprints are HMACs created by the trusted server; raw user IDs are never stored.
BEGIN;

DO $$
DECLARE
  v_constraint_count INTEGER;
  v_constraint_name TEXT;
BEGIN
  SELECT count(*), min(conname::TEXT)
    INTO v_constraint_count, v_constraint_name
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.public_rate_limits'::regclass
    AND contype = 'c'
    AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%endpoint%'
    AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%public_ppdb%';

  IF v_constraint_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one endpoint check constraint on public.public_rate_limits; found %', v_constraint_count;
  END IF;

  EXECUTE pg_catalog.format(
    'ALTER TABLE public.public_rate_limits DROP CONSTRAINT %I',
    v_constraint_name
  );
END;
$$;

ALTER TABLE public.public_rate_limits
  ADD CONSTRAINT public_rate_limits_endpoint_check
  CHECK (endpoint IN ('public_ppdb', 'finance_proof_upload'));

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_finance_proof_upload_rate_limit(
  p_tenant_id UUID,
  p_actor_fingerprint_hex TEXT,
  p_limit INTEGER DEFAULT 12
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hits INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_tenant_id IS NULL
    OR p_limit < 1
    OR p_limit > 100
    OR p_actor_fingerprint_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid finance proof rate limit input' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Finance proof tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.public_rate_limits (
    tenant_id, endpoint, client_fingerprint, window_started_at, hit_count
  ) VALUES (
    p_tenant_id,
    'finance_proof_upload',
    pg_catalog.decode(p_actor_fingerprint_hex, 'hex'),
    v_now,
    1
  )
  ON CONFLICT (tenant_id, endpoint, client_fingerprint)
  DO UPDATE SET
    hit_count = CASE
      WHEN public.public_rate_limits.window_started_at <= v_now - INTERVAL '15 minutes' THEN 1
      ELSE public.public_rate_limits.hit_count + 1
    END,
    window_started_at = CASE
      WHEN public.public_rate_limits.window_started_at <= v_now - INTERVAL '15 minutes' THEN v_now
      ELSE public.public_rate_limits.window_started_at
    END
  RETURNING hit_count INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_finance_proof_upload_rate_limit(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_finance_proof_upload_rate_limit(UUID, TEXT, INTEGER)
  TO service_role;

COMMIT;
