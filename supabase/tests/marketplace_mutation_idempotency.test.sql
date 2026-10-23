-- Synthetic regression coverage for Marketplace request-key reuse.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(25);

INSERT INTO public.tenants (id,slug,name,status)
VALUES ('d9300000-0000-4000-8000-000000000009','marketplace-idempotency-test','Marketplace Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
VALUES (
  'd9300000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'marketplace-idempotency@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
);
INSERT INTO public.profiles (user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES (
  'd9300000-0000-4000-8000-000000000011','d9300000-0000-4000-8000-000000000009',
  'marketplace-idempotency@test.invalid','Marketplace Idempotency Admin','admin','active','{"marketplace":true}'
);

SET LOCAL ROLE service_role;

SELECT ok(
  has_function_privilege('service_role','public.manage_marketplace_product(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.adjust_marketplace_stock(uuid,uuid,uuid,integer,text,uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.create_marketplace_order(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.transition_marketplace_order(uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'service_role can call the payload-guarded Marketplace RPCs'
);
SELECT ok(
  NOT has_function_privilege('service_role','public.manage_marketplace_product_pre_payload_guard(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.adjust_marketplace_stock_pre_payload_guard(uuid,uuid,uuid,integer,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.create_marketplace_order_pre_payload_guard(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.transition_marketplace_order_pre_payload_guard(uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'service_role cannot bypass the idempotency wrappers'
);

SELECT set_config(
  'erp4.marketplace_product_result',
  public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    '{"action":"create","sku":"MKT-001","name":"Seragam Santri","category":"Seragam","unitPrice":10,"initialStock":10,"seller":"Koperasi","imageLabel":"Box","clientRequestId":"d9300000-0000-4000-8000-000000000401"}'::jsonb
  )::text,
  true
);
SELECT is(current_setting('erp4.marketplace_product_result')::jsonb->>'replayed','false','first product creation records a new mutation');
SELECT is(
  (public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    '{"action":"create","sku":"MKT-001","name":"Seragam Santri","category":"Seragam","unitPrice":10,"initialStock":10,"seller":"Koperasi","imageLabel":"Box","clientRequestId":"d9300000-0000-4000-8000-000000000401"}'::jsonb
  )->>'replayed'),
  'true',
  'identical product retry returns the recorded result'
);
SELECT throws_ok(
  $$SELECT public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    '{"action":"create","sku":"MKT-001","name":"Changed Product","category":"Seragam","unitPrice":10,"initialStock":10,"seller":"Koperasi","imageLabel":"Box","clientRequestId":"d9300000-0000-4000-8000-000000000401"}'::jsonb
  )$$,
  '23505','Marketplace request ID was already used for a different mutation',
  'a request ID cannot create a different product payload'
);
SELECT is((SELECT count(*)::int FROM public.marketplace_products WHERE tenant_id='d9300000-0000-4000-8000-000000000009'),1,'replayed and rejected product requests create no duplicate');

SELECT set_config(
  'erp4.marketplace_product_update_result',
  public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action','update','id',current_setting('erp4.marketplace_product_result')::jsonb->>'id',
      'sku','MKT-001','name','Seragam Revisi','category','Seragam','unitPrice',11,
      'seller','Koperasi','imageLabel','Box','clientRequestId','d9300000-0000-4000-8000-000000000402'
    )
  )::text,
  true
);
SELECT is(current_setting('erp4.marketplace_product_update_result')::jsonb->>'replayed','false','product update is recorded in the request ledger');
SELECT is(
  (public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action','update','id',current_setting('erp4.marketplace_product_result')::jsonb->>'id',
      'sku','MKT-001','name','Seragam Revisi','category','Seragam','unitPrice',11,
      'seller','Koperasi','imageLabel','Box','clientRequestId','d9300000-0000-4000-8000-000000000402'
    )
  )->>'replayed'),
  'true',
  'same product update request replays safely'
);
SELECT throws_ok(
  $$SELECT public.manage_marketplace_product(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action','update','id',current_setting('erp4.marketplace_product_result')::jsonb->>'id',
      'sku','MKT-001','name','Different Retry','category','Seragam','unitPrice',11,
      'seller','Koperasi','imageLabel','Box','clientRequestId','d9300000-0000-4000-8000-000000000402'
    )
  )$$,
  '23505','Marketplace request ID was already used for a different mutation',
  'a product update request ID cannot be reused with changed fields'
);

