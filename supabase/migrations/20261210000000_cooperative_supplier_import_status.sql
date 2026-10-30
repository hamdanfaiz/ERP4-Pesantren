-- Preserve the legacy supplier's active/inactive state during idempotent catalog import.
CREATE OR REPLACE FUNCTION public.manage_cooperative_supplier(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_name TEXT; v_category TEXT; v_contact TEXT; v_pic TEXT; v_status TEXT;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid supplier payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-supplier:'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.cooperative_suppliers WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  IF v_action='create' THEN
    v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_contact:=btrim(COALESCE(p_item->>'contact','')); v_pic:=btrim(COALESCE(p_item->>'pic',''));
    v_status:=COALESCE(NULLIF(p_item->>'status',''),'active');
    IF length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_contact)>80 OR length(v_pic)>120 OR v_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid supplier fields or status' USING ERRCODE='22023'; END IF;
    INSERT INTO public.cooperative_suppliers(tenant_id,name,category,contact,pic,status,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_name,v_category,v_contact,v_pic,v_status,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
  ELSIF v_action IN ('update','deactivate') THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Supplier ID required' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.cooperative_suppliers WHERE tenant_id=p_tenant_id AND id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supplier unavailable' USING ERRCODE='P0002'; END IF;
    IF v_action='deactivate' THEN
      UPDATE public.cooperative_suppliers SET status='inactive',client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_contact:=btrim(COALESCE(p_item->>'contact','')); v_pic:=btrim(COALESCE(p_item->>'pic',''));
      IF length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_contact)>80 OR length(v_pic)>120 THEN RAISE EXCEPTION 'Invalid supplier fields' USING ERRCODE='22023'; END IF;
      UPDATE public.cooperative_suppliers SET name=v_name,category=v_category,contact=v_contact,pic=v_pic,client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported supplier action' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

