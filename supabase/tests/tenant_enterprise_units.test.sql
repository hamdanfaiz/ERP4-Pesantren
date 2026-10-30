-- Synthetic tests for the tenant-scoped organization unit registry.
-- Run with `supabase test db`; the surrounding transaction always rolls back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('e1000000-0000-4000-8000-000000000001', 'units-tenant-a-test', 'Units Tenant A', 'active'),
  ('e2000000-0000-4000-8000-000000000002', 'units-tenant-b-test', 'Units Tenant B', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('e1000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'units-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e1000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'units-denied-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e1000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'units-ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e2000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'units-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e1000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000001', 'units-admin-a@test.invalid', 'Admin A', 'admin', 'active', '{}'),
  ('e1000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000001', 'units-denied-a@test.invalid', 'Admin Tanpa Akses Unit', 'admin', 'active', '{"enterprise":false}'),
  ('e1000000-0000-4000-8000-000000000013', 'e1000000-0000-4000-8000-000000000001', 'units-ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{"enterprise":true}'),
  ('e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000002', 'units-admin-b@test.invalid', 'Admin B', 'admin', 'active', '{}');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_units'::regclass), 'unit registry enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.organization_units'::regclass), 'unit registry forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_unit_events'::regclass), 'unit audit enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.organization_unit_events'::regclass), 'unit audit forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_unit_mutation_requests'::regclass), 'idempotency ledger enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.organization_unit_mutation_requests'::regclass), 'idempotency ledger forces RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.organization_units', 'SELECT'), 'anonymous clients cannot read unit registry');
SELECT ok(NOT has_table_privilege('authenticated', 'public.organization_units', 'SELECT'), 'browser clients cannot read unit registry directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.organization_unit_events', 'INSERT'), 'browser clients cannot forge audit events');
SELECT ok(NOT has_table_privilege('service_role', 'public.organization_units', 'DELETE'), 'unit rows cannot be deleted through direct table grants');
SELECT ok(NOT has_table_privilege('service_role', 'public.organization_unit_events', 'UPDATE'), 'unit audit events are append-only');
SELECT ok(NOT has_table_privilege('anon', 'public.organization_unit_mutation_requests', 'SELECT'), 'anonymous clients cannot read idempotency keys');
SELECT ok(NOT has_function_privilege('anon', 'public.get_tenant_enterprise_units_snapshot(uuid,uuid,text)', 'EXECUTE'), 'anonymous clients cannot call the snapshot RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.manage_tenant_enterprise_unit(uuid,uuid,text,text,uuid,jsonb,uuid)', 'EXECUTE'), 'browser clients cannot call the mutation RPC');
SELECT ok(has_function_privilege('service_role', 'public.manage_tenant_enterprise_unit(uuid,uuid,text,text,uuid,jsonb,uuid)', 'EXECUTE'), 'trusted backend can call the mutation RPC');

