-- Verify CBT start returns a database time anchor for authoritative countdowns.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(5);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e1800000-0000-4000-8000-000000000009','cbt-deadline-test','CBT Deadline Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1800000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-deadline-student@test.invalid','',now(),'{ "provider":"email","providers":["email"] }','{}',now(),now()),
  ('e1800000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-deadline-admin@test.invalid','',now(),'{ "provider":"email","providers":["email"] }','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions,linked_santri_id)
VALUES
  ('e1800000-0000-4000-8000-000000000011','e1800000-0000-4000-8000-000000000009',
   'cbt-deadline-student@test.invalid','CBT Test Student','santri','active','{"cbt":true}',
   'e1800000-0000-4000-8000-000000000201'),
  ('e1800000-0000-4000-8000-000000000012','e1800000-0000-4000-8000-000000000009',
   'cbt-deadline-admin@test.invalid','CBT Test Admin','admin','active','{"cbt":true}',NULL);
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('e1800000-0000-4000-8000-000000000101','e1800000-0000-4000-8000-000000000009',
  'CBD001','CBT Test Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e1800000-0000-4000-8000-000000000201','e1800000-0000-4000-8000-000000000009',
  'e1800000-0000-4000-8000-000000000101','9180000001','CBT Test Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);
INSERT INTO public.cbt_questions(
  id,tenant_id,subject,grade,template,question_html,options,correct_answer,created_by,updated_by
) VALUES (
  'e1800000-0000-4000-8000-000000000301','e1800000-0000-4000-8000-000000000009',
  'Matematika','VII','Deadline Test','1 + 1 = ?','["1","2"]',1,
  'e1800000-0000-4000-8000-000000000012','e1800000-0000-4000-8000-000000000012'
);
INSERT INTO public.cbt_exams(
  id,tenant_id,title,subject,grade,starts_at,ends_at,duration_minutes,status,client_request_id,created_by,updated_by
) VALUES (
  'e1800000-0000-4000-8000-000000000401','e1800000-0000-4000-8000-000000000009',
  'Deadline Test','Matematika','VII',now()-interval '1 minute',now()+interval '1 hour',30,
  'published','e1800000-0000-4000-8000-000000000402',
  'e1800000-0000-4000-8000-000000000012','e1800000-0000-4000-8000-000000000012'
);
INSERT INTO public.cbt_exam_questions(tenant_id,exam_id,question_id,display_order)
VALUES ('e1800000-0000-4000-8000-000000000009','e1800000-0000-4000-8000-000000000401',
  'e1800000-0000-4000-8000-000000000301',0);
INSERT INTO public.cbt_exam_assignments(tenant_id,exam_id,student_id,assigned_by)
VALUES ('e1800000-0000-4000-8000-000000000009','e1800000-0000-4000-8000-000000000401',
  'e1800000-0000-4000-8000-000000000201','e1800000-0000-4000-8000-000000000012');

CREATE TEMP TABLE cbt_deadline_result AS
SELECT public.start_cbt_attempt(
  'e1800000-0000-4000-8000-000000000009',
  'e1800000-0000-4000-8000-000000000011',
  'e1800000-0000-4000-8000-000000000401'
) AS result;

SELECT ok(result ? 'serverNow' AND jsonb_typeof(result->'serverNow')='string',
  'start response includes a database time anchor');
SELECT ok((result->>'serverNow')::timestamptz BETWEEN now()-interval '1 minute' AND now()+interval '1 second',
  'server time anchor reflects the database clock');
SELECT ok((result->>'expiresAt')::timestamptz > (result->>'serverNow')::timestamptz,
  'active attempt deadline is later than server time');
SELECT is((result->>'expired')::boolean,false,
  'active attempt is not marked expired by the server');
SELECT ok(NOT ((result->'questions'->0) ? 'correctAnswer'),
  'student start response does not expose the answer key');

SELECT * FROM finish();
ROLLBACK;
