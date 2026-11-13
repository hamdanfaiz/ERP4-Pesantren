-- Add a tenant-scoped monthly Tahfidz leaderboard from persisted Ziyadah records.
-- This migration is source-only until reviewed and applied through the approved release process.
BEGIN;

CREATE INDEX IF NOT EXISTS tahfidz_records_monthly_ziyadah_idx
  ON public.tahfidz_records (tenant_id, performed_at, student_id)
  WHERE activity_type = 'Ziyadah';

CREATE OR REPLACE FUNCTION public.get_tahfidz_monthly_leaderboard(
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
  v_entries JSONB := '[]'::JSONB;
  v_participant_count BIGINT := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_business_date IS NULL
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Parameter papan peringkat Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat melihat papan peringkat Tahfidz' USING ERRCODE = '42501';
  END IF;

  SELECT t.time_zone INTO v_time_zone
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND t.status = 'active';
  IF NOT FOUND OR v_time_zone IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS z WHERE z.name = v_time_zone) THEN
    RAISE EXCEPTION 'Tenant Tahfidz tidak aktif atau zona waktunya tidak valid' USING ERRCODE = '42501';
  END IF;

  -- Reuse the canonical tenant, profile, module-permission, and actor-role checks.
  PERFORM public.list_tahfidz_roster_page(
    p_tenant_id, p_actor_user_id, p_expected_role, p_business_date,
    NULL, NULL, 1, FALSE
  );

  v_period_start := date_trunc('month', p_business_date::TIMESTAMP)::DATE;

  WITH scoped_students AS (
    SELECT
      s.id AS student_id,
      s.name AS student_name,
      COALESCE(s.grade, '') AS grade,
      current_halaqah.halaqah_id,
      COALESCE(current_halaqah.halaqah_name, '') AS halaqah_name
    FROM public.students AS s
    LEFT JOIN LATERAL (
      SELECT h.id AS halaqah_id, h.name AS halaqah_name
      FROM public.tahfidz_memberships AS m
      JOIN public.tahfidz_halaqahs AS h
        ON h.tenant_id = m.tenant_id AND h.id = m.halaqah_id
      WHERE m.tenant_id = s.tenant_id
        AND m.student_id = s.id
        AND m.status = 'active'
        AND m.starts_on <= p_business_date
        AND (m.ends_on IS NULL OR m.ends_on >= p_business_date)
        AND h.status = 'active'
        AND (p_expected_role <> 'ustadz' OR h.ustadz_user_id = p_actor_user_id)
      ORDER BY m.starts_on DESC, m.id
      LIMIT 1
    ) AS current_halaqah ON TRUE
    WHERE s.tenant_id = p_tenant_id
      AND lower(btrim(s.status)) <> 'archived'
      AND (p_expected_role <> 'ustadz' OR current_halaqah.halaqah_id IS NOT NULL)
  ), monthly_metrics AS (
    SELECT
      student.student_id,
      student.student_name,
      student.grade,
      student.halaqah_name,
      count(record.id)::INTEGER AS setoran_count,
      count(DISTINCT (record.performed_at AT TIME ZONE v_time_zone)::DATE)::INTEGER AS active_days
    FROM scoped_students AS student
    JOIN public.tahfidz_records AS record
      ON record.tenant_id = p_tenant_id
      AND record.student_id = student.student_id
      AND record.activity_type = 'Ziyadah'
      AND record.performed_at >= (v_period_start::TIMESTAMP AT TIME ZONE v_time_zone)
      AND record.performed_at < ((p_business_date + 1)::TIMESTAMP AT TIME ZONE v_time_zone)
      AND (p_expected_role <> 'ustadz' OR EXISTS (
        SELECT 1
        FROM public.tahfidz_halaqahs AS assigned_halaqah
        WHERE assigned_halaqah.tenant_id = record.tenant_id
          AND assigned_halaqah.id = record.halaqah_id
          AND assigned_halaqah.ustadz_user_id = p_actor_user_id
          AND assigned_halaqah.status = 'active'
      ))
    GROUP BY student.student_id, student.student_name, student.grade, student.halaqah_name
  ), ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY setoran_count DESC, active_days DESC, student_name ASC, student_id ASC
      )::INTEGER AS position,
      student_id,
      student_name,
      grade,
      halaqah_name,
      setoran_count,
      active_days
    FROM monthly_metrics
  )
  SELECT
    count(*)::BIGINT,
    COALESCE(
      jsonb_agg(jsonb_build_object(
        'position', ranked.position,
        'studentId', ranked.student_id,
        'name', ranked.student_name,
        'grade', ranked.grade,
        'halaqah', ranked.halaqah_name,
        'setoranCount', ranked.setoran_count,
        'activeDays', ranked.active_days
      ) ORDER BY ranked.position) FILTER (WHERE ranked.position <= p_limit),
      '[]'::JSONB
    )
  INTO v_participant_count, v_entries
  FROM ranked;

  RETURN jsonb_build_object(
    'periodStart', v_period_start,
    'periodEnd', p_business_date,
    'metric', 'Ziyadah',
    'participants', v_participant_count,
    'entries', v_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tahfidz_monthly_leaderboard(UUID, UUID, TEXT, DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tahfidz_monthly_leaderboard(UUID, UUID, TEXT, DATE, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.get_tahfidz_monthly_leaderboard(UUID, UUID, TEXT, DATE, INTEGER) IS
  'Returns a small deterministic monthly Ziyadah ranking from tenant records; Admin/SuperAdmin see tenant scope and Ustadz sees assigned active halaqahs only.';

COMMIT;
