-- Reject an academic retry key reused for a different actor, record kind, or payload.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_academic_record(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_kind TEXT,
  p_record_id UUID,
  p_client_request_id UUID,
  p_record JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.academic_records%ROWTYPE;
  v_id UUID;
  v_teacher_id UUID;
  v_student_id UUID;
  v_text TEXT;
  v_teacher_name TEXT;
  v_student_name TEXT;
  v_student_class TEXT;
  v_num NUMERIC;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('schedule', 'journal', 'assessment')
    OR jsonb_typeof(COALESCE(p_record, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid academic record input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Academic tenant is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND (NOT (module_permissions ? 'academic') OR (module_permissions->>'academic')::BOOLEAN)
  FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Academic actor is not authorized' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_record->>'teacherUserId', '') <> '' AND p_record->>'teacherUserId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Teacher id is invalid' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_record->>'studentId', '') <> '' AND p_record->>'studentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Student id is invalid' USING ERRCODE = '22023';
  END IF;
  v_teacher_id := NULLIF(p_record->>'teacherUserId', '')::UUID;
  v_student_id := NULLIF(p_record->>'studentId', '')::UUID;
  IF v_teacher_id IS NOT NULL THEN
    SELECT display_name INTO v_teacher_name FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = v_teacher_id AND status = 'active' AND role = 'ustadz';
    IF v_teacher_name IS NULL OR p_record->>'teacherName' IS DISTINCT FROM v_teacher_name THEN
      RAISE EXCEPTION 'Assigned teacher is unavailable or name is stale' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF p_kind = 'schedule' THEN
    IF v_role = 'ustadz' THEN RAISE EXCEPTION 'Only tenant administrators can manage schedules' USING ERRCODE = '42501'; END IF;
    IF p_record->>'day' IS NULL OR p_record->>'day' NOT IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')
      OR v_teacher_id IS NULL
      OR COALESCE(length(btrim(p_record->>'time')), 0) = 0 OR length(p_record->>'time') > 40
      OR COALESCE(length(btrim(p_record->>'subject')), 0) = 0 OR length(p_record->>'subject') > 150
      OR COALESCE(length(btrim(p_record->>'className')), 0) = 0 OR length(p_record->>'className') > 100
      OR COALESCE(length(btrim(p_record->>'teacherName')), 0) = 0 OR length(p_record->>'teacherName') > 180 THEN
      RAISE EXCEPTION 'Schedule fields are incomplete or too long' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_num FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND name = btrim(p_record->>'className')
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    IF v_num <> 1 THEN RAISE EXCEPTION 'Academic class is unavailable or ambiguous' USING ERRCODE = '23503'; END IF;
    IF p_record->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9] - ([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR substring(p_record->>'time' from 1 for 5) >= substring(p_record->>'time' from 9 for 5) THEN
      RAISE EXCEPTION 'Schedule time interval is invalid' USING ERRCODE = '22023';
    END IF;
    IF v_teacher_id IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'academic-schedule:' || p_tenant_id::TEXT || ':' || (p_record->>'day'), 0));
      IF EXISTS (
        SELECT 1 FROM public.academic_records existing
        WHERE existing.tenant_id = p_tenant_id AND existing.kind = 'schedule'
          AND existing.record_data->>'day' = p_record->>'day'
          AND existing.deleted_at IS NULL AND (p_record_id IS NULL OR existing.id <> p_record_id)
          AND (
            existing.teacher_user_id = v_teacher_id
            OR (COALESCE(NULLIF(btrim(p_record->>'room'), ''), '') <> ''
              AND lower(COALESCE(existing.record_data->>'room', '')) = lower(btrim(p_record->>'room')))
            OR existing.record_data->>'className' = p_record->>'className'
          )
          AND substring(p_record->>'time' from 1 for 5) < substring(existing.record_data->>'time' from 9 for 5)
          AND substring(p_record->>'time' from 9 for 5) > substring(existing.record_data->>'time' from 1 for 5)
      ) THEN
        RAISE EXCEPTION 'Teacher, room, or class has an overlapping schedule on this day' USING ERRCODE = '23P01';
      END IF;
    END IF;
  ELSIF p_kind = 'journal' THEN
    IF COALESCE(length(btrim(p_record->>'date')), 0) = 0 OR COALESCE(length(btrim(p_record->>'className')), 0) = 0
      OR COALESCE(length(btrim(p_record->>'subject')), 0) = 0 OR COALESCE(length(btrim(p_record->>'topic')), 0) = 0
      OR length(p_record->>'topic') > 2000 OR length(COALESCE(p_record->>'competency', '')) > 4000
      OR COALESCE(length(btrim(p_record->>'teacherName')), 0) = 0 THEN
      RAISE EXCEPTION 'Journal fields are incomplete or too long' USING ERRCODE = '22023';
    END IF;
    BEGIN v_text := (p_record->>'date')::DATE::TEXT; EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Journal date is invalid' USING ERRCODE = '22023'; END;
    IF v_teacher_id IS NULL THEN RAISE EXCEPTION 'Journal teacher is required' USING ERRCODE = '22023'; END IF;
    IF v_role = 'ustadz' AND v_teacher_id <> p_actor_user_id THEN RAISE EXCEPTION 'Ustadz can only write their own journal' USING ERRCODE = '42501'; END IF;
    SELECT count(*) INTO v_num FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND name = btrim(p_record->>'className')
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    IF v_num <> 1 THEN RAISE EXCEPTION 'Academic class is unavailable or ambiguous' USING ERRCODE = '23503'; END IF;
    IF v_role = 'ustadz' AND NOT EXISTS (
      SELECT 1 FROM public.academic_records assigned
      WHERE assigned.tenant_id = p_tenant_id AND assigned.kind = 'schedule'
        AND assigned.teacher_user_id = p_actor_user_id AND assigned.record_data->>'className' = p_record->>'className'
        AND assigned.deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'Ustadz is not assigned to this class' USING ERRCODE = '42501'; END IF;
    IF jsonb_typeof(p_record->'attendance') IS DISTINCT FROM 'object'
      OR NOT (p_record->'attendance' ?& ARRAY['present', 'absent', 'excused']) THEN
      RAISE EXCEPTION 'Journal attendance summary is required' USING ERRCODE = '22023';
    END IF;
    FOREACH v_text IN ARRAY ARRAY['present', 'absent', 'excused'] LOOP
      BEGIN v_num := (p_record->'attendance'->>v_text)::NUMERIC; EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Journal attendance counts must be numeric' USING ERRCODE = '22023'; END;
      IF v_num < 0 OR v_num > 500 OR v_num <> trunc(v_num) THEN
        RAISE EXCEPTION 'Journal attendance counts are outside the allowed range' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSE
    IF v_student_id IS NULL OR (v_role = 'ustadz' AND v_teacher_id IS NULL)
      OR COALESCE(length(btrim(p_record->>'subject')), 0) = 0 OR length(p_record->>'subject') > 150
      OR COALESCE(length(btrim(p_record->>'assessmentType')), 0) = 0 OR length(p_record->>'assessmentType') > 100
      OR (p_record->>'category' IS DISTINCT FROM 'Formative' AND p_record->>'category' IS DISTINCT FROM 'Summative') THEN
      RAISE EXCEPTION 'Assessment fields are incomplete or invalid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      IF p_record->>'score' IS NULL OR (p_record->>'score')::NUMERIC < 0 OR (p_record->>'score')::NUMERIC > 100 THEN
        RAISE EXCEPTION 'Assessment score must be from 0 to 100' USING ERRCODE = '22023';
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Assessment score must be numeric' USING ERRCODE = '22023';
    END;
    SELECT student.name, COALESCE(NULLIF(class_record.name, ''), NULLIF(student.details->>'className', ''), NULLIF(student.grade, ''))
      INTO v_student_name, v_student_class
    FROM public.students AS student
    LEFT JOIN public.master_data_records AS class_record
      ON class_record.tenant_id = student.tenant_id AND class_record.id = student.class_id AND class_record.category = 'Kelas'
        AND lower(class_record.status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
    WHERE student.tenant_id = p_tenant_id AND student.id = v_student_id
      AND lower(student.status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan');
    IF v_student_name IS NULL THEN
      RAISE EXCEPTION 'Student is unavailable in this tenant' USING ERRCODE = 'P0002';
    END IF;
    IF p_record->>'studentName' IS DISTINCT FROM v_student_name THEN
      RAISE EXCEPTION 'Student name is stale' USING ERRCODE = '23503';
    END IF;
    IF v_student_class IS NOT NULL AND p_record->>'className' IS DISTINCT FROM v_student_class THEN
      RAISE EXCEPTION 'Student class is stale' USING ERRCODE = '23503';
    END IF;
    IF v_role = 'ustadz' AND (v_student_class IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.academic_records assigned
      WHERE assigned.tenant_id = p_tenant_id AND assigned.kind = 'schedule'
        AND assigned.teacher_user_id = p_actor_user_id AND assigned.record_data->>'className' = v_student_class
        AND assigned.deleted_at IS NULL
    )) THEN RAISE EXCEPTION 'Student is outside the teacher assignment' USING ERRCODE = '42501'; END IF;
    IF v_role = 'ustadz' AND v_teacher_id <> p_actor_user_id THEN RAISE EXCEPTION 'Ustadz can only write their own assessment' USING ERRCODE = '42501'; END IF;
  END IF;

  IF p_record_id IS NULL THEN
    IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Request idempotency key is required' USING ERRCODE = '22023'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'academic-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
    SELECT * INTO v_existing FROM public.academic_records
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
    IF FOUND THEN
      IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
        OR v_existing.kind IS DISTINCT FROM p_kind
        OR v_existing.teacher_user_id IS DISTINCT FROM v_teacher_id
        OR v_existing.student_id IS DISTINCT FROM v_student_id
        OR v_existing.record_data IS DISTINCT FROM p_record THEN
        RAISE EXCEPTION 'Academic request ID was already used for a different actor or payload'
          USING ERRCODE = '23505';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'alreadyApplied', true);
    END IF;
    INSERT INTO public.academic_records (tenant_id, kind, teacher_user_id, student_id, record_data,
      client_request_id, created_by, updated_by)
    VALUES (p_tenant_id, p_kind, v_teacher_id, v_student_id, p_record, p_client_request_id, p_actor_user_id, p_actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM public.academic_records
    WHERE tenant_id = p_tenant_id AND id = p_record_id AND kind = p_kind AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Academic record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_role = 'ustadz' AND v_existing.teacher_user_id <> p_actor_user_id THEN RAISE EXCEPTION 'Academic record is outside teacher scope' USING ERRCODE = '42501'; END IF;
    UPDATE public.academic_records SET teacher_user_id = v_teacher_id, student_id = v_student_id,
      record_data = p_record, updated_by = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_record_id
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'alreadyApplied', false);
END;
$$;

COMMENT ON FUNCTION public.save_academic_record(UUID, UUID, TEXT, UUID, UUID, JSONB) IS
  'Tenant-scoped academic writer with payload-aware idempotency for create retries.';

COMMIT;
