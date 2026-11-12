-- Semester report card authorization, freeze, and homeroom scope.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(38);

INSERT INTO public.tenants(id, slug, name, status)
VALUES
  ('e2900000-0000-4000-8000-000000000001','academic-report-test','Academic Report Test','active'),
  ('e2900000-0000-4000-8000-000000000002','academic-report-other','Academic Report Other','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-report-admin@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2900000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-report-homeroom@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2900000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-report-other-teacher@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2900000-0000-4000-8000-000000000014','00000000-0000-0000-0000-000000000000','authenticated','authenticated','academic-report-admin-b@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000001','academic-report-admin@test.invalid','Admin Rapor','admin','active','{"academic":true}'),
  ('e2900000-0000-4000-8000-000000000012','e2900000-0000-4000-8000-000000000001','academic-report-homeroom@test.invalid','Wali Kelas','ustadz','active','{"academic":true}'),
  ('e2900000-0000-4000-8000-000000000013','e2900000-0000-4000-8000-000000000001','academic-report-other-teacher@test.invalid','Pengajar Lain','ustadz','active','{"academic":true}'),
  ('e2900000-0000-4000-8000-000000000014','e2900000-0000-4000-8000-000000000002','academic-report-admin-b@test.invalid','Admin Tenant Lain','admin','active','{"academic":true}');
\ir test_support/seed_tenant_reference_catalogs.psql
INSERT INTO public.organization_units(id,tenant_id,code,name,unit_type,status,created_by_user_id,updated_by_user_id)
VALUES ('e2900000-0000-4000-8000-000000000101','e2900000-0000-4000-8000-000000000001','RAPOR','Unit Rapor','sekolah','active','e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000011');
INSERT INTO public.master_data_records(tenant_id,category,id,name,status,grade)
VALUES ('e2900000-0000-4000-8000-000000000001','Kelas','RAPOR-A','VII A','Active','VII');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint,organization_unit_id,grade)
VALUES ('e2900000-0000-4000-8000-000000000201','e2900000-0000-4000-8000-000000000001','RAPOR-CAND-A','Santri Rapor',decode(repeat('a1',44),'hex'),decode(repeat('b1',32),'hex'),'e2900000-0000-4000-8000-000000000101','VII');
INSERT INTO public.students(id,tenant_id,source_candidate_id,nis,name,gender,grade,class_id,nik_ciphertext,nik_fingerprint,status,organization_unit_id)
VALUES ('e2900000-0000-4000-8000-000000000301','e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000201','9390000001','Santri Rapor','L','VII','RAPOR-A',decode(repeat('c1',44),'hex'),decode(repeat('d1',32),'hex'),'active','e2900000-0000-4000-8000-000000000101');
INSERT INTO public.academic_records(id,tenant_id,kind,teacher_user_id,student_id,record_data,created_by,updated_by,created_at)
VALUES
  ('e2900000-0000-4000-8000-000000000401','e2900000-0000-4000-8000-000000000001','assessment','e2900000-0000-4000-8000-000000000012','e2900000-0000-4000-8000-000000000301',
    pg_temp.test_academic_references('e2900000-0000-4000-8000-000000000001','{"studentId":"e2900000-0000-4000-8000-000000000301","studentName":"Santri Rapor","className":"VII A","teacherUserId":"e2900000-0000-4000-8000-000000000012","teacherName":"Wali Kelas","subject":"Fiqih","assessmentType":"Kuis","category":"Summative","score":70}'::jsonb),
    'e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000011','2026-08-15 03:00:00+00'),
  ('e2900000-0000-4000-8000-000000000402','e2900000-0000-4000-8000-000000000001','assessment','e2900000-0000-4000-8000-000000000012','e2900000-0000-4000-8000-000000000301',
    pg_temp.test_academic_references('e2900000-0000-4000-8000-000000000001','{"studentId":"e2900000-0000-4000-8000-000000000301","studentName":"Santri Rapor","className":"VII A","teacherUserId":"e2900000-0000-4000-8000-000000000012","teacherName":"Wali Kelas","subject":"Fiqih","assessmentType":"Kuis","category":"Formative","score":10}'::jsonb),
    'e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000011','2026-01-15 03:00:00+00');

