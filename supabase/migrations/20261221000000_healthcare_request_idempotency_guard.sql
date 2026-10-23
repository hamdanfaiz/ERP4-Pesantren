-- Prevent healthcare request keys from silently replaying a different visit or medicine.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_healthcare_visit(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_id UUID; v_request UUID; v_student UUID; v_existing public.healthcare_visits%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID; v_student:=NULLIF(p_item->>'studentId','')::UUID;
  IF v_request IS NULL OR v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student)
    OR length(btrim(COALESCE(p_item->>'complaint','')))=0 THEN RAISE EXCEPTION 'Invalid healthcare visit' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-visit:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.healthcare_visits
  WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
      OR v_existing.student_id IS DISTINCT FROM v_student
      OR v_existing.visit_date IS DISTINCT FROM (p_item->>'visitDate')::DATE
      OR v_existing.visit_time IS DISTINCT FROM (p_item->>'visitTime')::TIME
      OR v_existing.complaint IS DISTINCT FROM btrim(p_item->>'complaint')
      OR v_existing.temperature_c IS DISTINCT FROM NULLIF(p_item->>'temperatureC','')::NUMERIC
      OR v_existing.diagnosis IS DISTINCT FROM COALESCE(p_item->>'diagnosis','')
      OR v_existing.action_taken IS DISTINCT FROM COALESCE(p_item->>'actionTaken','')
      OR v_existing.status IS DISTINCT FROM COALESCE(p_item->>'status','monitoring') THEN
      RAISE EXCEPTION 'Healthcare visit request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing.id,'alreadyApplied',true);
  END IF;
  INSERT INTO public.healthcare_visits(tenant_id,student_id,visit_date,visit_time,complaint,temperature_c,diagnosis,action_taken,status,client_request_id,created_by)
  VALUES(p_tenant_id,v_student,(p_item->>'visitDate')::DATE,(p_item->>'visitTime')::TIME,btrim(p_item->>'complaint'),NULLIF(p_item->>'temperatureC','')::NUMERIC,
    COALESCE(p_item->>'diagnosis',''),COALESCE(p_item->>'actionTaken',''),COALESCE(p_item->>'status','monitoring'),v_request,p_actor_user_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false);
END; $$;

CREATE OR REPLACE FUNCTION public.create_healthcare_medicine(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_id UUID; v_request UUID; v_quantity INTEGER; v_initial INTEGER; v_existing public.healthcare_medicines%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID; v_quantity:=COALESCE(NULLIF(p_item->>'initialStock','')::INTEGER,0);
  IF v_request IS NULL OR length(btrim(COALESCE(p_item->>'name','')))=0 OR v_quantity<0 THEN RAISE EXCEPTION 'Invalid medicine inventory item' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-medicine:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
  SELECT * INTO v_existing FROM public.healthcare_medicines
  WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF FOUND THEN
    SELECT COALESCE((
      SELECT quantity_delta FROM public.healthcare_stock_movements
      WHERE tenant_id=p_tenant_id AND medicine_id=v_existing.id AND request_id=v_request
    ),0) INTO v_initial;
    IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
      OR v_existing.name IS DISTINCT FROM btrim(p_item->>'name')
      OR v_existing.category IS DISTINCT FROM COALESCE(p_item->>'category','')
      OR v_existing.min_stock IS DISTINCT FROM COALESCE(NULLIF(p_item->>'minStock','')::INTEGER,0)
      OR v_existing.unit IS DISTINCT FROM COALESCE(p_item->>'unit','')
      OR v_existing.expires_on IS DISTINCT FROM NULLIF(p_item->>'expiresOn','')::DATE
      OR v_initial IS DISTINCT FROM v_quantity THEN
      RAISE EXCEPTION 'Healthcare medicine request ID was already used for a different mutation' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing.id,'alreadyApplied',true);
  END IF;
  INSERT INTO public.healthcare_medicines(tenant_id,name,category,stock_quantity,min_stock,unit,expires_on,client_request_id,created_by,updated_by)
  VALUES(p_tenant_id,btrim(p_item->>'name'),COALESCE(p_item->>'category',''),v_quantity,COALESCE(NULLIF(p_item->>'minStock','')::INTEGER,0),COALESCE(p_item->>'unit',''),NULLIF(p_item->>'expiresOn','')::DATE,v_request,p_actor_user_id,p_actor_user_id)
  RETURNING id INTO v_id;
  IF v_quantity>0 THEN INSERT INTO public.healthcare_stock_movements(tenant_id,medicine_id,quantity_delta,reason,request_id,created_by)
    VALUES(p_tenant_id,v_id,v_quantity,'Stok awal',v_request,p_actor_user_id); END IF;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false);
END; $$;

COMMENT ON FUNCTION public.create_healthcare_visit(UUID,UUID,JSONB) IS
  'Creates a tenant-scoped visit with actor and payload-bound idempotent replay.';
COMMENT ON FUNCTION public.create_healthcare_medicine(UUID,UUID,JSONB) IS
  'Creates a tenant-scoped medicine and reconciles its initial-stock request on safe replay.';

COMMIT;
