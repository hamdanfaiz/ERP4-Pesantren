-- Tenant isolation, authorization, idempotency and legal status transitions for boarding permits.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('e8100000-0000-4000-8000-000000000001','permit-test-a','Permit Test A','active'),
  ('e8100000-0000-4000-8000-000000000002','permit-test-b','Permit Test B','active');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e8100000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','permit-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('e8100000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','permit-ustadz@test.invalid','',now(),'{}','{}',now(),now()),
  ('e8100000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','permit-admin-b@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('e8100000-0000-4000-8000-000000000011','e8100000-0000-4000-8000-000000000001','permit-admin@test.invalid','Admin Izin','admin','active','{"boarding":true}'),
  ('e8100000-0000-4000-8000-000000000012','e8100000-0000-4000-8000-000000000001','permit-ustadz@test.invalid','Ustadz Izin','ustadz','active','{"boarding":true}'),
  ('e8100000-0000-4000-8000-000000000013','e8100000-0000-4000-8000-000000000002','permit-admin-b@test.invalid','Admin Tenant B','admin','active','{"boarding":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint) VALUES
  ('e8100000-0000-4000-8000-000000000101','e8100000-0000-4000-8000-000000000001','PERMIT-A-001','Santri A',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e8100000-0000-4000-8000-000000000102','e8100000-0000-4000-8000-000000000002','PERMIT-B-001','Santri B',decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex'));

INSERT INTO public.students (id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status) VALUES
  ('e8100000-0000-4000-8000-000000000201','e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000101','9810000001','Santri A','L','VII',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'Active'),
  ('e8100000-0000-4000-8000-000000000202','e8100000-0000-4000-8000-000000000002','e8100000-0000-4000-8000-000000000102','9810000002','Santri B','L','VII',decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'Active');

SELECT ok(NOT has_function_privilege('anon','public.request_boarding_permit(uuid,uuid,text,text,date,date,uuid,text,uuid)','EXECUTE'),
  'anonymous users cannot request a boarding permit directly');
SELECT ok(NOT has_function_privilege('authenticated','public.request_boarding_permit(uuid,uuid,text,text,date,date,uuid,text,uuid)','EXECUTE'),
  'authenticated browser users cannot request a permit directly');
SELECT ok(has_function_privilege('service_role','public.request_boarding_permit(uuid,uuid,text,text,date,date,uuid,text,uuid)','EXECUTE'),
  'trusted backend can request a permit');
SELECT ok(NOT has_table_privilege('anon','public.boarding_permits','SELECT'),
  'anonymous users cannot query permit records');
SELECT ok(NOT has_table_privilege('authenticated','public.boarding_permit_events','SELECT'),
  'authenticated users cannot query the audit ledger directly');

SET LOCAL ROLE service_role;
CREATE TEMP TABLE permit_request AS
SELECT public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000201',
  'Pulang','Kunjungan keluarga','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000301'
) AS result;
SELECT is((SELECT result->>'success' FROM permit_request),'true','active tenant Admin can create a permit');
SELECT is((SELECT result->>'alreadyApplied' FROM permit_request),'false','first permit request is not a replay');
SELECT is((SELECT count(*)::integer FROM public.boarding_permits WHERE tenant_id='e8100000-0000-4000-8000-000000000001'),1,'one permit row is created');
SELECT is((SELECT count(*)::integer FROM public.boarding_permit_events WHERE tenant_id='e8100000-0000-4000-8000-000000000001'),1,'request creates one audit event');

SELECT is(public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000201',
  'Pulang','Kunjungan keluarga','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000301'
)->>'alreadyApplied','true','an identical retry returns the existing permit');
SELECT is((SELECT count(*)::integer FROM public.boarding_permit_events WHERE tenant_id='e8100000-0000-4000-8000-000000000001'),1,'identical retry does not duplicate audit events');
SELECT throws_ok($q$SELECT public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000201',
  'Pulang','Alasan berbeda','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000301')$q$,
  '23505','Kunci permintaan izin sudah digunakan untuk data berbeda','same idempotency key cannot change the permit payload');
SELECT throws_ok($q$SELECT public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000202',
  'Pulang','Lintas tenant','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000302')$q$,
  'P0002','Santri tidak ditemukan pada tenant ini','a student from another tenant cannot be targeted');
SELECT throws_ok($q$SELECT public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000201',
  'Pulang','Ustadz belum ditugaskan','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000012','ustadz','e8100000-0000-4000-8000-000000000303')$q$,
  '42501','Santri berada di luar penugasan petugas','an unassigned Ustadz cannot request a permit for a student');
SELECT throws_ok($q$SELECT public.request_boarding_permit(
  'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000201',
  'Pulang','Role mismatch','2026-11-01','2026-11-02',
  'e8100000-0000-4000-8000-000000000011','ustadz','e8100000-0000-4000-8000-000000000304')$q$,
  '42501','Profil akun asrama tidak aktif atau role tidak cocok','expected role must match the active profile');

CREATE TEMP TABLE permit_created AS SELECT result->>'permitId' AS permit_id FROM permit_request;
SELECT is(public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Pending Keamanan',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000311'
)->>'status','Pending Keamanan','Admin can advance a request to security review');
SELECT is(public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Pending Keamanan',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000311'
)->>'alreadyApplied','true','identical status retry replays the prior event');
SELECT throws_ok($q$SELECT public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Active',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000312')$q$,
  '23514','Perubahan status izin tidak sesuai alur atau status sudah berubah','Active cannot skip approval');
SELECT is(public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Approved',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000313'
)->>'status','Approved','Admin can approve after security review');
SELECT is(public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Active',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000314'
)->>'status','Active','Admin can activate an approved permit');
SELECT is(public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Returned',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000315'
)->>'status','Returned','Admin can close an active permit as returned');
SELECT throws_ok($q$SELECT public.transition_boarding_permit(
  'e8100000-0000-4000-8000-000000000001',(SELECT permit_id::uuid FROM permit_created),'Approved',
  'e8100000-0000-4000-8000-000000000011','admin','e8100000-0000-4000-8000-000000000316')$q$,
  '23514','Perubahan status izin tidak sesuai alur atau status sudah berubah','returned permits cannot be reopened through the transition endpoint');
SELECT is((SELECT count(*)::integer FROM public.boarding_permit_events WHERE tenant_id='e8100000-0000-4000-8000-000000000001'),5,
  'audit ledger contains exactly request plus four valid transitions');

SELECT * FROM finish();
ROLLBACK;
