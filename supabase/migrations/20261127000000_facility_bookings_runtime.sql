-- Tenant-scoped facility bookings with serializable resource/day conflict checks.
-- Staged only: reconcile the remote migration history before applying.
BEGIN;

CREATE TABLE public.facility_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  room_name TEXT NOT NULL CHECK (length(btrim(room_name)) BETWEEN 1 AND 180),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  purpose TEXT NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 500),
  booker_name TEXT NOT NULL CHECK (length(btrim(booker_name)) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK (end_time>start_time),
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX facility_bookings_tenant_date_idx ON public.facility_bookings(tenant_id,booking_date,start_time,end_time,room_name);
CREATE UNIQUE INDEX facility_bookings_legacy_source_uq ON public.facility_bookings(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.facility_booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','cancelled','imported')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,booking_id) REFERENCES public.facility_bookings(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX facility_booking_events_tenant_time_idx ON public.facility_booking_events(tenant_id,created_at DESC,id DESC);

CREATE TABLE public.facility_booking_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 0 AND 6000),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  unchanged_count INTEGER NOT NULL CHECK (unchanged_count BETWEEN 0 AND source_count),
  imported_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_fingerprint),
  FOREIGN KEY (tenant_id,imported_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['facility_bookings','facility_booking_events','facility_booking_import_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assert_facility_booking_admin(p_tenant_id UUID,p_actor_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_permissions JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Tenant and actor required' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT module_permissions INTO v_permissions FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') FOR SHARE;
  -- The application role baseline grants tenant modules to Admin by default;
  -- only an explicit denial of both owning modules blocks this operation.
  IF NOT FOUND OR (COALESCE(v_permissions->>'ga','true')<>'true' AND COALESCE(v_permissions->>'boarding','true')<>'true') THEN
    RAISE EXCEPTION 'Facility booking permission required' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.manage_facility_booking(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_room TEXT; v_date DATE; v_start TIME; v_end TIME; v_purpose TEXT; v_booker TEXT; v_before public.facility_bookings%ROWTYPE; v_lock TEXT;
BEGIN
  PERFORM public.assert_facility_booking_admin(p_tenant_id,p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid booking payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':facility-booking-request:'||v_request::TEXT,0));
  SELECT booking_id INTO v_id FROM public.facility_booking_events WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  IF v_action NOT IN ('create','update','cancel') THEN RAISE EXCEPTION 'Unsupported booking action' USING ERRCODE='22023'; END IF;
  IF v_action='update' OR v_action='cancel' THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    SELECT * INTO v_before FROM public.facility_bookings WHERE tenant_id=p_tenant_id AND id=v_id AND status='confirmed' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active booking not found' USING ERRCODE='P0002'; END IF;
    IF v_before.source_system='legacy_firestore' THEN RAISE EXCEPTION 'Legacy booking must be reviewed before editing' USING ERRCODE='23514'; END IF;
    IF v_action='cancel' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':'||v_before.booking_date::TEXT||':'||lower(v_before.room_name),0));
      UPDATE public.facility_bookings SET status='cancelled',updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
      INSERT INTO public.facility_booking_events(tenant_id,booking_id,event_type,client_request_id,actor_user_id,details) VALUES(p_tenant_id,v_id,'cancelled',v_request,p_actor_user_id,jsonb_build_object('reason',left(btrim(COALESCE(p_item->>'reason','')),500)));
      RETURN jsonb_build_object('id',v_id,'replayed',false);
    END IF;
  END IF;
  v_room:=btrim(COALESCE(p_item->>'room','')); v_date:=NULLIF(p_item->>'date','')::DATE; v_start:=NULLIF(p_item->>'startTime','')::TIME; v_end:=NULLIF(p_item->>'endTime','')::TIME; v_purpose:=btrim(COALESCE(p_item->>'purpose','')); v_booker:=btrim(COALESCE(p_item->>'booker',''));
  IF length(v_room) NOT BETWEEN 1 AND 180 OR v_date IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end<=v_start OR length(v_purpose) NOT BETWEEN 1 AND 500 OR length(v_booker) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid booking fields' USING ERRCODE='22023'; END IF;
  IF v_action='create' THEN
    v_lock:=p_tenant_id::TEXT||':'||v_date::TEXT||':'||lower(v_room);
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
  ELSE
    FOR v_lock IN SELECT DISTINCT candidate.lock_key FROM unnest(ARRAY[
      p_tenant_id::TEXT||':'||v_before.booking_date::TEXT||':'||lower(v_before.room_name),
      p_tenant_id::TEXT||':'||v_date::TEXT||':'||lower(v_room)
    ]) AS candidate(lock_key) ORDER BY candidate.lock_key LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
    END LOOP;
  END IF;
  IF EXISTS(SELECT 1 FROM public.facility_bookings b WHERE b.tenant_id=p_tenant_id AND b.status='confirmed' AND lower(b.room_name)=lower(v_room) AND b.booking_date=v_date AND b.start_time<v_end AND b.end_time>v_start AND (v_action='create' OR b.id<>v_id)) THEN
    RAISE EXCEPTION 'Facility time overlaps another confirmed booking' USING ERRCODE='23P01';
  END IF;
  IF v_action='create' THEN
    INSERT INTO public.facility_bookings(tenant_id,room_name,booking_date,start_time,end_time,purpose,booker_name,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_room,v_date,v_start,v_end,v_purpose,v_booker,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    INSERT INTO public.facility_booking_events(tenant_id,booking_id,event_type,client_request_id,actor_user_id) VALUES(p_tenant_id,v_id,'created',v_request,p_actor_user_id);
  ELSE
    UPDATE public.facility_bookings SET room_name=v_room,booking_date=v_date,start_time=v_start,end_time=v_end,purpose=v_purpose,booker_name=v_booker,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    INSERT INTO public.facility_booking_events(tenant_id,booking_id,event_type,client_request_id,actor_user_id) VALUES(p_tenant_id,v_id,'updated',v_request,p_actor_user_id);
  END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_facility_bookings(p_tenant_id UUID,p_actor_user_id UUID,p_snapshot_fingerprint TEXT,p_source_count INTEGER,p_rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_previous public.facility_booking_import_batches%ROWTYPE; v_item JSONB; v_count INTEGER:=0; v_imported INTEGER:=0; v_unchanged INTEGER:=0; v_id UUID; v_request UUID; v_room TEXT; v_date DATE; v_start TIME; v_end TIME; v_status TEXT; v_lock TEXT;
BEGIN
  PERFORM public.assert_facility_booking_admin(p_tenant_id,p_actor_user_id);
  IF p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$' OR p_source_count IS NULL OR p_source_count<0 OR p_source_count>6000 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid facility booking import snapshot' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_rows)>6000 OR jsonb_array_length(p_rows)<>p_source_count THEN RAISE EXCEPTION 'Invalid facility booking import count' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('facility-booking-import:'||p_tenant_id::TEXT||':'||p_snapshot_fingerprint,0));
  SELECT * INTO v_previous FROM public.facility_booking_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint;
  IF FOUND THEN RETURN jsonb_build_object('alreadyApplied',true,'imported',v_previous.imported_count,'unchanged',v_previous.unchanged_count); END IF;
  FOR v_lock IN
    SELECT DISTINCT p_tenant_id::TEXT||':'||(item->>'date')||':'||lower(btrim(COALESCE(item->>'room','')))
    FROM jsonb_array_elements(p_rows) AS items(item)
    WHERE COALESCE(item->>'status','confirmed')='confirmed'
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_count:=v_count+1; v_request:=NULLIF(v_item->>'clientRequestId','')::UUID;
    IF v_request IS NULL OR NULLIF(v_item->>'sourceRecordId','') IS NULL OR COALESCE(v_item->>'sourceFingerprint','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid legacy booking provenance' USING ERRCODE='22023'; END IF;
    v_room:=btrim(COALESCE(v_item->>'room','')); v_date:=NULLIF(v_item->>'date','')::DATE; v_start:=NULLIF(v_item->>'startTime','')::TIME; v_end:=NULLIF(v_item->>'endTime','')::TIME; v_status:=COALESCE(v_item->>'status','confirmed');
    IF length(v_room) NOT BETWEEN 1 AND 180 OR v_date IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end<=v_start OR length(btrim(COALESCE(v_item->>'purpose',''))) NOT BETWEEN 1 AND 500 OR length(btrim(COALESCE(v_item->>'booker',''))) NOT BETWEEN 1 AND 180 OR v_status NOT IN ('confirmed','cancelled') THEN RAISE EXCEPTION 'Invalid legacy booking fields' USING ERRCODE='22023'; END IF;
    SELECT id,source_fingerprint INTO v_id,v_lock FROM public.facility_bookings WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_item->>'sourceRecordId';
    IF v_id IS NOT NULL THEN
      IF v_lock<>v_item->>'sourceFingerprint' THEN RAISE EXCEPTION 'Legacy booking changed after import' USING ERRCODE='23514'; END IF;
      v_unchanged:=v_unchanged+1; CONTINUE;
    END IF;
    IF v_status='confirmed' THEN
      IF EXISTS(SELECT 1 FROM public.facility_bookings b WHERE b.tenant_id=p_tenant_id AND b.status='confirmed' AND lower(b.room_name)=lower(v_room) AND b.booking_date=v_date AND b.start_time<v_end AND b.end_time>v_start) THEN RAISE EXCEPTION 'Legacy facility booking conflicts with another confirmed booking' USING ERRCODE='23P01'; END IF;
    END IF;
    INSERT INTO public.facility_bookings(tenant_id,room_name,booking_date,start_time,end_time,purpose,booker_name,status,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_room,v_date,v_start,v_end,btrim(v_item->>'purpose'),btrim(v_item->>'booker'),v_status,'legacy_firestore',v_item->>'sourceRecordId',v_item->>'sourceFingerprint',v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    INSERT INTO public.facility_booking_events(tenant_id,booking_id,event_type,client_request_id,actor_user_id,details) VALUES(p_tenant_id,v_id,'imported',v_request,p_actor_user_id,jsonb_build_object('sourceFingerprint',v_item->>'sourceFingerprint'));
    v_imported:=v_imported+1;
  END LOOP;
  IF v_count<>p_source_count THEN RAISE EXCEPTION 'Facility booking import count mismatch' USING ERRCODE='22023'; END IF;
  INSERT INTO public.facility_booking_import_batches(tenant_id,snapshot_fingerprint,source_count,imported_count,unchanged_count,imported_by) VALUES(p_tenant_id,p_snapshot_fingerprint,p_source_count,v_imported,v_unchanged,p_actor_user_id);
  RETURN jsonb_build_object('alreadyApplied',false,'imported',v_imported,'unchanged',v_unchanged);
END $$;

REVOKE ALL ON FUNCTION public.assert_facility_booking_admin(UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_facility_booking(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_facility_bookings(UUID,UUID,TEXT,INTEGER,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_facility_booking(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_facility_bookings(UUID,UUID,TEXT,INTEGER,JSONB) TO service_role;

COMMIT;
