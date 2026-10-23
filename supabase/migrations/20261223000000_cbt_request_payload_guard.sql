-- Bind CBT creation idempotency keys to the authenticated actor and the exact stored payload.
-- A retry is successful only when it represents the original question/exam request.
BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_cbt_question(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_question_id UUID,
  p_request_id UUID,
  p_question JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_id UUID;
  v_existing public.cbt_questions%ROWTYPE;
  v_options JSONB;
  v_correct INTEGER;
  v_item JSONB;
  v_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_question) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid CBT question input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'CBT tenant is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND role IN ('admin', 'super_admin')
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'CBT bank management requires an authorized tenant administrator' USING ERRCODE = '42501'; END IF;

  v_options := p_question->'options';
  BEGIN v_correct := (p_question->>'correctAnswer')::INTEGER; EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Correct answer index is invalid' USING ERRCODE = '22023'; END;
  IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CBT answer options must be an array' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(v_options) NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'CBT questions require between 2 and 8 answer options' USING ERRCODE = '22023'; END IF;
  IF COALESCE(length(btrim(p_question->>'subject')), 0) NOT BETWEEN 1 AND 150
    OR COALESCE(length(btrim(p_question->>'grade')), 0) NOT BETWEEN 1 AND 40
    OR COALESCE(length(btrim(p_question->>'template')), 0) NOT BETWEEN 1 AND 80
    OR COALESCE(length(btrim(p_question->>'questionHtml')), 0) NOT BETWEEN 1 AND 12000
    OR v_correct < 0 OR v_correct >= jsonb_array_length(v_options)
    OR COALESCE(length(p_question->>'explanation'), 0) > 4000
    OR COALESCE(p_question->>'difficulty', 'Medium') NOT IN ('Easy', 'Medium', 'Hard') THEN
    RAISE EXCEPTION 'CBT question fields are incomplete or invalid' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_options)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR length(btrim(v_item #>> '{}')) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Every answer option must contain 1 to 1,000 characters' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(COALESCE(p_question->'tags', '[]'::JSONB)) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Question tags must be an array' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(COALESCE(p_question->'tags', '[]'::JSONB)) > 30 THEN
    RAISE EXCEPTION 'Question has too many tags' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_question->'tags', '[]'::JSONB))
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' OR length(btrim(v_item #>> '{}')) > 50 THEN
      RAISE EXCEPTION 'Question tag is invalid' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_question_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-question:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0));
    SELECT * INTO v_existing FROM public.cbt_questions
    WHERE tenant_id = p_tenant_id AND client_request_id = p_request_id FOR UPDATE;
    IF FOUND THEN
      IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
        OR v_existing.source_system IS DISTINCT FROM 'supabase_runtime'
        OR v_existing.subject IS DISTINCT FROM btrim(p_question->>'subject')
        OR v_existing.grade IS DISTINCT FROM btrim(p_question->>'grade')
        OR v_existing.template IS DISTINCT FROM btrim(p_question->>'template')
        OR v_existing.question_html IS DISTINCT FROM p_question->>'questionHtml'
        OR v_existing.options IS DISTINCT FROM v_options
        OR v_existing.correct_answer IS DISTINCT FROM v_correct
        OR v_existing.explanation IS DISTINCT FROM COALESCE(p_question->>'explanation', '')
        OR v_existing.difficulty IS DISTINCT FROM COALESCE(p_question->>'difficulty', 'Medium')
        OR v_existing.tags IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_question->'tags', '[]'::JSONB)))
        OR v_existing.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'CBT question request ID was already used for a different actor or payload' USING ERRCODE = '23505';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'alreadyApplied', true);
    END IF;
    INSERT INTO public.cbt_questions(tenant_id, subject, grade, template, question_html, options, correct_answer,
      explanation, difficulty, tags, client_request_id, created_by, updated_by)
    VALUES (p_tenant_id, btrim(p_question->>'subject'), btrim(p_question->>'grade'), btrim(p_question->>'template'),
      p_question->>'questionHtml', v_options, v_correct, COALESCE(p_question->>'explanation', ''),
      COALESCE(p_question->>'difficulty', 'Medium'),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_question->'tags', '[]'::JSONB))),
      p_request_id, p_actor_user_id, p_actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM public.cbt_questions
    WHERE tenant_id = p_tenant_id AND id = p_question_id AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CBT question not found in this tenant' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.cbt_exam_questions relation
      JOIN public.cbt_exams exam ON exam.tenant_id = relation.tenant_id AND exam.id = relation.exam_id
      WHERE relation.tenant_id = p_tenant_id AND relation.question_id = p_question_id AND exam.status <> 'draft'
    ) THEN RAISE EXCEPTION 'Question is locked after an exam is published' USING ERRCODE = '23514'; END IF;
    UPDATE public.cbt_questions SET subject = btrim(p_question->>'subject'), grade = btrim(p_question->>'grade'),
      template = btrim(p_question->>'template'), question_html = p_question->>'questionHtml', options = v_options,
      correct_answer = v_correct, explanation = COALESCE(p_question->>'explanation', ''),
      difficulty = COALESCE(p_question->>'difficulty', 'Medium'),
      tags = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_question->'tags', '[]'::JSONB))),
      updated_by = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_question_id RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'alreadyApplied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_cbt_exam(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_request_id UUID,
  p_exam JSONB,
  p_question_ids UUID[],
  p_student_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_exam_id UUID;
  v_existing public.cbt_exams%ROWTYPE;
  v_existing_questions UUID[];
  v_existing_students UUID[];
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_count INTEGER;
  v_status TEXT;
  v_student UUID;
  v_sorted_students UUID[];
  v_order INTEGER := 0;
