-- Make LMS assignment submissions replay-safe and keep an append-only grade correction trail.
BEGIN;

CREATE TABLE public.lms_submission_requests (
  tenant_id UUID NOT NULL,
  request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  assignment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  payload_fingerprint BYTEA NOT NULL CHECK (octet_length(payload_fingerprint) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES public.lms_assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, submission_id) REFERENCES public.lms_submissions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.lms_submission_grade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  request_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  previous_score NUMERIC(6,2),
  previous_feedback TEXT NOT NULL DEFAULT '',
  score NUMERIC(6,2) NOT NULL CHECK (score BETWEEN 0 AND 1000),
  feedback TEXT NOT NULL DEFAULT '' CHECK (length(feedback) <= 5000),
  payload_fingerprint BYTEA NOT NULL CHECK (octet_length(payload_fingerprint) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_id),
  FOREIGN KEY (tenant_id, submission_id) REFERENCES public.lms_submissions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (previous_score IS NULL OR previous_score BETWEEN 0 AND 1000)
);
CREATE INDEX lms_grade_events_submission_idx
  ON public.lms_submission_grade_events(tenant_id, submission_id, created_at DESC);

ALTER TABLE public.lms_submission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_submission_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lms_submission_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.lms_submission_requests TO service_role;

ALTER TABLE public.lms_submission_grade_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_submission_grade_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lms_submission_grade_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.lms_submission_grade_events TO service_role;

CREATE OR REPLACE FUNCTION public.reject_lms_immutable_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'LMS idempotency and grade audit ledgers are immutable' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.reject_lms_immutable_ledger_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lms_submission_requests_immutable
  BEFORE UPDATE OR DELETE ON public.lms_submission_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_lms_immutable_ledger_mutation();
CREATE TRIGGER lms_submission_grade_events_immutable
  BEFORE UPDATE OR DELETE ON public.lms_submission_grade_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_lms_immutable_ledger_mutation();

DROP FUNCTION IF EXISTS public.submit_lms_assignment(UUID, UUID, UUID, TEXT, TEXT);
CREATE FUNCTION public.submit_lms_assignment(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_request_id UUID,
  p_assignment_id UUID,
  p_text TEXT,
  p_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student UUID;
  v_role TEXT;
  v_assignment public.lms_assignments%ROWTYPE;
  v_existing_request public.lms_submission_requests%ROWTYPE;
  v_submission_id UUID;
  v_submission_score NUMERIC(6,2);
  v_text TEXT := COALESCE(p_text, '');
  v_url TEXT := COALESCE(p_url, '');
  v_fingerprint BYTEA;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR p_assignment_id IS NULL
    OR length(v_text) > 12000 OR length(v_url) > 2048
    OR (length(btrim(v_text)) = 0 AND length(btrim(v_url)) = 0)
    OR (length(btrim(v_url)) > 0 AND v_url !~ '^https://') THEN
    RAISE EXCEPTION 'Invalid LMS assignment submission' USING ERRCODE = '22023';
  END IF;

  SELECT role,
    CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN linked_santri_id::UUID ELSE NULL END
  INTO v_role, v_student
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND role = 'santri' AND status = 'active'
    AND (NOT (module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms', 'false') = 'true')
  FOR SHARE;
  IF v_role IS NULL OR v_student IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Active LMS student profile and tenant are required' USING ERRCODE = '42501';
  END IF;

  v_fingerprint := extensions.digest(
    convert_to(jsonb_build_object('responseText', v_text, 'resourceUrl', v_url)::TEXT, 'UTF8'),
    'sha256'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lms-submission-request:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0)
  );
  SELECT * INTO v_existing_request FROM public.lms_submission_requests
  WHERE tenant_id = p_tenant_id AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing_request.assignment_id IS DISTINCT FROM p_assignment_id
      OR v_existing_request.student_id IS DISTINCT FROM v_student
      OR v_existing_request.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'LMS submission request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_existing_request.submission_id, 'alreadyApplied', true);
  END IF;

  SELECT assignment.* INTO v_assignment
  FROM public.lms_assignments assignment
  JOIN public.lms_enrollments enrollment
    ON enrollment.tenant_id = assignment.tenant_id AND enrollment.course_id = assignment.course_id
    AND enrollment.student_id = v_student AND enrollment.status = 'active'
  JOIN public.lms_courses course
    ON course.tenant_id = assignment.tenant_id AND course.id = assignment.course_id AND course.status = 'published'
  WHERE assignment.tenant_id = p_tenant_id AND assignment.id = p_assignment_id AND assignment.status = 'published'
  FOR SHARE OF assignment, enrollment, course;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE tenant_id = p_tenant_id AND id = v_student
      AND lower(status) NOT IN ('archived','alumni','graduated','inactive','nonaktif','dikeluarkan')
  ) THEN
    RAISE EXCEPTION 'LMS assignment is not available to this student' USING ERRCODE = '42501';
  END IF;
  IF v_assignment.due_at IS NOT NULL AND now() >= v_assignment.due_at AND NOT v_assignment.allow_late THEN
    RAISE EXCEPTION 'LMS assignment deadline has passed' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lms-submission:' || p_tenant_id::TEXT || ':' || p_assignment_id::TEXT || ':' || v_student::TEXT, 0)
  );
  SELECT id, score INTO v_submission_id, v_submission_score
  FROM public.lms_submissions
  WHERE tenant_id = p_tenant_id AND assignment_id = p_assignment_id AND student_id = v_student
  FOR UPDATE;
  IF v_submission_id IS NOT NULL THEN
    IF v_submission_score IS NOT NULL THEN
      RAISE EXCEPTION 'A graded LMS submission cannot be replaced' USING ERRCODE = '23514';
    END IF;
    UPDATE public.lms_submissions
      SET response_text = v_text, resource_url = v_url, submitted_at = now(), updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_submission_id;
  ELSE
    INSERT INTO public.lms_submissions(tenant_id, assignment_id, student_id, response_text, resource_url)
    VALUES (p_tenant_id, p_assignment_id, v_student, v_text, v_url)
    RETURNING id INTO v_submission_id;
  END IF;

  INSERT INTO public.lms_submission_requests(
    tenant_id, request_id, actor_user_id, assignment_id, student_id, submission_id, payload_fingerprint
  ) VALUES (p_tenant_id, p_request_id, p_actor_user_id, p_assignment_id, v_student, v_submission_id, v_fingerprint);
  RETURN jsonb_build_object('id', v_submission_id, 'alreadyApplied', false);
