-- Make stock-adjustment request IDs bind to the original actor and exact movement.
BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_healthcare_stock(p_tenant_id UUID,p_actor_user_id UUID,p_medicine_id UUID,p_delta INTEGER,p_reason TEXT,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_stock INTEGER; v_id UUID; v_existing public.healthcare_stock_movements%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  IF p_medicine_id IS NULL OR p_delta=0 OR p_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-stock:'||p_tenant_id::TEXT||':'||p_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.healthcare_stock_movements
  WHERE tenant_id=p_tenant_id AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
      OR v_existing.medicine_id IS DISTINCT FROM p_medicine_id
      OR v_existing.quantity_delta IS DISTINCT FROM p_delta
      OR v_existing.reason IS DISTINCT FROM btrim(p_reason) THEN
      RAISE EXCEPTION 'Healthcare stock request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing.id,'alreadyApplied',true);
  END IF;
  SELECT stock_quantity INTO v_stock FROM public.healthcare_medicines WHERE tenant_id=p_tenant_id AND id=p_medicine_id FOR UPDATE;
  IF NOT FOUND OR v_stock+p_delta<0 THEN RAISE EXCEPTION 'Medicine stock is insufficient or item missing' USING ERRCODE='23514'; END IF;
  UPDATE public.healthcare_medicines SET stock_quantity=stock_quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_medicine_id;
  INSERT INTO public.healthcare_stock_movements(tenant_id,medicine_id,quantity_delta,reason,request_id,created_by)
  VALUES(p_tenant_id,p_medicine_id,p_delta,btrim(p_reason),p_request_id,p_actor_user_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false,'stockQuantity',v_stock+p_delta);
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_ga_inventory_stock(p_tenant_id UUID,p_actor_user_id UUID,p_item_id UUID,p_delta INTEGER,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_item public.ga_inventory_items%ROWTYPE; v_existing UUID; v_existing_movement public.ga_inventory_movements%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_item_id IS NULL OR p_delta=0 OR p_client_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-stock:'||p_client_request_id::TEXT,0));
  SELECT * INTO v_existing_movement FROM public.ga_inventory_movements
  WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing_movement.created_by IS DISTINCT FROM p_actor_user_id
      OR v_existing_movement.item_id IS DISTINCT FROM p_item_id
      OR v_existing_movement.quantity_delta IS DISTINCT FROM p_delta
      OR v_existing_movement.reason IS DISTINCT FROM btrim(p_reason) THEN
      RAISE EXCEPTION 'GA stock request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing_movement.id,'replayed',true);
  END IF;
  SELECT * INTO v_item FROM public.ga_inventory_items WHERE tenant_id=p_tenant_id AND id=p_item_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found' USING ERRCODE='P0002'; END IF;
  IF v_item.quantity+p_delta<0 THEN RAISE EXCEPTION 'Stock cannot become negative' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ga_inventory_movements(tenant_id,item_id,quantity_delta,balance_after,reason,client_request_id,created_by)
    VALUES(p_tenant_id,p_item_id,p_delta,v_item.quantity+p_delta,btrim(p_reason),p_client_request_id,p_actor_user_id) RETURNING id INTO v_existing;
  UPDATE public.ga_inventory_items SET quantity=v_item.quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_item_id;
  RETURN jsonb_build_object('id',v_existing,'balance',v_item.quantity+p_delta,'replayed',false);
END $$;

COMMENT ON FUNCTION public.adjust_healthcare_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) IS
  'Tenant-scoped locked medicine stock adjustment with payload-aware request replay.';
COMMENT ON FUNCTION public.adjust_ga_inventory_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) IS
  'Tenant-scoped locked inventory stock adjustment with payload-aware request replay.';

COMMIT;
