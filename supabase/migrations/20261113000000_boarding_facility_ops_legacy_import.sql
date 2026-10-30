-- Preserve legacy Firestore room-audit and facility-ticket history in Supabase.
-- Import is tenant-scoped, administrator-only, append-only, and retry-safe by source identity.
BEGIN;

ALTER TABLE public.boarding_cleanliness_audits
  ADD COLUMN source_system TEXT,
  ADD COLUMN source_record_id TEXT,
  ADD COLUMN inspector_name_snapshot TEXT NOT NULL DEFAULT 'Pengguna'
    CHECK (length(btrim(inspector_name_snapshot)) BETWEEN 1 AND 200);
ALTER TABLE public.boarding_cleanliness_audits ALTER COLUMN inspector_user_id DROP NOT NULL;
CREATE UNIQUE INDEX boarding_cleanliness_audits_legacy_source_uidx
  ON public.boarding_cleanliness_audits (tenant_id, source_system, source_record_id)
  WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL;

ALTER TABLE public.boarding_facility_tickets
  ADD COLUMN source_system TEXT,
  ADD COLUMN source_record_id TEXT;
ALTER TABLE public.boarding_facility_tickets ALTER COLUMN reported_by_user_id DROP NOT NULL;
CREATE UNIQUE INDEX boarding_facility_tickets_legacy_source_uidx
  ON public.boarding_facility_tickets (tenant_id, source_system, source_record_id)
  WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_boarding_cleanliness_audit(
  p_tenant_id UUID, p_room_id TEXT, p_audit_date DATE, p_score INTEGER, p_notes TEXT,
  p_actor_user_id UUID, p_expected_role TEXT, p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_inspector_name TEXT;
  v_audit public.boarding_cleanliness_audits%ROWTYPE;
  v_existing public.boarding_cleanliness_audits%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_room_id IS NULL OR p_audit_date IS NULL OR p_score IS NULL
    OR p_score NOT BETWEEN 0 AND 100 OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR length(COALESCE(p_notes, '')) > 2000
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Data audit kebersihan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)), display_name INTO v_role, v_inspector_name FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat mengaudit kebersihan tenant ini' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_data_records WHERE tenant_id = p_tenant_id AND id = p_room_id
    AND category = 'Kamar' AND lower(COALESCE(status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')) THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_room(p_tenant_id, p_actor_user_id, p_room_id) THEN
    RAISE EXCEPTION 'Kamar berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('boarding-cleanliness-audit:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_existing FROM public.boarding_cleanliness_audits
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.room_id IS DISTINCT FROM p_room_id OR v_existing.audit_date IS DISTINCT FROM p_audit_date
      OR v_existing.score IS DISTINCT FROM p_score OR v_existing.notes IS DISTINCT FROM btrim(COALESCE(p_notes, ''))
      OR v_existing.inspector_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'Kunci permintaan audit digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'auditId', v_existing.id);
  END IF;
  INSERT INTO public.boarding_cleanliness_audits (
    tenant_id, room_id, audit_date, score, notes, inspector_user_id, inspector_name_snapshot, client_request_id
  ) VALUES (
    p_tenant_id, p_room_id, p_audit_date, p_score, btrim(COALESCE(p_notes, '')),
    p_actor_user_id, COALESCE(NULLIF(btrim(v_inspector_name), ''), 'Pengguna'), p_client_request_id
  ) RETURNING * INTO v_audit;
  INSERT INTO public.boarding_cleanliness_audit_events (tenant_id, audit_id, actor_user_id, client_request_id)
  VALUES (p_tenant_id, v_audit.id, p_actor_user_id, p_client_request_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'auditId', v_audit.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_boarding_facility_ops(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_audits JSONB,
  p_tickets JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_row JSONB;
  v_existing public.boarding_cleanliness_audits%ROWTYPE;
  v_ticket_existing public.boarding_facility_tickets%ROWTYPE;
  v_audit_count INTEGER := 0;
  v_ticket_count INTEGER := 0;
  v_audit_imported INTEGER := 0;
  v_ticket_imported INTEGER := 0;
  v_audit_unchanged INTEGER := 0;
  v_ticket_unchanged INTEGER := 0;
  v_source_id TEXT;
  v_room_id TEXT;
  v_audit_date DATE;
  v_created_at TIMESTAMPTZ;
  v_resolved_at TIMESTAMPTZ;
  v_status TEXT;
  v_priority TEXT;
  v_score INTEGER;
  v_notes TEXT;
  v_inspector TEXT;
  v_issue TEXT;
  v_description TEXT;
  v_reporter TEXT;
  v_new_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR jsonb_typeof(p_audits) IS DISTINCT FROM 'array' OR jsonb_typeof(p_tickets) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_audits) > 1000 OR jsonb_array_length(p_tickets) > 1000 THEN
    RAISE EXCEPTION 'Snapshot audit dan tiket tidak valid atau melebihi batas' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Admin tenant yang dapat mengimpor riwayat asrama' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('legacy-boarding-facility:' || p_tenant_id::text, 0));

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_audits)
  LOOP
    v_audit_count := v_audit_count + 1;
    v_source_id := NULLIF(btrim(v_row->>'sourceRecordId'), '');
    v_room_id := NULLIF(btrim(v_row->>'roomId'), '');
    v_audit_date := NULLIF(v_row->>'auditDate', '')::DATE;
    v_score := NULLIF(v_row->>'score', '')::INTEGER;
    v_notes := COALESCE(v_row->>'notes', '');
    v_inspector := COALESCE(NULLIF(btrim(v_row->>'inspectorName'), ''), 'Pengguna');
    IF v_source_id IS NULL OR length(v_source_id) > 300 OR v_room_id IS NULL
      OR v_audit_date IS NULL OR v_score IS NULL OR v_score NOT BETWEEN 0 AND 100 OR length(v_notes) > 2000
      OR length(v_inspector) > 200 OR NOT EXISTS (SELECT 1 FROM public.master_data_records
        WHERE tenant_id = p_tenant_id AND id = v_room_id AND category = 'Kamar') THEN
      RAISE EXCEPTION 'Snapshot audit memiliki record tidak valid atau kamar tidak cocok' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM public.boarding_cleanliness_audits
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_firestore' AND source_record_id = v_source_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.room_id IS DISTINCT FROM v_room_id OR v_existing.audit_date IS DISTINCT FROM v_audit_date
        OR v_existing.score IS DISTINCT FROM v_score OR v_existing.notes IS DISTINCT FROM v_notes
        OR v_existing.inspector_name_snapshot IS DISTINCT FROM v_inspector THEN
        RAISE EXCEPTION 'Record audit legacy yang sama sudah memiliki isi berbeda' USING ERRCODE = '23505';
      END IF;
      v_audit_unchanged := v_audit_unchanged + 1;
    ELSE
      v_new_id := gen_random_uuid();
      INSERT INTO public.boarding_cleanliness_audits (
        id, tenant_id, room_id, audit_date, score, notes, inspector_user_id,
        inspector_name_snapshot, source_system, source_record_id, client_request_id
      ) VALUES (
        v_new_id, p_tenant_id, v_room_id, v_audit_date, v_score, btrim(v_notes), NULL,
        v_inspector, 'legacy_firestore', v_source_id, gen_random_uuid()
      );
      INSERT INTO public.boarding_cleanliness_audit_events (tenant_id, audit_id, actor_user_id, client_request_id)
      VALUES (p_tenant_id, v_new_id, p_actor_user_id, gen_random_uuid());
      v_audit_imported := v_audit_imported + 1;
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_tickets)
  LOOP
    v_ticket_count := v_ticket_count + 1;
    v_source_id := NULLIF(btrim(v_row->>'sourceRecordId'), '');
    v_room_id := NULLIF(btrim(v_row->>'roomId'), '');
    v_issue := btrim(COALESCE(v_row->>'issue', ''));
    v_description := COALESCE(v_row->>'description', '');
    v_reporter := COALESCE(NULLIF(btrim(v_row->>'reportedBy'), ''), 'Pengguna');
    v_priority := COALESCE(NULLIF(v_row->>'priority', ''), 'Medium');
    v_status := COALESCE(NULLIF(v_row->>'status', ''), 'Open');
    v_created_at := COALESCE(NULLIF(v_row->>'createdAt', '')::TIMESTAMPTZ, now());
    v_resolved_at := NULLIF(v_row->>'resolvedAt', '')::TIMESTAMPTZ;
    IF lower(v_status) IN ('resolved', 'complete', 'completed', 'closed', 'selesai') THEN v_status := 'Resolved';
    ELSIF lower(v_status) IN ('open', 'pending', 'new', 'terbuka') THEN v_status := 'Open';
    ELSE RAISE EXCEPTION 'Status tiket legacy tidak dikenali' USING ERRCODE = '22023';
    END IF;
    IF lower(v_priority) IN ('low', 'rendah') THEN v_priority := 'Low';
    ELSIF lower(v_priority) IN ('medium', 'normal', 'sedang') THEN v_priority := 'Medium';
    ELSIF lower(v_priority) IN ('high', 'tinggi') THEN v_priority := 'High';
    ELSIF lower(v_priority) IN ('urgent', 'darurat') THEN v_priority := 'Urgent';
    ELSE RAISE EXCEPTION 'Prioritas tiket legacy tidak dikenali' USING ERRCODE = '22023';
    END IF;
    IF v_source_id IS NULL OR length(v_source_id) > 300 OR v_room_id IS NULL
      OR length(v_issue) NOT BETWEEN 1 AND 200 OR length(v_description) > 4000
      OR length(v_reporter) > 200 OR NOT EXISTS (SELECT 1 FROM public.master_data_records
        WHERE tenant_id = p_tenant_id AND id = v_room_id AND category = 'Kamar') THEN
      RAISE EXCEPTION 'Snapshot tiket memiliki record tidak valid atau kamar tidak cocok' USING ERRCODE = '22023';
    END IF;
    IF v_status = 'Resolved' AND v_resolved_at IS NULL THEN v_resolved_at := v_created_at; END IF;
    SELECT * INTO v_ticket_existing FROM public.boarding_facility_tickets
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_firestore' AND source_record_id = v_source_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_ticket_existing.room_id IS DISTINCT FROM v_room_id OR v_ticket_existing.issue IS DISTINCT FROM v_issue
        OR v_ticket_existing.description IS DISTINCT FROM v_description OR v_ticket_existing.priority IS DISTINCT FROM v_priority
        OR v_ticket_existing.status IS DISTINCT FROM v_status OR v_ticket_existing.reporter_name_snapshot IS DISTINCT FROM v_reporter THEN
        RAISE EXCEPTION 'Record tiket legacy yang sama sudah memiliki isi berbeda' USING ERRCODE = '23505';
      END IF;
      v_ticket_unchanged := v_ticket_unchanged + 1;
    ELSE
      v_new_id := gen_random_uuid();
      INSERT INTO public.boarding_facility_tickets (
        id, tenant_id, room_id, issue, description, priority, status, reported_by_user_id,
        reporter_name_snapshot, resolved_at, source_system, source_record_id, client_request_id, created_at, updated_at
      ) VALUES (
        v_new_id, p_tenant_id, v_room_id, v_issue, btrim(v_description), v_priority, v_status, NULL,
        v_reporter, CASE WHEN v_status = 'Resolved' THEN v_resolved_at ELSE NULL END,
        'legacy_firestore', v_source_id, gen_random_uuid(), v_created_at, v_created_at
      );
      INSERT INTO public.boarding_facility_ticket_events (
        tenant_id, ticket_id, actor_user_id, client_request_id, event_type, from_status, to_status, created_at
      ) VALUES (p_tenant_id, v_new_id, p_actor_user_id, gen_random_uuid(), 'created', NULL, 'Open', v_created_at);
      IF v_status = 'Resolved' THEN
        INSERT INTO public.boarding_facility_ticket_events (
          tenant_id, ticket_id, actor_user_id, client_request_id, event_type, from_status, to_status, created_at
        ) VALUES (p_tenant_id, v_new_id, p_actor_user_id, gen_random_uuid(), 'resolved', 'Open', 'Resolved', v_resolved_at);
      END IF;
      v_ticket_imported := v_ticket_imported + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'auditsImported', v_audit_imported,
    'auditsUnchanged', v_audit_unchanged,
    'ticketsImported', v_ticket_imported,
    'ticketsUnchanged', v_ticket_unchanged,
    'sourceCount', jsonb_build_object('audits', v_audit_count, 'tickets', v_ticket_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_boarding_facility_ops(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_boarding_facility_ops(UUID, UUID, JSONB, JSONB) TO service_role;
COMMENT ON FUNCTION public.import_legacy_boarding_facility_ops(UUID, UUID, JSONB, JSONB)
  IS 'Admin-only atomic, tenant-scoped and retry-safe import of legacy Firestore room audits and facility tickets.';

COMMIT;
