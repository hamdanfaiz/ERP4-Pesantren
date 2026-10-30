-- Tenant-scoped donation, fundraising, and waqf operational records.
-- Staged only: reconcile the remote migration history before applying.
BEGIN;

CREATE TABLE public.donation_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  fund_type TEXT NOT NULL CHECK (fund_type IN ('zakat','infaq','sadaqah','waqf','education','infrastructure','other')),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description)<=2000),
  target_amount NUMERIC(16,2) NOT NULL CHECK (target_amount>=0),
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX donation_campaigns_tenant_status_idx ON public.donation_campaigns(tenant_id,status,end_date,id);

CREATE TABLE public.donation_donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 180),
  donor_type TEXT NOT NULL CHECK (donor_type IN ('alumni','parent','corporate','community','other')),
  email TEXT CHECK (email IS NULL OR length(email)<=254),
  phone TEXT CHECK (phone IS NULL OR length(phone)<=40),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX donation_donors_tenant_name_idx ON public.donation_donors(tenant_id,status,full_name,id);

CREATE TABLE public.donation_receipt_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  receipt_year INTEGER NOT NULL CHECK (receipt_year BETWEEN 2000 AND 2200),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number>=0),
  PRIMARY KEY (tenant_id,receipt_year)
);

CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  donor_id UUID,
  campaign_id UUID,
  donor_name_snapshot TEXT NOT NULL CHECK (length(btrim(donor_name_snapshot)) BETWEEN 1 AND 180),
  amount NUMERIC(16,2) NOT NULL CHECK (amount>0),
  fund_type TEXT NOT NULL CHECK (fund_type IN ('zakat','infaq','sadaqah','waqf','education','infrastructure','other')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer','qris','e_wallet','other')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_number TEXT NOT NULL,
  reference_note TEXT NOT NULL DEFAULT '' CHECK (length(reference_note)<=500),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','voided')),
  void_reason TEXT,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,receipt_number),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,donor_id) REFERENCES public.donation_donors(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,campaign_id) REFERENCES public.donation_campaigns(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,voided_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((status='confirmed' AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL) OR (status='voided' AND length(btrim(COALESCE(void_reason,''))) BETWEEN 5 AND 500 AND voided_by IS NOT NULL AND voided_at IS NOT NULL))
);
CREATE INDEX donations_tenant_received_idx ON public.donations(tenant_id,received_at DESC,id DESC);
CREATE INDEX donations_tenant_campaign_idx ON public.donations(tenant_id,campaign_id,received_at DESC) WHERE status='confirmed';
CREATE INDEX donations_tenant_donor_idx ON public.donations(tenant_id,donor_id,received_at DESC) WHERE status='confirmed';

CREATE TABLE public.waqf_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_code TEXT NOT NULL CHECK (length(btrim(asset_code)) BETWEEN 1 AND 50),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('land','building','vehicle','productive','cash','other')),
  location TEXT NOT NULL DEFAULT '' CHECK (length(location)<=240),
  estimated_value NUMERIC(16,2) NOT NULL CHECK (estimated_value>=0),
  condition_label TEXT NOT NULL DEFAULT '' CHECK (length(condition_label)<=120),
  wakif_name TEXT NOT NULL DEFAULT '' CHECK (length(wakif_name)<=180),
  acquired_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','disposed')),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,asset_code),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX waqf_assets_tenant_status_idx ON public.waqf_assets(tenant_id,status,name,id);

