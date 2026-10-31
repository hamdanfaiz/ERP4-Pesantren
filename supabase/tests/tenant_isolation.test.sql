-- Baseline RLS tests for the tenant/profile/PPDB foundation.
-- Run after all migrations with: supabase test db
-- All identities and records below are synthetic; the enclosing transaction rolls back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(44);

-- Stable fixture IDs make failures easy to reproduce while keeping test data synthetic.
INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'tenant-a-test', 'Tenant A Test', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'tenant-b-test', 'Tenant B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('a1000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b2000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (
  user_id, tenant_id, email, display_name, role, status, module_permissions
)
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'admin-a@test.invalid', 'Admin A', 'admin', 'active', '{"users":true,"ppdb":true}'),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{}'),
  ('b2000000-0000-4000-8000-000000000021', 'b2000000-0000-4000-8000-000000000002', 'admin-b@test.invalid', 'Admin B', 'admin', 'active', '{"users":true,"ppdb":true}'),
  ('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'suspended-a@test.invalid', 'Suspended A', 'admin', 'suspended', '{"users":true,"ppdb":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name)
VALUES
  ('a1000000-0000-4000-8000-000000000101', 'a1000000-0000-4000-8000-000000000001', 'A-TEST-001', 'Candidate A'),
  ('b2000000-0000-4000-8000-000000000201', 'b2000000-0000-4000-8000-000000000002', 'B-TEST-001', 'Candidate B');

-- Public and browser roles cannot perform direct writes. Sensitive module tables
-- are accessible only through trusted server routes and service-role RPCs.
SELECT ok(NOT has_table_privilege('anon', 'public.tenants', 'SELECT'), 'anon cannot read tenants');
SELECT ok(NOT has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon cannot read profiles');
SELECT ok(NOT has_table_privilege('anon', 'public.candidates', 'SELECT'), 'anon cannot read candidates');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tenants', 'INSERT'), 'authenticated cannot insert tenants');
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated cannot insert profiles');
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated cannot update profiles');
SELECT ok(NOT has_table_privilege('authenticated', 'public.candidates', 'INSERT'), 'authenticated cannot insert candidates');
SELECT ok(NOT has_table_privilege('authenticated', 'public.candidates', 'UPDATE'), 'authenticated cannot update candidates');
SELECT ok(NOT has_table_privilege('authenticated', 'public.registration_counters', 'SELECT'), 'authenticated cannot read registration counters');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_bills', 'SELECT'), 'authenticated cannot read finance bills directly');

-- RLS must remain enabled and forced on the foundational and finance tables.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass), 'tenants has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass), 'tenants forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass), 'profiles forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.candidates'::regclass), 'candidates has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.candidates'::regclass), 'candidates forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.candidate_documents'::regclass), 'candidate_documents has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.candidate_documents'::regclass), 'candidate_documents forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.registration_counters'::regclass), 'registration_counters has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.registration_counters'::regclass), 'registration_counters forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_bills'::regclass), 'finance_bills has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_bills'::regclass), 'finance_bills forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass), 'managed Storage objects table has RLS enabled');
SELECT ok((SELECT public = false FROM storage.buckets WHERE id = 'erp4-private-finance-proofs'), 'finance proof bucket exists and remains private');

-- Tenant A administrator: tenant-scoped visibility and explicit module grants.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000011';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000011","role":"authenticated"}';
SELECT is(private.current_tenant_id()::text, 'a1000000-0000-4000-8000-000000000001', 'Admin A resolves only to tenant A');
SELECT is(private.current_app_role(), 'admin', 'Admin A role comes from the active profile');
SELECT ok(private.has_module_access('users'), 'Admin A has explicit users permission');
SELECT ok(private.has_module_access('ppdb'), 'Admin A has explicit PPDB permission');
SELECT is((SELECT count(*)::int FROM public.tenants), 1, 'Admin A sees one tenant');
SELECT is((SELECT count(*)::int FROM public.profiles), 3, 'Admin A sees only profiles in tenant A, including suspended accounts');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'b2000000-0000-4000-8000-000000000021'), 0, 'Admin A cannot see tenant B profile');
SELECT is((SELECT count(*)::int FROM public.candidates), 1, 'Admin A sees tenant A candidates with PPDB permission');
SELECT is((SELECT count(*)::int FROM public.candidates WHERE tenant_id = 'b2000000-0000-4000-8000-000000000002'), 0, 'Admin A cannot see tenant B candidates');
RESET ROLE;

-- Ustadz A can read their own profile but has no PPDB visibility or admin power.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000012';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000012","role":"authenticated"}';
SELECT is(private.current_app_role(), 'ustadz', 'Ustadz role comes from the active profile');
SELECT ok(NOT private.is_tenant_admin(), 'Ustadz is not a tenant administrator');
SELECT is((SELECT count(*)::int FROM public.profiles), 1, 'Ustadz sees only their own profile');
SELECT is((SELECT count(*)::int FROM public.candidates), 0, 'Ustadz cannot read PPDB candidates');
RESET ROLE;

-- Tenant B administrator cannot see any tenant A records.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000021';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-000000000021","role":"authenticated"}';
SELECT is(private.current_tenant_id()::text, 'b2000000-0000-4000-8000-000000000002', 'Admin B resolves only to tenant B');
SELECT is((SELECT count(*)::int FROM public.tenants), 1, 'Admin B sees one tenant');
SELECT is((SELECT count(*)::int FROM public.profiles), 1, 'Admin B sees only tenant B profiles');
SELECT is((SELECT count(*)::int FROM public.candidates), 1, 'Admin B sees only tenant B candidates');
RESET ROLE;

-- A suspended identity cannot resolve a tenant or read tenant data.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000013';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000013","role":"authenticated"}';
SELECT ok(private.current_tenant_id() IS NULL, 'Suspended profile has no active tenant');
SELECT is((SELECT count(*)::int FROM public.tenants), 0, 'Suspended profile cannot read tenants');
SELECT is((SELECT count(*)::int FROM public.candidates), 0, 'Suspended profile cannot read PPDB candidates');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

