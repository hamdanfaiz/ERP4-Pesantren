-- Verify tenant-safe, keyset-paginated Academic roster and exact Ustadz class scope.
-- All fixtures are synthetic and rolled back at the end of the test.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(27);

INSERT INTO public.tenants(id,slug,name,status)
VALUES
  ('e2800000-0000-4000-8000-000000000001','academic-roster-tenant-a','Academic Roster Tenant A','active'),
  ('e2800000-0000-4000-8000-000000000002','academic-roster-tenant-b','Academic Roster Tenant B','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2800000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-admin-a@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2800000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-ustadz-a@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2800000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-ustadz-b@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2800000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roster-admin-b@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000001','roster-admin-a@test.invalid','Admin Tenant A','admin','active','{"academic":true}'),
  ('e2800000-0000-4000-8000-000000000012','e2800000-0000-4000-8000-000000000001','roster-ustadz-a@test.invalid','Ustadz Kelas A','ustadz','active','{"academic":true}'),
  ('e2800000-0000-4000-8000-000000000013','e2800000-0000-4000-8000-000000000001','roster-ustadz-b@test.invalid','Ustadz Kelas B','ustadz','active','{"academic":true}'),
  ('e2800000-0000-4000-8000-000000000014','e2800000-0000-4000-8000-000000000002','roster-admin-b@test.invalid','Admin Tenant B','admin','active','{"academic":true}');

\ir test_support/seed_tenant_reference_catalogs.psql

INSERT INTO public.organization_units(id,tenant_id,code,name,unit_type,status,created_by_user_id,updated_by_user_id)
VALUES
  ('e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000001','ROSTER-A','Unit Akademik A','sekolah','active','e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000011'),
  ('e2800000-0000-4000-8000-000000000102','e2800000-0000-4000-8000-000000000001','ROSTER-B','Unit Akademik B','sekolah','active','e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000011'),
  ('e2800000-0000-4000-8000-000000000103','e2800000-0000-4000-8000-000000000002','ROSTER-C','Unit Akademik C','sekolah','active','e2800000-0000-4000-8000-000000000014','e2800000-0000-4000-8000-000000000014');

UPDATE public.profiles SET organization_unit_id='e2800000-0000-4000-8000-000000000101' WHERE user_id='e2800000-0000-4000-8000-000000000012';
UPDATE public.profiles SET organization_unit_id='e2800000-0000-4000-8000-000000000102' WHERE user_id='e2800000-0000-4000-8000-000000000013';
UPDATE public.profiles SET organization_unit_id='e2800000-0000-4000-8000-000000000103' WHERE user_id='e2800000-0000-4000-8000-000000000014';

-- The two unit-specific classes deliberately share the display name "VII".
INSERT INTO public.master_data_records(tenant_id,category,id,name,status,organization_unit_id,grade)
VALUES
  ('e2800000-0000-4000-8000-000000000001','Kelas','ROSTER-CLASS-A','VII','Active','e2800000-0000-4000-8000-000000000101','VII'),
  ('e2800000-0000-4000-8000-000000000001','Kelas','ROSTER-CLASS-B','VII','Active','e2800000-0000-4000-8000-000000000102','VII'),
  ('e2800000-0000-4000-8000-000000000002','Kelas','ROSTER-CLASS-C','VII','Active','e2800000-0000-4000-8000-000000000103','VII');

INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint,organization_unit_id,grade)
VALUES
  ('e2800000-0000-4000-8000-000000000201','e2800000-0000-4000-8000-000000000001','ROSTER-CAND-A','Santri Unit A',decode(repeat('a1',44),'hex'),decode(repeat('b1',32),'hex'),'e2800000-0000-4000-8000-000000000101','VII'),
  ('e2800000-0000-4000-8000-000000000202','e2800000-0000-4000-8000-000000000001','ROSTER-CAND-B','Santri Unit B',decode(repeat('a2',44),'hex'),decode(repeat('b2',32),'hex'),'e2800000-0000-4000-8000-000000000102','VII'),
  ('e2800000-0000-4000-8000-000000000203','e2800000-0000-4000-8000-000000000002','ROSTER-CAND-C','Santri Tenant B',decode(repeat('a3',44),'hex'),decode(repeat('b3',32),'hex'),'e2800000-0000-4000-8000-000000000103','VII');

