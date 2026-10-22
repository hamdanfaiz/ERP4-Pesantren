-- Public PPDB database contract tests. All rows use synthetic identities and roll back.
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(22);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('c3000000-0000-4000-8000-000000000003', 'ppdb-runtime-a-test', 'PPDB Runtime A Test', 'active'),
  ('d4000000-0000-4000-8000-000000000004', 'ppdb-runtime-b-test', 'PPDB Runtime B Test', 'active');

SELECT ok(
  NOT has_function_privilege('anon', 'public.submit_public_ppdb(uuid,uuid,smallint,jsonb,jsonb)', 'EXECUTE'),
  'anonymous clients cannot call the PPDB write RPC directly'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.submit_public_ppdb(uuid,uuid,smallint,jsonb,jsonb)', 'EXECUTE'),
  'authenticated browser clients cannot call the PPDB write RPC directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.submit_public_ppdb(uuid,uuid,smallint,jsonb,jsonb)', 'EXECUTE'),
  'trusted server role can call the PPDB write RPC'
);
SELECT ok(
  (SELECT public = false FROM storage.buckets WHERE id = 'ppdb-documents'),
  'PPDB document bucket remains private'
);

SET LOCAL ROLE service_role;

SELECT ok(public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit allows request 1 of 5');
SELECT ok(public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit allows request 2 of 5');
SELECT ok(public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit allows request 3 of 5');
SELECT ok(public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit allows request 4 of 5');
SELECT ok(public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit allows request 5 of 5');
SELECT ok(NOT public.consume_public_ppdb_rate_limit(
  'c3000000-0000-4000-8000-000000000003', repeat('a1', 32), 5
), 'PPDB rate limit rejects request 6 of 5');

SELECT is(
  public.submit_public_ppdb(
    'c3000000-0000-4000-8000-000000000003',
    'c3000000-0000-4000-8000-000000000101',
    2027::smallint,
    jsonb_build_object(
      'name', 'Santri Uji Satu', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
      'phone', '081234567890', 'whatsappPhone', '081234567890', 'email', 'uji1@example.invalid',
      'nikCiphertext', repeat('ab', 44), 'nikFingerprint', repeat('cd', 32),
      'pob', 'Jakarta', 'dob', '2011-01-01', 'address', 'Alamat Uji', 'gender', 'L',
      'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
    ),
    jsonb_build_object(
      'kk', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000101/kk.pdf',
      'birthCertificate', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000101/birth.pdf',
      'pasPhoto', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000101/photo.jpg'
    )
  )->>'registrationId',
  'PPDB-2027-000001',
  'first public registration receives the first tenant/year sequence'
);
SELECT is(
  (SELECT count(*)::int FROM public.candidates
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND id = 'c3000000-0000-4000-8000-000000000101'),
  1,
  'successful registration creates exactly one tenant candidate'
);
SELECT is(
  (SELECT kk_path FROM public.candidate_documents
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND candidate_id = 'c3000000-0000-4000-8000-000000000101'),
  'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000101/kk.pdf',
  'document metadata is linked to the new candidate under the tenant prefix'
);
SELECT is(
  (SELECT nik_ciphertext FROM public.candidates
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND id = 'c3000000-0000-4000-8000-000000000101'),
  decode(repeat('ab', 44), 'hex'),
  'database stores only the supplied ciphertext for NIK'
);
SELECT is(
  (SELECT fingerprint FROM public.identity_claims
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND identity_type = 'nik' AND entity_id = 'c3000000-0000-4000-8000-000000000101'),
  decode(repeat('cd', 32), 'hex'),
  'NIK uniqueness claim is recorded for the candidate'
);

SELECT throws_ok(
  $$SELECT public.submit_public_ppdb(
    'c3000000-0000-4000-8000-000000000003',
    'c3000000-0000-4000-8000-000000000102',
    2027::smallint,
    jsonb_build_object(
      'name', 'Santri Uji Duplikat', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
      'phone', '081234567891', 'whatsappPhone', '081234567891',
      'nikCiphertext', repeat('ef', 44), 'nikFingerprint', repeat('cd', 32),
      'pob', 'Jakarta', 'dob', '2011-02-02', 'address', 'Alamat Uji', 'gender', 'P',
      'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
    ),
    jsonb_build_object(
      'kk', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000102/kk.pdf',
      'birthCertificate', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000102/birth.pdf',
      'pasPhoto', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000102/photo.jpg'
    )
  )$$,
  '23505',
  'duplicate NIK fingerprint is rejected transactionally'
);
SELECT is(
  (SELECT count(*)::int FROM public.candidates
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND id = 'c3000000-0000-4000-8000-000000000102'),
  0,
  'failed duplicate identity leaves no candidate row'
);

SELECT is(
  public.submit_public_ppdb(
    'c3000000-0000-4000-8000-000000000003',
    'c3000000-0000-4000-8000-000000000103',
    2027::smallint,
    jsonb_build_object(
      'name', 'Santri Uji Dua', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
      'phone', '081234567892', 'whatsappPhone', '081234567892',
      'nikCiphertext', repeat('12', 44), 'nikFingerprint', repeat('34', 32),
      'pob', 'Bandung', 'dob', '2011-03-03', 'address', 'Alamat Uji', 'gender', 'L',
      'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
    ),
    jsonb_build_object(
      'kk', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000103/kk.pdf',
      'birthCertificate', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000103/birth.pdf',
      'pasPhoto', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000103/photo.jpg'
    )
  )->>'registrationId',
  'PPDB-2027-000002',
  'rejected identity does not consume the next registration number'
);

SELECT is(
  public.submit_public_ppdb(
    'd4000000-0000-4000-8000-000000000004',
    'd4000000-0000-4000-8000-000000000201',
    2027::smallint,
    jsonb_build_object(
      'name', 'Santri Tenant B', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
      'phone', '081234567893', 'whatsappPhone', '081234567893',
      'nikCiphertext', repeat('ab', 44), 'nikFingerprint', repeat('cd', 32),
      'pob', 'Jakarta', 'dob', '2011-04-04', 'address', 'Alamat Uji', 'gender', 'P',
      'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
    ),
    jsonb_build_object(
      'kk', 'd4000000-0000-4000-8000-000000000004/d4000000-0000-4000-8000-000000000201/kk.pdf',
      'birthCertificate', 'd4000000-0000-4000-8000-000000000004/d4000000-0000-4000-8000-000000000201/birth.pdf',
      'pasPhoto', 'd4000000-0000-4000-8000-000000000004/d4000000-0000-4000-8000-000000000201/photo.jpg'
    )
  )->>'registrationId',
  'PPDB-2027-000001',
  'same identity fingerprint may exist in a different tenant'
);
SELECT is(
  (SELECT count(*)::int FROM public.candidates
   WHERE tenant_id = 'd4000000-0000-4000-8000-000000000004'
     AND id = 'd4000000-0000-4000-8000-000000000201'),
  1,
  'second tenant candidate is isolated from tenant A identity claims'
);

SELECT throws_ok(
  $$SELECT public.submit_public_ppdb(
    'c3000000-0000-4000-8000-000000000003',
    'c3000000-0000-4000-8000-000000000104',
    2027::smallint,
    jsonb_build_object(
      'name', 'Santri Path Tidak Valid', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
      'phone', '081234567894', 'whatsappPhone', '081234567894',
      'nikCiphertext', repeat('56', 44), 'nikFingerprint', repeat('78', 32),
      'pob', 'Jakarta', 'dob', '2011-05-05', 'address', 'Alamat Uji', 'gender', 'L',
      'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
    ),
    jsonb_build_object(
      'kk', 'd4000000-0000-4000-8000-000000000004/d4000000-0000-4000-8000-000000000201/kk.pdf',
      'birthCertificate', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000104/birth.pdf',
      'pasPhoto', 'c3000000-0000-4000-8000-000000000003/c3000000-0000-4000-8000-000000000104/photo.jpg'
    )
  )$$,
  '22023',
  'document object paths cannot point outside their tenant/candidate prefix'
);
SELECT is(
  (SELECT count(*)::int FROM public.candidates
   WHERE tenant_id = 'c3000000-0000-4000-8000-000000000003'
     AND id = 'c3000000-0000-4000-8000-000000000104'),
  0,
  'invalid document path leaves no candidate row'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
