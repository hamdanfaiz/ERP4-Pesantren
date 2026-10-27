-- Contract tests for the tenant-scoped legacy Pegawai importer.
-- Fixtures are synthetic and the enclosing transaction rolls back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(19);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('d4000000-0000-4000-8000-000000000001', 'hris-import-test', 'HRIS Import Test', 'active'),
  ('d4000000-0000-4000-8000-000000000002', 'hris-other-tenant', 'HRIS Other Tenant', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd4000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hris-admin@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd4000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000001',
  'hris-admin@test.invalid', 'HRIS Import Admin', 'admin', 'active', '{"hris":true}'
);

CREATE TEMP TABLE hris_auth_users_before_import ON COMMIT DROP AS
SELECT count(*)::INTEGER AS user_count FROM auth.users;

SELECT ok(to_regclass('public.hris_employee_import_batches') IS NOT NULL, 'HRIS import batches are recorded');
SELECT ok(EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'hris_employees' AND column_name = 'source_fingerprint'
), 'HRIS employees retain immutable legacy source fingerprints');
SELECT ok(EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'hris_employees' AND column_name = 'legacy_details'
), 'legacy-only employee attributes have a restricted storage column');
SELECT ok(to_regprocedure('public.import_legacy_hris_employees(uuid,uuid,text,integer,jsonb)') IS NOT NULL, 'HRIS import RPC has the expected signature');
SELECT ok(has_function_privilege('service_role', 'public.import_legacy_hris_employees(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'service role can execute the import RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.import_legacy_hris_employees(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'anonymous users cannot execute the import RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_legacy_hris_employees(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'browser-authenticated users cannot execute the import RPC directly');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_class WHERE oid = 'public.hris_employee_import_batches'::regclass AND relrowsecurity AND relforcerowsecurity
), 'HRIS import batch audit table forces row-level security');
SELECT ok(to_regclass('public.hris_employees_legacy_source_uq') IS NOT NULL, 'legacy source identity is unique per tenant');

SELECT is(
  public.import_legacy_hris_employees(
    'd4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000011',
    repeat('c', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'employeeId', 'd4000000-0000-4000-8000-000000000101',
      'clientRequestId', 'd4000000-0000-4000-8000-000000000199',
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('b', 64),
      'employeeNumber', 'EMP-001', 'fullName', 'Pegawai Uji', 'jobTitle', 'Pengelola Perpustakaan',
      'department', 'Perpustakaan', 'email', 'pegawai@test.invalid', 'phone', '+6281234567890',
      'employmentStatus', 'active', 'legacyDetails', '{"address":"Alamat Sintetis","sourceStatus":"Active"}'::jsonb
    )))->>'imported',
  '1',
  'Admin can import a valid HRIS employee snapshot'
);
SELECT is((
  SELECT count(*)::INTEGER FROM public.hris_employees
  WHERE tenant_id = 'd4000000-0000-4000-8000-000000000001'
    AND source_system = 'legacy_import' AND source_record_id = repeat('a', 64)
), 1, 'import creates exactly one tenant-scoped employee');
SELECT is((
  SELECT legacy_details->>'address' FROM public.hris_employees
  WHERE tenant_id = 'd4000000-0000-4000-8000-000000000001' AND employee_number = 'EMP-001'
), 'Alamat Sintetis', 'archive-only employee attributes are retained');
SELECT is((
  SELECT count(*)::INTEGER FROM public.hris_employee_events
  WHERE tenant_id = 'd4000000-0000-4000-8000-000000000001' AND employee_id = 'd4000000-0000-4000-8000-000000000101'
), 1, 'import action is written to the HRIS audit event stream');
SELECT is(
  (SELECT count(*)::INTEGER FROM auth.users),
  (SELECT user_count FROM hris_auth_users_before_import),
  'employee import does not create Supabase Auth accounts'
);
SELECT is(
  public.import_legacy_hris_employees(
    'd4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000011',
    repeat('c', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'employeeId', 'd4000000-0000-4000-8000-000000000101',
      'clientRequestId', 'd4000000-0000-4000-8000-000000000199',
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('b', 64),
      'employeeNumber', 'EMP-001', 'fullName', 'Pegawai Uji', 'jobTitle', 'Pengelola Perpustakaan',
      'department', 'Perpustakaan', 'email', 'pegawai@test.invalid', 'phone', '+6281234567890',
      'employmentStatus', 'active', 'legacyDetails', '{"address":"Alamat Sintetis","sourceStatus":"Active"}'::jsonb
    )))->>'alreadyApplied',
  'true', 'retrying the same source snapshot is idempotent'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_hris_employees(
    'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000011', repeat('d', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'employeeId', 'd4000000-0000-4000-8000-000000000102',
      'clientRequestId', 'd4000000-0000-4000-8000-000000000198',
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('e', 64),
      'employeeNumber', 'EMP-CHANGED', 'fullName', 'Pegawai Uji Berubah', 'jobTitle', 'Pengelola Perpustakaan',
      'department', 'Perpustakaan', 'employmentStatus', 'active', 'legacyDetails', '{}'::jsonb
    ))
  )$$,
  '23514', 'Legacy employee changed after preview', 'changed legacy source cannot overwrite HRIS data'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_hris_employees(
    'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000011', repeat('f', 64), 0, '[]'::jsonb
  )$$,
  '42501', 'Admin tenant dengan izin HRIS diperlukan', 'an actor cannot import into another tenant'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_hris_employees(
    'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000011', repeat('f', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'employeeId', 'd4000000-0000-4000-8000-000000000103',
      'clientRequestId', 'd4000000-0000-4000-8000-000000000197',
      'sourceRecordId', repeat('f', 64), 'sourceFingerprint', repeat('e', 64),
      'employeeNumber', 'EMP-001', 'fullName', 'Nomor Konflik', 'jobTitle', 'Staf',
      'department', 'Perpustakaan', 'employmentStatus', 'active', 'legacyDetails', '{}'::jsonb
    ))
  )$$,
  '23505', 'Legacy employee number conflicts with an existing HRIS record', 'duplicate employee number is rejected'
);
SELECT is((
  SELECT count(*)::INTEGER FROM public.hris_employees WHERE tenant_id = 'd4000000-0000-4000-8000-000000000001'
), 1, 'rejected changes do not leave partial HRIS rows');

SELECT * FROM finish();
ROLLBACK;

