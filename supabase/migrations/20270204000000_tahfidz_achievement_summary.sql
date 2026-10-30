-- Calculate Tahfidz achievement summaries from tenant-scoped, persisted records.
-- No XP, rank, or user-editable badge state is stored.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_tahfidz_achievement_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_business_date DATE,
  p_after_student_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_time_zone TEXT;
  v_roster_page JSONB;
  v_students JSONB := '[]'::JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_business_date IS NULL
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Parameter ringkasan pencapaian Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.time_zone INTO v_time_zone
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND t.status = 'active';
  IF NOT FOUND OR v_time_zone IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS z WHERE z.name = v_time_zone) THEN
    RAISE EXCEPTION 'Tenant Tahfidz tidak aktif atau zona waktunya tidak valid' USING ERRCODE = '42501';
  END IF;

  -- Reuse the canonical roster authorization for Admin, Ustadz, Santri, and Wali.
  -- The supplied actor and role are checked against the active tenant profile there.
  v_roster_page := public.list_tahfidz_roster_page(
    p_tenant_id, p_actor_user_id, p_expected_role, p_business_date,
    p_after_student_id, NULL, p_page_size, FALSE
  );

  WITH scoped_students AS (
    SELECT
      (item.value->>'id')::UUID AS student_id,
      COALESCE(item.value->>'name', '') AS student_name,
      COALESCE(item.value->>'grade', '') AS student_grade,
      COALESCE(item.value->>'halaqah', '') AS halaqah_name
    FROM jsonb_array_elements(COALESCE(v_roster_page->'roster', '[]'::JSONB)) AS item(value)
  ), metrics AS (
    SELECT
      student.student_id,
      student.student_name,
      student.student_grade,
      student.halaqah_name,
      count(record.id)::INTEGER AS total_records,
      count(record.id) FILTER (WHERE record.activity_type = 'Ziyadah')::INTEGER AS ziyadah_records,
      count(record.id) FILTER (WHERE record.activity_type = 'Muroja''ah')::INTEGER AS murojaah_records,
      count(DISTINCT (record.performed_at AT TIME ZONE v_time_zone)::DATE)::INTEGER AS study_days
    FROM scoped_students AS student
    LEFT JOIN public.tahfidz_records AS record
      ON record.tenant_id = p_tenant_id AND record.student_id = student.student_id
      AND (record.performed_at AT TIME ZONE v_time_zone)::DATE <= p_business_date
    GROUP BY student.student_id, student.student_name, student.student_grade, student.halaqah_name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', metrics.student_id,
    'name', metrics.student_name,
    'grade', metrics.student_grade,
    'halaqah', metrics.halaqah_name,
    'totalRecords', metrics.total_records,
    'ziyadahRecords', metrics.ziyadah_records,
    'murojaahRecords', metrics.murojaah_records,
    'studyDays', metrics.study_days
  ) ORDER BY metrics.student_id), '[]'::JSONB)
  INTO v_students
  FROM metrics;

  RETURN jsonb_build_object(
    'students', v_students,
    'hasMore', COALESCE((v_roster_page->>'hasMore')::BOOLEAN, FALSE),
    'nextCursor', v_roster_page->'nextCursor'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tahfidz_achievement_page(UUID, UUID, TEXT, DATE, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tahfidz_achievement_page(UUID, UUID, TEXT, DATE, UUID, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.list_tahfidz_achievement_page(UUID, UUID, TEXT, DATE, UUID, INTEGER) IS
  'Returns record-derived Tahfidz metrics for a keyset-paged roster authorized by list_tahfidz_roster_page.';

COMMIT;