SELECT ok(NOT has_function_privilege('anon','public.apply_academic_report_action(uuid,uuid,text,text,jsonb,uuid)','EXECUTE'),'anonymous callers cannot change a report card');
SELECT ok(NOT has_function_privilege('authenticated','public.apply_academic_report_action(uuid,uuid,text,text,jsonb,uuid)','EXECUTE'),'browser users cannot change a report card directly');
SELECT ok(has_function_privilege('service_role','public.apply_academic_report_action(uuid,uuid,text,text,jsonb,uuid)','EXECUTE'),'trusted server can change a report card');
SELECT ok(NOT has_function_privilege('anon','public.get_academic_report_workspace(uuid,uuid,text)','EXECUTE'),'anonymous callers cannot read the report workspace');
SELECT ok(NOT has_function_privilege('authenticated','public.get_academic_report_workspace(uuid,uuid,text)','EXECUTE'),'browser users cannot read the report workspace directly');
SELECT ok(has_function_privilege('service_role','public.get_academic_report_workspace(uuid,uuid,text)','EXECUTE'),'trusted server can read the report workspace');
SELECT ok(NOT has_function_privilege('anon','public.get_published_academic_report_cards(uuid,uuid)','EXECUTE'),'anonymous callers cannot read published report cards');
SELECT ok(NOT has_function_privilege('authenticated','public.get_published_academic_report_cards(uuid,uuid)','EXECUTE'),'browser users cannot read published report cards directly');
SELECT ok(NOT has_table_privilege('anon','public.academic_report_cards','SELECT'),'anonymous callers cannot read report card rows');
SELECT ok(NOT has_table_privilege('authenticated','public.academic_report_cards','SELECT'),'browser users cannot read report card rows');
SELECT ok(NOT has_table_privilege('service_role','public.academic_report_cards','DELETE'),'published history cannot be deleted by the server role');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.academic_report_cards'::regclass),'report cards have forced row level security');

SET LOCAL ROLE service_role;
SELECT is(public.academic_kktp_threshold('e2900000-0000-4000-8000-000000000001'),75::numeric,'a tenant without a saved threshold uses 75');
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','save_term','{"name":"Gasal","startsOn":"2026-07-01","endsOn":"2026-12-20"}'::jsonb,'e2900000-0000-4000-8000-000000000501')$$,'22023','Permintaan rapor akademik tidak valid','a homeroom teacher cannot open a term');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','save_term','{"name":"Gasal","startsOn":"2026-07-01","endsOn":"2026-12-20"}'::jsonb,'e2900000-0000-4000-8000-000000000502')->>'success'),'true','admin can open one semester');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','save_threshold','{"threshold":80}'::jsonb,'e2900000-0000-4000-8000-000000000503')->>'threshold'),'80.00','admin can set the KKTP threshold');
SELECT is(public.academic_kktp_threshold('e2900000-0000-4000-8000-000000000001'),80::numeric,'later assessment flags read the saved threshold');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','assign_homeroom','{"classId":"RAPOR-A","teacherUserId":"e2900000-0000-4000-8000-000000000012"}'::jsonb,'e2900000-0000-4000-8000-000000000504')->>'success'),'true','admin can assign one homeroom teacher to a class');
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000013','ustadz','save_comment','{"studentId":"e2900000-0000-4000-8000-000000000301","comment":"Bukan wali kelas."}'::jsonb,'e2900000-0000-4000-8000-000000000505')$$,'42501','Ustadz hanya dapat mengerjakan rapor kelas walinya','a teacher who is not the homeroom cannot comment');
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','validate_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000506')$$,'23514','Rapor draf dengan catatan wali kelas diperlukan sebelum validasi','validation requires a homeroom comment');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','save_comment','{"studentId":"e2900000-0000-4000-8000-000000000301","comment":"Santri perlu mengulang Fiqih."}'::jsonb,'e2900000-0000-4000-8000-000000000507')->>'status'),'draft','homeroom teacher can save a comment');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','validate_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000508')->>'status'),'validated','homeroom teacher can validate the current scores');
INSERT INTO public.academic_records(id,tenant_id,kind,teacher_user_id,student_id,record_data,created_by,updated_by,created_at)
VALUES ('e2900000-0000-4000-8000-000000000403','e2900000-0000-4000-8000-000000000001','assessment','e2900000-0000-4000-8000-000000000012','e2900000-0000-4000-8000-000000000301',
  pg_temp.test_academic_references('e2900000-0000-4000-8000-000000000001','{"studentId":"e2900000-0000-4000-8000-000000000301","studentName":"Santri Rapor","className":"VII A","teacherUserId":"e2900000-0000-4000-8000-000000000012","teacherName":"Wali Kelas","subject":"Fiqih","assessmentType":"Kuis","category":"Summative","score":90}'::jsonb),
  'e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000011','2026-09-01 03:00:00+00');
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','publish_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000509')$$,'23514','Nilai atau ambang KKTP berubah. Wali kelas perlu validasi ulang','publication stops when a score changes after validation');
SELECT is((SELECT status FROM public.academic_report_cards WHERE tenant_id='e2900000-0000-4000-8000-000000000001' AND student_id='e2900000-0000-4000-8000-000000000301'),'validated','a rejected publication leaves the validated card in place');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','reopen_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000510')->>'status'),'draft','homeroom teacher can return a validated card to draft');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','validate_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000511')->>'status'),'validated','homeroom teacher validates the updated scores');
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000012','ustadz','publish_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000512')$$,'22023','Permintaan rapor akademik tidak valid','a homeroom teacher cannot publish');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','publish_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000513')->>'status'),'published','admin publication freezes the card');
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','publish_card','{"studentId":"e2900000-0000-4000-8000-000000000301"}'::jsonb,'e2900000-0000-4000-8000-000000000513')->>'alreadyApplied'),'true','the same publication request can be retried');
SELECT is((SELECT jsonb_array_length(lines) FROM public.academic_report_cards WHERE student_id='e2900000-0000-4000-8000-000000000301'),2,'the frozen card keeps only scores inside the term');
SELECT is((SELECT lines->0->>'remedialStatus' FROM public.academic_report_cards WHERE student_id='e2900000-0000-4000-8000-000000000301'),'Needed','a score below the saved threshold is marked for follow-up');
INSERT INTO public.academic_records(id,tenant_id,kind,teacher_user_id,student_id,record_data,created_by,updated_by,created_at)
VALUES ('e2900000-0000-4000-8000-000000000404','e2900000-0000-4000-8000-000000000001','assessment','e2900000-0000-4000-8000-000000000012','e2900000-0000-4000-8000-000000000301',
  pg_temp.test_academic_references('e2900000-0000-4000-8000-000000000001','{"studentId":"e2900000-0000-4000-8000-000000000301","studentName":"Santri Rapor","className":"VII A","teacherUserId":"e2900000-0000-4000-8000-000000000012","teacherName":"Wali Kelas","subject":"Hadis","assessmentType":"Kuis","category":"Summative","score":40}'::jsonb),
  'e2900000-0000-4000-8000-000000000011','e2900000-0000-4000-8000-000000000011','2026-10-01 03:00:00+00');
