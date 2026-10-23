-- Contract tests for the tenant-scoped legacy library catalog importer.
-- Uses catalog metadata only; no live or production records are touched.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(15);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('c3000000-0000-4000-8000-000000000001', 'library-import-test', 'Library Import Test', 'active'),
  ('c3000000-0000-4000-8000-000000000002', 'library-other-tenant', 'Library Other Tenant', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'c3000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'library-admin@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'c3000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000001',
  'library-admin@test.invalid', 'Library Import Admin', 'admin', 'active', '{"library":true}'
);

SELECT ok(
  to_regclass('public.library_book_import_batches') IS NOT NULL,
  'library import batches are recorded'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'library_books' AND column_name = 'source_fingerprint'
  ),
  'library books preserve immutable legacy source fingerprints'
);
SELECT ok(
  to_regprocedure('public.import_legacy_library_books(uuid,uuid,text,integer,jsonb)') IS NOT NULL,
  'legacy library import RPC has the expected signature'
);
SELECT ok(
  has_function_privilege('service_role', 'public.import_legacy_library_books(uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'trusted service role can execute the import RPC'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.import_legacy_library_books(uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'anonymous clients cannot execute the import RPC'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.import_legacy_library_books(uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'authenticated clients cannot execute the import RPC directly'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.library_book_import_batches'::regclass AND relrowsecurity AND relforcerowsecurity
  ),
  'import batch audit table forces row-level security'
);
SELECT ok(
  to_regclass('public.library_books_isbn_canonical_uq') IS NOT NULL,
  'canonical ISBN index protects tenant catalog uniqueness across formatting'
);

SELECT is(
  public.import_legacy_library_books(
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000011',
    repeat('c', 64),
    1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('b', 64),
      'clientRequestId', 'c3000000-0000-4000-8000-000000000099',
      'title', 'Kitab Uji', 'author', 'Penyusun Uji', 'category', 'Fikih',
      'isbn', '9780306406157', 'totalCopies', 2, 'shelf', 'A-01'
    ))->>'imported',
  '1',
  'Admin can import a valid book snapshot'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.library_books
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000001'
     AND source_system = 'legacy_import' AND source_record_id = repeat('a', 64)),
  1,
  'import writes one tenant-scoped catalog entry'
);
SELECT is(
  public.import_legacy_library_books(
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000011',
    repeat('c', 64),
    1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('b', 64),
      'clientRequestId', 'c3000000-0000-4000-8000-000000000099',
      'title', 'Kitab Uji', 'author', 'Penyusun Uji', 'category', 'Fikih',
      'isbn', '9780306406157', 'totalCopies', 2, 'shelf', 'A-01'
    ))->>'alreadyApplied',
  'true',
  'retrying an applied snapshot is idempotent'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_books(
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000011',
    repeat('d', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('a', 64), 'sourceFingerprint', repeat('e', 64),
      'clientRequestId', 'c3000000-0000-4000-8000-000000000098',
      'title', 'Kitab Uji Berubah', 'author', 'Penyusun Uji', 'category', 'Fikih',
      'isbn', '9781861972712', 'totalCopies', 2, 'shelf', 'A-01'
    ))
  )$$,
  '23514',
  'Legacy library book changed after preview',
  'changed legacy source cannot overwrite imported data'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_books(
    'c3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000011',
    repeat('f', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('f', 64), 'sourceFingerprint', repeat('e', 64),
      'clientRequestId', 'c3000000-0000-4000-8000-000000000097',
      'title', 'Buku Tenant Lain', 'author', 'Penyusun', 'category', 'Fikih',
      'isbn', '9781861972712', 'totalCopies', 1, 'shelf', 'B-01'
    ))
  )$$,
  '42501',
  'Impor katalog hanya tersedia untuk Admin aktif tenant',
  'actor cannot import into a different tenant'
);
SELECT throws_ok(
  $$SELECT public.import_legacy_library_books(
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000011',
    repeat('f', 64), 1,
    jsonb_build_array(jsonb_build_object(
      'sourceRecordId', repeat('f', 64), 'sourceFingerprint', repeat('e', 64),
      'clientRequestId', 'c3000000-0000-4000-8000-000000000096',
      'title', 'Edisi lain', 'author', 'Penyusun lain', 'category', 'Fikih',
      'isbn', '978-0-306-40615-7', 'totalCopies', 1, 'shelf', 'B-01'
    ))
  )$$,
  '23505',
  'Legacy ISBN conflicts with an existing tenant catalog entry',
  'canonical ISBN formatting cannot bypass duplicate detection'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.library_books
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000001'),
  1,
  'rejected import attempts leave no partial catalog rows'
);

SELECT * FROM finish();
ROLLBACK;
