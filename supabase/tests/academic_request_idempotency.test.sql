-- Synthetic retries must not report success when an academic request key is reused.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(5);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e1900000-0000-4000-8000-000000000009','academic-idempotency-test','Academic Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'academic-idempotency-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e1900000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'academic-idempotency-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000009',
   'academic-idempotency-one@test.invalid','Academic Admin One','admin','active','{"academic":true}'),
  ('e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000009',
   'academic-idempotency-two@test.invalid','Academic Admin Two','admin','active','{"academic":true}');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('e1900000-0000-4000-8000-000000000101','e1900000-0000-4000-8000-000000000009',
  'AID001','Academic Test Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e1900000-0000-4000-8000-000000000201','e1900000-0000-4000-8000-000000000009',
  'e1900000-0000-4000-8000-000000000101','9190000001','Academic Test Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.save_academic_record(
    'e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000011',
    'assessment',NULL,'e1900000-0000-4000-8000-000000000501',
    '{"studentId":"e1900000-0000-4000-8000-000000000201","studentName":"Academic Test Student","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb
  )->>'alreadyApplied',
  'false',
  'first assessment write creates a record'
);
SELECT is(
  public.save_academic_record(
    'e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000011',
    'assessment',NULL,'e1900000-0000-4000-8000-000000000501',
    '{"studentId":"e1900000-0000-4000-8000-000000000201","studentName":"Academic Test Student","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb
  )->>'alreadyApplied',
  'true',
  'identical assessment retry replays its original record'
);
SELECT throws_ok(
  $$SELECT public.save_academic_record(
    'e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000011',
    'assessment',NULL,'e1900000-0000-4000-8000-000000000501',
    '{"studentId":"e1900000-0000-4000-8000-000000000201","studentName":"Academic Test Student","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":91}'::jsonb
  )$$,
  '23505',
  'Academic request ID was already used for a different actor or payload',
  'request key reuse with changed assessment content is rejected'
);
SELECT throws_ok(
  $$SELECT public.save_academic_record(
    'e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000012',
    'assessment',NULL,'e1900000-0000-4000-8000-000000000501',
    '{"studentId":"e1900000-0000-4000-8000-000000000201","studentName":"Academic Test Student","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb
  )$$,
  '23505',
  'Academic request ID was already used for a different actor or payload',
  'a different actor cannot replay another admin’s request key'
);
SELECT is(
  (SELECT count(*)::integer FROM public.academic_records
   WHERE tenant_id='e1900000-0000-4000-8000-000000000009' AND kind='assessment'),
  1,
  'conflicting retries do not create a second assessment'
);

SELECT * FROM finish();
ROLLBACK;
