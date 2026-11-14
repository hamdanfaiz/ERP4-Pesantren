-- Synthetic-only coverage for the all-or-nothing Tahfidz target batch API.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(21);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES
  ('e1800000-0000-4000-8000-000000000009', 'tahfidz-bulk-a', 'Tahfidz Bulk A', 'active', 'UTC'),
  ('e2800000-0000-4000-8000-000000000009', 'tahfidz-bulk-b', 'Tahfidz Bulk B', 'active', 'UTC');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('e1800000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bulk-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e1800000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bulk-ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e1800000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bulk-ustadz-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e2800000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bulk-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e1800000-0000-4000-8000-000000000011', 'e1800000-0000-4000-8000-000000000009', 'bulk-admin-a@test.invalid', 'Admin A', 'admin', 'active', '{"tahfidz":true}'),
  ('e1800000-0000-4000-8000-000000000012', 'e1800000-0000-4000-8000-000000000009', 'bulk-ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{"tahfidz":true}'),
  ('e1800000-0000-4000-8000-000000000013', 'e1800000-0000-4000-8000-000000000009', 'bulk-ustadz-b@test.invalid', 'Ustadz B', 'ustadz', 'active', '{"tahfidz":true}'),
  ('e2800000-0000-4000-8000-000000000021', 'e2800000-0000-4000-8000-000000000009', 'bulk-admin-b@test.invalid', 'Admin B', 'admin', 'active', '{"tahfidz":true}');

\ir test_support/seed_tenant_reference_catalogs.psql

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint, grade)
VALUES
  ('e1800000-0000-4000-8000-000000000101', 'e1800000-0000-4000-8000-000000000009', 'TBF-A-001', 'Santri A', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex'), 'VII'),
  ('e1800000-0000-4000-8000-000000000102', 'e1800000-0000-4000-8000-000000000009', 'TBF-A-002', 'Santri B', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'), 'VII'),
  ('e2800000-0000-4000-8000-000000000201', 'e2800000-0000-4000-8000-000000000009', 'TBF-B-001', 'Santri C', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'), 'VII');

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES
  ('e1800000-0000-4000-8000-000000000201', 'e1800000-0000-4000-8000-000000000009', 'e1800000-0000-4000-8000-000000000101', '9380000001', 'Santri A', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('90', 32), 'hex'), 'active'),
  ('e1800000-0000-4000-8000-000000000202', 'e1800000-0000-4000-8000-000000000009', 'e1800000-0000-4000-8000-000000000102', '9380000002', 'Santri B', 'L', 'VII', decode(repeat('9a', 44), 'hex'), decode(repeat('bc', 32), 'hex'), 'active'),
  ('e2800000-0000-4000-8000-000000000301', 'e2800000-0000-4000-8000-000000000009', 'e2800000-0000-4000-8000-000000000201', '9480000001', 'Santri C', 'L', 'VII', decode(repeat('de', 44), 'hex'), decode(repeat('f0', 32), 'hex'), 'active');

INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
VALUES
  ('e1800000-0000-4000-8000-000000000401', 'e1800000-0000-4000-8000-000000000009', 'Halaqah A', 'e1800000-0000-4000-8000-000000000012', 'Ustadz A', 'active'),
  ('e1800000-0000-4000-8000-000000000402', 'e1800000-0000-4000-8000-000000000009', 'Halaqah B', 'e1800000-0000-4000-8000-000000000013', 'Ustadz B', 'active');
INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
VALUES
  ('e1800000-0000-4000-8000-000000000009', 'e1800000-0000-4000-8000-000000000401', 'e1800000-0000-4000-8000-000000000201', CURRENT_DATE - 5, 'active'),
  ('e1800000-0000-4000-8000-000000000009', 'e1800000-0000-4000-8000-000000000402', 'e1800000-0000-4000-8000-000000000202', CURRENT_DATE - 5, 'active');

SELECT is((public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000202'::UUID,
    'e1800000-0000-4000-8000-000000000201'::UUID
  ], CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000501'
)->>'success'), 'true', 'Admin can atomically set targets for multiple tenant students');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_targets
  WHERE tenant_id = 'e1800000-0000-4000-8000-000000000009' AND status = 'active'), 2, 'both target rows are stored');
