-- Make Laundry retries safe across timeouts and post-commit refresh failures.
-- Historical event keys are reserved without guessing their original payload.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.laundry_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create_order','transition_order','save_settings')),
  payload_fingerprint TEXT CHECK (payload_fingerprint IS NULL OR payload_fingerprint ~ '^[0-9a-f]{64}$'),
  response JSONB NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
ALTER TABLE public.laundry_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_mutation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.laundry_mutation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.laundry_mutation_requests TO service_role;
CREATE INDEX laundry_mutation_requests_created_idx
  ON public.laundry_mutation_requests(tenant_id,created_at DESC);

CREATE FUNCTION public.laundry_request_fingerprint(p_payload JSONB)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT SECURITY INVOKER
SET search_path=public,extensions,pg_temp AS $$
  SELECT encode(digest(convert_to(p_payload::TEXT,'UTF8'),'sha256'),'hex')
$$;
REVOKE ALL ON FUNCTION public.laundry_request_fingerprint(JSONB) FROM PUBLIC,anon,authenticated,service_role;

-- Existing events do not contain every original request field. Reserve their
-- request IDs and replay their saved outcome without re-running a side effect.
INSERT INTO public.laundry_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT e.tenant_id,e.client_request_id,e.actor_user_id,
  CASE e.event_type
    WHEN 'order_received' THEN 'create_order'
    WHEN 'status_changed' THEN 'transition_order'
    WHEN 'settings_updated' THEN 'save_settings'
  END,
  NULL,
  CASE e.event_type
    WHEN 'order_received' THEN jsonb_build_object('id',e.order_id,'orderNumber',o.order_number,'replayed',true)
    WHEN 'status_changed' THEN jsonb_build_object('id',e.order_id,'status',e.details->>'to','replayed',true)
    ELSE jsonb_build_object('replayed',true)
  END,
  e.created_at
FROM public.laundry_events e
LEFT JOIN public.laundry_orders o ON o.tenant_id=e.tenant_id AND o.id=e.order_id
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

ALTER FUNCTION public.create_tenant_laundry_order(UUID,UUID,UUID,NUMERIC,INTEGER,UUID)
  RENAME TO create_tenant_laundry_order_pre_payload_guard;
ALTER FUNCTION public.transition_tenant_laundry_order(UUID,UUID,UUID,TEXT,UUID)
  RENAME TO transition_tenant_laundry_order_pre_payload_guard;
ALTER FUNCTION public.save_tenant_laundry_settings(UUID,UUID,NUMERIC,BIGINT,UUID)
  RENAME TO save_tenant_laundry_settings_pre_payload_guard;

REVOKE ALL ON FUNCTION public.create_tenant_laundry_order_pre_payload_guard(UUID,UUID,UUID,NUMERIC,INTEGER,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.transition_tenant_laundry_order_pre_payload_guard(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_tenant_laundry_settings_pre_payload_guard(UUID,UUID,NUMERIC,BIGINT,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_tenant_laundry_order(
  p_tenant_id UUID,p_actor_user_id UUID,p_student_id UUID,p_weight_kg NUMERIC,p_pieces INTEGER,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE
  v_existing public.laundry_mutation_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_student_id IS NULL OR p_client_request_id IS NULL
    OR p_weight_kg IS NULL OR p_weight_kg<=0 OR p_weight_kg>100
    OR p_pieces IS NULL OR p_pieces<0 OR p_pieces>1000 THEN
    RAISE EXCEPTION 'Invalid laundry order' USING ERRCODE='22023';
  END IF;
  v_fingerprint:=public.laundry_request_fingerprint(jsonb_build_object(
    'studentId',p_student_id,'weightKg',p_weight_kg,'pieces',p_pieces
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.laundry_mutation_requests
    WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'create_order'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Laundry request ID reused with another actor, operation, or payload' USING ERRCODE='23514';
    END IF;
    RETURN v_existing.response;
  END IF;
  v_result:=public.create_tenant_laundry_order_pre_payload_guard(
    p_tenant_id,p_actor_user_id,p_student_id,p_weight_kg,p_pieces,p_client_request_id
  );
  INSERT INTO public.laundry_mutation_requests
    (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
  VALUES (p_tenant_id,p_client_request_id,p_actor_user_id,'create_order',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.transition_tenant_laundry_order(
  p_tenant_id UUID,p_actor_user_id UUID,p_order_id UUID,p_next_status TEXT,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE
  v_existing public.laundry_mutation_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_order_id IS NULL OR p_client_request_id IS NULL
    OR p_next_status NOT IN ('washing','ready','collected','cancelled') THEN
    RAISE EXCEPTION 'Invalid laundry transition' USING ERRCODE='22023';
  END IF;
  v_fingerprint:=public.laundry_request_fingerprint(jsonb_build_object('orderId',p_order_id,'status',p_next_status));
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.laundry_mutation_requests
    WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'transition_order'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Laundry request ID reused with another actor, operation, or payload' USING ERRCODE='23514';
    END IF;
    RETURN v_existing.response;
  END IF;
  v_result:=public.transition_tenant_laundry_order_pre_payload_guard(
    p_tenant_id,p_actor_user_id,p_order_id,p_next_status,p_client_request_id
  );
  INSERT INTO public.laundry_mutation_requests
    (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
  VALUES (p_tenant_id,p_client_request_id,p_actor_user_id,'transition_order',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.save_tenant_laundry_settings(
  p_tenant_id UUID,p_actor_user_id UUID,p_monthly_quota_kg NUMERIC,p_excess_rate_per_kg BIGINT,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE
  v_existing public.laundry_mutation_requests%ROWTYPE;
  v_fingerprint TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_monthly_quota_kg IS NULL OR p_monthly_quota_kg<0 OR p_monthly_quota_kg>1000
    OR p_excess_rate_per_kg IS NULL OR p_excess_rate_per_kg<0 OR p_excess_rate_per_kg>10000000 THEN
    RAISE EXCEPTION 'Invalid laundry settings' USING ERRCODE='22023';
  END IF;
  v_fingerprint:=public.laundry_request_fingerprint(jsonb_build_object(
    'monthlyQuotaKg',p_monthly_quota_kg,'excessRatePerKg',p_excess_rate_per_kg
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-settings:'||p_tenant_id::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.laundry_mutation_requests
    WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'save_settings'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Laundry request ID reused with another actor, operation, or payload' USING ERRCODE='23514';
    END IF;
    RETURN v_existing.response;
  END IF;
  v_result:=public.save_tenant_laundry_settings_pre_payload_guard(
    p_tenant_id,p_actor_user_id,p_monthly_quota_kg,p_excess_rate_per_kg,p_client_request_id
  );
  INSERT INTO public.laundry_mutation_requests
    (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
  VALUES (p_tenant_id,p_client_request_id,p_actor_user_id,'save_settings',v_fingerprint,v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.create_tenant_laundry_order(UUID,UUID,UUID,NUMERIC,INTEGER,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_tenant_laundry_order(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_tenant_laundry_settings(UUID,UUID,NUMERIC,BIGINT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_laundry_order(UUID,UUID,UUID,NUMERIC,INTEGER,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_tenant_laundry_order(UUID,UUID,UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_laundry_settings(UUID,UUID,NUMERIC,BIGINT,UUID) TO service_role;

COMMIT;