INSERT INTO public.students(id,tenant_id,source_candidate_id,nis,name,gender,grade,class_id,nik_ciphertext,nik_fingerprint,status,organization_unit_id)
VALUES
  ('e2800000-0000-4000-8000-000000000301','e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000201','9380000001','Santri Unit A','L','VII','ROSTER-CLASS-A',decode(repeat('c1',44),'hex'),decode(repeat('d1',32),'hex'),'active','e2800000-0000-4000-8000-000000000101'),
  ('e2800000-0000-4000-8000-000000000302','e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000202','9380000002','Santri Unit B','L','VII','ROSTER-CLASS-B',decode(repeat('c2',44),'hex'),decode(repeat('d2',32),'hex'),'active','e2800000-0000-4000-8000-000000000102'),
  ('e2800000-0000-4000-8000-000000000303','e2800000-0000-4000-8000-000000000002','e2800000-0000-4000-8000-000000000203','9380000003','Santri Tenant B','L','VII','ROSTER-CLASS-C',decode(repeat('c3',44),'hex'),decode(repeat('d3',32),'hex'),'active','e2800000-0000-4000-8000-000000000103');

CREATE OR REPLACE FUNCTION pg_temp.academic_roster(
  p_tenant UUID, p_actor UUID, p_role TEXT,
  p_mode TEXT DEFAULT 'all', p_unit UUID DEFAULT NULL, p_search TEXT DEFAULT '',
  p_after_name TEXT DEFAULT NULL, p_after_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50
)
RETURNS JSONB LANGUAGE SQL AS $$
  SELECT public.get_tenant_academic_roster_page(
    p_tenant,p_actor,p_role,true,p_mode,p_unit,p_search,p_after_name,p_after_id,p_limit
  );
$$;

SET LOCAL ROLE service_role;

SELECT is(public.save_academic_record(
  'e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','schedule',NULL,'e2800000-0000-4000-8000-000000000501',
  pg_temp.test_academic_references('e2800000-0000-4000-8000-000000000001','{"_unitScopeEnabled":true,"organizationUnitId":"e2800000-0000-4000-8000-000000000101","day":"Senin","time":"07:30 - 08:30","subject":"Matematika","teacherUserId":"e2800000-0000-4000-8000-000000000012","teacherName":"Ustadz Kelas A","className":"VII"}'::jsonb)
)->>'alreadyApplied','false','tenant administrator assigns the first same-name class to Ustadz A');
SELECT is(public.save_academic_record(
  'e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','schedule',NULL,'e2800000-0000-4000-8000-000000000502',
  pg_temp.test_academic_references('e2800000-0000-4000-8000-000000000001','{"_unitScopeEnabled":true,"organizationUnitId":"e2800000-0000-4000-8000-000000000102","day":"Senin","time":"07:30 - 08:30","subject":"Matematika","teacherUserId":"e2800000-0000-4000-8000-000000000013","teacherName":"Ustadz Kelas B","className":"VII"}'::jsonb)
)->>'alreadyApplied','false','tenant administrator assigns the second same-name class to Ustadz B');

