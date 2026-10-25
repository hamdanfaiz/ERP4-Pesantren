-- Synthetic coverage for atomic tenant-scoped import of archived cooperative wallet finances.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(23);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES (
  'd9200000-0000-4000-8000-000000000009',
  'cooperative-financial-import-test',
  'Cooperative Financial Import Test',
  'active',
  'Asia/Jakarta'
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  'd9200000-0000-4000-8000-000000000011',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'cooperative-financial-import@test.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'd9200000-0000-4000-8000-000000000011',
  'd9200000-0000-4000-8000-000000000009',
  'cooperative-financial-import@test.invalid',
  'Cooperative Financial Import Admin',
  'admin',
  'active',
  '{"cooperative":true,"finance":true}'
);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES (
  'd9200000-0000-4000-8000-000000000101',
  'd9200000-0000-4000-8000-000000000009',
  'CFI001',
  'Student Import',
  decode(repeat('ab',44),'hex'),
  decode(repeat('cd',32),'hex')
);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES (
  'd9200000-0000-4000-8000-000000000201',
  'd9200000-0000-4000-8000-000000000009',
  'd9200000-0000-4000-8000-000000000101',
  '9200000001',
  'Student Import',
  'L',
  'VII',
  decode(repeat('34',44),'hex'),
  decode(repeat('56',32),'hex'),
  'active'
);

UPDATE public.cooperative_wallets
SET daily_limit=50000, updated_by='d9200000-0000-4000-8000-000000000011'
WHERE tenant_id='d9200000-0000-4000-8000-000000000009';

CREATE TEMP TABLE cooperative_financial_import_target_wallet ON COMMIT DROP AS
SELECT id
FROM public.cooperative_wallets
WHERE tenant_id='d9200000-0000-4000-8000-000000000009'
  AND student_id='d9200000-0000-4000-8000-000000000201';
GRANT SELECT ON cooperative_financial_import_target_wallet TO service_role;

INSERT INTO public.cooperative_products (
  id, tenant_id, sku, name, category, stock_quantity, cost_price, unit_price,
  reorder_point, client_request_id, created_by, updated_by
)
VALUES (
  'd9200000-0000-4000-8000-000000000301',
  'd9200000-0000-4000-8000-000000000009',
  'CFI001',
  'Test Product',
  'Test',
  10,
  10,
  100,
  0,
  'd9200000-0000-4000-8000-000000000302',
  'd9200000-0000-4000-8000-000000000011',
  'd9200000-0000-4000-8000-000000000011'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.apply_cooperative_legacy_financial_history(uuid,uuid,text,text,boolean,jsonb,jsonb)',
    'EXECUTE'
  ),
  'only trusted service role has the import RPC grant'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.apply_cooperative_legacy_financial_history(uuid,uuid,text,text,boolean,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot invoke the import RPC'
);

SET LOCAL ROLE service_role;

