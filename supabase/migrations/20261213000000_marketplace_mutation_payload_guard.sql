-- Guard marketplace idempotency keys against changed payloads and cover update/archive mutations.
-- Staged migration only; do not apply to a live customer database before release review.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.marketplace_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('manage_product','adjust_stock','create_order','transition_order')),
  payload_fingerprint TEXT NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
ALTER TABLE public.marketplace_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_mutation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_mutation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_mutation_requests TO service_role;
CREATE INDEX marketplace_mutation_requests_created_idx
  ON public.marketplace_mutation_requests(tenant_id,created_at DESC);

CREATE FUNCTION public.marketplace_request_fingerprint(p_payload JSONB)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT SECURITY INVOKER
SET search_path=public,extensions,pg_temp AS $$
  SELECT encode(digest(convert_to(p_payload::TEXT,'UTF8'),'sha256'),'hex')
$$;
REVOKE ALL ON FUNCTION public.marketplace_request_fingerprint(JSONB) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.assert_marketplace_writer(p_tenant_id UUID,p_actor_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles
  WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active'
    AND role IN ('admin','super_admin')
    AND (NOT COALESCE(module_permissions ? 'marketplace',false)
      OR COALESCE(module_permissions->>'marketplace','false')='true')
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_marketplace_writer(UUID,UUID) FROM PUBLIC,anon,authenticated;

-- Preserve the old implementations as private workers. New public RPC names are the
-- only entry points and atomically record the response with the business mutation.
ALTER FUNCTION public.manage_marketplace_product(UUID,UUID,JSONB)
  RENAME TO manage_marketplace_product_pre_payload_guard;
ALTER FUNCTION public.adjust_marketplace_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID)
  RENAME TO adjust_marketplace_stock_pre_payload_guard;
ALTER FUNCTION public.create_marketplace_order(UUID,UUID,JSONB)
  RENAME TO create_marketplace_order_pre_payload_guard;
ALTER FUNCTION public.transition_marketplace_order(UUID,UUID,UUID,TEXT,UUID)
  RENAME TO transition_marketplace_order_pre_payload_guard;

