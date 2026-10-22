-- Tenant-scoped Computer Based Test bank, exam assignments, and protected attempt lifecycle.
BEGIN;

CREATE TABLE public.cbt_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 150),
  grade TEXT NOT NULL CHECK (length(btrim(grade)) BETWEEN 1 AND 40),
  template TEXT NOT NULL CHECK (length(btrim(template)) BETWEEN 1 AND 80),
  question_html TEXT NOT NULL CHECK (length(btrim(question_html)) BETWEEN 1 AND 12000),
  options JSONB NOT NULL CHECK (CASE WHEN jsonb_typeof(options) = 'array' THEN jsonb_array_length(options) BETWEEN 2 AND 8 ELSE false END),
  correct_answer SMALLINT NOT NULL CHECK (correct_answer BETWEEN 0 AND 7),
  explanation TEXT NOT NULL DEFAULT '' CHECK (length(explanation) <= 4000),
  difficulty TEXT NOT NULL DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime', 'legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  client_request_id UUID,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (CASE WHEN jsonb_typeof(options) = 'array' THEN correct_answer < jsonb_array_length(options) ELSE false END),
  CHECK ((source_system = 'legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL)
      OR (source_system = 'supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL)),
  CHECK (source_record_id IS NULL OR length(btrim(source_record_id)) BETWEEN 1 AND 300),
  CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$')
);
CREATE INDEX cbt_questions_tenant_filter_idx ON public.cbt_questions(tenant_id, status, subject, grade, template);
CREATE UNIQUE INDEX cbt_questions_legacy_source_uq
  ON public.cbt_questions(tenant_id, source_system, source_record_id)
  WHERE source_system = 'legacy_firestore';

CREATE TABLE public.cbt_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 150),
  grade TEXT NOT NULL CHECK (length(btrim(grade)) BETWEEN 1 AND 40),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK (passing_score BETWEEN 0 AND 100),
  correct_points NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (correct_points BETWEEN 0 AND 100),
  wrong_points NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (wrong_points BETWEEN -100 AND 100),
  blank_points NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (blank_points BETWEEN -100 AND 100),
  shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at)
);
CREATE INDEX cbt_exams_tenant_schedule_idx ON public.cbt_exams(tenant_id, starts_at DESC, status);

CREATE TABLE public.cbt_exam_questions (
  tenant_id UUID NOT NULL,
  exam_id UUID NOT NULL,
  question_id UUID NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (tenant_id, exam_id, question_id),
  UNIQUE (tenant_id, exam_id, display_order),
  FOREIGN KEY (tenant_id, exam_id) REFERENCES public.cbt_exams(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, question_id) REFERENCES public.cbt_questions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.cbt_exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  exam_id UUID NOT NULL,
  student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'missed')),
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, exam_id, student_id),
  FOREIGN KEY (tenant_id, exam_id) REFERENCES public.cbt_exams(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX cbt_assignments_student_idx ON public.cbt_exam_assignments(tenant_id, student_id, status, assigned_at DESC);

CREATE TABLE public.cbt_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  assignment_id UUID NOT NULL,
  exam_id UUID NOT NULL,
  student_id UUID NOT NULL,
  question_order UUID[] NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  correct_count INTEGER,
  wrong_count INTEGER,
  blank_count INTEGER,
  score NUMERIC(7,2),
  passed BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, assignment_id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES public.cbt_exam_assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, exam_id) REFERENCES public.cbt_exams(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  CHECK (cardinality(question_order) BETWEEN 1 AND 500),
  CHECK (expires_at > started_at),
  CHECK ((submitted_at IS NULL AND correct_count IS NULL AND wrong_count IS NULL AND blank_count IS NULL AND score IS NULL AND passed IS NULL)
      OR (submitted_at IS NOT NULL AND correct_count >= 0 AND wrong_count >= 0 AND blank_count >= 0 AND score IS NOT NULL AND passed IS NOT NULL))
);
CREATE INDEX cbt_attempts_student_idx ON public.cbt_attempts(tenant_id, student_id, submitted_at DESC);

CREATE TABLE public.cbt_legacy_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  imported_count INTEGER NOT NULL CHECK (imported_count >= 0),
  skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, snapshot_fingerprint),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);

DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['cbt_questions', 'cbt_exams', 'cbt_exam_questions', 'cbt_exam_assignments', 'cbt_attempts', 'cbt_legacy_import_batches']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END $$;

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
    SELECT id INTO v_id FROM public.cbt_questions WHERE tenant_id = p_tenant_id AND client_request_id = p_request_id;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'alreadyApplied', true); END IF;
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

