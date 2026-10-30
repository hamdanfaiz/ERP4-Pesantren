-- Bind General Affairs item create/update/archive request keys to actor and snapshot payload.
BEGIN;

CREATE OR REPLACE FUNCTION public.manage_ga_inventory_item(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_action TEXT; v_id UUID; v_request UUID; v_before JSONB; v_after JSONB; v_code TEXT; v_name TEXT; v_category TEXT; v_quantity INTEGER; v_min INTEGER; v_unit TEXT; v_cost NUMERIC; v_location TEXT; v_status TEXT; v_existing_event public.ga_inventory_item_events%ROWTYPE; v_request_matches BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid inventory request' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-item:'||v_request::TEXT,0));
  SELECT * INTO v_existing_event FROM public.ga_inventory_item_events
  WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF FOUND THEN
    v_request_matches := v_existing_event.created_by IS NOT DISTINCT FROM p_actor_user_id AND CASE
      WHEN v_action='create' THEN
        v_existing_event.before_data IS NULL
        AND v_existing_event.after_data->>'item_code' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'itemCode',''))
        AND v_existing_event.after_data->>'name' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'name',''))
        AND v_existing_event.after_data->>'category' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'category',''))
        AND (v_existing_event.after_data->>'quantity')::INTEGER IS NOT DISTINCT FROM COALESCE(NULLIF(p_item->>'initialQuantity','')::INTEGER,0)
        AND (v_existing_event.after_data->>'minimum_quantity')::INTEGER IS NOT DISTINCT FROM COALESCE(NULLIF(p_item->>'minimumQuantity','')::INTEGER,0)
        AND v_existing_event.after_data->>'unit' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'unit','Pcs'))
        AND round((v_existing_event.after_data->>'unit_cost')::NUMERIC,2) IS NOT DISTINCT FROM round(COALESCE(NULLIF(p_item->>'unitCost','')::NUMERIC,0),2)
        AND v_existing_event.after_data->>'location' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'location',''))
        AND v_existing_event.after_data->>'status' IS NOT DISTINCT FROM 'active'
      WHEN v_action='update' THEN
        v_existing_event.before_data IS NOT NULL
        AND v_existing_event.item_id IS NOT DISTINCT FROM NULLIF(p_item->>'id','')::UUID
        AND v_existing_event.after_data->>'item_code' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'itemCode',''))
        AND v_existing_event.after_data->>'name' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'name',''))
        AND v_existing_event.after_data->>'category' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'category',''))
        AND (v_existing_event.after_data->>'minimum_quantity')::INTEGER IS NOT DISTINCT FROM COALESCE(NULLIF(p_item->>'minimumQuantity','')::INTEGER,0)
        AND v_existing_event.after_data->>'unit' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'unit',''))
        AND round((v_existing_event.after_data->>'unit_cost')::NUMERIC,2) IS NOT DISTINCT FROM round(COALESCE(NULLIF(p_item->>'unitCost','')::NUMERIC,0),2)
        AND v_existing_event.after_data->>'location' IS NOT DISTINCT FROM btrim(COALESCE(p_item->>'location',''))
        AND v_existing_event.after_data->>'status' IS NOT DISTINCT FROM 'active'
      WHEN v_action='archive' THEN
        v_existing_event.before_data IS NOT NULL
        AND v_existing_event.item_id IS NOT DISTINCT FROM NULLIF(p_item->>'id','')::UUID
        AND v_existing_event.after_data->>'status' IS NOT DISTINCT FROM 'archived'
      ELSE false
    END;
    IF NOT COALESCE(v_request_matches,false) THEN
      RAISE EXCEPTION 'General Affairs inventory request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing_event.item_id,'replayed',true);
  END IF;
  IF v_action='create' THEN
    v_code:=btrim(COALESCE(p_item->>'itemCode','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_quantity:=COALESCE(NULLIF(p_item->>'initialQuantity','')::INTEGER,0); v_min:=COALESCE(NULLIF(p_item->>'minimumQuantity','')::INTEGER,0); v_unit:=btrim(COALESCE(p_item->>'unit','Pcs')); v_cost:=COALESCE(NULLIF(p_item->>'unitCost','')::NUMERIC,0); v_location:=btrim(COALESCE(p_item->>'location',''));
    IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_quantity<0 OR v_min<0 OR length(v_unit) NOT BETWEEN 1 AND 40 OR v_cost<0 OR length(v_location)>180 THEN RAISE EXCEPTION 'Invalid inventory fields' USING ERRCODE='22023'; END IF;
    INSERT INTO public.ga_inventory_items(tenant_id,item_code,name,category,quantity,minimum_quantity,unit,unit_cost,location,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_code,v_name,v_category,v_quantity,v_min,v_unit,v_cost,v_location,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    SELECT to_jsonb(t) INTO v_after FROM (SELECT item_code,name,category,quantity,minimum_quantity,unit,unit_cost,location,status FROM public.ga_inventory_items WHERE id=v_id) t;
    INSERT INTO public.ga_inventory_item_events(tenant_id,item_id,after_data,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_after,v_request,p_actor_user_id);
    IF v_quantity>0 THEN INSERT INTO public.ga_inventory_movements(tenant_id,item_id,quantity_delta,balance_after,reason,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_quantity,v_quantity,'Stok awal',v_request,p_actor_user_id); END IF;
  ELSIF v_action IN ('update','archive') THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    SELECT to_jsonb(i) INTO v_before FROM public.ga_inventory_items i WHERE i.tenant_id=p_tenant_id AND i.id=v_id AND i.status='active' FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Inventory item not found' USING ERRCODE='P0002'; END IF;
    IF v_action='update' THEN
      v_code:=btrim(COALESCE(p_item->>'itemCode','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_min:=COALESCE(NULLIF(p_item->>'minimumQuantity','')::INTEGER,0); v_unit:=btrim(COALESCE(p_item->>'unit','')); v_cost:=COALESCE(NULLIF(p_item->>'unitCost','')::NUMERIC,0); v_location:=btrim(COALESCE(p_item->>'location',''));
      IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_min<0 OR length(v_unit) NOT BETWEEN 1 AND 40 OR v_cost<0 OR length(v_location)>180 THEN RAISE EXCEPTION 'Invalid inventory fields' USING ERRCODE='22023'; END IF;
      UPDATE public.ga_inventory_items SET item_code=v_code,name=v_name,category=v_category,minimum_quantity=v_min,unit=v_unit,unit_cost=v_cost,location=v_location,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      IF (v_before->>'quantity')::INTEGER <> 0 THEN RAISE EXCEPTION 'Inventory must be at zero before archiving' USING ERRCODE='23514'; END IF;
      UPDATE public.ga_inventory_items SET status='archived',updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
    SELECT to_jsonb(t) INTO v_after FROM (SELECT item_code,name,category,quantity,minimum_quantity,unit,unit_cost,location,status FROM public.ga_inventory_items WHERE id=v_id) t;
    INSERT INTO public.ga_inventory_item_events(tenant_id,item_id,before_data,after_data,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_before,v_after,v_request,p_actor_user_id);
  ELSE RAISE EXCEPTION 'Unsupported inventory action' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

COMMENT ON FUNCTION public.manage_ga_inventory_item(UUID,UUID,JSONB) IS
  'Tenant-scoped inventory lifecycle with payload-aware idempotent event replay.';

COMMIT;
