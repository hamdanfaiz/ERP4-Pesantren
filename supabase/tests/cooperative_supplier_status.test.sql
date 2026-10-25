-- Supplier imports must preserve status and remain idempotent.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

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


INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd9000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'supplier-status-other-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd9000000-0000-4000-8000-000000000012', 'd9000000-0000-4000-8000-000000000009',
  'supplier-status-other-admin@test.invalid', 'Other Supplier Admin', 'admin', 'active', '{"cooperative":true}'
);
INSERT INTO public.cooperative_suppliers (
  id, tenant_id, name, category, contact, pic, status, client_request_id, created_by, updated_by
) VALUES (
  'd9000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000009',
  'Legacy Supplier', 'ATK', '', '', 'active', 'd9000000-0000-4000-8000-000000000031',
  'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000011'
);
INSERT INTO public.cooperative_supplier_mutation_requests (
  tenant_id, client_request_id, actor_user_id, operation, payload_fingerprint, response
) VALUES (
  'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000031',
  'd9000000-0000-4000-8000-000000000011', 'legacy', NULL,
  jsonb_build_object('id','d9000000-0000-4000-8000-000000000031','replayed',true)
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
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Pemasok Nonaktif","category":"ATK","status":"inactive"}'::jsonb
  )->>'id'),
  current_setting('erp4.cooperative_supplier_test_id'),
  'identical request replays the original supplier'
);
SELECT is(
  (public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Pemasok Nonaktif","category":"ATK","status":"inactive"}'::jsonb
  )->>'replayed'),
  'true',
  'identical request is marked as replayed'
);
SELECT throws_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Changed Retry Payload","status":"active"}'::jsonb
  )$$,
  '23505', 'ID permintaan pemasok sudah digunakan untuk perubahan berbeda',
  'changed payload cannot reuse the supplier request ID'
);
SELECT throws_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','d9000000-0000-4000-8000-000000000021',
      'id',current_setting('erp4.cooperative_supplier_test_id'),'name','Changed operation','category','ATK')
  )$$,
  '23505', 'ID permintaan pemasok sudah digunakan untuk perubahan berbeda',
  'different operation cannot reuse the supplier request ID'
);
SELECT throws_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000012',
    '{"action":"create","clientRequestId":"d9000000-0000-4000-8000-000000000021","name":"Pemasok Nonaktif","category":"ATK","status":"inactive"}'::jsonb
  )$$,
  '23505', 'ID permintaan pemasok sudah digunakan untuk perubahan berbeda',
  'another actor cannot reuse the supplier request ID'
);
SELECT throws_ok(
  $$SELECT public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    '{"action":"update","clientRequestId":"d9000000-0000-4000-8000-000000000031","id":"d9000000-0000-4000-8000-000000000031","name":"Legacy retry","category":"ATK"}'::jsonb
  )$$,
  '23505', 'ID permintaan pemasok sudah digunakan untuk perubahan berbeda',
  'legacy request with unavailable original payload is reserved and rejected'
);
SELECT is(
  (public.manage_cooperative_supplier(
    'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','d9000000-0000-4000-8000-000000000023',
      'id',current_setting('erp4.cooperative_supplier_test_id'),'name','Pemasok Diperbarui','category','ATK')
  )->>'replayed'),
  'false',
  'a new request ID performs a valid supplier update'
);
SELECT is(
  (SELECT name FROM public.cooperative_suppliers
   WHERE tenant_id='d9000000-0000-4000-8000-000000000009'
     AND id=current_setting('erp4.cooperative_supplier_test_id')::uuid),
  'Pemasok Diperbarui',
  'valid supplier update changes the intended record'
);
SELECT is(
  (SELECT count(*)::int FROM public.cooperative_suppliers WHERE tenant_id='d9000000-0000-4000-8000-000000000009'),
  2,
  'retry does not create an extra supplier'
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

