-- Validate keyset activity pages and aggregates beyond the former 5,000-row snapshot ceiling.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(34);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e2500000-0000-4000-8000-000000000001','cbt-activity-a','CBT Activity A','active'),
  ('e2500000-0000-4000-8000-000000000002','cbt-activity-b','CBT Activity B','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2500000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-activity-a@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-activity-b@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions) VALUES
  ('e2500000-0000-4000-8000-000000000101','e2500000-0000-4000-8000-000000000001','cbt-activity-a@test.invalid','CBT Activity Admin A','admin','active','{"master-data":true,"cbt":true}'),
  ('e2500000-0000-4000-8000-000000000102','e2500000-0000-4000-8000-000000000002','cbt-activity-b@test.invalid','CBT Activity Admin B','admin','active','{"master-data":true,"cbt":true}');

INSERT INTO public.tenant_reference_items (
  id,tenant_id,domain,code,name,description,status,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES
  ('e2500000-0000-4000-8000-000000000201','e2500000-0000-4000-8000-000000000001','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji CBT aktivitas tenant A.','active','07','e2500000-0000-4000-8000-000000000101','e2500000-0000-4000-8000-000000000101'),
  ('e2500000-0000-4000-8000-000000000202','e2500000-0000-4000-8000-000000000002','academic_grade_level','GRADE_VII','Kelas VII','Jenjang uji CBT aktivitas tenant B.','active','07','e2500000-0000-4000-8000-000000000102','e2500000-0000-4000-8000-000000000102'),
  ('e2500000-0000-4000-8000-000000000203','e2500000-0000-4000-8000-000000000001','academic_subject','MATH','Matematika','Subjek CBT aktivitas tenant A.','active',NULL,'e2500000-0000-4000-8000-000000000101','e2500000-0000-4000-8000-000000000101'),
  ('e2500000-0000-4000-8000-000000000204','e2500000-0000-4000-8000-000000000002','academic_subject','MATH','Matematika','Subjek CBT aktivitas tenant B.','active',NULL,'e2500000-0000-4000-8000-000000000102','e2500000-0000-4000-8000-000000000102');

INSERT INTO public.master_data_records(tenant_id,category,id,name,status,grade,grade_level_reference_id)
VALUES
  ('e2500000-0000-4000-8000-000000000001','Kelas','CBT-ACTIVITY-CLASS','Kelas Aktivitas CBT','Active','Kelas VII','e2500000-0000-4000-8000-000000000201'),
  ('e2500000-0000-4000-8000-000000000002','Kelas','CBT-ACTIVITY-CLASS','Kelas Aktivitas CBT Tenant B','Active','Kelas VII','e2500000-0000-4000-8000-000000000202');

INSERT INTO public.master_data_records(tenant_id,category,id,name,status,capacity)
VALUES
  ('e2500000-0000-4000-8000-000000000001','Kamar','CBT-ACTIVITY-ROOM','Kamar Aktivitas CBT','Active',5002),
  ('e2500000-0000-4000-8000-000000000002','Kamar','CBT-ACTIVITY-ROOM','Kamar Aktivitas CBT Tenant B','Active',1);

INSERT INTO public.candidates(id,tenant_id,registration_id,name,grade,grade_level_reference_id)
SELECT
  ('e2500000-0000-4000-8001-' || lpad((300000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e2500000-0000-4000-8000-000000000001',
  'CBT-ACT-' || lpad(generated.sequence::TEXT,5,'0'),
  CASE WHEN generated.sequence = 5002 THEN 'Santri 100%_ Aktivitas' ELSE 'Santri Aktivitas ' || generated.sequence END,
  'Kelas VII','e2500000-0000-4000-8000-000000000201'::UUID
FROM generate_series(1,5002) AS generated(sequence);

INSERT INTO public.candidates(id,tenant_id,registration_id,name,grade,grade_level_reference_id)
VALUES
  ('e2500000-0000-4000-8001-000400000001','e2500000-0000-4000-8000-000000000002','CBT-ACT-B-1','Santri Aktivitas Tenant B','Kelas VII','e2500000-0000-4000-8000-000000000202');

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,class_id,room_id,status
)
SELECT
  ('e2500000-0000-4000-8002-' || lpad((200000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e2500000-0000-4000-8000-000000000001',
  ('e2500000-0000-4000-8001-' || lpad((300000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  lpad(generated.sequence::TEXT,10,'0'),
  CASE WHEN generated.sequence = 5002 THEN 'Santri 100%_ Aktivitas' ELSE 'Santri Aktivitas ' || generated.sequence END,
  'L','Kelas VII',
  decode(md5('cipher-activity-' || generated.sequence::TEXT),'hex'),
  decode(md5('fingerprint-activity-' || generated.sequence::TEXT),'hex'),
  'CBT-ACTIVITY-CLASS','CBT-ACTIVITY-ROOM','Active'
FROM generate_series(1,5002) AS generated(sequence);

INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,class_id,room_id,status
) VALUES (
  'e2500000-0000-4000-8002-000400000001','e2500000-0000-4000-8000-000000000002',
  'e2500000-0000-4000-8001-000400000001','9000000001','Santri Aktivitas Tenant B','P','Kelas VII',
  decode(md5('cipher-activity-b'),'hex'),decode(md5('fingerprint-activity-b'),'hex'),
  'CBT-ACTIVITY-CLASS','CBT-ACTIVITY-ROOM','Active'
);

INSERT INTO public.cbt_exams(
  id,tenant_id,title,subject,grade,starts_at,ends_at,duration_minutes,status,client_request_id,created_by,updated_by
) VALUES
  ('e2500000-0000-4000-8004-000000000001','e2500000-0000-4000-8000-000000000001','Ujian Aktivitas CBT A','Matematika','Kelas VII',now()-interval '1 hour',now()+interval '1 hour',30,'published','e2500000-0000-4000-8005-000000000001','e2500000-0000-4000-8000-000000000101','e2500000-0000-4000-8000-000000000101'),
  ('e2500000-0000-4000-8004-000000000002','e2500000-0000-4000-8000-000000000002','Ujian Aktivitas CBT B','Matematika','Kelas VII',now()-interval '1 hour',now()+interval '1 hour',30,'published','e2500000-0000-4000-8005-000000000002','e2500000-0000-4000-8000-000000000102','e2500000-0000-4000-8000-000000000102');

INSERT INTO public.cbt_exam_assignments(id,tenant_id,exam_id,student_id,status,assigned_by,assigned_at)
SELECT
  ('e2500000-0000-4000-8003-' || lpad((100000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  'e2500000-0000-4000-8000-000000000001',
  'e2500000-0000-4000-8004-000000000001',
  ('e2500000-0000-4000-8002-' || lpad((200000000 + generated.sequence)::TEXT,12,'0'))::UUID,
  CASE generated.sequence WHEN 1 THEN 'completed' WHEN 2 THEN 'in_progress' WHEN 3 THEN 'missed' ELSE 'assigned' END,
  'e2500000-0000-4000-8000-000000000101',
  '2027-03-01 00:00:00+00'::TIMESTAMPTZ
FROM generate_series(1,5002) AS generated(sequence);

INSERT INTO public.cbt_exam_assignments(
  id,tenant_id,exam_id,student_id,status,assigned_by,assigned_at
) VALUES (
  'e2500000-0000-4000-8003-000200000001','e2500000-0000-4000-8000-000000000002',
  'e2500000-0000-4000-8004-000000000002','e2500000-0000-4000-8002-000400000001',
  'assigned','e2500000-0000-4000-8000-000000000102','2027-03-01 00:00:00+00'
);

UPDATE public.students
SET status = 'Archived'
WHERE tenant_id = 'e2500000-0000-4000-8000-000000000001'
  AND id = 'e2500000-0000-4000-8002-000200000004';

INSERT INTO public.cbt_attempts(
  tenant_id,assignment_id,exam_id,student_id,question_order,answers,expires_at,submitted_at,
  correct_count,wrong_count,blank_count,score,passed
) VALUES (
  'e2500000-0000-4000-8000-000000000001',
  'e2500000-0000-4000-8003-000100000001',
  'e2500000-0000-4000-8004-000000000001',
  'e2500000-0000-4000-8002-000200000001',
  ARRAY['e2500000-0000-4000-8006-000000000001'::UUID],
  '{}'::JSONB,now()+interval '1 hour',now(),1,0,0,100,true
);

SELECT is((
  SELECT assigned_count::TEXT FROM public.get_cbt_admin_exam_assignment_counts('e2500000-0000-4000-8000-000000000001')
  WHERE exam_id='e2500000-0000-4000-8004-000000000001'
),'5002','exam aggregate counts all assignments beyond the old 5,000 snapshot cap');
SELECT is((
  SELECT completed_count::TEXT FROM public.get_cbt_admin_exam_assignment_counts('e2500000-0000-4000-8000-000000000001')
  WHERE exam_id='e2500000-0000-4000-8004-000000000001'
),'1','exam aggregate counts completed assignments correctly');
SELECT is((
  SELECT count(*)::TEXT FROM public.get_cbt_admin_exam_assignment_counts('e2500000-0000-4000-8000-000000000002')
),'1','exam aggregate is restricted to the requested tenant');
SELECT throws_ok(
  $$SELECT * FROM public.get_cbt_admin_exam_assignment_counts('e2500000-0000-4000-8000-000000000099')$$,
  '42501','Tenant CBT tidak tersedia','unknown tenant is rejected by aggregate');

SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',101,'results',NULL,NULL,NULL
  )
),'101','assignment page is bounded and includes one look-ahead row');
SELECT is((
  SELECT string_agg(page.assignment_id::TEXT, ',' ORDER BY page.assigned_at DESC,page.assignment_id ASC)
  FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',3,'results',NULL,NULL,NULL
  ) AS page
),'e2500000-0000-4000-8003-000100000001,e2500000-0000-4000-8003-000100000002,e2500000-0000-4000-8003-000100000003',
'first page has stable assignment timestamp and ID ordering');
SELECT is((
  SELECT string_agg(page.assignment_id::TEXT, ',' ORDER BY page.assigned_at DESC,page.assignment_id ASC)
  FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',3,'results',
    '2027-03-01 00:00:00+00','e2500000-0000-4000-8003-000100000100',NULL
  ) AS page
),'e2500000-0000-4000-8003-000100000101,e2500000-0000-4000-8003-000100000102,e2500000-0000-4000-8003-000100000103',
'cursor advances within equal assignment timestamps without skipping');
SELECT is((
  SELECT page.student_name || '|' || page.class_name
  FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',101,'results',NULL,NULL,NULL
  ) AS page
  WHERE page.assignment_id='e2500000-0000-4000-8003-000100000004'
),'Santri diarsipkan|','archived student labels and class are masked');

SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',10,'results',NULL,NULL,'Santri Aktivitas 4'
  ) AS page
  WHERE page.assignment_id = 'e2500000-0000-4000-8003-000100000004'
),'search cannot reveal an archived student assignment through its name');

SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',10,'results',NULL,NULL,'Santri diarsipkan'
  )
),'0','archived placeholder is not searchable');

