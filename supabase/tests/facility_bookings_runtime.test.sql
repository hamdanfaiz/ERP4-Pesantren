-- A tenant can start using facility bookings without importing dummy Firestore data.
-- Synthetic fixtures are rolled back at the end of the test.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(8);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('f2100000-0000-4000-8000-000000000001', 'facility-runtime-test', 'Facility Runtime Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'f2100000-0000-4000-8000-000000000011',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'facility-admin@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'f2100000-0000-4000-8000-000000000011',
  'f2100000-0000-4000-8000-000000000001',
  'facility-admin@test.invalid', 'Admin Fasilitas Uji', 'admin', 'active', '{"ga":true}'
);

SET LOCAL ROLE service_role;

SELECT is(
  (SELECT count(*)::int FROM public.facility_booking_import_batches WHERE tenant_id = 'f2100000-0000-4000-8000-000000000001'),
  0,
  'a new tenant has no legacy import batch'
);

SELECT is(
  public.manage_facility_booking(
    'f2100000-0000-4000-8000-000000000001',
    'f2100000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action', 'create', 'clientRequestId', 'f2100000-0000-4000-8000-000000000101',
      'room', 'Aula Uji', 'date', to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'),
      'startTime', '09:00', 'endTime', '10:00', 'purpose', 'Rapat wali santri', 'booker', 'Admin Uji'
    )
  )->>'replayed',
  'false',
  'a booking can be created before any legacy import'
);

SELECT is(
  (SELECT count(*)::int FROM public.facility_bookings WHERE tenant_id = 'f2100000-0000-4000-8000-000000000001'),
  1,
  'manual booking is stored with its tenant'
);

SELECT is(
  (SELECT count(*)::int FROM public.facility_booking_events WHERE tenant_id = 'f2100000-0000-4000-8000-000000000001'),
  1,
  'manual booking creates one audit event'
);

SELECT is(
  public.manage_facility_booking(
    'f2100000-0000-4000-8000-000000000001',
    'f2100000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action', 'create', 'clientRequestId', 'f2100000-0000-4000-8000-000000000101',
      'room', 'Aula Uji', 'date', to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'),
      'startTime', '09:00', 'endTime', '10:00', 'purpose', 'Rapat wali santri', 'booker', 'Admin Uji'
    )
  )->>'replayed',
  'true',
  'a retry with the same request ID returns the existing booking'
);

SELECT is(
  (SELECT count(*)::int FROM public.facility_booking_events WHERE tenant_id = 'f2100000-0000-4000-8000-000000000001'),
  1,
  'a retried booking does not duplicate the audit event'
);

SELECT throws_ok(
  $$SELECT public.manage_facility_booking(
    'f2100000-0000-4000-8000-000000000001',
    'f2100000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'action', 'create', 'clientRequestId', 'f2100000-0000-4000-8000-000000000102',
      'room', 'Aula Uji', 'date', to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'),
      'startTime', '09:30', 'endTime', '10:30', 'purpose', 'Jadwal bentrok', 'booker', 'Admin Uji'
    )
  )$$,
  '23P01',
  'Facility time overlaps another confirmed booking',
  'overlapping active bookings are rejected'
);

SELECT is(
  (SELECT count(*)::int FROM public.facility_bookings WHERE tenant_id = 'f2100000-0000-4000-8000-000000000001'),
  1,
  'rejected overlap does not leave a second booking'
);

SELECT * FROM finish();
ROLLBACK;

