-- CBT creation retries must replay only the original actor and exact payload.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(13);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2300000-0000-4000-8000-000000000009','cbt-idempotency-test','CBT Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2300000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-idempotency-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2300000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-idempotency-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2300000-0000-4000-8000-000000000011','e2300000-0000-4000-8000-000000000009',
   'cbt-idempotency-one@test.invalid','CBT Admin One','admin','active','{"cbt":true}'),
  ('e2300000-0000-4000-8000-000000000012','e2300000-0000-4000-8000-000000000009',
   'cbt-idempotency-two@test.invalid','CBT Admin Two','admin','active','{"cbt":true}');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('e2300000-0000-4000-8000-000000000101','e2300000-0000-4000-8000-000000000009',
  'CID001','CBT Test Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e2300000-0000-4000-8000-000000000201','e2300000-0000-4000-8000-000000000009',
  'e2300000-0000-4000-8000-000000000101','9230000001','CBT Test Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

CREATE TEMP TABLE cbt_question_payload AS
SELECT '{"subject":"Matematika","grade":"VII","template":"Idempotency","questionHtml":"2 + 2 = ?","options":["3","4"],"correctAnswer":1,"explanation":"Empat","difficulty":"Easy","tags":["aritmetika"]}'::jsonb AS payload;
SET LOCAL ROLE service_role;

CREATE TEMP TABLE cbt_question_first AS
SELECT public.upsert_cbt_question(
  'e2300000-0000-4000-8000-000000000009',
  'e2300000-0000-4000-8000-000000000011',
  NULL,
  'e2300000-0000-4000-8000-000000000301',
  (SELECT payload FROM cbt_question_payload)
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM cbt_question_first),'false',
  'first question request creates a question');
SELECT is(public.upsert_cbt_question(
  'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',NULL,
  'e2300000-0000-4000-8000-000000000301',(SELECT payload FROM cbt_question_payload)
)->>'alreadyApplied','true','identical question retry replays');
SELECT is(public.upsert_cbt_question(
  'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',NULL,
  'e2300000-0000-4000-8000-000000000301',(SELECT payload FROM cbt_question_payload)
)->>'id',(SELECT result->>'id' FROM cbt_question_first),
  'identical question retry returns the original ID');
SELECT throws_ok(
  $$SELECT public.upsert_cbt_question(
    'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',NULL,
    'e2300000-0000-4000-8000-000000000301',
    jsonb_set((SELECT payload FROM cbt_question_payload),'{questionHtml}','"3 + 3 = ?"')
  )$$,
  '23505','CBT question request ID was already used for a different actor or payload',
  'changed question content cannot reuse a request ID'
);
SELECT throws_ok(
  $$SELECT public.upsert_cbt_question(
    'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000012',NULL,
    'e2300000-0000-4000-8000-000000000301',(SELECT payload FROM cbt_question_payload)
  )$$,
  '23505','CBT question request ID was already used for a different actor or payload',
  'another administrator cannot replay the question request ID'
);

CREATE TEMP TABLE cbt_exam_payload AS
SELECT jsonb_build_object(
  'title','Ujian Idempotency','subject','Matematika','grade','VII',
  'startsAt','2099-03-01T01:00:00Z','endsAt','2099-03-01T02:00:00Z',
  'durationMinutes',45,'passingScore',75,'correctPoints',1,'wrongPoints',0,
  'blankPoints',0,'shuffleQuestions',false,'status','draft'
) AS payload;
CREATE TEMP TABLE cbt_exam_first AS
SELECT public.create_cbt_exam(
  'e2300000-0000-4000-8000-000000000009',
  'e2300000-0000-4000-8000-000000000011',
  'e2300000-0000-4000-8000-000000000401',
  (SELECT payload FROM cbt_exam_payload),
  ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
  ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM cbt_exam_first),'false',
  'first exam request creates an exam');
SELECT is(public.create_cbt_exam(
  'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',
  'e2300000-0000-4000-8000-000000000401',(SELECT payload FROM cbt_exam_payload),
  ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
  ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
)->>'alreadyApplied','true','identical exam retry replays');
SELECT is(public.create_cbt_exam(
  'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',
  'e2300000-0000-4000-8000-000000000401',(SELECT payload FROM cbt_exam_payload),
  ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
  ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
)->>'id',(SELECT result->>'id' FROM cbt_exam_first),
  'identical exam retry returns the original ID');
SELECT throws_ok(
  $$SELECT public.create_cbt_exam(
    'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',
    'e2300000-0000-4000-8000-000000000401',
    jsonb_set((SELECT payload FROM cbt_exam_payload),'{title}','"Changed exam"'),
    ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
    ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
  )$$,
  '23505','CBT exam request ID was already used for a different actor or payload',
  'changed exam content cannot reuse a request ID'
);
SELECT throws_ok(
  $$SELECT public.create_cbt_exam(
    'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000012',
    'e2300000-0000-4000-8000-000000000401',(SELECT payload FROM cbt_exam_payload),
    ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
    ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
  )$$,
  '23505','CBT exam request ID was already used for a different actor or payload',
  'another administrator cannot replay the exam request ID'
);

UPDATE public.cbt_questions SET status='archived'
WHERE tenant_id='e2300000-0000-4000-8000-000000000009'
  AND id=(SELECT (result->>'id')::uuid FROM cbt_question_first);
UPDATE public.students SET status='inactive'
WHERE tenant_id='e2300000-0000-4000-8000-000000000009'
  AND id='e2300000-0000-4000-8000-000000000201';
SELECT is(public.create_cbt_exam(
  'e2300000-0000-4000-8000-000000000009','e2300000-0000-4000-8000-000000000011',
  'e2300000-0000-4000-8000-000000000401',(SELECT payload FROM cbt_exam_payload),
  ARRAY[(SELECT (result->>'id')::uuid FROM cbt_question_first)],
  ARRAY['e2300000-0000-4000-8000-000000000201'::uuid]
)->>'alreadyApplied','true',
  'an identical retry remains safe after referenced records change state');
SELECT is((SELECT count(*)::integer FROM public.cbt_questions
  WHERE tenant_id='e2300000-0000-4000-8000-000000000009'),1,
  'conflicting question retries create no duplicate question');
SELECT is((SELECT count(*)::integer FROM public.cbt_exams
  WHERE tenant_id='e2300000-0000-4000-8000-000000000009'),1,
  'conflicting exam retries create no duplicate exam');

SELECT * FROM finish();
ROLLBACK;