SELECT is((

SELECT is((
  SELECT score::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',2,'results',NULL,NULL,NULL
  ) WHERE assignment_id='e2500000-0000-4000-8003-000100000001'
),'100.00','result page includes the persisted attempt score');
SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',101,'monitor',NULL,NULL,NULL
  )
),'101','monitor page returns a bounded slice of active assignments');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',101,'monitor',NULL,NULL,NULL
  ) WHERE status NOT IN ('assigned','in_progress')
),'monitor view excludes completed and missed assignments');
SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',10,'results',NULL,NULL,'100%_'
  )
),'1','search treats percent and underscore as literal characters');
SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',10,'results',NULL,NULL,'Kelas Aktivitas'
  )
),'10','class name is searchable within the tenant and page bound');
SELECT is((
  SELECT count(*)::TEXT FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000001',2,'results',NULL,NULL,'Ujian Aktivitas'
  )
),'2','exam title search is applied before the page limit');
SELECT is((
  SELECT string_agg(page.assignment_id::TEXT, ',')
  FROM public.list_cbt_admin_assignment_page(
    'e2500000-0000-4000-8000-000000000002',10,'results',NULL,NULL,NULL
  ) AS page
),'e2500000-0000-4000-8003-000200000001','another tenant receives only its own assignment');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000099',2,'results',NULL,NULL,NULL)$$,
  '42501','Tenant CBT tidak tersedia','unknown tenant is rejected by activity page');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000001',1,'results',NULL,NULL,NULL)$$,
  '22023','Parameter halaman penugasan CBT tidak valid','undersized page is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000001',102,'results',NULL,NULL,NULL)$$,
  '22023','Parameter halaman penugasan CBT tidak valid','oversized page is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000001',2,NULL,NULL,NULL,NULL)$$,
  '22023','Parameter halaman penugasan CBT tidak valid','null view is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000001',2,'results','2027-03-01 00:00:00+00',NULL,NULL)$$,
  '22023','Parameter halaman penugasan CBT tidak valid','partial keyset cursor is rejected');
