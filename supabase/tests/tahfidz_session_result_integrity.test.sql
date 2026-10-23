-- Verify the database rejects finished exams without an explicit result.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(5);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('d1600000-0000-4000-8000-000000000009','tahfidz-result-integrity-test','Tahfidz Result Integrity Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('d1600000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'tahfidz-result-admin@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('d1600000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'tahfidz-result-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('d1600000-0000-4000-8000-000000000011','d1600000-0000-4000-8000-000000000009',
    'tahfidz-result-admin@test.invalid','Tahfidz Test Admin','admin','active','{"tahfidz":true}'),
  ('d1600000-0000-4000-8000-000000000012','d1600000-0000-4000-8000-000000000009',
    'tahfidz-result-teacher@test.invalid','Tahfidz Test Teacher','ustadz','active','{"tahfidz":true}');

INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('d1600000-0000-4000-8000-000000000101','d1600000-0000-4000-8000-000000000009',
  'TIR001','Tahfidz Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'd1600000-0000-4000-8000-000000000201','d1600000-0000-4000-8000-000000000009',
  'd1600000-0000-4000-8000-000000000101','9160000001','Tahfidz Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);
INSERT INTO public.tahfidz_halaqahs(id,tenant_id,name,ustadz_user_id,ustadz_name,status)
VALUES ('d1600000-0000-4000-8000-000000000301','d1600000-0000-4000-8000-000000000009',
  'Halaqah Uji Result','d1600000-0000-4000-8000-000000000012','Tahfidz Test Teacher','active');

SELECT ok(to_regclass('public.tahfidz_sessions_exam_completion_result_required') IS NOT NULL,
  'completed exam result integrity constraint exists');
SELECT like(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='tahfidz_sessions_exam_completion_result_required'),
  '%score IS NOT NULL%',
  'the constraint requires a non-null score'
);
SELECT like(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='tahfidz_sessions_exam_completion_result_required'),
  '%outcome IS NOT NULL%',
  'the constraint requires a non-null pass/retest outcome'
);
SELECT throws_ok(
  $$INSERT INTO public.tahfidz_sessions(
    id,tenant_id,kind,student_id,halaqah_id,teacher_user_id,exam_type,juz_start,juz_end,
    scheduled_at,duration_minutes,focus,status,score,outcome,created_by_user_id,completed_at
  ) VALUES (
    'd1600000-0000-4000-8000-000000000401','d1600000-0000-4000-8000-000000000009',
    'exam','d1600000-0000-4000-8000-000000000201','d1600000-0000-4000-8000-000000000301',
    'd1600000-0000-4000-8000-000000000012','munaqasyah',1,1,now(),30,'Juz 1','completed',
    NULL,'pass','d1600000-0000-4000-8000-000000000011',now()
  )$$,
  '23514',
  'new row for relation "tahfidz_sessions" violates check constraint "tahfidz_sessions_exam_completion_result_required"',
  'a completed exam cannot omit its score'
);
INSERT INTO public.tahfidz_sessions(
  id,tenant_id,kind,student_id,halaqah_id,teacher_user_id,exam_type,juz_start,juz_end,
  scheduled_at,duration_minutes,focus,status,score,outcome,created_by_user_id,completed_at
) VALUES (
  'd1600000-0000-4000-8000-000000000402','d1600000-0000-4000-8000-000000000009',
  'exam','d1600000-0000-4000-8000-000000000201','d1600000-0000-4000-8000-000000000301',
  'd1600000-0000-4000-8000-000000000012','munaqasyah',1,1,now(),30,'Juz 1','completed',
  88,'pass','d1600000-0000-4000-8000-000000000011',now()
);
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_sessions
  WHERE id='d1600000-0000-4000-8000-000000000402'),1,'a complete exam result remains valid');

SELECT * FROM finish();
ROLLBACK;