BEGIN
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND role IN ('admin', 'super_admin')
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
  FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'CBT exam management requires an authorized tenant administrator' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_exam) IS DISTINCT FROM 'object'
    OR COALESCE(length(btrim(p_exam->>'title')), 0) NOT BETWEEN 1 AND 180
    OR COALESCE(length(btrim(p_exam->>'subject')), 0) NOT BETWEEN 1 AND 150
    OR COALESCE(length(btrim(p_exam->>'grade')), 0) NOT BETWEEN 1 AND 40
    OR COALESCE(p_exam->>'status', 'draft') NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'CBT exam fields are incomplete or invalid' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_start := (p_exam->>'startsAt')::TIMESTAMPTZ;
    v_end := (p_exam->>'endsAt')::TIMESTAMPTZ;
    v_count := (p_exam->>'durationMinutes')::INTEGER;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'CBT exam date or duration is invalid' USING ERRCODE = '22023'; END;
  IF v_end <= v_start OR v_count NOT BETWEEN 1 AND 600
    OR COALESCE(cardinality(p_question_ids), 0) NOT BETWEEN 1 AND 500
    OR COALESCE(cardinality(p_student_ids), 0) NOT BETWEEN 1 AND 500
    OR (SELECT count(DISTINCT q.id) FROM unnest(p_question_ids) AS q(id)) <> cardinality(p_question_ids)
    OR (SELECT count(DISTINCT s.id) FROM unnest(p_student_ids) AS s(id)) <> cardinality(p_student_ids) THEN
    RAISE EXCEPTION 'CBT exam must have unique questions and students with valid schedule and duration' USING ERRCODE = '22023';
  END IF;
  v_status := COALESCE(p_exam->>'status', 'draft');
  SELECT array_agg(s.id ORDER BY s.id) INTO v_sorted_students FROM unnest(p_student_ids) AS s(id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-exam-create:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.cbt_exams
  WHERE tenant_id = p_tenant_id AND client_request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    SELECT COALESCE(array_agg(relation.question_id ORDER BY relation.display_order), '{}'::UUID[])
      INTO v_existing_questions
    FROM public.cbt_exam_questions relation
    WHERE relation.tenant_id = p_tenant_id AND relation.exam_id = v_existing.id;
    SELECT COALESCE(array_agg(assignment.student_id ORDER BY assignment.student_id), '{}'::UUID[])
      INTO v_existing_students
    FROM public.cbt_exam_assignments assignment
    WHERE assignment.tenant_id = p_tenant_id AND assignment.exam_id = v_existing.id;
    IF v_existing.created_by IS DISTINCT FROM p_actor_user_id
      OR v_existing.title IS DISTINCT FROM btrim(p_exam->>'title')
      OR v_existing.subject IS DISTINCT FROM btrim(p_exam->>'subject')
      OR v_existing.grade IS DISTINCT FROM btrim(p_exam->>'grade')
      OR v_existing.starts_at IS DISTINCT FROM v_start
      OR v_existing.ends_at IS DISTINCT FROM v_end
      OR v_existing.duration_minutes IS DISTINCT FROM v_count
      OR v_existing.passing_score IS DISTINCT FROM COALESCE((p_exam->>'passingScore')::NUMERIC, 75)
      OR v_existing.correct_points IS DISTINCT FROM COALESCE((p_exam->>'correctPoints')::NUMERIC, 1)
      OR v_existing.wrong_points IS DISTINCT FROM COALESCE((p_exam->>'wrongPoints')::NUMERIC, 0)
      OR v_existing.blank_points IS DISTINCT FROM COALESCE((p_exam->>'blankPoints')::NUMERIC, 0)
      OR v_existing.shuffle_questions IS DISTINCT FROM COALESCE((p_exam->>'shuffleQuestions')::BOOLEAN, false)
      OR v_existing.status IS DISTINCT FROM v_status
      OR v_existing_questions IS DISTINCT FROM p_question_ids
      OR v_existing_students IS DISTINCT FROM v_sorted_students THEN
      RAISE EXCEPTION 'CBT exam request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'alreadyApplied', true);
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_question_ids) q(id) LEFT JOIN public.cbt_questions question
      ON question.tenant_id = p_tenant_id AND question.id = q.id AND question.status = 'active'
      AND question.subject = btrim(p_exam->>'subject') AND question.grade = btrim(p_exam->>'grade')
      WHERE question.id IS NULL) THEN
    RAISE EXCEPTION 'Every exam question must be active and match its subject and grade' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_student_ids) s(id) LEFT JOIN public.students student
      ON student.tenant_id = p_tenant_id AND student.id = s.id
      AND lower(student.status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
      WHERE student.id IS NULL) THEN
    RAISE EXCEPTION 'Every exam participant must be an active student in this tenant' USING ERRCODE = '23503';
  END IF;
  IF v_status = 'published' THEN
  IF v_status = 'published' THEN
    FOREACH v_student IN ARRAY v_sorted_students LOOP
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'cbt-student-schedule:' || p_tenant_id::TEXT || ':' || v_student::TEXT, 0));
      IF EXISTS (
        SELECT 1 FROM public.cbt_exam_assignments assignment
        JOIN public.cbt_exams existing ON existing.tenant_id = assignment.tenant_id AND existing.id = assignment.exam_id
        WHERE assignment.tenant_id = p_tenant_id AND assignment.student_id = v_student
          AND existing.status = 'published' AND existing.starts_at < v_end AND existing.ends_at > v_start
      ) THEN RAISE EXCEPTION 'A student already has an overlapping published exam' USING ERRCODE = '23P01'; END IF;
    END LOOP;
  END IF;

  INSERT INTO public.cbt_exams(tenant_id, title, subject, grade, starts_at, ends_at, duration_minutes, passing_score,
    correct_points, wrong_points, blank_points, shuffle_questions, status, client_request_id, created_by, updated_by)
  VALUES (p_tenant_id, btrim(p_exam->>'title'), btrim(p_exam->>'subject'), btrim(p_exam->>'grade'),
    v_start, v_end, v_count, COALESCE((p_exam->>'passingScore')::NUMERIC, 75),
    COALESCE((p_exam->>'correctPoints')::NUMERIC, 1), COALESCE((p_exam->>'wrongPoints')::NUMERIC, 0),
    COALESCE((p_exam->>'blankPoints')::NUMERIC, 0), COALESCE((p_exam->>'shuffleQuestions')::BOOLEAN, false),
    v_status, p_request_id, p_actor_user_id, p_actor_user_id)
  RETURNING id INTO v_exam_id;
  INSERT INTO public.cbt_exam_questions(tenant_id, exam_id, question_id, display_order)
  SELECT p_tenant_id, v_exam_id, question_id, row_number() OVER () - 1
  FROM unnest(p_question_ids) WITH ORDINALITY AS q(question_id, ord) ORDER BY ord;
  FOREACH v_student IN ARRAY v_sorted_students LOOP
    INSERT INTO public.cbt_exam_assignments(tenant_id, exam_id, student_id, assigned_by)
    VALUES (p_tenant_id, v_exam_id, v_student, p_actor_user_id);
  END LOOP;
  RETURN jsonb_build_object('id', v_exam_id, 'alreadyApplied', false);
END;
$$;

COMMIT;