SELECT throws_ok(
  $$SELECT * FROM public.list_cbt_admin_assignment_page('e2500000-0000-4000-8000-000000000001',2,'results',NULL,NULL,'ab')$$,
  '22023','Parameter halaman penugasan CBT tidak valid','short search is rejected');

CREATE TEMP TABLE cbt_activity_page_buffer(assigned_at TIMESTAMPTZ NOT NULL,assignment_id UUID PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE cbt_activity_page_seen(assignment_id UUID PRIMARY KEY) ON COMMIT DROP;
DO $$
DECLARE
  v_cursor_at TIMESTAMPTZ;
  v_cursor_id UUID;
  v_page_rows INTEGER;
  v_inserted INTEGER;
BEGIN
  LOOP
    TRUNCATE cbt_activity_page_buffer;
    INSERT INTO cbt_activity_page_buffer(assigned_at,assignment_id)
    SELECT page.assigned_at,page.assignment_id
    FROM public.list_cbt_admin_assignment_page(
      'e2500000-0000-4000-8000-000000000001',101,'results',v_cursor_at,v_cursor_id,NULL
    ) AS page
    ORDER BY page.assigned_at DESC,page.assignment_id ASC;
    GET DIAGNOSTICS v_page_rows = ROW_COUNT;
    EXIT WHEN v_page_rows = 0;
    INSERT INTO cbt_activity_page_seen(assignment_id)
    SELECT assignment_id FROM cbt_activity_page_buffer
    ORDER BY assigned_at DESC,assignment_id ASC LIMIT 100
    ON CONFLICT (assignment_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    EXIT WHEN v_page_rows <= 100 OR v_inserted = 0;
    SELECT assigned_at,assignment_id INTO v_cursor_at,v_cursor_id
    FROM cbt_activity_page_buffer
    ORDER BY assigned_at DESC,assignment_id ASC
    LIMIT 1 OFFSET 99;
  END LOOP;
END;
$$;
SELECT is((SELECT count(*)::TEXT FROM cbt_activity_page_seen),'5002','keyset traversal reaches every assignment beyond the former snapshot limit');
SELECT is((SELECT count(DISTINCT assignment_id)::TEXT FROM cbt_activity_page_seen),'5002','keyset traversal returns no duplicate assignment IDs');

SELECT ok(NOT has_function_privilege('anon','public.list_cbt_admin_assignment_page(uuid,integer,text,timestamp with time zone,uuid,text)','EXECUTE'),'anon cannot execute activity pages directly');
SELECT ok(NOT has_function_privilege('authenticated','public.list_cbt_admin_assignment_page(uuid,integer,text,timestamp with time zone,uuid,text)','EXECUTE'),'authenticated cannot execute activity pages directly');
SELECT ok(has_function_privilege('service_role','public.list_cbt_admin_assignment_page(uuid,integer,text,timestamp with time zone,uuid,text)','EXECUTE'),'backend can execute activity pages');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_cbt_admin_assignment_page(uuid,integer,text,timestamp with time zone,uuid,text)'::regprocedure),'activity page uses invoker privileges');
SELECT ok(NOT has_function_privilege('anon','public.get_cbt_admin_exam_assignment_counts(uuid)','EXECUTE'),'anon cannot execute exam counts directly');
SELECT ok(NOT has_function_privilege('authenticated','public.get_cbt_admin_exam_assignment_counts(uuid)','EXECUTE'),'authenticated cannot execute exam counts directly');
SELECT ok(has_function_privilege('service_role','public.get_cbt_admin_exam_assignment_counts(uuid)','EXECUTE'),'backend can execute exam counts');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_cbt_admin_exam_assignment_counts(uuid)'::regprocedure),'exam counts use invoker privileges');
SELECT ok(
  to_regclass('public.cbt_assignments_admin_page_idx') IS NOT NULL
  AND to_regclass('public.cbt_exams_title_trgm_idx') IS NOT NULL
  AND to_regclass('public.master_data_records_class_name_trgm_idx') IS NOT NULL,
  'tenant, keyset, and activity search indexes are present'
);

SELECT * FROM finish();
ROLLBACK;
