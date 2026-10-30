-- Replace the unavailable JSON object-length call while preserving CBT answer validation.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_cbt_attempt_answers(p_tenant_id UUID, p_actor_user_id UUID, p_attempt_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id UUID;
  v_attempt public.cbt_attempts%ROWTYPE;
  v_pair RECORD;
  v_options JSONB;
  v_answer INTEGER;
  v_answer_count BIGINT;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN linked_santri_id::UUID ELSE NULL END INTO v_student_id FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' AND role = 'santri'
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
    AND linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  FOR SHARE;
  IF v_student_id IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid CBT answers' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_answer_count FROM jsonb_object_keys(p_answers);
  IF v_answer_count > 500 THEN RAISE EXCEPTION 'Too many CBT answers' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id
      AND lower(status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')) THEN
    RAISE EXCEPTION 'Student or CBT tenant is inactive' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_attempt FROM public.cbt_attempts
  WHERE tenant_id = p_tenant_id AND id = p_attempt_id AND student_id = v_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam attempt not found' USING ERRCODE = 'P0002'; END IF;
  IF v_attempt.submitted_at IS NOT NULL OR now() >= v_attempt.expires_at THEN
    RAISE EXCEPTION 'Exam attempt is closed' USING ERRCODE = '23514';
  END IF;
  FOR v_pair IN SELECT key, value FROM jsonb_each(p_answers)
  LOOP
    IF v_pair.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_pair.value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Answer contains an unknown question or invalid option' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_pair.key::UUID = ANY(v_attempt.question_order))
      OR (v_pair.value #>> '{}')::NUMERIC <> trunc((v_pair.value #>> '{}')::NUMERIC) THEN
      RAISE EXCEPTION 'Answer contains an unknown question or non-integral option' USING ERRCODE = '22023';
    END IF;
    v_answer := (v_pair.value #>> '{}')::INTEGER;
    SELECT options INTO v_options FROM public.cbt_questions
      WHERE tenant_id = p_tenant_id AND id = v_pair.key::UUID;
    IF v_answer < 0 OR v_answer >= jsonb_array_length(v_options) THEN
      RAISE EXCEPTION 'Selected option does not exist' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.cbt_attempts SET answers = p_answers, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_attempt_id;
  RETURN jsonb_build_object('saved', true, 'expiresAt', v_attempt.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cbt_attempt_answers(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_cbt_attempt_answers(UUID, UUID, UUID, JSONB) TO service_role;
COMMIT;
