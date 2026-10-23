-- Supplier imports must preserve status and remain idempotent.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('d9000000-0000-4000-8000-000000000009', 'cooperative-supplier-status-test', 'Cooperative Supplier Status Test', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd9000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'cooperative-supplier-status@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000009',
  'cooperative-supplier-status@test.invalid', 'Cooperative Supplier Admin', 'admin', 'active', '{"cooperative":true}'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Pemasok Nonaktif","category":"ATK","status":"inactive"}'::jsonb
  )$$,
  'legacy supplier can be created with inactive status'
);
SELECT set_config(
  'erp4.cooperative_supplier_test_id',
  (SELECT id::text FROM public.cooperative_suppliers WHERE tenant_id='d9000000-0000-4000-8000-000000000009'),
  true
);
SELECT is(
  (SELECT status FROM public.cooperative_suppliers WHERE tenant_id='d9000000-0000-4000-8000-000000000009'),
  'inactive',
  'import preserves inactive supplier state'
);
SELECT is(
  (public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Changed Retry Payload","status":"active"}'::jsonb
  )->>'id'),
  current_setting('erp4.cooperative_supplier_test_id'),
  'retry returns the same supplier instead of creating a duplicate'
);
SELECT is(
  (SELECT count(*)::int FROM public.cooperative_suppliers WHERE tenant_id='d9000000-0000-4000-8000-000000000009'),
  1,
  'idempotent retry leaves exactly one supplier'
);
SELECT throws_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000022","name":"Bad Status","status":"suspended"}'::jsonb
  )$$,
  '22023', 'Invalid supplier fields or status',
  'supplier status outside the supported contract is rejected'
);

SELECT * FROM finish();
ROLLBACK;