SELECT ok(has_function_privilege('service_role','public.get_tenant_academic_roster_page(uuid,uuid,text,boolean,text,uuid,text,text,uuid,integer)','EXECUTE'),'only the trusted server role can call the roster RPC');
SELECT ok(NOT has_function_privilege('anon','public.get_tenant_academic_roster_page(uuid,uuid,text,boolean,text,uuid,text,text,uuid,integer)','EXECUTE'),'anonymous clients cannot call the roster RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.get_tenant_academic_roster_page(uuid,uuid,text,boolean,text,uuid,text,text,uuid,integer)','EXECUTE'),'authenticated clients cannot call the roster RPC directly');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin')->'students'),2,'admin receives both active students in their tenant');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin')->'classes'),2,'admin receives both same-name classes by distinct reference');
SELECT ok(NOT ((pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin')->'students') @> '[{"id":"e2800000-0000-4000-8000-000000000303"}]'::jsonb),'tenant A roster excludes tenant B student');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'Unit A')->'students'),1,'name search returns only matching active students');
SELECT is(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'9380000002')->'students'->0->>'id','e2800000-0000-4000-8000-000000000302','NIS search locates the matching student');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'',NULL,NULL,1)->'students'),1,'first keyset page respects the requested page size');
SELECT is(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'',NULL,NULL,1)->>'hasMore','true','first keyset page reports another page');
SELECT is(pg_temp.academic_roster(
  'e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'',
  pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'',NULL,NULL,1)->'nextCursor'->>'name',
  (pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','all',NULL,'',NULL,NULL,1)->'nextCursor'->>'id')::uuid,1
)->'students'->0->>'id','e2800000-0000-4000-8000-000000000302','second keyset page returns the next student without duplication');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','ustadz','unit','e2800000-0000-4000-8000-000000000101')->'students'),1,'Ustadz A sees only students in the exact assigned class and unit');
SELECT is(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','ustadz','unit','e2800000-0000-4000-8000-000000000101')->'students'->0->>'id','e2800000-0000-4000-8000-000000000301','Ustadz A roster contains the student in class A');
SELECT is(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','ustadz','unit','e2800000-0000-4000-8000-000000000101')->'classes'->0->>'id','ROSTER-CLASS-A','Ustadz A receives class A reference despite duplicate display name');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000013','ustadz','unit','e2800000-0000-4000-8000-000000000102')->'students'),1,'Ustadz B sees only students in the exact assigned class and unit');
SELECT is(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000013','ustadz','unit','e2800000-0000-4000-8000-000000000102')->'students'->0->>'id','e2800000-0000-4000-8000-000000000302','Ustadz B roster contains the student in class B');
SELECT is(jsonb_array_length(pg_temp.academic_roster('e2800000-0000-4000-8000-000000000002','e2800000-0000-4000-8000-000000000014','admin')->'students'),1,'tenant B admin sees only tenant B roster records');
SELECT throws_ok($$SELECT pg_temp.academic_roster('e2800000-0000-4000-8000-000000000002','e2800000-0000-4000-8000-000000000011','admin')$$,'42501','Profil akademik aktif tidak ditemukan pada tenant','actor cannot reuse access in a different tenant');
SELECT throws_ok($$SELECT pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','admin')$$,'42501','Profil akademik aktif tidak ditemukan pada tenant','expected role must match the active tenant profile');
SELECT throws_ok($$SELECT pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','ustadz','unit','e2800000-0000-4000-8000-000000000102')$$,'42501','Ustadz hanya dapat melihat roster unitnya sendiri','Ustadz cannot request another organization unit');
SELECT throws_ok($$SELECT public.get_tenant_academic_roster_page('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin',true,NULL,NULL,'',NULL,NULL,50)$$,'22023','Permintaan roster Akademik tidak valid','null unit mode is rejected instead of bypassing filter validation');
SELECT throws_ok($$SELECT pg_temp.academic_roster('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','unit','e2800000-0000-4000-8000-000000000103')$$,'42501','Unit aktif tidak ditemukan pada tenant ini','unit from a different tenant cannot be selected');

SELECT is(public.save_academic_record(
  'e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','assessment',NULL,'e2800000-0000-4000-8000-000000000503',
  pg_temp.test_academic_references('e2800000-0000-4000-8000-000000000001','{"_unitScopeEnabled":false,"studentId":"e2800000-0000-4000-8000-000000000301","studentName":"Santri Unit A","teacherUserId":"e2800000-0000-4000-8000-000000000012","teacherName":"Ustadz Kelas A","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb)
)->>'alreadyApplied','false','Ustadz can record assessment for student in the assigned class');
SELECT throws_ok($$SELECT public.save_academic_record(
  'e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','assessment',NULL,'e2800000-0000-4000-8000-000000000504',
  pg_temp.test_academic_references('e2800000-0000-4000-8000-000000000001','{"_unitScopeEnabled":false,"studentId":"e2800000-0000-4000-8000-000000000302","studentName":"Santri Unit B","teacherUserId":"e2800000-0000-4000-8000-000000000012","teacherName":"Ustadz Kelas A","className":"VII","subject":"Matematika","assessmentType":"Kuis","category":"Formative","score":88}'::jsonb)
)$$,'42501','Santri berada di luar kelas yang dijadwalkan untuk Ustadz ini','same display name cannot authorize an assessment for another class reference');
SELECT is((SELECT count(*)::integer FROM public.academic_records WHERE tenant_id='e2800000-0000-4000-8000-000000000001' AND kind='assessment'),1,'the unauthorized assessment is not persisted');

SELECT * FROM finish();
ROLLBACK;
