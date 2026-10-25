-- Route Wali authorization through the canonical guardian/student relation.
BEGIN;

CREATE OR REPLACE FUNCTION public.request_boarding_permit(
  p_tenant_id UUID,
  p_student_id UUID,
  p_permit_type TEXT,
  p_reason TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
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
  v_existing public.boarding_permits%ROWTYPE;
  v_permit_id UUID;
  v_room_name TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
    OR p_permit_type IS NULL
    OR p_permit_type NOT IN ('Pulang', 'Keluar Area', 'Kegiatan Eksternal', 'Izin Walisantri (Parental Leave)')
    OR p_reason IS NULL OR NULLIF(btrim(p_reason), '') IS NULL OR length(p_reason) > 1000
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Data izin asrama tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(role)), linked_santri_id
  INTO v_role, v_linked_student_id
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Profil akun asrama tidak aktif atau role tidak cocok' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Role tidak dapat mengajukan izin asrama' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
    AND lower(COALESCE(status, '')) NOT IN ('archived', 'inactive', 'nonaktif', 'tidak aktif')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'santri' AND (
    v_linked_student_id IS NULL
    OR (v_linked_student_id <> v_student.id::text
      AND v_linked_student_id IS DISTINCT FROM v_student.source_record_id)
  ) THEN
    RAISE EXCEPTION 'Profil belum tertaut ke santri yang dapat diajukan izinnya' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'wali_santri'
     AND NOT public.guardian_can_access_student(p_tenant_id, p_actor_user_id, v_student.id) THEN
    RAISE EXCEPTION 'Santri tidak terhubung ke akun Wali ini' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'ustadz' AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, p_student_id) THEN
    RAISE EXCEPTION 'Santri berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-permit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.boarding_permits
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.requested_by_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.student_id IS DISTINCT FROM p_student_id
      OR v_existing.permit_type IS DISTINCT FROM p_permit_type
      OR v_existing.reason IS DISTINCT FROM btrim(p_reason)
      OR v_existing.start_date IS DISTINCT FROM p_start_date
      OR v_existing.end_date IS DISTINCT FROM p_end_date THEN
      RAISE EXCEPTION 'Kunci permintaan izin sudah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'permitId', v_existing.id);
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT name INTO v_room_name
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
  END IF;

  INSERT INTO public.boarding_permits (
    tenant_id, student_id, room_id, room_name_snapshot, permit_type, reason, start_date, end_date,
    status, requested_by_user_id, client_request_id
  ) VALUES (
    p_tenant_id, v_student.id, v_student.room_id, v_room_name, p_permit_type, btrim(p_reason), p_start_date, p_end_date,
    'Pending Musyrif', p_actor_user_id, p_client_request_id
  ) RETURNING id INTO v_permit_id;

  INSERT INTO public.boarding_permit_events (
    tenant_id, permit_id, client_request_id, actor_user_id, event_type, from_status, to_status
  ) VALUES (
    p_tenant_id, v_permit_id, p_client_request_id, p_actor_user_id, 'requested', NULL, 'Pending Musyrif'
  );
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'permitId', v_permit_id);
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
  IF v_role = 'santri' THEN
    IF v_linked_student_id IS NULL THEN RAISE EXCEPTION 'Profil belum tertaut ke santri' USING ERRCODE = '42501'; END IF;
    SELECT s.* INTO v_student FROM public.students s
    WHERE tenant_id = p_tenant_id AND lower(COALESCE(status, '')) NOT IN ('archived', 'inactive', 'nonaktif', 'tidak aktif')
      AND (id::text = v_linked_student_id OR source_record_id = v_linked_student_id)
      AND NOT EXISTS (SELECT 1 FROM public.students other_student
        WHERE other_student.tenant_id = p_tenant_id AND lower(COALESCE(other_student.status, '')) NOT IN ('archived', 'inactive', 'nonaktif', 'tidak aktif')
          AND (other_student.id::text = v_linked_student_id OR other_student.source_record_id = v_linked_student_id)
          AND other_student.id <> s.id)
    FOR UPDATE OF s;
    IF NOT FOUND OR v_student.room_id IS DISTINCT FROM p_room_id THEN
      RAISE EXCEPTION 'Tiket hanya dapat dibuat untuk kamar santri yang tertaut' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'wali_santri' AND NOT EXISTS (
    SELECT 1
    FROM public.students student
    WHERE student.tenant_id = p_tenant_id
      AND student.room_id = p_room_id
      AND lower(COALESCE(student.status, '')) IN ('active', 'aktif')
      AND public.guardian_can_access_student(p_tenant_id, p_actor_user_id, student.id)
  ) THEN
    RAISE EXCEPTION 'Tiket hanya dapat dibuat untuk kamar santri yang terhubung ke Wali' USING ERRCODE = '42501';
  ELSIF v_role = 'ustadz' AND NOT public.boarding_user_can_access_room(p_tenant_id, p_actor_user_id, p_room_id) THEN
    RAISE EXCEPTION 'Kamar berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('boarding-facility-ticket:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_existing FROM public.boarding_facility_tickets
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.room_id IS DISTINCT FROM p_room_id OR v_existing.issue IS DISTINCT FROM btrim(p_issue)
      OR v_existing.description IS DISTINCT FROM btrim(COALESCE(p_description, ''))
      OR v_existing.priority IS DISTINCT FROM p_priority OR v_existing.reported_by_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.reporter_name_snapshot IS DISTINCT FROM btrim(p_reporter_name) THEN
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

REVOKE ALL ON FUNCTION public.request_boarding_permit(UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_boarding_permit(UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_boarding_facility_ticket(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_boarding_facility_ticket(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;