REVOKE ALL ON FUNCTION public.manage_marketplace_product_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.adjust_marketplace_stock_pre_payload_guard(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_marketplace_order_pre_payload_guard(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.transition_marketplace_order_pre_payload_guard(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.manage_marketplace_product(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE
  v_request UUID;
  v_fingerprint TEXT;
  v_existing public.marketplace_mutation_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  PERFORM public.assert_marketplace_writer(p_tenant_id,p_actor_user_id);
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.marketplace_request_fingerprint(p_item-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.marketplace_mutation_requests
  WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'manage_product'
      OR v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'Marketplace request ID was already used for a different mutation'
        USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.manage_marketplace_product_pre_payload_guard(p_tenant_id,p_actor_user_id,p_item);
  INSERT INTO public.marketplace_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'manage_product',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.adjust_marketplace_stock(p_tenant_id UUID,p_actor_user_id UUID,p_product_id UUID,p_delta INTEGER,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE
  v_fingerprint TEXT;
  v_existing public.marketplace_mutation_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  PERFORM public.assert_marketplace_writer(p_tenant_id,p_actor_user_id);
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.marketplace_request_fingerprint(jsonb_build_object(
    'productId',p_product_id,'delta',p_delta,'reason',btrim(COALESCE(p_reason,''))));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-mutation:'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.marketplace_mutation_requests
  WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'adjust_stock'
      OR v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'Marketplace request ID was already used for a different mutation'
        USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.adjust_marketplace_stock_pre_payload_guard(p_tenant_id,p_actor_user_id,p_product_id,p_delta,p_reason,p_client_request_id);
  INSERT INTO public.marketplace_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,p_client_request_id,p_actor_user_id,'adjust_stock',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.create_marketplace_order(p_tenant_id UUID,p_actor_user_id UUID,p_order JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE
  v_request UUID;
  v_fingerprint TEXT;
  v_existing public.marketplace_mutation_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  PERFORM public.assert_marketplace_writer(p_tenant_id,p_actor_user_id);
  v_request:=NULLIF(p_order->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.marketplace_request_fingerprint(p_order-'clientRequestId');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-mutation:'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.marketplace_mutation_requests
  WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'create_order'
      OR v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'Marketplace request ID was already used for a different mutation'
        USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.create_marketplace_order_pre_payload_guard(p_tenant_id,p_actor_user_id,p_order);
  INSERT INTO public.marketplace_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,v_request,p_actor_user_id,'create_order',v_fingerprint,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.transition_marketplace_order(p_tenant_id UUID,p_actor_user_id UUID,p_order_id UUID,p_status TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE
  v_fingerprint TEXT;
  v_existing public.marketplace_mutation_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  PERFORM public.assert_marketplace_writer(p_tenant_id,p_actor_user_id);
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  v_fingerprint:=public.marketplace_request_fingerprint(jsonb_build_object('orderId',p_order_id,'status',p_status));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-mutation:'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.marketplace_mutation_requests
  WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id<>p_actor_user_id OR v_existing.operation<>'transition_order'
      OR v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'Marketplace request ID was already used for a different mutation'
        USING ERRCODE='23505';
    END IF;
    RETURN v_existing.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.transition_marketplace_order_pre_payload_guard(p_tenant_id,p_actor_user_id,p_order_id,p_status,p_client_request_id);
  INSERT INTO public.marketplace_mutation_requests(tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response)
    VALUES(p_tenant_id,p_client_request_id,p_actor_user_id,'transition_order',v_fingerprint,v_result);
  RETURN v_result;
END $$;

-- Seed retry records for already committed runtime requests. Keep payloads out of this
-- ledger; only a SHA-256 fingerprint and the minimal original response are retained.
INSERT INTO public.marketplace_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT p.tenant_id,p.client_request_id,p.created_by,'manage_product',
  public.marketplace_request_fingerprint(jsonb_build_object(
    'action','create','sku',p.sku,'name',p.name,'category',p.category,'unitPrice',p.unit_price,
    'initialStock',COALESCE(m.balance_after,0),'seller',p.seller,'imageLabel',p.image_label)),
  jsonb_build_object('id',p.id,'replayed',false,'product',jsonb_build_object(
    'sku',p.sku,'name',p.name,'category',p.category,'unit_price',p.unit_price,
    'stock_quantity',p.stock_quantity,'seller',p.seller,'image_label',p.image_label,'status',p.status)),
  p.created_at
FROM public.marketplace_products p
LEFT JOIN public.marketplace_stock_movements m
  ON m.tenant_id=p.tenant_id AND m.client_request_id=p.client_request_id AND m.reason='Stok awal produk'
WHERE p.source_system='supabase_runtime'
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

INSERT INTO public.marketplace_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT m.tenant_id,m.client_request_id,m.created_by,'adjust_stock',
  public.marketplace_request_fingerprint(jsonb_build_object(
    'productId',m.product_id,'delta',m.quantity_delta,'reason',m.reason)),
  jsonb_build_object('id',m.id,'balance',m.balance_after,'replayed',false),
  m.created_at
FROM public.marketplace_stock_movements m
WHERE m.order_id IS NULL AND m.reason<>'Stok awal produk'
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

INSERT INTO public.marketplace_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT o.tenant_id,o.client_request_id,o.created_by,'create_order',
  public.marketplace_request_fingerprint(jsonb_build_object(
    'customerName',o.customer_name,'customerType',o.customer_type,
    'items',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity) ORDER BY i.product_id)
      FROM public.marketplace_order_items i
      WHERE i.tenant_id=o.tenant_id AND i.order_id=o.id
    ),'[]'::JSONB))),
  jsonb_build_object('id',o.id,'totalAmount',o.total_amount,'itemCount',o.item_count,'status',o.status,'replayed',false),
  o.created_at
FROM public.marketplace_orders o
WHERE o.source_system='supabase_runtime'
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

INSERT INTO public.marketplace_mutation_requests
  (tenant_id,client_request_id,actor_user_id,operation,payload_fingerprint,response,created_at)
SELECT e.tenant_id,e.client_request_id,e.created_by,'transition_order',
  public.marketplace_request_fingerprint(jsonb_build_object('orderId',e.order_id,'status',e.after_status)),
  jsonb_build_object('id',e.order_id,'status',e.after_status,'replayed',false),
  e.created_at
FROM public.marketplace_order_events e
WHERE e.event_type='status_changed'
ON CONFLICT (tenant_id,client_request_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.manage_marketplace_product(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.adjust_marketplace_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_order(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_marketplace_order(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_marketplace_product(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_marketplace_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_order(UUID,UUID,UUID,TEXT,UUID) TO service_role;

COMMENT ON TABLE public.marketplace_mutation_requests IS
  'Tenant-scoped SHA-256 idempotency ledger for Marketplace writes; payload content is not retained.';

COMMIT;
