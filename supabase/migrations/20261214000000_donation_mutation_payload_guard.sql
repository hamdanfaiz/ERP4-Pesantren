-- Guard Donation/Waqf write retries with tenant-scoped, payload-aware receipts.
-- Staged only; verify remote migration history before applying to any customer database.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.donation_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('campaign','donor','waqf_asset','record_donation','void_donation')),
  payload_fingerprint TEXT CHECK (payload_fingerprint IS NULL OR payload_fingerprint ~ '^[0-9a-f]{64}$'),
  response JSONB NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
ALTER TABLE public.donation_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_mutation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.donation_mutation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.donation_mutation_requests TO service_role;
CREATE INDEX donation_mutation_requests_created_idx
  ON public.donation_mutation_requests(tenant_id,created_at DESC);

CREATE FUNCTION public.donation_request_fingerprint(p_payload JSONB)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT SECURITY INVOKER
SET search_path=public,extensions,pg_temp AS $$
  SELECT encode(digest(convert_to(p_payload::TEXT,'UTF8'),'sha256'),'hex')
$$;
REVOKE ALL ON FUNCTION public.donation_request_fingerprint(JSONB) FROM PUBLIC,anon,authenticated;

-- Old audit events did not retain the complete input. Reserve those keys so a
-- post-migration retry cannot repeat a committed transaction; NULL means legacy
-- payload unavailable, so only same actor/operation may replay that old result.
INSERT INTO public.donation_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT e.tenant_id,e.client_request_id,e.actor_user_id,
  CASE
    WHEN e.entity_type='campaign' THEN 'campaign'
    WHEN e.entity_type='donor' THEN 'donor'
    WHEN e.entity_type='waqf_asset' THEN 'waqf_asset'
    WHEN e.entity_type='donation' AND e.action='voided' THEN 'void_donation'
    WHEN e.entity_type='donation' AND e.action='created' THEN 'record_donation'
  END,
  NULL,
  CASE WHEN e.entity_type='donation' THEN
    jsonb_build_object('id',e.entity_id,'receiptNumber',d.receipt_number,'replayed',true)
  ELSE jsonb_build_object('id',e.entity_id,'replayed',true) END,
  e.created_at
FROM public.donation_audit_events e
LEFT JOIN public.donations d ON d.tenant_id=e.tenant_id AND d.id=e.entity_id
WHERE (e.entity_type IN ('campaign','donor','waqf_asset') AND e.action IN ('created','updated'))
   OR (e.entity_type='donation' AND e.action IN ('created','voided'))
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

ALTER FUNCTION public.manage_donation_campaign(UUID,UUID,JSONB)
  RENAME TO manage_donation_campaign_pre_payload_guard;
ALTER FUNCTION public.manage_donation_donor(UUID,UUID,JSONB)
  RENAME TO manage_donation_donor_pre_payload_guard;
ALTER FUNCTION public.manage_waqf_asset(UUID,UUID,JSONB)
  RENAME TO manage_waqf_asset_pre_payload_guard;
ALTER FUNCTION public.record_donation(UUID,UUID,JSONB)
  RENAME TO record_donation_pre_payload_guard;
ALTER FUNCTION public.void_donation(UUID,UUID,UUID,TEXT,UUID)
  RENAME TO void_donation_pre_payload_guard;

REVOKE ALL ON FUNCTION public.manage_donation_campaign_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.manage_donation_donor_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.manage_waqf_asset_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_donation_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.void_donation_pre_payload_guard(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.manage_donation_campaign(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_request UUID; v_fingerprint TEXT; v_existing public.donation_mutation_requests%ROWTYPE; v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid campaign payload' USING ERRCODE='22023'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.donation_request_fingerprint(p_item-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.donation_mutation_requests WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'campaign'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.manage_donation_campaign_pre_payload_guard(p_tenant_id,p_actor_user_id,p_item);
  INSERT INTO public.donation_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'campaign',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.manage_donation_donor(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_request UUID; v_fingerprint TEXT; v_existing public.donation_mutation_requests%ROWTYPE; v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid donor payload' USING ERRCODE='22023'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.donation_request_fingerprint(p_item-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.donation_mutation_requests WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'donor'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.manage_donation_donor_pre_payload_guard(p_tenant_id,p_actor_user_id,p_item);
  INSERT INTO public.donation_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'donor',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.manage_waqf_asset(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_request UUID; v_fingerprint TEXT; v_existing public.donation_mutation_requests%ROWTYPE; v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid waqf payload' USING ERRCODE='22023'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.donation_request_fingerprint(p_item-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.donation_mutation_requests WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'waqf_asset'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.manage_waqf_asset_pre_payload_guard(p_tenant_id,p_actor_user_id,p_item);
  INSERT INTO public.donation_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'waqf_asset',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.record_donation(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_request UUID; v_fingerprint TEXT; v_existing public.donation_mutation_requests%ROWTYPE; v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid donation payload' USING ERRCODE='22023'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.donation_request_fingerprint(p_item-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.donation_mutation_requests WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'record_donation'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.record_donation_pre_payload_guard(p_tenant_id,p_actor_user_id,p_item);
  INSERT INTO public.donation_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'record_donation',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.void_donation(p_tenant_id UUID,p_actor_user_id UUID,p_donation_id UUID,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_fingerprint TEXT; v_existing public.donation_mutation_requests%ROWTYPE; v_result JSONB;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.donation_request_fingerprint(jsonb_build_object('donationId',p_donation_id,'reason',btrim(COALESCE(p_reason,''))));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-mutation:'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.donation_mutation_requests WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'void_donation'
      OR (v_existing.payload_fingerprint IS NOT NULL AND v_existing.payload_fingerprint<>v_fingerprint) THEN
      RAISE EXCEPTION 'Donation request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.void_donation_pre_payload_guard(p_tenant_id,p_actor_user_id,p_donation_id,p_reason,p_client_request_id);
  INSERT INTO public.donation_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,p_client_request_id,p_actor_user_id,'void_donation',v_fingerprint,v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.manage_donation_campaign(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_donation_donor(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_waqf_asset(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_donation(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.void_donation(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_donation_campaign(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_donation_donor(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_waqf_asset(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_donation(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_donation(UUID,UUID,UUID,TEXT,UUID) TO service_role;

COMMENT ON TABLE public.donation_mutation_requests IS
  'Tenant-scoped SHA-256 idempotency receipts for Donation/Waqf writes. Legacy payloads are marked unverifiable, not reconstructed.';
COMMIT;
