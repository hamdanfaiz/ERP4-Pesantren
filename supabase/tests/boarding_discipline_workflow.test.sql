-- Tenant isolation, authorization, idempotency and append-only audit behavior for discipline records.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('e8200000-0000-4000-8000-000000000001','discipline-test-a','Discipline Test A','active'),
  ('e8200000-0000-4000-8000-000000000002','discipline-test-b','Discipline Test B','active');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e8200000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','discipline-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('e8200000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','discipline-ustadz@test.invalid','',now(),'{}','{}',now(),now()),
  ('e8200000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','discipline-admin-b@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('e8200000-0000-4000-8000-000000000011','e8200000-0000-4000-8000-000000000001','discipline-admin@test.invalid','Admin Kedisiplinan','admin','active','{"boarding":true}'),
  ('e8200000-0000-4000-8000-000000000012','e8200000-0000-4000-8000-000000000001','discipline-ustadz@test.invalid','Ustadz Belum Ditugaskan','ustadz','active','{"boarding":true}'),
  ('e8200000-0000-4000-8000-000000000013','e8200000-0000-4000-8000-000000000002','discipline-admin-b@test.invalid','Admin Tenant B','admin','active','{"boarding":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint) VALUES
  ('e8200000-0000-4000-8000-000000000101','e8200000-0000-4000-8000-000000000001','DISC-A-001','Santri A',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex')),
  ('e8200000-0000-4000-8000-000000000102','e8200000-0000-4000-8000-000000000002','DISC-B-001','Santri B',decode(repeat('ac',44),'hex'),decode(repeat('ce',32),'hex'));

INSERT INTO public.students (id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status) VALUES
  ('e8200000-0000-4000-8000-000000000201','e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000101','9820000001','Santri A','L','VII',decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'Active'),
  ('e8200000-0000-4000-8000-000000000202','e8200000-0000-4000-8000-000000000002','e8200000-0000-4000-8000-000000000102','9820000002','Santri B','L','VII',decode(repeat('35',44),'hex'),decode(repeat('57',32),'hex'),'Active');

SELECT ok(NOT has_function_privilege('anon','public.create_boarding_discipline_incident(uuid,uuid,text,text,integer,date,text,text,uuid,text,uuid)','EXECUTE'),
  'anonymous users cannot create discipline entries directly');
SELECT ok(NOT has_function_privilege('authenticated','public.resolve_boarding_discipline_incident(uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'authenticated users cannot resolve incidents directly');
SELECT ok(has_function_privilege('service_role','public.create_boarding_discipline_incident(uuid,uuid,text,text,integer,date,text,text,uuid,text,uuid)','EXECUTE'),
  'trusted backend can create discipline entries');
SELECT ok(NOT has_table_privilege('anon','public.boarding_discipline_incidents','SELECT'),
  'anonymous users cannot query incidents');
SELECT ok(NOT has_table_privilege('authenticated','public.boarding_discipline_events','SELECT'),
  'authenticated users cannot query the discipline audit ledger directly');

SET LOCAL ROLE service_role;
CREATE TEMP TABLE discipline_create AS
SELECT public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000201',
  'Terlambat kembali ke asrama','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000301'
) AS result;
SELECT is((SELECT result->>'success' FROM discipline_create),'true','active tenant Admin can record an incident');
SELECT is((SELECT result->>'alreadyApplied' FROM discipline_create),'false','first incident request is not a replay');
SELECT is((SELECT count(*)::integer FROM public.boarding_discipline_incidents WHERE tenant_id='e8200000-0000-4000-8000-000000000001'),1,'one incident row is created');
SELECT is((SELECT count(*)::integer FROM public.boarding_discipline_events WHERE tenant_id='e8200000-0000-4000-8000-000000000001'),1,'incident creation appends one audit event');

SELECT is(public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000201',
  'Terlambat kembali ke asrama','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000301'
)->>'alreadyApplied','true','an identical retry returns the existing incident');
SELECT is((SELECT count(*)::integer FROM public.boarding_discipline_events WHERE tenant_id='e8200000-0000-4000-8000-000000000001'),1,'identical retry does not duplicate audit events');
SELECT throws_ok($q$SELECT public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000201',
  'Catatan berbeda','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000301')$q$,
  '23505','Kunci permintaan kedisiplinan telah digunakan untuk data berbeda','same idempotency key cannot change the incident payload');
SELECT throws_ok($q$SELECT public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000202',
  'Santri lintas tenant','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000302')$q$,
  'P0002','Santri tidak ditemukan pada tenant ini','a student from another tenant cannot be targeted');
SELECT throws_ok($q$SELECT public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000201',
  'Ustadz belum ditugaskan','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000012','ustadz','e8200000-0000-4000-8000-000000000012')$q$,
  '42501','Santri berada di luar penugasan petugas','an unassigned Ustadz cannot record an incident for a student');
SELECT throws_ok($q$SELECT public.create_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000201',
  'Role mismatch','Ringan',2,'2026-11-03',NULL,NULL,
  'e8200000-0000-4000-8000-000000000011','ustadz','e8200000-0000-4000-8000-000000000303')$q$,
  '42501','Role tidak dapat mencatat kedisiplinan pada tenant ini','expected role must match the active profile');

CREATE TEMP TABLE discipline_created AS SELECT result->>'incidentId' AS incident_id FROM discipline_create;
SELECT is(public.resolve_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001',(SELECT incident_id::uuid FROM discipline_created),
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000311'
)->>'resolved','true','Admin can resolve an incident');
SELECT is(public.resolve_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001',(SELECT incident_id::uuid FROM discipline_created),
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000311'
)->>'alreadyApplied','true','identical resolution retry replays its audit event');
SELECT throws_ok($q$SELECT public.resolve_boarding_discipline_incident(
  'e8200000-0000-4000-8000-000000000001',(SELECT incident_id::uuid FROM discipline_created),
  'e8200000-0000-4000-8000-000000000011','admin','e8200000-0000-4000-8000-000000000312')$q$,
  '23514','Catatan sudah diselesaikan oleh perubahan lain','a resolved incident cannot be resolved again with a new request');
SELECT is((SELECT count(*)::integer FROM public.boarding_discipline_events WHERE tenant_id='e8200000-0000-4000-8000-000000000001'),2,
  'audit ledger contains only creation and one resolution event');
SELECT throws_ok($q$SELECT public.import_legacy_boarding_discipline(
  'e8200000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000012',repeat('a',64),'[]'::jsonb)$q$,
  '42501','Hanya Admin aktif tenant yang dapat mengimpor kedisiplinan lama','Ustadz cannot run a legacy import');

SELECT * FROM finish();
ROLLBACK;
