-- Public PPDB replay contract tests. Synthetic identities only; all rows roll back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('e5000000-0000-4000-8000-000000000005', 'ppdb-idempotency-test', 'PPDB Idempotency Test', 'active');

CREATE TEMP TABLE ppdb_idempotency_fixture AS
SELECT
  'e5000000-0000-4000-8000-000000000005'::UUID AS tenant_id,
  'e5000000-0000-4000-8000-000000000101'::UUID AS candidate_id,
  2027::SMALLINT AS admission_year,
  jsonb_build_object(
    'name', 'Calon Uji Retry', 'previousSchool', 'Sekolah Uji', 'grade', 'VII',
    'phone', '081234567890', 'whatsappPhone', '081234567890', 'email', 'retry@example.invalid',
    'nikCiphertext', repeat('ab', 44), 'nikFingerprint', repeat('cd', 32),
    'nisnCiphertext', repeat('ef', 44), 'nisnFingerprint', repeat('12', 32),
    'pob', 'Jakarta', 'dob', '2011-01-01', 'address', 'Alamat Uji', 'gender', 'L',
    'fatherName', 'Ayah Uji', 'motherName', 'Ibu Uji'
  ) AS candidate,
  jsonb_build_object(
    'kk', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/kk-first.pdf',
    'birthCertificate', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/birth-first.pdf',
    'reportCards', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/reports-first.pdf',
    'pasPhoto', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/photo-first.jpg'
  ) AS first_paths,
  jsonb_build_object(
    'kk', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/kk-retry.pdf',
    'birthCertificate', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/birth-retry.pdf',
    'reportCards', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/reports-retry.pdf',
    'pasPhoto', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/photo-retry.jpg'
  ) AS retry_paths,
  repeat('a1', 32) AS fingerprint,
  repeat('b2', 32) AS different_fingerprint,
  jsonb_build_array(
    'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/kk-first.pdf',
    'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/birth-first.pdf',
    'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/reports-first.pdf',
    'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/photo-first.jpg'
  ) AS expected_previous_paths;
GRANT SELECT ON ppdb_idempotency_fixture TO service_role;
CREATE TEMP TABLE ppdb_replay_result (result JSONB);
GRANT SELECT, INSERT ON ppdb_replay_result TO service_role;

SELECT ok(
  NOT has_function_privilege('anon', 'public.submit_public_ppdb_idempotent(uuid,uuid,smallint,jsonb,jsonb,text)', 'EXECUTE'),
  'anonymous clients cannot call the idempotent PPDB RPC directly'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.submit_public_ppdb_idempotent(uuid,uuid,smallint,jsonb,jsonb,text)', 'EXECUTE'),
  'authenticated clients cannot call the idempotent PPDB RPC directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.submit_public_ppdb_idempotent(uuid,uuid,smallint,jsonb,jsonb,text)', 'EXECUTE'),
  'only the trusted server role can call the idempotent PPDB RPC'
);

SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$SELECT public.submit_public_ppdb_idempotent(
    'e5000000-0000-4000-8000-000000000005',
    'e5000000-0000-4000-8000-000000000102',
    2027::SMALLINT,
    (SELECT candidate FROM ppdb_idempotency_fixture),
    jsonb_build_object(
      'kk', 'e5000000-0000-4000-8000-000000000006/e5000000-0000-4000-8000-000000000102/kk.pdf',
      'birthCertificate', 'e5000000-0000-4000-8000-000000000006/e5000000-0000-4000-8000-000000000102/birth.pdf',
      'reportCards', 'e5000000-0000-4000-8000-000000000006/e5000000-0000-4000-8000-000000000102/reports.pdf',
      'pasPhoto', 'e5000000-0000-4000-8000-000000000006/e5000000-0000-4000-8000-000000000102/photo.jpg'
    ),
    repeat('c3', 32)
  )$$,
  '22023',
  'Invalid PPDB document paths',
  'a candidate cannot bind storage objects from another tenant'
);

SELECT is(
  (SELECT (public.submit_public_ppdb_idempotent(
    tenant_id, candidate_id, admission_year, candidate, first_paths, fingerprint
  )->>'registrationId') FROM ppdb_idempotency_fixture),
  'PPDB-2027-000001',
  'the first submission creates one registration'
);
SELECT is(
  (SELECT (public.submit_public_ppdb_idempotent(
    tenant_id, candidate_id, admission_year, candidate, first_paths, fingerprint
  )->>'alreadyApplied') FROM ppdb_idempotency_fixture),
  'false',
  'the initial response identifies a newly applied submission'
);

INSERT INTO ppdb_replay_result (result)
SELECT public.submit_public_ppdb_idempotent(
  tenant_id, candidate_id, admission_year, candidate, retry_paths, fingerprint
)
FROM ppdb_idempotency_fixture;

RESET ROLE;

SELECT is((SELECT result->>'alreadyApplied' FROM ppdb_replay_result), 'true',
  'a same-payload retry returns the existing submission');
SELECT is((SELECT result->>'registrationId' FROM ppdb_replay_result), 'PPDB-2027-000001',
  'a retry returns the original registration number');
SELECT is((SELECT result->'previousDocumentPaths' FROM ppdb_replay_result),
  (SELECT expected_previous_paths FROM ppdb_idempotency_fixture),
  'a retry returns the previous private object paths for cleanup');
SELECT is((SELECT kk_path FROM public.candidate_documents
  WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
    AND candidate_id = 'e5000000-0000-4000-8000-000000000101'),
  'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/kk-retry.pdf',
  'a retry replaces the candidate document pointer before old objects are cleaned');
SELECT is((SELECT count(*)::INT FROM public.candidates
  WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
    AND id = 'e5000000-0000-4000-8000-000000000101'),
  1,
  'same request UUID never creates a second candidate');
SELECT is((SELECT public_submission_fingerprint FROM public.candidates
  WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
    AND id = 'e5000000-0000-4000-8000-000000000101'),
  decode(repeat('a1', 32), 'hex'),
  'only the 32-byte request HMAC is persisted');
SELECT is((SELECT last_value FROM public.registration_counters
  WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
    AND admission_year = 2027),
  1,
  'a retry does not consume another registration number');
SELECT throws_ok(
  $$SELECT public.submit_public_ppdb_idempotent(
    'e5000000-0000-4000-8000-000000000005',
    'e5000000-0000-4000-8000-000000000101',
    2027::SMALLINT,
    jsonb_build_object('name', 'Data Berubah'),
    jsonb_build_object(
      'kk', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/kk-conflict.pdf',
      'birthCertificate', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/birth-conflict.pdf',
      'reportCards', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/reports-conflict.pdf',
      'pasPhoto', 'e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000101/photo-conflict.jpg'
    ),
    repeat('b2', 32)
  )$$,
  'P0001',
  'PPDB idempotency key was reused with different data',
  'the same request UUID cannot silently overwrite a different payload'
);

SELECT * FROM finish();
ROLLBACK;
