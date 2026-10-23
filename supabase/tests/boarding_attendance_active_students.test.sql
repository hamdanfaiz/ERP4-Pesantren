-- Boarding attendance is limited to operationally active students and retries stay idempotent.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

INSERT INTO public.tenants(id, slug, name, status)
VALUES ('e2800000-0000-4000-8000-000000000009','boarding-active-student-test','Boarding Active Student Test','active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'e2800000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','boarding-active-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}','{}',now(),now()
);

INSERT INTO public.profiles(user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'e2800000-0000-4000-8000-000000000011','e2800000-0000-4000-8000-000000000009',
  'boarding-active-admin@test.invalid','Boarding Admin','admin','active','{"boarding":true}'
);

INSERT INTO public.candidates(id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e2800000-0000-4000-8000-000000000101','e2800000-0000-4000-8000-000000000009','BA001','Active Student',
   decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e2800000-0000-4000-8000-000000000102','e2800000-0000-4000-8000-000000000009','BA002','Inactive Student',
   decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex')),
  ('e2800000-0000-4000-8000-000000000103','e2800000-0000-4000-8000-000000000009','BA003','Alumni Student',
   decode(repeat('ad',44),'hex'),decode(repeat('cf',32),'hex')),
  ('e2800000-0000-4000-8000-000000000104','e2800000-0000-4000-8000-000000000009','BA004','Graduated Student',
   decode(repeat('ae',44),'hex'),decode(repeat('d0',32),'hex')),
  ('e2800000-0000-4000-8000-000000000105','e2800000-0000-4000-8000-000000000009','BA005','Nonactive Student',
   decode(repeat('af',44),'hex'),decode(repeat('d1',32),'hex')),
  ('e2800000-0000-4000-8000-000000000106','e2800000-0000-4000-8000-000000000009','BA006','Withdrawn Student',
   decode(repeat('b0',44),'hex'),decode(repeat('d2',32),'hex'));

INSERT INTO public.students(id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status)
VALUES
  ('e2800000-0000-4000-8000-000000000201','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000101','9280000001','Active Student','L','VII',
   decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'Active'),
  ('e2800000-0000-4000-8000-000000000202','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000102','9280000002','Inactive Student','P','VII',
   decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'Inactive'),
  ('e2800000-0000-4000-8000-000000000203','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000103','9280000003','Alumni Student','L','VII',
   decode(repeat('36',44),'hex'),decode(repeat('58',32),'hex'),'Alumni'),
  ('e2800000-0000-4000-8000-000000000204','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000104','9280000004','Graduated Student','P','VII',
   decode(repeat('37',44),'hex'),decode(repeat('59',32),'hex'),'Graduated'),
  ('e2800000-0000-4000-8000-000000000205','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000105','9280000005','Nonactive Student','L','VII',
   decode(repeat('38',44),'hex'),decode(repeat('5a',32),'hex'),'Nonaktif'),
  ('e2800000-0000-4000-8000-000000000206','e2800000-0000-4000-8000-000000000009',
   'e2800000-0000-4000-8000-000000000106','9280000006','Withdrawn Student','P','VII',
   decode(repeat('39',44),'hex'),decode(repeat('5b',32),'hex'),'Dikeluarkan');

SET LOCAL ROLE service_role;

CREATE TEMP TABLE boarding_attendance_first AS
SELECT public.set_boarding_attendance_status(
  'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000201',
  '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
  'e2800000-0000-4000-8000-000000000301'
) AS result;

SELECT is((SELECT result->>'success' FROM boarding_attendance_first),'true',
  'active student attendance is accepted');
SELECT is((SELECT result->>'alreadyApplied' FROM boarding_attendance_first),'false',
  'first attendance request is recorded');
SELECT is((SELECT count(*)::integer FROM public.boarding_attendance_records
  WHERE tenant_id='e2800000-0000-4000-8000-000000000009'),1,
  'first mark creates one attendance record');

SELECT is(public.set_boarding_attendance_status(
  'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000201',
  '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
  'e2800000-0000-4000-8000-000000000301'
)->>'alreadyApplied','true','identical attendance retry is replayed');

SELECT is((SELECT count(*)::integer FROM public.boarding_attendance_events
  WHERE tenant_id='e2800000-0000-4000-8000-000000000009'),1,
  'attendance retry does not create a duplicate event');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000201',
    '2026-10-23','Ghaib','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000301'
  )$q$,'23505','Kunci permintaan kehadiran digunakan untuk tindakan berbeda',
  'same request ID cannot change attendance status');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000202',
    '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000302'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'inactive student cannot be marked');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000203',
    '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000303'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'alumni cannot be marked');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000204',
    '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000304'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'graduated student cannot be marked');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000205',
    '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000305'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'Nonaktif student cannot be marked');

SELECT throws_ok(
  $q$SELECT public.set_boarding_attendance_status(
    'e2800000-0000-4000-8000-000000000009','e2800000-0000-4000-8000-000000000206',
    '2026-10-23','Hadir','e2800000-0000-4000-8000-000000000011','admin',
    'e2800000-0000-4000-8000-000000000306'
  )$q$,'P0002','Santri tidak ditemukan pada tenant ini',
  'withdrawn student cannot be marked');

SELECT is((SELECT count(*)::integer FROM public.boarding_attendance_records
  WHERE tenant_id='e2800000-0000-4000-8000-000000000009'),1,
  'rejected inactive statuses do not create attendance records');

SELECT * FROM finish();
ROLLBACK;
