-- Prevent current boarding attendance from including inactive, alumni, graduated, or withdrawn students.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_boarding_attendance_status(
  p_tenant_id UUID,
  p_student_id UUID,
  p_attendance_date DATE,
  p_status TEXT,
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
  v_student public.students%ROWTYPE;
  v_session_id UUID;
  v_record public.boarding_attendance_records%ROWTYPE;
  v_record_id UUID;
  v_event public.boarding_attendance_events%ROWTYPE;
  v_room_name TEXT;
  v_event_type TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_attendance_date IS NULL
    OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_status NOT IN ('Hadir', 'Ghaib')
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Status kehadiran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL THEN RAISE EXCEPTION 'Status kehadiran wajib diisi' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat mengubah kehadiran pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
    AND lower(btrim(COALESCE(status, ''))) NOT IN
      ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'ustadz'
    AND NOT public.boarding_user_can_access_student(p_tenant_id, p_actor_user_id, p_student_id) THEN
    RAISE EXCEPTION 'Santri berada di luar penugasan petugas' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-attendance:' || p_tenant_id::text || ':' || p_attendance_date::text || ':nightly_curfew', 0
  ));
  SELECT * INTO v_event
  FROM public.boarding_attendance_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.student_id IS DISTINCT FROM p_student_id OR v_event.to_status IS DISTINCT FROM p_status
      OR v_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_event.event_type NOT IN ('marked', 'status_changed') THEN
      RAISE EXCEPTION 'Kunci permintaan kehadiran digunakan untuk tindakan berbeda' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.boarding_attendance_sessions
      WHERE tenant_id = p_tenant_id AND id = v_event.session_id AND attendance_date = p_attendance_date
    ) THEN
      RAISE EXCEPTION 'Kunci permintaan kehadiran digunakan pada tanggal berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'alreadyApplied', true, 'recordId', v_event.record_id, 'status', v_event.to_status
    );
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT name INTO v_room_name
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND id = v_student.room_id AND category = 'Kamar';
  END IF;

  INSERT INTO public.boarding_attendance_sessions(tenant_id, attendance_date, session_type, created_by_user_id)
  VALUES (p_tenant_id, p_attendance_date, 'nightly_curfew', p_actor_user_id)
  ON CONFLICT (tenant_id, attendance_date, session_type)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_session_id;

  SELECT * INTO v_record
  FROM public.boarding_attendance_records
  WHERE tenant_id = p_tenant_id AND session_id = v_session_id AND student_id = p_student_id
  FOR UPDATE;
  IF FOUND THEN
    v_event_type := CASE WHEN v_record.status = p_status THEN 'marked' ELSE 'status_changed' END;
    UPDATE public.boarding_attendance_records
    SET status = p_status, room_id = v_student.room_id,
      room_name_snapshot = COALESCE(v_room_name, room_name_snapshot),
      marked_by_user_id = p_actor_user_id, marked_at = now(), updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_record.id
    RETURNING id INTO v_record_id;
  ELSE
    v_event_type := 'marked';
    INSERT INTO public.boarding_attendance_records(
      tenant_id, session_id, student_id, room_id, room_name_snapshot, status, marked_by_user_id
    ) VALUES (
      p_tenant_id, v_session_id, p_student_id, v_student.room_id, v_room_name, p_status, p_actor_user_id
    )
    RETURNING id INTO v_record_id;
  END IF;

  INSERT INTO public.boarding_attendance_events(
    tenant_id, record_id, session_id, student_id, client_request_id, actor_user_id, event_type, from_status, to_status
  ) VALUES (
    p_tenant_id, v_record_id, v_session_id, p_student_id, p_client_request_id, p_actor_user_id,
    v_event_type, CASE WHEN v_record.id IS NULL THEN NULL ELSE v_record.status END, p_status
  );
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'recordId', v_record_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_boarding_attendance_status(UUID, UUID, DATE, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_boarding_attendance_status(UUID, UUID, DATE, TEXT, UUID, TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION public.set_boarding_attendance_status(UUID, UUID, DATE, TEXT, UUID, TEXT, UUID) IS
  'Tenant-scoped nightly attendance RPC; only operationally active students can be marked.';
COMMIT;
