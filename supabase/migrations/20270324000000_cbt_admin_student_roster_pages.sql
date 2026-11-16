-- Tenant-scoped keyset pages for CBT participant selection and bounded result labels.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_cbt_admin_student_page(
  p_tenant_id UUID,
  p_page_size INTEGER,
  p_cursor_name TEXT DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  grade TEXT,
  class_name TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_search TEXT := NULLIF(btrim(p_search), '');
  v_search_pattern TEXT;
BEGIN
  IF p_tenant_id IS NULL
     OR p_page_size IS NULL OR p_page_size < 2 OR p_page_size > 101
     OR ((p_cursor_name IS NULL) <> (p_cursor_id IS NULL))
     OR (p_cursor_name IS NOT NULL AND (length(p_cursor_name) < 1 OR length(p_cursor_name) > 180))
     OR (v_search IS NOT NULL AND (length(v_search) < 3 OR length(v_search) > 100)) THEN
    RAISE EXCEPTION 'Parameter halaman santri CBT tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search_pattern := '%' ||
      replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') ||
      '%';
  END IF;

  RETURN QUERY
  SELECT
    student.id,
    student.name::TEXT,
    student.grade::TEXT,
    CASE
      WHEN lower(COALESCE(class_record.status, '')) IN ('inactive', 'nonaktif', 'disabled', 'arsip') THEN ''
      ELSE COALESCE(class_record.name, '')
    END::TEXT AS class_name
  FROM public.students AS student
  LEFT JOIN public.master_data_records AS class_record
    ON class_record.tenant_id = student.tenant_id
   AND class_record.id = student.class_id
   AND class_record.category = student.class_category
   AND class_record.category = 'Kelas'
  WHERE student.tenant_id = p_tenant_id
    AND lower(COALESCE(student.status, '')) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
    AND (
      p_cursor_name IS NULL
      OR (student.name, student.id) > (p_cursor_name, p_cursor_id)
    )
    AND (
      v_search IS NULL
      OR student.name ILIKE v_search_pattern ESCAPE E'\\'
      OR student.nis ILIKE v_search_pattern ESCAPE E'\\'
    )
  ORDER BY student.name ASC, student.id ASC
  LIMIT p_page_size;
END;
$function$;

COMMENT ON FUNCTION public.list_cbt_admin_student_page(UUID, INTEGER, TEXT, UUID, TEXT) IS
  'Returns a bounded tenant-scoped CBT participant page. Search may match name or NIS; NIS is never returned.';

REVOKE ALL ON FUNCTION public.list_cbt_admin_student_page(UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cbt_admin_student_page(UUID, INTEGER, TEXT, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.list_cbt_admin_student_labels(
  p_tenant_id UUID,
  p_student_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  grade TEXT,
  class_name TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_student_ids IS NULL
     OR cardinality(p_student_ids) > 5000
     OR array_position(p_student_ids, NULL::UUID) IS NOT NULL THEN
    RAISE EXCEPTION 'Daftar peserta CBT tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    student.id,
    student.name::TEXT,
    student.grade::TEXT,
    CASE
      WHEN lower(COALESCE(class_record.status, '')) IN ('inactive', 'nonaktif', 'disabled', 'arsip') THEN ''
      ELSE COALESCE(class_record.name, '')
    END::TEXT AS class_name
  FROM public.students AS student
  LEFT JOIN public.master_data_records AS class_record
    ON class_record.tenant_id = student.tenant_id
   AND class_record.id = student.class_id
   AND class_record.category = student.class_category
   AND class_record.category = 'Kelas'
  WHERE student.tenant_id = p_tenant_id
    AND student.id = ANY (p_student_ids)
    AND lower(COALESCE(student.status, '')) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
  ORDER BY student.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.list_cbt_admin_student_labels(UUID, UUID[]) IS
  'Returns minimal labels for a bounded set of CBT assignment student IDs in one tenant.';

REVOKE ALL ON FUNCTION public.list_cbt_admin_student_labels(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cbt_admin_student_labels(UUID, UUID[]) TO service_role;

COMMIT;