SELECT is((SELECT jsonb_array_length(lines) FROM public.academic_report_cards WHERE student_id='e2900000-0000-4000-8000-000000000301'),2,'a score added after publication does not rewrite the card');
UPDATE public.profiles SET module_permissions='{}'::jsonb
WHERE tenant_id='e2900000-0000-4000-8000-000000000001' AND user_id='e2900000-0000-4000-8000-000000000011';
SELECT is((public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','save_threshold','{"threshold":60}'::jsonb,'e2900000-0000-4000-8000-000000000514')->>'threshold'),'60.00','admin role baseline can change the threshold when the module key is absent');
SELECT is((SELECT lines->0->>'remedialStatus' FROM public.academic_report_cards WHERE student_id='e2900000-0000-4000-8000-000000000301'),'Needed','a published card keeps the threshold it was issued with');
UPDATE public.profiles SET module_permissions='{"academic":false}'::jsonb
WHERE tenant_id='e2900000-0000-4000-8000-000000000001' AND user_id='e2900000-0000-4000-8000-000000000011';
SELECT throws_ok($$SELECT public.apply_academic_report_action('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000011','admin','save_threshold','{"threshold":70}'::jsonb,'e2900000-0000-4000-8000-000000000515')$$,'42501','Profil tidak memiliki akses Akademik pada tenant ini','an explicit false academic permission cannot change the threshold');
SELECT is(jsonb_array_length(public.get_published_academic_report_cards('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000301')),1,'the portal read returns the published card for that student');
SELECT ok((public.get_academic_report_workspace('e2900000-0000-4000-8000-000000000002','e2900000-0000-4000-8000-000000000014','admin')->>'term') IS NULL,'another tenant does not see this semester');
SELECT is(jsonb_array_length(public.get_academic_report_workspace('e2900000-0000-4000-8000-000000000001','e2900000-0000-4000-8000-000000000013','ustadz')->'students'),0,'a teacher without a homeroom assignment sees no students');

SELECT * FROM finish();
ROLLBACK;
