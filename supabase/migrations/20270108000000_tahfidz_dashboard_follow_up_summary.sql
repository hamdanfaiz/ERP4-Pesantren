-- Return an exact, prioritized dashboard follow-up queue for the authorized tenant scope.
-- Staged migration; do not apply to a production project without release approval.
BEGIN;

CREATE INDEX IF NOT EXISTS tahfidz_records_latest_student_idx
  ON public.tahfidz_records (tenant_id, student_id, performed_at DESC, id DESC)
  INCLUDE (fluency_grade, tajweed_grade);
CREATE OR REPLACE FUNCTION public.list_tahfidz_roster_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_business_date DATE,
  p_after_student_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_page_size INTEGER DEFAULT 100,
  p_include_support BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_linked_santri_id TEXT;
  v_guardian_id UUID;
  v_guardian_count INTEGER;
  v_link_count INTEGER;
  v_search TEXT;
  v_roster JSONB := '[]'::JSONB;
  v_has_more BOOLEAN := FALSE;
  v_next_student_id UUID;
  v_student_count BIGINT;
  v_students_with_target BIGINT;
  v_students_without_halaqah BIGINT;
  v_halaqah_counts JSONB := '{}'::JSONB;
  v_follow_up_count BIGINT := 0;
  v_follow_up_rows JSONB := '[]'::JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_business_date IS NULL
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR (p_after_student_id IS NOT NULL AND p_after_student_id::TEXT !~* '^[0-9a-f-]{36}$') THEN
    RAISE EXCEPTION 'Parameter halaman roster Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_expected_role NOT IN ('admin', 'super_admin', 'ustadz', 'santri', 'wali_santri') THEN
    RAISE EXCEPTION 'Role tidak dapat membaca roster Tahfidz' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_profile
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id
  WHERE p.tenant_id = p_tenant_id
    AND p.user_id = p_actor_user_id
    AND p.status = 'active'
    AND p.role = p_expected_role
    AND t.status = 'active';
  IF NOT FOUND OR (p_expected_role <> 'super_admin' AND v_profile.module_permissions ? 'tahfidz'
    AND COALESCE(v_profile.module_permissions->>'tahfidz', 'false') <> 'true') THEN
    RAISE EXCEPTION 'Profil tenant atau izin Tahfidz tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_search := lower(trim(COALESCE(p_search, '')));
  IF length(v_search) > 80 THEN
    RAISE EXCEPTION 'Pencarian roster Tahfidz terlalu panjang' USING ERRCODE = '22023';
  END IF;
  -- Treat wildcard and escape characters as literal input in the prefix search.
  v_search := replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  IF v_search = '' THEN v_search := NULL; END IF;

  IF p_expected_role = 'santri' THEN
    v_linked_santri_id := NULLIF(trim(v_profile.linked_santri_id), '');
    IF v_linked_santri_id IS NULL THEN
      RAISE EXCEPTION 'Profil Santri belum tertaut' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_link_count
    FROM public.students AS s
    WHERE s.tenant_id = p_tenant_id
      AND lower(btrim(s.status)) <> 'archived'
      AND (s.id::TEXT = v_linked_santri_id OR s.source_record_id = v_linked_santri_id);
    IF v_link_count <> 1 THEN
      RAISE EXCEPTION 'Tautan profil Santri tidak valid atau tidak unik' USING ERRCODE = '42501';
    END IF;
  ELSIF p_expected_role = 'wali_santri' THEN
    SELECT count(DISTINCT account.guardian_id), (array_agg(DISTINCT account.guardian_id))[1]
      INTO v_guardian_count, v_guardian_id
    FROM public.guardian_user_accounts AS account
    JOIN public.guardians AS guardian
      ON guardian.tenant_id = account.tenant_id AND guardian.id = account.guardian_id
    WHERE account.tenant_id = p_tenant_id
      AND account.user_id = p_actor_user_id
      AND account.status = 'active'
      AND lower(guardian.status) IN ('active', 'aktif');
    IF v_guardian_count <> 1 OR v_guardian_id IS NULL THEN
      RAISE EXCEPTION 'Akun Wali tidak tertaut ke satu data Wali aktif' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH scoped AS (
    SELECT
      s.id,
      s.nis,
      s.name,
      s.gender,
      s.grade,
      s.class_id,
      s.status AS student_status,
      membership.halaqah_id,
      membership.halaqah_name,
      target.period_start AS target_period_start,
      target.period_end AS target_period_end,
      target.ziyadah_pages_per_day,
      target.murojaah_pages_per_day,
      target.target_policy
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
    ) AS membership ON TRUE
    LEFT JOIN LATERAL (
      SELECT t.period_start, t.period_end, t.ziyadah_pages_per_day,
        t.murojaah_pages_per_day, t.target_policy
      FROM public.tahfidz_targets AS t
      WHERE t.tenant_id = s.tenant_id
        AND t.student_id = s.id
        AND t.status = 'active'
        AND t.period_start <= p_business_date
        AND (t.period_end IS NULL OR t.period_end >= p_business_date)
      ORDER BY t.period_start DESC, t.id DESC
      LIMIT 1
    ) AS target ON TRUE
    WHERE s.tenant_id = p_tenant_id
      AND lower(btrim(s.status)) <> 'archived'
      AND CASE p_expected_role
        WHEN 'ustadz' THEN membership.halaqah_id IS NOT NULL
        WHEN 'santri' THEN (s.id::TEXT = v_linked_santri_id OR s.source_record_id = v_linked_santri_id)
        WHEN 'wali_santri' THEN EXISTS (
          SELECT 1 FROM public.guardian_students AS gs
          WHERE gs.tenant_id = p_tenant_id
            AND gs.guardian_id = v_guardian_id
            AND gs.student_id = s.id
        )
        ELSE TRUE
      END
      AND (v_search IS NULL
        OR lower(s.name) LIKE v_search || '%' ESCAPE E'\\'
        OR lower(s.nis) LIKE v_search || '%' ESCAPE E'\\')
  ),
  page AS (
    SELECT * FROM scoped
    WHERE p_after_student_id IS NULL OR id > p_after_student_id
    ORDER BY id
    LIMIT p_page_size + 1
  ),
  numbered AS (
    SELECT page.*, row_number() OVER (ORDER BY id) AS ordinal FROM page
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'nis', COALESCE(nis, ''),
      'name', COALESCE(name, ''),
      'gender', gender,
      'grade', COALESCE(grade, ''),
      'classId', class_id,
      'studentStatus', student_status,
      'halaqahId', halaqah_id,
      'halaqah', COALESCE(halaqah_name, ''),
      'target', CASE WHEN target_period_start IS NULL THEN NULL ELSE jsonb_build_object(
        'periodStart', target_period_start,
        'periodEnd', target_period_end,
        'ziyadahPagesPerDay', ziyadah_pages_per_day,
        'murojaahPagesPerDay', murojaah_pages_per_day,
        'policy', target_policy
      ) END
    ) ORDER BY id) FILTER (WHERE ordinal <= p_page_size), '[]'::JSONB),
    (array_agg(id ORDER BY ordinal) FILTER (WHERE ordinal = p_page_size))[1],
    COALESCE(bool_or(ordinal > p_page_size), FALSE)
  INTO v_roster, v_next_student_id, v_has_more
  FROM numbered;

  IF p_include_support THEN
    WITH scoped AS (
      SELECT s.id, membership.halaqah_id, target.period_start AS target_period_start
      FROM public.students AS s
      LEFT JOIN LATERAL (
        SELECT h.id AS halaqah_id
        FROM public.tahfidz_memberships AS m
        JOIN public.tahfidz_halaqahs AS h
          ON h.tenant_id = m.tenant_id AND h.id = m.halaqah_id
        WHERE m.tenant_id = s.tenant_id AND m.student_id = s.id
          AND m.status = 'active' AND m.starts_on <= p_business_date
          AND (m.ends_on IS NULL OR m.ends_on >= p_business_date)
          AND h.status = 'active'
          AND (p_expected_role <> 'ustadz' OR h.ustadz_user_id = p_actor_user_id)
        ORDER BY m.starts_on DESC, m.id LIMIT 1
      ) AS membership ON TRUE
      LEFT JOIN LATERAL (
        SELECT t.period_start
        FROM public.tahfidz_targets AS t
        WHERE t.tenant_id = s.tenant_id AND t.student_id = s.id
          AND t.status = 'active' AND t.period_start <= p_business_date
          AND (t.period_end IS NULL OR t.period_end >= p_business_date)
        ORDER BY t.period_start DESC, t.id DESC LIMIT 1
      ) AS target ON TRUE
      WHERE s.tenant_id = p_tenant_id AND lower(btrim(s.status)) <> 'archived'
        AND CASE p_expected_role
          WHEN 'ustadz' THEN membership.halaqah_id IS NOT NULL
          WHEN 'santri' THEN (s.id::TEXT = v_linked_santri_id OR s.source_record_id = v_linked_santri_id)
          WHEN 'wali_santri' THEN EXISTS (
            SELECT 1 FROM public.guardian_students AS gs
            WHERE gs.tenant_id = p_tenant_id AND gs.guardian_id = v_guardian_id AND gs.student_id = s.id
          )
          ELSE TRUE
        END
    )
    SELECT count(*), count(*) FILTER (WHERE target_period_start IS NOT NULL),
      count(*) FILTER (WHERE halaqah_id IS NULL)
    INTO v_student_count, v_students_with_target, v_students_without_halaqah
    FROM scoped;

    SELECT COALESCE(jsonb_object_agg(summary.halaqah_id::TEXT, summary.student_count), '{}'::JSONB)
    INTO v_halaqah_counts
    FROM (
      SELECT h.id AS halaqah_id, count(s.id)::INTEGER AS student_count
      FROM public.tahfidz_halaqahs AS h
      LEFT JOIN public.tahfidz_memberships AS m
        ON m.tenant_id = h.tenant_id AND m.halaqah_id = h.id
        AND m.status = 'active' AND m.starts_on <= p_business_date
        AND (m.ends_on IS NULL OR m.ends_on >= p_business_date)
      LEFT JOIN public.students AS s
        ON s.tenant_id = m.tenant_id AND s.id = m.student_id AND lower(btrim(s.status)) <> 'archived'
        AND (p_expected_role NOT IN ('santri', 'wali_santri') OR (
          p_expected_role = 'santri' AND (s.id::TEXT = v_linked_santri_id OR s.source_record_id = v_linked_santri_id)
        ) OR (
          p_expected_role = 'wali_santri' AND EXISTS (
            SELECT 1 FROM public.guardian_students AS gs
            WHERE gs.tenant_id = p_tenant_id AND gs.guardian_id = v_guardian_id AND gs.student_id = s.id
          )
        ))
      WHERE h.tenant_id = p_tenant_id AND h.status = 'active'
        AND (p_expected_role <> 'ustadz' OR h.ustadz_user_id = p_actor_user_id)
        AND (p_expected_role NOT IN ('santri', 'wali_santri') OR s.id IS NOT NULL)
      GROUP BY h.id
    ) AS summary;

    WITH scoped AS (
      SELECT s.id, s.nis, s.name, membership.halaqah_id, membership.halaqah_name,
        target.period_start AS target_period_start,
        latest.fluency_grade, latest.tajweed_grade, latest.performed_at AS latest_performed_at
      FROM public.students AS s
      LEFT JOIN LATERAL (
        SELECT h.id AS halaqah_id, h.name AS halaqah_name
        FROM public.tahfidz_memberships AS m
        JOIN public.tahfidz_halaqahs AS h
          ON h.tenant_id = m.tenant_id AND h.id = m.halaqah_id
        WHERE m.tenant_id = s.tenant_id AND m.student_id = s.id
          AND m.status = 'active' AND m.starts_on <= p_business_date
          AND (m.ends_on IS NULL OR m.ends_on >= p_business_date)
          AND h.status = 'active'
          AND (p_expected_role <> 'ustadz' OR h.ustadz_user_id = p_actor_user_id)
        ORDER BY m.starts_on DESC, m.id LIMIT 1
      ) AS membership ON TRUE
      LEFT JOIN LATERAL (
        SELECT t.period_start
        FROM public.tahfidz_targets AS t
        WHERE t.tenant_id = s.tenant_id AND t.student_id = s.id
          AND t.status = 'active' AND t.period_start <= p_business_date
          AND (t.period_end IS NULL OR t.period_end >= p_business_date)
        ORDER BY t.period_start DESC, t.id DESC LIMIT 1
      ) AS target ON TRUE
      LEFT JOIN LATERAL (
        SELECT r.fluency_grade, r.tajweed_grade, r.performed_at
        FROM public.tahfidz_records AS r
        WHERE r.tenant_id = s.tenant_id AND r.student_id = s.id
        ORDER BY r.performed_at DESC, r.id DESC
        LIMIT 1
      ) AS latest ON TRUE
      WHERE s.tenant_id = p_tenant_id AND lower(btrim(s.status)) <> 'archived'
        AND CASE p_expected_role
          WHEN 'ustadz' THEN membership.halaqah_id IS NOT NULL
          WHEN 'santri' THEN (s.id::TEXT = v_linked_santri_id OR s.source_record_id = v_linked_santri_id)
          WHEN 'wali_santri' THEN EXISTS (
            SELECT 1 FROM public.guardian_students AS gs
            WHERE gs.tenant_id = p_tenant_id AND gs.guardian_id = v_guardian_id AND gs.student_id = s.id
          )
          ELSE TRUE
        END
    ),
    candidates AS (
      SELECT scoped.*,
        array_remove(ARRAY[
          CASE WHEN halaqah_id IS NULL THEN 'Belum ditempatkan pada halaqah'::TEXT END,
          CASE WHEN target_period_start IS NULL THEN 'Target harian belum ditetapkan'::TEXT END,
          CASE WHEN fluency_grade = 'D' THEN 'Kelancaran perlu diulang'::TEXT END,
          CASE WHEN tajweed_grade = 'D' THEN 'Tajwid perlu diperbaiki'::TEXT END
        ], NULL) AS reasons
      FROM scoped
    ),
    ranked AS (
      SELECT candidates.*,
        count(*) OVER () AS total_count,
        row_number() OVER (
          ORDER BY cardinality(reasons) DESC,
            (CASE WHEN fluency_grade = 'D' THEN 1 ELSE 0 END + CASE WHEN tajweed_grade = 'D' THEN 1 ELSE 0 END) DESC,
            latest_performed_at ASC NULLS FIRST, id
        ) AS ordinal
      FROM candidates
      WHERE cardinality(reasons) > 0
    )
    SELECT COALESCE(max(total_count), 0),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'nis', COALESCE(nis, ''),
        'name', COALESCE(name, ''),
        'halaqahId', halaqah_id,
        'halaqah', COALESCE(halaqah_name, ''),
        'reasons', to_jsonb(reasons)
      ) ORDER BY ordinal) FILTER (WHERE ordinal <= 6), '[]'::JSONB)
    INTO v_follow_up_count, v_follow_up_rows
    FROM ranked;
  END IF;

  RETURN jsonb_build_object(
    'roster', v_roster,
    'hasMore', v_has_more,
    'nextCursor', CASE WHEN v_has_more AND v_next_student_id IS NOT NULL THEN to_jsonb(v_next_student_id::TEXT) ELSE NULL END,
    'stats', CASE WHEN p_include_support THEN jsonb_build_object(
      'studentCount', v_student_count,
      'studentsWithTarget', v_students_with_target,
      'studentsWithoutTarget', GREATEST(v_student_count - v_students_with_target, 0),
      'studentsWithoutHalaqah', v_students_without_halaqah
    ) ELSE NULL END,
    'halaqahCounts', CASE WHEN p_include_support THEN v_halaqah_counts ELSE NULL END,
    'followUpCount', CASE WHEN p_include_support THEN v_follow_up_count ELSE NULL END,
    'followUps', CASE WHEN p_include_support THEN v_follow_up_rows ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.list_tahfidz_roster_page(UUID, UUID, TEXT, DATE, UUID, TEXT, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tahfidz_roster_page(UUID, UUID, TEXT, DATE, UUID, TEXT, INTEGER, BOOLEAN)
  TO service_role;

COMMIT;
