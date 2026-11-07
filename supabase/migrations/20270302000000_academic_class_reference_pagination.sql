-- The roster endpoint no longer aggregates a bounded class list. Class choices
-- are loaded independently through a tenant-scoped keyset endpoint.
BEGIN;

CREATE INDEX IF NOT EXISTS master_data_academic_class_tenant_name_id_idx
  ON public.master_data_records (tenant_id, lower(name), id)
  WHERE category = 'Kelas'
    AND lower(btrim(status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
CREATE INDEX IF NOT EXISTS master_data_academic_class_tenant_name_pattern_idx
  ON public.master_data_records (tenant_id, lower(name) text_pattern_ops)
  WHERE category = 'Kelas'
    AND lower(btrim(status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
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
    'classes', '[]'::JSONB,
    'hasMore', v_has_more,
    'nextCursor', CASE WHEN v_has_more THEN jsonb_build_object('name', v_next_name, 'id', v_next_id) ELSE NULL END
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_tenant_academic_class_page(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_units_enabled BOOLEAN,
  p_unit_mode TEXT,
  p_unit_id UUID,
  p_search TEXT,
  p_after_name TEXT,
  p_after_id TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $academic_class_page$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_actor_unit_id UUID;
  v_class RECORD;
  v_seen INTEGER := 0;
  v_has_more BOOLEAN := false;
  v_classes JSONB := '[]'::JSONB;
  v_next_name TEXT;
  v_next_id TEXT;
  v_query TEXT := lower(btrim(COALESCE(p_search, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
     OR p_units_enabled IS NULL OR p_unit_mode IS NULL OR p_unit_mode NOT IN ('all', 'unit', 'unassigned')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR length(v_query) > 80 OR v_query ~ '[[:cntrl:]]'
     OR strpos(v_query, '%') > 0 OR strpos(v_query, '_') > 0 OR strpos(v_query, chr(92)) > 0
     OR ((p_after_name IS NULL) <> (p_after_id IS NULL))
     OR (p_after_name IS NOT NULL AND (length(p_after_name) > 180 OR p_after_name <> lower(p_after_name)))
     OR (p_after_id IS NOT NULL AND (length(p_after_id) > 160 OR p_after_id ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION 'Permintaan daftar kelas Akademik tidak valid' USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'Ustadz hanya dapat melihat kelas unitnya sendiri' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Filter kelas tanpa unit tidak valid' USING ERRCODE = '22023';
  ELSIF p_unit_mode = 'all' AND p_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Filter seluruh unit tidak valid' USING ERRCODE = '22023';
  END IF;

  FOR v_class IN
    SELECT m.id, m.name, m.organization_unit_id
    FROM public.master_data_records AS m
    WHERE m.tenant_id = p_tenant_id AND m.category = 'Kelas'
      AND lower(btrim(m.status)) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
      AND lower(m.name) LIKE v_query || '%'
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
      AND (p_after_id IS NULL OR (lower(m.name), m.id) > (p_after_name, p_after_id))
    ORDER BY lower(m.name), m.id
    LIMIT p_limit + 1
  LOOP
    v_seen := v_seen + 1;
    IF v_seen <= p_limit THEN
      v_classes := v_classes || jsonb_build_array(jsonb_build_object(
        'id', v_class.id,
        'name', v_class.name,
        'organizationUnitId', v_class.organization_unit_id
      ));
      v_next_name := lower(v_class.name);
      v_next_id := v_class.id;
    ELSE
      v_has_more := true;
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'classes', v_classes,
    'hasMore', v_has_more,
    'nextCursor', CASE WHEN v_has_more THEN jsonb_build_object('name', v_next_name, 'id', v_next_id) ELSE NULL END
  );
END;
$academic_class_page$;

REVOKE ALL ON FUNCTION public.get_tenant_academic_class_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_academic_class_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_tenant_academic_roster_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_academic_roster_page(UUID, UUID, TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT, UUID, INTEGER)
  TO service_role;

COMMIT;
