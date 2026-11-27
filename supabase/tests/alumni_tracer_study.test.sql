BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(23);

INSERT INTO public.tenants(id,slug,name,status) VALUES
 ('e7500000-0000-4000-8000-000000000001','alumni-tracer-one','Alumni Tracer One','active'),
 ('e7500000-0000-4000-8000-000000000002','alumni-tracer-two','Alumni Tracer Two','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
 ('e7500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-tracer-admin@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7500000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-tracer-admin-two@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7500000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-tracer-staff@test.invalid','',now(),'{}','{}',now(),now()),
 ('e7500000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumni-tracer-other@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
 ('e7500000-0000-4000-8000-000000000011','e7500000-0000-4000-8000-000000000001','alumni-tracer-admin@test.invalid','Admin Alumni','admin','active','{"alumni":true}'),
 ('e7500000-0000-4000-8000-000000000012','e7500000-0000-4000-8000-000000000001','alumni-tracer-admin-two@test.invalid','Admin Alumni Dua','admin','active','{"alumni":true}'),
 ('e7500000-0000-4000-8000-000000000013','e7500000-0000-4000-8000-000000000001','alumni-tracer-staff@test.invalid','Staf Alumni','ustadz','active','{"alumni":true}'),
 ('e7500000-0000-4000-8000-000000000014','e7500000-0000-4000-8000-000000000002','alumni-tracer-other@test.invalid','Admin Tenant Lain','admin','active','{"alumni":true}');

INSERT INTO public.tenant_reference_items (
 id,tenant_id,domain,code,name,description,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES
 ('e7500000-0000-4000-8000-000000000101','e7500000-0000-4000-8000-000000000001','academic_grade_level','TRACER-GRADE-XII','XII','Jenjang kelas untuk skenario Alumni tenant satu.','12','e7500000-0000-4000-8000-000000000011','e7500000-0000-4000-8000-000000000011'),
 ('e7500000-0000-4000-8000-000000000102','e7500000-0000-4000-8000-000000000002','academic_grade_level','TRACER-GRADE-XII','XII','Jenjang kelas untuk skenario Alumni tenant dua.','12','e7500000-0000-4000-8000-000000000014','e7500000-0000-4000-8000-000000000014');

INSERT INTO public.master_data_records(tenant_id,category,id,name,status,grade) VALUES
 ('e7500000-0000-4000-8000-000000000001','Kelas','TRACER-CLASS-ONE','Kelas Uji Alumni','Active','XII'),
 ('e7500000-0000-4000-8000-000000000002','Kelas','TRACER-CLASS-TWO','Kelas Uji Alumni','Active','XII');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint,grade)
VALUES
 ('e7500000-0000-4000-8000-000000000201','e7500000-0000-4000-8000-000000000001','TRACER-CAND-ONE','Alumni Uji Satu',decode(repeat('a1',44),'hex'),decode(repeat('b1',32),'hex'),'XII'),
 ('e7500000-0000-4000-8000-000000000202','e7500000-0000-4000-8000-000000000002','TRACER-CAND-TWO','Alumni Uji Dua',decode(repeat('c1',44),'hex'),decode(repeat('d1',32),'hex'),'XII');
INSERT INTO public.students(id,tenant_id,source_candidate_id,nis,name,gender,grade,class_id,nik_ciphertext,nik_fingerprint,status)
VALUES
 ('e7500000-0000-4000-8000-000000000301','e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000201','9575000001','Alumni Uji Satu','L','XII','TRACER-CLASS-ONE',decode(repeat('e1',44),'hex'),decode(repeat('f1',32),'hex'),'active'),
 ('e7500000-0000-4000-8000-000000000302','e7500000-0000-4000-8000-000000000002','e7500000-0000-4000-8000-000000000202','9575000002','Alumni Uji Dua','P','XII','TRACER-CLASS-TWO',decode(repeat('11',44),'hex'),decode(repeat('22',32),'hex'),'active');
INSERT INTO public.alumni_profiles(tenant_id,id,student_id,graduation_year,graduated_at,created_by_user_id)
VALUES
 ('e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000401','e7500000-0000-4000-8000-000000000301',2025,'2025-06-30','e7500000-0000-4000-8000-000000000011'),
 ('e7500000-0000-4000-8000-000000000002','e7500000-0000-4000-8000-000000000402','e7500000-0000-4000-8000-000000000302',2025,'2025-06-30','e7500000-0000-4000-8000-000000000014');

SET LOCAL ROLE service_role;
SELECT is(public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000501','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'working_and_studying','bachelor','education',true)->>'alreadyApplied','false','Admin records a consent-confirmed response');
SELECT is((SELECT count(*)::integer FROM public.alumni_tracer_responses WHERE tenant_id='e7500000-0000-4000-8000-000000000001'),1,'one response is stored for the tenant');
SELECT is((SELECT activity_status FROM public.alumni_tracer_responses WHERE tenant_id='e7500000-0000-4000-8000-000000000001'),'working_and_studying','response categories are persisted');
SELECT is(public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000501','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'working_and_studying','bachelor','education',true)->>'alreadyApplied','true','identical retries are idempotent');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000501','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)$$,'23505',NULL,'a request id cannot be replayed with changed answers');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000012','admin',
 'e7500000-0000-4000-8000-000000000501','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'working_and_studying','bachelor','education',true)$$,'23505',NULL,'another actor cannot replay a request id');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000002','e7500000-0000-4000-8000-000000000014','admin',
 'e7500000-0000-4000-8000-000000000502','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)$$,'P0002',NULL,'a profile from another tenant cannot be referenced');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000013','admin',
 'e7500000-0000-4000-8000-000000000503','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)$$,'42501',NULL,'staff cannot write tracer responses');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','super_admin',
 'e7500000-0000-4000-8000-000000000504','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)$$,'42501',NULL,'the caller cannot assert a different role');
