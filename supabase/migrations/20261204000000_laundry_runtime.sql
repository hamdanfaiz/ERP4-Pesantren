-- Tenant-scoped laundry orders and quota settings. Sample UI records are not imported.
-- Staged locally only; reconcile the remote migration history before applying.
BEGIN;

CREATE TABLE public.laundry_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE RESTRICT,
  monthly_quota_kg NUMERIC(8,2) NOT NULL DEFAULT 20 CHECK (monthly_quota_kg BETWEEN 0 AND 1000),
  excess_rate_per_kg BIGINT NOT NULL DEFAULT 15000 CHECK (excess_rate_per_kg BETWEEN 0 AND 10000000),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE public.laundry_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  student_id UUID NOT NULL,
  weight_kg NUMERIC(7,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 100),
  pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces BETWEEN 0 AND 1000),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','washing','ready','collected','cancelled')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,order_number),
  FOREIGN KEY (tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((status='collected')=(collected_at IS NOT NULL))
);
CREATE INDEX laundry_orders_tenant_created_idx ON public.laundry_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX laundry_orders_tenant_student_created_idx ON public.laundry_orders(tenant_id,student_id,created_at DESC);
CREATE INDEX laundry_orders_tenant_status_idx ON public.laundry_orders(tenant_id,status,created_at DESC);

