-- CI-only legacy rows used to verify the 20261215000000 Laundry idempotency backfill.
-- Never run this fixture against staging or production.
BEGIN;

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e1500000-0000-4000-8000-000000000009','laundry-backfill-fixture','Laundry Backfill Fixture','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES (
  'e1500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','laundry-backfill-fixture@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}','{}',now(),now()
);

INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES (
  'e1500000-0000-4000-8000-000000000011','e1500000-0000-4000-8000-000000000009',
  'laundry-backfill-fixture@test.invalid','Laundry Backfill Fixture','admin','active','{"laundry":true}'
);

INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES (
  'e1500000-0000-4000-8000-000000000101','e1500000-0000-4000-8000-000000000009',
  'LBF001','Laundry Backfill Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')
);

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e1500000-0000-4000-8000-000000000201','e1500000-0000-4000-8000-000000000009',
  'e1500000-0000-4000-8000-000000000101','9150000002','Laundry Backfill Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

INSERT INTO public.laundry_orders(
  id,tenant_id,order_number,student_id,weight_kg,pieces,status,received_at,
  created_by,updated_by,created_at,updated_at
) VALUES (
  'e1500000-0000-4000-8000-000000000301','e1500000-0000-4000-8000-000000000009',
  'LDY-BACKFILL-001','e1500000-0000-4000-8000-000000000201',2.50,3,'washing',
  '2026-01-02 03:00:00+00','e1500000-0000-4000-8000-000000000011',
  'e1500000-0000-4000-8000-000000000011','2026-01-02 03:00:00+00','2026-01-02 03:10:00+00'
);

INSERT INTO public.laundry_events(
  tenant_id,order_id,event_type,client_request_id,actor_user_id,details,created_at
) VALUES
  ('e1500000-0000-4000-8000-000000000009','e1500000-0000-4000-8000-000000000301',
   'order_received','e1500000-0000-4000-8000-000000000401',
   'e1500000-0000-4000-8000-000000000011','{"status":"received","weightKg":2.5,"pieces":3}',
   '2026-01-02 03:04:05+00'),
  ('e1500000-0000-4000-8000-000000000009','e1500000-0000-4000-8000-000000000301',
   'status_changed','e1500000-0000-4000-8000-000000000402',
   'e1500000-0000-4000-8000-000000000011','{"from":"received","to":"washing"}',
   '2026-01-02 03:14:05+00'),
  ('e1500000-0000-4000-8000-000000000009',NULL,
   'settings_updated','e1500000-0000-4000-8000-000000000403',
   'e1500000-0000-4000-8000-000000000011','{"monthlyQuotaKg":18,"excessRatePerKg":12000}',
   '2026-01-02 03:24:05+00');

COMMIT;
