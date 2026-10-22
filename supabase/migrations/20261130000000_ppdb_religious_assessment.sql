-- Route PPDB Al-Qur'an and Tahfidz assessments through the tenant-guarded
-- Supabase workflow RPC. Score values are validated and evaluator metadata is
-- derived from the active tenant profile, never trusted from the browser.
BEGIN;

ALTER FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  RENAME TO update_ppdb_candidate_guarded_base;

REVOKE ALL ON FUNCTION public.update_ppdb_candidate_guarded_base(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ppdb_candidate_guarded_base(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  TO service_role;

CREATE FUNCTION public.update_ppdb_candidate_guarded(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_candidate_id UUID,
  p_core_patch JSONB,
  p_workflow_patch JSONB,
  p_documents_patch JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workflow_patch JSONB := COALESCE(p_workflow_patch, '{}'::jsonb);
  v_base_workflow_patch JSONB;
  v_religious JSONB;
  v_stage TEXT;
  v_evaluator TEXT;
  v_score NUMERIC;
  v_total_score INTEGER;
  v_updated BOOLEAN := false;
  v_field TEXT;
  v_rows INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_candidate_id IS NULL
    OR jsonb_typeof(COALESCE(p_core_patch, '{}'::jsonb)) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_workflow_patch) IS DISTINCT FROM 'object'
    OR jsonb_typeof(COALESCE(p_documents_patch, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB update payload' USING ERRCODE = '22023';
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(v_workflow_patch)
  LOOP
    IF v_field NOT IN ('examScores', 'interviewScores', 'religiousScores') THEN
      RAISE EXCEPTION 'Unsupported PPDB workflow field' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_religious := v_workflow_patch->'religiousScores';
  v_base_workflow_patch := v_workflow_patch - 'religiousScores';

  IF v_religious IS NOT NULL THEN
    IF jsonb_typeof(v_religious) IS DISTINCT FROM 'object'
      OR NOT (v_religious ?& ARRAY['quranFluency', 'tajweedMastery', 'worshipPractice']) THEN
      RAISE EXCEPTION 'Religious assessment requires all three scores' USING ERRCODE = '22023';
    END IF;

    FOR v_field IN SELECT jsonb_object_keys(v_religious)
    LOOP
      IF v_field NOT IN ('quranFluency', 'tajweedMastery', 'worshipPractice', 'memorizedJuz', 'notes') THEN
        RAISE EXCEPTION 'Unsupported religious assessment field' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    FOREACH v_field IN ARRAY ARRAY['quranFluency', 'tajweedMastery', 'worshipPractice']
    LOOP
      IF jsonb_typeof(v_religious->v_field) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Religious assessment score must be numeric' USING ERRCODE = '22023';
      END IF;
      v_score := (v_religious->>v_field)::NUMERIC;
      IF v_score < 0 OR v_score > 100 OR trunc(v_score) <> v_score THEN
        RAISE EXCEPTION 'Religious assessment score is outside the allowed range' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF v_religious ? 'memorizedJuz' AND (
      jsonb_typeof(v_religious->'memorizedJuz') IS DISTINCT FROM 'string'
      OR length(v_religious->>'memorizedJuz') > 500
    ) THEN
      RAISE EXCEPTION 'Memorized Juz note is invalid' USING ERRCODE = '22023';
    END IF;
    IF v_religious ? 'notes' AND (
      jsonb_typeof(v_religious->'notes') IS DISTINCT FROM 'string'
      OR length(v_religious->>'notes') > 4000
    ) THEN
      RAISE EXCEPTION 'Religious assessment notes are invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE(p_core_patch, '{}'::jsonb) <> '{}'::jsonb
    OR v_base_workflow_patch <> '{}'::jsonb
    OR COALESCE(p_documents_patch, '{}'::jsonb) <> '{}'::jsonb THEN
    v_updated := public.update_ppdb_candidate_guarded_base(
      p_tenant_id, p_actor_user_id, p_candidate_id,
      COALESCE(p_core_patch, '{}'::jsonb), v_base_workflow_patch,
      COALESCE(p_documents_patch, '{}'::jsonb)
    );
    IF NOT v_updated THEN RETURN false; END IF;
  END IF;

  IF v_religious IS NULL THEN
    IF NOT v_updated THEN
      RAISE EXCEPTION 'No PPDB fields to update' USING ERRCODE = '22023';
    END IF;
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT display_name INTO v_evaluator
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
    AND status = 'active' AND role IN ('admin', 'super_admin')
    AND (NOT (module_permissions ? 'ppdb') OR (module_permissions->>'ppdb')::BOOLEAN);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PPDB actor is not an active tenant administrator' USING ERRCODE = '42501';
  END IF;

  SELECT stage::TEXT INTO v_stage
  FROM public.candidates
  WHERE id = p_candidate_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  v_total_score := round((
    (v_religious->>'quranFluency')::NUMERIC
    + (v_religious->>'tajweedMastery')::NUMERIC
    + (v_religious->>'worshipPractice')::NUMERIC
  ) / 3)::INTEGER;

  UPDATE public.candidates
  SET workflow_data = public.jsonb_deep_merge(
        COALESCE(workflow_data, '{}'::jsonb),
        jsonb_build_object('religiousScores', jsonb_build_object(
          'quranFluency', (v_religious->>'quranFluency')::INTEGER,
          'tajweedMastery', (v_religious->>'tajweedMastery')::INTEGER,
          'worshipPractice', (v_religious->>'worshipPractice')::INTEGER,
          'memorizedJuz', COALESCE(v_religious->>'memorizedJuz', ''),
          'notes', COALESCE(v_religious->>'notes', ''),
          'totalScore', v_total_score,
          'evaluatedAt', CURRENT_DATE::TEXT,
          'evaluator', v_evaluator
        ))
      ),
      updated_at = now()
  WHERE id = p_candidate_id AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RETURN false; END IF;

  INSERT INTO public.ppdb_candidate_admin_events (
    tenant_id, candidate_id, actor_user_id, event_type, from_stage, to_stage, changed_fields
  ) VALUES (
    p_tenant_id, p_candidate_id, p_actor_user_id, 'updated', v_stage, v_stage, ARRAY['religiousScores']
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB) IS
  'Validates tenant PPDB administrator and all workflow fields; calculates Al-Quran/Tahfidz score and evaluator metadata in the database.';

COMMIT;
