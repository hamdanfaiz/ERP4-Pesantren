-- LMS learning records are idempotent, tenant-bound, and validated against current enrollment/material rules.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO public.tenants(id, slug, name, status)
VALUES ('e2600000-0000-4000-8000-000000000009', 'lms-learning-record-test', 'LMS Learning Record Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('e2600000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-record-student-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2600000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-record-student-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2600000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-record-inactive-student@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2600000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-record-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

INSERT INTO public.profiles(user_id, tenant_id, email, display_name, role, status, module_permissions, linked_santri_id)
VALUES
  ('e2600000-0000-4000-8000-000000000011','e2600000-0000-4000-8000-000000000009',
   'lms-record-student-one@test.invalid','Student One','santri','active','{"lms":true}','e2600000-0000-4000-8000-000000000201'),
  ('e2600000-0000-4000-8000-000000000012','e2600000-0000-4000-8000-000000000009',
   'lms-record-student-two@test.invalid','Student Two','santri','active','{"lms":true}','e2600000-0000-4000-8000-000000000202'),
  ('e2600000-0000-4000-8000-000000000013','e2600000-0000-4000-8000-000000000009',
   'lms-record-inactive-student@test.invalid','Inactive Student','santri','active','{"lms":true}','e2600000-0000-4000-8000-000000000203'),
  ('e2600000-0000-4000-8000-000000000014','e2600000-0000-4000-8000-000000000009',
   'lms-record-teacher@test.invalid','LMS Teacher','ustadz','active','{"lms":true}',NULL);

INSERT INTO public.candidates(id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000009','LR001','Student One',
   decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e2600000-0000-4000-8000-000000000102','e2600000-0000-4000-8000-000000000009','LR002','Student Two',
   decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex')),
  ('e2600000-0000-4000-8000-000000000103','e2600000-0000-4000-8000-000000000009','LR003','Inactive Student',
   decode(repeat('ad',44),'hex'),decode(repeat('cf',32),'hex'));

INSERT INTO public.students(id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status)
VALUES
  ('e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000009',
   'e2600000-0000-4000-8000-000000000101','9260000001','Student One','L','VII',
   decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'),
  ('e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000009',
   'e2600000-0000-4000-8000-000000000102','9260000002','Student Two','P','VII',
   decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'active'),
  ('e2600000-0000-4000-8000-000000000203','e2600000-0000-4000-8000-000000000009',
   'e2600000-0000-4000-8000-000000000103','9260000003','Inactive Student','L','VII',
   decode(repeat('36',44),'hex'),decode(repeat('58',32),'hex'),'inactive');

INSERT INTO public.lms_courses(
  id, tenant_id, category_name, title, description, grade, instructor_user_id, status, color,
  client_request_id, created_by, updated_by
) VALUES (
  'e2600000-0000-4000-8000-000000000301','e2600000-0000-4000-8000-000000000009',
  'Umum','Kelas LMS','Materi pembelajaran','VII','e2600000-0000-4000-8000-000000000014','published','indigo',
  'e2600000-0000-4000-8000-000000000304','e2600000-0000-4000-8000-000000000014',
  'e2600000-0000-4000-8000-000000000014'
);
INSERT INTO public.lms_course_modules(
  id, tenant_id, course_id, title, description, display_order, client_request_id, created_by, updated_by
) VALUES (
  'e2600000-0000-4000-8000-000000000302','e2600000-0000-4000-8000-000000000009',
  'e2600000-0000-4000-8000-000000000301','Bab 1','Materi',0,
  'e2600000-0000-4000-8000-000000000305','e2600000-0000-4000-8000-000000000014',
  'e2600000-0000-4000-8000-000000000014'
);
INSERT INTO public.lms_materials(
  id, tenant_id, module_id, title, material_type, resource_url, body, duration_seconds,
  display_order, client_request_id, created_by, updated_by
) VALUES (
  'e2600000-0000-4000-8000-000000000303','e2600000-0000-4000-8000-000000000009',
  'e2600000-0000-4000-8000-000000000302','Video 60 detik','video','https://example.test/video','',60,0,
  'e2600000-0000-4000-8000-000000000306','e2600000-0000-4000-8000-000000000014',
  'e2600000-0000-4000-8000-000000000014'
);
INSERT INTO public.lms_enrollments(tenant_id, course_id, student_id, enrolled_by)
VALUES
  ('e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000301',
   'e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000014'),
  ('e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000301',
   'e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000014'),
  ('e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000301',
   'e2600000-0000-4000-8000-000000000203','e2600000-0000-4000-8000-000000000014');

SET LOCAL ROLE service_role;

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000401','note','e2600000-0000-4000-8000-000000000303',12,'Catatan awal'
)->>'alreadyApplied','false','first note request creates one note');

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000401','note','e2600000-0000-4000-8000-000000000303',12,'Catatan awal'
)->>'alreadyApplied','true','identical note retry is replayed');

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000401','note','e2600000-0000-4000-8000-000000000303',12,'Catatan awal'
)->>'id',(SELECT id::text FROM public.lms_student_notes WHERE note='Catatan awal'),
  'note retry returns the original record');

