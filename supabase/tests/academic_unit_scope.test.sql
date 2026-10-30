-- Synthetic checks for tenant and organization-unit boundaries in Academic.
-- Run with `supabase test db`; all fixtures are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

INSERT INTO public.tenants(id, slug, name, status)
VALUES ('e2700000-0000-4000-8000-000000000001','academic-unit-scope-test','Academic Unit Scope Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2700000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-unit-admin@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2700000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-unit-teacher-a@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2700000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-unit-teacher-b@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2700000-0000-4000-8000-000000000011','e2700000-0000-4000-8000-000000000001','academic-unit-admin@test.invalid','Academic Admin','admin','active','{"academic":true}'),
  ('e2700000-0000-4000-8000-000000000012','e2700000-0000-4000-8000-000000000001','academic-unit-teacher-a@test.invalid','Ustadz Unit A','ustadz','active','{"academic":true}'),
  ('e2700000-0000-4000-8000-000000000013','e2700000-0000-4000-8000-000000000001','academic-unit-teacher-b@test.invalid','Ustadz Unit B','ustadz','active','{"academic":true}');
INSERT INTO public.organization_units(id,tenant_id,code,name,unit_type,status,created_by_user_id,updated_by_user_id)
VALUES
  ('e2700000-0000-4000-8000-000000000101','e2700000-0000-4000-8000-000000000001','UNIT-A','Unit Akademik A','sekolah','active','e2700000-0000-4000-8000-000000000011','e2700000-0000-4000-8000-000000000011'),
  ('e2700000-0000-4000-8000-000000000102','e2700000-0000-4000-8000-000000000001','UNIT-B','Unit Akademik B','sekolah','active','e2700000-0000-4000-8000-000000000011','e2700000-0000-4000-8000-000000000011');
UPDATE public.profiles SET organization_unit_id='e2700000-0000-4000-8000-000000000101' WHERE user_id='e2700000-0000-4000-8000-000000000012';
UPDATE public.profiles SET organization_unit_id='e2700000-0000-4000-8000-000000000102' WHERE user_id='e2700000-0000-4000-8000-000000000013';
INSERT INTO public.master_data_records(tenant_id,category,id,name,status,organization_unit_id)
VALUES
  ('e2700000-0000-4000-8000-000000000001','Kelas','CLASS-A','VII','Active','e2700000-0000-4000-8000-000000000101'),
  ('e2700000-0000-4000-8000-000000000001','Kelas','CLASS-B','VII','Active','e2700000-0000-4000-8000-000000000102');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint,organization_unit_id)
VALUES ('e2700000-0000-4000-8000-000000000201','e2700000-0000-4000-8000-000000000001','AUS001','Santri Unit A',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'),'e2700000-0000-4000-8000-000000000101');
INSERT INTO public.students(id,tenant_id,source_candidate_id,nis,name,gender,grade,class_id,nik_ciphertext,nik_fingerprint,status,organization_unit_id)
VALUES ('e2700000-0000-4000-8000-000000000301','e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000201','9270000001','Santri Unit A','L','VII','CLASS-A',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active','e2700000-0000-4000-8000-000000000101');

SET LOCAL ROLE service_role;

SELECT is(public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','schedule',NULL,'e2700000-0000-4000-8000-000000000501',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000101","day":"Senin","time":"07:30 - 09:00","subject":"Matematika","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","className":"VII","room":"Ruang A"}'::jsonb
)->>'alreadyApplied','false','Admin can create an academic schedule for unit A');
SELECT is(public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','schedule',NULL,'e2700000-0000-4000-8000-000000000502',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000102","day":"Senin","time":"07:30 - 09:00","subject":"Matematika","teacherUserId":"e2700000-0000-4000-8000-000000000013","teacherName":"Ustadz Unit B","className":"VII","room":"Ruang B"}'::jsonb
)->>'alreadyApplied','false','same-name class and time can be recorded independently in unit B');
SELECT is((SELECT count(*)::integer FROM public.academic_records WHERE tenant_id='e2700000-0000-4000-8000-000000000001' AND kind='schedule'),2,'schedule rows are saved into separate tenant units');
SELECT throws_ok($$SELECT public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','schedule',NULL,'e2700000-0000-4000-8000-000000000503',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000102","day":"Senin","time":"08:00 - 08:30","subject":"Fisika","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","className":"VII","room":"Ruang C"}'::jsonb
)$$,'42501','Assigned teacher belongs to a different organization unit','schedule cannot assign a teacher from another unit');
SELECT throws_ok($$SELECT public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','schedule',NULL,'e2700000-0000-4000-8000-000000000504',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000101","day":"Senin","time":"08:00 - 08:30","subject":"Fisika","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","className":"VII","room":"Ruang C"}'::jsonb
)$$,'23P01','Teacher, room, or class has an overlapping schedule on this day','same-unit schedule conflicts remain blocked');
SELECT throws_ok($$SELECT public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','assessment',NULL,'e2700000-0000-4000-8000-000000000505',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000102","studentId":"e2700000-0000-4000-8000-000000000301","studentName":"Santri Unit A","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb
)$$,'42501','Assessment unit must match the student organization unit','assessment cannot cross the student unit boundary');
SELECT is(public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000011','assessment',NULL,'e2700000-0000-4000-8000-000000000506',
  '{"_unitScopeEnabled":true,"studentId":"e2700000-0000-4000-8000-000000000301","studentName":"Santri Unit A","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb
)->>'alreadyApplied','false','Admin can save a unit-consistent assessment');
SELECT is((SELECT organization_unit_id::text FROM public.academic_records WHERE tenant_id='e2700000-0000-4000-8000-000000000001' AND kind='assessment'), 'e2700000-0000-4000-8000-000000000101','assessment unit is derived from the student in the database');
SELECT ok(NOT (SELECT record_data ? '_unitScopeEnabled' FROM public.academic_records WHERE tenant_id='e2700000-0000-4000-8000-000000000001' AND kind='assessment'),'internal unit-scope marker is not persisted as user record data');
SELECT throws_ok($$SELECT public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000012','journal',NULL,'e2700000-0000-4000-8000-000000000507',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000102","date":"2026-10-30","className":"VII","subject":"Fiqih","topic":"Bab bersuci","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","attendance":{"present":1,"absent":0,"excused":0}}'::jsonb
)$$,'42501','Ustadz cannot write outside the assigned organization unit','Ustadz cannot request another unit');
SELECT is(public.save_academic_record(
  'e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000012','journal',NULL,'e2700000-0000-4000-8000-000000000508',
  '{"_unitScopeEnabled":true,"organizationUnitId":"e2700000-0000-4000-8000-000000000101","date":"2026-10-30","className":"VII","subject":"Fiqih","topic":"Bab bersuci","teacherUserId":"e2700000-0000-4000-8000-000000000012","teacherName":"Ustadz Unit A","attendance":{"present":1,"absent":0,"excused":0}}'::jsonb
)->>'alreadyApplied','false','Ustadz can save own journal in assigned unit');
SELECT is((SELECT organization_unit_id::text FROM public.academic_records WHERE tenant_id='e2700000-0000-4000-8000-000000000001' AND kind='journal'),'e2700000-0000-4000-8000-000000000101','Ustadz journal stores the assigned unit');

SELECT * FROM finish();
ROLLBACK;