END;
$$;

DROP FUNCTION IF EXISTS public.grade_lms_submission(UUID, UUID, UUID, NUMERIC, TEXT);
CREATE FUNCTION public.grade_lms_submission(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_request_id UUID,
  p_submission_id UUID,
  p_score NUMERIC,
  p_feedback TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing_event public.lms_submission_grade_events%ROWTYPE;
  v_score NUMERIC(6,2);
  v_feedback TEXT := COALESCE(p_feedback, '');
  v_max_score NUMERIC(6,2);
  v_previous_score NUMERIC(6,2);
  v_previous_feedback TEXT;
  v_id UUID;
  v_fingerprint BYTEA;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR p_submission_id IS NULL
    OR p_score IS NULL OR length(v_feedback) > 5000 THEN
    RAISE EXCEPTION 'LMS grading payload is invalid' USING ERRCODE = '22023';
  END IF;
  v_score := p_score::NUMERIC(6,2);
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND role IN ('admin','super_admin','ustadz')
    AND (NOT (module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false') = 'true')
  FOR SHARE;
  IF v_role IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'LMS grading is not authorized for this tenant' USING ERRCODE = '42501';
  END IF;

  v_fingerprint := extensions.digest(
    convert_to(jsonb_build_object('submissionId', p_submission_id, 'score', v_score, 'feedback', v_feedback)::TEXT, 'UTF8'),
    'sha256'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lms-grade-request:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0)
  );
  SELECT * INTO v_existing_event FROM public.lms_submission_grade_events
  WHERE tenant_id = p_tenant_id AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing_event.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing_event.submission_id IS DISTINCT FROM p_submission_id
      OR v_existing_event.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'LMS grade request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_existing_event.submission_id, 'score', v_existing_event.score, 'alreadyApplied', true);
  END IF;

  SELECT submission.score, submission.feedback, assignment.max_score
  INTO v_previous_score, v_previous_feedback, v_max_score
  FROM public.lms_submissions submission
  JOIN public.lms_assignments assignment
    ON assignment.tenant_id = submission.tenant_id AND assignment.id = submission.assignment_id
  JOIN public.lms_courses course
    ON course.tenant_id = assignment.tenant_id AND course.id = assignment.course_id
  WHERE submission.tenant_id = p_tenant_id AND submission.id = p_submission_id
    AND (v_role IN ('admin','super_admin') OR course.instructor_user_id = p_actor_user_id)
  FOR UPDATE OF submission;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found or not assigned to this teacher' USING ERRCODE = 'P0002'; END IF;
  IF v_score < 0 OR v_score > v_max_score THEN
    RAISE EXCEPTION 'Score is outside the assignment range' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.lms_submission_grade_events(
    tenant_id, request_id, submission_id, actor_user_id, previous_score, previous_feedback, score, feedback, payload_fingerprint
  ) VALUES (
    p_tenant_id, p_request_id, p_submission_id, p_actor_user_id,
    v_previous_score, COALESCE(v_previous_feedback, ''), v_score, v_feedback, v_fingerprint
  );
  UPDATE public.lms_submissions
  SET score = v_score, feedback = v_feedback, graded_by = p_actor_user_id, graded_at = now(), updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_submission_id
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'score', v_score, 'alreadyApplied', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_lms_assignment(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lms_assignment(UUID, UUID, UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.grade_lms_submission(UUID, UUID, UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_lms_submission(UUID, UUID, UUID, UUID, NUMERIC, TEXT) TO service_role;

COMMIT;