SELECT throws_ok(
  $$SELECT public.add_lms_learning_record(
    'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
    'e2600000-0000-4000-8000-000000000401','note','e2600000-0000-4000-8000-000000000303',12,'Catatan diubah'
  )$$,'23505','LMS learning request ID was already used for a different actor or payload',
  'changed note payload cannot reuse a request ID');

SELECT throws_ok(
  $$SELECT public.add_lms_learning_record(
    'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000012',
    'e2600000-0000-4000-8000-000000000401','note','e2600000-0000-4000-8000-000000000303',12,'Catatan awal'
  )$$,'23505','LMS learning request ID was already used for a different actor or payload',
  'another student cannot replay a note request');

SELECT is((SELECT count(*)::integer FROM public.lms_student_notes
  WHERE tenant_id='e2600000-0000-4000-8000-000000000009'),1,
  'identical and conflicting note retries never add duplicate notes');

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000402','note','e2600000-0000-4000-8000-000000000303',20,'Catatan berikutnya'
)->>'alreadyApplied','false','a distinct request records a second intentional note');

SELECT is((SELECT count(*)::integer FROM public.lms_student_notes
  WHERE tenant_id='e2600000-0000-4000-8000-000000000009'),2,
  'new request ID preserves intentional duplicate-content records');

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000403','comment','e2600000-0000-4000-8000-000000000303',30,'Pertanyaan materi'
)->>'alreadyApplied','false','first comment request creates one comment');

SELECT is(public.add_lms_learning_record(
  'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
  'e2600000-0000-4000-8000-000000000403','comment','e2600000-0000-4000-8000-000000000303',30,'Pertanyaan materi'
)->>'alreadyApplied','true','identical comment retry is replayed');

SELECT is((SELECT count(*)::integer FROM public.lms_material_comments
  WHERE tenant_id='e2600000-0000-4000-8000-000000000009'),1,
  'comment retries do not create duplicate comments');

SELECT throws_ok(
  $$SELECT public.add_lms_learning_record(
    'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000011',
    'e2600000-0000-4000-8000-000000000404','comment','e2600000-0000-4000-8000-000000000303',61,'Di luar video'
  )$$,'22023','LMS timestamp exceeds the material duration',
  'timestamp after the media duration is rejected');

SELECT throws_ok(
  $$SELECT public.add_lms_learning_record(
    'e2600000-0000-4000-8000-000000000009','e2600000-0000-4000-8000-000000000013',
    'e2600000-0000-4000-8000-000000000405','note','e2600000-0000-4000-8000-000000000303',0,'Santri nonaktif'
  )$$,'42501','Active LMS student record is required',
  'inactive student cannot add a learning record');

SELECT is((SELECT count(*)::integer FROM public.lms_learning_record_requests
  WHERE tenant_id='e2600000-0000-4000-8000-000000000009'),3,
  'each successful unique request has exactly one ledger entry');

SELECT is((SELECT octet_length(payload_fingerprint)::integer
  FROM public.lms_learning_record_requests
  WHERE tenant_id='e2600000-0000-4000-8000-000000000009'
    AND request_id='e2600000-0000-4000-8000-000000000401'),32,
  'ledger stores only a SHA-256 payload fingerprint');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='lms_learning_record_requests'
    AND column_name IN ('text', 'note', 'comment')
), 'ledger schema contains no raw note or comment field');

RESET ROLE;

SELECT throws_ok(
  $$UPDATE public.lms_learning_record_requests
    SET payload_fingerprint=decode(repeat('00',32),'hex')
    WHERE tenant_id='e2600000-0000-4000-8000-000000000009'$$,
  '55000','LMS idempotency and grade audit ledgers are immutable',
  'ledger rejects updates'
);

SELECT ok(NOT has_function_privilege(
  'anon','public.add_lms_learning_record(uuid,uuid,uuid,text,uuid,integer,text)','EXECUTE'
), 'anon cannot invoke learning record RPC');

SELECT ok(NOT has_function_privilege(
  'authenticated','public.add_lms_learning_record(uuid,uuid,uuid,text,uuid,integer,text)','EXECUTE'
), 'authenticated cannot invoke learning record RPC directly');

SELECT ok(has_function_privilege(
  'service_role','public.add_lms_learning_record(uuid,uuid,uuid,text,uuid,integer,text)','EXECUTE'
), 'server service role can invoke learning record RPC');

SELECT * FROM finish();
ROLLBACK;
