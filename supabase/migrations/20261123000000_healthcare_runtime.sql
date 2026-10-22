-- Private tenant-scoped UKS records and an immutable medicine stock ledger.
BEGIN;

CREATE TABLE public.healthcare_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL, blood_type TEXT NOT NULL DEFAULT '' CHECK (blood_type IN ('','A','B','AB','O','A+','A-','B+','B-','AB+','AB-','O+','O-')),
  height_cm NUMERIC(5,2) CHECK (height_cm IS NULL OR height_cm BETWEEN 20 AND 250),
  weight_kg NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 1 AND 400),
  allergies TEXT NOT NULL DEFAULT '' CHECK (length(allergies)<=3000), chronic_conditions TEXT NOT NULL DEFAULT '' CHECK (length(chronic_conditions)<=3000),
  last_check DATE, source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT, created_by UUID NOT NULL, updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE UNIQUE INDEX healthcare_records_legacy_source_uq ON public.healthcare_records(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.healthcare_record_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, record_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','legacy_import')),
  before_data JSONB, after_data JSONB NOT NULL CHECK(jsonb_typeof(after_data)='object'),
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,record_id) REFERENCES public.healthcare_records(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX healthcare_record_events_history_idx ON public.healthcare_record_events(tenant_id,record_id,created_at DESC);

CREATE TABLE public.healthcare_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL, visit_date DATE NOT NULL, visit_time TIME NOT NULL,
  complaint TEXT NOT NULL CHECK (length(btrim(complaint)) BETWEEN 1 AND 3000), temperature_c NUMERIC(4,1) CHECK (temperature_c IS NULL OR temperature_c BETWEEN 25 AND 45),
  diagnosis TEXT NOT NULL DEFAULT '' CHECK (length(diagnosis)<=3000), action_taken TEXT NOT NULL DEFAULT '' CHECK (length(action_taken)<=5000),
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK (status IN ('monitoring','completed','referred')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT, client_request_id UUID NOT NULL,
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,client_request_id),
  FOREIGN KEY(tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX healthcare_visits_tenant_date_idx ON public.healthcare_visits(tenant_id,visit_date DESC,visit_time DESC);
CREATE UNIQUE INDEX healthcare_visits_legacy_source_uq ON public.healthcare_visits(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.healthcare_medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180), category TEXT NOT NULL DEFAULT '' CHECK (length(category)<=120),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity>=0), min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock>=0),
  unit TEXT NOT NULL DEFAULT '' CHECK (length(unit)<=40), expires_on DATE,
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT, client_request_id UUID NOT NULL, created_by UUID NOT NULL, updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,client_request_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE UNIQUE INDEX healthcare_medicines_tenant_name_uq ON public.healthcare_medicines(tenant_id,lower(name));
CREATE UNIQUE INDEX healthcare_medicines_legacy_source_uq ON public.healthcare_medicines(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.healthcare_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, medicine_id UUID NOT NULL,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta<>0), reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  request_id UUID NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id),
  FOREIGN KEY(tenant_id,medicine_id) REFERENCES public.healthcare_medicines(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX healthcare_stock_movement_history_idx ON public.healthcare_stock_movements(tenant_id,medicine_id,created_at DESC);

CREATE TABLE public.healthcare_legacy_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT, snapshot_fingerprint TEXT NOT NULL CHECK(snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK(source_count>=0), imported_count INTEGER NOT NULL CHECK(imported_count>=0), skipped_count INTEGER NOT NULL CHECK(skipped_count>=0),
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,snapshot_fingerprint),
  FOREIGN KEY(tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

DO $$ DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['healthcare_records','healthcare_record_events','healthcare_visits','healthcare_medicines','healthcare_stock_movements','healthcare_legacy_import_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',v_table);
  END LOOP;
  REVOKE ALL ON TABLE public.healthcare_record_events FROM PUBLIC,anon,authenticated,service_role;
  GRANT SELECT,INSERT ON TABLE public.healthcare_record_events TO service_role;
  REVOKE ALL ON TABLE public.healthcare_visits FROM service_role;
  GRANT SELECT,INSERT ON TABLE public.healthcare_visits TO service_role;
  REVOKE ALL ON TABLE public.healthcare_stock_movements FROM service_role;
  GRANT SELECT,INSERT ON TABLE public.healthcare_stock_movements TO service_role;
END $$;

CREATE OR REPLACE FUNCTION public.manage_healthcare_record(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_student UUID; v_id UUID; v_role TEXT; v_before JSONB; v_after JSONB; v_action TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active'
    AND role IN ('admin','super_admin') AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  v_student:=NULLIF(p_item->>'studentId','')::UUID;
  IF v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student) THEN RAISE EXCEPTION 'Student roster record is required' USING ERRCODE='23503'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-record:'||p_tenant_id::TEXT||':'||v_student::TEXT,0));
  SELECT id INTO v_id FROM public.healthcare_records WHERE tenant_id=p_tenant_id AND student_id=v_student FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.healthcare_records(tenant_id,student_id,blood_type,height_cm,weight_kg,allergies,chronic_conditions,last_check,created_by,updated_by)
    VALUES(p_tenant_id,v_student,COALESCE(p_item->>'bloodType',''),NULLIF(p_item->>'heightCm','')::NUMERIC,NULLIF(p_item->>'weightKg','')::NUMERIC,
      COALESCE(p_item->>'allergies',''),COALESCE(p_item->>'chronicConditions',''),NULLIF(p_item->>'lastCheck','')::DATE,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    v_action:='created';
  ELSE
    SELECT jsonb_build_object('bloodType',blood_type,'heightCm',height_cm,'weightKg',weight_kg,'allergies',allergies,'chronicConditions',chronic_conditions,'lastCheck',last_check)
      INTO v_before FROM public.healthcare_records WHERE tenant_id=p_tenant_id AND id=v_id;
    UPDATE public.healthcare_records SET blood_type=COALESCE(p_item->>'bloodType',''),height_cm=NULLIF(p_item->>'heightCm','')::NUMERIC,
      weight_kg=NULLIF(p_item->>'weightKg','')::NUMERIC,allergies=COALESCE(p_item->>'allergies',''),chronic_conditions=COALESCE(p_item->>'chronicConditions',''),
      last_check=NULLIF(p_item->>'lastCheck','')::DATE,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    v_action:='updated';
  END IF;
  SELECT jsonb_build_object('bloodType',blood_type,'heightCm',height_cm,'weightKg',weight_kg,'allergies',allergies,'chronicConditions',chronic_conditions,'lastCheck',last_check)
    INTO v_after FROM public.healthcare_records WHERE tenant_id=p_tenant_id AND id=v_id;
  INSERT INTO public.healthcare_record_events(tenant_id,record_id,event_type,before_data,after_data,created_by)
    VALUES(p_tenant_id,v_id,v_action,v_before,v_after,p_actor_user_id);
  RETURN jsonb_build_object('id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.create_healthcare_visit(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_id UUID; v_request UUID; v_student UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID; v_student:=NULLIF(p_item->>'studentId','')::UUID;
  IF v_request IS NULL OR v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student)
    OR length(btrim(COALESCE(p_item->>'complaint','')))=0 THEN RAISE EXCEPTION 'Invalid healthcare visit' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-visit:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.healthcare_visits WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
  INSERT INTO public.healthcare_visits(tenant_id,student_id,visit_date,visit_time,complaint,temperature_c,diagnosis,action_taken,status,client_request_id,created_by)
  VALUES(p_tenant_id,v_student,(p_item->>'visitDate')::DATE,(p_item->>'visitTime')::TIME,btrim(p_item->>'complaint'),NULLIF(p_item->>'temperatureC','')::NUMERIC,
    COALESCE(p_item->>'diagnosis',''),COALESCE(p_item->>'actionTaken',''),COALESCE(p_item->>'status','monitoring'),v_request,p_actor_user_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false);
END; $$;

CREATE OR REPLACE FUNCTION public.create_healthcare_medicine(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_id UUID; v_request UUID; v_quantity INTEGER;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID; v_quantity:=COALESCE(NULLIF(p_item->>'initialStock','')::INTEGER,0);
  IF v_request IS NULL OR length(btrim(COALESCE(p_item->>'name','')))=0 OR v_quantity<0 THEN RAISE EXCEPTION 'Invalid medicine inventory item' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-medicine:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.healthcare_medicines WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
  INSERT INTO public.healthcare_medicines(tenant_id,name,category,stock_quantity,min_stock,unit,expires_on,client_request_id,created_by,updated_by)
  VALUES(p_tenant_id,btrim(p_item->>'name'),COALESCE(p_item->>'category',''),v_quantity,COALESCE(NULLIF(p_item->>'minStock','')::INTEGER,0),COALESCE(p_item->>'unit',''),NULLIF(p_item->>'expiresOn','')::DATE,v_request,p_actor_user_id,p_actor_user_id)
  RETURNING id INTO v_id;
  IF v_quantity>0 THEN INSERT INTO public.healthcare_stock_movements(tenant_id,medicine_id,quantity_delta,reason,request_id,created_by)
    VALUES(p_tenant_id,v_id,v_quantity,'Stok awal',v_request,p_actor_user_id); END IF;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false);
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_healthcare_stock(p_tenant_id UUID,p_actor_user_id UUID,p_medicine_id UUID,p_delta INTEGER,p_reason TEXT,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_stock INTEGER; v_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare access denied' USING ERRCODE='42501'; END IF;
  IF p_medicine_id IS NULL OR p_delta=0 OR p_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-stock:'||p_tenant_id::TEXT||':'||p_request_id::TEXT,0));
  SELECT id INTO v_id FROM public.healthcare_stock_movements WHERE tenant_id=p_tenant_id AND request_id=p_request_id;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
  SELECT stock_quantity INTO v_stock FROM public.healthcare_medicines WHERE tenant_id=p_tenant_id AND id=p_medicine_id FOR UPDATE;
  IF NOT FOUND OR v_stock+p_delta<0 THEN RAISE EXCEPTION 'Medicine stock is insufficient or item missing' USING ERRCODE='23514'; END IF;
  UPDATE public.healthcare_medicines SET stock_quantity=stock_quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_medicine_id;
  INSERT INTO public.healthcare_stock_movements(tenant_id,medicine_id,quantity_delta,reason,request_id,created_by)
  VALUES(p_tenant_id,p_medicine_id,p_delta,btrim(p_reason),p_request_id,p_actor_user_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false,'stockQuantity',v_stock+p_delta);
END; $$;

CREATE OR REPLACE FUNCTION public.import_legacy_healthcare(p_tenant_id UUID,p_actor_user_id UUID,p_snapshot_fingerprint TEXT,p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_role TEXT; v_item JSONB; v_kind TEXT; v_source_id TEXT; v_fp TEXT; v_id UUID; v_student UUID; v_existing_fp TEXT; v_imported INTEGER:=0; v_skipped INTEGER:=0; v_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$' OR p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid healthcare import input' USING ERRCODE='22023'; END IF;
  v_count:=jsonb_array_length(p_items); IF v_count>5000 THEN RAISE EXCEPTION 'Healthcare import exceeds safe limit' USING ERRCODE='22023'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'healthcare') OR COALESCE(module_permissions->>'healthcare','false')='true') FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'Healthcare import denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('health-import:'||p_tenant_id::TEXT,0));
  IF EXISTS(SELECT 1 FROM public.healthcare_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint) THEN
    RETURN (SELECT jsonb_build_object('imported',imported_count,'skipped',skipped_count,'alreadyApplied',true) FROM public.healthcare_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint);
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item GROUP BY item.value->>'kind',item.value->>'sourceRecordId' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate healthcare legacy source keys' USING ERRCODE='23505'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY CASE value->>'kind' WHEN 'record' THEN 1 WHEN 'medicine' THEN 2 ELSE 3 END LOOP
    v_kind:=v_item->>'kind'; v_source_id:=btrim(v_item->>'sourceRecordId'); v_fp:=v_item->>'sourceFingerprint';
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR v_kind IS NULL OR v_kind NOT IN ('record','visit','medicine') OR v_source_id IS NULL OR length(v_source_id) NOT BETWEEN 1 AND 300 OR v_fp IS NULL OR v_fp !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid healthcare source reference' USING ERRCODE='22023'; END IF;
    v_id:=NULL; v_existing_fp:=NULL;
    IF v_kind='record' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.healthcare_records WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSIF v_kind='visit' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.healthcare_visits WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSE SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.healthcare_medicines WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id; END IF;
    IF v_id IS NOT NULL THEN IF v_existing_fp IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'Healthcare source changed after preview' USING ERRCODE='23514'; END IF; v_skipped:=v_skipped+1; CONTINUE; END IF;
    v_student:=NULLIF(v_item->>'studentId','')::UUID;
    IF v_kind='record' THEN
      IF v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student) THEN RAISE EXCEPTION 'Healthcare student mapping is invalid' USING ERRCODE='23503'; END IF;
      INSERT INTO public.healthcare_records(tenant_id,student_id,blood_type,height_cm,weight_kg,allergies,chronic_conditions,last_check,source_system,source_record_id,source_fingerprint,created_by,updated_by)
      VALUES(p_tenant_id,v_student,COALESCE(v_item->>'bloodType',''),NULLIF(v_item->>'heightCm','')::NUMERIC,NULLIF(v_item->>'weightKg','')::NUMERIC,COALESCE(v_item->>'allergies',''),COALESCE(v_item->>'chronicConditions',''),NULLIF(v_item->>'lastCheck','')::DATE,'legacy_firestore',v_source_id,v_fp,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      INSERT INTO public.healthcare_record_events(tenant_id,record_id,event_type,after_data,created_by)
        VALUES(p_tenant_id,v_id,'legacy_import',jsonb_build_object('bloodType',COALESCE(v_item->>'bloodType',''),'heightCm',NULLIF(v_item->>'heightCm','')::NUMERIC,'weightKg',NULLIF(v_item->>'weightKg','')::NUMERIC,'allergies',COALESCE(v_item->>'allergies',''),'chronicConditions',COALESCE(v_item->>'chronicConditions',''),'lastCheck',NULLIF(v_item->>'lastCheck','')::DATE),p_actor_user_id);
    ELSIF v_kind='visit' THEN
      IF v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student) THEN RAISE EXCEPTION 'Healthcare visit student mapping is invalid' USING ERRCODE='23503'; END IF;
      INSERT INTO public.healthcare_visits(tenant_id,student_id,visit_date,visit_time,complaint,temperature_c,diagnosis,action_taken,status,source_system,source_record_id,source_fingerprint,client_request_id,created_by)
      VALUES(p_tenant_id,v_student,(v_item->>'visitDate')::DATE,(v_item->>'visitTime')::TIME,btrim(v_item->>'complaint'),NULLIF(v_item->>'temperatureC','')::NUMERIC,COALESCE(v_item->>'diagnosis',''),COALESCE(v_item->>'actionTaken',''),COALESCE(v_item->>'status','monitoring'),'legacy_firestore',v_source_id,v_fp,gen_random_uuid(),p_actor_user_id);
    ELSE
      IF length(btrim(COALESCE(v_item->>'name','')))=0 THEN RAISE EXCEPTION 'Invalid healthcare medicine' USING ERRCODE='22023'; END IF;
      INSERT INTO public.healthcare_medicines(tenant_id,name,category,stock_quantity,min_stock,unit,expires_on,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,btrim(v_item->>'name'),COALESCE(v_item->>'category',''),COALESCE(NULLIF(v_item->>'stockQuantity','')::INTEGER,0),0,COALESCE(v_item->>'unit',''),NULLIF(v_item->>'expiresOn','')::DATE,'legacy_firestore',v_source_id,v_fp,gen_random_uuid(),p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      IF COALESCE((v_item->>'stockQuantity')::INTEGER,0)>0 THEN INSERT INTO public.healthcare_stock_movements(tenant_id,medicine_id,quantity_delta,reason,request_id,created_by)
        VALUES(p_tenant_id,v_id,(v_item->>'stockQuantity')::INTEGER,'Saldo awal dari migrasi legacy',gen_random_uuid(),p_actor_user_id); END IF;
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  INSERT INTO public.healthcare_legacy_import_batches(tenant_id,snapshot_fingerprint,source_count,imported_count,skipped_count,created_by) VALUES(p_tenant_id,p_snapshot_fingerprint,v_count,v_imported,v_skipped,p_actor_user_id);
  RETURN jsonb_build_object('imported',v_imported,'skipped',v_skipped,'alreadyApplied',false);
END; $$;

REVOKE ALL ON FUNCTION public.manage_healthcare_record(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_healthcare_record(UUID,UUID,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.create_healthcare_visit(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_healthcare_visit(UUID,UUID,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.create_healthcare_medicine(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_healthcare_medicine(UUID,UUID,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.adjust_healthcare_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_healthcare_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) TO service_role;
REVOKE ALL ON FUNCTION public.import_legacy_healthcare(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_healthcare(UUID,UUID,TEXT,JSONB) TO service_role;

COMMENT ON TABLE public.healthcare_records IS 'Restricted medical profile records. No browser grants; reads are served only by authorized tenant API.';
COMMENT ON TABLE public.healthcare_stock_movements IS 'Append-only auditable medicine inventory movements.';
COMMIT;
