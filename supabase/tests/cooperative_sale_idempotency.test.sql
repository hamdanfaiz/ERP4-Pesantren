-- Synthetic test: retries must keep the original wallet and sale payload.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(11);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('d9100000-0000-4000-8000-000000000009', 'cooperative-idempotency-test', 'Cooperative Idempotency Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd9100000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'cooperative-idempotency@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd9100000-0000-4000-8000-000000000011', 'd9100000-0000-4000-8000-000000000009',
  'cooperative-idempotency@test.invalid', 'Cooperative Idempotency Admin', 'admin', 'active', '{"cooperative":true}'
);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('d9100000-0000-4000-8000-000000000101', 'd9100000-0000-4000-8000-000000000009', 'CID001', 'Student A', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
  ('d9100000-0000-4000-8000-000000000102', 'd9100000-0000-4000-8000-000000000009', 'CID002', 'Student B', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'));

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES
  ('d9100000-0000-4000-8000-000000000201', 'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000101', '9100000001', 'Student A', 'L', 'VII', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'), 'active'),
  ('d9100000-0000-4000-8000-000000000202', 'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000102', '9100000002', 'Student B', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('90', 32), 'hex'), 'active');

UPDATE public.cooperative_wallets
SET balance=1000, daily_limit=1000, updated_by='d9100000-0000-4000-8000-000000000011'
WHERE tenant_id='d9100000-0000-4000-8000-000000000009';

INSERT INTO public.cooperative_products (
  id, tenant_id, sku, name, category, stock_quantity, cost_price, unit_price,
  reorder_point, client_request_id, created_by, updated_by
)
VALUES (
  'd9100000-0000-4000-8000-000000000301', 'd9100000-0000-4000-8000-000000000009',
  'CID001', 'Test Product', 'Test', 10, 10, 100, 0,
  'd9100000-0000-4000-8000-000000000302',
  'd9100000-0000-4000-8000-000000000011', 'd9100000-0000-4000-8000-000000000011'
);

SELECT ok(
  NOT has_function_privilege('service_role', 'public.checkout_cooperative_wallet_sale_pre_wallet_guard(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'service_role cannot call the pre-guard RPC directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.checkout_cooperative_wallet_sale(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'service_role can call the guarded checkout RPC'
);

CREATE TEMP TABLE cooperative_idempotency_first ON COMMIT DROP AS
SELECT public.checkout_cooperative_wallet_sale(
  'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000011',
  (SELECT id FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000201'),
  '[{"product_id":"d9100000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
  'd9100000-0000-4000-8000-000000000401'
) AS result;
GRANT SELECT ON cooperative_idempotency_first TO service_role;

SET LOCAL ROLE service_role;

SELECT is((SELECT result->>'replayed' FROM cooperative_idempotency_first), 'false', 'first checkout performs a new sale');
SELECT is(
  (public.checkout_cooperative_wallet_sale(
    'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000011',
    (SELECT id FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000201'),
    '[{"product_id":"d9100000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
    'd9100000-0000-4000-8000-000000000401'
  )->>'id'),
  (SELECT result->>'id' FROM cooperative_idempotency_first),
  'same request key, wallet, and items replay the original sale'
);
SELECT is((public.checkout_cooperative_wallet_sale(
  'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000011',
  (SELECT id FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000201'),
  '[{"product_id":"d9100000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
  'd9100000-0000-4000-8000-000000000401'
)->>'replayed'), 'true', 'retry is marked as replayed');

SELECT throws_ok(
  $$SELECT public.checkout_cooperative_wallet_sale(
    'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000011',
    (SELECT id FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000202'),
    '[{"product_id":"d9100000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
    'd9100000-0000-4000-8000-000000000401'
  )$$,
  '23505', 'Request ID was already used for different sale data',
  'a request ID cannot be replayed against a different student wallet'
);
SELECT throws_ok(
  $$SELECT public.checkout_cooperative_wallet_sale(
    'd9100000-0000-4000-8000-000000000009', 'd9100000-0000-4000-8000-000000000011',
    (SELECT id FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000201'),
    '[{"product_id":"d9100000-0000-4000-8000-000000000301","quantity":2}]'::jsonb,
    'd9100000-0000-4000-8000-000000000401'
  )$$,
  '23505', 'Request ID was already used for different sale data',
  'a request ID cannot be replayed with different quantities'
);

SELECT is((SELECT count(*)::int FROM public.cooperative_sales WHERE tenant_id='d9100000-0000-4000-8000-000000000009'), 1, 'retry and rejected replays create no duplicate sale');
SELECT is((SELECT balance FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000201'), 900::numeric, 'the original wallet is debited once');
SELECT is((SELECT balance FROM public.cooperative_wallets WHERE student_id='d9100000-0000-4000-8000-000000000202'), 1000::numeric, 'the alternate wallet is not debited');
SELECT is((SELECT stock_quantity FROM public.cooperative_products WHERE id='d9100000-0000-4000-8000-000000000301'), 9, 'inventory is decremented exactly once');

SELECT * FROM finish();
ROLLBACK;