CREATE TABLE public.donation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign','donor','donation','waqf_asset')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','archived','voided')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,entity_type,client_request_id),
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX donation_audit_events_tenant_time_idx ON public.donation_audit_events(tenant_id,created_at DESC,id DESC);

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['donation_campaigns','donation_donors','donation_receipt_counters','donations','waqf_assets','donation_audit_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assert_donation_admin(p_tenant_id UUID,p_actor_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Tenant and actor required' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles p WHERE p.tenant_id=p_tenant_id AND p.user_id=p_actor_user_id AND p.status='active' AND p.role IN ('admin','super_admin') AND (NOT COALESCE(p.module_permissions ? 'donation',false) OR COALESCE(p.module_permissions->>'donation','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation permission required' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.manage_donation_campaign(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_title TEXT; v_type TEXT; v_description TEXT; v_target NUMERIC; v_end DATE; v_status TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid campaign payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-campaign:'||v_request::TEXT,0));
  SELECT entity_id INTO v_id FROM public.donation_audit_events WHERE tenant_id=p_tenant_id AND entity_type='campaign' AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  v_title:=btrim(COALESCE(p_item->>'title','')); v_type:=COALESCE(p_item->>'fundType','other'); v_description:=btrim(COALESCE(p_item->>'description','')); v_target:=COALESCE(NULLIF(p_item->>'targetAmount','')::NUMERIC,0); v_end:=NULLIF(p_item->>'endDate','')::DATE; v_status:=COALESCE(p_item->>'status','active');
  IF length(v_title) NOT BETWEEN 1 AND 180 OR v_type NOT IN ('zakat','infaq','sadaqah','waqf','education','infrastructure','other') OR length(v_description)>2000 OR v_target<0 OR v_status NOT IN ('active','paused','completed','archived') THEN RAISE EXCEPTION 'Invalid campaign fields' USING ERRCODE='22023'; END IF;
  IF v_action='create' THEN
    INSERT INTO public.donation_campaigns(tenant_id,title,fund_type,description,target_amount,end_date,status,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_title,v_type,v_description,v_target,v_end,v_status,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
  ELSIF v_action='update' THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    UPDATE public.donation_campaigns SET title=v_title,fund_type=v_type,description=v_description,target_amount=v_target,end_date=v_end,status=v_status,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE='P0002'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported campaign action' USING ERRCODE='22023'; END IF;
  INSERT INTO public.donation_audit_events(tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id) VALUES(p_tenant_id,'campaign',v_id,CASE WHEN v_action='create' THEN 'created' ELSE 'updated' END,v_request,p_actor_user_id);
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.manage_donation_donor(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_name TEXT; v_type TEXT; v_email TEXT; v_phone TEXT; v_notes TEXT; v_status TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid donor payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-donor:'||v_request::TEXT,0));
  SELECT entity_id INTO v_id FROM public.donation_audit_events WHERE tenant_id=p_tenant_id AND entity_type='donor' AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  v_name:=btrim(COALESCE(p_item->>'fullName','')); v_type:=COALESCE(p_item->>'donorType','other'); v_email:=NULLIF(btrim(p_item->>'email'),''); v_phone:=NULLIF(btrim(p_item->>'phone'),''); v_notes:=btrim(COALESCE(p_item->>'notes','')); v_status:=COALESCE(p_item->>'status','active');
  IF length(v_name) NOT BETWEEN 1 AND 180 OR v_type NOT IN ('alumni','parent','corporate','community','other') OR length(COALESCE(v_email,''))>254 OR length(COALESCE(v_phone,''))>40 OR length(v_notes)>1000 OR v_status NOT IN ('active','archived') THEN RAISE EXCEPTION 'Invalid donor fields' USING ERRCODE='22023'; END IF;
  IF v_action='create' THEN
    INSERT INTO public.donation_donors(tenant_id,full_name,donor_type,email,phone,notes,status,client_request_id,created_by,updated_by) VALUES(p_tenant_id,v_name,v_type,v_email,v_phone,v_notes,v_status,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
  ELSIF v_action='update' THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    UPDATE public.donation_donors SET full_name=v_name,donor_type=v_type,email=v_email,phone=v_phone,notes=v_notes,status=v_status,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Donor not found' USING ERRCODE='P0002'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported donor action' USING ERRCODE='22023'; END IF;
  INSERT INTO public.donation_audit_events(tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id) VALUES(p_tenant_id,'donor',v_id,CASE WHEN v_action='create' THEN 'created' ELSE 'updated' END,v_request,p_actor_user_id);
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.manage_waqf_asset(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_code TEXT; v_name TEXT; v_type TEXT; v_location TEXT; v_value NUMERIC; v_condition TEXT; v_wakif TEXT; v_date DATE; v_status TEXT; v_notes TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid waqf payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':waqf-asset:'||v_request::TEXT,0));
  SELECT entity_id INTO v_id FROM public.donation_audit_events WHERE tenant_id=p_tenant_id AND entity_type='waqf_asset' AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  v_code:=btrim(COALESCE(p_item->>'assetCode','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_type:=COALESCE(p_item->>'assetType','other'); v_location:=btrim(COALESCE(p_item->>'location','')); v_value:=COALESCE(NULLIF(p_item->>'estimatedValue','')::NUMERIC,0); v_condition:=btrim(COALESCE(p_item->>'conditionLabel','')); v_wakif:=btrim(COALESCE(p_item->>'wakifName','')); v_date:=NULLIF(p_item->>'acquiredOn','')::DATE; v_status:=COALESCE(p_item->>'status','active'); v_notes:=btrim(COALESCE(p_item->>'notes',''));
  IF length(v_code) NOT BETWEEN 1 AND 50 OR length(v_name) NOT BETWEEN 1 AND 180 OR v_type NOT IN ('land','building','vehicle','productive','cash','other') OR length(v_location)>240 OR v_value<0 OR length(v_condition)>120 OR length(v_wakif)>180 OR v_status NOT IN ('active','maintenance','disposed') OR length(v_notes)>1000 THEN RAISE EXCEPTION 'Invalid waqf asset fields' USING ERRCODE='22023'; END IF;
  IF v_action='create' THEN
    INSERT INTO public.waqf_assets(tenant_id,asset_code,name,asset_type,location,estimated_value,condition_label,wakif_name,acquired_on,status,notes,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_code,v_name,v_type,v_location,v_value,v_condition,v_wakif,v_date,v_status,v_notes,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
  ELSIF v_action='update' THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    UPDATE public.waqf_assets SET asset_code=v_code,name=v_name,asset_type=v_type,location=v_location,estimated_value=v_value,condition_label=v_condition,wakif_name=v_wakif,acquired_on=v_date,status=v_status,notes=v_notes,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Waqf asset not found' USING ERRCODE='P0002'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported waqf asset action' USING ERRCODE='22023'; END IF;
  INSERT INTO public.donation_audit_events(tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id) VALUES(p_tenant_id,'waqf_asset',v_id,CASE WHEN v_action='create' THEN 'created' ELSE 'updated' END,v_request,p_actor_user_id);
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.record_donation(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id UUID; v_request UUID; v_donor UUID; v_campaign UUID; v_name TEXT; v_amount NUMERIC; v_type TEXT; v_method TEXT; v_received TIMESTAMPTZ; v_note TEXT; v_year INTEGER; v_next BIGINT; v_receipt TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid donation payload' USING ERRCODE='22023'; END IF;
  v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-record:'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.donations WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  v_donor:=NULLIF(p_item->>'donorId','')::UUID; v_campaign:=NULLIF(p_item->>'campaignId','')::UUID;
  v_name:=btrim(COALESCE(p_item->>'donorName','')); v_amount:=NULLIF(p_item->>'amount','')::NUMERIC; v_type:=COALESCE(p_item->>'fundType','other'); v_method:=COALESCE(p_item->>'paymentMethod','other'); v_received:=COALESCE(NULLIF(p_item->>'receivedAt','')::TIMESTAMPTZ,now()); v_note:=btrim(COALESCE(p_item->>'referenceNote',''));
  IF length(v_name) NOT BETWEEN 1 AND 180 OR v_amount IS NULL OR v_amount<=0 OR v_type NOT IN ('zakat','infaq','sadaqah','waqf','education','infrastructure','other') OR v_method NOT IN ('cash','bank_transfer','qris','e_wallet','other') OR length(v_note)>500 THEN RAISE EXCEPTION 'Invalid donation fields' USING ERRCODE='22023'; END IF;
  IF v_donor IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.donation_donors WHERE tenant_id=p_tenant_id AND id=v_donor AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Donor not found' USING ERRCODE='P0002'; END IF;
  END IF;
  IF v_campaign IS NOT NULL THEN
    SELECT fund_type INTO v_type FROM public.donation_campaigns WHERE tenant_id=p_tenant_id AND id=v_campaign AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='23514'; END IF;
  END IF;
  v_year:=EXTRACT(YEAR FROM v_received)::INTEGER;
  INSERT INTO public.donation_receipt_counters(tenant_id,receipt_year,last_number) VALUES(p_tenant_id,v_year,1)
    ON CONFLICT(tenant_id,receipt_year) DO UPDATE SET last_number=donation_receipt_counters.last_number+1 RETURNING last_number INTO v_next;
  v_receipt:='DON-'||v_year::TEXT||'-'||lpad(v_next::TEXT,7,'0');
  INSERT INTO public.donations(tenant_id,donor_id,campaign_id,donor_name_snapshot,amount,fund_type,payment_method,received_at,receipt_number,reference_note,client_request_id,created_by)
    VALUES(p_tenant_id,v_donor,v_campaign,v_name,v_amount,v_type,v_method,v_received,v_receipt,v_note,v_request,p_actor_user_id) RETURNING id INTO v_id;
  INSERT INTO public.donation_audit_events(tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id,details) VALUES(p_tenant_id,'donation',v_id,'created',v_request,p_actor_user_id,jsonb_build_object('receiptNumber',v_receipt,'amount',v_amount));
  RETURN jsonb_build_object('id',v_id,'receiptNumber',v_receipt,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.void_donation(p_tenant_id UUID,p_actor_user_id UUID,p_donation_id UUID,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_status TEXT; v_receipt TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id,p_actor_user_id);
  IF p_donation_id IS NULL OR p_client_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'A void reason of 5-500 chars is required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':donation-void:'||p_client_request_id::TEXT,0));
  IF EXISTS(SELECT 1 FROM public.donation_audit_events WHERE tenant_id=p_tenant_id AND entity_type='donation' AND client_request_id=p_client_request_id) THEN RETURN jsonb_build_object('replayed',true); END IF;
  SELECT status,receipt_number INTO v_status,v_receipt FROM public.donations WHERE tenant_id=p_tenant_id AND id=p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found' USING ERRCODE='P0002'; END IF;
  IF v_status<>'confirmed' THEN RAISE EXCEPTION 'Donation is already voided' USING ERRCODE='23514'; END IF;
  UPDATE public.donations SET status='voided',void_reason=btrim(p_reason),voided_by=p_actor_user_id,voided_at=now() WHERE tenant_id=p_tenant_id AND id=p_donation_id;
  INSERT INTO public.donation_audit_events(tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id,details) VALUES(p_tenant_id,'donation',p_donation_id,'voided',p_client_request_id,p_actor_user_id,jsonb_build_object('receiptNumber',v_receipt,'reason',btrim(p_reason)));
  RETURN jsonb_build_object('id',p_donation_id,'receiptNumber',v_receipt,'replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.assert_donation_admin(UUID,UUID) FROM PUBLIC,anon,authenticated;
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

COMMIT;
