-- Rank Tahfidz by unique Ziyadah ayat recorded, with tenant and halaqah scope.
-- The progress table is a private projection maintained atomically with saved records.
BEGIN;
LOCK TABLE public.tahfidz_records IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.tahfidz_student_ayah_progress (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  halaqah_id UUID NOT NULL,
  surah_number SMALLINT NOT NULL REFERENCES public.quran_surahs(surah_number) ON DELETE RESTRICT,
  ayah_number SMALLINT NOT NULL CHECK (ayah_number BETWEEN 1 AND 286),
  first_performed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, student_id, halaqah_id, surah_number, ayah_number),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, halaqah_id) REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX tahfidz_student_ayah_progress_leaderboard_idx
  ON public.tahfidz_student_ayah_progress (tenant_id, student_id, first_performed_at)
  INCLUDE (halaqah_id, surah_number, ayah_number);

REVOKE ALL ON TABLE public.tahfidz_student_ayah_progress FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.tahfidz_student_ayah_progress IS
  'Private deduplicated projection of saved Ziyadah ayat by tenant, student and halaqah. Read only inside trusted Tahfidz server routines.';

CREATE OR REPLACE FUNCTION public.sync_tahfidz_student_ayah_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ayah_count SMALLINT;
BEGIN
  IF NEW.activity_type <> 'Ziyadah' THEN RETURN NEW; END IF;
  SELECT catalog.ayah_count INTO v_ayah_count
  FROM public.quran_surahs AS catalog WHERE catalog.surah_number = NEW.surah_number;
  IF NOT FOUND OR NEW.ayah_start < 1 OR NEW.ayah_end < NEW.ayah_start OR NEW.ayah_end > v_ayah_count THEN
    RAISE EXCEPTION 'Setoran Ziyadah tidak terhubung ke rentang ayat yang valid' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_catalog.set_config('app.tahfidz_progress_tenant_id', NEW.tenant_id::TEXT, TRUE);

  INSERT INTO public.tahfidz_student_ayah_progress (
    tenant_id, student_id, halaqah_id, surah_number, ayah_number, first_performed_at
  )
  SELECT NEW.tenant_id, NEW.student_id, NEW.halaqah_id, NEW.surah_number,
    generated.ayah_number::SMALLINT, NEW.performed_at
  FROM pg_catalog.generate_series(NEW.ayah_start, NEW.ayah_end) AS generated(ayah_number)
  ON CONFLICT (tenant_id, student_id, halaqah_id, surah_number, ayah_number)
  DO UPDATE SET first_performed_at = LEAST(
    tahfidz_student_ayah_progress.first_performed_at, EXCLUDED.first_performed_at
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tahfidz_student_ayah_progress() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER tahfidz_records_sync_student_ayah_progress
  AFTER INSERT ON public.tahfidz_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_tahfidz_student_ayah_progress();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tahfidz_records AS record
    LEFT JOIN public.quran_surahs AS catalog ON catalog.surah_number = record.surah_number
    WHERE record.activity_type = 'Ziyadah'
      AND (catalog.surah_number IS NULL OR record.ayah_start < 1
        OR record.ayah_end < record.ayah_start OR record.ayah_end > catalog.ayah_count)
  ) THEN
    RAISE EXCEPTION
      'Backfill leaderboard Tahfidz dihentikan: ada setoran Ziyadah lama yang belum memiliki relasi Surah dan rentang ayat valid. Rekonsiliasi data sebelum menerapkan migrasi ini.';
  END IF;
END;
$$;

INSERT INTO public.tahfidz_student_ayah_progress (
  tenant_id, student_id, halaqah_id, surah_number, ayah_number, first_performed_at
)
SELECT record.tenant_id, record.student_id, record.halaqah_id, record.surah_number,
  ayah.ayah_number::SMALLINT, MIN(record.performed_at)
FROM public.tahfidz_records AS record
CROSS JOIN LATERAL pg_catalog.generate_series(record.ayah_start, record.ayah_end) AS ayah(ayah_number)
WHERE record.activity_type = 'Ziyadah'
GROUP BY record.tenant_id, record.student_id, record.halaqah_id, record.surah_number, ayah.ayah_number
ON CONFLICT (tenant_id, student_id, halaqah_id, surah_number, ayah_number)
DO UPDATE SET first_performed_at = LEAST(
  tahfidz_student_ayah_progress.first_performed_at, EXCLUDED.first_performed_at
);

ALTER TABLE public.tahfidz_student_ayah_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_student_ayah_progress FORCE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  EXECUTE format(
    'CREATE POLICY tahfidz_student_ayah_progress_owner_all ON public.tahfidz_student_ayah_progress FOR ALL TO %I USING (tenant_id = NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID) WITH CHECK (tenant_id = NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID)',
    current_user, 'app.tahfidz_progress_tenant_id', '',
    'app.tahfidz_progress_tenant_id', ''
  );
END
$policy$;

