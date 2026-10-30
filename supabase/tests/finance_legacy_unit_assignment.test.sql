-- Legacy Finance unit mapping is tenant-scoped, one-time, idempotent, and atomic.
-- All fixtures are synthetic and rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('e5300000-0000-4000-8000-000000000001', 'legacy-finance-unit-a', 'Legacy Finance Unit A', 'active'),
  ('f5300000-0000-4000-8000-000000000002', 'legacy-finance-unit-b', 'Legacy Finance Unit B', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('e5300000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-finance-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5300000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-finance-no-module@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5300000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-finance-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5300000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-finance-inactive@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f5300000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-finance-other@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('e5300000-0000-4000-8000-000000000011', 'e5300000-0000-4000-8000-000000000001', 'legacy-finance-admin@test.invalid', 'Finance Admin', 'admin', 'active', '{"finance":true}'),
  ('e5300000-0000-4000-8000-000000000012', 'e5300000-0000-4000-8000-000000000001', 'legacy-finance-no-module@test.invalid', 'Admin Without Finance', 'admin', 'active', '{"finance":false}'),
  ('e5300000-0000-4000-8000-000000000013', 'e5300000-0000-4000-8000-000000000001', 'legacy-finance-ustadz@test.invalid', 'Ustadz Finance', 'ustadz', 'active', '{"finance":true}'),
  ('e5300000-0000-4000-8000-000000000014', 'e5300000-0000-4000-8000-000000000001', 'legacy-finance-inactive@test.invalid', 'Suspended Finance Admin', 'admin', 'suspended', '{"finance":true}'),
  ('f5300000-0000-4000-8000-000000000021', 'f5300000-0000-4000-8000-000000000002', 'legacy-finance-other@test.invalid', 'Other Tenant Admin', 'admin', 'active', '{"finance":true}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id) VALUES
  ('e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000001', 'PUSAT', 'Pusat', 'pesantren', 'active', 'e5300000-0000-4000-8000-000000000011', 'e5300000-0000-4000-8000-000000000011'),
  ('e5300000-0000-4000-8000-000000000102', 'e5300000-0000-4000-8000-000000000001', 'MADRASAH', 'Madrasah', 'sekolah', 'active', 'e5300000-0000-4000-8000-000000000011', 'e5300000-0000-4000-8000-000000000011'),
  ('e5300000-0000-4000-8000-000000000103', 'e5300000-0000-4000-8000-000000000001', 'NONAKTIF', 'Unit Nonaktif', 'usaha', 'inactive', 'e5300000-0000-4000-8000-000000000011', 'e5300000-0000-4000-8000-000000000011'),
  ('f5300000-0000-4000-8000-000000000201', 'f5300000-0000-4000-8000-000000000002', 'PUSAT-B', 'Pusat B', 'pesantren', 'active', 'f5300000-0000-4000-8000-000000000021', 'f5300000-0000-4000-8000-000000000021');

INSERT INTO public.finance_expenses (
  id, tenant_id, unit_id, category, description, amount, expense_date, status, department,
  requester_user_id, requester_name, reviewed_by_user_id, reviewed_at
) VALUES
  ('e5300000-0000-4000-8000-000000000301', 'e5300000-0000-4000-8000-000000000001', NULL, 'Operasional', 'Pengeluaran lama tertunda', 100000, DATE '2026-10-01', 'pending', 'Umum', 'e5300000-0000-4000-8000-000000000011', 'Finance Admin', NULL, NULL),
  ('e5300000-0000-4000-8000-000000000302', 'e5300000-0000-4000-8000-000000000001', NULL, 'Utilitas', 'Pengeluaran lama disetujui', 250000, DATE '2026-10-02', 'approved', 'Operasional', 'e5300000-0000-4000-8000-000000000011', 'Finance Admin', 'e5300000-0000-4000-8000-000000000011', now()),
  ('e5300000-0000-4000-8000-000000000303', 'e5300000-0000-4000-8000-000000000001', NULL, 'Perbaikan', 'Pengeluaran ledger berbeda unit', 300000, DATE '2026-10-03', 'approved', 'Pemeliharaan', 'e5300000-0000-4000-8000-000000000011', 'Finance Admin', 'e5300000-0000-4000-8000-000000000011', now()),
  ('e5300000-0000-4000-8000-000000000304', 'e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000101', 'Konsumsi', 'Pengeluaran sudah dipetakan', 50000, DATE '2026-10-04', 'pending', 'Dapur', 'e5300000-0000-4000-8000-000000000011', 'Finance Admin', NULL, NULL),
  ('f5300000-0000-4000-8000-000000000305', 'f5300000-0000-4000-8000-000000000002', NULL, 'Operasional', 'Data tenant lain', 60000, DATE '2026-10-05', 'pending', 'Umum', 'f5300000-0000-4000-8000-000000000021', 'Other Tenant Admin', NULL, NULL);

INSERT INTO public.finance_ledger (id, tenant_id, unit_id, entry_type, source_type, source_id, description, amount, actor_user_id)
VALUES
  ('e5300000-0000-4000-8000-000000000402', 'e5300000-0000-4000-8000-000000000001', NULL, 'expense', 'expense', 'e5300000-0000-4000-8000-000000000302', 'Pengeluaran lama disetujui', 250000, 'e5300000-0000-4000-8000-000000000011'),
  ('e5300000-0000-4000-8000-000000000403', 'e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000102', 'expense', 'expense', 'e5300000-0000-4000-8000-000000000303', 'Pengeluaran ledger berbeda unit', 300000, 'e5300000-0000-4000-8000-000000000011');

SELECT ok(NOT has_function_privilege('anon', 'public.get_tenant_unmapped_finance_expenses(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'anon cannot read the legacy Finance mapping queue');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_tenant_unmapped_finance_expenses(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'authenticated clients cannot read the Finance mapping queue directly');
SELECT ok(has_function_privilege('service_role', 'public.get_tenant_unmapped_finance_expenses(uuid,uuid,text,integer,integer)', 'EXECUTE'), 'trusted Finance API can read the mapping queue');
SELECT ok(NOT has_function_privilege('anon', 'public.assign_tenant_finance_expense_unit(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot map legacy expenses');
SELECT ok(NOT has_function_privilege('authenticated', 'public.assign_tenant_finance_expense_unit(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated clients cannot map expenses directly');
SELECT ok(has_function_privilege('service_role', 'public.assign_tenant_finance_expense_unit(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE'), 'trusted Finance API can map legacy expenses');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_legacy_unit_assignment_requests'::regclass), 'Finance mapping request log has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_legacy_unit_assignment_requests'::regclass), 'Finance mapping request log forces RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.finance_legacy_unit_assignment_requests', 'SELECT'), 'anon cannot read Finance mapping audit records');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_legacy_unit_assignment_requests', 'SELECT'), 'browser clients cannot read Finance mapping audit records');

SET LOCAL ROLE service_role;

SELECT is(public.get_tenant_unmapped_finance_expenses('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 100, 0)->>'expenseCount', '3', 'queue counts only unmapped Finance expenses inside the requested tenant');
SELECT ok((public.get_tenant_unmapped_finance_expenses('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 100, 0)->'expenses') @> '[{"id":"e5300000-0000-4000-8000-000000000302","hasLedgerEntry":true}]'::jsonb, 'queue shows approved ledger status without exposing unrelated tenant records');
SELECT is(public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000301', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000501')->>'success', 'true', 'Finance Admin can map a legacy pending expense to an active tenant unit');
SELECT is((SELECT unit_id::text FROM public.finance_expenses WHERE id = 'e5300000-0000-4000-8000-000000000301'), 'e5300000-0000-4000-8000-000000000101', 'mapped expense stores the chosen tenant unit');
SELECT is(public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000301', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000501')->>'alreadyApplied', 'true', 'retry with the same request key returns the prior result');
SELECT is((SELECT count(*)::int FROM public.finance_legacy_unit_assignment_requests WHERE tenant_id = 'e5300000-0000-4000-8000-000000000001'), 1, 'idempotent retry writes exactly one audit row');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000302', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000501')$$, '23505', 'Kunci permintaan unit telah dipakai untuk data berbeda', 'request key cannot be replayed for a different expense');
SELECT is(public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000302', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000502')->>'ledgerEntriesUpdated', '1', 'mapping an approved expense updates its finance ledger entry in the same transaction');
SELECT is((SELECT unit_id::text FROM public.finance_ledger WHERE id = 'e5300000-0000-4000-8000-000000000402'), 'e5300000-0000-4000-8000-000000000101', 'ledger entry inherits the expense unit');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000303', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000503')$$, '23514', 'Unit buku besar tidak cocok dengan pemetaan pengeluaran', 'mismatched ledger unit blocks the whole assignment');
SELECT is((SELECT unit_id::text FROM public.finance_expenses WHERE id = 'e5300000-0000-4000-8000-000000000303'), NULL, 'failed mapping leaves the expense unchanged');
SELECT is((SELECT unit_id::text FROM public.finance_ledger WHERE id = 'e5300000-0000-4000-8000-000000000403'), 'e5300000-0000-4000-8000-000000000102', 'failed mapping leaves the mismatched ledger unchanged');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000301', 'f5300000-0000-4000-8000-000000000201', 'e5300000-0000-4000-8000-000000000504')$$, '42501', 'Unit aktif tidak ditemukan pada tenant ini', 'unit belonging to another tenant is rejected');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'e5300000-0000-4000-8000-000000000301', 'e5300000-0000-4000-8000-000000000103', 'e5300000-0000-4000-8000-000000000505')$$, '42501', 'Unit aktif tidak ditemukan pada tenant ini', 'inactive unit cannot receive a legacy expense');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000011', 'admin', 'f5300000-0000-4000-8000-000000000305', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000506')$$, 'P0002', 'Pengeluaran tidak ditemukan pada tenant ini', 'cross-tenant expense ID is not visible to the tenant');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000013', 'admin', 'e5300000-0000-4000-8000-000000000303', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000507')$$, '42501', 'Profil Admin tidak aktif pada tenant', 'non-admin roles cannot map Finance expense units');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000012', 'admin', 'e5300000-0000-4000-8000-000000000303', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000508')$$, '42501', 'Profil Admin tidak memiliki akses Keuangan pada tenant ini', 'Finance permission is required');
SELECT throws_ok($$SELECT public.assign_tenant_finance_expense_unit('e5300000-0000-4000-8000-000000000001', 'e5300000-0000-4000-8000-000000000014', 'admin', 'e5300000-0000-4000-8000-000000000303', 'e5300000-0000-4000-8000-000000000101', 'e5300000-0000-4000-8000-000000000509')$$, '42501', 'Profil Admin tidak aktif pada tenant', 'suspended Admin profiles cannot map Finance expenses');
SELECT throws_ok($$UPDATE public.finance_expenses SET unit_id = 'e5300000-0000-4000-8000-000000000102' WHERE id = 'e5300000-0000-4000-8000-000000000301'$$, '23514', 'Unit biaya tidak dapat dipindahkan setelah ditetapkan', 'a mapped expense unit cannot be reassigned');

SELECT * FROM finish();
ROLLBACK;
