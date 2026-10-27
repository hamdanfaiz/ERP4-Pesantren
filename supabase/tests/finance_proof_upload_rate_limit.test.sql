-- Finance upload throttling is atomic, shared by server instances, tenant-scoped,
-- and callable only by the trusted backend. All fixtures are synthetic and rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('f2400000-0000-4000-8000-000000000001', 'finance-rate-a-test', 'Finance Rate A Test', 'active'),
  ('f2400000-0000-4000-8000-000000000002', 'finance-rate-b-test', 'Finance Rate B Test', 'active'),
  ('f2400000-0000-4000-8000-000000000003', 'finance-rate-inactive-test', 'Finance Rate Inactive Test', 'suspended');

SELECT ok(
  has_function_privilege('service_role', 'public.consume_finance_proof_upload_rate_limit(uuid,text,integer)', 'EXECUTE'),
  'trusted server role can consume finance proof rate limits'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_finance_proof_upload_rate_limit(uuid,text,integer)', 'EXECUTE'),
  'anonymous clients cannot consume or mutate finance rate limits'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.consume_finance_proof_upload_rate_limit(uuid,text,integer)', 'EXECUTE'),
  'authenticated browser clients cannot consume or mutate finance rate limits'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.public_rate_limits', 'SELECT'),
  'anonymous clients cannot read rate-limit fingerprints'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.public_rate_limits', 'SELECT'),
  'authenticated clients cannot read rate-limit fingerprints'
);

SET LOCAL ROLE service_role;

SELECT is(
  (SELECT count(*)::INTEGER
   FROM generate_series(1, 12) AS attempt(number)
   WHERE public.consume_finance_proof_upload_rate_limit(
     'f2400000-0000-4000-8000-000000000001', repeat('a1', 32), 12
   )),
  12,
  'the first 12 finance proof attempts are allowed atomically'
);
SELECT ok(
  NOT public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000001', repeat('a1', 32), 12
  ),
  'the 13th finance proof attempt is rejected'
);
SELECT is(
  (SELECT hit_count FROM public.public_rate_limits
   WHERE tenant_id = 'f2400000-0000-4000-8000-000000000001'
     AND endpoint = 'finance_proof_upload'
     AND client_fingerprint = decode(repeat('a1', 32), 'hex')),
  13,
  'rejected attempts remain counted inside the active window'
);
SELECT ok(
  public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000001', repeat('b2', 32), 12
  ),
  'a different actor fingerprint has an independent limit'
);
SELECT ok(
  public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000002', repeat('a1', 32), 12
  ),
  'the same fingerprint in another tenant has an independent limit'
);

UPDATE public.public_rate_limits
SET window_started_at = clock_timestamp() - INTERVAL '16 minutes'
WHERE tenant_id = 'f2400000-0000-4000-8000-000000000001'
  AND endpoint = 'finance_proof_upload'
  AND client_fingerprint = decode(repeat('a1', 32), 'hex');
SELECT ok(
  public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000001', repeat('a1', 32), 12
  ),
  'an expired 15-minute window permits a new attempt'
);
SELECT is(
  (SELECT hit_count FROM public.public_rate_limits
   WHERE tenant_id = 'f2400000-0000-4000-8000-000000000001'
     AND endpoint = 'finance_proof_upload'
     AND client_fingerprint = decode(repeat('a1', 32), 'hex')),
  1,
  'expired rate-limit window resets the counter'
);
SELECT throws_ok(
  $$SELECT public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000003', repeat('c3', 32), 12
  )$$,
  '42501',
  'Finance proof tenant is unavailable',
  'inactive tenants cannot consume the finance proof rate limit'
);
SELECT throws_ok(
  $$SELECT public.consume_finance_proof_upload_rate_limit(
    'f2400000-0000-4000-8000-000000000001', 'not-a-fingerprint', 12
  )$$,
  '22023',
  'Invalid finance proof rate limit input',
  'malformed actor fingerprints are rejected'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