CREATE OR REPLACE FUNCTION public.list_tahfidz_leaderboard(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_business_date DATE, p_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_time_zone TEXT;
  v_business_cutoff TIMESTAMPTZ;
  v_scope_check JSONB;
  v_students JSONB := '[]'::JSONB;
  v_has_more BOOLEAN := FALSE;
  v_participants BIGINT := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_business_date IS NULL
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Parameter leaderboard Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Role tidak dapat membaca leaderboard Tahfidz' USING ERRCODE = '42501';
  END IF;

  SELECT t.time_zone INTO v_time_zone FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND t.status = 'active';
  IF NOT FOUND OR v_time_zone IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS z WHERE z.name = v_time_zone) THEN
    RAISE EXCEPTION 'Tenant Tahfidz tidak aktif atau zona waktunya tidak valid' USING ERRCODE = '42501';
  END IF;

  v_scope_check := public.list_tahfidz_roster_page(
    p_tenant_id, p_actor_user_id, p_expected_role, p_business_date, NULL, NULL, 1, FALSE
  );
  PERFORM pg_catalog.set_config('app.tahfidz_progress_tenant_id', p_tenant_id::TEXT, TRUE);
  v_business_cutoff := ((p_business_date + 1)::TIMESTAMP AT TIME ZONE v_time_zone);

  WITH eligible_students AS (
    SELECT student.id, COALESCE(student.name, '') AS student_name,
      COALESCE(student.grade, '') AS student_grade, membership.halaqah_id, membership.halaqah_name
    FROM public.students AS student
    LEFT JOIN LATERAL (
      SELECT halaqah.name AS halaqah_name, halaqah.id AS halaqah_id
      FROM public.tahfidz_memberships AS membership
      JOIN public.tahfidz_halaqahs AS halaqah
        ON halaqah.tenant_id = membership.tenant_id AND halaqah.id = membership.halaqah_id
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
  ), record_scores AS (
    SELECT student.id, count(record.id)::INTEGER AS ziyadah_records,
      count(DISTINCT (record.performed_at AT TIME ZONE v_time_zone)::DATE)::INTEGER AS ziyadah_active_days
    FROM eligible_students AS student
    JOIN public.tahfidz_records AS record
      ON record.tenant_id = p_tenant_id AND record.student_id = student.id
      AND record.activity_type = 'Ziyadah' AND record.performed_at < v_business_cutoff
      AND (p_expected_role <> 'ustadz' OR record.halaqah_id = student.halaqah_id)
    GROUP BY student.id
  ), ayah_scores AS (
    SELECT student.id,
      count(DISTINCT (progress.surah_number, progress.ayah_number))::INTEGER AS unique_memorized_ayahs
    FROM eligible_students AS student
    JOIN public.tahfidz_student_ayah_progress AS progress
      ON progress.tenant_id = p_tenant_id AND progress.student_id = student.id
      AND progress.first_performed_at < v_business_cutoff
      AND (p_expected_role <> 'ustadz' OR progress.halaqah_id = student.halaqah_id)
    GROUP BY student.id
  ), lifetime_scores AS (
    SELECT student.id, student.student_name, student.student_grade,
      COALESCE(student.halaqah_name, '') AS halaqah_name, record.ziyadah_records,
      COALESCE(ayah.unique_memorized_ayahs, 0)::INTEGER AS unique_memorized_ayahs,
      record.ziyadah_active_days
    FROM eligible_students AS student
    JOIN record_scores AS record ON record.id = student.id
    LEFT JOIN ayah_scores AS ayah ON ayah.id = student.id
  ), ranked AS (
    SELECT lifetime_scores.*,
      row_number() OVER (ORDER BY unique_memorized_ayahs DESC, ziyadah_records DESC,
        ziyadah_active_days DESC, student_name, id)::INTEGER AS position,
      count(*) OVER () AS participant_count
    FROM lifetime_scores
  ), limited AS (
    SELECT * FROM ranked ORDER BY position LIMIT p_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'rank', limited.position, 'id', limited.id, 'name', limited.student_name,
      'grade', limited.student_grade, 'halaqah', limited.halaqah_name,
      'uniqueMemorizedAyahs', limited.unique_memorized_ayahs,
      'ziyadahRecords', limited.ziyadah_records, 'ziyadahActiveDays', limited.ziyadah_active_days
    ) ORDER BY limited.position) FILTER (WHERE limited.position <= p_limit), '[]'::JSONB),
    COALESCE(bool_or(limited.position > p_limit), FALSE),
    COALESCE(max(limited.participant_count), 0)
  INTO v_students, v_has_more, v_participants
  FROM limited;

  RETURN jsonb_build_object(
    'businessDate', p_business_date, 'students', v_students,
    'hasMore', v_has_more, 'participants', v_participants
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER) TO service_role;
COMMENT ON FUNCTION public.list_tahfidz_leaderboard(UUID, UUID, TEXT, DATE, INTEGER) IS
  'Returns a tenant- and halaqah-scoped lifetime Tahfidz ranking by distinct Ziyadah ayat recorded, then setoran and active days. Service-only API; reuses the canonical roster authorization guard.';
COMMIT;
