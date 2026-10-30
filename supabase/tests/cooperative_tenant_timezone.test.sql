-- Cooperative checkout must apply the daily spending boundary in the tenant's time zone.
-- All fixtures are synthetic and rolled back with this test transaction.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(4);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES ('d9000000-0000-4000-8000-000000000009', 'cooperative-timezone-test', 'Cooperative Timezone Test', 'active', 'America/Los_Angeles');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd9000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'cooperative-timezone@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000009',
  'cooperative-timezone@test.invalid', 'Cooperative Timezone Admin', 'admin', 'active', '{"cooperative":true}'
);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES (
  'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000009',
  'CTZ001', 'Santri Cooperative Timezone Test', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')
);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES (
  'd9000000-0000-4000-8000-000000000201', 'd9000000-0000-4000-8000-000000000009',
  'd9000000-0000-4000-8000-000000000101', '9000000001', 'Santri Cooperative Timezone Test', 'L', 'VII',
  decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'), 'active'
);

UPDATE public.cooperative_wallets
SET balance = 900, daily_limit = 150, updated_by = 'd9000000-0000-4000-8000-000000000011'
WHERE tenant_id = 'd9000000-0000-4000-8000-000000000009'
  AND student_id = 'd9000000-0000-4000-8000-000000000201';

INSERT INTO public.cooperative_products (
  id, tenant_id, sku, name, category, stock_quantity, cost_price, unit_price,
  reorder_point, client_request_id, created_by, updated_by
)
VALUES (
  'd9000000-0000-4000-8000-000000000301', 'd9000000-0000-4000-8000-000000000009',
  'CTZ001', 'Produk Cooperative Timezone Test', 'Test', 10, 10, 100,
  0, 'd9000000-0000-4000-8000-000000000302',
  'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000011'
);

CREATE TEMP TABLE cooperative_timezone_probe ON COMMIT DROP AS
WITH starts AS (
  SELECT
    date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles' AS tenant_start,
    ((now() AT TIME ZONE 'America/Los_Angeles')::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles' AS tenant_end,
    date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta' AS jakarta_start
), probe AS (
  SELECT *, least(tenant_start, jakarta_start) + (greatest(tenant_start, jakarta_start) - least(tenant_start, jakarta_start)) / 2 AS probe_at
  FROM starts
)
SELECT *, probe_at >= tenant_start AND probe_at < tenant_end AS probe_is_in_tenant_day
FROM probe;
SELECT set_config(
  'erp4.cooperative_timezone_probe_in_tenant_day',
  (SELECT probe_is_in_tenant_day::text FROM cooperative_timezone_probe),
  true
);

SELECT ok(
  position('Asia/Jakarta' IN pg_get_functiondef('public.checkout_cooperative_wallet_sale(uuid,uuid,uuid,jsonb,uuid)'::regprocedure)) = 0,
  'cooperative checkout no longer hard-codes the Jakarta day boundary'
);
SELECT ok(
  (SELECT tenant_start <> jakarta_start AND probe_at < now() FROM cooperative_timezone_probe),
  'test probe is a past instant between the tenant and Jakarta business-day starts'
);

INSERT INTO public.cooperative_sales (
  id, tenant_id, wallet_id, student_id, total_amount, client_request_id, created_by, created_at
)
SELECT
  'd9000000-0000-4000-8000-000000000401', 'd9000000-0000-4000-8000-000000000009',
  w.id, w.student_id, 100, 'd9000000-0000-4000-8000-000000000402',
  'd9000000-0000-4000-8000-000000000011', p.probe_at
FROM public.cooperative_wallets AS w
CROSS JOIN cooperative_timezone_probe AS p
WHERE w.tenant_id = 'd9000000-0000-4000-8000-000000000009'
  AND w.student_id = 'd9000000-0000-4000-8000-000000000201';

INSERT INTO public.cooperative_wallet_ledger (
  tenant_id, wallet_id, student_id, sale_id, entry_type, amount_delta, balance_after,
  reference, client_request_id, created_by, created_at
)
SELECT
  'd9000000-0000-4000-8000-000000000009', w.id, w.student_id,
  'd9000000-0000-4000-8000-000000000401', 'purchase', -100, 900,
  'Synthetic prior cooperative purchase', 'd9000000-0000-4000-8000-000000000403',
  'd9000000-0000-4000-8000-000000000011', p.probe_at
FROM public.cooperative_wallets AS w
CROSS JOIN cooperative_timezone_probe AS p
WHERE w.tenant_id = 'd9000000-0000-4000-8000-000000000009'
  AND w.student_id = 'd9000000-0000-4000-8000-000000000201';

SET LOCAL ROLE service_role;

SELECT CASE WHEN current_setting('erp4.cooperative_timezone_probe_in_tenant_day')::boolean THEN
  throws_ok(
    $$SELECT public.checkout_cooperative_wallet_sale(
      'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
      (SELECT id FROM public.cooperative_wallets WHERE tenant_id='d9000000-0000-4000-8000-000000000009' AND student_id='d9000000-0000-4000-8000-000000000201'),
      '[{"product_id":"d9000000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
      'd9000000-0000-4000-8000-000000000501'
    )$$,
    '23514', 'Daily wallet limit exceeded',
    'checkout counts purchases inside the tenant business day'
  )
ELSE
  lives_ok(
    $$SELECT public.checkout_cooperative_wallet_sale(
      'd9000000-0000-4000-8000-000000000009', 'd9000000-0000-4000-8000-000000000011',
      (SELECT id FROM public.cooperative_wallets WHERE tenant_id='d9000000-0000-4000-8000-000000000009' AND student_id='d9000000-0000-4000-8000-000000000201'),
      '[{"product_id":"d9000000-0000-4000-8000-000000000301","quantity":1}]'::jsonb,
      'd9000000-0000-4000-8000-000000000501'
    )$$,
    'checkout ignores purchases outside the tenant business day'
  )
END;

SELECT is(
  (SELECT count(*)::int FROM public.cooperative_sales
   WHERE tenant_id='d9000000-0000-4000-8000-000000000009'
     AND client_request_id='d9000000-0000-4000-8000-000000000501'),
  CASE WHEN current_setting('erp4.cooperative_timezone_probe_in_tenant_day')::boolean THEN 0 ELSE 1 END,
  'checkout succeeds or fails according to the tenant day rather than Jakarta time'
);

SELECT * FROM finish();
ROLLBACK;

