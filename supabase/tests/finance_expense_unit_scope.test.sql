-- Unit attribution and maker/checker tests use synthetic tenant data and roll back.
-- Run with: supabase test db

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(21);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('e5200000-0000-4000-8000-000000000001', 'finance-unit-a-test', 'Finance Unit A Test', 'active'),
  ('f5200000-0000-4000-8000-000000000002', 'finance-unit-b-test', 'Finance Unit B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('e5200000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5200000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-checker@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5200000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5200000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-unassigned@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f5200000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-other-tenant@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, unit_id, organization_unit_id, module_permissions) VALUES
  ('e5200000-0000-4000-8000-000000000011', 'e5200000-0000-4000-8000-000000000001', 'unit-admin@test.invalid', 'Unit Admin', 'admin', 'active', NULL, NULL, '{"finance":true}'),
  ('e5200000-0000-4000-8000-000000000012', 'e5200000-0000-4000-8000-000000000001', 'unit-checker@test.invalid', 'Unit Checker', 'admin', 'active', NULL, NULL, '{"finance":true}'),
  ('e5200000-0000-4000-8000-000000000013', 'e5200000-0000-4000-8000-000000000001', 'unit-ustadz@test.invalid', 'Unit Ustadz', 'ustadz', 'active', 'MADRASAH', NULL, '{"finance":true}'),
  ('e5200000-0000-4000-8000-000000000014', 'e5200000-0000-4000-8000-000000000001', 'unit-unassigned@test.invalid', 'Unassigned Ustadz', 'ustadz', 'active', NULL, NULL, '{"finance":true}'),
  ('f5200000-0000-4000-8000-000000000021', 'f5200000-0000-4000-8000-000000000002', 'unit-other-tenant@test.invalid', 'Other Tenant Admin', 'admin', 'active', NULL, NULL, '{"finance":true}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id) VALUES
  ('e5200000-0000-4000-8000-000000000101', 'e5200000-0000-4000-8000-000000000001', 'MADRASAH', 'Madrasah', 'sekolah', 'active', 'e5200000-0000-4000-8000-000000000011', 'e5200000-0000-4000-8000-000000000011'),
  ('e5200000-0000-4000-8000-000000000102', 'e5200000-0000-4000-8000-000000000001', 'KLINIK', 'Klinik', 'klinik', 'active', 'e5200000-0000-4000-8000-000000000011', 'e5200000-0000-4000-8000-000000000011'),
  ('f5200000-0000-4000-8000-000000000201', 'f5200000-0000-4000-8000-000000000002', 'PUSAT', 'Pusat Tenant B', 'pesantren', 'active', 'f5200000-0000-4000-8000-000000000021', 'f5200000-0000-4000-8000-000000000021');

UPDATE public.profiles
SET organization_unit_id = 'e5200000-0000-4000-8000-000000000101'
WHERE user_id = 'e5200000-0000-4000-8000-000000000013';

SELECT ok(NOT has_function_privilege('service_role', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'legacy unscoped expense RPC is no longer callable by the backend');
SELECT ok(has_function_privilege('service_role', 'public.create_tenant_finance_expense_for_unit(uuid,uuid,text,uuid,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'unit-scoped expense RPC is available to the backend');
SELECT ok(NOT has_function_privilege('anon', 'public.create_tenant_finance_expense_for_unit(uuid,uuid,text,uuid,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'anonymous clients cannot create unit-scoped expenses');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_tenant_finance_expense_for_unit(uuid,uuid,text,uuid,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'browser users cannot bypass the trusted Finance API');
SELECT ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'finance_expenses' AND column_name = 'unit_id'), 'Finance expenses store a unit identifier');
SELECT ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'finance_ledger' AND column_name = 'unit_id'), 'Finance ledger stores the expense unit');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_expenses'::regclass AND conname = 'finance_expenses_tenant_unit_fk'), 'expense unit foreign key includes its tenant');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_ledger'::regclass AND conname = 'finance_ledger_tenant_unit_fk'), 'ledger unit foreign key includes its tenant');

SET LOCAL ROLE service_role;

