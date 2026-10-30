-- LMS assignment retries are payload-bound; grade corrections retain immutable history.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(19);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2500000-0000-4000-8000-000000000009','lms-submission-integrity','LMS Submission Integrity','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-workflow-student-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-workflow-student-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-workflow-admin-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-workflow-admin-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions,linked_santri_id)
VALUES
  ('e2500000-0000-4000-8000-000000000011','e2500000-0000-4000-8000-000000000009',
   'lms-workflow-student-one@test.invalid','LMS Student One','santri','active','{"lms":true}','e2500000-0000-4000-8000-000000000201'),
  ('e2500000-0000-4000-8000-000000000012','e2500000-0000-4000-8000-000000000009',
   'lms-workflow-student-two@test.invalid','LMS Student Two','santri','active','{"lms":true}','e2500000-0000-4000-8000-000000000202'),
  ('e2500000-0000-4000-8000-000000000013','e2500000-0000-4000-8000-000000000009',
   'lms-workflow-admin-one@test.invalid','LMS Admin One','admin','active','{"lms":true}',NULL),
  ('e2500000-0000-4000-8000-000000000014','e2500000-0000-4000-8000-000000000009',
   'lms-workflow-admin-two@test.invalid','LMS Admin Two','admin','active','{"lms":true}',NULL);
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES
  ('e2500000-0000-4000-8000-000000000101','e2500000-0000-4000-8000-000000000009',
   'LSI001','LMS Student One',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e2500000-0000-4000-8000-000000000102','e2500000-0000-4000-8000-000000000009',
   'LSI002','LMS Student Two',decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES
  ('e2500000-0000-4000-8000-000000000201','e2500000-0000-4000-8000-000000000009',
   'e2500000-0000-4000-8000-000000000101','9250000001','LMS Student One','L','VII',
   decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'),
  ('e2500000-0000-4000-8000-000000000202','e2500000-0000-4000-8000-000000000009',
   'e2500000-0000-4000-8000-000000000102','9250000002','LMS Student Two','P','VII',
   decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'active');

INSERT INTO public.lms_courses(
  id,tenant_id,category_name,title,description,grade,instructor_user_id,status,color,
  client_request_id,created_by,updated_by
) VALUES (
  'e2500000-0000-4000-8000-000000000301','e2500000-0000-4000-8000-000000000009',
  'Umum','Kelas LMS','Tugas','VII','e2500000-0000-4000-8000-000000000013','published','indigo',
  'e2500000-0000-4000-8000-000000000302',
  'e2500000-0000-4000-8000-000000000013','e2500000-0000-4000-8000-000000000013'
);
INSERT INTO public.lms_assignments(
  id,tenant_id,course_id,title,instructions,due_at,allow_late,max_score,status,client_request_id,created_by,updated_by
) VALUES (
  'e2500000-0000-4000-8000-000000000401','e2500000-0000-4000-8000-000000000009',
  'e2500000-0000-4000-8000-000000000301','Tugas Pertama','Kumpulkan jawaban.','2099-04-01T12:00:00Z',
  false,100,'published','e2500000-0000-4000-8000-000000000402',
  'e2500000-0000-4000-8000-000000000013','e2500000-0000-4000-8000-000000000013'
);
INSERT INTO public.lms_enrollments(tenant_id,course_id,student_id,enrolled_by)
VALUES
  ('e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000301',
   'e2500000-0000-4000-8000-000000000201','e2500000-0000-4000-8000-000000000013'),
  ('e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000301',
   'e2500000-0000-4000-8000-000000000202','e2500000-0000-4000-8000-000000000013');

SET LOCAL ROLE service_role;
CREATE TEMP TABLE lms_submit_first AS
SELECT public.submit_lms_assignment(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
  'Jawaban awal',''
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_submit_first),'false','first assignment submission is recorded');
SELECT is(public.submit_lms_assignment(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
  'Jawaban awal',''
)->>'alreadyApplied','true','identical submission retry is replayed');
SELECT is(public.submit_lms_assignment(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
  'Jawaban awal',''
)->>'id',(SELECT result->>'id' FROM lms_submit_first),'submission retry returns the original record');
SELECT throws_ok(
  $$SELECT public.submit_lms_assignment(
    'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
    'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
    'Jawaban berbeda',''
  )$$,
  '23505','LMS submission request ID was already used for a different actor or payload',
  'different submission content cannot reuse a request ID'
);
SELECT throws_ok(
  $$SELECT public.submit_lms_assignment(
    'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000012',
    'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
    'Jawaban awal',''
  )$$,
  '23505','LMS submission request ID was already used for a different actor or payload',
  'a different student cannot replay another student’s request'
);
CREATE TEMP TABLE lms_submit_update AS
SELECT public.submit_lms_assignment(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  'e2500000-0000-4000-8000-000000000502','e2500000-0000-4000-8000-000000000401',
  'Jawaban revisi',''
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_submit_update),'false',
  'a new request key permits an intentional ungraded resubmission');
