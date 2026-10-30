-- Tenant-scoped room cleanliness audits and facility maintenance tickets.
BEGIN;

CREATE TABLE public.boarding_cleanliness_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL,
  room_category TEXT GENERATED ALWAYS AS ('Kamar'::TEXT) STORED,
  audit_date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  inspector_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, inspector_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX boarding_cleanliness_audits_tenant_date_idx
  ON public.boarding_cleanliness_audits (tenant_id, audit_date DESC, created_at DESC);
CREATE INDEX boarding_cleanliness_audits_tenant_room_idx
  ON public.boarding_cleanliness_audits (tenant_id, room_id, audit_date DESC);

CREATE TABLE public.boarding_cleanliness_audit_events (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, audit_id) REFERENCES public.boarding_cleanliness_audits (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.boarding_facility_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  room_id TEXT NOT NULL,
  room_category TEXT GENERATED ALWAYS AS ('Kamar'::TEXT) STORED,
  issue TEXT NOT NULL CHECK (length(btrim(issue)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved')),
  reported_by_user_id UUID NOT NULL,
  reporter_name_snapshot TEXT NOT NULL CHECK (length(btrim(reporter_name_snapshot)) BETWEEN 1 AND 200),
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, resolved_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX boarding_facility_tickets_tenant_status_idx
  ON public.boarding_facility_tickets (tenant_id, status, priority, created_at DESC);
CREATE INDEX boarding_facility_tickets_tenant_room_idx
  ON public.boarding_facility_tickets (tenant_id, room_id, created_at DESC);
CREATE TRIGGER boarding_facility_tickets_set_updated_at
  BEFORE UPDATE ON public.boarding_facility_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.boarding_facility_ticket_events (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'resolved')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('Open', 'Resolved')),
  to_status TEXT NOT NULL CHECK (to_status IN ('Open', 'Resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES public.boarding_facility_tickets (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.boarding_cleanliness_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_cleanliness_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_cleanliness_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_cleanliness_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_facility_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_facility_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_facility_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_facility_ticket_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_cleanliness_audits, public.boarding_cleanliness_audit_events,
  public.boarding_facility_tickets, public.boarding_facility_ticket_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.boarding_cleanliness_audits, public.boarding_cleanliness_audit_events,
  public.boarding_facility_ticket_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.boarding_facility_tickets TO service_role;

CREATE OR REPLACE FUNCTION public.boarding_user_can_access_room(
  p_tenant_id UUID,
  p_user_id UUID,
  p_room_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_data_records room
    JOIN public.boarding_staff_assignments a
      ON a.tenant_id = room.tenant_id AND a.user_id = p_user_id AND a.status = 'active'
    WHERE room.tenant_id = p_tenant_id AND room.id = p_room_id AND room.category = 'Kamar'
      AND lower(COALESCE(room.status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')
      AND (
        a.room_id = room.id
        OR (a.building_id IS NOT NULL AND a.building_id = room.parent_id
          AND EXISTS (SELECT 1 FROM public.master_data_records b
            WHERE b.tenant_id = room.tenant_id AND b.id = room.parent_id AND b.category = 'Gedung'
              AND lower(COALESCE(b.status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')))
      )
  );
$$;

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
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
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
  INSERT INTO public.boarding_cleanliness_audits (tenant_id, room_id, audit_date, score, notes, inspector_user_id, client_request_id)
  VALUES (p_tenant_id, p_room_id, p_audit_date, p_score, btrim(COALESCE(p_notes, '')), p_actor_user_id, p_client_request_id)
  RETURNING * INTO v_audit;
  INSERT INTO public.boarding_cleanliness_audit_events (tenant_id, audit_id, actor_user_id, client_request_id)
  VALUES (p_tenant_id, v_audit.id, p_actor_user_id, p_client_request_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'auditId', v_audit.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_boarding_facility_ticket(
  p_tenant_id UUID, p_room_id TEXT, p_issue TEXT, p_description TEXT, p_priority TEXT,
  p_actor_user_id UUID, p_expected_role TEXT, p_reporter_name TEXT, p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_linked_student_id TEXT;
  v_student public.students%ROWTYPE;
  v_ticket public.boarding_facility_tickets%ROWTYPE;
  v_existing public.boarding_facility_tickets%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_room_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR NULLIF(btrim(COALESCE(p_issue, '')), '') IS NULL OR length(p_issue) > 200
    OR length(COALESCE(p_description, '')) > 4000 OR p_priority IS NULL OR p_priority NOT IN ('Low', 'Medium', 'High', 'Urgent')
    OR NULLIF(btrim(COALESCE(p_reporter_name, '')), '') IS NULL OR length(p_reporter_name) > 200
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Data tiket fasilitas tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)), linked_santri_id INTO v_role, v_linked_student_id
  FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Role tidak dapat melaporkan tiket fasilitas tenant ini' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_data_records WHERE tenant_id = p_tenant_id AND id = p_room_id
    AND category = 'Kamar' AND lower(COALESCE(status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')) THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role IN ('santri', 'wali_santri') THEN
    IF v_linked_student_id IS NULL THEN RAISE EXCEPTION 'Profil belum tertaut ke santri' USING ERRCODE = '42501'; END IF;
    SELECT s.* INTO v_student FROM public.students s
    WHERE tenant_id = p_tenant_id AND lower(COALESCE(status, '')) <> 'archived'
      AND (id::text = v_linked_student_id OR source_record_id = v_linked_student_id)
      AND NOT EXISTS (SELECT 1 FROM public.students other_student
        WHERE other_student.tenant_id = p_tenant_id AND lower(COALESCE(other_student.status, '')) <> 'archived'
          AND (other_student.id::text = v_linked_student_id OR other_student.source_record_id = v_linked_student_id)
          AND other_student.id <> s.id)
    FOR UPDATE OF s;
    IF NOT FOUND OR v_student.room_id IS DISTINCT FROM p_room_id THEN
      RAISE EXCEPTION 'Tiket hanya dapat dibuat untuk kamar santri yang tertaut' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'ustadz' AND NOT public.boarding_user_can_access_room(p_tenant_id, p_actor_user_id, p_room_id) THEN
    RAISE EXCEPTION 'Kamar berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('boarding-facility-ticket:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_existing FROM public.boarding_facility_tickets
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.room_id IS DISTINCT FROM p_room_id OR v_existing.issue IS DISTINCT FROM btrim(p_issue)
      OR v_existing.description IS DISTINCT FROM btrim(COALESCE(p_description, ''))
      OR v_existing.priority IS DISTINCT FROM p_priority OR v_existing.reported_by_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'Kunci permintaan tiket digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'ticketId', v_existing.id, 'status', v_existing.status);
  END IF;
  INSERT INTO public.boarding_facility_tickets (
    tenant_id, room_id, issue, description, priority, reported_by_user_id, reporter_name_snapshot, client_request_id
  ) VALUES (p_tenant_id, p_room_id, btrim(p_issue), btrim(COALESCE(p_description, '')), p_priority,
    p_actor_user_id, btrim(p_reporter_name), p_client_request_id)
  RETURNING * INTO v_ticket;
  INSERT INTO public.boarding_facility_ticket_events (tenant_id, ticket_id, actor_user_id, client_request_id, event_type, from_status, to_status)
  VALUES (p_tenant_id, v_ticket.id, p_actor_user_id, p_client_request_id, 'created', NULL, 'Open');
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'ticketId', v_ticket.id, 'status', v_ticket.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_boarding_facility_ticket(
  p_tenant_id UUID, p_ticket_id UUID, p_actor_user_id UUID, p_expected_role TEXT, p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_ticket public.boarding_facility_tickets%ROWTYPE;
  v_event public.boarding_facility_ticket_events%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_ticket_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Permintaan penyelesaian tiket tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat menyelesaikan tiket fasilitas' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ticket FROM public.boarding_facility_tickets
  WHERE tenant_id = p_tenant_id AND id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiket fasilitas tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_room(p_tenant_id, p_actor_user_id, v_ticket.room_id) THEN
    RAISE EXCEPTION 'Tiket berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('boarding-facility-resolve:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_event FROM public.boarding_facility_ticket_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.ticket_id IS DISTINCT FROM p_ticket_id OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_event.event_type <> 'resolved' OR v_event.to_status <> 'Resolved' THEN
      RAISE EXCEPTION 'Kunci permintaan penyelesaian digunakan untuk tindakan berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'ticketId', p_ticket_id, 'status', 'Resolved');
  END IF;
  IF v_ticket.status = 'Resolved' THEN RAISE EXCEPTION 'Tiket sudah diselesaikan' USING ERRCODE = '23514'; END IF;
  UPDATE public.boarding_facility_tickets SET status = 'Resolved', resolved_by_user_id = p_actor_user_id,
    resolved_at = now(), updated_at = now() WHERE tenant_id = p_tenant_id AND id = p_ticket_id;
  INSERT INTO public.boarding_facility_ticket_events (tenant_id, ticket_id, actor_user_id, client_request_id, event_type, from_status, to_status)
  VALUES (p_tenant_id, p_ticket_id, p_actor_user_id, p_client_request_id, 'resolved', 'Open', 'Resolved');
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'ticketId', p_ticket_id, 'status', 'Resolved');
END;
$$;

REVOKE ALL ON FUNCTION public.boarding_user_can_access_room(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_boarding_cleanliness_audit(UUID, TEXT, DATE, INTEGER, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_boarding_facility_ticket(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_boarding_facility_ticket(UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boarding_user_can_access_room(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_boarding_cleanliness_audit(UUID, TEXT, DATE, INTEGER, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_boarding_facility_ticket(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_boarding_facility_ticket(UUID, UUID, UUID, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.boarding_cleanliness_audits IS 'Tenant-scoped room inspections with immutable actor audit events.';
COMMENT ON TABLE public.boarding_facility_tickets IS 'Tenant-scoped maintenance tickets with atomic, audited status resolution.';
COMMIT;
