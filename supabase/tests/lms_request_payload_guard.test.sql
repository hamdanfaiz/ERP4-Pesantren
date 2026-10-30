-- LMS catalog retries must not falsely acknowledge different actors or payloads.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(20);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2400000-0000-4000-8000-000000000009','lms-idempotency-test','LMS Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2400000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-idempotency-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2400000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-idempotency-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2400000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'lms-idempotency-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2400000-0000-4000-8000-000000000011','e2400000-0000-4000-8000-000000000009',
   'lms-idempotency-one@test.invalid','LMS Admin One','admin','active','{"lms":true}'),
  ('e2400000-0000-4000-8000-000000000012','e2400000-0000-4000-8000-000000000009',
   'lms-idempotency-two@test.invalid','LMS Admin Two','admin','active','{"lms":true}'),
  ('e2400000-0000-4000-8000-000000000013','e2400000-0000-4000-8000-000000000009',
   'lms-idempotency-teacher@test.invalid','LMS Teacher','ustadz','active','{"lms":true}');

CREATE TEMP TABLE lms_course_payload AS
SELECT jsonb_build_object(
  'clientRequestId','e2400000-0000-4000-8000-000000000101',
  'instructorUserId','e2400000-0000-4000-8000-000000000013',
  'categoryName','Umum','title','Kelas Fikih','description','Materi dasar',
  'grade','VII','status','draft','color','indigo'
) AS payload;
GRANT SELECT ON lms_course_payload TO service_role;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE lms_course_first AS
SELECT public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009',
  'e2400000-0000-4000-8000-000000000011',
  'course',(SELECT payload FROM lms_course_payload)
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_course_first),'false',
  'first course request creates a course');
SELECT is(public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'course',(SELECT payload FROM lms_course_payload)
)->>'alreadyApplied','true','identical course retry replays');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011','course',
    jsonb_set((SELECT payload FROM lms_course_payload),'{title}','"Kelas Hadis"')
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'changed course payload cannot reuse a request ID');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000012','course',
    (SELECT payload FROM lms_course_payload)
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'another administrator cannot replay a course request');

CREATE TEMP TABLE lms_module_payload AS
SELECT jsonb_build_object(
  'courseId',(SELECT (result->>'id')::uuid FROM lms_course_first),
  'clientRequestId','e2400000-0000-4000-8000-000000000102',
  'title','Bab 1','description','Pengenalan','displayOrder',0
) AS payload;
CREATE TEMP TABLE lms_module_first AS
SELECT public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'module',(SELECT payload FROM lms_module_payload)
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_module_first),'false',
  'first module request creates a module');
SELECT is(public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'module',(SELECT payload FROM lms_module_payload)
)->>'alreadyApplied','true','identical module retry replays');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011','module',
    jsonb_set((SELECT payload FROM lms_module_payload),'{title}','"Bab 2"')
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'changed module payload cannot reuse a request ID');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000012','module',
    (SELECT payload FROM lms_module_payload)
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'another administrator cannot replay a module request');

CREATE TEMP TABLE lms_material_payload AS
SELECT jsonb_build_object(
  'courseId',(SELECT (result->>'id')::uuid FROM lms_course_first),
  'moduleId',(SELECT (result->>'id')::uuid FROM lms_module_first),
  'clientRequestId','e2400000-0000-4000-8000-000000000103',
  'title','Ringkasan','type','text','url','','body','Baca bab pertama.',
  'durationSeconds',120,'displayOrder',0
) AS payload;
CREATE TEMP TABLE lms_material_first AS
SELECT public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'material',(SELECT payload FROM lms_material_payload)
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_material_first),'false',
  'first material request creates a material');
SELECT is(public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'material',(SELECT payload FROM lms_material_payload)
)->>'alreadyApplied','true','identical material retry replays');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011','material',
    jsonb_set((SELECT payload FROM lms_material_payload),'{body}','"Baca bab kedua."')
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'changed material payload cannot reuse a request ID');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000012','material',
    (SELECT payload FROM lms_material_payload)
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'another administrator cannot replay a material request');

CREATE TEMP TABLE lms_assignment_payload AS
SELECT jsonb_build_object(
  'courseId',(SELECT (result->>'id')::uuid FROM lms_course_first),
  'moduleId',(SELECT (result->>'id')::uuid FROM lms_module_first),
  'clientRequestId','e2400000-0000-4000-8000-000000000104',
  'title','Tugas Bab 1','instructions','Jawab pertanyaan.',
  'dueAt','2099-04-01T12:00:00Z','allowLate',false,'maxScore',100,'status','draft'
) AS payload;
CREATE TEMP TABLE lms_assignment_first AS
SELECT public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'assignment',(SELECT payload FROM lms_assignment_payload)
) AS result;
SELECT is((SELECT result->>'alreadyApplied' FROM lms_assignment_first),'false',
  'first assignment request creates an assignment');
SELECT is(public.manage_lms_catalog(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'assignment',(SELECT payload FROM lms_assignment_payload)
)->>'alreadyApplied','true','identical assignment retry replays');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011','assignment',
    jsonb_set((SELECT payload FROM lms_assignment_payload),'{title}','"Tugas Bab 2"')
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'changed assignment payload cannot reuse a request ID');
SELECT throws_ok(
  $$SELECT public.manage_lms_catalog(
    'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000012','assignment',
    (SELECT payload FROM lms_assignment_payload)
  )$$,'23505','LMS request ID was already used for a different actor or payload',
  'another administrator cannot replay an assignment request');

SELECT is((SELECT count(*)::integer FROM public.lms_courses
  WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),1,'conflicting retries do not duplicate courses');
SELECT is((SELECT count(*)::integer FROM public.lms_course_modules
  WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),1,'conflicting retries do not duplicate modules');
SELECT is((SELECT count(*)::integer FROM public.lms_materials
  WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),1,'conflicting retries do not duplicate materials');
SELECT is((SELECT count(*)::integer FROM public.lms_assignments
  WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),1,'conflicting retries do not duplicate assignments');

SELECT * FROM finish();
ROLLBACK;
