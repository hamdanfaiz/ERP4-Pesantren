-- Verify target start/end and Ustadz membership use the tenant business date, not DB session date.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SET LOCAL TIME ZONE 'Pacific/Honolulu';
SELECT plan(7);

CREATE TEMP TABLE tahfidz_tenant_business_date ON COMMIT DROP AS
SELECT (now() AT TIME ZONE 'Pacific/Kiritimati')::DATE AS tenant_today;

INSERT INTO public.tenants(id,slug,name,status,time_zone)
VALUES ('d1700000-0000-4000-8000-000000000009','tahfidz-tenant-day-test','Tahfidz Tenant Day Test','active','Pacific/Kiritimati');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('d1700000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'tahfidz-day-admin@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('d1700000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'tahfidz-day-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('d1700000-0000-4000-8000-000000000011','d1700000-0000-4000-8000-000000000009',
    'tahfidz-day-admin@test.invalid','Tahfidz Day Admin','admin','active','{"tahfidz":true}'),
  ('d1700000-0000-4000-8000-000000000012','d1700000-0000-4000-8000-000000000009',
    'tahfidz-day-teacher@test.invalid','Tahfidz Day Ustadz','ustadz','active','{"tahfidz":true}');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('d1700000-0000-4000-8000-000000000101','d1700000-0000-4000-8000-000000000009',
  'TBD001','Tahfidz Day Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'd1700000-0000-4000-8000-000000000201','d1700000-0000-4000-8000-000000000009',
  'd1700000-0000-4000-8000-000000000101','9170000001','Tahfidz Day Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);
INSERT INTO public.tahfidz_halaqahs(id,tenant_id,name,ustadz_user_id,ustadz_name,status)
VALUES ('d1700000-0000-4000-8000-000000000301','d1700000-0000-4000-8000-000000000009',
  'Halaqah Tenant Day','d1700000-0000-4000-8000-000000000012','Tahfidz Day Ustadz','active');
INSERT INTO public.tahfidz_memberships(tenant_id,halaqah_id,student_id,starts_on,status)
SELECT 'd1700000-0000-4000-8000-000000000009','d1700000-0000-4000-8000-000000000301',
  'd1700000-0000-4000-8000-000000000201',tenant_today,'active'
FROM tahfidz_tenant_business_date;

SELECT ok((SELECT tenant_today > CURRENT_DATE FROM tahfidz_tenant_business_date),
  'fixture makes tenant-local today one day ahead of the DB session date');

SELECT is(public.record_tahfidz_daily_target(
  'd1700000-0000-4000-8000-000000000009','d1700000-0000-4000-8000-000000000201',
  (SELECT tenant_today FROM tahfidz_tenant_business_date),NULL,1,1,'standard',NULL,
  'd1700000-0000-4000-8000-000000000011','admin','d1700000-0000-4000-8000-000000000401'
)->>'alreadyApplied','false','Admin can set a target for tenant-local today');
SELECT is((SELECT period_start::TEXT FROM public.tahfidz_targets
  WHERE tenant_id='d1700000-0000-4000-8000-000000000009'),
  (SELECT tenant_today::TEXT FROM tahfidz_tenant_business_date),'target period starts on the tenant business date');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_targets
  WHERE tenant_id='d1700000-0000-4000-8000-000000000009'),1,'one target is stored for the student');

SELECT is(public.record_tahfidz_daily_target(
  'd1700000-0000-4000-8000-000000000009','d1700000-0000-4000-8000-000000000201',
  (SELECT tenant_today FROM tahfidz_tenant_business_date),NULL,1,1,'standard',NULL,
  'd1700000-0000-4000-8000-000000000012','ustadz','d1700000-0000-4000-8000-000000000402'
)->>'alreadyApplied','false','Ustadz membership authorization uses the tenant-local date');
SELECT throws_ok(
  $$SELECT public.record_tahfidz_daily_target(
    'd1700000-0000-4000-8000-000000000009','d1700000-0000-4000-8000-000000000201',
    (SELECT tenant_today + 1 FROM tahfidz_tenant_business_date),NULL,1,1,'standard',NULL,
    'd1700000-0000-4000-8000-000000000011','admin','d1700000-0000-4000-8000-000000000403'
  )$$,'22023',
  'Target aktif harus berlaku pada hari ini atau sebelumnya dan tidak berakhir di masa lalu',
  'a start date after tenant-local today is rejected'
);
SELECT throws_ok(
  $$SELECT public.record_tahfidz_daily_target(
    'd1700000-0000-4000-8000-000000000009','d1700000-0000-4000-8000-000000000201',
    (SELECT tenant_today - 2 FROM tahfidz_tenant_business_date),
    (SELECT tenant_today - 1 FROM tahfidz_tenant_business_date),1,1,'standard',NULL,
    'd1700000-0000-4000-8000-000000000011','admin','d1700000-0000-4000-8000-000000000404'
  )$$,'22023',
  'Target aktif harus berlaku pada hari ini atau sebelumnya dan tidak berakhir di masa lalu',
  'a target ending before tenant-local today is rejected'
);

SELECT * FROM finish();
ROLLBACK;
