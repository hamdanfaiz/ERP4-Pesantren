-- Verify exact tenant-scoped CBT dashboard aggregates and server-only execution.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(24);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e1900000-0000-4000-8000-000000000009','cbt-summary-one','CBT Summary One','active'),
  ('e1900000-0000-4000-8000-000000000019','cbt-summary-two','CBT Summary Two','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e1900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-summary-one@test.invalid','',now(),'{}','{}',now(),now()),
  ('e1900000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-summary-two@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000009','cbt-summary-one@test.invalid','CBT Summary Admin One','admin','active','{"cbt":true}'),
  ('e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000019','cbt-summary-two@test.invalid','CBT Summary Admin Two','admin','active','{"cbt":true}');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint,grade)
VALUES
  ('e1900000-0000-4000-8000-000000000101','e1900000-0000-4000-8000-000000000009','CBS001','CBT Summary Student One',decode(repeat('a1',44),'hex'),decode(repeat('b1',32),'hex'),'VII'),
  ('e1900000-0000-4000-8000-000000000102','e1900000-0000-4000-8000-000000000009','CBS002','CBT Summary Student Two',decode(repeat('a2',44),'hex'),decode(repeat('b2',32),'hex'),'VII'),
  ('e1900000-0000-4000-8000-000000000103','e1900000-0000-4000-8000-000000000019','CBS003','CBT Summary Other Tenant',decode(repeat('a3',44),'hex'),decode(repeat('b3',32),'hex'),'VII');
INSERT INTO public.students(id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status)
VALUES
  ('e1900000-0000-4000-8000-000000000201','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000101','1900000001','CBT Summary Student One','L','VII',decode(repeat('c1',44),'hex'),decode(repeat('d1',32),'hex'),'active'),
  ('e1900000-0000-4000-8000-000000000202','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000102','1900000002','CBT Summary Student Two','P','VII',decode(repeat('c2',44),'hex'),decode(repeat('d2',32),'hex'),'active'),
  ('e1900000-0000-4000-8000-000000000203','e1900000-0000-4000-8000-000000000019','e1900000-0000-4000-8000-000000000103','1900000003','CBT Summary Other Tenant','L','VII',decode(repeat('c3',44),'hex'),decode(repeat('d3',32),'hex'),'active');
INSERT INTO public.cbt_exams(id,tenant_id,title,subject,grade,starts_at,ends_at,duration_minutes,status,client_request_id,created_by,updated_by)
VALUES
  ('e1900000-0000-4000-8000-000000000401','e1900000-0000-4000-8000-000000000009','Ujian Berlangsung','Matematika','VII',now() - interval '1 hour',now() + interval '1 hour',60,'published','e1900000-0000-4000-8000-000000000411','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-000000000402','e1900000-0000-4000-8000-000000000009','Ujian Mendatang','Matematika','VII',now() + interval '1 day',now() + interval '1 day 2 hours',60,'published','e1900000-0000-4000-8000-000000000412','e1900000-0000-4000-8000-000000000011','e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-000000000403','e1900000-0000-4000-8000-000000000019','Ujian Tenant Lain','Matematika','VII',now() - interval '1 hour',now() + interval '1 hour',60,'published','e1900000-0000-4000-8000-000000000413','e1900000-0000-4000-8000-000000000012','e1900000-0000-4000-8000-000000000012');
INSERT INTO public.cbt_exam_assignments(id,tenant_id,exam_id,student_id,status,assigned_by,assigned_at)
VALUES
  ('e1900000-0000-4000-8000-000000000501','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000401','e1900000-0000-4000-8000-000000000201','completed','e1900000-0000-4000-8000-000000000011',now() - interval '2 hours'),
  ('e1900000-0000-4000-8000-000000000502','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000401','e1900000-0000-4000-8000-000000000202','in_progress','e1900000-0000-4000-8000-000000000011',now() - interval '90 minutes'),
  ('e1900000-0000-4000-8000-000000000503','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000402','e1900000-0000-4000-8000-000000000201','completed','e1900000-0000-4000-8000-000000000011',now() - interval '1 hour'),
  ('e1900000-0000-4000-8000-000000000504','e1900000-0000-4000-8000-000000000019','e1900000-0000-4000-8000-000000000403','e1900000-0000-4000-8000-000000000203','assigned','e1900000-0000-4000-8000-000000000012',now() - interval '30 minutes');