SET LOCAL ROLE service_role;
SELECT is(
  (public.get_tenant_enterprise_units_snapshot('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin')->'units'),
  '[]'::jsonb,
  'active tenant Admin with role defaults sees an empty tenant-scoped unit list'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_enterprise_units_snapshot('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000021', 'admin')$$,
  '42501', NULL, 'Admin from another tenant cannot read this tenant unit registry'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_enterprise_units_snapshot('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000012', 'admin')$$,
  '42501', NULL, 'Admin with explicit enterprise permission false is denied'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_enterprise_units_snapshot('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000013', 'ustadz')$$,
  '42501', NULL, 'non-admin remains denied even when a permission flag is true'
);
SELECT throws_ok(
  $$SELECT public.get_tenant_enterprise_units_snapshot('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'super_admin')$$,
  '42501', NULL, 'caller cannot elevate the expected role above the stored profile role'
);

-- Create, retry, update, and status changes all use separate synthetic request IDs.
SELECT is(
  public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'create', NULL,
    '{"code":"PUSAT","name":"Pesantren Pusat","unitType":"pesantren","location":"Kota A"}'::jsonb,
    'e1000000-0000-4000-8000-000000000101'
  )->'unit'->>'code',
  'PUSAT', 'Admin creates a tenant unit through the audited RPC'
);
SELECT ok(
  (public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'create', NULL,
    '{"code":"PUSAT","name":"Pesantren Pusat","unitType":"pesantren","location":"Kota A"}'::jsonb,
    'e1000000-0000-4000-8000-000000000101'
  )->>'alreadyApplied')::boolean,
  'retrying the same create request returns its saved result'
);
SELECT is((SELECT count(*)::int FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001'), 1, 'idempotent create stores one unit');
SELECT is((SELECT count(*)::int FROM public.organization_unit_events WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001'), 1, 'idempotent create emits one audit event');
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'create', NULL, '{"code":"PUSAT","name":"Nama Berbeda","unitType":"pesantren","location":"Kota A"}'::jsonb, 'e1000000-0000-4000-8000-000000000101')$$,
  '23505', NULL, 'a request ID cannot be reused for a different payload'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'create', NULL, '{"code":"PUSAT","name":"Duplikat","unitType":"sekolah","location":"Kota B"}'::jsonb, 'e1000000-0000-4000-8000-000000000102')$$,
  '23505', NULL, 'duplicate unit codes are rejected inside the tenant'
);

SELECT is(
  public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'update',
    (SELECT id FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001' AND code = 'PUSAT'),
    '{"code":"PUSAT","name":"Pesantren Pusat Baru","unitType":"pesantren","location":"Kota A"}'::jsonb,
    'e1000000-0000-4000-8000-000000000103'
  )->'unit'->>'name',
  'Pesantren Pusat Baru', 'Admin can update a unit in their tenant'
);
SELECT is(
  public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'set_status',
    (SELECT id FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001' AND code = 'PUSAT'),
    '{"status":"inactive"}'::jsonb,
    'e1000000-0000-4000-8000-000000000104'
  )->'unit'->>'status',
  'inactive', 'Admin can deactivate a unit without deleting its history'
);
SELECT is(
  public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'set_status',
    (SELECT id FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001' AND code = 'PUSAT'),
    '{"status":"active"}'::jsonb,
    'e1000000-0000-4000-8000-000000000105'
  )->'unit'->>'status',
  'active', 'Admin can reactivate a unit'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit(
    'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'set_status',
    (SELECT id FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001' AND code = 'PUSAT'),
    '{"status":"active","tenantId":"e2000000-0000-4000-8000-000000000002"}'::jsonb,
    'e1000000-0000-4000-8000-000000000108'
  )$$,
  '22023', NULL, 'status updates reject tenant ownership overrides'
);
SELECT is((SELECT count(*)::int FROM public.organization_unit_events WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001'), 4, 'create, update, and two status changes produce four audit events');
SELECT is(
  (public.get_tenant_enterprise_units_snapshot('e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000021', 'admin')->'units'),
  '[]'::jsonb,
  'another tenant sees no units created in the first tenant'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit('e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000021', 'admin', 'update', (SELECT id FROM public.organization_units WHERE tenant_id = 'e1000000-0000-4000-8000-000000000001' AND code = 'PUSAT'), '{"code":"PUSAT","name":"Lintas Tenant","unitType":"pesantren","location":"Kota A"}'::jsonb, 'e2000000-0000-4000-8000-000000000201')$$,
  'P0002', NULL, 'a unit ID from another tenant cannot be updated'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', 'create', NULL, '{"code":"PUSAT","name":"Invalid field","unitType":"pesantren","location":"Kota A","tenantId":"e2000000-0000-4000-8000-000000000002"}'::jsonb, 'e1000000-0000-4000-8000-000000000106')$$,
  '22023', NULL, 'payload cannot override tenant ownership'
);
SELECT throws_ok(
  $$SELECT public.manage_tenant_enterprise_unit('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000011', 'admin', NULL, NULL, '{}'::jsonb, 'e1000000-0000-4000-8000-000000000107')$$,
  '22023', NULL, 'null mutation actions are rejected'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