SELECT throws_ok(
  $
    SELECT public.apply_cooperative_legacy_financial_history(
      'd9200000-0000-4000-8000-000000000009',
      'd9200000-0000-4000-8000-000000000011',
      repeat('9',64),
      repeat('8',64),
      true,
      jsonb_build_array(jsonb_build_object(
        'source_ref',repeat('c',64),
        'source_fingerprint',repeat('d',64),
        'target_wallet_id',(SELECT id::text FROM cooperative_financial_import_target_wallet),
        'client_request_id','d9200000-0000-4000-8000-000000000411',
        'opening_balance',1000,
        'closing_balance',899,
        'sales_total',101
      )),
      jsonb_build_array(jsonb_build_object(
        'source_ref',repeat('e',64),
        'source_fingerprint',repeat('f',64),
        'client_request_id','d9200000-0000-4000-8000-000000000412',
        'source_wallet_ref',repeat('c',64),
        'status','success',
        'created_at','2026-01-15T03:00:00Z',
        'total',101,
        'items',jsonb_build_array(jsonb_build_object(
          'product_id','d9200000-0000-4000-8000-000000000301',
          'name','Test Product',
          'quantity',1,
          'unit_price',100,
          'line_total',100,
          'cost_snapshot_known',false,
          'cost_price',NULL
        ))
      ))
    )
  $$,
  '23514',
  'Transaction total does not equal its historical items',
  'sale total must equal the sum of its imported item lines'
);
SELECT is(
  (SELECT balance FROM public.cooperative_wallets
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'
     AND student_id='d9200000-0000-4000-8000-000000000201'),
  0::numeric,
  'rejected aggregate mismatch leaves wallet balance unchanged'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_sales
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  0,
  'rejected aggregate mismatch writes no sale'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_wallet_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  0,
  'rejected aggregate mismatch writes no wallet ledger'
);
SELECT is(
  (SELECT count(*)::integer FROM public.finance_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  0,
  'rejected aggregate mismatch writes no Finance ledger'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_financial_import_batches
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  0,
  'rejected aggregate mismatch writes no import batch'
);

SELECT lives_ok(
  $$
    SELECT public.apply_cooperative_legacy_financial_history(
      'd9200000-0000-4000-8000-000000000009',
      'd9200000-0000-4000-8000-000000000011',
      repeat('a',64),
      repeat('b',64),
      true,
      jsonb_build_array(jsonb_build_object(
        'source_ref',repeat('c',64),
        'source_fingerprint',repeat('d',64),
        'target_wallet_id',(SELECT id::text FROM cooperative_financial_import_target_wallet),
        'client_request_id','d9200000-0000-4000-8000-000000000401',
        'opening_balance',1000,
        'closing_balance',900,
        'sales_total',100
      )),
      jsonb_build_array(jsonb_build_object(
        'source_ref',repeat('e',64),
        'source_fingerprint',repeat('f',64),
        'client_request_id','d9200000-0000-4000-8000-000000000402',
        'source_wallet_ref',repeat('c',64),
        'status','success',
        'created_at','2026-01-15T03:00:00Z',
        'total',100,
        'items',jsonb_build_array(jsonb_build_object(
          'product_id','d9200000-0000-4000-8000-000000000301',
          'name','Test Product',
          'quantity',1,
          'unit_price',100,
          'line_total',100,
          'cost_snapshot_known',false,
          'cost_price',NULL
        ))
      ))
    )
  $$,
  'a mapped product is locked and one reconciled wallet sale imports atomically'
);

SELECT is(
  (SELECT balance FROM public.cooperative_wallets
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'
     AND student_id='d9200000-0000-4000-8000-000000000201'),
  900::numeric,
  'wallet balance equals the archived closing balance'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_sales
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  1,
  'one historical sale is imported'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_sale_items
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  1,
  'the historical sale item is imported'
);
SELECT ok(
  (SELECT cost_price IS NULL AND cost_snapshot_known=false
   FROM public.cooperative_sale_items
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  'unknown historical cost remains explicitly unknown'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_wallet_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  2,
  'opening balance and sale each create one wallet ledger event'
);
SELECT is(
  (SELECT string_agg(entry_type||':'||balance_after::text,',' ORDER BY entry_sequence)
   FROM public.cooperative_wallet_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  'opening_balance:1000.00,purchase:900.00',
  'wallet ledger snapshots preserve chronological balances'
);
SELECT is(
  (SELECT count(*)::integer FROM public.finance_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  2,
  'opening balance and historical sale are both posted to Finance'
);
SELECT ok(
  (SELECT sum(amount) FILTER (WHERE entry_type='custodial_inflow')=1000
      AND sum(amount) FILTER (WHERE entry_type='custodial_release')=100
   FROM public.finance_ledger
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  'Finance custodial inflow and release match the wallet history'
);
SELECT is(
  (SELECT stock_quantity FROM public.cooperative_products
   WHERE id='d9200000-0000-4000-8000-000000000301'),
  10,
  'archived sales do not decrement current catalog stock'
);
SELECT is(
  (public.apply_cooperative_legacy_financial_history(
    'd9200000-0000-4000-8000-000000000009',
    'd9200000-0000-4000-8000-000000000011',
    repeat('a',64),
    repeat('b',64),
    true,
    jsonb_build_array(jsonb_build_object(
      'source_ref',repeat('c',64),'source_fingerprint',repeat('d',64),
      'target_wallet_id',(SELECT id::text FROM cooperative_financial_import_target_wallet),
      'client_request_id','d9200000-0000-4000-8000-000000000401',
      'opening_balance',1000,'closing_balance',900,'sales_total',100
    )),
    jsonb_build_array(jsonb_build_object(
      'source_ref',repeat('e',64),'source_fingerprint',repeat('f',64),
      'client_request_id','d9200000-0000-4000-8000-000000000402',
      'source_wallet_ref',repeat('c',64),'status','success',
      'created_at','2026-01-15T03:00:00Z','total',100,
      'items',jsonb_build_array(jsonb_build_object(
        'product_id','d9200000-0000-4000-8000-000000000301','name','Test Product',
        'quantity',1,'unit_price',100,'line_total',100,
        'cost_snapshot_known',false,'cost_price',NULL
      ))
    ))
  )->>'alreadyApplied'),
  'true',
  'an identical snapshot and mapping replay without writing again'
);
SELECT is(
  (SELECT count(*)::integer FROM public.cooperative_sales
   WHERE tenant_id='d9200000-0000-4000-8000-000000000009'),
  1,
  'idempotent replay creates no duplicate sale'
);
SELECT throws_ok(
  $$
    SELECT public.apply_cooperative_legacy_financial_history(
      'd9200000-0000-4000-8000-000000000009',
      'd9200000-0000-4000-8000-000000000011',
      repeat('a',64),
      repeat('9',64),
      true,
      '[]'::jsonb,
      '[{}]'::jsonb
    )
  $$,
  '23505',
  'This archive snapshot was already applied with different mappings',
  'the same archive snapshot cannot be remapped after application'
);

SELECT ok(
  NOT has_table_privilege('authenticated','public.cooperative_financial_import_batches','SELECT')
    AND NOT has_table_privilege('anon','public.cooperative_financial_import_records','SELECT'),
  'import audit tables are not directly readable by client roles'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.apply_cooperative_legacy_financial_history(uuid,uuid,text,text,boolean,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke the import RPC'
);

SELECT * FROM finish();
ROLLBACK;