SELECT is((public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000201'::UUID,
    'e1800000-0000-4000-8000-000000000202'::UUID
  ], CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000501'
)->>'alreadyApplied'), 'true', 'same bulk request replays idempotently independent of input order');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_target_bulk_write_requests
  WHERE tenant_id = 'e1800000-0000-4000-8000-000000000009' AND client_request_id = 'e1800000-0000-4000-8000-000000000501'), 1, 'only one batch receipt is stored');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000201'::UUID,
    'e1800000-0000-4000-8000-000000000202'::UUID
  ], CURRENT_DATE, NULL, 2.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000501'
)$$, '23505', 'Kunci permintaan target massal telah digunakan untuk data berbeda', 'changed payload cannot reuse a batch request key');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000201'::UUID,
    'e1800000-0000-4000-8000-000000000201'::UUID
  ], CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000502'
)$$, '22023', 'Santri target massal tidak boleh duplikat', 'duplicate students are rejected');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', array_fill('e1800000-0000-4000-8000-000000000201'::UUID, ARRAY[251]),
  CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000503'
)$$, '22023', 'Data target massal Tahfidz tidak valid', 'batches are capped at 250 students');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000201'::UUID,
    'e1800000-0000-4000-8000-000000000202'::UUID
  ], CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000012', 'ustadz', 'e1800000-0000-4000-8000-000000000504'
)$$, '42501', 'Ustadz hanya dapat mengatur target santri pada halaqah tugasnya', 'Ustadz cannot bulk-update students outside their assigned halaqah');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_targets
  WHERE tenant_id = 'e1800000-0000-4000-8000-000000000009' AND status = 'active'), 2, 'a rejected row rolls back all earlier rows in that batch');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY[
    'e1800000-0000-4000-8000-000000000201'::UUID,
    'e2800000-0000-4000-8000-000000000301'::UUID
  ], CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000505'
)$$, 'P0002', 'Santri tidak ditemukan pada tenant ini', 'students from another tenant are rejected');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_targets
  WHERE tenant_id = 'e1800000-0000-4000-8000-000000000009' AND status = 'active'), 2, 'cross-tenant rejection leaves target rows unchanged');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY['e1800000-0000-4000-8000-000000000201'::UUID],
  CURRENT_DATE, NULL, 1.00::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e2800000-0000-4000-8000-000000000021', 'admin', 'e1800000-0000-4000-8000-000000000506'
)$$, '42501', 'Role akun tidak sesuai dengan profil Supabase aktif', 'an admin from a different tenant cannot set targets');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_targets_bulk(
  'e1800000-0000-4000-8000-000000000009', ARRAY['e1800000-0000-4000-8000-000000000201'::UUID],
  CURRENT_DATE, NULL, 0.123::NUMERIC, 0.50::NUMERIC, 'standard', NULL,
  'e1800000-0000-4000-8000-000000000011', 'admin', 'e1800000-0000-4000-8000-000000000507'
)$$, '22023', 'Data target harian Tahfidz tidak valid', 'sub-cent page target is rejected rather than rounded');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_target_bulk_write_requests'::regclass), 'batch request ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_target_bulk_write_requests'::regclass), 'batch request ledger forces RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.tahfidz_target_bulk_write_requests', 'SELECT'), 'anon cannot read the batch request ledger');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tahfidz_target_bulk_write_requests', 'SELECT'), 'authenticated cannot read the batch request ledger');
SELECT ok(
  has_table_privilege('service_role', 'public.tahfidz_target_bulk_write_requests', 'SELECT')
  AND has_table_privilege('service_role', 'public.tahfidz_target_bulk_write_requests', 'INSERT'),
  'server role has the ledger privileges needed for idempotent reads and writes'
);
SELECT ok(NOT has_table_privilege('service_role', 'public.tahfidz_target_bulk_write_requests', 'UPDATE'), 'server role does not need update access to the batch request ledger');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.record_tahfidz_daily_targets_bulk(uuid,uuid[],date,date,numeric,numeric,text,text,uuid,text,uuid)'), 'EXECUTE'), 'trusted server role can execute the atomic batch RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.record_tahfidz_daily_targets_bulk(uuid,uuid[],date,date,numeric,numeric,text,text,uuid,text,uuid)'), 'EXECUTE'), 'authenticated clients cannot execute the batch RPC directly');

SELECT * FROM finish();
ROLLBACK;
