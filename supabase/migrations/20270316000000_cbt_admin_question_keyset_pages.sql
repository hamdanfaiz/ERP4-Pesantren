-- Tenant-scoped keyset pages and server-side package aggregates for large CBT banks.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS cbt_questions_tenant_created_page_idx
  ON public.cbt_questions (tenant_id, created_at DESC, id ASC);
CREATE INDEX IF NOT EXISTS cbt_questions_tenant_subject_grade_active_page_idx
  ON public.cbt_questions (tenant_id, subject_reference_id, grade_level_reference_id, created_at DESC, id ASC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS cbt_questions_tenant_template_created_page_idx
  ON public.cbt_questions (tenant_id, template_reference_id, created_at DESC, id ASC);

DO $migration$
DECLARE v_extension_schema name;
BEGIN
  SELECT namespace.nspname INTO v_extension_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';
  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm extension is required for CBT question search indexes';
  END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS cbt_questions_search_trgm_idx
       ON public.cbt_questions USING gin (
         lower(subject || '' '' || grade || '' '' || template || '' '' || question_html) %I.gin_trgm_ops
       )',
    v_extension_schema
  );
END;
$migration$;

CREATE OR REPLACE FUNCTION public.list_cbt_admin_question_page(
  p_tenant_id UUID,
  p_page_size INTEGER,
  p_cursor_created_at TIMESTAMPTZ,
  p_cursor_id UUID,
  p_search TEXT,
  p_status TEXT,
  p_subject_reference_id UUID,
  p_grade_level_reference_id UUID,
  p_template_reference_id UUID
)
RETURNS TABLE (
  id UUID, subject TEXT, grade TEXT, template TEXT,
  subject_reference_id UUID, grade_level_reference_id UUID, template_reference_id UUID,
  question_html TEXT, options JSONB, correct_answer SMALLINT, explanation TEXT,
  difficulty TEXT, tags TEXT[], status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_search TEXT := lower(btrim(COALESCE(p_search, '')));
  v_search_pattern TEXT;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;
  IF p_page_size IS NULL OR p_page_size < 2 OR p_page_size > 101
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)) THEN
    RAISE EXCEPTION 'Parameter halaman soal CBT tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Status soal CBT tidak valid' USING ERRCODE = '22023';
  END IF;
  IF length(v_search) > 100 OR (v_search <> '' AND length(v_search) < 3) THEN
    RAISE EXCEPTION 'Pencarian soal CBT tidak valid' USING ERRCODE = '22023';
  END IF;
  IF v_search = '' THEN
    v_search := NULL;
  ELSE
    v_search_pattern := '%' || replace(
      replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'),
      '_', E'\\_'
    ) || '%';
  END IF;

  IF v_search IS NULL THEN
    RETURN QUERY
    SELECT q.id, q.subject, q.grade, q.template,
      q.subject_reference_id, q.grade_level_reference_id, q.template_reference_id,
      q.question_html, q.options, q.correct_answer, q.explanation, q.difficulty,
      q.tags, q.status, q.created_at, q.updated_at
    FROM public.cbt_questions AS q
    WHERE q.tenant_id = p_tenant_id
      AND (p_status IS NULL OR q.status = p_status)
      AND (p_subject_reference_id IS NULL OR q.subject_reference_id = p_subject_reference_id)
      AND (p_grade_level_reference_id IS NULL OR q.grade_level_reference_id = p_grade_level_reference_id)
      AND (p_template_reference_id IS NULL OR q.template_reference_id = p_template_reference_id)
      AND (p_cursor_created_at IS NULL OR q.created_at < p_cursor_created_at
        OR (q.created_at = p_cursor_created_at AND q.id > p_cursor_id))
    ORDER BY q.created_at DESC, q.id ASC
    LIMIT p_page_size;
  ELSE
    RETURN QUERY
    WITH matched AS (
      SELECT q.id
      FROM public.cbt_questions AS q
      WHERE q.tenant_id = p_tenant_id
        AND (p_status IS NULL OR q.status = p_status)
        AND (p_subject_reference_id IS NULL OR q.subject_reference_id = p_subject_reference_id)
        AND (p_grade_level_reference_id IS NULL OR q.grade_level_reference_id = p_grade_level_reference_id)
        AND (p_template_reference_id IS NULL OR q.template_reference_id = p_template_reference_id)
        AND (p_cursor_created_at IS NULL OR q.created_at < p_cursor_created_at
          OR (q.created_at = p_cursor_created_at AND q.id > p_cursor_id))
        AND lower(q.subject || ' ' || q.grade || ' ' || q.template || ' ' || q.question_html)
          LIKE v_search_pattern ESCAPE E'\\'
      UNION
      SELECT q.id
      FROM public.cbt_questions AS q
      WHERE q.tenant_id = p_tenant_id
        AND (p_status IS NULL OR q.status = p_status)
        AND (p_subject_reference_id IS NULL OR q.subject_reference_id = p_subject_reference_id)
        AND (p_grade_level_reference_id IS NULL OR q.grade_level_reference_id = p_grade_level_reference_id)
        AND (p_template_reference_id IS NULL OR q.template_reference_id = p_template_reference_id)
        AND (p_cursor_created_at IS NULL OR q.created_at < p_cursor_created_at
          OR (q.created_at = p_cursor_created_at AND q.id > p_cursor_id))
        AND EXISTS (
          SELECT 1
          FROM unnest(q.tags) AS question_tag(value)
          WHERE lower(question_tag.value) LIKE v_search_pattern ESCAPE E'\\'
        )
    )
    SELECT q.id, q.subject, q.grade, q.template,
      q.subject_reference_id, q.grade_level_reference_id, q.template_reference_id,
      q.question_html, q.options, q.correct_answer, q.explanation, q.difficulty,
      q.tags, q.status, q.created_at, q.updated_at
    FROM matched
    JOIN public.cbt_questions AS q ON q.id = matched.id
    ORDER BY q.created_at DESC, q.id ASC
    LIMIT p_page_size;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cbt_question_package_summary(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE v_summary JSONB;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'templateReferenceId', package_row.template_reference_id,
    'totalQuestions', package_row.total_questions,
    'activeQuestions', package_row.active_questions,
    'subjects', package_row.subjects,
    'gradeLevels', package_row.grade_levels
  ) ORDER BY package_row.template_reference_id), '[]'::JSONB)
  INTO v_summary
  FROM (
    SELECT q.template_reference_id,
      count(*)::BIGINT AS total_questions,
      count(*) FILTER (WHERE q.status = 'active')::BIGINT AS active_questions,
      COALESCE(
        array_agg(DISTINCT COALESCE(subject_ref.name, q.subject)
          ORDER BY COALESCE(subject_ref.name, q.subject))
          FILTER (WHERE NULLIF(btrim(COALESCE(subject_ref.name, q.subject)), '') IS NOT NULL),
        ARRAY[]::TEXT[]
      ) AS subjects,
      COALESCE(
        array_agg(DISTINCT COALESCE(grade_ref.name, q.grade)
          ORDER BY COALESCE(grade_ref.name, q.grade))
          FILTER (WHERE NULLIF(btrim(COALESCE(grade_ref.name, q.grade)), '') IS NOT NULL),
        ARRAY[]::TEXT[]
      ) AS grade_levels
    FROM public.cbt_questions AS q
    LEFT JOIN public.tenant_reference_items AS subject_ref
      ON subject_ref.tenant_id = q.tenant_id
      AND subject_ref.domain = q.subject_reference_domain
      AND subject_ref.id = q.subject_reference_id
    LEFT JOIN public.tenant_reference_items AS grade_ref
      ON grade_ref.tenant_id = q.tenant_id
      AND grade_ref.domain = q.grade_level_reference_domain
      AND grade_ref.id = q.grade_level_reference_id
    WHERE q.tenant_id = p_tenant_id AND q.template_reference_id IS NOT NULL
    GROUP BY q.template_reference_id
  ) AS package_row;
  RETURN COALESCE(v_summary, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.list_cbt_admin_question_page(
  UUID, INTEGER, TIMESTAMPTZ, UUID, TEXT, TEXT, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cbt_admin_question_page(
  UUID, INTEGER, TIMESTAMPTZ, UUID, TEXT, TEXT, UUID, UUID, UUID
) TO service_role;
REVOKE ALL ON FUNCTION public.get_cbt_question_package_summary(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cbt_question_package_summary(UUID)
  TO service_role;
COMMIT;