CREATE OR REPLACE FUNCTION public.import_legacy_cbt_questions(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_snapshot_fingerprint TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_item JSONB;
  v_question JSONB;
  v_source_id TEXT;
  v_fingerprint TEXT;
  v_existing_fingerprint TEXT;
  v_options JSONB;
  v_correct INTEGER;
  v_imported INTEGER := 0;
  v_skipped INTEGER := 0;
  v_source_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_snapshot_fingerprint IS NULL
    OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid legacy CBT import input' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 3000 THEN RAISE EXCEPTION 'Legacy CBT import exceeds the safe record limit' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'CBT tenant is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND role IN ('admin', 'super_admin')
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'CBT import requires an authorized tenant administrator' USING ERRCODE = '42501'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-legacy-import:' || p_tenant_id::TEXT, 0));
  IF EXISTS (SELECT 1 FROM public.cbt_legacy_import_batches
    WHERE tenant_id = p_tenant_id AND snapshot_fingerprint = p_snapshot_fingerprint) THEN
    RETURN (SELECT jsonb_build_object('imported', imported_count, 'skipped', skipped_count, 'alreadyApplied', true)
      FROM public.cbt_legacy_import_batches WHERE tenant_id = p_tenant_id AND snapshot_fingerprint = p_snapshot_fingerprint);
  END IF;
  v_source_count := jsonb_array_length(p_items);

  IF EXISTS (
    SELECT value->>'sourceRecordId' FROM jsonb_array_elements(p_items)
    GROUP BY value->>'sourceRecordId' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Legacy CBT snapshot contains duplicate source IDs' USING ERRCODE = '23505'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_source_id := btrim(v_item->>'sourceRecordId');
    v_fingerprint := v_item->>'sourceFingerprint';
    v_question := v_item->'question';
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR v_source_id IS NULL OR length(v_source_id) NOT BETWEEN 1 AND 300
      OR v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{64}$'
      OR jsonb_typeof(v_question) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Legacy CBT source record is invalid' USING ERRCODE = '22023';
    END IF;
    v_options := v_question->'options';
    BEGIN v_correct := (v_question->>'correctAnswer')::INTEGER; EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Legacy CBT answer key is invalid' USING ERRCODE = '22023'; END;
    IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Legacy CBT answer options must be an array' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(v_options) NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'Legacy CBT question option count is invalid' USING ERRCODE = '22023'; END IF;
    IF COALESCE(length(btrim(v_question->>'subject')), 0) NOT BETWEEN 1 AND 150
      OR COALESCE(length(btrim(v_question->>'grade')), 0) NOT BETWEEN 1 AND 40
      OR COALESCE(length(btrim(v_question->>'template')), 0) NOT BETWEEN 1 AND 80
      OR COALESCE(length(btrim(v_question->>'questionHtml')), 0) NOT BETWEEN 1 AND 12000
      OR v_correct < 0 OR v_correct >= jsonb_array_length(v_options)
      OR COALESCE(length(v_question->>'explanation'), 0) > 4000
      OR COALESCE(v_question->>'difficulty', 'Medium') NOT IN ('Easy', 'Medium', 'Hard') THEN
      RAISE EXCEPTION 'Legacy CBT question fields are incomplete or invalid' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(v_question->'tags', '[]'::JSONB)) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Legacy CBT question tags are invalid' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(COALESCE(v_question->'tags', '[]'::JSONB)) > 30 THEN RAISE EXCEPTION 'Legacy CBT question has too many tags' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_question->'tags', '[]'::JSONB)) tag(value)
      WHERE jsonb_typeof(tag.value) IS DISTINCT FROM 'string' OR length(btrim(tag.value #>> '{}')) > 50) THEN
      RAISE EXCEPTION 'Legacy CBT question tag is invalid' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_options) opt(value)
      WHERE jsonb_typeof(opt.value) IS DISTINCT FROM 'string'
        OR length(btrim(opt.value #>> '{}')) NOT BETWEEN 1 AND 1000) THEN
      RAISE EXCEPTION 'Legacy CBT answer option is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT source_fingerprint INTO v_existing_fingerprint FROM public.cbt_questions
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_firestore' AND source_record_id = v_source_id;
    IF FOUND THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'Legacy CBT source changed after preview' USING ERRCODE = '23514';
      END IF;
      v_skipped := v_skipped + 1;
    ELSE
      INSERT INTO public.cbt_questions(tenant_id, subject, grade, template, question_html, options, correct_answer,
        explanation, difficulty, tags, status, source_system, source_record_id, source_fingerprint, created_by, updated_by)
      VALUES (p_tenant_id, btrim(v_question->>'subject'), btrim(v_question->>'grade'), btrim(v_question->>'template'),
        v_question->>'questionHtml', v_options, v_correct, COALESCE(v_question->>'explanation', ''),
        COALESCE(v_question->>'difficulty', 'Medium'),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_question->'tags', '[]'::JSONB))),
        CASE WHEN COALESCE(v_question->>'status', 'active') = 'archived' THEN 'archived' ELSE 'active' END,
        'legacy_firestore', v_source_id, v_fingerprint, p_actor_user_id, p_actor_user_id);
      v_imported := v_imported + 1;
    END IF;
  END LOOP;

  INSERT INTO public.cbt_legacy_import_batches(tenant_id, snapshot_fingerprint, source_count, imported_count, skipped_count, created_by)
  VALUES (p_tenant_id, p_snapshot_fingerprint, v_source_count, v_imported, v_skipped, p_actor_user_id);
  RETURN jsonb_build_object('imported', v_imported, 'skipped', v_skipped, 'alreadyApplied', false);
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
  v_status := COALESCE(p_exam->>'status', 'draft');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-exam-create:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0));
  SELECT id INTO v_exam_id FROM public.cbt_exams WHERE tenant_id = p_tenant_id AND client_request_id = p_request_id;
  IF v_exam_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_exam_id, 'alreadyApplied', true); END IF;
  SELECT array_agg(s.id ORDER BY s.id) INTO v_sorted_students FROM unnest(p_student_ids) AS s(id);
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
    'startsAt', v_exam.starts_at, 'expiresAt', v_attempt.expires_at, 'questions', COALESCE(v_questions, '[]'::JSONB),
    'answers', v_attempt.answers, 'expired', now() >= v_attempt.expires_at, 'submitted', false);