UPDATE public.profiles SET module_permissions='{"alumni":false}'::jsonb
WHERE tenant_id='e7500000-0000-4000-8000-000000000001' AND user_id='e7500000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000505','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)$$,'42501',NULL,'explicitly revoked module access is enforced');
UPDATE public.profiles SET module_permissions='{"alumni":true}'::jsonb
WHERE tenant_id='e7500000-0000-4000-8000-000000000001' AND user_id='e7500000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000506','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',false)$$,'22023',NULL,'unconfirmed consent is rejected');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000507','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'free text','not_applicable','business',true)$$,'22023',NULL,'activity is limited to the fixed category list');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000508','e7500000-0000-4000-8000-000000000401',1900::smallint,
 'employed','not_applicable','business',true)$$,'22023',NULL,'survey year must be within the supported range');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000509','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'studying','not_applicable','not_applicable',true)$$,'22023',NULL,'studying requires an education category');
SELECT throws_ok($$SELECT public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000510','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','not_applicable',true)$$,'22023',NULL,'working status requires an employment sector');
SELECT is(public.upsert_alumni_tracer_response(
 'e7500000-0000-4000-8000-000000000001','e7500000-0000-4000-8000-000000000011','admin',
 'e7500000-0000-4000-8000-000000000511','e7500000-0000-4000-8000-000000000401',2026::smallint,
 'employed','not_applicable','business',true)->>'created','false','a new request updates the same alumni and survey year');
SELECT is((SELECT count(*)::integer FROM public.alumni_tracer_responses WHERE tenant_id='e7500000-0000-4000-8000-000000000001'),1,'the natural key prevents duplicate survey responses');
SELECT is((SELECT activity_status FROM public.alumni_tracer_responses WHERE tenant_id='e7500000-0000-4000-8000-000000000001'),'employed','the latest consented answer is visible after update');
SELECT is((SELECT length(payload_fingerprint)::integer FROM public.alumni_tracer_mutation_requests WHERE tenant_id='e7500000-0000-4000-8000-000000000001' AND client_request_id='e7500000-0000-4000-8000-000000000511'),64,'idempotency receipts keep only a fixed-size payload fingerprint');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alumni_tracer_mutation_requests' AND column_name IN ('alumni_profile_id','survey_year','activity_status','education_level','employment_sector')),
  'idempotency receipts do not duplicate survey answers or alumni identifiers');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.alumni_tracer_responses'::regclass)
  AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.alumni_tracer_mutation_requests'::regclass),
  'response and idempotency tables enforce row-level security');
SELECT ok(NOT has_table_privilege('anon','public.alumni_tracer_responses','SELECT')
  AND NOT has_table_privilege('authenticated','public.alumni_tracer_responses','SELECT')
  AND has_table_privilege('service_role','public.alumni_tracer_responses','SELECT')
  AND has_table_privilege('service_role','public.alumni_tracer_responses','INSERT')
  AND has_table_privilege('service_role','public.alumni_tracer_responses','UPDATE')
  AND NOT has_table_privilege('service_role','public.alumni_tracer_responses','DELETE'),
  'only the trusted server role can read and change response rows');
SELECT ok(NOT has_function_privilege('anon','public.upsert_alumni_tracer_response(uuid,uuid,text,uuid,uuid,smallint,text,text,text,boolean)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.upsert_alumni_tracer_response(uuid,uuid,text,uuid,uuid,smallint,text,text,text,boolean)','EXECUTE')
  AND has_function_privilege('service_role','public.upsert_alumni_tracer_response(uuid,uuid,text,uuid,uuid,smallint,text,text,text,boolean)','EXECUTE'),
  'only the trusted server role can call the write procedure');
SELECT * FROM finish();
ROLLBACK;
