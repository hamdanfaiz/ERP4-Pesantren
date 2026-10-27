-- CI-only legacy rows used to verify pending mutation, guardian, and room-history backfills.
-- Never run this fixture against staging or production.
BEGIN;

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e1500000-0000-4000-8000-000000000009','laundry-backfill-fixture','Laundry Backfill Fixture','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','laundry-backfill-fixture@test.invalid','',now(),
   '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e1500000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','laundry-backfill-guardian@test.invalid','',now(),
   '{"provider":"email","providers":["email"]}','{}',now(),now());

INSERT INTO public.profiles(
  user_id,tenant_id,email,display_name,username,role,status,module_permissions,linked_santri_id
) VALUES
  ('e1500000-0000-4000-8000-000000000011','e1500000-0000-4000-8000-000000000009',
   'laundry-backfill-fixture@test.invalid','Laundry Backfill Fixture','laundry-backfill-admin',
   'admin','active','{"laundry":true}',''),
  ('e1500000-0000-4000-8000-000000000012','e1500000-0000-4000-8000-000000000009',
   'laundry-backfill-guardian@test.invalid','Wali Backfill Fixture','laundry-backfill-guardian',
   'wali_santri','active','{"guardian_portal":true}','e1500000-0000-4000-8000-000000000201');

INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES (
  'e1500000-0000-4000-8000-000000000101','e1500000-0000-4000-8000-000000000009',
  'LBF001','Laundry Backfill Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')
);

INSERT INTO public.master_data_records(tenant_id,category,id,name,gender_code)
VALUES ('e1500000-0000-4000-8000-000000000009','Gedung','LBF-G1','Gedung Backfill','L');
INSERT INTO public.master_data_records(
  tenant_id,category,id,name,parent_id,capacity,occupied,gender_code
) VALUES (
  'e1500000-0000-4000-8000-000000000009','Kamar','LBF-R1','Kamar Backfill','LBF-G1',4,1,'L'
);

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,room_id,building_id,
  nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e1500000-0000-4000-8000-000000000201','e1500000-0000-4000-8000-000000000009',
  'e1500000-0000-4000-8000-000000000101','9150000002','Laundry Backfill Student','L','VII',
  'LBF-R1','LBF-G1',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

INSERT INTO public.guardians(tenant_id,id,source_candidate_id,name,phone,status)
VALUES (
  'e1500000-0000-4000-8000-000000000009','e1500000-0000-4000-8000-000000000501',
  'e1500000-0000-4000-8000-000000000101','Wali Backfill Fixture','081200000009','Active'
);
INSERT INTO public.guardian_students(tenant_id,guardian_id,student_id,relationship)
VALUES (
  'e1500000-0000-4000-8000-000000000009','e1500000-0000-4000-8000-000000000501',
  'e1500000-0000-4000-8000-000000000201','Wali'
);

INSERT INTO public.donation_audit_events(
  tenant_id,entity_type,entity_id,action,client_request_id,actor_user_id,details,created_at
) VALUES (
  'e1500000-0000-4000-8000-000000000009','campaign','e1500000-0000-4000-8000-000000000511',
  'created','e1500000-0000-4000-8000-000000000512',
  'e1500000-0000-4000-8000-000000000011','{"title":"Campaign Backfill"}','2026-01-02 03:34:05+00'
);

INSERT INTO public.cooperative_suppliers(
  id,tenant_id,name,category,contact,pic,status,client_request_id,created_by,updated_by,created_at,updated_at
) VALUES (
  'e1500000-0000-4000-8000-000000000601','e1500000-0000-4000-8000-000000000009',
  'Pemasok Backfill','Sembako','081200000009','PIC Uji','active',
  'e1500000-0000-4000-8000-000000000602',
  'e1500000-0000-4000-8000-000000000011','e1500000-0000-4000-8000-000000000011',
  '2026-01-02 03:44:05+00','2026-01-02 03:54:05+00'
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