END;
$$;

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
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN linked_santri_id::UUID ELSE NULL END INTO v_student_id FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' AND role = 'santri'
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
    AND linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  FOR SHARE;
  IF v_student_id IS NULL OR jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid CBT answers' USING ERRCODE = '22023'; END IF;
  IF jsonb_object_length(p_answers) > 500 THEN RAISE EXCEPTION 'Too many CBT answers' USING ERRCODE = '22023'; END IF;
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

CREATE OR REPLACE FUNCTION public.submit_cbt_attempt(p_tenant_id UUID, p_actor_user_id UUID, p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_id UUID;
  v_attempt public.cbt_attempts%ROWTYPE;
  v_exam public.cbt_exams%ROWTYPE;
  v_question_id UUID;
  v_selected INTEGER;
  v_correct INTEGER := 0;
  v_wrong INTEGER := 0;
  v_blank INTEGER := 0;
  v_score NUMERIC(7,2);
  v_total INTEGER;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN linked_santri_id::UUID ELSE NULL END INTO v_student_id FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' AND role = 'santri'
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
    AND linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  FOR SHARE;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Active student profile is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id
      AND lower(status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')) THEN
    RAISE EXCEPTION 'Student or CBT tenant is inactive' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_attempt FROM public.cbt_attempts
  WHERE tenant_id = p_tenant_id AND id = p_attempt_id AND student_id = v_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam attempt not found' USING ERRCODE = 'P0002'; END IF;
  IF v_attempt.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('submitted', true, 'score', v_attempt.score, 'passed', v_attempt.passed,
      'correct', v_attempt.correct_count, 'wrong', v_attempt.wrong_count, 'blank', v_attempt.blank_count);
  END IF;
  SELECT * INTO v_exam FROM public.cbt_exams WHERE tenant_id = p_tenant_id AND id = v_attempt.exam_id;
  v_total := cardinality(v_attempt.question_order);
  FOREACH v_question_id IN ARRAY v_attempt.question_order LOOP
    IF NOT (v_attempt.answers ? v_question_id::TEXT) THEN
      v_blank := v_blank + 1;
    ELSE
      v_selected := (v_attempt.answers->>v_question_id::TEXT)::INTEGER;
      IF EXISTS (SELECT 1 FROM public.cbt_questions WHERE tenant_id = p_tenant_id AND id = v_question_id AND correct_answer = v_selected) THEN
        v_correct := v_correct + 1;
      ELSE
        v_wrong := v_wrong + 1;
      END IF;
    END IF;
  END LOOP;
  v_score := CASE WHEN v_exam.correct_points <= 0 THEN 0 ELSE greatest(0, least(100,
    round(100 * (v_correct * v_exam.correct_points + v_wrong * v_exam.wrong_points + v_blank * v_exam.blank_points)
      / NULLIF(v_total * v_exam.correct_points, 0), 2))) END;
  UPDATE public.cbt_attempts SET submitted_at = LEAST(now(), v_attempt.expires_at), correct_count = v_correct, wrong_count = v_wrong,
    blank_count = v_blank, score = v_score, passed = v_score >= v_exam.passing_score, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_attempt_id;
  UPDATE public.cbt_exam_assignments SET status = 'completed'
  WHERE tenant_id = p_tenant_id AND id = v_attempt.assignment_id;
  RETURN jsonb_build_object('submitted', true, 'score', v_score, 'passed', v_score >= v_exam.passing_score,
    'correct', v_correct, 'wrong', v_wrong, 'blank', v_blank);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_cbt_question(UUID, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cbt_question(UUID, UUID, UUID, UUID, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.import_legacy_cbt_questions(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_cbt_questions(UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.create_cbt_exam(UUID, UUID, UUID, JSONB, UUID[], UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_cbt_exam(UUID, UUID, UUID, JSONB, UUID[], UUID[]) TO service_role;
REVOKE ALL ON FUNCTION public.start_cbt_attempt(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_cbt_attempt(UUID, UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.save_cbt_attempt_answers(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_cbt_attempt_answers(UUID, UUID, UUID, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.submit_cbt_attempt(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cbt_attempt(UUID, UUID, UUID) TO service_role;

COMMENT ON TABLE public.cbt_attempts IS
  'Tenant-scoped CBT attempts. Correct answers are never returned by the student start API; scoring is calculated in a server-side transaction on submit.';
COMMIT;
