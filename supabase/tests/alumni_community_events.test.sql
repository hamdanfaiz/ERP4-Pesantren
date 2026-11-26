BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(16);

INSERT INTO public.tenants(id,slug,name,status) VALUES
 ('e7400000-0000-4000-8000-000000000001','alumni-event-one','Alumni Event One','active'),
 ('e7400000-0000-4000-8000-000000000002','alumni-event-two','Alumni Event Two','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
 ('e7400000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-event-admin-one@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7400000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-event-admin-two@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7400000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-event-staff@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7400000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-event-other-tenant@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
 ('e7400000-0000-4000-8000-000000000011','e7400000-0000-4000-8000-000000000001','alumni-event-admin-one@test.invalid','Alumni Admin One','admin','active','{"alumni":true}'),
 ('e7400000-0000-4000-8000-000000000012','e7400000-0000-4000-8000-000000000001','alumni-event-admin-two@test.invalid','Alumni Admin Two','admin','active','{"alumni":true}'),
 ('e7400000-0000-4000-8000-000000000013','e7400000-0000-4000-8000-000000000001','alumni-event-staff@test.invalid','Alumni Staff','ustadz','active','{"alumni":true}'),
 ('e7400000-0000-4000-8000-000000000014','e7400000-0000-4000-8000-000000000002','alumni-event-other-tenant@test.invalid','Other Tenant Admin','admin','active','{"alumni":true}');

SET LOCAL ROLE service_role;
SELECT is(
 public.create_alumni_community_event(
  'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','admin',
  'e7400000-0000-4000-8000-000000000101','Reuni Alumni','reunion','2027-06-01 10:00:00+07','Aula Pesantren','Pertemuan lintas angkatan'
 )->>'alreadyApplied','false','Admin creates a tenant event once'
);
SELECT is(
 public.create_alumni_community_event(
  'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','admin',
  'e7400000-0000-4000-8000-000000000101','Reuni Alumni','reunion','2027-06-01 10:00:00+07','Aula Pesantren','Pertemuan lintas angkatan'
 )->>'alreadyApplied','true','identical retries are idempotent'
);
SELECT is(
 public.create_alumni_community_event(
  'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','admin',
  'e7400000-0000-4000-8000-000000000101','Reuni Alumni','reunion','2027-06-01 10:00:00+07','Aula Pesantren','Pertemuan lintas angkatan'
 )->>'eventId',
 (SELECT id::text FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
 'retry returns the originally created event'
);
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','admin',
 'e7400000-0000-4000-8000-000000000101','Changed title','reunion','2027-06-01 10:00:00+07','Aula Pesantren','Pertemuan lintas angkatan')$$,
 '23505',NULL,'reused request id with changed content is rejected');
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000012','admin',
 'e7400000-0000-4000-8000-000000000101','Reuni Alumni','reunion','2027-06-01 10:00:00+07','Aula Pesantren','Pertemuan lintas angkatan')$$,
 '23505',NULL,'another actor cannot replay the request id');
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000002','e7400000-0000-4000-8000-000000000011','admin',
 'e7400000-0000-4000-8000-000000000102','Cross tenant','reunion','2027-06-01 10:00:00+07','Aula Pesantren','')$$,
 '42501',NULL,'actor cannot write into another tenant');
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000013','admin',
 'e7400000-0000-4000-8000-000000000103','Staff event','webinar','2027-06-01 10:00:00+07','Online','')$$,
 '42501',NULL,'non-admin actor cannot create an event');
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','super_admin',
 'e7400000-0000-4000-8000-000000000104','Wrong role','webinar','2027-06-01 10:00:00+07','Online','')$$,
 '42501',NULL,'caller cannot assert a role different from the profile');
SELECT throws_ok($$SELECT public.create_alumni_community_event(
 'e7400000-0000-4000-8000-000000000001','e7400000-0000-4000-8000-000000000011','admin',
 'e7400000-0000-4000-8000-000000000105','Invalid type','free-text','2027-06-01 10:00:00+07','Online','')$$,
 '22023',NULL,'event type is selected from the fixed catalog');

SELECT throws_ok($SELECT public.set_alumni_community_event_status(
 'e7400000-0000-4000-8000-000000000001',
 (SELECT id FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
 'e7400000-0000-4000-8000-000000000011','admin','completed')$,
 '23514',NULL,'future events cannot be completed early');
SELECT is(
 public.set_alumni_community_event_status(
  'e7400000-0000-4000-8000-000000000001',
  (SELECT id FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
  'e7400000-0000-4000-8000-000000000011','admin','cancelled'
 )->>'alreadyApplied','false','Admin cancels the scheduled event'
);
SELECT is(
 public.set_alumni_community_event_status(
  'e7400000-0000-4000-8000-000000000001',
  (SELECT id FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
  'e7400000-0000-4000-8000-000000000011','admin','cancelled'
 )->>'alreadyApplied','true','status retry is idempotent'
);
SELECT throws_ok($$SELECT public.set_alumni_community_event_status(
 'e7400000-0000-4000-8000-000000000001',
 (SELECT id FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
 'e7400000-0000-4000-8000-000000000011','admin','completed')$$,
 '23514',NULL,'closed events cannot be transitioned to another terminal status');
SELECT throws_ok($$SELECT public.set_alumni_community_event_status(
 'e7400000-0000-4000-8000-000000000002',
 (SELECT id FROM public.alumni_community_events WHERE tenant_id='e7400000-0000-4000-8000-000000000001'),
 'e7400000-0000-4000-8000-000000000014','admin','cancelled')$$,
 'P0002',NULL,'event ids from another tenant are not visible to status changes');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.alumni_community_events'::regclass),
 'table enforces row-level security');
SELECT ok(NOT has_table_privilege('anon','public.alumni_community_events','SELECT')
  AND NOT has_table_privilege('authenticated','public.alumni_community_events','SELECT')
  AND has_table_privilege('service_role','public.alumni_community_events','SELECT')
  AND has_table_privilege('service_role','public.alumni_community_events','INSERT')
  AND has_table_privilege('service_role','public.alumni_community_events','UPDATE')
  AND NOT has_table_privilege('service_role','public.alumni_community_events','DELETE'),
 'the server role can read and manage rows without delete access');

SELECT * FROM finish();
ROLLBACK;
