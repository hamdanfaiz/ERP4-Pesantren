-- Unit and location isolation for Asrama staff. Unmapped historical locations/students are Admin-only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('e7300000-0000-4000-8000-000000000001','boarding-unit-scope','Boarding Unit Scope','active');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e7300000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','boarding-unit-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('e7300000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','boarding-unit-ustadz-a@test.invalid','',now(),'{}','{}',now(),now()),
  ('e7300000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','boarding-unit-ustadz-unassigned@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e7300000-0000-4000-8000-000000000011','e7300000-0000-4000-8000-000000000001','boarding-unit-admin@test.invalid','Admin Unit','admin','active','{"boarding":true}'),
  ('e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000001','boarding-unit-ustadz-a@test.invalid','Ustadz Unit A','ustadz','active','{"boarding":true}'),
  ('e7300000-0000-4000-8000-000000000013','e7300000-0000-4000-8000-000000000001','boarding-unit-ustadz-unassigned@test.invalid','Ustadz Belum Dipetakan','ustadz','active','{"boarding":true}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id)
VALUES
  ('e7300000-0000-4000-8000-000000000101','e7300000-0000-4000-8000-000000000001','UNIT-A','Unit A','pesantren','active','e7300000-0000-4000-8000-000000000011','e7300000-0000-4000-8000-000000000011'),
  ('e7300000-0000-4000-8000-000000000102','e7300000-0000-4000-8000-000000000001','UNIT-B','Unit B','pesantren','active','e7300000-0000-4000-8000-000000000011','e7300000-0000-4000-8000-000000000011');
UPDATE public.profiles SET organization_unit_id='e7300000-0000-4000-8000-000000000101'
WHERE user_id='e7300000-0000-4000-8000-000000000012';

INSERT INTO public.master_data_records (tenant_id, category, id, name, organization_unit_id)
VALUES
  ('e7300000-0000-4000-8000-000000000001','Gedung','BUS-G-A','Gedung Unit A',NULL),
  ('e7300000-0000-4000-8000-000000000001','Gedung','BUS-G-B','Gedung Unit B',NULL),
  ('e7300000-0000-4000-8000-000000000001','Gedung','BUS-G-SHARED','Gedung Bersama',NULL);
INSERT INTO public.master_data_records (tenant_id, category, id, name, parent_id, capacity, organization_unit_id)
VALUES
  ('e7300000-0000-4000-8000-000000000001','Kamar','BUS-R-A','Kamar Unit A','BUS-G-A',4,NULL),
  ('e7300000-0000-4000-8000-000000000001','Kamar','BUS-R-B','Kamar Unit B','BUS-G-B',4,NULL),
  ('e7300000-0000-4000-8000-000000000001','Kamar','BUS-R-SHARED','Kamar Bersama','BUS-G-SHARED',4,NULL);
INSERT INTO public.master_data_records (tenant_id, category, id, name, grade, organization_unit_id)
VALUES
  ('e7300000-0000-4000-8000-000000000001','Kelas','BUS-C-A','Kelas Unit A','VII','e7300000-0000-4000-8000-000000000101'),
  ('e7300000-0000-4000-8000-000000000001','Kelas','BUS-C-B','Kelas Unit B','VII','e7300000-0000-4000-8000-000000000102');

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Kamar','BUS-R-B',
  'e7300000-0000-4000-8000-000000000102','e7300000-0000-4000-8000-000000000401')$$,
  '23514','Petakan gedung induk ke unit yang sama sebelum memetakan kamar','rooms cannot be mapped before their parent building');
SELECT is(public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Gedung','BUS-G-A',
  'e7300000-0000-4000-8000-000000000101','e7300000-0000-4000-8000-000000000402')->>'success','true','Admin maps a building to its organization unit');
SELECT is(public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Gedung','BUS-G-A',
  'e7300000-0000-4000-8000-000000000101','e7300000-0000-4000-8000-000000000402')->>'alreadyApplied','true','repeating the same client request is idempotent');
SELECT is(public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Kamar','BUS-R-A',
  'e7300000-0000-4000-8000-000000000101','e7300000-0000-4000-8000-000000000403')->>'success','true','Admin maps a room after its parent building');
SELECT is(public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Gedung','BUS-G-B',
  'e7300000-0000-4000-8000-000000000102','e7300000-0000-4000-8000-000000000404')->>'success','true','Admin maps a second building to a separate unit');
SELECT is(public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Kamar','BUS-R-B',
  'e7300000-0000-4000-8000-000000000102','e7300000-0000-4000-8000-000000000405')->>'success','true','Admin maps a room to its building unit');
SELECT throws_ok($$SELECT public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Kamar','BUS-R-A',
  'e7300000-0000-4000-8000-000000000102','e7300000-0000-4000-8000-000000000406')$$,
  '23514','Lokasi sudah dipetakan ke unit lain dan tidak dapat dipindahkan','mapped rooms cannot be reassigned to another unit');
SELECT ok(NOT has_function_privilege('anon','public.assign_tenant_boarding_location_unit(uuid,uuid,text,text,text,uuid,uuid)','EXECUTE'),
  'anonymous users cannot map boarding locations');
SELECT ok(NOT has_function_privilege('authenticated','public.assign_tenant_boarding_location_unit(uuid,uuid,text,text,text,uuid,uuid)','EXECUTE'),
  'browser users cannot map boarding locations directly');