SELECT is(public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000011', 'admin',
  'e5200000-0000-4000-8000-000000000101', 'Utilitas', 'Tagihan listrik', 'Operasional',
  125000, DATE '2026-10-30', 'Unit Admin', 'e5200000-0000-4000-8000-000000000301'
)->>'success', 'true', 'Admin can create a unit-attributed expense');
SELECT is((SELECT unit_id::text FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Tagihan listrik'), 'e5200000-0000-4000-8000-000000000101', 'expense stores its tenant unit');
SELECT is(public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000011', 'admin',
  'e5200000-0000-4000-8000-000000000101', 'Utilitas', 'Tagihan listrik', 'Operasional',
  125000, DATE '2026-10-30', 'Unit Admin', 'e5200000-0000-4000-8000-000000000301'
)->>'alreadyApplied', 'true', 'retrying the same expense returns its idempotent result');
SELECT is((SELECT count(*)::int FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Tagihan listrik'), 1, 'retry does not duplicate the expense');
SELECT throws_ok($$SELECT public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000011', 'admin',
  'e5200000-0000-4000-8000-000000000102', 'Utilitas', 'Tagihan berubah unit', 'Operasional',
  125000, DATE '2026-10-30', 'Unit Admin', 'e5200000-0000-4000-8000-000000000301'
)$$, '23505', 'Kunci permintaan telah dipakai untuk data berbeda', 'idempotency key cannot be reused with another unit');
SELECT throws_ok($$SELECT public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000011', 'admin',
  'f5200000-0000-4000-8000-000000000201', 'Utilitas', 'Lintas tenant', 'Operasional',
  1000, DATE '2026-10-30', 'Unit Admin', 'e5200000-0000-4000-8000-000000000302'
)$$, '42501', 'Unit aktif tidak ditemukan pada tenant ini', 'a unit belonging to another tenant is rejected');
SELECT throws_ok($$SELECT public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000013', 'ustadz',
  'e5200000-0000-4000-8000-000000000102', 'Utilitas', 'Unit tidak ditugaskan', 'Operasional',
  1000, DATE '2026-10-30', 'Unit Ustadz', 'e5200000-0000-4000-8000-000000000303'
)$$, '42501', 'Unit pengajuan tidak sesuai dengan penugasan akun', 'Ustadz cannot submit expenses for a different assigned unit');
SELECT is(public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000013', 'ustadz',
  'e5200000-0000-4000-8000-000000000101', 'Kegiatan', 'Perlengkapan halaqah', 'Tahfidz',
  75000, DATE '2026-10-30', 'Unit Ustadz', 'e5200000-0000-4000-8000-000000000304'
)->>'success', 'true', 'Ustadz can submit for the unit assigned on their profile');
SELECT is((SELECT unit_id::text FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Perlengkapan halaqah'), 'e5200000-0000-4000-8000-000000000101', 'Ustadz expense retains assigned unit');
SELECT throws_ok($$SELECT public.create_tenant_finance_expense_for_unit(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000014', 'ustadz',
  'e5200000-0000-4000-8000-000000000101', 'Kegiatan', 'Tanpa penugasan', 'Tahfidz',
  75000, DATE '2026-10-30', 'Unassigned Ustadz', 'e5200000-0000-4000-8000-000000000305'
)$$, '42501', 'Unit pengajuan tidak sesuai dengan penugasan akun', 'Ustadz without a profile unit cannot submit expenses');
SELECT is(public.review_tenant_finance_expense(
  'e5200000-0000-4000-8000-000000000001', 'e5200000-0000-4000-8000-000000000012', 'admin',
  (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Tagihan listrik'),
  'approve', NULL, 'e5200000-0000-4000-8000-000000000306'
)->>'status', 'approved', 'checker can approve the expense');
SELECT is((SELECT unit_id::text FROM public.finance_ledger WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND source_type = 'expense' AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Tagihan listrik')), 'e5200000-0000-4000-8000-000000000101', 'approved ledger entry retains the expense unit');
SELECT is((SELECT count(*)::int FROM public.finance_ledger WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND source_type = 'expense' AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5200000-0000-4000-8000-000000000001' AND description = 'Tagihan listrik')), 1, 'approval writes one ledger record');

SELECT * FROM finish();
ROLLBACK;
