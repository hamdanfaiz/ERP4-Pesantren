-- Tighten the Tahfidz write RPC so Ustadz can only record for their assigned halaqah.
-- Admin roles remain tenant-scoped; inactive or unprovisioned profiles cannot write.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_tahfidz_setoran(
  p_tenant_id UUID,
  p_student_id UUID,
  p_halaqah_id UUID,
  p_activity_type TEXT,
  p_surah_name TEXT,
  p_ayah_start INTEGER,
  p_ayah_end INTEGER,
  p_fluency_grade TEXT,
  p_tajweed_grade TEXT,
  p_notes TEXT,
  p_performed_at TIMESTAMPTZ,
  p_recorded_by_user_id UUID,
  p_recorded_by_name TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_record_id UUID;
  v_existing public.tahfidz_records%ROWTYPE;
  v_surah TEXT;
  v_recorder_id UUID;
  v_actor_role TEXT;
BEGIN
  v_surah := NULLIF(btrim(COALESCE(p_surah_name, '')), '');
  v_recorder_id := p_recorded_by_user_id;
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_halaqah_id IS NULL
    OR p_client_request_id IS NULL OR p_performed_at IS NULL OR p_ayah_start IS NULL OR p_ayah_end IS NULL
    OR p_ayah_start < 1 OR p_ayah_end < p_ayah_start
    OR p_activity_type NOT IN ('Ziyadah', 'Muroja''ah', 'Tasmi''', 'Tasmik')
    OR v_surah IS NULL OR length(v_surah) > 100
    OR v_recorder_id IS NULL
    OR length(COALESCE(p_notes, '')) > 2000
    OR length(COALESCE(p_recorded_by_name, '')) > 180 THEN
    RAISE EXCEPTION 'Data setoran Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_fluency_grade IS NOT NULL AND p_fluency_grade NOT IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A')
    OR p_tajweed_grade IS NOT NULL AND p_tajweed_grade NOT IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A') THEN
    RAISE EXCEPTION 'Nilai setoran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(role))
  INTO v_actor_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id
    AND user_id = v_recorder_id
    AND status = 'active';

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'superadmin', 'ustadz') THEN
    RAISE EXCEPTION 'Aktor tidak memiliki izin mencatat setoran Tahfidz' USING ERRCODE = '42501';
  END IF;
  IF v_actor_role = 'ustadz' AND NOT EXISTS (
    SELECT 1
    FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id
      AND id = p_halaqah_id
      AND ustadz_user_id = v_recorder_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Ustadz hanya dapat mencatat setoran pada halaqah tugasnya' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id AND lower(status) <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id AND id = p_halaqah_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan atau tidak aktif pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_memberships
    WHERE tenant_id = p_tenant_id
      AND student_id = p_student_id
      AND halaqah_id = p_halaqah_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Santri belum terdaftar pada halaqah ini' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.tahfidz_records (
    tenant_id, student_id, halaqah_id, activity_type, surah_name, ayah_start, ayah_end,
    fluency_grade, tajweed_grade, notes, performed_at, recorded_by_user_id,
    recorded_by_name, client_request_id
  ) VALUES (
    p_tenant_id, p_student_id, p_halaqah_id, p_activity_type, v_surah, p_ayah_start, p_ayah_end,
    p_fluency_grade, p_tajweed_grade, NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_performed_at, v_recorder_id,
    NULLIF(btrim(COALESCE(p_recorded_by_name, '')), ''), p_client_request_id
  )
  ON CONFLICT (tenant_id, client_request_id) DO NOTHING
  RETURNING id INTO v_record_id;

  IF v_record_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'alreadyRecorded', false, 'recordId', v_record_id);
  END IF;

  SELECT * INTO v_existing
  FROM public.tahfidz_records
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setoran belum dapat dipastikan tersimpan' USING ERRCODE = '40001';
  END IF;
  IF v_existing.student_id IS DISTINCT FROM p_student_id
    OR v_existing.halaqah_id IS DISTINCT FROM p_halaqah_id
    OR v_existing.activity_type IS DISTINCT FROM p_activity_type
    OR v_existing.surah_name IS DISTINCT FROM v_surah
    OR v_existing.ayah_start IS DISTINCT FROM p_ayah_start
    OR v_existing.ayah_end IS DISTINCT FROM p_ayah_end
    OR v_existing.fluency_grade IS DISTINCT FROM p_fluency_grade
    OR v_existing.tajweed_grade IS DISTINCT FROM p_tajweed_grade
    OR v_existing.notes IS DISTINCT FROM NULLIF(btrim(COALESCE(p_notes, '')), '')
    OR v_existing.performed_at IS DISTINCT FROM p_performed_at
    OR v_existing.recorded_by_user_id IS DISTINCT FROM v_recorder_id
    OR v_existing.recorded_by_name IS DISTINCT FROM NULLIF(btrim(COALESCE(p_recorded_by_name, '')), '') THEN
    RAISE EXCEPTION 'Kunci permintaan setoran telah digunakan untuk data berbeda' USING ERRCODE = '23505';
  END IF;
  RETURN jsonb_build_object('success', true, 'alreadyRecorded', true, 'recordId', v_existing.id);
END;
$$;

COMMIT;
