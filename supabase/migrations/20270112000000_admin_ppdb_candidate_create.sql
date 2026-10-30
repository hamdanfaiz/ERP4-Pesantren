-- Admin-created PPDB candidates: tenant-bound actor attribution and atomic retry-safe batches.
BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_created_by_tenant_fkey'
      AND conrelid = 'public.candidates'::regclass
  ) THEN
    ALTER TABLE public.candidates
      ADD CONSTRAINT candidates_created_by_tenant_fkey
      FOREIGN KEY (tenant_id, created_by_user_id)
      REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS candidates_tenant_created_by_idx
  ON public.candidates (tenant_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE TABLE public.ppdb_candidate_creation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  payload_fingerprint BYTEA NOT NULL CHECK (octet_length(payload_fingerprint) = 32),
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.ppdb_candidate_creation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_candidate_creation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_candidate_creation_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.ppdb_candidate_creation_requests TO service_role;

COMMENT ON TABLE public.ppdb_candidate_creation_requests IS
  'Immutable idempotency and actor record for trusted Admin-created PPDB candidate batches; stores a keyed payload fingerprint, not applicant data.';

CREATE OR REPLACE FUNCTION public.create_admin_ppdb_candidates_batch(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_payload_fingerprint TEXT,
  p_candidates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.ppdb_candidate_creation_requests%ROWTYPE;
  v_item JSONB;
  v_candidate_id UUID;
  v_registration_id TEXT;
  v_created JSONB;
  v_results JSONB := '[]'::jsonb;
  v_response JSONB;
  v_row_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-fA-F]{64}$'
    OR p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN
    RAISE EXCEPTION 'Invalid PPDB candidate batch input' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'PPDB candidate batch must contain between 1 and 100 records' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.tenants
  WHERE id = p_tenant_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT profile.role INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id
    AND profile.user_id = p_actor_user_id
    AND profile.status = 'active'
    AND profile.role IN ('admin', 'super_admin')
    AND profile.role = p_expected_role
    AND (
      profile.role = 'super_admin'
      OR NOT (profile.module_permissions ? 'ppdb')
      OR (jsonb_typeof(profile.module_permissions -> 'ppdb') = 'boolean'
        AND profile.module_permissions ->> 'ppdb' = 'true')
    )
  FOR SHARE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Active Admin PPDB permission is required' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item->'candidate') IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'workflowData', '{}'::jsonb)) IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'documents', '{}'::jsonb)) IS DISTINCT FROM 'object'
      OR NULLIF(btrim(v_item->>'registrationId'), '') IS NULL
      OR length(v_item->>'registrationId') > 50 THEN
      RAISE EXCEPTION 'Invalid PPDB candidate record in batch' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ppdb-candidate-create:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));

  SELECT * INTO v_existing
  FROM public.ppdb_candidate_creation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id
      OR v_existing.payload_fingerprint <> decode(p_payload_fingerprint, 'hex') THEN
      RAISE EXCEPTION 'PPDB request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object('alreadyApplied', true);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    v_candidate_id := (v_item->>'candidateId')::UUID;
    v_registration_id := btrim(v_item->>'registrationId');
    v_created := public.create_admin_ppdb_candidate(
      p_tenant_id,
      v_candidate_id,
      v_registration_id,
      v_item->'candidate',
      COALESCE(v_item->'workflowData', '{}'::jsonb),
      COALESCE(v_item->'documents', '{}'::jsonb)
    );

    UPDATE public.candidates
    SET created_by_user_id = p_actor_user_id
    WHERE tenant_id = p_tenant_id AND id = v_candidate_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'Created candidate attribution could not be saved' USING ERRCODE = '23503';
    END IF;

    v_results := v_results || jsonb_build_array(v_created);
  END LOOP;

  v_response := jsonb_build_object(
    'alreadyApplied', false,
    'requestId', p_client_request_id,
    'candidates', v_results
  );
  INSERT INTO public.ppdb_candidate_creation_requests (
    tenant_id, client_request_id, actor_user_id, payload_fingerprint, response
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id,
    decode(p_payload_fingerprint, 'hex'), v_response
  );
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID, UUID, TEXT, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID, UUID, TEXT, UUID, TEXT, JSONB)
  TO service_role;

COMMIT;
