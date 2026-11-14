-- Keep the Tahfidz leaderboard visible in the Supabase runtime and derive it
-- from tenant-scoped setoran records, never from presentation constants.
BEGIN;

-- The monthly leaderboard scans only Ziyadah records for a tenant/date range.
-- Keep the supporting index narrow and covering so growth in Murojaah and
-- other activity types does not inflate this read path.
CREATE INDEX IF NOT EXISTS tahfidz_records_ziyadah_leaderboard_idx
  ON public.tahfidz_records (tenant_id, performed_at)
  INCLUDE (halaqah_id, student_id, ayah_start, ayah_end)
  WHERE activity_type = 'Ziyadah';

CREATE OR REPLACE FUNCTION public.list_tahfidz_leaderboard(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_business_date DATE,
  p_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_time_zone TEXT;
  v_period_start DATE;
  v_scope_check JSONB;
  v_students JSONB := '[]'::JSONB;
  v_has_more BOOLEAN := FALSE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_business_date IS NULL
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Parameter leaderboard Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat membaca leaderboard Tahfidz' USING ERRCODE = '42501';
  END IF;

  SELECT t.time_zone INTO v_time_zone
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND t.status = 'active';
  IF NOT FOUND OR v_time_zone IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS z WHERE z.name = v_time_zone) THEN
    RAISE EXCEPTION 'Tenant Tahfidz tidak aktif atau zona waktunya tidak valid' USING ERRCODE = '42501';
  END IF;

  -- Reuse the canonical profile, tenant, role, and module-permission guard.
  -- The leaderboard is only available to staff; learner and guardian accounts
  -- must not receive other students' names or activity totals.
  v_scope_check := public.list_tahfidz_roster_page(
    p_tenant_id, p_actor_user_id, p_expected_role, p_business_date,
    NULL, NULL, 1, FALSE
  );

  v_period_start := date_trunc('month', p_business_date::TIMESTAMP)::DATE;

  WITH eligible_students AS (
    SELECT
      student.id,
      COALESCE(student.name, '') AS student_name,
      COALESCE(student.grade, '') AS student_grade,
      membership.halaqah_id,
      membership.halaqah_name
    FROM public.students AS student
    LEFT JOIN LATERAL (
      SELECT halaqah.name AS halaqah_name, halaqah.id AS halaqah_id
      FROM public.tahfidz_memberships AS membership
      JOIN public.tahfidz_halaqahs AS halaqah
        ON halaqah.tenant_id = membership.tenant_id
        AND halaqah.id = membership.halaqah_id
      WHERE membership.tenant_id = p_tenant_id
        AND membership.student_id = student.id
        AND membership.status = 'active'
        AND membership.starts_on <= p_business_date
        AND (membership.ends_on IS NULL OR membership.ends_on >= p_business_date)
        AND halaqah.status = 'active'
        AND (p_expected_role <> 'ustadz' OR halaqah.ustadz_user_id = p_actor_user_id)
      ORDER BY membership.starts_on DESC, membership.id
      LIMIT 1
    ) AS membership ON TRUE
    WHERE student.tenant_id = p_tenant_id
      AND lower(btrim(student.status)) <> 'archived'
      AND (p_expected_role <> 'ustadz' OR membership.halaqah_id IS NOT NULL)
  ), monthly_scores AS (
    SELECT
      student.id,
      student.student_name,
      student.student_grade,
      COALESCE(student.halaqah_name, '') AS halaqah_name,
      count(record.id) FILTER (WHERE record.activity_type = 'Ziyadah')::INTEGER AS ziyadah_records,
      COALESCE(sum(record.ayah_end - record.ayah_start + 1)
        FILTER (WHERE record.activity_type = 'Ziyadah'), 0)::INTEGER AS ziyadah_ayahs
    FROM eligible_students AS student
    LEFT JOIN public.tahfidz_records AS record
      ON record.tenant_id = p_tenant_id
      AND record.student_id = student.id
      AND (p_expected_role <> 'ustadz' OR record.halaqah_id = student.halaqah_id)
      AND record.performed_at >= (v_period_start::TIMESTAMP AT TIME ZONE v_time_zone)
      AND record.performed_at < ((p_business_date + 1)::TIMESTAMP AT TIME ZONE v_time_zone)
    GROUP BY student.id, student.student_name, student.student_grade, student.halaqah_name
    HAVING count(record.id) FILTER (WHERE record.activity_type = 'Ziyadah') > 0
  ), ranked AS (
    SELECT
      monthly_scores.*,
      row_number() OVER (
        ORDER BY ziyadah_records DESC, ziyadah_ayahs DESC, student_name, id
      )::INTEGER AS position
    FROM monthly_scores
  ), limited AS (
    SELECT * FROM ranked ORDER BY position LIMIT p_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'rank', limited.position,
      'id', limited.id,
      'name', limited.student_name,
      'grade', limited.student_grade,
      'halaqah', limited.halaqah_name,
      'ziyadahRecords', limited.ziyadah_records,
      'ziyadahAyahs', limited.ziyadah_ayahs
    ) ORDER BY limited.position) FILTER (WHERE limited.position <= p_limit), '[]'::JSONB),
    COALESCE(bool_or(limited.position > p_limit), FALSE)
  INTO v_students, v_has_more
  FROM limited;

  RETURN jsonb_build_object(
    'periodStart', v_period_start,
    'businessDate', p_business_date,
    'students', v_students,
    'hasMore', v_has_more
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER) IS
  'Returns a tenant- and halaqah-scoped monthly Ziyadah leaderboard from persisted setoran records. Service-only API; reuses the canonical Tahfidz roster authorization guard.';

COMMIT;
