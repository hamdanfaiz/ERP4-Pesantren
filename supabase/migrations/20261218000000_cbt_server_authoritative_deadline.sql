-- Give CBT clients a database clock anchor so local device clock drift cannot expire exams early.
BEGIN;

CREATE OR REPLACE FUNCTION public.start_cbt_attempt(p_tenant_id UUID, p_actor_user_id UUID, p_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id UUID;
  v_assignment public.cbt_exam_assignments%ROWTYPE;
  v_exam public.cbt_exams%ROWTYPE;
  v_attempt public.cbt_attempts%ROWTYPE;
  v_order UUID[];
  v_expiry TIMESTAMPTZ;
  v_questions JSONB;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN linked_santri_id::UUID ELSE NULL END INTO v_student_id FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' AND role = 'santri'
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
    AND linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  FOR SHARE;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Active student profile with a linked student record is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id
      AND lower(status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')) THEN
    RAISE EXCEPTION 'Student or CBT tenant is inactive' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_assignment FROM public.cbt_exam_assignments
  WHERE tenant_id = p_tenant_id AND exam_id = p_exam_id AND student_id = v_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam assignment not found' USING ERRCODE = 'P0002'; END IF;
  IF v_assignment.status IN ('completed', 'missed') THEN RAISE EXCEPTION 'Exam assignment is closed' USING ERRCODE = '23514'; END IF;
  SELECT * INTO v_exam FROM public.cbt_exams
  WHERE tenant_id = p_tenant_id AND id = p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam is not published' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_attempt FROM public.cbt_attempts WHERE tenant_id = p_tenant_id AND assignment_id = v_assignment.id FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Exam attempt has already been submitted' USING ERRCODE = '23514'; END IF;
  ELSE
    IF v_exam.status <> 'published' THEN RAISE EXCEPTION 'Exam is not published' USING ERRCODE = '42501'; END IF;
  IF now() < v_exam.starts_at OR now() >= v_exam.ends_at THEN RAISE EXCEPTION 'Exam is outside its scheduled window' USING ERRCODE = '42501'; END IF;
    SELECT array_agg(q.question_id ORDER BY CASE WHEN v_exam.shuffle_questions THEN random() END, q.display_order)
    INTO v_order FROM public.cbt_exam_questions q
    WHERE q.tenant_id = p_tenant_id AND q.exam_id = p_exam_id;
    IF COALESCE(cardinality(v_order), 0) = 0 THEN RAISE EXCEPTION 'Published exam has no questions' USING ERRCODE = '23514'; END IF;
    v_expiry := LEAST(v_exam.ends_at, now() + make_interval(mins => v_exam.duration_minutes));
    INSERT INTO public.cbt_attempts(tenant_id, assignment_id, exam_id, student_id, question_order, expires_at)
    VALUES (p_tenant_id, v_assignment.id, p_exam_id, v_student_id, v_order, v_expiry)
    RETURNING * INTO v_attempt;
    UPDATE public.cbt_exam_assignments SET status = 'in_progress' WHERE tenant_id = p_tenant_id AND id = v_assignment.id;
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'id', question.id, 'text', question.question_html, 'options', question.options, 'subject', question.subject
  ) ORDER BY array_position(v_attempt.question_order, question.id))
  INTO v_questions
  FROM public.cbt_questions question WHERE question.tenant_id = p_tenant_id AND question.id = ANY(v_attempt.question_order);
  RETURN jsonb_build_object('attemptId', v_attempt.id, 'examId', v_exam.id, 'title', v_exam.title,
    'startsAt', v_exam.starts_at, 'expiresAt', v_attempt.expires_at, 'serverNow', now(), 'questions', COALESCE(v_questions, '[]'::JSONB),
    'answers', v_attempt.answers, 'expired', now() >= v_attempt.expires_at, 'submitted', false);
END;
$$;

COMMENT ON FUNCTION public.start_cbt_attempt(UUID, UUID, UUID) IS
  'Starts or resumes a tenant-scoped attempt and returns database serverNow for authoritative client countdowns.';

COMMIT;
