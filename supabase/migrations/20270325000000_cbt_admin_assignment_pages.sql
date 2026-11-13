-- Bounded tenant-scoped CBT activity pages replace full assignment/attempt snapshots.
-- Rehearse these index builds on a representative copy and schedule them in a low-write window.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS cbt_assignments_admin_page_idx
  ON public.cbt_exam_assignments (tenant_id, assigned_at DESC, id ASC);

DO $migration$
DECLARE
  v_extension_schema name;
BEGIN
  SELECT namespace.nspname
  INTO v_extension_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is required for CBT activity search indexes';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS cbt_exams_title_trgm_idx
       ON public.cbt_exams USING gin (title %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS master_data_records_class_name_trgm_idx
       ON public.master_data_records USING gin (name %I.gin_trgm_ops)
       WHERE category = ''Kelas''',
    v_extension_schema
  );
END;
$migration$;

CREATE OR REPLACE FUNCTION public.get_cbt_admin_exam_assignment_counts(
  p_tenant_id UUID
)
RETURNS TABLE (
  exam_id UUID,
  assigned_count BIGINT,
  completed_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    assignment.exam_id,
    count(*)::BIGINT,
    count(*) FILTER (WHERE assignment.status = 'completed')::BIGINT
  FROM public.cbt_exam_assignments AS assignment
  WHERE assignment.tenant_id = p_tenant_id
  GROUP BY assignment.exam_id;
END;
$function$;

COMMENT ON FUNCTION public.get_cbt_admin_exam_assignment_counts(UUID) IS
  'Returns bounded per-exam assignment totals for the authenticated backend CBT exam list.';

REVOKE ALL ON FUNCTION public.get_cbt_admin_exam_assignment_counts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cbt_admin_exam_assignment_counts(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.list_cbt_admin_assignment_page(
  p_tenant_id UUID,
  p_page_size INTEGER,
  p_view TEXT,
  p_cursor_assigned_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_assignment_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  assigned_at TIMESTAMPTZ,
  assignment_id UUID,
  exam_title TEXT,
  student_name TEXT,
  class_name TEXT,
  status TEXT,
  score NUMERIC,
  passed BOOLEAN,
  submitted_at TIMESTAMPTZ,
  correct_count INTEGER,
  wrong_count INTEGER,
  blank_count INTEGER
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
     OR p_view IS NULL OR p_view NOT IN ('monitor', 'results')
     OR ((p_cursor_assigned_at IS NULL) <> (p_cursor_assignment_id IS NULL))
     OR (v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100) THEN
    RAISE EXCEPTION 'Parameter halaman penugasan CBT tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants AS tenant
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
    assignment.assigned_at,
    assignment.id,
    exam.title::TEXT,
    CASE
      WHEN lower(COALESCE(student.status, '')) IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
        THEN 'Santri diarsipkan'
      ELSE student.name::TEXT
    END,
    CASE
      WHEN lower(COALESCE(student.status, '')) IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
        OR lower(COALESCE(class_record.status, '')) IN ('inactive', 'nonaktif', 'disabled', 'arsip')
        THEN ''
      ELSE COALESCE(class_record.name, '')::TEXT
    END,
    assignment.status::TEXT,
    attempt.score,
    attempt.passed,
    attempt.submitted_at,
    attempt.correct_count,
    attempt.wrong_count,
    attempt.blank_count
  FROM public.cbt_exam_assignments AS assignment
  JOIN public.cbt_exams AS exam
    ON exam.tenant_id = assignment.tenant_id AND exam.id = assignment.exam_id
  JOIN public.students AS student
    ON student.tenant_id = assignment.tenant_id AND student.id = assignment.student_id
  LEFT JOIN public.master_data_records AS class_record
    ON class_record.tenant_id = student.tenant_id
   AND class_record.id = student.class_id
   AND class_record.category = student.class_category
   AND class_record.category = 'Kelas'
  LEFT JOIN public.cbt_attempts AS attempt
    ON attempt.tenant_id = assignment.tenant_id AND attempt.assignment_id = assignment.id
  WHERE assignment.tenant_id = p_tenant_id
    AND (p_view <> 'monitor' OR assignment.status IN ('assigned', 'in_progress'))
    AND (
      p_cursor_assigned_at IS NULL
      OR assignment.assigned_at < p_cursor_assigned_at
      OR (assignment.assigned_at = p_cursor_assigned_at AND assignment.id > p_cursor_assignment_id)
    )
    AND (
      v_search IS NULL
      OR (
        lower(COALESCE(student.status, '')) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
        AND student.name ILIKE v_search_pattern ESCAPE E'\\'
      )
      OR exam.title ILIKE v_search_pattern ESCAPE E'\\'
      OR (
        lower(COALESCE(student.status, '')) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
        AND lower(COALESCE(class_record.status, '')) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
        AND class_record.name ILIKE v_search_pattern ESCAPE E'\\'
      )
    )
  ORDER BY assignment.assigned_at DESC, assignment.id ASC
  LIMIT p_page_size;
END;
$function$;

COMMENT ON FUNCTION public.list_cbt_admin_assignment_page(UUID, INTEGER, TEXT, TIMESTAMPTZ, UUID, TEXT) IS
  'Returns a bounded tenant-scoped page of CBT monitor or results rows with minimal student labels.';

REVOKE ALL ON FUNCTION public.list_cbt_admin_assignment_page(UUID, INTEGER, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cbt_admin_assignment_page(UUID, INTEGER, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

COMMIT;
