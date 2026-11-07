-- Keep payload-aware idempotency around operations that now allocate identifiers.
-- The inner functions own the atomic business writes and generated numbers; callers
-- can execute only these outer wrappers.
BEGIN;

ALTER FUNCTION public.record_donation(UUID, UUID, JSONB)
  RENAME TO record_donation_with_naming_series;
REVOKE ALL ON FUNCTION public.record_donation_with_naming_series(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_donation(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_request UUID;
  v_fingerprint TEXT;
  v_existing public.donation_mutation_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id, p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Data donasi tidak valid' USING ERRCODE = '22023';
  END IF;
  v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'ID permintaan donasi tidak valid' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := public.donation_request_fingerprint(p_item - 'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::TEXT || ':donation-mutation:' || v_request::TEXT, 0
  ));
  SELECT * INTO v_existing
  FROM public.donation_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = v_request
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.operation <> 'record_donation'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint <> v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object('replayed', true);
  END IF;

  v_result := public.record_donation_with_naming_series(p_tenant_id, p_actor_user_id, p_item);
  INSERT INTO public.donation_mutation_requests (
    tenant_id, client_request_id, actor_user_id, operation, payload_fingerprint, response
  ) VALUES (
    p_tenant_id, v_request, p_actor_user_id, 'record_donation', v_fingerprint, v_result
  );
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_donation(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_donation(UUID, UUID, JSONB) TO service_role;

ALTER FUNCTION public.create_tenant_laundry_order(UUID, UUID, UUID, NUMERIC, INTEGER, UUID)
  RENAME TO create_tenant_laundry_order_with_naming_series;
REVOKE ALL ON FUNCTION public.create_tenant_laundry_order_with_naming_series(UUID, UUID, UUID, NUMERIC, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_tenant_laundry_order(
  p_tenant_id UUID, p_actor_user_id UUID, p_student_id UUID, p_weight_kg NUMERIC,
  p_pieces INTEGER, p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_existing public.laundry_mutation_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id, p_actor_user_id);
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_student_id IS NULL OR p_client_request_id IS NULL
    OR p_weight_kg IS NULL OR p_weight_kg <= 0 OR p_weight_kg > 100
    OR p_pieces IS NULL OR p_pieces < 0 OR p_pieces > 1000 THEN
    RAISE EXCEPTION 'Data pesanan laundry tidak valid' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := public.laundry_request_fingerprint(jsonb_build_object(
    'studentId', p_student_id,
    'weightKg', p_weight_kg::NUMERIC(7,2),
    'pieces', p_pieces
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'laundry-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing
  FROM public.laundry_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.operation <> 'create_order'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint <> v_fingerprint) THEN
      RAISE EXCEPTION 'Laundry request ID reused with another actor, operation, or payload' USING ERRCODE = '23514';
    END IF;
    RETURN v_existing.response || jsonb_build_object('replayed', true);
  END IF;

  v_result := public.create_tenant_laundry_order_with_naming_series(
    p_tenant_id, p_actor_user_id, p_student_id, p_weight_kg, p_pieces, p_client_request_id
  );
  INSERT INTO public.laundry_mutation_requests (
    tenant_id, client_request_id, actor_user_id, operation, payload_fingerprint, response
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, 'create_order', v_fingerprint, v_result
  );
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_tenant_laundry_order(UUID, UUID, UUID, NUMERIC, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_laundry_order(UUID, UUID, UUID, NUMERIC, INTEGER, UUID)
  TO service_role;

-- This invoker wrapper reads the private idempotency ledger before calling the
-- actor-validating onboarding RPC. Give only the trusted server role read access;
-- clients still have no table grants and no direct function execution.
GRANT SELECT ON TABLE public.ppdb_onboarding_events TO service_role;

COMMIT;
