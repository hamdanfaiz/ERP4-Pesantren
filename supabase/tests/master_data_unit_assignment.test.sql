-- One-time, tenant-scoped unit assignment for existing candidates and students.
-- All fixtures are synthetic and the transaction is rolled back at the end.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('e3000000-0000-4000-8000-000000000001', 'unit-map-a-test', 'Unit Map A Test', 'active'),
  ('e4000000-0000-4000-8000-000000000002', 'unit-map-b-test', 'Unit Map B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('e3000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-map-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e3000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-map-ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e3000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-map-admin-denied@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e4000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-map-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e3000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000001', 'unit-map-admin-a@test.invalid', 'Admin A', 'admin', 'active', '{}'),
  ('e3000000-0000-4000-8000-000000000012', 'e3000000-0000-4000-8000-000000000001', 'unit-map-ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{}'),
  ('e3000000-0000-4000-8000-000000000013', 'e3000000-0000-4000-8000-000000000001', 'unit-map-admin-denied@test.invalid', 'Admin Without Master Data', 'admin', 'active', '{"master-data":false}'),
  ('e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000002', 'unit-map-admin-b@test.invalid', 'Admin B', 'admin', 'active', '{}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id)
VALUES
  ('e3000000-0000-4000-8000-000000000101', 'e3000000-0000-4000-8000-000000000001', 'PUSAT', 'Unit Pusat', 'pesantren', 'active', 'e3000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000011'),
  ('e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000001', 'CABANG', 'Unit Cabang', 'pesantren', 'active', 'e3000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000011'),
  ('e4000000-0000-4000-8000-000000000103', 'e4000000-0000-4000-8000-000000000002', 'PUSAT', 'Unit Tenant B', 'pesantren', 'active', 'e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000021');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000001', 'UNIT-MAP-001', 'Calon Santri Satu', decode(repeat('ab', 44), 'hex'), decode(repeat('11', 32), 'hex')),
  ('e3000000-0000-4000-8000-000000000202', 'e3000000-0000-4000-8000-000000000001', 'UNIT-MAP-002', 'Calon Santri Dua', decode(repeat('ac', 44), 'hex'), decode(repeat('12', 32), 'hex')),
  ('e3000000-0000-4000-8000-000000000203', 'e3000000-0000-4000-8000-000000000001', 'UNIT-MAP-003', 'Calon Santri Tiga', decode(repeat('ad', 44), 'hex'), decode(repeat('13', 32), 'hex'));

INSERT INTO public.master_data_records (tenant_id, category, id, name, capacity)
VALUES
  ('e3000000-0000-4000-8000-000000000001', 'Kelas', 'unit-map-class', 'Kelas Unit Map', NULL),
  ('e3000000-0000-4000-8000-000000000001', 'Kamar', 'unit-map-room', 'Kamar Unit Map', 10);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
)
VALUES
  ('e3000000-0000-4000-8000-000000000301', 'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000201', '1234500001', 'Santri Satu', 'L', 'VII', decode(repeat('cd', 44), 'hex'), decode(repeat('21', 32), 'hex'), 'unit-map-class', 'unit-map-room'),
  ('e3000000-0000-4000-8000-000000000302', 'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000202', '1234500002', 'Santri Dua', 'P', 'VII', decode(repeat('ce', 44), 'hex'), decode(repeat('22', 32), 'hex'), 'unit-map-class', 'unit-map-room'),
  ('e3000000-0000-4000-8000-000000000304', 'e3000000-0000-4000-8000-000000000001', NULL, '1234500004', 'Santri Mandiri', 'L', 'VIII', decode(repeat('d0', 44), 'hex'), decode(repeat('24', 32), 'hex'), 'unit-map-class', 'unit-map-room');

INSERT INTO public.finance_bills (
  id, tenant_id, student_id, candidate_id, student_name, grade, fee_type, period, amount, payment_type, created_by_user_id
)
VALUES
  ('e3000000-0000-4000-8000-000000000501', 'e3000000-0000-4000-8000-000000000001', NULL, 'e3000000-0000-4000-8000-000000000203', 'Calon Santri Tiga', 'VII', 'Biaya Pendaftaran', 'UNIT-MAP-003', 100000, 'registration', 'e3000000-0000-4000-8000-000000000011'),
  ('e3000000-0000-4000-8000-000000000502', 'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000302', NULL, 'Santri Dua', 'VII', 'SPP', '2027-01', 100000, NULL, 'e3000000-0000-4000-8000-000000000011');

UPDATE public.candidates
SET master_student_id = CASE id
  WHEN 'e3000000-0000-4000-8000-000000000201' THEN 'e3000000-0000-4000-8000-000000000301'::uuid
  WHEN 'e3000000-0000-4000-8000-000000000202' THEN 'e3000000-0000-4000-8000-000000000302'::uuid
END
WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001';

SELECT ok(NOT has_table_privilege('anon', 'public.master_data_unit_assignment_requests', 'SELECT'), 'anonymous users cannot read unit assignment request records');
SELECT ok(NOT has_table_privilege('authenticated', 'public.master_data_unit_assignment_requests', 'INSERT'), 'browser users cannot forge unit assignment requests');
SELECT ok(NOT has_function_privilege('anon', 'public.assign_tenant_master_data_unit(uuid,uuid,text,text,uuid,uuid,uuid)', 'EXECUTE'), 'anonymous callers cannot assign a unit');
SELECT ok(NOT has_function_privilege('authenticated', 'public.assign_tenant_master_data_unit(uuid,uuid,text,text,uuid,uuid,uuid)', 'EXECUTE'), 'browser callers cannot assign a unit');
SELECT ok(has_function_privilege('service_role', 'public.assign_tenant_master_data_unit(uuid,uuid,text,text,uuid,uuid,uuid)', 'EXECUTE'), 'trusted server can assign a unit');
SELECT ok(NOT has_function_privilege('anon', 'public.get_tenant_unmapped_master_data_units(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'anonymous callers cannot read unmapped master data');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_tenant_unmapped_master_data_units(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'browser clients cannot read the mapping queue directly');
SELECT ok(has_function_privilege('service_role', 'public.get_tenant_unmapped_master_data_units(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'trusted server can read the Admin mapping queue');

SET LOCAL ROLE service_role;
SELECT is(
  public.get_tenant_unmapped_master_data_units(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 2, 0
  )->>'candidateCount',
  '3', 'Admin sees the total count of unmapped candidates for their tenant'
);
SELECT is(
  jsonb_array_length(public.get_tenant_unmapped_master_data_units(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 2, 0
  )->'candidates'),
  2, 'the mapping queue paginates candidate records'
);
SELECT is(
  jsonb_array_length(public.get_tenant_unmapped_master_data_units(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 2, 2
  )->'candidates'),
  1, 'the mapping queue returns the remaining candidate on the next page'
);
SELECT is(
  public.get_tenant_unmapped_master_data_units(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 2, 0
  )->>'studentCount',
  '1', 'only standalone students without a linked candidate enter the separate student mapping queue'
);
SELECT is(
  (public.get_tenant_unmapped_master_data_units(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 2, 0
  )->'students'->0->>'id'),
  'e3000000-0000-4000-8000-000000000304', 'the queue avoids showing a linked candidate student twice'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_unmapped_master_data_units('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000011', 'admin', 100, 0)$$,
  '42501', 'Profil Admin tidak aktif pada tenant', 'an Admin cannot inspect another tenant mapping queue'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_unmapped_master_data_units('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 101, 0)$$,
  '22023', 'Permintaan daftar data tanpa unit tidak valid', 'the queue enforces a bounded page size'
);
SELECT is(
  public.assign_tenant_master_data_unit(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin',
    'candidate', 'e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000101',
    'e3000000-0000-4000-8000-000000000401'
  )->>'success',
  'true', 'Admin maps an existing candidate to an active unit in the same tenant'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.students WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000301'),
  'e3000000-0000-4000-8000-000000000101', 'candidate mapping also assigns its linked student atomically'
);
SELECT ok(
  (public.assign_tenant_master_data_unit(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin',
    'candidate', 'e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000101',
    'e3000000-0000-4000-8000-000000000401'
  )->>'alreadyApplied')::boolean,
  'retrying the same mapping request returns the saved result'
);
SELECT is((SELECT count(*)::int FROM public.master_data_unit_assignment_requests WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001'), 1, 'idempotent retry stores only one mapping request');
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 'candidate', 'e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000401')$$,
  '23505', 'Kunci permintaan pemetaan unit telah dipakai untuk data berbeda', 'an idempotency key cannot be reused with another unit'
);
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 'candidate', 'e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000402')$$,
  '23514', 'Unit data tidak dapat dipindahkan setelah ditetapkan', 'an assigned candidate cannot be moved to a different unit'
);
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin', 'candidate', 'e3000000-0000-4000-8000-000000000201', 'e4000000-0000-4000-8000-000000000103', 'e3000000-0000-4000-8000-000000000403')$$,
  '42501', 'Unit aktif tidak ditemukan pada tenant ini', 'a candidate cannot be assigned to another tenant unit'
);
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000012', 'ustadz', 'student', 'e3000000-0000-4000-8000-000000000302', 'e3000000-0000-4000-8000-000000000101', 'e3000000-0000-4000-8000-000000000404')$$,
  '42501', 'Profil Admin tidak aktif pada tenant', 'non-admin roles cannot map candidate or student units'
);
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000013', 'admin', 'candidate', 'e3000000-0000-4000-8000-000000000202', 'e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000407')$$,
  '42501', 'Profil Admin tidak memiliki akses Master Data pada tenant ini', 'Admin with explicit Master Data denial cannot assign units'
);
SELECT is(
  public.assign_tenant_master_data_unit(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin',
    'student', 'e3000000-0000-4000-8000-000000000302', 'e3000000-0000-4000-8000-000000000102',
    'e3000000-0000-4000-8000-000000000405'
  )->>'unitId',
  'e3000000-0000-4000-8000-000000000102', 'Admin can map a student through the student-side path'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.candidates WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000202'),
  'e3000000-0000-4000-8000-000000000102', 'student mapping also assigns its linked candidate atomically'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.finance_bills WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000502'),
  'e3000000-0000-4000-8000-000000000102', 'mapping a student also assigns their existing finance bills'
);
SELECT throws_ok(
  $$SELECT public.assign_tenant_master_data_unit('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000011', 'admin', 'candidate', 'e3000000-0000-4000-8000-000000000201', 'e4000000-0000-4000-8000-000000000103', 'e4000000-0000-4000-8000-000000000406')$$,
  '42501', 'Profil Admin tidak aktif pada tenant', 'an Admin from another tenant cannot map records'
);
SELECT is(
  public.assign_tenant_master_data_unit(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin',
    'candidate', 'e3000000-0000-4000-8000-000000000203', 'e3000000-0000-4000-8000-000000000101',
    'e3000000-0000-4000-8000-000000000408'
  )->>'success',
  'true', 'an unlinked legacy candidate can be assigned before student onboarding'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.finance_bills WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000501'),
  'e3000000-0000-4000-8000-000000000101', 'mapping a candidate also assigns existing PPDB finance bills'
);
SELECT throws_ok(
  $$UPDATE public.finance_bills SET organization_unit_id = 'e3000000-0000-4000-8000-000000000102' WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000501'$$,
  '23514', 'Unit tagihan tidak cocok dengan calon santri atau santri', 'a finance bill cannot be moved away from its candidate unit'
);
INSERT INTO public.finance_bills (
  id, tenant_id, student_id, candidate_id, student_name, grade, fee_type, period, amount, payment_type, created_by_user_id
)
VALUES (
  'e3000000-0000-4000-8000-000000000503', 'e3000000-0000-4000-8000-000000000001', NULL,
  'e3000000-0000-4000-8000-000000000203', 'Calon Santri Tiga', 'VII', 'Uang Pangkal', 'UNIT-MAP-003', 500000, 'tuition',
  'e3000000-0000-4000-8000-000000000011'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.finance_bills WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000503'),
  'e3000000-0000-4000-8000-000000000101', 'new PPDB bills inherit the assigned candidate unit'
);
SELECT is(
  public.assign_tenant_master_data_unit(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', 'admin',
    'student', 'e3000000-0000-4000-8000-000000000304', 'e3000000-0000-4000-8000-000000000101',
    'e3000000-0000-4000-8000-000000000409'
  )->>'success',
  'true', 'an unlinked standalone student can be mapped directly to a unit'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.students WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000304'),
  'e3000000-0000-4000-8000-000000000101', 'the standalone student unit assignment is persisted'
);
SELECT throws_ok(
  $$INSERT INTO public.students (id, tenant_id, source_candidate_id, nis, name, gender, grade, organization_unit_id, nik_ciphertext, nik_fingerprint)
    VALUES ('e3000000-0000-4000-8000-000000000303', 'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000203', '1234500003', 'Santri Tiga Salah Unit', 'L', 'VII', 'e3000000-0000-4000-8000-000000000102', decode(repeat('cf', 44), 'hex'), decode(repeat('23', 32), 'hex'))$$,
  '23514', 'Unit calon santri dan santri tertaut tidak cocok', 'onboarding rejects a student unit that conflicts with the preassigned candidate'
);
INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
)
VALUES (
  'e3000000-0000-4000-8000-000000000303', 'e3000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000203', '1234500003', 'Santri Tiga', 'L', 'VII',
  decode(repeat('cf', 44), 'hex'), decode(repeat('23', 32), 'hex'), 'unit-map-class', 'unit-map-room'
);
SELECT is(
  (SELECT organization_unit_id::text FROM public.students WHERE tenant_id = 'e3000000-0000-4000-8000-000000000001' AND id = 'e3000000-0000-4000-8000-000000000303'),
  'e3000000-0000-4000-8000-000000000101', 'new student inherits the candidate unit during onboarding'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
