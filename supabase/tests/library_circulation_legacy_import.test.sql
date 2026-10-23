-- Tenant, relationship, idempotency and capacity checks for the legacy circulation importer.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('e3000000-0000-4000-8000-000000000001', 'library-circ-import-test', 'Library Circulation Import Test', 'active'),
  ('e3000000-0000-4000-8000-000000000002', 'library-circ-other-tenant', 'Library Circulation Other Tenant', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'e3000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'library-circ-admin@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'e3000000-0000-4000-8000-000000000011', 'e3000000-0000-4000-8000-000000000001',
  'library-circ-admin@test.invalid', 'Library Circulation Admin', 'admin', 'active', '{"library":true}'
);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e3000000-0000-4000-8000-000000000101', 'e3000000-0000-4000-8000-000000000001', 'LCI001', 'Santri Satu', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
  ('e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000002', 'LCI002', 'Santri Tenant Lain', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'));
INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status
)
VALUES
  ('e3000000-0000-4000-8000-000000000201', 'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000101', '9300000001', 'Santri Satu', 'L', 'VII', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'), 'active'),
  ('e3000000-0000-4000-8000-000000000202', 'e3000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000102', '9300000002', 'Santri Tenant Lain', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('9a', 32), 'hex'), 'active');

INSERT INTO public.library_books (
  id, tenant_id, title, author, category, total_copies, status, source_system,
  source_record_id, source_fingerprint, created_by_user_id
)
VALUES (
  'e3000000-0000-4000-8000-000000000301', 'e3000000-0000-4000-8000-000000000001',
  'Kitab Satu', 'Penyusun', 'Fikih', 2, 'active', 'legacy_import', repeat('a', 64), repeat('b', 64),
  'e3000000-0000-4000-8000-000000000011'
);

SELECT ok(to_regclass('public.library_circulation_import_batches') IS NOT NULL, 'circulation import batches exist');
SELECT ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='library_circulations' AND column_name='source_fingerprint'), 'circulation source fingerprints are stored');
SELECT ok(to_regprocedure('public.import_legacy_library_circulations(uuid,uuid,text,integer,jsonb)') IS NOT NULL, 'circulation import RPC has expected signature');
SELECT ok(has_function_privilege('service_role', 'public.import_legacy_library_circulations(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'service role can execute circulation import RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.import_legacy_library_circulations(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'anonymous clients cannot execute circulation importer');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_legacy_library_circulations(uuid,uuid,text,integer,jsonb)', 'EXECUTE'), 'authenticated clients cannot execute circulation importer directly');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.library_circulation_import_batches'::regclass), 'batch audit table forces row-level security');

SET LOCAL ROLE service_role;
SELECT is(
  public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('c',64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('d',64), 'sourceFingerprint', repeat('e',64),
      'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201',
      'borrowedOn', '2026-01-01', 'dueOn', '2026-01-15', 'returnedOn', NULL, 'status', 'active'
    )))->>'imported',
  '1', 'Admin imports a validated active circulation'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.library_circulations WHERE tenant_id='e3000000-0000-4000-8000-000000000001' AND source_system='legacy_import'),
  1, 'one tenant-scoped circulation is stored'
);
SELECT is(
  public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('c',64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('d',64), 'sourceFingerprint', repeat('e',64),
      'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201',
      'borrowedOn', '2026-01-01', 'dueOn', '2026-01-15', 'returnedOn', NULL, 'status', 'active'
    )))->>'alreadyApplied',
  'true', 'same snapshot retry is idempotent'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('f',64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('d',64), 'sourceFingerprint', repeat('1',64),
      'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201',
      'borrowedOn', '2026-01-01', 'dueOn', '2026-01-15', 'returnedOn', NULL, 'status', 'active'
    ))
  )$$,
  '23514', 'Legacy library circulation changed after preview', 'changed historical source cannot overwrite an import'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('2',64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('3',64), 'sourceFingerprint', repeat('4',64),
      'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000202',
      'borrowedOn', '2026-01-01', 'dueOn', '2026-01-15', 'returnedOn', NULL, 'status', 'active'
    ))
  )$$,
  '42501', 'Legacy circulation references another tenant or missing record', 'a student from another tenant is rejected'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('5',64), 2,
    jsonb_build_array(
      jsonb_build_object('sourceRecordId', repeat('6',64), 'sourceFingerprint', repeat('7',64), 'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201', 'borrowedOn', '2026-01-02', 'dueOn', '2026-01-16', 'returnedOn', NULL, 'status', 'active'),
      jsonb_build_object('sourceRecordId', repeat('8',64), 'sourceFingerprint', repeat('9',64), 'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201', 'borrowedOn', '2026-01-03', 'dueOn', '2026-01-17', 'returnedOn', NULL, 'status', 'active')
    )
  )$$,
  '23514', 'Legacy active loans exceed the tenant book copy count', 'active circulation import cannot exceed book copies'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_circulations(
    'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000011', repeat('a',64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('b',64), 'sourceFingerprint', repeat('c',64),
      'bookId', 'e3000000-0000-4000-8000-000000000301', 'studentId', 'e3000000-0000-4000-8000-000000000201',
      'borrowedOn', '2026-01-01', 'dueOn', '2026-01-15', 'returnedOn', NULL, 'status', 'returned'
    ))
  )$$,
  '22023', 'Invalid legacy library circulation dates or status', 'returned transaction without a return date is rejected'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.library_circulations WHERE tenant_id='e3000000-0000-4000-8000-000000000001' AND source_system='legacy_import'),
  1, 'failed imports roll back all new rows'
);

SELECT * FROM finish();
ROLLBACK;

