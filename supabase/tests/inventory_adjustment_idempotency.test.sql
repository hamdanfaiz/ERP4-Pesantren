-- Synthetic inventory writes verify atomic stock and payload-bound request replay.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(11);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2000000-0000-4000-8000-000000000009','inventory-idempotency-test','Inventory Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'inventory-admin-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'inventory-admin-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000009',
   'inventory-admin-one@test.invalid','Inventory Admin One','admin','active','{"healthcare":true,"ga":true}'),
  ('e2000000-0000-4000-8000-000000000012','e2000000-0000-4000-8000-000000000009',
   'inventory-admin-two@test.invalid','Inventory Admin Two','admin','active','{"healthcare":true,"ga":true}');
INSERT INTO public.healthcare_medicines(
  id,tenant_id,name,stock_quantity,min_stock,client_request_id,created_by,updated_by
) VALUES (
  'e2000000-0000-4000-8000-000000000101','e2000000-0000-4000-8000-000000000009',
  'Obat Uji',10,2,'e2000000-0000-4000-8000-000000000501',
  'e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000011'
);
INSERT INTO public.ga_inventory_items(
  id,tenant_id,item_code,name,quantity,minimum_quantity,client_request_id,created_by,updated_by
) VALUES (
  'e2000000-0000-4000-8000-000000000201','e2000000-0000-4000-8000-000000000009',
  'INV-TEST-1','Inventaris Uji',10,2,'e2000000-0000-4000-8000-000000000502',
  'e2000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000011'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.adjust_healthcare_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000101',-3,'Distribusi UKS','e2000000-0000-4000-8000-000000000601'
  )->>'alreadyApplied','false','first medicine stock adjustment is applied'
);
SELECT is(
  public.adjust_healthcare_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000101',-3,'Distribusi UKS','e2000000-0000-4000-8000-000000000601'
  )->>'alreadyApplied','true','identical medicine adjustment replays safely'
);
SELECT throws_ok(
  $$SELECT public.adjust_healthcare_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000101',-2,'Distribusi UKS','e2000000-0000-4000-8000-000000000601'
  )$$,
  '23505','Healthcare stock request ID was already used for a different mutation',
  'medicine request ID cannot be reused with a different delta'
);
SELECT throws_ok(
  $$SELECT public.adjust_healthcare_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000012',
    'e2000000-0000-4000-8000-000000000101',-3,'Distribusi UKS','e2000000-0000-4000-8000-000000000601'
  )$$,
  '23505','Healthcare stock request ID was already used for a different mutation',
  'another actor cannot replay a medicine adjustment'
);
SELECT is(
  (SELECT stock_quantity::text FROM public.healthcare_medicines
   WHERE tenant_id='e2000000-0000-4000-8000-000000000009' AND id='e2000000-0000-4000-8000-000000000101'),
  '7','medicine balance changes only once'
);

SELECT is(
  public.adjust_ga_inventory_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000201',-3,'Pemakaian inventaris','e2000000-0000-4000-8000-000000000602'
  )->>'replayed','false','first general-affairs adjustment is applied'
);
SELECT is(
  public.adjust_ga_inventory_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000201',-3,'Pemakaian inventaris','e2000000-0000-4000-8000-000000000602'
  )->>'replayed','true','identical general-affairs adjustment replays safely'
);
SELECT throws_ok(
  $$SELECT public.adjust_ga_inventory_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000011',
    'e2000000-0000-4000-8000-000000000201',-2,'Pemakaian inventaris','e2000000-0000-4000-8000-000000000602'
  )$$,
  '23505','GA stock request ID was already used for a different mutation',
  'inventory request ID cannot be reused with a different delta'
);
SELECT throws_ok(
  $$SELECT public.adjust_ga_inventory_stock(
    'e2000000-0000-4000-8000-000000000009','e2000000-0000-4000-8000-000000000012',
    'e2000000-0000-4000-8000-000000000201',-3,'Pemakaian inventaris','e2000000-0000-4000-8000-000000000602'
  )$$,
  '23505','GA stock request ID was already used for a different mutation',
  'another actor cannot replay an inventory adjustment'
);
SELECT is(
  (SELECT quantity::text FROM public.ga_inventory_items
   WHERE tenant_id='e2000000-0000-4000-8000-000000000009' AND id='e2000000-0000-4000-8000-000000000201'),
  '7','general-affairs balance changes only once'
);
SELECT is(
  (SELECT count(*)::text FROM public.healthcare_stock_movements
   WHERE tenant_id='e2000000-0000-4000-8000-000000000009'), '1',
  'medicine ledger records only one movement for the key'
);
SELECT * FROM finish();
ROLLBACK;
