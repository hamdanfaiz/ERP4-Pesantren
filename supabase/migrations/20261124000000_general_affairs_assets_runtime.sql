-- Tenant-scoped General Affairs asset register and operational stock ledger.
-- This migration is staged only; do not apply before the migration history is reconciled.
BEGIN;

CREATE TABLE public.ga_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_code TEXT NOT NULL CHECK (length(btrim(asset_code)) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 180),
  custodian TEXT NOT NULL DEFAULT '' CHECK (length(custodian) <= 160),
  condition TEXT NOT NULL DEFAULT 'Baik' CHECK (condition IN ('Baik','Perlu Servis','Rusak Berat')),
  acquisition_value NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (acquisition_value >= 0),
  acquired_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  last_opname_on DATE,
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,asset_code),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX ga_facilities_tenant_status_idx ON public.ga_facilities(tenant_id,status,category,name);
CREATE UNIQUE INDEX ga_facilities_legacy_source_uq ON public.ga_facilities(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.ga_facility_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','opname','disposed')),
  before_data JSONB,
  after_data JSONB NOT NULL CHECK (jsonb_typeof(after_data)='object'),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,facility_id) REFERENCES public.ga_facilities(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX ga_facility_events_history_idx ON public.ga_facility_events(tenant_id,facility_id,created_at DESC);

CREATE TABLE public.ga_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  item_code TEXT NOT NULL CHECK (length(btrim(item_code)) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_quantity INTEGER NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'Pcs' CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  unit_cost NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 180),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,item_code),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX ga_inventory_tenant_status_idx ON public.ga_inventory_items(tenant_id,status,category,name);
CREATE UNIQUE INDEX ga_inventory_legacy_source_uq ON public.ga_inventory_items(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.ga_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  item_id UUID NOT NULL,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,item_id) REFERENCES public.ga_inventory_items(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX ga_inventory_movements_history_idx ON public.ga_inventory_movements(tenant_id,item_id,created_at DESC);

CREATE TABLE public.ga_inventory_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  item_id UUID NOT NULL,
  before_data JSONB,
  after_data JSONB NOT NULL CHECK (jsonb_typeof(after_data)='object'),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,item_id) REFERENCES public.ga_inventory_items(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX ga_inventory_item_events_history_idx ON public.ga_inventory_item_events(tenant_id,item_id,created_at DESC);

CREATE TABLE public.ga_legacy_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  imported_count INTEGER NOT NULL CHECK (imported_count >= 0),
  skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_fingerprint),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

DO $$ DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['ga_facilities','ga_facility_events','ga_inventory_items','ga_inventory_movements','ga_inventory_item_events','ga_legacy_import_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',v_table);
  END LOOP;
  REVOKE ALL ON TABLE public.ga_facility_events,public.ga_inventory_movements,public.ga_inventory_item_events FROM PUBLIC,anon,authenticated,service_role;
  GRANT SELECT ON TABLE public.ga_facility_events,public.ga_inventory_movements,public.ga_inventory_item_events TO service_role;
END $$;

