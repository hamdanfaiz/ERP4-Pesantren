-- Add database-side readiness checks before PPDB candidates advance in the pipeline.
-- This wrapper locks the tenant candidate before checking workflow/document state and
-- delegates the actual allow-listed write to the service-role-only update RPC.
BEGIN;

CREATE TABLE public.ppdb_candidate_admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type = 'updated'),
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX ppdb_candidate_admin_events_candidate_idx
  ON public.ppdb_candidate_admin_events (tenant_id, candidate_id, created_at DESC);
ALTER TABLE public.ppdb_candidate_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_candidate_admin_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_candidate_admin_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ppdb_candidate_admin_events TO service_role;

CREATE OR REPLACE FUNCTION public.update_ppdb_candidate_guarded(
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
  v_workflow JSONB;
  v_documents public.candidate_documents%ROWTYPE;
  v_previous_stage TEXT;
  v_stage TEXT;
  v_changed_fields TEXT[] := '{}';
  v_updated BOOLEAN;
  v_kk BOOLEAN := false;
  v_birth_certificate BOOLEAN := false;
  v_report_cards BOOLEAN := false;
  v_exam_scores JSONB;
  v_interview_scores JSONB;
  v_field TEXT;
  v_score NUMERIC;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_candidate_id IS NULL
    OR jsonb_typeof(COALESCE(p_core_patch, '{}'::jsonb)) IS DISTINCT FROM 'object'
    OR jsonb_typeof(COALESCE(p_workflow_patch, '{}'::jsonb)) IS DISTINCT FROM 'object'
    OR jsonb_typeof(COALESCE(p_documents_patch, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB update payload' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role IN ('admin', 'super_admin')
      AND (NOT (module_permissions ? 'ppdb') OR (module_permissions->>'ppdb')::BOOLEAN)
  ) THEN
    RAISE EXCEPTION 'PPDB actor is not an active tenant administrator' USING ERRCODE = '42501';
  END IF;

  SELECT workflow_data, stage::TEXT
  INTO v_workflow, v_previous_stage
  FROM public.candidates
  WHERE id = p_candidate_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_changed_fields := v_changed_fields || ARRAY(SELECT jsonb_object_keys(COALESCE(p_core_patch, '{}'::jsonb)));
  v_changed_fields := v_changed_fields || ARRAY(SELECT jsonb_object_keys(COALESCE(p_workflow_patch, '{}'::jsonb)));
  v_changed_fields := v_changed_fields || ARRAY(SELECT jsonb_object_keys(COALESCE(p_documents_patch, '{}'::jsonb)));

  SELECT * INTO v_documents
  FROM public.candidate_documents
  WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id
  FOR UPDATE;
  IF FOUND THEN
    v_kk := v_documents.kk;
    v_birth_certificate := v_documents.birth_certificate;
    v_report_cards := v_documents.report_cards;
  END IF;
  v_kk := COALESCE((p_documents_patch->>'kk')::BOOLEAN, v_kk);
  v_birth_certificate := COALESCE((p_documents_patch->>'birthCertificate')::BOOLEAN, v_birth_certificate);
  v_report_cards := COALESCE((p_documents_patch->>'reportCards')::BOOLEAN, v_report_cards);

  v_workflow := public.jsonb_deep_merge(COALESCE(v_workflow, '{}'::jsonb), COALESCE(p_workflow_patch, '{}'::jsonb));
  v_exam_scores := v_workflow->'examScores';
  v_interview_scores := v_workflow->'interviewScores';
  v_stage := COALESCE(p_core_patch->>'stage', v_previous_stage);

  IF p_workflow_patch ? 'examScores' THEN
    IF jsonb_typeof(p_workflow_patch->'examScores') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid entry exam scores' USING ERRCODE = '22023';
    END IF;
    FOR v_field IN SELECT jsonb_object_keys(p_workflow_patch->'examScores')
    LOOP
      IF v_field NOT IN ('math', 'science', 'english', 'tpa', 'quran') THEN
        RAISE EXCEPTION 'Unsupported entry exam score field' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_score := (p_workflow_patch->'examScores'->>v_field)::NUMERIC;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Entry exam score must be numeric' USING ERRCODE = '22023';
      END;
      IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN
        RAISE EXCEPTION 'Entry exam score is outside the allowed range' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_workflow_patch ? 'interviewScores' THEN
    IF jsonb_typeof(p_workflow_patch->'interviewScores') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid interview scores' USING ERRCODE = '22023';
    END IF;
    FOR v_field IN SELECT jsonb_object_keys(p_workflow_patch->'interviewScores')
    LOOP
      IF v_field NOT IN ('academicPotential', 'personality', 'communication') THEN
        RAISE EXCEPTION 'Unsupported interview score field' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_score := (p_workflow_patch->'interviewScores'->>v_field)::NUMERIC;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Interview score must be numeric' USING ERRCODE = '22023';
      END;
      IF v_score IS NULL OR v_score < 1 OR v_score > 5 THEN
        RAISE EXCEPTION 'Interview score is outside the allowed range' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF v_stage = 'Entry Exam' AND NOT (v_kk AND v_birth_certificate AND v_report_cards) THEN
    RAISE EXCEPTION 'Required documents are incomplete' USING ERRCODE = '23514';
  END IF;
  IF v_stage = 'Interview' AND (
    jsonb_typeof(v_exam_scores) IS DISTINCT FROM 'object'
    OR NOT (v_exam_scores ?& ARRAY['math', 'science', 'english', 'tpa', 'quran'])
  ) THEN
    RAISE EXCEPTION 'Entry exam scoring must be complete before interview' USING ERRCODE = '23514';
  END IF;
  IF v_stage = 'Interview' THEN
    FOR v_field IN SELECT unnest(ARRAY['math', 'science', 'english', 'tpa', 'quran'])
    LOOP
      IF jsonb_typeof(v_exam_scores->v_field) IS DISTINCT FROM 'number'
        OR (v_exam_scores->>v_field)::NUMERIC < 0
        OR (v_exam_scores->>v_field)::NUMERIC > 100 THEN
        RAISE EXCEPTION 'Entry exam scores are invalid' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  IF v_stage = 'Accepted' AND (
    v_previous_stage NOT IN ('Interview', 'Accepted')
    OR
    jsonb_typeof(v_interview_scores) IS DISTINCT FROM 'object'
    OR NOT (v_interview_scores ?& ARRAY['academicPotential', 'personality', 'communication'])
  ) THEN
    RAISE EXCEPTION 'Interview evaluation must be complete before acceptance' USING ERRCODE = '23514';
  END IF;
  IF v_stage = 'Accepted' THEN
    FOR v_field IN SELECT unnest(ARRAY['academicPotential', 'personality', 'communication'])
    LOOP
      IF jsonb_typeof(v_interview_scores->v_field) IS DISTINCT FROM 'number'
        OR (v_interview_scores->>v_field)::NUMERIC < 1
        OR (v_interview_scores->>v_field)::NUMERIC > 5 THEN
        RAISE EXCEPTION 'Interview scores are invalid' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  v_updated := public.update_ppdb_candidate(
    p_tenant_id, p_candidate_id,
    COALESCE(p_core_patch, '{}'::jsonb),
    COALESCE(p_workflow_patch, '{}'::jsonb),
    COALESCE(p_documents_patch, '{}'::jsonb)
  );
  IF v_updated THEN
    INSERT INTO public.ppdb_candidate_admin_events (
      tenant_id, candidate_id, actor_user_id, event_type, from_stage, to_stage, changed_fields
    ) VALUES (
      p_tenant_id, p_candidate_id, p_actor_user_id, 'updated',
      v_previous_stage, v_stage, v_changed_fields
    );
  END IF;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB)
  TO service_role;

COMMENT ON TABLE public.ppdb_candidate_admin_events IS
  'Append-only metadata audit trail for tenant PPDB workflow changes; never stores candidate PII or score values.';
COMMENT ON FUNCTION public.update_ppdb_candidate_guarded(UUID, UUID, UUID, JSONB, JSONB, JSONB) IS
  'Validates the active tenant Admin, locks a candidate, checks stage evidence, applies the update, and appends a PII-free audit event atomically.';

COMMIT;