SELECT is((SELECT count(*)::integer FROM public.lms_submissions
  WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),1,
  'resubmission updates the existing student-assignment row');
SELECT is((SELECT response_text FROM public.lms_submissions
  WHERE tenant_id='e2500000-0000-4000-8000-000000000009'
    AND assignment_id='e2500000-0000-4000-8000-000000000401'
    AND student_id='e2500000-0000-4000-8000-000000000201'),
  'Jawaban revisi','intentional ungraded resubmission replaces the response');

CREATE TEMP TABLE lms_grade_first AS
SELECT public.grade_lms_submission(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',
  'e2500000-0000-4000-8000-000000000601',
  (SELECT (result->>'id')::uuid FROM lms_submit_first),
  75,'Baik'
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_grade_first),'false','first grading is recorded');
SELECT is(public.grade_lms_submission(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',
  'e2500000-0000-4000-8000-000000000601',
  (SELECT (result->>'id')::uuid FROM lms_submit_first),75,'Baik'
)->>'alreadyApplied','true','identical grading retry is replayed');
SELECT throws_ok(
  $$SELECT public.grade_lms_submission(
    'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',
    'e2500000-0000-4000-8000-000000000601',
    (SELECT (result->>'id')::uuid FROM lms_submit_first),80,'Baik'
  )$$,
  '23505','LMS grade request ID was already used for a different actor or payload',
  'changed score cannot reuse a grade request ID'
);
SELECT throws_ok(
  $$SELECT public.grade_lms_submission(
    'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000014',
    'e2500000-0000-4000-8000-000000000601',
    (SELECT (result->>'id')::uuid FROM lms_submit_first),75,'Baik'
  )$$,
  '23505','LMS grade request ID was already used for a different actor or payload',
  'another administrator cannot replay a grade request'
);
CREATE TEMP TABLE lms_grade_revision AS
SELECT public.grade_lms_submission(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',
  'e2500000-0000-4000-8000-000000000602',
  (SELECT (result->>'id')::uuid FROM lms_submit_first),
  90,'Koreksi nilai setelah verifikasi'
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_grade_revision),'false',
  'a corrected grade uses a new request key');
SELECT is((SELECT count(*)::integer FROM public.lms_submission_grade_events
  WHERE tenant_id='e2500000-0000-4000-8000-000000000009'
    AND submission_id=(SELECT (result->>'id')::uuid FROM lms_submit_first)),2,
  'grade corrections append one audit event per distinct request');
SELECT ok(EXISTS(
  SELECT 1 FROM public.lms_submission_grade_events
  WHERE tenant_id='e2500000-0000-4000-8000-000000000009'
    AND submission_id=(SELECT (result->>'id')::uuid FROM lms_submit_first)
    AND previous_score=75 AND score=90 AND feedback='Koreksi nilai setelah verifikasi'
),'grade event preserves the previous and corrected scores');

SELECT is(public.submit_lms_assignment(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  'e2500000-0000-4000-8000-000000000501','e2500000-0000-4000-8000-000000000401',
  'Jawaban awal',''
)->>'alreadyApplied','true','a committed submission retry still replays after a later resubmission');
SELECT is((public.grade_lms_submission(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',
  'e2500000-0000-4000-8000-000000000601',
  (SELECT (result->>'id')::uuid FROM lms_submit_first),75,'Baik'
)->>'score')::numeric,75::numeric,'a committed grade retry returns its original result after correction');

RESET ROLE;
SELECT throws_ok(
  $q$UPDATE public.lms_submission_requests SET payload_fingerprint=decode(repeat('00',32),'hex')
    WHERE tenant_id='e2500000-0000-4000-8000-000000000009'
      AND request_id='e2500000-0000-4000-8000-000000000501'$q$,
  '55000','LMS idempotency and grade audit ledgers are immutable',
  'submission request ledger rejects updates');
SELECT throws_ok(
  $q$DELETE FROM public.lms_submission_grade_events
    WHERE tenant_id='e2500000-0000-4000-8000-000000000009'
      AND request_id='e2500000-0000-4000-8000-000000000601'$q$,
  '55000','LMS idempotency and grade audit ledgers are immutable',
  'grade audit ledger rejects deletes');

SELECT * FROM finish();
ROLLBACK;