CREATE OR REPLACE FUNCTION public.manage_ga_facility(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_action TEXT; v_id UUID; v_request UUID; v_before JSONB; v_after JSONB; v_code TEXT; v_name TEXT; v_category TEXT; v_location TEXT; v_custodian TEXT; v_condition TEXT; v_value NUMERIC; v_acquired DATE; v_status TEXT; v_opname DATE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid asset request' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  v_action:=COALESCE(p_item->>'action','');
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-facility:'||v_request::TEXT,0));
  SELECT facility_id INTO v_id FROM public.ga_facility_events WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  v_id:=NULLIF(p_item->>'id','')::UUID;
  IF v_action='create' THEN
    v_code:=btrim(COALESCE(p_item->>'assetCode','')); v_name:=btrim(COALESCE(p_item->>'name',''));
    v_category:=btrim(COALESCE(p_item->>'category','')); v_location:=btrim(COALESCE(p_item->>'location','')); v_custodian:=btrim(COALESCE(p_item->>'custodian',''));
    v_condition:=COALESCE(p_item->>'condition','Baik'); v_value:=COALESCE(NULLIF(p_item->>'acquisitionValue','')::NUMERIC,0); v_acquired:=NULLIF(p_item->>'acquiredOn','')::DATE; v_status:='active';
    IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_location)>180 OR length(v_custodian)>160 OR v_condition NOT IN ('Baik','Perlu Servis','Rusak Berat') OR v_value<0 THEN RAISE EXCEPTION 'Invalid asset fields' USING ERRCODE='22023'; END IF;
    INSERT INTO public.ga_facilities(tenant_id,asset_code,name,category,location,custodian,condition,acquisition_value,acquired_on,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_code,v_name,v_category,v_location,v_custodian,v_condition,v_value,v_acquired,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    SELECT to_jsonb(t) INTO v_after FROM (SELECT asset_code,name,category,location,custodian,condition,acquisition_value,acquired_on,status,last_opname_on FROM public.ga_facilities WHERE id=v_id) t;
    INSERT INTO public.ga_facility_events(tenant_id,facility_id,event_type,after_data,client_request_id,created_by) VALUES(p_tenant_id,v_id,'created',v_after,v_request,p_actor_user_id);
  ELSIF v_action IN ('update','opname','dispose') THEN
    SELECT to_jsonb(f) INTO v_before FROM public.ga_facilities f WHERE f.tenant_id=p_tenant_id AND f.id=v_id AND f.status='active' FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Asset not found' USING ERRCODE='P0002'; END IF;
    IF v_action='update' THEN
      v_code:=btrim(COALESCE(p_item->>'assetCode','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_location:=btrim(COALESCE(p_item->>'location','')); v_custodian:=btrim(COALESCE(p_item->>'custodian','')); v_condition:=COALESCE(p_item->>'condition','Baik'); v_value:=COALESCE(NULLIF(p_item->>'acquisitionValue','')::NUMERIC,0); v_acquired:=NULLIF(p_item->>'acquiredOn','')::DATE;
      IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_location)>180 OR length(v_custodian)>160 OR v_condition NOT IN ('Baik','Perlu Servis','Rusak Berat') OR v_value<0 THEN RAISE EXCEPTION 'Invalid asset fields' USING ERRCODE='22023'; END IF;
      UPDATE public.ga_facilities SET asset_code=v_code,name=v_name,category=v_category,location=v_location,custodian=v_custodian,condition=v_condition,acquisition_value=v_value,acquired_on=v_acquired,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSIF v_action='opname' THEN
      v_condition:=COALESCE(p_item->>'condition',''); v_opname:=COALESCE(NULLIF(p_item->>'opnameOn','')::DATE,current_date);
      IF v_condition NOT IN ('Baik','Perlu Servis','Rusak Berat') THEN RAISE EXCEPTION 'Invalid opname condition' USING ERRCODE='22023'; END IF;
      UPDATE public.ga_facilities SET condition=v_condition,last_opname_on=v_opname,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      UPDATE public.ga_facilities SET status='disposed',updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
    SELECT to_jsonb(t) INTO v_after FROM (SELECT asset_code,name,category,location,custodian,condition,acquisition_value,acquired_on,status,last_opname_on FROM public.ga_facilities WHERE id=v_id) t;
    INSERT INTO public.ga_facility_events(tenant_id,facility_id,event_type,before_data,after_data,client_request_id,created_by)
      VALUES(p_tenant_id,v_id,CASE v_action WHEN 'update' THEN 'updated' WHEN 'opname' THEN 'opname' ELSE 'disposed' END,v_before,v_after,v_request,p_actor_user_id);
  ELSE RAISE EXCEPTION 'Unsupported asset action' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.manage_ga_inventory_item(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_action TEXT; v_id UUID; v_request UUID; v_before JSONB; v_after JSONB; v_code TEXT; v_name TEXT; v_category TEXT; v_quantity INTEGER; v_min INTEGER; v_unit TEXT; v_cost NUMERIC; v_location TEXT; v_status TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid inventory request' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-item:'||v_request::TEXT,0));
  SELECT item_id INTO v_id FROM public.ga_inventory_item_events WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
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

CREATE OR REPLACE FUNCTION public.adjust_ga_inventory_stock(p_tenant_id UUID,p_actor_user_id UUID,p_item_id UUID,p_delta INTEGER,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_item public.ga_inventory_items%ROWTYPE; v_existing UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_item_id IS NULL OR p_delta=0 OR p_client_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-stock:'||p_client_request_id::TEXT,0));
  SELECT id INTO v_existing FROM public.ga_inventory_movements WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('id',v_existing,'replayed',true); END IF;
  SELECT * INTO v_item FROM public.ga_inventory_items WHERE tenant_id=p_tenant_id AND id=p_item_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found' USING ERRCODE='P0002'; END IF;
  SELECT id INTO v_existing FROM public.ga_inventory_movements WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('id',v_existing,'replayed',true); END IF;
  IF v_item.quantity+p_delta<0 THEN RAISE EXCEPTION 'Stock cannot become negative' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ga_inventory_movements(tenant_id,item_id,quantity_delta,balance_after,reason,client_request_id,created_by)
    VALUES(p_tenant_id,p_item_id,p_delta,v_item.quantity+p_delta,btrim(p_reason),p_client_request_id,p_actor_user_id) RETURNING id INTO v_existing;
  UPDATE public.ga_inventory_items SET quantity=v_item.quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_item_id;
  RETURN jsonb_build_object('id',v_existing,'balance',v_item.quantity+p_delta,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_ga_assets(p_tenant_id UUID,p_actor_user_id UUID,p_snapshot_fingerprint TEXT,p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_batch public.ga_legacy_import_batches%ROWTYPE; v_item JSONB; v_kind TEXT; v_source_id TEXT; v_fingerprint TEXT; v_id UUID; v_request UUID; v_imported INTEGER:=0; v_skipped INTEGER:=0; v_code TEXT; v_name TEXT; v_category TEXT; v_location TEXT; v_custodian TEXT; v_condition TEXT; v_value NUMERIC; v_acquired DATE; v_status TEXT; v_quantity INTEGER; v_min INTEGER; v_unit TEXT; v_cost NUMERIC; v_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>6000 THEN RAISE EXCEPTION 'Invalid legacy GA import' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'ga',false) OR COALESCE(module_permissions->>'ga','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'General Affairs permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':ga-import:'||p_snapshot_fingerprint,0));
  SELECT * INTO v_batch FROM public.ga_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint;
  IF FOUND THEN RETURN jsonb_build_object('imported',v_batch.imported_count,'skipped',v_batch.skipped_count,'alreadyApplied',true); END IF;
  v_count:=jsonb_array_length(p_items);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid legacy GA item' USING ERRCODE='22023'; END IF;
    v_kind:=COALESCE(v_item->>'kind',''); v_source_id:=COALESCE(v_item->>'sourceRecordId',''); v_fingerprint:=COALESCE(v_item->>'sourceFingerprint','');
    IF v_source_id !~ '^[a-f0-9]{64}$' OR v_fingerprint !~ '^[a-f0-9]{64}$' OR v_kind NOT IN ('facility','inventory') THEN RAISE EXCEPTION 'Invalid legacy GA source reference' USING ERRCODE='22023'; END IF;
    IF v_kind='facility' THEN
      SELECT id,source_fingerprint INTO v_id,v_fingerprint FROM public.ga_facilities WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
      IF v_id IS NOT NULL THEN
        IF v_fingerprint<>v_item->>'sourceFingerprint' THEN RAISE EXCEPTION 'Legacy GA asset changed after earlier import' USING ERRCODE='23505'; END IF;
        v_skipped:=v_skipped+1; CONTINUE;
      END IF;
      v_code:=btrim(COALESCE(v_item->>'assetCode','')); v_name:=btrim(COALESCE(v_item->>'name','')); v_category:=btrim(COALESCE(v_item->>'category','')); v_location:=btrim(COALESCE(v_item->>'location','')); v_custodian:=btrim(COALESCE(v_item->>'custodian','')); v_condition:=COALESCE(v_item->>'condition',''); v_value:=COALESCE(NULLIF(v_item->>'acquisitionValue','')::NUMERIC,0); v_acquired:=NULLIF(v_item->>'acquiredOn','')::DATE; v_status:=COALESCE(v_item->>'status','active');
      IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_location)>180 OR length(v_custodian)>160 OR v_condition NOT IN ('Baik','Perlu Servis','Rusak Berat') OR v_value<0 OR v_status NOT IN ('active','disposed') THEN RAISE EXCEPTION 'Invalid legacy asset fields' USING ERRCODE='22023'; END IF;
      INSERT INTO public.ga_facilities(tenant_id,asset_code,name,category,location,custodian,condition,acquisition_value,acquired_on,status,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_code,v_name,v_category,v_location,v_custodian,v_condition,v_value,v_acquired,v_status,'legacy_firestore',v_source_id,v_item->>'sourceFingerprint',gen_random_uuid(),p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      v_request:=gen_random_uuid();
      INSERT INTO public.ga_facility_events(tenant_id,facility_id,event_type,after_data,client_request_id,created_by) VALUES(p_tenant_id,v_id,'created',jsonb_build_object('asset_code',v_code,'name',v_name,'category',v_category,'location',v_location,'custodian',v_custodian,'condition',v_condition,'status',v_status,'source','legacy_firestore'),v_request,p_actor_user_id);
    ELSE
      SELECT id,source_fingerprint INTO v_id,v_fingerprint FROM public.ga_inventory_items WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
      IF v_id IS NOT NULL THEN
        IF v_fingerprint<>v_item->>'sourceFingerprint' THEN RAISE EXCEPTION 'Legacy GA inventory changed after earlier import' USING ERRCODE='23505'; END IF;
        v_skipped:=v_skipped+1; CONTINUE;
      END IF;
      v_code:=btrim(COALESCE(v_item->>'itemCode','')); v_name:=btrim(COALESCE(v_item->>'name','')); v_category:=btrim(COALESCE(v_item->>'category','')); v_quantity:=COALESCE(NULLIF(v_item->>'quantity','')::INTEGER,0); v_min:=COALESCE(NULLIF(v_item->>'minimumQuantity','')::INTEGER,0); v_unit:=btrim(COALESCE(v_item->>'unit','Pcs')); v_cost:=COALESCE(NULLIF(v_item->>'unitCost','')::NUMERIC,0); v_location:=btrim(COALESCE(v_item->>'location',''));
      IF length(v_code) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_quantity<0 OR v_min<0 OR length(v_unit) NOT BETWEEN 1 AND 40 OR v_cost<0 OR length(v_location)>180 THEN RAISE EXCEPTION 'Invalid legacy inventory fields' USING ERRCODE='22023'; END IF;
      v_request:=gen_random_uuid();
      INSERT INTO public.ga_inventory_items(tenant_id,item_code,name,category,quantity,minimum_quantity,unit,unit_cost,location,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_code,v_name,v_category,v_quantity,v_min,v_unit,v_cost,v_location,'legacy_firestore',v_source_id,v_item->>'sourceFingerprint',v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      INSERT INTO public.ga_inventory_item_events(tenant_id,item_id,after_data,client_request_id,created_by)
        VALUES(p_tenant_id,v_id,jsonb_build_object('item_code',v_code,'name',v_name,'category',v_category,'quantity',v_quantity,'minimum_quantity',v_min,'unit',v_unit,'unit_cost',v_cost,'location',v_location,'source','legacy_firestore'),gen_random_uuid(),p_actor_user_id);
      IF v_quantity>0 THEN INSERT INTO public.ga_inventory_movements(tenant_id,item_id,quantity_delta,balance_after,reason,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_quantity,v_quantity,'Saldo awal impor Firestore',gen_random_uuid(),p_actor_user_id); END IF;
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  INSERT INTO public.ga_legacy_import_batches(tenant_id,snapshot_fingerprint,source_count,imported_count,skipped_count,created_by)
    VALUES(p_tenant_id,p_snapshot_fingerprint,v_count,v_imported,v_skipped,p_actor_user_id);
  RETURN jsonb_build_object('imported',v_imported,'skipped',v_skipped,'alreadyApplied',false);
END $$;

REVOKE ALL ON FUNCTION public.manage_ga_facility(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_ga_inventory_item(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.adjust_ga_inventory_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_ga_assets(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_ga_facility(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_ga_inventory_item(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_ga_inventory_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_ga_assets(UUID,UUID,TEXT,JSONB) TO service_role;

COMMENT ON TABLE public.ga_facilities IS 'Tenant-scoped asset register with auditable condition inspections and soft disposal.';
COMMENT ON TABLE public.ga_inventory_movements IS 'Append-only tenant-scoped stock ledger; quantity changes are transactional.';
COMMENT ON TABLE public.ga_legacy_import_batches IS 'Idempotency marker for Admin-reviewed imports from the legacy Firestore tenant.';
COMMIT;
