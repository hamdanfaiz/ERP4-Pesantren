
-- Bound CBT admin exam lists and calendar queries for large tenants.
BEGIN;

CREATE INDEX IF NOT EXISTS cbt_exams_admin_schedule_page_idx
  ON public.cbt_exams (tenant_id, starts_at DESC, id ASC);

CREATE OR REPLACE FUNCTION public.list_cbt_admin_exam_page(
  p_tenant_id UUID,
  p_page_size INTEGER,
  p_cursor_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_exam_id UUID DEFAULT NULL,
  p_starts_at_from TIMESTAMPTZ DEFAULT NULL,
  p_starts_at_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  subject TEXT,
  grade TEXT,
  subject_reference_id UUID,
  grade_level_reference_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  duration_minutes SMALLINT,
  passing_score NUMERIC,
  status TEXT,
  assigned_count BIGINT,
  completed_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_tenant_id IS NULL
     OR p_page_size IS NULL OR p_page_size < 2 OR p_page_size > 101
     OR ((p_cursor_starts_at IS NULL) <> (p_cursor_exam_id IS NULL))
     OR ((p_starts_at_from IS NULL) <> (p_starts_at_until IS NULL))
     OR (p_starts_at_from IS NOT NULL AND p_starts_at_until <= p_starts_at_from)
     OR (p_starts_at_from IS NOT NULL AND p_starts_at_until - p_starts_at_from > interval '33 days') THEN
    RAISE EXCEPTION 'Parameter halaman ujian CBT tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH page AS MATERIALIZED (
    SELECT exam.id, exam.tenant_id, exam.title, exam.subject, exam.grade,
      exam.subject_reference_id, exam.grade_level_reference_id, exam.starts_at,
      exam.ends_at, exam.duration_minutes, exam.passing_score, exam.status
    FROM public.cbt_exams AS exam
    WHERE exam.tenant_id = p_tenant_id
      AND (p_starts_at_from IS NULL OR exam.starts_at >= p_starts_at_from)
      AND (p_starts_at_until IS NULL OR exam.starts_at < p_starts_at_until)
      AND (
        p_cursor_starts_at IS NULL
        OR exam.starts_at < p_cursor_starts_at
        OR (exam.starts_at = p_cursor_starts_at AND exam.id > p_cursor_exam_id)
      )
    ORDER BY exam.starts_at DESC, exam.id ASC
    LIMIT p_page_size
  )
  SELECT page.id, page.title::TEXT, page.subject::TEXT, page.grade::TEXT,
    page.subject_reference_id, page.grade_level_reference_id, page.starts_at,
    page.ends_at, page.duration_minutes, page.passing_score, page.status::TEXT,
    COALESCE(counts.assigned_count, 0)::BIGINT,
    COALESCE(counts.completed_count, 0)::BIGINT
  FROM page
  LEFT JOIN LATERAL (
    SELECT count(*)::BIGINT AS assigned_count,
      count(*) FILTER (WHERE assignment.status = 'completed')::BIGINT AS completed_count
    FROM public.cbt_exam_assignments AS assignment
    WHERE assignment.tenant_id = page.tenant_id AND assignment.exam_id = page.id
  ) AS counts ON true
  ORDER BY page.starts_at DESC, page.id ASC;
END;
$function$;

COMMENT ON FUNCTION public.list_cbt_admin_exam_page(UUID, INTEGER, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Returns a bounded tenant-scoped CBT exam page with per-page assignment counts; optional time bounds support a tenant-local calendar month.';

REVOKE ALL ON FUNCTION public.list_cbt_admin_exam_page(UUID, INTEGER, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cbt_admin_exam_page(UUID, INTEGER, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