INSERT INTO public.cbt_attempts(
  id,tenant_id,assignment_id,exam_id,student_id,question_order,answers,started_at,expires_at,submitted_at,correct_count,wrong_count,blank_count,score,passed
) VALUES
  ('e1900000-0000-4000-8000-000000000601','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000501','e1900000-0000-4000-8000-000000000201',ARRAY['e1900000-0000-4000-8000-000000000701'::UUID],'{}',now() - interval '45 minutes',now() + interval '15 minutes',now() - interval '30 minutes',9,1,0,90,true),
  ('e1900000-0000-4000-8000-000000000602','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000502','e1900000-0000-4000-8000-000000000202',ARRAY['e1900000-0000-4000-8000-000000000702'::UUID],'{}',now() - interval '40 minutes',now() + interval '20 minutes',NULL,NULL,NULL,NULL,NULL,NULL),
  ('e1900000-0000-4000-8000-000000000603','e1900000-0000-4000-8000-000000000009','e1900000-0000-4000-8000-000000000503','e1900000-0000-4000-8000-000000000201',ARRAY['e1900000-0000-4000-8000-000000000703'::UUID],'{}',now() - interval '35 minutes',now() + interval '25 minutes',now() - interval '15 minutes',7,3,0,70,false);

CREATE TEMP TABLE cbt_dashboard_summary_results (
  tenant_key TEXT PRIMARY KEY,
  summary JSONB NOT NULL
);
GRANT INSERT, SELECT ON cbt_dashboard_summary_results TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO cbt_dashboard_summary_results(tenant_key,summary)
VALUES
  ('one',public.get_cbt_admin_dashboard_summary('e1900000-0000-4000-8000-000000000009')),
  ('two',public.get_cbt_admin_dashboard_summary('e1900000-0000-4000-8000-000000000019'));

SELECT is((SELECT summary->>'activeQuestions' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'0','question count is tenant-scoped');
SELECT is((SELECT summary->>'totalExams' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'2','exam count is tenant-scoped');
SELECT is((SELECT summary->>'ongoingSessions' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'1','ongoing count uses published tenant exams');
SELECT is((SELECT summary->>'upcomingSessions' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'1','upcoming count uses published tenant exams');
SELECT is((SELECT summary->>'totalAssignments' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'3','assignment total is exact');
SELECT is((SELECT summary->>'completedAssignments' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'2','completed assignment total is exact');
SELECT is((SELECT summary->>'completionRate' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'66.7','completion rate is rounded to one decimal');
SELECT is((SELECT summary->>'scoredAssignments' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'2','scored attempt total is exact');
SELECT is((SELECT summary->>'averageScore' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'80.0','average score is rounded to one decimal');
SELECT is((SELECT summary->>'passRate' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'50.0','pass rate excludes ungraded attempts');
SELECT is(jsonb_array_length((SELECT summary->'upcomingExams' FROM cbt_dashboard_summary_results WHERE tenant_key='one')),1,'upcoming preview is bounded and tenant-scoped');
SELECT is((SELECT summary->'upcomingExams'->0->>'id' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'e1900000-0000-4000-8000-000000000402','upcoming preview has the next exam');
SELECT is(jsonb_array_length((SELECT summary->'latestResults' FROM cbt_dashboard_summary_results WHERE tenant_key='one')),2,'latest results include only submitted attempts');
SELECT is((SELECT summary->'latestResults'->0->>'assignmentId' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'e1900000-0000-4000-8000-000000000503','latest results are ordered by submission time');
SELECT is((SELECT summary->'latestResults'->0->>'studentName' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'CBT Summary Student One','latest result includes the related student');
SELECT is((SELECT summary->'assignmentStatusCounts'->>'in_progress' FROM cbt_dashboard_summary_results WHERE tenant_key='one'),'1','status breakdown counts in-progress assignments');
SELECT is((SELECT summary->>'totalAssignments' FROM cbt_dashboard_summary_results WHERE tenant_key='two'),'1','other tenant gets its own assignment total');
SELECT is((SELECT summary->>'ongoingSessions' FROM cbt_dashboard_summary_results WHERE tenant_key='two'),'1','other tenant has independent schedule totals');
SELECT throws_ok($$SELECT public.get_cbt_admin_dashboard_summary('e1900000-0000-4000-8000-000000000099')$$,'42501','Tenant CBT tidak tersedia','unknown tenant is rejected');

SELECT ok(NOT has_function_privilege('anon','public.get_cbt_admin_dashboard_summary(uuid)','EXECUTE'),'anon cannot execute the dashboard function');
SELECT ok(NOT has_function_privilege('authenticated','public.get_cbt_admin_dashboard_summary(uuid)','EXECUTE'),'authenticated cannot execute the dashboard function directly');
SELECT ok(has_function_privilege('service_role','public.get_cbt_admin_dashboard_summary(uuid)','EXECUTE'),'backend service role can execute the dashboard function');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_cbt_admin_dashboard_summary(uuid)'::regprocedure),'function executes with caller privileges');
SELECT ok(to_regclass('public.cbt_assignments_tenant_exam_status_summary_idx') IS NOT NULL AND to_regclass('public.cbt_attempts_tenant_submitted_summary_idx') IS NOT NULL,'summary supporting indexes are present');

SELECT * FROM finish();
ROLLBACK;