CREATE TABLE public.laundry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  order_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('order_received','status_changed','settings_updated')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES public.laundry_orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX laundry_events_tenant_time_idx ON public.laundry_events(tenant_id,created_at DESC,id DESC);

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['laundry_settings','laundry_orders','laundry_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assert_tenant_laundry_admin(p_tenant_id UUID,p_actor_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_permissions JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Tenant and actor required' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT module_permissions INTO v_permissions FROM public.profiles
    WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') FOR SHARE;
  IF NOT FOUND OR COALESCE(v_permissions->>'laundry','true')<>'true' THEN
    RAISE EXCEPTION 'Laundry permission required' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_tenant_laundry_order(
  p_tenant_id UUID,p_actor_user_id UUID,p_student_id UUID,p_weight_kg NUMERIC,p_pieces INTEGER,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_order_id UUID; v_number TEXT; v_student public.students%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_student_id IS NULL OR p_client_request_id IS NULL OR p_weight_kg IS NULL OR p_weight_kg<=0 OR p_weight_kg>100
    OR p_pieces IS NULL OR p_pieces<0 OR p_pieces>1000 THEN
    RAISE EXCEPTION 'Invalid laundry order' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT order_id INTO v_order_id FROM public.laundry_events WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_order_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_order_id,'replayed',true); END IF;
  SELECT * INTO v_student FROM public.students WHERE tenant_id=p_tenant_id AND id=p_student_id FOR SHARE;
  IF NOT FOUND OR lower(btrim(v_student.status)) IN ('archived','inactive','alumni','graduated','nonaktif','dikeluarkan') THEN
    RAISE EXCEPTION 'Active student not found in tenant' USING ERRCODE='P0002';
  END IF;
  v_order_id:=gen_random_uuid();
  v_number:='LDY-'||upper(substr(replace(v_order_id::TEXT,'-',''),1,12));
  INSERT INTO public.laundry_orders(id,tenant_id,order_number,student_id,weight_kg,pieces,created_by,updated_by)
    VALUES(v_order_id,p_tenant_id,v_number,p_student_id,p_weight_kg,p_pieces,p_actor_user_id,p_actor_user_id);
  INSERT INTO public.laundry_events(tenant_id,order_id,event_type,client_request_id,actor_user_id,details)
    VALUES(p_tenant_id,v_order_id,'order_received',p_client_request_id,p_actor_user_id,
      jsonb_build_object('status','received','weightKg',p_weight_kg,'pieces',p_pieces));
  RETURN jsonb_build_object('id',v_order_id,'orderNumber',v_number,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.transition_tenant_laundry_order(
  p_tenant_id UUID,p_actor_user_id UUID,p_order_id UUID,p_next_status TEXT,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_order public.laundry_orders%ROWTYPE; v_prior_order UUID; v_allowed BOOLEAN:=false;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_order_id IS NULL OR p_client_request_id IS NULL OR p_next_status NOT IN ('washing','ready','collected','cancelled') THEN
    RAISE EXCEPTION 'Invalid laundry transition' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT order_id INTO v_prior_order FROM public.laundry_events WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_prior_order IS NOT NULL THEN
    IF v_prior_order<>p_order_id THEN RAISE EXCEPTION 'Request ID reused for another order' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('id',v_prior_order,'replayed',true);
  END IF;
  SELECT * INTO v_order FROM public.laundry_orders WHERE tenant_id=p_tenant_id AND id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laundry order not found' USING ERRCODE='P0002'; END IF;
  v_allowed:=CASE
    WHEN p_next_status='cancelled' THEN v_order.status IN ('received','washing','ready')
    WHEN v_order.status='received' THEN p_next_status='washing'
    WHEN v_order.status='washing' THEN p_next_status='ready'
    WHEN v_order.status='ready' THEN p_next_status='collected'
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Invalid laundry status transition' USING ERRCODE='23514'; END IF;
  UPDATE public.laundry_orders SET status=p_next_status,
    collected_at=CASE WHEN p_next_status='collected' THEN now() ELSE NULL END,
    updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;
  INSERT INTO public.laundry_events(tenant_id,order_id,event_type,client_request_id,actor_user_id,details)
    VALUES(p_tenant_id,p_order_id,'status_changed',p_client_request_id,p_actor_user_id,
      jsonb_build_object('from',v_order.status,'to',p_next_status));
  RETURN jsonb_build_object('id',p_order_id,'status',p_next_status,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.save_tenant_laundry_settings(
  p_tenant_id UUID,p_actor_user_id UUID,p_monthly_quota_kg NUMERIC,p_excess_rate_per_kg BIGINT,p_client_request_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_previous UUID;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id,p_actor_user_id);
  IF p_client_request_id IS NULL OR p_monthly_quota_kg IS NULL OR p_monthly_quota_kg<0 OR p_monthly_quota_kg>1000
    OR p_excess_rate_per_kg IS NULL OR p_excess_rate_per_kg<0 OR p_excess_rate_per_kg>10000000 THEN
    RAISE EXCEPTION 'Invalid laundry settings' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-settings:'||p_tenant_id::TEXT,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:'||p_tenant_id::TEXT||':'||p_client_request_id::TEXT,0));
  SELECT id INTO v_previous FROM public.laundry_events WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_previous IS NOT NULL THEN RETURN jsonb_build_object('replayed',true); END IF;
  INSERT INTO public.laundry_settings(tenant_id,monthly_quota_kg,excess_rate_per_kg,updated_by,updated_at)
    VALUES(p_tenant_id,p_monthly_quota_kg,p_excess_rate_per_kg,p_actor_user_id,now())
    ON CONFLICT(tenant_id) DO UPDATE SET monthly_quota_kg=EXCLUDED.monthly_quota_kg,
      excess_rate_per_kg=EXCLUDED.excess_rate_per_kg,updated_by=EXCLUDED.updated_by,updated_at=now();
  INSERT INTO public.laundry_events(tenant_id,event_type,client_request_id,actor_user_id,details)
    VALUES(p_tenant_id,'settings_updated',p_client_request_id,p_actor_user_id,
      jsonb_build_object('monthlyQuotaKg',p_monthly_quota_kg,'excessRatePerKg',p_excess_rate_per_kg));
  RETURN jsonb_build_object('replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.assert_tenant_laundry_admin(UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_laundry_order(UUID,UUID,UUID,NUMERIC,INTEGER,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_tenant_laundry_order(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_tenant_laundry_settings(UUID,UUID,NUMERIC,BIGINT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_laundry_order(UUID,UUID,UUID,NUMERIC,INTEGER,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_tenant_laundry_order(UUID,UUID,UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_laundry_settings(UUID,UUID,NUMERIC,BIGINT,UUID) TO service_role;

COMMIT;
