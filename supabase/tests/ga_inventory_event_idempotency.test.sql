-- General Affairs inventory lifecycle retries must preserve actor, action, and payload.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(14);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2200000-0000-4000-8000-000000000009','ga-item-idempotency-test','GA Item Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2200000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'ga-item-admin-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2200000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'ga-item-admin-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2200000-0000-4000-8000-000000000011','e2200000-0000-4000-8000-000000000009',
   'ga-item-admin-one@test.invalid','GA Admin One','admin','active','{"ga":true}'),
  ('e2200000-0000-4000-8000-000000000012','e2200000-0000-4000-8000-000000000009',
   'ga-item-admin-two@test.invalid','GA Admin Two','admin','active','{"ga":true}');

SET LOCAL ROLE service_role;

SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"e2200000-0000-4000-8000-000000000501","itemCode":"INV-GA-01","name":"Proyektor","category":"Kelas","initialQuantity":10,"minimumQuantity":2,"unit":"Pcs","unitCost":1000000,"location":"Gudang"}'::jsonb
  )->>'replayed','false','first inventory create is applied'
);
SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"e2200000-0000-4000-8000-000000000501","itemCode":"INV-GA-01","name":"Proyektor","category":"Kelas","initialQuantity":10,"minimumQuantity":2,"unit":"Pcs","unitCost":1000000,"location":"Gudang"}'::jsonb
  )->>'replayed','true','identical create replay returns the same item'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    '{"action":"create","clientRequestId":"e2200000-0000-4000-8000-000000000501","itemCode":"INV-GA-01","name":"Item berbeda","category":"Kelas","initialQuantity":10,"minimumQuantity":2,"unit":"Pcs","unitCost":1000000,"location":"Gudang"}'::jsonb
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'create request key cannot be reused with changed content'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000012',
    '{"action":"create","clientRequestId":"e2200000-0000-4000-8000-000000000501","itemCode":"INV-GA-01","name":"Proyektor","category":"Kelas","initialQuantity":10,"minimumQuantity":2,"unit":"Pcs","unitCost":1000000,"location":"Gudang"}'::jsonb
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'another actor cannot replay a create key'
);

SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','e2200000-0000-4000-8000-000000000502',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
      'itemCode','INV-GA-01','name','Proyektor Kelas','category','Kelas','minimumQuantity',1,
      'unit','Pcs','unitCost',900000,'location','Ruang kelas')
  )->>'replayed','false','first inventory update is applied'
);
SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','e2200000-0000-4000-8000-000000000502',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
      'itemCode','INV-GA-01','name','Proyektor Kelas','category','Kelas','minimumQuantity',1,
      'unit','Pcs','unitCost',900000,'location','Ruang kelas')
  )->>'replayed','true','identical inventory update replays'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','e2200000-0000-4000-8000-000000000502',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
      'itemCode','INV-GA-01','name','Nama berbeda','category','Kelas','minimumQuantity',1,
      'unit','Pcs','unitCost',900000,'location','Ruang kelas')
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'update key cannot be reused with changed content'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000012',
    jsonb_build_object('action','update','clientRequestId','e2200000-0000-4000-8000-000000000502',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
      'itemCode','INV-GA-01','name','Proyektor Kelas','category','Kelas','minimumQuantity',1,
      'unit','Pcs','unitCost',900000,'location','Ruang kelas')
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'another actor cannot replay an update key'
);

SELECT is(
  public.adjust_ga_inventory_stock(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    (SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
    -10,'Pengecekan stok akhir','e2200000-0000-4000-8000-000000000503'
  )->>'balance','0','stock is zeroed before archive'
);
SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','archive','clientRequestId','e2200000-0000-4000-8000-000000000504',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'))
  )->>'replayed','false','first inventory archive is applied'
);
SELECT is(
  public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','archive','clientRequestId','e2200000-0000-4000-8000-000000000504',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'))
  )->>'replayed','true','identical archive request replays'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000011',
    jsonb_build_object('action','update','clientRequestId','e2200000-0000-4000-8000-000000000504',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'),
      'itemCode','INV-GA-01','name','Proyektor Kelas','category','Kelas','minimumQuantity',1,
      'unit','Pcs','unitCost',900000,'location','Ruang kelas')
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'archive request key cannot be reused for an update'
);
SELECT throws_ok(
  $$SELECT public.manage_ga_inventory_item(
    'e2200000-0000-4000-8000-000000000009','e2200000-0000-4000-8000-000000000012',
    jsonb_build_object('action','archive','clientRequestId','e2200000-0000-4000-8000-000000000504',
      'id',(SELECT id FROM public.ga_inventory_items WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'))
  )$$,
  '23505','General Affairs inventory request ID was already used for a different mutation',
  'another actor cannot replay an archive key'
);
SELECT is(
  (SELECT count(*)::integer FROM public.ga_inventory_items
   WHERE tenant_id='e2200000-0000-4000-8000-000000000009' AND item_code='INV-GA-01'
     AND quantity=0 AND status='archived'),
  1,
  'conflicting lifecycle retries do not alter the archived item'
);

SELECT * FROM finish();
ROLLBACK;
