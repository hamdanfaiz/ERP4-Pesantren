-- Replace full-roster loads with a tenant- and class-scoped keyset API.
-- The endpoint is server-only; role and scope are revalidated in the database.
BEGIN;

CREATE INDEX IF NOT EXISTS students_tenant_active_name_id_idx
  ON public.students (tenant_id, lower(name), id)
  WHERE lower(btrim(status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan');

CREATE INDEX IF NOT EXISTS students_tenant_unit_active_name_id_idx
  ON public.students (tenant_id, organization_unit_id, lower(name), id)
  WHERE lower(btrim(status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan');

CREATE INDEX IF NOT EXISTS academic_records_tenant_teacher_class_schedule_live_idx
  ON public.academic_records (tenant_id, teacher_user_id, class_reference_id)
  WHERE kind = 'schedule' AND deleted_at IS NULL
    AND teacher_user_id IS NOT NULL AND class_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_tenant_academic_roster_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_units_enabled BOOLEAN,
  p_unit_mode TEXT,
  p_unit_id UUID,
  p_search TEXT,
  p_after_name TEXT,
  p_after_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_actor_unit_id UUID;
  v_student RECORD;
  v_seen INTEGER := 0;
  v_has_more BOOLEAN := false;
  v_students JSONB := '[]'::JSONB;
  v_classes JSONB := '[]'::JSONB;
  v_class_count BIGINT;
  v_next_name TEXT;
  v_next_id UUID;
  v_query TEXT := lower(btrim(COALESCE(p_search, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
     OR p_units_enabled IS NULL OR p_unit_mode IS NULL OR p_unit_mode NOT IN ('all', 'unit', 'unassigned')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR length(v_query) > 80 OR v_query ~ '[[:cntrl:]]'
     OR ((p_after_name IS NULL) <> (p_after_id IS NULL))
     OR (p_after_name IS NOT NULL AND (length(p_after_name) > 180 OR p_after_name <> lower(p_after_name))) THEN
    RAISE EXCEPTION 'Permintaan roster Akademik tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::TEXT)), p.module_permissions, p.organization_unit_id
    INTO v_tenant_status, v_role, v_permissions, v_actor_unit_id
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role
     OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Profil akademik aktif tidak ditemukan pada tenant' USING ERRCODE = '42501';
  END IF;
  IF (v_permissions ? 'academic') AND v_permissions->'academic' IS DISTINCT FROM 'true'::JSONB THEN
    RAISE EXCEPTION 'Profil tidak memiliki akses Akademik pada tenant ini' USING ERRCODE = '42501';
  END IF;

  IF NOT p_units_enabled THEN
    IF p_unit_mode <> 'all' OR p_unit_id IS NOT NULL THEN
      RAISE EXCEPTION 'Filter unit belum diaktifkan' USING ERRCODE = '22023';
    END IF;
  ELSIF v_role = 'ustadz' THEN
    IF p_unit_mode <> 'unit' OR p_unit_id IS NULL OR v_actor_unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Ustadz hanya dapat melihat roster unitnya sendiri' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.organization_units
    WHERE tenant_id = p_tenant_id AND id = p_unit_id AND status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit Ustadz tidak aktif pada tenant ini' USING ERRCODE = '42501';
    END IF;
  ELSIF p_unit_mode = 'unit' THEN
    IF p_unit_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organization_units
      WHERE tenant_id = p_tenant_id AND id = p_unit_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
    END IF;
  ELSIF p_unit_mode = 'unassigned' AND p_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Filter data tanpa unit tidak valid' USING ERRCODE = '22023';
  ELSIF p_unit_mode = 'all' AND p_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Filter seluruh unit tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_class_count
  FROM public.master_data_records AS m
  WHERE m.tenant_id = p_tenant_id AND m.category = 'Kelas'
    AND lower(btrim(m.status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
    AND (
      NOT p_units_enabled OR p_unit_mode = 'all'
      OR (p_unit_mode = 'unit' AND (m.organization_unit_id IS NULL OR m.organization_unit_id = p_unit_id))
      OR (p_unit_mode = 'unassigned' AND m.organization_unit_id IS NULL)
    )
    AND (
      v_role <> 'ustadz' OR EXISTS (
        SELECT 1 FROM public.academic_records AS a
        WHERE a.tenant_id = p_tenant_id AND a.kind = 'schedule'
          AND a.teacher_user_id = p_actor_user_id AND a.class_reference_id = m.id
          AND a.deleted_at IS NULL
          AND (NOT p_units_enabled OR a.organization_unit_id = p_unit_id)
      )
    );
  IF v_class_count > 500 THEN
    RAISE EXCEPTION 'Daftar kelas Akademik melewati batas aman tampilan' USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', scoped.id,
      'name', scoped.name,
      'organizationUnitId', scoped.organization_unit_id
    ) ORDER BY lower(scoped.name), scoped.id
  ), '[]'::JSONB)
  INTO v_classes
  FROM (
    SELECT m.id, m.name, m.organization_unit_id
    FROM public.master_data_records AS m
    WHERE m.tenant_id = p_tenant_id AND m.category = 'Kelas'
      AND lower(btrim(m.status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
      AND (
        NOT p_units_enabled OR p_unit_mode = 'all'
        OR (p_unit_mode = 'unit' AND (m.organization_unit_id IS NULL OR m.organization_unit_id = p_unit_id))
        OR (p_unit_mode = 'unassigned' AND m.organization_unit_id IS NULL)
      )
      AND (
        v_role <> 'ustadz' OR EXISTS (
          SELECT 1 FROM public.academic_records AS a
          WHERE a.tenant_id = p_tenant_id AND a.kind = 'schedule'
            AND a.teacher_user_id = p_actor_user_id AND a.class_reference_id = m.id
            AND a.deleted_at IS NULL
            AND (NOT p_units_enabled OR a.organization_unit_id = p_unit_id)
        )
      )
    ORDER BY lower(m.name), m.id
    LIMIT 501
  ) AS scoped;

  FOR v_student IN
    SELECT s.id, s.name, s.nis, s.grade, s.class_id, s.organization_unit_id,
      COALESCE(NULLIF(class_record.name, ''), NULLIF(s.grade, '')) AS class_name
    FROM public.students AS s
    LEFT JOIN public.master_data_records AS class_record
      ON class_record.tenant_id = s.tenant_id AND class_record.category = 'Kelas'
      AND class_record.id = s.class_id
      AND lower(btrim(class_record.status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
    WHERE s.tenant_id = p_tenant_id
      AND lower(btrim(s.status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan')
      AND (
        s.name ILIKE ('%' || btrim(COALESCE(p_search, '')) || '%')
        OR s.nis LIKE ('%' || btrim(COALESCE(p_search, '')) || '%')
      )
      AND (
        NOT p_units_enabled OR p_unit_mode = 'all'
        OR (p_unit_mode = 'unit' AND s.organization_unit_id = p_unit_id)
        OR (p_unit_mode = 'unassigned' AND s.organization_unit_id IS NULL)
      )
      AND (
        v_role <> 'ustadz' OR (
          class_record.id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.academic_records AS a
            WHERE a.tenant_id = p_tenant_id AND a.kind = 'schedule'
              AND a.teacher_user_id = p_actor_user_id AND a.class_reference_id = s.class_id
              AND a.deleted_at IS NULL
              AND (NOT p_units_enabled OR (a.organization_unit_id = p_unit_id AND s.organization_unit_id = p_unit_id))
          )
        )
      )
      AND (p_after_id IS NULL OR (lower(s.name), s.id) > (p_after_name, p_after_id))
    ORDER BY lower(s.name), s.id
    LIMIT p_limit + 1
  LOOP
    v_seen := v_seen + 1;
    IF v_seen <= p_limit THEN
      v_students := v_students || jsonb_build_array(jsonb_build_object(
        'id', v_student.id,
        'name', v_student.name,
        'nis', v_student.nis,
        'className', COALESCE(v_student.class_name, ''),
        'organizationUnitId', v_student.organization_unit_id
      ));
      v_next_name := lower(v_student.name);
      v_next_id := v_student.id;
    END IF;
  END LOOP;
  v_has_more := v_seen > p_limit;

  RETURN jsonb_build_object(
    'success', true,
    'students', v_students,
    'classes', v_classes,
    'hasMore', v_has_more,
    'nextCursor', CASE WHEN v_has_more THEN jsonb_build_object('name', v_next_name, 'id', v_next_id) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_academic_roster_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_academic_roster_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, UUID, INTEGER)
  TO service_role;

-- Make assessment authorization rely on the exact class reference, not a display name.
CREATE OR REPLACE FUNCTION public.guard_ustadz_academic_assessment_class_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_role TEXT;
  v_student_class_id TEXT;
BEGIN
  IF NEW.kind <> 'assessment' OR NEW.source_system <> 'supabase_runtime' THEN
    RETURN NEW;
  END IF;

  SELECT lower(btrim(p.role::TEXT)) INTO v_actor_role
  FROM public.profiles AS p
  WHERE p.tenant_id = NEW.tenant_id AND p.user_id = NEW.updated_by AND p.status = 'active';
  IF v_actor_role IS DISTINCT FROM 'ustadz' THEN
    RETURN NEW;
  END IF;
  IF NEW.teacher_user_id IS DISTINCT FROM NEW.updated_by THEN
    RAISE EXCEPTION 'Ustadz hanya dapat mencatat nilai atas nama sendiri' USING ERRCODE = '42501';
  END IF;

  SELECT s.class_id INTO v_student_class_id
  FROM public.students AS s
  JOIN public.master_data_records AS c
    ON c.tenant_id = s.tenant_id AND c.category = 'Kelas' AND c.id = s.class_id
  WHERE s.tenant_id = NEW.tenant_id AND s.id = NEW.student_id
    AND lower(btrim(s.status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan')
    AND lower(btrim(c.status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
  IF v_student_class_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.academic_records AS a
    WHERE a.tenant_id = NEW.tenant_id AND a.kind = 'schedule'
      AND a.teacher_user_id = NEW.teacher_user_id
      AND a.class_reference_id = v_student_class_id
      AND a.deleted_at IS NULL
      AND (NEW.organization_unit_id IS NULL OR a.organization_unit_id = NEW.organization_unit_id)
  ) THEN
    RAISE EXCEPTION 'Santri berada di luar kelas yang dijadwalkan untuk Ustadz ini' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academic_records_guard_ustadz_assessment_class_scope
  BEFORE INSERT OR UPDATE OF tenant_id, kind, student_id, teacher_user_id, organization_unit_id, updated_by
  ON public.academic_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_ustadz_academic_assessment_class_scope();

REVOKE ALL ON FUNCTION public.guard_ustadz_academic_assessment_class_scope() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_tenant_academic_roster_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, UUID, INTEGER) IS
  'Returns keyset-paginated tenant students and active class references; Ustadz results require an exact assigned schedule class reference.';
COMMENT ON FUNCTION public.guard_ustadz_academic_assessment_class_scope() IS
  'Prevents Ustadz assessment writes outside exact assigned tenant class references.';

COMMIT;