SELECT set_config(
  'erp4.marketplace_stock_result',
  public.adjust_marketplace_stock(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_product_result')::jsonb->>'id')::uuid,2,'Opname persediaan',
    'd9300000-0000-4000-8000-000000000403'
  )::text,
  true
);
SELECT is(current_setting('erp4.marketplace_stock_result')::jsonb->>'replayed','false','first stock adjustment records a new mutation');
SELECT is(
  (public.adjust_marketplace_stock(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_product_result')::jsonb->>'id')::uuid,2,'Opname persediaan',
    'd9300000-0000-4000-8000-000000000403'
  )->>'replayed'),
  'true',
  'identical stock adjustment retry does not move stock again'
);
SELECT throws_ok(
  $$SELECT public.adjust_marketplace_stock(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_product_result')::jsonb->>'id')::uuid,3,'Opname persediaan',
    'd9300000-0000-4000-8000-000000000403'
  )$$,
  '23505','Marketplace request ID was already used for a different mutation',
  'a stock request ID cannot be reused with a different quantity'
);
SELECT is(
  (SELECT stock_quantity FROM public.marketplace_products WHERE id=(current_setting('erp4.marketplace_product_result')::jsonb->>'id')::uuid),
  12,
  'replayed stock adjustment changes inventory exactly once'
);

SELECT set_config(
  'erp4.marketplace_order_result',
  public.create_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'customerName','Wali Santri','customerType','Parent',
      'items',jsonb_build_array(jsonb_build_object('product_id',current_setting('erp4.marketplace_product_result')::jsonb->>'id','quantity',2)),
      'clientRequestId','d9300000-0000-4000-8000-000000000404'
    )
  )::text,
  true
);
SELECT is(current_setting('erp4.marketplace_order_result')::jsonb->>'replayed','false','first order creation records the reservation');
SELECT is(
  (public.create_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'customerName','Wali Santri','customerType','Parent',
      'items',jsonb_build_array(jsonb_build_object('product_id',current_setting('erp4.marketplace_product_result')::jsonb->>'id','quantity',2)),
      'clientRequestId','d9300000-0000-4000-8000-000000000404'
    )
  )->>'replayed'),
  'true',
  'identical order retry does not reserve stock twice'
);
SELECT throws_ok(
  $$SELECT public.create_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'customerName','Wali Berbeda','customerType','Parent',
      'items',jsonb_build_array(jsonb_build_object('product_id',current_setting('erp4.marketplace_product_result')::jsonb->>'id','quantity',2)),
      'clientRequestId','d9300000-0000-4000-8000-000000000404'
    )
  )$$,
  '23505','Marketplace request ID was already used for a different mutation',
  'an order request ID cannot be reused with different customer data'
);
SELECT is((SELECT count(*)::int FROM public.marketplace_orders WHERE tenant_id='d9300000-0000-4000-8000-000000000009'),1,'replayed order creates only one order');
SELECT is(
  (SELECT stock_quantity FROM public.marketplace_products WHERE id=(current_setting('erp4.marketplace_product_result')::jsonb->>'id')::uuid),
  10,
  'order reservation is applied exactly once'
);

SELECT set_config(
  'erp4.marketplace_transition_result',
  public.transition_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_order_result')::jsonb->>'id')::uuid,'processing',
    'd9300000-0000-4000-8000-000000000405'
  )::text,
  true
);
SELECT is(current_setting('erp4.marketplace_transition_result')::jsonb->>'replayed','false','first order transition is recorded');
SELECT is(
  (public.transition_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_order_result')::jsonb->>'id')::uuid,'processing',
    'd9300000-0000-4000-8000-000000000405'
  )->>'replayed'),
  'true',
  'identical transition retry returns the original event'
);
SELECT throws_ok(
  $$SELECT public.transition_marketplace_order(
    'd9300000-0000-4000-8000-000000000009','d9300000-0000-4000-8000-000000000011',
    (current_setting('erp4.marketplace_order_result')::jsonb->>'id')::uuid,'cancelled',
    'd9300000-0000-4000-8000-000000000405'
  )$$,
  '23505','Marketplace request ID was already used for a different mutation',
  'a transition request ID cannot be reused for a different status'
);
SELECT is(
  (SELECT status FROM public.marketplace_orders WHERE id=(current_setting('erp4.marketplace_order_result')::jsonb->>'id')::uuid),
  'processing',
  'rejected replays leave the order in its original valid state'
);
SELECT is(
  (SELECT count(*)::int FROM public.marketplace_order_events WHERE tenant_id='d9300000-0000-4000-8000-000000000009'),
  2,
  'one order and one transition event are recorded'
);
SELECT is(
  (SELECT count(*)::int FROM public.marketplace_stock_movements
   WHERE tenant_id='d9300000-0000-4000-8000-000000000009' AND reason='Opname persediaan'),
  1,
  'one stock ledger entry is recorded'
);
SELECT is(
  (SELECT count(*)::int FROM public.marketplace_mutation_requests WHERE tenant_id='d9300000-0000-4000-8000-000000000009'),
  5,
  'product create, update, stock, order, and transition all have durable receipts'
);

SELECT * FROM finish();
ROLLBACK;
