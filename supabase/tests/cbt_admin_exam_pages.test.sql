-- Validate bounded CBT exam keyset pages, calendar windows, tenant scope, and RPC access.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(19);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e2600000-0000-4000-8000-000000000001','cbt-exam-page-a','CBT Exam Page A','active'),
  ('e2600000-0000-4000-8000-000000000002','cbt-exam-page-b','CBT Exam Page B','active');
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
  ('e2600000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-exam-page-a@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2600000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-exam-page-b@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions) VALUES
  ('e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000001','cbt-exam-page-a@test.invalid','CBT Exam Admin A','admin','active','{"master-data":true,"cbt":true}'),
  ('e2600000-0000-4000-8000-000000000102','e2600000-0000-4000-8000-000000000002','cbt-exam-page-b@test.invalid','CBT Exam Admin B','admin','active','{"master-data":true,"cbt":true}');
INSERT INTO public.tenant_reference_items (
  id,tenant_id,domain,code,name,description,status,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES
  ('e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000001','academic_subject','MATH','Matematika','Mata pelajaran uji CBT tenant A.','active',NULL,'e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000101'),
  ('e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000001','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji CBT tenant A.','active','07','e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000101'),
  ('e2600000-0000-4000-8000-000000000203','e2600000-0000-4000-8000-000000000002','academic_subject','MATH','Matematika','Mata pelajaran uji CBT tenant B.','active',NULL,'e2600000-0000-4000-8000-000000000102','e2600000-0000-4000-8000-000000000102'),
  ('e2600000-0000-4000-8000-000000000204','e2600000-0000-4000-8000-000000000002','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji CBT tenant B.','active','07','e2600000-0000-4000-8000-000000000102','e2600000-0000-4000-8000-000000000102');

INSERT INTO public.cbt_exams(id,tenant_id,title,subject,grade,starts_at,ends_at,duration_minutes,status,client_request_id,subject_reference_id,grade_level_reference_id,created_by,updated_by) VALUES
  ('e2600000-0000-4000-8004-000000000001','e2600000-0000-4000-8000-000000000001','Ujian lebih baru','Matematika','Kelas VII','2027-03-20 08:00+00','2027-03-20 09:00+00',60,'published','e2600000-0000-4000-8005-000000000001','e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000101'),
  ('e2600000-0000-4000-8004-000000000002','e2600000-0000-4000-8000-000000000001','Ujian ID kedua','Matematika','Kelas VII','2027-03-20 08:00+00','2027-03-20 09:00+00',60,'draft','e2600000-0000-4000-8005-000000000002','e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000101'),
  ('e2600000-0000-4000-8004-000000000003','e2600000-0000-4000-8000-000000000001','Ujian bulan berikut','Matematika','Kelas VII','2027-04-01 00:00+00','2027-04-01 01:00+00',60,'published','e2600000-0000-4000-8005-000000000003','e2600000-0000-4000-8000-000000000201','e2600000-0000-4000-8000-000000000202','e2600000-0000-4000-8000-000000000101','e2600000-0000-4000-8000-000000000101'),
  ('e2600000-0000-4000-8004-000000000004','e2600000-0000-4000-8000-000000000002','Ujian tenant lain','Matematika','Kelas VII','2027-03-20 07:00+00','2027-03-20 08:00+00',60,'published','e2600000-0000-4000-8005-000000000004','e2600000-0000-4000-8000-000000000203','e2600000-0000-4000-8000-000000000204','e2600000-0000-4000-8000-000000000102','e2600000-0000-4000-8000-000000000102');

INSERT INTO public.cbt_exams(id,tenant_id,title,subject,grade,starts_at,ends_at,duration_minutes,status,client_request_id,subject_reference_id,grade_level_reference_id,created_by,updated_by)
SELECT
  ('e2600000-0000-4000-8004-' || lpad((generated.sequence_no + 100)::TEXT, 12, '0'))::UUID,
  'e2600000-0000-4000-8000-000000000001',
  'Ujian sintetis ' || generated.sequence_no,
  'Matematika', 'Kelas VII',
  '2027-03-19 08:00+00'::TIMESTAMPTZ + generated.sequence_no * interval '1 minute',
  '2027-03-19 09:00+00'::TIMESTAMPTZ + generated.sequence_no * interval '1 minute',
  60, 'draft',
  ('e2600000-0000-4000-8005-' || lpad((generated.sequence_no + 100)::TEXT, 12, '0'))::UUID,
  'e2600000-0000-4000-8000-000000000201',
  'e2600000-0000-4000-8000-000000000202',
  'e2600000-0000-4000-8000-000000000101',
  'e2600000-0000-4000-8000-000000000101'
FROM generate_series(1, 501) AS generated(sequence_no);

SELECT is((SELECT string_agg(page.id::TEXT, ',' ORDER BY page.starts_at DESC,page.id ASC)
  FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',3,NULL,NULL,NULL,NULL) AS page),
  'e2600000-0000-4000-8004-000000000003,e2600000-0000-4000-8004-000000000001,e2600000-0000-4000-8004-000000000002',
  'first page is tenant-scoped and orders equal starts_at by ID');
SELECT is((SELECT page.id::TEXT
  FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',2,'2027-03-20 08:00+00','e2600000-0000-4000-8004-000000000001',NULL,NULL) AS page
  ORDER BY page.starts_at DESC,page.id ASC LIMIT 1),
  'e2600000-0000-4000-8004-000000000002','cursor advances after a real page boundary across tied timestamps');
SELECT is((SELECT count(*)::TEXT FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',101,NULL,NULL,'2027-03-20 08:00+00','2027-04-01 00:00+00')),
  '2','calendar window includes its start and excludes the next-month boundary');
SELECT is((SELECT count(*)::TEXT FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000002',10,NULL,NULL,NULL,NULL)),
  '1','page contains only rows from requested tenant');
SELECT is((SELECT assigned_count::TEXT || '|' || completed_count::TEXT FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',10,NULL,NULL,NULL,NULL) WHERE id='e2600000-0000-4000-8004-000000000001'),
  '0|0','assignment totals are returned for each selected exam');
SELECT is((SELECT count(*)::TEXT FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',3,NULL,NULL,NULL,NULL)),
  '3','admin exam function returns bounded result set');
SELECT is((
  WITH RECURSIVE pages(page_no,cursor_starts_at,cursor_exam_id,page_ids,page_count) AS (
    SELECT 1, batch.last_starts_at, batch.last_exam_id, batch.page_ids, COALESCE(cardinality(batch.page_ids),0)
    FROM (
      SELECT
        COALESCE(array_agg(page.id ORDER BY page.starts_at DESC,page.id ASC), ARRAY[]::UUID[]) AS page_ids,
        (array_agg(page.starts_at ORDER BY page.starts_at DESC,page.id ASC))[count(*)] AS last_starts_at,
        (array_agg(page.id ORDER BY page.starts_at DESC,page.id ASC))[count(*)] AS last_exam_id
      FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',100,NULL,NULL,NULL,NULL) AS page
    ) AS batch
    UNION ALL
    SELECT pages.page_no + 1, batch.last_starts_at, batch.last_exam_id, batch.page_ids, COALESCE(cardinality(batch.page_ids),0)
    FROM pages
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(array_agg(page.id ORDER BY page.starts_at DESC,page.id ASC), ARRAY[]::UUID[]) AS page_ids,
        (array_agg(page.starts_at ORDER BY page.starts_at DESC,page.id ASC))[count(*)] AS last_starts_at,
        (array_agg(page.id ORDER BY page.starts_at DESC,page.id ASC))[count(*)] AS last_exam_id
      FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',100,pages.cursor_starts_at,pages.cursor_exam_id,NULL,NULL) AS page
    ) AS batch
    WHERE pages.page_count = 100 AND pages.page_no < 10
  ), collected AS (
    SELECT unnest(page_ids) AS exam_id FROM pages
  )
  SELECT count(*)::TEXT || '|' || count(DISTINCT exam_id)::TEXT FROM collected
), '504|504','keyset pages return every tenant exam exactly once above the old 500-row snapshot limit');

SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000099',2,NULL,NULL,NULL,NULL)$$,
  '42501','Tenant CBT tidak tersedia','unknown tenant is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',1,NULL,NULL,NULL,NULL)$$,
  '22023','Parameter halaman ujian CBT tidak valid','undersized page is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',102,NULL,NULL,NULL,NULL)$$,
  '22023','Parameter halaman ujian CBT tidak valid','oversized page is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',10,'2027-03-20 08:00+00',NULL,NULL,NULL)$$,
  '22023','Parameter halaman ujian CBT tidak valid','partial cursor is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',10,NULL,NULL,'2027-04-01 00:00+00','2027-03-01 00:00+00')$$,
  '22023','Parameter halaman ujian CBT tidak valid','reversed calendar range is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',10,NULL,NULL,'2027-01-01 00:00+00','2027-03-01 00:00+00')$$,
  '22023','Parameter halaman ujian CBT tidak valid','calendar range above 33 days is rejected');
SELECT throws_ok($$SELECT * FROM public.list_cbt_admin_exam_page('e2600000-0000-4000-8000-000000000001',10,NULL,NULL,'2027-03-01 00:00+00',NULL)$$,
  '22023','Parameter halaman ujian CBT tidak valid','partial calendar range is rejected');

SELECT ok(NOT has_function_privilege('anon','public.list_cbt_admin_exam_page(uuid,integer,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),'anon cannot execute exam page directly');
SELECT ok(NOT has_function_privilege('authenticated','public.list_cbt_admin_exam_page(uuid,integer,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),'authenticated cannot execute exam page directly');
SELECT ok(has_function_privilege('service_role','public.list_cbt_admin_exam_page(uuid,integer,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),'backend can execute exam page');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_cbt_admin_exam_page(uuid,integer,timestamp with time zone,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure),'exam page uses invoker privileges');
SELECT ok(to_regclass('public.cbt_exams_admin_schedule_page_idx') IS NOT NULL,'tenant keyset schedule index exists');

SELECT * FROM finish();
ROLLBACK;
