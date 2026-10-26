-- Server-only PPDB search with tenant filtering and stable keyset pagination.
-- Build these indexes during a low-write maintenance window on large existing databases.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS candidates_tenant_created_page_idx
  ON public.candidates (tenant_id, created_at DESC, id DESC);

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
    RAISE EXCEPTION 'pg_trgm extension is required for PPDB search indexes';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS candidates_name_trgm_idx
       ON public.candidates USING gin (lower(name) %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS candidates_registration_trgm_idx
       ON public.candidates USING gin (lower(registration_id) %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS candidates_previous_school_trgm_idx
       ON public.candidates USING gin (lower(previous_school) %I.gin_trgm_ops)',
    v_extension_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS candidates_phone_trgm_idx
       ON public.candidates USING gin (lower(phone) %I.gin_trgm_ops)',
    v_extension_schema
  );
END;
$migration$;

CREATE OR REPLACE FUNCTION public.list_admin_ppdb_candidates_page(
  p_tenant_id UUID,
  p_search TEXT DEFAULT NULL,
  p_stage TEXT DEFAULT NULL,
  p_after_created_at TIMESTAMPTZ DEFAULT NULL,
  p_after_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 250
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_search TEXT;
  v_search_pattern TEXT;
  v_stage TEXT;
  v_candidates JSONB;
  v_has_more BOOLEAN := FALSE;
  v_next_created_at TIMESTAMPTZ;
  v_next_id UUID;
BEGIN
  IF p_tenant_id IS NULL
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 250
    OR ((p_after_created_at IS NULL) <> (p_after_id IS NULL)) THEN
    RAISE EXCEPTION 'Parameter halaman PPDB tidak valid' USING ERRCODE = '22023';
  END IF;

  v_search := lower(btrim(COALESCE(p_search, '')));
  IF length(v_search) > 100 THEN
    RAISE EXCEPTION 'Pencarian PPDB terlalu panjang' USING ERRCODE = '22023';
  END IF;
  IF v_search <> '' AND length(v_search) < 3 THEN
    RAISE EXCEPTION 'Pencarian PPDB harus berisi minimal 3 karakter' USING ERRCODE = '22023';
  END IF;
  IF v_search = '' THEN v_search := NULL; END IF;

  v_stage := NULLIF(btrim(COALESCE(p_stage, '')), '');
  IF v_stage IS NOT NULL AND v_stage NOT IN (
    'Registered', 'Document Review', 'Entry Exam', 'Interview', 'Accepted', 'Rejected'
  ) THEN
    RAISE EXCEPTION 'Tahap PPDB tidak valid' USING ERRCODE = '22023';
  END IF;

  IF v_search IS NOT NULL THEN
    -- Treat SQL LIKE metacharacters as literal search input.
    v_search_pattern := '%' || replace(
      replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'),
      '_', E'\\_'
    ) || '%';
  END IF;

  WITH page AS MATERIALIZED (
    SELECT
      c.id,
      c.registration_id,
      c.name,
      c.previous_school,
      c.grade,
      c.phone,
      c.email,
      c.gender,
      c.stage,
      c.score,
      c.date_applied,
      c.exam_slot,
      c.interviewer,
      c.interview_slot,
      c.interview_notified,
      c.notes,
      c.onboarding_status,
      c.sync_to_master_data,
      c.workflow_data,
      c.created_at
    FROM public.candidates AS c
    WHERE c.tenant_id = p_tenant_id
      AND (v_stage IS NULL OR c.stage::TEXT = v_stage)
      AND (p_after_created_at IS NULL OR (c.created_at, c.id) < (p_after_created_at, p_after_id))
      AND (v_search IS NULL OR
        lower(c.name) LIKE v_search_pattern ESCAPE E'\\'
        OR lower(c.registration_id) LIKE v_search_pattern ESCAPE E'\\'
        OR lower(COALESCE(c.previous_school, '')) LIKE v_search_pattern ESCAPE E'\\'
        OR lower(COALESCE(c.phone, '')) LIKE v_search_pattern ESCAPE E'\\')
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT p_page_size + 1
  ), visible AS MATERIALIZED (
    SELECT *
    FROM page
    ORDER BY created_at DESC, id DESC
    LIMIT p_page_size
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(to_jsonb(v) - 'created_at' ORDER BY v.created_at DESC, v.id DESC)
      FROM visible AS v
    ), '[]'::JSONB),
    (SELECT count(*) > p_page_size FROM page),
    (SELECT v.created_at FROM visible AS v ORDER BY v.created_at ASC, v.id ASC LIMIT 1),
    (SELECT v.id FROM visible AS v ORDER BY v.created_at ASC, v.id ASC LIMIT 1)
  INTO v_candidates, v_has_more, v_next_created_at, v_next_id;

  RETURN jsonb_build_object(
    'candidates', v_candidates,
    'hasMore', v_has_more,
    'nextCursor', CASE WHEN v_has_more THEN jsonb_build_object(
      'createdAt', v_next_created_at,
      'id', v_next_id
    ) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_ppdb_candidates_page(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_ppdb_candidates_page(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.list_admin_ppdb_candidates_page(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER) IS
  'Returns one tenant-scoped PPDB candidate page for the authenticated server API. Browser roles cannot call this function.';
