-- Synthetic authorization, idempotency, and tenant-boundary checks for class-unit mapping.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(22);

INSERT INTO public.tenants(id, slug, name, status)
VALUES
  ('e2800000-0000-4000-8000-000000000001','academic-class-map-test','Academic Class Mapping Test','active'),
  ('e2800000-0000-4000-8000-000000000002','academic-class-map-other','Academic Class Mapping Other Tenant','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2800000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-class-admin@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2800000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-class-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000001','academic-class-admin@test.invalid','Academic Admin','admin','active','{"academic":true}'),
  ('e2800000-0000-4000-8000-000000000012','e2800000-0000-4000-8000-000000000001','academic-class-teacher@test.invalid','Academic Teacher','ustadz','active','{"academic":true}');
INSERT INTO public.organization_units(id,tenant_id,code,name,unit_type,status,created_by_user_id,updated_by_user_id)
VALUES
  ('e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000001','UNIT-A','Unit Akademik A','sekolah','active','e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000011'),
  ('e2800000-0000-4000-8000-000000000102','e2800000-0000-4000-8000-000000000001','UNIT-B','Unit Akademik B','sekolah','active','e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000011'),
  ('e2800000-0000-4000-8000-000000000103','e2800000-0000-4000-8000-000000000001','UNIT-X','Unit Akademik Nonaktif','sekolah','inactive','e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000011');
INSERT INTO public.master_data_records(tenant_id,category,id,name,status,organization_unit_id)
VALUES
  ('e2800000-0000-4000-8000-000000000001','Kelas','CLASS-A','VII','Active','e2800000-0000-4000-8000-000000000101'),
  ('e2800000-0000-4000-8000-000000000001','Kelas','CLASS-B','VII','Active','e2800000-0000-4000-8000-000000000102'),
  ('e2800000-0000-4000-8000-000000000001','Kelas','CLASS-C','VIII','Active',NULL),
  ('e2800000-0000-4000-8000-000000000001','Kelas','CLASS-D','IX','Active',NULL),
  ('e2800000-0000-4000-8000-000000000001','Kelas','CLASS-E','VII','Active',NULL),
  ('e2800000-0000-4000-8000-000000000002','Kelas','FOREIGN-CLASS','Kelas Tenant Lain','Active',NULL);

SELECT ok(NOT has_function_privilege('anon','public.assign_tenant_academic_class_unit(uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'anonymous callers cannot assign a class unit');
SELECT ok(NOT has_function_privilege('authenticated','public.assign_tenant_academic_class_unit(uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'browser users cannot call the assignment RPC directly');
SELECT ok(has_function_privilege('service_role','public.assign_tenant_academic_class_unit(uuid,uuid,text,text,uuid,uuid)','EXECUTE'),'trusted server can invoke the assignment RPC');
SELECT ok(NOT has_table_privilege('anon','public.academic_class_unit_assignment_requests','SELECT'),'anonymous callers cannot read the class mapping audit');
SELECT ok(NOT has_table_privilege('authenticated','public.academic_class_unit_assignment_requests','SELECT'),'browser users cannot read the class mapping audit directly');
SELECT ok(has_table_privilege('service_role','public.academic_class_unit_assignment_requests','INSERT'),'trusted server can persist class mapping audit records');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.academic_class_unit_assignment_requests'::regclass),'class mapping audit table has forced RLS');

SET LOCAL ROLE service_role;
SELECT is((public.get_tenant_unmapped_academic_classes('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin',100,0)->>'classCount')::integer,3,'Admin queue counts only unmapped classes in the requested tenant');
SELECT ok((public.get_tenant_unmapped_academic_classes('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin',100,0)->'classes') @> '[{"id":"CLASS-C"}]'::jsonb,'Admin queue includes the tenant class awaiting mapping');
SELECT ok(NOT ((public.get_tenant_unmapped_academic_classes('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin',100,0)->'classes') @> '[{"id":"FOREIGN-CLASS"}]'::jsonb),'Admin queue does not expose another tenant class');
SELECT is((public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-C','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000501')->>'alreadyApplied'),'false','Admin can map an unassigned class to an active unit');
SELECT is((SELECT organization_unit_id::text FROM public.master_data_records WHERE tenant_id='e2800000-0000-4000-8000-000000000001' AND category='Kelas' AND id='CLASS-C'),'e2800000-0000-4000-8000-000000000101','class mapping persists on its tenant-owned master data row');
SELECT is((public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-C','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000501')->>'alreadyApplied'),'true','same request can be safely retried');
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-C','e2800000-0000-4000-8000-000000000102','e2800000-0000-4000-8000-000000000501')$$,'23505','Kunci permintaan pemetaan kelas telah dipakai untuk data berbeda','request id cannot be replayed with different mapping data');
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-C','e2800000-0000-4000-8000-000000000102','e2800000-0000-4000-8000-000000000502')$$,'23514','Unit kelas sudah ditetapkan dan tidak dapat dipindahkan melalui pemetaan biasa','an assigned class cannot be silently reassigned');
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','FOREIGN-CLASS','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000503')$$,'P0002','Kelas tidak ditemukan pada tenant ini','class id from a different tenant is not accessible');
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-D','e2800000-0000-4000-8000-000000000103','e2800000-0000-4000-8000-000000000504')$$,'42501','Unit aktif tidak ditemukan pada tenant ini','inactive units cannot be used for class mapping');
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000012','admin','CLASS-D','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000505')$$,'42501','Profil Admin tidak aktif pada tenant','Ustadz cannot impersonate an Admin');
UPDATE public.profiles SET module_permissions = '{}'::jsonb
WHERE tenant_id='e2800000-0000-4000-8000-000000000001' AND user_id='e2800000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-D','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000507')$$,'42501','Profil Admin tidak memiliki akses Akademik pada tenant ini','Admin without Academic permission cannot assign a class');
SELECT throws_ok($$SELECT public.get_tenant_unmapped_academic_classes('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin',100,0)$$,'42501','Profil Admin tidak memiliki akses Akademik pada tenant ini','Admin without Academic permission cannot list classes');
UPDATE public.profiles SET module_permissions = '{"academic":true}'::jsonb
WHERE tenant_id='e2800000-0000-4000-8000-000000000001' AND user_id='e2800000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.assign_tenant_academic_class_unit('e2800000-0000-4000-8000-000000000001','e2800000-0000-4000-8000-000000000011','admin','CLASS-E','e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000506')$$,'23505','duplicate key value violates unique constraint "master_data_records_tenant_unit_class_name_uq"','duplicate class names in one unit remain rejected');
SELECT is((SELECT organization_unit_id::text FROM public.master_data_records WHERE tenant_id='e2800000-0000-4000-8000-000000000001' AND category='Kelas' AND id='CLASS-E'),NULL,'conflicting class mapping remains unapplied');

SELECT * FROM finish();
ROLLBACK;
