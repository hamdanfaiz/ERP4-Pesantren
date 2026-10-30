-- RKAT budget lifecycle, tenant isolation, idempotency, and actual-vs-budget tests.
-- All identities and accounting rows are synthetic and are rolled back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(53);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('e7000000-0000-4000-8000-000000000005', 'budget-a-test', 'Budget A Test', 'active'),
  ('f8000000-0000-4000-8000-000000000006', 'budget-b-test', 'Budget B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('e7000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budget-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e7000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budget-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f8000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budget-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000005', 'budget-a@test.invalid', 'Admin Budget A', 'admin', 'active', '{"erp":true,"finance":true}'),
  ('e7000000-0000-4000-8000-000000000012', 'e7000000-0000-4000-8000-000000000005', 'budget-ustadz@test.invalid', 'Ustadz Budget', 'ustadz', 'active', '{"finance":true}'),
  ('f8000000-0000-4000-8000-000000000021', 'f8000000-0000-4000-8000-000000000006', 'budget-b@test.invalid', 'Admin Budget B', 'admin', 'active', '{"erp":true,"finance":true}');

INSERT INTO public.organization_units (tenant_id, id, code, name, unit_type, status, created_by_user_id, updated_by_user_id)
VALUES
  ('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000031', 'PUSAT', 'Pesantren Pusat', 'pesantren', 'active', 'e7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000011'),
  ('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000032', 'CABANG-A', 'Pesantren Cabang A', 'pesantren', 'active', 'e7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000011'),
  ('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000033', 'CABANG-X', 'Unit Nonaktif', 'pesantren', 'inactive', 'e7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000011'),
  ('f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000031', 'CABANG-B', 'Pesantren Cabang B', 'pesantren', 'active', 'f8000000-0000-4000-8000-000000000021', 'f8000000-0000-4000-8000-000000000021');

INSERT INTO public.finance_expenses (
  tenant_id, unit_id, category, description, amount, expense_date, status, department,
  requester_user_id, requester_name, reviewed_by_user_id, reviewed_at
)
VALUES (
  'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000031', 'Listrik', 'Tagihan listrik Juli', 125000,
  DATE '2026-07-10', 'approved', 'Operasional',
  'e7000000-0000-4000-8000-000000000011', 'Admin Budget A',
  'e7000000-0000-4000-8000-000000000011', now()
);
INSERT INTO public.finance_expenses (
  tenant_id, unit_id, category, description, amount, expense_date, status, department,
  requester_user_id, requester_name, reviewed_by_user_id, reviewed_at
) VALUES (
  'f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000031', 'Listrik', 'Tagihan cabang B', 50000,
  DATE '2026-07-10', 'approved', 'Operasional',
  'f8000000-0000-4000-8000-000000000021', 'Admin Budget B',
  'f8000000-0000-4000-8000-000000000021', now()
);
INSERT INTO public.finance_ledger (
  tenant_id, unit_id, entry_type, source_type, source_id, description, amount, actor_user_id
)
SELECT tenant_id, unit_id, 'expense', 'expense', id, description, amount, requester_user_id
FROM public.finance_expenses WHERE description IN ('Tagihan listrik Juli', 'Tagihan cabang B');
INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
VALUES ('e7000000-0000-4000-8000-000000000005', true, 'e7000000-0000-4000-8000-000000000011');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_budget_plans'::regclass), 'budget plans enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_budget_plans'::regclass), 'budget plans force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_budget_lines'::regclass), 'budget lines enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_budget_lines'::regclass), 'budget lines force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_budget_mutation_requests'::regclass), 'budget requests enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_budget_mutation_requests'::regclass), 'budget requests force RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.finance_budget_plans', 'SELECT'), 'anon cannot read budget plans directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_budget_plans', 'SELECT'), 'authenticated cannot read budget plans directly');
SELECT ok(NOT has_table_privilege('anon', 'public.finance_budget_lines', 'SELECT'), 'anon cannot read budget lines directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_budget_lines', 'SELECT'), 'authenticated cannot read budget lines directly');
SELECT ok(NOT has_table_privilege('anon', 'public.finance_budget_mutation_requests', 'SELECT'), 'anon cannot read budget mutation requests directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_budget_mutation_requests', 'SELECT'), 'authenticated cannot read budget mutation requests directly');
SELECT ok(NOT has_function_privilege('anon', 'public.get_tenant_finance_budget_snapshot(uuid,uuid,text)', 'EXECUTE'), 'anon cannot call the budget snapshot');
SELECT ok(NOT has_function_privilege('authenticated', 'public.manage_tenant_finance_budget(uuid,uuid,text,text,uuid,jsonb,uuid)', 'EXECUTE'), 'authenticated cannot call the budget mutation RPC');
SELECT ok(
  has_table_privilege('service_role', 'public.finance_budget_plans', 'SELECT')
    AND has_table_privilege('service_role', 'public.finance_budget_plans', 'INSERT')
    AND has_table_privilege('service_role', 'public.finance_budget_plans', 'UPDATE'),
  'trusted server has explicit plan read/write privileges'
);
SELECT ok(NOT has_table_privilege('service_role', 'public.finance_budget_plans', 'DELETE'), 'trusted server cannot delete budget plans');
SELECT ok(
  has_table_privilege('service_role', 'public.finance_budget_lines', 'SELECT')
    AND has_table_privilege('service_role', 'public.finance_budget_lines', 'INSERT')
    AND has_table_privilege('service_role', 'public.finance_budget_lines', 'DELETE'),
  'trusted server can replace draft allocation lines'
);
SELECT ok(
  has_table_privilege('service_role', 'public.finance_budget_mutation_requests', 'SELECT')
    AND has_table_privilege('service_role', 'public.finance_budget_mutation_requests', 'INSERT'),
  'trusted server can read and append idempotency records'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.finance_budget_mutation_requests', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'public.finance_budget_mutation_requests', 'DELETE'),
  'idempotency records cannot be changed or deleted'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"TA 2026/2027","periodStart":"2026-07-01","periodEnd":"2027-06-30","notes":"RKAT contoh uji","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":500000},{"department":"Pendidikan","category":"Bahan ajar","allocatedAmount":2000000}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000101'
  )->>'status', 'draft', 'Admin can save a tenant budget draft'
);
SELECT is((SELECT count(*)::int FROM public.finance_budget_lines WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005'), 2, 'draft saves all allocation lines atomically');
SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"TA 2026/2027","periodStart":"2026-07-01","periodEnd":"2027-06-30","notes":"RKAT contoh uji","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":500000},{"department":"Pendidikan","category":"Bahan ajar","allocatedAmount":2000000}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000101'
  )->>'alreadyApplied', 'true', 'retry returns the original draft result'
);
SELECT is((SELECT count(*)::int FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005'), 1, 'idempotent retry does not create a duplicate plan');
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Payload berubah","periodStart":"2026-07-01","periodEnd":"2027-06-30","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":500000}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000101'
  )$$,
  '23505', 'Kunci permintaan anggaran telah dipakai untuk data berbeda', 'request key cannot be reused with different budget data'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Overlap","periodStart":"2027-01-01","periodEnd":"2027-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000102'
  )$$,
  '23P01', 'Rentang periode bertabrakan dengan rencana anggaran pada unit ini', 'overlapping budget periods are rejected'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000012', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Role invalid","periodStart":"2028-01-01","periodEnd":"2028-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000103'
  )$$,
  '42501', 'Profil Admin anggaran tidak cocok dengan tenant aktif', 'an active non-admin profile cannot impersonate Admin'
);
SELECT is(
  (
    SELECT (line.value->>'actualAmount')::numeric
    FROM jsonb_array_elements(
      (SELECT plan.value->'lines'
       FROM jsonb_array_elements(public.get_tenant_finance_budget_snapshot('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin')->'plans') AS plan(value)
       WHERE plan.value->>'unitId' = 'e7000000-0000-4000-8000-000000000031')
    ) AS line(value)
    WHERE line.value->>'category' = 'Listrik'
  ),
  125000::numeric,
  'actuals include only approved expenses posted to the Finance ledger'
);
SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000032","periodLabel":"TA Cabang A","periodStart":"2026-07-01","periodEnd":"2027-06-30","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":300000}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000304'
  )->>'status', 'draft', 'same tenant can use the same budget period in another unit'
);
SELECT is(
  (SELECT (line.value->>'actualAmount')::numeric
   FROM jsonb_array_elements(
     (SELECT plan.value->'lines'
      FROM jsonb_array_elements(public.get_tenant_finance_budget_snapshot('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin')->'plans') AS plan(value)
      WHERE plan.value->>'unitId' = 'e7000000-0000-4000-8000-000000000032')
   ) AS line(value)
   WHERE line.value->>'category' = 'Listrik'),
  0::numeric, 'unit actuals do not include another unit expense or ledger posting'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_finance_budget_snapshot('e7000000-0000-4000-8000-000000000005', 'f8000000-0000-4000-8000-000000000021', 'admin')$$,
  '42501', 'Profil Admin anggaran tidak cocok dengan tenant aktif', 'snapshot refuses a user from another tenant'
);
SELECT is(
  jsonb_array_length(public.get_tenant_finance_budget_snapshot('f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin')->'plans'),
  0,
  'another tenant receives an empty snapshot rather than this tenant data'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin',
    'save_draft', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'),
    '{"unitId":"f8000000-0000-4000-8000-000000000031","periodLabel":"Cross-tenant","periodStart":"2028-01-01","periodEnd":"2028-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'f8000000-0000-4000-8000-000000000102'
  )$$,
  'P0002', 'Rencana anggaran tidak ditemukan pada tenant', 'cross-tenant budget IDs cannot be modified'
);

SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'approve', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'), '{}'::jsonb,
    'e7000000-0000-4000-8000-000000000201'
  )->>'status', 'approved', 'Admin can approve a complete draft'
);
SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'approve', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'), '{}'::jsonb,
    'e7000000-0000-4000-8000-000000000201'
  )->>'alreadyApplied', 'true', 'approval retry returns the original result'
);
SELECT is(
  (SELECT approved_by_user_id::text FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'),
  'e7000000-0000-4000-8000-000000000011', 'approval records the responsible Admin'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'),
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Perubahan dilarang","periodStart":"2026-07-01","periodEnd":"2027-06-30","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":500000}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000202'
  )$$,
  '55000', 'Hanya rancangan anggaran yang dapat diubah', 'approved budget allocations are immutable'
);
SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'close', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'), '{}'::jsonb,
    'e7000000-0000-4000-8000-000000000203'
  )->>'status', 'closed', 'approved plan can be closed and retained for audit'
);
SELECT is(
  public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'close', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'), '{}'::jsonb,
    'e7000000-0000-4000-8000-000000000203'
  )->>'alreadyApplied', 'true', 'close retry returns the original result'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_budget_mutation_requests WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005'),
  4, 'only successful save, approve, and close operations are recorded'
);
SELECT is(
  public.get_tenant_finance_budget_snapshot('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin')->>'financeLocked',
  'true', 'snapshot reports the tenant Finance book lock without changing budget history'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'approve', (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'e7000000-0000-4000-8000-000000000005' AND unit_id = 'e7000000-0000-4000-8000-000000000031' AND period_label = 'TA 2026/2027'), '{}'::jsonb,
    'e7000000-0000-4000-8000-000000000204'
  )$$,
  '55000', 'Hanya rancangan yang dapat disetujui', 'closed plans cannot be reopened through the approval action'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    NULL, NULL, '{}'::jsonb, 'e7000000-0000-4000-8000-000000000205'
  )$$,
  '22023', 'Permintaan anggaran tidak valid', 'null mutation action is rejected'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Duplikat","periodStart":"2028-01-01","periodEnd":"2028-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":100},{"department":" operasional ","category":"listrik","allocatedAmount":200}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000206'
  )$$,
  '22023', 'Kategori dan bagian yang sama hanya boleh muncul satu kali', 'duplicate normalized budget dimensions are rejected'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Pecahan","periodStart":"2028-01-01","periodEnd":"2028-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1.5}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000207'
  )$$,
  '22023', 'Bagian, kategori, atau nominal anggaran tidak valid', 'fractional IDR budget amounts are rejected'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000031","periodLabel":"Tanggal kosong","periodStart":null,"periodEnd":"2028-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":100}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000208'
  )$$,
  '22023', 'Label atau rentang periode anggaran tidak valid', 'missing budget period dates are rejected'
);

SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"periodLabel":"Unit kosong","periodStart":"2030-01-01","periodEnd":"2030-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000301'
  )$$,
  '42501', 'Pilih unit aktif pada tenant ini untuk rencana anggaran', 'a unit is mandatory when creating a plan'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"f8000000-0000-4000-8000-000000000031","periodLabel":"Unit tenant lain","periodStart":"2030-01-01","periodEnd":"2030-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000302'
  )$$,
  '42501', 'Pilih unit aktif pada tenant ini untuk rencana anggaran', 'a unit from another tenant is rejected'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000011', 'admin',
    'save_draft', NULL,
    '{"unitId":"e7000000-0000-4000-8000-000000000033","periodLabel":"Unit nonaktif","periodStart":"2030-01-01","periodEnd":"2030-12-31","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":1}]}'::jsonb,
    'e7000000-0000-4000-8000-000000000303'
  )$$,
  '42501', 'Pilih unit aktif pada tenant ini untuk rencana anggaran', 'an inactive unit cannot receive a new plan'
);
SELECT is(
  public.manage_tenant_finance_budget(
    'f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin',
    'save_draft', NULL,
    '{"unitId":"f8000000-0000-4000-8000-000000000031","periodLabel":"TA Cabang B","periodStart":"2026-07-01","periodEnd":"2027-06-30","lines":[{"department":"Operasional","category":"Listrik","allocatedAmount":300000}]}'::jsonb,
    'f8000000-0000-4000-8000-000000000301'
  )->>'status', 'draft', 'separate units can use the same budget period'
);
SELECT is(
  (SELECT plan.value->>'unitCode'
   FROM jsonb_array_elements(public.get_tenant_finance_budget_snapshot('f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin')->'plans') AS plan(value)
   LIMIT 1),
  'CABANG-B', 'snapshot identifies the owning organization unit'
);
SELECT is(
  (SELECT (line.value->>'actualAmount')::numeric
   FROM jsonb_array_elements(
     (SELECT plan.value->'lines'
      FROM jsonb_array_elements(public.get_tenant_finance_budget_snapshot('f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin')->'plans') AS plan(value)
      WHERE plan.value->>'unitId' = 'f8000000-0000-4000-8000-000000000031')
   ) AS line(value)
   WHERE line.value->>'category' = 'Listrik'),
  50000::numeric, 'actuals are matched to the expense and ledger unit'
);
SELECT throws_ok(
  $$INSERT INTO public.finance_budget_plans (tenant_id, period_label, period_start, period_end, created_by_user_id, updated_by_user_id)
    VALUES ('e7000000-0000-4000-8000-000000000005', 'Tanpa unit', DATE '2030-01-01', DATE '2030-12-31', 'e7000000-0000-4000-8000-000000000011', 'e7000000-0000-4000-8000-000000000011')$$,
  '23514', 'new row for relation "finance_budget_plans" violates check constraint "finance_budget_plans_unit_required_check"', 'database constraint rejects direct unitless plan creation'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_finance_budget(
    'f8000000-0000-4000-8000-000000000006', 'f8000000-0000-4000-8000-000000000021', 'admin',
    'map_legacy_unit',
    (SELECT id FROM public.finance_budget_plans WHERE tenant_id = 'f8000000-0000-4000-8000-000000000006'),
    '{"unitId":"f8000000-0000-4000-8000-000000000031"}'::jsonb,
    'f8000000-0000-4000-8000-000000000302'
  )$$,
  '55000', 'Rencana anggaran sudah memiliki unit', 'mapped plans cannot be remapped through the legacy mapping action'
);

SELECT * FROM finish();
ROLLBACK;