SELECT ok(has_function_privilege('service_role','public.assign_tenant_boarding_location_unit(uuid,uuid,text,text,text,uuid,uuid)','EXECUTE'),
  'trusted backend can map boarding locations');
UPDATE public.profiles SET module_permissions='{"boarding":false}'::jsonb
WHERE user_id='e7300000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.assign_tenant_boarding_location_unit(
  'e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000011','admin','Gedung','BUS-G-SHARED',
  'e7300000-0000-4000-8000-000000000101','e7300000-0000-4000-8000-000000000407')$$,
  '42501','Profil Admin tidak memiliki akses Asrama pada tenant ini','Admin without boarding permission cannot map locations');
UPDATE public.profiles SET module_permissions='{"boarding":true}'::jsonb
WHERE user_id='e7300000-0000-4000-8000-000000000011';

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e7300000-0000-4000-8000-000000000201','e7300000-0000-4000-8000-000000000001','BUS-001','Santri Unit A',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e7300000-0000-4000-8000-000000000202','e7300000-0000-4000-8000-000000000001','BUS-002','Santri Unit B',decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex')),
  ('e7300000-0000-4000-8000-000000000203','e7300000-0000-4000-8000-000000000001','BUS-003','Santri Belum Dipetakan',decode(repeat('ad',44),'hex'),decode(repeat('cf',32),'hex')),
  ('e7300000-0000-4000-8000-000000000204','e7300000-0000-4000-8000-000000000001','BUS-004','Santri Unit A Kamar Unit B',decode(repeat('ae',44),'hex'),decode(repeat('d0',32),'hex'));
INSERT INTO public.students (id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id, building_id, organization_unit_id, status) VALUES
  ('e7300000-0000-4000-8000-000000000301','e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000201','9730000001','Santri Unit A','L','VII',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'BUS-C-A','BUS-R-A','BUS-G-A','e7300000-0000-4000-8000-000000000101','Active'),
  ('e7300000-0000-4000-8000-000000000302','e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000202','9730000002','Santri Unit B','L','VII',decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'BUS-C-B','BUS-R-B','BUS-G-B','e7300000-0000-4000-8000-000000000102','Active'),
  ('e7300000-0000-4000-8000-000000000303','e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000203','9730000003','Santri Belum Dipetakan','L','VII',decode(repeat('36',44),'hex'),decode(repeat('58',32),'hex'),'BUS-C-A','BUS-R-SHARED','BUS-G-SHARED',NULL,'Active'),
  ('e7300000-0000-4000-8000-000000000304','e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000204','9730000004','Santri Unit A Kamar Unit B','L','VII',decode(repeat('37',44),'hex'),decode(repeat('59',32),'hex'),'BUS-C-A','BUS-R-B','BUS-G-B','e7300000-0000-4000-8000-000000000101','Active');

INSERT INTO public.boarding_staff_assignments (tenant_id, user_id, room_id, created_by_user_id)
VALUES
  ('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-A','e7300000-0000-4000-8000-000000000011');

SET LOCAL ROLE service_role;
SELECT ok(public.boarding_user_can_access_student('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000301'),'Ustadz can access an assigned student in their unit');
SELECT ok(NOT public.boarding_user_can_access_student('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000302'),'Ustadz cannot access a student in another unit');
SELECT ok(NOT public.boarding_user_can_access_student('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000303'),'Ustadz cannot access an unmapped historical student');
SELECT ok(NOT public.boarding_user_can_access_student('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000304'),'unit-mapped student is denied when assigned to another unit location');
UPDATE public.students SET status='Alumni' WHERE id='e7300000-0000-4000-8000-000000000301';
SELECT ok(NOT public.boarding_user_can_access_student('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','e7300000-0000-4000-8000-000000000301'),'Ustadz cannot access alumni through active boarding workflows');
UPDATE public.students SET status='Active' WHERE id='e7300000-0000-4000-8000-000000000301';
SELECT ok(public.boarding_user_can_access_room('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-A'),'Ustadz can access an assigned room in their unit');
SELECT ok(NOT public.boarding_user_can_access_room('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-SHARED'),'Ustadz cannot access an unmapped historical location');
SELECT ok(NOT public.boarding_user_can_access_room('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-B'),'Ustadz cannot access a room in another unit');
SELECT ok(NOT public.boarding_user_can_access_room('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000013','BUS-R-SHARED'),'Ustadz without an active unit cannot access boarding locations');
SELECT throws_ok($$INSERT INTO public.boarding_staff_assignments (tenant_id,user_id,room_id,created_by_user_id)
  VALUES ('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-B','e7300000-0000-4000-8000-000000000011')$$,
  '42501','Kamar berada di luar unit petugas','database rejects cross-unit room assignment');
SELECT throws_ok($$INSERT INTO public.boarding_staff_assignments (tenant_id,user_id,room_id,created_by_user_id)
  VALUES ('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000013','BUS-R-SHARED','e7300000-0000-4000-8000-000000000011')$$,
  '42501','Petugas asrama harus memiliki unit organisasi aktif','database rejects assignment to an Ustadz without a unit');
SELECT throws_ok($$INSERT INTO public.boarding_staff_assignments (tenant_id,user_id,room_id,created_by_user_id)
  VALUES ('e7300000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000012','BUS-R-SHARED','e7300000-0000-4000-8000-000000000011')$$,
  '42501','Kamar berada di luar unit petugas','database rejects assignment to an unmapped location');

SELECT * FROM finish();
ROLLBACK;
